import { constants } from "node:fs";
import { mkdir, open, rename, unlink, lstat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Transaction, getAddress, keccak256 } from "ethers";

export class RehearsalError extends Error {}
export const fail = message => { throw new RehearsalError(message); };
export const json = value => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2);
export const sameAddress = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
function allowedDelegate(role, code, policy) {
  if (!Object.hasOwn(policy.wallets, role)) fail("Wallet role is not pinned to this rehearsal.");
  if (code === "0x") return null;
  const delegation = policy.affiliateDelegation;
  if (policy.chainId !== 11155111n || !["AFFILIATE_A", "AFFILIATE_B", "AFFILIATE_C"].includes(role) ||
      !delegation || !sameAddress(policy.wallets[role], delegation.wallets?.[role])) fail("This pinned rehearsal wallet must remain an undelegated EOA.");
  if (typeof code !== "string" || !/^0xef0100[0-9a-f]{40}$/i.test(code) || !sameAddress(`0x${code.slice(8)}`, delegation.address)) fail("Affiliate wallet delegation differs from the pinned 23-byte EIP-7702 implementation.");
  return delegation.address;
}
/** Only the three fixed test affiliates may retain this independently verified delegation. */
export function validateWalletCode(role, code, delegateCodeHash, policy) {
  const delegate = allowedDelegate(role, code, policy);
  if (delegate && (typeof delegateCodeHash !== "string" || !/^0x[0-9a-f]{64}$/i.test(delegateCodeHash) || delegateCodeHash.toLowerCase() !== policy.affiliateDelegation.codeHash.toLowerCase())) fail("Affiliate delegation implementation runtime hash differs from the pinned code.");
}
export async function assertWalletCodeAt(provider, role, policy, tag = "latest") {
  const address = policy.wallets[role];
  if (!address) fail("Wallet role is not pinned to this rehearsal.");
  const code = await provider.send("eth_getCode", [address, tag]);
  const delegate = allowedDelegate(role, code, policy);
  const delegateCodeHash = delegate ? keccak256(await provider.send("eth_getCode", [delegate, tag])) : null;
  validateWalletCode(role, code, delegateCodeHash, policy);
}
export function safeError(error) {
  return error instanceof RehearsalError ? error.message : "Rehearsal stopped. Private RPC, signing and filesystem diagnostics withheld. Reconcile the saved journal before resuming.";
}
export async function readPrivate(path, optional = false) {
  let file;
  try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) { if (optional && error?.code === "ENOENT") return null; throw error; }
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 2_000_000 || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid())) fail("Rehearsal files must be owned private regular files (chmod 600).");
    return await file.readFile("utf8");
  } finally { await file.close(); }
}
export async function privateStore(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (!(await lstat(directory)).isDirectory()) fail("Journal directory must be a real directory.");
  const path = new URL("rehearsal-journal.json", directory);
  return {
    async load() { const text = await readPrivate(path, true); return text === null ? null : JSON.parse(text); },
    async save(value) {
      await readPrivate(path, true);
      const temporary = new URL(`.rehearsal-${randomUUID()}.tmp`, directory);
      const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { await file.writeFile(json(value) + "\n"); await file.sync(); } finally { await file.close(); }
      await rename(temporary, path);
      const parent = await open(directory, constants.O_RDONLY);
      try { await parent.sync(); } finally { await parent.close(); }
    },
  };
}
export async function withRehearsalLock(directory, task) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (!(await lstat(directory)).isDirectory()) fail("Journal directory must be a real directory.");
  const path = new URL("rehearsal.lock", directory);
  let file;
  try { file = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); }
  catch (error) { if (error?.code === "EEXIST") fail("Rehearsal is locked. Inspect the prior process and reconcile its journal before removing a stale lock."); throw error; }
  try { await file.writeFile(json({ pid: process.pid, createdAt: new Date().toISOString() })); await file.sync(); return await task(); }
  finally { await file.close(); await unlink(path); }
}

/** Compare every economically relevant signed field with a fixed, independently derived intent. */
export function validateSigned(entry, intent, policy) {
  let tx;
  try { tx = Transaction.from(entry.rawTransaction); } catch { fail("Invalid signed rehearsal transaction."); }
  if (!tx.isSigned() || tx.hash !== entry.hash || entry.action !== intent.action || entry.role !== intent.role ||
      !sameAddress(tx.from, policy.wallets[intent.role]) || !sameAddress(tx.to, intent.to) || tx.data !== intent.data ||
      tx.value !== intent.value || tx.chainId !== policy.chainId || tx.type !== 2 || tx.nonce !== entry.nonce ||
      !Number.isSafeInteger(entry.nonce) || entry.nonce < 0 || tx.gasLimit <= 0n || tx.gasLimit > policy.maxGas ||
      tx.maxFeePerGas === null || tx.maxFeePerGas <= 0n || tx.maxFeePerGas > policy.feeCap ||
      tx.maxPriorityFeePerGas === null || tx.maxPriorityFeePerGas < 0n || tx.maxPriorityFeePerGas > tx.maxFeePerGas ||
      (tx.accessList?.length ?? 0) || (tx.authorizationList?.length ?? 0) ||
      !["prepared", "submitted", "confirmed"].includes(entry.state)) fail("Signed transaction differs from the fixed rehearsal intent, signer, network, fees or gas policy.");
  return tx;
}

/** Resume the exact signed hash first. Never sign a replacement after uncertain submission. */
export async function reconcileEntry({ entry, intent, policy, provider, save, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), polls = 11, validateReceipt = () => {}, beforeBroadcast = () => {} }) {
  const tx = validateSigned(entry, intent, policy);
  for (let attempt = 0; attempt < polls; attempt++) {
    if (BigInt(await provider.send("eth_chainId", [])) !== policy.chainId) fail("RPC changed network; Sepolia only.");
    const receipt = await provider.getTransactionReceipt(entry.hash);
    if (receipt) {
      if (receipt.hash !== entry.hash || receipt.status !== 1 || !sameAddress(receipt.from, tx.from) || !sameAddress(receipt.to, tx.to)) fail("Saved transaction reverted or differs from its intent. No replacement will be sent.");
      const block = await provider.getBlock(receipt.blockNumber);
      if (block?.hash !== receipt.blockHash) fail("Transaction receipt is not canonical; reconcile before proceeding.");
      if (entry.state === "confirmed" && (entry.blockHash !== receipt.blockHash || entry.blockNumber !== receipt.blockNumber)) fail("Previously confirmed transaction changed blocks; stop and reconcile.");
      const head = await provider.getBlock("latest");
      if (head && head.number - receipt.blockNumber + 1 >= policy.confirmations) {
        entry.proof = await validateReceipt(intent, receipt) ?? null;
        entry.state = "confirmed"; entry.blockNumber = receipt.blockNumber; entry.blockHash = receipt.blockHash;
        entry.gasUsed = receipt.gasUsed.toString(); entry.gasPrice = receipt.gasPrice.toString();
        await save(); return receipt;
      }
    } else {
      if (entry.state === "confirmed") fail("Previously confirmed transaction is missing. No replacement will be sent.");
      const pending = await provider.getTransaction(entry.hash);
      if (pending) {
        if (pending.hash !== tx.hash || !sameAddress(pending.from, tx.from) || !sameAddress(pending.to, tx.to) || pending.nonce !== tx.nonce || pending.data !== tx.data || pending.value !== tx.value) fail("RPC returned a conflicting pending transaction.");
      } else if (attempt === 0) {
        const head = await provider.getBlock("latest");
        if (!head || Date.now() / 1000 - head.timestamp > 300 || head.baseFeePerGas === null || head.baseFeePerGas > tx.maxFeePerGas) fail("Saved transaction cannot be submitted at the current block or base fee; wait and resume.");
        if (await provider.getTransactionCount(tx.from, "latest") !== tx.nonce || await provider.getTransactionCount(tx.from, "pending") !== tx.nonce) fail("Saved nonce is consumed or pending under another hash. No replacement will be sent.");
        await beforeBroadcast(intent, entry);
        if (BigInt(await provider.send("eth_chainId", [])) !== policy.chainId) fail("Saved transaction network changed before broadcast.");
        await assertWalletCodeAt(provider, intent.role, policy);
        if (await provider.getTransactionCount(tx.from, "latest") !== tx.nonce || await provider.getTransactionCount(tx.from, "pending") !== tx.nonce) fail("Saved nonce changed during preflight. No replacement will be sent.");
        if (await provider.getBalance(tx.from) < tx.value + tx.gasLimit * tx.maxFeePerGas) fail("Signer cannot cover the saved transaction and its maximum fee.");
        const sent = await provider.broadcastTransaction(entry.rawTransaction);
        if (sent.hash !== entry.hash) fail("RPC returned an unexpected transaction hash. Stop and reconcile.");
        entry.state = "submitted"; await save();
      }
    }
    if (attempt + 1 < polls) await wait(5000);
  }
  fail(`Transaction ${entry.hash} is awaiting confirmations. Resume the same stage with the original journal.`);
}

export async function prepareEntry({ intent, policy, provider, signer, nonce, savePrepared }) {
  if (BigInt(await provider.send("eth_chainId", [])) !== policy.chainId) fail("Wrong network; this rehearsal supports Sepolia only.");
  const address = policy.wallets[intent.role];
  if (!sameAddress(await signer.getAddress(), address)) fail("Signing key does not match the pinned rehearsal wallet.");
  await assertWalletCodeAt(provider, intent.role, policy);
  if (await provider.getTransactionCount(address, "latest") !== nonce || await provider.getTransactionCount(address, "pending") !== nonce) fail("Signer nonce changed or another transaction is pending. Reconcile before continuing.");
  const head = await provider.getBlock("latest"), fees = await provider.getFeeData();
  if (!head || Date.now() / 1000 - head.timestamp > 300 || head.baseFeePerGas === null || fees.maxPriorityFeePerGas === null) fail("RPC returned stale state or unavailable EIP-1559 fees.");
  const maxFeePerGas = head.baseFeePerGas * 2n + fees.maxPriorityFeePerGas;
  if (maxFeePerGas <= 0n || maxFeePerGas > policy.feeCap) fail("Live fees exceed the fixed 5 gwei cap. Wait for lower fees.");
  const request = { from: address, to: intent.to, data: intent.data, value: intent.value };
  await provider.call(request);
  const gasLimit = (await provider.estimateGas(request)) * 120n / 100n;
  if (gasLimit <= 0n || gasLimit > policy.maxGas) fail("Transaction gas estimate exceeds the fixed rehearsal limit.");
  if (await provider.getBalance(address) < intent.value + gasLimit * maxFeePerGas) fail("Pinned signer has insufficient balance for this stage and its maximum fee.");
  await assertWalletCodeAt(provider, intent.role, policy);
  const rawTransaction = await signer.signTransaction({ to: intent.to, data: intent.data, value: intent.value, nonce, type: 2,
    chainId: policy.chainId, gasLimit, maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas });
  const entry = { action: intent.action, role: intent.role, state: "prepared", nonce, hash: Transaction.from(rawTransaction).hash, rawTransaction };
  validateSigned(entry, intent, policy);
  await savePrepared(entry); // Durable exact bytes before broadcasting is possible.
  return entry;
}
