/** Deterministic, fictional local data. No credentials, provider calls, sessions or database access. */
import { defaultLaunchForm, payloadFromForm } from "../components/launch/form-values.ts";
import { defaultAutomationForm, payloadFromAutomationForm } from "../components/automations/form-values.ts";
import type { LaunchConfiguration } from "../lib/launch-config.ts";
import type { AutomationPlan, AutomationSummary } from "../lib/launch-automation.ts";
import type { OperationsReport } from "../lib/collection-operations.ts";
import type { EarningsReport } from "../lib/creator-earnings.ts";
import type { RuntimeProfile, RuntimeSnapshot } from "../lib/season-runtime.ts";

export const launchFixtureTime = "2026-09-28T12:00:00.000Z";
export const launchFixtureChain = "11155111" as const;
const seasonId = `0x${"42".repeat(32)}`;
const planId = "10000000-0000-4000-8000-000000000001";
const collectionId = "20000000-0000-4000-8000-000000000001";
const stepId = "30000000-0000-4000-8000-000000000001";
const runId = "40000000-0000-4000-8000-000000000001";
const address = `0x${"12".repeat(20)}`;
const form = { ...defaultLaunchForm(launchFixtureChain), label: "Visual study — Lilac", name: "Lilac", seasonName: "Color study", seasonId, collectionColor: "#D9C7EB", initialOwner: `0x${"23".repeat(20)}`, deployerAddress: `0x${"34".repeat(20)}`, factoryOwnerAddress: `0x${"34".repeat(20)}`, enrollmentSigner: `0x${"45".repeat(20)}`, winnerCreditsAddress: `0x${"56".repeat(20)}`, affiliateEligibilityAddress: `0x${"67".repeat(20)}`, fundingEth: "0.01", saleStartAt: String(Date.parse("2026-09-29T12:00:00Z") / 1000) };
export const launchFixtureConfiguration: LaunchConfiguration = { id: collectionId, label: form.label, payload: payloadFromForm(form), status: "draft", revision: 1, contentHash: null, createdAt: launchFixtureTime, updatedAt: launchFixtureTime, finalizedAt: null, createdBy: "visual.operator", updatedBy: "visual.operator", finalizedBy: null };
const automationForm = defaultAutomationForm([stepId], launchFixtureChain, seasonId);
automationForm.name = "Color study";
automationForm.startInput = "2026-09-29T12:00";
automationForm.steps[0].form = form;
export const launchFixtureAutomation: AutomationPlan = { id: planId, plan: payloadFromAutomationForm(automationForm), status: "draft", revision: 1, contentHash: null, createdAt: launchFixtureTime, updatedAt: launchFixtureTime, preparedAt: null, createdBy: "visual.operator", updatedBy: "visual.operator", preparedBy: null };
const summary: AutomationSummary = { id: planId, currentModel: true, name: "Color study", chainId: launchFixtureChain, status: "draft", revision: 1, collectionCount: 1, createdAt: launchFixtureTime, updatedAt: launchFixtureTime, preparedAt: null, contentHash: null };
export const launchFixtureOperations: OperationsReport = { chainId: launchFixtureChain, checkedAt: launchFixtureTime, partial: false, seasons: [], collections: [{ id: collectionId, name: "Lilac", season: "Color study", automationId: planId, runId, runStatus: "paused", lastError: null, superseded: false, version: "affiliate-v10", address, phase: "awaiting_prize", updatedAt: launchFixtureTime, enrollmentAt: "2026-09-27T10:00:00Z", saleStartAt: "2026-09-27T12:00:00Z", deadline: "2026-09-28T12:00:00Z", minted: 1000, supply: 1000, winnerCount: 6, awards: Array.from({ length: 6 }, (_, index) => ({ claimed: index < 2 })), circulatingSupply: 1000, blockNumber: 123456, blockHash: `0x${"ab".repeat(32)}`, blockTime: launchFixtureTime, lastProjectionAt: launchFixtureTime, observationError: null, expectedCollections: 2, soldOutAt: "2026-09-27T13:00:00Z", prizesPaid: false, publicOrigin: null, verification: "Verified local fixture" }, { id: "20000000-0000-4000-8000-000000000002", name: "Sage", season: "Color study", automationId: planId, runId, runStatus: "paused", lastError: null, superseded: false, version: "affiliate-v10", address: null, phase: null, updatedAt: launchFixtureTime, enrollmentAt: "2026-09-29T10:00:00Z", saleStartAt: "2026-09-29T12:00:00Z", deadline: "2026-09-30T12:00:00Z", minted: null, supply: 1000, expectedCollections: 2, soldOutAt: null, prizesPaid: false, publicOrigin: null, verification: "Not deployed" }] };
const earnings: EarningsReport = { chainId: launchFixtureChain, blockNumber: 123456, blockHash: `0x${"ab".repeat(32)}`, blockTime: launchFixtureTime, status: "available", checkedAt: launchFixtureTime, error: null, rows: [{ id: collectionId, name: "Lilac", seasonName: "Color study", chainId: launchFixtureChain, address, version: "affiliate-v10", roundId: "1", error: null, balance: { owner: form.initialOwner, ownerIsContract: false, runtimeHash: `0x${"ab".repeat(32)}`, withdrawableWei: "1000000000000000000", withdrawals: { ordinaryWithdrawnWei: "500000000000000000", historyError: null }, growthReserveWei: "200000000000000000", growthAvailableWei: "200000000000000000", mintRevenueWei: "10000000000000000000" } }], totals: { withdrawableWei: "1000000000000000000", growthAvailableWei: "200000000000000000", availableCollections: 1, verifiedCollections: 1 } };
const profile: RuntimeProfile = { chainId: launchFixtureChain, revision: 1, enabled: false, handle: "visual_fixture", expectedAccountId: "1234567890", publicBaseUrl: "https://tincta.example", credentialsConfigured: false, updatedAt: launchFixtureTime };
const runtime: RuntimeSnapshot = { run: { id: runId, automationId: planId, automationRevision: 1, preparedHash: "42".repeat(32), chainId: launchFixtureChain, profileRevision: 1, status: "paused", desiredState: "paused", revision: 1, lastError: null, heartbeatAt: launchFixtureTime, createdAt: launchFixtureTime, updatedAt: launchFixtureTime }, profile, encryptionConfigured: false, events: [{ id: "fixture-event", event: "paused", message: "Local visual fixture. No season has been operated.", createdAt: launchFixtureTime }], actions: [{ id: "fixture-action", actionKey: "winner-announcement", kind: "social", status: "failed", txHash: null, postId: null, lastError: "Publishing unavailable. Review account permissions before retrying.", createdAt: launchFixtureTime, updatedAt: launchFixtureTime }] };

export function launchFixtureResponse(input: string, { method = "GET", empty = false }: { method?: string; empty?: boolean } = {}): { status: number; body: unknown } {
  const url = new URL(input, "http://127.0.0.1");
  if (method !== "GET") return { status: 409, body: { message: "Visual fixture: writes are intercepted. Your entered values are retained." } };
  const pathname = url.pathname;
  let body: unknown;
  if (pathname === "/api/launch/configurations") body = { configurations: empty ? [] : [launchFixtureConfiguration] };
  else if (pathname === "/api/launch/automations") body = { automations: empty ? [] : [summary], nextCursor: null };
  else if (pathname.endsWith("/runtime/previews")) body = { previews: [] };
  else if (pathname.endsWith("/runtime")) body = empty ? { ...runtime, run: null, events: [], actions: [] } : runtime;
  else if (pathname === `/api/launch/automations/${planId}`) body = { automation: launchFixtureAutomation };
  else if (pathname.startsWith("/api/launch/runtime/profiles/")) body = { profile: empty ? null : profile, encryptionConfigured: false };
  else if (pathname === "/api/launch/collections/operations") body = empty ? { ...launchFixtureOperations, collections: [] } : launchFixtureOperations;
  else if (pathname === "/api/launch/earnings") body = empty ? { ...earnings, status: "empty", rows: [], totals: { withdrawableWei: "0", growthAvailableWei: "0", availableCollections: 0, verifiedCollections: 0 } } : earnings;
  else return { status: 404, body: { message: "Unknown local visual fixture." } };
  return { status: 200, body };
}
