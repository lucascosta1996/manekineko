import Link from "next/link";

export function AffiliateEnrollmentRules({ holderProgram, bootstrap }: { holderProgram: boolean; bootstrap: boolean }) {
  return <section className="affiliate-enrollment-rules" aria-labelledby="affiliate-rules-title">
    <div className="affiliate-rules-heading">
      <div><p className="eyebrow">{holderProgram ? "BEFORE YOU ENROLL" : "COLLECTOR ELIGIBILITY"}</p><h2 id="affiliate-rules-title">{bootstrap ? "The first collection starts here." : "Check your affiliate eligibility."}</h2></div>
      <Link className="text-link" href="/my-nfts">View my tickets <span aria-hidden="true">↗</span></Link>
    </div>
    {!holderProgram && <p className="affiliate-rules-context">This earlier collection keeps its original terms and does not require an NFT for enrollment. The rules below apply to new collections using NFT holder eligibility.</p>}
    {bootstrap && <p className="affiliate-rules-context">No earlier NFT is required for this first official collection on the network. From the next official collection onward, the holder rules below apply.</p>}
    <dl className="affiliate-rules-grid">
      <div><dt>Hold an eligible earlier NFT.</dt><dd>Use an NFT you currently own from an earlier official collection on the same network. Current multi-prize collections must have sold out, revealed their results and fully reserved their prizes. Older collections may also require completed prize payment. You do not need a winning ticket; eligibility is checked before enrollment.</dd></div>
      <div><dt>One NFT. One position per collection.</dt><dd>Each wallet can enroll once. A qualifying NFT can unlock only one position in that collection, even if it changes hands. Holding more NFTs does not give the same wallet extra positions.</dd></div>
      <div><dt>Keep it. Trade it. Use it again later.</dt><dd>Hold the NFT until enrollment confirms. Afterward, selling it does not move or cancel your position or earnings. Its current holder may use it again for another future collection.</dd></div>
    </dl>
    <p className="affiliate-rules-footnote">Only the first official collection on each network is exempt from the NFT requirement. Enrollment closes before minting begins, so this collection’s own NFTs cannot qualify. Positions are limited; wallet verification, automated abuse checks and an enrollment transaction with a network fee are still required.</p>
    <Link className="text-link" href="/docs/affiliates">Read the affiliate guide <span aria-hidden="true">→</span></Link>
  </section>;
}
