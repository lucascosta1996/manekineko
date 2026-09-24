import v10Source from "@manekineko/contract-abi/round-v10-source";
import eligibilityV5Source from "@manekineko/contract-abi/affiliate-eligibility-v5-source";
import v9Source from "@manekineko/contract-abi/round-v9-source";
import eligibilityV4Source from "@manekineko/contract-abi/affiliate-eligibility-v4-source";
import v8Source from "@manekineko/contract-abi/round-v8-source";
import eligibilityV3Source from "@manekineko/contract-abi/affiliate-eligibility-v3-source";
import v7Source from "@manekineko/contract-abi/round-v7-source";
import eligibilityV2Source from "@manekineko/contract-abi/affiliate-eligibility-v2-source";
import v6Source from "@manekineko/contract-abi/round-v6-source";
import eligibilitySource from "@manekineko/contract-abi/affiliate-eligibility-source";
import v5Source from "@manekineko/contract-abi/round-v5-source";
import { formatRewardAllocation } from "../../../../components/affiliates/program-terms";
import Link from "next/link";
import { notFound } from "next/navigation";
import legacySource from "@manekineko/contract-abi/round-source";
import v2Source from "@manekineko/contract-abi/round-v2-source";
import v3Source from "@manekineko/contract-abi/round-v3-source";
import v4Source from "@manekineko/contract-abi/round-v4-source";
import { SiteShell } from "../../../../components/site-shell";
import { getCollection } from "../../../../lib/collections/repository";
import { programRecord } from "../../../../lib/affiliates/repository";
import { AffiliateError } from "../../../../lib/affiliates/policy";
import { contractSourceVersion, etherscanContractUrl } from "../../../../lib/collections/contract-presentation";

const sources = { V1: legacySource, V2: v2Source, V3: v3Source, V4: v4Source, V5: v5Source, V6: v6Source, V7: v7Source, V8: v8Source, V9: v9Source, V10: v10Source };

export const dynamic = "force-dynamic";

export default async function ContractPage({
  params,
}: {
  params: Promise<{ collectionId: string }>;
}) {
  const { collectionId } = await params;
  const collection = await getCollection(collectionId);
  if (!collection) notFound();
  const program = process.env.DATABASE_URL ? await programRecord(collectionId).catch((error: unknown) => {
    if (error instanceof AffiliateError && error.code === "not_found") return null;
    throw error;
  }) : null;
  const permanent = collection.contractVersion === "affiliate-v10";
  const v2 = collection.algorithmVersion !== "feistel-v1";
  const v8 = (collection.contractVersion === "affiliate-v8" || collection.contractVersion === "affiliate-v9" || collection.contractVersion === "affiliate-v10");
  const v7 = v8 || collection.contractVersion === "affiliate-v7";
  const v3 = collection.algorithmVersion === "unique-rank-v3" || v7;
  const version = contractSourceVersion(collection);
  const explorerUrl = etherscanContractUrl(collection);
  const rankingName = v8 ? "MultiAwardRank" : v7 ? "AwardRank" : "UniqueRank";
  const gateSource = permanent ? eligibilityV5Source : collection.contractVersion === "affiliate-v9" ? eligibilityV4Source : v8 ? eligibilityV3Source : v7 ? eligibilityV2Source : eligibilitySource;
  const affiliateSource = program?.contractVersion === "affiliate-v10" ? v10Source : program?.contractVersion === "affiliate-v9" ? v9Source : program?.contractVersion === "affiliate-v8" ? v8Source : program?.contractVersion === "affiliate-v7" ? v7Source : program?.contractVersion === "affiliate-v6" ? v6Source : program?.contractVersion === "affiliate-v5" ? v5Source : program?.contractVersion === "affiliate-v4" ? v4Source : v3Source;
  const source = sources[version];
  const rendererSource = "rendererSource" in source ? source : affiliateSource;
  return (
    <SiteShell chainId={collection.chainId}>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/seasons">Seasons</Link>
        <span>/</span>
        <Link href={`/mint/${collection.id}`}>{collection.name}</Link>
        <span>/</span>
        <span aria-current="page">Contract</span>
      </nav>
      <div className="source-heading">
        <p className="eyebrow">REWARDS GOVERNED BY SMART CONTRACTS.</p>
        <h1>The rules behind your rewards.</h1>
        <p>{v7 ? "The contract protects unclaimed prizes and earned affiliate rewards. Eligible wallets claim directly to their chosen receiving address, without manual payout approval." : "This collection’s original contract determines its prizes, referral rewards and payment process. Review the version-specific rules below."}</p>
        <div className="source-deployment">
          <span className="source-version">{version} · {collection.networkName}</span>
          <p>{permanent ? "This collection uses V10: permanent Solidity-generated numbers from mint, a separate post-sellout VRF draw, equal prizes and 20 cumulative primary mints per recipient wallet." : version === "V9"
            ? "This collection uses V9: equal prizes and a lifetime limit of 20 primary mints to each wallet in this collection. Paid, referral and sponsored mints share the same allowance; transferring NFTs does not reset it."
            : `This collection uses its original ${version} rules. The source and results below belong to this version; later architecture changes do not upgrade it.`}</p>
          {explorerUrl && <>
            <code className="source-address">{collection.contractAddress}</code>
            <a className="text-link" href={explorerUrl} target="_blank" rel="noopener noreferrer">View contract on Etherscan ↗</a>
          </>}
        </div>
        <p>
          This is the repository source for <code>{source.contractName}</code>,
          compiled with Solidity {source.compiler}.{" "}
          {collection.contractStatus === "deployed"
            ? "This app has not verified the deployed bytecode against this source."
            : "This collection is not deployed yet."}{" "}
          This source preview is not an explorer verification or an independent
          security audit.
        </p>
        <p>V10 introduces permanent numbers at mint and separate VRF-derived scores after sellout. <Link href="/docs/verification">Read the version-aware verification guide →</Link></p>
        <Link className="text-link" href={`/mint/${collection.id}`}>
          ← Back to mint
        </Link>
      </div>
      <div className="source-guide">
        <h2>How winners and payouts are determined</h2>
        {v2 ? <ol>
          <li><code>requestRandomness()</code> submits the collection’s single request after sellout.</li>
          <li>The configured Chainlink coordinator verifies the VRF proof before <code>rawFulfillRandomWords()</code> stores the word.</li>
          <li><code>finalizeDraw()</code> processes the fixed candidate sequence. <code>{rankingName}</code> assigns every score from 1 to {collection.maxSupply.toLocaleString("en-US")} once.</li>
          {permanent ? <li><code>ScrambledRank</code> turns the token ID into permanent numbers at mint. <code>tokenIdForCombination()</code> reverses that identity. After finalization, <code>scoreCombination()</code> returns the separately assigned score; the metadata stays unchanged.</li> : v3 && <li><code>ScrambledRank</code> reversibly encodes each rank into four numbers. <code>combinationKey()</code> exposes the collection key, and <code>scoreCombination()</code> decodes the numbers to their unique rank. This encoding does not add randomness.</li>}
          <li>{v7 ? <><code>claimPrizeForRank(rank,recipient)</code> allows only that winning NFT’s current holder to claim its reserved prize immediately after finalization. Each award is independent and may belong to one wallet.</> : <><code>claimPrize()</code> lets the highest-scoring NFT’s holder claim its reserved prize under this deployment’s rules.</>}</li>
        </ol> : <ol>
          <li>
            <code>captureReveal()</code> derives and stores a seed from the
            predetermined future block’s hash.
          </li>
          <li>
            <code>_combinationCode()</code> shuffles each token ID without
            duplicate combinations.
          </li>
          <li>
            <code>_score()</code> applies the public formula and unique tie
            breaker.
          </li>
          <li>
            <code>settle()</code> finds the greatest result;{" "}
            <code>distributePrize()</code> pays its current holder.
          </li>
        </ol>}
        <p>
          {v7 ? "The configured number of distinct winning tickets are selected without replacement, with each rank appearing exactly once. Randomness relies on Chainlink VRF; prizes remain reserved until their respective NFT holders claim. A revealed draw is ready for the next collection without waiting for all claims." : v2 ? "The unique greatest score is guaranteed by the ranking formula. Randomness relies on Chainlink VRF and its security and availability assumptions. NFT transfers pause at sellout until the prize is delivered; there are no rerolls or sold-out refunds." : "Fixed rules can be inspected by everyone. Block producers can still influence the reveal source, and payout needs an owner transaction."}
        </p>
      </div>
      <div className="source-code">
        <div>
          <span>{source.contractName}.sol</span>
          <span>Solidity {source.compiler}</span>
        </div>
        <pre tabIndex={0} aria-label={`${source.contractName} Solidity source`}>
          <code>{source.source}</code>
        </pre>
      </div>
      {v2 && "rankingSource" in source && typeof source.rankingSource === "string" && <div className="source-code">
        <div><span>{rankingName}.sol</span><span>Solidity {source.compiler}</span></div>
        <pre tabIndex={0} aria-label={`${rankingName} Solidity source`}><code>{source.rankingSource}</code></pre>
      </div>}
      {v3 && "combinationSource" in source && typeof source.combinationSource === "string" && <div className="source-code">
        <div><span>ScrambledRank.sol</span><span>Solidity {source.compiler}</span></div>
        <pre tabIndex={0} aria-label="ScrambledRank Solidity source"><code>{source.combinationSource}</code></pre>
      </div>}
      {program && <>
        <div className="source-guide" id="affiliate-rules">
          <h2>Affiliate rewards, enforced on-chain</h2>
          <p>
            Enrollment requires an expiring authorization from the automated admission service.
            The contract enforces position limits and registered beneficiaries. Each successful
            referred mint is attributed to its selected affiliate under this collection’s
            immutable payout rules, while preserving the configured winner’s prize.
            Earned rewards become claimable at sellout; an unsold expiry voids pending rewards
            so holders can receive full mint-price refunds.
          </p>
          {v7 && <p>Only affiliates with at least {program.minAffiliateReferrals} paid referrals qualify. The affiliate reward budget at sellout is up to {formatRewardAllocation(BigInt(program.mintPriceWei) * BigInt(program.maxSupply), program.affiliatePoolBps ?? 0)} ETH. Qualified affiliates earn equal rewards. The shared payout limit is {formatRewardAllocation(program.mintPriceWei, program.affiliatePayoutCapBps ?? 0)} ETH multiplied by the fewest paid referrals among qualified affiliates. Unfilled and unqualified positions receive nothing. The full budget is not guaranteed to be distributed; unallocated funds stay in a separate growth reserve.</p>}
          {(program.contractVersion === "affiliate-v5" || program.contractVersion === "affiliate-v6") && <p>The affiliate reward budget at sellout is up to {formatRewardAllocation(BigInt(program.mintPriceWei) * BigInt(program.maxSupply), program.affiliatePoolBps ?? 0)} ETH. At sellout, the contract allocates that pool proportionally to recorded referral sales. Unused positions earn zero; an unsold collection preserves full refunds. Enrollment signatures bind the exact position, pool terms, wallet and collection.</p>}
          {(program.contractVersion === "affiliate-v6" || v7) ? <>
            <p>After the first official collection on this network, enrollment also requires an NFT from any earlier completed official collection. {v7?"Ranked-prize sources qualify after sellout and reveal with all prizes protected; older sources follow their original completed and paid rules;":"Completed means sold out, revealed and paid its winner;"} the NFT itself does not have to be the winning ticket. Current-collection NFTs cannot qualify because enrollment closes before minting begins.</p>
            <p>The shared eligibility contract checks the applicant’s current ownership and permits each NFT to unlock only one position per collection. Each wallet can enroll once. A transfer afterward cannot unlock a second position in that collection or move the enrolled wallet’s position and earnings. The NFT’s current holder may use it to qualify in a different future collection.</p>
            <p><code>affiliateEligibility()</code> identifies the verifier. <code>eligibilityStatus()</code> and <code>usedToken()</code> expose eligibility and use records. Enrollment signatures bind the selected source collection and NFT as well as the applicant, position and pool terms. Only the first collection in the network’s official sequence is exempt from the NFT requirement; a new factory cannot reset it.</p>
          </> : <p>This collection retains its original enrollment rules and has no NFT ownership requirement. New collections using the updated holder rules require an NFT from an earlier completed official collection, with an exception for the first official collection on each network.</p>}
          {program.contractVersion === "affiliate-v4" && <p>
            <code>prizeBps()</code> and <code>affiliateRateBps(position)</code> expose the
            financial terms fixed at deployment. Enrollment signatures bind the exact position
            and rate. A link cannot replace the beneficiary or commission rate, and the owner
            cannot change these terms after deployment.
          </p>}
          {program.mode === "demo" && <p>
            This is the implementation behind the affiliate preview. The existing demo NFT uses
            the original contract shown above; a live affiliate program requires a new deployment
            of <code>{affiliateSource.contractName}</code>.
          </p>}
          <Link href={`/mint/${collection.id}/affiliates`} className="text-link">View this collection’s affiliate rewards →</Link>
        </div>
        {program.mode === "demo" && <div className="source-code">
          <div><span>{affiliateSource.contractName}.sol</span><span>Solidity {affiliateSource.compiler}</span></div>
          <pre tabIndex={0} aria-label="Affiliate Solidity source"><code>{affiliateSource.source}</code></pre>
        </div>}
        <div className="source-code">
          <div><span>{rendererSource.contractName.replace("Round", "Renderer")}.sol</span><span>Immutable on-chain SVG</span></div>
          <pre tabIndex={0} aria-label="Affiliate on-chain SVG renderer"><code>{rendererSource.rendererSource}</code></pre>
        </div>
        {(program.contractVersion === "affiliate-v6" || v7) && <div className="source-code">
          <div><span>{gateSource.contractName}.sol</span><span>On-chain affiliate eligibility · Solidity {gateSource.compiler}</span></div>
          <pre tabIndex={0} aria-label="Affiliate NFT eligibility Solidity source"><code>{gateSource.source}</code></pre>
        </div>}
      </>}
    </SiteShell>
  );
}
