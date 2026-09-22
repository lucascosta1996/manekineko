"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

export type SiteSection = "seasons" | "history" | "nfts" | "docs";

export function SiteNavigation({ section }: { section: SiteSection }) {
  const [open, setOpen] = useState(false);
  const navigationId = useId();
  const container = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 761px)");
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return <div className="site-navigation" data-open={open} ref={container}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={event => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
        toggle.current?.focus();
      }
    }}>
    <button type="button" className="mobile-menu-toggle" ref={toggle}
      aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls={navigationId}
      onClick={() => setOpen(value => !value)}>
      <span>{open ? "Close" : "Menu"}</span>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        {open ? <path d="m5 5 10 10M5 15 15 5" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
      </svg>
    </button>
    <nav id={navigationId} aria-label="Main navigation">
      <Link href="/seasons" aria-current={section === "seasons" ? "page" : undefined} onClick={() => setOpen(false)}>Seasons</Link>
      <Link href="/history" aria-current={section === "history" ? "page" : undefined} onClick={() => setOpen(false)}>History</Link>
      <Link href="/my-nfts" aria-current={section === "nfts" ? "page" : undefined} onClick={() => setOpen(false)}>My NFTs</Link>
      <Link href="/docs" aria-current={section === "docs" ? "page" : undefined} onClick={() => setOpen(false)}>Docs</Link>
    </nav>
  </div>;
}
