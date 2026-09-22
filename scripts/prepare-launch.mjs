import { mkdir, open, readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { verifyLaunchExport } from "../apps/launch/lib/launch-export.ts";
import { requireValidLaunchPayload } from "../apps/launch/lib/launch-config-validation.ts";

// Offline adapter only. It cannot access an RPC, signer or database and never sends a transaction.
const usage = "npm run launch:prepare -- --manifest <export.json> --expected-hash <trusted-finalized-hash> --output <new-directory> [--expected-version affiliate-v10]";
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") { console.log(usage); process.exit(0); }
  const options = new Map();
  for (let i = 0; i < args.length; i += 2) {
    if (!["--manifest", "--expected-hash", "--output", "--expected-version"].includes(args[i]) || options.has(args[i]) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error(usage);
    options.set(args[i], args[i + 1]);
  }
  if (!["--manifest", "--expected-hash", "--output"].every(key => options.has(key))) throw new Error(usage);
  const inputPath = resolve(options.get("--manifest"));
  if ((await stat(inputPath)).size > 65_536) throw new Error("The launch export is too large.");
  const artifact = verifyLaunchExport(JSON.parse(await readFile(inputPath, "utf8")), options.get("--expected-hash"));
  const expectedVersion = options.get("--expected-version");
  if (expectedVersion && artifact.contractVersion !== expectedVersion) {
    throw new Error(`Expected ${expectedVersion}, but this finalized export uses ${artifact.contractVersion}. Create and finalize a new configuration for the intended version; historical exports cannot be upgraded in place.`);
  }
  // Historical exports remain verifiable, but never silently invent appearance
  // when preparing the current versioned deployment inputs.
  requireValidLaunchPayload({ contract: artifact.contract, operations: artifact.operations }, { requireSeasonAppearance: true, requireWinnerCredits: ["affiliate-v7", "affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(artifact.contractVersion), requireAffiliateEligibility: ["affiliate-v7", "affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(artifact.contractVersion) });
  const outputPath = resolve(options.get("--output"));
  // Exclusive directory creation makes repeat execution safe: existing output is never overwritten.
  await mkdir(outputPath, { mode: 0o700 });
  async function writeJson(filename, value) {
    const file = await open(join(outputPath, filename), "wx", 0o600);
    try { await file.writeFile(JSON.stringify(value, null, 2) + "\n"); await file.sync(); }
    finally { await file.close(); }
  }
  const version = artifact.contractVersion === "affiliate-v10" ? "V10" : artifact.contractVersion === "affiliate-v9" ? "V9" : artifact.contractVersion === "affiliate-v8" ? "V8" : artifact.contractVersion === "affiliate-v7" ? "V7" : artifact.contractVersion === "affiliate-v6" ? "V6" : artifact.contractVersion === "affiliate-v5" ? "V5" : "V4";
  const filename = `round-${version.toLowerCase()}.json`;
  const configPath = join(outputPath, filename);
  await writeJson(filename, artifact.contract);
  await writeJson("deployment-plan.json", {
    schemaVersion: 1,
    contractVersion: artifact.contractVersion,
    algorithmVersion: artifact.contract.algorithmVersion,
    configurationHash: options.get("--expected-hash"),
    operations: artifact.operations,
    preflightEnvironment: {
      [`${version}_CONFIG_PATH`]: configPath,
      [`${version}_PREFLIGHT_FROM`]: artifact.operations.deployerAddress,
      FACTORY_ADDRESS: artifact.operations.factoryMode === "existing" ? artifact.operations.factoryAddress : "",
      [`${version}_BROADCAST`]: "0",
      ...(artifact.operations.affiliateEligibilityAddress ? { [`${version}_AFFILIATE_ELIGIBILITY_ADDRESS`]: artifact.operations.affiliateEligibilityAddress } : {}),
    },
    qualification: "Configuration validated offline. Live preflight, Sepolia qualification and release approval remain required.",
  });
  if (artifact.operations.affiliateEligibilityAddress) {
    await writeJson("affiliate-eligibility-plan.json", {
      schemaVersion: 1, configurationHash: options.get("--expected-hash"), chainId: artifact.contract.chainId,
      registryAddress: artifact.operations.affiliateEligibilityAddress,
      ...(version === "V10" ? { registryVersion: "affiliate-eligibility-v5" } : version === "V9" ? { registryVersion: "affiliate-eligibility-v4" } : version === "V8" ? { registryVersion: "affiliate-eligibility-v3" } : version === "V7" ? { registryVersion: "affiliate-eligibility-v2" } : {}),
      requiredBeforeEnrollment: true, policy: ["V7", "V8", "V9", "V10"].includes(version) ? "previous-revealed-funded-nft-after-first-collection" : "previous-completed-nft-after-first-collection",
      operations: ["Verify the canonical eligibility registry and its global collection order.", "Approve this reviewed factory if needed, then register the deployed collection before enabling enrollment.", "Only canonical collection one has open enrollment. Later collections require an unused NFT from an earlier completed official collection."],
      prepareCommand: "node --import tsx scripts/affiliate-eligibility-operations.mjs collection --manifest <export.json> --expected-hash <trusted-hash> --factory <deployed-factory> --round <deployed-round> --output <new-plan.json>",
      note: "Unsigned operations only. A new factory never resets the canonical bootstrap exception.",
    });
  }
  if (artifact.operations.winnerCreditsAddress !== undefined) {
    await writeJson("winner-credit-plan.json", {
      schemaVersion: 1,
      configurationHash: options.get("--expected-hash"),
      chainId: artifact.contract.chainId,
      registryAddress: artifact.operations.winnerCreditsAddress,
      ...(version === "V10" ? { registryVersion: "winner-credits-v6" } : version === "V9" ? { registryVersion: "winner-credits-v5" } : version === "V8" ? { registryVersion: "winner-credits-v4" } : version === "V7" ? { registryVersion: "winner-credits-v3" } : {}),
      cumulativeSponsorshipBudgetWei: artifact.operations.winnerCreditSponsorshipWei,
      requiredBeforeSaleActivation: true,
      operations: ["Verify the canonical registry and reviewed factory runtime.", "Approve the factory if needed, then register the collection before sale activation.", "Fund the reviewed sponsorship budget, subtracting all prior funding to prevent duplicate deposits."],
      prepareCommand: "node --import tsx scripts/winner-credit-operations.mjs collection --manifest <export.json> --expected-hash <trusted-hash> --factory <deployed-factory> --round <deployed-round> --registry-codehash <verified-hash> --output <new-plan.json>",
      note: "Operator sponsorship is separate from deployment gas and VRF funding. These are unsigned operations; no credit or funding is created by this file.",
    });
  }
  console.log(`Verified configuration ${options.get("--expected-hash")}.`);
  console.log(`Prepared ${version} CLI configuration and deployment plan in ${outputPath}. No transactions sent.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Launch preparation failed.");
  process.exitCode = 1;
}
