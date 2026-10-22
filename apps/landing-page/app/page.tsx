import { LinkButton } from "@manekineko/ui/button";
import { Icon } from "@manekineko/ui/icons";
import { publicLinks } from "@manekineko/ui/links";
import { TinctaWordmark } from "../components/tincta-logo";
import { ResearchArt } from "../components/research-art";
import "./studio.css";

const principles = [
  ["01", "Programmable incentives", "How can participation create economic rights through explicit, inspectable rules?"],
  ["02", "Verifiable commitments", "How can contracts preserve the promises a project makes to its participants?"],
  ["03", "Participant-driven outcomes", "How can individual decisions shape the trajectory of a shared collection?"],
];
const concepts = [
  { name: "Morph", kind: "morph" as const, focus: "Adaptive collections", headline: "A collection shaped by the people who move it.", description: "Exploring digital collections that translate participant activity into changes in form, composition, and progression.", question: "How can ownership patterns, transfers, and collective milestones influence a collection’s evolution—while distinguishing sustained participation from artificial activity?" },
  { name: "Assembly", kind: "assembly" as const, focus: "Collective publishing", headline: "Ownership becomes a role in what comes next.", description: "Exploring how collections can coordinate creative decisions, allocate shared resources, and publish new work through participant governance.", question: "How can a collection become a lasting publishing community—with clear decision rights, limits on concentrated influence, and commitments that remain enforceable after a vote?" },
];

export default function LandingPage() {
  const links = publicLinks({ contact: process.env.NEXT_PUBLIC_CONTACT_URL, social: process.env.NEXT_PUBLIC_X_URL });
  return (
    <div className="studio" id="top">
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="studio-wrap">
        <header className="studio-header">
          <a className="studio-brand" href="/" aria-label="Tincta home"><TinctaWordmark className="studio-wordmark" title="" /></a>
          <nav className="studio-nav" aria-label="Main navigation">
            <a href="#research">Research</a><a href="#projects">Projects</a><a href="#upcoming">Upcoming</a>
          </nav>
        </header>
        <main id="main">
          <section className="studio-hero" aria-labelledby="studio-title">
            <div>
              <p className="studio-eyebrow">Research &amp; onchain publishing</p>
              <h1 id="studio-title"><span>Defined by code.</span><span>Shaped by participation.</span></h1>
              <p className="studio-intro">Tincta is a research and publishing studio exploring programmable markets—where smart contracts establish the rules, and participants shape how digital collections unfold.</p>
              <LinkButton href="#projects" icon={<Icon name="arrow" />}>Explore our projects</LinkButton>
            </div>
            <figure className="studio-art">
              <ResearchArt kind="rewards" />
              <figcaption><span>Rewards / Open</span><span>Opening → discovery</span></figcaption>
            </figure>
          </section>
          <section className="studio-section" id="research" aria-labelledby="research-title">
            <div className="studio-thesis">
              <div><p className="studio-eyebrow">01 / Our thesis</p><h2 id="research-title">A collection is more than what it contains.</h2></div>
              <div className="studio-copy">
                <p>Its trajectory emerges from the rules that govern it—and the people who choose to participate. We explore how those rules can become transparent, executable systems.</p>
                <p>Our research sits between mechanism design and collective behavior: how individual decisions produce shared outcomes, and how smart contracts can reduce dependence on discretionary intervention.</p>
              </div>
            </div>
            <div className="studio-principles">{principles.map(([number, title, copy]) => <article className="studio-principle" key={number}><p className="studio-eyebrow">{number}</p><h3>{title}</h3><p>{copy}</p></article>)}</div>
          </section>
          <section className="studio-section" id="projects" aria-labelledby="projects-title">
            <div className="studio-section-heading"><div><p className="studio-eyebrow">02 / Projects</p><h2 id="projects-title">Research, put into practice.</h2></div><p>Each project explores a different relationship between code, ownership, and participation.</p></div>
            <article className="studio-feature">
              <figure className="studio-art studio-project-art"><ResearchArt kind="rewards" /></figure>
              <div>
                <div className="studio-project-name">Tincta Rewards</div>
                <h3>Participation with defined economic rights.</h3>
                <p>Tincta Rewards explores collection-based incentives, with smart contracts defining prize claims, affiliate rewards, and refund conditions.</p>
                <LinkButton href="/rewards" variant="secondary" icon={<Icon name="arrow" />}>Explore Tincta Rewards</LinkButton>
                <div className="studio-feature-meta"><span>Collection-based incentives</span><span>Contract-defined rules</span></div>
              </div>
            </article>
          </section>
          <section className="studio-section" id="upcoming" aria-labelledby="upcoming-title">
            <div className="studio-section-heading"><div><p className="studio-eyebrow">03 / Upcoming projects</p><h2 id="upcoming-title">New questions.<br />Future projects.</h2></div><p>Our next research directions explore how collections evolve—and what their participants create together.</p></div>
            <div className="studio-upcoming">{concepts.map(project => <article className="studio-concept" key={project.name}>
              <figure className="studio-art studio-project-art"><ResearchArt kind={project.kind} /></figure>
              <div className="studio-concept-heading"><h3>Tincta {project.name}</h3><span className="studio-concept-status">Research concept</span></div>
              <p className="studio-eyebrow">{project.focus}</p>
              <h4>{project.headline}</h4><p>{project.description}</p>
              <details className="ui-disclosure"><summary>The research question<Icon name="chevron" className="ui-disclosure-icon" /></summary><div className="ui-disclosure-content">{project.question}</div></details>
            </article>)}</div>
            <p className="studio-roadmap-note">Morph and Assembly are proposed research directions. Their scope and release timing are not yet established.</p>
          </section>
          <section className="studio-section studio-closing" aria-labelledby="closing-title"><div><p className="studio-eyebrow">Toward greater autonomy</p><h2 id="closing-title">We design the conditions.<br />Participation shapes the outcome.</h2></div><LinkButton href="/rewards" icon={<Icon name="arrow" />}>Discover Tincta Rewards</LinkButton></section>
        </main>
        <footer className="studio-footer">
          <div><a className="studio-brand" href="/" aria-label="Tincta home"><TinctaWordmark className="studio-wordmark" title="" /></a><p className="studio-footer-description">Research, development,<br />and onchain publishing.</p></div>
          <nav aria-label="Explore Tincta"><strong className="ui-footer-heading">Explore</strong><a className="ui-footer-link" href="#research">Our research</a><a className="ui-footer-link" href="/rewards">Tincta Rewards<Icon name="arrow" size="footer" /></a><a className="ui-footer-link" href="#upcoming">Upcoming projects</a></nav>
          <nav aria-label="Tincta information"><strong className="ui-footer-heading">Tincta</strong><a className="ui-footer-link" href="#top">Back to top<Icon name="up" size="footer" /></a>{links.contact && <a className="ui-footer-link" href={links.contact}>Contact<Icon name="diagonal" size="footer" /></a>}{links.social && <a className="ui-footer-link" href={links.social}>X<Icon name="diagonal" size="footer" /></a>}</nav>
          <div className="studio-footer-legal"><span>© {new Date().getFullYear()} Tincta</span><span>Defined by code. Shaped by participation.</span></div>
        </footer>
      </div>
    </div>
  );
}
