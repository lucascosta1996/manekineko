import "server-only";
import { database } from "./database";
import type { LaunchChainId } from "./chain-policy";
import { recoverySchedule,operationSeasonSummaries,type OperationCollection } from "./collection-operations";
import { earningsProvider } from "./creator-earnings-store";
import { readCollectionObservations, type CollectionObservationTarget } from "./collection-observations";
export async function loadCollectionOperations(chainId:LaunchChainId){
  const rows=(await database().query(`SELECT step.value AS step,step.ordinality AS position,a.id AS automation_id,a.prepared_artifact AS artifact,
    r.id AS run_id,r.status,r.last_error,p.public_base_url,
    (SELECT message FROM manekineko_season_runtime_events e WHERE e.run_id=r.id AND e.event='recovery_schedule_approved' ORDER BY e.id DESC LIMIT 1) AS recovery_message,
    EXISTS(SELECT 1 FROM manekineko_season_runtime_runs nr JOIN manekineko_launch_automations na ON na.id=nr.automation_id
      WHERE nr.chain_id=r.chain_id AND na.prepared_artifact->>'seasonId'=a.prepared_artifact->>'seasonId' AND nr.created_at>r.created_at) AS superseded,
    d.contract_address,c.round_id,c.contract_version,s.phase,s.total_minted,s.sold_out_at,s.prize_paid,s.updated_at,d.mint_deadline,c.sale_start_at,
    prior.sold_out_at AS previous_sellout,
    pub.payload AS public_payload
    FROM manekineko_season_runtime_runs r JOIN manekineko_launch_automations a ON a.id=r.automation_id
    CROSS JOIN LATERAL jsonb_array_elements(a.prepared_artifact->'steps') WITH ORDINALITY step(value,ordinality)
    LEFT JOIN manekineko_collections c ON c.id=(step.value->>'id')::uuid AND c.chain_id=r.chain_id::bigint
    LEFT JOIN manekineko_deployments d ON d.collection_id=c.id AND d.chain_id=r.chain_id::bigint AND d.status='deployed'
    LEFT JOIN manekineko_collection_state s ON s.collection_id=c.id
    LEFT JOIN manekineko_collection_state prior ON prior.collection_id=(a.prepared_artifact->'steps'->(step.ordinality::int-2)->>'id')::uuid AND step.ordinality>1
    LEFT JOIN manekineko_season_runtime_profiles p ON p.chain_id=r.chain_id
    LEFT JOIN manekineko_season_runtime_public pub ON pub.run_id=r.id
    WHERE r.chain_id=$1 ORDER BY r.created_at DESC,step.ordinality LIMIT 101`,[chainId])).rows;
  const collections:OperationCollection[]=rows.slice(0,100).map(row=>{
    const terms=row.step.payload.contract, artifact=row.artifact;
    const recovery=chainId==="11155111"?recoverySchedule(row.recovery_message,row.step.id):null;
    const start=row.sale_start_at?.getTime()??(recovery?Date.parse(recovery.saleStartAt):row.position==1&&artifact.startAt?Date.parse(artifact.startAt):row.previous_sellout&&artifact.timing?row.previous_sellout.getTime()+Number(artifact.timing.nextLaunchDelaySeconds)*1000:null);
    const iso=(n:number|null)=>n===null?null:new Date(n).toISOString();
    const published=row.public_payload?.collections?.find((c:{id:string})=>c.id===row.step.id);
    return {id:row.step.id,name:terms.name,season:artifact.name,automationId:row.automation_id,runId:row.run_id,runStatus:row.status,lastError:row.last_error,superseded:row.superseded,version:artifact.contractVersion,address:row.contract_address??null,phase:row.phase??null,updatedAt:row.updated_at?.toISOString()??null,lastProjectionAt:row.updated_at?.toISOString()??null,saleStartAt:iso(start),originalSaleStartAt:recovery?.originalSaleStartAt??null,enrollmentAt:iso(start===null?null:start-Number(row.step.payload.operations.enrollmentWindowSeconds)*1000),deadline:row.mint_deadline?.toISOString()??iso(start===null?null:start+Number(recovery?.durationSeconds??terms.mintDurationSeconds)*1000),minted:row.total_minted??null,winnerCount:Number(terms.winnerCount),expectedCollections:artifact.steps.length,supply:Number(terms.maxSupply),soldOutAt:row.sold_out_at?.toISOString()??null,prizesPaid:row.prize_paid??false,publicOrigin:row.public_base_url??null,verification:published?.verification??"unknown"};
  });
  const targets: CollectionObservationTarget[] = rows.slice(0,100).filter(row => row.contract_address && !row.superseded).map(row => ({ id: row.step.id, address: row.contract_address, version: row.contract_version ?? row.artifact.contractVersion, roundId: String(row.round_id), supply: Number(row.step.payload.contract.maxSupply), winnerCount: Number(row.step.payload.contract.winnerCount) }));
  const provider = targets.length ? earningsProvider(chainId) : null;
  let verified;
  try { verified = await readCollectionObservations(targets, chainId, provider); }
  finally { provider?.destroy(); }
  for (const collection of collections) {
    if (!collection.address || collection.superseded) continue;
    const observation = verified.observations[collection.id];
    if (observation) Object.assign(collection, observation, { updatedAt: observation.blockTime, observationError: null });
    else Object.assign(collection, { observationError: verified.errors[collection.id] ?? "Registered deployment unavailable.", updatedAt: null, phase: null, minted: null, circulatingSupply: null, prizesPaid: false, awards: [] });
  }
  const checkedAt = new Date().toISOString();
  return {chainId,collections,partial:rows.length>100,checkedAt,seasons:operationSeasonSummaries(collections,Date.parse(checkedAt))};
}
