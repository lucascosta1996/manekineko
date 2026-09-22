import { constants } from "node:fs";
import { mkdir, open, rename, unlink, lstat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Transaction, getAddress, keccak256, toUtf8Bytes } from "ethers";
import type { Provider, Signer, TransactionReceipt, TransactionRequest } from "ethers";

export class DeploymentError extends Error {}
export const json = (value: unknown) => JSON.stringify(value, (_, item: unknown) => typeof item === "bigint" ? item.toString() : item, 2);
export function configFingerprint(value: unknown): string {
  const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical) : item !== null && typeof item === "object"
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => [key, canonical(val)]))
    : typeof item === "bigint" ? item.toString() : item;
  return keccak256(toUtf8Bytes(JSON.stringify(canonical(value))));
}
export function feeCeiling(value = "5000000000"): bigint {
  if (!/^[1-9]\d*$/.test(value)) throw new DeploymentError("The versioned MAX_FEE_PER_GAS_WEI setting must be a positive canonical decimal integer.");
  return BigInt(value);
}
export function cappedFees(baseFee: bigint, priority: bigint, ceiling: bigint) {
  const maxFeePerGas = baseFee * 2n + priority;
  if (baseFee < 0n || priority < 0n || maxFeePerGas > ceiling) throw new DeploymentError("Live fee estimate exceeds the configured MAX_FEE_PER_GAS_WEI ceiling. Wait for lower fees; no transaction was signed.");
  return { maxFeePerGas, maxPriorityFeePerGas: priority };
}
export type JournalEntry = {
  action: string; state: "prepared" | "submitted" | "confirmed";
  rawTransaction: string; hash: string; nonce: number;
  expectedContract?: string; blockNumber?: number; blockHash?: string; gasUsed?: string; gasPrice?: string;
};
export type DeploymentJournal = {
  version: 2; inputHash: string; configTimestamp: string; maxFeePerGasWei: string;
  startingNonce: number; from: string; chainId: string; existingFactory: string | null;
  preflight: Record<string, any>; state: string; transactions: JournalEntry[];
  factory?: string; renderer?: string; deployer?: string; factoryCodeHash?: string; round?: string; subscriptionId?: string;
  error?: string;
};

/** Atomic private file store. A lock is never guessed stale or silently deleted. */
export async function openJournal(path: string) {
  const file = resolve(path), directory = dirname(file), lockPath = `${file}.lock`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (!(await lstat(directory)).isDirectory()) throw new DeploymentError("Journal parent must be a real directory.");
  let lock;
  try { lock = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new DeploymentError("Deployment journal is locked. Reconcile the prior process before removing a stale lock.");
    throw error;
  }
  await lock.writeFile(json({ pid: process.pid, createdAt: new Date().toISOString() }));
  await lock.sync();
  async function load(): Promise<DeploymentJournal | null> {
    let handle;
    try { handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 2_000_000 || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) throw new DeploymentError("Deployment journal must be an owned private regular file (chmod 600).");
      return JSON.parse(await handle.readFile("utf8"));
    } finally { await handle.close(); }
  }
  async function save(value: DeploymentJournal) {
    await load();
    const temporary = `${file}.${randomUUID()}.tmp`;
    const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(`${json(value)}\n`); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, file);
    const parent = await open(directory, constants.O_RDONLY);
    try { await parent.sync(); } finally { await parent.close(); }
  }
  return { file, load, save, async close() { await lock.close(); await unlink(lockPath); } };
}

export function validateJournal(journal: DeploymentJournal, expected: { chainId: bigint; from: string; inputHash: string; ceiling: bigint; existingFactory: string | null }) {
  if (journal.version !== 2 || journal.inputHash !== expected.inputHash || journal.chainId !== String(expected.chainId) ||
      journal.from !== expected.from || journal.maxFeePerGasWei !== String(expected.ceiling) || journal.existingFactory !== expected.existingFactory ||
      !/^\d+$/.test(journal.configTimestamp) || !Number.isSafeInteger(journal.startingNonce) || journal.startingNonce < 0 ||
      !Array.isArray(journal.transactions) || journal.transactions.length > 3 || !journal.preflight) {
    throw new DeploymentError("Journal differs from this configuration, signer, chain, factory or fee ceiling. Resume the original deployment; do not replace its journal.");
  }
  const actions = journal.existingFactory ? ["create-round", "fund-randomness"] : ["deploy-factory", "create-round", "fund-randomness"];
  journal.transactions.forEach((entry, index) => {
    const tx = Transaction.from(entry.rawTransaction);
    if (entry.action !== actions[index] || !["prepared", "submitted", "confirmed"].includes(entry.state) ||
        (index < journal.transactions.length - 1 && entry.state !== "confirmed") || tx.hash !== entry.hash ||
        tx.from !== journal.from || tx.chainId !== expected.chainId || tx.nonce !== journal.startingNonce + index || entry.nonce !== tx.nonce ||
        tx.type !== 2 || tx.maxFeePerGas === null || tx.maxFeePerGas > expected.ceiling || tx.maxPriorityFeePerGas === null ||
        tx.maxPriorityFeePerGas > tx.maxFeePerGas || (tx.accessList?.length ?? 0) > 0 || (tx.authorizationList?.length ?? 0) > 0) {
      throw new DeploymentError("Journal has an invalid transaction, signature, fee, nonce or stage order.");
    }
  });
}

export function validateJournalAnchor(journal: DeploymentJournal, block: { number: number; hash: string | null; timestamp: number } | null) {
  if (!block || block.number !== journal.preflight.blockNumber || block.hash !== journal.preflight.blockHash ||
      String(block.timestamp) !== journal.configTimestamp || journal.preflight.configTimestamp !== journal.configTimestamp) {
    throw new DeploymentError("Original deployment configuration block is not canonical or its timestamp changed. Reconcile before resuming.");
  }
}

export function checkSignedIntent(entry: JournalEntry, request: TransactionRequest) {
  const tx = Transaction.from(entry.rawTransaction);
  if (tx.hash !== entry.hash || tx.to !== (request.to ? getAddress(String(request.to)) : null) ||
      tx.data !== (request.data ?? "0x") || tx.value !== BigInt(String(request.value ?? 0))) {
    throw new DeploymentError("Saved signed transaction does not match the requested deployment stage.");
  }
  return tx;
}

/** Calls are ordered by the deployer. On resume each stage first reconciles its exact hash. */
export function journaledTransactions(options: {
  journal: DeploymentJournal; provider: Provider; signer: Signer; save: () => Promise<void>;
  confirmations: number; ceiling: bigint; waitMs?: number; pollCount?: number;
}) {
  const { journal, provider, signer, save, confirmations, ceiling } = options;
  let cursor = 0;
  return async (action: string, request: TransactionRequest): Promise<TransactionReceipt> => {
    const index = cursor++;
    let entry = journal.transactions[index];
    if (entry && entry.action !== action) throw new DeploymentError("Deployment stage does not match journal order.");
    if (!entry) {
      if (journal.transactions.length !== index || journal.transactions.some(item => item.state !== "confirmed")) throw new DeploymentError("Earlier deployment stage is not confirmed.");
      if ((await provider.getNetwork()).chainId !== BigInt(journal.chainId)) throw new DeploymentError("Deployment provider changed chain.");
      const nonce = journal.startingNonce + index;
      if (await provider.getTransactionCount(journal.from, "latest") !== nonce || await provider.getTransactionCount(journal.from, "pending") !== nonce) throw new DeploymentError("Deployment signer nonce changed or another transaction is pending. Reconcile before continuing.");
      const head = await provider.getBlock("latest"), fees = await provider.getFeeData();
      if (head?.baseFeePerGas === null || head?.baseFeePerGas === undefined || fees.maxPriorityFeePerGas === null) throw new DeploymentError("RPC did not return EIP-1559 fees.");
      const limits = cappedFees(head.baseFeePerGas, fees.maxPriorityFeePerGas, ceiling);
      const gasLimit = (await provider.estimateGas({ ...request, from: journal.from })) * 120n / 100n;
      if (await provider.getBalance(journal.from) < BigInt(String(request.value ?? 0)) + gasLimit * limits.maxFeePerGas) throw new DeploymentError("Deployment signer balance cannot cover this stage and its maximum gas.");
      const rawTransaction = await signer.signTransaction({ ...request, type: 2, nonce, chainId: BigInt(journal.chainId), gasLimit, ...limits });
      const tx = Transaction.from(rawTransaction);
      if (!tx.hash || tx.from !== journal.from) throw new DeploymentError("Signer produced an unexpected transaction.");
      entry = { action, state: "prepared", rawTransaction, hash: tx.hash, nonce };
      journal.transactions.push(entry);
      // Signed bytes and deterministic hash reach disk before a network write is possible.
      await save();
    }
    const signed = checkSignedIntent(entry, request);
    for (let attempt = 0; attempt < (options.pollCount ?? 13); attempt++) {
      const receipt = await provider.getTransactionReceipt(entry.hash);
      if (receipt) {
        if (receipt.hash !== entry.hash || receipt.status !== 1 || receipt.from !== journal.from || receipt.to !== signed.to) throw new DeploymentError(`${action} reverted or differs from the saved transaction. No replacement will be sent.`);
        const mined = await provider.getBlock(receipt.blockNumber);
        if (mined?.hash !== receipt.blockHash) throw new DeploymentError(`${action} receipt is not canonical; reconcile the chain before continuing.`);
        const head = await provider.getBlock("latest");
        if (head && head.number - receipt.blockNumber + 1 >= confirmations) {
          entry.state = "confirmed"; entry.blockNumber = receipt.blockNumber; entry.blockHash = receipt.blockHash;
          entry.gasUsed = String(receipt.gasUsed); entry.gasPrice = String(receipt.gasPrice);
          await save();
          console.log(json({ action, state: "confirmed", hash: entry.hash, blockNumber: receipt.blockNumber }));
          return receipt;
        }
      } else {
        if (entry.state === "confirmed") throw new DeploymentError(`${action} lost a previously confirmed receipt. Reconcile before proceeding.`);
        const pending = await provider.getTransaction(entry.hash);
        if (!pending && attempt === 0) {
          if ((await provider.getNetwork()).chainId !== signed.chainId) throw new DeploymentError("Deployment provider changed chain.");
          if (await provider.getTransactionCount(journal.from, "latest") !== signed.nonce || await provider.getTransactionCount(journal.from, "pending") !== signed.nonce) throw new DeploymentError("Saved transaction nonce was consumed or is pending under another hash. Reconcile; no replacement will be sent.");
          const latest = await provider.getBlock("latest");
          if (!latest || latest.baseFeePerGas === null || latest.baseFeePerGas > signed.maxFeePerGas!) throw new DeploymentError("Current base fee exceeds the saved transaction cap. Wait and resume this journal.");
          const sent = await provider.broadcastTransaction(entry.rawTransaction);
          if (sent.hash !== entry.hash) throw new DeploymentError("RPC returned a different transaction hash. Stop and reconcile.");
          entry.state = "submitted"; await save();
          console.log(json({ action, state: "submitted", hash: entry.hash }));
        }
      }
      if (attempt + 1 < (options.pollCount ?? 13)) await new Promise(resolve => setTimeout(resolve, options.waitMs ?? 5000));
    }
    throw new DeploymentError(`${action} is awaiting confirmation. Resume with the same V5_JOURNAL_PATH; its exact signed transaction is preserved.`);
  };
}
