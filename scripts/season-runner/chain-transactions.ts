import { Transaction, getAddress } from "ethers";
import { createHash } from "node:crypto";
import type { Provider, Signer, TransactionReceipt, TransactionRequest } from "ethers";
import { cappedFees, checkSignedIntent, DeploymentError } from "../../apps/contracts/scripts/deployment-journal.ts";

export class ChainPendingError extends DeploymentError {
  constructor(public readonly action: string, public readonly hash: string) { super(`Transaction ${action} is awaiting confirmation (${hash}); resume the same run.`); }
}
export type ChainTransaction = {
  action: string; state: "prepared" | "submitted" | "confirmed";
  rawTransaction: string; hash: string; nonce: number;
  blockNumber?: number; blockHash?: string; gasUsed?: string; gasPrice?: string;
  /** A prepared transaction may never first-broadcast or rebroadcast after this UTC chain timestamp. */
  broadcastDeadline?: number;
};
export type ChainJournal = {
  version: 1; chainId: number; from: string; maxFeePerGasWei: string; maxTotalSpendWei: string;
  verifications?: Record<string, import("./explorer-verification.ts").VerificationJob>;
  transactions: ChainTransaction[];
  collections: Record<string, { inputHash: string; configTimestamp: string; config: Record<string, string>; factory: string; roundId: string }>;
};
type ConfirmedPrefix = { count: number; fingerprint: string; anchor: { number: number; hash: string } };
// Process-local proof only. A saved journal never populates this cache without
// live receipt verification; provider and complete signed-prefix identity bind it.
const confirmedPrefixes = new WeakMap<Provider, Map<string, ConfirmedPrefix>>();
const prefixFingerprint = (entries: ChainTransaction[]) => createHash("sha256").update(JSON.stringify(entries.map(entry => [
  entry.action, entry.state, entry.rawTransaction, entry.hash, entry.nonce,
  entry.blockNumber, entry.blockHash, entry.gasUsed, entry.gasPrice, entry.broadcastDeadline,
]))).digest("hex");

export function transactionSpend(entry: ChainTransaction): bigint {
  const signed = Transaction.from(entry.rawTransaction);
  return signed.value + (entry.state === "confirmed" && entry.gasUsed !== undefined && entry.gasPrice !== undefined
    ? BigInt(entry.gasUsed) * BigInt(entry.gasPrice) : signed.gasLimit * signed.maxFeePerGas!);
}

/** Caller must hold an exclusive run + signer lock across this adapter's lifetime. The store must durably save, not queue a write. */
export function createTransactionPipeline(options: {
  provider: Provider; signer?: Signer; execute: boolean; journal: ChainJournal; save: () => Promise<void>; confirmations: number;
}) {
  const { provider, signer, execute, journal, save, confirmations } = options;
  let persistenceFailed = false;
  async function persist() {
    try { await save(); } catch { persistenceFailed = true; throw new DeploymentError("Durable transaction journal save failed; reload the stored run before any retry."); }
  }
  const ceiling = BigInt(journal.maxFeePerGasWei), budget = BigInt(journal.maxTotalSpendWei);
  if (![1, 11155111].includes(journal.chainId) || journal.version !== 1 || ceiling <= 0n || budget <= 0n || !Number.isInteger(confirmations) || confirmations < 2)
    throw new DeploymentError("Invalid pinned chain, spending policy or confirmation depth.");
  const policyIdentity = () => JSON.stringify([journal.version, journal.chainId, journal.from, journal.maxFeePerGasWei, journal.maxTotalSpendWei]);
  const pinnedPolicy = policyIdentity();
  let validatedFingerprint: string | undefined;
  function validateEntry(entry: ChainTransaction, tx: Transaction) {
    if (policyIdentity() !== pinnedPolicy || tx.hash !== entry.hash || tx.from !== getAddress(journal.from) || tx.chainId !== BigInt(journal.chainId)
      || tx.nonce !== entry.nonce || tx.type !== 2 || tx.maxFeePerGas === null || tx.maxFeePerGas > ceiling
      || tx.maxPriorityFeePerGas === null || tx.maxPriorityFeePerGas > tx.maxFeePerGas || tx.gasLimit <= 0n
      || (tx.accessList?.length ?? 0) > 0 || (tx.authorizationList?.length ?? 0) > 0
      || !["prepared", "submitted", "confirmed"].includes(entry.state)
      || (entry.broadcastDeadline !== undefined && (!Number.isSafeInteger(entry.broadcastDeadline) || entry.broadcastDeadline <= 0)))
      throw new DeploymentError("The run journal has an invalid transaction, signer, policy or action order.");
  }
  function validateJournal() {
    if (policyIdentity() !== pinnedPolicy) throw new DeploymentError("The run journal spending policy changed after validation.");
    const fingerprint = prefixFingerprint(journal.transactions);
    if (fingerprint === validatedFingerprint) return;
    const actions = new Set<string>();
    journal.transactions.forEach((entry, i) => {
      validateEntry(entry, Transaction.from(entry.rawTransaction));
      if (actions.has(entry.action) || (i > 0 && (journal.transactions[i - 1].state !== "confirmed" || entry.nonce !== journal.transactions[i - 1].nonce + 1)))
        throw new DeploymentError("The run journal has an invalid transaction, signer, policy or action order.");
      actions.add(entry.action);
    });
    if (journal.transactions.reduce((sum, entry) => sum + transactionSpend(entry), 0n) > budget)
      throw new DeploymentError("Saved transactions exceed this run's spending cap.");
    validatedFingerprint = fingerprint;
  }
  validateJournal();

  async function canonicalReceipt(entry: ChainTransaction): Promise<TransactionReceipt | null> {
    if (persistenceFailed) throw new DeploymentError("Reload the durable transaction journal after its failed save.");
    const signed = Transaction.from(entry.rawTransaction);
    validateEntry(entry, signed);
    const originalFingerprint = prefixFingerprint([entry]);
    function unchanged(expected = originalFingerprint) {
      if (policyIdentity() !== pinnedPolicy || prefixFingerprint([entry]) !== expected)
        throw new DeploymentError("Signed journal prefix changed during receipt verification.");
    }
    const receipt = await provider.getTransactionReceipt(entry.hash);
    unchanged();
    if (!receipt) {
      if (entry.state === "confirmed") throw new DeploymentError("A previously confirmed transaction lost its receipt; reconcile this run.");
      return null;
    }
    if (receipt.status !== 1 || receipt.hash !== entry.hash || receipt.from !== getAddress(journal.from) || receipt.to !== signed.to)
      throw new DeploymentError("Saved transaction reverted or receipt provenance differs; manual reconciliation is required.");
    const [block, head] = await Promise.all([provider.getBlock(receipt.blockNumber), provider.getBlock("latest")]);
    unchanged();
    if (block?.hash !== receipt.blockHash || (entry.blockHash !== undefined && (entry.blockHash !== receipt.blockHash || entry.blockNumber !== receipt.blockNumber)))
      throw new DeploymentError("Saved transaction receipt changed canonical block; reconcile this run.");
    if ((entry.gasUsed !== undefined && entry.gasUsed !== String(receipt.gasUsed)) || (entry.gasPrice !== undefined && entry.gasPrice !== String(receipt.gasPrice)))
      throw new DeploymentError("Saved transaction receipt gas accounting differs from canonical evidence.");
    if (!head || head.number - receipt.blockNumber + 1 < confirmations) return null;
    if (entry.state !== "confirmed") {
      entry.state = "confirmed"; entry.blockNumber = receipt.blockNumber; entry.blockHash = receipt.blockHash;
      entry.gasUsed = String(receipt.gasUsed); entry.gasPrice = String(receipt.gasPrice);
      const confirmedFingerprint = prefixFingerprint([entry]);
      await persist();
      unchanged(confirmedFingerprint);
    }
    return receipt;
  }

  /** Completion needs durable canonical receipt evidence even when a resumed
   * operation's desired contract storage already exists and skips send(). */
  async function confirmAll(): Promise<void> {
    if (persistenceFailed) throw new DeploymentError("Reload the durable transaction journal after its failed save.");
    validateJournal();
    if (journal.transactions.length === 0) return;
    const [network, head] = await Promise.all([provider.getNetwork(), provider.getBlock("latest")]);
    if (network.chainId !== BigInt(journal.chainId)) throw new DeploymentError("Provider chain differs from the confirmed journal.");
    if (!head || head.number < confirmations - 1) throw new DeploymentError("Confirmed journal anchor is unavailable.");
    const anchor = await provider.getBlock(head.number - confirmations + 1);
    if (!anchor?.hash || anchor.number !== head.number - confirmations + 1) throw new DeploymentError("Confirmed journal anchor is unavailable.");
    let cache = confirmedPrefixes.get(provider);
    if (!cache) { cache = new Map(); confirmedPrefixes.set(provider, cache); }
    const key = JSON.stringify([journal.chainId, getAddress(journal.from), confirmations, journal.maxFeePerGasWei, journal.maxTotalSpendWei, journal.transactions[0].hash]);
    const previous = cache.get(key);
    let reused = 0;
    if (previous && previous.count <= journal.transactions.length && previous.anchor.number <= anchor.number
      && prefixFingerprint(journal.transactions.slice(0, previous.count)) === previous.fingerprint) {
      const oldAnchor = previous.anchor.number === anchor.number ? anchor : await provider.getBlock(previous.anchor.number);
      if (oldAnchor?.hash === previous.anchor.hash) reused = previous.count;
    }
    // Any failed or interrupted pass leaves no reusable approval for this key.
    cache.delete(key);
    // Preserve the proof's original identity across the awaited ancestor read;
    // never capture potentially changed journal fields as if they were proved.
    const length = journal.transactions.length, reusedFingerprint = reused > 0 ? previous!.fingerprint : prefixFingerprint([]);
    let eligible = reused;
    const verifiedFingerprints: string[] = [];
    for (let offset = reused; offset < journal.transactions.length; offset += 8) {
      const entries = journal.transactions.slice(offset, offset + 8), receipts = await Promise.all(entries.map(canonicalReceipt));
      for (let index = 0; index < entries.length; index++) {
        if (!receipts[index]) throw new ChainPendingError(entries[index].action, entries[index].hash);
        // A receipt that became confirmed during this pass is valid live, but
        // cannot join a prefix anchored before its block existed.
        if (eligible === offset + index && receipts[index]!.blockNumber <= anchor.number) eligible++;
        verifiedFingerprints.push(prefixFingerprint([entries[index]]));
      }
    }
    const currentAnchor = await provider.getBlock(anchor.number);
    if (currentAnchor?.hash !== anchor.hash) throw new DeploymentError("Confirmed journal anchor reorganized during verification.");
    if (persistenceFailed) throw new DeploymentError("Reload the durable transaction journal after its failed save.");
    if (journal.transactions.length !== length || policyIdentity() !== pinnedPolicy || prefixFingerprint(journal.transactions.slice(0, reused)) !== reusedFingerprint
      || verifiedFingerprints.some((fingerprint, index) => prefixFingerprint([journal.transactions[reused + index]]) !== fingerprint))
      throw new DeploymentError("Signed journal prefix changed during receipt verification.");
    if (eligible > 0) cache.set(key, { count: eligible, fingerprint: prefixFingerprint(journal.transactions.slice(0, eligible)), anchor: { number: anchor.number, hash: anchor.hash } });
  }

  async function send(action: string, request: TransactionRequest, policy: { broadcastDeadline?: number } = {}): Promise<TransactionReceipt> {
    if (persistenceFailed) throw new DeploymentError("Reload the durable transaction journal after its failed save.");
    validateJournal();
    if (!execute || !signer) throw new DeploymentError("Transaction execution requires explicit execute and a local signer.");
    if ((await provider.getNetwork()).chainId !== BigInt(journal.chainId) || getAddress(await signer.getAddress()) !== getAddress(journal.from))
      throw new DeploymentError("Provider chain or local signer differs from this run.");
    let entry = journal.transactions.find(item => item.action === action);
    if (policy.broadcastDeadline !== undefined && (!Number.isSafeInteger(policy.broadcastDeadline) || policy.broadcastDeadline <= 0)) throw new DeploymentError("Invalid transaction broadcast deadline.");
    if (entry && policy.broadcastDeadline !== undefined && entry.broadcastDeadline !== policy.broadcastDeadline) throw new DeploymentError("Saved transaction broadcast deadline differs from the original action.");
    if (!entry) {
      // Reconcile every dependency against fresh canonical ancestry before a new write.
      await confirmAll();
      const [nonce, pending, head, fees] = await Promise.all([
        provider.getTransactionCount(journal.from, "latest"), provider.getTransactionCount(journal.from, "pending"),
        provider.getBlock("latest"), provider.getFeeData(),
      ]);
      const prior = journal.transactions.at(-1);
      if (nonce !== pending || (prior && nonce !== prior.nonce + 1)) throw new DeploymentError("Signer nonce changed outside this run; reconcile before continuing.");
      if (head?.baseFeePerGas === null || head?.baseFeePerGas === undefined || fees.maxPriorityFeePerGas === null) throw new DeploymentError("EIP-1559 fee data unavailable.");
      if (policy.broadcastDeadline !== undefined && head.timestamp > policy.broadcastDeadline) throw new DeploymentError("Activation broadcast window expired; pause and review the immutable schedule.");
      const fee = cappedFees(head.baseFeePerGas, fees.maxPriorityFeePerGas, ceiling);
      const intent = { to: request.to, data: request.data ?? "0x", value: BigInt(String(request.value ?? 0)) };
      const gasLimit = ((await provider.estimateGas({ ...intent, from: journal.from })) * 120n + 99n) / 100n;
      const maximumCost = intent.value + gasLimit * fee.maxFeePerGas;
      if (journal.transactions.reduce((sum, item) => sum + transactionSpend(item), 0n) + maximumCost > budget)
        throw new DeploymentError("This transaction would exceed the run's total ETH spending cap.");
      if (await provider.getBalance(journal.from) < maximumCost) throw new DeploymentError("Signer balance cannot cover this transaction and its maximum gas.");
      const rawTransaction = await signer.signTransaction({ ...intent, type: 2, chainId: journal.chainId, nonce, gasLimit, ...fee });
      const tx = Transaction.from(rawTransaction);
      if (!tx.hash || tx.from !== getAddress(journal.from)) throw new DeploymentError("Local signer produced an unexpected transaction.");
      entry = { action, state: "prepared", rawTransaction, hash: tx.hash, nonce, ...(policy.broadcastDeadline !== undefined ? { broadcastDeadline: policy.broadcastDeadline } : {}) };
      journal.transactions.push(entry);
      await persist(); // Must commit signed bytes, nonce and deterministic hash BEFORE any broadcast.
    }
    const signed = checkSignedIntent(entry, request);
    const confirmed = await canonicalReceipt(entry);
    if (confirmed) return confirmed;
    const pending = await provider.getTransaction(entry.hash);
    if (!pending) {
      const [nonce, next, head] = await Promise.all([provider.getTransactionCount(journal.from, "latest"), provider.getTransactionCount(journal.from, "pending"), provider.getBlock("latest")]);
      if (nonce !== signed.nonce || next !== signed.nonce) throw new DeploymentError("Saved nonce was consumed or pending under another hash; no replacement is permitted.");
      if (head?.baseFeePerGas === null || head?.baseFeePerGas === undefined || head.baseFeePerGas > signed.maxFeePerGas!) throw new DeploymentError("Current base fee exceeds saved fee cap; wait and resume.");
      if (entry.broadcastDeadline !== undefined && head.timestamp > entry.broadcastDeadline) throw new DeploymentError("Saved activation broadcast window expired; no late broadcast is permitted.");
      const sent = await provider.broadcastTransaction(entry.rawTransaction);
      if (sent.hash !== entry.hash) throw new DeploymentError("RPC returned an unexpected hash; reconcile before continuing.");
      entry.state = "submitted"; await persist();
    }
    throw new ChainPendingError(action, entry.hash);
  }
  return { send, canonicalReceipt, confirmAll };
}
