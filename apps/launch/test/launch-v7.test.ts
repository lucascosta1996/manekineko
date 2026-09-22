import assert from "node:assert/strict";
import test from "node:test";
import { defaultLaunchForm, formFromConfiguration, payloadFromForm, collectionEconomics, twoPrizeEconomics, qualifiedAffiliateExample, useTwoPrizeModel } from "../components/launch/form-values.ts";
import { defaultAutomationForm, payloadFromAutomationForm, formFromAutomation, upgradeSeasonDraft } from "../components/automations/form-values.ts";
import { launchContractVersion, type LaunchConfiguration } from "../lib/launch-config.ts";
import type { AutomationPlan } from "../lib/launch-automation.ts";
import { parseLaunchDraft, validateLaunchPayload } from "../lib/launch-config-validation.ts";
import { parseAutomationDraft, validateAutomationPayload } from "../lib/launch-automation-validation.ts";
import { launchArtifactHash } from "../lib/launch-config-artifact.ts";
import { verifyLaunchExport } from "../lib/launch-export.ts";
import { launchFixture } from "./launch-config.fixture.ts";
import { automationFixture } from "./launch-automation.fixture.ts";

const seasonId = `0x${"12".repeat(32)}`;
function readyPayload() {
  const draft = payloadFromForm({ ...useTwoPrizeModel(defaultLaunchForm("11155111")), seasonId, seasonName: "Pilot", name: "Crimson", symbol: "TEST" });
  const historical = launchFixture();
  draft.contract = { ...historical.contract, ...draft.contract, initialOwner: historical.contract.initialOwner, enrollmentSigner: historical.contract.enrollmentSigner, randomnessFundingWei: historical.contract.randomnessFundingWei, saleStartAt: "2000000000" };
  draft.operations = { ...historical.operations, enrollmentWindowSeconds: "900", affiliateEligibilityAddress: "0x4444444444444444444444444444444444444444", winnerCreditsAddress: "0x5555555555555555555555555555555555555555", winnerCreditSponsorshipWei: "20000000000000000" };
  return draft;
}

test("Growth and Standard presets protect 4+2 ETH prizes and expose operator gross amounts", () => {
  const growth = useTwoPrizeModel(defaultLaunchForm());
  assert.equal(launchContractVersion(payloadFromForm(growth)), "affiliate-v7");
  assert.deepEqual(collectionEconomics(growth), { sales: "10", prize: "6", maxCommission: "2", operatorMinimum: "2" });
  assert.deepEqual(twoPrizeEconomics(growth), { first: "4", second: "2" });
  assert.deepEqual(collectionEconomics(useTwoPrizeModel(growth, "standard")), { sales: "10", prize: "6", maxCommission: "1", operatorMinimum: "3" });
});

test("four qualified affiliates divide equally with the common cap and separate growth reserve", () => {
  const growth = { ...useTwoPrizeModel(defaultLaunchForm()), minAffiliateReferrals: "100" };
  assert.deepEqual(qualifiedAffiliateExample(growth, 4), { each: "0.3", distributed: "1.2", growthReserve: "0.8" });
  assert.deepEqual(qualifiedAffiliateExample(growth, 4, "167"), { each: "0.5", distributed: "2", growthReserve: "0" });
  assert.deepEqual(qualifiedAffiliateExample({ ...useTwoPrizeModel(growth, "standard"), minAffiliateReferrals: "100" }, 4), { each: "0.25", distributed: "1", growthReserve: "0" });
  assert.equal(qualifiedAffiliateExample(growth, 4, "99"), null);
  assert.equal(qualifiedAffiliateExample(growth, 11), null);
});

test("V7 finalized digest binds both prizes, qualification, payout cap and absolute mint time", () => {
  const input = readyPayload();
  const validation = validateLaunchPayload(input, { requireWinnerCredits: true, requireAffiliateEligibility: true, requireSeasonAppearance: true });
  assert.equal(validation.valid, true, validation.issues.join("; "));
  const artifact = { schemaVersion: 1 as const, contractVersion: "affiliate-v7" as const, ...validation.payload! };
  const hash = launchArtifactHash(artifact);
  assert.deepEqual(verifyLaunchExport({ ...artifact, contentHash: hash }, hash), artifact);
  for (const field of ["secondPrizeBps", "minAffiliateReferrals", "affiliatePayoutCapBps", "saleStartAt"] as const) {
    const changed = structuredClone(artifact); changed.contract[field] = (BigInt(changed.contract[field]!) + 1n).toString();
    assert.throws(() => verifyLaunchExport({ ...changed, contentHash: hash }, hash));
  }
  assert.deepEqual(payloadFromForm(formFromConfiguration({ label: "V7", payload: input } as LaunchConfiguration)), input);
});

test("version-specific financial fields never silently attach to older records", () => {
  const historical = launchFixture();
  assert.deepEqual(parseLaunchDraft(historical), historical);
  historical.contract.secondPrizeBps = "2000";
  assert.throws(() => parseLaunchDraft(historical), /explicit V7/);
  const v7 = readyPayload(); delete v7.contract.minAffiliateReferrals;
  assert.throws(() => parseLaunchDraft(v7), /V7 requires/);
});

test("season draft conversion is explicit and resets incompatible deployment addresses", () => {
  const old = formFromAutomation({ plan: automationFixture() } as AutomationPlan);
  assert.equal(old.timing, undefined);
  const converted = upgradeSeasonDraft(old, () => seasonId);
  assert.equal(old.steps[0].form.algorithmVersion, undefined);
  assert.equal(converted.timing?.nextLaunchDelaySeconds, "3600");
  assert.equal(converted.timing?.nextAnnouncementDelaySeconds, "1800");
  for (const step of converted.steps) {
    assert.equal(step.form.algorithmVersion, "unique-rank-v6"); assert.equal(step.form.factoryAddress, "");
    assert.equal(step.form.affiliateEligibilityAddress, ""); assert.equal(step.form.winnerCreditsAddress, "");
  }
});

test("timed templates retain unresolved start time, reject dual clocks and require first launch headroom", () => {
  const form = defaultAutomationForm(automationFixture().steps.map(step => step.id), "11155111", seasonId);
  const plan = payloadFromAutomationForm(form); plan.name = "Pilot";
  for (const step of plan.steps) { step.payload = readyPayload(); step.payload.contract.saleStartAt = "0"; }
  assert.deepEqual(parseAutomationDraft(plan), plan);
  const now = new Date("2030-01-01T00:00:00Z");
  assert.match(validateAutomationPayload(plan, now).issues.join(" "), /future first/);
  plan.startAt = "2030-01-01T01:00:00Z";
  const valid = validateAutomationPayload(plan, now);
  assert.equal(valid.valid, true, valid.issues.join("; "));
  assert.equal(valid.payload!.steps[0].payload.contract.saleStartAt, "0");
  plan.intervalSeconds = "10";
  assert.throws(() => parseAutomationDraft(plan), /zero legacy interval/);
  plan.intervalSeconds = "0"; plan.steps[1].payload.operations.enrollmentWindowSeconds = "3600";
  assert.match(validateAutomationPayload(plan, now).issues.join(" "), /enrollment must fit/);
});
