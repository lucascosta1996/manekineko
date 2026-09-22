import assert from "node:assert/strict";
import test from "node:test";
import { collectionEconomics, defaultLaunchForm, formFromConfiguration, payloadFromForm, winnerCreditBudget } from "../components/launch/form-values.ts";
import { cloneStep, defaultAutomationForm, payloadFromAutomationForm, applyTemplate } from "../components/automations/form-values.ts";
import type { LaunchConfiguration } from "../lib/launch-config.ts";
import { parseLaunchDraft, validateLaunchPayload } from "../lib/launch-config-validation.ts";
import { validateAutomationPayload } from "../lib/launch-automation-validation.ts";
import { launchArtifactHash } from "../lib/launch-config-artifact.ts";
import { verifyLaunchExport } from "../lib/launch-export.ts";
import { launchFixture } from "./launch-config.fixture.ts";
import { automationFixture, AUTOMATION_NOW } from "./launch-automation.fixture.ts";
import { finalizeLaunchConfiguration } from "../lib/launch-config-store.ts";
import { prepareLaunchAutomation } from "../lib/launch-automation-store.ts";

const REGISTRY = "0x4444444444444444444444444444444444444444";
function v6Fixture() {
  const payload = launchFixture();
  payload.contract.algorithmVersion = "unique-rank-v3";
  payload.contract.affiliatePoolBps = "1000";
  payload.contract.affiliateRatesBps = [];
  return payload;
}
function fundedFixture() {
  const payload = v6Fixture();
  payload.operations.winnerCreditsAddress = REGISTRY;
  payload.operations.winnerCreditSponsorshipWei = "25000000000000000";
  return payload;
}

test("winner credit fields round trip with exact precision and are included in the finalized digest", () => {
  const input = fundedFixture();
  const payload = validateLaunchPayload(input, { requireWinnerCredits: true }).payload!;
  assert.ok(payload);
  const form = formFromConfiguration({ label: "Reward launch", payload: input } as LaunchConfiguration);
  assert.equal(form.winnerCreditSponsorshipEth, "0.025");
  assert.deepEqual(payloadFromForm(form), input);
  const artifact = { schemaVersion: 1 as const, contractVersion: "affiliate-v6" as const, ...payload };
  const hash = launchArtifactHash(artifact);
  assert.deepEqual(verifyLaunchExport({ ...artifact, contentHash: hash }, hash), artifact);
  const tampered = structuredClone(artifact); tampered.operations.winnerCreditSponsorshipWei = "30000000000000000";
  assert.throws(() => verifyLaunchExport({ ...tampered, contentHash: hash }, hash), /differs/);
});

test("historical V4, V5 and V6 snapshots remain unchanged while new V6 finalization requires credits", () => {
  const fixtures = [launchFixture(), v6Fixture(), v6Fixture()];
  delete fixtures[1].contract.algorithmVersion;
  for (const payload of fixtures) {
    assert.deepEqual(parseLaunchDraft(payload), payload);
    assert.deepEqual(payloadFromForm(formFromConfiguration({ label: "Historical", payload } as LaunchConfiguration)), payload);
    assert.equal(validateLaunchPayload(payload).valid, true);
    assert.equal(Object.hasOwn(payload.operations, "winnerCreditsAddress"), false);
  }
  assert.match(validateLaunchPayload(fixtures[2], { requireWinnerCredits: true }).issues.join(" "), /registry and sponsorship budget/);
  assert.equal(validateLaunchPayload(fixtures[0], { requireWinnerCredits: true }).valid, true);
  assert.equal(validateLaunchPayload(fixtures[1], { requireWinnerCredits: true }).valid, true);
  const normalized = validateLaunchPayload(fixtures[2]).payload!;
  const artifact = { schemaVersion: 1 as const, contractVersion: "affiliate-v6" as const, ...normalized };
  const hash = launchArtifactHash(artifact);
  assert.deepEqual(verifyLaunchExport({ ...artifact, contentHash: hash }, hash), artifact);
});

test("funding validation rejects partial, unsupported, invalid and insufficient plans", () => {
  for (const field of ["winnerCreditsAddress", "winnerCreditSponsorshipWei"] as const) {
    const input = fundedFixture(); delete input.operations[field];
    assert.match(validateLaunchPayload(input).issues.join(" "), /both/);
  }
  const old = fundedFixture(); delete old.contract.algorithmVersion;
  assert.match(validateLaunchPayload(old).issues.join(" "), /V6/);
  for (const value of ["", "0", "01", "-1", "1e18", " 10000000000000000", (1n << 256n).toString()]) {
    const input = fundedFixture(); input.operations.winnerCreditSponsorshipWei = value;
    assert.match(validateLaunchPayload(input).issues.join(" "), /positive canonical uint256/);
  }
  const low = fundedFixture(); low.operations.winnerCreditSponsorshipWei = "9999999999999999";
  assert.match(validateLaunchPayload(low).issues.join(" "), /at least one ticket/);
  const noRegistry = fundedFixture(); noRegistry.operations.winnerCreditsAddress = "0x0000000000000000000000000000000000000000";
  assert.match(validateLaunchPayload(noRegistry).issues.join(" "), /registry.*nonzero/);
});

test("sponsorship is separate funding, floors fractional tickets and caps capacity at supply", () => {
  const form = defaultLaunchForm("11155111");
  form.fundingEth = "0.05"; form.winnerCreditSponsorshipEth = "0.025";
  const gross = collectionEconomics(form);
  assert.deepEqual(winnerCreditBudget(form), { sponsorshipEth: "0.025", maximumClaims: "2", upfrontFundingEth: "0.075" });
  form.winnerCreditSponsorshipEth = "20";
  assert.deepEqual(winnerCreditBudget(form), { sponsorshipEth: "20", maximumClaims: "1000", upfrontFundingEth: "20.05" });
  assert.deepEqual(collectionEconomics(form), gross);
  form.mintPriceEth = "0"; assert.equal(winnerCreditBudget(form), null);
  form.mintPriceEth = "0.01"; form.winnerCreditSponsorshipEth = "-1"; assert.equal(winnerCreditBudget(form), null);
});

test("automation entries keep independent budgets and validate each V6 reward plan", () => {
  const fixture = automationFixture();
  for (const step of fixture.steps) step.payload = fundedFixture();
  fixture.steps[1].payload.operations.winnerCreditSponsorshipWei = "50000000000000000";
  assert.equal(validateAutomationPayload(fixture, AUTOMATION_NOW, { requireWinnerCredits: true }).valid, true);
  const form = defaultAutomationForm(fixture.steps.map(step => step.id), "11155111");
  form.steps[0].form.winnerCreditsAddress = REGISTRY;
  form.steps[0].form.winnerCreditSponsorshipEth = "0.03";
  const cloned = cloneStep(form.steps[0], fixture.steps[1].id, 2);
  cloned.form.winnerCreditSponsorshipEth = "0.05"; form.steps[1] = cloned;
  const plan = payloadFromAutomationForm(form);
  assert.equal(plan.steps[0].payload.operations.winnerCreditSponsorshipWei, "30000000000000000");
  assert.equal(plan.steps[1].payload.operations.winnerCreditSponsorshipWei, "50000000000000000");
  delete fixture.steps[1].payload.operations.winnerCreditsAddress;
  delete fixture.steps[1].payload.operations.winnerCreditSponsorshipWei;
  assert.match(validateAutomationPayload(fixture, AUTOMATION_NOW, { requireWinnerCredits: true }).issues.join(" "), /Collection 2.*registry and sponsorship/);
});

test("legacy templates cannot silently remove reward settings from a new V6 sequence", () => {
  const form = defaultAutomationForm([automationFixture().steps[0].id], "11155111");
  form.steps[0].form.winnerCreditsAddress = REGISTRY;
  form.steps[0].form.winnerCreditSponsorshipEth = "0.02";
  const copied = applyTemplate(form.steps[0], { label: "Legacy", payload: launchFixture() } as LaunchConfiguration);
  assert.equal(copied.form.winnerCreditsAddress, REGISTRY);
  assert.equal(copied.form.winnerCreditSponsorshipEth, "0.02");
});

test("new finalization and automation preparation reject omitted V6 reward fields before any write", async () => {
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", actor = { userId: id };
  const payload = v6Fixture();
  const plan = automationFixture(); for (const step of plan.steps) step.payload = v6Fixture();
  let writes = 0;
  const db = { async query(sql: string) {
    if (!sql.startsWith("SELECT")) { writes++; throw new Error("Unexpected mutation"); }
    return { rows: [{ id, status: "draft", revision: 1, payload, plan }] };
  } } as unknown as Parameters<typeof finalizeLaunchConfiguration>[0];
  await assert.rejects(() => finalizeLaunchConfiguration(db, actor, id, 1), error => error instanceof Error && "issues" in error && String(error.issues).includes("winner credits registry"));
  await assert.rejects(() => prepareLaunchAutomation(db, actor, id, 1, AUTOMATION_NOW), error => error instanceof Error && "issues" in error && String(error.issues).includes("winner credits registry"));
  assert.equal(writes, 0);
});
