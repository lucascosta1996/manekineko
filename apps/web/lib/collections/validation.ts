import { validateAwards } from "./awards.ts";
import { normalizeSeasonAppearance } from "@manekineko/contract-abi/season-appearance";
import {
  isCollectionId,
  scoreFormulaFor,
  UINT256_MAX,
  type CollectionPublic,
} from "./model.ts";

function ensure(condition: unknown, field: string): asserts condition {
  if (!condition) throw new Error(`Invalid collection configuration: ${field}`);
}

function uint256(value: string, field: string): bigint {
  ensure(typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value), field);
  const parsed = BigInt(value);
  ensure(parsed <= UINT256_MAX, field);
  return parsed;
}

/** Validate stored data before it can select a contract or calculate a payment in the UI. */
export function validateCollection(
  collection: CollectionPublic
): CollectionPublic {
  if ([collection.seasonId, collection.seasonName, collection.collectionColor, collection.textColor].some(value => value != null)) {
    ensure(["affiliate-v6","affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(collection.contractVersion), "season contract version");
    normalizeSeasonAppearance(collection);
  }
  ensure(["feistel-v1", "unique-rank-v2", "unique-rank-v3", "unique-rank-v4", "unique-rank-v5", "unique-rank-v6"].includes(collection.algorithmVersion), "algorithmVersion");
  ensure(["legacy","affiliate-v3","affiliate-v4","affiliate-v5","affiliate-v6","affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(collection.contractVersion), "contractVersion");
  if ((collection.contractVersion === "affiliate-v5" || collection.contractVersion === "affiliate-v6" || collection.contractVersion === "affiliate-v7" || (collection.contractVersion === "affiliate-v8" || collection.contractVersion === "affiliate-v9" || collection.contractVersion === "affiliate-v10"))) ensure(Number.isInteger(collection.affiliatePoolBps) && collection.affiliatePoolBps! >= 0 && collection.affiliatePoolBps! + collection.prizeBps <= 10000, "affiliate pool");
  if (collection.contractVersion === "affiliate-v10") normalizeSeasonAppearance(collection);
  const v2 = collection.algorithmVersion !== "feistel-v1";
  ensure((collection.contractVersion === "affiliate-v10") === (collection.algorithmVersion === "unique-rank-v6"), "V10 contract / algorithm version");
  ensure((collection.contractVersion === "affiliate-v6") === (collection.algorithmVersion === "unique-rank-v3"), "contract / algorithm version");
  ensure((collection.contractVersion === "affiliate-v7") === (collection.algorithmVersion === "unique-rank-v4"), "V7 contract / algorithm version");
  ensure(((collection.contractVersion === "affiliate-v8" || collection.contractVersion === "affiliate-v9")) === (collection.algorithmVersion === "unique-rank-v5"), "V8 contract / algorithm version");
  if (collection.contractVersion === "affiliate-v7" || (collection.contractVersion === "affiliate-v8" || collection.contractVersion === "affiliate-v9" || collection.contractVersion === "affiliate-v10")) {
    const count=(collection.contractVersion === "affiliate-v8" || collection.contractVersion === "affiliate-v9" || collection.contractVersion === "affiliate-v10") ? collection.winnerCount! : 2;
    if((collection.contractVersion === "affiliate-v8" || collection.contractVersion === "affiliate-v9" || collection.contractVersion === "affiliate-v10")) ensure(Number.isInteger(count) && count>=1 && count<=10 && count<=collection.maxSupply
      && collection.secondPrizeBps==null && collection.prizeBps>0 && collection.prizeBps%count===0,"equal prize count");
    else ensure(collection.winnerCount==null && Number.isInteger(collection.secondPrizeBps) && collection.secondPrizeBps! > 0 && collection.secondPrizeBps! < collection.prizeBps, "second prize");
    ensure(Number.isInteger(collection.minAffiliateReferrals) && collection.minAffiliateReferrals! >= 1 && collection.minAffiliateReferrals! <= collection.maxSupply, "referral minimum");
    ensure(Number.isInteger(collection.affiliatePayoutCapBps) && collection.affiliatePayoutCapBps! >= 1 && collection.affiliatePayoutCapBps! <= 10000, "affiliate cap");
    ensure(typeof collection.saleStartAt === "string" && Number.isFinite(Date.parse(collection.saleStartAt)), "sale start");
    const determined = ["awaiting_prize","complete"].includes(collection.phase ?? "");
    ensure(Array.isArray(collection.awards) && collection.awards.length === (determined ? count : 0), "award count");
    if (determined) {
      validateAwards(collection.awards!, collection.maxSupply, collection.totalMintRevenueWei, collection.prizeBps, collection.secondPrizeBps,collection.winnerCount,collection.algorithmVersion);
      ensure(collection.prizePaid === collection.awards!.every(a=>a.claimed), "award claim completion");
    }
  }
  ensure(collection.randomnessProvider === (v2 ? "chainlink-vrf-v2.5" : "future-blockhash"), "randomnessProvider");
  if (collection.refundedCount !== undefined || collection.totalRefundedWei !== undefined || collection.refundedAt != null) {
    ensure(Number.isInteger(collection.refundedCount) && collection.refundedCount! >= 0 && collection.refundedCount! <= collection.totalMinted, "refund count");
    ensure(typeof collection.totalRefundedWei === "string" && uint256(collection.totalRefundedWei,"refund amount") === BigInt(collection.refundedCount!) * BigInt(collection.mintPriceWei), "refund amount");
    if (collection.refundedCount! > 0) ensure(collection.phase === "refundable", "refund phase");
    if (collection.refundedAt != null) ensure(collection.refundedCount === collection.totalMinted && collection.totalMinted > 0
      && Number.isFinite(Date.parse(collection.refundedAt)) && (!collection.saleStartAt || Date.parse(collection.refundedAt) >= Date.parse(collection.saleStartAt)), "refund completion");
  }
  ensure(isCollectionId(collection.id), "id");
  ensure(isCollectionId(collection.seriesId), "seriesId");
  ensure(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(collection.slug), "slug");
  ensure(
    typeof collection.name === "string" &&
      new TextEncoder().encode(collection.name).length >= 1 &&
      new TextEncoder().encode(collection.name).length <= 80,
    "name"
  );
  ensure(
    typeof collection.symbol === "string" &&
      new TextEncoder().encode(collection.symbol).length >= 1 &&
      new TextEncoder().encode(collection.symbol).length <= 16,
    "symbol"
  );
  ensure(typeof collection.description === "string", "description");
  ensure(uint256(collection.roundId, "roundId") > 0n, "roundId");
  ensure(
    Number.isSafeInteger(collection.chainId) && collection.chainId > 0,
    "chainId"
  );
  ensure(
    collection.networkName.length > 0 &&
      collection.nativeCurrency.symbol.length > 0,
    "network"
  );
  ensure(
    Number.isInteger(collection.nativeCurrency.decimals) &&
      collection.nativeCurrency.decimals >= 0 &&
      collection.nativeCurrency.decimals <= 36,
    "nativeCurrency.decimals"
  );
  ensure(/^https:\/\//.test(collection.explorerUrl), "explorerUrl");
  ensure(
    ["undeployed", "deploying", "deployed", "failed"].includes(
      collection.contractStatus
    ),
    "contractStatus"
  );
  ensure(["seed", "postgres"].includes(collection.source), "source");
  ensure(
    collection.mode ===
      (collection.contractStatus === "deployed" ? "live" : "demo"),
    "mode"
  );
  ensure(
    Number.isInteger(collection.maxSupply) &&
      collection.maxSupply >= 1 &&
      collection.maxSupply <= 65_536,
    "maxSupply"
  );
  if (collection.totalAffiliatePaidWei !== undefined) ensure(uint256(collection.totalAffiliatePaidWei, "totalAffiliatePaidWei") <= uint256(collection.totalMintRevenueWei, "totalMintRevenueWei"), "affiliate payments");
  const price = uint256(collection.mintPriceWei, "mintPriceWei");
  ensure(
    price >= 2n &&
      price % 2n === 0n &&
      price * BigInt(collection.maxSupply) <= UINT256_MAX,
    "mintPriceWei"
  );
  ensure(
    Number.isSafeInteger(collection.mintDurationSeconds) &&
      collection.mintDurationSeconds > 0,
    "mintDurationSeconds"
  );
  ensure(v2 ? collection.revealDelayBlocks === null :
    Number.isInteger(collection.revealDelayBlocks) && collection.revealDelayBlocks! >= 2 && collection.revealDelayBlocks! <= 200,
    "revealDelayBlocks");
  if (v2) {
    ensure([1, 11155111].includes(collection.chainId) && collection.nativeCurrency.symbol === "ETH" && collection.nativeCurrency.decimals === 18, "Ethereum network");
    ensure(["not_requested", "pending", "fulfilled"].includes(collection.randomnessState ?? ""), "randomnessState");
    ensure(collection.randomnessState === "not_requested" ? collection.randomnessRequestId === null :
      collection.randomnessRequestId !== null && uint256(collection.randomnessRequestId, "randomnessRequestId") >= 0n, "randomnessRequestId");
  } else {
    ensure(collection.randomnessState === null && collection.randomnessRequestId === null, "legacy randomness state");
  }
  ensure(
    collection.maxMintBatch === 20 &&
      Number.isInteger(collection.prizeBps) && collection.prizeBps>=0 && collection.prizeBps<=10000 &&
      (["affiliate-v4","affiliate-v5","affiliate-v6","affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(collection.contractVersion) ? v2 && price%10000n===0n : collection.prizeBps===5000) &&
      (collection.contractVersion!=="affiliate-v3" || v2 && price%100n===0n) &&
      collection.scoreFormula === scoreFormulaFor(collection.algorithmVersion),
    "contract constants"
  );
  ensure(
    Number.isInteger(collection.totalMinted) &&
      collection.totalMinted >= 0 &&
      collection.totalMinted <= collection.maxSupply,
    "totalMinted"
  );
  ensure(
    uint256(collection.totalMintRevenueWei, "totalMintRevenueWei") ===
      price * BigInt(collection.totalMinted),
    "totalMintRevenueWei"
  );
  ensure(
    [
      null,
      "pending_activation",
      "minting",
      "awaiting_reveal",
      "awaiting_randomness",
      "awaiting_request",
      "awaiting_finalization",
      "settling",
      "awaiting_prize",
      "complete",
      "refundable",
    ].includes(collection.phase),
    "phase"
  );
  ensure(typeof collection.prizePaid === "boolean", "prizePaid");
  ensure(Number.isFinite(Date.parse(collection.updatedAt)), "updatedAt");
  if (collection.contractStatus === "deployed") {
    ensure(
      collection.contractAddress !== null &&
        /^0x[0-9a-fA-F]{40}$/.test(collection.contractAddress) &&
        !/^0x0{40}$/.test(collection.contractAddress),
      "contractAddress"
    );
    ensure(
      collection.mintDeadline !== null &&
        Number.isFinite(Date.parse(collection.mintDeadline)),
      "mintDeadline"
    );
    ensure(collection.phase !== null, "phase");
  } else {
    ensure(
      collection.contractAddress === null && collection.mintDeadline === null,
      "undeployed contract"
    );
    ensure(
      collection.totalMinted === 0 &&
        collection.totalMintRevenueWei === "0" &&
        collection.phase === null &&
        !collection.prizePaid,
      "undeployed state"
    );
    if (v2) ensure(collection.randomnessState === "not_requested", "undeployed randomness");
  }
  ensure(
    (collection.phase === "complete") === collection.prizePaid,
    "phase / prizePaid"
  );
  if (collection.prizePaid)
    ensure(
      collection.totalMinted === collection.maxSupply &&
        collection.phase === "complete",
      "prizePaid"
    );
  if (
    ["awaiting_reveal", "awaiting_request", "awaiting_randomness", "awaiting_finalization", "settling", "awaiting_prize", "complete"].includes(
      collection.phase ?? ""
    )
  ) {
    ensure(collection.totalMinted === collection.maxSupply, "sold-out phase");
  }
  if (collection.phase === "minting")
    ensure(collection.totalMinted < collection.maxSupply, "minting phase");
  if (v2) {
    ensure(!["awaiting_reveal", "settling"].includes(collection.phase ?? ""), "algorithm phase");
    if (["pending_activation", "minting", "awaiting_request", "refundable"].includes(collection.phase ?? "")) ensure(collection.randomnessState === "not_requested", "randomness phase");
    if (collection.phase === "pending_activation") ensure(collection.totalMinted === 0, "pending activation supply");
    if (collection.phase === "awaiting_randomness") ensure(collection.randomnessState === "pending", "randomness phase");
    if (["awaiting_finalization", "awaiting_prize", "complete"].includes(collection.phase ?? "")) ensure(collection.randomnessState === "fulfilled", "randomness phase");
    if (collection.phase === "refundable") ensure(collection.totalMinted < collection.maxSupply, "V2 sold-out refunds");
  } else {
    ensure(!["pending_activation", "awaiting_request", "awaiting_randomness", "awaiting_finalization"].includes(collection.phase ?? ""), "algorithm phase");
  }
  return collection;
}
