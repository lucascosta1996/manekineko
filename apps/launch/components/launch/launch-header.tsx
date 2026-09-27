"use client";
import { useEffect, useState } from "react";
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
  beforeNavigate?: () => boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 961px)");
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
        onClick={(event) => {
          if (beforeNavigate && !beforeNavigate()) event.preventDefault();
        }}
        aria-label="Tincta dashboard"
      >
        <LaunchBrand />
        <span>Launch</span>
      </a>
      <nav className="dashboard-nav" aria-label="Launch workspace">
        {pages.map((page) => (
          <a
            key={page.path}
            href={launchDestination(page.path, chainId)}
            aria-current={active === page.active ? "page" : undefined}
            onClick={(event) => {
              if (beforeNavigate && !beforeNavigate()) {
                event.preventDefault();
                return;
              }
              setOpen(false);
            }}
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
            onClick={(event) => {
              if (beforeNavigate && !beforeNavigate()) event.preventDefault();
              else setOpen(false);
            }}
          >
            Deployed collections
          </a>
          <a
            href={launchDestination("/upcoming-collection", chainId)}
            aria-current={active === "upcoming" ? "page" : undefined}
            onClick={(event) => {
              if (beforeNavigate && !beforeNavigate()) event.preventDefault();
              else setOpen(false);
            }}
          >
            Upcoming collections
          </a>
        </div>
      </nav>
      <div className="dashboard-account">
        <span title={username}>{username}</span>
        <button type="button" onClick={onLogout} disabled={pending}>
          <Icon name="logout" />
          Sign out
        </button>
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
          <Dialog.Trigger
            className="dashboard-menu"
            aria-label="Open navigation"
          >
            <Icon name="menu" />
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
              <Dialog.Close
                className="ui-dialog-close"
                aria-label="Close navigation"
              >
                <Icon name="close" />
              </Dialog.Close>
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
