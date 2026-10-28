"use client";
import type { ReactNode } from "react";
import * as Dialog from "./dialog";
import { Icon } from "./icons";
import { IconButton, LinkButton, TextAction } from "./button";
import type { PublicLinks } from "./links";
export function FooterBrand({ href = "https://tincta.xyz" }: { href?: string }) {
  return <a className="ui-footer-home" href={href} aria-label="Tincta home"><img className="ui-footer-mark" src="/tincta-mark.svg" width="28" height="28" alt="" data-tincta-logo="mark" /></a>;
}

export function PublicFooter({
  links,
  legal,
  actions,
  density = "default",
  year = new Date().getFullYear(),
}: {
  links: PublicLinks;
  legal?: ReactNode;
  actions?: ReactNode;
  density?: "default" | "compact";
  year?: number;
}) {
  const group = (title: string, entries: [string, string | null][]) => (
    <nav aria-label={title}>
      <strong className="ui-footer-heading">{title}</strong>
      {entries.map(([label, url]) =>
        url ? (
          <a className="ui-footer-link" key={label} href={url}>
            {label}
            <Icon name="diagonal" size="footer" />
          </a>
        ) : (
          <span className="ui-footer-unavailable" key={label}>
            {label}
            <small>Unavailable</small>
          </span>
        )
      )}
    </nav>
  );
  return (
    <footer className={`ui-footer${density === "compact" ? " ui-footer-compact" : ""}`}>
      <div className="ui-footer-brand">
        <FooterBrand href={links.website ?? undefined} />
        <p className="ui-footer-copy">Rewards governed by smart contracts.</p>
      </div>
      {group("Explore", [
        ["Website", links.website],
        ["Web app", links.app],
        ["Documentation", links.docs],
      ])}
      {group("Connect", [
        ["Contact", links.contact],
        ["Telegram", links.telegram],
        ["X", links.social],
      ])}
      <div className="ui-footer-support">
        <strong className="ui-footer-heading">Help</strong>
        <Dialog.Root>
          <Dialog.Trigger asChild>
            <TextAction icon={<Icon name="arrow" size="footer" />} iconPosition="end">Support</TextAction>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="ui-dialog-overlay" />
            <Dialog.Content className="ui-dialog-content">
              <Dialog.Title className="ui-dialog-title">Support unavailable</Dialog.Title>
              <Dialog.Description className="ui-dialog-description">
                Support is not available yet. The guides explain voting, minting, rewards and refunds.
              </Dialog.Description>
              {links.docs && (
                <LinkButton href={links.docs} icon={<Icon name="arrow" />} iconPosition="end">Read documentation</LinkButton>
              )}
              <Dialog.Close asChild>
                <IconButton className="ui-dialog-close" aria-label="Close support"><Icon name="close" /></IconButton>
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
      <div className="ui-footer-legal">
        <span>© {year} Tincta</span>
        {legal && <p>{legal}</p>}
        {actions && <div className="ui-footer-actions">{actions}</div>}
      </div>
    </footer>
  );
}
