"use client";

/** A fixed protocol rule; the editable value identifies its canonical network registry. */
export function AffiliateEligibilityFields({ address, disabled, inherited = false, onAddress, version, mintCap }: {
  address: string | undefined;
  mintCap?: string;
  version?: "unique-rank-v3" | "unique-rank-v4" | "unique-rank-v5" | "unique-rank-v6";
  disabled: boolean;
  inherited?: boolean;
  onAddress: (value: string) => void;
}) {
  return <details className="launch-advanced">
    <summary>Affiliate eligibility <span>NFT holders · verified enrollment</span></summary>
    <p>The first official collection on a network allows open enrollment. Every later collection requires an NFT from an earlier completed official collection. A new factory does not restart open enrollment.</p>
    <p>{["unique-rank-v4", "unique-rank-v5", "unique-rank-v6"].includes(version ?? "") ? "Completed means sold out with a verified draw and protected prizes. Earlier versions keep their original settlement requirements." : "This historical version requires the earlier collection to have sold out, revealed and paid its winner."} Any NFT from that collection can qualify. The current collection’s NFTs cannot qualify because affiliate enrollment closes before minting opens.</p>
    <p>Eligibility is checked on-chain at enrollment: one position per wallet and one use of each qualifying NFT per collection. Transferring that NFT afterward does not transfer the affiliate position or earnings. The NFT can qualify its holder for another future collection.</p>
    <p>Wallet verification and automated abuse checks also apply. Enrollment alone earns nothing: affiliates must meet the collection’s paid-referral minimum to share the pool at sellout.</p>
    <div className="launch-fields">
      <label className="launch-field launch-field-wide"><span>Affiliate eligibility registry</span><input className="launch-address-input" value={address ?? ""} onChange={event => onAddress(event.target.value)} disabled={disabled || inherited} placeholder="0x…" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={42}/><small>{inherited ? "Shared with collection 01. Every collection in this season uses the same network registry." : "Canonical registry for the selected network. Deployment preflight verifies its code, version and official collection records."}{version === "unique-rank-v6" && " V10 requires Eligibility V5 with verified historical imports."}{version === "unique-rank-v5" && (mintCap === "20" ? " V9 collections require registry V4." : " V8 collections require registry V3.")}</small></label>
    </div>
  </details>;
}
