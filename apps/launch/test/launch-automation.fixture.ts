import type { AutomationPayload, AutomationPreviousObservation } from "../lib/launch-automation.ts";
import { launchFixture } from "./launch-config.fixture.ts";

export const AUTOMATION_NOW = new Date("2030-01-01T00:00:00Z");

export function automationFixture(): AutomationPayload {
  const first = launchFixture();
  const second = launchFixture();
  second.contract.name = "Independent second collection";
  second.contract.maxSupply = "2000";
  second.contract.prizeBps = "5000";
  second.contract.affiliateRatesBps = ["1000", "2000", "3000"];
  return {
    name: "Sepolia series", chainId: "11155111", startAt: null, intervalSeconds: "3600", failurePolicy: "pause",
    steps: [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", label: "First collection", payload: first, deadline: { mode: "duration", at: null } },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", label: "Second collection", payload: second, deadline: { mode: "duration", at: null } },
    ],
  };
}

export function previousObservation(): AutomationPreviousObservation {
  const plan = automationFixture();
  return { stepId: plan.steps[0].id, confirmed: true, soldOut: true, prizePaid: true, outcome: "completed", completedAt: "2029-12-31T23:00:00Z", factoryAddress: "0x4444444444444444444444444444444444444444", chainId: plan.chainId, deployerAddress: plan.steps[0].payload.operations.deployerAddress, factoryOwnerAddress: plan.steps[0].payload.operations.factoryOwnerAddress };
}
