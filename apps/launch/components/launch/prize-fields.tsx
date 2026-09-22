"use client";

import { collectionEconomics, equalPrizeEconomics, qualifiedAffiliateExample, type LaunchForm } from "./form-values";

/** Current collections use equal prizes; historical payloads remain available in the archive. */
export function PrizeFields({ form, disabled, onChange }: { form: LaunchForm; disabled: boolean; onChange: (form: LaunchForm) => void }) {
  if (!["unique-rank-v5", "unique-rank-v6"].includes(form.algorithmVersion ?? "")) return <p className="launch-context-note">Historical prize terms are preserved in the saved configuration. Create a current collection to configure equal prizes and qualified affiliate rewards.</p>;
  const edit = (key: keyof LaunchForm, value: string) => onChange({ ...form, [key]: value });
  const economy = collectionEconomics(form), prizes = equalPrizeEconomics(form), example = qualifiedAffiliateExample(form);
  const presetPrizes = form.prizePercent === "60" && form.winnerCount === "6";
  const percent = (label: string, key: "prizePercent" | "affiliatePoolPercent" | "affiliatePayoutCapPercent", hint: string) => <label className="launch-field"><span>{label}</span><div className="launch-input-unit"><input inputMode="decimal" value={form[key] ?? ""} onChange={event => edit(key, event.target.value)} disabled={disabled}/><span>%</span></div><small>{hint}</small></label>;
  return <details className="launch-advanced" open>
    <summary>Prize & affiliate allocations <span>Equal prizes · qualified referrals</span></summary>
    <div className="launch-fields">
      <label className="launch-field launch-field-wide"><span>Allocation preset</span><select value={presetPrizes && form.affiliatePoolPercent === "20" ? "growth" : presetPrizes && form.affiliatePoolPercent === "10" ? "standard" : "custom"} disabled={disabled} onChange={event => { if (event.target.value !== "custom") onChange({ ...form, prizePercent: "60", winnerCount: "6", affiliatePoolPercent: event.target.value === "growth" ? "20" : "10" }); }}><option value="growth">Growth · 6 equal prizes · 60% prizes / 20% affiliates / 20% operator</option><option value="standard">Standard · 6 equal prizes · 60% prizes / 10% affiliates / 30% operator</option><option value="custom">Custom allocations</option></select><small>Sets the prize allocation, winner count and affiliate pool. Ticket price, supply and referral requirements remain independently editable.</small></label>
      {percent("Total prize allocation", "prizePercent", "Divided equally among the winning NFTs. The percentage supports two decimal places and must divide exactly by the winner count.")}
      <label className="launch-field"><span>Winning NFTs</span><input inputMode="numeric" value={form.winnerCount ?? ""} onChange={event => edit("winnerCount", event.target.value)} disabled={disabled}/><small>1–10, within the ticket supply. The highest-scoring NFTs receive equal prizes; the standard collection has six winners.</small></label>
      {percent("Affiliate pool", "affiliatePoolPercent", "Share of mint revenue reserved for affiliates. Together with the prize allocation, this cannot exceed 100%.")}
      <label className="launch-field"><span>Affiliate positions</span><input inputMode="numeric" value={form.slots} onChange={event => edit("slots", event.target.value)} disabled={disabled}/><small>1–100 positions. More positions do not increase the pool.</small></label>
      <label className="launch-field"><span>Paid referrals to qualify</span><input inputMode="numeric" value={form.minAffiliateReferrals ?? ""} onChange={event => edit("minAffiliateReferrals", event.target.value)} disabled={disabled}/><small>Each affiliate must reach this minimum to earn a share. Sponsored free mints do not count.</small></label>
      {percent("Common payout cap", "affiliatePayoutCapPercent", "The equal payout cannot exceed this percentage of the lowest qualifying affiliate’s referred revenue.")}
    </div>
    <div className="launch-affiliate-explainer">
      <strong>Qualify through referrals. Share equally.</strong>
      <p>At sellout, the pool is divided equally among affiliates who reach the referral minimum, subject to the common payout cap. Empty positions and unqualified affiliates receive nothing. Rounding and unused affiliate funds stay in the separate growth reserve.</p>
      {example && <p>If all {form.slots} positions qualify with {form.minAffiliateReferrals} paid referral{form.minAffiliateReferrals === "1" ? "" : "s"} each: <strong>{example.each} ETH per affiliate</strong>, {example.distributed} ETH distributed and {example.growthReserve} ETH retained in the growth reserve. A higher minimum referred revenue among the qualifying affiliates can raise the payout up to the equal pool share.</p>}
      {!example && <p role="status">This example needs valid positions and referral settings. The ticket supply must cover the referral minimum for every position.</p>}
      <p>The payout per affiliate is the lower of the equal pool share and the common payout cap. More positions can leave that individual amount unchanged when the cap applies, while the total distributed changes. Actual payouts depend on how many affiliates qualify and their paid referrals.</p>
      <p>Each winning NFT holder claims its prize separately. One wallet can hold several winning NFTs. Prizes remain protected until claimed. If the collection expires unsold, buyers can claim refunds and no prizes or affiliate rewards are paid.</p>
    </div>
    {economy && prizes && <div className="automation-economics"><span>AT SELLOUT · ESTIMATE</span><div><span>Total prize reserve<strong>{prizes.total} ETH</strong></span><span>Each of {prizes.count} winning NFTs<strong>{prizes.each} ETH</strong></span><span>Affiliate budget<strong>{economy.maxCommission} ETH</strong></span><span>Operator gross<strong>{economy.operatorMinimum} ETH</strong></span></div><p>Based on {form.maxSupply} NFTs at {form.mintPriceEth} ETH each. Terms are fixed at deployment. Operator proceeds exclude gas, randomness and sponsored winner credits.</p></div>}
  </details>;
}
