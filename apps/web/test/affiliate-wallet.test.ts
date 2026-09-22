import test from "node:test";
import assert from "node:assert/strict";
import { assertWallet, checkTransaction, connectWallet, invalidateWallet, parseReferralQuery, readTransaction, recoverTransaction, requestWalletAccounts, submitTransaction, transactionKey, type ContractTarget, type TransactionJournal, type WalletProvider, type WalletSession, verifyRoundTerms, walletError } from "../lib/affiliates/wallet.ts";

import type { Contract } from "ethers";
import { formatBasisPoints } from "../components/affiliates/program-terms.ts";
import { createWalletViewScope } from "../components/affiliates/wallet-view.ts";

const address = "0x1111111111111111111111111111111111111111";
const target: ContractTarget = { chainId: 1, contractAddress: "0x2222222222222222222222222222222222222222" };
const hash = `0x${"a".repeat(64)}`;
const request = { to: target.contractAddress, data: "0x1234", value: 123n };
function storage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  return values;
}
function session(send: () => Promise<unknown>, chain = "0x1", selected = address): WalletSession {
  return { address, chainId: 1, injected: { request: async ({ method }: { method: string }) => method === "eth_chainId" ? chain : [selected] }, signer: { sendTransaction: send, getNonce: async () => 4, estimateGas: async () => 21000n }, provider: { getTransactionReceipt: async () => null } } as unknown as WalletSession;
}

async function withInjectedWallet(injected: WalletProvider, run: () => Promise<void>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { ethereum: injected } });
  try { await run(); }
  finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

test("switching account requests fresh wallet permission before reading the selected account", async () => {
  const calls: string[] = [];
  let selected = address;
  const injected: WalletProvider = { request: async ({ method, params }) => {
    calls.push(method);
    if (method === "wallet_requestPermissions") {
      assert.deepEqual(params, [{ eth_accounts: {} }]);
      selected = target.contractAddress;
      return [{ parentCapability: "eth_accounts" }];
    }
    if (method === "eth_chainId") return "0x1";
    if (method === "eth_accounts" || method === "eth_requestAccounts") return [selected];
    throw new Error(`Unexpected method: ${method}`);
  } };
  await withInjectedWallet(injected, async () => {
    const connected = await connectWallet(1, { selectAccount: true });
    try {
      assert.equal(connected.address, target.contractAddress);
      assert.equal(await connected.signer.getAddress(), target.contractAddress);
      assert.deepEqual(calls.slice(0, 2), ["wallet_requestPermissions", "eth_accounts"]);
      assert.equal(calls.includes("eth_requestAccounts"), false);
      await assertWallet(connected);
      selected = address;
      await assert.rejects(assertWallet(connected), /wallet changed/);
    } finally { connected.provider.destroy(); }
  });
});

test("a canceled account switch preserves rejection and never reconnects the previous wallet", async () => {
  const declined = Object.assign(new Error("Declined"), { code: 4001 });
  const calls: string[] = [];
  await withInjectedWallet({ request: async ({ method }) => {
    calls.push(method);
    if (method === "wallet_requestPermissions") throw declined;
    return [address];
  } }, async () => {
    await assert.rejects(connectWallet(1, { selectAccount: true }), (error) => error === declined);
  });
  assert.deepEqual(calls, ["wallet_requestPermissions"]);
});

test("wallets without permission selection receive connected-site guidance without fallback", async () => {
  for (const code of [4200, -32601]) {
    const calls: string[] = [];
    await withInjectedWallet({ request: async ({ method }) => {
      calls.push(method);
      throw Object.assign(new Error("Unsupported method"), { code });
    } }, async () => {
      await assert.rejects(connectWallet(1, { selectAccount: true }), /connected-site settings/);
    });
    assert.deepEqual(calls, ["wallet_requestPermissions"]);
  }
});

test("authorized accounts can be listed while a wallet permission prompt is already pending", async () => {
  const calls: string[] = [];
  const accounts = await requestWalletAccounts({ request: async ({ method }) => {
    calls.push(method);
    if (method === "eth_accounts") return [address, target.contractAddress, address];
    throw { code: -32002, message: "Request already pending" };
  } });
  assert.deepEqual(accounts, [address, target.contractAddress]);
  assert.deepEqual(calls, ["eth_accounts"]);
});

test("an empty account list requests access once and then reads current authorization", async () => {
  const calls: string[] = [];
  let authorized = false;
  const accounts = await requestWalletAccounts({ request: async ({ method }) => {
    calls.push(method);
    if (method === "eth_accounts") return authorized ? [address] : [];
    if (method === "eth_requestAccounts") { authorized = true; return [target.contractAddress]; }
    throw new Error(`Unexpected method: ${method}`);
  } });
  assert.deepEqual(accounts, [address]);
  assert.deepEqual(calls, ["eth_accounts", "eth_requestAccounts", "eth_accounts"]);
});

test("an explicitly selected authorized account signs and sends as that account even when listed second", async () => {
  storage();
  const calls: string[] = [];
  const injected: WalletProvider = { request: async ({ method, params }) => {
    calls.push(method);
    if (method === "eth_accounts") return [address, target.contractAddress, "0x3333333333333333333333333333333333333333"];
    if (method === "eth_chainId") return "0x1";
    if (method === "eth_signTypedData_v4") {
      assert.equal((params as string[])[0], target.contractAddress);
      return `0x${"11".repeat(65)}`;
    }
    throw new Error(`Unexpected method: ${method}`);
  } };
  const connected = await connectWallet(1, { injected, address: target.contractAddress });
  try {
    assert.equal(connected.address, target.contractAddress);
    assert.equal(await connected.signer.getAddress(), target.contractAddress);
    await assertWallet(connected);
    await connected.signer.signTypedData({ chainId: 1 }, { Enrollment: [{ name: "nonce", type: "uint256" }] }, { nonce: 1 });
    connected.signer.getNonce = async () => 4;
    connected.signer.estimateGas = async (transaction) => { assert.equal(transaction.from, target.contractAddress); return 21_000n; };
    connected.signer.sendTransaction = async (transaction) => {
      assert.equal(transaction.from, target.contractAddress);
      assert.equal(transaction.chainId, 1);
      return { hash, wait: async () => ({ status: 1 }) } as Awaited<ReturnType<typeof connected.signer.sendTransaction>>;
    };
    await submitTransaction(connected, target, "enroll", request, (record) => assert.equal(record.wallet, target.contractAddress));
    assert.equal(calls.includes("wallet_requestPermissions"), false);
    assert.equal(calls.includes("eth_requestAccounts"), false);
    assert.equal(readTransaction(target, "enroll"), null);
  } finally { connected.provider.destroy(); }
});

test("an unauthorized explicit account fails before requesting permissions or constructing a signer", async () => {
  const calls: string[] = [];
  await assert.rejects(connectWallet(1, { address: target.contractAddress, injected: { request: async ({ method }) => {
    calls.push(method);
    if (method === "eth_accounts") return [address];
    throw new Error(`Unexpected method: ${method}`);
  } } }), /not connected to this site/);
  assert.deepEqual(calls, ["eth_accounts"]);
});

test("explicit account sessions reject revoked, added, or reordered account exposure", async () => {
  const original = [address, target.contractAddress, "0x3333333333333333333333333333333333333333"];
  let accounts = original;
  const connected = await connectWallet(1, { address: target.contractAddress, injected: { request: async ({ method }) => {
    if (method === "eth_accounts") return accounts;
    if (method === "eth_chainId") return "0x1";
    throw new Error(`Unexpected method: ${method}`);
  } } });
  try {
    for (const changed of [original.slice(0, 1), original.slice(0, 2), [original[1]!, original[0]!, original[2]!], [...original, "0x4444444444444444444444444444444444444444"]]) {
      accounts = changed;
      await assert.rejects(assertWallet(connected), /wallet changed/);
    }
    accounts = original;
    await assertWallet(connected);
    invalidateWallet(connected);
    await assert.rejects(assertWallet(connected), /wallet changed/);
  } finally { connected.provider.destroy(); }
});

test("plain wallet RPC errors explain pending requests, revoked permissions, and provider messages", () => {
  assert.match(walletError({ code: -32002, message: "Request already pending" }), /already waiting/);
  assert.match(walletError({ code: 4100, message: "Unauthorized" }), /no longer has permission/);
  assert.match(walletError({ code: 4001, message: "Declined" }), /declined/);
  assert.equal(walletError({ code: -32000, message: "Open the wallet to unlock this account." }), "Open the wallet to unlock this account.");
  assert.match(walletError({ message: "x".repeat(301) }), /could not be completed/);
});

test("ordinary connection reuses authorization and verifies the requested network after switching", async () => {
  const calls: string[] = [];
  let chain = "0x1";
  await withInjectedWallet({ request: async ({ method, params }) => {
    calls.push(method);
    if (method === "wallet_switchEthereumChain") {
      assert.deepEqual(params, [{ chainId: "0xaa36a7" }]);
      chain = "0xaa36a7";
      return null;
    }
    if (method === "eth_chainId") return chain;
    if (method === "eth_accounts" || method === "eth_requestAccounts") return [address];
    throw new Error(`Unexpected method: ${method}`);
  } }, async () => {
    const connected = await connectWallet(11155111);
    try {
      assert.equal(connected.address, address);
      assert.equal(connected.chainId, 11155111);
      assert.equal(calls.includes("wallet_requestPermissions"), false);
      assert.equal(calls.includes("wallet_switchEthereumChain"), true);
      chain = "0x1";
      await assert.rejects(assertWallet(connected), /network changed/);
    } finally { connected.provider.destroy(); }
  });
});

test("connection rejects a wallet that acknowledges a network switch without changing networks", async () => {
  await withInjectedWallet({ request: async ({ method }) => {
    if (method === "eth_chainId") return "0x1";
    if (method === "wallet_switchEthereumChain") return null;
    if (method === "eth_accounts" || method === "eth_requestAccounts") return [address];
    throw new Error(`Unexpected method: ${method}`);
  } }, async () => {
    await assert.rejects(connectWallet(11155111), /network changed/);
  });
});

test("invalidated wallet sessions stay unusable even if the original account is selected again", async () => {
  let reads = 0;
  const wallet = session(async () => {});
  wallet.injected.request = async () => { reads++; return [address]; };
  invalidateWallet(wallet);
  await assert.rejects(assertWallet(wallet), /wallet changed/);
  assert.equal(reads, 0);
});

test("invalidating during an account check prevents its stale response from authorizing a send", async () => {
  const values = storage();
  const saved = { action: "mint", wallet: address, chainId: 1, contractAddress: target.contractAddress, hash, startedAt: new Date().toISOString(), data: request.data, valueWei: "123", nonce: 4 } satisfies TransactionJournal;
  values.set(transactionKey(target, "mint"), JSON.stringify(saved));
  let resolveAccounts!: (accounts: string[]) => void;
  const wallet = session(async () => {});
  wallet.injected.request = async ({ method }) => method === "eth_chainId" ? "0x1" : new Promise<string[]>((resolve) => { resolveAccounts = resolve; });
  const pendingCheck = assertWallet(wallet);
  invalidateWallet(wallet);
  resolveAccounts([address]);
  await assert.rejects(pendingCheck, /wallet changed/);
  assert.deepEqual(readTransaction(target, "mint"), saved);
});

test("referral parsing accepts only a complete single position and collection", () => {
  assert.equal(parseReferralQuery({}), null);
  assert.deepEqual(parseReferralQuery({ affiliate: "7", collection: target.contractAddress }), { affiliate: 7, collection: target.contractAddress });
  for (const query of [{ affiliate: "7" }, { collection: target.contractAddress }, { affiliate: ["7", "8"], collection: target.contractAddress }, { affiliate: "7", collection: [target.contractAddress, address] }, { affiliate: "0", collection: target.contractAddress }, { affiliate: "1e2", collection: target.contractAddress }, { affiliate: "7", collection: "0x0000000000000000000000000000000000000000" }]) assert.throws(() => parseReferralQuery(query));
});

test("wallet or network changes fail before a transaction can be signed", async () => {
  storage(); let sends = 0;
  const send = async () => { sends++; };
  await assert.rejects(submitTransaction(session(send, "0xaa36a7"), target, "mint", request, () => {}), /network changed/);
  await assert.rejects(assertWallet(session(send, "0x1", target.contractAddress)), /wallet changed/);
  assert.equal(sends, 0); assert.equal(readTransaction(target, "mint"), null);
});

test("wallet rejection clears intent while ambiguous submission remains locked", async () => {
  storage();
  await assert.rejects(submitTransaction(session(async () => { throw Object.assign(new Error("Declined"), { code: 4001 }); }), target, "enroll", request, () => {}));
  assert.equal(readTransaction(target, "enroll"), null);
  await assert.rejects(submitTransaction(session(async () => { throw new Error("RPC response lost"); }), target, "mint", request, () => {}));
  assert.equal(readTransaction(target, "mint")?.hash, null);
  let duplicate = false;
  await assert.rejects(submitTransaction(session(async () => { duplicate = true; }), target, "mint", request, () => {}), /previous transaction/);
  assert.equal(duplicate, false);
});

test("known pending hash survives response failure and can be reconciled", async () => {
  storage(); const records: TransactionJournal[] = [];
  const wallet = session(async () => ({ hash, wait: async () => { throw new Error("receipt timeout"); } }));
  await assert.rejects(submitTransaction(wallet, target, "claim", request, (item) => records.push({ ...item })));
  const saved = readTransaction(target, "claim")!;
  assert.equal(saved.hash, hash); assert.equal(records[0]?.hash, null); assert.equal(records[1]?.hash, hash);
  assert.equal(await checkTransaction(wallet, target, saved), "pending");
  (wallet.provider.getTransactionReceipt as unknown) = async () => ({ status: 1 });
  assert.equal(await checkTransaction(wallet, target, saved), "confirmed"); assert.equal(readTransaction(target, "claim"), null);
});

test("successful payment clears journal; storage failure prevents submission", async () => {
  storage();
  await submitTransaction(session(async () => ({ hash, wait: async () => ({ status: 1 }) })), target, "mint", request, () => {});
  assert.equal(readTransaction(target, "mint"), null);
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: () => null, setItem: () => { throw new Error("Storage unavailable"); } } });
  let sent = false;
  await assert.rejects(submitTransaction(session(async () => { sent = true; }), target, "mint", request, () => {}), /Storage unavailable/);
  assert.equal(sent, false);
});

test("a stale or corrupted transaction record is never silently discarded", () => {
  const values = storage();
  values.set(transactionKey(target, "mint"), JSON.stringify({ action: "claim", chainId: 1, contractAddress: target.contractAddress, wallet: address, hash }));
  assert.throws(() => readTransaction(target, "mint"), /could not be read/);
});

test("wallet speedups and cancellations reconcile the original intent", async () => {
  storage();
  const repriced = session(async () => ({ hash, wait: async () => { throw Object.assign(new Error("Repriced"), { code: "TRANSACTION_REPLACED", cancelled: false, receipt: { status: 1 } }); } }));
  await submitTransaction(repriced, target, "mint", request, () => {});
  assert.equal(readTransaction(target, "mint"), null);
  const cancelled = session(async () => ({ hash, wait: async () => { throw Object.assign(new Error("Cancelled"), { code: "TRANSACTION_REPLACED", cancelled: true, receipt: { status: 1 } }); } }));
  await assert.rejects(submitTransaction(cancelled, target, "mint", request, () => {}), /replaced or cancelled/);
  assert.equal(readTransaction(target, "mint"), null);
});


test("undeployed demo referrals are explicitly allowed only in demo mode", () => {
  const query = { affiliate: "3", collection: "demo" };
  assert.deepEqual(parseReferralQuery(query, true), { affiliate: 3, collection: "demo" });
  assert.throws(() => parseReferralQuery(query));
  assert.throws(() => parseReferralQuery(query, false));
  assert.throws(() => parseReferralQuery({ affiliate: ["3", "4"], collection: "demo" }, true));
});


test("manual recovery rejects unrelated transactions and accepts only the recorded intent", async () => {
  storage();
  const wallet = session(async () => { throw new Error("wallet response lost"); });
  await assert.rejects(submitTransaction(wallet, target, "mint", request, () => {}));
  const record = readTransaction(target, "mint")!;
  const matching = { hash, from: address, to: target.contractAddress, data: request.data, value: request.value, chainId: 1n, nonce: 4 };
  for (const difference of [{ from: target.contractAddress }, { to: address }, { data: "0xbeef" }, { value: 124n }, { chainId: 11155111n }, { nonce: 3 }]) {
    (wallet.provider.getTransaction as unknown) = async () => ({ ...matching, ...difference });
    await assert.rejects(recoverTransaction(wallet, target, record, hash, () => {}), /does not match/);
    assert.equal(readTransaction(target, "mint")?.hash, null);
  }
  (wallet.provider.getTransaction as unknown) = async () => matching;
  assert.equal(await recoverTransaction(wallet, target, record, hash, () => {}), "pending");
  assert.equal(readTransaction(target, "mint")?.hash, hash);
  (wallet.provider.getTransactionReceipt as unknown) = async () => ({ status: 1 });
  assert.equal(await recoverTransaction(wallet, target, record, hash, () => {}), "confirmed");
  assert.equal(readTransaction(target, "mint"), null);
});

test("legacy intents without calldata or value stay blocked", () => {
  const values = storage();
  values.set(transactionKey(target, "mint"), JSON.stringify({ action: "mint", chainId: 1, contractAddress: target.contractAddress, wallet: address, hash: null }));
  assert.throws(() => readTransaction(target, "mint"), /older transaction record/);
});


function readContract(version: "affiliate-v3" | "affiliate-v4", rates = [0, 1250, 250], prize = 8750n): Contract {
  return { CONTRACT_VERSION: async () => version, mintPrice: async () => 10_000n, maxSupply: async () => 1000n, maxAffiliateSlots: async () => BigInt(rates.length), prizeBps: async () => prize, affiliateRateBps: async (id: number) => BigInt(rates[id - 1]!), AFFILIATE_BPS: async () => 100n, PRIZE_BPS: async () => 5000n } as unknown as Contract;
}
const dynamicTarget: ContractTarget = { ...target, contractVersion: "affiliate-v4", mintPriceWei: "10000", maxSupply: 1000, maxAffiliateSlots: 3, prizeBps: 8750, affiliateRatesBps: [0, 1250, 250], affiliateId: 2, commissionBps: 1250 };

test("V4 wallet checks configured prize, full frozen schedule and selected position", async () => {
  await verifyRoundTerms(readContract("affiliate-v4"), dynamicTarget);
  await verifyRoundTerms(readContract("affiliate-v4"), { ...dynamicTarget, affiliateId: 1, commissionBps: 0 });
  await assert.rejects(verifyRoundTerms(readContract("affiliate-v4", [0, 1250, 200]), dynamicTarget), /terms do not match/);
  await assert.rejects(verifyRoundTerms(readContract("affiliate-v4", [0, 1250, 250], 8000n), dynamicTarget), /terms do not match/);
  await assert.rejects(verifyRoundTerms(readContract("affiliate-v4"), { ...dynamicTarget, commissionBps: 250 }), /terms do not match/);
  await assert.rejects(verifyRoundTerms(readContract("affiliate-v4"), { ...dynamicTarget, affiliateRatesBps: undefined }), /terms do not match/);
  await assert.rejects(verifyRoundTerms(readContract("affiliate-v4"), { ...dynamicTarget, prizeBps: 9000 }), /terms do not match/);
  await assert.rejects(verifyRoundTerms(readContract("affiliate-v3"), dynamicTarget), /terms do not match/);
});

test("legacy V3 keeps its verified fixed terms and rejects V4 expectations", async () => {
  const legacyTarget = { ...target, contractVersion: "affiliate-v3" as const, prizeBps: 5000, affiliateRatesBps: [100, 100, 100], commissionBps: 100 };
  await verifyRoundTerms(readContract("affiliate-v3", [100, 100, 100]), legacyTarget);
  await assert.rejects(verifyRoundTerms(readContract("affiliate-v3", [100, 100, 100]), { ...legacyTarget, prizeBps: 6000 }), /terms do not match/);
  await assert.rejects(verifyRoundTerms(readContract("affiliate-v3", [100, 100, 100]), { ...legacyTarget, commissionBps: 200 }), /terms do not match/);
});

test("program percentages display fractional basis points exactly", () => {
  assert.equal(formatBasisPoints(0), "0%");
  assert.equal(formatBasisPoints(1), "0.01%");
  assert.equal(formatBasisPoints(125), "1.25%");
  assert.equal(formatBasisPoints(10_000), "100%");
  assert.throws(() => formatBasisPoints(1.5));
  assert.throws(() => formatBasisPoints(10_001));
});


test("late account responses and old transaction callbacks cannot restore a previous wallet view", async () => {
  const scope = createWalletViewScope();
  const requests: Array<{ wallet: string | null; resolve: (value: string) => void }> = [];
  let displayed = "";
  async function refresh() {
    const request = scope.begin();
    const value = await new Promise<string>((resolve) => requests.push({ wallet: request.wallet, resolve }));
    if (request.isCurrent()) displayed = value;
  }
  scope.select(address);
  const oldResponse = refresh();
  scope.select(target.contractAddress);
  const currentResponse = refresh();
  requests[1]!.resolve("current wallet balance"); await currentResponse;
  requests[0]!.resolve("old wallet balance"); await oldResponse;
  assert.equal(displayed, "current wallet balance");
  // A transaction callback created before the switch must query the current wallet.
  const oldTransactionCompletion = refresh();
  assert.equal(requests[2]!.wallet, target.contractAddress);
  requests[2]!.resolve("refreshed current balance"); await oldTransactionCompletion;
  scope.select(null);
  const disconnected = refresh();
  assert.equal(requests[3]!.wallet, null);
  requests[3]!.resolve("disconnected"); await disconnected;
  assert.equal(displayed, "disconnected");
});


test("V5 wallet verification binds the whole pool, winner reserve and exact offered position", async()=>{
  const contract={CONTRACT_VERSION:async()=>"affiliate-v5",mintPrice:async()=>10000n,maxSupply:async()=>1000n,maxAffiliateSlots:async()=>20n,prizeBps:async()=>5000n,affiliatePoolBps:async()=>1000n} as unknown as Contract;
  const poolTarget: ContractTarget={...target,contractVersion:"affiliate-v5",mintPriceWei:"10000",maxSupply:1000,maxAffiliateSlots:20,prizeBps:5000,affiliatePoolBps:1000,affiliateRatesBps:[],affiliateId:20,commissionBps:1000};
  await verifyRoundTerms(contract,poolTarget);
  for(const change of [{affiliatePoolBps:2000},{prizeBps:6000},{commissionBps:100},{affiliateId:21},{affiliateRatesBps:[100]},{affiliatePoolBps:null},{contractVersion:"affiliate-v4" as const}]) await assert.rejects(verifyRoundTerms(contract,{...poolTarget,...change}),/terms do not match/);
});


test("V6 wallet checks preserve pool terms while rejecting V5 algorithms or contract versions", async () => {
  let algorithm = "unique-rank-v3";
  const contract = { CONTRACT_VERSION: async () => "affiliate-v6", ALGORITHM_VERSION: async () => algorithm,
    mintPrice: async () => 10000n, maxSupply: async () => 2000n, maxAffiliateSlots: async () => 20n,
    prizeBps: async () => 5000n, affiliatePoolBps: async () => 1000n } as unknown as Contract;
  const settings: ContractTarget = { ...target, contractVersion: "affiliate-v6", mintPriceWei: "10000", maxSupply: 2000,
    maxAffiliateSlots: 20, prizeBps: 5000, affiliatePoolBps: 1000, affiliateRatesBps: [], affiliateId: 2, commissionBps: 1000 };
  await verifyRoundTerms(contract, settings);
  await assert.rejects(verifyRoundTerms(contract, { ...settings, contractVersion: "affiliate-v5" }), /terms do not match/);
  await assert.rejects(verifyRoundTerms(contract, { ...settings, affiliatePoolBps: 2000 }), /terms do not match/);
  algorithm = "unique-rank-v2";
  await assert.rejects(verifyRoundTerms(contract, settings), /terms do not match/);
});
