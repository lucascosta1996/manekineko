/** Standalone Sepolia runner. No Next.js server, database, hot reload, browser or X dependency. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FetchRequest, JsonRpcProvider, Wallet, getAddress, parseEther, isError } from 'ethers';
import { ChainPendingError } from '../../season-runner/chain-transactions.ts';
import { makeEngine, approvalFor, type State } from './engine.mts';
import { privateRead, durable, exclusive, createVault, readVault } from './store.mts';
import { assertSepolia, canonicalHash, hash, PROFILE, type Plan } from './plan.mts';
import type { Compiled } from '../verify-deployment.mts';

export async function loadBundle(directory: string) {
  const raw = await readFile(resolve(directory, 'manifest.json'), 'utf8'), manifest = JSON.parse(raw);
  if (manifest.profile !== PROFILE || Object.keys(manifest.files).sort().join(',') !== 'artifacts.json,compiler-input.json,plan.json,runner.mjs') throw new Error('Unexpected runtime manifest.');
  for (const [file, expected] of Object.entries(manifest.files)) if (hash(await readFile(resolve(directory, file))) !== expected) throw new Error('Frozen runtime changed. Use the original bundle to resume.');
  const plan: Plan = JSON.parse(await readFile(resolve(directory, 'plan.json'), 'utf8'));
  assertSepolia(plan.chainId);
  return { bundleHash: hash(raw), plan, artifacts: JSON.parse(await readFile(resolve(directory, 'artifacts.json'), 'utf8')) as Record<string, Compiled> };
}
export async function initialize(directory: string, bundle: Awaited<ReturnType<typeof loadBundle>>, address: string, secret: string) {
  const operator = getAddress(address);
  await mkdir(directory, { recursive: false, mode: 0o700 });
  const wallets = await createVault(resolve(directory, 'wallets.enc'), secret);
  if (wallets.some(w => w.address === operator)) throw new Error('Operator must be distinct from simulated buyers.');
  const state: State = { version: 1, profile: PROFILE, bundleHash: bundle.bundleHash, planHash: canonicalHash(bundle.plan), approvalHash: '', operator,
    wallets: wallets.map(w => w.address), deployments: {}, journals: {}, rounds: {} };
  state.approvalHash = approvalFor(state); await durable(resolve(directory, 'state.json'), state);
  return state;
}
function publicStatus(state: State) {
  return { profile: state.profile, approvalHash: state.approvalHash, operator: state.operator, deployments: state.deployments,
    completedCollections: Object.values(state.rounds).filter(r => r.complete).length, completed: !!state.completed,
    observedAt: state.updatedAt ?? null, progress: state.progress ?? null };
}
async function main() {
  const [command, rawState, argument] = process.argv.slice(2);
  if (!rawState || !['init', 'status', 'preflight', 'run'].includes(command)) throw new Error('Usage: runner.mjs init|status|preflight|run STATE_DIRECTORY [OPERATOR_ADDRESS|APPROVAL_HASH]');
  const directory = resolve(rawState), bundle = await loadBundle(dirname(fileURLToPath(import.meta.url)));
  if (command === 'init') {
    if (!argument) throw new Error('init requires the dedicated Sepolia operator address.');
    const state = await initialize(directory, bundle, argument, process.env.V12_REHEARSAL_VAULT_KEY ?? '');
    console.log(JSON.stringify({ ...publicStatus(state), minimumInitialTestEth: bundle.plan.minimumInitialEth, maximumGrossTestEth: bundle.plan.maxGrossSpendEth, note: 'Offline initialization only. Back up the encrypted vault, its key and this state directory.' })); return;
  }
  const state: State = JSON.parse(await privateRead(resolve(directory, 'state.json')));
  if (state.version !== 1 || state.bundleHash !== bundle.bundleHash || state.planHash !== canonicalHash(bundle.plan) || state.approvalHash !== approvalFor(state)) throw new Error('State does not belong to this exact frozen runtime.');
  if (command === 'status') { console.log(JSON.stringify(publicStatus(state), null, 2)); return; }
  const urls = [process.env.V12_REHEARSAL_RPC_URL, process.env.V12_REHEARSAL_SECONDARY_RPC_URL];
  if (!urls.every(url => url && new URL(url).protocol === 'https:') || new URL(urls[0]!).hostname === new URL(urls[1]!).hostname) throw new Error('Configure two independent HTTPS Sepolia RPC providers.');
  const providers = urls.map(url => { const request = new FetchRequest(url!); request.timeout = 15000; return new JsonRpcProvider(request); });
  let release: (() => Promise<void>) | undefined;
  try {
    for (const p of providers) assertSepolia((await p.getNetwork()).chainId);
    const heads = await Promise.all(providers.map(p => p.getBlock('latest')));
    if (heads.some(h => !h || Math.abs(Date.now() / 1000 - h.timestamp) > 180)) throw new Error('Fresh RPC heads are required.');
    const balance = await providers[0].getBalance(state.operator), required = parseEther(bundle.plan.minimumInitialEth);
    if (command === 'preflight') {
      console.log(JSON.stringify({ ...publicStatus(state), balanceWei: String(balance), minimumInitialWei: String(required), initiallyFunded: balance >= required, independentRpcNetworks: true,
        note: 'Read-only connectivity/funding check. Complete deployment verification occurs before first preparation.' }, null, 2)); return;
    }
    if (argument !== state.approvalHash) throw new Error('run requires the exact approval hash printed by init/preflight.');
    const operator = new Wallet(process.env.V12_REHEARSAL_OPERATOR_KEY ?? '');
    if (operator.address !== state.operator) throw new Error('The supplied key is not this rehearsal operator.');
    if (!Object.values(state.journals).some(j => j.transactions.length) && balance < required) throw new Error('Fund the dedicated operator with the planned initial TEST ETH before starting.');
    release = await exclusive(resolve(directory, 'run.lock'));
    const wallets = await readVault(resolve(directory, 'wallets.enc'), process.env.V12_REHEARSAL_VAULT_KEY ?? '');
    let index = 0, stop = false, engine = makeEngine(providers[0], bundle.plan, bundle.artifacts, state, operator, wallets, () => durable(resolve(directory, 'state.json'), state));
    state.setupVerified = false; // Reverify the frozen graph on each process restart.
    process.once('SIGINT', () => { stop = true; }); process.once('SIGTERM', () => { stop = true; });
    while (!stop) {
      try {
        const status = await engine.step();
        if (status === 'needs-deployment-verification') {
          if (await engine.verifySetup(providers[1 - index])) {
            const expected = await engine.expectation();
            await durable(resolve(directory, 'deployment.json'), { ...expected, rehearsalProfile: PROFILE });
            // Only addresses/hashes are emitted; authenticated RPC URLs are never copied into browser configuration.
            await writeFile(resolve(directory, 'public-pins.txt'), `# SEPOLIA ACCELERATED REHEARSAL ONLY\nNEXT_PUBLIC_V12_SEPOLIA_CONTROLLER=${expected.controller}\nNEXT_PUBLIC_V12_SEPOLIA_CONTROLLER_CODE_HASH=${expected.controllerCodeHash}\n# Web single-network configuration\nNEXT_PUBLIC_V12_CHAIN_ID=11155111\nNEXT_PUBLIC_V12_CONTROLLER=${expected.controller}\nNEXT_PUBLIC_V12_CONTROLLER_CODE_HASH=${expected.controllerCodeHash}\n# Set NEXT_PUBLIC_V12_SEPOLIA_RPC_URL (Launch) and NEXT_PUBLIC_V12_RPC_URL (Web) to a separate PUBLIC HTTPS endpoint.\n`, { mode: 0o600 });
          }
        }
        console.log(JSON.stringify({ status, ...publicStatus(state) }));
        if (status === 'complete') {
          const finalized = await providers[index].getBlock('finalized'), last = Math.max(...Object.values(state.journals).flatMap(j => j.transactions.map(t => t.blockNumber ?? 0)));
          if (finalized && finalized.number >= last) {
            await engine.auditJournals();
            await durable(resolve(directory, 'completion.json'), { status: 'passed', profile: PROFILE, chainId: 11155111, approvalHash: state.approvalHash,
              block: finalized.number, blockHash: finalized.hash, outcomes: state.rounds, grossSpentWei: String(engine.spent()),
              boundary: 'Accelerated Sepolia rehearsal. Not production-timing evidence or Mainnet approval.' });
            break;
          }
        }
      } catch (error) {
        if (error instanceof ChainPendingError) console.log(JSON.stringify({ status: 'confirming', action: error.action, hash: error.hash }));
        else if (isError(error, 'NETWORK_ERROR') || isError(error, 'SERVER_ERROR') || isError(error, 'TIMEOUT')) {
          index = 1 - index;
          engine = makeEngine(providers[index], bundle.plan, bundle.artifacts, state, operator, wallets, () => durable(resolve(directory, 'state.json'), state));
          console.log(JSON.stringify({ status: 'rpc-failover' }));
        } else throw error;
      }
      if (!stop) await new Promise(resolve => setTimeout(resolve, 5000));
    }
  } finally { if (release) await release(); providers.forEach(p => p.destroy()); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  // Provider errors may contain credential-bearing URLs or raw transactions. Do not print them.
  const message = error instanceof Error && !('code' in error) ? error.message : 'RPC/transaction failure; inspect the saved intent and chain receipt before resuming.';
  console.error(JSON.stringify({ status: 'stopped', reason: message })); process.exitCode = 1;
});
