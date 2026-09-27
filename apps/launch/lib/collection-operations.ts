import { lifecycleStage,observationFresh,collectionLifecycle,seasonLifecycle } from "@manekineko/contract-abi/lifecycle";
export type OperationCollection={
  id:string;name:string;season:string;automationId:string;runId:string;runStatus:string;lastError:string|null;superseded:boolean;version:string;
  address:string|null;phase:string|null;updatedAt:string|null;enrollmentAt:string|null;saleStartAt:string|null;deadline:string|null;originalSaleStartAt?:string|null;
  minted:number|null;supply:number;winnerCount?:number;awards?:{claimed:boolean}[];circulatingSupply?:number|null;blockNumber?:number|null;blockHash?:string|null;blockTime?:string|null;lastProjectionAt?:string|null;observationError?:string|null;expectedCollections?:number;soldOutAt:string|null;prizesPaid:boolean;publicOrigin:string|null;verification:string;
};
export function recoverySchedule(message:unknown,collectionId:string){
  if(typeof message!=="string")return null;
  try{
    const data=JSON.parse(message),r=data.replacement;
    const date=(value:unknown)=>typeof value==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value.replace("Z",".000Z");
    if(data.collectionId!==collectionId||!/^[a-f0-9]{64}$/.test(data.hash)||!r||r.durationSeconds!=="86400"||![r.saleStartAt,r.enrollmentAt,data.original?.saleStartAt].every(date)||Date.parse(r.enrollmentAt)>=Date.parse(r.saleStartAt))return null;
    return {saleStartAt:r.saleStartAt as string,enrollmentAt:r.enrollmentAt as string,originalSaleStartAt:data.original.saleStartAt as string,durationSeconds:86400};
  }catch{return null;}
}
export function operationPresentation(row:OperationCollection,now:number){
  const fresh=observationFresh(row.updatedAt,now);
  const stage=lifecycleStage(row.phase,row.address?"deployed":"undeployed");
  const lifecycle=collectionLifecycle({phase:row.phase,deployment:row.address?"deployed":"undeployed",observedAt:row.updatedAt,now,winnerCount:row.winnerCount,awards:row.awards,allPrizesPaid:row.prizesPaid});
  const missed=!row.address&&row.saleStartAt!==null&&Date.parse(row.saleStartAt)<=now;
  const scheduled=!!row.saleStartAt&&Date.parse(row.saleStartAt)>now;
  const expired=!!row.deadline&&Date.parse(row.deadline)<=now;
  return {...stage,lifecycle,live:stage.live&&fresh&&!scheduled&&!!row.deadline&&Date.parse(row.deadline)>now,stale:!!row.address&&!fresh,missed,
    group:!row.address?"upcoming" as const:"active" as const,
    label:row.superseded?"Superseded history":row.address&&!fresh?"Chain observation unavailable":row.phase==="complete"||row.phase==="awaiting_prize"?lifecycle.label:missed?"Opening missed · recovery required":row.phase==="minting"?(expired?"Mint deadline reached":scheduled?"Scheduled mint":!fresh?"Mint status awaiting fresh confirmation":stage.label):stage.label};
}

export function operationSeasonSummaries(collections: OperationCollection[], now: number) {
  return [...new Set(collections.map(row => row.automationId))].map(automationId => {
    const rows = collections.filter(row => row.automationId === automationId);
    const observed = rows.map(row => ({ id: row.id, phase: row.phase, deployment: row.address ? "deployed" : "undeployed", observedAt: row.updatedAt, now, winnerCount: row.winnerCount, awards: row.awards, allPrizesPaid: row.prizesPaid }));
    const lifecycle = seasonLifecycle(observed);
    const totalCollections = rows[0].expectedCollections ?? rows.length;
    const state = rows.length === totalCollections ? lifecycle.state : "unavailable";
    return { automationId, runId: rows[0].runId, workerStatus: rows[0].runStatus, superseded: rows[0].superseded, artifactStatus: "prepared" as const, ...lifecycle, state, totalCollections,
      label: rows[0].superseded ? "Superseded history" : state === "complete" ? "Complete" : state === "unavailable" ? "Chain status unavailable" : "In progress" };
  });
}
export type OperationsReport = { chainId: "1" | "11155111"; collections: OperationCollection[]; partial: boolean; checkedAt: string; seasons: ReturnType<typeof operationSeasonSummaries> };
