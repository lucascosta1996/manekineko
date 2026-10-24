"use client";

import { Button } from "@manekineko/ui/button";
import { Icon } from "@manekineko/ui/icons";
import { useWalletSession } from "@manekineko/protocol/use-wallet-session";
import { shortWallet } from "@manekineko/protocol/wallet";

export function HeaderWallet({ chainId }: { chainId: number | null }) {
  const wallet = useWalletSession();
  if (!wallet.managed) return null;
  const account = wallet.account;
  const network = account?.chainId ?? chainId;
  const networkName = network === 1 ? "Ethereum" : network === 11155111 ? "Sepolia testnet" : account ? "Unsupported network" : "";
  const mismatch = !!account && (![1, 11155111].includes(account.chainId) || (chainId !== null && account.chainId !== chainId));
  return <div className="header-wallet">
    <Button variant={account ? "secondary" : "primary"} icon={<Icon name="wallet" />} busy={wallet.connecting} busyLabel="Opening wallet…"
      aria-haspopup="dialog" aria-label={account ? `Manage wallet ${account.address} on ${networkName}` : "Connect wallet"}
      onClick={wallet.openAccount} title={account?.address}>
      <span className="header-wallet-label">
        <span>{account ? shortWallet(account.address) : "Connect wallet"}</span>
        {account && <span className="header-wallet-network">{networkName}</span>}
      </span>
    </Button>
    {mismatch && <Button variant="ghost" onClick={() => wallet.switchNetwork(chainId ?? 1)}>Switch network</Button>}
    {wallet.notice && <p className="header-wallet-notice" role="status">{wallet.notice}</p>}
  </div>;
}
