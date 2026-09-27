import { lifecycleStage,observationFresh } from "@manekineko/contract-abi/lifecycle";
export type OperationCollection={
  id:string;name:string;season:string;automationId:string;runId:string;runStatus:string;lastError:string|null;superseded:boolean;version:string;
  address:string|null;phase:string|null;updatedAt:string|null;enrollmentAt:string|null;saleStartAt:string|null;deadline:string|null;originalSaleStartAt?:string|null;
  minted:number;supply:number;soldOutAt:string|null;prizesPaid:boolean;publicOrigin:string|null;verification:string;
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
  const missed=!row.address&&row.saleStartAt!==null&&Date.parse(row.saleStartAt)<=now;
  const scheduled=!!row.saleStartAt&&Date.parse(row.saleStartAt)>now;
  const expired=!!row.deadline&&Date.parse(row.deadline)<=now;
  return {...stage,live:stage.live&&fresh&&!scheduled&&!!row.deadline&&Date.parse(row.deadline)>now,stale:!!row.address&&!fresh,missed,
    group:!row.address?"upcoming" as const:"active" as const,
    label:missed?"Opening missed · recovery required":row.phase==="minting"?(expired?"Mint deadline reached":scheduled?"Scheduled mint":!fresh?"Mint status awaiting fresh confirmation":stage.label):stage.label};
}
