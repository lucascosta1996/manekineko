"use client";
import { Button } from "@manekineko/ui/button";

import { Icon } from "@manekineko/ui/icons";

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

  return <aside aria-label="Documentation navigation" className="docs-sidebar" data-open={open} onKeyDown={event => {
    if (event.key === "Escape") {
      if (query) { setQuery(""); return; }
      setOpen(false);
      toggle.current?.focus();
    }
  }}>
    <Button variant="ghost" className="docs-mobile-toggle" ref={toggle} type="button" aria-expanded={open} aria-controls="docs-navigation-panel" onClick={() => setOpen(value => !value)}>
      <span><span className="docs-mobile-label">How It Works</span>{current?.title ?? "Browse topics"}</span><Icon name={open ? "minus" : "plus"} />
    </Button>
    <div className="docs-navigation-panel" id="docs-navigation-panel">
      <Link className="docs-sidebar-title" href="/docs">How It Works <span>01 / TINCTA</span></Link>
      <div className="docs-search-field">
        <Icon name="search" />
        <input className="ui-input" type="search" ref={search} aria-label="Search reward guides" placeholder="Search guides…" value={query} onChange={event => setQuery(event.target.value)} />

      </div>
      {query.trim() ? <div className="docs-search-results"><p className="docs-nav-label" role="status">{results.length} {results.length === 1 ? "result" : "results"}</p>
        {results.length ? results.map(entry => <Link href={docHref(entry.slug)} key={entry.slug} onClick={() => setOpen(false)}><strong>{entry.title}</strong><span>{entry.description}</span></Link>)
          : <p className="docs-no-results">No matching pages. Try “mint”, “prizes” or “affiliate”.</p>}
      </div> : <nav aria-label="Reward guide topics">{docGroups.map(group => <div className="docs-nav-group" key={group}><p className="docs-nav-label">{group}</p>{entries.filter(entry => entry.group === group).map(entry => <Link href={docHref(entry.slug)} key={entry.slug} aria-current={pathname === docHref(entry.slug) ? "page" : undefined} onClick={() => setOpen(false)}>{entry.title}</Link>)}</div>)}</nav>}
      <Link className="docs-back-app" href="/seasons">Explore seasons <span aria-hidden="true"><Icon name="diagonal" /></span></Link>
    </div>
  </aside>;
}
