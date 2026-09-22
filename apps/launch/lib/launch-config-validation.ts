import { getAddress, ZeroAddress } from "ethers";
import { parseV5Config } from "@manekineko/contract-abi/v5-config";
import { parseV10Config } from "@manekineko/contract-abi/v10-config";
import { parseV9Config } from "@manekineko/contract-abi/v9-config";
import { parseV8Config } from "@manekineko/contract-abi/v8-config";
import { parseV7Config } from "@manekineko/contract-abi/v7-config";
import { parseV6Config } from "@manekineko/contract-abi/v6-config";
import { parseV4Config } from "@manekineko/contract-abi/v4-config";
import { normalizeSeasonAppearance } from "@manekineko/contract-abi/season-appearance";
import { LaunchConfigurationError, type LaunchPayload } from "./launch-config.ts";
import { requireLaunchChain, requireSeasonPlanningChain } from "./chain-policy.ts";

const CONTRACT_STRINGS = ["chainId", "name", "symbol", "maxSupply", "mintPriceWei", "mintDurationSeconds", "initialOwner", "requestConfirmations", "callbackGasLimit", "randomnessFundingWei", "maxAffiliateSlots", "enrollmentSigner", "prizeBps"] as const;
const OPTIONAL_CONTRACT_STRINGS = ["vrfCoordinator", "keyHash", "affiliatePoolBps", "algorithmVersion", "seasonId", "seasonName", "collectionColor", "textColor", "maxMintsPerWallet", "winnerCount", "secondPrizeBps", "minAffiliateReferrals", "affiliatePayoutCapBps", "saleStartAt"] as const;
const APPEARANCE_FIELDS = ["seasonId", "seasonName", "collectionColor", "textColor"] as const;
const OPERATION_STRINGS = ["factoryAddress", "deployerAddress", "factoryOwnerAddress", "enrollmentWindowSeconds", "notes"] as const;
const OPTIONAL_OPERATION_STRINGS = ["winnerCreditsAddress", "winnerCreditSponsorshipWei", "affiliateEligibilityAddress"] as const;
const UINT256_MAX = (1n << 256n) - 1n;

function object(value: unknown, allowed: readonly string[], field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LaunchConfigurationError("invalid_payload", `${field} must be an object.`);
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some(key => !allowed.includes(key))) throw new LaunchConfigurationError("invalid_payload", `${field} contains an unsupported field.`);
  return raw;
}

function boundedString(raw: Record<string, unknown>, key: string, maximum = 512): string {
  const value = raw[key];
  if (typeof value !== "string" || value.length > maximum || value.includes("\u0000")) throw new LaunchConfigurationError("invalid_payload", `${key} must be text of at most ${maximum} characters.`);
  return value;
}

/** Drafts may be incomplete, but cannot smuggle unbounded objects or secret-bearing extra fields. */
export function parseLaunchDraft(input: unknown, options: { seasonPlanning?: boolean } = {}): LaunchPayload {
  const raw = object(input, ["contract", "operations"], "payload");
  const contract = object(raw.contract, [...CONTRACT_STRINGS, ...OPTIONAL_CONTRACT_STRINGS, "affiliateRatesBps", "activateSale"], "contract");
  const operations = object(raw.operations, ["factoryMode", ...OPERATION_STRINGS, ...OPTIONAL_OPERATION_STRINGS], "operations");
  const copiedContract: Record<string, unknown> = {};
  for (const key of CONTRACT_STRINGS) copiedContract[key] = boundedString(contract, key);
  if (options.seasonPlanning) requireSeasonPlanningChain(copiedContract.chainId as string);
  else requireLaunchChain(copiedContract.chainId as string);
  for (const key of OPTIONAL_CONTRACT_STRINGS) if (contract[key] !== undefined) copiedContract[key] = boundedString(contract, key, 100);
  if (contract.algorithmVersion !== undefined && !["unique-rank-v3", "unique-rank-v4", "unique-rank-v5", "unique-rank-v6"].includes(String(contract.algorithmVersion))) throw new LaunchConfigurationError("invalid_payload", "Only the explicit unique-rank-v3, unique-rank-v4, unique-rank-v5 or unique-rank-v6 marker is supported; older documents keep their original algorithm without a marker.");
  if (contract.algorithmVersion !== undefined && contract.affiliatePoolBps === undefined) throw new LaunchConfigurationError("invalid_payload", "V6 requires the collection affiliate pool terms.");
  if (APPEARANCE_FIELDS.some(field => contract[field] !== undefined) && !["unique-rank-v3", "unique-rank-v4", "unique-rank-v5", "unique-rank-v6"].includes(String(contract.algorithmVersion))) throw new LaunchConfigurationError("invalid_payload", "Season appearance is supported by V6–V10 collection configurations only. Historical collection terms cannot be changed.");
  const sharedQualifiedFields = ["minAffiliateReferrals", "affiliatePayoutCapBps", "saleStartAt"] as const;
  if (contract.maxMintsPerWallet !== undefined && (contract.maxMintsPerWallet !== "20" || !["unique-rank-v5", "unique-rank-v6"].includes(String(contract.algorithmVersion)))) throw new LaunchConfigurationError("invalid_payload", "V9/V10 requires exactly 20 primary mints per wallet.");
  if (contract.algorithmVersion === "unique-rank-v6" && contract.maxMintsPerWallet !== "20") throw new LaunchConfigurationError("invalid_payload", "V10 requires exactly 20 primary mints per wallet.");
  const isV7 = contract.algorithmVersion === "unique-rank-v4", hasEqualPrizes = ["unique-rank-v5", "unique-rank-v6"].includes(String(contract.algorithmVersion));
  if (isV7 && [...sharedQualifiedFields, "secondPrizeBps"].some(field => typeof contract[field] !== "string")) throw new LaunchConfigurationError("invalid_payload", "V7 requires second prize, referral qualification, payout cap and sale start settings.");
  if (hasEqualPrizes && [...sharedQualifiedFields, "winnerCount"].some(field => typeof contract[field] !== "string")) throw new LaunchConfigurationError("invalid_payload", `${contract.algorithmVersion === "unique-rank-v6" ? "V10" : contract.maxMintsPerWallet === "20" ? "V9" : "V8"} requires winner count, referral qualification, payout cap and sale start settings.`);
  if (!isV7 && contract.secondPrizeBps !== undefined) throw new LaunchConfigurationError("invalid_payload", "Second-prize terms require an explicit V7 configuration; V8 prizes are equal.");
  if (!hasEqualPrizes && contract.winnerCount !== undefined) throw new LaunchConfigurationError("invalid_payload", "Equal-prize winner count requires an explicit V8–V10 configuration.");
  if (!isV7 && !hasEqualPrizes && sharedQualifiedFields.some(field => contract[field] !== undefined)) throw new LaunchConfigurationError("invalid_payload", "Qualified affiliate terms require an explicit V7–V10 configuration.");
  if (contract.activateSale !== false) throw new LaunchConfigurationError("invalid_payload", "Launch preparation must leave activateSale=false for affiliate enrollment.");
  if (!Array.isArray(contract.affiliateRatesBps) || contract.affiliateRatesBps.length > 100 || contract.affiliateRatesBps.some(rate => typeof rate !== "string" || rate.length > 16 || rate.includes("\u0000"))) throw new LaunchConfigurationError("invalid_payload", "affiliateRatesBps must contain at most 100 text rates.");
  copiedContract.affiliateRatesBps = [...contract.affiliateRatesBps];
  copiedContract.activateSale = false;
  if (operations.factoryMode !== "new" && operations.factoryMode !== "existing") throw new LaunchConfigurationError("invalid_payload", "Choose a new or existing factory.");
  const copiedOperations: Record<string, unknown> = { factoryMode: operations.factoryMode };
  for (const key of OPERATION_STRINGS) copiedOperations[key] = boundedString(operations, key, key === "notes" ? 4000 : 100);
  for (const key of OPTIONAL_OPERATION_STRINGS) if (operations[key] !== undefined) copiedOperations[key] = boundedString(operations, key, 100);
  if ((operations.winnerCreditsAddress !== undefined) !== (operations.winnerCreditSponsorshipWei !== undefined)) throw new LaunchConfigurationError("invalid_payload", "Winner credits require both the registry address and sponsorship budget.");
  if (operations.winnerCreditsAddress !== undefined && !["unique-rank-v3", "unique-rank-v4", "unique-rank-v5", "unique-rank-v6"].includes(String(contract.algorithmVersion))) throw new LaunchConfigurationError("invalid_payload", "Winner credit sponsorship is supported by V6–V10 launch configurations only.");
  if (operations.affiliateEligibilityAddress !== undefined && !["unique-rank-v3", "unique-rank-v4", "unique-rank-v5", "unique-rank-v6"].includes(String(contract.algorithmVersion))) throw new LaunchConfigurationError("invalid_payload", "Affiliate eligibility registry settings are supported by V6–V10 launch configurations only.");
  return { contract: copiedContract, operations: copiedOperations } as LaunchPayload;
}

export function parseLaunchLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 100 || value.includes("\u0000")) throw new LaunchConfigurationError("invalid_label", "Give the configuration a label of 1–100 characters.");
  return value.trim();
}

export function parseLaunchRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 2_147_483_646) throw new LaunchConfigurationError("invalid_revision", "A valid saved configuration revision is required.");
  return value;
}

export function parseLaunchId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new LaunchConfigurationError("not_found", "Launch configuration not found.", 404);
  return value;
}

/** Uses the same contract parser as the deployment CLI; this does not contact an RPC or deploy. */
export type LaunchValidationOptions = { requireWinnerCredits?: boolean; requireAffiliateEligibility?: boolean; requireSeasonAppearance?: boolean; resolveSeasonStartAt?: boolean };

export function validateLaunchPayload(input: unknown, options: LaunchValidationOptions = {}): { valid: boolean; issues: string[]; payload: LaunchPayload | null } {
  let payload: LaunchPayload;
  try { payload = parseLaunchDraft(input); }
  catch (error) { return { valid: false, issues: [error instanceof Error ? error.message : "Invalid launch configuration."], payload: null }; }
  const issues: string[] = [];
  if (!["1", "11155111"].includes(payload.contract.chainId)) issues.push("Choose Ethereum Mainnet or Sepolia.");
  let parsed: ReturnType<typeof parseV4Config> | ReturnType<typeof parseV5Config> | undefined;
  const isV10 = payload.contract.algorithmVersion === "unique-rank-v6";
  const isV8 = payload.contract.algorithmVersion === "unique-rank-v5" || isV10;
  const isV7 = payload.contract.algorithmVersion === "unique-rank-v4";
  const isScheduled = isV7 || isV8;
  const isV6 = payload.contract.algorithmVersion === "unique-rank-v3" || isScheduled;
  const hasAppearance = APPEARANCE_FIELDS.some(field => payload.contract[field] !== undefined);
  if (isV6 && (hasAppearance || options.requireSeasonAppearance)) {
    try { payload.contract = { ...payload.contract, ...normalizeSeasonAppearance(payload.contract) }; }
    catch (error) { issues.push(error instanceof Error ? error.message : "Configure the season and collection appearance before finalizing."); }
  }
  if (!issues.length) {
    try {
      if (isV6 && !isScheduled && !hasAppearance) {
        // Previously finalized V6 snapshots retain their exact hashes. They can
        // be read and exported, but preparation requires the new appearance.
        const { algorithmVersion: _, ...legacyTerms } = payload.contract;
        parsed = parseV5Config(legacyTerms, BigInt(payload.contract.chainId), 0n);
      } else parsed = (isV10 ? parseV10Config : payload.contract.maxMintsPerWallet === "20" ? parseV9Config : isV8 ? parseV8Config : isV7 ? parseV7Config : isV6 ? parseV6Config : payload.contract.affiliatePoolBps === undefined ? parseV4Config : parseV5Config)((isScheduled && options.resolveSeasonStartAt && payload.contract.saleStartAt === "0") ? { ...payload.contract, saleStartAt: "900" } : payload.contract, BigInt(payload.contract.chainId), 0n);
    }
    catch (error) { issues.push(error instanceof Error ? error.message : "Invalid contract configuration."); }
  }
  const operations = { ...payload.operations };
  if (options.requireWinnerCredits && payload.contract.algorithmVersion !== undefined && operations.winnerCreditsAddress === undefined) issues.push("Configure a winner credits registry and sponsorship budget before finalizing a new collection.");
  if (options.requireAffiliateEligibility && payload.contract.algorithmVersion !== undefined && operations.affiliateEligibilityAddress === undefined) issues.push("Configure the canonical affiliate eligibility registry before finalizing a new collection.");
  const address = (value: string, label: string): string | null => {
    try { const result = getAddress(value); if (result !== ZeroAddress) return result; } catch { /* Report a concise field error. */ }
    issues.push(`${label} must be a valid nonzero Ethereum address.`);
    return null;
  };
  const deployer = address(operations.deployerAddress, "Deployer");
  const factoryOwner = address(operations.factoryOwnerAddress, "Factory owner");
  if (deployer) operations.deployerAddress = deployer;
  if (factoryOwner) operations.factoryOwnerAddress = factoryOwner;
  if (operations.affiliateEligibilityAddress !== undefined) {
    const eligibility = address(operations.affiliateEligibilityAddress, "Affiliate eligibility registry");
    if (eligibility) operations.affiliateEligibilityAddress = eligibility;
  }
  if (operations.winnerCreditsAddress !== undefined) {
    const registry = address(operations.winnerCreditsAddress, "Winner credits registry");
    if (registry) operations.winnerCreditsAddress = registry;
    const budget = operations.winnerCreditSponsorshipWei!;
    if (!/^[1-9]\d{0,77}$/.test(budget) || BigInt(budget) > UINT256_MAX) issues.push("Winner credit sponsorship must be a positive canonical uint256 amount in wei.");
    else if (/^[1-9]\d*$/.test(payload.contract.mintPriceWei) && BigInt(budget) < BigInt(payload.contract.mintPriceWei)) issues.push("Winner credit sponsorship must cover at least one ticket at this collection’s mint price.");
  }
  if (deployer && factoryOwner && deployer !== factoryOwner) issues.push("The current deployment workflow requires the deployer to be the factory owner. Record any later ownership transfer separately.");
  if (operations.factoryMode === "existing") {
    const factory = address(operations.factoryAddress, "Existing factory");
    if (factory) operations.factoryAddress = factory;
  } else if (operations.factoryAddress !== "") issues.push("Leave the factory address empty when preparing a new factory.");
  if (!/^[1-9]\d{0,7}$/.test(operations.enrollmentWindowSeconds)) issues.push("Enrollment planning window must be a positive whole number of seconds.");
  else if (!isScheduled && /^(0|[1-9]\d*)$/.test(payload.contract.mintDurationSeconds) && BigInt(operations.enrollmentWindowSeconds) >= BigInt(payload.contract.mintDurationSeconds)) issues.push("The planned enrollment window must leave time for minting before the deadline, which starts at deployment.");
  if (parsed && deployer === parsed.config.enrollmentSigner) issues.push("Use a separate enrollment signer, not the deployer or factory owner.");
  if (issues.length || !parsed) return { valid: false, issues, payload: null };
  return {
    valid: true, issues: [], payload: {
      contract: { ...payload.contract, initialOwner: parsed.config.initialOwner, enrollmentSigner: parsed.config.enrollmentSigner, vrfCoordinator: parsed.config.vrfCoordinator, keyHash: parsed.config.keyHash },
      operations,
    },
  };
}

export function requireValidLaunchPayload(input: unknown, options: LaunchValidationOptions = {}): LaunchPayload {
  const validation = validateLaunchPayload(input, options);
  if (!validation.valid || !validation.payload) throw new LaunchConfigurationError("invalid_configuration", "Resolve the configuration checks before finalizing.", 422, validation.issues);
  return validation.payload;
}

export function parseLaunchRequest(input: unknown, fields: readonly string[]): Record<string, unknown> {
  return object(input, fields, "request");
}
