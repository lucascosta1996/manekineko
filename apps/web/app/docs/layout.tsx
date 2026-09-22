import type { ReactNode } from "react";
import { SiteShell } from "../../components/site-shell";
import { DocsNavigation } from "../../components/docs/docs-navigation";
import { docPages } from "../../lib/docs/content";
import { docSearchEntry } from "../../lib/docs/model";
import "./docs.css";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return <SiteShell section="docs" className="docs-shell"><div className="docs-layout"><DocsNavigation entries={docPages.map(docSearchEntry)} /><div className="docs-page">{children}</div></div></SiteShell>;
}
