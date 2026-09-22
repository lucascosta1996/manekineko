"use client";

import { useEffect, useState } from "react";

export function DocsOutline({ sections }: { sections: { id: string; title: string }[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  useEffect(() => {
    const headings = sections.map(section => document.getElementById(section.id)).filter((node): node is HTMLElement => !!node);
    const update = () => {
      const atBottom = window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      const passed = headings.filter(heading => heading.getBoundingClientRect().top <= 140);
      setActive((atBottom ? headings.at(-1)?.id : passed.at(-1)?.id) ?? headings[0]?.id ?? "");
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [sections]);
  return <aside className="docs-outline"><p className="docs-nav-label">On this page</p><nav aria-label="On this page">{sections.map(section => <a key={section.id} href={`#${section.id}`} aria-current={active === section.id ? "location" : undefined}>{section.title}</a>)}</nav><a className="docs-top-link" href="#docs-title">Back to top ↑</a></aside>;
}
