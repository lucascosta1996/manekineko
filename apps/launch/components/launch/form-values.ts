import { contrastTextColor, DEFAULT_COLLECTION_COLOR } from "@manekineko/contract-abi/season-appearance";
import type { LaunchConfiguration, LaunchPayload } from "../../lib/launch-config";

export type DurationUnit = "days" | "hours" | "seconds";
export type LaunchForm = {
  seasonId?: string; seasonName?: string; collectionColor?: string;
  label: string; name: string; symbol: string; chainId: string; maxSupply: string;
  mintPriceEth: string; duration: string; durationUnit: DurationUnit; prizePercent: string;
  slots: string; rates: string[]; affiliatePoolPercent: string | null; initialOwner: string; enrollmentSigner: string;
  algorithmVersion?: "unique-rank-v3" | "unique-rank-v4" | "unique-rank-v5" | "unique-rank-v6";
  winnerCount?: string; maxMintsPerWallet?: string; secondPrizePercent?: string; minAffiliateReferrals?: string; affiliatePayoutCapPercent?: string; saleStartAt?: string;
  requestConfirmations: string; callbackGasLimit: string; fundingEth: string;
  factoryMode: "new" | "existing"; factoryAddress: string; deployerAddress: string;
  factoryOwnerAddress: string; enrollmentDuration: string; enrollmentDurationUnit: DurationUnit; notes: string;
  affiliateEligibilityAddress?: string;
  winnerCreditsAddress?: string;
  winnerCreditSponsorshipEth?: string;
};

/** New identity is created only in browser events, never while rendering. */
export function createSeasonId(): string {
  return `0x${crypto.randomUUID().replaceAll("-", "").padEnd(64, "0")}`;
}

export function defaultLaunchForm(chainId: "1" | "11155111" = "1"): LaunchForm {
  return { seasonId: "", seasonName: "", collectionColor: "#FFFFFF", label: "New collection", affiliateEligibilityAddress: "", winnerCreditsAddress: "", winnerCreditSponsorshipEth: "", algorithmVersion: "unique-rank-v6", maxMintsPerWallet: "20", winnerCount: "6", minAffiliateReferrals: "1", affiliatePayoutCapPercent: "30", saleStartAt: "0", name: "", symbol: "", chainId, maxSupply: "1000", mintPriceEth: "0.01", duration: "30", durationUnit: "days", prizePercent: "60", slots: "10", affiliatePoolPercent: "20", rates: [], initialOwner: "", enrollmentSigner: "", requestConfirmations: "64", callbackGasLimit: "200000", fundingEth: "", factoryMode: "new", factoryAddress: "", deployerAddress: "", factoryOwnerAddress: "", enrollmentDuration: "900", enrollmentDurationUnit: "seconds", notes: "" };
}

export function toScaled(value: string, decimals: number, label: string): string {
  if (value.trim() === "") return "";
  const match = /^(\d+)(?:\.(\d*))?$/.exec(value.trim());
  if (!match || (match[2]?.length ?? 0) > decimals) throw new Error(`${label} must be a non-negative decimal with at most ${decimals} decimal places.`);
  return (BigInt(match[1]) * 10n ** BigInt(decimals) + BigInt((match[2] ?? "").padEnd(decimals, "0") || "0")).toString();
}

export function fromScaled(value: string, decimals: number): string {
  if (!/^\d+$/.test(value)) return value;
  const digits = BigInt(value).toString().padStart(decimals + 1, "0");
  const fractional = digits.slice(-decimals).replace(/0+$/, "");
  return `${digits.slice(0, -decimals)}${fractional ? `.${fractional}` : ""}`;
}

function seconds(value: string, unit: DurationUnit, label: string): string {
  if (value.trim() === "") return "";
  if (!/^\d+$/.test(value.trim())) throw new Error(`${label} must be a whole number of ${unit}.`);
  return (BigInt(value.trim()) * (unit === "days" ? 86400n : unit === "hours" ? 3600n : 1n)).toString();
}

function duration(value: string): { value: string; unit: DurationUnit } {
  if (!/^\d+$/.test(value) || value === "0") return { value, unit: "seconds" };
  const n = BigInt(value);
  if (n % 86400n === 0n) return { value: (n / 86400n).toString(), unit: "days" };
  if (n % 3600n === 0n) return { value: (n / 3600n).toString(), unit: "hours" };
  return { value, unit: "seconds" };
}

export function formFromConfiguration(record: LaunchConfiguration): LaunchForm {
  const c = record.payload.contract;
  const o = record.payload.operations;
  const sale = duration(c.mintDurationSeconds);
  const enrollment = duration(o.enrollmentWindowSeconds);
  return { ...(c.maxMintsPerWallet ? { maxMintsPerWallet: c.maxMintsPerWallet } : {}), ...(c.seasonId !== undefined ? { seasonId: c.seasonId } : {}), ...(c.seasonName !== undefined ? { seasonName: c.seasonName } : {}), ...(c.collectionColor !== undefined ? { collectionColor: c.collectionColor } : {}), ...(o.affiliateEligibilityAddress !== undefined ? { affiliateEligibilityAddress: o.affiliateEligibilityAddress } : {}), ...(o.winnerCreditsAddress !== undefined ? { winnerCreditsAddress: o.winnerCreditsAddress, winnerCreditSponsorshipEth: fromScaled(o.winnerCreditSponsorshipWei ?? "", 18) } : {}), ...(c.algorithmVersion ? { algorithmVersion: c.algorithmVersion } : {}), ...(c.algorithmVersion === "unique-rank-v4" ? { secondPrizePercent: fromScaled(c.secondPrizeBps ?? "", 2) } : ["unique-rank-v5", "unique-rank-v6"].includes(c.algorithmVersion ?? "") ? { winnerCount: c.winnerCount ?? "" } : {}), ...(["unique-rank-v4", "unique-rank-v5", "unique-rank-v6"].includes(c.algorithmVersion ?? "") ? { minAffiliateReferrals: c.minAffiliateReferrals ?? "", affiliatePayoutCapPercent: fromScaled(c.affiliatePayoutCapBps ?? "", 2), saleStartAt: c.saleStartAt ?? "0" } : {}), label: record.label, name: c.name, symbol: c.symbol, chainId: c.chainId, maxSupply: c.maxSupply, mintPriceEth: fromScaled(c.mintPriceWei, 18), duration: sale.value, durationUnit: sale.unit, prizePercent: fromScaled(c.prizeBps, 2), slots: c.maxAffiliateSlots, affiliatePoolPercent: c.affiliatePoolBps === undefined ? null : fromScaled(c.affiliatePoolBps, 2), rates: c.affiliateRatesBps.map((rate) => fromScaled(rate, 2)), initialOwner: c.initialOwner, enrollmentSigner: c.enrollmentSigner, requestConfirmations: c.requestConfirmations, callbackGasLimit: c.callbackGasLimit, fundingEth: fromScaled(c.randomnessFundingWei, 18), factoryMode: o.factoryMode, factoryAddress: o.factoryAddress, deployerAddress: o.deployerAddress, factoryOwnerAddress: o.factoryOwnerAddress, enrollmentDuration: enrollment.value, enrollmentDurationUnit: enrollment.unit, notes: o.notes };
}

export function payloadFromForm(form: LaunchForm): LaunchPayload {
  const slots = /^\d+$/.test(form.slots) ? Number(form.slots) : 0;
  if (!Number.isSafeInteger(slots) || slots < 1 || slots > 100) throw new Error("Choose between 1 and 100 affiliate positions.");
  const rates = Array.from({ length: slots }, (_, index) => form.rates[index] ?? form.rates.at(-1) ?? "1");
  return {
    contract: { ...(form.maxMintsPerWallet ? { maxMintsPerWallet: form.maxMintsPerWallet } : {}), ...(form.seasonId !== undefined ? { seasonId: form.seasonId.trim() } : {}), ...(form.seasonName !== undefined ? { seasonName: form.seasonName.trim() } : {}), ...(form.collectionColor !== undefined ? { collectionColor: form.collectionColor.trim().toUpperCase(), textColor: /^#[0-9a-fA-F]{6}$/.test(form.collectionColor.trim()) ? contrastTextColor(form.collectionColor) : "" } : {}), ...(form.algorithmVersion ? { algorithmVersion: form.algorithmVersion } : {}), ...(form.algorithmVersion === "unique-rank-v4" ? { secondPrizeBps: toScaled(form.secondPrizePercent ?? "", 2, "Second prize") } : ["unique-rank-v5", "unique-rank-v6"].includes(form.algorithmVersion ?? "") ? { winnerCount: (form.winnerCount ?? "").trim() } : {}), ...(usesQualifiedAffiliateModel(form) ? { minAffiliateReferrals: (form.minAffiliateReferrals ?? "").trim(), affiliatePayoutCapBps: toScaled(form.affiliatePayoutCapPercent ?? "", 2, "Affiliate payout cap"), saleStartAt: (form.saleStartAt ?? "0").trim() } : {}), chainId: form.chainId, name: form.name, symbol: form.symbol, maxSupply: form.maxSupply.trim(), mintPriceWei: toScaled(form.mintPriceEth, 18, "Ticket price"), mintDurationSeconds: seconds(form.duration, form.durationUnit, "Sale lifetime"), initialOwner: form.initialOwner.trim(), requestConfirmations: form.requestConfirmations.trim(), callbackGasLimit: form.callbackGasLimit.trim(), randomnessFundingWei: toScaled(form.fundingEth, 18, "Randomness funding"), maxAffiliateSlots: form.slots.trim(), enrollmentSigner: form.enrollmentSigner.trim(), prizeBps: toScaled(form.prizePercent, 2, "Winner share"), affiliateRatesBps: form.affiliatePoolPercent != null ? [] : rates.map((value, index) => toScaled(value, 2, `Position ${index + 1} commission`)), ...(form.affiliatePoolPercent != null ? { affiliatePoolBps: toScaled(form.affiliatePoolPercent, 2, "Affiliate pool") } : {}), activateSale: false },
    operations: { ...(form.affiliateEligibilityAddress !== undefined ? { affiliateEligibilityAddress: form.affiliateEligibilityAddress.trim() } : {}), ...(form.winnerCreditsAddress !== undefined || form.winnerCreditSponsorshipEth !== undefined ? { winnerCreditsAddress: (form.winnerCreditsAddress ?? "").trim(), winnerCreditSponsorshipWei: toScaled(form.winnerCreditSponsorshipEth ?? "", 18, "Winner credit sponsorship") } : {}), factoryMode: form.factoryMode, factoryAddress: form.factoryMode === "new" ? "" : form.factoryAddress.trim(), deployerAddress: form.deployerAddress.trim(), factoryOwnerAddress: form.factoryOwnerAddress.trim(), enrollmentWindowSeconds: seconds(form.enrollmentDuration, form.enrollmentDurationUnit, "Enrollment window"), notes: form.notes },
  };
}

export function collectionEconomics(form: LaunchForm): { sales: string; prize: string; maxCommission: string; operatorMinimum: string } | null {
  try {
    const payload = payloadFromForm(form);
    const price = BigInt(payload.contract.mintPriceWei);
    const supply = BigInt(payload.contract.maxSupply);
    const prizeBps = BigInt(payload.contract.prizeBps);
    const rates = payload.contract.affiliateRatesBps.map(BigInt);
    const largest = payload.contract.affiliatePoolBps !== undefined ? BigInt(payload.contract.affiliatePoolBps) : rates.reduce((a, b) => a > b ? a : b, 0n);
    if (prizeBps + largest > 10000n || price % 10000n !== 0n || supply < 1n) return null;
    const sales = price * supply;
    return { sales: fromScaled(sales.toString(), 18), prize: fromScaled((sales * prizeBps / 10000n).toString(), 18), maxCommission: fromScaled((sales * largest / 10000n).toString(), 18), operatorMinimum: fromScaled((sales - sales * (prizeBps + largest) / 10000n).toString(), 18) };
  } catch { return null; }
}

/** Changing the collection version requires a fresh compatible factory. */
export function useAffiliatePool(form: LaunchForm): LaunchForm {
  return { ...form, seasonId: form.seasonId ?? "", seasonName: form.seasonName ?? "", collectionColor: form.collectionColor ?? DEFAULT_COLLECTION_COLOR, affiliateEligibilityAddress: "", winnerCreditsAddress: "", winnerCreditSponsorshipEth: "", affiliatePoolPercent: "10", algorithmVersion: "unique-rank-v3", factoryMode: "new", factoryAddress: "" };
}


/** Separate operator funding; sponsored mints still contribute the full ticket price to collection revenue. */
export function winnerCreditBudget(form: LaunchForm): { sponsorshipEth: string; maximumClaims: string; upfrontFundingEth: string | null } | null {
  if (!form.algorithmVersion || form.winnerCreditSponsorshipEth === undefined) return null;
  try {
    const budgetText = toScaled(form.winnerCreditSponsorshipEth, 18, "Winner credit sponsorship");
    const priceText = toScaled(form.mintPriceEth, 18, "Ticket price");
    if (!budgetText || !priceText || !/^[1-9]\d*$/.test(form.maxSupply)) return null;
    const budget = BigInt(budgetText), price = BigInt(priceText), supply = BigInt(form.maxSupply);
    if (budget > (1n << 256n) - 1n || price <= 0n || supply > 65536n) return null;
    const capacity = budget / price;
    let upfrontFundingEth: string | null = null;
    try {
      const randomnessText = toScaled(form.fundingEth, 18, "Randomness funding");
      if (randomnessText) upfrontFundingEth = fromScaled((budget + BigInt(randomnessText)).toString(), 18);
    } catch { /* Keep the usable sponsorship estimate while the VRF budget is being edited. */ }
    return { sponsorshipEth: fromScaled(budgetText, 18), maximumClaims: (capacity < supply ? capacity : supply).toString(), upfrontFundingEth };
  } catch { return null; }
}

/** Explicit draft conversion. Old deployment and registry addresses must never be silently reused. */
export function useTwoPrizeModel(form: LaunchForm, preset: "growth" | "standard" = "growth"): LaunchForm {
  const { winnerCount: _winnerCount, maxMintsPerWallet: _mintCap, ...legacy } = form;
  return { ...legacy, seasonId: form.seasonId ?? "", seasonName: form.seasonName ?? "", collectionColor: form.collectionColor ?? DEFAULT_COLLECTION_COLOR, algorithmVersion: "unique-rank-v4", maxSupply: "1000", mintPriceEth: "0.01", prizePercent: "60", secondPrizePercent: "20", minAffiliateReferrals: "1", affiliatePayoutCapPercent: "30", affiliatePoolPercent: preset === "growth" ? "20" : "10", rates: [], slots: "10", saleStartAt: "0", factoryMode: "new", factoryAddress: "", affiliateEligibilityAddress: "", winnerCreditsAddress: "", winnerCreditSponsorshipEth: "", enrollmentDuration: "900", enrollmentDurationUnit: "seconds" };
}

export function twoPrizeEconomics(form: LaunchForm): { first: string; second: string } | null {
  if (form.algorithmVersion !== "unique-rank-v4") return null;
  try {
    const c = payloadFromForm(form).contract, total = BigInt(c.prizeBps), second = BigInt(c.secondPrizeBps!);
    if (second <= 0n || total <= second || total - second < second || !collectionEconomics(form)) return null;
    const sales = BigInt(c.mintPriceWei) * BigInt(c.maxSupply);
    return { first: fromScaled((sales * (total - second) / 10000n).toString(), 18), second: fromScaled((sales * second / 10000n).toString(), 18) };
  } catch { return null; }
}

/** Mirrors V7's common payout cap, including Solidity integer rounding. */
export function qualifiedAffiliateExample(form: LaunchForm, qualified = Number(form.slots), minimumReferrals?: string): { each: string; distributed: string; growthReserve: string } | null {
  try {
    const c = payloadFromForm(form).contract;
    if (!usesQualifiedAffiliateModel(form) || !Number.isInteger(qualified) || qualified < 1 || qualified > Number(c.maxAffiliateSlots)) return null;
    const referrals = BigInt(minimumReferrals ?? c.minAffiliateReferrals!), minimum = BigInt(c.minAffiliateReferrals!);
    if (referrals < minimum || referrals * BigInt(qualified) > BigInt(c.maxSupply)) return null;
    const pool = BigInt(c.mintPriceWei) * BigInt(c.maxSupply) * BigInt(c.affiliatePoolBps!) / 10000n;
    const equal = pool / BigInt(qualified), cap = BigInt(c.mintPriceWei) * referrals * BigInt(c.affiliatePayoutCapBps!) / 10000n;
    const each = equal < cap ? equal : cap;
    return { each: fromScaled(each.toString(), 18), distributed: fromScaled((each * BigInt(qualified)).toString(), 18), growthReserve: fromScaled((pool - each * BigInt(qualified)).toString(), 18) };
  } catch { return null; }
}

/** Qualified referral terms and a fixed sale opening are shared by V7–V10. */
export function usesQualifiedAffiliateModel(form: Pick<LaunchForm, "algorithmVersion">): boolean {
  return ["unique-rank-v4", "unique-rank-v5", "unique-rank-v6"].includes(form.algorithmVersion ?? "");
}

/** Explicit V10 conversion; keep collection identity and existing affiliate economics. */
export function useEqualPrizeModel(form: LaunchForm): LaunchForm {
  const { secondPrizePercent: _secondPrizePercent, ...current } = form;
  const modern = usesQualifiedAffiliateModel(form);
  return { ...current, seasonId: form.seasonId ?? "", seasonName: form.seasonName ?? "", collectionColor: form.collectionColor ?? DEFAULT_COLLECTION_COLOR,
    algorithmVersion: "unique-rank-v6", maxMintsPerWallet: "20", winnerCount: "6", maxSupply: "1000", mintPriceEth: "0.01", prizePercent: "60",
    minAffiliateReferrals: modern ? form.minAffiliateReferrals : "1", affiliatePayoutCapPercent: modern ? form.affiliatePayoutCapPercent : "30",
    affiliatePoolPercent: form.affiliatePoolPercent ?? "20", rates: [], slots: form.slots || "10", saleStartAt: "0",
    factoryMode: "new", factoryAddress: "", affiliateEligibilityAddress: "", winnerCreditsAddress: "", winnerCreditSponsorshipEth: "",
    enrollmentDuration: modern ? form.enrollmentDuration : "900", enrollmentDurationUnit: modern ? form.enrollmentDurationUnit : "seconds" };
}

/** Mirrors V8–V10's exact equal allocations; no floating-point or rounding estimates. */
export function equalPrizeEconomics(form: LaunchForm): { count: number; each: string; total: string; percentEach: string } | null {
  if (!["unique-rank-v5", "unique-rank-v6"].includes(form.algorithmVersion ?? "")) return null;
  try {
    const c = payloadFromForm(form).contract;
    if (!/^(?:[1-9]|10)$/.test(c.winnerCount ?? "")) return null;
    const count = BigInt(c.winnerCount!), totalBps = BigInt(c.prizeBps), supply = BigInt(c.maxSupply);
    if (supply < count || totalBps <= 0n || totalBps % count !== 0n || !collectionEconomics(form)) return null;
    const total = BigInt(c.mintPriceWei) * supply * totalBps / 10000n;
    return { count: Number(count), each: fromScaled((total / count).toString(), 18), total: fromScaled(total.toString(), 18), percentEach: fromScaled((totalBps / count).toString(), 2) };
  } catch { return null; }
}

/** Explicit identity upgrade preserves reviewed economics, schedule and catalog identity. */
export function usePermanentNumbers(form: LaunchForm): LaunchForm {
  if (form.algorithmVersion === "unique-rank-v6" && form.maxMintsPerWallet === "20") return form;
  return { ...form, algorithmVersion: "unique-rank-v6", maxMintsPerWallet: "20", factoryMode: "new", factoryAddress: "", affiliateEligibilityAddress: "", winnerCreditsAddress: "" };
}
