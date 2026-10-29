"use client";

import { useEffect, useState } from "react";
import { Button, IconButton } from "@manekineko/ui/button";
import { FloatingNotice } from "@manekineko/ui/floating-notice";
import { Icon } from "@manekineko/ui/icons";
import { useWalletSession } from "@manekineko/protocol/use-wallet-session";
import { shortWallet } from "@manekineko/protocol/wallet";

export function HeaderWallet({ chainId }: { chainId: number | null }) {
  const wallet = useWalletSession();
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => setDismissed(false), [wallet.notice]);
  if (!wallet.managed) return null;
  const account = wallet.account;
  const mismatch = !!account && (![1, 11155111].includes(account.chainId) || (chainId !== null && account.chainId !== chainId));
  const label = account ? `Manage wallet ${account.address}` : "Connect wallet";
  return <div className="header-wallet">
    <Button className="header-wallet-wide" variant="secondary" icon={<Icon name="wallet" />} busy={wallet.connecting} busyLabel="Opening wallet…"
      aria-haspopup="dialog" aria-label={label}
      onClick={wallet.openAccount} title={account?.address}>
      {account ? shortWallet(account.address) : "Connect wallet"}
    </Button>
    <IconButton className="header-wallet-small" variant="secondary" aria-label={label} busy={wallet.connecting} aria-haspopup="dialog" onClick={wallet.openAccount}><Icon name="wallet" /></IconButton>
    {mismatch && <Button className="header-wallet-mismatch" variant="ghost" onClick={() => wallet.switchNetwork(chainId ?? 1)}>Switch network</Button>}
    {wallet.notice && !dismissed && <FloatingNotice title="Check your wallet" detail={wallet.notice}
      label="Wallet updates" dismissLabel="Dismiss wallet notification" onDismiss={() => setDismissed(true)}>
      <Button variant="secondary" onClick={wallet.openAccount}>Review wallet</Button>
    </FloatingNotice>}
  </div>;
}
