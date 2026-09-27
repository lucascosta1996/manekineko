import assert from "node:assert/strict";
import test from "node:test";
import { operationPresentation, operationSeasonSummaries, recoverySchedule, type OperationCollection } from "../lib/collection-operations.ts";
const now=Date.parse("2030-01-01T12:00:00Z");
const row={address:"0x1111111111111111111111111111111111111111",phase:"minting",updatedAt:new Date(now).toISOString(),saleStartAt:new Date(now-1000).toISOString(),deadline:new Date(now+10000).toISOString()} as OperationCollection;
test("operator recovery schedule exposes only reviewed dates for the matching collection",()=>{
  const event={collectionId:"next",hash:"a".repeat(64),original:{saleStartAt:"2030-01-01T01:00:00Z"},replacement:{saleStartAt:"2030-01-01T14:00:00Z",enrollmentAt:"2030-01-01T13:45:00Z",durationSeconds:"86400"},privateField:"never-public"};
  const result=recoverySchedule(JSON.stringify(event),"next");assert.equal(result?.originalSaleStartAt,event.original.saleStartAt);assert(!JSON.stringify(result).includes("never-public"));
  assert.equal(recoverySchedule(JSON.stringify(event),"first"),null);assert.equal(recoverySchedule("invalid","next"),null);
  event.replacement.saleStartAt="2030-02-30T14:00:00Z";assert.equal(recoverySchedule(JSON.stringify(event),"next"),null);
});
test("operator live status requires recent evidence and the actual sale window",()=>{
  assert.equal(operationPresentation(row,now).live,true);
  for(const changed of [{updatedAt:new Date(now-180001).toISOString()},{saleStartAt:new Date(now+1000).toISOString()},{deadline:new Date(now).toISOString()}])assert.equal(operationPresentation({...row,...changed},now).live,false);
  assert.equal(operationPresentation({...row,deadline:new Date(now).toISOString()},now).label,"Mint deadline reached");
});
test("undeployed missed openings and unpaid prizes stay discoverable in their respective views",()=>{
  assert.equal(operationPresentation({...row,address:null,phase:null},now).missed,true);
  assert.equal(operationPresentation({...row,address:null,phase:null},now).group,"upcoming");
  assert.equal(operationPresentation({...row,phase:"awaiting_prize",winnerCount:2,awards:[{claimed:true},{claimed:false}],prizesPaid:false},now).label,"Prizes available to winning ticket holders");
  assert.equal(operationPresentation({...row,phase:"awaiting_prize"},now).group,"active");
});


test("the actual two-collection lifecycle dominates a prepared artifact and a paused worker", () => {
  const complete = { ...row, phase: "complete", automationId: "actual", runId: "run", runStatus: "paused", expectedCollections: 2, prizesPaid: true, winnerCount: 4, awards: Array.from({length:4},()=>({claimed:true})) } as OperationCollection;
  const rows = [{...complete,id:"first"},{...complete,id:"second"},{...complete,id:"history",automationId:"old",runId:"old-run",expectedCollections:10,superseded:true}];
  const seasons=operationSeasonSummaries(rows,now);
  assert.equal(seasons[0].label,"Complete"); assert.equal(seasons[0].totalCollections,2);
  assert.equal(seasons[0].workerStatus,"paused"); assert.equal(seasons[0].artifactStatus,"prepared");
  assert.equal(seasons[1].label,"Superseded history");
  assert.equal(operationSeasonSummaries(rows,now+180001)[0].state,"unavailable");
  assert.equal(operationSeasonSummaries(rows.slice(0,1),now)[0].state,"unavailable");
  rows[0]={...rows[0],phase:"awaiting_prize",prizesPaid:false,awards:[{claimed:true},{claimed:true},{claimed:true},{claimed:false}]};
  const unpaid=operationSeasonSummaries(rows,now)[0];assert.equal(unpaid.state,"complete");assert.equal(unpaid.unpaidPrizes,1);assert.equal(unpaid.allPrizesPaid,false);
});
