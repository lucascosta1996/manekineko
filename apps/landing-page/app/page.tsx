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
  ["01", "Immutable by design", "Published contract rules stay fixed, including for their creators."],
  ["02", "Open to inspection", "Read the rules onchain before you participate."],
  ["03", "Shaped by participation", "Participants vote, collect and claim within the published rules."],
];
const concepts = [
  { name: "Morph", kind: "morph" as const, focus: "Adaptive collections", headline: "Collections that respond to their owners.", description: "We’re researching how collections could change as people hold and transfer them, under rules fixed in code.", question: "How can ownership patterns, transfers, and collective milestones influence a collection’s evolution under fixed rules that distinguish sustained participation from artificial activity?" },
  { name: "Assembly", kind: "assembly" as const, focus: "Collective publishing", headline: "A shared say in what gets published.", description: "We’re researching how participants could decide what to publish and how to fund it, with their decision rights set by immutable contracts.", question: "How can participants govern a shared publishing practice within fixed decision rights and limits that even its creators cannot override?" },
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
              <p className="studio-intro">We build onchain projects with fixed rules for voting, collecting and publishing.</p>
              <LinkButton href="#projects" icon={<Icon name="arrow" />}>Explore our projects</LinkButton>
            </div>
          </section>
          <section className="studio-section" id="research" aria-labelledby="research-title">
            <GlassBlocks variant="rules" />
            <div className="studio-thesis">
              <div><p className="studio-eyebrow">01 / Our thesis</p><h2 className="motion-heading" id="research-title"><MotionWords>Rules that cannot be rewritten.</MotionWords></h2></div>
              <div className="studio-copy">
                <p>Our research asks how people can use a project without relying on its creators to keep it running. TAS-1 sets out proposed requirements for fixed rules, public execution and onchain data.</p>
                <a className="ui-text-action" href="/whitepaper">Read the TAS-1 whitepaper<Icon name="arrow" /></a>
              </div>
            </div>
            <div className="studio-principles motion-sequence">{principles.map(([number, title, copy], index) => <article className="studio-principle" key={number}><p className="studio-eyebrow">{number}<Icon name={index === 0 ? "shield" : index === 1 ? "layers" : "spark"} className="motion-icon" /></p><h3>{title}</h3><p>{copy}</p></article>)}</div>
          </section>
          <section className="studio-section" id="projects" aria-labelledby="projects-title">
            <GlassBlocks variant="rewards" />
            <div className="studio-section-heading"><div><p className="studio-eyebrow">02 / Projects</p><h2 className="motion-heading" id="projects-title"><MotionWords>From research to onchain collections.</MotionWords></h2></div><p>Rewards brings together NFT collections, community voting and contract-defined claims. Morph and Assembly are research concepts.</p></div>
            <article className="studio-feature">
              <GenesisArtwork className="studio-genesis-art motion-art" />
              <div>
                <div className="studio-project-name">Tincta Rewards</div>
                <h3>Vote on terms. Collect onchain art.</h3>
                <p>Vote on collection terms. Mint original onchain artwork. Claim ETH rewards under published rules.</p>
                <p><strong>One free NFT. Two utilities.</strong> With Tincta Genesis, vote on the first collection and enroll as an affiliate across all collections and seasons. After enrolling, share your referral URL. One qualifying paid mint earns you an equal share of the ETH affiliate pool after sellout and a successful draw. Enrollment positions are limited.</p>
                <p>1,000 free NFTs. Up to two lifetime mints per wallet, plus network gas. No mint deadline; the first season waits for all 1,000 NFTs to mint.</p>
                <p>These rules are deployed on Sepolia for testing. Mainnet minting has not launched.</p>
                <LinkButton href="/rewards" variant="secondary" icon={<Icon name="arrow" />}>Explore Tincta Rewards</LinkButton>
                <div className="studio-feature-meta"><span>Community-voted terms</span><span>Direct contract claims</span></div>
              </div>
            </article>
          </section>
          <section className="studio-section" id="upcoming" aria-labelledby="upcoming-title">
            <GlassBlocks variant="possibilities" />
            <div className="studio-section-heading"><div><p className="studio-eyebrow">03 / Upcoming projects</p><h2 className="motion-heading" id="upcoming-title"><MotionWords>Two questions we’re exploring.</MotionWords></h2></div><p>What could fixed contract rules make possible for evolving artwork and shared publishing?</p></div>
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
            <h2 className="motion-heading" id="studio-launch-title"><MotionWords>Hear about new Tincta projects.</MotionWords></h2>
            <p id="studio-launch-description">Join the email list for project launches, starting with Rewards.</p>
            <NewsletterSignup
              endpoint={process.env.LANDING_SITE_ROLE === "studio" ? "https://rewards.tincta.xyz/api/newsletter" : undefined}
              descriptionId="studio-launch-description"
              successMessage="You’re on the list. We’ll email you about upcoming Tincta launches."
            />
          </section>
          <section className="studio-section studio-closing" aria-labelledby="closing-title"><GlassBlocks variant="unfold" /><div><p className="studio-eyebrow">Built to remain</p><h2 className="motion-heading" id="closing-title"><MotionWords>Start with Tincta Rewards.</MotionWords></h2></div><LinkButton href="/rewards" icon={<Icon name="arrow" />}>Open Tincta Rewards</LinkButton></section>
        </main>
        <StudioFooter />
      </div>
    </LandingMotion>
  );
}
