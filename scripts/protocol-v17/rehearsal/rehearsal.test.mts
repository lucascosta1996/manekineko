import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Wallet } from 'ethers';
import { rehearsalPlan, digest, Hold, assertCustody, assertMintBudget } from './plan.mts';
import { createVault, readVault } from './vault.mts';
import { auditBalances } from './audit.mts';
import { RehearsalEngine, type RunState } from './engine.mts';
const release={version:17,chainId:11155111,sealed:false,prepared:0,genesisMints:0,address:'0x'+'1'.repeat(40),codeHash:'0x'+'2'.repeat(64),manifest:{rehearsal:true,settings:{},options:[{supply:'20',price:'100000000000000',winners:'6',duration:'600'},{supply:'40',price:'200000000000000',winners:'4',duration:'180'},{supply:'20',price:'100000000000000',winners:'10',duration:'600'}],catalog:Array.from({length:6},(_,i)=>({seasonId:i<3?'A':'B',name:`Fast ${i+1}`}))}};
test('separate six-collection plan covers every package sellout, both refunds, cross-season manual referrals and no-vote fallback',()=>{
 const p=rehearsalPlan(release,'a'.repeat(64));assert.equal(p.version,17);assert.equal(p.walletCount,11);assert.equal(p.scenarios.length,6);
 assert.equal(p.scenarios.filter(s=>s.outcome==='sellout').length,4);assert.equal(p.scenarios.filter(s=>s.outcome==='refund').length,2);
 for(let choice=0;choice<3;choice++)assert.ok(p.scenarios.some(s=>s.choice===choice&&s.outcome==='sellout'));
 assert.equal(p.scenarios.filter(s=>s.referrals==='manual').length,2);assert.equal(p.scenarios.filter(s=>s.noVotes).length,1);
 for(const changed of [{version:16},{chainId:1},{sealed:true},{prepared:1},{genesisMints:1},{manifest:{...release.manifest,rehearsal:false}}])assert.throws(()=>rehearsalPlan({...release,...changed},'a'.repeat(64)));
 assert.notEqual(digest(p),digest(rehearsalPlan(release,'b'.repeat(64))));
 assert.equal(assertMintBudget(release.manifest.options[1],'sellout',10n**16n,0n),8n*10n**15n);
 assert.throws(()=>assertMintBudget(release.manifest.options[1],'sellout',1n,0n),Hold);
 const a='0x'+'a'.repeat(40);assert.throws(()=>assertCustody({[a]:{}},a),Hold);
});
test('fresh encrypted vault has eleven distinct wallets, rejects another profile/key and cannot overwrite',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'v17-vault-'));try{
  const path=join(dir,'vault.json'),secret='7'.repeat(64),addresses=await createVault(path,secret),wallets=await readVault(path,secret);
  assert.equal(addresses.length,11);assert.equal(new Set(addresses).size,11);assert.equal((await stat(path)).mode&0o777,0o600);
  assert.deepEqual(wallets.map(w=>w.address),addresses);assert.ok(!(await readFile(path,'utf8')).includes(wallets[0].privateKey));
  await assert.rejects(readVault(path,'8'.repeat(64)));await assert.rejects(createVault(path,secret),{code:'EEXIST'});
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('independent accounting rejects a missing liability, insolvency and negative buckets; surplus ETH never erases a liability',()=>{
 const collection={execution:1n,sponsorship:2n,principal:3n,prizes:4n,affiliates:5n,treasury:6n,dust:7n},base={accounted:33n,balance:33n,operating:2n,holders:3n,collections:[collection]};
 assert.equal(auditBalances(base).passed,true);assert.equal(auditBalances({...base,accounted:32n}).passed,false);assert.equal(auditBalances({...base,balance:32n}).passed,false);
 assert.equal(auditBalances({...base,balance:34n}).unaccountedSurplusWei,'1');assert.equal(auditBalances({...base,holders:-3n}).passed,false);
});
test('parallel bank funding is serialized, and sibling bot failures settle before the batch returns',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'v17-queue-'));try{
  const p=rehearsalPlan(release,'a'.repeat(64)),wallets=Array.from({length:11},()=>new Wallet(Wallet.createRandom().privateKey));
  const e=new RehearsalEngine({plan:p,state:{} as RunState,directory:dir,provider:{} as any,secondary:{} as any,wallets,operator:wallets[0]});
  let active=0,max=0;const order:number[]=[];
  (e as any).fundNow=async(i:number)=>{active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,5));order.push(i);active--;};
  await Promise.all([e.fund(2,1n,'a'),e.fund(3,1n,'b'),e.fund(4,1n,'c')]);assert.equal(max,1);assert.deepEqual(order,[2,3,4]);
  let settled=false;await assert.rejects((e as any).batch([async()=>{throw new Error('injected');},async()=>{await new Promise(resolve=>setTimeout(resolve,10));settled=true;}]));assert.equal(settled,true);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('the reviewed native reserve rejects the former underfunding and unreviewed lane settings',async()=>{
 const {assertRandomnessReserve}=await import('./plan.mts');const settings={keyHash:'0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae',callbackGas:'200000'};
 assert.equal(assertRandomnessReserve(settings,'250000000000000000'),250000000000000000n);
 for(const reserve of [undefined,'10000000000000000','203304500000000000'])assert.throws(()=>assertRandomnessReserve(settings,reserve),Hold);
 assert.throws(()=>assertRandomnessReserve({...settings,callbackGas:'250000'},'250000000000000000'),Hold);
 assert.throws(()=>assertRandomnessReserve({...settings,keyHash:'0x'+'0'.repeat(64)},'250000000000000000'),Hold);
});
test('failed topups consume gas only; recovered VRF collateral is not reported as a negative fee',async()=>{
 const p=rehearsalPlan({...release,manifest:{...release.manifest,settings:{randomnessBudget:'10000000000000000'}}},'a'.repeat(64)),wallets=Array.from({length:11},()=>new Wallet(Wallet.createRandom().privateKey));
 const state={gasWei:'0',vrfFeesWei:'0',operatorBudgetWei:'100',accounted:[],recoveries:{'recover-vrf:1':'209800000000000000'}} as unknown as RunState;
 let value=200000000000000000n;const provider={getTransaction:async()=>({value,to:p.address})} as any;
 const e=new RehearsalEngine({plan:p,state,directory:'/unused',provider,secondary:provider,wallets,operator:wallets[0]});e.save=async()=>{};
 await (e as any).account(10,'fund-vrf-buffer:1',{hash:'failed',status:0,gasUsed:3n,gasPrice:4n,logs:[]});
 assert.equal(state.gasWei,'12');assert.equal(state.extraRandomnessFundingWei,undefined);
 await (e as any).account(10,'fund-vrf-buffer:1',{hash:'funded',status:1,gasUsed:3n,gasPrice:4n,logs:[]});
 assert.equal(state.extraRandomnessFundingWei?.[1],'200000000000000000');value=0n;
 await (e as any).account(-1,'recover-vrf:1',{hash:'recovered',status:1,gasUsed:3n,gasPrice:4n,logs:[]});
 assert.equal(state.vrfFeesWei,'200000000000000');assert.equal(state.gasWei,'36');
 await (e as any).account(-1,'recover-vrf:1',{hash:'recovered',status:1,gasUsed:3n,gasPrice:4n,logs:[]});assert.equal(state.gasWei,'36');
});
test('manual failure reconciliation requires two canonical matching failures, records gas once and never advances the checkpoint',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'v17-manual-failure-'));try{
  const p=rehearsalPlan(release,'a'.repeat(64)),wallets=Array.from({length:11},()=>Wallet.createRandom()),wallet=wallets[2].address,hash='0x'+'4'.repeat(64),blockHash='0x'+'5'.repeat(64);
  const gate={id:'prize:262158',instruction:'Claim the reserved prize.',wallet,walletIndex:2,request:{to:p.address,data:'0x12345678',value:'0'}};
  const state={gate,addresses:wallets.map(w=>w.address),custody:{[wallet.toLowerCase()]:{reason:'Manual claim'}},approvals:{},current:2,errors:[],gasWei:'0',operatorBudgetWei:'0',accounted:[],externalReceipts:[]} as unknown as RunState;
  const tx={from:wallet,to:p.address,data:gate.request.data,value:0n,nonce:15,chainId:11155111n},receipt={hash,status:0,blockNumber:100,blockHash,gasUsed:100n,gasPrice:3n,logs:[]};let secondaryReceipt={...receipt};
  const provider={getTransaction:async()=>tx,getTransactionReceipt:async()=>receipt,getBlock:async(tag:any)=>tag==='latest'?{number:102}:{hash:blockHash}},secondary={...provider,getTransactionReceipt:async()=>secondaryReceipt};
  const e=new RehearsalEngine({plan:p,state,directory:dir,provider:provider as any,secondary:secondary as any,wallets:wallets as any,operator:wallets[0] as any});
  secondaryReceipt={...receipt,status:1};await assert.rejects(e.acknowledgeFailure(gate.id,'Confirmed failure evidence',hash),/both RPCs/);assert.equal(state.gasWei,'0');assert.equal(state.failedManualTransactions,undefined);
  secondaryReceipt={...receipt,gasUsed:101n};await assert.rejects(e.acknowledgeFailure(gate.id,'Confirmed failure evidence',hash),/disagrees/);
  secondaryReceipt={...receipt};await e.acknowledgeFailure(gate.id,'Confirmed failure evidence',hash);await e.acknowledgeFailure(gate.id,'Confirmed failure evidence',hash);
  assert.equal(state.gasWei,'300');assert.equal(state.failedManualTransactions?.length,1);assert.equal(state.errors.length,1);assert.deepEqual(state.gate,gate);assert.deepEqual(state.approvals,{});assert.deepEqual(state.externalReceipts,[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('autonomous settlement refunds a bot first ticket but preserves guided defaults and imported-wallet custody',async()=>{
 const wallets=Array.from({length:11},()=>new Wallet(Wallet.createRandom().privateKey)),plan=rehearsalPlan(release,'a'.repeat(64));
 const scenario={...plan.scenarios[5],id:6,outcome:'refund' as const};
 for(const mode of ['guided','bot','imported'] as const){
  const owner=wallets[2].address,state={addresses:wallets.map(w=>w.address),custody:mode==='imported'?{[owner.toLowerCase()]:{reason:'Imported before continuation'}}:{},approvals:{},journals:{}} as unknown as RunState;
  const engine=new RehearsalEngine({plan,state,directory:'/unused',provider:{} as any,secondary:{} as any,wallets,operator:wallets[0]});
  const sends:number[]=[],manual:string[]=[],recipients:string[]=[];
  (engine as any).c={round:async()=>({finalizedAt:0n,minted:1n}),terms:async()=>({}),refundsAvailable:async()=>true,ownerOf:async()=>owner,refund:{populateTransaction:async(_token:bigint,recipient:string)=>{recipients.push(recipient);return{to:plan.address,data:'0x1234'};}}};
  engine.save=async()=>{};engine.manual=async(id)=>{manual.push(id);};
  (engine as any).send=async(index:number)=>{assertCustody(state.custody,engine.address(index));sends.push(index);return{};};
  await (engine as any).claim({...scenario,...(mode==='guided'?{}:{automatedSettlement:true})});
  if(mode==='bot'){assert.deepEqual(sends,[2]);assert.deepEqual(manual,[]);assert.deepEqual(recipients,[engine.bank()]);assert.deepEqual(state.custody,{});}
  else{assert.deepEqual(sends,[]);assert.deepEqual(manual,['refund:786433']);assert.deepEqual(recipients,[owner]);assert.ok(state.custody[owner.toLowerCase()]);}
 }
});

test('autonomous holder settlement uses only eligible bots and stops when imported holders are the only capacity',async()=>{
 const wallets=Array.from({length:11},()=>new Wallet(Wallet.createRandom().privateKey)),plan=rehearsalPlan(release,'a'.repeat(64));
 for(const botCapacity of [2,0]){
  const state={addresses:wallets.map(w=>w.address),custody:{[wallets[4].address.toLowerCase()]:{reason:'Imported winner'}},manualWinners:{}} as unknown as RunState;
  const engine=new RehearsalEngine({plan,state,directory:'/unused',provider:{} as any,secondary:{} as any,wallets,operator:wallets[0]});
  let claims=0;const sent:{index:number;recipient:string;token:bigint}[]=[],gates:string[]=[];let prepared:{recipient:string;token:bigint};
  (engine as any).c={holderSummary:async()=>({unlocked:true,limit:2n}),seasons:async()=>({first:4n,last:6n,claims:BigInt(claims)}),round:async(id:number)=>({finalizedAt:id===4?1n:0n,minted:3n}),holderClaimed:async()=>false,ownerOf:async(token:bigint)=>{const serial=Number(token&131071n);return wallets[serial===1||botCapacity===0?4:serial===2?3:5].address;},claimHolder:{populateTransaction:async(token:bigint,recipient:string)=>{prepared={recipient,token};return{to:plan.address,data:'0x1234'};}}};
  engine.ensureBalance=async()=>{};engine.gate=async(gate)=>{gates.push(gate.id);};engine.manual=async()=>{assert.fail('Autonomous mode must not fabricate a manual holder check');};
  (engine as any).send=async(index:number)=>{assertCustody(state.custody,engine.address(index));sent.push({index,...prepared});claims++;return{};};
  const operation=(engine as any).holders({...plan.scenarios[5],automatedSettlement:true});
  if(botCapacity===0){await assert.rejects(operation,(error:any)=>error instanceof Hold&&error.status==='holder-review');assert.deepEqual(sent,[]);assert.deepEqual(gates,[]);}
  else{await operation;assert.deepEqual(sent.map(x=>x.index),[3,5]);assert.ok(sent.every(x=>x.recipient===engine.bank()));assert.deepEqual(sent.map(x=>String(x.token)),['524290','524291']);assert.equal(gates.length,1);}
  assert.deepEqual(Object.keys(state.custody),[wallets[4].address.toLowerCase()]);
 }
});

test('autonomous refunds overlap distinct wallets while preserving each wallet nonce order',async()=>{
 const wallets=Array.from({length:11},()=>new Wallet(Wallet.createRandom().privateKey)),plan=rehearsalPlan(release,'a'.repeat(64));
 const state={addresses:wallets.map(w=>w.address),custody:{},approvals:{},journals:{}} as unknown as RunState;
 const engine=new RehearsalEngine({plan,state,directory:'/unused',provider:{} as any,secondary:{} as any,wallets,operator:wallets[0]});
 const active=new Set<number>(),orders=new Map<number,string[]>();let maximum=0;
 (engine as any).c={round:async()=>({finalizedAt:0n,minted:4n}),terms:async()=>({}),refundsAvailable:async()=>true,ownerOf:async(token:bigint)=>wallets[(token&131071n)<=2n?3:5].address,refund:{populateTransaction:async()=>({to:plan.address,data:'0x1234'})}};
 engine.manual=async()=>{assert.fail('No human wallet owns these refunds');};
 (engine as any).send=async(index:number,action:string)=>{assert.equal(active.has(index),false);active.add(index);maximum=Math.max(maximum,active.size);const order=orders.get(index)??[];order.push(action);orders.set(index,order);await new Promise(resolve=>setTimeout(resolve,5));active.delete(index);return{};};
 await (engine as any).claim({...plan.scenarios[5],automatedSettlement:true});
 assert.equal(maximum,2);assert.deepEqual(orders.get(3),['refund:786433','refund:786434']);assert.deepEqual(orders.get(5),['refund:786435','refund:786436']);
});
