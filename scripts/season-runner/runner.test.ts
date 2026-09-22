import { test } from "node:test";
import assert from "node:assert/strict";
import { Wallet } from "ethers";
import type { Pool } from "pg";
import { runtimeArtifact } from "../../apps/launch/test/season-runtime.fixture.ts";
import { createSeasonRunner, iso, scheduleBinding, socialIdentity, type RunnerOptions, type RunnerDependencies, type SeasonState } from "./runner.ts";
import { ChainPendingError, type ChainJournal } from "./chain-transactions.ts";
import type { ChainDeployment, ChainSnapshot } from "./chain.ts";
import type { RunStore } from "./store.ts";

const hash = `0x${"ab".repeat(32)}`, factory = `0x${"66".repeat(20)}`, round = `0x${"77".repeat(20)}`;
function fixture() {
  const artifact = runtimeArtifact(), wallet = new Wallet(Wallet.createRandom().privateKey), now = Date.parse("2035-01-01T04:00:00Z") / 1000;
  for (const step of artifact.steps) { step.payload.contract.initialOwner = wallet.address; step.payload.operations.deployerAddress = wallet.address; step.payload.operations.factoryOwnerAddress = wallet.address; }
  const first = artifact.steps[0], saleStart = now - 7200;
  const payload = structuredClone(first.payload); payload.contract.saleStartAt = String(saleStart);
  const journal: ChainJournal = { version: 1, chainId: 11155111, from: wallet.address, maxFeePerGasWei: "100", maxTotalSpendWei: "100000000000000000000", transactions: [], collections: {} };
  const deployment = { factory, round, roundId: "1", subscriptionId: "1", deploymentBlock: 90, deploymentBlockHash: hash, deploymentTransactionHash: hash, factoryCodeHash: hash, roundCodeHash: hash, renderer: factory, deployer: factory, config: {} } satisfies ChainDeployment;
  const snapshot: ChainSnapshot = {
    chainId: 11155111, blockNumber: 100, blockHash: hash, timestamp: now - 24, round, phase: "awaiting_prize", saleActivated: true, saleStartAt: String(saleStart), mintDeadline: String(now + 86400),
    totalMinted: "1000", maxSupply: "1000", mintPrice: "10000000000000000", soldOut: true, soldOutAt: String(now - 100), randomnessRequested: true, randomnessReceived: true, revealed: true, readyForNextRound: true,
    refundsAvailable: false, cancelled: false, refundedCount: "0", totalRefunded: "0", prizePaid: false, prizePaidAmount: "0", totalMintRevenue: "10000000000000000000", affiliateCount: "0", maxAffiliateSlots: "10", totalAffiliateAccrued: "0", totalAffiliateClaimed: "0", affiliateQualifiedCount: "0", affiliateEqualShare: "0", drawCounter: "1",
    awards: Array.from({ length: 6 }, (_, index) => ({ rank: index + 1, tokenId: String(index + 1), holder: wallet.address, paidHolder: `0x${"0".repeat(40)}`, claimed: false, paidAt: "0", amountWei: "1000000000000000000" })),
  };
  const state: SeasonState = { journal, announcedAt: iso(now - 10000), factory: { factory, factoryCodeHash: hash }, collections: { [first.id]: { payload, enrollmentAt: iso(saleStart - 900), announcementAt: iso(now - 10000), deployment, readinessAt: iso(saleStart - 100), snapshot } } };
  const events: string[] = [], published: Record<string, unknown>[] = [];
  const store = { state, artifact, row: { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", profile_revision: 1 }, db: {},
    guard: async () => {}, save: async () => {}, query: async () => ({ rows: [], rowCount: 1 }), putAction: async () => ({}), action: async () => ({ status: "confirmed", result: { confirmedAt: iso(now - 10000) } }),
    publish: async (value: Record<string, unknown>) => { published.push(value); }, complete: async () => { events.push("complete"); },
  } as unknown as RunStore;
  const options: RunnerOptions = { chainId: 11155111, rpcUrl: "https://rpc.tincta.xyz", databaseUrl: "postgres://local/db", owner: wallet.address, privateKey: wallet.privateKey, execute: true,
    eligibility: { address: first.payload.operations.affiliateEligibilityAddress!, codeHash: hash }, credits: { address: first.payload.operations.winnerCreditsAddress!, codeHash: hash }, maxFeePerGasWei: journal.maxFeePerGasWei, maxTotalSpendWei: journal.maxTotalSpendWei };
  const provider = { getBlock: async (tag: unknown) => ({ number: tag === "latest" ? 102 : Number(tag), hash, timestamp: now }) };
  const chain = { journal, provider, preflight: async () => ({ balanceWei: "100000000000000000000" }), ensureFactory: async () => ({ factory, factoryCodeHash: hash }),
    snapshot: async (_address?: string, _blockNumber?: number) => snapshot, advance: async () => { events.push("advance"); }, deployCollection: async () => { events.push("deploy-next"); throw new ChainPendingError("next:create-round", hash); }, destroy: () => {},
  };
  const dependencies = { getRuntimeWorkerProfile: async () => ({ profile: { enabled: true, revision: 1, expectedAccountId: "123", publicBaseUrl: "https://tincta.xyz", handle: "tincta_test" }, credentials: {} }),
    createV9ChainAdapter: async () => chain, verifyXAccount: async () => ({}), indexSeasonFactory: async () => ({ ok: true }), registerVerifiedCollection: async () => ({}), now: () => now * 1000,
    createTransactionPipeline: () => ({ canonicalReceipt: async () => { events.push("canonical"); return {}; }, send: async () => ({}) }),
    deliverMessage: async (_store: unknown, _credentials: unknown, _account: string, key: string) => { events.push(`post:${key}`); return "123"; },
    runSepoliaRehearsalStep: async () => { events.push("rehearsal"); return { action: "settled" }; },
    resolveTimedAutomationStep: () => { const next = structuredClone(artifact.steps[1].payload); next.contract.saleStartAt = String(now + 3500); return { status: "ready_for_preflight", payload: next }; },
  } as unknown as Partial<RunnerDependencies>;
  return { artifact, wallet, now, snapshot, deployment, journal, state, events, published, store, options, chain, dependencies };
}

test("canonical confirmed receipts are rechecked on restart before any public post", async () => {
  const f = fixture(); f.journal.transactions.push({ action: "old", state: "confirmed", rawTransaction: "not-read-by-mock", hash, nonce: 1 });
  f.dependencies.createTransactionPipeline = (() => ({ canonicalReceipt: async () => { throw new Error("orphaned receipt"); }, send: async () => ({}) })) as unknown as RunnerDependencies["createTransactionPipeline"];
  const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
  await assert.rejects(runner.tick(), /orphaned/); assert.deepEqual(f.events, []); assert.deepEqual(f.published, []);
});

test("next collection deployment takes precedence over old optional rehearsal claims", async () => {
  const f = fixture(); f.options.wallets = Array.from({ length: 50 }, () => new Wallet(Wallet.createRandom().privateKey));
  const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
  await assert.rejects(runner.tick(), ChainPendingError);
  assert(f.events.includes("deploy-next")); assert.equal(f.events.includes("rehearsal"), false);
  assert.equal(f.state.rehearsal!.journals[f.wallet.address], f.state.journal, "operator uses one shared nonce journal");
});

test("publishing a previously observed projection cannot fabricate fresh evidence", async () => {
  const f = fixture(); f.state.observedAt = iso(f.now - 1000);
  const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
  await runner.project(); await runner.project();
  assert.equal(f.published[0].updatedAt, f.state.observedAt); assert.equal(f.published[1].updatedAt, f.state.observedAt);
  assert.equal((f.published[0].collections as Array<Record<string, unknown>>)[0].snapshotBlock, 100);
});

test("first forecast hides its collection name and future collections wait for their confirmed X root", async () => {
  const f = fixture(), first = f.artifact.steps[0], second = f.artifact.steps[1];
  f.state.collections![second.id] = { ...f.state.collections![first.id], payload: second.payload };
  let announced: string[] = [];
  f.store.query = (async (sql: string) => ({ rows: sql.startsWith("SELECT action_key") ? announced.map(action_key => ({ action_key })) : [], rowCount: announced.length })) as RunStore["query"];
  const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
  await runner.project(); let collections = f.published.at(-1)!.collections as Array<{ id: string; name: string | null }>;
  assert.deepEqual(collections.map(item => [item.id, item.name]), [[first.id, null]]);
  announced = [`${first.id}:affiliate-opening-soon:root`]; await runner.project();
  collections = f.published.at(-1)!.collections as typeof collections;
  assert.deepEqual(collections.map(item => [item.id, item.name]), [[first.id, first.payload.contract.name]]);
  announced.push(`${second.id}:affiliate-enrollment-open:root`); await runner.project();
  assert.equal((f.published.at(-1)!.collections as typeof collections).length, 2);
});

test("Mainnet cannot invoke the rehearsal path and prepared chain must match its profile", async () => {
  const f = fixture(); f.options.chainId = 1; f.artifact.chainId = "1"; f.artifact.steps.forEach(step => { step.payload.contract.chainId = "1"; });
  f.options.wallets = Array.from({ length: 50 }, () => new Wallet(Wallet.createRandom().privateKey));
  await assert.rejects(createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies), /test_minting_is_sepolia_only/);
  f.options.wallets = undefined; f.artifact.chainId = "11155111";
  await assert.rejects(createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies), /prepared_network_mismatch/);
});

test("Mainnet rejects test options and persisted rehearsal state before accessing services", async () => {
  for (const testOptions of [{ wallets: [] }, { donors: [] }, { recycleSepoliaFunds: true }]) {
    const f = fixture(); Object.assign(f.options, { chainId: 1 }, testOptions);
    f.dependencies.getRuntimeWorkerProfile = async () => { throw new Error("must not access services"); };
    await assert.rejects(createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies), /test_minting_is_sepolia_only/);
  }
  for (const state of [{ rehearsal: { journals: {}, refunds: {}, funding: {} } }, { walletAddresses: [] }, { rehearsalCursor: 0 }, { rehearsalDone: [] }]) {
    const f = fixture(); f.options.chainId = 1; Object.assign(f.state, state);
    f.dependencies.getRuntimeWorkerProfile = async () => { throw new Error("must not access services"); };
    await assert.rejects(createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies), /rehearsal_state_is_sepolia_only/);
  }
});

test("V9 and V10 Mainnet workers wait for real buyers without creating wallets or invoking rehearsal", async t => {
  for (const version of ["affiliate-v9", "affiliate-v10"] as const) {
    const f = fixture(); f.options.chainId = 1; f.artifact.chainId = "1"; f.journal.chainId = 1;
    f.artifact.contractVersion = version; f.artifact.steps = [f.artifact.steps[0]];
    const payloads = [f.artifact.steps[0].payload, f.state.collections![f.artifact.steps[0].id].payload];
    for (const payload of payloads) Object.assign(payload.contract, { chainId: "1", contractVersion: version, algorithmVersion: version === "affiliate-v10" ? "unique-rank-v6" : "unique-rank-v5" });
    Object.assign(f.snapshot, { chainId: 1, soldOut: false, revealed: false, readyForNextRound: false, randomnessRequested: false, randomnessReceived: false, totalMinted: "0", awards: [] });
    f.dependencies.createV10ChainAdapter = f.dependencies.createV9ChainAdapter;
    f.dependencies.runSepoliaRehearsalStep = async () => { throw new Error("Mainnet must not simulate purchases"); };
    const random = t.mock.method(Wallet, "createRandom", () => { throw new Error("Mainnet must not generate wallets"); });
    try {
      const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
      assert.equal((await runner.tick()).mode, "running");
      assert(f.events.includes(`post:${f.artifact.steps[0].id}:collection-live`), "normal lifecycle monitoring remains enabled");
      assert.equal(f.state.collections![f.artifact.steps[0].id].snapshot!.totalMinted, "0");
      assert.equal(f.state.rehearsal, undefined);
      assert.equal(f.state.walletAddresses, undefined);
      assert.equal(random.mock.callCount(), 0);
      runner.close();
    } finally { random.mock.restore(); }
  }
});

test("Sepolia simulation requires its explicitly supplied adapter", async () => {
  const f = fixture(); f.options.wallets = [f.wallet]; delete f.dependencies.runSepoliaRehearsalStep;
  await assert.rejects(createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies), /sepolia_rehearsal_adapter_required/);
});

test("source migration and public-account bindings cannot change on a resumed run", () => {
  const f = fixture(), original = scheduleBinding(f.options, "123", "https://tincta.xyz");
  assert.notEqual(scheduleBinding(f.options, "456", "https://tincta.xyz"), original);
  assert.notEqual(scheduleBinding({ ...f.options, historicalSources: [{ factory, factoryCodeHash: hash, round, roundCodeHash: hash, roundId: "1" }] }, "123", "https://tincta.xyz"), original);
});

test("activation uses current head time and an already confirmed activation does not fail the later grace window", async () => {
  const f = fixture(); f.artifact.steps = [f.artifact.steps[0]];
  const item = f.state.collections![f.artifact.steps[0].id]; item.payload.contract.saleStartAt = String(f.now); item.enrollmentAt = iso(f.now - 900); item.readinessAt = iso(f.now - 100);
  Object.assign(f.snapshot, { timestamp: f.now - 132, saleStartAt: String(f.now), saleActivated: false, soldOut: false, revealed: false, readyForNextRound: false, randomnessRequested: false, randomnessReceived: false, totalMinted: "0", awards: [] });
  const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
  await runner.tick(); assert.equal(f.events.filter(event => event === "advance").length, 1);
  Object.assign(f.snapshot, { saleActivated: true, timestamp: f.now + 12 });
  f.chain.provider.getBlock = async (tag: unknown) => ({ number: tag === "latest" ? 114 : Number(tag), hash, timestamp: f.now + 144 });
  await runner.tick(); assert.equal(f.events.filter(event => event === "advance").length, 1);
});

test("unsold outcome is completed and published before an owned refund waits for confirmations", async () => {
  const f = fixture(); f.artifact.steps = [f.artifact.steps[0]];
  f.options.wallets = Array.from({ length: 50 }, () => new Wallet(Wallet.createRandom().privateKey));
  Object.assign(f.snapshot, { soldOut: false, revealed: false, readyForNextRound: false, refundsAvailable: true, cancelled: true, mintDeadline: String(f.now - 1), totalMinted: "20", awards: [] });
  f.dependencies.runSepoliaRehearsalStep = (async () => { f.events.push("rehearsal"); throw new ChainPendingError("owned-refund", hash); }) as RunnerDependencies["runSepoliaRehearsalStep"];
  const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
  await assert.rejects(runner.tick(), ChainPendingError);
  assert.equal(f.state.completed, true); assert(f.events.indexOf("complete") < f.events.indexOf("rehearsal"));
  assert.equal(f.published.at(-1)?.status, "completed");
});

test("public transaction audit metadata is batched rather than one database round trip per prior transaction", async () => {
  const f = fixture(); f.artifact.steps = [f.artifact.steps[0]];
  Object.assign(f.snapshot, { soldOut: false, revealed: false, readyForNextRound: false, randomnessRequested: false, randomnessReceived: false, totalMinted: "0", awards: [] });
  for (let nonce = 0; nonce < 100; nonce++) {
    const rawTransaction = await f.wallet.signTransaction({ chainId: 11155111, type: 2, to: factory, nonce, value: 0n, gasLimit: 21000n, maxFeePerGas: 100n, maxPriorityFeePerGas: 1n });
    const { Transaction } = await import("ethers");
    f.journal.transactions.push({ action: `tx-${nonce}`, rawTransaction, nonce, hash: Transaction.from(rawTransaction).hash!, state: "confirmed", blockNumber: 90, blockHash: hash, gasUsed: "21000", gasPrice: "1" });
  }
  let auditQueries = 0, individualActions = 0;
  f.store.query = (async (sql: string, values?: unknown[]) => { if (sql.includes("jsonb_to_recordset")) { auditQueries++; assert.equal(JSON.parse(String(values![1])).length, 100); } return { rows: [], rowCount: 1 }; }) as RunStore["query"];
  f.store.putAction = (async () => { individualActions++; return {}; }) as unknown as RunStore["putAction"];
  const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies); await runner.tick();
  assert.equal(individualActions, 0); assert(auditQueries >= 1 && auditQueries <= 3);
});

test("first root starts counters even when its later reply fails, and restored roots bypass the expired first window", async () => {
  const f = fixture(); delete f.state.announcedAt;
  const item = f.state.collections![f.artifact.steps[0].id]; item.payload.contract.saleStartAt = String(f.now + 3600); item.enrollmentAt = iso(f.now + 2700);
  let rootConfirmed = false;
  f.store.action = (async (key: string) => key === "season:upcoming-season:root" && rootConfirmed ? { status: "confirmed", result: { confirmedAt: iso(f.now) } } : undefined) as unknown as RunStore["action"];
  f.dependencies.deliverMessage = (async () => { rootConfirmed = true; throw new Error("reply uncertain"); }) as RunnerDependencies["deliverMessage"];
  const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
  await assert.rejects(runner.tick(), /reply uncertain/);
  assert.equal(f.state.announcedAt, iso(f.now)); assert.equal(f.published.at(-1)?.announcedAt, iso(f.now));
  const resumed = fixture(); delete resumed.state.announcedAt;
  const second = await createSeasonRunner(resumed.store, {} as Pool, resumed.options, resumed.dependencies);
  await assert.rejects(second.tick(), ChainPendingError);
  assert.equal(resumed.state.announcedAt, iso(resumed.now - 10000)); assert.equal(resumed.state.firstThreadComplete, true);
});

test("predeployed future collection is kept out of the public catalog until its announcement root is confirmed", async () => {
  const f = fixture(), next = f.artifact.steps[1], secondAddress = `0x${"88".repeat(20)}`;
  const payload = structuredClone(next.payload); payload.contract.saleStartAt = String(f.now + 3600);
  f.state.collections![next.id] = { payload, enrollmentAt: iso(f.now + 2700), announcementAt: iso(f.now + 1000), deployment: { ...f.deployment, round: secondAddress } };
  f.chain.snapshot = async (address?: string) => address === secondAddress ? { ...f.snapshot, round: secondAddress, saleActivated: false, soldOut: false, revealed: false, readyForNextRound: false, totalMinted: "0", awards: [] } : f.snapshot;
  const registered: string[] = [];
  f.dependencies.registerVerifiedCollection = (async (_pool: unknown, id: string) => { registered.push(id); return {}; }) as unknown as RunnerDependencies["registerVerifiedCollection"];
  const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies); await runner.tick();
  assert.deepEqual(registered, [f.artifact.steps[0].id]);
});

test("shared evidence block is refreshed after indexing so a newly confirmed activation is not treated as missed", async () => {
  const f = fixture(); f.artifact.steps = [f.artifact.steps[0]];
  const item = f.state.collections![f.artifact.steps[0].id];
  item.payload.contract.saleStartAt = String(f.now - 100); item.enrollmentAt = iso(f.now - 1000); item.readinessAt = iso(f.now - 200);
  Object.assign(f.snapshot, { saleStartAt: String(f.now - 100), soldOut: false, revealed: false, readyForNextRound: false, randomnessRequested: false, randomnessReceived: false, totalMinted: "0", awards: [] });
  let indexed = false;
  f.dependencies.indexSeasonFactory = (async () => { indexed = true; return { ok: true, chainId: 11155111, confirmedBlock: 111, results: [], elapsedMs: 0 }; }) as RunnerDependencies["indexSeasonFactory"];
  f.chain.provider.getBlock = async (tag: unknown) => ({ number: tag === "latest" ? indexed ? 112 : 102 : Number(tag), hash, timestamp: f.now });
  const evidence: number[] = [];
  f.chain.snapshot = async (_address?: string, blockNumber?: number) => { evidence.push(blockNumber!); return { ...f.snapshot, saleActivated: blockNumber === 111 }; };
  const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies); await runner.tick();
  assert.deepEqual(evidence, [111]); assert.equal(f.events.includes("advance"), false);
  assert.equal(item.snapshot?.saleActivated, true);
});

test("readiness records actual completion time and rejects an enrollment thread completed after fixed opening", async () => {
  for (const late of [false, true]) {
    const f = fixture(); f.artifact.steps = [f.artifact.steps[0]]; f.state.firstThreadComplete = true;
    const item = f.state.collections![f.artifact.steps[0].id];
    item.payload.contract.saleStartAt = String(f.now + 10); item.enrollmentAt = iso(f.now - 100); delete item.readinessAt;
    Object.assign(f.snapshot, { saleStartAt: String(f.now + 10), saleActivated: false, soldOut: false, revealed: false, readyForNextRound: false, randomnessRequested: false, randomnessReceived: false, totalMinted: "0", awards: [] });
    let completed = false;
    f.chain.provider.getBlock = async (tag: unknown) => ({ number: tag === "latest" ? 102 : Number(tag), hash, timestamp: f.now + (completed ? late ? 20 : 5 : 0) });
    f.dependencies.fetch = (async () => new Response(JSON.stringify({ program: { chainId: 11155111, contractVersion: "affiliate-v9", contractAddress: round, source: "ethereum", readiness: { canEnroll: true }, enrollmentStatus: "open" } }))) as typeof fetch;
    f.dependencies.deliverMessage = (async (_store: unknown, _credentials: unknown, _account: string, key: string) => { if (key.endsWith(":affiliate-enrollment-open")) completed = true; return "123"; }) as RunnerDependencies["deliverMessage"];
    const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
    if (late) { await assert.rejects(runner.tick(), /readiness_completed_after_fixed_launch/); assert.equal(item.readinessAt, undefined); }
    else { await runner.tick(); assert.equal(item.readinessAt, iso(f.now + 5)); }
    assert.equal(f.events.includes("advance"), false);
  }
});


test("V10 runner selects its adapter and indexer version while preserving a version-bound resume", async () => {
  const f=fixture(); f.artifact.contractVersion="affiliate-v10";
  for(const step of f.artifact.steps) step.payload.contract.algorithmVersion="unique-rank-v6";
  f.state.collections![f.artifact.steps[0].id].payload.contract.algorithmVersion="unique-rank-v6";
  let calls=0, indexedVersion: string | undefined;
  f.dependencies.createV9ChainAdapter=async()=>{throw new Error("must not use V9");};
  f.dependencies.createV10ChainAdapter=(async()=>{calls++;return f.chain;}) as unknown as RunnerDependencies["createV10ChainAdapter"];
  f.dependencies.indexSeasonFactory=(async(_pool,_provider,options)=>{indexedVersion=options.contractVersion;return {ok:true};}) as RunnerDependencies["indexSeasonFactory"];
  const runner=await createSeasonRunner(f.store,{} as Pool,f.options,f.dependencies);
  assert.equal(calls,1); assert.match(f.state.binding!,/affiliate-v10/);
  await assert.rejects(runner.tick(),ChainPendingError); assert.equal(indexedVersion,"affiliate-v10");
  f.artifact.contractVersion="affiliate-v9";
  await assert.rejects(createSeasonRunner(f.store,{} as Pool,f.options,f.dependencies),/immutable_runtime_configuration_changed/);
});

test("V10 rechecks retired credit targets before replaying a persisted transaction", async () => {
  const f = fixture(); f.artifact.contractVersion = "affiliate-v10";
  for (const step of f.artifact.steps) step.payload.contract.algorithmVersion = "unique-rank-v6";
  f.state.collections![f.artifact.steps[0].id].payload.contract.algorithmVersion = "unique-rank-v6";
  f.dependencies.createV10ChainAdapter = (async () => f.chain) as unknown as RunnerDependencies["createV10ChainAdapter"];
  const rawTransaction = await f.wallet.signTransaction({ chainId: 11155111, type: 2, to: factory, nonce: 0, value: 0n, gasLimit: 21000n, maxFeePerGas: 100n, maxPriorityFeePerGas: 1n });
  const { Transaction } = await import("ethers");
  f.journal.transactions.push({ action: "resume-v10", rawTransaction, nonce: 0, hash: Transaction.from(rawTransaction).hash!, state: "prepared" });
  let preflights = 0, sends = 0;
  f.chain.preflight = async () => { if (++preflights > 1) throw new Error("prior target can still mint"); return { balanceWei: "100000000000000000000" }; };
  f.dependencies.createTransactionPipeline = (() => ({ canonicalReceipt: async () => ({}), send: async () => { sends++; return {}; } })) as unknown as RunnerDependencies["createTransactionPipeline"];
  const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
  await assert.rejects(runner.tick(), /prior target can still mint/);
  assert.equal(preflights, 2); assert.equal(sends, 0); assert.equal(f.published.length, 0);
});


test("mock season announcements retain private catalog order without carrying Mainnet IDs", () => {
  const artifact = runtimeArtifact();
  const identity = socialIdentity(artifact, 17);
  assert.equal(identity.number, 17);
  assert.equal(identity.id, artifact.seasonId);
  assert.equal(identity.name, artifact.steps[0].payload.contract.seasonName);
  assert.equal(socialIdentity(artifact).number, 1);
});
