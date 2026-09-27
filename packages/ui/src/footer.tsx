"use client";
import type { ReactNode } from "react";
import * as Dialog from "./dialog";
import { Icon } from "./icons";
import type { PublicLinks } from "./links";
export function PublicFooter({
  links,
  brand,
}: {
  links: PublicLinks;
  brand?: ReactNode;
}) {
  const group = (title: string, entries: [string, string | null][]) => (
    <nav aria-label={title}>
      <strong>{title}</strong>
      {entries.map(([label, url]) =>
        url ? (
          <a key={label} href={url}>
            {label}
            <Icon name="diagonal" />
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
        {brand ?? <strong>Tincta</strong>}
        <p>
          Rewards governed by
          <br />
          smart contracts.
        </p>
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
        <strong>Here to help</strong>
        <Dialog.Root>
          <Dialog.Trigger className="ui-button ui-button-secondary">
            Support
            <Icon name="arrow" />
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="ui-dialog-overlay" />
            <Dialog.Content className="ui-dialog-content">
              <Dialog.Title>Support — coming soon</Dialog.Title>
              <Dialog.Description>
                Support is not available yet. You can review the documentation
                while we prepare this service.
              </Dialog.Description>
              {links.docs && (
                <a className="ui-button" href={links.docs}>
                  Read documentation
                  <Icon name="arrow" />
                </a>
              )}
              <Dialog.Close
                className="ui-dialog-close"
                aria-label="Close support"
              >
                <Icon name="close" />
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <small>© {new Date().getFullYear()} Tincta</small>
      </div>
    </footer>
  );
}
