import test from 'node:test';
import assert from 'node:assert/strict';
import { Interface, keccak256 } from 'ethers';
import abi from '@manekineko/contract-abi/round-v7' with {type:'json'};
import { prepareRankedPrizeClaim } from '../lib/prizes/wallet.ts';
import type { WalletSession, ContractTarget } from '../lib/affiliates/wallet.ts';
const wallet='0x'+'1'.repeat(40),address='0x'+'2'.repeat(40),code='0x6001',iface=new Interface(abi);
const target:ContractTarget={chainId:11155111,contractAddress:address,contractVersion:'affiliate-v7',runtimeCodeHash:keccak256(code),mintPriceWei:'10000000000000000',maxSupply:1000,maxAffiliateSlots:10,prizeBps:6000,secondPrizeBps:2000,affiliatePoolBps:2000,affiliateRatesBps:[],minAffiliateReferrals:100,affiliatePayoutCapBps:3000};
function fixture(options:Record<string,unknown>={}){
 const calls:string[]=[];
 const values:Record<string,unknown>={CONTRACT_VERSION:'affiliate-v7',ALGORITHM_VERSION:'unique-rank-v4',mintPrice:10000000000000000n,maxSupply:1000n,maxAffiliateSlots:10n,prizeBps:6000n,secondPrizeBps:2000n,affiliatePoolBps:2000n,minAffiliateReferrals:100n,affiliatePayoutCapBps:3000n,winningTokenIds:897n,prizeClaimed:false,prizeAmountForRank:2000000000000000000n,ownerOf:wallet,...options};
 const session={address:wallet,chainId:11155111,injected:{request:async({method}:{method:string})=>method==='eth_chainId'?'0xaa36a7':[wallet]},provider:{getCode:async()=>code},signer:{call:async(tx:{data:string})=>{
  const call=iface.parseTransaction(tx)!;calls.push(call.name);
  if(call.name==='claimPrizeForRank'){assert.equal(call.args[0],2n);assert.equal(call.args[1].toLowerCase(),wallet);return iface.encodeFunctionResult(call.name,[]);}
  return iface.encodeFunctionResult(call.name,[values[call.name]]);
 },sendTransaction:()=>{throw Error('Preflight must not submit');}}}as unknown as WalletSession;
 return {session,calls};
}
const award={rank:2,tokenId:897,amountWei:'2000000000000000000'};
test('second prize preflight verifies live holder and protected amount then simulates exact gas-only claim',async()=>{
 const f=fixture(),request=await prepareRankedPrizeClaim(f.session,target,award);
 assert.equal(request.value,0n);const decoded=iface.parseTransaction({data:String(request.data)})!;assert.equal(decoded.name,'claimPrizeForRank');assert.equal(decoded.args[0],2n);assert.equal(decoded.args[1].toLowerCase(),wallet);assert.ok(f.calls.includes('ownerOf'));assert.equal(f.calls.at(-1),'claimPrizeForRank');
});
test('non-holder, already paid, substituted rank and changed economics fail before simulation',async()=>{
 for(const options of [{ownerOf:address},{prizeClaimed:true},{winningTokenIds:898n},{prizeAmountForRank:1n},{minAffiliateReferrals:99n},{ALGORITHM_VERSION:'unique-rank-v3'}]){
  const f=fixture(options);await assert.rejects(prepareRankedPrizeClaim(f.session,target,award));assert.ok(!f.calls.includes('claimPrizeForRank'));
 }
 await assert.rejects(prepareRankedPrizeClaim(fixture().session,target,{...award,rank:3}));
});
