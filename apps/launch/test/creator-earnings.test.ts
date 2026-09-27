import assert from "node:assert/strict";
import { test } from "node:test";
import { earningsInterface as abi, readCreatorEarnings, type EarningsCollection, type EarningsRpc } from "../lib/creator-earnings.ts";

const now = Date.parse("2026-09-26T12:00:00Z");
const hash = `0x${"ab".repeat(32)}`;
const owner = `0x${"11".repeat(20)}`;
const collection: EarningsCollection = { id: "one", name: "Test", seasonName: "Test season", chainId: "11155111", version: "affiliate-v10", roundId: "1", address: `0x${"22".repeat(20)}` };
function mock(options: { chain?: string; version?: string; roundId?: bigint; revealed?: boolean; stale?: boolean; reorg?: boolean; failAddress?: string; code?: string; amount?: bigint } = {}): EarningsRpc {
  let blocks = 0;
  return { async send(method, params) {
    assert.ok(["eth_chainId", "eth_getBlockByNumber", "eth_call", "eth_getCode", "eth_getBalance"].includes(method));
    if (method === "eth_chainId") return options.chain ?? "0xaa36a7";
    if (method === "eth_getBlockByNumber") return { hash: options.reorg && ++blocks > 1 ? `0x${"cd".repeat(32)}` : hash, number: "0x100", timestamp: `0x${BigInt(now / 1000 - (options.stale ? 301 : 0)).toString(16)}` };
    assert.deepEqual(params[1], { blockHash: hash, requireCanonical: true });
    if (method === "eth_getBalance") return "0x" + (10000000000000000001n).toString(16);
    if (method === "eth_getCode") return String(params[0]).toLowerCase() === owner.toLowerCase() ? options.code ?? "0x" : "0x1234";
    const tx = params[0] as { to: string; data: string };
    if (tx.to.toLowerCase() === options.failAddress?.toLowerCase()) throw new Error("Secret RPC URL must never appear in output");
    const name = abi.parseTransaction({ data: tx.data })!.name;
    const values: Record<string, unknown> = { CONTRACT_VERSION: options.version ?? "affiliate-v10", roundId: options.roundId ?? 1n, owner, withdrawableBalance: options.amount ?? 2000000000000000001n, revealed: options.revealed ?? true, totalMintRevenue: 10000000000000000000n, growthReserveBalance: 1500000000000000000n, prizeAmount:6000000000000000000n,prizePaidAmount:0n,totalAffiliateAccrued:500000000000000000n,totalAffiliateClaimed:0n,totalRefunded:0n,refundsAvailable:false,growthReserveWithdrawn:0n };
    return abi.encodeFunctionResult(name, [values[name]]);
  } };
}

test("current owner and exact creator proceeds stay separate from growth reserves", async () => {
  const report = await readCreatorEarnings([collection], "11155111", mock(), now);
  assert.equal(report.rows[0].balance?.owner, owner);
  assert.equal(report.totals.withdrawableWei, "2000000000000000001");
  assert.equal(report.totals.growthAvailableWei, "1500000000000000000");
  assert.equal(report.totals.availableCollections, 1);
  assert.equal(report.blockNumber, 256);
  assert.equal(report.rows[0].balance?.accounting?.operatorAvailableWei, "3500000000000000001");
  assert.equal(report.rows[0].balance?.accounting?.lockedWei, "0");
});

test("growth reserve before reveal is held but unavailable", async () => {
  const report = await readCreatorEarnings([collection], "11155111", mock({ revealed: false, amount: 0n, code: "0x1234" }), now);
  assert.equal(report.rows[0].balance?.growthReserveWei, "1500000000000000000");
  assert.equal(report.rows[0].balance?.growthAvailableWei, "0");
  assert.equal(report.rows[0].balance?.ownerIsContract, true);
  assert.equal(report.totals.availableCollections, 0);
});

test("older versions do not invent or call an unsupported growth reserve", async () => {
  const old = { ...collection, version: "affiliate-v5" };
  const rpc = mock({ version: old.version });
  const report = await readCreatorEarnings([old], "11155111", { async send(method, params) {
    if (method === "eth_call") assert.notEqual(abi.parseTransaction({ data: (params[0] as { data: string }).data })?.name, "growthReserveBalance");
    return rpc.send(method, params);
  } }, now);
  assert.equal(report.rows[0].balance?.growthReserveWei, "0");
});

test("failed collection remains visible without exposing dependency messages or corrupting totals", async () => {
  const second = { ...collection, id: "two", address: `0x${"33".repeat(20)}` };
  const report = await readCreatorEarnings([collection, second], "11155111", mock({ failAddress: second.address }), now);
  assert.equal(report.rows.length, 2);
  assert.equal(report.totals.verifiedCollections, 1);
  assert.equal(report.rows[1].balance, null);
  assert.equal(report.totals.withdrawableWei, "2000000000000000001");
  assert.equal(JSON.stringify(report).includes("Secret RPC"), false);
});

for (const options of [{ chain: "0x1" }, { version: "affiliate-v9" }, { roundId: 2n }, { stale: true }, { reorg: true }]) {
  test(`unverified network/identity/block never becomes a reported zero balance: ${JSON.stringify(options, (_, value) => typeof value === "bigint" ? String(value) : value)}`, async () => {
    const report = await readCreatorEarnings([collection], "11155111", mock(options), now);
    assert.equal(report.rows[0].balance, null);
    assert.equal(report.totals.verifiedCollections, 0);
    assert.ok(report.rows[0].error);
  });
}

test("missing RPC, no deployments, unsupported history and mixed networks are distinct", async () => {
  const missing = await readCreatorEarnings([collection], "11155111", null, now);
  assert.match(missing.error!, /not configured/);
  const empty = await readCreatorEarnings([], "1", null, now);
  assert.equal(empty.error, null);
  assert.equal(empty.rows.length, 0);
  const unsupported = await readCreatorEarnings([{ ...collection, version: "legacy" }], "11155111", mock(), now);
  assert.match(unsupported.rows[0].error!, /historical/);
  await assert.rejects(readCreatorEarnings([collection], "1", mock(), now), /network mismatch/);
});

test("zero qualification, partial affiliate claims, growth withdrawals and unsold refunds reconcile without double counting", async () => {
  const eth = 10n ** 18n;
  const cases = [
    { balance: 10n * eth, values: { withdrawableBalance: 2n * eth, growthReserveBalance: 2n * eth, totalAffiliateAccrued: 0n }, available: 4n * eth, refunds: 0n },
    { balance: 8n * eth, values: { withdrawableBalance: 2n * eth, growthReserveBalance: eth / 2n, totalAffiliateAccrued: eth / 2n, totalAffiliateClaimed: eth / 4n, prizePaidAmount: 3n * eth / 4n, growthReserveWithdrawn: eth }, available: 5n * eth / 2n, refunds: 0n },
    { balance: 2n * eth, values: { revealed: false, withdrawableBalance: 0n, growthReserveBalance: 0n, totalMintRevenue: 3n * eth, totalRefunded: eth, refundsAvailable: true, totalAffiliateAccrued: 0n }, available: 0n, refunds: 2n * eth },
  ];
  for (const scenario of cases) {
    const base = mock();
    const rpc: EarningsRpc = { async send(method, params) {
      if (method === "eth_getBalance") return `0x${scenario.balance.toString(16)}`;
      if (method === "eth_call") {
        const name = abi.parseTransaction(params[0] as { data: string })!.name;
        if (name in scenario.values) return abi.encodeFunctionResult(name, [(scenario.values as Record<string, unknown>)[name]]);
      }
      return base.send(method, params);
    } };
    const report = await readCreatorEarnings([collection], "11155111", rpc, now), balance = report.rows[0].balance;
    assert.ok(balance);
    assert.equal(balance.accounting?.operatorAvailableWei, String(scenario.available));
    assert.equal(balance.accounting?.refundLiabilityWei, String(scenario.refunds));
    assert.equal(balance.accounting?.lockedWei, "0");
  }
});


test("withdrawal history is independent of current zero or nonzero funds", async () => {
  const base = mock(), recorded = { ...collection, deploymentBlock: "1" };
  const event = abi.encodeEventLog(abi.getEvent("Withdrawn")!, [owner, 2n * 10n ** 18n]);
  const rpc: EarningsRpc = { async send(method, params) {
    if (method === "eth_getLogs") return [{ ...event, address: collection.address, removed: false }];
    return base.send(method, params);
  } };
  const report = await readCreatorEarnings([recorded], "11155111", rpc, now);
  assert.equal(report.rows[0].balance?.withdrawals.ordinaryWithdrawnWei, "2000000000000000000");
  assert.equal(report.rows[0].balance?.withdrawals.historyError, null);
  assert.equal(report.blockHash, hash);
  assert.equal(report.status, "available");
  const unavailable = await readCreatorEarnings([recorded], "11155111", base, now);
  assert.ok(unavailable.rows[0].balance);
  assert.equal(unavailable.rows[0].balance.withdrawals.ordinaryWithdrawnWei, null);
  assert.match(unavailable.rows[0].balance.withdrawals.historyError!, /independently/);
});
