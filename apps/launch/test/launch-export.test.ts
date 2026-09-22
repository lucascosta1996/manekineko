import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, statSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { requireValidLaunchPayload } from "../lib/launch-config-validation.ts";
import { launchArtifactHash } from "../lib/launch-config-artifact.ts";
import { verifyLaunchExport } from "../lib/launch-export.ts";
import { launchFixture } from "./launch-config.fixture.ts";
import type { LaunchArtifact } from "../lib/launch-config.ts";
import { addSeasonAppearance } from "./launch-season.fixture.ts";

function fixture(version: "v4" | "v5" | "v6" = "v4") {
  const input = launchFixture();
  if (version !== "v4") { input.contract.affiliateRatesBps = []; input.contract.affiliatePoolBps = "2000"; }
  if (version === "v6") addSeasonAppearance(input);
  const artifact: LaunchArtifact = { schemaVersion: 1, contractVersion: version === "v6" ? "affiliate-v6" : version === "v5" ? "affiliate-v5" : "affiliate-v4", ...requireValidLaunchPayload(input) };
  const contentHash = launchArtifactHash(artifact);
  return { artifact, contentHash, exported: { ...artifact, contentHash } };
}

test("offline preparation verifies the separate trusted digest and rejects self-rehashed changes", () => {
  const { artifact, contentHash, exported } = fixture();
  assert.deepEqual(verifyLaunchExport(exported, contentHash), artifact);
  const changed = structuredClone(artifact); changed.contract.prizeBps = "5000";
  assert.throws(() => verifyLaunchExport({ ...changed, contentHash: launchArtifactHash(changed) }, contentHash), /differs/);
  assert.throws(() => verifyLaunchExport(exported, ""), /expected hash/);
  assert.throws(() => verifyLaunchExport({ ...exported, privateKey: "not-allowed" }, contentHash), /Unsupported/);
  const notFinal = structuredClone(exported); delete notFinal.contract.keyHash;
  assert.throws(() => verifyLaunchExport(notFinal, contentHash), /normalized/);
});

for (const version of ["v4", "v5", "v6"] as const) test(`offline CLI produces exact ${version} input and explicit read-only deployment environment without overwriting`, () => {
  const { artifact, contentHash, exported } = fixture(version);
  const directory = mkdtempSync(join(tmpdir(), "manekineko-launch-prepare-test-"));
  try {
    const manifest = join(directory, "export.json"), output = join(directory, "prepared");
    writeFileSync(manifest, JSON.stringify(exported));
    const script = fileURLToPath(new URL("../../../scripts/prepare-launch.mjs", import.meta.url));
    const args = [script, "--manifest", manifest, "--expected-hash", contentHash, "--output", output];
    execFileSync(process.execPath, args, { stdio: "pipe" });
    assert.deepEqual(JSON.parse(readFileSync(join(output, `round-${version}.json`), "utf8")), artifact.contract);
    const plan = JSON.parse(readFileSync(join(output, "deployment-plan.json"), "utf8"));
    assert.equal(plan.preflightEnvironment[`${version.toUpperCase()}_BROADCAST`], "0");
    assert.equal(plan.preflightEnvironment.FACTORY_ADDRESS, "");
    assert.equal(plan.preflightEnvironment[`${version.toUpperCase()}_PREFLIGHT_FROM`], artifact.operations.deployerAddress);
    assert.equal(plan.configurationHash, contentHash);
    assert.equal(Object.hasOwn(plan.preflightEnvironment, "V6_AFFILIATE_ELIGIBILITY_ADDRESS"), false);
    assert.equal(existsSync(join(output, "winner-credit-plan.json")), false, "Historical snapshots do not silently opt in to winner credits.");
    assert.deepEqual(readdirSync(output).sort(), ["deployment-plan.json", `round-${version}.json`].sort());
    assert.equal(statSync(join(output, `round-${version}.json`)).mode & 0o777, 0o600);
    assert.throws(() => execFileSync(process.execPath, args, { stdio: "pipe" }));
    assert.equal(JSON.parse(readFileSync(join(output, `round-${version}.json`), "utf8")).prizeBps, artifact.contract.prizeBps);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("offline CLI binds the V6 winner credit funding plan to the finalized registry and cumulative budget", () => {
  const original = fixture("v6").artifact;
  const input = structuredClone(original);
  input.operations.winnerCreditsAddress = "0x4444444444444444444444444444444444444444";
  input.operations.winnerCreditSponsorshipWei = "25000000000000001";
  const artifact: LaunchArtifact = { schemaVersion: 1, contractVersion: "affiliate-v6", ...requireValidLaunchPayload({ contract: input.contract, operations: input.operations }, { requireWinnerCredits: true }) };
  const contentHash = launchArtifactHash(artifact);
  const directory = mkdtempSync(join(tmpdir(), "manekineko-winner-credit-prepare-test-"));
  try {
    const manifest = join(directory, "export.json"), output = join(directory, "prepared");
    writeFileSync(manifest, JSON.stringify({ ...artifact, contentHash }));
    const script = fileURLToPath(new URL("../../../scripts/prepare-launch.mjs", import.meta.url));
    const args = [script, "--manifest", manifest, "--expected-hash", contentHash, "--output", output];
    execFileSync(process.execPath, args, { stdio: "pipe" });
    const creditFile = join(output, "winner-credit-plan.json");
    const plan = JSON.parse(readFileSync(creditFile, "utf8"));
    assert.equal(plan.schemaVersion, 1);
    assert.equal(plan.configurationHash, contentHash);
    assert.equal(plan.chainId, "11155111");
    assert.equal(plan.registryAddress, artifact.operations.winnerCreditsAddress);
    assert.equal(plan.cumulativeSponsorshipBudgetWei, "25000000000000001", "Cumulative funding retains exact wei precision.");
    assert.equal(plan.requiredBeforeSaleActivation, true);
    assert.equal(statSync(creditFile).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(readFileSync(join(output, "round-v6.json"), "utf8")), original.contract, "Sponsorship does not alter the prize, affiliate pool or normal mint price.");
    const deployment = JSON.parse(readFileSync(join(output, "deployment-plan.json"), "utf8"));
    assert.equal(deployment.preflightEnvironment.V6_BROADCAST, "0");
    assert.deepEqual(deployment.operations, artifact.operations);
    assert.equal(Object.hasOwn(deployment.preflightEnvironment, "V6_AFFILIATE_ELIGIBILITY_ADDRESS"), false);
    assert.deepEqual(readdirSync(output).sort(), ["deployment-plan.json", "round-v6.json", "winner-credit-plan.json"]);
    assert.throws(() => execFileSync(process.execPath, args, { stdio: "pipe" }));
    assert.equal(JSON.parse(readFileSync(creditFile, "utf8")).cumulativeSponsorshipBudgetWei, "25000000000000001");

    const changed = structuredClone(artifact);
    changed.operations.winnerCreditSponsorshipWei = "50000000000000000";
    writeFileSync(manifest, JSON.stringify({ ...changed, contentHash: launchArtifactHash(changed) }));
    const untrustedOutput = join(directory, "untrusted");
    assert.throws(() => execFileSync(process.execPath, [script, "--manifest", manifest, "--expected-hash", contentHash, "--output", untrustedOutput], { stdio: "pipe" }));
    assert.equal(existsSync(untrustedOutput), false, "Changed funding cannot create a plan under the trusted configuration hash.");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("offline CLI binds holder eligibility to the trusted registry and never accepts an open-enrollment override", () => {
  const original = fixture("v6").artifact;
  const operations = {
    ...original.operations,
    winnerCreditsAddress: "0x4444444444444444444444444444444444444444",
    winnerCreditSponsorshipWei: "25000000000000000",
    affiliateEligibilityAddress: "0x5555555555555555555555555555555555555555",
  };
  const payload = requireValidLaunchPayload({ contract: original.contract, operations }, { requireWinnerCredits: true, requireAffiliateEligibility: true });
  const artifact: LaunchArtifact = { schemaVersion: 1, contractVersion: "affiliate-v6", ...payload };
  const contentHash = launchArtifactHash(artifact);
  const directory = mkdtempSync(join(tmpdir(), "manekineko-eligibility-prepare-test-"));
  try {
    const manifest = join(directory, "export.json"), output = join(directory, "prepared");
    const script = fileURLToPath(new URL("../../../scripts/prepare-launch.mjs", import.meta.url));
    writeFileSync(manifest, JSON.stringify({ ...artifact, contentHash }));
    execFileSync(process.execPath, [script, "--manifest", manifest, "--expected-hash", contentHash, "--output", output], { stdio: "pipe" });
    const planPath = join(output, "affiliate-eligibility-plan.json");
    const eligibility = JSON.parse(readFileSync(planPath, "utf8"));
    assert.equal(eligibility.configurationHash, contentHash);
    assert.equal(eligibility.registryAddress, operations.affiliateEligibilityAddress);
    assert.equal(eligibility.chainId, original.contract.chainId);
    assert.equal(eligibility.requiredBeforeEnrollment, true);
    assert.equal(eligibility.policy, "previous-completed-nft-after-first-collection");
    assert.equal(statSync(planPath).mode & 0o777, 0o600);
    const deployment = JSON.parse(readFileSync(join(output, "deployment-plan.json"), "utf8"));
    assert.equal(deployment.preflightEnvironment.V6_AFFILIATE_ELIGIBILITY_ADDRESS, operations.affiliateEligibilityAddress);
    assert.equal(deployment.preflightEnvironment.V6_BROADCAST, "0");
    assert.deepEqual(JSON.parse(readFileSync(join(output, "round-v6.json"), "utf8")), original.contract);
    assert.deepEqual(readdirSync(output).sort(), ["affiliate-eligibility-plan.json", "deployment-plan.json", "round-v6.json", "winner-credit-plan.json"]);

    const changed = structuredClone(artifact);
    changed.operations.affiliateEligibilityAddress = "0x6666666666666666666666666666666666666666";
    writeFileSync(manifest, JSON.stringify({ ...changed, contentHash: launchArtifactHash(changed) }));
    const changedOutput = join(directory, "changed");
    assert.throws(() => execFileSync(process.execPath, [script, "--manifest", manifest, "--expected-hash", contentHash, "--output", changedOutput], { stdio: "pipe" }));
    assert.equal(existsSync(changedOutput), false);

    const bypass = { ...artifact, operations: { ...artifact.operations, openAffiliateEnrollment: true } };
    const bypassHash = launchArtifactHash(bypass);
    writeFileSync(manifest, JSON.stringify({ ...bypass, contentHash: bypassHash }));
    const bypassOutput = join(directory, "bypass");
    assert.throws(() => execFileSync(process.execPath, [script, "--manifest", manifest, "--expected-hash", bypassHash, "--output", bypassOutput], { stdio: "pipe" }));
    assert.equal(existsSync(bypassOutput), false, "Even a matching digest cannot introduce a policy bypass field.");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});


test("V7 preparation selects V7 deployment settings and the correct canonical registry generations", () => {
  const input = fixture("v6").artifact;
  Object.assign(input.contract, { algorithmVersion: "unique-rank-v4", secondPrizeBps: "2000", minAffiliateReferrals: "100", affiliatePayoutCapBps: "3000", saleStartAt: "2000000000" });
  Object.assign(input.operations, { enrollmentWindowSeconds: "900", winnerCreditsAddress: "0x4444444444444444444444444444444444444444", winnerCreditSponsorshipWei: "20000000000000000", affiliateEligibilityAddress: "0x5555555555555555555555555555555555555555" });
  const artifact: LaunchArtifact = { schemaVersion: 1, contractVersion: "affiliate-v7", ...requireValidLaunchPayload({contract: input.contract, operations: input.operations}, { requireWinnerCredits: true, requireAffiliateEligibility: true, requireSeasonAppearance: true }) };
  const contentHash = launchArtifactHash(artifact), directory = mkdtempSync(join(tmpdir(), "manekineko-v7-prepare-test-"));
  try {
    const manifest = join(directory, "export.json"), output = join(directory, "prepared"), script = fileURLToPath(new URL("../../../scripts/prepare-launch.mjs", import.meta.url));
    writeFileSync(manifest, JSON.stringify({ ...artifact, contentHash }));
    execFileSync(process.execPath, [script, "--manifest", manifest, "--expected-hash", contentHash, "--output", output], { stdio: "pipe" });
    const plan = JSON.parse(readFileSync(join(output, "deployment-plan.json"), "utf8"));
    assert.equal(plan.preflightEnvironment.V7_BROADCAST, "0");
    assert.equal(plan.preflightEnvironment.V7_AFFILIATE_ELIGIBILITY_ADDRESS, artifact.operations.affiliateEligibilityAddress);
    assert.equal(plan.preflightEnvironment.V4_CONFIG_PATH, undefined);
    assert.equal(plan.preflightEnvironment.V6_AFFILIATE_ELIGIBILITY_ADDRESS, undefined);
    assert.deepEqual(JSON.parse(readFileSync(join(output, "round-v7.json"), "utf8")), artifact.contract);
    assert.equal(JSON.parse(readFileSync(join(output, "winner-credit-plan.json"), "utf8")).registryVersion, "winner-credits-v3");
    assert.equal(JSON.parse(readFileSync(join(output, "affiliate-eligibility-plan.json"), "utf8")).registryVersion, "affiliate-eligibility-v2");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("V8 offline bundle matches the deployment CLI and selects V3 eligibility plus V4 lifetime credits", async () => {
  const { parseV8Config } = await import("@manekineko/contract-abi/v8-config");
  const input = fixture("v6").artifact;
  Object.assign(input.contract, { algorithmVersion: "unique-rank-v5", maxSupply: "1000", mintPriceWei: "10000000000000000", prizeBps: "6000", winnerCount: "6", minAffiliateReferrals: "100", affiliatePayoutCapBps: "3000", saleStartAt: "2000000000" });
  Object.assign(input.operations, { enrollmentWindowSeconds: "900", winnerCreditsAddress: "0x4444444444444444444444444444444444444444", winnerCreditSponsorshipWei: "20000000000000000", affiliateEligibilityAddress: "0x5555555555555555555555555555555555555555" });
  const artifact: LaunchArtifact = { schemaVersion: 1, contractVersion: "affiliate-v8", ...requireValidLaunchPayload({ contract: input.contract, operations: input.operations }, { requireWinnerCredits: true, requireAffiliateEligibility: true, requireSeasonAppearance: true }) };
  const contentHash = launchArtifactHash(artifact), directory = mkdtempSync(join(tmpdir(), "manekineko-v8-prepare-test-"));
  try {
    const manifest = join(directory, "export.json"), output = join(directory, "prepared"), script = fileURLToPath(new URL("../../../scripts/prepare-launch.mjs", import.meta.url));
    const args = [script, "--manifest", manifest, "--expected-hash", contentHash, "--output", output];
    writeFileSync(manifest, JSON.stringify({ ...artifact, contentHash }));
    const stdout = execFileSync(process.execPath, args, { stdio: "pipe", encoding: "utf8" });
    assert.match(stdout, /Prepared V8 CLI configuration/); assert.match(stdout, /No transactions sent/);
    const plan = JSON.parse(readFileSync(join(output, "deployment-plan.json"), "utf8"));
    assert.deepEqual(plan.preflightEnvironment, {
      V8_CONFIG_PATH: join(output, "round-v8.json"), V8_PREFLIGHT_FROM: artifact.operations.deployerAddress,
      FACTORY_ADDRESS: "", V8_BROADCAST: "0", V8_AFFILIATE_ELIGIBILITY_ADDRESS: artifact.operations.affiliateEligibilityAddress,
    });
    assert.equal(plan.configurationHash, contentHash); assert.deepEqual(plan.operations, artifact.operations);
    const terms = JSON.parse(readFileSync(plan.preflightEnvironment.V8_CONFIG_PATH, "utf8"));
    assert.deepEqual(terms, artifact.contract); assert.equal(terms.secondPrizeBps, undefined);
    const deployed = parseV8Config(terms, 11155111n, 1999999000n);
    assert.equal(deployed.config.winnerCount, 6n); assert.equal(deployed.config.saleStartAt, 2000000000n);
    assert.equal(deployed.config.mintDeadline, 2000000000n + BigInt(artifact.contract.mintDurationSeconds));
    assert.equal(deployed.config.mintPrice * deployed.config.maxSupply * deployed.config.prizeBps / 10000n / deployed.config.winnerCount, 1000000000000000000n);
    const eligibility = JSON.parse(readFileSync(join(output, "affiliate-eligibility-plan.json"), "utf8"));
    assert.equal(eligibility.registryVersion, "affiliate-eligibility-v3"); assert.equal(eligibility.registryAddress, artifact.operations.affiliateEligibilityAddress);
    assert.equal(eligibility.policy, "previous-revealed-funded-nft-after-first-collection"); assert.equal(eligibility.requiredBeforeEnrollment, true);
    const credits = JSON.parse(readFileSync(join(output, "winner-credit-plan.json"), "utf8"));
    assert.equal(credits.registryVersion, "winner-credits-v4"); assert.equal(credits.registryAddress, artifact.operations.winnerCreditsAddress);
    assert.equal(credits.cumulativeSponsorshipBudgetWei, artifact.operations.winnerCreditSponsorshipWei); assert.equal(credits.requiredBeforeSaleActivation, true);
    assert.deepEqual(readdirSync(output).sort(), ["affiliate-eligibility-plan.json", "deployment-plan.json", "round-v8.json", "winner-credit-plan.json"]);
    for (const filename of readdirSync(output)) assert.equal(statSync(join(output, filename)).mode & 0o777, 0o600);
    assert.throws(() => execFileSync(process.execPath, args, { stdio: "pipe" }), "A repeated preparation must not overwrite reviewed output.");
    const changed = structuredClone(artifact); changed.contract.winnerCount = "3";
    writeFileSync(manifest, JSON.stringify({ ...changed, contentHash: launchArtifactHash(changed) }));
    const changedOutput = join(directory, "changed");
    assert.throws(() => execFileSync(process.execPath, [script, "--manifest", manifest, "--expected-hash", contentHash, "--output", changedOutput], { stdio: "pipe" }));
    assert.equal(existsSync(changedOutput), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
