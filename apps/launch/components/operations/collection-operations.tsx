"use client";
import { useEffect,useState } from "react";
import { LaunchHeader } from "../launch/launch-header";
import { operationPresentation,type OperationCollection } from "../../lib/collection-operations";
export function CollectionOperations({username,view,initialChainId}:{username:string;view:"active"|"upcoming";initialChainId:"1"|"11155111"}){
  const [chainId,setChainId]=useState(initialChainId),[rows,setRows]=useState<OperationCollection[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0),[partial,setPartial]=useState(false);
  const [now,setNow]=useState<number|null>(null);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);setNow(Date.now());return()=>clearInterval(timer);},[]);
  useEffect(()=>{const controller=new AbortController();setRows([]);setError("");setLoading(true);void fetch(`/api/launch/collections/operations?chainId=${chainId}`,{cache:"no-store",signal:controller.signal}).then(async r=>{if(r.status===401){window.location.replace(`/login?next=/${view}-collection`);return;}const data=await r.json();if(!r.ok)throw Error(data.message??"Operations unavailable.");if(!controller.signal.aborted){setRows(data.collections);setPartial(data.partial);}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[chainId,revision,view]);
  const visible=rows.filter(row=>operationPresentation(row,now??0).group===view);
  return <div className="launch-shell operations-shell"><LaunchHeader username={username} active={view} onLogout={()=>{void fetch("/api/launch/auth/logout",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}).then(r=>{if(r.ok)window.location.replace("/login");else setError("Sign out failed.");});}}/>
    <main id="launch-main"><div className="season-network-switch"><button aria-pressed={chainId==="1"} onClick={()=>setChainId("1")}>Ethereum Mainnet</button><button aria-pressed={chainId==="11155111"} onClick={()=>setChainId("11155111")}>Sepolia testnet</button></div>
      <section className="launch-hero"><div><span className="launch-eyebrow">SEASON OPERATIONS</span><h1>{view==="active"?"Active collection":"Upcoming collection"}.</h1><p>{view==="active"?"Deployed collections, draw progress and outstanding claims.":"Frozen launch schedules, deployment readiness and paused runs."}</p></div><button className="launch-button launch-button-secondary" onClick={()=>setRevision(x=>x+1)} disabled={loading}>Refresh</button></section>
      {error&&<p role="alert">{error}</p>}{loading&&<p role="status">Reading operations…</p>}{partial&&<p role="status">Showing the latest 100 collection steps. Older plans remain in Seasons.</p>}
      {!loading&&!error&&!visible.length&&<p>No {view==="active"?"deployed":"upcoming"} collection in these runs. <a href="/seasons">Open Seasons →</a></p>}
      <div className="earnings-list">{visible.map(row=>{const stage=operationPresentation(row,now??0);const explorer=chainId==="1"?"https://etherscan.io":"https://sepolia.etherscan.io";return <article className="earnings-card" key={`${row.runId}:${row.id}`}><div className="earnings-card-heading"><div><span className="launch-eyebrow">{row.season} · {row.version}</span><h2>{row.name}</h2></div><span className="lifecycle-badge" data-live={stage.live} data-busy={stage.busy&&!stage.stale}>{stage.label}</span></div>
        <p>{row.superseded?"Superseded prepared history · preserve audit; do not resume":`Run ${row.runStatus}`} · {row.minted} / {row.supply} minted</p>
        {row.originalSaleStartAt&&<p>Rescheduled from {new Date(row.originalSaleStartAt).toUTCString()}.</p>}
        {row.lastError&&<p role="alert">{row.lastError}</p>}{stage.stale&&<p role="status">Indexed observation is stale. Refresh and verify chain state before operating.</p>}
        <dl className="operations-facts">{[["Enrollment",row.enrollmentAt],["Scheduled mint",row.saleStartAt],["Mint deadline",row.deadline],["Last observed",row.updatedAt]].map(([label,time])=><div key={label}><dt>{label}</dt><dd>{time?new Date(time).toUTCString():"Awaiting confirmed predecessor / observation"}</dd></div>)}<div><dt>Explorer source</dt><dd>{row.verification}</dd></div><div><dt>Prize settlement</dt><dd>{row.prizesPaid?"All paid":row.address?"See current claims":"Not deployed"}</dd></div></dl>
        <p className="operations-links"><a href={`/seasons?chainId=${chainId}&automationId=${row.automationId}`}>Open season →</a> · <a href="/earnings">Treasury balances →</a></p>
        {row.address&&<p className="operations-links"><a href={`${explorer}/address/${row.address}#code`} target="_blank" rel="noreferrer">Contract / verification ↗</a>{row.publicOrigin&&<> · <a href={`${row.publicOrigin}/mint/${row.id}`} target="_blank" rel="noreferrer">Public collection ↗</a></>}</p>}
      </article>;})}</div>
    </main></div>;
}
