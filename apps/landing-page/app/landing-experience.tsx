"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import artwork from "./artwork.json";
import { NewsletterSignup } from "./newsletter-signup";
import { TinctaWordmark } from "../components/tincta-logo";
import type { PlannedRewards } from "../lib/planned-rewards";

type Season = { season: number; colors: string[] };
type IconName =
  | "arrow"
  | "diagonal"
  | "down"
  | "plus"
  | "pause"
  | "play"
  | "check"
  | "spark"
  | "ethereum";

function Icon({
  name = "arrow",
  className = "",
}: {
  name?: IconName;
  className?: string;
}) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "arrow" && <path d="M4 12h15m-6-6 6 6-6 6" />}
      {name === "diagonal" && <path d="M5 19 19 5M5 5h14v14" />}
      {name === "down" && <path d="M12 4v15m-6-6 6 6 6-6" />}
      {name === "plus" && <path d="M5 12h14M12 5v14" />}
      {name === "pause" && <path d="M9 5v14M15 5v14" />}
      {name === "play" && <path d="m8 5 11 7-11 7Z" />}
      {name === "check" && <path d="m5 12 4 4L19 6" />}
      {name === "spark" && (
        <path d="M12 2c0 7-3 10-10 10 7 0 10 3 10 10 0-7 3-10 10-10-7 0-10-3-10-10Z" />
      )}
      {name === "ethereum" && (
        <>
          <path d="m12 2-6 10 6 4 6-4-6-10Zm-6 12 6 8 6-8-6 4-6-4Z" />
          <path d="M12 2v14m-6-4 6-3 6 3" />
        </>
      )}
    </svg>
  );
}

function Brand({ footer = false }: { footer?: boolean }) {
  return (
    <a
      className={`brand${footer ? " brand-footer" : ""}`}
      href="#top"
      aria-label="Tincta home"
    >
      <TinctaWordmark className="brand-wordmark" title="" />
    </a>
  );
}

/** Decorative SVG sculpture. Colors are copied directly from the public color catalog. */
function ColorSculpture({ colors }: { colors: string[] }) {
  return (
    <svg
      className="color-sculpture"
      viewBox="0 0 700 660"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="ground-shadow">
          <stop stopColor="#212026" stopOpacity=".14" />
          <stop offset="1" stopColor="#212026" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="354" cy="581" rx="241" ry="28" fill="url(#ground-shadow)" />
      <g className="sculpture-orbit">
        {Array.from({ length: 72 }, (_, i) => {
          const angle = i * 5;
          return (
            <ellipse
              key={i}
              cx="350"
              cy="326"
              rx="220"
              ry="92"
              stroke={colors[Math.floor(i / 8) % colors.length]}
              strokeWidth="2.7"
              transform={`rotate(${angle} 350 326)`}
            />
          );
        })}
      </g>
      <g className="sculpture-core">
        {Array.from({ length: 28 }, (_, i) => (
          <ellipse
            key={i}
            cx="350"
            cy="326"
            rx={50 + i * 2.05}
            ry={53 + i * 2.6}
            stroke={colors[(i + 4) % colors.length]}
            strokeOpacity=".8"
            strokeWidth="1.15"
            transform={`rotate(${i * 4} 350 326)`}
          />
        ))}
      </g>
      <g className="sculpture-center" transform="translate(350 326)">
        <circle r="68" fill="#fafaf7" />
        <path
          d="M0-22c0 16-6 22-22 22 16 0 22 6 22 22 0-16 6-22 22-22C6 0 0-6 0-22Z"
          stroke="#1a1a1a"
          strokeWidth="1.2"
        />
      </g>
      <path
        d="M49 107h14m-7-7v14M627 461h14m-7-7v14"
        stroke="currentColor"
        strokeOpacity=".3"
      />
      <circle cx="591" cy="153" r="4" fill={colors[colors.length - 1]} />
      <circle cx="109" cy="481" r="3" fill={colors[4] ?? colors[0]} />
    </svg>
  );
}

const faqs = (plannedRewards: PlannedRewards) => [
  {
    question: "Can the team withdraw my prize or commission?",
    answer:
      "No. The contract reserves unpaid prizes and earned affiliate commissions for their recipients. The operator cannot withdraw those funds or claim them for you. Unallocated affiliate budget is a separate reserve that the operator can withdraw after the draw; it is not an earned commission.",
  },
  {
    question: "How can I verify the contract?",
    answer:
      "At launch, every collection will link to its deployed Ethereum contract and verified source code. You will be able to inspect the fixed terms, draw results, prize claims, and commission claims on the blockchain before and after participating. V10 deployment and source verification are still pending.",
  },
  {
    question: "Are rewards sent to my wallet automatically?",
    answer:
      "The contract determines entitlement and executes payment, without team approval. You submit a claim transaction from the wallet holding the winning NFT or the qualifying affiliate wallet. Sale activation and draw progression also require transactions; autonomous rewards does not mean the entire launch runs without external services or transaction submissions.",
  },
  {
    question: "How do I win a prize?",
    answer:
      "Each NFT enters the draw for its own collection. When all NFTs sell out, one verifiable Chainlink VRF draw selects distinct winning NFTs. Under the planned default terms, six winning NFTs each receive 1 ETH, claimed by their holders. One wallet can hold more than one winning NFT. A win is never guaranteed.",
  },
  {
    question: "What are my chances?",
    answer:
      "In a sold-out collection of 1,000 NFTs with six prizes, each NFT has a 6 in 1,000 chance of winning a prize. There are six distinct winning NFTs, selected without replacement. Each NFT participates only in its own collection, not in every season or collection. The collection’s final supply and winner count determine its actual odds.",
  },
  {
    question: "How do affiliate rewards work?",
    answer:
      "Eligible holders of an NFT from an earlier official completed collection can enroll before minting opens, subject to available positions; the first collection has a bootstrap exception. With the default terms, one attributed paid mint qualifies you. The contract calculates equal commissions for qualifying affiliates, subject to the collection’s payout limits. Planned pools are up to 2 ETH per sold-out Growth collection and up to 1 ETH per Standard collection. Earned commissions are claimed directly from the contract, without team approval. Pool budgets are not individual earnings; unused funds remain in a separate reserve.",
  },
  {
    question: "What if a collection doesn’t sell out?",
    answer:
      "There is no prize draw for an unsold collection. After its sale expires, NFT holders can claim a refund of the mint price. Network gas is not refunded, and the refunded NFT is burned. A sold-out collection follows its draw and claim process instead.",
  },
  {
    question: "Can I choose my NFT’s numbers?",
    answer:
      "No. Four permanent numbers are generated by the contract when your NFT is minted. They identify your collectible and do not tell you its eventual score or winning status. Its SVG artwork and numbers remain unchanged after the draw; results are recorded separately onchain.",
  },
  {
    question: "Is Tincta live?",
    answer:
      `This is a preview of the planned launch. The ${plannedRewards.seasonCount}-season, ${plannedRewards.collectionCount}-collection catalog is in planning, and the V10 launch is pending. The all-season figures assume every planned collection sells out: ${Number(plannedRewards.prizePoolEth).toLocaleString("en-US")} ETH in prizes and up to ${plannedRewards.affiliatePoolEth} ETH in affiliate budgets across ${plannedRewards.growthCollectionCount} Growth and ${plannedRewards.standardCollectionCount} Standard collections. These are planned budgets, not funds already collected or paid. Affiliate qualification and payout caps apply. Every published collection will have its own fixed terms to review before minting.`,
  },
];

export function LandingExperience({
  appUrl,
  seasons,
  plannedRewards,
}: {
  appUrl: string | null;
  seasons: Season[];
  plannedRewards: PlannedRewards;
}) {
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [heroSeason, setHeroSeason] = useState(0);
  const [catalogSeason, setCatalogSeason] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [galleryEdges, setGalleryEdges] = useState({ start: true, end: false });
  const root = useRef<HTMLDivElement>(null);
  const gallery = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const motionOff = paused || reducedMotion;
  const featuredSeasons = [0, 5, 10, 13, 15, 19];
  const currentPalette = seasons[featuredSeasons[heroSeason]];
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

  useEffect(() => {
    if (motionOff) return;
    const timer = window.setInterval(() => {
      if (
        !document.hidden &&
        (root.current?.querySelector(".hero")?.getBoundingClientRect().bottom ??
          0) > 0
      ) {
        setHeroSeason((value) => (value + 1) % featuredSeasons.length);
      }
    }, 6500);
    return () => window.clearInterval(timer);
  }, [motionOff]);

  useEffect(() => {
    if (!root.current || motionOff) return;
    const elements =
      root.current.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.08 }
    );
    elements.forEach((element) => {
      if (element.getBoundingClientRect().top > window.innerHeight)
        element.classList.add("reveal-ready");
      observer.observe(element);
    });
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const amount = Math.min(window.scrollY, 900);
        root.current?.style.setProperty("--hero-drift", `${amount * 0.11}px`);
      });
    };
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      elements.forEach((element) => element.classList.remove("reveal-ready"));
      window.removeEventListener("scroll", update);
      cancelAnimationFrame(frame);
      root.current?.style.setProperty("--hero-drift", "0px");
    };
  }, [motionOff]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [menuOpen]);

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
    <div
      ref={root}
      id="top"
      className={`site${motionOff ? " motion-paused" : ""}`}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="header wrap">
        <Brand />
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="#rewards">Rewards</a>
          <a href="#seasons">Collections</a>
          <a href="#affiliates">Affiliates</a>
          <a href="#how-it-works">How it works</a>
        </nav>
        <a
          className="button button-dark header-cta"
          href="#launch-list"
        >
          Join the launch list
          <Icon name="diagonal" />
        </a>
        <button
          ref={menuButton}
          className="menu-toggle"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span />
          <span />
        </button>
        {menuOpen && (
          <nav
            id="mobile-nav"
            className="mobile-nav"
            aria-label="Mobile navigation"
            onClick={() => setMenuOpen(false)}
          >
            <a href="#rewards">
              Rewards
              <Icon />
            </a>
            <a href="#seasons">
              Collections
              <Icon />
            </a>
            <a href="#affiliates">
              Affiliates
              <Icon />
            </a>
            <a href="#how-it-works">
              How it works
              <Icon />
            </a>
            <a href="#questions">
              FAQ
              <Icon />
            </a>
          </nav>
        )}
      </header>

      <main id="main">
        <section className="hero wrap" aria-labelledby="hero-title">
          <div className="hero-main">
            <div className="hero-copy">
              <h1 id="hero-title">
                Autonomous rewards.
                <br />Verifiable{" "}
                <span className="win-word">
                  onchain
                  <svg viewBox="0 0 200 20" fill="none" aria-hidden="true">
                    <path
                      d="M3 13C52 2 144 1 195 8M18 19C71 10 129 8 176 11"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                .
              </h1>
              <p className="hero-description">
                ETH prizes and affiliate rewards, governed by smart contracts.
              </p>
              <div className="hero-actions">
                <a className="button button-dark" href="#rewards">
                  Explore the rewards
                  <Icon name="down" />
                </a>
              </div>
            </div>
            <div className="hero-art">
              <ColorSculpture colors={currentPalette.colors} />
              <div className="art-controls">
                <button
                  className="motion-toggle"
                  aria-label={
                    motionOff ? "Play animations" : "Pause animations"
                  }
                  aria-pressed={motionOff}
                  disabled={reducedMotion}
                  title={
                    reducedMotion
                      ? "Reduced motion enabled in your device settings"
                      : undefined
                  }
                  onClick={() => setPaused(!paused)}
                >
                  <Icon name={motionOff ? "play" : "pause"} />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="rewards-overview wrap" id="rewards" aria-label="Planned rewards across all seasons">
          <div className="reward-rail">
            <div className="reward-metric">
              <div className="metric-top">
                <Icon name="spark" />
                <span>PLANNED PRIZE REWARDS</span>
              </div>
              <div className="metric-number">
                {Number(plannedRewards.prizePoolEth).toLocaleString("en-US")} <span>ETH</span>
              </div>
              <p>
                {plannedRewards.winningNftCount.toLocaleString("en-US")} winning NFTs. <strong>1 ETH each.</strong>
              </p>
            </div>
            <div className="reward-metric affiliate-metric">
              <div className="metric-top">
                <Icon name="diagonal" />
                <span>PLANNED AFFILIATE POOLS</span>
                <span className="up-to">UP TO</span>
              </div>
              <div className="metric-number">
                {Number(plannedRewards.affiliatePoolEth).toLocaleString("en-US")} <span>ETH</span>
              </div>
              <p>
                Across every season. <strong>Contract-calculated commissions.</strong>
              </p>
            </div>
            <div className="reward-context">
              <div className="overlapping-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <p>
                {plannedRewards.seasonCount} seasons. {plannedRewards.collectionCount} collections.
                <br />Prizes and commissions onchain.
              </p>
              <a className="text-link" href="#reward-details">
                Explore prize amounts
                <Icon name="down" />
              </a>
            </div>
          </div>
          <p className="terms-note">
            <span>Planned totals if all {plannedRewards.collectionCount} collections sell out.
            Affiliate eligibility and payout limits apply. These are planned budgets,
            not funded balances. Launch pending.</span>
            <a href="#questions">
              See the details
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
            <h2 id="launch-title">Stay in the loop.</h2>
            <p id="launch-description">Be first to know when minting opens.</p>
            <NewsletterSignup />
          </div>
        </section>

        <section
          className="manifesto wrap"
          data-reveal
          aria-labelledby="manifesto-title"
        >
          <p className="eyebrow section-kicker">
            <span className="section-index">01 /</span> CONTRACT-CONTROLLED REWARDS
          </p>
          <h2 id="manifesto-title">
            The contract controls
            <br />
            <span className="muted-heading">the rewards.</span>
          </h2>
          <div className="manifesto-bottom">
            <p>
              Prize amounts and commission rules are fixed before the collection
              launches. The contract calculates entitlements and executes claims.
              The operator cannot withdraw funds owed as prizes or earned
              affiliate commissions.
            </p>
            <a
              className="round-link"
              href="#collection"
              aria-label="Explore your NFT’s role in the draw"
            >
              <Icon name="down" />
            </a>
          </div>
        </section>

        <section
          className="seasons-section"
          id="seasons"
          aria-labelledby="seasons-title"
        >
          <div className="wrap">
            <div className="section-heading" data-reveal>
              <div>
                <p className="eyebrow">
                  <span className="section-index">02 /</span> COLLECTION TERMS ONCHAIN
                </p>
                <h2 id="seasons-title">
                  Every collection.
                  <br />
                  Its own <span className="serif">rules.</span>
                </h2>
              </div>
              <p>
                Every collection publishes its rules onchain at launch. Review
                the entry price, prize amounts, and commission terms before
                minting. Each sold-out collection has its own draw.
              </p>
            </div>
            <div className="season-explorer" data-reveal>
              <div className="season-explorer-top">
                <span className="mono">EXPLORE THE COLLECTIONS</span>
                <span className="catalog-tag">
                  {seasons.length} planned seasons
                  <Icon name="plus" />
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
                  <button
                    className="circle-button"
                    aria-label="Previous season"
                    onClick={() =>
                      setCatalogSeason(
                        (catalogSeason - 1 + seasons.length) % seasons.length
                      )
                    }
                  >
                    <Icon className="flip" />
                  </button>
                  <span className="mono">
                    {String(catalogSeason + 1).padStart(2, "0")} /{" "}
                    {seasons.length}
                  </span>
                  <button
                    className="circle-button"
                    aria-label="Next season"
                    onClick={() =>
                      setCatalogSeason((catalogSeason + 1) % seasons.length)
                    }
                  >
                    <Icon />
                  </button>
                </div>
              </div>
              <button
                className="catalog-disclosure"
                aria-expanded={showCatalog}
                aria-controls="season-catalog"
                onClick={() => setShowCatalog(!showCatalog)}
              >
                {showCatalog
                  ? "Close season list"
                  : "View all 22 seasons"}
                <Icon name="plus" className={showCatalog ? "rotate" : ""} />
              </button>
              {showCatalog && (
                <div className="season-catalog" id="season-catalog">
                  {seasons.map((season, i) => (
                    <button
                      key={season.season}
                      aria-label={`Select Season ${season.season}`}
                      aria-pressed={catalogSeason === i}
                      onClick={() => setCatalogSeason(i)}
                    >
                      <span className="mini-palette">
                        {season.colors.map((color) => (
                          <span key={color} style={{ background: color }} />
                        ))}
                      </span>
                      <span className="mono">
                        SEASON {String(season.season).padStart(2, "0")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="season-facts" data-reveal>
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
                  6<sup>*</sup>
                </span>
                <p>Equal prizes per sold-out collection</p>
              </div>
            </div>
            <p className="section-footnote">
              *Six prizes is the planned default. Each NFT enters only its own
              collection’s draw. Final collection terms may vary.
            </p>
          </div>
        </section>

        <section
          className="art-section"
          id="collection"
          aria-labelledby="art-title"
        >
          <div className="wrap section-heading" data-reveal>
            <div>
              <p className="eyebrow">
                <span className="section-index">03 /</span> YOUR ENTRY INTO THE DRAW
              </p>
              <h2 id="art-title">
                Your NFT connects
                <br />
                you to the <span className="serif">draw.</span>
              </h2>
            </div>
            <div>
              <p>
                Each NFT participates in its collection’s draw. The contract
                recognizes the winning holder’s right to claim. Your permanent
                NFT identity stays separate from the draw result.
              </p>
              <div className="gallery-controls">
                <span className="mono">COLLECTION PREVIEWS</span>
                <button
                  className="circle-button"
                  aria-label="Previous artwork"
                  disabled={galleryEdges.start}
                  onClick={() => moveGallery(-1)}
                >
                  <Icon className="flip" />
                </button>
                <button
                  className="circle-button"
                  aria-label="Next artwork"
                  disabled={galleryEdges.end}
                  onClick={() => moveGallery(1)}
                >
                  <Icon />
                </button>
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
                  <img
                    src={art.file}
                    width="640"
                    height="800"
                    loading="lazy"
                    alt={`Illustrative permanent Tincta NFT, Season ${String(
                      art.season
                    ).padStart(2, "0")}, Collection ${String(
                      art.collection
                    ).padStart(2, "0")}, geometric linework on ${art.color}`}
                  />
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
          className="rewards-section wrap"
          id="reward-details"
          aria-labelledby="prizes-title"
        >
          <div className="prize-panel" data-reveal>
            <div className="prize-copy">
              <p className="eyebrow">
                <Icon name="spark" /> PRIZES CLAIMED DIRECTLY
              </p>
              <h2 id="prizes-title">
                Six winning NFTs.
                <br />
                <span className="serif">1 ETH each.</span>
              </h2>
              <p>
                A verifiable draw determines the winners after sellout. Each
                winning holder claims their ETH directly from the contract.
                Planned default: 6 ETH in prizes per sold-out collection.
              </p>
              <div className="prize-micro">
                <span>
                  1,000<small>NFTS IN THE DRAW</small>
                </span>
                <span>
                  6<small>WINNING NFTS</small>
                </span>
                <span>
                  1 ETH<small>PER PRIZE</small>
                </span>
              </div>
              <a className="text-link" href="#questions">
                Understand the draw
                <Icon name="diagonal" />
              </a>
            </div>
            <div
              className="prize-tickets"
              aria-label="Six equal planned prizes of 1 ETH each"
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
                    ONE WINNING NFT
                    <Icon name="spark" />
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="affiliate-panel" id="affiliates" data-reveal>
            <div className="affiliate-visual" aria-hidden="true">
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
              <span>
                <small>UP TO</small>
                2<sup> ETH</sup>
                <small>AFFILIATE POOL PER SOLD-OUT COLLECTION</small>
              </span>
            </div>
            <div className="affiliate-copy">
              <p className="eyebrow">COMMISSIONS CALCULATED ONCHAIN</p>
              <h2>
                Your referrals.
                <br />
                Contract-calculated <span className="serif">commissions.</span>
              </h2>
              <p>
                Qualifying referrals are recorded onchain. The contract calculates
                your earned commission and lets you claim it directly, without
                team approval. Eligible holders enroll before minting opens;
                under planned defaults, one paid referral qualifies you.
              </p>
              <div className="affiliate-detail">
                <span>
                  Up to <strong>2 ETH</strong>
                  <small>budgeted per sold-out Growth collection</small>
                </span>
                <a
                  className="circle-button"
                  href="#questions"
                  aria-label="Read affiliate eligibility and payout terms"
                >
                  <Icon name="diagonal" />
                </a>
              </div>
              <p className="affiliate-note">
                Planned pools are up to 2 ETH for Growth collections and up to
                1 ETH for Standard collections. Qualifying affiliates share
                equally, subject to payout limits. Pool budgets are not individual
                earnings. Unallocated funds remain in a separate operator-accessible
                reserve; earned commissions remain protected.
              </p>
            </div>
          </div>
        </section>

        <section
          className="how-section wrap"
          id="how-it-works"
          aria-labelledby="how-title"
        >
          <div className="section-heading" data-reveal>
            <div>
              <p className="eyebrow">
                <span className="section-index">04 /</span> FROM CONTRACT TO CLAIM
              </p>
              <h2 id="how-title">
                Review. Mint.
                <br />
                Claim if you win.
              </h2>
            </div>
            <p>
              Review the rules before entering. Follow the draw onchain.
              Submit your claim directly to the contract.
            </p>
          </div>
          <div className="steps" data-reveal>
            <article>
              <span className="step-number">
                01
                <Icon name="plus" />
              </span>
              <h3>Review the contract.</h3>
              <p>
                Explore the season. Choose a collection and review its fixed
                price, supply, prizes, and terms.
              </p>
              <span className="step-caption">
                FIXED TERMS. PUBLISHED ONCHAIN.
              </span>
            </article>
            <article>
              <span className="step-number">
                02
                <Icon name="plus" />
              </span>
              <h3>Mint your NFT.</h3>
              <p>
                Mint an NFT to your wallet. Each NFT enters its collection’s
                draw, with its permanent identity assigned by the contract.
              </p>
              <span className="step-caption">
                YOUR NFT. YOUR DRAW ENTRY.
              </span>
            </article>
            <article>
              <span className="step-number">
                03
                <Icon name="spark" />
              </span>
              <h3>Claim if you win.</h3>
              <p>
                After sellout, the verifiable draw selects the winning NFTs.
                Hold a winner? Claim its ETH prize.
              </p>
              <span className="step-caption">
                DIRECT CLAIMS. NO TEAM APPROVAL.
              </span>
            </article>
          </div>
          <div className="trust-strip" data-reveal>
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

        <section
          className="faq-section wrap"
          id="questions"
          aria-labelledby="faq-title"
          data-reveal
        >
          <div>
            <p className="eyebrow">
              <span className="section-index">05 /</span> INDEPENDENTLY VERIFIABLE
            </p>
            <h2 id="faq-title">
              Inspect the code.
              <br />
              Verify the outcome.
            </h2>
            <p>
              At launch, explore verified contract code, collection terms,
              draw results, prize claims, and commission claims on Ethereum.
            </p>
          </div>
          <div className="faq-list">
            {faqs(plannedRewards).map((faq) => (
              <details key={faq.question} name="tincta-faq">
                <summary>
                  {faq.question}
                  <Icon name="plus" />
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
          <div className="wrap closing-content" data-reveal>
            <p className="eyebrow">BE READY FOR THE FIRST COLLECTION</p>
            <h2 id="closing-title">
              Know the rules
              <br />before you <span className="serif">enter.</span>
            </h2>
            <a className="button button-dark" href="#launch-list">
              Join the launch list
              <Icon name="diagonal" />
            </a>
            <span className="closing-note">
              Get notified when the first collection opens for minting.
            </span>
          </div>
        </section>
      </main>
      <footer className="footer wrap">
        <div className="footer-top">
          <Brand footer />
          <p>
            Onchain prizes.
            <br />
            Contract-controlled commissions.
          </p>
          <nav aria-label="Footer navigation">
            <a href="#seasons">Seasons</a>
            <a href="#affiliates">Affiliates</a>
            <a href="#questions">Questions</a>
            {appUrl && (
              <a href={new URL("/docs", appUrl).href}>
                Documentation
                <Icon name="diagonal" />
              </a>
            )}
          </nav>
          <a className="back-top" href="#top" aria-label="Back to top">
            <Icon name="down" />
          </a>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Tincta</span>
          <p>
            Launch preview. Rewards shown use planned default terms and require
            sellout. Prizes and affiliate earnings are not guaranteed. Review
            each collection’s final terms.
          </p>
          <button
            className="footer-motion"
            disabled={reducedMotion}
            onClick={() => setPaused(!paused)}
          >
            <Icon name={motionOff ? "play" : "pause"} />
            {reducedMotion
              ? "Reduced motion"
              : paused
              ? "Play motion"
              : "Pause motion"}
          </button>
        </div>
      </footer>
    </div>
  );
}
