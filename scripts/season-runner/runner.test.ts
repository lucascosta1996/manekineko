import { test } from "node:test";
import assert from "node:assert/strict";
import { Wallet } from "ethers";
import type { Pool } from "pg";
import { runtimeArtifact } from "../../apps/launch/test/season-runtime.fixture.ts";
import { createSeasonRunner, iso, scheduleBinding, socialIdentity, type RunnerOptions, type RunnerDependencies, type SeasonState } from "./runner.ts";
import { ChainPendingError, type ChainJournal } from "./chain-transactions.ts";
import type { ChainDeployment, ChainSnapshot } from "./chain.ts";
import type { RunStore } from "./store.ts";
import { AIRY_RECOVERY as A, createAiryRecoveryPlan, recoveryDigest, recoveryPayload } from "./airy-recovery-plan.ts";

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
    snapshot: async (_address?: string, blockNumber?: number) => ({ ...snapshot, blockNumber: blockNumber ?? snapshot.blockNumber }), advance: async () => { events.push("advance"); }, deployCollection: async () => { events.push("deploy-next"); throw new ChainPendingError("next:create-round", hash); }, destroy: () => {},
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

test("reviewed Airy recovery uses the new opening and public correction while preserving the original artifact", async () => {
  const f = fixture(), originalFirst = f.artifact.steps[0].id;
  f.artifact.contractVersion = "affiliate-v10";
  f.artifact.steps.forEach((step,i) => { step.id = i ? A.nextId : A.firstId; step.payload.contract.algorithmVersion = "unique-rank-v6"; });
  f.state.collections![A.firstId] = f.state.collections![originalFirst]; delete f.state.collections![originalFirst];
  f.snapshot.round = A.round; f.deployment.round = A.round; f.snapshot.soldOutAt = String(f.now - 7200);
  f.state.firstThreadComplete = true;
  f.options.contractVersion = "affiliate-v10"; f.state.binding = scheduleBinding(f.options, "123", "https://tincta.xyz");
  f.store.row.id = A.runId; f.store.row.automation_id = A.automationId; f.store.row.prepared_hash = "f".repeat(64);
  const plan = createAiryRecoveryPlan({ artifact:f.artifact,state:f.state,preparedHash:f.store.row.prepared_hash,actionsHash:"a".repeat(64),profileRevision:1,runRevision:1,snapshot:f.snapshot,now:f.now,startAt:iso(f.now+7200) });
  f.state.collections![A.nextId] = { payload:recoveryPayload(f.artifact,plan),enrollmentAt:plan.replacement.enrollmentAt,announcementAt:plan.replacement.announcementAt };
  f.state.airyRecovery = { plan,hash:recoveryDigest(plan),appliedAt:iso(f.now) };
  f.dependencies.createV10ChainAdapter = f.dependencies.createV9ChainAdapter;
  let correction = "";
  f.dependencies.deliverMessage = (async (_s,_c,_a,key,message) => { if(key===`${A.nextId}:affiliate-opening-soon`)correction=message.post;return "123"; }) as RunnerDependencies["deliverMessage"];
  f.dependencies.resolveTimedAutomationStep = () => { throw Error("must not replace the reviewed schedule"); };
  const original = structuredClone(f.artifact), runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
  await assert.rejects(runner.tick(), ChainPendingError);
  assert.match(correction,/Satin Echo · rescheduled/); assert.match(correction,/Original mint:/); assert.match(correction,/New mint:/);
  assert.deepEqual(f.artifact,original); assert.equal(f.events.includes("deploy-next"),true);
  f.snapshot.readyForNextRound=false; f.events.length=0;
  await runner.tick(); assert.equal(f.events.includes("deploy-next"),false,"A predecessor that loses readiness cannot advance");
  runner.close();
});

test("polling identity must succeed initially and failed checks never populate its cache", async () => {
  const f = fixture(); f.options.execute = false; let checks = 0;
  f.dependencies.verifyXAccount = async () => { if (++checks === 1) throw new Error("identity verification failed"); return { id: "123", username: "tincta_test", name: "Tincta" }; };
  const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
  await assert.rejects(runner.tick(), /identity verification failed/);
  await runner.tick(); await runner.tick();
  assert.equal(checks, 2); assert.deepEqual(f.events, []);
});

test("routine polling reuses identity for five minutes and a new worker instance verifies again", async () => {
  const f = fixture(); f.options.execute = false; let now = f.now * 1000, checks = 0, preflights = 0;
  f.dependencies.now = () => now;
  f.dependencies.verifyXAccount = async () => { checks++; return { id: "123", username: "tincta_test", name: "Tincta" }; };
  f.chain.preflight = async () => { preflights++; return { balanceWei: "100000000000000000000" }; };
  const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
  for (let tick = 0; tick < 100; tick++) { now = f.now * 1000 + tick * 3000; await runner.tick(); }
  assert.equal(checks, 1); assert.equal(preflights, 100, "Chain preflight is not cached with social identity");
  now = f.now * 1000 + 300000; await runner.tick(); assert.equal(checks, 2);
  const restarted = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
  await restarted.tick(); assert.equal(checks, 3, "No identity approval survives worker recreation");
});

test("failed periodic identity renewal stops the tick and cannot reuse a previous success", async () => {
  const f = fixture(); f.options.execute = false; let now = f.now * 1000, checks = 0;
  f.dependencies.now = () => now;
  f.dependencies.verifyXAccount = async () => { if (++checks > 1) throw new Error("identity renewal failed"); return { id: "123", username: "tincta_test", name: "Tincta" }; };
  const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
  await runner.tick(); now += 300000;
  await assert.rejects(runner.tick(), /identity renewal failed/);
  now -= 100000; await assert.rejects(runner.tick(), /identity renewal failed/);
  assert.equal(checks, 3); assert.deepEqual(f.events, []);
});

test("any observed clock rollback forces fresh polling identity even within the previous success window", async () => {
  const f = fixture(); f.options.execute = false; let now = f.now * 1000, checks = 0;
  f.dependencies.now = () => now;
  f.dependencies.verifyXAccount = async () => { checks++; return { id: "123", username: "tincta_test", name: "Tincta" }; };
  const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
  await runner.tick(); now += 60000; await runner.tick(); assert.equal(checks, 1);
  now -= 1000; await runner.tick(); assert.equal(checks, 2);
});

test("cached polling identity never bypasses the live store profile and lease guard", async () => {
  const f = fixture(); f.artifact.steps = [f.artifact.steps[0]]; let checks = 0, changed = false;
  Object.assign(f.snapshot, { soldOut: false, revealed: false, readyForNextRound: false, randomnessRequested: false, randomnessReceived: false, totalMinted: "0", awards: [] });
  f.dependencies.verifyXAccount = async () => { checks++; return { id: "123", username: "tincta_test", name: "Tincta" }; };
  f.store.guard = async () => { if (changed) throw new Error("profile_changed_pause_and_resume"); return { profile_revision: 1, status: "running" }; };
  const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
  await runner.tick(); changed = true; f.events.length = 0;
  await assert.rejects(runner.tick(), /profile_changed_pause_and_resume/);
  assert.equal(checks, 1); assert.deepEqual(f.events, []);
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


function openingFixture(secondsUntilStart = 0) {
  const f = fixture(), template = f.artifact.steps[0];
  f.state.firstThreadComplete = true;
  f.artifact.steps = Array.from({ length: 10 }, (_, index) => ({ ...structuredClone(template), id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, "0")}` }));
  f.state.collections = {};
  const snapshots = new Map<string, ChainSnapshot>(), queried: Array<{ round: string; block: number | undefined }> = [];
  for (let index = 0; index < 10; index++) {
    const step = f.artifact.steps[index], round = `0x${(index + 1).toString(16).padStart(40, "0")}`;
    const payload = structuredClone(step.payload); payload.contract.saleStartAt = String(f.now + (index === 9 ? secondsUntilStart : -3600 * (10 - index)));
    const snapshot = { ...structuredClone(f.snapshot), round, saleStartAt: payload.contract.saleStartAt };
    if (index === 9) Object.assign(snapshot, { saleActivated: false, soldOut: false, revealed: false, readyForNextRound: false, randomnessRequested: false, randomnessReceived: false, totalMinted: "0", awards: [] });
    snapshots.set(round, snapshot);
    f.state.collections[step.id] = { payload, deployment: { ...f.deployment, round }, snapshot,
      enrollmentAt: iso(Number(payload.contract.saleStartAt) - 900), announcementAt: iso(f.now - 10000), readinessAt: iso(Number(payload.contract.saleStartAt) - 100) };
  }
  f.chain.snapshot = async (round?: string, block?: number) => { queried.push({ round: round!, block }); return { ...snapshots.get(round!)!, blockNumber: block! }; };
  f.dependencies.indexSeasonFactory = async () => { throw new Error("historical indexer must not enter the opening window"); };
  const candidate = f.state.collections[f.artifact.steps[9].id], previous = f.state.collections[f.artifact.steps[8].id];
  f.dependencies.fetch = (async () => new Response(JSON.stringify({ program: { chainId: 11155111, contractVersion: "affiliate-v9", contractAddress: candidate.deployment!.round, source: "ethereum", readiness: { canEnroll: true }, enrollmentStatus: "open" } }))) as typeof fetch;
  return { ...f, candidate, previous, snapshots, queried };
}

test("tenth collection opening skips the historical backlog and observes only candidate and predecessor at one confirmed block", async () => {
  for (const secondsUntilStart of [120, 1, 0, -60]) {
    const f = openingFixture(secondsUntilStart), originalStart = f.candidate.payload.contract.saleStartAt;
    f.dependencies.runSepoliaRehearsalStep = async () => { throw new Error("optional claims must wait"); };
    const registered: string[] = [];
    f.dependencies.registerVerifiedCollection = (async (_pool, id) => { registered.push(id); return { collectionId: id, seriesId: "series", existing: true }; }) as RunnerDependencies["registerVerifiedCollection"];
    const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
    assert.equal((await runner.tick()).mode, "running");
    assert.deepEqual(f.queried, [{ round: f.previous.deployment!.round, block: 101 }, { round: f.candidate.deployment!.round, block: 101 }]);
    assert.deepEqual(registered, [f.artifact.steps[9].id]);
    assert.equal(f.events.filter(event => event === "advance").length, secondsUntilStart <= 0 ? 1 : 0);
    assert.equal(f.candidate.payload.contract.saleStartAt, originalStart);
    assert(!f.events.some(event => event.includes("winners-revealed")), "confirmed historical winner threads need no work");
  }
});

test("an indexer finishing inside the quiet window cannot start the full historical snapshot scan", async () => {
  const f = openingFixture(121); let indexed = false;
  f.dependencies.indexSeasonFactory = (async () => { indexed = true; return { ok: true, chainId: 11155111, confirmedBlock: 101, results: [], elapsedMs: 0 }; }) as RunnerDependencies["indexSeasonFactory"];
  f.chain.provider.getBlock = async tag => ({ number: tag === "latest" ? 102 : Number(tag), hash, timestamp: f.now + (indexed ? 2 : 0) });
  const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
  await runner.tick(); assert.equal(indexed, true); assert.equal(f.queried.length, 2); assert.equal(f.events.includes("advance"), false);
});

test("routine snapshot and historical message work yields when it crosses into the quiet window", async () => {
  for (const boundary of ["snapshots", "message"] as const) {
    const f = openingFixture(150); let elapsed = 0;
    f.dependencies.now = () => (f.now + elapsed) * 1000;
    f.dependencies.indexSeasonFactory = (async () => ({ ok: true })) as unknown as RunnerDependencies["indexSeasonFactory"];
    f.chain.provider.getBlock = async tag => ({ number: tag === "latest" ? 102 : Number(tag), hash, timestamp: f.now + elapsed });
    const snapshot = f.chain.snapshot;
    f.chain.snapshot = async (address, block) => {
      const result = await snapshot(address, block);
      if (boundary === "snapshots" && f.queried.length === 10) elapsed = 40;
      return result;
    };
    f.dependencies.deliverMessage = (async (_store, _credentials, _account, key) => {
      f.events.push(`post:${key}`);
      if (boundary === "message" && key.endsWith(":collection-sold-out")) elapsed = 40;
      return "123";
    }) as RunnerDependencies["deliverMessage"];
    const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
    await runner.tick();
    assert.equal(f.queried.length, 12, "After the original scan, only the critical pair is refreshed");
    assert.deepEqual(f.queried.slice(-2).map(item => item.round), [f.previous.deployment!.round, f.candidate.deployment!.round]);
    assert.equal(f.events.includes("advance"), false);
    assert(!f.events.some(event => event.endsWith(":winners-revealed")), "Old winner/payment threads wait for the opening");
  }
});

test("urgent activation rejects changed candidate identity, deployment, terms and noncanonical evidence", async () => {
  const cases = [
    { expected: /opening_deployment_missing/, alter: (f: ReturnType<typeof openingFixture>) => { delete f.candidate.deployment; } },
    { expected: /opening_factory_mismatch/, alter: (f: ReturnType<typeof openingFixture>) => { f.candidate.deployment!.factory = round; } },
    { expected: /deployment_receipt_reorganized/, alter: (f: ReturnType<typeof openingFixture>) => { f.candidate.deployment!.deploymentBlockHash = `0x${"cd".repeat(32)}`; } },
    { expected: /opening_snapshot_mismatch/, alter: (f: ReturnType<typeof openingFixture>) => { f.snapshots.get(f.candidate.deployment!.round)!.round = round; } },
    { expected: /opening_terms_mismatch/, alter: (f: ReturnType<typeof openingFixture>) => { f.snapshots.get(f.candidate.deployment!.round)!.saleStartAt = String(f.now + 1); } },
    { expected: /opening_evidence_reorganized/, alter: (f: ReturnType<typeof openingFixture>) => { f.snapshots.get(f.candidate.deployment!.round)!.blockHash = `0x${"cd".repeat(32)}`; } },
  ];
  for (const { alter, expected } of cases) {
    const f = openingFixture(); alter(f);
    const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
    await assert.rejects(runner.tick(), expected); assert.equal(f.events.includes("advance"), false);
  }
  const f = openingFixture(); f.chain.snapshot = async address => ({ ...f.snapshots.get(address!)!, blockNumber: 100 });
  const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
  await assert.rejects(runner.tick(), /opening_snapshot_mismatch/); assert.equal(f.events.includes("advance"), false);
});

test("urgent activation fails closed for missing predecessor, announcements, timely readiness or expired deadline", async () => {
  for (const failure of ["predecessor", "draw", "reserves", "winner-root", "opening-root", "enrollment-root", "readiness", "late-readiness", "deadline"] as const) {
    const f = openingFixture(failure === "deadline" ? -61 : 0);
    if (failure === "predecessor") delete f.state.collections![f.artifact.steps[8].id];
    if (failure === "draw") f.snapshots.set(f.previous.deployment!.round, { ...f.previous.snapshot!, revealed: false });
    if (failure === "reserves") f.snapshots.set(f.previous.deployment!.round, { ...f.previous.snapshot!, readyForNextRound: false });
    if (failure === "readiness") delete f.candidate.readinessAt;
    if (failure === "late-readiness") f.candidate.readinessAt = iso(f.now + 1);
    const missing = failure === "winner-root" ? `${f.artifact.steps[8].id}:winners-revealed:root`
      : failure === "opening-root" ? `${f.artifact.steps[9].id}:affiliate-opening-soon:root`
      : failure === "enrollment-root" ? `${f.artifact.steps[9].id}:affiliate-enrollment-open:root` : "";
    const action = f.store.action; f.store.action = async key => key === missing ? null : action(key);
    const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
    await assert.rejects(runner.tick(), /opening_deployment_missing|announcement_not_confirmed|fixed_activation_window_missed_or_not_ready/, failure);
    assert.equal(f.events.includes("advance"), false, failure);
  }
});

test("quiet preparation completes a required predecessor winner thread and candidate enrollment before fixed opening", async () => {
  const f = openingFixture(60), previousKey = `${f.artifact.steps[8].id}:winners-revealed`;
  delete f.candidate.readinessAt; let winnerPosted = false;
  const action = f.store.action;
  f.store.action = async key => key === `${previousKey}:root` && !winnerPosted ? null : action(key);
  f.dependencies.deliverMessage = (async (_store, _credentials, _account, key) => { f.events.push(`post:${key}`); if (key === previousKey) winnerPosted = true; return "123"; }) as RunnerDependencies["deliverMessage"];
  const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
  await runner.tick();
  assert.equal(winnerPosted, true); assert.equal(f.candidate.readinessAt, iso(f.now));
  assert(f.events.indexOf(`post:${previousKey}`) < f.events.indexOf(`post:${f.artifact.steps[9].id}:affiliate-enrollment-open`));
  assert.equal(f.events.includes("advance"), false);
});

test("urgent scheduling preserves signed activation deadlines and accepts only canonical late confirmation on resume", async () => {
  for (const mined of [false, true]) {
    const f = openingFixture(-100), { Transaction } = await import("ethers");
    const rawTransaction = await f.wallet.signTransaction({ chainId: 11155111, type: 2, to: f.candidate.deployment!.round, nonce: 0, value: 0n, gasLimit: 21000n, maxFeePerGas: 100n, maxPriorityFeePerGas: 1n });
    const tx = { action: `${f.artifact.steps[9].id}:activate-sale`, rawTransaction, nonce: 0, hash: Transaction.from(rawTransaction).hash!, state: "submitted" as const, broadcastDeadline: f.now - 40 };
    f.journal.transactions.push(tx); delete f.dependencies.createTransactionPipeline;
    let broadcasts = 0;
    Object.assign(f.chain.provider, {
      getNetwork: async () => ({ chainId: 11155111n }), getTransactionCount: async () => 0, getTransaction: async () => null,
      getBlock: async (tag: unknown) => ({ number: tag === "latest" ? 102 : Number(tag), hash, timestamp: f.now, baseFeePerGas: 1n }),
      getTransactionReceipt: async () => mined ? { status: 1, hash: tx.hash, from: f.wallet.address, to: Transaction.from(rawTransaction).to, blockNumber: 90, blockHash: hash, gasUsed: 21000n, gasPrice: 1n } : null,
      broadcastTransaction: async () => { broadcasts++; return { hash: tx.hash }; },
    });
    if (mined) f.snapshots.set(f.candidate.deployment!.round, { ...f.candidate.snapshot!, saleActivated: true });
    const runner = await createSeasonRunner(f.store, {} as Pool, f.options, f.dependencies);
    if (mined) { await runner.tick(); assert.equal(f.journal.transactions[0].state, "confirmed"); assert.equal(f.candidate.snapshot!.saleActivated, true); }
    else await assert.rejects(runner.tick(), /Saved activation broadcast window expired/);
    assert.equal(broadcasts, 0); assert.equal(f.events.includes("advance"), false); assert.equal(f.journal.transactions[0].rawTransaction, rawTransaction);
  }
});
