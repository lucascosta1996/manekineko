import test from 'node:test';
import assert from 'node:assert/strict';
import { Interface, type Log } from 'ethers';
import abi from '@manekineko/contract-abi/round-v8' with {type:'json'};
import { encodeScrambledRank } from '@manekineko/contract-abi/scrambled-rank';
import { verifyAward, type AwardEvent } from '../lib/awards.ts';
import { assertCollectionVersion, decodeEvent } from '../lib/chain.ts';
import { readIndexerConfig } from '../lib/config.ts';
import type { AwardSnapshot, RegisteredCollection } from '../lib/types.ts';
const wallet='0x'+'1'.repeat(40),hash='0x'+'2'.repeat(64),key='0x'+'42'.repeat(32);
const collection={contractVersion:'affiliate-v8',algorithmVersion:'unique-rank-v5',maxSupply:1000,mintPrice:'10000000000000000',prizeBps:6000,winnerCount:6} as RegisteredCollection;
const sample=encodeScrambledRank(995,key);
const award:AwardSnapshot={rank:6,tokenId:500,score:'995',amountWei:'1000000000000000000',claimed:true,holder:wallet,winningHolder:wallet,paidAt:1800357000,numbers:sample.numbers,code:sample.combinationCode,key};
const result:AwardEvent={transaction_hash:hash,block_timestamp:new Date(1800356000*1000),arguments:{rank:'6',tokenId:'500',score:'995',amount:award.amountWei}};
const claim:AwardEvent={transaction_hash:hash,block_timestamp:new Date(1800357000*1000),arguments:{rank:'6',tokenId:'500',holder:wallet,recipient:wallet,amount:award.amountWei}};
test('rank six claims verify without requiring primary prize payment',()=>{
 assert.equal(verifyAward(collection,award,[result],[claim]).claim,claim);
 assert.equal(verifyAward(collection,{...award,claimed:false,winningHolder:null,paidAt:null},[result],[]).claim,null);
 for(const changed of [{...claim,arguments:{...claim.arguments,amount:'1'}},{...claim,arguments:{...claim.arguments,rank:'1'}},{...claim,block_timestamp:new Date()}]) assert.throws(()=>verifyAward(collection,award,[result],[changed]));
 assert.throws(()=>verifyAward(collection,award,[result,result],[claim]));
 assert.throws(()=>verifyAward(collection,{...award,score:'1000'},[result],[claim]));
});
test('ranked claim logs from any transaction origin decode into the same canonical event',()=>{
 const iface=new Interface(abi), encoded=iface.encodeEventLog(iface.getEvent('AwardClaimed')!,[6,500,wallet,wallet,award.amountWei]);
 const event=decodeEvent({address:wallet,blockHash:hash,blockNumber:100,transactionHash:hash,transactionIndex:0,index:1,removed:false,...encoded} as unknown as Log,{number:100,hash,timestamp:1800357000},'affiliate-v8');
 assert.equal(event.name,'AwardClaimed');assert.equal(event.args.rank,'6');assert.equal(event.args.tokenId,'500');
 assertCollectionVersion(collection);assert.throws(()=>assertCollectionVersion({...collection,algorithmVersion:'unique-rank-v3'}));
});
test('V8 indexer rejects inherited V5 and V6 factory pins',()=>{
 const env={DATABASE_URL:'postgres://localhost/test',INDEXER_RPC_URL:'https://rpc.example',INDEXER_CONTRACT_VERSION:'affiliate-v8',INDEXER_TRUSTED_FACTORY:wallet,INDEXER_TRUSTED_FACTORY_CODEHASH:hash,INDEXER_V6_TRUSTED_FACTORY:wallet,INDEXER_V6_TRUSTED_FACTORY_CODEHASH:hash};
 assert.throws(()=>readIndexerConfig(env));
 assert.equal(readIndexerConfig({...env,INDEXER_V8_TRUSTED_FACTORY:wallet,INDEXER_V8_TRUSTED_FACTORY_CODEHASH:hash}).contractVersion,'affiliate-v8');
});
