import assert from "node:assert/strict";
import test from "node:test";
import { defaultLaunchForm, payloadFromForm } from "../components/launch/form-values.ts";
import { defaultAutomationForm, payloadFromAutomationForm } from "../components/automations/form-values.ts";
import { requireCurrentCollection, requireCurrentSeason, isCurrentCollection, isCurrentSeason } from "../lib/current-launch.ts";
import { launchFixture } from "./launch-config.fixture.ts";
import { defaultSeasonSocial } from "../lib/season-timeline.ts";

test("current launch entry points accept incomplete V10 drafts without changing their terms", () => {
  const payload = payloadFromForm(defaultLaunchForm());
  assert.deepEqual(requireCurrentCollection(payload), payload);
  const form = defaultAutomationForm(["11111111-1111-4111-8111-111111111111"], "1", `0x${"12".repeat(32)}`);
  const plan = payloadFromAutomationForm(form);
  assert.deepEqual(requireCurrentSeason(plan), plan);
});

test("historical launch models cannot be written or prepared through current entry points", () => {
  const legacy = launchFixture();
  assert.equal(isCurrentCollection(legacy), false);
  assert.throws(() => requireCurrentCollection(legacy), /Historical collection settings are read-only/);
  const form = defaultAutomationForm(["11111111-1111-4111-8111-111111111111"], "1", `0x${"12".repeat(32)}`);
  const plan = payloadFromAutomationForm(form);
  delete plan.timing;
  assert.equal(isCurrentSeason(plan), false);
  assert.throws(() => requireCurrentSeason(plan));
});

test("unused legacy position rates cannot be smuggled into a current collection", () => {
  const payload = payloadFromForm(defaultLaunchForm());
  payload.contract.affiliateRatesBps = ["100"];
  assert.throws(() => requireCurrentCollection(payload), /Per-position commission rates/);
});

test("new public announcement defaults discuss collections and results without mint receipts", () => {
  const social = defaultSeasonSocial();
  assert.equal(social.enabled, false);
  assert(!Object.values(social).some(value => typeof value === "string" && value.includes("mintRevenueEth")));
  assert(social.winnersTemplate.includes("{{winners}}"));
  assert(social.nextLaunchTemplate.includes("{{launchAt}}"));
});
