import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Interface, getCreateAddress, type Provider } from 'ethers';
import coordinator from './fixtures/mainnet-coordinator.json' with { type: 'json' };
import build from '../../../packages/contracts/src/tincta-rewards-build.json' with { type: 'json' };
import { TINCTA_COORDINATOR, TINCTA_KEY_HASH, expectedTinctaRuntime, TINCTA_OPTIONS } from '../../../packages/protocol/src/tincta.ts';
import { assertCreationMatches, assertFreshReview, deploymentData, parseDeploymentIntent, recoverDeployment, reviewDeployment, walletCreationRequest, type DeploymentIntent } from '../../../packages/protocol/src/tincta-deployment.ts';
import { catalogPlans, assertCatalogPrefix, tinctaSetupActions } from '../../../packages/protocol/src/tincta-setup.ts';
import catalog from '../catalog/mainnet.json' with { type: 'json' };
import { safeLaunchDestination } from '../lib/launch-navigation.ts';
const address='0x1111111111111111111111111111111111111111',hash='0x'+'ab'.repeat(32),blockHash='0x'+'cd'.repeat(32),iface=new Interface(build.abi);
async function fixture() {
 const data=await deploymentData(address),root=getCreateAddress({from:address,nonce:7}),engine=getCreateAddress({from:root,nonce:1});
 const intent:DeploymentIntent={schema:1,chainId:1,from:address,nonce:7,data,createdAt:Date.now()};
 const state={chain:1n,pending:7,nonce:7,balance:10n**20n,gas:9138499n,stale:false,oracleConfig:coordinator.config,rootCode:expectedTinctaRuntime(root),engineCode:build.engineRuntime,tx:{from:address,to:null,nonce:7,chainId:1n,data,value:0n},receipt:{status:1,blockNumber:90,blockHash,contractAddress:root},missing:false,canonical:true};
 const provider={getNetwork:async()=>({chainId:state.chain}),getBlock:async(tag:string|number)=>({number:typeof tag==='number'?tag:100,hash:state.canonical?blockHash:'other',timestamp:Math.floor(Date.now()/1000)-(state.stale?500:0)}),
  getCode:async(a:string)=>a.toLowerCase()===TINCTA_COORDINATOR.toLowerCase()?coordinator.code:a.toLowerCase()===root.toLowerCase()?state.rootCode:a.toLowerCase()===engine.toLowerCase()?state.engineCode:'0x',
  getTransactionCount:async(_a:string,tag:string)=>tag==='pending'?state.pending:state.nonce,getBalance:async()=>state.balance,estimateGas:async()=>state.gas,getFeeData:async()=>({maxFeePerGas:2000000000n,maxPriorityFeePerGas:1000000000n}),
  getTransaction:async()=>state.missing?null:state.tx,getTransactionReceipt:async()=>state.missing?null:state.receipt,
  call:async(tx:{data:string;to:string})=>{if(tx.to?.toLowerCase()===TINCTA_COORDINATOR.toLowerCase())return state.oracleConfig;const f=iface.parseTransaction(tx)!;let value:unknown;
   if(f.name==='settings')value=[address,TINCTA_COORDINATOR,TINCTA_KEY_HASH,64n,200000n,60n,86400n,250000000000000000n,200000000000000000n];
   else if(f.name==='option')value=Object.values(TINCTA_OPTIONS[Number(f.args[0])]);
   else value=({CONTRACT_VERSION:'tincta-rewards-1',engine,GENESIS_SUPPLY:1000n,GENESIS_MAX_MINTS_PER_WALLET:2n,optionCount:3n,RANDOMNESS_TIMEOUT:259200n,EXECUTION_REWARD:10000000000000000n} as Record<string,unknown>)[f.name];
   return iface.encodeFunctionResult(f.name,f.name==='settings'?value as unknown[]:[value]);
  },
 } as unknown as Provider;
 return {state,provider,intent,root};
}
test('creation uses the selected operator, zero value, exact nonce and reviewed gas cap',async()=>{
 const f=await fixture(),review=await reviewDeployment(address,[f.provider,f.provider]);
 const tx=walletCreationRequest(review);assert.equal(tx.from,address);assert.equal(tx.nonce,'0x7');assert.equal(tx.value,'0x0');assert.ok(!('to' in tx));assert.equal(review.gas,'10509274');
 assert.equal((await parseDeploymentIntent(JSON.stringify(f.intent))).data,review.data);
 await assertFreshReview(review,address,[f.provider,f.provider]);
});
test('wrong chain, stale data, pending account transaction, inadequate balance and excessive gas block review',async()=>{
 for(const change of [{chain:11155111n},{stale:true},{pending:8},{balance:1n},{gas:16777216n}]){const f=await fixture();Object.assign(f.state,change);await assert.rejects(reviewDeployment(address,[f.provider,f.provider]));}
});
test('wallet/account changes, expired review, altered code and nonce changes require a fresh review',async()=>{
 const f=await fixture(),r=await reviewDeployment(address,[f.provider,f.provider]);
 await assert.rejects(assertFreshReview(r,'0x2222222222222222222222222222222222222222',[f.provider,f.provider]),/wallet changed/);
 await assert.rejects(assertFreshReview({...r,createdAt:Date.now()-91000},address,[f.provider,f.provider]),/expired/);
 await assert.rejects(assertFreshReview({...r,data:'0x1234'},address,[f.provider,f.provider]),/creation code/);
 f.state.nonce=8;await assert.rejects(assertFreshReview(r,address,[f.provider,f.provider]),/nonce changed/);
});
test('a changed oracle fee configuration blocks new spending but permits recovery of a deployed contract',async()=>{
 const f=await fixture(),r=await reviewDeployment(address,[f.provider,f.provider]);f.state.oracleConfig='0x'+'00'.repeat(288);
 await assert.rejects(reviewDeployment(address,[f.provider,f.provider]),/fees or request limits changed/);
 await assert.rejects(assertFreshReview(r,address,[f.provider,f.provider]),/fees or request limits changed/);
 assert.equal((await recoverDeployment(f.intent,hash,[f.provider,f.provider]))?.status,'deployed');
});
test('saved requests recover only the exact chain, sender, creation data, nonce and zero value',async()=>{
 const f=await fixture();assertCreationMatches(f.intent,f.state.tx);
 for(const change of [{to:address},{from:'0x2222222222222222222222222222222222222222'},{nonce:8},{chainId:11155111n},{data:'0x1234'},{value:1n}])assert.throws(()=>assertCreationMatches(f.intent,{...f.state.tx,...change}));
 for(const change of [{schema:2},{chainId:11155111},{data:'0x1234'},{nonce:-1},{hash:'bad'}])await assert.rejects(parseDeploymentIntent(JSON.stringify({...f.intent,...change})));
});
test('receipt recovery verifies exact immutable root, engine and settings through both readers',async()=>{
 const f=await fixture(),result=await recoverDeployment(f.intent,hash,[f.provider,f.provider]);assert.equal(result?.status,'deployed');assert.equal(result?.status==='deployed'&&result.address,f.root);
 f.state.engineCode='0x6000';await assert.rejects(recoverDeployment(f.intent,hash,[f.provider,f.provider]),/dependencies/);
});
test('pending, reverted, mismatched and reorganized receipts do not report deployment success',async()=>{
 const f=await fixture();f.state.missing=true;assert.equal(await recoverDeployment(f.intent,hash,[f.provider,f.provider]),null);
 f.state.missing=false;f.state.receipt.status=0;assert.equal((await recoverDeployment(f.intent,hash,[f.provider,f.provider]))?.status,'reverted');
 f.state.receipt.status=1;f.state.tx.nonce=8;await assert.rejects(recoverDeployment(f.intent,hash,[f.provider,f.provider]),/does not match/);
 f.state.tx.nonce=7;f.state.canonical=false;await assert.rejects(recoverDeployment(f.intent,hash,[f.provider,f.provider]),/canonical/);
});
test('setup is ordered, resumable and preserves the reviewed catalog identity',()=>{
 assert.equal(catalogPlans(catalog).length,216);assertCatalogPrefix(catalog,{chainId:1,seasons:[]});
 const changed=structuredClone(catalog);changed.seasons[0].collections[0].name='Wrong';assert.throws(()=>assertCatalogPrefix(catalog,changed),/differs/);
 const config={version:18 as const,chainId:1,controller:address,codeHash:hash,rpcUrl:'https://rpc.invalid'};
 const state={sealed:false,catalogCount:0,operatingBalance:0n,cost:460000000000000000n} as Parameters<typeof tinctaSetupActions>[0];
 assert.match(tinctaSetupActions(state,config,catalog)[0].title,/Upload collections 1–10/);
 assert.equal(tinctaSetupActions({...state,catalogCount:216},config,catalog)[0].request.value,state.cost);
 assert.equal(tinctaSetupActions({...state,catalogCount:216,operatingBalance:state.cost},config,catalog)[0].id,'open-genesis');
 assert.deepEqual(tinctaSetupActions({...state,sealed:true},config,catalog),[]);
 assert.equal(safeLaunchDestination('/deploy?chainId=1'),'/deploy?chainId=1');
});
