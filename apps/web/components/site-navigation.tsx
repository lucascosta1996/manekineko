"use client";
import { Button } from "@manekineko/ui/button";

import { Icon } from "@manekineko/ui/icons";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

export type SiteSection = "home" | "claims" | "affiliates" | "seasons" | "history" | "nfts" | "docs" | "prizes" | "vote" | "operations";

export function SiteNavigation({ section, protocolEnabled = false }: { section: SiteSection; protocolEnabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const navigationId = useId();
  const container = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1101px)");
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
    <Button icon={<Icon name={open ? "close" : "menu"} />} iconPosition="end" variant="ghost" type="button" className="mobile-menu-toggle" ref={toggle}
      aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls={navigationId}
      onClick={() => setOpen(value => !value)}>
      <span>{open ? "Close" : "Menu"}</span>

    </Button>
    <nav id={navigationId} aria-label="Main navigation">
      <Link href="/" aria-current={section === "home" ? "page" : undefined} onClick={() => setOpen(false)}>Participate</Link>
      <Link href="/claims" aria-current={section === "claims" ? "page" : undefined} onClick={() => setOpen(false)}>Rewards</Link>
      <Link href="/affiliates" aria-current={section === "affiliates" ? "page" : undefined} onClick={() => setOpen(false)}>Affiliates</Link>
      <Link href="/docs" aria-current={section === "docs" ? "page" : undefined} onClick={() => setOpen(false)}>How It Works</Link>
    </nav>
  </div>;
}
