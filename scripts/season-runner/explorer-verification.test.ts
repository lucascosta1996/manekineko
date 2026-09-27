import assert from "node:assert/strict";
import test from "node:test";
import { verificationJob,advanceVerification,retryVerification } from "./explorer-verification.ts";
const make=()=>verificationJob({address:`0x${"11".repeat(20)}`,chainId:11155111,contractName:"contracts/R.sol:R",compiler:"v0.8.37",sourceCode:'{"language":"Solidity"}',constructorArguments:""});
test("submission persists GUID; restart polls and verified jobs do not submit again",async()=>{
  const job=make();let saves=0;const actions:string[]=[];
  const fetcher=(async(url,options)=>{const p=options!.body as URLSearchParams; const query = new URL(String(url)).searchParams; assert.equal(query.get("chainid"), "11155111"); assert.equal(query.get("apikey"), "test"); assert.equal(query.get("action"), p.get("action")); actions.push(p.get("action")!);return Response.json({status:"1",result:job.guid?"Pass - Verified":"abc1234567890"});}) as typeof fetch;
  const run=()=>advanceVerification(job,{apiKey:"test",now:job.nextAttemptAt,fetcher,save:async()=>{saves++;}});
  await run();assert.equal(job.state,"pending");await run();assert.equal(job.state,"verified");await run();
  assert.deepEqual(actions,["verifysourcecode","checkverifystatus"]);assert.equal(saves,4);
});
test("explorer outages are bounded, sanitized, and require explicit retry after limit",async()=>{
  const job=make();const fetcher=(async()=>{throw Error("secret key and RPC");}) as typeof fetch;
  for(let i=0;i<9;i++)await advanceVerification(job,{apiKey:"test",now:job.nextAttemptAt,fetcher,save:async()=>{}});
  assert.equal(job.state,"failed");assert.equal(job.attempts,8);assert(!JSON.stringify(job).includes("secret key"));
  retryVerification(job);assert.equal(job.state,"pending");assert.equal(job.attempts,0);
});

test("digest-bound build references reject missing or altered source without submitting",async()=>{
 const job=make();job.sourceHash="0".repeat(64);job.sourceCode="";job.buildInfoId="saved-build";
 let writes=0;
 await advanceVerification(job,{apiKey:"test",now:0,save:async()=>{},loadSource:async()=>"modified",fetcher:(async()=>{writes++;return Response.json({});}) as typeof fetch});
 assert.equal(writes,0);assert.equal(job.state,"failed");assert.equal(job.reason,"exact_build_input_unavailable");
});
