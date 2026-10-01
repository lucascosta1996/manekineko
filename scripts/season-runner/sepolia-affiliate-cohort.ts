import { Contract, getAddress, id, keccak256, ZeroAddress, type Provider, type TransactionRequest, type Wallet } from "ethers";
import type { AffiliateCohort } from "./sepolia-scenarios.ts";
import { ENROLLMENT_V6_TYPES } from "../../apps/web/lib/affiliates/policy.ts";
import { ensure } from "./store.ts";

/** Explicit Sepolia fixture admission. The human affiliate still enrolls through the public UI. */
export async function enrollCohort(options: {
  chainId: number; cohort: AffiliateCohort; round: Contract; provider: Provider; block: {number: number; timestamp: number};
  affiliate: string; wallets: Wallet[]; admissionSigner?: Wallet;
  canonical: () => Promise<void>; fund: (wallet: Wallet) => Promise<boolean>;
  send: (wallet: Wallet, action: string, request: TransactionRequest) => Promise<unknown>;
}) {
  ensure(options.chainId === 11155111, "cohort_is_sepolia_only");
  const { cohort, round, block } = options, at = { blockTag: block.number };
  ensure(await round.maxAffiliateSlots(at) === 10n && await round.affiliateMinimumReferrals(at) === 1n, "cohort_requires_ten_slots_one_referral");
  const target = getAddress(String(round.target)), affiliate = getAddress(options.affiliate);
  const poolBps = await round.affiliatePoolBps(at), opening = await round.saleStartAt(at);
  for (const slot of cohort.slots) {
    const expected = getAddress(slot.wallet), actual = getAddress(await round.affiliateWallet(slot.id, at));
    ensure(actual === ZeroAddress || actual === expected, "cohort_slot_taken_by_another_wallet");
    const referrals = await round.affiliateReferredMints(slot.id, at);
    ensure(cohort.successfulIds.includes(slot.id) || referrals === 0n, "cohort_unsuccessful_slot_received_referral");
    if (actual === expected) continue;
    ensure(BigInt(block.timestamp) < opening, "cohort_enrollment_window_expired");
    if (expected === affiliate) return { action: "manual-checkpoint", checkpoint: "awaiting-enrollment", affiliateId: slot.id };
    const wallet = options.wallets.find(wallet => wallet.address === expected);
    ensure(wallet && options.admissionSigner && getAddress(await round.enrollmentSigner(at)) === options.admissionSigner.address, "cohort_requires_bound_admission_signer_and_vault_wallet");
    ensure(keccak256(await options.provider.getCode(cohort.sourceCollection, block.number)) === cohort.sourceCodeHash, "cohort_source_runtime_changed");
    const source = new Contract(cohort.sourceCollection, ["function ownerOf(uint256) view returns(address)"], options.provider);
    ensure(getAddress(await source.ownerOf(slot.sourceTokenId, at)) === expected, "cohort_source_nft_owner_changed");
    const registry = new Contract(await round.affiliateEligibility(at), ["function eligibilityStatus(address,address,address,uint256) view returns(uint8)"], options.provider);
    ensure(await registry.eligibilityStatus(target, expected, cohort.sourceCollection, slot.sourceTokenId, at) === 0n, "cohort_source_nft_not_eligible");
    if (await options.fund(wallet)) return { action: "fund-cohort-enrollment", affiliateId: slot.id };
    const nonce = id(`tincta:sepolia-review:${target}:${slot.id}:${expected}:${cohort.sourceCollection}:${slot.sourceTokenId}`), deadline = opening - 1n;
    const signature = await options.admissionSigner.signTypedData({name:"ManekinekoAffiliateEnrollment",version:"4",chainId:11155111,verifyingContract:target}, ENROLLMENT_V6_TYPES,
      {applicant:expected,affiliateId:slot.id,poolBps,sourceCollection:cohort.sourceCollection,sourceTokenId:slot.sourceTokenId,nonce,deadline});
    const request = await round.enrollAffiliate.populateTransaction(expected,slot.id,poolBps,cohort.sourceCollection,slot.sourceTokenId,nonce,deadline,signature);
    await options.canonical();
    await options.send(wallet, `cohort-enroll:${target.toLowerCase()}:${slot.id}`, request);
    return { action: "enroll-cohort", affiliateId: slot.id };
  }
  ensure(await round.affiliateCount(at) === 10n, "cohort_occupancy_mismatch");
  return null;
}

/** Distribute only to the five selected beneficiaries; avoid payer/recipient self referrals. */
export function cohortReferralId(cohort: AffiliateCohort, wallet: string, walletIndex: number) {
  const candidates = cohort.successfulIds.filter(id => getAddress(cohort.slots[id - 1].wallet) !== getAddress(wallet));
  if (!candidates.length) throw new Error("cohort_has_no_nonself_referral");
  return candidates[walletIndex % candidates.length];
}

export function assertCohortOutcome(cohort: AffiliateCohort, counts: bigint[], qualified: bigint, accrued: bigint[], share: bigint) {
  if (counts.length !== 10 || accrued.length !== 10 || qualified !== 5n || share <= 0n
    || counts.some((count, index) => cohort.successfulIds.includes(index + 1) ? count < 1n : count !== 0n)
    || accrued.some((amount, index) => amount !== (cohort.successfulIds.includes(index + 1) ? share : 0n))) throw new Error("cohort_requires_ten_enrolled_exactly_five_successful");
}
