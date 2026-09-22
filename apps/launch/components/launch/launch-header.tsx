"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LaunchBrand } from "./brand";

export function LaunchHeader({
  username,
  active,
  onLogout,
  pending = false,
}: {
  username: string;
  active: "configurations" | "seasons";
  onLogout: () => void;
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const navigation = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 761px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !navigation.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return (
    <header className="launch-header launch-header-with-nav">
      <a href="/seasons" aria-label="Tincta launch workspace">
        <LaunchBrand />
      </a>
      <span className="launch-workspace-label">Launch</span>
      <div
        className="launch-navigation"
        data-open={open}
        ref={navigation}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            setOpen(false);
            toggle.current?.focus();
          }
        }}
      >
        <button
          type="button"
          className="launch-mobile-menu-toggle"
          ref={toggle}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((value) => !value)}
        >
          <span>{open ? "Close" : "Menu"}</span>
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            {open ? (
              <path d="m5 5 10 10M5 15 15 5" />
            ) : (
              <path d="M3 6h14M3 10h14M3 14h14" />
            )}
          </svg>
        </button>
        <div className="launch-navigation-content" id={menuId}>
          <nav className="launch-primary-nav" aria-label="Launch workspace">
            <a
              href="/seasons"
              aria-current={active === "seasons" ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              Seasons
            </a>
            <a
              href="/launch"
              aria-current={active === "configurations" ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              Collections
            </a>
          </nav>
          <div className="launch-account">
            <span className="launch-account-avatar" aria-hidden="true">
              {username.charAt(0).toUpperCase()}
            </span>
            <span>{username}</span>
            <button type="button" onClick={onLogout} disabled={pending}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
