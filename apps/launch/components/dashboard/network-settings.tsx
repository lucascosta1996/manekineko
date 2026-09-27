"use client";
import { useRef, useState } from "react";
import { LaunchHeader } from "../launch/launch-header";
import { useLaunchNetwork } from "../launch/use-launch-network";
import { NetworkSocialPanel } from "../automations/network-social-panel";
import type { LaunchChainId } from "../../lib/chain-policy";
export function NetworkSettings({
  username,
  initialChainId,
  allowedChainId,
}: {
  username: string;
  initialChainId: LaunchChainId;
  allowedChainId: LaunchChainId | null;
}) {
  const [chainId, setChainId] = useLaunchNetwork(initialChainId),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState("");
  const leaveApproved = useRef(false);
  const [pending, setPending] = useState(false);
  const canLeave = () =>
    !pending && (!dirty || window.confirm("Discard unsaved network settings?"));
  const approveNavigation = () => {
    const accepted = canLeave();
    leaveApproved.current = accepted;
    return accepted;
  };
  async function logout() {
    if (!approveNavigation()) return;
    try {
      const response = await fetch("/api/launch/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw Error();
      window.location.replace("/login");
    } catch {
      leaveApproved.current = false;
      setError("Sign out failed. Please retry.");
    }
  }
  return (
    <div className="launch-shell">
      <LaunchHeader
        username={username}
        active="settings"
        chainId={chainId}
        onNetworkChange={(next) => {
          if (next !== chainId && canLeave()) {
            setDirty(false);
            setChainId(next);
          }
        }}
        onLogout={() => void logout()}
        beforeNavigate={approveNavigation}
        pending={pending}
      />
      <main id="launch-main">
        <section className="launch-hero">
          <div>
            <span className="launch-eyebrow">NETWORK SETTINGS</span>
            <h1>{chainId === "1" ? "Ethereum Mainnet" : "Sepolia testnet"}</h1>
            <p>
              Separate identities, publishing credentials and execution
              readiness for each network.
            </p>
          </div>
        </section>
        {error && <p role="alert">{error}</p>}
        <NetworkSocialPanel
          key={chainId}
          chainId={chainId}
          allowedChainId={allowedChainId}
          onSaved={() => setDirty(false)}
          onDirtyChange={setDirty}
          onPendingChange={setPending}
          leaveApproved={leaveApproved}
        />
      </main>
    </div>
  );
}
