import { defaultAutomationForm, payloadFromAutomationForm } from "../components/automations/form-values.ts";
import { launchFixture } from "./launch-config.fixture.ts";
import type { AutomationArtifact, AutomationPlan } from "../lib/launch-automation.ts";

export function runtimeArtifact(): AutomationArtifact {
  const form = defaultAutomationForm(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"], "11155111", `0x${"12".repeat(32)}`);
  form.name = "Moonlight Study"; form.startInput = "2035-01-01T02:00:00";
  const plan = payloadFromAutomationForm(form), prior = launchFixture();
  plan.social!.enabled = true;
  for (const [index, step] of plan.steps.entries()) {
    Object.assign(step.payload.contract, { algorithmVersion: "unique-rank-v5", name: ["Cinder Study", "Amber Trace"][index], symbol: "TEST", initialOwner: prior.contract.initialOwner, enrollmentSigner: prior.contract.enrollmentSigner, randomnessFundingWei: prior.contract.randomnessFundingWei });
    step.payload.operations = { ...prior.operations, enrollmentWindowSeconds: "900", affiliateEligibilityAddress: "0x4444444444444444444444444444444444444444", winnerCreditsAddress: "0x5555555555555555555555555555555555555555", winnerCreditSponsorshipWei: "20000000000000000" };
  }
  return { schemaVersion: 1, kind: "launch-automation", contractVersion: "affiliate-v9", ...plan };
}
export function runtimePlan(): AutomationPlan {
  const { schemaVersion: _schema, kind: _kind, contractVersion: _version, ...plan } = runtimeArtifact();
  return { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", plan, status: "prepared", revision: 2, contentHash: "a".repeat(64), seasonOrder: 1, createdAt: "2030-01-01T00:00:00Z", updatedAt: "2030-01-01T00:00:00Z", preparedAt: "2030-01-01T00:00:00Z", createdBy: "operator", updatedBy: "operator", preparedBy: "operator" };
}
