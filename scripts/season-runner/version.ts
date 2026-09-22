import { parseV9Config } from "../../packages/contracts/src/v9-config.ts";
import { parseV10Config } from "../../packages/contracts/src/v10-config.ts";

export type SeasonContractVersion = "affiliate-v9" | "affiliate-v10";

/** Exact version pairs only; a new ABI never upgrades an existing deployment. */
export function seasonVersionPolicy(version: string = "affiliate-v9") {
  if (version !== "affiliate-v9" && version !== "affiliate-v10") throw new Error("unsupported_season_contract_version");
  const permanent = version === "affiliate-v10";
  return {
    contractVersion: version as SeasonContractVersion,
    componentVersion: permanent ? "V10" : "V9",
    algorithmVersion: permanent ? "unique-rank-v6" : "unique-rank-v5",
    eligibilityComponent: permanent ? "AffiliateEligibilityV5" : "AffiliateEligibilityV4",
    creditsComponent: permanent ? "WinnerCreditsV6" : "WinnerCreditsV5",
    eligibilityVersion: permanent ? "affiliate-eligibility-v5" : "affiliate-eligibility-v4",
    creditsVersion: permanent ? "winner-credits-v6" : "winner-credits-v5",
    eligibilityPin: permanent ? "AFFILIATE_ELIGIBILITY_V5" : "AFFILIATE_ELIGIBILITY_V4",
    creditsPin: permanent ? "WINNER_CREDITS_V6" : "WINNER_CREDITS_V5",
    parseConfig: permanent ? parseV10Config : parseV9Config,
    permanent,
  };
}

export function supportedHistoricalSource(target: SeasonContractVersion, version: string, algorithm: string) {
  const versions: Record<string, string> = target === "affiliate-v10"
    ? { "affiliate-v6": "unique-rank-v3", "affiliate-v7": "unique-rank-v4", "affiliate-v8": "unique-rank-v5", "affiliate-v9": "unique-rank-v5" }
    : { "affiliate-v8": "unique-rank-v5" };
  return versions[version] === algorithm;
}
