"use client";

import { useEffect, useRef, useState } from "react";
import { ConnectionController, ConnectionControllerUtil, ConnectorController } from "@reown/appkit-controllers";
import { Button, IconButton, LinkButton, TextAction } from "@manekineko/ui/button";
import * as Dialog from "@manekineko/ui/dialog";
import { Icon } from "@manekineko/ui/icons";
import { shortWallet, walletError } from "./wallet";
import type { webWalletKit } from "./web-wallet-kit";

import "./web-wallet-menu.css";

type WalletKit = Awaited<ReturnType<typeof webWalletKit>>;

/** First-party account management; Reown remains the connection/session authority. */
export function WebWalletMenu({ modal, open, onClose, origin, invalidate, synchronize, onSelected, openConnect, openNetworks }: {
  modal: WalletKit; open: boolean; onClose: () => void; origin: HTMLElement | null;
  invalidate: () => void; synchronize: () => Promise<void>;
  onSelected: (connectorId: string, address: string) => Promise<void>;
  openConnect: () => void; openNetworks: () => void;
}) {
  const [, refresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const handoff = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const update = () => refresh(value => value + 1);
    // The SDK's public subscription opens a warning when its multi-wallet
    // feature is disabled. Observe the existing session store in both modes.
    const stops = [ConnectionController.subscribe(update), modal.subscribeAccount(update, "eip155"), modal.subscribeNetwork(update), modal.subscribeRemoteFeatures(update), ConnectorController.subscribeKey("activeConnectorIds", update)];
    return () => { mounted.current = false; stops.forEach(stop => stop()); };
  }, [modal]);
  useEffect(() => { if (open) { setNotice(""); handoff.current = false; } }, [open]);
  const account = modal.getAccount("eip155");
  const chainId = Number(modal.getChainId());
  const multiWallet = Boolean(modal.getRemoteFeatures()?.multiWallet);
  const connections = ConnectionControllerUtil.getConnectionsData("eip155").connections;
  const activeConnector = ConnectorController.state.activeConnectorIds.eip155;
  const networkName = chainId === 1 ? "Ethereum" : chainId === 11155111 ? "Sepolia testnet" : "Unsupported network";

  async function act(action: () => Promise<unknown>, success?: string) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setNotice(""); invalidate();
    try {
      await action();
      if (mounted.current && success) setNotice(success);
      if (ConnectionControllerUtil.getConnectionsData("eip155").connections.length === 0) onClose();
    } catch (error) {
      if (mounted.current) setNotice(walletError(error));
    } finally {
      await synchronize();
      inFlight.current = false;
      if (mounted.current) { setBusy(false); refresh(value => value + 1); }
    }
  }
  function handOff(action: () => void) { handoff.current = true; onClose(); action(); }

  return <Dialog.Root open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="ui-dialog-overlay" />
      <Dialog.Content className="ui-dialog-content wallet-menu" onCloseAutoFocus={event => {
        event.preventDefault(); if (!handoff.current && origin?.isConnected) origin.focus();
      }}>
        <div className="wallet-menu-heading">
          <Dialog.Title className="ui-dialog-title">Wallets</Dialog.Title>
          <Dialog.Close asChild><IconButton variant="ghost" aria-label="Close wallets"><Icon name="close" /></IconButton></Dialog.Close>
        </div>
        <Dialog.Description className="ui-dialog-description">Choose the account you want to use. Switching wallets does not submit a transaction.</Dialog.Description>
        {account?.isConnected && <div className="wallet-menu-network"><span>{networkName}</span><TextAction disabled={busy} onClick={() => handOff(openNetworks)}>Change network</TextAction></div>}
        <div className="wallet-menu-list" aria-busy={busy}>
          {connections.map(connection => {
            const name = connection.name ?? modal.getConnectors().find(connector => connector.id === connection.connectorId)?.name ?? "Wallet";
            return <section className="wallet-menu-connection" key={connection.connectorId} aria-label={name}>
            <div className="wallet-menu-provider"><Icon name="wallet" /><strong>{name}</strong>
              <TextAction disabled={busy} onClick={() => void act(() => ConnectionController.disconnect({ namespace: "eip155", id: connection.connectorId }), "Wallet disconnected.")}>Disconnect</TextAction>
            </div>
            <ul className="wallet-menu-accounts">{connection.accounts.map(({ address }) => {
              const active = activeConnector === connection.connectorId && address.toLowerCase() === account?.address?.toLowerCase();
              return <li key={address}>
                <div className="wallet-menu-address"><span title={address} aria-label={address}>{shortWallet(address)}</span>{active && <span className="ui-badge">Active</span>}</div>
                <div className="wallet-menu-actions">
                  <IconButton variant="ghost" aria-label={`Copy address ${address}`} onClick={() => {
                    void navigator.clipboard.writeText(address).then(() => setNotice("Address copied."), () => setNotice("Could not copy the address. Open your wallet to copy it."));
                  }}><Icon name="copy" /></IconButton>
                  {active && [1, 11155111].includes(chainId) && <LinkButton className="ui-icon-button" variant="ghost" aria-label={`View address ${address} on explorer`} href={`https://${chainId === 11155111 ? "sepolia." : ""}etherscan.io/address/${address}`} target="_blank" rel="noreferrer"><Icon name="external" /></LinkButton>}
                  {!active && <Button variant="secondary" disabled={busy} onClick={() => void act(async () => {
                    await ConnectionController.switchConnection({ connection, address, namespace: "eip155", closeModalOnConnect: false });
                    if (modal.getAccount("eip155")?.address?.toLowerCase() !== address.toLowerCase() || ConnectorController.state.activeConnectorIds.eip155 !== connection.connectorId)
                      throw new Error("The wallet did not switch. Try again or choose the account in your wallet.");
                    await onSelected(connection.connectorId, address);
                  }, "Active wallet updated.")}>Switch</Button>}
                </div>
              </li>;
            })}</ul>
          </section>; })}
          {connections.length === 0 && <p>No wallets connected.</p>}
        </div>
        <div className="wallet-menu-footer">
          <Button variant="secondary" disabled={busy} icon={<Icon name="plus" />} onClick={() => handOff(openConnect)}>{multiWallet ? "Connect another wallet" : "Change wallet"}</Button>
          {connections.length > 1 && <TextAction disabled={busy} onClick={() => void act(async () => {
            // AppKit's namespace disconnect removes only the active connector.
            for (const { connectorId } of connections)
              await ConnectionController.disconnect({ namespace: "eip155", id: connectorId });
          }, "All wallets disconnected.")}>Disconnect all</TextAction>}
        </div>
        <p className="wallet-menu-notice" role="status">{busy ? "Updating wallet…" : notice}</p>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
