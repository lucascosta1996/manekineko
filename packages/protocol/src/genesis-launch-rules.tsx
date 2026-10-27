import Link from "next/link";
import { buttonClassName } from "@manekineko/ui/button";

export function GenesisLaunchRules() {
  return (
    <section className="public-explainer" aria-label="Genesis launch rules">
      <h2>One NFT. Two utilities.</h2>
      <p>Vote on the first collection. Enroll in the affiliate program across every collection and season.</p>
      <p><strong>Earn real ETH through referrals.</strong> Enroll during voting, then share your referral URL. One paid mint through it qualifies you for an equal share of the 20% affiliate pool, claimable after sellout and a successful draw.</p>
      <p>Planned launch rules. The connected Sepolia test retains its original terms.</p>
      <dl className="public-allocation-grid">
        <div><dt>1,000 free NFTs</dt><dd>0 ETH to mint, plus network gas.</dd></div>
        <div><dt>Two per wallet</dt><dd>Up to two lifetime primary mints. Transfers do not reset the limit.</dd></div>
        <div><dt>No mint deadline</dt><dd>The first season waits until all 1,000 Genesis NFTs are minted. If Genesis never sells out, the first season never starts.</dd></div>
      </dl>
      <p><strong>Affiliate eligibility across all seasons.</strong> The first collection requires Genesis. Later collections accept Genesis or an eligible NFT from an earlier successfully revealed paid collection.</p>
      <p>Enrollment opens during voting, with ten positions and one per wallet. Each NFT can qualify once per collection. If no affiliate qualifies, the full 20% joins the operator’s 10% treasury allocation after a successful draw, making 30% withdrawable by the operator.</p>
      <p>Genesis votes only in the first paid ballot. It has no prize, sponsored mint or season holder reward entitlement.</p>
      <Link className={buttonClassName({ variant: "secondary" })} href="/docs/onchain-voting#genesis">Read Genesis rules</Link>
    </section>
  );
}
