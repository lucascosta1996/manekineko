import assert from "node:assert/strict";
import test from "node:test";
import { defaultLaunchForm, formFromConfiguration, payloadFromForm } from "../components/launch/form-values.ts";
import { applyTemplate, cloneStep, defaultAutomationForm, payloadFromAutomationForm } from "../components/automations/form-values.ts";
import { type LaunchConfiguration, launchContractVersion } from "../lib/launch-config.ts";
import { parseLaunchDraft, validateLaunchPayload } from "../lib/launch-config-validation.ts";
import { resolveAutomationStep, validateAutomationPayload } from "../lib/launch-automation-validation.ts";
import { canonicalLaunchJson, launchArtifactHash } from "../lib/launch-config-artifact.ts";
import { verifyLaunchExport } from "../lib/launch-export.ts";
import { finalizeLaunchConfiguration } from "../lib/launch-config-store.ts";
import { prepareLaunchAutomation } from "../lib/launch-automation-store.ts";
import { launchFixture } from "./launch-config.fixture.ts";
import { automationFixture, AUTOMATION_NOW } from "./launch-automation.fixture.ts";

const REGISTRY = "0x5555555555555555555555555555555555555555";
const OTHER_REGISTRY = "0x6666666666666666666666666666666666666666";
function v6Fixture() {
  const payload = launchFixture();
  payload.contract.algorithmVersion = "unique-rank-v3";
  payload.contract.affiliatePoolBps = "1000";
  payload.contract.affiliateRatesBps = [];
  payload.operations.winnerCreditsAddress = "0x4444444444444444444444444444444444444444";
  payload.operations.winnerCreditSponsorshipWei = "25000000000000000";
  return payload;
}

test("new V6 forms include the eligibility registry and incomplete drafts remain editable", () => {
  const form = defaultLaunchForm("11155111");
  assert.equal(form.affiliateEligibilityAddress, "");
  const draft = payloadFromForm(form);
  assert.equal(parseLaunchDraft(draft).operations.affiliateEligibilityAddress, "");
  const input = v6Fixture(); input.operations.affiliateEligibilityAddress = "";
  assert.match(validateLaunchPayload(input).issues.join(" "), /Affiliate eligibility registry.*nonzero/);
});

test("eligibility address round trips, binds the export digest and does not change mint economics", () => {
  const input = v6Fixture(); input.operations.affiliateEligibilityAddress = REGISTRY;
  const payload = validateLaunchPayload(input, { requireWinnerCredits: true, requireAffiliateEligibility: true }).payload!;
  assert.ok(payload);
  assert.deepEqual(payloadFromForm(formFromConfiguration({ label: "Holder enrollment", payload: input } as LaunchConfiguration)), input);
  const artifact = { schemaVersion: 1 as const, contractVersion: "affiliate-v6" as const, ...payload };
  const hash = launchArtifactHash(artifact);
  assert.deepEqual(verifyLaunchExport({ ...artifact, contentHash: hash }, hash), artifact);
  const changed = structuredClone(artifact); changed.operations.affiliateEligibilityAddress = OTHER_REGISTRY;
  assert.throws(() => verifyLaunchExport({ ...changed, contentHash: launchArtifactHash(changed) }, hash), /differs/);
  assert.deepEqual(payload.contract, validateLaunchPayload(v6Fixture()).payload!.contract);
});

test("historical V4, V5 and V6 snapshots keep the same exact export bytes without inserted fields", () => {
  const fixtures = [launchFixture(), launchFixture(), v6Fixture()];
  fixtures[1].contract.affiliateRatesBps = []; fixtures[1].contract.affiliatePoolBps = "1000";
  for (const input of fixtures) {
    const payload = validateLaunchPayload(input).payload!;
    const artifact = { schemaVersion: 1 as const, contractVersion: launchContractVersion(payload), ...payload };
    const before = canonicalLaunchJson(artifact), hash = launchArtifactHash(artifact);
    const verified = verifyLaunchExport({ ...artifact, contentHash: hash }, hash);
    assert.equal(canonicalLaunchJson(verified), before);
    assert.equal(Object.hasOwn(verified.operations, "affiliateEligibilityAddress"), false);
    assert.deepEqual(payloadFromForm(formFromConfiguration({ label: "Historical", payload: input } as LaunchConfiguration)), input);
  }
  assert.equal(validateLaunchPayload(fixtures[0], { requireAffiliateEligibility: true }).valid, true);
  assert.equal(validateLaunchPayload(fixtures[1], { requireAffiliateEligibility: true }).valid, true);
  assert.match(validateLaunchPayload(fixtures[2], { requireAffiliateEligibility: true }).issues.join(" "), /canonical affiliate eligibility registry/);
});

test("only nonzero V6 registry addresses are accepted and bypass switches remain unsupported", () => {
  for (const value of ["", "not-an-address", "0x0000000000000000000000000000000000000000", `${REGISTRY}00`]) {
    const payload = v6Fixture(); payload.operations.affiliateEligibilityAddress = value;
    assert.match(validateLaunchPayload(payload).issues.join(" "), /Affiliate eligibility registry.*nonzero/);
  }
  const old = launchFixture(); old.operations.affiliateEligibilityAddress = REGISTRY;
  assert.match(validateLaunchPayload(old).issues.join(" "), /V6/);
  const payload = v6Fixture(); payload.operations.affiliateEligibilityAddress = REGISTRY;
  assert.throws(() => parseLaunchDraft({ ...payload, operations: { ...payload.operations, openAffiliateEnrollment: true } }), /unsupported field/);
});

test("templates and duplicated entries preserve the sequence registry and serialization inherits collection 01", () => {
  const plan = defaultAutomationForm(automationFixture().steps.map(step => step.id), "11155111");
  const first = plan.steps[0]; first.form.affiliateEligibilityAddress = REGISTRY;
  const cloned = cloneStep(first, plan.steps[1].id, 2);
  assert.equal(cloned.form.affiliateEligibilityAddress, REGISTRY);
  const foreign = v6Fixture(); foreign.operations.affiliateEligibilityAddress = OTHER_REGISTRY;
  assert.equal(applyTemplate(first, { label: "Another registry", payload: foreign } as LaunchConfiguration).form.affiliateEligibilityAddress, REGISTRY);
  assert.equal(applyTemplate(first, { label: "Legacy", payload: launchFixture() } as LaunchConfiguration).form.affiliateEligibilityAddress, REGISTRY);
  plan.steps[1].form.affiliateEligibilityAddress = OTHER_REGISTRY;
  assert.ok(payloadFromAutomationForm(plan).steps.every(step => step.payload.operations.affiliateEligibilityAddress === REGISTRY));
});

test("validation and runtime planning reject a sequence that changes its canonical registry", () => {
  const plan = automationFixture();
  for (const step of plan.steps) { step.payload = v6Fixture(); step.payload.operations.affiliateEligibilityAddress = REGISTRY; }
  assert.equal(validateAutomationPayload(plan, AUTOMATION_NOW, { requireAffiliateEligibility: true }).valid, true);
  plan.steps[1].payload.operations.affiliateEligibilityAddress = OTHER_REGISTRY;
  assert.match(validateAutomationPayload(plan, AUTOMATION_NOW).issues.join(" "), /inherit.*canonical affiliate eligibility registry/);
  const decision = resolveAutomationStep(plan, { stepId: plan.steps[0].id, blockTimestamp: String(AUTOMATION_NOW.getTime() / 1000) });
  assert.equal(decision.status, "pause");
  assert.match("reason" in decision ? decision.reason : "", /canonical affiliate eligibility registry/);
  delete plan.steps[1].payload.operations.affiliateEligibilityAddress;
  assert.match(validateAutomationPayload(plan, AUTOMATION_NOW, { requireAffiliateEligibility: true }).issues.join(" "), /Collection 2.*canonical affiliate eligibility registry/);
});

test("new V6 finalization and automation preparation reject omitted eligibility before database writes", async () => {
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", actor = { userId: id };
  const payload = v6Fixture(), plan = automationFixture();
  for (const step of plan.steps) step.payload = v6Fixture();
  let writes = 0;
  const db = { async query(sql: string) {
    if (!sql.startsWith("SELECT")) { writes++; throw new Error("Unexpected mutation"); }
    return { rows: [{ id, status: "draft", revision: 1, payload, plan }] };
  } } as unknown as Parameters<typeof finalizeLaunchConfiguration>[0];
  const eligibilityIssue = (error: unknown) => error instanceof Error && "issues" in error && String(error.issues).includes("canonical affiliate eligibility registry");
  await assert.rejects(() => finalizeLaunchConfiguration(db, actor, id, 1), eligibilityIssue);
  await assert.rejects(() => prepareLaunchAutomation(db, actor, id, 1, AUTOMATION_NOW), eligibilityIssue);
  assert.equal(writes, 0);
});
