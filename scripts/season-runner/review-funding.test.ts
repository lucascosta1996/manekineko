import test from "node:test";
import assert from "node:assert/strict";
import { parseEther, type Provider } from "ethers";
import { runtimePlan } from "../../apps/launch/test/season-runtime.fixture.ts";
import { reviewFundingCheck, readReviewRpc } from "./review-funding.ts";
import type { ReviewStage } from "./review-season-plan.ts";

const affiliate=`0x${"11".repeat(20)}`,buyer=`0x${"22".repeat(20)}`,operator=`0x${"33".repeat(20)}`;
function fixture() {
  const plan=runtimePlan().plan;plan.chainId="11155111";plan.steps[0].payload.contract.maxSupply="1000";
  plan.steps[0].payload.contract.mintPriceWei=String(parseEther("0.01"));plan.steps[0].payload.contract.winnerCount="6";
  plan.steps[0].payload.contract.randomnessFundingWei=String(parseEther("0.3"));plan.steps[0].payload.operations.winnerCreditSponsorshipWei=String(parseEther("0.06"));
  const stage:ReviewStage={number:1,plan,scenario:{kind:"manual-affiliate-sellout",chainId:11155111,collectionId:plan.steps[0].id,affiliateWallet:affiliate,buyerWallet:buyer,manualMintsPerWallet:20,expectedOutcome:"manual-prize-and-commission-claimed",maxFeePerGasWei:"5000000000",maxTotalSpendWei:String(parseEther("25"))}};
  const balances=new Map([[affiliate,parseEther("0.0125")],[buyer,parseEther("0.0225")],[operator,parseEther("12")]]);
  const provider={getNetwork:async()=>({chainId:11155111n}),getBlock:async()=>({number:100,hash:"canonical",timestamp:Date.now()/1000}),getBalance:async(a:string)=>balances.get(a)!} as unknown as Provider;
  return{stage,balances,provider};
}
test("opening funding counts unique liquid accounts and excludes unavailable manual surplus",async()=>{
  const f=fixture();f.balances.set(affiliate,parseEther("20"));
  const result=await reviewFundingCheck(f.provider,f.stage,[affiliate,buyer,operator,operator],2);
  assert.equal(result.requiredEth,"11.1576");assert.equal(result.availableEth,"12.035");assert.equal(result.fundingPass,true);assert.equal(result.futureIncomeCounted,false);
  f.balances.set(operator,parseEther("1"));assert.equal((await reviewFundingCheck(f.provider,f.stage,[affiliate,buyer,operator],2)).fundingPass,false);
});
test("opening funding fails closed on the wrong chain and missing manual accounts",async()=>{
  const f=fixture();f.stage.plan.chainId="1";await assert.rejects(reviewFundingCheck(f.provider,f.stage,[],2),/sepolia_only/);
  f.stage.plan.chainId="11155111";await assert.rejects(reviewFundingCheck(f.provider,f.stage,[operator],2),/manual_wallet_missing/);
});


test("read-only provider throttling backs off within a bounded retry policy",async()=>{
 const waits:number[]=[];let calls=0;
 assert.equal(await readReviewRpc(async()=>{if(++calls<3)throw {info:{error:{code:-32007}}};return "confirmed";},async ms=>{waits.push(ms);}),"confirmed");
 assert.deepEqual(waits,[1000,2000]);assert.equal(calls,3);
 let denied=0;await assert.rejects(readReviewRpc(async()=>{denied++;throw {code:403};},async()=>{}));assert.equal(denied,1);
 let throttled=0;await assert.rejects(readReviewRpc(async()=>{throttled++;throw {code:-32007};},async()=>{}));assert.equal(throttled,4);
});
