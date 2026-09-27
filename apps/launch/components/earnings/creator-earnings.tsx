"use client";
import { Icon } from "@manekineko/ui/icons";

import { useEffect, useRef, useState } from "react";
import { useLaunchNetwork } from "../launch/use-launch-network";
import { currentLaunchResponse, launchDestination } from "../../lib/launch-navigation";
import { LaunchHeader } from "../launch/launch-header";
import { fromScaled } from "../launch/form-values";
import type { LaunchChainId } from "../../lib/chain-policy";
import type { EarningsReport } from "../../lib/creator-earnings";

const eth = (wei: string) => fromScaled(wei, 18);
export function CreatorEarnings({ username, initialChainId }: { username: string; initialChainId: LaunchChainId }) {
  const [chainId, setChainId] = useLaunchNetwork(initialChainId);
  const [report, setReport] = useState<EarningsReport | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [search, setSearch] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const requestId = useRef(0);
  useEffect(() => {
    const controller = new AbortController(), id = ++requestId.current;
    setLoading(true); setError("");
    void (async () => {
      try {
        const response = await fetch(`/api/launch/earnings?chainId=${chainId}`, { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { window.location.replace(`/login?next=${encodeURIComponent(launchDestination("/earnings", chainId))}`); return; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Earnings could not be loaded. Refresh to retry.");
        if (currentLaunchResponse(data.chainId, chainId, id, requestId.current)) setReport(data);
        else if (id === requestId.current) throw new Error("The earnings response belongs to a different network. Refresh to retry.");
      } catch (cause) {
        if (!controller.signal.aborted && id === requestId.current) setError(cause instanceof Error ? cause.message : "Earnings could not be loaded.");
      } finally { if (!controller.signal.aborted && id === requestId.current) setLoading(false); }
    })();
    return () => controller.abort();
  }, [chainId, refresh]);
  useEffect(() => {
    const refreshVisible = () => { if (document.visibilityState === "visible") setRefresh(value => value + 1); };
    const timer = window.setInterval(refreshVisible, 60_000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refreshVisible); };
  }, []);
  async function logout() {
    setSigningOut(true);
    try {
      const response = await fetch("/api/launch/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error("Sign-out could not be completed.");
      window.location.replace("/login");
    } catch { setError("Sign-out could not be completed. Please try again."); setSigningOut(false); }
  }
  const current = report?.chainId === chainId ? report : null;
  const explorer = chainId === "1" ? "https://etherscan.io" : "https://sepolia.etherscan.io";
  const unavailable = current ? current.rows.length - current.totals.verifiedCollections : 0;
  const query = search.trim().toLowerCase();
  const rows = current?.rows.filter(row => (!availableOnly || (row.balance && (BigInt(row.balance.withdrawableWei) > 0n || BigInt(row.balance.growthAvailableWei) > 0n))) && `${row.name} ${row.seasonName ?? ""} ${row.address} ${row.balance?.owner ?? ""}`.toLowerCase().includes(query)) ?? [];
  const totalsKnown = current && (!current.rows.length || current.totals.verifiedCollections > 0);
  return <div className="launch-shell earnings-shell">
    <a className="launch-skip" href="#launch-main">Skip to workspace</a>
    <LaunchHeader username={username} active="earnings" onLogout={() => void logout()} pending={signingOut} chainId={chainId} onNetworkChange={setChainId} />
    <main id="launch-main">
      <section className="launch-hero"><div><span className="launch-eyebrow">TINCTA / TREASURY</span><h1>Creator earnings.</h1><p>See where ETH is available to collect across your deployed collections.</p></div><button className="launch-button launch-button-secondary" disabled={loading} onClick={() => setRefresh(value => value + 1)}>{loading ? "Checking balances…" : "Refresh balances"}</button></section>
      <p className="earnings-network-note">{chainId === "11155111" ? "Sepolia test ETH only. These balances have no Mainnet value." : "Ethereum Mainnet · ETH balances."} No private keys are requested or stored. Collection happens separately through the owner wallet.</p>
      {(error || current?.error) && <div className="launch-alert launch-alert-error" role="alert">{error || current?.error}</div>}
      <section className="earnings-totals" aria-label="Earnings totals" aria-busy={loading}>
        <div><span>Creator proceeds available{unavailable ? " · partial" : ""}</span><strong>{totalsKnown ? eth(current!.totals.withdrawableWei) : "—"} <small>ETH</small></strong><p>Currently withdrawable from collection contracts.</p></div>
        <div><span>Unallocated affiliate funds{unavailable ? " · partial" : ""}</span><strong>{totalsKnown ? eth(current!.totals.growthAvailableWei) : "—"} <small>ETH</small></strong><p>Growth reserve. The owner can withdraw it separately after reveal.</p></div>
        <div><span>Collections with creator proceeds</span><strong>{totalsKnown ? current!.totals.availableCollections : "—"}</strong><p>{current ? `${current.totals.verifiedCollections} of ${current.rows.length} deployments checked.` : "Reading registered deployments."}</p></div>
      </section>
      {current?.blockTime && <p className="earnings-snapshot">{error ? "Last successful" : "Canonical"} {chainId === "1" ? "Mainnet" : "Sepolia"} snapshot: {new Date(current.blockTime).toISOString().replace("T", " ").replace(".000Z", " UTC")} · block <a href={`${explorer}/block/${current.blockHash ?? current.blockNumber}`} target="_blank" rel="noreferrer">{current.blockNumber}</a>. Refresh before collecting.</p>}
      {error && current && <p className="launch-alert launch-alert-error" role="status">Showing the last successful observation. Balances may have changed; retry before collecting.</p>}
      {!!unavailable && <p className="launch-alert launch-alert-error" role="status">{unavailable} collection{unavailable === 1 ? " is" : "s are"} unavailable and excluded from totals. Unavailable balances are never counted as zero.</p>}
      <div className="earnings-filters"><label className="launch-field"><span>Find a collection or wallet</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, season or address" /></label><label className="launch-checkbox"><input type="checkbox" checked={availableOnly} onChange={event => setAvailableOnly(event.target.checked)} /><span>Available ETH only</span></label></div>
      {loading ? <p className="earnings-empty" role="status">Reading live collection balances…</p> : current && !current.rows.length ? <div className="earnings-empty"><h2>No registered deployments on this network.</h2><p>Only catalog-registered deployments appear here. A known deployed address missing from this list requires catalog reconciliation; an empty catalog does not prove that no contracts or funds exist.</p></div> : current && !rows.length ? <p className="earnings-empty">No collections match these filters.</p> : <div className="earnings-list">{rows.map(row => <article className="earnings-card" key={row.id}>
        <div className="earnings-card-heading"><div><span className="launch-eyebrow">{row.seasonName || "COLLECTION"} · {row.version}</span><h2>{row.name}</h2></div><span className="launch-status">{!row.balance ? "Unavailable" : BigInt(row.balance.withdrawableWei) > 0n ? "Creator proceeds available" : BigInt(row.balance.growthAvailableWei) > 0n ? "Unallocated affiliate funds" : "Nothing available"}</span></div>
        <div className="earnings-card-balances"><div><span>Creator proceeds</span><strong>{row.balance ? eth(row.balance.withdrawableWei) : "—"} ETH</strong></div><div><span>Unallocated affiliate funds</span><strong>{row.balance ? eth(row.balance.growthAvailableWei) : "—"} ETH</strong></div><div><span>Gross mint revenue</span><strong>{row.balance ? eth(row.balance.mintRevenueWei) : "—"} ETH</strong></div></div>
        {row.balance?.accounting && <dl className="earnings-addresses">
          <dt>Ordinary proceeds previously withdrawn</dt><dd>{row.balance.withdrawals.ordinaryWithdrawnWei === null ? "History unavailable" : `${eth(row.balance.withdrawals.ordinaryWithdrawnWei)} ETH`}</dd>
          <dt>Total operator funds available</dt><dd>{eth(row.balance.accounting.operatorAvailableWei)} ETH</dd>
          <dt>Contract balance</dt><dd>{eth(row.balance.accounting.balanceWei)} ETH</dd>
          <dt>Unpaid prizes</dt><dd>{eth(row.balance.accounting.unpaidPrizesWei)} ETH</dd>
          <dt>Unpaid affiliate entitlements</dt><dd>{eth(row.balance.accounting.unpaidAffiliatesWei)} ETH</dd>
          <dt>Refund liabilities</dt><dd>{eth(row.balance.accounting.refundLiabilityWei)} ETH</dd>
          <dt>Other funds locked before settlement</dt><dd>{eth(row.balance.accounting.lockedWei)} ETH</dd>
          <dt>Growth reserve previously withdrawn</dt><dd>{eth(row.balance.accounting.growthWithdrawnWei)} ETH</dd>
        </dl>}
        {row.balance?.withdrawals.historyError && <p className="earnings-owner-note">{row.balance.withdrawals.historyError}</p>}
        <dl className="earnings-addresses"><dt>ETH held in</dt><dd><a href={`${explorer}/address/${row.address}`} target="_blank" rel="noreferrer">{row.address} <Icon name="diagonal" /></a></dd><dt>Current owner</dt><dd>{row.balance ? <><a href={`${explorer}/address/${row.balance.owner}`} target="_blank" rel="noreferrer">{row.balance.owner} <Icon name="diagonal" /></a>{row.balance.ownerIsContract && <span className="earnings-owner-note">Contract owner — use its authorized execution flow.</span>}</> : "Could not verify"}</dd></dl>
        {row.error ? <p className="earnings-row-error">{row.error}</p> : <details className="earnings-help"><summary>Collection details<Icon name="chevron" className="ui-disclosure-icon" /></summary><p>The current owner can collect creator proceeds with <code>withdraw(recipient, amount)</code>. Available ETH may include surplus funding; gross mint revenue includes prize and affiliate allocations and is not creator profit.</p>{row.balance?.growthReserveWei !== "0" && <p>Growth reserve held: {eth(row.balance!.growthReserveWei)} ETH. It becomes available after reveal through <code>withdrawGrowthReserve(recipient, amount)</code>.</p>}<p>Prizes, affiliate claims and refund liabilities are protected by the contract. Sponsorship and unused VRF funding are separate and are not included here. Current balances exclude funds already withdrawn. Ordinary withdrawal history comes from confirmed Withdrawn events when available; growth withdrawals come from contract state.</p><a className="launch-inline-link" href={`${explorer}/address/${row.address}#readContract`} target="_blank" rel="noreferrer">Inspect contract on explorer <Icon name="diagonal" /></a></details>}
      </article>)}</div>}
    </main><footer className="launch-page-footer"><span>Tincta · Private launch workspace</span><span>Live reads only · No wallet connection or transaction signing</span></footer>
  </div>;
}
