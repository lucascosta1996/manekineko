import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeScrambledRank } from '@manekineko/contract-abi/scrambled-rank';
import { validateAwards, type CollectionAward } from '../lib/collections/awards.ts';
import { buildHistoryResponse } from '../lib/history/model.ts';
import { validateCollection } from '../lib/collections/validation.ts';
import { collectionResponse, historyResponse } from '../lib/live-data/responses.ts';
import type { CollectionPublic } from '../lib/collections/model.ts';
const wallet='0x'+'1'.repeat(40), key='0x'+'42'.repeat(32),hash='0x'+'3'.repeat(64);
function award(rank:number,claimed=false):CollectionAward {
 const sample=encodeScrambledRank(1001-rank,key);
 return {rank,tokenId:230+rank,score:sample.score,amountWei:'1000000000000000000',numbers:sample.numbers,combinationCode:sample.combinationCode,combinationKey:key,
 currentHolder:wallet,claimed,winningHolder:claimed?wallet:null,recipient:claimed?wallet:null,determinedAt:'2026-09-19T12:00:00Z',paidAt:claimed?'2026-09-19T12:10:00Z':null,claimTransaction:claimed?hash:null};
}
const collection:CollectionPublic={contractVersion:'affiliate-v8',algorithmVersion:'unique-rank-v5',winnerCount:6,secondPrizeBps:null,randomnessProvider:'chainlink-vrf-v2.5',randomnessState:'fulfilled',randomnessRequestId:'1',
 id:'123e4567-e89b-42d3-a456-426614174000',seriesId:'123e4567-e89b-42d3-a456-426614174001',slug:'test-v8',name:'Test V8',symbol:'TEST',description:'',roundId:'1',chainId:1,networkName:'Ethereum',nativeCurrency:{symbol:'ETH',decimals:18},explorerUrl:'https://etherscan.io',contractStatus:'deployed',contractAddress:wallet,mode:'live',source:'postgres',
 maxSupply:1000,mintPriceWei:'10000000000000000',mintDurationSeconds:86400,mintDeadline:'2026-09-20T12:00:00Z',saleStartAt:'2026-09-19T10:00:00Z',revealDelayBlocks:null,maxMintBatch:20,prizeBps:6000,affiliatePoolBps:2000,minAffiliateReferrals:100,affiliatePayoutCapBps:3000,scoreFormula:'scoreCombination([a,b,c,d])',totalMinted:1000,totalMintRevenueWei:'10000000000000000000',phase:'awaiting_prize',prizePaid:false,updatedAt:'2026-09-19T12:00:00Z',awards:Array.from({length:6},(_,i)=>award(i+1))};
test('six equal prizes consume exactly six ETH and require six distinct consecutive winning ranks',()=>{
 assert.equal(collectionResponse({collection}).awards?.length,6);
 assert.equal(collection.awards!.reduce((sum,a)=>sum+BigInt(a.amountWei),0n),6000000000000000000n);
 for(const changed of [{winnerCount:0},{winnerCount:11},{winnerCount:7},{secondPrizeBps:2000},{awards:collection.awards!.slice(0,2)},{algorithmVersion:'unique-rank-v4'}]) assert.throws(()=>validateCollection({...collection,...changed} as CollectionPublic));
 const changed=collection.awards!.map(a=>({...a}));changed[5].tokenId=changed[0].tokenId;
 assert.throws(()=>validateAwards(changed,1000,collection.totalMintRevenueWei,6000,null,6));
 changed[5]=award(6);changed[5].amountWei='2000000000000000000';assert.throws(()=>validateAwards(changed,1000,collection.totalMintRevenueWei,6000,null,6));
});
test('sixth prize can be paid first and every payment is counted once without claiming the collection complete',()=>{
 const partial={...collection,awards:Array.from({length:6},(_,i)=>award(i+1,i===5))};
 const progress=buildHistoryResponse([], [validateCollection(partial)]);
 assert.equal(progress.stats.completedCount,0);assert.equal(progress.stats.currencies[0].totalPrizePaidWei,'1000000000000000000');
 assert.equal(progress.inProgress[0].awards?.[5].claimed,true);
 const complete={...collection,phase:'complete' as const,prizePaid:true,awards:Array.from({length:6},(_,i)=>award(i+1,true))};
 const result=buildHistoryResponse([], [validateCollection(complete)]);
 assert.equal(result.inProgress.length,0);assert.equal(result.collections[0].awards?.length,6);assert.equal(result.stats.uniqueWinners,1);
 assert.equal(result.stats.currencies[0].totalPrizePaidWei,'6000000000000000000');assert.deepEqual(historyResponse(result).stats,result.stats);
});
