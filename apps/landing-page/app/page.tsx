import { GenesisArtwork } from "@manekineko/ui/genesis-artwork";
import { LinkButton } from "@manekineko/ui/button";
import { Icon } from "@manekineko/ui/icons";
import { ResearchArt } from "../components/research-art";
import { StudioHeader, StudioFooter } from "../components/studio-shell";
import { NewsletterSignup } from "./newsletter-signup";
import { MotionWords } from "../components/motion-words";
import { LandingMotion } from "../components/landing-motion";
import { GlassBlocks } from "../components/glass-blocks";
import "./studio.css";

const principles = [
  ["01", "Immutable by design", "Published contracts stay fixed, including for their creators."],
  ["02", "Open to inspection", "Read the rules onchain before you participate."],
  ["03", "Shaped by participation", "Your actions shape outcomes within the published rules."],
];
const concepts = [
  { name: "Morph", kind: "morph" as const, focus: "Adaptive collections", headline: "A collection shaped by the people who move it.", description: "Exploring collections that evolve through participant activity, with the rules of that evolution fixed in immutable code.", question: "How can ownership patterns, transfers, and collective milestones influence a collection’s evolution under fixed rules that distinguish sustained participation from artificial activity?" },
  { name: "Assembly", kind: "assembly" as const, focus: "Collective publishing", headline: "Ownership becomes a role in what comes next.", description: "Exploring collective publishing where immutable contracts define how participants make decisions, allocate resources, and publish new work.", question: "How can participants govern a shared publishing practice within fixed decision rights and limits that even its creators cannot override?" },
];

export default function LandingPage() {
  return (
    <LandingMotion className="studio" id="top">
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="studio-wrap">
        <StudioHeader />
        <main id="main">
          <section className="studio-hero" aria-labelledby="studio-title">
            <GlassBlocks variant="origin" />
            <div className="studio-hero-copy">
              <p className="studio-eyebrow">Research &amp; onchain publishing</p>
              <h1 id="studio-title"><MotionWords><span className="motion-line">Defined 100% onchain.</span>{" "}<span className="motion-line">Shaped by participation.</span></MotionWords></h1>
              <p className="studio-intro">We build open systems where immutable code sets the rules—and participation creates what comes next.</p>
              <LinkButton href="#projects" icon={<Icon name="arrow" />}>Explore our projects</LinkButton>
            </div>
          </section>
          <section className="studio-section" id="research" aria-labelledby="research-title">
            <GlassBlocks variant="rules" />
            <div className="studio-thesis">
              <div><p className="studio-eyebrow">01 / Our thesis</p><h2 className="motion-heading" id="research-title"><MotionWords>Rules that cannot be rewritten.</MotionWords></h2></div>
              <div className="studio-copy">
                <p>We publish contracts with fixed rules and room for collective action. Read the code, understand your rights, and shape what comes next.</p>
                <a className="ui-text-action" href="/whitepaper">Read the TAS-1 whitepaper<Icon name="arrow" /></a>
              </div>
            </div>
            <div className="studio-principles motion-sequence">{principles.map(([number, title, copy], index) => <article className="studio-principle" key={number}><p className="studio-eyebrow">{number}<Icon name={index === 0 ? "shield" : index === 1 ? "layers" : "spark"} className="motion-icon" /></p><h3>{title}</h3><p>{copy}</p></article>)}</div>
          </section>
          <section className="studio-section" id="projects" aria-labelledby="projects-title">
            <GlassBlocks variant="rewards" />
            <div className="studio-section-heading"><div><p className="studio-eyebrow">02 / Projects</p><h2 className="motion-heading" id="projects-title"><MotionWords>Immutable rules. Open possibilities.</MotionWords></h2></div><p>Each project explores what people can create, coordinate, and claim through rules fixed at publication.</p></div>
            <article className="studio-feature">
              <GenesisArtwork className="studio-genesis-art motion-art" />
              <div>
                <div className="studio-project-name">Tincta Rewards</div>
                <h3>Rewards governed by immutable terms.</h3>
                <p>Vote on collection terms. Mint original onchain artwork. Claim ETH rewards under published rules.</p>
                <p><strong>One free NFT. Two utilities.</strong> With Tincta Genesis, vote on the first collection and enroll as an affiliate across all collections and seasons. Share your referral URL: one paid mint through it qualifies you for an equal share of the ETH affiliate pool after sellout and a successful draw. Enrollment positions are limited.</p>
                <p>1,000 free NFTs. Up to two lifetime mints per wallet, plus network gas. No mint deadline; the first season waits for all 1,000 NFTs to mint.</p>
                <p>These are the planned launch terms. The current Sepolia test uses earlier rules; Mainnet minting has not launched.</p>
                <LinkButton href="/rewards" variant="secondary" icon={<Icon name="arrow" />}>Explore Tincta Rewards</LinkButton>
                <div className="studio-feature-meta"><span>Community-voted terms</span><span>Direct contract claims</span></div>
              </div>
            </article>
          </section>
          <section className="studio-section" id="upcoming" aria-labelledby="upcoming-title">
            <GlassBlocks variant="possibilities" />
            <div className="studio-section-heading"><div><p className="studio-eyebrow">03 / Upcoming projects</p><h2 className="motion-heading" id="upcoming-title"><MotionWords>Changing outcomes.<br />Lasting rules.</MotionWords></h2></div><p>We’re exploring how collections can evolve and communities can create together within rules fixed at publication.</p></div>
            <div className="studio-upcoming">{concepts.map(project => <article className="studio-concept" key={project.name}>
              <figure className="studio-art studio-project-art motion-art"><ResearchArt kind={project.kind} /></figure>
              <div className="studio-concept-heading"><h3>Tincta {project.name}</h3><span className="studio-concept-status">Research concept</span></div>
              <p className="studio-eyebrow">{project.focus}</p>
              <h4>{project.headline}</h4><p>{project.description}</p>
              <details className="ui-disclosure"><summary>The research question<Icon name="chevron" className="ui-disclosure-icon" /></summary><div className="ui-disclosure-content">{project.question}</div></details>
            </article>)}</div>
            <p className="studio-roadmap-note">Morph and Assembly are proposed research directions. Their scope and release timing are not yet established.</p>
          </section>
          <section className="studio-section studio-launch" id="launch-list" aria-labelledby="studio-launch-title" tabIndex={-1}>
            <GlassBlocks variant="join" />
            <p className="studio-eyebrow">Stay in the loop</p>
            <h2 className="motion-heading" id="studio-launch-title"><MotionWords>Be part of what comes next.</MotionWords></h2>
            <p id="studio-launch-description">Get notified about Tincta project launches, starting with Rewards.</p>
            <NewsletterSignup
              endpoint={process.env.LANDING_SITE_ROLE === "studio" ? "https://rewards.tincta.xyz/api/newsletter" : undefined}
              descriptionId="studio-launch-description"
              successMessage="You’re on the list. We’ll email you about upcoming Tincta launches."
            />
          </section>
          <section className="studio-section studio-closing" aria-labelledby="closing-title"><GlassBlocks variant="unfold" /><div><p className="studio-eyebrow">Built to remain</p><h2 className="motion-heading" id="closing-title"><MotionWords>The rules stay fixed.<br />The possibilities unfold.</MotionWords></h2></div><LinkButton href="/rewards" icon={<Icon name="arrow" />}>Discover Tincta Rewards</LinkButton></section>
        </main>
        <StudioFooter />
      </div>
    </LandingMotion>
  );
}
