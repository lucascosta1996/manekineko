"use client";
import { Icon } from "@manekineko/ui/icons";

import { DEFAULT_SPONSORED_MINT_BUDGET_ETH, winnerCreditBudget, type LaunchForm } from "./form-values";

/** Funding plan only. Registering collections and moving ETH are separate operator transactions. */
export function WinnerCreditFields({ form, disabled, onRegistry, onBudget, onConfigure }: {
  form: LaunchForm;
  disabled: boolean;
  onRegistry: (value: string) => void;
  onBudget: (value: string) => void;
  onConfigure: () => void;
}) {
  if (!form.algorithmVersion) return null;
  const configured = form.winnerCreditsAddress !== undefined;
  const budget = winnerCreditBudget(form);
  return <details className="launch-advanced">
    <summary>Winner credit <span>One per wallet, for life</span><Icon name="chevron" className="ui-disclosure-icon" /></summary>
    <p>A wallet holding a winning NFT when its prize is claimed can receive one non-transferable credit for an NFT in a later participating collection. Winning again or holding several winning NFTs does not create another lifetime credit.</p>
    <p>The operator sponsors the full mint price, preserving the prize and affiliate allocations. The winner pays network gas.</p>
    {!configured ? <div className="launch-context-note"><p>This saved configuration has no winner credit funding plan.</p>{!disabled && <button type="button" className="launch-button launch-button-secondary" onClick={onConfigure}>Set up winner credit funding</button>}</div> : <>
      <div className="launch-fields">
        <label className="launch-field launch-field-wide"><span>Winner credits registry</span><input className="launch-address-input" value={form.winnerCreditsAddress ?? ""} onChange={event => onRegistry(event.target.value)} disabled={disabled} placeholder="0x…" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={42}/><small>Shared registry on the selected network. {form.algorithmVersion === "unique-rank-v6" ? "V10 collections require Winner Credits V6 with preserved lifetime-use history and retired older sponsorship destinations. " : form.maxMintsPerWallet === "20" ? "V9 collections require registry V5, which enforces the same one-ticket lifetime reward. " : form.algorithmVersion === "unique-rank-v5" ? "V8 collections require registry V4, which recognizes every winning rank and preserves earlier lifetime limits. " : ""}Factory approval and collection registration are checked before launch.</small></label>
        <label className="launch-field launch-field-wide"><span>Sponsored mint budget</span><div className="launch-input-unit"><input inputMode="decimal" value={form.winnerCreditSponsorshipEth ?? ""} onChange={event => onBudget(event.target.value)} disabled={disabled} placeholder="Set this collection’s budget"/><span>ETH</span></div><small>Standard budget: 2 ETH per collection. Separate operator funding; capacity depends on the ticket price.</small></label>{!disabled && form.winnerCreditSponsorshipEth !== DEFAULT_SPONSORED_MINT_BUDGET_ETH && <button type="button" className="launch-inline-link" onClick={() => onBudget(DEFAULT_SPONSORED_MINT_BUDGET_ETH)}>Use standard 2 ETH budget</button>}
      </div>
      <div className="launch-context-note"><p>{budget ? <><strong>Up to {budget.maximumClaims} sponsored NFT{budget.maximumClaims === "1" ? "" : "s"}</strong> from {budget.sponsorshipEth} ETH at this ticket price. </> : "Enter a budget and ticket price to calculate sponsored mint capacity. "}Redemptions require an unused lifetime credit, remaining tickets and a funded registry. Unused credits remain available when a redemption cannot be completed.</p></div>
      <p>Saving a budget does not transfer ETH. Fund the registry and register the collection before sale activation.</p>
    </>}
  </details>;
}
