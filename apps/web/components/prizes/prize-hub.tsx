"use client";
import Link from "next/link";
import { useEffect,useRef,useState } from "react";
import { useNftWallet } from "../nfts/use-nft-wallet";
import { NftWalletPicker } from "../nfts/nft-wallet-picker";
import { prizeRelationship,type WalletPrizes,type WalletPrize } from "../../lib/prizes/model";
import { formatWei } from "../../lib/mint/format";
import { observationFresh } from "@manekineko/contract-abi/lifecycle";
import { useProtocolClock } from "../collection-activity";
import { prepareRankedPrizeClaim,prepareLegacyPrizeClaim } from "../../lib/prizes/wallet";
import { connectWallet,readTransaction,checkTransaction,recoverTransaction,submitTransaction,walletError,type TransactionJournal } from "../../lib/affiliates/wallet";
export function PrizeHub() {
  const wallet=useNftWallet(),now=useProtocolClock();
  const [data,setData]=useState<WalletPrizes|null>(null),[cursor,setCursor]=useState<string|null>(null),[refresh,setRefresh]=useState(0);
  const [loading,setLoading]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [busy,setBusy]=useState(false),[journal,setJournal]=useState<TransactionJournal|null>(null),[hash,setHash]=useState("");
  const inFlight=useRef(false);
  useEffect(()=>{setCursor(null);setData(null);setJournal(null);setHash("");setMessage("");},[wallet.address]);
  useEffect(()=>{
    if(!wallet.address)return;
    const controller=new AbortController();setLoading(true);setError("");setData(null);
    void fetch(`/api/prizes?wallet=${wallet.address}${cursor?`&cursor=${cursor}`:""}`,{cache:"no-store",signal:controller.signal}).then(async response=>{const body=await response.json();if(!response.ok)throw Error(body.error);if(!controller.signal.aborted)setData(body);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[wallet.address,cursor,refresh]);
  const current=data?.wallet.toLowerCase()===wallet.address?.toLowerCase()?data:null;
  async function claim(prize:WalletPrize) {
    if(inFlight.current||!wallet.connection?.isCurrent())return;
    const connection=wallet.connection;inFlight.current=true;setBusy(true);setMessage("");
    let session;
    try {
      session=await connectWallet(prize.target.chainId,{injected:connection.injected,address:connection.address});
      const previous=readTransaction(prize.target,"prize");
      if(previous){setJournal(previous);const status=hash.trim()?await recoverTransaction(session,prize.target,previous,hash.trim(),setJournal):await checkTransaction(session,prize.target,previous);setMessage(`Previous claim: ${status}.`);if(status==="confirmed"||status==="reverted"){setJournal(null);setHash("");setRefresh(x=>x+1);}return;}
      const ranked=["affiliate-v7","affiliate-v8","affiliate-v9","affiliate-v10"].includes(prize.target.contractVersion??"");
      const request=await (ranked?prepareRankedPrizeClaim:prepareLegacyPrizeClaim)(session,prize.target,prize);
      await submitTransaction(session,prize.target,"prize",request,setJournal);
      setJournal(null);setMessage("Prize payment confirmed. Refreshing indexed payment history…");setRefresh(x=>x+1);
    } catch(e){setMessage(walletError(e));}
    finally {session?.provider.destroy();inFlight.current=false;setBusy(false);}
  }
  function card(prize:WalletPrize,available=false){const explorer=prize.target.chainId===1?"https://etherscan.io":"https://sepolia.etherscan.io";return <article className="prize-card" key={`${prize.collectionId}:${prize.rank}`}>
    <span>{prize.target.chainId===1?"Ethereum":"Sepolia"} · Prize #{prize.rank}</span><h3>{formatWei(prize.amountWei)} ETH</h3>
    <p><Link href={`/mint/${prize.collectionId}`}>{prize.collectionName}</Link> · <Link href={`/nfts/${prize.collectionId}/${prize.tokenId}`}>Ticket #{prize.tokenId}</Link></p>
    {available&&<><button className="primary-button" disabled={busy||!now||!observationFresh(prize.observedAt,now)||Date.parse(prize.availableAt)>now} onClick={()=>void claim(prize)}>{busy?"Check wallet…":now&&Date.parse(prize.availableAt)>now?`Available ${new Date(prize.availableAt).toUTCString()}`:"Claim this prize"}</button><p>Payment to your connected wallet. One transaction per prize.</p></>}
    {prize.claimed&&<p>Paid {prize.paidAt?new Date(prize.paidAt).toUTCString():"· history indexing pending"}{prize.recipient&&<> to <code>{prize.recipient}</code></>}</p>}
    {prize.transactionHash&&<a href={`${explorer}/tx/${prize.transactionHash}`} target="_blank" rel="noreferrer">Payment receipt ↗</a>}
    <p><Link href={`/mint/${prize.collectionId}/affiliates`}>Affiliate commissions →</Link></p><small>Verified at block {prize.block} · {new Date(prize.observedAt).toUTCString()}</small>
  </article>;}
  const groups=current?.prizes.map(prize=>({prize,...prizeRelationship(prize,current.wallet)}))??[];
  return <section className="prize-hub"><p className="eyebrow">WALLET REWARDS</p><h1>Claim your prizes.</h1><p>Connect the wallet holding your winning tickets. Prize claims are separate from affiliate commissions and sponsored-ticket rewards.</p>
    <button className="primary-button" onClick={wallet.openPicker} disabled={busy}>{wallet.address?"Change wallet":"Connect wallet"}</button>{wallet.address&&<p><code>{wallet.address}</code> <button onClick={()=>setRefresh(x=>x+1)} disabled={loading||busy}>Refresh prizes</button></p>}
    {wallet.pickerOpen&&<NftWalletPicker onConnected={wallet.connect} onCancel={wallet.closePicker}/>}
    {(wallet.notice||message)&&<p role="status">{wallet.notice||message}</p>}{error&&<p role="alert">{error}</p>}{loading&&<p role="status">Checking indexed collections and current ownership…</p>}
    {journal&&<div role="status"><p>A previous claim needs confirmation. Use its claim button again to check before submitting another transaction.</p><label>Transaction hash from your wallet<input value={hash} onChange={e=>setHash(e.target.value)} placeholder="0x…" /></label></div>}
    {current&&<><p>Discovery covers indexed collections on this page. New collections or payments may take time to index.</p>{current.unavailable.length>0&&<p role="alert">Partial results: {current.unavailable.map(c=>c.name).join(", ")} could not be fully verified. This is not a zero-prize result.</p>}
      <h2>Available to claim</h2><div className="prize-grid">{groups.filter(p=>p.available).map(p=>card(p.prize,true))}</div>{!groups.some(p=>p.available)&&<p>No available prizes found on this page.</p>}
      <h2>Payment history</h2><p>Payments claimed by this wallet or sent to it, including claims sent to a different recipient.</p><div className="prize-grid">{groups.filter(p=>p.payment).map(p=>card(p.prize))}</div>
      {groups.some(p=>p.paidCollectible)&&<><h2>Already-paid tickets you hold</h2><p>The previous payout belongs to its recorded claimant and recipient.</p><div className="prize-grid">{groups.filter(p=>p.paidCollectible).map(p=>card(p.prize))}</div></>}
      <nav aria-label="Prize pages">{cursor&&<button onClick={()=>setCursor(null)} disabled={busy}>First page</button>}{current.nextCursor&&<button onClick={()=>setCursor(current.nextCursor)} disabled={busy}>Check more collections →</button>}</nav></>}
  </section>;
}
