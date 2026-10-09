import test from 'node:test';
import assert from 'node:assert/strict';
import {Interface,Wallet,ZeroAddress,keccak256,type Provider} from 'ethers';
import {resolveFirstReviewCohort} from './review-bootstrap.ts';
test('third review collection derives ten still-owned NFTs from its completed first collection',async()=>{
 const source={round:'0x'+'11'.repeat(20),roundCodeHash:keccak256('0x6000'),deploymentBlock:10};
 const slots=Array.from({length:10},(_,i)=>({id:i+1,wallet:Wallet.createRandom().address,sourceTokenId:'999'}));
 const iface=new Interface(['function readyForNextRound() view returns(bool)','function ownerOf(uint256) view returns(address)','event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)']);
 let ready=true; const hash='0x'+'ab'.repeat(32);
 const provider={getCode:async()=> '0x6000',getBlock:async()=>({hash}),call:async(req:any)=>{const c=iface.parseTransaction(req)!;return iface.encodeFunctionResult(c.name,[c.name==='readyForNextRound'?ready:slots[Number(c.args[0])-1].wallet]);},getLogs:async(filter:any)=>{const slot=slots.find(s=>filter.topics[2].toLowerCase().endsWith(s.wallet.slice(2).toLowerCase()))!;const event=iface.encodeEventLog(iface.getEvent('Transfer')!,[ZeroAddress,slot.wallet,slot.id]);return [{...event,address:source.round,blockNumber:20,blockHash:hash,transactionHash:hash,transactionIndex:0,index:0,removed:false}];}} as unknown as Provider;
 (provider as any).provider=provider;
 const result=await resolveFirstReviewCohort(provider,source,{sourceCollection:'0x'+'22'.repeat(20),sourceCodeHash:source.roundCodeHash,slots,successfulIds:[1,2,3,4,5]},{number:30,hash});
 assert.equal(result.sourceCollection,source.round);assert.deepEqual(result.slots.map(s=>s.sourceTokenId),slots.map(s=>String(s.id)));
 ready=false;await assert.rejects(resolveFirstReviewCohort(provider,source,result,{number:30,hash}),/first_review_collection_not_complete/);
});
