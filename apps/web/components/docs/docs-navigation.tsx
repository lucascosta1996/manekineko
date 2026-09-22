"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { docGroups, docHref, searchDocs, type DocSearchEntry } from "../../lib/docs/model";

export function DocsNavigation({ entries }: { entries: DocSearchEntry[] }) {
  const pathname = usePathname();
  return <Navigation key={pathname} entries={entries} pathname={pathname} />;
}

function Navigation({ entries, pathname }: { entries: DocSearchEntry[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const results = searchDocs(entries, query);
  const current = entries.find(entry => docHref(entry.slug) === pathname);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => search.current?.focus());
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  return <aside className="docs-sidebar" data-open={open} onKeyDown={event => {
    if (event.key === "Escape") {
      if (query) { setQuery(""); return; }
      setOpen(false);
      toggle.current?.focus();
    }
  }}>
    <button className="docs-mobile-toggle" ref={toggle} type="button" aria-expanded={open} aria-controls="docs-navigation-panel" onClick={() => setOpen(value => !value)}>
      <span><span className="docs-mobile-label">Documentation</span>{current?.title ?? "Browse topics"}</span><span aria-hidden="true">{open ? "−" : "+"}</span>
    </button>
    <div className="docs-navigation-panel" id="docs-navigation-panel">
      <Link className="docs-sidebar-title" href="/docs">Documentation <span>01 / TINCTA</span></Link>
      <div className="docs-search-field">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg>
        <input type="search" ref={search} aria-label="Search documentation" placeholder="Search docs…" value={query} onChange={event => setQuery(event.target.value)} />
        {!query && <kbd title="Command or Control K">⌘ K</kbd>}
      </div>
      {query.trim() ? <div className="docs-search-results"><p className="docs-nav-label" role="status">{results.length} {results.length === 1 ? "result" : "results"}</p>
        {results.length ? results.map(entry => <Link href={docHref(entry.slug)} key={entry.slug} onClick={() => setOpen(false)}><strong>{entry.title}</strong><span>{entry.description}</span></Link>)
          : <p className="docs-no-results">No matching pages. Try “mint”, “prizes” or “affiliate”.</p>}
      </div> : <nav aria-label="Documentation topics">{docGroups.map(group => <div className="docs-nav-group" key={group}><p className="docs-nav-label">{group}</p>{entries.filter(entry => entry.group === group).map(entry => <Link href={docHref(entry.slug)} key={entry.slug} aria-current={pathname === docHref(entry.slug) ? "page" : undefined} onClick={() => setOpen(false)}>{entry.title}</Link>)}</div>)}</nav>}
      <Link className="docs-back-app" href="/seasons">Explore seasons <span aria-hidden="true">↗</span></Link>
    </div>
  </aside>;
}
