import test from 'node:test';
import assert from 'node:assert/strict';
import { Interface, parseEther } from 'ethers';
import { operatorActions } from '../../packages/protocol/src/operator-actions.ts';
import { controllerAbi, roundAbi, type Snapshot } from '../../packages/protocol/src/chain.ts';
import { validateProtocolConfig } from '../../packages/protocol/src/config.ts';
import mainnet from '../../apps/launch/catalog/mainnet.json' with { type: 'json' };
import sepolia from '../../apps/launch/catalog/sepolia.json' with { type: 'json' };
import { loadNamedSeasonCatalog } from '../season-catalog.mjs';
import { collectionTiming } from '../../packages/protocol/src/timing.ts';
const config={chainId:11155111,controller:'0x'+'11'.repeat(20),codeHash:'0x'+'77'.repeat(32),rpcUrl:'https://rpc.example.com'};
const state={operator:'0x'+'22'.repeat(20),credits:'0x'+'33'.repeat(20),count:1,catalogCount:216,sealed:true,cost:parseEther('0.03'),operatingBalance:0n,canPrepare:false,round:null} as unknown as Snapshot;
test('queues no fake activation during a live sale and funds only the exact preparation shortfall',()=>{
 assert.deepEqual(operatorActions(state,config),[]);
 const fund=operatorActions({...state,canPrepare:true,operatingBalance:parseEther('0.01')},config);
 assert.equal(fund.length,1);assert.equal(fund[0].id,'prepare');assert.equal(new Interface(controllerAbi).parseTransaction(fund[0].request)?.name,'prepareNext');assert.equal(fund[0].request.value,parseEther('0.02'));
 const prep=operatorActions({...state,canPrepare:true,operatingBalance:state.cost},config);
 assert.equal(new Interface(controllerAbi).parseTransaction(prep[0].request)?.name,'prepareNext');
});
test('operator proceeds stay distinct from protected liabilities and use the fixed recipient',()=>{
 const round={address:'0x'+'44'.repeat(20),phase:5,operatorAvailable:parseEther('4'),reserve:parseEther('16'),growth:0n,sponsorship:0n,subscriptionClosed:true} as Snapshot['round'];
 const actions=operatorActions({...state,round},config);assert.equal(actions.length,1);assert.equal(actions[0].operatorOnly,true);
 const parsed=new Interface(roundAbi).parseTransaction(actions[0].request)!;
 assert.equal(parsed.name,'withdrawOperator');assert.equal(parsed.args[0].toLowerCase(),state.operator);assert.equal(parsed.args[1],parseEther('4'));
 assert.equal(operatorActions({...state,round:{...round!,phase:1,operatorAvailable:0n}},config).length,0);
});
test('public deployment pins fail closed on wrong network, hash and private endpoints',()=>{
 assert.equal(validateProtocolConfig(config).chainId,11155111);
 for(const patch of [{chainId:31337},{codeHash:'0x00'},{rpcUrl:'https://user:secret@example.com'},{rpcUrl:'http://example.com'},{websocketUrl:'ws://example.com'}]) assert.throws(()=>validateProtocolConfig({...config,...patch}));
});
test('latest draw has one primary settlement action with fixed proceeds and exact funding; fallbacks stay available',()=>{
 const round={id:1,address:'0x'+'44'.repeat(20),phase:4,canFinalize:true,operatorRemaining:parseEther('2'),operatorAvailable:0n,reserve:parseEther('8'),growth:0n,sponsorship:0n,subscriptionClosed:false} as Snapshot['round'];
 const actions=operatorActions({...state,round},config), primary=actions.filter(a=>!a.secondary);
 assert.equal(primary.length,1);assert.equal(primary[0].id,'settle');assert.equal(primary[0].operatorOnly,true);
 assert.equal(primary[0].request.value,state.cost);
 const parsed=new Interface(controllerAbi).parseTransaction(primary[0].request)!;
 assert.equal(parsed.name,'settleAndPrepare');assert.equal(parsed.args[0],1n);assert.equal(parsed.args[1],parseEther('2'));
 assert(actions.some(a=>a.id==='finalize'&&a.secondary&&!a.operatorOnly));
 const progress=operatorActions({...state,round:{...round!,canFinalize:false}},config);
 assert(!progress.some(a=>a.id==='settle'));assert(progress.some(a=>a.id==='finalize'&&!a.secondary));
 assert(!operatorActions({...state,round:{...round!,id:0}},config).some(a=>a.id==='settle'));
 assert.equal(operatorActions({...state,catalogCount:1,round},config).find(a=>a.id==='settle')?.request.value,0n);
});
test('timers distinguish randomness cutoff, recorded entropy and both refund reasons without inventing availability',()=>{
 const round={phase:1,deadline:100n,start:10n,voteStart:5n,soldOutAt:90n,randomnessDeadline:200n} as Snapshot['round'];
 assert.equal(collectionTiming(round!,99).value,'00:00:01');
 const reached=collectionTiming(round!,101);assert.equal(reached.value,'00:00:00');assert.match(reached.detail,/Checking whether/);
 for(const phase of [2,3]) {
  const t=collectionTiming({...round!,phase},199); assert.equal(t.label,'Randomness deadline in'); assert.equal(t.value,'00:00:01');
  assert.match(t.detail,/full mint-price refunds become available/);
  const expired=collectionTiming({...round!,phase},201); assert.equal(expired.value,'00:00:00'); assert.match(expired.detail,/Checking the contract/);
 }
 for(const phase of [4,5,6]){const t=collectionTiming({...round!,phase},210);assert.equal(t.label,'Time since sellout');assert.match(t.detail,/refunds unavailable/);}
 assert.equal(collectionTiming({...round!,phase:7},210).value,'No expiration');
 assert.match(collectionTiming({...round!,phase:7},210).detail,/No randomness was recorded/);
 for(const soldOutAt of [0n,90n]) for(const now of [210,210+10*365*86400]) {
  const refund=collectionTiming({...round!,phase:7,soldOutAt},now);
  assert.equal(refund.label,'Refunds available');assert.equal(refund.value,'No expiration');
  assert.match(refund.detail,/no claim deadline/);
 }
 assert.equal(collectionTiming(round!,99,true).value,'—');
 assert.equal(collectionTiming({...round!,phase:0},4).label,'Voting opens in');
 assert.equal(collectionTiming({...round!,phase:0},6).label,'Minting opens in');
});
test('V12 testnet mirrors all 22 seasons and 216 colors without reusing Mainnet identities',async()=>{
 const canonical=await loadNamedSeasonCatalog();assert.equal(mainnet.seasons.length,22);assert.equal(sepolia.seasons.length,22);
 const productionNames=new Set(mainnet.seasons.flatMap(s=>[s.name,...s.collections.map(c=>c.name)]));
 const ids=new Set<string>(),names=new Set<string>(); let count=0;
 for(let i=0;i<22;i++){
  const m=mainnet.seasons[i],s=sepolia.seasons[i];assert.equal(m.name,canonical[i].theme);assert.notEqual(m.seasonId,s.seasonId);
  assert(!ids.has(s.seasonId));ids.add(s.seasonId);assert(!productionNames.has(s.name));
  assert.deepEqual(m.collections.map(c=>c.name),canonical[i].namedCollections.map((c:{name:string})=>c.name));
  assert.deepEqual(s.collections.map(c=>c.color),canonical[i].collections);
  assert.deepEqual(s.collections.map(c=>c.textColor),m.collections.map(c=>c.textColor));
  for(const c of s.collections){assert(!productionNames.has(c.name));assert(!names.has(c.name));names.add(c.name);count++;}
 }assert.equal(count,216);
});
