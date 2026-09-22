import assert from "node:assert/strict";
import test from "node:test";
import { defaultLaunchForm, formFromConfiguration, payloadFromForm } from "../components/launch/form-values.ts";
import { applyTemplate, defaultAutomationForm, payloadFromAutomationForm } from "../components/automations/form-values.ts";
import { launchContractVersion, type LaunchConfiguration } from "../lib/launch-config.ts";
import { validateLaunchPayload } from "../lib/launch-config-validation.ts";
import { resolveAutomationStep, validateAutomationPayload } from "../lib/launch-automation-validation.ts";
import { launchArtifactHash } from "../lib/launch-config-artifact.ts";
import { verifyLaunchExport } from "../lib/launch-export.ts";
import { launchFixture } from "./launch-config.fixture.ts";
import { automationFixture, AUTOMATION_NOW, previousObservation } from "./launch-automation.fixture.ts";
import { addSeasonAppearance, TEST_SEASON_ID } from "./launch-season.fixture.ts";

function poolFixture() {
  const payload = launchFixture(); payload.contract.affiliateRatesBps = []; payload.contract.affiliatePoolBps = "1000";
  return payload;
}

test("new collections and automation entries select V10 with a new factory", () => {
  const form = defaultLaunchForm("11155111");
  assert.equal(launchContractVersion(payloadFromForm(form)), "affiliate-v10");
  assert.equal(form.factoryMode, "new"); assert.equal(form.factoryAddress, "");
  const plan = payloadFromAutomationForm(defaultAutomationForm(automationFixture().steps.map(step => step.id), "11155111"));
  assert.ok(plan.steps.every(step => launchContractVersion(step.payload) === "affiliate-v10"));
});

test("existing V5 settings round trip without adding a marker or replacing their factory", () => {
  const payload = poolFixture(); payload.operations.factoryMode = "existing"; payload.operations.factoryAddress = "0x4444444444444444444444444444444444444444";
  const form = formFromConfiguration({ label: "V5 retained", payload } as LaunchConfiguration);
  const roundTrip = payloadFromForm(form);
  assert.deepEqual(roundTrip, payload); assert.equal(launchContractVersion(roundTrip), "affiliate-v5");
});

test("copying a V5 template into a V10 sequence preserves the V10 marker and new factory", () => {
  const form = defaultAutomationForm([automationFixture().steps[0].id], "11155111");
  const payload = poolFixture(); payload.operations.factoryMode = "existing"; payload.operations.factoryAddress = "0x4444444444444444444444444444444444444444";
  const copied = applyTemplate(form.steps[0], { label: "V5 old factory", payload } as LaunchConfiguration);
  assert.equal(copied.form.algorithmVersion, "unique-rank-v6"); assert.equal(copied.form.factoryMode, "new"); assert.equal(copied.form.factoryAddress, "");
  assert.equal(copied.form.affiliatePoolPercent, "10");
});

test("V6 finalized exports bind the algorithm marker, version and unchanged pool economics", () => {
  const input = poolFixture(); input.contract.algorithmVersion = "unique-rank-v3";
  const validation = validateLaunchPayload(input); assert.equal(validation.valid, true, validation.issues.join("; "));
  const artifact = { schemaVersion: 1 as const, contractVersion: "affiliate-v6" as const, ...validation.payload! };
  const contentHash = launchArtifactHash(artifact);
  assert.deepEqual(verifyLaunchExport({ ...artifact, contentHash }, contentHash), artifact);
  assert.throws(() => verifyLaunchExport({ ...artifact, contractVersion: "affiliate-v5", contentHash }, contentHash), /version/);
  const missingPool = launchFixture(); missingPool.contract.algorithmVersion = "unique-rank-v3";
  assert.equal(validateLaunchPayload(missingPool).valid, false);
});

test("one automation cannot mix V5 and V6 even though their economics share the same fields", () => {
  const plan = automationFixture();
  for (const step of plan.steps) { step.payload.contract.affiliateRatesBps = []; step.payload.contract.affiliatePoolBps = "1000"; }
  plan.steps[1].payload.contract.algorithmVersion = "unique-rank-v3";
  assert.match(validateAutomationPayload(plan, AUTOMATION_NOW).issues.join("; "), /same contract version/);
  plan.steps[0].payload.contract.algorithmVersion = "unique-rank-v3";
  plan.seasonId = TEST_SEASON_ID;
  for (const step of plan.steps) addSeasonAppearance(step.payload, plan.name);
  assert.equal(validateAutomationPayload(plan, AUTOMATION_NOW).valid, true);
  const context = { stepId: plan.steps[1].id, blockTimestamp: String(AUTOMATION_NOW.getTime() / 1000), previous: previousObservation() };
  assert.equal(resolveAutomationStep(plan, context).status, "pause");
  assert.equal(resolveAutomationStep(plan, { ...context, previous: { ...context.previous, contractVersion: "affiliate-v5" } }).status, "pause");
  assert.equal(resolveAutomationStep(plan, { ...context, previous: { ...context.previous, contractVersion: "affiliate-v6" } }).status, "ready_for_preflight");
});
