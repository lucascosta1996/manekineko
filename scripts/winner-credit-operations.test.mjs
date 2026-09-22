import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ZeroHash, Interface } from 'ethers';
import { collectionCreditOperations } from './winner-credit-operations.mjs';
const abi=JSON.parse(await readFile(new URL('../packages/contracts/src/ManekinekoWinnerCredits.json',import.meta.url),'utf8'));
const iface=new Interface(abi);
const f={chainId:11155111,registry:'0x'+'11'.repeat(20),owner:'0x'+'22'.repeat(20),funder:'0x'+'33'.repeat(20),factory:'0x'+'44'.repeat(20),factoryOwner:'0x'+'33'.repeat(20),expectedFactoryOwner:'0x'+'33'.repeat(20),factoryCodeHash:'0x'+'aa'.repeat(32),round:'0x'+'55'.repeat(20),roundId:'2',budgetWei:'10000',totalFundedWei:'0',approvedCodeHash:ZeroHash,registered:false};
test('unsigned setup approves, registers, then funds exact reviewed budget',()=>{
 const calls=collectionCreditOperations(f,abi);
 assert.deepEqual(calls.map(call=>iface.parseTransaction(call).name),['approveFactory','registerCollection','fundCollection']);
 assert.deepEqual(calls.map(call=>call.value),['0','0','10000']);
 assert.equal(calls[0].from,f.owner);assert.equal(calls[2].from,f.funder);
});
test('spent sponsorship is not automatically refilled by repeating setup',()=>{
 assert.deepEqual(collectionCreditOperations({...f,approvedCodeHash:f.factoryCodeHash,registered:true,totalFundedWei:'10000'},abi),[]);
 assert.deepEqual(collectionCreditOperations({...f,approvedCodeHash:f.factoryCodeHash,registered:true,totalFundedWei:'20000'},abi),[]);
 assert.equal(collectionCreditOperations({...f,approvedCodeHash:f.factoryCodeHash,registered:true,totalFundedWei:'9000'},abi)[0].value,'1000');
});
test('mismatched pins, source-only registration and malformed amounts fail closed',()=>{
 for(const overrides of [{approvedCodeHash:'0x'+'bb'.repeat(32)},{registrationRewardsOnly:true},{budgetWei:'01'},{budgetWei:'0'},{chainId:31337},{roundId:'0'},{totalFundedWei:'-1'}])assert.throws(()=>collectionCreditOperations({...f,...overrides},abi));
});
test('factory approval requires the reviewed operator, while registry governance may be separate',()=>{
 assert.throws(()=>collectionCreditOperations({...f,factoryOwner:'0x'+'66'.repeat(20)},abi),/Reviewed factory owner differs/);
 const calls=collectionCreditOperations({...f,owner:'0x'+'77'.repeat(20)},abi);
 assert.equal(calls[0].from,'0x'+'77'.repeat(20));
 assert.equal(calls[2].from,f.funder);
});

const {winnerCreditVersionPolicy,winnerCreditRoundBindings}=await import('./winner-credit-operations.mjs');
const abiV3=JSON.parse(await readFile(new URL('../packages/contracts/src/ManekinekoWinnerCreditsV3.json',import.meta.url),'utf8'));
test('V7 selects the V3 lifetime registry and freezes both prize terms and the full scheduled mint window',()=>{
 assert.equal(winnerCreditVersionPolicy('affiliate-v6').registryVersion,'winner-credits-v2');
 assert.equal(winnerCreditVersionPolicy('affiliate-v7').registryName,'ManekinekoWinnerCreditsV3');
 assert.throws(()=>winnerCreditVersionPolicy('affiliate-v5'));
 const launch={contractVersion:'affiliate-v7',contract:{secondPrizeBps:'2000',minAffiliateReferrals:'100',affiliatePayoutCapBps:'3000',saleStartAt:'3600',mintDurationSeconds:'86400',seasonId:'season',seasonName:'Red',collectionColor:'#330000',textColor:'#FFFFFF'},operations:{affiliateEligibilityAddress:f.registry}};
 const bindings=winnerCreditRoundBindings(launch);assert.equal(bindings.mintDeadline,'90000');assert.equal(bindings.awardCount,'2');assert.equal(bindings.secondPrizeBps,'2000');assert.equal(bindings.ALGORITHM_VERSION,'unique-rank-v4');assert.equal(bindings.collectionColor,'#330000');
 for(const key of ['secondPrizeBps','minAffiliateReferrals','affiliatePayoutCapBps','saleStartAt'])assert.throws(()=>winnerCreditRoundBindings({...launch,contract:{...launch.contract,[key]:'0'}}));
 const calls=collectionCreditOperations(f,abiV3),v3=new Interface(abiV3);
 assert.deepEqual(calls.map(call=>v3.parseTransaction(call).name),['approveFactory','registerCollection','fundCollection']);
 assert.deepEqual(collectionCreditOperations({...f,registered:true,approvedCodeHash:f.factoryCodeHash,totalFundedWei:f.budgetWei},abiV3),[]);
});

test('explicit V3 deployment preparation encodes the migration constructor without sending a transaction',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');const {AbiCoder}=await import('ethers');
 const dir=await mkdtemp(join(tmpdir(),'neko-v3-unsigned-')),output=join(dir,'deployment.json');
 const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('WINNER_CREDITS_'))delete env[key];
 try{
  await promisify(execFile)(process.execPath,['--import','tsx','scripts/winner-credit-operations.mjs','deploy','--version','v3','--chain','11155111','--owner',f.owner,'--output',output],{cwd:new URL('../',import.meta.url),env});
  const plan=JSON.parse(await readFile(output,'utf8')),artifact=JSON.parse(await readFile(new URL('../apps/contracts/artifacts/contracts/ManekinekoWinnerCreditsV3.sol/ManekinekoWinnerCreditsV3.json',import.meta.url),'utf8'));
  assert.equal(plan.registryVersion,'winner-credits-v3');assert.equal(plan.previousRegistry,'0x'+'00'.repeat(20));assert.equal(plan.transaction.value,'0');
  const args=AbiCoder.defaultAbiCoder().decode(['address','bytes32','address'],'0x'+plan.transaction.data.slice(artifact.bytecode.length));assert.equal(args[0].toLowerCase(),f.owner);assert.equal(args[2],plan.previousRegistry);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('V8 uses winner credits V4 and binds six equal ranks without reusing the V7 split',async()=>{
 const policy=winnerCreditVersionPolicy('affiliate-v8');
 assert.equal(policy.registryVersion,'winner-credits-v4');assert.equal(policy.registryName,'ManekinekoWinnerCreditsV4');assert.equal(policy.componentVersion,'V8');assert.equal(policy.algorithmVersion,'unique-rank-v5');
 const launch={contractVersion:'affiliate-v8',contract:{winnerCount:'6',maxSupply:'1000',prizeBps:'6000',minAffiliateReferrals:'100',affiliatePayoutCapBps:'3000',saleStartAt:'3600',mintDurationSeconds:'86400',seasonId:'season',seasonName:'Blue',collectionColor:'#000099',textColor:'#FFFFFF'},operations:{affiliateEligibilityAddress:f.registry}};
 const bindings=winnerCreditRoundBindings(launch);
 assert.equal(bindings.winnerCount,'6');assert.equal(bindings.awardCount,'6');assert.equal(bindings.secondPrizeBps,undefined);assert.equal(bindings.mintDeadline,'90000');assert.equal(bindings.ALGORITHM_VERSION,'unique-rank-v5');
 for(const change of [{winnerCount:'0'},{winnerCount:'11'},{winnerCount:'06'},{winnerCount:'7'},{maxSupply:'5'},{prizeBps:'6001'},{saleStartAt:'0'}])assert.throws(()=>winnerCreditRoundBindings({...launch,contract:{...launch.contract,...change}}));
 const v4=new Interface(JSON.parse(await readFile(new URL('../packages/contracts/src/ManekinekoWinnerCreditsV4.json',import.meta.url),'utf8')));
 const calls=collectionCreditOperations(f,v4.fragments);
 assert.deepEqual(calls.map(call=>v4.parseTransaction(call).name),['approveFactory','registerCollection','fundCollection']);
 assert.deepEqual(collectionCreditOperations({...f,registered:true,approvedCodeHash:f.factoryCodeHash,totalFundedWei:f.budgetWei},v4.fragments),[]);
});

test('V4 deployment remains unsigned and a configured canonical registry cannot be replaced without lineage',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');const {AbiCoder}=await import('ethers');
 const dir=await mkdtemp(join(tmpdir(),'neko-v4-unsigned-')),output=join(dir,'deployment.json');
 const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('WINNER_CREDITS_'))delete env[key];
 const args=['--import','tsx','scripts/winner-credit-operations.mjs','deploy','--version','v4','--chain','11155111','--owner',f.owner,'--output',output];
 try{
  await promisify(execFile)(process.execPath,args,{cwd:new URL('../',import.meta.url),env});
  const plan=JSON.parse(await readFile(output,'utf8')),artifact=JSON.parse(await readFile(new URL('../apps/contracts/artifacts/contracts/ManekinekoWinnerCreditsV4.sol/ManekinekoWinnerCreditsV4.json',import.meta.url),'utf8'));
  assert.equal(plan.registryVersion,'winner-credits-v4');assert.equal(plan.previousRegistry,'0x'+'00'.repeat(20));assert.equal(plan.transaction.value,'0');assert.equal(plan.rewardLimit,'one-sponsored-mint-per-wallet-lifetime');
  const constructor=AbiCoder.defaultAbiCoder().decode(['address','bytes32','address'],'0x'+plan.transaction.data.slice(artifact.bytecode.length));
  assert.equal(constructor[0].toLowerCase(),f.owner);assert.equal(constructor[2],plan.previousRegistry);
  await assert.rejects(promisify(execFile)(process.execPath,[...args.slice(0,-1),join(dir,'blocked.json')],{cwd:new URL('../',import.meta.url),env:{...env,WINNER_CREDITS_ADDRESS_11155111:f.registry}}));
 }finally{await rm(dir,{recursive:true,force:true});}
});

const {verifyPreviousRegistry}=await import('./winner-credit-operations.mjs');
const {ZeroAddress,keccak256}=await import('ethers');
const registryReadAbi=new Interface(['function WINNER_CREDITS_VERSION() view returns(string)','function totalSponsorBalance() view returns(uint256)','function previousRegistry() view returns(address)']);
const compiledV2=JSON.parse(await readFile(new URL('../apps/contracts/artifacts/contracts/ManekinekoWinnerCredits.sol/ManekinekoWinnerCredits.json',import.meta.url),'utf8'));
const compiledV3=JSON.parse(await readFile(new URL('../apps/contracts/artifacts/contracts/ManekinekoWinnerCreditsV3.sol/ManekinekoWinnerCreditsV3.json',import.meta.url),'utf8'));
const priorV3='0x'+'66'.repeat(20),priorV2='0x'+'77'.repeat(20),lineageBlock={number:100,hash:'0x'+'ab'.repeat(32)};
function lineageProvider(overrides={}){
 const calls=[];
 const entries={
  [priorV3]:{version:'winner-credits-v3',code:compiledV3.deployedBytecode,balance:0n,previous:priorV2,...overrides.v3},
  [priorV2]:{version:'winner-credits-v2',code:compiledV2.deployedBytecode,balance:0n,previous:ZeroAddress,...overrides.v2},
 };
 return {calls,async getCode(address,block){assert.equal(block,lineageBlock.number);calls.push({kind:'code',address:address.toLowerCase(),block});return entries[address.toLowerCase()].code;},async call(tx){
  assert.equal(tx.blockTag,lineageBlock.number);const record=entries[tx.to.toLowerCase()],decoded=registryReadAbi.parseTransaction(tx);calls.push({kind:decoded.name,address:tx.to.toLowerCase(),block:tx.blockTag});
  const value=decoded.name==='WINNER_CREDITS_VERSION'?record.version:decoded.name==='totalSponsorBalance'?record.balance:record.previous;
  return registryReadAbi.encodeFunctionResult(decoded.name,[value]);
 }};
}
async function withLineagePins(fn){
 const keys=['WINNER_CREDITS_PREVIOUS_ADDRESS_11155111','WINNER_CREDITS_PREVIOUS_CODEHASH_11155111'],saved=keys.map(key=>process.env[key]);
 process.env[keys[0]]=priorV3;process.env[keys[1]]=keccak256(compiledV3.deployedBytecode);
 try{return await fn();}finally{keys.forEach((key,index)=>{if(saved[index]===undefined)delete process.env[key];else process.env[key]=saved[index];});}
}

test('V4 migration verifies and retires every V3-to-V2 sponsorship ledger at one pinned block',async()=>withLineagePins(async()=>{
 const provider=lineageProvider(),registry={previousRegistry:async(at)=>{assert.equal(at.blockTag,lineageBlock.number);return priorV3;}};
 assert.equal((await verifyPreviousRegistry(provider,registry,11155111,lineageBlock,priorV3,'winner-credits-v4')).toLowerCase(),priorV3);
 assert.deepEqual(provider.calls.filter(call=>call.kind==='totalSponsorBalance').map(call=>call.address),[priorV3,priorV2]);
 assert.ok(provider.calls.every(call=>call.block===lineageBlock.number));
 // V7's V3 registry may inherit V2, but it cannot silently inherit another V3.
 await assert.rejects(verifyPreviousRegistry(lineageProvider(),registry,11155111,lineageBlock,priorV3,'winner-credits-v3'),/version differs/);
}));

test('V4 rejects funded ancestor ledgers, tampered runtimes, cyclic lineage and unreviewed predecessors',async()=>withLineagePins(async()=>{
 const registry={previousRegistry:async()=>priorV3};
 for(const [changes,pattern] of [
  [{v3:{balance:1n}},/Retire all prior/], [{v2:{balance:1n}},/Retire all prior/],
  [{v3:{previous:priorV3}},/Invalid prior registry lineage/], [{v2:{version:'winner-credits-v3'}},/version differs/],
  [{v3:{code:'0x00'}},/runtime differs/], [{v2:{code:'0x00'}},/reviewed build/],
 ])await assert.rejects(verifyPreviousRegistry(lineageProvider(changes),registry,11155111,lineageBlock,priorV3,'winner-credits-v4'),pattern);
 await assert.rejects(verifyPreviousRegistry(lineageProvider(),registry,11155111,lineageBlock,priorV2,'winner-credits-v4'),/reviewed migration/);
 delete process.env.WINNER_CREDITS_PREVIOUS_CODEHASH_11155111;
 await assert.rejects(verifyPreviousRegistry(lineageProvider(),registry,11155111,lineageBlock,priorV3,'winner-credits-v4'),/Pin the previous/);
}));

test('V4 permits an explicitly pinned direct V2 predecessor and a genuinely empty lineage',async()=>withLineagePins(async()=>{
 process.env.WINNER_CREDITS_PREVIOUS_CODEHASH_11155111=keccak256(compiledV2.deployedBytecode);
 const provider=lineageProvider();
 assert.equal((await verifyPreviousRegistry(provider,{previousRegistry:async()=>priorV2},11155111,lineageBlock,priorV2,'winner-credits-v4')).toLowerCase(),priorV2);
 assert.deepEqual(provider.calls.filter(call=>call.kind==='totalSponsorBalance').map(call=>call.address),[priorV2]);
 const empty={getCode(){throw new Error('Empty lineage must not read code');}};
 assert.equal(await verifyPreviousRegistry(empty,{previousRegistry:async()=>ZeroAddress},11155111,lineageBlock,ZeroAddress,'winner-credits-v4'),ZeroAddress);
}));


test('V10 preparation requires Winner Credits V6 and its independent algorithm and cap',()=>{
 const policy=winnerCreditVersionPolicy('affiliate-v10');
 assert.equal(policy.registryName,'ManekinekoWinnerCreditsV6'); assert.equal(policy.registryVersion,'winner-credits-v6');
 assert.equal(policy.componentVersion,'V10'); assert.equal(policy.algorithmVersion,'unique-rank-v6');
 const bindings=winnerCreditRoundBindings({contractVersion:'affiliate-v10',contract:{winnerCount:'6',maxSupply:'1000',prizeBps:'6000',minAffiliateReferrals:'1',affiliatePayoutCapBps:'3000',saleStartAt:'3600',mintDurationSeconds:'86400'},operations:{affiliateEligibilityAddress:f.registry}});
 assert.equal(bindings.MAX_MINTS_PER_WALLET,'20'); assert.equal(bindings.awardCount,'6'); assert.equal(bindings.ALGORITHM_VERSION,'unique-rank-v6');
});

test('V6 winner and V5 eligibility deployment plans remain unsigned and use the correct constructors',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');const {AbiCoder}=await import('ethers');
 const dir=await mkdtemp(join(tmpdir(),'tincta-v10-unsigned-')); const env={...process.env};
 for(const key of Object.keys(env))if(key.startsWith('WINNER_CREDITS_')||key.startsWith('AFFILIATE_ELIGIBILITY_'))delete env[key];
 try{
  for(const [tool,version,name]of [['winner-credit','v6','ManekinekoWinnerCreditsV6'],['affiliate-eligibility','v5','ManekinekoAffiliateEligibilityV5']]){
   const output=join(dir,tool+'.json');
   await promisify(execFile)(process.execPath,['--import','tsx',`scripts/${tool}-operations.mjs`,'deploy','--version',version,'--chain','11155111','--owner',f.owner,'--output',output],{cwd:new URL('../',import.meta.url),env});
   const plan=JSON.parse(await readFile(output,'utf8')),compiled=JSON.parse(await readFile(new URL(`../apps/contracts/artifacts/contracts/${name}.sol/${name}.json`,import.meta.url),'utf8'));
   assert.equal(plan.transaction.value,'0'); assert.equal(plan.transaction.from.toLowerCase(),f.owner);
   const args=AbiCoder.defaultAbiCoder().decode(tool==='winner-credit'?['address','bytes32','address']:['address'],'0x'+plan.transaction.data.slice(compiled.bytecode.length));
   assert.equal(args[0].toLowerCase(),f.owner);
   if(tool==='winner-credit'){assert.equal(plan.registryVersion,'winner-credits-v6');assert.equal(args[2],ZeroAddress);}
   else assert.equal(plan.registryVersion,'affiliate-eligibility-v5');
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
