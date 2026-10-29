"use client";
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState} from 'react';
import {formatEther} from 'ethers';
import {Button,Spinner} from '@manekineko/ui/button';
import {Icon} from '@manekineko/ui/icons';
import {useWalletSession} from '@manekineko/protocol/use-wallet-session';
import {nftLinks} from '../lib/nfts/links';
import {galleryPath} from '../lib/nft-mirror/model';
import {paymentNames,WALLET_PAGE_SIZE,type WalletProfile as Profile} from '../lib/wallet-profile/model';
const eth=(wei:string|bigint)=>`${formatEther(wei)} ETH`;
export function WalletProfile({chainId,contract}:{chainId:number|null;contract:string|null}){
  const wallet=useWalletSession(),account=wallet.managed?wallet.account:wallet.session;
  const address=account?.address,network=account?.chainId,identity=`${chainId}:${contract?.toLowerCase()}:${network}:${address?.toLowerCase()}`;
  const [pages,setPages]=useState({identity:'',nfts:1,activity:1});
  const nftPage=pages.identity===identity?pages.nfts:1,activityPage=pages.identity===identity?pages.activity:1;
  const [result,setResult]=useState<{identity:string;value:Profile}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const request=useRef<AbortController|null>(null),lastLoad=useRef(0);
  const load=useCallback(async()=>{
    request.current?.abort();setError('');
    if(!address||!chainId||!contract||network!==chainId){setBusy(false);return;}
    const control=new AbortController();request.current=control;setBusy(true);lastLoad.current=Date.now();
    try{
      const response=await fetch(`/api/wallet?${new URLSearchParams({address,nftPage:String(nftPage),activityPage:String(activityPage)})}`,{cache:'no-store',signal:control.signal});
      if(!response.ok)throw new Error();const value:Profile=await response.json();
      if(value.wallet.toLowerCase()!==address.toLowerCase()||value.chainId!==chainId||value.contract.toLowerCase()!==contract.toLowerCase())throw new Error();
      if(!control.signal.aborted)setResult({identity,value});
    }catch{if(!control.signal.aborted)setError('We couldn’t update your wallet activity. Please try again.');}
    finally{if(!control.signal.aborted)setBusy(false);}
  },[address,network,chainId,contract,identity,nftPage,activityPage]);
  useEffect(()=>{void load();const focus=()=>{if(Date.now()-lastLoad.current>15000)void load();};window.addEventListener('focus',focus);return()=>{request.current?.abort();window.removeEventListener('focus',focus);};},[load]);
  const data=result?.identity===identity&&network===chainId?result.value:null;
  const ready=data?.status==='ready',amount=(kind:number)=>data?.totals.find(t=>t.kind===kind)?.amountWei??'0',count=(kind:number)=>data?.totals.find(t=>t.kind===kind)?.count??0;
  const rewardTotal=[0,2,3,5].reduce((sum,kind)=>sum+BigInt(amount(kind)),0n);
  const explorer=chainId===1?'https://etherscan.io':'https://sepolia.etherscan.io';
  const pageTo=(section:'nfts'|'activity',page:number)=>setPages({identity,nfts:nftPage,activity:activityPage,[section]:page});
  return <section className="wallet-page">
    <header className="wallet-heading"><p className="eyebrow">Your Tincta activity</p><h1>Your wallet</h1><p>Your rewards, confirmed payments and Tincta NFTs in one place.</p>
      {address&&<p className="wallet-address"><a href={`${explorer}/address/${address}`} target="_blank" rel="noopener noreferrer">{address}<Icon name="external" /></a></p>}
    </header>
    {!contract||!chainId?<div className="wallet-message"><h2>Wallet activity is not configured.</h2><p>A verified deployment is required to show your activity.</p></div>:!address?<div className="wallet-message"><h2>Connect your wallet</h2><p>See your confirmed rewards and the Tincta NFTs you own.</p><Button onClick={()=>wallet.openPicker(chainId)}>Connect wallet</Button></div>:network!==chainId?<div className="wallet-message"><h2>Switch to {chainId===11155111?'Sepolia':'Ethereum'}</h2><p>Your selected network has no activity view for this deployment.</p><Button onClick={()=>wallet.managed?wallet.switchNetwork(chainId):wallet.openPicker(chainId)}>Switch network</Button></div>:<>
      <div className="wallet-toolbar"><p>{chainId===11155111?'Sepolia testnet':'Ethereum'} · <a href={`${explorer}/address/${contract}#code`} target="_blank" rel="noopener noreferrer">Current deployment<Icon name="external" /></a></p><Button variant="secondary" busy={busy} busyLabel="Refreshing…" onClick={()=>void load()}>Refresh activity</Button></div>
      {error&&<p role="alert" className="wallet-message">{error}{ready?' The previous confirmed totals remain below.':''}</p>}
      {!data&&!error&&<div className="wallet-message" role="status"><Spinner /> Loading your wallet activity…</div>}
      {data&&!ready&&<div className="wallet-message" role="status"><h2>{data.status==='syncing'?'Your wallet activity is syncing.':'Wallet activity is temporarily unavailable.'}</h2><p>{data.status==='syncing'?'Confirmed transfers and payments are being checked. Refresh in a moment.':'Your confirmed activity will appear when syncing resumes. Refresh to try again.'}</p></div>}
      {ready&&data&&<>
        <section className="wallet-summary" aria-label="Confirmed rewards"><p className="eyebrow">Rewards received</p><p className="wallet-total">{eth(rewardTotal)}</p><p>ETH paid to this address across collections in this deployment. Network fees are not deducted. Refunds are shown separately.</p>
          <dl className="wallet-stats">{([{kind:0,label:'Prize rewards',note:`${count(0)} ${count(0)===1?'prize':'prizes'} received`},{kind:2,label:'Affiliate rewards',note:`${count(2)} ${count(2)===1?'payment':'payments'} received`},{kind:3,label:'Holder rewards',note:`${count(3)} ${count(3)===1?'payment':'payments'} received`},{kind:1,label:'Refunds received',note:'Returned mint payments'},...(BigInt(amount(5))>0n?[{kind:5,label:'Execution rewards',note:`${count(5)} payments received`}]:[])]).map(item=><div key={item.kind}><dt>{item.label}</dt><dd>{eth(amount(item.kind))}<p>{item.note}</p></dd></div>)}</dl>
        </section>
        <section aria-labelledby="wallet-nfts"><div className="wallet-section-heading"><h2 id="wallet-nfts">Your Tincta NFTs</h2><p>{data.owned} currently owned</p></div>
          {!data.owned?<p>No Tincta NFTs are held by this address in this deployment.</p>:<div className="wallet-nft-grid">{data.nfts.map(nft=>{const links=nftLinks(data.chainId,data.contract,String(nft.tokenId));return <article className="wallet-nft" key={nft.tokenId}>
            <a className={`wallet-artwork${nft.collectionId===0?' wallet-genesis':''}`} href={links.blockscout??links.openSea!} target="_blank" rel="noopener noreferrer" aria-label={`View ${nft.name} on ${data.chainId===11155111?'Blockscout':'OpenSea'}`}>
              {nft.image?<img src={nft.image} alt={nft.name} width={nft.collectionId===0?600:640} height={nft.collectionId===0?600:800} loading="lazy" decoding="async"/>:<span>Artwork syncing</span>}</a>
            <div className="wallet-nft-caption"><p>{nft.collectionName}</p><h3>NFT #{nft.serial}</h3><Link href={galleryPath(data.chainId,data.contract,nft.collectionId)}>View collection<Icon name="arrow" /></Link></div>
          </article>;})}</div>}<WalletPagination label="Your NFT pages" page={data.nftPage} total={data.owned} busy={busy} onPage={page=>pageTo("nfts",page)}/>
        </section>
        <section aria-labelledby="wallet-payments"><div className="wallet-section-heading"><h2 id="wallet-payments">Payments received</h2><p>{data.paymentsTotal} confirmed</p></div>
          {!data.payments.length?<p>No confirmed payments have been received by this address yet.</p>:<ul className="wallet-payments">{data.payments.map(payment=><li key={`${payment.transaction}:${payment.logIndex}`}><div><h3>{paymentNames[payment.kind]}</h3><p>{payment.collectionName}{payment.tokenId>0?` · NFT #${payment.tokenId&131071}`:''}</p></div><div><p className="wallet-payment-amount">{eth(payment.amountWei)}</p><a href={`${explorer}/tx/${payment.transaction}`} target="_blank" rel="noopener noreferrer">View transaction<Icon name="external" /></a></div></li>)}</ul>}<WalletPagination label="Payment history pages" page={data.activityPage} total={data.paymentsTotal} busy={busy} onPage={page=>pageTo("activity",page)}/>
        </section>
        <p className="wallet-sync">{data.stale?'Updates are delayed. ':data.catchingUp?'Recent activity is syncing. ':''}Confirmed through block {data.block?.toLocaleString('en-US')}. {data.syncedAt&&<>Last synced <time dateTime={data.syncedAt}>{new Date(data.syncedAt).toISOString().replace('T',' ').slice(0,16)} UTC</time>.</>}</p>
      </>}
    </>}
  </section>;
}

function WalletPagination({label,page,total,busy,onPage}:{label:string;page:number;total:number;busy:boolean;onPage:(page:number)=>void}){
  if(total<=WALLET_PAGE_SIZE)return null;
  return <nav className="wallet-pagination" aria-label={label}><Button variant="secondary" disabled={busy||page===1} onClick={()=>onPage(page-1)}>Previous</Button><p role="status">{busy?"Loading…":`Page ${page} of ${Math.ceil(total/WALLET_PAGE_SIZE)}`}</p><Button variant="secondary" disabled={busy||page*WALLET_PAGE_SIZE>=total} onClick={()=>onPage(page+1)}>Next</Button></nav>;
}
