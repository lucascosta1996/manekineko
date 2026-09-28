"use client";
import { Button, TextAction } from "@manekineko/ui/button";

import { Icon } from "@manekineko/ui/icons";
import Link from "next/link";
import { useEffect,useState } from "react";
import { WalletOpenAction } from "../affiliates/wallet-open-action";
import { useWalletSession } from "../affiliates/use-wallet-session";
import { WalletAccountPicker } from "../affiliates/wallet-account-picker";
import { usePrizeClaims } from "./use-prize-claims";
import { prizeOperationKey } from "../../lib/prizes/operation";
import { prizeRelationship,type WalletPrizes,type WalletPrize } from "../../lib/prizes/model";
import { formatWei } from "../../lib/mint/format";
import { observationFresh } from "@manekineko/contract-abi/lifecycle";
import { useProtocolClock } from "../collection-activity";
import { shortWallet, walletError } from "../../lib/affiliates/wallet";
export function PrizeHub() {
  const wallet=useWalletSession(),now=useProtocolClock();
  const address=wallet.session?.address ?? null;
  const [data,setData]=useState<WalletPrizes|null>(null),[cursor,setCursor]=useState<string|null>(null),[refresh,setRefresh]=useState(0);
  const [loading,setLoading]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [hash,setHash]=useState("");
  const claims=usePrizeClaims(()=>setRefresh(x=>x+1)),busy=claims.busy;
  useEffect(()=>{setCursor(null);setData(null);setHash("");setMessage("");},[address]);
  useEffect(()=>{
    if(!address)return;
    const controller=new AbortController();setLoading(true);setError("");setData(null);
    void fetch(`/api/prizes?wallet=${address}${cursor?`&cursor=${cursor}`:""}`,{cache:"no-store",signal:controller.signal}).then(async response=>{const body=await response.json();if(!response.ok)throw Error(body.error);if(!controller.signal.aborted)setData(body);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[address,cursor,refresh]);
  const current=data?.wallet.toLowerCase()===address?.toLowerCase()?data:null;
  useEffect(()=>{
    if (!current) return;
    try { for (const prize of current.prizes) claims.restore(prize.collectionId,prize.target,prize.block); }
    catch (error) { setMessage(walletError(error)); }
    // Restore receipt checks from storage; never sign on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[current]);
  async function claim(prize:WalletPrize) {
    if (!wallet.session || busy) return;
    if (wallet.session.chainId!==prize.target.chainId) { wallet.openPicker(prize.target.chainId); return; }
    await claims.claim(prize,wallet.session,async()=>prize.target,hash);
  }
  function card(prize:WalletPrize,available=false){const key=prizeOperationKey(prize.collectionId,prize.rank),operation=claims.operation?.key===key?claims.operation:null,paidHash=claims.paid[key];const explorer=prize.target.chainId===1?"https://etherscan.io":"https://sepolia.etherscan.io";return <article className="prize-card" key={`${prize.collectionId}:${prize.rank}`}>
    <span>{prize.target.chainId===1?"Ethereum":"Sepolia"} · Prize #{prize.rank}</span><h3>{formatWei(prize.amountWei)} ETH</h3>
    <p><Link href={`/mint/${prize.collectionId}`}>{prize.collectionName}</Link> · <Link href={`/nfts/${prize.collectionId}/${prize.tokenId}`}>Ticket #{prize.tokenId}</Link></p>
    {available&&!paidHash&&<><Button busy={busy} icon={<Icon name="arrow" />} reserveLabels={["Claim this prize", "Confirm in your wallet", "Checking receipt…", "Checking this ticket…", "Check original receipt"]} variant="primary" disabled={busy||!now||!observationFresh(prize.observedAt,now)||Date.parse(prize.availableAt)>now} onClick={()=>void claim(prize)}>{busy&&operation?operation.phase==="wallet"?"Confirm in your wallet":operation.phase==="pending"?"Checking receipt…":"Checking this ticket…":operation?.journal?"Check original receipt":wallet.session?.chainId!==prize.target.chainId?`Connect on ${prize.target.chainId===1?"Ethereum":"Sepolia"}`:now&&Date.parse(prize.availableAt)>now?`Available ${new Date(prize.availableAt).toUTCString()}`:"Claim this prize"}</Button><p>Payment to your connected wallet. One transaction per prize.</p></>}
    {paidHash&&<p>Prize paid. <a href={`${explorer}/tx/${paidHash}`} target="_blank" rel="noreferrer">Payment receipt</a> · History indexing may still be pending.</p>}
    {operation&&<div role="status" aria-live="polite"><p>{operation.message}</p>{operation.phase==="wallet"&&<WalletOpenAction provider={wallet.session?.injected}/> }{operation.hash&&<a href={`${explorer}/tx/${operation.hash}`} target="_blank" rel="noreferrer">View transaction</a>}{operation.journal&&<><p>Original account: <code>{operation.journal.wallet}</code></p>{!operation.hash&&<label>Transaction hash from your wallet<input className="ui-input" value={hash} onChange={e=>setHash(e.target.value)} placeholder="0x…" disabled={busy}/></label>}</>}</div>}
    {prize.claimed&&<p>Paid {prize.paidAt?new Date(prize.paidAt).toUTCString():"· history indexing pending"}{prize.recipient&&<> to <code>{prize.recipient}</code></>}</p>}
    {prize.transactionHash&&<a href={`${explorer}/tx/${prize.transactionHash}`} target="_blank" rel="noreferrer">Payment receipt <Icon name="diagonal" /></a>}
    <p><Link href={`/mint/${prize.collectionId}/affiliates`}>Affiliate commissions <Icon name="arrow" /></Link></p><small>Verified at block {prize.block} · {new Date(prize.observedAt).toUTCString()}</small>
  </article>;}
  const groups=current?.prizes.map(prize=>({prize,...prizeRelationship(prize,current.wallet)}))??[];
  return <section className="prize-hub"><p className="eyebrow">WALLET REWARDS</p><h1>Claim your prizes.</h1><p>Connect the wallet holding your winning tickets. Prize claims are separate from affiliate commissions and sponsored-ticket rewards.</p>
    <Button busy={busy} variant="primary"  onClick={()=>wallet.openPicker(wallet.session?.chainId??0)} disabled={busy}>{address?"Change wallet":"Connect wallet"}</Button>{address&&<p>{wallet.session?.providerName ?? "Connected wallet"} · <code title={address}>{shortWallet(address)}</code> · {wallet.session?.chainId===1?"Ethereum Mainnet":"Sepolia testnet"} <TextAction inline busy={loading || busy} busyLabel="Refreshing prizes…" reserveLabels={["Refresh prizes"]} onClick={()=>setRefresh(x=>x+1)} disabled={loading||busy}>Refresh prizes</TextAction></p>}
    {wallet.pickerChain!==null&&<WalletAccountPicker chainId={wallet.pickerChain || undefined} purpose="prize discovery and claims" onConnected={wallet.connect} onCancel={wallet.closePicker}/>}
    {(wallet.notice||message)&&<p role="status">{wallet.notice||message}</p>}{error&&<p role="alert">{error}</p>}{loading&&<p role="status">Checking indexed collections and current ownership…</p>}
    {current&&<><p>Discovery covers indexed collections on this page. New collections or payments may take time to index.</p>{current.unavailable.length>0&&<p role="alert">Partial results: {current.unavailable.map(c=>c.name).join(", ")} could not be fully verified. This is not a zero-prize result.</p>}
      <h2>Available to claim</h2><div className="prize-grid">{groups.filter(p=>p.available).map(p=>card(p.prize,true))}</div>{!groups.some(p=>p.available)&&<p>No available prizes found on this page.</p>}
      <h2>Payment history</h2><p>Payments claimed by this wallet or sent to it, including claims sent to a different recipient.</p><div className="prize-grid">{groups.filter(p=>p.payment).map(p=>card(p.prize))}</div>
      {groups.some(p=>p.paidCollectible)&&<><h2>Already-paid tickets you hold</h2><p>The previous payout belongs to its recorded claimant and recipient.</p><div className="prize-grid">{groups.filter(p=>p.paidCollectible).map(p=>card(p.prize))}</div></>}
      <nav aria-label="Prize pages">{cursor&&<Button busy={busy} variant="secondary" onClick={()=>setCursor(null)} disabled={busy}>First page</Button>}{current.nextCursor&&<Button busy={busy} icon={<Icon name="arrow" />} iconPosition="end" variant="secondary" onClick={()=>setCursor(current.nextCursor)} disabled={busy}>Check more collections </Button>}</nav></>}
  </section>;
}
