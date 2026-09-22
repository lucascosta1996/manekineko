"use client";

import { useEffect, useRef, useState } from "react";
import { checkTransaction, readTransaction, recoverTransaction, submitTransaction, walletError, type TransactionJournal, type WalletSession } from "../../lib/affiliates/wallet";
import { prepareCreditRedemption, prepareCreditSourceRegistration } from "../../lib/winner-credits/wallet";
import { winnerCreditKey, creditAwardRank } from "../../lib/winner-credits/model";
import type { WinnerCredit, WinnerCreditResponse } from "../../lib/winner-credits/model";
import { formatWei } from "../../lib/mint/format";
import { useWinnerCredits } from "./use-winner-credits";
import { LifetimeRedemptions } from "./lifetime-redemptions";

export function WinnerCreditMint({ collectionId, wallet, onMinted }: { collectionId: string; wallet: WalletSession | null; onMinted: () => void }) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [journal, setJournal] = useState<TransactionJournal | null>(null);
  const [recovery, setRecovery] = useState("");
  const inFlight = useRef(false);
  const { data, error, refresh } = useWinnerCredits(wallet?.address ?? null, collectionId, page);
  const network = data?.networks.find((network) => network.chainId === wallet?.chainId);
  const target = network?.registryAddress ? { chainId: network.chainId, contractAddress: network.registryAddress } : null;
  const eligible = data?.credits.filter((credit) => credit.available) ?? [];
  const credit = eligible.find((credit) => winnerCreditKey(credit) === selected) ?? eligible[0];
  useEffect(() => { setPage(1); setSelected(""); setRecovery(""); }, [wallet?.address]);
  useEffect(() => {
    setJournal(null); setMessage("");
    if (!target) return;
    try { setJournal(readTransaction(target, "mint")); }
    catch (cause) { setMessage(walletError(cause)); }
  }, [target?.chainId, target?.contractAddress, wallet?.address]);
  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage("");
    try { await action(); } catch (cause) { setMessage(walletError(cause)); }
    finally {
      if (target) { try { setJournal(readTransaction(target, "mint")); } catch (cause) { setMessage(walletError(cause)); } }
      inFlight.current = false; setBusy(false);
    }
  }
  async function redeem() {
    if (!wallet || !credit || !data || journal || error) return;
    await run(async () => {
      // Reload at the user action boundary; a background snapshot is not spending authority.
      const response = await fetch(`/api/winner-credits?${new URLSearchParams({ wallet: wallet.address, collectionId, page: String(page) })}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error("The credit could not be rechecked. Nothing was sent.");
      const current = await response.json() as WinnerCreditResponse;
      const source = current.credits.find((item) => winnerCreditKey(item) === winnerCreditKey(credit));
      if (!source) throw new Error("This credit is no longer available.");
      const prepared = await prepareCreditRedemption(wallet, current, source);
      await submitTransaction(wallet, prepared.target, "mint", prepared.request, setJournal);
      setJournal(null); setMessage("Your lifetime sponsored ticket was minted. This wallet cannot receive another winner reward."); refresh(); onMinted();
    });
  }
  async function registerSource(source: WinnerCredit) {
    if (!wallet || !data || journal || error) return;
    await run(async () => {
      const response = await fetch(`/api/winner-credits?${new URLSearchParams({ wallet: wallet.address, collectionId, page: String(page) })}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error("The winner credit could not be rechecked. Nothing was sent.");
      const current = await response.json() as WinnerCreditResponse;
      const verified = current.credits.find((item) => winnerCreditKey(item) === winnerCreditKey(source));
      if (!verified) throw new Error("This credit source is not available.");
      const prepared = await prepareCreditSourceRegistration(wallet, current, verified);
      await submitTransaction(wallet, prepared.target, "mint", prepared.request, setJournal);
      setJournal(null); setMessage("The winning collection is registered. Your qualifying win can now be checked for your lifetime reward."); refresh();
    });
  }
  async function reconcile() {
    if (!wallet || !target || !journal) return;
    await run(async () => {
      const state = recovery.trim() ? await recoverTransaction(wallet, target, journal, recovery.trim(), setJournal) : await checkTransaction(wallet, target, journal);
      if (state === "confirmed" || state === "reverted") { setJournal(null); setRecovery(""); refresh(); onMinted(); }
      setMessage(state === "confirmed" ? "The transaction is confirmed. Credit and ticket data are refreshing." : state === "reverted" ? "The transaction reverted. The lifetime reward was not consumed by this transaction." : state === "pending" ? "This transaction is still pending. Another redemption stays blocked." : "Paste the transaction hash from your wallet activity to verify the original submission.");
    });
  }
  return <section className="winner-credits" aria-label="Redeem your lifetime winner reward">
    <p className="eyebrow">FOR PAST COLLECTION WINNERS</p><h2>Your one winner reward.</h2>
    <p>Use a qualifying past win for your wallet’s one lifetime sponsored ticket. Additional wins do not add rewards. The operator pays the mint price; your wallet pays only network gas.</p>
    {!wallet ? <p>Connect your wallet above to check your lifetime reward.</p> : <>
      {error && <p role="alert">{error} <button type="button" className="text-button" onClick={refresh}>Try again</button></p>}
      {!data && !error && <p role="status">Checking your lifetime winner reward…</p>}
      {data && !network?.configured && <p>Winner rewards are not enabled on this network yet.</p>}
      {data && network?.configured && <>
        <LifetimeRedemptions networks={data.networks} />
        {data.target && !data.target.ready && <p className="winner-credit-notice">{data.target.reason}</p>}
        {eligible.length > 0 ? <><label className="winner-credit-select">Choose the qualifying win to use<select value={credit ? winnerCreditKey(credit) : ""} onChange={(event) => setSelected(event.target.value)} disabled={busy || !!journal}>{eligible.map((item) => <option key={winnerCreditKey(item)} value={winnerCreditKey(item)}>{item.name} · Prize {creditAwardRank(item)} · Ticket #{item.tokenId}</option>)}</select></label><p><strong>0 ETH mint payment</strong>{data.target && <> · {formatWei(BigInt(data.target.mintPriceWei))} ETH sponsored</>} · Gas additional.</p><button type="button" className="primary-button mint-button" disabled={busy || !!journal || !!error || !data.target?.ready} onClick={() => void redeem()}>{busy ? "Check your wallet…" : "Claim my one sponsored ticket"} <span aria-hidden="true">↗</span></button></> : <p>{data.total === 0 ? "No completed collection wins are recorded for this wallet yet." : "No qualifying win on this page can be used for this collection."}</p>}
        {data.credits.length > 0 && <ul className="winner-credit-list">{data.credits.map((item) => <li key={winnerCreditKey(item)}><div><span>{item.name} · Prize {creditAwardRank(item)} · Ticket #{item.tokenId}</span></div><div><strong>{item.used ? "Reward redeemed" : item.available ? "Qualifying win" : "Unavailable here"}</strong>{item.reason && <span>{item.reason}</span>}{item.canRegisterSource && <button type="button" className="text-button" disabled={busy || !!journal || !!error} onClick={() => void registerSource(item)}>Register qualifying win · gas only ↗</button>}</div></li>)}</ul>}
        {(data.hasMore || page > 1) && <div className="winner-credit-pagination"><button type="button" className="text-button" disabled={page === 1 || busy} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page}</span><button type="button" className="text-button" disabled={!data.hasMore || busy} onClick={() => setPage(page + 1)}>Next →</button></div>}
      </>}
      {journal && <div className="winner-credit-recovery"><strong>Check your previous reward transaction first.</strong><p>{journal.hash ?? "The wallet submission result is unknown. Check your wallet activity."}</p><label>Transaction hash<input value={recovery} onChange={(event) => setRecovery(event.target.value)} placeholder="0x…" autoComplete="off" disabled={busy} /></label><button type="button" className="text-button" disabled={busy} onClick={() => void reconcile()}>Check receipt</button></div>}
      {message && <p role="status">{message}</p>}
    </>}
    <p className="winner-credit-small">One sponsored ticket per wallet for its lifetime on this network. The full mint price contributes to the prize and pool accounting. The mint creates no referral attribution. If the collection is refunded, its ticket holder receives the refund and the lifetime reward remains used.</p>
  </section>;
}
