import { ContractFactory, FetchRequest, JsonRpcProvider, getAddress, getCreateAddress, isHexString, keccak256, toQuantity, type Provider, type TransactionRequest } from 'ethers';
import build from '@manekineko/contract-abi/tincta-rewards-build' with { type: 'json' };
import { TINCTA_COORDINATOR, TINCTA_COORDINATOR_HASH, TINCTA_RANDOMNESS_RESERVE, TINCTA_SPONSORSHIP_RESERVE, verifyTincta, verifyReviewedOracleBudget } from './tincta.ts';

export const DEPLOYMENT_JOURNAL = 'tincta-mainnet-deployment-1';
export const DEPLOYMENT_LOCK = 'tincta-mainnet-creation';
export const GAS_CAP = 16777216n;
export type DeploymentIntent = { schema: 1; chainId: 1; from: string; nonce: number; data: string; createdAt: number; hash?: string };
export type DeploymentReview = DeploymentIntent & { gas: string; maxFeePerGas: string; maxPriorityFeePerGas: string; balance: string; block: number };
export function mainnetReaders(): [JsonRpcProvider, JsonRpcProvider] {
  return ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'].map(url => {
    const request = new FetchRequest(url); request.timeout = 15000;
    return new JsonRpcProvider(request, undefined, { cacheTimeout: -1, batchMaxCount: 10 });
  }) as [JsonRpcProvider, JsonRpcProvider];
}
export async function deploymentData(operator: string): Promise<string> {
  const factory = new ContractFactory(build.abi, build.bytecode);
  return String((await factory.getDeployTransaction(getAddress(operator), TINCTA_RANDOMNESS_RESERVE, TINCTA_SPONSORSHIP_RESERVE)).data);
}
export async function mainnetAnchor(readers: readonly Provider[], checkBudget = false) {
  if (readers.length !== 2 || (await Promise.all(readers.map(p => p.getNetwork()))).some(n => n.chainId !== 1n)) throw Error('Both independent connections must report Ethereum Mainnet.');
  const heads = await Promise.all(readers.map(p => p.getBlock('latest')));
  if (heads.some(b => !b?.hash || Math.abs(Date.now() / 1000 - b.timestamp) > 120)) throw Error('Mainnet data is delayed. Wait for a fresh connection before continuing.');
  const number = Math.min(...heads.map(b => b!.number)) - 2;
  const blocks = await Promise.all(readers.map(p => p.getBlock(number)));
  if (!blocks[0]?.hash || blocks.some(b => b?.hash !== blocks[0]!.hash)) throw Error('The independent Mainnet connections disagree. Try again shortly.');
  const codes = await Promise.all(readers.map(p => p.getCode(TINCTA_COORDINATOR, number)));
  if (codes.some(code => keccak256(code) !== TINCTA_COORDINATOR_HASH)) throw Error('The randomness coordinator differs from the reviewed dependency. Deployment is blocked.');
  if (checkBudget) await Promise.all(readers.map(p => verifyReviewedOracleBudget(p,number)));
  return blocks[0];
}
export async function reviewDeployment(from: string, readers: readonly Provider[]): Promise<DeploymentReview> {
  const address = getAddress(from), block = await mainnetAnchor(readers, true), data = await deploymentData(address);
  const values = await Promise.all(readers.map(async p => {
    const [latest, pending, balance, estimate, fees] = await Promise.all([
      p.getTransactionCount(address, 'latest'), p.getTransactionCount(address, 'pending'), p.getBalance(address),
      p.estimateGas({ from: address, data, value: 0n }), p.getFeeData(),
    ]);
    if (latest !== pending) throw Error('This account has a pending transaction. Wait for it to settle before reviewing deployment.');
    if (!fees.maxFeePerGas || fees.maxPriorityFeePerGas === null) throw Error('A current Mainnet fee quote is unavailable.');
    return { nonce: pending, balance, estimate, fee: fees.maxFeePerGas, priority: fees.maxPriorityFeePerGas };
  }));
  if (values[0].nonce !== values[1].nonce) throw Error('Account nonces disagree. Wait for both connections to update.');
  const max = (key: 'estimate' | 'fee' | 'priority') => values.reduce((n,v) => v[key] > n ? v[key] : n, 0n);
  const gas = (max('estimate') * 115n + 99n) / 100n, fee = max('fee'), priority = max('priority');
  if (gas > GAS_CAP) throw Error('The estimated deployment exceeds the active transaction gas limit.');
  const balance = values.reduce((n,v) => v.balance < n ? v.balance : n, values[0].balance);
  if (balance < gas * fee) throw Error('This wallet needs more ETH for the estimated deployment network fee. No transaction was sent.');
  return { schema: 1, chainId: 1, from: address, nonce: values[0].nonce, data, createdAt: Date.now(), gas: String(gas), maxFeePerGas: String(fee), maxPriorityFeePerGas: String(priority), balance: String(balance), block: block.number };
}
export async function assertFreshReview(review: DeploymentReview, from: string, readers: readonly Provider[]) {
  if (getAddress(from) !== review.from || Date.now() - review.createdAt > 90000 || Date.now() < review.createdAt) throw Error('The deployment review expired or the selected wallet changed. Review it again.');
  if (review.data !== await deploymentData(from)) throw Error('The reviewed creation code changed. Review the current build again.');
  await mainnetAnchor(readers, true);
  for (const p of readers) {
    const [latest, pending, balance] = await Promise.all([p.getTransactionCount(from, 'latest'), p.getTransactionCount(from, 'pending'), p.getBalance(from)]);
    if (latest !== review.nonce || pending !== review.nonce) throw Error('This account’s nonce changed. Review deployment again.');
    if (balance < BigInt(review.gas) * BigInt(review.maxFeePerGas)) throw Error('The account no longer has enough ETH for this fee limit.');
  }
}
export function walletCreationRequest(review: DeploymentReview) {
  return { chainId: '0x1', from: review.from, data: review.data, value: '0x0', nonce: toQuantity(review.nonce), gas: toQuantity(BigInt(review.gas)), maxFeePerGas: toQuantity(BigInt(review.maxFeePerGas)), maxPriorityFeePerGas: toQuantity(BigInt(review.maxPriorityFeePerGas)) };
}
export async function parseDeploymentIntent(raw: string): Promise<DeploymentIntent> {
  const value = JSON.parse(raw) as DeploymentIntent;
  if (value.schema !== 1 || value.chainId !== 1 || !Number.isSafeInteger(value.nonce) || value.nonce < 0 || !Number.isFinite(value.createdAt) || (value.hash && !isHexString(value.hash, 32)) || value.data !== await deploymentData(value.from)) throw Error('The saved deployment record does not match the reviewed contract. Keep it for recovery; do not submit another deployment.');
  return { ...value, from: getAddress(value.from) };
}
export function deploymentAddress(intent: DeploymentIntent) { return getCreateAddress({ from: intent.from, nonce: intent.nonce }); }
export function assertCreationMatches(intent: DeploymentIntent, tx: { from: string; to: string | null; nonce: number; chainId: bigint; data: string; value: bigint }) {
  if (getAddress(tx.from) !== intent.from || tx.to !== null || tx.nonce !== intent.nonce || tx.chainId !== 1n || tx.data.toLowerCase() !== intent.data.toLowerCase() || tx.value !== 0n) throw Error('This transaction does not match the reviewed deployment. The saved request remains blocked for recovery.');
}
export async function recoverDeployment(intent: DeploymentIntent, hash: string, readers: readonly Provider[]) {
  if (!isHexString(hash, 32)) throw Error('Enter the full deployment transaction hash.');
  const anchor = await mainnetAnchor(readers);
  const results = await Promise.all(readers.map(async p => {
    const [tx, receipt] = await Promise.all([p.getTransaction(hash), p.getTransactionReceipt(hash)]);
    if (!tx || !receipt || receipt.blockNumber > anchor.number) return null;
    assertCreationMatches(intent, tx);
    if ((await p.getBlock(receipt.blockNumber))?.hash !== receipt.blockHash) throw Error('The deployment receipt is no longer canonical. Wait before continuing.');
    if (receipt.status === 0) return { status: 'reverted' as const, block: receipt.blockNumber, blockHash: receipt.blockHash };
    const address = deploymentAddress(intent);
    if (receipt.status !== 1 || receipt.contractAddress?.toLowerCase() !== address.toLowerCase()) throw Error('The creation receipt has an unexpected contract address.');
    await verifyTincta(p, address, anchor.number);
    return { status: 'deployed' as const, address, block: receipt.blockNumber, blockHash: receipt.blockHash, codeHash: keccak256(await p.getCode(address, anchor.number)) };
  }));
  if (results.some(r => !r)) return null;
  if (JSON.stringify(results[0]) !== JSON.stringify(results[1])) throw Error('The independent deployment receipts disagree. Wait before continuing.');
  return results[0];
}
