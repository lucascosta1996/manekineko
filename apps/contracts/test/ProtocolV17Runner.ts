import { expect } from 'chai';
import { network } from 'hardhat';
import { Wallet } from 'ethers';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RehearsalEngine, type RunState } from '../../../scripts/protocol-v17/rehearsal/engine.mts';
import { rehearsalPlan, digest, Hold } from '../../../scripts/protocol-v17/rehearsal/plan.mts';
import { report, renderReport } from '../../../scripts/protocol-v17/rehearsal/report.mts';
import { v17FastBallotOptions, v17FastTiming } from '../config/v17-ballot.ts';

const { ethers, networkHelpers }=await network.create('hardhatV16Adapters');
describe('V17 frozen runner through real local EVM transactions',function(){
 this.timeout(180000);
 it('completes all six live-plan scenarios, exact manual receipts, parallel bot journals, custody, final audit and recovery',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'tincta-v17-engine-')),originalNow=Date.now;
  try{
   let clock=Number((await ethers.provider.getBlock('latest'))!.timestamp)*1000;Date.now=()=>clock;
   await networkHelpers.setNextBlockBaseFeePerGas(1n);await networkHelpers.mine();
   const coordinator='0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B',mock=await ethers.deployContract('VRFCoordinatorV2Mock');
   await networkHelpers.setCode(coordinator,await ethers.provider.getCode(await mock.getAddress()));await networkHelpers.setStorageAt(coordinator,0,ethers.zeroPadValue('0x01',32));
   const vrf=await ethers.getContractAt('VRFCoordinatorV2Mock',coordinator);
   const proxy=(url:string)=>new Proxy(ethers.provider,{get(target,key){
    if(key==='_getConnection')return()=>({url});
    if(key==='getFeeData')return async()=>({maxFeePerGas:500000000n,maxPriorityFeePerGas:1n,gasPrice:1n});
    if(key==='getBlock')return async(...args:any[])=>{const b=await (target.getBlock as any)(...args);if(args[0]==='latest'&&b)clock=b.timestamp*1000;return b;};
    if(key==='broadcastTransaction')return async(raw:string)=>{const tx=await target.broadcastTransaction(raw);await networkHelpers.mine(2);return tx;};
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
   }});
   const provider=proxy('https://primary.test') as any,secondary=proxy('https://secondary.test') as any;
   const operator=new Wallet(Wallet.createRandom().privateKey,provider),wallets=Array.from({length:11},()=>new Wallet(Wallet.createRandom().privateKey,provider));
   await networkHelpers.setBalance(operator.address,ethers.parseEther('1'));
   const settings={operator:operator.address,coordinator,keyHash:'0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae',callbackGas:200000,randomnessBudget:'10000000000000000',sponsorshipBudget:'1000000000000000',...v17FastTiming};
   const c=await ethers.deployContract('ManekinekoV17',[settings,v17FastBallotOptions,true]);
   const catalog=[1,2,3,4,5,6].map(id=>({seasonId:ethers.id(id<=3?'Runner A':'Runner B'),seasonName:id<=3?'Runner A':'Runner B',name:`Runner ${id}`,color:'#330000',textColor:'#FFFFFF'}));
   await c.connect(operator).appendCollections(catalog);
   const manifest={settings,options:JSON.parse(JSON.stringify(v17FastBallotOptions,(_,v)=>typeof v==='bigint'?String(v):v)),catalog,rehearsal:true};
   const plan=rehearsalPlan({version:17,chainId:11155111,sealed:false,prepared:0,genesisMints:0,address:await c.getAddress(),codeHash:ethers.keccak256(await ethers.provider.getCode(await c.getAddress())),manifest},'a'.repeat(64));
   const state:RunState={version:17,planHash:digest(plan),addresses:wallets.map(w=>w.address),operatorBaseline:String(await ethers.provider.getBalance(operator.address)),started:false,complete:false,current:1,gate:null,approvals:{},custody:{[wallets[0].address.toLowerCase()]:{reason:'Manual affiliate'},[wallets[1].address.toLowerCase()]:{reason:'Manual buyer'}},journals:{},funding:[],genesisTokens:{},buyers:{},manualWinners:{},accounted:[],gasWei:'0',operatorBudgetWei:'0',recoveries:{},vrfFeesWei:'0',errors:[],outcomes:{},externalReceipts:[]};
   await networkHelpers.setBalance(plan.recoveryAddress,ethers.parseEther('1'));const recovery=await ethers.getImpersonatedSigner(plan.recoveryAddress);
   const funding=await recovery.sendTransaction({to:wallets[10].address,value:ethers.parseEther('0.15')});await funding.wait();await networkHelpers.mine(2);state.funding.push({hash:funding.hash,value:String(ethers.parseEther('0.15'))});
   const engine=new RehearsalEngine({plan,state,directory,provider,secondary,wallets,operator,pollIntervalMs:0});
   let gates=0;
   for(let turn=0;!state.complete&&turn<150;turn++){
    const before=Object.fromEntries(Object.keys(state.custody).map(address=>{const i=state.addresses.findIndex(a=>a.toLowerCase()===address);return[i,state.journals[i]?.transactions.length??0];}));
    try{await engine.run();}catch(error){
     if(!(error instanceof Hold))throw error;
     if(error.status==='manual-transaction'||error.status==='manual-checkpoint'){
      const gate=state.gate!;let hash:string|undefined;
      if(gate.request){const index=state.addresses.findIndex(a=>a.toLowerCase()===gate.wallet!.toLowerCase());expect(index).gte(0);const tx=await wallets[index].sendTransaction({...gate.request,value:BigInt(gate.request.value)});await tx.wait();hash=tx.hash;}
      await engine.acknowledge(gate.id,'Local wallet test; exact confirmed receipt and observed contract state',hash);gates++;
     }else if(error.status==='waiting'){
      const r=await c.round(state.current);
      if(r.requested&&!r.entropyAt)await vrf.fulfillRequest(r.requestId,state.current);
      else {const head=(await ethers.provider.getBlock('latest'))!,deadline=Number(r.saleStart)>head.timestamp?Number(r.saleStart):Number(await c.mintDeadline(state.current));if(deadline>head.timestamp)await networkHelpers.time.increaseTo(deadline);else await networkHelpers.mine();}
     }else throw error;
    }
    for(const[index,count]of Object.entries(before))expect(state.journals[index]?.transactions.length??0).eq(count);
    const current=await report(plan,state,provider);expect(current.accounting.passed).eq(true);
   }
   expect(state.complete).eq(true);expect(gates).gt(20);expect(Object.keys(state.outcomes)).length(6);expect(state.externalReceipts.length).gt(10);
   const result=await report(plan,state,provider);expect(result.executionPassed).eq(true);expect(result.mainnetReady).eq(false);expect(renderReport(result)).includes('EXECUTION PASSED');
   const balances=await Promise.all(Object.keys(state.custody).map(a=>ethers.provider.getBalance(a)));
   await engine.recoverUnspent();expect(await ethers.provider.getBalance(plan.recoveryAddress)).gt(ethers.parseEther('0.85'));
   expect(await Promise.all(Object.keys(state.custody).map(a=>ethers.provider.getBalance(a)))).deep.eq(balances);
  }catch(error){try{const s=JSON.parse(await readFile(join(directory,'state.json'),'utf8'));console.error(JSON.stringify({runnerFailure:{current:s.current,gate:s.gate?.id,journals:Object.fromEntries(Object.entries(s.journals).map(([i,j]:[string,any])=>[i,{last:j.transactions.at(-1)?.action,state:j.transactions.at(-1)?.state}]))}}));}catch{}throw error;
  }finally{Date.now=originalNow;await rm(directory,{recursive:true,force:true});}
 });
});
