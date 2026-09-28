"use client";
import { IconButton, TextAction } from "@manekineko/ui/button";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { LaunchBrand } from "./brand";
import { launchDestination } from "../../lib/launch-navigation";
import type { LaunchChainId } from "../../lib/chain-policy";
import { Icon, type IconName } from "@manekineko/ui/icons";
import { CompactSelect } from "@manekineko/ui/select";
import * as Dialog from "@manekineko/ui/dialog";
const pages: { path: string; label: string; active: string; icon: IconName }[] =
  [
    {
      path: "/dashboard",
      label: "Dashboard",
      active: "dashboard",
      icon: "dashboard",
    },
    { path: "/seasons", label: "Seasons", active: "seasons", icon: "layers" },
    {
      path: "/launch",
      label: "Collections",
      active: "configurations",
      icon: "ticket",
    },
    {
      path: "/activity",
      label: "Activity",
      active: "activity",
      icon: "activity",
    },
    {
      path: "/earnings",
      label: "Creator earnings",
      active: "earnings",
      icon: "wallet",
    },
    {
      path: "/settings",
      label: "Network settings",
      active: "settings",
      icon: "settings",
    },
  ];
export function LaunchHeader({
  username,
  active,
  onLogout,
  pending = false,
  chainId,
  onNetworkChange,
  beforeNavigate,
}: {
  username: string;
  active:
    | "configurations"
    | "seasons"
    | "earnings"
    | "active"
    | "upcoming"
    | "dashboard"
    | "activity"
    | "settings";
  onLogout: () => void;
  pending?: boolean;
  chainId: LaunchChainId;
  onNetworkChange: (chainId: LaunchChainId) => void;
  beforeNavigate?: () => boolean | Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const navigationPending = useRef(false);
  async function navigate(event: MouseEvent<HTMLAnchorElement>) {
    if (!beforeNavigate) { setOpen(false); return; }
    event.preventDefault();
    if (navigationPending.current || pending) return;
    const destination = event.currentTarget.href;
    navigationPending.current = true;
    try {
      if (!await beforeNavigate()) return;
      setOpen(false);
      window.location.assign(destination);
    } finally { navigationPending.current = false; }
  }
  useEffect(() => {
    const media = window.matchMedia("(min-width: 960px)");
    const close = () => {
      if (media.matches) setOpen(false);
    };
    media.addEventListener("change", close);
    return () => media.removeEventListener("change", close);
  }, []);
  const nav = () => (
    <>
      <a
        className="dashboard-brand"
        href={launchDestination("/dashboard", chainId)}
        onClick={navigate}
        aria-label="Tincta home"
      >
        <LaunchBrand decorative />
        <span>Launch</span>
      </a>
      <nav className="dashboard-nav" aria-label="Launch workspace">
        {pages.map((page) => (
          <a
            key={page.path}
            href={launchDestination(page.path, chainId)}
            aria-current={active === page.active ? "page" : undefined}
            onClick={navigate}
          >
            <Icon name={page.icon} />
            {page.label}
          </a>
        ))}
        <div className="dashboard-nav-secondary">
          <span>Collection views</span>
          <a
            href={launchDestination("/active-collection", chainId)}
            aria-current={active === "active" ? "page" : undefined}
            onClick={navigate}
          >
            Deployed collections
          </a>
          <a
            href={launchDestination("/upcoming-collection", chainId)}
            aria-current={active === "upcoming" ? "page" : undefined}
            onClick={navigate}
          >
            Upcoming collections
          </a>
        </div>
      </nav>
      <div className="dashboard-account">
        <span title={username}>{username}</span>
        <TextAction icon={<Icon name="logout" />} iconPosition="start" type="button" onClick={onLogout} disabled={pending}>

          Sign out
        </TextAction>
      </div>
    </>
  );
  return (
    <>
      <aside className="dashboard-sidebar">{nav()}</aside>
      <header className="dashboard-topbar">
        <a className="launch-skip" href="#launch-main">
          Skip to workspace
        </a>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <IconButton className="dashboard-menu" variant="secondary" aria-label="Open navigation"><Icon name="menu" /></IconButton>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="ui-dialog-overlay" />
            <Dialog.Content className="dashboard-drawer">
              <Dialog.Title className="dashboard-sr-only">
                Launch navigation
              </Dialog.Title>
              <Dialog.Description className="dashboard-sr-only">
                Choose a workspace page. The selected network is retained.
              </Dialog.Description>
              <Dialog.Close asChild><IconButton className="dashboard-drawer-close" variant="ghost" aria-label="Close navigation"><Icon name="close" /></IconButton></Dialog.Close>
              {nav()}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <span className="dashboard-page-label">
          {pages.find((page) => page.active === active)?.label ??
            (active === "active"
              ? "Deployed collections"
              : "Upcoming collections")}
        </span>
        <div className="dashboard-network">
          <CompactSelect
            aria-label="Workspace network"
            value={chainId}
            disabled={pending}
            onChange={(event) =>
              onNetworkChange(event.target.value as LaunchChainId)
            }
          >
            <option value="1">Ethereum Mainnet</option>
            <option value="11155111">Sepolia testnet</option>
          </CompactSelect>
        </div>
      </header>
    </>
  );
}
