import assert from "node:assert/strict";
import test from "node:test";
import { collectionEconomics, defaultLaunchForm, formFromConfiguration, payloadFromForm, useAffiliatePool } from "../components/launch/form-values.ts";
import { validateLaunchPayload } from "../lib/launch-config-validation.ts";
import { launchContractVersion, type LaunchConfiguration } from "../lib/launch-config.ts";
import { launchFixture } from "./launch-config.fixture.ts";
import { automationFixture, AUTOMATION_NOW } from "./launch-automation.fixture.ts";
import { validateAutomationPayload } from "../lib/launch-automation-validation.ts";
import { launchArtifactHash } from "../lib/launch-config-artifact.ts";
import { verifyLaunchExport } from "../lib/launch-export.ts";

test("10 or 20 positions keep a 1 ETH pool and 4 ETH operator minimum; pool percentage changes the actual budget", () => {
  const form = { ...defaultLaunchForm(), prizePercent: "50", affiliatePoolPercent: "10" };
  for (const slots of ["10", "20", "100"]) {
    form.slots = slots;
    assert.deepEqual(collectionEconomics(form), { sales: "10", prize: "5", maxCommission: "1", operatorMinimum: "4" });
    assert.deepEqual(payloadFromForm(form).contract.affiliateRatesBps, []);
  }
  form.affiliatePoolPercent = "20";
  assert.deepEqual(collectionEconomics(form), { sales: "10", prize: "5", maxCommission: "2", operatorMinimum: "3" });
  form.affiliatePoolPercent = "30";
  assert.equal(collectionEconomics(form)?.operatorMinimum, "2");
  form.affiliatePoolPercent = "50.01";
  assert.equal(collectionEconomics(form), null);
});
test("V4 snapshots preserve their economics until an explicit conversion; conversion clears the incompatible factory", () => {
  const payload = launchFixture(); payload.operations.factoryMode = "existing"; payload.operations.factoryAddress = "old-v4-factory";
  const form = formFromConfiguration({ label: "Historical", payload } as LaunchConfiguration);
  assert.equal(form.affiliatePoolPercent, null);
  assert.equal(launchContractVersion(payloadFromForm(form)), "affiliate-v4");
  const converted = useAffiliatePool(form);
  assert.equal(converted.affiliatePoolPercent, "10");
  assert.equal(converted.factoryMode, "new"); assert.equal(converted.factoryAddress, "");
  assert.equal(launchContractVersion(payloadFromForm(converted)), "affiliate-v6");
  assert.deepEqual(payload.contract.affiliateRatesBps, ["100", "200", "0"]);
});
test("V5 validates the whole revenue split and binds the version and pool in finalized exports", () => {
  const input = launchFixture(); input.contract.affiliatePoolBps = "2000"; input.contract.affiliateRatesBps = [];
  const result = validateLaunchPayload(input); assert.equal(result.valid, true, result.issues.join("; "));
  const artifact = { schemaVersion: 1 as const, contractVersion: "affiliate-v5" as const, ...result.payload! };
  const hash = launchArtifactHash(artifact);
  assert.deepEqual(verifyLaunchExport({ ...artifact, contentHash: hash }, hash), artifact);
  assert.throws(() => verifyLaunchExport({ ...artifact, contractVersion: "affiliate-v4", contentHash: hash }, hash), /version/);
  input.contract.affiliatePoolBps = "4001"; assert.equal(validateLaunchPayload(input).valid, false);
  input.contract.affiliatePoolBps = "1000"; input.contract.affiliateRatesBps = ["100", "100", "100"];
  assert.equal(validateLaunchPayload(input).valid, false);
});
test("one factory sequence cannot mix V4 rates with V5 pools", () => {
  const plan = automationFixture(); plan.steps[0].payload.contract.affiliatePoolBps = "1000"; plan.steps[0].payload.contract.affiliateRatesBps = [];
  assert.match(validateAutomationPayload(plan, AUTOMATION_NOW).issues.join("; "), /same contract version/);
  plan.steps[1].payload.contract.affiliatePoolBps = "3000"; plan.steps[1].payload.contract.affiliateRatesBps = [];
  assert.equal(validateAutomationPayload(plan, AUTOMATION_NOW).valid, true);
});
