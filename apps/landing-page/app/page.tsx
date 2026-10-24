import { LinkButton } from "@manekineko/ui/button";
import { Icon } from "@manekineko/ui/icons";
import { ResearchArt } from "../components/research-art";
import { StudioHeader, StudioFooter } from "../components/studio-shell";
import { NewsletterSignup } from "./newsletter-signup";
import "./studio.css";

const principles = [
  ["01", "Immutable by design", "The governing contract is fixed when published. Its code cannot be edited afterward, including by its creators."],
  ["02", "Open to inspection", "Published onchain, the rules can be inspected independently before anyone chooses to participate."],
  ["03", "Shaped by participation", "People shape outcomes through the actions and decision rights established in the contract."],
];
const concepts = [
  { name: "Morph", kind: "morph" as const, focus: "Adaptive collections", headline: "A collection shaped by the people who move it.", description: "Exploring collections that evolve through participant activity, with the rules of that evolution fixed in immutable code.", question: "How can ownership patterns, transfers, and collective milestones influence a collection’s evolution under fixed rules that distinguish sustained participation from artificial activity?" },
  { name: "Assembly", kind: "assembly" as const, focus: "Collective publishing", headline: "Ownership becomes a role in what comes next.", description: "Exploring collective publishing where immutable contracts define how participants make decisions, allocate resources, and publish new work.", question: "How can participants govern a shared publishing practice within fixed decision rights and limits that even its creators cannot override?" },
];

export default function LandingPage() {
  return (
    <div className="studio" id="top">
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="studio-wrap">
        <StudioHeader />
        <main id="main">
          <section className="studio-hero" aria-labelledby="studio-title">
            <div className="studio-hero-copy">
              <p className="studio-eyebrow">Research &amp; onchain publishing</p>
              <h1 id="studio-title"><span>Defined 100% onchain.</span>{" "}<span>Shaped by participation.</span></h1>
              <p className="studio-intro">We build open systems where immutable code sets the rules—and participation creates what comes next.</p>
              <LinkButton href="#projects" icon={<Icon name="arrow" />}>Explore our projects</LinkButton>
            </div>
          </section>
          <section className="studio-section" id="research" aria-labelledby="research-title">
            <div className="studio-thesis">
              <div><p className="studio-eyebrow">01 / Our thesis</p><h2 id="research-title">Rules that cannot be rewritten.</h2></div>
              <div className="studio-copy">
                <p>We publish immutable contracts so participants can inspect the rules before they act. Once deployed, that code cannot be edited by us or anyone else.</p>
                <p>Participants shape outcomes through actions the contract already allows. Our research asks what becomes possible when shared activity rests on rules that remain fixed.</p>
                <a className="ui-text-action" href="/whitepaper">Read the TAS-1 whitepaper<Icon name="arrow" /></a>
              </div>
            </div>
            <div className="studio-principles">{principles.map(([number, title, copy]) => <article className="studio-principle" key={number}><p className="studio-eyebrow">{number}</p><h3>{title}</h3><p>{copy}</p></article>)}</div>
          </section>
          <section className="studio-section" id="projects" aria-labelledby="projects-title">
            <div className="studio-section-heading"><div><p className="studio-eyebrow">02 / Projects</p><h2 id="projects-title">Immutable rules. Open possibilities.</h2></div><p>Each project explores what people can create, coordinate, and claim through rules fixed at publication.</p></div>
            <article className="studio-feature">
              <figure className="studio-art studio-project-art"><ResearchArt kind="rewards" /></figure>
              <div>
                <div className="studio-project-name">Tincta Rewards</div>
                <h3>Rewards governed by immutable terms.</h3>
                <p>Eligible NFT holders vote on each collection’s mint price, supply, winner count and mint duration. The selected terms become final when voting ends.</p>
                <p>Tincta allocates successful mint revenue to prizes (60%), qualified affiliates (20%), season holder rewards (8%) and the protocol treasury (12%) for infrastructure costs, future functionality and Tincta projects. Holder claims open at season end for the first 5% of eligible NFTs to claim, with equal payouts calculated from that season’s actual pool.</p>
                <p>Season holder rewards are planned for launch.</p>
                <LinkButton href="/rewards" variant="secondary" icon={<Icon name="arrow" />}>Explore Tincta Rewards</LinkButton>
                <div className="studio-feature-meta"><span>Community-voted terms</span><span>Direct contract claims</span></div>
              </div>
            </article>
          </section>
          <section className="studio-section" id="upcoming" aria-labelledby="upcoming-title">
            <div className="studio-section-heading"><div><p className="studio-eyebrow">03 / Upcoming projects</p><h2 id="upcoming-title">Changing outcomes.<br />Lasting rules.</h2></div><p>We’re exploring how collections can evolve and communities can create together within rules fixed at publication.</p></div>
            <div className="studio-upcoming">{concepts.map(project => <article className="studio-concept" key={project.name}>
              <figure className="studio-art studio-project-art"><ResearchArt kind={project.kind} /></figure>
              <div className="studio-concept-heading"><h3>Tincta {project.name}</h3><span className="studio-concept-status">Research concept</span></div>
              <p className="studio-eyebrow">{project.focus}</p>
              <h4>{project.headline}</h4><p>{project.description}</p>
              <details className="ui-disclosure"><summary>The research question<Icon name="chevron" className="ui-disclosure-icon" /></summary><div className="ui-disclosure-content">{project.question}</div></details>
            </article>)}</div>
            <p className="studio-roadmap-note">Morph and Assembly are proposed research directions. Their scope and release timing are not yet established.</p>
          </section>
          <section className="studio-section studio-launch" id="launch-list" aria-labelledby="studio-launch-title" tabIndex={-1}>
            <p className="studio-eyebrow">Stay in the loop</p>
            <h2 id="studio-launch-title">Be part of what comes next.</h2>
            <p id="studio-launch-description">Get notified about Tincta project launches, starting with Rewards.</p>
            <NewsletterSignup
              endpoint={process.env.LANDING_SITE_ROLE === "studio" ? "https://rewards.tincta.xyz/api/newsletter" : undefined}
              descriptionId="studio-launch-description"
              successMessage="You’re on the list. We’ll email you about upcoming Tincta launches."
            />
          </section>
          <section className="studio-section studio-closing" aria-labelledby="closing-title"><div><p className="studio-eyebrow">Built to remain</p><h2 id="closing-title">The rules stay fixed.<br />The possibilities unfold.</h2></div><LinkButton href="/rewards" icon={<Icon name="arrow" />}>Discover Tincta Rewards</LinkButton></section>
        </main>
        <StudioFooter />
      </div>
    </div>
  );
}
