import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSeasonAppearance } from "@manekineko/contract-abi/season-appearance";
import { launchArtifactHash } from "../lib/launch-config-artifact.ts";
import { automationArtifactHash } from "../lib/launch-automation-artifact.ts";
import { parseLaunchDraft, requireValidLaunchPayload, validateLaunchPayload } from "../lib/launch-config-validation.ts";
import { parseAutomationDraft, requireValidAutomationPayload, resolveAutomationStep, validateAutomationPayload } from "../lib/launch-automation-validation.ts";
import { verifyLaunchExport } from "../lib/launch-export.ts";
import { launchFixture } from "./launch-config.fixture.ts";
import { AUTOMATION_NOW } from "./launch-automation.fixture.ts";
import { addSeasonAppearance, seasonFixture, TEST_SEASON_ID } from "./launch-season.fixture.ts";

test("a season admits ten independent collections and rejects an eleventh before persistence", () => {
  const plan = seasonFixture(), template = plan.steps[0];
  plan.steps = Array.from({ length: 10 }, (_, index) => ({ ...structuredClone(template), id: `aaaaaaaa-aaaa-4aaa-8aaa-${index.toString(16).padStart(12, "0")}` }));
  plan.steps[9].payload.contract.name = "Tenth collection";
  plan.steps[9].payload.contract = { ...plan.steps[9].payload.contract, ...normalizeSeasonAppearance({ seasonId: plan.seasonId, seasonName: plan.name, collectionColor: "#FFFFFF" }) };
  const prepared = requireValidAutomationPayload(plan, AUTOMATION_NOW, { requireSeasonAppearance: true });
  assert.equal(prepared.steps.length, 10);
  assert.equal(prepared.steps[9].payload.contract.name, "Tenth collection");
  assert.equal(prepared.steps[0].payload.contract.textColor, "#FFFFFF");
  assert.equal(prepared.steps[9].payload.contract.textColor, "#000000");
  plan.steps.push({ ...structuredClone(template), id: "ffffffff-ffff-4fff-8fff-ffffffffffff" });
  assert.throws(() => parseAutomationDraft(plan), /1 and 10/);
});

test("season identity and name must agree across every collection and the parent document", () => {
  for (const field of ["seasonId", "seasonName"] as const) {
    const plan = seasonFixture();
    plan.steps[1].payload.contract[field] = field === "seasonId" ? `0x${"34".repeat(32)}` : "Unrelated season";
    assert.throws(() => parseAutomationDraft(plan), /season.*ID and name/);
    assert.equal(resolveAutomationStep(plan, { stepId: plan.steps[0].id, blockTimestamp: String(AUTOMATION_NOW.getTime() / 1000) }).status, "pause");
  }
  const missing = seasonFixture(); delete missing.seasonId;
  assert.throws(() => parseAutomationDraft(missing), /season needs an ID/);
  const long = seasonFixture(); long.name = "猫".repeat(22);
  assert.throws(() => parseAutomationDraft(long), /UTF-8/);
});

test("V6 appearance is normalized before hashing without touching financial terms", () => {
  const input = addSeasonAppearance(launchFixture());
  input.contract.seasonId = TEST_SEASON_ID.toUpperCase().replace("0X", "0x");
  input.contract.seasonName = "  Moonlight season  ";
  input.contract.collectionColor = "#abcdef"; delete input.contract.textColor;
  const result = requireValidLaunchPayload(input, { requireSeasonAppearance: true });
  assert.equal(result.contract.seasonId, TEST_SEASON_ID);
  assert.equal(result.contract.seasonName, "Moonlight season");
  assert.equal(result.contract.collectionColor, "#ABCDEF");
  assert.equal(result.contract.textColor, "#000000");
  assert.equal(result.contract.mintPriceWei, input.contract.mintPriceWei);
  assert.equal(result.contract.prizeBps, input.contract.prizeBps);
  assert.equal(result.contract.affiliatePoolBps, input.contract.affiliatePoolBps);
});

test("invalid or mismatched appearance cannot become a reviewed deployment", () => {
  for (const change of [
    { seasonId: `0x${"00".repeat(32)}` }, { seasonName: "猫".repeat(22) },
    { seasonName: "Line\nBreak" }, { collectionColor: "red" },
    { collectionColor: "#fff" }, { textColor: "#000000" },
  ]) {
    const input = addSeasonAppearance(launchFixture()); Object.assign(input.contract, change);
    assert.equal(validateLaunchPayload(input, { requireSeasonAppearance: true }).valid, false);
  }
  const v5 = addSeasonAppearance(launchFixture()); delete v5.contract.algorithmVersion;
  assert.throws(() => parseLaunchDraft(v5), /V6/);
});

test("reviewed hashes bind season identity, season name, collection name and colors", () => {
  const payload = requireValidLaunchPayload(addSeasonAppearance(launchFixture()));
  const artifact = { schemaVersion: 1 as const, contractVersion: "affiliate-v6" as const, ...payload };
  const hash = launchArtifactHash(artifact);
  assert.deepEqual(verifyLaunchExport({ ...artifact, contentHash: hash }, hash), artifact);
  for (const field of ["seasonId", "seasonName", "name", "collectionColor", "textColor"] as const) {
    const changed = structuredClone(artifact); changed.contract[field] += "changed";
    assert.notEqual(launchArtifactHash(changed), hash);
    assert.throws(() => verifyLaunchExport({ ...changed, contentHash: hash }, hash));
  }
  const plan = requireValidAutomationPayload(seasonFixture(), AUTOMATION_NOW);
  const seasonArtifact = { schemaVersion: 1 as const, kind: "launch-automation" as const, contractVersion: "affiliate-v6" as const, ...plan };
  assert.notEqual(automationArtifactHash({ ...seasonArtifact, seasonId: `0x${"34".repeat(32)}` }), automationArtifactHash(seasonArtifact));
});

test("historical V6 exports remain verifiable but cannot prepare a seasonless V6 deployment", () => {
  const input = launchFixture(); input.contract.algorithmVersion = "unique-rank-v3"; input.contract.affiliatePoolBps = "1000"; input.contract.affiliateRatesBps = [];
  const payload = requireValidLaunchPayload(input);
  const artifact = { schemaVersion: 1 as const, contractVersion: "affiliate-v6" as const, ...payload };
  const hash = launchArtifactHash(artifact);
  assert.deepEqual(verifyLaunchExport({ ...artifact, contentHash: hash }, hash), artifact);
  assert.equal(validateLaunchPayload(input, { requireSeasonAppearance: true }).valid, false);
  const directory = mkdtempSync(join(tmpdir(), "manekineko-season-prepare-"));
  try {
    const manifest = join(directory, "historical.json"), output = join(directory, "prepared");
    writeFileSync(manifest, JSON.stringify({ ...artifact, contentHash: hash }));
    const script = fileURLToPath(new URL("../../../scripts/prepare-launch.mjs", import.meta.url));
    assert.throws(() => execFileSync(process.execPath, [script, "--manifest", manifest, "--expected-hash", hash, "--output", output], { stdio: "pipe" }));
    assert.equal(existsSync(output), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("drafts may be incomplete while new preparation requires season appearance", () => {
  const plan = seasonFixture(); delete plan.steps[0].payload.contract.collectionColor; delete plan.steps[0].payload.contract.textColor;
  assert.deepEqual(parseAutomationDraft(plan), plan);
  assert.equal(validateAutomationPayload(plan, AUTOMATION_NOW, { requireSeasonAppearance: true }).valid, false);
});
