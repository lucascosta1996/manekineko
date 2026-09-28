"use client";
import type { ReactNode } from "react";
import * as Dialog from "./dialog";
import { Icon } from "./icons";
import { IconButton, LinkButton, TextAction } from "./button";
import type { PublicLinks } from "./links";
export function PublicFooter({
  links,
  brand,
  legal,
  actions,
  year = new Date().getFullYear(),
}: {
  links: PublicLinks;
  brand?: ReactNode;
  legal?: ReactNode;
  actions?: ReactNode;
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
            <small>Awaiting URL</small>
          </span>
        )
      )}
    </nav>
  );
  return (
    <footer className="ui-footer">
      <div className="ui-footer-brand">
        {brand}
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
        <strong className="ui-footer-heading">Here to help</strong>
        <Dialog.Root>
          <Dialog.Trigger asChild>
            <TextAction icon={<Icon name="arrow" size="footer" />} iconPosition="end">Support</TextAction>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="ui-dialog-overlay" />
            <Dialog.Content className="ui-dialog-content">
              <Dialog.Title className="ui-dialog-title">Support — coming soon</Dialog.Title>
              <Dialog.Description className="ui-dialog-description">
                Support is not available yet. You can review the documentation
                while we prepare this service.
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
