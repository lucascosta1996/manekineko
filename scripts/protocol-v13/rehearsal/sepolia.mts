import { readFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Contract, FetchRequest, JsonRpcProvider, Wallet, Transaction, getAddress, parseEther, type Provider } from 'ethers';
import { makeEngine, approvalFor, type State } from './engine.mts';
import { assertSepolia, hash, canonicalHash, validatePlan, PROFILE, type Plan } from './plan.mts';
import { createVault, readVault, privateRead, durable, exclusive } from './store.mts';
import { ChainPendingError } from '../../season-runner/chain-transactions.ts';
import type { Compiled } from '../verify-deployment.mts';
export async function loadBundle(path: string) {
  const raw = await readFile(join(path, 'manifest.json'), 'utf8'), manifest = JSON.parse(raw);
  const names = ['runner.mjs', 'artifacts.json', 'plan.json'];
  if (manifest.profile !== PROFILE || JSON.stringify(Object.keys(manifest.files).sort()) !== JSON.stringify(names.sort())) throw new Error('Invalid frozen V13 runtime manifest.');
  for (const name of names) if (hash(await readFile(join(path, name))) !== manifest.files[name]) throw new Error('Frozen V13 runtime changed.');
  const plan: Plan = JSON.parse(await readFile(join(path, 'plan.json'), 'utf8')); validatePlan(plan);
  return { plan, artifacts: JSON.parse(await readFile(join(path, 'artifacts.json'), 'utf8')) as Record<string, Compiled>, bundleHash: hash(raw) };
}
export async function verifyFunding(providers: Provider[], plan: Plan, bank: string, hash: string) {
  if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error('Provide the user funding transaction hash.');
  let evidence: State['funding'];
  for (const p of providers) {
    assertSepolia((await p.getNetwork()).chainId);
    const [tx, receipt, finalized] = await Promise.all([p.getTransaction(hash), p.getTransactionReceipt(hash), p.getBlock('finalized')]);
    if (!tx || !receipt || receipt.status !== 1 || !finalized || finalized.number < receipt.blockNumber || (await p.getBlock(receipt.blockNumber))?.hash !== receipt.blockHash ||
      tx.chainId !== 11155111n || tx.from !== plan.recovery || tx.to !== bank || tx.data !== '0x' || tx.value < parseEther(plan.initialFundingEth) || tx.value > parseEther(plan.maximumFundingEth))
      throw new Error('Funding must be a finalized 20–30 Sepolia ETH transfer from the fixed recovery wallet to this new bank.');
    const current = { hash, amount: String(tx.value), block: receipt.blockNumber };
    if (evidence && canonicalHash(evidence) !== canonicalHash(current)) throw new Error('Independent funding evidence differs.');
    evidence = current;
  }
  if (!evidence || providers.length !== 2) throw new Error('Two independent funding verifications are required.');
  return evidence;
}
export async function main() {
  const [command, runtimeArg, stateArg, approval, fundingHash] = process.argv.slice(2);
  if (!['init', 'status', 'preflight', 'run', 'recover'].includes(command) || !runtimeArg || !stateArg)
    throw new Error('Usage: runner.mjs init|status|preflight|run|recover RUNTIME PRIVATE_STATE [APPROVAL_HASH] [FUNDING_TX_HASH]');
  const runtime = resolve(runtimeArg), directory = resolve(stateArg), bundle = await loadBundle(runtime), { plan, artifacts } = bundle;
  if (command === 'status') {
    const s: State = JSON.parse(await privateRead(join(directory, 'state.json')));
    if (s.bundleHash !== bundle.bundleHash || s.planHash !== canonicalHash(plan) || s.approvalHash !== approvalFor(s)) throw new Error('State binding changed.');
    console.log(JSON.stringify({ bank: s.bank, recovery: plan.recovery, approvalHash: s.approvalHash, funded: s.funding?.amount, completed: s.completed ?? false, progress: s.progress, accounting: s.accounting })); return;
  }
  const urls = [process.env.V13_REHEARSAL_RPC_URL, process.env.V13_REHEARSAL_SECONDARY_RPC_URL];
  if (urls.some(url => !url || new URL(url).protocol !== 'https:') || new URL(urls[0]!).hostname === new URL(urls[1]!).hostname) throw new Error('Two independent HTTPS Sepolia RPC hosts are required.');
  const providers = urls.map(url => { const req = new FetchRequest(url!); req.timeout = 20000; return new JsonRpcProvider(req); });
  let release: (() => Promise<void>) | undefined, operatorRelease: (() => Promise<void>) | undefined;
  try {
    for (const p of providers) { assertSepolia((await p.getNetwork()).chainId); const head = await p.getBlock('latest'); if (!head || Math.abs(Date.now() / 1000 - head.timestamp) > 180) throw new Error('Stale Sepolia RPC.'); }
    const provider = providers[0], controller = new Contract(plan.expected.controller, artifacts.ManekinekoSeasonControllerV13.abi, provider);
    if (command === 'init') {
      const recoveryCode = await provider.getCode(plan.recovery);
      if ((recoveryCode !== '0x' && !/^0xef0100[0-9a-f]{40}$/i.test(recoveryCode)) || await provider.getCode(plan.expected.operator) !== '0x') throw new Error('Expected the reviewed user EOA (optionally EIP-7702 delegated) and plain operator EOA.');
      const count = Number(await controller.roundCount()); if (count > 1 || await provider.getBalance(controller.target as string) !== 0n) throw new Error('Initialization accepts only an empty catalog or untouched first ballot with no controller surplus.');
      const head = await provider.getBlock('latest');
      let adoptedRound: string | undefined;
      if (count === 1) {
        adoptedRound = getAddress(await controller.rounds(1)); const r = new Contract(adoptedRound, artifacts.ManekinekoRoundV13.abi, provider);
        if (await r.totalMinted() !== 0n || await r.affiliateCount() !== 0n || Number(await r.saleStartAt()) - head!.timestamp < 1200) throw new Error('First ballot is not untouched or has less than 20 minutes left. Do not fund this plan.');
      }
      await mkdir(directory, { mode: 0o700 });
      const [bank, ...wallets] = await createVault(join(directory, 'vault.json'), process.env.V13_REHEARSAL_VAULT_KEY ?? '');
      const state: State = { version: 1, bundleHash: bundle.bundleHash, planHash: canonicalHash(plan), approvalHash: '', operator: getAddress(plan.expected.operator), bank: bank.address,
        wallets: wallets.map(w => w.address), operatorBaseline: String(await provider.getBalance(plan.expected.operator)), recoveryCode, startBlock: head!.number,
        ...(adoptedRound ? { adoptedRound } : {}), prepaidOperatingWei: adoptedRound ? String(await controller.preparationCost()) : '0', journals: {}, rounds: {} };
      state.approvalHash = approvalFor(state); await durable(join(directory, 'state.json'), state);
      console.log(JSON.stringify({ bank: bank.address, recovery: plan.recovery, initialFundingEth: plan.initialFundingEth, maximumFundingEth: plan.maximumFundingEth, approvalHash: state.approvalHash, adoptedRound })); return;
    }
    const state: State = JSON.parse(await privateRead(join(directory, 'state.json')));
    if (state.bundleHash !== bundle.bundleHash || state.planHash !== canonicalHash(plan) || state.approvalHash !== approvalFor(state)) throw new Error('Runtime or state binding changed.');
    const [bank, ...wallets] = await readVault(join(directory, 'vault.json'), process.env.V13_REHEARSAL_VAULT_KEY ?? '');
    const operator = new Wallet(process.env.V13_REHEARSAL_OPERATOR_KEY ?? '');
    let activeProvider = 0;
    const createEngine = () => makeEngine(providers[activeProvider], plan, artifacts, state, operator, bank, wallets, () => durable(join(directory, 'state.json'), state));
    let engine = createEngine();
    const report = await engine.verifySetup(providers[1]);
    if (command === 'preflight') {
      console.log(JSON.stringify({ verifiedBlock: report.block, prepared: report.preparedCollections, bank: bank.address, balanceWei: String(await provider.getBalance(bank.address)), initialFundingEth: plan.initialFundingEth, recovery: plan.recovery, approvalHash: state.approvalHash })); return;
    }
    if (approval !== state.approvalHash) throw new Error('Execution requires the exact initialized approval hash.');
    // One lock for this run and one shared operator lock across V13 buyer runs.
    release = await exclusive(join(directory, 'runner.lock'));
    const lockPath = process.env.V13_REHEARSAL_OPERATOR_LOCK;
    if (!lockPath) throw new Error('Set an absolute private V13_REHEARSAL_OPERATOR_LOCK shared by every run using this operator.');
    if (!lockPath.startsWith('/')) throw new Error('Operator lock path must be absolute.');
    operatorRelease = await exclusive(lockPath);
    if (canonicalHash(JSON.parse(await privateRead(join(directory, 'state.json')))) !== canonicalHash(state)) throw new Error('State changed while acquiring locks; restart from the saved journal.');
    if (fundingHash && state.funding && fundingHash !== state.funding.hash) throw new Error('Cannot change the original funding transaction.');
    if (!state.funding && command === 'run' && state.adoptedRound) {
      const first = new Contract(state.adoptedRound, artifacts.ManekinekoRoundV13.abi, provider), head = await provider.getBlock('latest');
      if (Number(await first.saleStartAt()) - head!.timestamp < 300) throw new Error('The first ballot closes too soon. Use recovery; do not start a late mint scenario.');
    }
    const funding = await verifyFunding(providers, plan, bank.address, state.funding?.hash ?? fundingHash ?? '');
    if (state.funding) {
      if (canonicalHash(state.funding) !== canonicalHash(funding)) throw new Error('Original funding evidence changed.');
    } else {
      if (await provider.getBalance(bank.address) !== BigInt(funding.amount) || await provider.getBalance(operator.address) !== BigInt(state.operatorBaseline)) throw new Error('Initial bank or protected operator balance changed.');
      for (const w of wallets) if (await provider.getBalance(w.address) !== 0n || await provider.getCode(w.address) !== '0x') throw new Error('A generated buyer already has activity.');
      state.funding = funding; await engine.save();
    }
    let stop = false; const halt = () => { stop = true; }; process.on('SIGINT', halt); process.on('SIGTERM', halt);
    let last = '';
    while (!stop) {
      try {
        const status = await engine.step(command === 'recover'), progress = JSON.stringify({ status, ...state.progress, accounting: state.accounting });
        if (progress !== last) { console.log(progress); last = progress; }
        if (status === 'complete' || status === 'recovered-available-funds') {
          await durable(join(directory, 'completion.json'), { status, bundleHash: bundle.bundleHash, approvalHash: state.approvalHash, funding: state.funding, accounting: state.accounting,
            transactions: Object.values(state.journals).flatMap(j => j.transactions.map(t => ({ action: t.action, hash: t.hash, block: t.blockNumber }))), rounds: state.rounds }); break;
        }
      } catch (error) {
        if (error instanceof ChainPendingError) console.log(JSON.stringify({ status: 'confirming', action: error.action, hash: error.hash }));
        else if (['NETWORK_ERROR', 'SERVER_ERROR', 'TIMEOUT'].includes(String((error as any)?.code))) {
          activeProvider = 1 - activeProvider; engine = createEngine();
          console.log(JSON.stringify({ status: 'rpc-retry', provider: activeProvider, note: 'Saved transactions keep their original nonce and hash.' }));
        } else throw error;
      }
      await new Promise(r => setTimeout(r, 5000));
    }
    process.off('SIGINT', halt); process.off('SIGTERM', halt);
  } finally { if (operatorRelease) await operatorRelease(); if (release) await release(); providers.forEach(p => p.destroy()); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  // No provider error dumps: authenticated RPC URLs and signed journal bytes are private.
  const safe = error instanceof Error && !('code' in error) && !/https?:|0x[0-9a-f]{128}/i.test(error.message) ? error.message : 'Inspect the private journal and RPC connectivity before resuming the same run.';
  console.error(JSON.stringify({ status: 'stopped', message: safe })); process.exitCode = 1;
});
