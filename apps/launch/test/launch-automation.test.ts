import assert from "node:assert/strict";
import { test } from "node:test";
import { automationArtifactHash } from "../lib/launch-automation-artifact.ts";
import { AutomationError, type AutomationArtifact, type AutomationPayload, type AutomationRuntimeContext } from "../lib/launch-automation.ts";
import { AUTOMATION_PLAN_MAX_BYTES, parseAutomationDraft, requireValidAutomationPayload, resolveAutomationStep, validateAutomationPayload } from "../lib/launch-automation-validation.ts";
import { AUTOMATION_NOW, automationFixture, previousObservation } from "./launch-automation.fixture.ts";

function validate(plan: unknown) { return validateAutomationPayload(plan, AUTOMATION_NOW); }
function context(plan: AutomationPayload, step = 0): AutomationRuntimeContext { return { stepId: plan.steps[step].id, blockTimestamp: (AUTOMATION_NOW.getTime() / 1000).toString(), ...(step ? { previous: previousObservation() } : {}) }; }
function fixed(plan: AutomationPayload, index = 0, at = "2030-01-08T00:00:00Z") { plan.steps[index].deadline = { mode: "fixed", at }; return plan; }
function artifact(plan = automationFixture()): AutomationArtifact { return { schemaVersion: 1, kind: "launch-automation", contractVersion: "affiliate-v4", ...requireValidAutomationPayload(plan, AUTOMATION_NOW) }; }

test("collections keep independent supply, economics and round authorities within one factory series", () => {
  const plan = automationFixture();
  plan.steps[1].payload.contract.initialOwner = "0x5555555555555555555555555555555555555555";
  plan.steps[1].payload.contract.enrollmentSigner = "0x6666666666666666666666666666666666666666";
  const prepared = requireValidAutomationPayload(plan, AUTOMATION_NOW);
  assert.equal(prepared.steps[0].payload.contract.maxSupply, "1000");
  assert.equal(prepared.steps[1].payload.contract.maxSupply, "2000");
  assert.deepEqual(prepared.steps[1].payload.contract.affiliateRatesBps, ["1000", "2000", "3000"]);
  assert.equal(prepared.steps[1].payload.contract.initialOwner, plan.steps[1].payload.contract.initialOwner);
  assert.ok(prepared.steps.every(step => step.payload.contract.vrfCoordinator));
  assert.equal(plan.steps[0].payload.contract.vrfCoordinator, undefined);
});

test("incomplete terms persist as drafts but cannot be prepared", () => {
  const plan = automationFixture();
  plan.steps[1].payload.contract.initialOwner = "";
  plan.steps[1].payload.contract.randomnessFundingWei = "";
  plan.steps[1].deadline = { mode: "fixed", at: null };
  assert.deepEqual(parseAutomationDraft(plan), plan);
  assert.equal(validate(plan).valid, false);
  assert.throws(() => requireValidAutomationPayload(plan, AUTOMATION_NOW), error => error instanceof AutomationError && error.status === 422 && !!error.issues?.length);
});

for (const [label, change] of [
  ["a different collection network", (p: AutomationPayload) => { p.steps[1].payload.contract.chainId = "1"; }],
  ["a different deployer", (p: AutomationPayload) => { p.steps[1].payload.operations.deployerAddress = "0x5555555555555555555555555555555555555555"; }],
  ["a different factory owner", (p: AutomationPayload) => { p.steps[1].payload.operations.factoryOwnerAddress = "0x5555555555555555555555555555555555555555"; }],
  ["another factory mode", (p: AutomationPayload) => { p.steps[1].payload.operations.factoryMode = "existing"; }],
  ["a different resolved factory placeholder", (p: AutomationPayload) => { p.steps[1].payload.operations.factoryAddress = "0x4444444444444444444444444444444444444444"; }],
  ["an interval longer than 30 days", (p: AutomationPayload) => { p.intervalSeconds = "2592001"; }],
  ["a noncanonical interval", (p: AutomationPayload) => { p.intervalSeconds = "03600"; }],
  ["a fractional interval", (p: AutomationPayload) => { p.intervalSeconds = "1.5"; }],
  ["a fixed date that expired", (p: AutomationPayload) => { fixed(p, 0, "2029-12-31T00:00:00Z"); }],
  ["a fixed date inside the minimum chain duration", (p: AutomationPayload) => { fixed(p, 0, "2030-01-01T00:59:59Z"); }],
  ["a fixed date more than a year away", (p: AutomationPayload) => { fixed(p, 0, "2031-01-02T00:00:00Z"); }],
  ["a fixed date that leaves no enrollment window", (p: AutomationPayload) => { fixed(p, 0, "2030-01-02T00:00:00Z"); }],
  ["a later fixed date earlier than the possible sequence", (p: AutomationPayload) => { fixed(p, 1, "2030-01-02T02:00:00Z"); }],
] as const) test(`preparation rejects ${label}`, () => { const plan = automationFixture(); change(plan); assert.equal(validate(plan).valid, false); });

test("a past earliest start remains eligible; future starts bound fixed deadlines", () => {
  const plan = automationFixture();
  plan.startAt = "2029-01-01T00:00:00Z";
  assert.equal(validate(plan).valid, true);
  fixed(plan);
  plan.startAt = "2030-01-09T00:00:00Z";
  assert.equal(validate(plan).valid, false);
});

test("fixed deadline validation keeps artifact hashes stable as the clock advances", () => {
  const plan = fixed(automationFixture());
  const first = requireValidAutomationPayload(plan, AUTOMATION_NOW);
  const later = requireValidAutomationPayload(plan, new Date("2030-01-01T01:00:00Z"));
  assert.deepEqual(first, later);
  assert.equal(first.steps[0].payload.contract.mintDurationSeconds, plan.steps[0].payload.contract.mintDurationSeconds);
});

test("duration boundaries and pause policy are explicit", () => {
  const plan = automationFixture();
  plan.intervalSeconds = "0";
  assert.equal(validate(plan).valid, true);
  plan.intervalSeconds = "2592000";
  assert.equal(validate(plan).valid, true);
  assert.throws(() => parseAutomationDraft({ ...plan, failurePolicy: "skip" }), AutomationError);
});

test("draft shape bounds count, identities, fields and canonical UTC dates", () => {
  const plan = automationFixture();
  for (const input of [
    { ...plan, count: 999 }, { ...plan, privateKey: "secret" }, { ...plan, steps: [] },
    { ...plan, steps: Array(101).fill(plan.steps[0]) }, { ...plan, steps: [plan.steps[0], plan.steps[0]] },
    { ...plan, steps: [{ ...plan.steps[0], id: "not-an-id" }] },
    { ...plan, steps: [{ ...plan.steps[0], deadline: { mode: "duration", at: "2030-01-01T00:00:00Z" } }] },
    { ...plan, steps: [{ ...plan.steps[0], privateKey: "secret" }] },
    { ...plan, startAt: "2030-01-01T00:00:00.000Z" }, { ...plan, startAt: "2030-02-30T00:00:00Z" },
    { ...plan, startAt: "2030-01-01T00:00:00-03:00" }, { ...plan, startAt: "2030-01-01" },
    { ...plan, name: "x".repeat(101) }, { ...plan, intervalSeconds: "0".repeat(17) },
  ]) assert.throws(() => parseAutomationDraft(input), AutomationError);
});

test("multibyte draft size is bounded before persistence even when every field and collection count fits", () => {
  const plan = automationFixture();
  const first = plan.steps[0];
  plan.steps = Array.from({ length: 10 }, (_, index) => ({ ...structuredClone(first), id: `aaaaaaaa-aaaa-4aaa-8aaa-${index.toString(16).padStart(12, "0")}` }));
  for (const step of plan.steps) {
    step.payload.operations.notes = "界".repeat(4000);
    for (const field of ["name", "symbol", "initialOwner", "enrollmentSigner", "mintPriceWei", "randomnessFundingWei", "requestConfirmations"] as const) step.payload.contract[field] = "界".repeat(512);
  }
  assert.ok(JSON.stringify(plan).length < AUTOMATION_PLAN_MAX_BYTES, "Counting characters would incorrectly admit this draft.");
  assert.ok(new TextEncoder().encode(JSON.stringify(plan)).byteLength > AUTOMATION_PLAN_MAX_BYTES);
  assert.throws(() => parseAutomationDraft(plan), error => error instanceof AutomationError && error.code === "automation_too_large" && error.status === 413);
  for (const step of plan.steps) step.payload.operations.notes = "界".repeat(1500);
  assert.ok(new TextEncoder().encode(JSON.stringify(plan)).byteLength < AUTOMATION_PLAN_MAX_BYTES);
  assert.equal(parseAutomationDraft(plan).steps.length, 10);
});

test("preparation hashes bind the complete ordered plan including names, deadlines and per-collection terms", () => {
  const original = artifact();
  const reordered: AutomationArtifact = { ...original, steps: original.steps.map(step => ({ deadline: step.deadline, payload: step.payload, label: step.label, id: step.id })) };
  assert.equal(automationArtifactHash(original), automationArtifactHash(reordered));
  for (const change of [
    (p: AutomationArtifact) => { p.steps.reverse(); },
    (p: AutomationArtifact) => { p.name += " changed"; },
    (p: AutomationArtifact) => { p.steps[0].payload.contract.prizeBps = "5000"; },
    (p: AutomationArtifact) => { p.steps[0].deadline = { mode: "fixed", at: "2030-02-01T00:00:00Z" }; },
    (p: AutomationArtifact) => { p.intervalSeconds = "0"; },
  ]) { const changed = structuredClone(original); change(changed); assert.notEqual(automationArtifactHash(changed), automationArtifactHash(original)); }
});

test("the first collection waits for its earliest start and remains eligible afterward", () => {
  const plan = automationFixture();
  plan.startAt = "2030-01-01T01:00:00Z";
  assert.deepEqual(resolveAutomationStep(plan, context(plan)), { status: "wait", reason: "The earliest start or interval has not been reached.", earliestAt: plan.startAt });
  plan.startAt = "2029-12-31T23:00:00Z";
  assert.equal(resolveAutomationStep(plan, context(plan)).status, "ready_for_preflight");
});

test("both confirmed sellout and confirmed prize payment are mandatory for rollover", () => {
  const plan = automationFixture();
  assert.equal(resolveAutomationStep(plan, { ...context(plan, 1), previous: undefined }).status, "wait");
  for (const change of [
    { confirmed: false }, { soldOut: false }, { prizePaid: false }, { outcome: "pending" as const },
    { stepId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
  ]) assert.equal(resolveAutomationStep(plan, { ...context(plan, 1), previous: { ...previousObservation(), ...change } }).status, "wait");
  for (const outcome of ["unsold", "failed"] as const) assert.equal(resolveAutomationStep(plan, { ...context(plan, 1), previous: { ...previousObservation(), outcome } }).status, "pause");
});

test("the series reuses its confirmed factory without changing the reviewed stored placeholder", () => {
  const plan = automationFixture();
  const original = structuredClone(plan);
  const result = resolveAutomationStep(plan, context(plan, 1));
  assert.equal(result.status, "ready_for_preflight");
  if (result.status !== "ready_for_preflight") return;
  assert.equal(result.payload.operations.factoryMode, "existing");
  assert.equal(result.payload.operations.factoryAddress, previousObservation().factoryAddress);
  assert.equal(result.payload.contract.maxSupply, "2000");
  assert.deepEqual(plan, original);
});

test("confirmed series ownership and the exact existing factory must match the reviewed plan", () => {
  const plan = automationFixture();
  for (const change of [
    { chainId: "1" }, { factoryAddress: "0x0000000000000000000000000000000000000000" },
    { deployerAddress: "0x5555555555555555555555555555555555555555" },
    { factoryOwnerAddress: "0x5555555555555555555555555555555555555555" },
    { completedAt: null }, { completedAt: "2030-01-01T01:00:00Z" },
  ]) assert.equal(resolveAutomationStep(plan, { ...context(plan, 1), previous: { ...previousObservation(), ...change } }).status, "pause");
  for (const step of plan.steps) { step.payload.operations.factoryMode = "existing"; step.payload.operations.factoryAddress = "0x5555555555555555555555555555555555555555"; }
  assert.equal(resolveAutomationStep(plan, context(plan, 1)).status, "pause");
});

test("post-prize spacing uses the confirmed completion timestamp", () => {
  const plan = automationFixture();
  const result = resolveAutomationStep(plan, { ...context(plan, 1), previous: { ...previousObservation(), completedAt: "2030-01-01T00:00:00Z" } });
  assert.equal(result.status, "wait");
  if (result.status === "wait") assert.equal(result.earliestAt, "2030-01-01T01:00:00Z");
});

test("fixed deadlines become exact durations from the pinned block and are never extended", () => {
  const plan = fixed(automationFixture());
  const at = plan.steps[0].deadline.at!;
  const result = resolveAutomationStep(plan, context(plan));
  assert.equal(result.status, "ready_for_preflight");
  if (result.status !== "ready_for_preflight") return;
  assert.equal(result.mintDeadline, (Date.parse(at) / 1000).toString());
  assert.equal(BigInt(result.payload.contract.mintDurationSeconds) + BigInt(context(plan).blockTimestamp), BigInt(result.mintDeadline));
  const delayed = resolveAutomationStep(plan, { ...context(plan), blockTimestamp: (Date.parse("2030-01-07T00:00:00Z") / 1000).toString() });
  assert.equal(delayed.status, "pause");
  const expired = resolveAutomationStep(plan, { ...context(plan), blockTimestamp: (Date.parse(at) / 1000).toString() });
  assert.equal(expired.status, "pause");
});

test("completed earlier fixed deadlines do not invalidate later collections", () => {
  const plan = fixed(automationFixture(), 0, "2029-12-31T22:00:00Z");
  assert.equal(validate(plan).valid, false);
  assert.equal(resolveAutomationStep(plan, context(plan, 1)).status, "ready_for_preflight");
});

test("an expired current deadline pauses even when the preceding collection is still pending", () => {
  const plan = fixed(automationFixture(), 1, "2029-12-31T22:00:00Z");
  assert.equal(resolveAutomationStep(plan, { ...context(plan, 1), previous: undefined }).status, "pause");
  assert.equal(resolveAutomationStep(plan, { ...context(plan, 1), previous: { ...previousObservation(), outcome: "pending", prizePaid: false } }).status, "pause");
});

test("runtime refuses invalid clocks, unknown steps and unrelated observations", () => {
  const plan = automationFixture();
  for (const blockTimestamp of ["-1", "1.5", "001", "253402300800"]) assert.equal(resolveAutomationStep(plan, { ...context(plan), blockTimestamp }).status, "pause");
  assert.equal(resolveAutomationStep(plan, { ...context(plan), stepId: "missing" }).status, "pause");
  assert.equal(resolveAutomationStep(plan, { ...context(plan), previous: previousObservation() }).status, "pause");
});
