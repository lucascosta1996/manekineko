import test from 'node:test';
import assert from 'node:assert/strict';
import { Interface, ZeroHash } from 'ethers';
import { eligibilityOperations, assertEligibilityMigrationReady } from './affiliate-eligibility-operations.mjs';
const abi=['function approveFactory(address,bytes32)','function registerCollection(address,uint256)'],iface=new Interface(abi);
const f={chainId:11155111,registry:'0x'+'11'.repeat(20),owner:'0x'+'22'.repeat(20),factory:'0x'+'33'.repeat(20),roundId:'1',factoryCodeHash:'0x'+'44'.repeat(32),approvedCodeHash:ZeroHash,registered:false,previousFinished:true,factoryOwner:'0x'+'55'.repeat(20),expectedFactoryOwner:'0x'+'55'.repeat(20)};
test('canonical registration plans approval before registration, with no funding or sale activation',()=>{
 const calls=eligibilityOperations(f,abi);
 assert.deepEqual(calls.map(call=>iface.parseTransaction(call).name),['approveFactory','registerCollection']);
 assert.ok(calls.every(call=>call.from===f.owner&&call.to===f.registry&&call.value==='0'));
});
test('repeated preparation never changes an existing canonical position',()=>{
 assert.deepEqual(eligibilityOperations({...f,registered:true,approvedCodeHash:f.factoryCodeHash,previousFinished:false},abi),[]);
 assert.equal(eligibilityOperations({...f,approvedCodeHash:f.factoryCodeHash},abi).length,1);
});
test('unfinished predecessor, wrong governance, altered runtime and invalid input are rejected',()=>{
 for(const change of [{previousFinished:false},{factoryOwner:f.owner},{approvedCodeHash:'0x'+'66'.repeat(32)},{roundId:'0'},{roundId:'01'},{chainId:31337},{registry:'0x'+'00'.repeat(20)}])assert.throws(()=>eligibilityOperations({...f,...change},abi));
});

const {eligibilityVersionPolicy,eligibilityRoundBindings}=await import('./affiliate-eligibility-operations.mjs');
test('V7 requires independently pinned eligibility V2 while V6 retains its original defaults',()=>{
 assert.equal(eligibilityVersionPolicy('affiliate-v7').pinPrefix,'AFFILIATE_ELIGIBILITY_V2_');assert.equal(eligibilityVersionPolicy('affiliate-v7').registryName,'ManekinekoAffiliateEligibilityV2');
 assert.equal(eligibilityVersionPolicy('affiliate-v6').pinPrefix,'AFFILIATE_ELIGIBILITY_');
 assert.equal(eligibilityVersionPolicy('affiliate-v6','v2').registryVersion,'affiliate-eligibility-v2');
 assert.throws(()=>eligibilityVersionPolicy('affiliate-v7','v1'));assert.throws(()=>eligibilityVersionPolicy('affiliate-v4'));
 const launch={contractVersion:'affiliate-v7',contract:{secondPrizeBps:'2000',minAffiliateReferrals:'100',affiliatePayoutCapBps:'3000',saleStartAt:'3600',mintDurationSeconds:'86400',seasonId:'season',seasonName:'Blue',collectionColor:'#000099',textColor:'#FFFFFF'}};
 const bindings=eligibilityRoundBindings(launch);assert.equal(bindings.mintDeadline,'90000');assert.equal(bindings.awardCount,'2');assert.equal(bindings.minAffiliateReferrals,'100');assert.equal(bindings.seasonName,'Blue');
 assert.throws(()=>eligibilityRoundBindings({...launch,contract:{...launch.contract,saleStartAt:'0'}}));
});

test('explicit eligibility V2 deployment preparation preserves legacy CLI behavior and sends no transaction',async()=>{
 const {mkdtemp,readFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
 const dir=await mkdtemp(join(tmpdir(),'neko-gate-unsigned-')),env={...process.env};for(const key of Object.keys(env))if(key.startsWith('AFFILIATE_ELIGIBILITY_'))delete env[key];
 try{for(const version of ['v1','v2']){
  const output=join(dir,version+'.json'),args=['--import','tsx','scripts/affiliate-eligibility-operations.mjs','deploy','--chain','11155111','--owner',f.owner,'--output',output];if(version==='v2')args.push('--version','v2');
  await promisify(execFile)(process.execPath,args,{cwd:new URL('../',import.meta.url),env});
  const plan=JSON.parse(await readFile(output,'utf8'));assert.equal(plan.registryVersion,`affiliate-eligibility-${version}`);assert.equal(plan.transaction.value,'0');assert.equal(plan.transaction.from.toLowerCase(),f.owner);
 }}finally{await rm(dir,{recursive:true,force:true});}
});

test('V8 requires canonical eligibility V3 while V5 through V7 can be imported as historical sources',()=>{
 const policy=eligibilityVersionPolicy('affiliate-v8');
 assert.deepEqual(policy,{componentVersion:'V8',registryVersion:'affiliate-eligibility-v3',registryName:'ManekinekoAffiliateEligibilityV3',pinPrefix:'AFFILIATE_ELIGIBILITY_V3_',algorithmVersion:'unique-rank-v5'});
 for(const version of ['v1','v2','v6'])assert.throws(()=>eligibilityVersionPolicy('affiliate-v8',version));
 for(const version of ['affiliate-v5','affiliate-v6','affiliate-v7'])assert.equal(eligibilityVersionPolicy(version,'v3').registryVersion,'affiliate-eligibility-v3');
});

test('V8 eligibility bindings freeze winner count, total allocation and the absolute sale schedule',()=>{
 const launch={contractVersion:'affiliate-v8',contract:{winnerCount:'6',maxSupply:'1000',prizeBps:'6000',minAffiliateReferrals:'100',affiliatePayoutCapBps:'3000',saleStartAt:'3600',mintDurationSeconds:'86400',seasonId:'season',seasonName:'Blue',collectionColor:'#000099',textColor:'#FFFFFF'}};
 const bindings=eligibilityRoundBindings(launch);
 assert.equal(bindings.winnerCount,'6');assert.equal(bindings.awardCount,'6');assert.equal(bindings.prizeBps,'6000');assert.equal(bindings.secondPrizeBps,undefined);
 assert.equal(bindings.mintDeadline,'90000');assert.equal(bindings.ALGORITHM_VERSION,'unique-rank-v5');assert.equal(bindings.collectionColor,'#000099');
 for(const changes of [{winnerCount:'0'},{winnerCount:'11'},{winnerCount:'06'},{winnerCount:'7'},{maxSupply:'5'},{prizeBps:'6001'},{saleStartAt:'0'},{minAffiliateReferrals:'0'},{affiliatePayoutCapBps:'0'}])assert.throws(()=>eligibilityRoundBindings({...launch,contract:{...launch.contract,...changes}}));
});

test('V3 eligibility deployment creates an unsigned generation-specific plan and respects its canonical pin',async()=>{
 const {mkdtemp,readFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
 const dir=await mkdtemp(join(tmpdir(),'neko-gate-v3-unsigned-')),env={...process.env};for(const key of Object.keys(env))if(key.startsWith('AFFILIATE_ELIGIBILITY_'))delete env[key];
 const output=join(dir,'deployment.json'),args=['--import','tsx','scripts/affiliate-eligibility-operations.mjs','deploy','--version','v3','--chain','11155111','--owner',f.owner,'--output',output];
 try{
  await promisify(execFile)(process.execPath,args,{cwd:new URL('../',import.meta.url),env});
  const plan=JSON.parse(await readFile(output,'utf8'));assert.equal(plan.registryVersion,'affiliate-eligibility-v3');assert.equal(plan.transaction.value,'0');assert.equal(plan.transaction.from.toLowerCase(),f.owner);assert.ok(plan.transaction.data.startsWith('0x'));
  await assert.rejects(promisify(execFile)(process.execPath,[...args.slice(0,-1),join(dir,'blocked.json')],{cwd:new URL('../',import.meta.url),env:{...env,AFFILIATE_ELIGIBILITY_V3_ADDRESS_11155111:f.registry}}));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('V9 requires its own V4 gate and can recognize V8 historical sources',()=>{assert.equal(eligibilityVersionPolicy('affiliate-v9').registryName,'ManekinekoAffiliateEligibilityV4');for(const version of ['v1','v2','v3'])assert.throws(()=>eligibilityVersionPolicy('affiliate-v9',version));assert.equal(eligibilityVersionPolicy('affiliate-v8','v4').registryVersion,'affiliate-eligibility-v4');});


test('V10 requires Eligibility V5 while compatible historical source policies remain explicit',()=>{
 const policy=eligibilityVersionPolicy('affiliate-v10');
 assert.equal(policy.componentVersion,'V10'); assert.equal(policy.algorithmVersion,'unique-rank-v6');
 assert.equal(policy.registryVersion,'affiliate-eligibility-v5'); assert.equal(policy.pinPrefix,'AFFILIATE_ELIGIBILITY_V5_');
 for(const prior of ['v1','v2','v3','v4']) assert.throws(()=>eligibilityVersionPolicy('affiliate-v10',prior));
 for(const source of ['affiliate-v5','affiliate-v6','affiliate-v7','affiliate-v8','affiliate-v9']) assert.equal(eligibilityVersionPolicy(source,'v5').registryName,'ManekinekoAffiliateEligibilityV5');
 const bindings=eligibilityRoundBindings({contractVersion:'affiliate-v10',contract:{winnerCount:'6',maxSupply:'1000',prizeBps:'6000',minAffiliateReferrals:'1',affiliatePayoutCapBps:'3000',saleStartAt:'3600',mintDurationSeconds:'86400'}});
 assert.equal(bindings.MAX_MINTS_PER_WALLET,'20'); assert.equal(bindings.ALGORITHM_VERSION,'unique-rank-v6'); assert.equal(bindings.awardCount,'6');
});

test('V10 cannot reset bootstrap when only the prior V4 canonical registry is configured',()=>{
 for(const prefix of ['','V2_','V3_','V4_']){
  const env={[`AFFILIATE_ELIGIBILITY_${prefix}ADDRESS_11155111`]:f.registry};
  assert.throws(()=>assertEligibilityMigrationReady('affiliate-eligibility-v5',11155111,0n,env),/do not reset bootstrap/);
  assert.doesNotThrow(()=>assertEligibilityMigrationReady('affiliate-eligibility-v5',11155111,1n,env));
 }
 assert.doesNotThrow(()=>assertEligibilityMigrationReady('affiliate-eligibility-v5',11155111,0n,{}));
 assert.doesNotThrow(()=>assertEligibilityMigrationReady('affiliate-eligibility-v4',11155111,0n,{AFFILIATE_ELIGIBILITY_V4_ADDRESS_11155111:f.registry}));
});
