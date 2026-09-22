import { constants } from "node:fs";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { Contract, Transaction, Wallet, getAddress } from "ethers";
import type { Provider, TransactionRequest } from "ethers";
import { ChainPendingError, createTransactionPipeline, transactionSpend, type ChainJournal } from "./chain-transactions.ts";

import { ensure } from "./store.ts";

const AAD = Buffer.from("tincta:sepolia-rehearsal-wallets:v1:11155111");
const WALLET_COUNT = 50;
export function assertSepolia(chainId: number) { if (chainId !== 11155111) throw new Error("Rehearsal wallets, funding and test mints are forbidden outside Sepolia."); }
function master(value: string) {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error("Wallet-vault master key must be an explicit 32-byte hexadecimal secret.");
  return Buffer.from(value, "hex");
}

/** An authenticated encrypted vault preserves the same 50 wallets across collections and season runs. Never return keys to an API/UI/log. */
export async function ensureSepoliaWallets(options: { chainId: number; path: string; masterKey: string; create?: boolean }): Promise<Wallet[]> {
  assertSepolia(options.chainId);
  const key = master(options.masterKey), file = resolve(options.path), directory = dirname(file);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = `${file}.lock`;
  let lock;
  try { lock = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); }
  catch { throw new Error("Wallet vault is locked; reconcile the previous worker before retrying."); }
  try {
    let existing: string | undefined;
    let handle;
    try { handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Cannot securely open wallet vault."); }
    if (handle) try {
      const stat = await handle.stat();
      if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size > 100_000 || (process.getuid && stat.uid !== process.getuid())) throw new Error("Wallet vault must be an owned private regular file (chmod 600).");
      existing = await handle.readFile("utf8");
    } finally { await handle.close(); }
    if (existing !== undefined) {
      try {
        const envelope = JSON.parse(existing);
        if (envelope.version !== 1 || envelope.chainId !== 11155111 || envelope.algorithm !== "aes-256-gcm") throw new Error();
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "hex"));
        decipher.setAAD(AAD); decipher.setAuthTag(Buffer.from(envelope.tag, "hex"));
        const data = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "hex")), decipher.final()]).toString("utf8"));
        if (data.chainId !== 11155111 || !Array.isArray(data.keys) || data.keys.length !== WALLET_COUNT) throw new Error();
        const wallets = data.keys.map((value: string) => new Wallet(value));
        if (new Set(wallets.map((wallet: Wallet) => wallet.address)).size !== WALLET_COUNT) throw new Error();
        return wallets;
      } catch { throw new Error("Wallet vault authentication or contents failed; preserve the vault and use its original master key."); }
    }
    if (!options.create) throw new Error("Wallet vault does not exist; explicitly create it for the first Sepolia rehearsal.");
    const wallets = Array.from({ length: WALLET_COUNT }, () => Wallet.createRandom());
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ chainId: 11155111, keys: wallets.map(wallet => wallet.privateKey) }), "utf8"), cipher.final()]);
    const temporary = `${file}.${randomUUID()}.tmp`, output = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try { await output.writeFile(JSON.stringify({ version: 1, chainId: 11155111, algorithm: "aes-256-gcm", iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex"), ciphertext: ciphertext.toString("hex") })); await output.sync(); }
    finally { await output.close(); }
    await rename(temporary, file);
    const parent = await open(directory, constants.O_RDONLY); try { await parent.sync(); } finally { await parent.close(); }
    return wallets.map(wallet => new Wallet(wallet.privateKey));
  } finally { key.fill(0); await lock.close(); await unlink(lockPath); }
}

export type SepoliaRehearsalState = {
  journals: Record<string, ChainJournal>;
  refunds: Record<string, number>;
  /** Immutable transfer intents survive a funding confirmation arriving between ticks. */
  funding: Record<string, { from: string; to: string; value: string }>;
};
export type SepoliaRehearsalOptions = {
  chainId: number; provider: Provider; operator: Wallet; wallets: Wallet[];
  /** Only explicitly supplied existing test wallets can donate; keys are never discovered from environment files. */
  donors?: Wallet[]; execute: boolean; state: SepoliaRehearsalState; saveState: (state: SepoliaRehearsalState) => Promise<void>;
  maxFeePerGasWei: string; maxTotalSpendWei: string; confirmations?: number; mintGasReserve?: string;
  /** Sepolia-only opt-in: return only this operator's released surplus/growth and unused VRF funding for the next collection. */
  recycleOperatorFunds?: boolean;
};
const abi = [
  "function CONTRACT_VERSION() view returns(string)", "function ALGORITHM_VERSION() view returns(string)", "function MAX_MINTS_PER_WALLET() view returns(uint256)",
  "function maxSupply() view returns(uint256)", "function totalMinted() view returns(uint256)", "function mintPrice() view returns(uint256)",
  "function mintedPerWallet(address) view returns(uint256)", "function saleActivated() view returns(bool)", "function mintDeadline() view returns(uint256)",
  "function revealed() view returns(bool)", "function refundsAvailable() view returns(bool)", "function awardCount() view returns(uint256)",
  "function winningTokenIds(uint256) view returns(uint256)", "function prizeClaimed(uint256) view returns(bool)", "function ownerOf(uint256) view returns(address)",
  "function mint(address,uint256) payable", "function claimPrizeForRank(uint256,address)", "function refund(uint256,address)",
  "function owner() view returns(address)", "function withdrawableBalance() view returns(uint256)", "function growthReserveBalance() view returns(uint256)",
  "function subscriptionClosed() view returns(bool)", "function withdraw(address,uint256)", "function withdrawGrowthReserve(address,uint256)", "function withdrawRandomnessFunding(address)",
  "error ERC721NonexistentToken(uint256 tokenId)",
];

/** Exactly one funding, mint, owned prize or owned refund write per call. Parent holds the profile-wide signer lock. */
export async function runSepoliaRehearsalStep(options: SepoliaRehearsalOptions, roundAddress: string) {
  assertSepolia(options.chainId);
  if ((await options.provider.getNetwork()).chainId !== 11155111n) throw new Error("Rehearsal RPC must be Sepolia.");
  if (options.wallets.length !== WALLET_COUNT || new Set(options.wallets.map(wallet => wallet.address)).size !== WALLET_COUNT) throw new Error("Rehearsal requires its persistent 50 unique wallets.");
  if (!/^[1-9]\d*$/.test(options.maxFeePerGasWei) || !/^[1-9]\d*$/.test(options.maxTotalSpendWei)) throw new Error("Explicit rehearsal gas and total-spending caps are required.");
  const confirmations = options.confirmations ?? 2, state = options.state;
  const signers = new Map([options.operator, ...options.wallets, ...(options.donors ?? [])].map(wallet => [wallet.address, wallet]));
  const limit = BigInt(options.maxTotalSpendWei), ceiling = BigInt(options.maxFeePerGasWei);
  const spent = () => Object.values(state.journals).reduce((sum, journal) => sum + journal.transactions.reduce((total, entry) => total + transactionSpend(entry), 0n), 0n);
  if (spent() > limit) throw new Error("Saved aggregate rehearsal spending exceeds this run's cap; reconcile before continuing.");
  async function send(signer: Wallet, action: string, request: TransactionRequest) {
    const address = signer.address;
    const journal = state.journals[address] ??= { version: 1, chainId: 11155111, from: address, maxFeePerGasWei: options.maxFeePerGasWei, maxTotalSpendWei: options.maxTotalSpendWei, transactions: [], collections: {} };
    if (journal.maxFeePerGasWei !== options.maxFeePerGasWei || journal.maxTotalSpendWei !== options.maxTotalSpendWei) throw new Error("Rehearsal spending policy differs from saved wallet journals.");
    const pipeline = createTransactionPipeline({ provider: options.provider, signer, execute: options.execute, journal, confirmations,
      save: async () => { if (spent() > limit) throw new Error("Aggregate rehearsal spending cap exceeded."); await options.saveState(state); } });
    return pipeline.send(action, request);
  }
  // Reconcile the exact signed pending transaction first even if its chain side effect is already visible.
  for (const journal of Object.values(state.journals)) {
    const pending = journal.transactions.find(entry => entry.state !== "confirmed");
    if (pending) {
      const signer = signers.get(getAddress(journal.from)); if (!signer) throw new Error("Pending rehearsal signer is missing from the explicitly configured wallets.");
      const transaction = Transaction.from(pending.rawTransaction);
      await send(signer, pending.action, { to: transaction.to, data: transaction.data, value: transaction.value });
      return { action: "reconciled", transactionHash: pending.hash };
    }
  }
  const head = await options.provider.getBlock("latest"), block = head && await options.provider.getBlock(head.number - confirmations + 1);
  if (!block?.hash) throw new Error("No confirmed rehearsal block.");
  const at = { blockTag: block.number }, round = new Contract(getAddress(roundAddress), abi, options.provider);
  const version = await round.CONTRACT_VERSION(at), algorithm = await round.ALGORITHM_VERSION(at);
  if (!((version === "affiliate-v9" && algorithm === "unique-rank-v5") || (version === "affiliate-v10" && algorithm === "unique-rank-v6")) || await round.MAX_MINTS_PER_WALLET(at) !== 20n) throw new Error("Rehearsal only supports actual capped V9/V10 rounds with their exact draw algorithm.");
  const [rawSupply, rawMinted, rawPrice, revealed, refundable] = await Promise.all([round.maxSupply(at), round.totalMinted(at), round.mintPrice(at), round.revealed(at), round.refundsAvailable(at)]);
  const supply = BigInt(rawSupply), minted = BigInt(rawMinted), price = BigInt(rawPrice);
  if (supply < 1n || supply > 1000n) throw new Error("The 50-wallet rehearsal supports collections of at most 1000 tickets.");
  async function canonical() { if ((await options.provider.getBlock(block!.number))?.hash !== block!.hash) throw new Error("Rehearsal snapshot reorganized; retry before writing."); }
  const walletByAddress = new Map(options.wallets.map(wallet => [wallet.address, wallet]));
  const gasReserve = BigInt(options.mintGasReserve ?? "2500000") * ceiling;
  async function fundIfNeeded(wallet: Wallet, required: bigint, intentKey: string) {
    const balance = await options.provider.getBalance(wallet.address, block!.number);
    if (balance >= required) return false;
    const missing = required - balance, key = `fund:${roundAddress.toLowerCase()}:${wallet.address}:${intentKey}`;
    let intent = state.funding[key];
    if (!intent) {
      // Explicit old test donors and prize-rich managed wallets can recycle existing Sepolia ETH. Retain each managed wallet's remaining mint allocation and gas.
      for (const donor of [options.operator, ...(options.donors ?? []), ...options.wallets]) {
        if (donor.address === wallet.address) continue;
        const available = await options.provider.getBalance(donor.address, block!.number);
        const donorMints = walletByAddress.has(donor.address) ? await round.mintedPerWallet(donor.address, at) : 20n;
        const retained = (donorMints < 20n ? (20n - donorMints) * price : 0n) + gasReserve;
        if (available < missing + retained) continue;
        intent = { from: donor.address, to: wallet.address, value: String(missing) }; state.funding[key] = intent;
        await options.saveState(state); break;
      }
    }
    if (!intent) throw new Error("Explicit Sepolia funding wallets cannot cover the next wallet's shortfall while preserving gas and remaining mints.");
    const donor = signers.get(intent.from); if (!donor) throw new Error("Saved funding donor is no longer configured.");
    await canonical(); await send(donor, key, { to: intent.to, value: BigInt(intent.value) }); return true;
  }
  if (revealed) {
    const count = Number(await round.awardCount(at));
    for (let rank = 1; rank <= count; rank++) {
      if (await round.prizeClaimed(rank, at)) continue;
      const token = await round.winningTokenIds(rank, at), holder = getAddress(await round.ownerOf(token, at)), wallet = walletByAddress.get(holder);
      if (!wallet) continue;
      if (await fundIfNeeded(wallet, gasReserve, `claim:${rank}`)) return { action: "fund-claim", wallet: holder };
      await canonical(); await send(wallet, `claim:${roundAddress.toLowerCase()}:${rank}`, await round.claimPrizeForRank.populateTransaction(rank, holder));
      return { action: "claim-prize", wallet: holder, rank };
    }
    if (options.recycleOperatorFunds) {
      if (getAddress(await round.owner(at)) !== options.operator.address) throw new Error("Only the collection's actual operator can recycle released Sepolia treasury funds.");
      for (const [getter, method] of [["withdrawableBalance", "withdraw"], ["growthReserveBalance", "withdrawGrowthReserve"]]) {
        const available = BigInt(await round[getter](at));
        if (available > 0n) {
          await canonical(); await send(options.operator, `recycle:${roundAddress.toLowerCase()}:${method}`, await round[method].populateTransaction(options.operator.address, available));
          return { action: "recycle-operator-funds", amountWei: String(available) };
        }
      }
      if (!await round.subscriptionClosed(at)) {
        await canonical(); await send(options.operator, `recycle:${roundAddress.toLowerCase()}:vrf`, await round.withdrawRandomnessFunding.populateTransaction(options.operator.address));
        return { action: "recycle-vrf" };
      }
    }
    return { action: "settled" };
  }
  if (refundable) {
    const key = roundAddress.toLowerCase(), start = state.refunds[key] ?? 1, end = Math.min(Number(minted), start + 19);
    for (let token = start; token <= end; token++) {
      let holder: string;
      try { holder = getAddress(await round.ownerOf(token, at)); }
      catch (error) {
        const data = (error as { data?: string }).data;
        if (data && round.interface.parseError(data)?.name === "ERC721NonexistentToken") { state.refunds[key] = token + 1; continue; }
        throw error;
      }
      const wallet = walletByAddress.get(holder);
      if (!wallet) { state.refunds[key] = token + 1; continue; }
      if (await fundIfNeeded(wallet, gasReserve, `refund:${token}`)) return { action: "fund-refund", wallet: holder };
      await canonical(); await send(wallet, `refund:${key}:${token}`, await round.refund.populateTransaction(token, holder));
      state.refunds[key] = token + 1; await options.saveState(state); return { action: "refund", wallet: holder, tokenId: token };
    }
    await options.saveState(state); return { action: end >= Number(minted) ? "refunded" : "scan-refunds" };
  }
  if (minted >= supply || !await round.saleActivated(at) || BigInt(block.timestamp) >= await round.mintDeadline(at)) return { action: "waiting" };
  for (const wallet of options.wallets) {
    const primaryMinted = BigInt(await round.mintedPerWallet(wallet.address, at));
    if (primaryMinted > 20n) throw new Error("V9/V10 wallet count violates the expected immutable cap.");
    const quantity = (supply - minted) < 20n - primaryMinted ? supply - minted : 20n - primaryMinted;
    if (quantity === 0n) continue;
    if (await fundIfNeeded(wallet, quantity * price + gasReserve, `mint:${primaryMinted}`)) return { action: "fund-mint", wallet: wallet.address };
    await canonical(); await send(wallet, `mint:${roundAddress.toLowerCase()}:${primaryMinted}`, await round.mint.populateTransaction(wallet.address, quantity, { value: quantity * price }));
    return { action: "mint", wallet: wallet.address, quantity: String(quantity) };
  }
  throw new Error("The persistent 50 wallets have exhausted their V9/V10 allowance before sellout; reconcile supply and prior mints.");
}

export { ChainPendingError };

/** Reuse only the explicitly named known test keys; never enumerate arbitrary secrets. */
export function donorWallets(env: NodeJS.ProcessEnv = process.env) {
  const names = (env.SEASON_RUNNER_SEPOLIA_DONOR_KEY_NAMES ?? "").split(",").map(value => value.trim()).filter(Boolean);
  ensure(names.length <= 20 && names.every(name => /^(BUYER_[A-Z0-9_]+|AFFILIATE_[A-Z0-9_]+|SEPOLIA_DONOR_[A-Z0-9_]+)_PRIVATE_KEY$/.test(name)), "invalid_explicit_sepolia_donor_key_names");
  const wallets = names.map(name => { ensure(/^0x[0-9a-f]{64}$/i.test(env[name] ?? ""), "configured_sepolia_donor_key_missing"); return new Wallet(env[name]!); });
  ensure(new Set(wallets.map(wallet => wallet.address)).size === wallets.length, "duplicate_sepolia_donors");
  return wallets;
}
