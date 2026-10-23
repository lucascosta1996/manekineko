"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconButton, LinkButton } from "@manekineko/ui/button";
import { Icon } from "@manekineko/ui/icons";

type NavigationLink = { label: string; href: string; mobileOnly?: boolean };

export function LandingNavigation({
  links,
  action,
}: {
  links: NavigationLink[];
  action?: NavigationLink;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const navigation = useRef<HTMLElement>(null);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 960px)");
    const closeOnDesktop = () => {
      if (!desktop.matches) return;
      const active = document.activeElement;
      // Some browsers clear focus as soon as the mobile controls become hidden,
      // before the media-query change event reaches this listener.
      if (active === button.current || (active && navigation.current?.contains(active)) || (open && active === document.body)) {
        button.current?.closest("header")?.querySelector<HTMLAnchorElement>("a")?.focus();
      }
      setOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <>
      <nav className="desktop-nav" aria-label="Main navigation">
        {links.filter(link => !link.mobileOnly).map(link => (
          <a key={link.href} href={link.href}>{link.label}</a>
        ))}
      </nav>
      {action && (
        <LinkButton className="header-cta" href={action.href}>
          {action.label}<Icon name="diagonal" />
        </LinkButton>
      )}
      <IconButton
        ref={button}
        className="menu-toggle"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(value => !value)}
      >
        <Icon name={open ? "close" : "menu"} />
      </IconButton>
      <nav
        ref={navigation}
        id={menuId}
        className="mobile-nav"
        aria-label="Mobile navigation"
        hidden={!open}
      >
        <ul>
          {links.map(link => (
            <li key={link.href}>
              <a href={link.href} onClick={() => setOpen(false)}>
                {link.label}<Icon name="arrow" />
              </a>
            </li>
          ))}
        </ul>
        {action && (
          <a className="mobile-nav-action" href={action.href} onClick={() => setOpen(false)}>
            {action.label}<Icon name="diagonal" />
          </a>
        )}
      </nav>
    </>
  );
}
