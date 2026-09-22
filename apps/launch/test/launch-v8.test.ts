import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultLaunchForm, formFromConfiguration, payloadFromForm, collectionEconomics, equalPrizeEconomics, twoPrizeEconomics, qualifiedAffiliateExample, useEqualPrizeModel, useTwoPrizeModel } from "../components/launch/form-values.ts";
import { defaultAutomationForm, payloadFromAutomationForm, applyTemplate, upgradeSeasonDraft } from "../components/automations/form-values.ts";
import { launchContractVersion, type LaunchConfiguration } from "../lib/launch-config.ts";
import { parseLaunchDraft, validateLaunchPayload } from "../lib/launch-config-validation.ts";
import { validateAutomationPayload, resolveAutomationStep } from "../lib/launch-automation-validation.ts";
import { launchArtifactHash } from "../lib/launch-config-artifact.ts";
import { verifyLaunchExport } from "../lib/launch-export.ts";
import { launchFixture } from "./launch-config.fixture.ts";
import { automationFixture } from "./launch-automation.fixture.ts";

const seasonId = `0x${"12".repeat(32)}`;
function readyPayload() {
  const draft = payloadFromForm({ ...defaultLaunchForm("11155111"), seasonId, seasonName: "Pilot", name: "Crimson", symbol: "TEST" });
  draft.contract.algorithmVersion = "unique-rank-v5";
  delete draft.contract.maxMintsPerWallet; // Explicit historical V8 fixture.
  const historical = launchFixture();
  Object.assign(draft.contract, { initialOwner: historical.contract.initialOwner, enrollmentSigner: historical.contract.enrollmentSigner, randomnessFundingWei: historical.contract.randomnessFundingWei, saleStartAt: "2000000000" });
  draft.operations = { ...historical.operations, enrollmentWindowSeconds: "900", affiliateEligibilityAddress: "0x4444444444444444444444444444444444444444", winnerCreditsAddress: "0x5555555555555555555555555555555555555555", winnerCreditSponsorshipWei: "20000000000000000" };
  return draft;
}
function timedPlan() {
  const form = defaultAutomationForm(automationFixture().steps.map(step => step.id), "11155111", seasonId);
  form.name = "Pilot"; form.startInput = "2030-01-01T01:00:00";
  const plan = payloadFromAutomationForm(form);
  for (const step of plan.steps) { step.payload = readyPayload(); step.payload.contract.saleStartAt = "0"; }
  return plan;
}

test("new collections reserve six ETH as six equal one-ETH awards while preserving affiliate economics", () => {
  const form = defaultLaunchForm(), payload = payloadFromForm(form);
  assert.equal(launchContractVersion(payload), "affiliate-v10");
  assert.equal(payload.contract.winnerCount, "6");
  assert.deepEqual(form.rates, [], "Current drafts do not retain unused per-position commission settings.");
  assert.equal(form.collectionColor, "#FFFFFF", "New blank collections start with neutral Tincta artwork.");
  assert.equal(payload.contract.secondPrizeBps, undefined);
  assert.deepEqual(equalPrizeEconomics(form), { count: 6, each: "1", total: "6", percentEach: "10" });
  assert.deepEqual(collectionEconomics(form), { sales: "10", prize: "6", maxCommission: "2", operatorMinimum: "2" });
  assert.deepEqual(collectionEconomics({ ...form, affiliatePoolPercent: "10" }), { sales: "10", prize: "6", maxCommission: "1", operatorMinimum: "3" });
  assert.deepEqual(qualifiedAffiliateExample(form), { each: "0.003", distributed: "0.03", growthReserve: "1.97" });
  assert.equal(twoPrizeEconomics(form), null);
});

test("equal prize amounts support configurable counts, reject ambiguous counts and preserve exact divisibility", () => {
  for (const count of [1, 2, 3, 4, 5, 6, 8, 10]) {
    const payload = readyPayload(); payload.contract.winnerCount = String(count);
    const validation = validateLaunchPayload(payload);
    assert.equal(validation.valid, true, validation.issues.join("; "));
    const economics = equalPrizeEconomics(formFromConfiguration({ label: "V8", payload } as LaunchConfiguration));
    assert.equal(economics?.count, count);
    assert.equal(economics?.total, "6");
  }
  for (const count of ["0", "11", "-1", "1.5", "06", "", "7"]) {
    const payload = readyPayload(); payload.contract.winnerCount = count;
    assert.equal(validateLaunchPayload(payload).valid, false, `Rejected count ${count}`);
    assert.equal(equalPrizeEconomics(formFromConfiguration({ label: "invalid", payload } as LaunchConfiguration)), null);
  }
  const tooSmall = readyPayload(); tooSmall.contract.maxSupply = "5";
  assert.equal(validateLaunchPayload(tooSmall).valid, false);
  const notDivisible = readyPayload(); notDivisible.contract.prizeBps = "6001";
  assert.equal(validateLaunchPayload(notDivisible).valid, false);
});

test("V8 exported artifacts bind winner count and forbid silently reinterpreting V7 allocations", () => {
  const input = readyPayload();
  const validation = validateLaunchPayload(input, { requireWinnerCredits: true, requireAffiliateEligibility: true, requireSeasonAppearance: true });
  assert.equal(validation.valid, true, validation.issues.join("; "));
  const artifact = { schemaVersion: 1 as const, contractVersion: "affiliate-v8" as const, ...validation.payload! };
  const hash = launchArtifactHash(artifact);
  assert.deepEqual(verifyLaunchExport({ ...artifact, contentHash: hash }, hash), artifact);
  const changed = structuredClone(artifact); changed.contract.winnerCount = "3";
  assert.throws(() => verifyLaunchExport({ ...changed, contentHash: hash }, hash));
  assert.deepEqual(payloadFromForm(formFromConfiguration({ label: "V8", payload: input } as LaunchConfiguration)), input);
  const invalidV8 = structuredClone(input); invalidV8.contract.secondPrizeBps = "0";
  assert.throws(() => parseLaunchDraft(invalidV8), /V8 prizes are equal/);
  const missing = structuredClone(input); delete missing.contract.winnerCount;
  assert.throws(() => parseLaunchDraft(missing), /V8 requires/);
  const historical = payloadFromForm(useTwoPrizeModel(formFromConfiguration({ label: "V7", payload: input } as LaunchConfiguration)));
  historical.contract.winnerCount = "6";
  assert.throws(() => parseLaunchDraft(historical), /explicit V8/);
  delete historical.contract.winnerCount;
  assert.equal(launchContractVersion(historical), "affiliate-v7");
  assert.deepEqual(twoPrizeEconomics(formFromConfiguration({ label: "old", payload: historical } as LaunchConfiguration)), { first: "4", second: "2" });
});

test("current rehearsal preparation emits V8 inputs and refuses a valid historical export", () => {
  const directory = mkdtempSync(join(tmpdir(), "tincta-v8-preparation-"));
  try {
    const input = readyPayload();
    const historical = readyPayload();
    historical.contract.algorithmVersion = "unique-rank-v4";
    historical.contract.secondPrizeBps = "2000";
    delete historical.contract.winnerCount;
    for (const payload of [input, historical]) {
      const contractVersion = launchContractVersion(payload);
      const validation = validateLaunchPayload(payload, { requireSeasonAppearance: true, requireWinnerCredits: true, requireAffiliateEligibility: true });
      assert.equal(validation.valid, true, validation.issues.join("; "));
      const artifact = { schemaVersion: 1 as const, contractVersion, ...validation.payload! };
      const contentHash = launchArtifactHash(artifact);
      const manifest = join(directory, `${contractVersion}.json`);
      const output = join(directory, contractVersion);
      writeFileSync(manifest, JSON.stringify({ ...artifact, contentHash }));
      const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../../scripts/prepare-launch.mjs", import.meta.url)),
        "--expected-version", "affiliate-v8", "--manifest", manifest, "--expected-hash", contentHash, "--output", output], { encoding: "utf8" });
      if (contractVersion === "affiliate-v8") {
        assert.equal(result.status, 0, result.stderr);
        const plan = JSON.parse(readFileSync(join(output, "deployment-plan.json"), "utf8"));
        assert.equal(plan.contractVersion, "affiliate-v8");
        assert.equal(plan.algorithmVersion, "unique-rank-v5");
        assert.equal(plan.preflightEnvironment.V8_BROADCAST, "0");
        assert.equal(plan.preflightEnvironment.V8_CONFIG_PATH, join(output, "round-v8.json"));
        assert.equal(JSON.parse(readFileSync(join(output, "round-v8.json"), "utf8")).winnerCount, "6");
      } else {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Expected affiliate-v8, but this finalized export uses affiliate-v7/);
        assert.equal(existsSync(output), false);
      }
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("explicit season conversion retains ordering, identities, appearance, affiliate terms and fixed timing", () => {
  const original = defaultAutomationForm(automationFixture().steps.map(step => step.id), "11155111", seasonId);
  original.name = "Saved season";
  original.timing!.nextLaunchDelaySeconds = "7200";
  original.social!.winnersTemplate = "Confirmed awards: {{winners}}";
  for (const [index, step] of original.steps.entries()) {
    step.form = { ...useTwoPrizeModel(step.form, "standard"), name: `Original ${index}`, collectionColor: "#123456" };
  }
  const upgraded = upgradeSeasonDraft(original, () => { throw new Error("must retain season ID"); });
  assert.deepEqual(upgraded.steps.map(step => step.id), original.steps.map(step => step.id));
  assert.deepEqual(upgraded.timing, original.timing); assert.deepEqual(upgraded.social, original.social);
  for (const [index, step] of upgraded.steps.entries()) {
    assert.equal(step.form.algorithmVersion, "unique-rank-v6"); assert.equal(step.form.winnerCount, "6");
    assert.equal(step.form.secondPrizePercent, undefined); assert.equal(step.form.affiliatePoolPercent, "10");
    assert.equal(step.form.name, `Original ${index}`); assert.equal(step.form.collectionColor, "#123456");
    assert.equal(step.form.factoryAddress, ""); assert.equal(step.form.winnerCreditsAddress, ""); assert.equal(step.form.affiliateEligibilityAddress, "");
  }
  assert.equal(original.steps[0].form.algorithmVersion, "unique-rank-v4");
  assert.equal(useEqualPrizeModel(original.steps[0].form).winnerCount, "6");
});

test("templates preserve each version's prize model and existing season artwork", () => {
  const season = defaultAutomationForm([automationFixture().steps[0].id], "11155111", seasonId);
  const step = season.steps[0]; step.form.name = "Retained name"; step.form.collectionColor = "#123456";
  const v7 = { label: "Historical", payload: payloadFromForm(useTwoPrizeModel(defaultLaunchForm("11155111"))) } as LaunchConfiguration;
  const applied = applyTemplate(step, v7);
  assert.equal(applied.form.algorithmVersion, "unique-rank-v6"); assert.equal(applied.form.winnerCount, "6"); assert.equal(applied.form.secondPrizePercent, undefined);
  assert.equal(applied.form.name, "Retained name"); assert.equal(applied.form.collectionColor, "#123456");
  const historical = { ...step, form: useTwoPrizeModel(step.form) };
  const back = applyTemplate(historical, { label: "Current", payload: readyPayload() } as LaunchConfiguration);
  assert.equal(back.form.algorithmVersion, "unique-rank-v4"); assert.equal(back.form.winnerCount, undefined); assert.equal(back.form.secondPrizePercent, "20");
});

test("V8 fixed timing resolves the same immutable sellout target and rejects a V7 predecessor", () => {
  const plan = timedPlan();
  const validated = validateAutomationPayload(plan, new Date("2030-01-01T00:00:00Z"));
  assert.equal(validated.valid, true, validated.issues.join("; "));
  assert.equal(validated.payload!.steps[0].payload.contract.saleStartAt, "0");
  const ops = plan.steps[0].payload.operations;
  const previous = { contractVersion: "affiliate-v8" as const, stepId: plan.steps[0].id, confirmed: true, soldOut: true, prizePaid: false, soldOutAt: "2030-01-01T02:00:00Z", randomnessRevealed: true, prizesReserved: true, outcome: "pending" as const, completedAt: null, factoryAddress: "0x6666666666666666666666666666666666666666", chainId: plan.chainId, deployerAddress: ops.deployerAddress, factoryOwnerAddress: ops.factoryOwnerAddress };
  const context = { stepId: plan.steps[1].id, blockTimestamp: String(Date.parse("2030-01-01T02:10:00Z") / 1000), previous };
  const decision = resolveAutomationStep(plan, context);
  assert.equal(decision.status, "ready_for_preflight", JSON.stringify(decision));
  if (decision.status === "ready_for_preflight") {
    assert.equal(decision.payload.contract.winnerCount, "6");
    assert.equal(decision.payload.contract.saleStartAt, String(Date.parse("2030-01-01T03:00:00Z") / 1000));
  }
  assert.equal(resolveAutomationStep(plan, { ...context, previous: { ...previous, contractVersion: "affiliate-v7" } }).status, "pause");
  assert.equal(resolveAutomationStep(plan, { ...context, previous: { ...previous, randomnessRevealed: false } }).status, "wait");
  assert.equal(resolveAutomationStep(plan, { ...context, blockTimestamp: String(Date.parse("2030-01-01T03:00:00Z") / 1000) }).status, "pause");
});
