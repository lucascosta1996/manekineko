"use client";
import { Icon } from "@manekineko/ui/icons";
import { useEffect,useState } from "react";
import { LaunchHeader } from "../launch/launch-header";
import { operationPresentation,operationSeasonSummaries,type OperationsReport } from "../../lib/collection-operations";
import { useLaunchNetwork } from "../launch/use-launch-network";
import { useLaunchQuery } from "../launch/use-launch-query";
import { launchDestination } from "../../lib/launch-navigation";
import { observedClock } from "@manekineko/contract-abi/lifecycle";
export function CollectionOperations({username,view,initialChainId}:{username:string;view:"active"|"upcoming";initialChainId:"1"|"11155111"}){
  const [chainId,setChainId]=useLaunchNetwork(initialChainId);
  const query=useLaunchQuery<OperationsReport>("/api/launch/collections/operations",chainId);
  const [signoutError,setError]=useState("");
  const [clock,setClock]=useState(0);
  useEffect(()=>{const timer=setInterval(()=>setClock(performance.now()),1000);setClock(performance.now());return()=>clearInterval(timer);},[]);
  const now=query.data&&query.receivedAt!==null?observedClock(Date.parse(query.data.checkedAt),query.receivedAt,clock):null;
  const seasons=query.data?operationSeasonSummaries(query.data.collections,now??Date.parse(query.data.checkedAt)):[];
  const rows=query.data?.collections??[],error=signoutError||query.error,loading=query.loading,partial=query.data?.partial;
  const visible=rows.filter(row=>!row.superseded&&operationPresentation(row,now??0).group===view);
  return <div className="launch-shell operations-shell"><LaunchHeader chainId={chainId} onNetworkChange={setChainId} username={username} active={view} onLogout={()=>{void fetch("/api/launch/auth/logout",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}).then(r=>{if(r.ok)window.location.replace("/login");else setError("Sign out failed.");}).catch(()=>setError("Sign out failed. Please retry."));}}/>
    <main id="launch-main">
      <section className="launch-hero"><div><span className="launch-eyebrow">SEASON OPERATIONS</span><h1>{view==="active"?"Active collection":"Upcoming collection"}.</h1><p>{view==="active"?"Deployed collections, draw progress and outstanding claims.":"Frozen launch schedules, deployment readiness and paused runs."}</p></div><button className="launch-button launch-button-secondary" onClick={query.refresh} disabled={loading}>Refresh</button></section>
      {error&&<p role="alert">{error}</p>}{loading&&<p role="status">Reading operations…</p>}{partial&&<p role="status">Showing the latest 100 collection steps. Older plans remain in Seasons.</p>}
      {!loading&&!error&&!visible.length&&<p>No {view==="active"?"deployed":"upcoming"} collection in these runs. <a href={launchDestination("/seasons",chainId)}>Open Seasons <Icon name="arrow" /></a></p>}
      {seasons.filter(season=>!season.superseded).map(season=><p key={season.runId}><strong>{season.label}</strong> · {season.state==="unavailable"?`Observation unavailable · ${season.totalCollections} collections`:`${season.completedCollections}/${season.totalCollections} collections terminal`} · artifact {season.artifactStatus} · worker {season.workerStatus}{season.unpaidPrizes!==null?` · ${season.unpaidPrizes} unpaid prizes`:""}</p>)}
      <div className="earnings-list">{visible.map(row=>{const stage=operationPresentation(row,now??0);const explorer=chainId==="1"?"https://etherscan.io":"https://sepolia.etherscan.io";return <article id={`collection-${row.id}`} className="earnings-card" key={`${row.runId}:${row.id}`}><div className="earnings-card-heading"><div><span className="launch-eyebrow">{row.season} · {row.version}</span><h2>{row.name}</h2></div><span className="lifecycle-badge" data-live={stage.live} data-busy={stage.busy&&!stage.stale}>{stage.label}</span></div>
        <p>{row.superseded?"Superseded prepared history · preserve audit; do not resume":`Run ${row.runStatus}`} · {row.minted??"Unknown"} / {row.supply} primary mints{row.circulatingSupply!=null?` · ${row.circulatingSupply} NFTs circulating`:""}</p>
        {row.originalSaleStartAt&&<p>Rescheduled from {new Date(row.originalSaleStartAt).toUTCString()}.</p>}
        {row.observationError&&<p role="alert">{row.observationError}</p>}
        {row.blockNumber!=null&&<p>Canonical block <a href={`${explorer}/block/${row.blockHash??row.blockNumber}`} target="_blank" rel="noreferrer">{row.blockNumber}</a> · {row.blockTime}</p>}
        {row.lastError&&<p role="alert">{row.lastError}</p>}{stage.stale&&<p role="status">Chain observation is unavailable or stale. Refresh before operating.</p>}
        <dl className="operations-facts">{[["Enrollment",row.enrollmentAt],["Scheduled mint",row.saleStartAt],["Mint deadline",row.deadline],["Last canonical observation",row.updatedAt],["Last indexed observation",row.lastProjectionAt]].map(([label,time])=><div key={label}><dt>{label}</dt><dd>{time?new Date(time).toUTCString():"Awaiting confirmed predecessor / observation"}</dd></div>)}<div><dt>Explorer source</dt><dd>{row.verification}</dd></div><div><dt>Prize settlement</dt><dd>{row.prizesPaid?"All paid":row.address?"See current claims":"Not deployed"}</dd></div></dl>
        <p className="operations-links"><a href={`/seasons?chainId=${chainId}&automationId=${row.automationId}`}>Open season <Icon name="arrow" /></a> · <a href={launchDestination("/earnings",chainId)}>Treasury balances <Icon name="arrow" /></a></p>
        {row.address&&<p className="operations-links"><a href={`${explorer}/address/${row.address}#code`} target="_blank" rel="noreferrer">Contract / verification <Icon name="diagonal" /></a>{row.publicOrigin&&<> · <a href={`${row.publicOrigin}/mint/${row.id}`} target="_blank" rel="noreferrer">Public collection <Icon name="diagonal" /></a></>}</p>}
      </article>;})}</div>
    {rows.some(row=>row.superseded)&&<details><summary>Superseded run history<Icon name="chevron" className="ui-disclosure-icon" /></summary>{seasons.filter(season=>season.superseded).map(season=><p key={season.runId}><a href={launchDestination("/seasons",chainId,season.automationId)}>Superseded {season.totalCollections}-collection prepared sequence</a> · worker {season.workerStatus}</p>)}</details>}
    </main></div>;
}
