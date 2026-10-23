/** Independent executor for request recovery and draw progress. No operator authority or X delivery. */
import { Contract, FetchRequest, JsonRpcProvider, Transaction, Wallet, getAddress, isError, keccak256, parseUnits, type Provider } from 'ethers';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { controllerAbi, roundAbi } from '../../packages/protocol/src/chain.ts';
import { verifyDeployment } from './verify-deployment.mts';

export type ExecutorConfig = { chainId: number; controller: string; codeHash: string; maxFeePerGas: bigint; maxGasLimit?: bigint; maxSubsidyPerRound?: bigint; vrfFundingTarget?: bigint };
type Intent = { raw: string; hash: string; controller: string; wallet: string; chainId: number };
type Ledger = { binding: string; spent: Record<string, string>; receipts: Record<string, boolean> };
async function saveLedger(path: string, ledger: Ledger) {
  await writeFile(`${path}.tmp`, JSON.stringify(ledger) + '\n', { mode: 0o600, flush: true });
  await rename(`${path}.tmp`, path);
  const directory = await open(dirname(path), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}
export function executionAffordable(gas: bigint, fee: bigint, spent: bigint, subsidy: bigint) {
  // A competing finalizer can take the reward. Budget the worst case; credit only finalized receipts.
  return gas > 0n && fee > 0n && spent >= 0n && subsidy >= spent && gas * fee <= subsidy - spent;
}
export function retryableExecutorError(error: unknown) {
  return isError(error, 'NETWORK_ERROR') || isError(error, 'SERVER_ERROR') || isError(error, 'TIMEOUT');
}

/** Each invocation submits at most one allowlisted protocol transaction. A journal prevents a new nonce on an uncertain send. */
export async function executeOnce(provider: Provider, config: ExecutorConfig, wallet: Wallet | null, journal: string) {
  const subsidy = config.maxSubsidyPerRound ?? 0n, gasLimit = config.maxGasLimit ?? 2_000_000n, fundingTarget = config.vrfFundingTarget ?? 0n;
  if (fundingTarget < 0n || fundingTarget > subsidy || subsidy < 0n || gasLimit < 21_000n || gasLimit > 5_000_000n || ![1, 11155111, 31337].includes(config.chainId) || config.maxFeePerGas <= 0n) throw new Error('Invalid executor policy.');
  if (Number((await provider.getNetwork()).chainId) !== config.chainId) throw new Error('Executor network mismatch.');
  const block = await provider.getBlock('latest');
  if (!block || Date.now() / 1000 - block.timestamp > 180) return { status: 'stale' };
  if (keccak256(await provider.getCode(config.controller, block.number)).toLowerCase() !== config.codeHash.toLowerCase()) throw new Error('Controller pin mismatch.');
  const c = new Contract(config.controller, controllerAbi, provider), at = { blockTag: block.number };
  if (!(await c.catalogSealed(at))) return { status: 'idle' };
  const count = await c.roundCount(at);
  if (count === 0n) return { status: 'idle' };
  const address = getAddress(await c.rounds(count, at)), r = new Contract(address, roundAbi, provider);
  if (getAddress(await r.voting(at)) !== getAddress(await c.voting(at)) || await r.CONTRACT_VERSION(at) !== 'affiliate-v12') throw new Error('Round binding mismatch.');
  if (!wallet) { const phase = Number(await r.phase(at)); return { status: phase === 4 ? 'ready' : phase === 2 ? 'request-recovery' : 'idle', round: address, reward: String(await r.executionReserve(at)) }; }

  await mkdir(dirname(journal), { recursive: true, mode: 0o700 });
  // Never steal a lock automatically after a crash. Inspect it before restarting the same wallet.
  const lock = await open(`${journal}.lock`, 'wx', 0o600);
  try {
    const binding = `${config.chainId}:${config.controller.toLowerCase()}:${wallet.address.toLowerCase()}`;
    const ledgerFile = `${journal}.ledger.json`;
    let ledger: Ledger;
    try { ledger = JSON.parse(await readFile(ledgerFile, 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; ledger = { binding, spent: {}, receipts: {} }; }
    if (ledger.binding !== binding || !ledger.spent || !ledger.receipts) throw new Error('Executor budget binding mismatch.');
    let intent: Intent | null = null;
    try { intent = JSON.parse(await readFile(journal, 'utf8')); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    if (intent) {
      const tx = Transaction.from(intent.raw), previous = tx.to ? new Contract(tx.to, roundAbi, provider) : null;
      const funding = tx.data === r.interface.encodeFunctionData('fundRandomness');
      if (!previous || intent.chainId !== config.chainId || intent.controller.toLowerCase() !== config.controller.toLowerCase() ||
        intent.wallet.toLowerCase() !== wallet.address.toLowerCase() || tx.hash !== intent.hash || tx.from?.toLowerCase() !== wallet.address.toLowerCase() ||
        tx.chainId !== BigInt(config.chainId) || (funding ? tx.value <= 0n || tx.value > fundingTarget : tx.value !== 0n) || tx.type !== 2 || tx.gasLimit > gasLimit || (tx.maxFeePerGas ?? 0n) > config.maxFeePerGas ||
        getAddress(await c.rounds(await previous.roundId(at), at)) !== getAddress(tx.to!) ||
        ![r.interface.encodeFunctionData('finalizeDrawAndClaim', [wallet.address]), r.interface.encodeFunctionData('requestRandomness'), r.interface.encodeFunctionData('fundRandomness')].includes(tx.data)) throw new Error('Executor journal mismatch.');
      const receipt = await provider.getTransactionReceipt(intent.hash);
      if (receipt) {
        const canonical = await provider.getBlock(receipt.blockNumber), finalized = await provider.getBlock('finalized');
        if (canonical?.hash !== receipt.blockHash || !finalized || finalized.number < receipt.blockNumber)
          return { status: 'confirming', hash: intent.hash };
        if (!ledger.receipts[intent.hash]) {
          const round = getAddress(tx.to!).toLowerCase();
          let reward = 0n;
          for (const log of receipt.logs) {
            if (log.address.toLowerCase() !== round) continue;
            try { const event = r.interface.parseLog(log); if (event?.name === 'ExecutionRewardPaid' && event.args.recipient.toLowerCase() === wallet.address.toLowerCase()) reward += event.args.amount; } catch { /* Other contract events are not reward receipts. */ }
          }
          const total = BigInt(ledger.spent[round] ?? '0') + receipt.gasUsed * receipt.gasPrice + (receipt.status === 1 ? tx.value : 0n) - reward;
          ledger.spent[round] = String(total > 0n ? total : 0n);
          ledger.receipts[intent.hash] = true;
          await saveLedger(ledgerFile, ledger);
        }
        await unlink(journal);
        return { status: receipt.status === 1 ? 'confirmed' : 'reverted', hash: intent.hash };
      }
      if (await provider.getTransaction(intent.hash)) return { status: 'pending', hash: intent.hash };
      if (await provider.getTransactionCount(wallet.address, 'latest') > tx.nonce) throw new Error('Executor nonce consumed; reconcile the journal.');
      const stage = Number(await previous.phase());
      const request = tx.data === r.interface.encodeFunctionData('requestRandomness');
      if (funding ? ![2, 3].includes(stage) : request ? stage !== 2 : stage !== 4) return { status: 'intent-outdated', hash: intent.hash };
      if (!executionAffordable(tx.gasLimit, tx.maxFeePerGas ?? 0n, BigInt(ledger.spent[getAddress(tx.to!).toLowerCase()] ?? '0') + tx.value, subsidy)) return { status: 'budget-limit', hash: intent.hash };
      await provider.broadcastTransaction(intent.raw); // Same signed hash, never a replacement nonce.
      return { status: 'submitted', hash: intent.hash };
    }
    const phase = Number(await r.phase(at));
    let value = 0n;
    if ([2, 3].includes(phase) && fundingTarget > 0n) {
      const coordinator = new Contract(await r.vrfCoordinator(at), ['function getSubscription(uint256) view returns (uint96 balance,uint96 nativeBalance,uint64 reqCount,address owner,address[] consumers)'], provider);
      const subscription = await coordinator.getSubscription(await r.subscriptionId(at), at);
      if (subscription.owner.toLowerCase() !== address.toLowerCase() || subscription.consumers.length !== 1 || subscription.consumers[0].toLowerCase() !== address.toLowerCase()) throw new Error('Executor subscription binding mismatch.');
      if (subscription.nativeBalance < fundingTarget) value = fundingTarget - subscription.nativeBalance;
    }
    const funding = value > 0n, request = phase === 2 && !funding;
    if (phase !== 4 && !request && !funding) return { status: 'idle' };
    const canFinalize = phase === 4 && await r.canFinalizeDraw(at);
    if (!canFinalize && subsidy === 0n) return { status: request ? 'request-recovery-needs-budget' : 'progress-needed', round: address };
    const pending = await provider.getTransactionCount(wallet.address, 'pending');
    if (pending !== await provider.getTransactionCount(wallet.address, 'latest')) throw new Error('Executor wallet already has a pending transaction.');
    const fees = await provider.getFeeData(), maxFee = fees.maxFeePerGas;
    if (!maxFee || maxFee > config.maxFeePerGas) return { status: 'fee-limit' };
    const data = funding ? r.interface.encodeFunctionData('fundRandomness') : request ? r.interface.encodeFunctionData('requestRandomness') : r.interface.encodeFunctionData('finalizeDrawAndClaim', [wallet.address]);
    let estimate: bigint;
    try { estimate = await provider.estimateGas({ from: wallet.address, to: address, data, value }); }
    catch (error) {
      // Another permissionless finalizer can win between the snapshot and simulation.
      // No intent exists yet; keep watching the next collection without signing a doomed transaction.
      if (isError(error, 'CALL_EXCEPTION')) {
        if (Number(await r.phase()) !== phase) return { status: request ? 'request-already-recovered' : 'already-finalized', round: address };
        if (request || funding) return { status: 'vrf-recovery-unavailable', round: address };
      }
      throw error;
    }
    const gas = estimate * 120n / 100n;
    if (gas > gasLimit) return { status: 'gas-limit', round: address };
    if (!executionAffordable(gas, maxFee, BigInt(ledger.spent[address.toLowerCase()] ?? '0') + value, subsidy))
      return { status: 'budget-limit', round: address };
    if (await provider.getBalance(wallet.address) < gas * maxFee + value) return { status: 'executor-needs-gas' };
    const raw = await wallet.signTransaction({ chainId: config.chainId, type: 2, nonce: pending, to: address, data, value,
      gasLimit: gas, maxFeePerGas: maxFee, maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 0n });
    intent = { raw, hash: keccak256(raw), controller: config.controller, wallet: wallet.address, chainId: config.chainId };
    // Save before broadcast. Calldata/value are limited to funding, request recovery or finalization(self).
    await writeFile(journal, JSON.stringify(intent) + '\n', { flag: 'wx', mode: 0o600, flush: true });
    const directory = await open(dirname(journal), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
    await provider.broadcastTransaction(raw);
    return { status: 'submitted', hash: intent.hash };
  } finally { await lock.close(); await unlink(`${journal}.lock`); }
}

async function main() {
  const [configPath, journal, mode = '--inspect'] = process.argv.slice(2);
  if (!configPath || !journal || !['--inspect', '--once', '--watch'].includes(mode)) throw new Error('Usage: executor.mts config.json private-journal.json [--inspect|--once|--watch]');
  const input = JSON.parse(await readFile(configPath, 'utf8'));
  if (![1, 11155111].includes(input.chainId)) throw new Error('Choose Ethereum Mainnet or Sepolia.');
  const urls: string[] = input.rpcUrls ?? [input.rpcUrl];
  if (!urls.length || urls.length > 3 || urls.some(url => typeof url !== 'string' || new URL(url).protocol !== 'https:')) throw new Error('Configure one to three HTTPS RPC endpoints.');
  const providers = urls.map(url => { const request = new FetchRequest(url); request.timeout = 15_000; return new JsonRpcProvider(request); });
  let providerIndex = 0;
  const config = { chainId: input.chainId, controller: getAddress(input.controller), codeHash: input.codeHash, maxFeePerGas: parseUnits(input.maxFeeGwei, 'gwei'), maxGasLimit: BigInt(input.maxGasLimit ?? 2_000_000), maxSubsidyPerRound: parseUnits(input.maxSubsidyEthPerRound ?? '0', 'ether'), vrfFundingTarget: parseUnits(input.vrfFundingTargetEth ?? '0', 'ether') };
  // Use a dedicated gas wallet with an explicitly bounded subsidy; it needs no operator permissions.
  const wallet = mode === '--inspect' ? null : new Wallet(process.env.TINCTA_EXECUTOR_PRIVATE_KEY ?? '');
  let failures = 0;
  try {
    if (wallet) {
      if (!input.expectationFile || !input.wallet || getAddress(input.wallet) !== wallet.address || config.maxSubsidyPerRound <= 0n || config.vrfFundingTarget <= 0n || config.vrfFundingTarget > config.maxSubsidyPerRound)
        throw new Error('Signing requires a reviewed deployment manifest, pinned gas wallet and explicit recovery subsidy.');
      if (urls.length < 2 || new URL(urls[0]).hostname === new URL(urls[1]).hostname) throw new Error('The first two signing RPC endpoints must have independent hosts.');
      const expected = JSON.parse(await readFile(input.expectationFile, 'utf8'));
      if (expected.chainId !== config.chainId || getAddress(expected.controller) !== config.controller || expected.controllerCodeHash.toLowerCase() !== config.codeHash.toLowerCase() || getAddress(expected.operator) === wallet.address)
        throw new Error('Executor manifest mismatch or operator key supplied.');
      const heads = await Promise.all(providers.slice(0, 2).map(provider => provider.getBlock('finalized')));
      if (heads.some(head => !head)) throw new Error('Finalized state unavailable.');
      const block = Math.min(...heads.map(head => head!.number));
      const verified = await Promise.all(providers.slice(0, 2).map(provider => verifyDeployment(provider, expected, block)));
      if (JSON.stringify(verified[0]) !== JSON.stringify(verified[1])) throw new Error('Independent RPC deployment checks disagree.');
      if (await providers[0].getBalance(wallet.address) < config.maxGasLimit * config.maxFeePerGas + config.vrfFundingTarget)
        throw new Error('Executor needs gas for one maximum-cost transaction plus its VRF recovery target.');
    }
    do {
      try {
        const result = await executeOnce(providers[providerIndex], config, wallet, journal);
        console.log(JSON.stringify(result));
        if (result.status === 'stale') providerIndex = (providerIndex + 1) % providers.length;
        failures = 0;
      } catch (error) {
        // Network retries re-enter the same journal recovery path. Pin/nonce/journal errors still stop.
        if (mode !== '--watch' || !retryableExecutorError(error)) throw error;
        failures++;
        providerIndex = (providerIndex + 1) % providers.length;
        console.log(JSON.stringify({ status: 'rpc-unavailable', retrySeconds: Math.min(60, 15 * failures) }));
      }
      if (mode !== '--watch') break;
      await new Promise(resolve => setTimeout(resolve, Math.min(60, 15 * Math.max(1, failures)) * 1000));
    } while (true);
  } finally { providers.forEach(provider => provider.destroy()); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => { console.error('Executor stopped. Check deployment pins, gas funding and the private journal before restarting. No replacement transaction was created.'); process.exitCode = 1; });
