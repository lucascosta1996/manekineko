import Link from "next/link";
import { docPages } from "../../lib/docs/content";
import { docGroups, docHref, type DocBlock, type DocPage } from "../../lib/docs/model";
import { DocsOutline } from "./docs-outline";

function Block({ block }: { block: DocBlock }) {
  switch (block.type) {
    case "paragraph": return <p>{block.text}</p>;
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return <List>{block.items.map((item, index) => <li key={index}>{item}</li>)}</List>;
    }
    case "callout": return <aside className="docs-callout"><span aria-hidden="true">i</span><div><strong>{block.title}</strong><p>{block.text}</p></div></aside>;
    case "table": return <div className="docs-table-scroll" role="region" aria-label={block.columns.join(" and ")} tabIndex={0}><table><thead><tr>{block.columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead><tbody>{block.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
    case "links": return <div className="docs-link-cards">{block.items.map(item => <Link key={item.href} href={item.href} className="docs-link-card"><strong>{item.label}<span aria-hidden="true">↗</span></strong><span>{item.description}</span></Link>)}</div>;
  }
}

export function DocsArticle({ page }: { page: DocPage }) {
  const readingOrder = docGroups.flatMap(group => docPages.filter(entry => entry.group === group));
  const index = readingOrder.findIndex(entry => entry.slug === page.slug);
  const previous = readingOrder[index - 1];
  const next = readingOrder[index + 1];
  const sections = page.sections.map(({ id, title }) => ({ id, title }));
  return <div className="docs-reading-layout">
    <article className="docs-article" aria-labelledby="docs-title">
      <div className="docs-breadcrumb"><Link href="/docs">Docs</Link><span aria-hidden="true">/</span><span>{page.group}</span></div>
      <header className="docs-article-header"><p className="eyebrow">TINCTA / THE FIELD GUIDE</p><h1 id="docs-title">{page.title}</h1><p className="docs-description">{page.description}</p><div className="docs-reading-meta"><span>{page.minutes} min read</span><span>Protocol guide</span></div></header>
      {page.slug === "overview" && <div className="docs-intro-strip" aria-label="Collect color. Draw results. Claim rewards."><span>01 <strong>Collect color</strong></span><span>02 <strong>Draw results</strong></span><span>03 <strong>Claim rewards</strong></span></div>}
      <details className="docs-inline-outline"><summary>On this page</summary><nav aria-label="Page sections">{sections.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}</nav></details>
      <div className="docs-prose">{page.sections.map(section => <section key={section.id} aria-labelledby={section.id}><h2 id={section.id}>{section.title}<a href={`#${section.id}`} aria-label={`Link to ${section.title}`} className="docs-heading-anchor">#</a></h2>{section.blocks.map((block, blockIndex) => <Block key={blockIndex} block={block} />)}</section>)}</div>
      <nav className="docs-pagination" aria-label="Documentation pages">{previous ? <Link href={docHref(previous.slug)}><span>← Previous</span><strong>{previous.title}</strong></Link> : <span />}{next && <Link href={docHref(next.slug)} className="docs-next"><span>Next →</span><strong>{next.title}</strong></Link>}</nav>
      <p className="docs-page-note">Read the rules. Verify the collection. Add your color.</p>
    </article>
    <DocsOutline key={page.slug} sections={sections} />
  </div>;
}
