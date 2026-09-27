"use client";
import { Icon } from "@manekineko/ui/icons";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

export type SiteSection = "seasons" | "history" | "nfts" | "docs" | "prizes";

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
      <Icon name={open ? "close" : "menu"} />
    </button>
    <nav id={navigationId} aria-label="Main navigation">
      <Link href="/seasons" aria-current={section === "seasons" ? "page" : undefined} onClick={() => setOpen(false)}>Seasons</Link>
      <Link href="/history" aria-current={section === "history" ? "page" : undefined} onClick={() => setOpen(false)}>Results</Link>
      <Link href="/prizes" aria-current={section === "prizes" ? "page" : undefined} onClick={() => setOpen(false)}>Claim your prizes</Link>
      <Link href="/my-nfts" aria-current={section === "nfts" ? "page" : undefined} onClick={() => setOpen(false)}>My Tickets</Link>
      <Link href="/docs" aria-current={section === "docs" ? "page" : undefined} onClick={() => setOpen(false)}>How It Works</Link>
    </nav>
  </div>;
}
