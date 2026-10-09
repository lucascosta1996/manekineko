import { parseV9Config } from "../../packages/contracts/src/v9-config.ts";
import { parseV10Config } from "../../packages/contracts/src/v10-config.ts";

import { parseV11Config } from "../../packages/contracts/src/v11-config.ts";
export type SeasonContractVersion = "affiliate-v9" | "affiliate-v10" | "affiliate-v11";

/** Exact version pairs only; a new ABI never upgrades an existing deployment. */
export function seasonVersionPolicy(version: string = "affiliate-v9") {
  if (version !== "affiliate-v9" && version !== "affiliate-v10" && version !== "affiliate-v11") throw new Error("unsupported_season_contract_version");
  const uncapped = version === "affiliate-v11";
  const permanent = version === "affiliate-v10" || uncapped;
  return {
    contractVersion: version as SeasonContractVersion,
    componentVersion: uncapped ? "V11" : permanent ? "V10" : "V9",
    algorithmVersion: permanent ? "unique-rank-v6" : "unique-rank-v5",
    eligibilityComponent: uncapped ? "AffiliateEligibilityV6" : permanent ? "AffiliateEligibilityV5" : "AffiliateEligibilityV4",
    creditsComponent: uncapped ? "WinnerCreditsV7" : permanent ? "WinnerCreditsV6" : "WinnerCreditsV5",
    eligibilityVersion: uncapped ? "affiliate-eligibility-v6" : permanent ? "affiliate-eligibility-v5" : "affiliate-eligibility-v4",
    creditsVersion: uncapped ? "winner-credits-v7" : permanent ? "winner-credits-v6" : "winner-credits-v5",
    eligibilityPin: uncapped ? "AFFILIATE_ELIGIBILITY_V6" : permanent ? "AFFILIATE_ELIGIBILITY_V5" : "AFFILIATE_ELIGIBILITY_V4",
    creditsPin: uncapped ? "WINNER_CREDITS_V7" : permanent ? "WINNER_CREDITS_V6" : "WINNER_CREDITS_V5",
    parseConfig: uncapped ? parseV11Config : permanent ? parseV10Config : parseV9Config,
    permanent, uncapped,
  };
}

export function supportedHistoricalSource(target: SeasonContractVersion, version: string, algorithm: string) {
  const versions: Record<string, string> = target === "affiliate-v11"
    ? { "affiliate-v6":"unique-rank-v3", "affiliate-v7":"unique-rank-v4", "affiliate-v8":"unique-rank-v5", "affiliate-v9":"unique-rank-v5", "affiliate-v10":"unique-rank-v6" }
    : target === "affiliate-v10"
    ? { "affiliate-v6": "unique-rank-v3", "affiliate-v7": "unique-rank-v4", "affiliate-v8": "unique-rank-v5", "affiliate-v9": "unique-rank-v5" }
    : { "affiliate-v8": "unique-rank-v5" };
  return versions[version] === algorithm;
}
