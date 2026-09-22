import { normalizeSeasonAppearance } from "@manekineko/contract-abi/season-appearance";
import type { LaunchPayload } from "../lib/launch-config.ts";
import type { AutomationPayload } from "../lib/launch-automation.ts";
import { automationFixture } from "./launch-automation.fixture.ts";

export const TEST_SEASON_ID = `0x${"12".repeat(32)}`;
export function addSeasonAppearance(payload: LaunchPayload, name = "Moonlight season"): LaunchPayload {
  payload.contract = { ...payload.contract, algorithmVersion: "unique-rank-v3", affiliatePoolBps: "1000", affiliateRatesBps: [],
    ...normalizeSeasonAppearance({ seasonId: TEST_SEASON_ID, seasonName: name, collectionColor: "#234567" }) };
  return payload;
}
export function seasonFixture(): AutomationPayload {
  const plan = automationFixture();
  plan.name = "Moonlight season"; plan.seasonId = TEST_SEASON_ID;
  for (const step of plan.steps) addSeasonAppearance(step.payload, plan.name);
  return plan;
}
