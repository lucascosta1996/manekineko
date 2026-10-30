import assert from 'node:assert/strict';
import { test } from 'node:test';
import { message, STAGES, collectionStages } from '../../../packages/contracts/src/tincta-social-content.ts';
import { senderProviders, confirmedAnchor } from '../lib/social-sender-chain.ts';
import type { Provider } from 'ethers';
const input={chainId:1 as const,id:1,appUrl:'https://app.tincta.xyz',timestamp:100,season:{id:'0x'+'1'.repeat(64),number:1,name:'Crimson & Blood Orange',colors:['#330000']},collection:{id:'1',number:1,name:'Velvet Ember',color:'#330000',supply:1000,mintPriceEth:'0.01',winnerCount:6,prizePerWinnerEth:'1'}};
test('production milestone copy is Mainnet-only, preserves names, and uses production Genesis and timeout rules',()=>{
 for(const stage of STAGES){const m=message({...input,stage});assert.doesNotMatch(JSON.stringify(m),/v17|manekineko|sepolia|15 minutes|20 NFTs/i);assert.match(m.post,/Tincta/);assert.throws(()=>message({...input,stage,chainId:11155111}),/Mainnet/);}
 assert.match(message({...input,stage:'genesis-open'}).post,/1,000 NFTs/);
 assert.match(message({...input,stage:'draw-refunds'}).post,/72 hours/);
});
test('timeout milestones cannot be emitted on the accelerated schedule or after committed entropy',()=>{
 const r={voteStart:1n,saleStart:86401n,deadline:172801n,soldOutAt:86500n,entropyAt:0n,finalizedAt:0n,prizesClaimed:0n,winners:6n};
 assert.equal(collectionStages(r,86500n+900n).includes('draw-refunds'),false);
 assert.equal(collectionStages(r,86500n+259200n).includes('draw-refunds'),true);
 assert.equal(collectionStages({...r,entropyAt:90000n},86500n+259200n).includes('draw-refunds'),false);
});
test('Mainnet delivery cannot reuse Sepolia RPC credentials or accept Sepolia anchors',async()=>{
 const env={NODE_ENV:'test' as const,SOCIAL_RPC_PRIMARY:'https://sepolia-a.invalid',SOCIAL_RPC_SECONDARY:'https://sepolia-b.invalid'};
 assert.throws(()=>senderProviders(env,1),/rpc_configuration/);
 const providers=senderProviders({...env,SOCIAL_MAINNET_RPC_PRIMARY:'https://mainnet-a.invalid',SOCIAL_MAINNET_RPC_SECONDARY:'https://mainnet-b.invalid'},1);providers.forEach(p=>p.destroy());
 const p={getNetwork:async()=>({chainId:11155111n})} as unknown as Provider;
 await assert.rejects(confirmedAnchor([p,p],Date.now(),1),/network_mismatch/);
});
