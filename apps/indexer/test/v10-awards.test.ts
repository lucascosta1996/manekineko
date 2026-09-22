import test from 'node:test';
import assert from 'node:assert/strict';
import { Interface, ZeroAddress, type JsonRpcProvider, type Log } from 'ethers';
import abi from '@manekineko/contract-abi/round-v10' with { type: 'json' };
import { encodePermanentCombination } from '@manekineko/contract-abi/permanent-combinations';
import { encodeScrambledRank } from '@manekineko/contract-abi/scrambled-rank';
import { verifyAward, type AwardEvent } from '../lib/awards.ts';
import { assertCollectionVersion, decodeEvent, RpcChainReader } from '../lib/chain.ts';
import { readIndexerConfig } from '../lib/config.ts';
import type { AwardSnapshot, RegisteredCollection } from '../lib/types.ts';

const wallet=`0x${'1'.repeat(40)}`, hash=`0x${'2'.repeat(64)}`, key=`0x${'42'.repeat(32)}`;
const collection={contractVersion:'affiliate-v10',algorithmVersion:'unique-rank-v6',address:wallet,maxSupply:1000,mintPrice:'10000000000000000',prizeBps:6000,winnerCount:6} as RegisteredCollection;
const identity=encodePermanentCombination(500,key);
const award:AwardSnapshot={rank:6,tokenId:500,score:'995',amountWei:'1000000000000000000',claimed:true,holder:wallet,winningHolder:wallet,paidAt:1800357000,numbers:identity.numbers,code:identity.combinationCode,key};
const result:AwardEvent={transaction_hash:hash,block_timestamp:new Date(1800356000*1000),arguments:{rank:'6',tokenId:'500',score:'995',amount:award.amountWei}};
const claim:AwardEvent={transaction_hash:hash,block_timestamp:new Date(1800357000*1000),arguments:{rank:'6',tokenId:'500',holder:wallet,recipient:wallet,amount:award.amountWei}};

test('V10 award verification decodes identity independently from the finalized rank',()=>{
  assert.equal(verifyAward(collection,award,[result],[claim]).claim,claim);
  const oldEncoding=encodeScrambledRank(995,key);
  assert.throws(()=>verifyAward(collection,{...award,numbers:oldEncoding.numbers,code:oldEncoding.combinationCode},[result],[claim]),/winner_accounting_mismatch/);
  assert.throws(()=>verifyAward(collection,{...award,score:'500'},[result],[claim]),/winner_accounting_mismatch/);
  assert.throws(()=>verifyAward(collection,{...award,tokenId:501},[result],[claim]),/winner_accounting_mismatch/);
  assert.throws(()=>verifyAward(collection,award,[result],[]),/award_claim_event_mismatch/);
});
test('V10 exact algorithm and independent factory pins are mandatory',()=>{
  assertCollectionVersion(collection);
  assert.throws(()=>assertCollectionVersion({...collection,algorithmVersion:'unique-rank-v5'}));
  assert.throws(()=>assertCollectionVersion({...collection,contractVersion:'affiliate-v9'}));
  const env={DATABASE_URL:'postgres://localhost/test',INDEXER_RPC_URL:'https://rpc.example',INDEXER_CONTRACT_VERSION:'affiliate-v10',INDEXER_V9_TRUSTED_FACTORY:wallet,INDEXER_V9_TRUSTED_FACTORY_CODEHASH:hash};
  assert.throws(()=>readIndexerConfig(env));
  assert.equal(readIndexerConfig({...env,INDEXER_V10_TRUSTED_FACTORY:wallet,INDEXER_V10_TRUSTED_FACTORY_CODEHASH:hash}).contractVersion,'affiliate-v10');
});
test('V10 logs preserve token identity and independent award score',()=>{
  const iface=new Interface(abi),encoded=iface.encodeEventLog(iface.getEvent('AwardDetermined')!,[6,500,995,award.amountWei]);
  const event=decodeEvent({address:wallet,blockHash:hash,blockNumber:100,transactionHash:hash,transactionIndex:0,index:1,removed:false,...encoded} as unknown as Log,{number:100,hash,timestamp:1800357000},'affiliate-v10');
  assert.equal(event.args.tokenId,'500');assert.equal(event.args.score,'995');
});
test('V10 canonical snapshot waits for finalized scores and verifies six permanent identities',async()=>{
  const iface=new Interface(abi), block={number:100,hash,timestamp:1800357000};
  const config=readIndexerConfig({DATABASE_URL:'postgres://localhost/test',INDEXER_RPC_URL:'https://rpc.example',INDEXER_CONTRACT_VERSION:'affiliate-v10',INDEXER_V10_TRUSTED_FACTORY:wallet,INDEXER_V10_TRUSTED_FACTORY_CODEHASH:hash});
  let finalized=false,wrongIdentity=false;
  const calls:string[]=[];
  const provider={send:async(method:string,args:any[])=>{
    assert.equal(method,'eth_call');assert.deepEqual(args[1],{blockHash:hash,requireCanonical:true});
    const call=iface.parseTransaction({data:args[0].data})!;calls.push(call.name);
    const values:Record<string,unknown>={phase:finalized?5:4,totalMinted:1000,totalMintRevenue:10000000000000000000n,refundedCount:0,totalRefunded:0,randomnessRequested:true,randomnessReceived:true,requestId:1,randomWord:55,revealed:finalized,winningTokenId:finalized?301:0,highestScore:finalized?1000:0,prizePaid:false,prizeRecipient:ZeroAddress,prizePaidAmount:0,soldOutAt:1800350000,awardCount:6,combinationKey:key,prizeAmountForRank:1000000000000000000n,prizeClaimed:false,ownerOf:wallet,awardHolder:ZeroAddress,awardPaidAt:0};
    if(call.name==='winningTokenIds')return iface.encodeFunctionResult(call.name,[300+Number(call.args[0])]);
    if(call.name==='combination') {
      const token=Number(call.args[0]),combo=encodePermanentCombination(wrongIdentity?token+1:token,key);
      return iface.encodeFunctionResult(call.name,[combo.numbers,combo.combinationCode,1301-token]);
    }
    assert(call.name in values,`Unexpected getter ${call.name}`);return iface.encodeFunctionResult(call.name,[values[call.name]]);
  }} as unknown as JsonRpcProvider;
  const pending=await new RpcChainReader(provider,config).snapshot(collection,block);
  assert.equal(pending.settledCount,0);assert.equal(pending.winningTokenId,null);assert.deepEqual(pending.awards,[]);
  assert(!calls.includes('combination'),'VRF fulfillment is not finalization');
  finalized=true;
  const final=await new RpcChainReader(provider,config).snapshot(collection,block);
  assert.equal(final.awards?.length,6);assert.equal(final.awards?.[0].tokenId,301);assert.equal(final.awards?.[0].score,'1000');
  wrongIdentity=true;
  await assert.rejects(()=>new RpcChainReader(provider,config).snapshot(collection,block),/winner_accounting_mismatch/);
});
