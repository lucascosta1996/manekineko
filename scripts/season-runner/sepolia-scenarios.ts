import { getAddress, ZeroAddress } from "ethers";

export type SepoliaScenario =
  | { kind: "refund-3-30m"; chainId: 11155111; collectionId: string; mintTarget: 3; durationSeconds: 1800; expectedOutcome: "unsold/refundable"; maxTotalSpendWei: string; maxFeePerGasWei: string }
  | { kind: "manual-affiliate-sellout"; chainId: 11155111; collectionId: string; affiliateWallet: string; buyerWallet: string; manualMintsPerWallet: 20; expectedOutcome: "manual-prize-and-commission-claimed"; maxTotalSpendWei: string; maxFeePerGasWei: string }
  | { kind: "affiliate-sellout"; chainId: 11155111; collectionId: string; affiliateWallet: string; affiliateId: number; expectedOutcome: "soldout/commission-claimed"; maxTotalSpendWei: string; maxFeePerGasWei: string };

/** Public scenario data only. Signing keys always remain in the existing encrypted vault. */
export function parseSepoliaScenario(input: unknown): SepoliaScenario {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_sepolia_scenario");
  const value = input as Record<string, unknown>;
  const base = ["kind", "chainId", "collectionId", "expectedOutcome", "maxTotalSpendWei", "maxFeePerGasWei"];
  const extra = value.kind === "refund-3-30m" ? ["mintTarget", "durationSeconds"] : value.kind === "manual-affiliate-sellout" ? ["affiliateWallet", "buyerWallet", "manualMintsPerWallet"] : ["affiliateWallet", "affiliateId"];
  if (Object.keys(value).some(key => ![...base, ...extra].includes(key)) || value.chainId !== 11155111 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value.collectionId)) || !/^[1-9]\d*$/.test(String(value.maxTotalSpendWei)) || !/^[1-9]\d*$/.test(String(value.maxFeePerGasWei))) throw new Error("invalid_sepolia_scenario");
  if (value.kind === "refund-3-30m") {
    if (value.mintTarget !== 3 || value.durationSeconds !== 1800 || value.expectedOutcome !== "unsold/refundable") throw new Error("invalid_refund_scenario");
  } else if (value.kind === "affiliate-sellout") {
    if (!Number.isSafeInteger(value.affiliateId) || Number(value.affiliateId) < 1 || Number(value.affiliateId) > 100 || typeof value.affiliateWallet !== "string" || getAddress(value.affiliateWallet) === ZeroAddress || value.expectedOutcome !== "soldout/commission-claimed") throw new Error("invalid_affiliate_scenario");
  } else if (value.kind === "manual-affiliate-sellout") {
    if (typeof value.affiliateWallet !== "string" || typeof value.buyerWallet !== "string" || getAddress(value.affiliateWallet) === ZeroAddress || getAddress(value.buyerWallet) === ZeroAddress || getAddress(value.affiliateWallet) === getAddress(value.buyerWallet) || value.manualMintsPerWallet !== 20 || value.expectedOutcome !== "manual-prize-and-commission-claimed") throw new Error("invalid_manual_scenario");
  } else throw new Error("unknown_sepolia_scenario");
  return value as SepoliaScenario;
}

export function refundMintQuantity(minted: bigint, primaryMinted: bigint, walletIndex: number) {
  if (minted < 0n || minted > 3n || primaryMinted < 0n || primaryMinted > 1n) throw new Error("refund_scenario_mint_count_mismatch");
  return minted < 3n && walletIndex < 3 && primaryMinted === 0n ? 1n : 0n;
}
