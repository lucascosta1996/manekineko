import { Icon } from "@manekineko/ui/icons";
import type { DocBlock } from "../../lib/docs/model";

type VisualBlock = Extract<DocBlock, { type: "flow" | "formula" | "allocation" }>;

/** Server-rendered diagrams remain readable, searchable and selectable without JavaScript. */
export function DocsVisual({ block }: { block: VisualBlock }) {
  return <figure className={`docs-visual docs-visual-${block.type}`} aria-label={block.title}>
    <figcaption>{block.title}</figcaption>
    {block.type === "flow" && <>
      <ol className="docs-flow-steps">{block.steps.map((step, index) => <li key={step.title}>
        <span className="docs-flow-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <div><strong>{step.title}</strong><p>{step.text}</p></div>
        {index < block.steps.length - 1 && <Icon name="down" className="docs-flow-arrow" />}
      </li>)}</ol>
      {block.branches && <ul className="docs-flow-branches">{block.branches.map(branch => <li key={branch.title}><strong className="docs-flow-branch-heading"><Icon name="down" /><span>{branch.title}</span></strong><p>{branch.text}</p></li>)}</ul>}
      <p className="docs-visual-note">{block.caption}</p>
    </>}
    {block.type === "formula" && <>
      <div className="docs-equations">{block.equations.map(equation => <p key={equation}>{equation}</p>)}</div>
      <dl className="docs-formula-key">{block.definitions.map(entry => <div key={entry.symbol}><dt>{entry.symbol}</dt><dd>{entry.meaning}</dd></div>)}</dl>
      <p className="docs-visual-note">{block.note}</p>
    </>}
    {block.type === "allocation" && <>
      <div className="docs-allocation-bar" aria-hidden="true">{block.items.map(item => <span key={item.label} style={{ flexGrow: item.share }} />)}</div>
      <ul className="docs-allocation-items">{block.items.map(item => <li key={item.label}><strong><span>{item.share}%</span> {item.label}</strong><p>{item.text}</p></li>)}</ul>
      <p className="docs-visual-note">{block.caption}</p>
    </>}
  </figure>;
}
