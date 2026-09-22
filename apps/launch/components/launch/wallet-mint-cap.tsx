"use client";

import { usePermanentNumbers, type LaunchForm } from "./form-values";

/** Explicit upgrade clears incompatible deployment pins while retaining reviewed terms. */
export const useWalletMintCap = usePermanentNumbers;

export function WalletMintCap({ form, disabled, onUpgrade }: { form: LaunchForm; disabled: boolean; onUpgrade: () => void }) {
  if (!["unique-rank-v5", "unique-rank-v6"].includes(form.algorithmVersion ?? "")) return null;
  const permanent = form.algorithmVersion === "unique-rank-v6";
  return <div className="launch-context-note">
    <strong>{permanent ? "V10 · Permanent numbers from mint" : form.maxMintsPerWallet === "20" ? "Saved V9 configuration · Numbers after reveal" : "Saved V8 configuration · No cumulative wallet limit"}</strong>
    <p>{permanent ? "Solidity generates each NFT’s permanent four-number identity. One VRF draw after sellout assigns separate scores and prizes. Artwork never changes with draw or claim status." : "This draft retains its original contract version. An explicit V10 upgrade keeps its pricing, prize terms, names and season artwork, but requires a V10 factory, Eligibility V5 and Winner Credits V6."}</p>
    {form.maxMintsPerWallet === "20" && <p>Each wallet can receive at most 20 primary mints in this collection. Paid, referral and sponsored tickets share this fixed allowance. Transfers and refunds do not reset it.</p>}
    {!permanent && !disabled && <button type="button" className="launch-button launch-button-secondary" onClick={onUpgrade}>Upgrade draft to V10</button>}
  </div>;
}
