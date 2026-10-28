"use client";
import { GenesisArtwork } from "@manekineko/ui/genesis-artwork";
import { RewardsBrand } from "@manekineko/ui/rewards-brand";
import { Button, IconButton, LinkButton } from "@manekineko/ui/button";
import { PublicFooter } from "@manekineko/ui/footer";
import type { PublicLinks } from "@manekineko/ui/links";
import { Icon } from "@manekineko/ui/icons";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LiveCollection } from "../components/live-collection";
import { RewardsMachine } from "../components/rewards-machine";
import { LandingNavigation } from "../components/landing-navigation";
import { MotionWords } from "../components/motion-words";
import { LandingMotion } from "../components/landing-motion";
import artwork from "./artwork.json";
import { NewsletterSignup } from "./newsletter-signup";
import { TinctaMark } from "../components/tincta-logo";
import type { PlannedRewards } from "../lib/planned-rewards";

type Season = { season: number; colors: string[] };
function Brand({ footer = false }: { footer?: boolean }) {
  return (
    <a
      className={`brand${footer ? " brand-footer" : ""}`}
      href="#top"
      aria-label="Tincta Rewards home"
    >
      <RewardsBrand decorative variant="glyph"><TinctaMark title="" /></RewardsBrand>
    </a>
  );
}

const faqs = (plannedRewards: PlannedRewards) => [
  {
    question: "What is the protocol treasury for?",
    answer:
      "After a successful draw, the launch rules allocate 10% of mint revenue to the operator’s protocol treasury for infrastructure costs, future functionality and Tincta projects. If no affiliate brings at least one paid mint through their referral URL, the full 20% affiliate pool joins that treasury, making 30% withdrawable by the operator. Prize, earned affiliate and refund obligations remain protected. Another 10% funds a locked season holder pool for the first 5% of eligible NFTs to claim after season end. Refundable collections create no treasury or holder allocation from mint revenue.",
  },
  {
    question: "Can the team withdraw prizes, commissions or holder rewards?",
    answer:
      "No. The contract reserves unpaid prizes and earned affiliate commissions for their recipients. The operator cannot withdraw those funds or claim them for you. Holder funds are held in a separate season pool with no operator withdrawal. Under the planned launch rules, if no affiliate qualifies, the full 20% affiliate pool joins the operator’s 10% treasury after a successful draw. When affiliates do qualify, only division dust remains in the separate unused affiliate reserve. Neither is an earned commission.",
  },
  {
    question: "How are season holder rewards calculated?",
    answer:
      "Tincta reserves 10% of actual mint revenue from successfully drawn collections for that season. Claim slots equal 5% of the eligible NFTs, rounded down. The final pool divided by those slots gives the equal ETH payout, rounded down to whole wei. Voting changes mint prices and supplies, so neither the pool nor the payout is a fixed ETH amount. Estimates can change until every planned collection has drawn or become refundable. Each season has its own pool.",
  },
  {
    question: "Who can claim from the holder pool?",
    answer:
      "The current owner of an NFT from a successful draw in that season can claim once per NFT, including winning NFTs. Only the first 5% of eligible NFTs to claim receive rewards, in onchain execution order. A pending transaction does not reserve a slot. Transferring an NFT transfers its unclaimed opportunity but never resets a completed claim. There is no per-wallet limit or claim expiry. Unclaimed winning NFTs remain transfer-locked until their prize is claimed. Holder rewards are separate from prizes, affiliate claims and lifetime sponsored mints. Any rounding dust stays protected in the pool.",
  },
  {
    question: "How can I verify the contract?",
    answer:
      "Use the contract links in the app to inspect the deployed code, collection terms, draw results and claims. Check the network as well as the address: Sepolia activity uses test ETH, and Mainnet minting has not launched. Source verification is not an independent security audit.",
  },
  {
    question: "Are rewards sent to my wallet automatically?",
    answer:
      "No. The current winning NFT holder or qualifying affiliate submits a claim transaction. The contract checks eligibility and pays the claim without team approval. For season rewards, the current owner of an eligible NFT can claim after season end while the first-5% slots remain. Minting opens at the voting deadline without activation. Preparation and draw finalization still require transactions, and Chainlink supplies the draw’s randomness.",
  },
  {
    question: "How can I vote before the first paid collection?",
    answer:
      "Tincta Genesis has two utilities: voting on the first collection and affiliate enrollment across all collections and seasons. The planned launch has 1,000 free NFTs, up to two lifetime primary mints per wallet, and no mint deadline. You pay network gas. The first season waits until all 1,000 are minted; the final mint opens its first ballot. Each Genesis NFT gives its current holder one vote in that ballot only. Holders can also enroll as affiliates throughout all collections and seasons, subject to available positions. The first collection requires Genesis; later collections also accept eligible paid NFTs. After enrolling, share your referral URL. One qualifying paid NFT mint earns you an equal share of the ETH affiliate pool, claimable after sellout and a successful draw. These rules are deployed on Sepolia for testing. Mainnet minting has not launched; older deployments retain their original rules.",
  },
  {
    question: "How does community voting change the prizes?",
    answer:
      "Eligible NFT holders vote for a published package of mint price, NFT supply, winner count, and mint duration. The option with the most votes sets the collection’s terms; ties and no-vote outcomes use the published fallback rules. After sellout and a successful draw, 60% of mint revenue is divided equally among the winning NFTs. A higher price or supply grows the pool; more winners divide it into smaller prizes. The 1 ETH illustration is neither a minimum nor a maximum. The 10% holder pool also follows actual successful mint revenue across the season; its 5% claim count and equal payout are calculated from the final eligible NFT count and pool. Voting changes these amounts, not the fixed allocation percentages. Review the final voted terms before minting.",
  },
  {
    question: "How do I win a prize?",
    answer:
      "Each paid NFT enters its own collection’s draw. After sellout, Chainlink VRF supplies verifiable randomness and the draw selects the voted number of distinct winning NFTs. Their holders claim equal prizes directly. For example, 1,000 mints at 0.01 ETH with six winners produce 1 ETH per prize; 2,000 mints at the same price with six winners produce 2 ETH each. One wallet can hold more than one winning NFT.",
  },
  {
    question: "What are my chances?",
    answer:
      "In a sold-out collection of 1,000 NFTs with six prizes, each NFT has a 6 in 1,000 chance of winning a prize. There are six distinct winning NFTs, selected without replacement. Each NFT participates only in its own collection, not in every season or collection. The collection’s final supply and winner count determine its actual odds.",
  },
  {
    question: "How do affiliate rewards work?",
    answer:
      "The launch rules require first-collection affiliates to hold Genesis. Later collections accept Genesis or an eligible NFT from an earlier successful paid collection. Holders enroll during voting, subject to one of ten available positions. Each NFT can qualify one wallet per collection; transferring it does not reset that use. At least one qualifying paid NFT mint through your referral URL earns you a share of the pool. Self-referrals and sponsored mints do not qualify. Sellout fixes equal shares of the 20% affiliate pool, claimable after successful draw finalization. Three qualifiers each receive one third, regardless of referral count. If no affiliate qualifies, the full 20% joins the operator’s 10% treasury allocation after a successful draw, making 30% withdrawable. Division dust when affiliates qualify remains a separate unused reserve. Refundable collections create no affiliate payout.",
  },
  {
    question: "What if a collection doesn’t sell out?",
    answer:
      "There is no prize draw for an unsold collection. After its mint deadline, current NFT holders can claim the original mint price. A sold-out collection also becomes refundable if valid randomness is not recorded within its fixed 72-hour window. Randomness recorded on time preserves the draw and cannot expire. Refundable collections contribute neither funds nor eligible NFTs to the holder pool. Refunds burn the NFT and exclude network gas and secondary-market price differences.",
  },
  {
    question: "Can I choose my NFT’s numbers?",
    answer:
      "For paid collection NFTs, no. Four permanent numbers are generated by the contract when your NFT is minted. They identify your collectible and do not tell you its eventual score or winning status. Its SVG artwork and numbers remain unchanged after the draw; results are recorded separately onchain.",
  },
  {
    question: "Is Tincta live?",
    answer:
      `Mainnet minting has not launched. The current deployment is a Sepolia test using test ETH. The catalog plans ${plannedRewards.seasonCount} seasons and ${plannedRewards.collectionCount} collections. The illustrated totals assume every collection sells out 1,000 NFTs at 0.01 ETH with six winners: ${Number(plannedRewards.prizePoolEth).toLocaleString("en-US")} ETH in prizes and ${plannedRewards.affiliatePoolEth} ETH in affiliate pools, plus ${plannedRewards.holderPoolEth} ETH across separate holder pools (${plannedRewards.holderClaimSlots.toLocaleString("en-US")} claim slots at ${plannedRewards.holderRewardEth} ETH each under these assumptions). Voting selects actual terms. These examples are not collected funds or a Mainnet launch announcement. Check the configured collection before participating.`,
  },
];

export function LandingExperience({
  footerLinks,
  seasons,
  plannedRewards,
}: {
  footerLinks: PublicLinks;
  seasons: Season[];
  plannedRewards: PlannedRewards;
}) {
  const [failedArtwork, setFailedArtwork] = useState<string[]>([]);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [catalogSeason, setCatalogSeason] = useState(0);
  const [showCatalog, setShowCatalog] = useState(false);
  const [galleryEdges, setGalleryEdges] = useState({ start: true, end: false });
  const gallery = useRef<HTMLDivElement>(null);
  const motionOff = reducedMotion;
  const selectedSeason = seasons[catalogSeason];
  const totalCollections = seasons.reduce(
    (total, season) => total + season.colors.length,
    0
  );

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(preference.matches);
    sync();
    preference.addEventListener("change", sync);
    return () => preference.removeEventListener("change", sync);
  }, []);


  function moveGallery(direction: number) {
    const container = gallery.current;
    if (!container) return;
    const cards = Array.from(container.children) as HTMLElement[];
    const step = cards[1].offsetLeft - cards[0].offsetLeft;
    container.scrollTo({
      left: Math.max(
        0,
        Math.min(
          container.scrollWidth - container.clientWidth,
          container.scrollLeft + direction * step
        )
      ),
      behavior: motionOff ? "instant" : "smooth",
    });
  }

  return (
    <LandingMotion
      id="top"
      className={`site${motionOff ? " motion-paused" : ""}`}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <LiveCollection />
      <header className="header landing-header wrap">
        <Brand />
        <LandingNavigation
          links={[
            { label: "Rewards", href: "#rewards" },
            { label: "Collections", href: "#seasons" },
            { label: "Affiliates", href: "#affiliates" },
            { label: "How it works", href: "#how-it-works" },
            { label: "FAQ", href: "#questions", mobileOnly: true },
            { label: "Join the launch list", href: "#launch-list", mobileOnly: true },
          ]}
          action={{ label: "Open app", href: "https://app.tincta.xyz" }}
        />
      </header>

      <main id="main">
        <noscript><p className="wrap">JavaScript is needed for live collection status, newsletter signup and interactive previews. The collection information below remains available.</p></noscript>
        <section className="hero wrap" aria-labelledby="hero-title">
          <div className="hero-main">
            <div className="hero-copy">
              <h1 className="motion-heading" id="hero-title"><MotionWords>
                <span className="win-word">
                  Onchain
                  <svg viewBox="0 0 200 20" fill="none" aria-hidden="true">
                    <path
                      d="M3 13C52 2 144 1 195 8M18 19C71 10 129 8 176 11"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                {" "}art. ETH prizes.
              </MotionWords></h1>
              <p className="hero-description motion-heading">
                Vote on the terms. Mint an NFT. Claim a prize if you win.
              </p>
              <div className="hero-actions">
                <LinkButton  href="#rewards">
                  Explore the rewards
                  <Icon name="down" />
                </LinkButton>
              </div>
            </div>
            <RewardsMachine />
          </div>
        </section>

        <section className="genesis-intro wrap" id="genesis" aria-labelledby="genesis-heading">
          <GenesisArtwork />
          <div className="genesis-intro-copy">
            <p className="eyebrow">Tincta Genesis / Two utilities</p>
            <h2 className="motion-heading" id="genesis-heading"><MotionWords>One free NFT. Two utilities.</MotionWords></h2>
            <p>Vote on the first collection. Enroll in the affiliate program across every collection and season.</p>
            <p><strong>Qualify for ETH referral rewards.</strong> Enroll during voting, then share your referral URL. One qualifying paid NFT mint earns you an equal share of the 20% affiliate pool after sellout and a successful draw. Self-referrals and sponsored mints do not qualify.</p>
            <p>Genesis voting ends after the first ballot. For future votes, you’ll need NFTs from successfully revealed paid season collections.</p>
            <p>1,000 NFTs. Up to two lifetime mints per wallet. No mint deadline. 0 ETH + network gas.</p>
            <p>The first season starts only after Genesis sells out. Affiliate enrollment requires Genesis for the first collection; later collections and seasons accept Genesis or eligible paid NFTs. Positions are limited.</p>
            <p className="genesis-note">Genesis has no prize, sponsored mint or season holder reward entitlement. These rules are deployed on Sepolia for testing. Mainnet minting has not launched.</p>
            <LinkButton href={`${footerLinks.docs ?? "https://app.tincta.xyz/docs"}/genesis`} variant="secondary">Read Genesis rules<Icon name="arrow" /></LinkButton>
          </div>
        </section>

        <section className="rewards-overview wrap" id="rewards" aria-label="Planned rewards across all seasons">
          <div className="reward-rail motion-sequence">
            <div className="reward-metric">
              <div className="metric-top">
                <Icon name="spark" className="motion-icon" />
                <span>PRIZE POOL EXAMPLE</span>
              </div>
              <div className="metric-number">
                {Number(plannedRewards.prizePoolEth).toLocaleString("en-US")} <span>ETH</span>
              </div>
              <p>
                60% of example mint revenue. {plannedRewards.winningNftCount.toLocaleString("en-US")} winning NFTs at <strong>1 ETH each.</strong>
              </p>
            </div>
            <div className="reward-metric affiliate-metric">
              <div className="metric-top">
                <Icon name="diagonal" />
                <span>AFFILIATE POOL EXAMPLE</span>

              </div>
              <div className="metric-number">
                {Number(plannedRewards.affiliatePoolEth).toLocaleString("en-US")} <span>ETH</span>
              </div>
              <p>
                20% of example mint revenue. <strong>2 ETH per collection</strong>, shared equally by its qualified affiliates.
              </p>
            </div>
            <div className="reward-metric holder-metric">
              <div className="metric-top"><Icon name="layers" className="motion-icon" /><span>HOLDER POOL EXAMPLE</span></div>
              <div className="metric-number">{plannedRewards.holderPoolEth} <span>ETH</span></div>
              <p>10% across separate season pools. Example: {plannedRewards.holderClaimSlots.toLocaleString("en-US")} claims at <strong>{plannedRewards.holderRewardEth} ETH each.</strong></p>
              <a className="ui-text-action" href="#holder-rewards">See holder calculations <Icon name="down" /></a>
            </div>
          </div>
          <p className="terms-note">
            <span>{plannedRewards.seasonCount} seasons · {plannedRewards.collectionCount} collections. Example totals if all collections sell out 1,000 NFTs at 0.01 ETH with six winners.
            Community voting selects the actual price, supply, winner count, and mint duration from published options.
            Actual rewards vary. Holder claims are limited to the first 5% of eligible NFTs per season. These are not funded balances.</span>
            <a className="ui-text-action" href={footerLinks.docs ?? "#questions"}>
              Read the rules
              <Icon name="diagonal" />
            </a>
          </p>
        </section>

        <section
          className="launch-section wrap"
          id="launch-list"
          aria-labelledby="launch-title"
          tabIndex={-1}
        >
          <div className="launch-content">
            <h2 className="motion-heading" id="launch-title"><MotionWords>Get voting and mint alerts.</MotionWords></h2>
            <p id="launch-description">Get notified when voting and minting open.</p>
            <NewsletterSignup />
          </div>
        </section>

        <section
          className="rewards-section wrap"
          id="reward-details"
          aria-labelledby="prizes-title"
        >
          <div className="prize-panel">
            <div className="prize-copy">
              <p className="eyebrow">
                <Icon name="spark" className="motion-icon" /> PRIZES CLAIMED DIRECTLY
              </p>
              <h2 className="motion-heading" id="prizes-title"><MotionWords>
                Voted terms.
                <br />
                <span className="serif">Equal prizes.</span>
              </MotionWords></h2>
              <p>
                Winning NFTs share 60% of mint revenue equally. The community’s
                voted terms set the amount. After a successful draw, holders claim directly.
              </p>
              <dl className="prize-examples" aria-label="Illustrative prizes at sellout, not live voting options">
                <div><dt>1,000 NFTs · 0.01 ETH · 6 winners</dt><dd>1 ETH each</dd></div>
                <div><dt>2,000 NFTs · 0.01 ETH · 6 winners</dt><dd>2 ETH each</dd></div>
                <div><dt>1,000 NFTs · 0.01 ETH · 10 winners</dt><dd>0.6 ETH each</dd></div>
              </dl>
              <p>Sellout examples, not live terms or funded prizes. Actual amounts follow the vote.</p>
              <a className="ui-text-action" href={footerLinks.docs ? new URL("/docs/prizes", footerLinks.docs).href : "#questions"}>
                Read the prize guide
                <Icon name="diagonal" />
              </a>
            </div>
            <div
              className="prize-tickets"
              aria-label="Example of six equal prizes of 1 ETH each"
            >
              {Array.from({ length: 6 }, (_, i) => (
                <div className="prize-ticket" key={i}>
                  <div className="ticket-top">
                    <Icon name="ethereum" />
                    <span className="mono">
                      PRIZE {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <span className="ticket-amount">
                    1 <span>ETH</span>
                  </span>
                  <span className="ticket-bottom">
                    EXAMPLE PRIZE
                    <Icon name="spark" className="motion-icon" />
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="affiliate-panel" id="affiliates">
            <div className="affiliate-visual" aria-hidden="true">
              <div className="affiliate-art motion-art">
                <svg viewBox="0 0 400 300" fill="none">
                  <g className="affiliate-rings">
                    {Array.from({ length: 20 }, (_, i) => (
                      <ellipse
                        key={i}
                        cx="200"
                        cy="150"
                        rx={55 + i * 5}
                        ry="100"
                        transform={`rotate(${i * 9} 200 150)`}
                        stroke="#9a8ad5"
                        strokeWidth="1"
                      />
                    ))}
                  </g>
                </svg>
                <div className="affiliate-value">
                  <span className="affiliate-value-label">Always</span>
                  <span className="affiliate-amount">20%</span>
                </div>
              </div>
              <div className="affiliate-caption">
                <span>Affiliate pool</span>
                <small>per sold-out collection</small>
              </div>
            </div>
            <div className="affiliate-copy">
              <p className="eyebrow">COMMISSIONS CALCULATED ONCHAIN</p>
              <h2><MotionWords>
                One qualifying referral.
                <br />
                An equal <span className="serif">share.</span>
              </MotionWords></h2>
              <p>
                Enroll during voting. Bring one paid referral to qualify for an
                equal share of the affiliate pool, claimable after a successful draw.
              </p>
              <div className="affiliate-detail">
                <span>
                  <strong>20% of mint revenue</strong>
                  <small>shared equally by qualified affiliates</small>
                </span>
                <LinkButton
                  className="ui-icon-button"
                  href={footerLinks.docs ? new URL("/docs/affiliates", footerLinks.docs).href : "#questions"}
                  aria-label="Read affiliate eligibility and payout terms"
                >
                  <Icon name="diagonal" />
                </LinkButton>
              </div>

            </div>
          </div>
        </section>

        <section
          className="manifesto wrap"
          aria-labelledby="manifesto-title"
        >
          <p className="eyebrow section-kicker">
            <span className="section-index">01 /</span> CONTRACT-CONTROLLED REWARDS
          </p>
          <h2 className="motion-heading" id="manifesto-title"><MotionWords>
            The community chooses.
            <br />
            <span className="muted-heading">The contract enforces.</span>
          </MotionWords></h2>
          <div className="manifesto-bottom">
            <p>
              Vote for a package of price, supply, winner count and mint duration. When voting closes,
              those terms are fixed. Explore the rules before you take part.
            </p>
            <LinkButton variant="secondary" href={footerLinks.docs ?? "#questions"}>
              Read the guides <Icon name="arrow" />
            </LinkButton>
          </div>
        </section>

        <section
          className="seasons-section"
          id="seasons"
          aria-labelledby="seasons-title"
        >
          <div className="wrap">
            <div className="section-heading">
              <div>
                <p className="eyebrow">
                  <span className="section-index">02 /</span> COLLECTION TERMS ONCHAIN
                </p>
                <h2 className="motion-heading" id="seasons-title"><MotionWords>
                  A palette and a ballot
                  <br />
                  for every <span className="serif">collection.</span>
                </MotionWords></h2>
              </div>
              <p>
                Each collection has its own color, voted terms and draw after sellout.
              </p>
            </div>
            <div className="season-explorer">
              <div className="season-explorer-top">
                <span className="mono">EXPLORE THE COLLECTIONS</span>
                <span className="catalog-tag">
                  {seasons.length} planned seasons
                  <Icon name="plus" className="motion-icon" />
                  {totalCollections} collections
                </span>
              </div>
              <div
                className="season-swatch-stage"
                key={catalogSeason}
                aria-label={`Season ${selectedSeason.season}, ${selectedSeason.colors.length} collections`}
              >
                {selectedSeason.colors.map((color, i) => (
                  <div
                    className="season-color-column"
                    key={color}
                    style={{ "--color": color, "--index": i } as CSSProperties}
                  >
                    <span className="color-block" />
                    <span className="mono">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                ))}
              </div>
              <div className="season-explorer-bottom">
                <div>
                  <h3>
                    Season {String(selectedSeason.season).padStart(2, "0")}
                  </h3>
                  <p>
                    {selectedSeason.colors.length} collections. A separate prize
                    draw in each after sellout.
                  </p>
                </div>
                <div className="step-controls">
                  <IconButton

                    aria-label="Previous season"
                    onClick={() =>
                      setCatalogSeason(
                        (catalogSeason - 1 + seasons.length) % seasons.length
                      )
                    }
                  >
                    <Icon className="flip" />
                  </IconButton>
                  <span className="mono">
                    {String(catalogSeason + 1).padStart(2, "0")} /{" "}
                    {seasons.length}
                  </span>
                  <IconButton

                    aria-label="Next season"
                    onClick={() =>
                      setCatalogSeason((catalogSeason + 1) % seasons.length)
                    }
                  >
                    <Icon />
                  </IconButton>
                </div>
              </div>
              <Button
                variant="secondary"
                className="catalog-disclosure"
                aria-expanded={showCatalog}
                aria-controls="season-catalog"
                onClick={() => setShowCatalog(!showCatalog)}
              >
                {showCatalog
                  ? "Close season list"
                  : "View all 22 seasons"}
                <Icon name="plus" className={showCatalog ? "rotate" : ""} />
              </Button>
              {showCatalog && (
                <div className="season-catalog" id="season-catalog">
                  {seasons.map((season, i) => (
                    <Button
                      variant="secondary"
                      key={season.season}
                      aria-label={`Select Season ${season.season}`}
                      aria-pressed={catalogSeason === i}
                      onClick={() => setCatalogSeason(i)}
                    >
                      <span className="season-option"><span className="mini-palette">
                        {season.colors.map((color) => (
                          <span key={color} style={{ background: color }} />
                        ))}
                      </span>
                      <span>
                        Season {String(season.season).padStart(2, "0")}
                      </span></span>
                    </Button>
                  ))}
                </div>
              )}
            </div>
            <div className="season-facts motion-sequence">
              <div>
                <span>22</span>
                <p>Planned seasons</p>
              </div>
              <div>
                <span>216</span>
                <p>Planned collections</p>
              </div>
              <div>
                <span>
                  1–10<sup>*</sup>
                </span>
                <p>Winning NFTs, selected by the voted terms</p>
              </div>
            </div>
            <p className="section-footnote">
              *Winner counts come from the published options and must divide the
              prize allocation exactly; seven and nine are excluded. Each NFT
              enters only its own collection’s draw.
            </p>
          </div>
        </section>

        <section
          className="art-section"
          id="collection"
          aria-labelledby="art-title"
        >
          <div className="wrap section-heading">
            <div>
              <p className="eyebrow">
                <span className="section-index">03 /</span> YOUR ENTRY INTO THE DRAW
              </p>
              <h2 className="motion-heading" id="art-title"><MotionWords>
                Permanent artwork.
                <br />
                Your entry in the <span className="serif">draw.</span>
              </MotionWords></h2>
            </div>
            <div>
              <p>
                Your artwork and four-number identity are permanent.
                The draw decides the winners separately.
              </p>
              <div className="gallery-controls">
                <span className="mono">COLLECTION PREVIEWS</span>
                <IconButton

                  aria-label="Previous artwork"
                  disabled={galleryEdges.start}
                  onClick={() => moveGallery(-1)}
                >
                  <Icon className="flip" />
                </IconButton>
                <IconButton

                  aria-label="Next artwork"
                  disabled={galleryEdges.end}
                  onClick={() => moveGallery(1)}
                >
                  <Icon />
                </IconButton>
              </div>
            </div>
          </div>
          <div
            className="art-gallery"
            ref={gallery}
            tabIndex={0}
            aria-label="NFT artwork previews, scroll horizontally for more"
            onScroll={() => {
              const el = gallery.current;
              if (!el || !el.children.length) return;
              setGalleryEdges({
                start: el.scrollLeft <= 5,
                end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 5,
              });
            }}
          >
            {artwork.map((art, i) => (
              <figure
                className="nft-card"
                key={art.file}
                style={{ "--card-color": art.color } as CSSProperties}
              >
                <div className="nft-image-wrap">
                  {failedArtwork.includes(art.file) ? <div className="artwork-fallback" role="img" aria-label={`Artwork preview unavailable for Season ${art.season}, Collection ${art.collection}`}>Artwork preview unavailable</div> : <img
                    onError={() => setFailedArtwork(current => [...current, art.file])}
                    src={art.file}
                    width="640"
                    height="800"
                    loading="lazy"
                    alt={`Illustrative permanent Tincta NFT, Season ${String(
                      art.season
                    ).padStart(2, "0")}, Collection ${String(
                      art.collection
                    ).padStart(2, "0")}, geometric linework on ${art.color}`}
                  />}
                </div>
                <figcaption>
                  <span>
                    Season {String(art.season).padStart(2, "0")}
                    <small>
                      PERMANENT EDITION / {String(i + 1).padStart(2, "0")}
                    </small>
                  </span>
                  <span className="art-color-code">
                    <span style={{ background: art.color }} />
                    COLLECTION {String(art.collection).padStart(2, "0")}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
          <div className="wrap art-footnote">
            <span>
              <Icon name="check" /> Permanent identity. Onchain results.
            </span>
            <p>
              Artwork previews. Sample numbers are illustrative; final
              identities are assigned at mint.
            </p>
          </div>
        </section>



        <section
          className="how-section wrap"
          id="how-it-works"
          aria-labelledby="how-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                <span className="section-index">04 /</span> FROM VOTE TO CLAIM
              </p>
              <h2 className="motion-heading" id="how-title"><MotionWords>
                Vote. Mint.
                <br />
                Claim if you win.
              </MotionWords></h2>
            </div>
            <p>
              Follow the community vote. Review final terms before minting.
              Submit your claim directly to the contract.
            </p>
          </div>
          <div className="steps motion-sequence">
            <article>
              <span className="step-number">
                01
                <Icon name="plus" className="motion-icon" />
              </span>
              <h3>Choose the terms.</h3>
              <p>
                Choose a published package of price, supply, winner count and mint duration.
              </p>
              <span className="step-caption">
                COMMUNITY VOTE. ONCHAIN RESULT.
              </span>
            </article>
            <article>
              <span className="step-number">
                02
                <Icon name="plus" className="motion-icon" />
              </span>
              <h3>Mint your NFT.</h3>
              <p>
                Review the final terms. Mint an NFT to enter its collection’s draw.
              </p>
              <span className="step-caption">
                YOUR NFT. YOUR DRAW ENTRY.
              </span>
            </article>
            <article>
              <span className="step-number">
                03
                <Icon name="spark" className="motion-icon" />
              </span>
              <h3>Claim your rewards.</h3>
              <p>
                If you hold a winning NFT after the draw, claim its ETH prize directly.
              </p>
              <span className="step-caption">
                DIRECT CLAIMS. NO TEAM APPROVAL.
              </span>
            </article>
          </div>
          <div className="trust-strip">
            <span>
              <Icon name="check" /> Verifiable Chainlink VRF draw
            </span>
            <span>
              <Icon name="check" /> Fixed collection terms
            </span>
            <span>
              <Icon name="check" /> Direct ETH claims
            </span>
          </div>
        </section>

        <section className="refund-section" id="refunds" aria-labelledby="refund-title">
          <div className="refund-layout wrap">
            <div className="refund-copy">
              <p className="eyebrow">
                <span className="section-index">05 /</span> ONCHAIN REFUND RULES
              </p>
              <h2 className="motion-heading" id="refund-title"><MotionWords>
                Not sold out by the deadline?{" "}
                <span className="muted-heading">Claim your mint-price refund.</span>
              </MotionWords></h2>
              <p className="refund-intro">
                If a collection has not sold out when its onchain deadline is
                reached, current NFT holders can claim the original mint price
                directly from the contract.
              </p>
              <a className="ui-text-action" href={footerLinks.docs ? new URL("/docs/refunds", footerLinks.docs).href : "#questions"}>
                Read the refund rules <Icon name="diagonal" />
              </a>
            </div>
            <dl className="refund-rules">
              <div>
                <dt>A fixed deadline</dt>
                <dd>The voted mint duration fixes the deadline when voting ends. It cannot then be extended.</dd>
              </div>
              <div>
                <dt>Funds reserved for refunds</dt>
                <dd>The contract reserves the funds owed to outstanding refunds. The operator cannot withdraw those funds.</dd>
              </div>
              <div>
                <dt>No operator approval</dt>
                <dd>Refund eligibility begins automatically at the onchain deadline if the collection remains unsold. No operator or backend action is needed to enable it.</dd>
              </div>
            </dl>
            <div className="refund-terms">
              <p>You submit a claim transaction and pay gas. Claiming burns the NFT. The refund covers the original mint price; network fees and secondary-market price differences are not refunded.</p>
              <p>A sold-out collection is also refundable if valid randomness is not recorded within 72 hours of sellout. Randomness recorded on time preserves the draw; its results cannot expire. Refundable collections contribute neither ETH nor eligible NFTs to the holder pool.</p>
            </div>
          </div>
        </section>

        <section className="manifesto holder-section wrap" id="holder-rewards" aria-labelledby="holders-title">
          <p className="eyebrow section-kicker"><span className="section-index">06 /</span> SEASON HOLDER REWARDS · PLANNED FOR LAUNCH</p>
          <div className="holder-copy">
            <h2 className="motion-heading" id="holders-title"><MotionWords>A season pool<br /><span className="muted-heading">for NFT holders.</span></MotionWords></h2>
            <div className="holder-explanation">
              <p>Successful draws add 10% of mint revenue to the season pool. At season end, the first 5% of eligible NFTs to claim share it equally. Winners qualify too. One claim per NFT, while slots remain.</p>
              <LinkButton href={footerLinks.app ? `${footerLinks.app.replace(/\/$/, "")}/holders` : undefined}>Explore holder rewards <Icon name="diagonal" /></LinkButton>
            </div>
          </div>
          <div className="holder-example" aria-label="Holder reward example for a ten-collection season">
            <h3>One season, ten successful collections</h3>
            <p>Example only: each collection sells 1,000 NFTs at 0.01 ETH. All ten draws succeed.</p>
            <dl className="holder-calculation">
              <div><dt>Season mint revenue</dt><dd>10 × 1,000 × 0.01 = <strong>100 ETH</strong></dd></div>
              <div><dt>Holder pool · 10%</dt><dd>100 × 10% = <strong>10 ETH</strong></dd></div>
              <div><dt>Claim slots · first 5%</dt><dd>10,000 × 5% = <strong>500 NFTs</strong></dd></div>
              <div><dt>Equal reward per claim</dt><dd>10 ÷ 500 = <strong>{plannedRewards.holderRewardEth} ETH</strong></dd></div>
            </dl>
            <p>Illustrative amounts vary by season. Refundable collections add no funds or eligible NFTs.</p>
          </div>
        </section>

        <section
          className="faq-section wrap"
          id="questions"
          aria-labelledby="faq-title"
        >
          <div>
            <p className="eyebrow">
              <span className="section-index">07 /</span> INDEPENDENTLY VERIFIABLE
            </p>
            <h2 className="motion-heading" id="faq-title"><MotionWords>
              Inspect the code.
              <br />
              Verify the outcome.
            </MotionWords></h2>
            <p>
              Find answers about voting, eligibility, claims and refunds.
            </p>
          </div>
          <div className="faq-list">
            {faqs(plannedRewards).map((faq) => (
              <details className="ui-disclosure" key={faq.question} name="tincta-faq">
                <summary>
                  {faq.question}
                  <Icon name="chevron" className="ui-disclosure-icon" />
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="closing-section" aria-labelledby="closing-title">
          <div className="closing-spectrum" aria-hidden="true">
            {seasons.map((season) => (
              <span
                key={season.season}
                style={{ background: season.colors[4] ?? season.colors[0] }}
              />
            ))}
          </div>
          <div className="wrap closing-content">
            <p className="eyebrow">BE READY FOR THE FIRST COLLECTION</p>
            <h2 className="motion-heading" id="closing-title"><MotionWords>
              Know the rules
              <br />before you <span className="serif">enter.</span>
            </MotionWords></h2>
            <LinkButton href={footerLinks.docs ?? "#questions"}>
              Read the guides
              <Icon name="diagonal" />
            </LinkButton>

          </div>
        </section>
      </main>
      <PublicFooter
        density="compact"
        links={footerLinks}
        legal={<>Launch preview. Illustrative amounts depend on community-voted terms. Prize and affiliate payouts require sellout and a successful draw. Review final terms before minting.</>}
      />
    </LandingMotion>
  );
}
