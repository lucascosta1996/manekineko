"use client";

export function HistoricalSnapshot({ title, revision, status, payload, contentHash, exportHref }: {
  title: string; revision: number; status: string; payload: unknown; contentHash: string | null; exportHref?: string;
}) {
  return <section className="launch-editor-body" aria-label="Historical launch record">
    <div className="launch-section-heading"><div><span className="launch-eyebrow">HISTORICAL RECORD</span><h2>{title}</h2><p>This record uses an earlier protocol model. Its saved terms remain available for reference. Create a new collection or season to use the current settings.</p></div></div>
    <div className="launch-review-grid"><div className="launch-review-item"><span>Status</span><strong>Read-only · {status}</strong></div><div className="launch-review-item"><span>Saved revision</span><strong>{revision}</strong></div></div>
    {contentHash && <div className="launch-review-item"><span>Content hash</span><strong>{contentHash}</strong></div>}
    <details className="launch-advanced"><summary>Original saved terms <span>JSON</span></summary><pre tabIndex={0}>{JSON.stringify(payload, null, 2)}</pre></details>
    {exportHref && <a className="launch-button launch-button-secondary" href={exportHref} download>Download historical snapshot ↓</a>}
  </section>;
}
