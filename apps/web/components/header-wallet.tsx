"use client";

import { Button, IconButton } from "@manekineko/ui/button";
import { Icon } from "@manekineko/ui/icons";
import { useWalletSession } from "@manekineko/protocol/use-wallet-session";
import { shortWallet } from "@manekineko/protocol/wallet";

export function HeaderWallet({ chainId }: { chainId: number | null }) {
  const wallet = useWalletSession();
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
    {wallet.notice && <p className="header-wallet-notice" role="status">{wallet.notice}</p>}
  </div>;
}
