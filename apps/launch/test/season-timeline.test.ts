import assert from "node:assert/strict";
import test from "node:test";
import { defaultSeasonTiming, defaultSeasonSocial, parseSeasonTiming, parseSeasonSocial, seasonTimeline, renderSeasonAnnouncement, resolveTimedAutomationStep, seasonActivationDecision } from "../lib/season-timeline.ts";
import { seasonFixture } from "./launch-season.fixture.ts";

function planFixture() {
  const plan = seasonFixture();
  plan.timing = defaultSeasonTiming(); plan.social = defaultSeasonSocial(); plan.intervalSeconds = "0"; plan.startAt = "2030-01-01T01:00:00Z";
  for (const step of plan.steps) {
    Object.assign(step.payload.contract, { algorithmVersion: "unique-rank-v4", prizeBps: "6000", secondPrizeBps: "2000", affiliatePoolBps: "2000", minAffiliateReferrals: "100", affiliatePayoutCapBps: "3000", saleStartAt: "0" });
    Object.assign(step.payload.operations, { enrollmentWindowSeconds: "900", winnerCreditsAddress: "0x4444444444444444444444444444444444444444", winnerCreditSponsorshipWei: "20000000000000000", affiliateEligibilityAddress: "0x5555555555555555555555555555555555555555" });
  }
  return plan;
}
const now = (iso: string) => String(Date.parse(iso)/1000);
test("sellout anchors exact announcement and next launch, independent of prize withdrawal", () => {
  assert.deepEqual(seasonTimeline("2030-01-01T02:00:00Z", defaultSeasonTiming()), { soldOutAt: "2030-01-01T02:00:00Z", nextAnnouncementAt: "2030-01-01T02:30:00Z", nextLaunchAt: "2030-01-01T03:00:00Z" });
  assert.throws(() => parseSeasonTiming({ ...defaultSeasonTiming(), nextAnnouncementDelaySeconds: "3600" }), /precede/);
  assert.throws(() => parseSeasonTiming({ ...defaultSeasonTiming(), missedLaunchPolicy: "reschedule" }), /pause/);
  assert.throws(() => seasonTimeline("2030-02-30T02:00:00Z", defaultSeasonTiming()), /invalid/);
});
test("templates reject unverified winners, unknown fields and missing absolute launch time", () => {
  const social = defaultSeasonSocial();
  assert.equal(parseSeasonSocial(social).enabled, false);
  assert.throws(() => parseSeasonSocial({ ...social, selloutTemplate: "Winner {{winners}}" }), /unverified/);
  assert.throws(() => parseSeasonSocial({ ...social, nextLaunchTemplate: "{{winners}} {{launchAt}}" }), /verified-draw/);
  assert.throws(() => parseSeasonSocial({ ...social, winnersTemplate: "{{privateKey}}" }), /Unknown/);
  assert.throws(() => parseSeasonSocial({ ...social, nextLaunchTemplate: "Soon!" }), /fixed launch time/);
  assert.throws(() => renderSeasonAnnouncement("{{winners}}", {}), /Missing/);
  assert.throws(() => renderSeasonAnnouncement("{{seasonName}}", { seasonName: "X".repeat(281) }), /280/);
});
test("fixed predeployment waits for draw, reserves and pauses if it cannot meet enrollment window", () => {
  const plan = planFixture(), ops = plan.steps[0].payload.operations;
  const previous = { contractVersion: "affiliate-v7" as const, stepId: plan.steps[0].id, confirmed: true, soldOut: true, prizePaid: false, soldOutAt: "2030-01-01T02:00:00Z", randomnessRevealed: true, prizesReserved: true, outcome: "pending" as const, completedAt: null, factoryAddress: "0x6666666666666666666666666666666666666666", chainId: plan.chainId, deployerAddress: ops.deployerAddress, factoryOwnerAddress: ops.factoryOwnerAddress };
  const context = { stepId: plan.steps[1].id, blockTimestamp: now("2030-01-01T02:10:00Z"), previous };
  const decision = resolveTimedAutomationStep(plan, context);
  assert.equal(decision.status, "ready_for_preflight", JSON.stringify(decision));
  if (decision.status === "ready_for_preflight") {
    assert.equal(decision.payload.contract.saleStartAt, now("2030-01-01T03:00:00Z"));
    assert.equal(BigInt(decision.mintDeadline), BigInt(now("2030-01-01T03:00:00Z"))+BigInt(plan.steps[1].payload.contract.mintDurationSeconds));
  }
  assert.equal(resolveTimedAutomationStep(plan, { ...context, previous: { ...previous, randomnessRevealed: false } }).status, "wait");
  assert.equal(resolveTimedAutomationStep(plan, { ...context, previous: { ...previous, prizesReserved: false } }).status, "wait");
  assert.equal(resolveTimedAutomationStep(plan, { ...context, blockTimestamp: now("2030-01-01T02:45:00Z") }).status, "pause");
  assert.equal(resolveTimedAutomationStep(plan, { ...context, blockTimestamp: now("2030-01-01T03:00:00Z"), previous: { ...previous, randomnessRevealed: false } }).status, "pause");
  assert.equal(resolveTimedAutomationStep(plan, { ...context, previous: { ...previous, factoryAddress: "0x0000000000000000000000000000000000000000" } }).status, "pause");
});
test("first collection must have a future fixed start; activation gates required posts", () => {
  const plan = planFixture(); plan.startAt = null;
  assert.equal(resolveTimedAutomationStep(plan, { stepId: plan.steps[0].id, blockTimestamp: now("2030-01-01T00:00:00Z") }).status, "pause");
  const evidence = { now: "2030-01-01T03:00:00Z", launchAt: "2030-01-01T03:00:00Z", deployedAndFunded: true, previousDrawVerified: true, prizesReserved: true, readinessConfirmedAt: "2030-01-01T02:59:00Z", socialEnabled: true, winnersAnnouncementConfirmed: false, nextLaunchAnnouncementConfirmed: true };
  assert.equal(seasonActivationDecision(evidence).status, "pause");
  assert.equal(seasonActivationDecision({ ...evidence, winnersAnnouncementConfirmed: true }).status, "ready");
  assert.equal(seasonActivationDecision({ ...evidence, now: "2030-01-01T03:01:01Z", winnersAnnouncementConfirmed: true }).status, "pause");
  assert.equal(seasonActivationDecision({ ...evidence, now: "2030-01-01T03:02:00Z", readinessConfirmedAt: "2030-01-01T03:01:00Z", winnersAnnouncementConfirmed: true }).status, "pause");
});
