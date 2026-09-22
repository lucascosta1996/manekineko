import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeArtifact } from "../apps/launch/test/season-runtime.fixture.ts";
import { validateLaunchPayload } from "../apps/launch/lib/launch-config-validation.ts";
import { launchArtifactHash } from "../apps/launch/lib/launch-config-artifact.ts";

const script = fileURLToPath(new URL("./prepare-launch.mjs", import.meta.url));
function finalized(version) {
  const payload = runtimeArtifact().steps[0].payload;
  payload.contract.saleStartAt = "2000000000";
  payload.contract.algorithmVersion = version === "affiliate-v10" ? "unique-rank-v6" : "unique-rank-v5";
  const validated = validateLaunchPayload(payload, { requireSeasonAppearance: true, requireWinnerCredits: true, requireAffiliateEligibility: true });
  assert.equal(validated.valid, true, validated.issues.join("; "));
  const artifact = { schemaVersion: 1, contractVersion: version, ...validated.payload };
  return { ...artifact, contentHash: launchArtifactHash(artifact) };
}
function prepare(directory, artifact, { expectedVersion = artifact.contractVersion, expectedHash = artifact.contentHash, outputName = "prepared" } = {}) {
  const manifest = join(directory, "manifest.json"), output = join(directory, outputName);
  writeFileSync(manifest, JSON.stringify(artifact));
  const result = spawnSync(process.execPath, [script, "--manifest", manifest, "--expected-hash", expectedHash, "--expected-version", expectedVersion, "--output", output], { encoding: "utf8", env: { ...process.env, MANEKINEKO_CHAIN_ID: "11155111" } });
  return { result, manifest, output, json: name => JSON.parse(readFileSync(join(output, name), "utf8")) };
}
function isolated(run) {
  const directory = mkdtempSync(join(tmpdir(), "tincta-offline-preparation-"));
  try { return run(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("offline V10 preparation emits exact frozen terms, non-broadcast environment and new registry plans", () => isolated(directory => {
  const artifact = finalized("affiliate-v10"), { result, output, json } = prepare(directory, artifact);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(output).sort(), ["affiliate-eligibility-plan.json", "deployment-plan.json", "round-v10.json", "winner-credit-plan.json"]);
  assert.deepEqual(json("round-v10.json"), artifact.contract);
  assert.equal(json("round-v10.json").algorithmVersion, "unique-rank-v6");
  assert.equal(json("round-v10.json").maxMintsPerWallet, "20");
  assert.deepEqual(json("deployment-plan.json"), {
    schemaVersion: 1, contractVersion: "affiliate-v10", algorithmVersion: "unique-rank-v6", configurationHash: artifact.contentHash, operations: artifact.operations,
    preflightEnvironment: { V10_CONFIG_PATH: join(output, "round-v10.json"), V10_PREFLIGHT_FROM: artifact.operations.deployerAddress, FACTORY_ADDRESS: "", V10_BROADCAST: "0", V10_AFFILIATE_ELIGIBILITY_ADDRESS: artifact.operations.affiliateEligibilityAddress },
    qualification: "Configuration validated offline. Live preflight, Sepolia qualification and release approval remain required.",
  });
  assert.equal(json("affiliate-eligibility-plan.json").registryVersion, "affiliate-eligibility-v5");
  assert.equal(json("winner-credit-plan.json").registryVersion, "winner-credits-v6");
  assert.equal(json("winner-credit-plan.json").cumulativeSponsorshipBudgetWei, artifact.operations.winnerCreditSponsorshipWei);
  for (const name of readdirSync(output)) assert.equal(statSync(join(output, name)).mode & 0o077, 0, "Preparation artifacts remain private");
  assert.match(result.stdout, /No transactions sent/);
}));

test("wrong expected version, hash or silently relabeled metadata reject before creating output", () => isolated(directory => {
  const artifact = finalized("affiliate-v10");
  for (const options of [{ expectedVersion: "affiliate-v9", outputName: "wrong-version" }, { expectedHash: "0".repeat(64), outputName: "wrong-hash" }]) {
    const attempted = prepare(directory, artifact, options);
    assert.notEqual(attempted.result.status, 0);
    assert.equal(existsSync(attempted.output), false);
  }
  const relabeled = structuredClone(artifact); relabeled.contract.algorithmVersion = "unique-rank-v5";
  const attempted = prepare(directory, relabeled, { outputName: "relabel" });
  assert.notEqual(attempted.result.status, 0); assert.equal(existsSync(attempted.output), false);
  assert.match(attempted.result.stderr, /Contract version does not match/);
}));

test("historical finalized V9 keeps exact terms, hash and V9 registry/env preparation", () => isolated(directory => {
  const artifact = finalized("affiliate-v9"), frozen = JSON.stringify(artifact), prepared = prepare(directory, artifact);
  assert.equal(prepared.result.status, 0, prepared.result.stderr);
  assert.deepEqual(prepared.json("round-v9.json"), artifact.contract);
  assert.equal(prepared.json("deployment-plan.json").configurationHash, artifact.contentHash);
  assert.deepEqual(prepared.json("deployment-plan.json").preflightEnvironment, { V9_CONFIG_PATH: join(prepared.output, "round-v9.json"), V9_PREFLIGHT_FROM: artifact.operations.deployerAddress, FACTORY_ADDRESS: "", V9_BROADCAST: "0", V9_AFFILIATE_ELIGIBILITY_ADDRESS: artifact.operations.affiliateEligibilityAddress });
  assert.equal(prepared.json("affiliate-eligibility-plan.json").registryVersion, "affiliate-eligibility-v4");
  assert.equal(prepared.json("winner-credit-plan.json").registryVersion, "winner-credits-v5");
  assert.equal(existsSync(join(prepared.output, "round-v10.json")), false);
  assert.equal(JSON.stringify(artifact), frozen);
  const rejected = prepare(directory, artifact, { expectedVersion: "affiliate-v10", outputName: "upgrade" });
  assert.notEqual(rejected.result.status, 0); assert.equal(existsSync(rejected.output), false);
  assert.match(rejected.result.stderr, /historical exports cannot be upgraded in place/);
}));

test("offline preparation refuses to overwrite an existing reviewed output directory", () => isolated(directory => {
  const artifact = finalized("affiliate-v10"), prepared = prepare(directory, artifact);
  assert.equal(prepared.result.status, 0, prepared.result.stderr);
  const before = readFileSync(join(prepared.output, "deployment-plan.json"), "utf8");
  const retry = prepare(directory, artifact);
  assert.notEqual(retry.result.status, 0);
  assert.equal(readFileSync(join(prepared.output, "deployment-plan.json"), "utf8"), before);
}));
