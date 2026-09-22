"use client";

import roundV10Abi from "@manekineko/contract-abi/round-v10" with { type: "json" };
import roundV9Abi from "@manekineko/contract-abi/round-v9" with { type: "json" };
import roundV8Abi from "@manekineko/contract-abi/round-v8" with { type: "json" };
import roundV7Abi from "@manekineko/contract-abi/round-v7" with { type: "json" };
import roundV6Abi from "@manekineko/contract-abi/round-v6" with { type: "json" };
import roundV5Abi from "@manekineko/contract-abi/round-v5" with { type: "json" };
import { BrowserProvider, Contract, getAddress, keccak256, type Eip1193Provider, type JsonRpcSigner, type TransactionReceipt, type TransactionRequest } from "ethers";
import roundV3Abi from "@manekineko/contract-abi/round-v3" with { type: "json" };
import roundV4Abi from "@manekineko/contract-abi/round-v4" with { type: "json" };

export interface WalletProvider extends Eip1193Provider {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}
export interface WalletSession { address: string; chainId: number; provider: BrowserProvider; injected: WalletProvider; signer: JsonRpcSigner }
export interface ContractTarget { chainId: number; contractAddress: string; winnerCount?: number; secondPrizeBps?: number; minAffiliateReferrals?: number; affiliatePayoutCapBps?: number; contractVersion?: "affiliate-v3" | "affiliate-v4" | "affiliate-v5" | "affiliate-v6" | "affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10"; mintPriceWei?: string; maxSupply?: number; maxAffiliateSlots?: number; runtimeCodeHash?: string; prizeBps?: number; affiliatePoolBps?: number | null; affiliateRatesBps?: readonly number[]; affiliateId?: number; commissionBps?: number }
export interface TransactionJournal { action: "enroll" | "claim" | "mint" | "prize"; wallet: string; chainId: number; contractAddress: string; hash: string | null; startedAt: string; data: string; valueWei: string; nonce: number }

const invalidatedWallets = new WeakSet<WalletSession>();
const selectedWalletAccounts = new WeakMap<WalletSession, readonly string[]>();

export function invalidateWallet(session: WalletSession): void {
  invalidatedWallets.add(session);
}

export function injectedWallet(): WalletProvider {
  const provider = (window as Window & { ethereum?: WalletProvider }).ethereum;
  if (!provider?.request) throw new Error("Open this page in a wallet browser or install an Ethereum wallet to continue.");
  return provider;
}

function canonicalAccounts(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((account) => typeof account !== "string")) throw new Error("The wallet returned an invalid account list. Open your wallet and try connecting again.");
  return [...new Set(value.map((account: string) => getAddress(account)))];
}

export async function requestWalletAccounts(injected: WalletProvider, options: { selectAccount?: boolean } = {}): Promise<string[]> {
  if (options.selectAccount) {
    try {
      // Requesting accounts alone reuses the site's existing wallet permission.
      await injected.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
    } catch (error) {
      const code = (error as { code?: string | number } | null)?.code;
      if (code === 4200 || code === -32601) {
        throw new Error("This wallet cannot open an account selector from the page. Change the account connected to this site in your wallet’s connected-site settings, then connect again.", { cause: error });
      }
      throw error;
    }
  }
  let accounts = canonicalAccounts(await injected.request({ method: "eth_accounts" }));
  if (!accounts.length) {
    await injected.request({ method: "eth_requestAccounts" });
    accounts = canonicalAccounts(await injected.request({ method: "eth_accounts" }));
  }
  if (!accounts.length) throw new Error("No wallet account is connected.");
  return accounts;
}

export async function connectWallet(chainId: number, options: { injected?: WalletProvider; address?: string; selectAccount?: boolean } = {}): Promise<WalletSession> {
  if (chainId !== 1 && chainId !== 11155111) throw new Error("This collection is not configured for a supported Ethereum network.");
  const injected = options.injected ?? injectedWallet();
  const selectedAddress = options.address === undefined ? undefined : getAddress(options.address);
  const available = selectedAddress === undefined
    ? await requestWalletAccounts(injected, { selectAccount: options.selectAccount })
    : canonicalAccounts(await injected.request({ method: "eth_accounts" }));
  if (selectedAddress !== undefined && !available.includes(selectedAddress)) throw new Error("This account is not connected to this site. Authorize it in your wallet, then select it again.");
  const actualChain = Number(BigInt(String(await injected.request({ method: "eth_chainId" }))));
  if (actualChain !== chainId) await injected.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${chainId.toString(16)}` }] });
  const accounts = canonicalAccounts(await injected.request({ method: "eth_accounts" }));
  if (!accounts[0]) throw new Error("No wallet account is connected.");
  const address = selectedAddress ?? accounts[0];
  if (!accounts.includes(address)) throw new Error("This account is no longer connected to this site. Authorize it in your wallet, then select it again.");
  const provider = new BrowserProvider(injected, "any");
  try {
    const session = { address, chainId, provider, injected, signer: await provider.getSigner(address) };
    if (selectedAddress !== undefined) selectedWalletAccounts.set(session, accounts);
    await assertWallet(session);
    return session;
  } catch (error) {
    provider.destroy();
    throw error;
  }
}

export async function assertWallet(session: WalletSession): Promise<void> {
  const changed = () => new Error("The selected wallet changed. Reconnect before continuing.");
  if (invalidatedWallets.has(session)) throw changed();
  const [accountResponse, chain] = await Promise.all([
    session.injected.request({ method: "eth_accounts" }),
    session.injected.request({ method: "eth_chainId" }),
  ]);
  if (invalidatedWallets.has(session)) throw changed();
  const accounts = canonicalAccounts(accountResponse);
  const selectedAccounts = selectedWalletAccounts.get(session);
  const sameAccounts = selectedAccounts
    ? accounts.includes(session.address) && accounts.length === selectedAccounts.length && accounts.every((account, index) => account === selectedAccounts[index])
    : accounts[0] === session.address;
  if (!sameAccounts) throw changed();
  if (Number(BigInt(String(chain))) !== session.chainId) throw new Error("The wallet network changed. Reconnect to the collection’s Ethereum network.");
}

/** Check the currently connected wallet RPC, independently of the app API. */
export async function verifiedRound(session: WalletSession, target: ContractTarget): Promise<Contract> {
  await assertWallet(session);
  if (session.chainId !== target.chainId) throw new Error("The wallet and collection networks do not match.");
  const code = await session.provider.getCode(getAddress(target.contractAddress));
  if (code === "0x") throw new Error("No collection contract exists at the expected address.");
  if (target.runtimeCodeHash && keccak256(code).toLowerCase() !== target.runtimeCodeHash.toLowerCase()) throw new Error("The collection bytecode does not match the verified deployment.");
  const contract = new Contract(target.contractAddress, target.contractVersion === "affiliate-v10" ? roundV10Abi : target.contractVersion === "affiliate-v9" ? roundV9Abi : target.contractVersion === "affiliate-v8" ? roundV8Abi : target.contractVersion === "affiliate-v7" ? roundV7Abi : target.contractVersion === "affiliate-v6" ? roundV6Abi : target.contractVersion === "affiliate-v5" ? roundV5Abi : target.contractVersion === "affiliate-v4" ? roundV4Abi : roundV3Abi, session.signer);
  await verifyRoundTerms(contract, target);
  await assertWallet(session);
  return contract;
}

/** Verify the complete frozen schedule and any position the user is authorizing. */
export async function verifyRoundTerms(contract: Contract, target: ContractTarget): Promise<void> {
  const expectedVersion = target.contractVersion ?? "affiliate-v3";
  const [version, price, supply, slots] = await Promise.all([
    contract.CONTRACT_VERSION(), contract.mintPrice(), contract.maxSupply(), contract.maxAffiliateSlots(),
  ]);
  const mismatch = () => new Error("The collection terms do not match this page. Refresh and review the terms before continuing.");
  if (version !== expectedVersion || (target.mintPriceWei !== undefined && price !== BigInt(target.mintPriceWei)) || (target.maxSupply !== undefined && supply !== BigInt(target.maxSupply)) || (target.maxAffiliateSlots !== undefined && slots !== BigInt(target.maxAffiliateSlots))) throw mismatch();
  if ((expectedVersion === "affiliate-v9" || expectedVersion === "affiliate-v10") && await contract.MAX_MINTS_PER_WALLET() !== 20n) throw mismatch();
  if (expectedVersion === "affiliate-v3") {
    const [rate, prize] = await Promise.all([contract.AFFILIATE_BPS(), contract.PRIZE_BPS()]);
    if (rate !== 100n || prize !== 5000n || (target.prizeBps !== undefined && prize !== BigInt(target.prizeBps)) || target.affiliateRatesBps?.some((value) => BigInt(value) !== rate) || (target.commissionBps !== undefined && rate !== BigInt(target.commissionBps))) throw mismatch();
    return;
  }
  if (expectedVersion === "affiliate-v5" || (expectedVersion === "affiliate-v6" || expectedVersion === "affiliate-v7" || (expectedVersion === "affiliate-v8" || expectedVersion === "affiliate-v9" || expectedVersion === "affiliate-v10"))) {
    if ((expectedVersion === "affiliate-v6" || expectedVersion === "affiliate-v7" || (expectedVersion === "affiliate-v8" || expectedVersion === "affiliate-v9" || expectedVersion === "affiliate-v10")) && await contract.ALGORITHM_VERSION() !== (expectedVersion === "affiliate-v10" ? "unique-rank-v6" : (expectedVersion === "affiliate-v8" || expectedVersion === "affiliate-v9") ? "unique-rank-v5" : expectedVersion === "affiliate-v7" ? "unique-rank-v4" : "unique-rank-v3")) throw mismatch();
    if (expectedVersion === "affiliate-v7" || (expectedVersion === "affiliate-v8" || expectedVersion === "affiliate-v9" || expectedVersion === "affiliate-v10")) {
      for (const field of [(expectedVersion === "affiliate-v8" || expectedVersion === "affiliate-v9" || expectedVersion === "affiliate-v10") ? "winnerCount" : "secondPrizeBps", "minAffiliateReferrals", "affiliatePayoutCapBps"] as const) {
        if (target[field] !== undefined && await contract[field]() !== BigInt(target[field]!)) throw mismatch();
      }
    }
    const [pool, prize] = await Promise.all([contract.affiliatePoolBps(), contract.prizeBps()]);
    if (!Number.isSafeInteger(target.affiliatePoolBps) || target.affiliatePoolBps! < 0 || !Number.isSafeInteger(target.prizeBps) || target.prizeBps! < 0 || target.affiliatePoolBps! + target.prizeBps! > 10_000
      || pool !== BigInt(target.affiliatePoolBps!) || prize !== BigInt(target.prizeBps!) || !target.affiliateRatesBps || target.affiliateRatesBps.length !== 0 || price % 10_000n !== 0n) throw mismatch();
    if (target.affiliateId !== undefined && (!Number.isSafeInteger(target.affiliateId) || target.affiliateId < 1 || BigInt(target.affiliateId) > slots || target.commissionBps !== target.affiliatePoolBps)) throw mismatch();
    return;
  }
  const rates = target.affiliateRatesBps;
  if (target.prizeBps === undefined || !Number.isSafeInteger(target.prizeBps) || target.prizeBps < 0 || target.prizeBps > 10_000 || !rates || BigInt(rates.length) !== slots || rates.some((rate) => !Number.isSafeInteger(rate) || rate < 0 || rate + target.prizeBps! > 10_000)) throw mismatch();
  const [prize, ...onChainRates] = await Promise.all([contract.prizeBps(), ...rates.map((_, index) => contract.affiliateRateBps(index + 1))]);
  if (prize !== BigInt(target.prizeBps) || onChainRates.some((rate, index) => rate !== BigInt(rates[index]!)) || price % 10_000n !== 0n) throw mismatch();
  if (target.affiliateId !== undefined && (!Number.isSafeInteger(target.affiliateId) || target.affiliateId < 1 || target.affiliateId > rates.length || target.commissionBps === undefined || rates[target.affiliateId - 1] !== target.commissionBps)) throw mismatch();
}

export function transactionKey(target: ContractTarget, action: TransactionJournal["action"]): string {
  return `manekineko:affiliate:v3:${target.chainId}:${target.contractAddress.toLowerCase()}:${action}`;
}
export function readTransaction(target: ContractTarget, action: TransactionJournal["action"]): TransactionJournal | null {
  const raw = sessionStorage.getItem(transactionKey(target, action));
  if (!raw) return null;
  const item = JSON.parse(raw) as TransactionJournal;
  if (item.action !== action || item.chainId !== target.chainId || item.contractAddress.toLowerCase() !== target.contractAddress.toLowerCase() || !/^0x[0-9a-f]{40}$/i.test(item.wallet) || (item.hash !== null && !/^0x[0-9a-f]{64}$/i.test(item.hash))) throw new Error("The saved transaction record could not be read. Check your wallet activity before sending another transaction.");
  if (typeof item.data !== "string" || !/^0x(?:[0-9a-f]{2})*$/i.test(item.data) || typeof item.valueWei !== "string" || !/^(0|[1-9][0-9]*)$/.test(item.valueWei) || !Number.isSafeInteger(item.nonce) || item.nonce < 0) throw new Error("This older transaction record has no verifiable payment intent. Review it in your wallet before continuing; automatic recovery is unavailable.");
  return item;
}

/** Save intent before the wallet prompt. Unknown submission outcomes never retry automatically. */
export async function submitTransaction(session: WalletSession, target: ContractTarget, action: TransactionJournal["action"], request: TransactionRequest, onJournal: (record: TransactionJournal) => void): Promise<TransactionReceipt> {
  if (readTransaction(target, action)) throw new Error("A previous transaction needs to be checked before another can be sent.");
  await assertWallet(session);
  const to = await request.to;
  if (typeof to !== "string" || getAddress(to) !== getAddress(target.contractAddress)) throw new Error("The transaction destination does not match the collection.");
  const data = request.data ?? "0x";
  const valueWei = BigInt(request.value ?? 0).toString();
  const nonce = request.nonce ?? await session.signer.getNonce("pending");
  const gasLimit = await session.signer.estimateGas({ ...request, from: session.address });
  await assertWallet(session);
  const record: TransactionJournal = { action, wallet: session.address, chainId: target.chainId, contractAddress: target.contractAddress, hash: null, startedAt: new Date().toISOString(), data, valueWei, nonce };
  // Unavailable storage is a hard stop before a financial action, not after it.
  sessionStorage.setItem(transactionKey(target, action), JSON.stringify(record));
  onJournal(record);
  try {
    const tx = await session.signer.sendTransaction({ ...request, gasLimit, nonce, from: session.address, chainId: target.chainId });
    record.hash = tx.hash;
    sessionStorage.setItem(transactionKey(target, action), JSON.stringify(record));
    onJournal({ ...record });
    const receipt = await tx.wait(1, 120_000);
    if (!receipt) throw new Error("Your transaction is still pending. Check its receipt; do not submit it again.");
    sessionStorage.removeItem(transactionKey(target, action));
    if (receipt.status !== 1) throw new Error("The transaction reverted. No action was completed.");
    return receipt;
  } catch (error) {
    const code = (error as { code?: string | number }).code;
    if (code === "TRANSACTION_REPLACED") {
      const replacement = error as { cancelled?: boolean; receipt?: TransactionReceipt };
      if (replacement.receipt) {
        sessionStorage.removeItem(transactionKey(target, action));
        if (replacement.cancelled) throw new Error("Your wallet replaced or cancelled the transaction. Check its activity; the original action was not confirmed.");
        if (replacement.receipt.status !== 1) throw new Error("The replacement transaction reverted. No action was completed.");
        return replacement.receipt;
      }
    }
    if (record.hash === null && (code === "ACTION_REJECTED" || code === 4001)) sessionStorage.removeItem(transactionKey(target, action));
    throw error;
  }
}

export async function checkTransaction(session: WalletSession, target: ContractTarget, record: TransactionJournal): Promise<"pending" | "confirmed" | "reverted" | "unknown"> {
  await assertWallet(session);
  if (session.address.toLowerCase() !== record.wallet.toLowerCase()) throw new Error("Connect the wallet that submitted this transaction.");
  if (!record.hash) return "unknown";
  const receipt = await session.provider.getTransactionReceipt(record.hash);
  if (!receipt) return "pending";
  sessionStorage.removeItem(transactionKey(target, record.action));
  return receipt.status === 1 ? "confirmed" : "reverted";
}


/** A recovery hash must identify this exact wallet intent, including its nonce. */
export async function recoverTransaction(session: WalletSession, target: ContractTarget, record: TransactionJournal, hash: string, onJournal: (record: TransactionJournal) => void): Promise<"pending" | "confirmed" | "reverted"> {
  if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error("Enter the full transaction hash from your wallet activity.");
  await assertWallet(session);
  if (session.address.toLowerCase() !== record.wallet.toLowerCase() || record.chainId !== target.chainId || record.contractAddress.toLowerCase() !== target.contractAddress.toLowerCase()) throw new Error("Connect the wallet and network used for the original transaction.");
  const tx = await session.provider.getTransaction(hash);
  if (!tx) throw new Error("That transaction is not available on this network yet. Check the hash and try again.");
  if (tx.from.toLowerCase() !== record.wallet.toLowerCase() || tx.to?.toLowerCase() !== target.contractAddress.toLowerCase() || tx.chainId !== BigInt(record.chainId) || tx.data.toLowerCase() !== record.data.toLowerCase() || tx.value !== BigInt(record.valueWei) || tx.nonce !== record.nonce) throw new Error("That hash does not match this wallet’s original collection transaction. Its recipient, action, amount, network and nonce must all match.");
  const recovered = { ...record, hash: tx.hash };
  sessionStorage.setItem(transactionKey(target, record.action), JSON.stringify(recovered));
  onJournal(recovered);
  const status = await checkTransaction(session, target, recovered);
  if (status === "unknown") throw new Error("The transaction could not be checked.");
  return status;
}

export function walletError(error: unknown): string {
  const detail = error as { code?: string | number; message?: unknown } | null;
  const code = detail?.code;
  if (code === "ACTION_REJECTED" || code === 4001) return "The wallet request was declined. Nothing else will be sent automatically.";
  if (code === -32002) return "A wallet request is already waiting. Open your wallet and complete or cancel it before trying again.";
  if (code === 4100) return "This site no longer has permission to use that account. Connect your wallet and authorize the account again.";
  if (code === "INSUFFICIENT_FUNDS") return "Your wallet needs enough ETH for the payment and network fee.";
  if (typeof detail?.message === "string" && detail.message.trim() && detail.message.length <= 300) return detail.message;
  return "The request could not be completed. Check your wallet activity before trying again.";
}

export function shortWallet(address: string): string { return `${address.slice(0, 6)}…${address.slice(-4)}`; }

export interface ReferralQuery { affiliate?: string | string[]; collection?: string | string[] }
export function parseReferralQuery(query: ReferralQuery, allowDemo = false): { affiliate: number; collection: string } | null {
  if (query.affiliate === undefined && query.collection === undefined) return null;
  if (typeof query.affiliate !== "string" || typeof query.collection !== "string") throw new Error("This referral link is incomplete or contains duplicate parameters. Ask the affiliate for their original link.");
  if (allowDemo && query.collection === "demo" && /^[1-9][0-9]{0,5}$/.test(query.affiliate)) return { affiliate: Number(query.affiliate), collection: "demo" };
  if (!/^[1-9][0-9]{0,5}$/.test(query.affiliate) || !/^0x[0-9a-f]{40}$/i.test(query.collection) || /^0x0{40}$/i.test(query.collection)) throw new Error("This referral link has an invalid affiliate position or collection address.");
  return { affiliate: Number(query.affiliate), collection: getAddress(query.collection) };
}
