import assert from "node:assert/strict";
import test from "node:test";
import { readCollectionObservations, observationInterface as abi, type CollectionObservationTarget } from "../lib/collection-observations.ts";
const now=Date.parse("2026-09-27T12:00:00Z"),hash=`0x${"ab".repeat(32)}`;
const target:CollectionObservationTarget={id:"one",address:`0x${"11".repeat(20)}`,version:"affiliate-v10",roundId:"2",supply:1000,winnerCount:4};
function rpc(options:{chain?:string;stale?:boolean;reorg?:boolean;paid?:boolean;fail?:boolean;wrongCount?:boolean}={}) {
  let blocks=0;
  return {async send(method:string,params:unknown[]){
    if(method==="eth_chainId")return options.chain??"0xaa36a7";
    if(method==="eth_getBlockByNumber")return {hash:options.reorg&&++blocks>1?`0x${"cd".repeat(32)}`:hash,number:"0x100",timestamp:`0x${(BigInt(now/1000)-(options.stale?181n:0n)).toString(16)}`};
    assert.deepEqual(params[1],{blockHash:hash,requireCanonical:true});
    if(method==="eth_getCode")return "0x1234";
    if(options.fail)throw Error("Private RPC diagnostic");
    assert.equal(method,"eth_call");
    const name=abi.parseTransaction(params[0] as {data:string})!.name;
    const values:Record<string,unknown>={CONTRACT_VERSION:"affiliate-v10",roundId:2,phase:options.paid===false?5:6,totalMinted:1000,totalSupply:1000,maxSupply:1000,winnerCount:options.wrongCount?6:4,saleStartAt:Math.floor(now/1000)-86400,mintDeadline:Math.floor(now/1000)+3600,soldOutAt:Math.floor(now/1000)-100,prizePaid:options.paid!==false,revealed:true,prizeClaimed:options.paid!==false};
    return abi.encodeFunctionResult(name,[values[name]]);
  }};
}
test("canonical observations use configured award count, immutable times and refund-adjusted supply",async()=>{
  const result=await readCollectionObservations([target],"11155111",rpc(),now);
  assert.deepEqual(result.errors,{});
  assert.equal(result.observations.one.awards.length,4);
  assert.equal(result.observations.one.phase,"complete");
  assert.equal(result.observations.one.blockHash,hash);
  assert.equal(result.observations.one.minted,1000);
});
for(const options of [{chain:"0x1"},{stale:true},{reorg:true},{wrongCount:true},{fail:true}])test(`untrusted observations remain unavailable ${JSON.stringify(options)}`,async()=>{
 const result=await readCollectionObservations([target],"11155111",rpc(options),now);
 assert.deepEqual(result.observations,{});assert.ok(result.errors.one);assert.equal(JSON.stringify(result).includes("Private RPC"),false);
});
test("missing RPC is explicit and never substitutes projection data or zero",async()=>{
 const result=await readCollectionObservations([target],"11155111",null,now);assert.match(result.errors.one,/Configure/);assert.deepEqual(result.observations,{});
});
