import test from 'node:test';
import assert from 'node:assert/strict';
import { equalAffiliatePool } from '../lib/affiliates/equal-pool.ts';
import { encodeScrambledRank } from '@manekineko/contract-abi/scrambled-rank';
import { validateAwards, type CollectionAward } from '../lib/collections/awards.ts';
import { buildHistoryResponse } from '../lib/history/model.ts';
import { validateHistoryCollection } from '../lib/history/validation.ts';
import { validateCollection } from '../lib/collections/validation.ts';
import { collectionResponse, historyResponse } from '../lib/live-data/responses.ts';
import type { CollectionPublic } from '../lib/collections/model.ts';
import type { AffiliateProgram } from '../lib/affiliates/types.ts';
import { scheduledMintRecheckDelay } from '../lib/affiliates/scheduled-mint.ts';
import { collectionProgress } from '../lib/collections/presentation.ts';

const price='10000000000000000';
test('ten enrollment positions and four qualifying affiliates share equally, with vacancies earning nothing',()=>{
 const growth=equalAffiliatePool([167,167,167,167,0,0,0,0,0,0],100,price,1000,2000,3000);
 assert.deepEqual(growth,{qualifiedCount:4,equalShareWei:'500000000000000000',distributedWei:'2000000000000000000',unallocatedWei:'0'});
 const standard=equalAffiliatePool([100,100,100,100,0,0,0,0,0,0],100,price,1000,1000,3000);
 assert.equal(standard.equalShareWei,'250000000000000000');
});
test('minimum referral floor and common cap prevent enrollment-only payouts and disproportionate payouts',()=>{
 assert.equal(equalAffiliatePool([0,99,1],100,price,1000,2000,3000).qualifiedCount,0);
 const capped=equalAffiliatePool([100,180,200,150],100,price,1000,2000,3000);
 assert.equal(capped.equalShareWei,'300000000000000000'); assert.equal(capped.unallocatedWei,'800000000000000000');
 assert.equal(equalAffiliatePool([100],100,price,1000,2000,3000).equalShareWei,'300000000000000000');
 assert.throws(()=>equalAffiliatePool([1001],100,price,1000,2000,3000));
});
const wallet='0x'+ '1'.repeat(40),key='0x'+'42'.repeat(32), hash='0x'+'3'.repeat(64);
function award(rank:number,claimed=false):CollectionAward {
 const sample=encodeScrambledRank(1001-rank,key);
 return {rank,tokenId:rank===1?231:897,score:sample.score,amountWei:rank===1?'4000000000000000000':'2000000000000000000',numbers:sample.numbers,combinationCode:sample.combinationCode,combinationKey:key,
 currentHolder:wallet,claimed,winningHolder:claimed?wallet:null,recipient:claimed?wallet:null,determinedAt:'2026-09-19T12:00:00Z',paidAt:claimed?'2026-09-19T12:10:00Z':null,claimTransaction:claimed?hash:null};
}
const collection:CollectionPublic={contractVersion:'affiliate-v7',algorithmVersion:'unique-rank-v4',randomnessProvider:'chainlink-vrf-v2.5',randomnessState:'fulfilled',randomnessRequestId:'1',
 id:'123e4567-e89b-42d3-a456-426614174000',seriesId:'123e4567-e89b-42d3-a456-426614174001',slug:'test-v7',name:'Test V7',symbol:'TEST',description:'',roundId:'1',chainId:1,networkName:'Ethereum',nativeCurrency:{symbol:'ETH',decimals:18},explorerUrl:'https://etherscan.io',contractStatus:'deployed',contractAddress:wallet,mode:'live',source:'postgres',
 maxSupply:1000,mintPriceWei:price,mintDurationSeconds:86400,mintDeadline:'2026-09-20T12:00:00Z',saleStartAt:'2026-09-19T10:00:00Z',revealDelayBlocks:null,maxMintBatch:20,prizeBps:6000,secondPrizeBps:2000,affiliatePoolBps:2000,minAffiliateReferrals:100,affiliatePayoutCapBps:3000,scoreFormula:'scoreCombination([a,b,c,d])',totalMinted:1000,totalMintRevenueWei:'10000000000000000000',phase:'awaiting_prize',prizePaid:false,updatedAt:'2026-09-19T12:00:00Z',awards:[award(1),award(2)]};
test('V7 results expose two distinct ranked awards before either holder claims',()=>{
 assert.equal(collectionResponse({collection}).awards?.length,2);
 for(const awards of [[award(1)], [award(1),{...award(2),tokenId:231}], [award(1),{...award(2),amountWei:'1'}], [award(1),{...award(2,true),paidAt:'invalid'}]]) assert.throws(()=>validateAwards(awards,1000,collection.totalMintRevenueWei,6000,2000));
 assert.throws(()=>validateCollection({...collection,prizePaid:true,phase:'complete'}));
});
test('fixed launch time schedules verification, retries while chain clock catches up, and stops after opening',()=>{
 const now=Date.parse('2026-09-19T09:00:00Z');
 const program={contractVersion:'affiliate-v7',saleStartAt:collection.saleStartAt,mintDeadline:collection.mintDeadline,saleActivated:true,soldOut:false,refundable:false,readiness:{canMint:false}} as AffiliateProgram;
 assert.equal(scheduledMintRecheckDelay(program,now),3_601_000);
 assert.equal(scheduledMintRecheckDelay(program,now+3_700_000),15_000);
 assert.equal(scheduledMintRecheckDelay({...program,readiness:{...program.readiness,canMint:true}},now),null);
 assert.equal(scheduledMintRecheckDelay({...program,soldOut:true},now),null);
 assert.equal(scheduledMintRecheckDelay({...program,contractVersion:'affiliate-v6'},now),null);
 assert.equal(scheduledMintRecheckDelay(program,Date.parse(collection.mintDeadline!)),null);
 assert.equal(collectionProgress({...collection,phase:'minting'},now).label,'Scheduled');
 assert.equal(collectionProgress({...collection,phase:'minting'},now+3_600_000).label,'Mint open');
 assert.equal(collectionProgress(collection,now).label,'Prizes available');
});
test('history counts individual claims once and archives both awards only after both are paid',()=>{
 const partial={...collection,awards:[award(1),award(2,true)]};
 const inProgress=buildHistoryResponse([], [partial]);
 assert.equal(inProgress.collections.length,0);assert.equal(inProgress.stats.completedCount,0);assert.equal(inProgress.stats.currencies[0].totalPrizePaidWei,'2000000000000000000');
 const complete={...collection,phase:'complete' as const,prizePaid:true,awards:[award(1,true),award(2,true)]};
 const result=buildHistoryResponse([], [complete]);
 assert.equal(result.collections.length,1);assert.equal(result.inProgress.length,0);assert.equal(result.stats.completedCount,1);
 assert.equal(result.stats.uniqueWinners,1);assert.equal(result.stats.currencies[0].totalPrizePaidWei,'6000000000000000000');
 assert.equal(validateHistoryCollection(result.collections[0]).awards?.[1].rank,2);
 assert.deepEqual(historyResponse(result).stats,result.stats);
});
test('V7 refunds remain in progress until every minted ticket has a verified refund',()=>{
 const partial:CollectionPublic={...collection,awards:[],phase:'refundable',totalMinted:5,totalMintRevenueWei:'50000000000000000',randomnessState:'not_requested',randomnessRequestId:null,refundedCount:2,totalRefundedWei:'20000000000000000',refundedAt:null};
 assert.equal(validateCollection(partial).refundedCount,2);
 const progress=buildHistoryResponse([], [partial]);
 assert.equal(progress.collections.length,0);assert.equal(progress.stats.currencies[0].totalRefundedWei,partial.totalRefundedWei);
 const complete={...partial,refundedCount:5,totalRefundedWei:partial.totalMintRevenueWei,refundedAt:'2026-09-20T12:10:00Z'};
 const result=buildHistoryResponse([], [validateCollection(complete)]);
 assert.equal(result.inProgress.length,0);assert.equal(result.stats.refundedCount,1);assert.equal(result.stats.currencies[0].totalRefundedWei,partial.totalMintRevenueWei);
 assert.equal(validateHistoryCollection(result.collections[0]).winner,null);
 assert.deepEqual(historyResponse(result).stats,result.stats);
 assert.throws(()=>validateCollection({...complete,refundedCount:2}));
});
