"use client";
import { LinkButton } from "@manekineko/ui/button";

import { Icon } from "@manekineko/ui/icons";

export function HistoricalSnapshot({ title, revision, status, payload, contentHash, exportHref }: {
  title: string; revision: number; status: string; payload: unknown; contentHash: string | null; exportHref?: string;
}) {
  return <section className="launch-editor-body" aria-label="Historical launch record">
    <div className="launch-section-heading"><div><span className="launch-eyebrow">HISTORICAL RECORD</span><h2>{title}</h2><p>This record uses an earlier protocol model. Its saved terms remain available for reference. Create a new collection or season to use the current settings.</p></div></div>
    <div className="launch-review-grid"><div className="launch-review-item"><span>Status</span><strong>Read-only · {status}</strong></div><div className="launch-review-item"><span>Saved revision</span><strong>{revision}</strong></div></div>
    {contentHash && <div className="launch-review-item"><span>Content hash</span><strong>{contentHash}</strong></div>}
    <details className="ui-disclosure launch-advanced"><summary>Original saved terms <span>JSON</span><Icon name="chevron" className="ui-disclosure-icon" /></summary><pre tabIndex={0}>{JSON.stringify(payload, null, 2)}</pre></details>
    {exportHref && <LinkButton icon={<Icon name="down" />} iconPosition="end" variant="secondary"  href={exportHref} download>Download historical snapshot </LinkButton>}
  </section>;
}
