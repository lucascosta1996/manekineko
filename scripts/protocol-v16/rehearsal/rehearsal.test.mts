import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Wallet} from 'ethers';
import {rehearsalPlan,digest,Hold,assertCustody,assertMintBudget} from './plan.mts';
import {createVault,readVault} from './vault.mts';
import {RehearsalEngine,type RunState} from './engine.mts';
const source=JSON.parse(await readFile(new URL('../../../apps/launch/catalog/sepolia.json',import.meta.url),'utf8'));
const options=[{supply:'1000',price:'10000000000000000',winners:'6',duration:'3600'},{supply:'2000',price:'20000000000000000',winners:'4',duration:'86400'},{supply:'1000',price:'10000000000000000',winners:'10',duration:'86400'}];
const release={version:16,chainId:11155111,sealed:false,prepared:0,genesisMints:0,address:'0x'+'1'.repeat(40),codeHash:'0x'+'2'.repeat(64),deploymentBlock:10,manifestHash:'0x'+'3'.repeat(64),manifest:{settings:{},options,catalog:source.seasons.flatMap((s:any)=>s.collections.map((c:any)=>({...c,seasonId:s.seasonId,seasonName:s.name})))}};
test('the frozen plan preserves all 216 collection identities, all 22 season gates and the three onchain choices',()=>{
 const p=rehearsalPlan(release,'a'.repeat(64));assert.equal(p.scenarios.length,216);assert.equal(p.scenarios.filter(s=>s.seasonFirst).length,22);assert.equal(p.scenarios.filter(s=>s.seasonLast).length,22);
 assert.equal(p.scenarios.filter(s=>s.outcome==='sellout').length,172);assert.equal(p.scenarios.filter(s=>s.outcome==='refund').length,44);assert.equal(p.scenarios.filter(s=>s.choice===1).length,1);assert.equal(p.scenarios.find(s=>s.choice===1)!.outcome,'refund');
 assert.deepEqual(p.catalog,release.manifest.catalog);assert.equal(p.maxExternalFundingWei,'30000000000000000000');
 assert.notEqual(digest(p),digest(rehearsalPlan(release,'b'.repeat(64))));
 for(const changed of [{chainId:1},{sealed:true},{prepared:1},{genesisMints:1},{version:14}])assert.throws(()=>rehearsalPlan({...release,...changed},'a'.repeat(64)));
});
test('the 40 ETH option cannot be silently sold out with 30 ETH and custody prevents bot signatures',()=>{
 assert.throws(()=>assertMintBudget(options[1],'sellout',30n*10n**18n,10n**18n),Hold);
 assert.equal(assertMintBudget(options[1],'refund',10n**18n,0n),6n*10n**16n);
 const a='0x'+'a'.repeat(40);assert.throws(()=>assertCustody({[a]:{reason:'manual claim'}},a),Hold);assertCustody({},a);
});
test('the new vault has 501 distinct wallets, is owner-only, rejects wrong keys and cannot overwrite another run',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'tincta-v16-vault-'));
 try{const path=join(directory,'vault.json'),secret='4'.repeat(64),addresses=await createVault(path,secret),wallets=await readVault(path,secret);
  assert.equal(addresses.length,501);assert.equal(new Set(addresses).size,501);assert.deepEqual(wallets.map(w=>w.address),addresses);assert.equal((await stat(path)).mode&0o777,0o600);
  assert.ok(!(await readFile(path,'utf8')).includes(wallets[0].privateKey));await assert.rejects(readVault(path,'5'.repeat(64)));await assert.rejects(createVault(path,secret),{code:'EEXIST'});
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('manual gates require the exact confirmed action and cannot reuse a receipt for another test',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'tincta-v16-gate-')),wallet=new Wallet(Wallet.createRandom().privateKey),hash='0x'+'9'.repeat(64),blockHash='0x'+'8'.repeat(64),plan=rehearsalPlan(release,'a'.repeat(64));
 const request={to:release.address,data:'0x12345678',value:'1'};
 const state={version:16,planHash:digest(plan),gate:null,approvals:{},custody:{[wallet.address.toLowerCase()]:{reason:'manual'}},addresses:[wallet.address],journals:{},externalReceipts:[],accounted:[],gasWei:'0',operatorBudgetWei:'0',genesisTokens:{}} as unknown as RunState;
 let value=2n;
 const provider={getTransaction:async()=>({from:wallet.address,to:request.to,data:request.data,value,chainId:11155111n}),getTransactionReceipt:async()=>({status:1,hash,blockNumber:10,blockHash,gasUsed:21000n,gasPrice:1n,logs:[]}),getBlock:async(block:unknown)=>block==='latest'?{number:12}:{hash:blockHash}} as any;
 const engine=new RehearsalEngine({plan,state,directory,provider,secondary:provider,wallets:[wallet],operator:wallet});
 try{
  await assert.rejects(engine.gate({id:'claim:1',instruction:'Claim in the website',wallet:wallet.address,request}),Hold);
  await assert.rejects(engine.acknowledge('claim:1','UI claim passed',hash),/does not match/);
  value=1n;await engine.acknowledge('claim:1','UI claim passed',hash);assert.ok(state.approvals['claim:1']);
  await assert.rejects(engine.gate({id:'claim:2',instruction:'Second manual test',wallet:wallet.address,request}),Hold);
  await assert.rejects(engine.acknowledge('claim:2','UI claim passed',hash),/different manual/);
  await assert.rejects(engine.send(0,'bot-claim',request),Hold);
 }finally{await rm(directory,{recursive:true,force:true});}
});
