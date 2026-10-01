import test from "node:test";
import assert from "node:assert/strict";
import { runtimePlan } from "../../apps/launch/test/season-runtime.fixture.ts";
import { reviewSeasonPlan, parseReviewSeason, reviewPreparationStartAt } from "./review-season-plan.ts";
import { reviewArguments } from "./review-season.ts";
const address=(i:number)=>`0x${i.toString(16).padStart(40,"0")}`;
test("three collection runs share one season identity and isolate the middle refund",()=>{
 const source=runtimePlan().plan;for(const step of source.steps)step.payload.contract.algorithmVersion="unique-rank-v6";
 const before=structuredClone(source),cohort={sourceCollection:address(50),sourceCodeHash:`0x${"aa".repeat(32)}`,slots:Array.from({length:10},(_,i)=>({id:i+1,wallet:address(i+1),sourceTokenId:String(i+1)})),successfulIds:[1,2,3,4,5]};
 const review=reviewSeasonPlan(source,{affiliate:address(1),buyer:address(30),cohort},{maxFeePerGasWei:"5000000000",maxTotalSpendWei:"25000000000000000000"});
 assert.equal(review.schemaVersion,2);assert.equal(new Set(review.stages.map(s=>s.plan.seasonId)).size,1);assert.equal(new Set(review.stages.map(s=>s.plan.name)).size,1);
 assert.deepEqual(source,before);assert.deepEqual(parseReviewSeason(review),review);
 assert.equal(review.fundReuse,"completed-stage-to-operator-v1");
 assert.throws(()=>parseReviewSeason({...review,fundReuse:"sweep-before-claims"}),/fund_reuse_policy/);
 const legacy=structuredClone(review);delete legacy.fundReuse;assert.equal(parseReviewSeason(legacy).fundReuse,undefined);
 assert.deepEqual(review.stages.map(s=>s.plan.startAt),[null,null,null]);
 assert.equal(review.mintOpeningDelaySeconds,1800);
 assert.deepEqual(review.stages.map(s=>s.plan.steps[0].payload.operations.enrollmentWindowSeconds),["900","900","900"]);
 assert.throws(()=>parseReviewSeason({...review,mintOpeningDelaySeconds:3600}),/opening_delay/);
 const incompatible=structuredClone(review);incompatible.stages[0].plan.steps[0].payload.operations.enrollmentWindowSeconds="3600";
 assert.throws(()=>parseReviewSeason(incompatible),/15_minute_enrollment/);
 delete incompatible.mintOpeningDelaySeconds;assert.deepEqual(parseReviewSeason(incompatible),incompatible);
 assert.deepEqual(review.stages.map(s=>s.plan.steps[0].payload.contract.mintDurationSeconds),["86400","1800","86400"]);
 assert.equal(review.stages[1].plan.steps[0].payload.operations.factoryMode,"new");
 for(const stage of review.stages){assert.equal(stage.plan.steps[0].payload.contract.maxSupply,source.steps[0].payload.contract.maxSupply);assert.equal(stage.plan.steps[0].payload.contract.mintPriceWei,source.steps[0].payload.contract.mintPriceWei);}
 const swapped=structuredClone(review);swapped.stages.reverse();assert.throws(()=>parseReviewSeason(swapped),/order/);
 const mainnet=structuredClone(review);(mainnet as any).chainId=1;assert.throws(()=>parseReviewSeason(mainnet));
});
test("review schedules drafts 30 minutes from preparation and never moves an existing opening",()=>{
 const now=new Date("2030-01-01T12:00:00Z");
 assert.equal(reviewPreparationStartAt({mintOpeningDelaySeconds:1800},"draft",now),"2030-01-01T12:30:00Z");
 assert.equal(reviewPreparationStartAt({mintOpeningDelaySeconds:1800},"prepared",now),undefined);
 assert.equal(reviewPreparationStartAt({},"draft",now),undefined);
});
test("review CLI defaults to read-only and rejects ambiguous or unrelated execution arguments",()=>{
 const args=["--manifest","private.json","--stage","3","--wallet-vault","vault.enc"];
 assert.equal(reviewArguments(args).execute,false);assert.equal(reviewArguments([...args,"--execute"]).execute,true);
 for(const tail of [["--stage","1"],["--execute","--execute"],["--allow-mainnet"],["--recycle-sepolia-funds"]])assert.throws(()=>reviewArguments([...args,...tail]));
});
