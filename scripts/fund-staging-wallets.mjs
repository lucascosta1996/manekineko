import { constants } from "node:fs";
import { mkdir, open, rename, unlink, lstat } from "node:fs/promises";
import { parseEnv } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { Wallet, Transaction, formatEther, getAddress } from "ethers";
import { stagingProviderConfig } from "./staging-provider-check.mjs";

// One bounded rehearsal, not an arbitrary payment tool. The CLI has no recipient,
// amount, chain, nonce, key, RPC, or gas overrides.
export const FUNDING_POLICY = Object.freeze({
  chainId: 11155111n,
  source: "0xC0Eb929903dCD29c7a33E6dA1f78a247CFB68145",
  deployer: "0x3b2571129c05bD71B6504596aB2ca52B3ffB7223",
  enrollment: "0xE995671cdF0110D51F9dF6D079B363879009976F",
  recipients: Object.freeze([
    Object.freeze({ role: "AFFILIATE_A", address: "0xE9d5303480E33cfa4310576967C62cBd2bEC8B87" }),
    Object.freeze({ role: "AFFILIATE_B", address: "0x9876C055407927AC7D01a26Db2D7ACB1f3397C8b" }),
    Object.freeze({ role: "AFFILIATE_C", address: "0xca6f6597A6dC2EdfB5E1e3C8711Db281833d005c" }),
    Object.freeze({ role: "BUYER_A", address: "0xF0aD291922A954e035323d37F79702e02912e12A" }),
    Object.freeze({ role: "BUYER_B", address: "0xc48E0430E8BbA9ecf314C33266559118D7Ca3e9B" }),
  ]),
});
const FUNDING = 500_000_000_000_000_000n;
const PAYMENT = 20_000_000_000_000_000n;
const RESERVE = 393_000_000_000_000_000n;
const GAS = 21_000n;
const FEE_CAP = 5_000_000_000n;
const CONFIRMATIONS = 2n;
const root = new URL("../", import.meta.url);
class FundingError extends Error {}
const fail = message => { throw new FundingError(message); };
const hex = value => `0x${value.toString(16)}`;
const sameAddress = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
const hash = value => typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value);
function quantity(value) {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/i.test(value)) fail("RPC returned an invalid quantity.");
  return BigInt(value);
}

export function parseFundingArguments(args) {
  let send = false, fundingTx;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--send" && !send) send = true;
    else if (args[i] === "--funding-tx" && fundingTx === undefined && hash(args[i + 1])) fundingTx = args[++i].toLowerCase();
    else fail("Usage: node scripts/fund-staging-wallets.mjs [--send --funding-tx <confirmed hash>]. Preview is the default.");
  }
  if (send && !fundingTx) fail("Sending requires both --send and --funding-tx <confirmed hash>.");
  return { send, fundingTx };
}

export function validateWalletManifest(manifest, policy = FUNDING_POLICY) {
  const expected = [{ role: "DEPLOYER", address: policy.deployer }, { role: "ENROLLMENT", address: policy.enrollment }, ...policy.recipients];
  if (manifest?.chainId !== 11155111 || !Array.isArray(manifest.wallets) || manifest.wallets.length !== expected.length ||
      expected.some(wallet => manifest.wallets.filter(item => item?.role === wallet.role && sameAddress(item.address, wallet.address)).length !== 1)) {
    fail("The public wallet manifest does not match the pinned Sepolia rehearsal wallets.");
  }
}

/** Provider errors may contain RPC credentials or signed payloads: never expose them. */
export function fundingErrorMessage(error) {
  return error instanceof FundingError ? error.message : "Staging wallet funding stopped. Private provider, signing, and filesystem details were withheld; inspect the private journal before retrying.";
}

function rpcClient(url) {
  let id = 0;
  return async (method, params = []) => {
    try {
      const requestId = ++id;
      const response = await fetch(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }) });
      if (!response.ok) throw new Error();
      const body = await response.text();
      if (body.length > 1_048_576) throw new Error();
      const result = JSON.parse(body);
      if (result?.jsonrpc !== "2.0" || result.id !== requestId || result.error) throw new Error();
      return result.result;
    } catch {
      fail(method === "eth_sendRawTransaction"
        ? "Submission result is uncertain. The signed transaction is saved; rerun this same command to reconcile its hash without creating a new payment."
        : "Sepolia RPC read failed. Credentials and provider diagnostics were withheld.");
    }
  };
}

async function head(rpc) {
  if (quantity(await rpc("eth_chainId")) !== 11155111n) fail("Wrong network: this helper only supports Ethereum Sepolia (11155111).");
  const block = await rpc("eth_getBlockByNumber", ["latest", false]);
  const number = quantity(block?.number), timestamp = quantity(block?.timestamp);
  const age = BigInt(Math.floor(Date.now() / 1000)) - timestamp;
  if (!hash(block?.hash) || number === 0n || age > 300n || age < -30n) fail("Sepolia RPC returned a stale or invalid block.");
  return { number, blockTag: block.number, baseFee: quantity(block.baseFeePerGas) };
}

export function validateFundingTransaction(transaction, receipt, tip, expectedHash, policy = FUNDING_POLICY) {
  if (!hash(expectedHash) || transaction?.hash?.toLowerCase() !== expectedHash.toLowerCase() ||
      !sameAddress(transaction.from, policy.source) || !sameAddress(transaction.to, policy.deployer) ||
      quantity(transaction.value) !== FUNDING || quantity(transaction.chainId) !== 11155111n ||
      transaction.input !== "0x" || (transaction.authorizationList?.length ?? 0) !== 0 ||
      receipt?.transactionHash?.toLowerCase() !== expectedHash.toLowerCase() || quantity(receipt.status) !== 1n ||
      !sameAddress(receipt.from, policy.source) || !sameAddress(receipt.to, policy.deployer) ||
      transaction.blockHash !== receipt.blockHash || transaction.blockNumber !== receipt.blockNumber || !hash(receipt.blockHash)) {
    fail("Funding proof must be a successful, direct 0.50 Sepolia ETH transfer from the pinned Opera address to the pinned deployer.");
  }
  const block = quantity(receipt.blockNumber);
  if (tip - block + 1n < CONFIRMATIONS) fail("The source funding transfer needs at least two confirmations.");
  return { hash: expectedHash.toLowerCase(), blockNumber: receipt.blockNumber, blockHash: receipt.blockHash };
}

async function fundingProof(rpc, fundingTx, tip, policy) {
  const [transaction, receipt] = await Promise.all([
    rpc("eth_getTransactionByHash", [fundingTx]), rpc("eth_getTransactionReceipt", [fundingTx]),
  ]);
  const proof = validateFundingTransaction(transaction, receipt, tip, fundingTx, policy);
  const canonical = await rpc("eth_getBlockByNumber", [proof.blockNumber, false]);
  if (canonical?.hash !== proof.blockHash) fail("Funding transfer block is no longer canonical; stop and reconcile the funding transfer.");
  return proof;
}

async function account(rpc, address, blockTag) {
  const [balance, code, nonce] = await Promise.all([
    rpc("eth_getBalance", [address, blockTag]), rpc("eth_getCode", [address, blockTag]), rpc("eth_getTransactionCount", [address, blockTag]),
  ]);
  if (code !== "0x") fail("A pinned rehearsal wallet has contract or delegated code; plain EOA transfers are required.");
  return { balance: quantity(balance), nonce: quantity(nonce) };
}

function assertEnrollment(enrollment) {
  if (enrollment.balance !== 0n || enrollment.nonce !== 0n) fail("Enrollment signer must remain unfunded and have no transactions.");
}

function validateSigned(entry, index, policy) {
  if (entry?.role !== policy.recipients[index]?.role || typeof entry.rawTransaction !== "string" || entry.rawTransaction.length > 2048) fail("Invalid funding journal entry.");
  let tx;
  try { tx = Transaction.from(entry.rawTransaction); } catch { fail("Invalid signed transaction in the funding journal."); }
  if (!tx.isSigned() || !sameAddress(tx.from, policy.deployer) || !sameAddress(tx.to, policy.recipients[index].address) ||
      tx.hash !== entry.hash || tx.chainId !== 11155111n || tx.type !== 2 || tx.value !== PAYMENT || tx.data !== "0x" ||
      tx.nonce !== index || tx.gasLimit !== GAS || tx.maxFeePerGas <= 0n || tx.maxFeePerGas > FEE_CAP ||
      tx.maxPriorityFeePerGas > tx.maxFeePerGas || (tx.accessList?.length ?? 0) || (tx.authorizationList?.length ?? 0)) {
    fail("Signed transaction does not match the pinned recipient, amount, nonce, chain, or gas policy.");
  }
  return tx;
}

export function validateFundingJournal(journal, fundingTx, policy = FUNDING_POLICY) {
  if (journal?.version !== 1 || journal.chainId !== 11155111 || journal.fundingTx !== fundingTx ||
      !sameAddress(journal.source, policy.source) || !sameAddress(journal.deployer, policy.deployer) ||
      !Array.isArray(journal.entries) || journal.entries.length > 5 || !["in-progress", "complete"].includes(journal.state)) {
    fail("Existing funding journal differs from this rehearsal. Do not start a second distribution or replace the journal.");
  }
  journal.entries.forEach((entry, index) => {
    validateSigned(entry, index, policy);
    if (!["prepared", "submitted", "confirmed"].includes(entry.state) ||
        (index < journal.entries.length - 1 && entry.state !== "confirmed")) fail("Funding journal progression is invalid.");
  });
  if (journal.state === "complete" && (journal.entries.length !== 5 || journal.entries.some(entry => entry.state !== "confirmed"))) fail("Funding journal completion is invalid.");
}

export async function previewFunding({ rpc, fundingTx, policy = FUNDING_POLICY }) {
  const tip = await head(rpc);
  if (fundingTx) await fundingProof(rpc, fundingTx, tip.number, policy);
  const deployer = await account(rpc, policy.deployer, tip.blockTag);
  const enrollment = await account(rpc, policy.enrollment, tip.blockTag);
  assertEnrollment(enrollment);
  const recipients = [];
  for (const wallet of policy.recipients) {
    const details = await account(rpc, wallet.address, tip.blockTag);
    recipients.push({ ...wallet, balanceEth: formatEther(details.balance), plannedTransferEth: formatEther(PAYMENT) });
  }
  return { mode: "preview", chainId: 11155111, blockNumber: tip.number.toString(), source: policy.source, deployer: policy.deployer,
    requiredSourceTransferEth: formatEther(FUNDING), fundingTransferVerified: Boolean(fundingTx),
    deployerBalanceEth: formatEther(deployer.balance), minimumDeployerReserveEth: formatEther(RESERVE),
    maximumDistributionGasEth: formatEther(5n * GAS * FEE_CAP), recipients,
    note: "Read-only preview. No wallet signing keys were loaded. A private journal is required for send/resume; never delete it to repeat a distribution." };
}

/** Dependencies allow offline tests; the CLI always supplies the immutable policy above. */
export async function distributeFunding({ rpc, fundingTx, loadSigner, store, wait = sleep, policy = FUNDING_POLICY }) {
  if (!hash(fundingTx)) fail("Supply the confirmed source funding transaction hash.");
  const tip = await head(rpc);
  const proof = await fundingProof(rpc, fundingTx, tip.number, policy);
  let journal = await store.load();
  if (journal) validateFundingJournal(journal, fundingTx, policy);
  else {
    const deployer = await account(rpc, policy.deployer, tip.blockTag);
    if (deployer.nonce !== 0n || quantity(await rpc("eth_getTransactionCount", [policy.deployer, "pending"])) !== 0n) fail("The deployer already has transactions. Reconcile its original funding journal before any new distribution.");
    for (const recipient of policy.recipients) {
      const state = await account(rpc, recipient.address, tip.blockTag);
      if (state.balance !== 0n || state.nonce !== 0n) fail("A recipient is already funded or has transaction history. Refusing a new distribution without its original journal.");
    }
    assertEnrollment(await account(rpc, policy.enrollment, tip.blockTag));
    journal = { version: 1, chainId: 11155111, source: policy.source, deployer: policy.deployer,
      fundingTx, fundingBlock: proof, createdAt: new Date().toISOString(), state: "in-progress", entries: [] };
    await store.save(journal);
  }
  let signer;
  for (let index = 0; index < policy.recipients.length; index++) {
    let entry = journal.entries[index];
    if (!entry) {
      const current = await head(rpc);
      await fundingProof(rpc, fundingTx, current.number, policy);
      const deployer = await account(rpc, policy.deployer, current.blockTag);
      if (deployer.nonce !== BigInt(index) || quantity(await rpc("eth_getTransactionCount", [policy.deployer, "pending"])) !== BigInt(index)) fail("Unexpected deployer nonce or pending transaction. Stop and reconcile; this helper never replaces transactions.");
      assertEnrollment(await account(rpc, policy.enrollment, current.blockTag));
      for (const recipient of policy.recipients.slice(index)) {
        const state = await account(rpc, recipient.address, current.blockTag);
        if (state.balance !== 0n || state.nonce !== 0n) fail("An unpaid recipient changed since the plan was prepared; stop and reconcile.");
      }
      const remaining = BigInt(policy.recipients.length - index);
      if (deployer.balance < RESERVE + remaining * (PAYMENT + GAS * FEE_CAP)) fail("Insufficient deployer balance to preserve 0.393 ETH after all remaining payments and maximum transfer gas.");
      const priority = quantity(await rpc("eth_maxPriorityFeePerGas"));
      const fee = current.baseFee * 2n + priority;
      if (fee <= 0n || fee > FEE_CAP) fail("Current maximum fee exceeds the 5 gwei ceiling. Wait for lower fees; do not change the policy.");
      const recipient = policy.recipients[index];
      const estimate = quantity(await rpc("eth_estimateGas", [{ from: policy.deployer, to: recipient.address, value: hex(PAYMENT), data: "0x" }]));
      if (estimate !== GAS) fail("Recipient transfer is not the expected 21,000-gas EOA payment.");
      signer ??= await loadSigner();
      if (!sameAddress(await signer.getAddress(), policy.deployer)) fail("The private deployer key does not match the pinned public manifest.");
      const rawTransaction = await signer.signTransaction({ type: 2, chainId: 11155111n, nonce: index, to: recipient.address,
        value: PAYMENT, data: "0x", gasLimit: GAS, maxFeePerGas: fee, maxPriorityFeePerGas: priority });
      entry = { role: recipient.role, state: "prepared", hash: Transaction.from(rawTransaction).hash, rawTransaction };
      validateSigned(entry, index, policy);
      journal.entries.push(entry);
      // Both exact signed bytes and their hash are durable before any network write.
      await store.save(journal);
    }
    const signed = validateSigned(entry, index, policy);
    let confirmed = false;
    for (let attempt = 0; attempt < 13; attempt++) {
      const current = await head(rpc);
      const receipt = await rpc("eth_getTransactionReceipt", [entry.hash]);
      if (receipt) {
        if (receipt.transactionHash !== entry.hash || !sameAddress(receipt.from, policy.deployer) ||
            !sameAddress(receipt.to, signed.to) || quantity(receipt.status) !== 1n) fail("A journaled payment did not succeed as intended. Stop and reconcile; no replacement will be sent.");
        const canonical = await rpc("eth_getBlockByNumber", [receipt.blockNumber, false]);
        if (!hash(receipt.blockHash) || canonical?.hash !== receipt.blockHash) fail("Payment receipt block is no longer canonical. Stop and reconcile.");
        if (current.number - quantity(receipt.blockNumber) + 1n >= CONFIRMATIONS) {
          if (entry.state === "confirmed" && (entry.blockHash !== receipt.blockHash || entry.blockNumber !== receipt.blockNumber)) fail("A previously confirmed payment changed blocks. Stop and reconcile.");
          entry.state = "confirmed"; entry.blockHash = receipt.blockHash; entry.blockNumber = receipt.blockNumber;
          entry.gasUsed = quantity(receipt.gasUsed).toString();
          entry.effectiveGasPrice = quantity(receipt.effectiveGasPrice).toString();
          await store.save(journal); confirmed = true; break;
        }
      } else {
        if (entry.state === "confirmed") fail("A previously confirmed payment is missing. Stop and reconcile; no automatic replacement is allowed.");
        const pending = await rpc("eth_getTransactionByHash", [entry.hash]);
        if (pending) {
          if (pending.hash !== entry.hash || !sameAddress(pending.from, policy.deployer) || !sameAddress(pending.to, signed.to) ||
              quantity(pending.value) !== PAYMENT || quantity(pending.nonce) !== BigInt(index) || pending.input !== "0x") fail("RPC returned a conflicting pending transaction; stop and reconcile.");
        } else if (attempt === 0) {
          const deployer = await account(rpc, policy.deployer, current.blockTag);
          if (deployer.nonce !== BigInt(index) || quantity(await rpc("eth_getTransactionCount", [policy.deployer, "pending"])) !== BigInt(index)) fail("Journaled payment is absent but its nonce may be in use. Stop and reconcile; no new payment will be signed.");
          assertEnrollment(await account(rpc, policy.enrollment, current.blockTag));
          for (const recipient of policy.recipients.slice(index)) await account(rpc, recipient.address, current.blockTag);
          if (deployer.balance < RESERVE + BigInt(5 - index) * (PAYMENT + GAS * FEE_CAP)) fail("Insufficient balance to preserve the deployer reserve before submission.");
          await fundingProof(rpc, fundingTx, current.number, policy);
          if (current.baseFee > signed.maxFeePerGas) fail("Saved transaction fee is below the current base fee. Wait for lower fees; this helper never replaces a signed payment.");
          // Retries broadcast these identical bytes, so they cannot create a second payment.
          const submittedHash = await rpc("eth_sendRawTransaction", [entry.rawTransaction]);
          if (submittedHash !== entry.hash) fail("Provider returned an unexpected submission hash. Reconcile the saved hash before continuing.");
          entry.state = "submitted"; await store.save(journal);
        }
      }
      if (attempt < 12) await wait(5000);
    }
    if (!confirmed) return { state: "pending", confirmedPayments: index, pendingTransaction: entry.hash,
      note: "Rerun the same command to reconcile this exact signed transaction. Never delete the journal or send a replacement payment." };
  }
  const finalHead = await head(rpc);
  assertEnrollment(await account(rpc, policy.enrollment, finalHead.blockTag));
  const balance = (await account(rpc, policy.deployer, finalHead.blockTag)).balance;
  // A completed rerun can happen after later collection operations spend the reserve.
  if (journal.state !== "complete" && balance < RESERVE) fail("All transfers confirmed but the deployer reserve changed. Reconcile other wallet activity.");
  journal.state = "complete"; await store.save(journal);
  return { state: "complete", chainId: 11155111, fundedWallets: policy.recipients.map((recipient, index) => ({ ...recipient, amountEth: "0.02", transactionHash: journal.entries[index].hash })),
    deployerBalanceEth: formatEther(balance), enrollmentBalanceEth: "0.0", note: "Five payments confirmed. Repeating this command only verifies the existing journal; it cannot create a second distribution." };
}

async function readPrivate(path, optional = false) {
  let file;
  try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) { if (optional && error?.code === "ENOENT") return null; throw error; }
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 131_072 || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) fail("Staging secret and journal files must be owned private regular files (chmod 600).");
    return await file.readFile("utf8");
  } finally { await file.close(); }
}

export async function fundingFileStore(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (!(await lstat(directory)).isDirectory()) fail("The funding journal directory must not be a symlink.");
  const journalPath = new URL("staging-wallet-funding.json", directory);
  return {
    async load() { const content = await readPrivate(journalPath, true); return content === null ? null : JSON.parse(content); },
    async save(value) {
      await readPrivate(journalPath, true); // Refuse replacing an unsafe existing file.
      const temporary = new URL(`.staging-wallet-funding-${randomUUID()}.tmp`, directory);
      const file = await open(temporary, "wx", 0o600);
      try { await file.writeFile(JSON.stringify(value, null, 2) + "\n"); await file.sync(); }
      finally { await file.close(); }
      await rename(temporary, journalPath);
      const folder = await open(directory, constants.O_RDONLY);
      try { await folder.sync(); } finally { await folder.close(); }
    },
  };
}

export async function withFundingLock(directory, task) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (!(await lstat(directory)).isDirectory()) fail("The funding lock directory must not be a symlink.");
  const path = new URL("staging-wallet-funding.lock", directory);
  let file;
  try { file = await open(path, "wx", 0o600); }
  catch (error) {
    if (error?.code === "EEXIST") fail("A funding lock already exists. Check the previous process and private journal before removing only a stale lock; never run concurrent writers.");
    throw error;
  }
  try { await file.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })); await file.sync(); return await task(); }
  finally { await file.close(); await unlink(path); }
}

export async function runStagingFunding(args = process.argv.slice(2)) {
  const options = parseFundingArguments(args);
  const env = parseEnv(await readPrivate(new URL(".env.staging.local", root)));
  const rpc = rpcClient(stagingProviderConfig(env).rpc.url);
  const manifest = JSON.parse(await readPrivate(new URL(".vercel/staging-wallet-addresses.json", root)));
  validateWalletManifest(manifest);
  if (!options.send) { console.log(JSON.stringify(await previewFunding({ rpc, fundingTx: options.fundingTx }), null, 2)); return; }
  const directory = new URL(".vercel/", root);
  const report = await withFundingLock(directory, async () => distributeFunding({ rpc, fundingTx: options.fundingTx, store: await fundingFileStore(directory),
    loadSigner: async () => {
      // Deliberately load only this key field, only after --send and verified funding.
      const content = await readPrivate(new URL(".env.staging.wallets.local", root));
      const lines = content.split(/\r?\n/).filter(line => /^DEPLOYER_PRIVATE_KEY\s*=/.test(line));
      if (lines.length !== 1) fail("The private wallet file must contain exactly one DEPLOYER_PRIVATE_KEY.");
      const key = parseEnv(lines[0]).DEPLOYER_PRIVATE_KEY;
      let signer;
      try { signer = new Wallet(key); } catch { fail("Invalid dedicated staging deployer key."); }
      if (getAddress(signer.address) !== FUNDING_POLICY.deployer) fail("The staging deployer key does not match its pinned address.");
      return signer;
    },
  }));
  console.log(JSON.stringify(report, null, 2));
  console.log(`Private reconciliation journal: ${fileURLToPath(new URL("staging-wallet-funding.json", directory))}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await runStagingFunding(); }
  catch (error) { console.error(fundingErrorMessage(error)); process.exitCode = 1; }
}
