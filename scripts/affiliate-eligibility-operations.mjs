import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Contract, ContractFactory, Interface, JsonRpcProvider, ZeroAddress, ZeroHash, getAddress, keccak256 } from 'ethers';
import { verifyLaunchExport } from '../apps/launch/lib/launch-export.ts';
import { matchesRuntime } from '../apps/contracts/scripts/runtime-match.ts';

const ROOT=new URL('../',import.meta.url);
const ensure=(condition,message)=>{if(!condition)throw new Error(message);};
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const address=value=>{const normalized=getAddress(value);ensure(normalized!==ZeroAddress,'Zero address.');return normalized;};
const json=value=>JSON.stringify(value,(_,item)=>typeof item==='bigint'?String(item):item,2)+'\n';
const artifact=async name=>JSON.parse(await readFile(new URL(`apps/contracts/artifacts/contracts/${name}.sol/${name}.json`,ROOT),'utf8'));

export function eligibilityVersionPolicy(contractVersion, requestedRegistryVersion) {
  const versions = { 'affiliate-v5': ['V5','unique-rank-v2','v1'], 'affiliate-v6': ['V6','unique-rank-v3','v1'], 'affiliate-v7': ['V7','unique-rank-v4','v2'], 'affiliate-v8': ['V8','unique-rank-v5','v3'], 'affiliate-v9': ['V9','unique-rank-v5','v4'], 'affiliate-v10': ['V10','unique-rank-v6','v5'] };
  ensure(Object.hasOwn(versions,contractVersion),'Unsupported collection version.');
  const [componentVersion,algorithmVersion,defaultRegistry] = versions[contractVersion];
  const gateVersion=requestedRegistryVersion??defaultRegistry;
  const minimum = Number(defaultRegistry.slice(1)), requested = Number(/^v([1-5])$/.exec(gateVersion)?.[1]);
  ensure(requested >= minimum && requested <= 5,'Collection requires its matching eligibility registry or a compatible source registry.');
  return {componentVersion,registryVersion:`affiliate-eligibility-${gateVersion}`,registryName:gateVersion==='v1'?'ManekinekoAffiliateEligibility':`ManekinekoAffiliateEligibility${gateVersion.toUpperCase()}`,pinPrefix:`AFFILIATE_ELIGIBILITY_${gateVersion==='v1'?'':`${gateVersion.toUpperCase()}_`}`,algorithmVersion};
}
/** A newer ledger cannot reopen the global bootstrap when any older canonical
 * generation is configured, even if the original V1 alias is absent. */
export function assertEligibilityMigrationReady(registryVersion, chainId, collectionCount, env=process.env) {
  const generation=Number(/^affiliate-eligibility-v([1-5])$/.exec(registryVersion)?.[1]);
  ensure(generation>=1&&[1,11155111].includes(chainId),'Unsupported eligibility migration.');
  const priorPins=Array.from({length:generation-1},(_,index)=>`AFFILIATE_ELIGIBILITY_${index===0?'':`V${index+1}_`}ADDRESS_${chainId}`);
  if(priorPins.some(key=>env[key]))ensure(BigInt(collectionCount)>0n,'Import completed prior official collections before registering the new version; do not reset bootstrap.');
}
export function eligibilityRoundBindings(launch) {
  const c=launch.contract,policy=eligibilityVersionPolicy(launch.contractVersion);
  const bindings={name:c.name,symbol:c.symbol,owner:c.initialOwner,maxSupply:c.maxSupply,mintPrice:c.mintPriceWei,prizeBps:c.prizeBps,affiliatePoolBps:c.affiliatePoolBps,enrollmentSigner:c.enrollmentSigner,maxAffiliateSlots:c.maxAffiliateSlots,vrfCoordinator:c.vrfCoordinator,keyHash:c.keyHash,requestConfirmations:c.requestConfirmations,callbackGasLimit:c.callbackGasLimit,ALGORITHM_VERSION:policy.algorithmVersion};
  for(const field of ['seasonId','seasonName','collectionColor','textColor'])if(c[field]!==undefined)bindings[field]=c[field];
  if(['affiliate-v7','affiliate-v8','affiliate-v9','affiliate-v10'].includes(launch.contractVersion)){
    const v8=["affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(launch.contractVersion);
    for(const field of [v8?'winnerCount':'secondPrizeBps','minAffiliateReferrals','affiliatePayoutCapBps','saleStartAt']){ensure(typeof c[field]==='string'&&/^[1-9][0-9]*$/.test(c[field]),`Resolved positive ${policy.componentVersion} ${field} required.`);bindings[field]=c[field];}
    ensure(typeof c.mintDurationSeconds==='string'&&/^[1-9][0-9]*$/.test(c.mintDurationSeconds),'Resolved scheduled sale duration required.');
    bindings.mintDeadline=String(BigInt(c.saleStartAt)+BigInt(c.mintDurationSeconds));bindings.awardCount=v8?c.winnerCount:'2';
    if(v8)ensure(BigInt(c.winnerCount)<=10n && BigInt(c.winnerCount)<=BigInt(c.maxSupply) && BigInt(c.prizeBps)>0n && BigInt(c.prizeBps)%BigInt(c.winnerCount)===0n,'V8 requires 1–10 equal awards within supply.');
  }
  if(['affiliate-v9','affiliate-v10'].includes(launch.contractVersion))bindings.MAX_MINTS_PER_WALLET='20';
  return bindings;
}

/** Pure ordered calldata. Owner governs official collections, never individual applicants. */
export function eligibilityOperations(input,abi) {
  const {chainId,registry,owner,factory,roundId,factoryCodeHash,approvedCodeHash,registered,previousFinished,factoryOwner,expectedFactoryOwner}=input;
  ensure([1,11155111].includes(chainId),'Unsupported chain.');
  [registry,owner,factory,factoryOwner,expectedFactoryOwner].forEach(address);
  ensure(same(factoryOwner,expectedFactoryOwner),'Factory owner differs from review.');
  ensure(/^[1-9][0-9]*$/.test(roundId)&&BigInt(roundId)<2n**256n,'Invalid round ID.');
  ensure(/^0x[0-9a-f]{64}$/i.test(factoryCodeHash)&&!same(factoryCodeHash,ZeroHash),'Invalid factory hash.');
  ensure(same(approvedCodeHash,ZeroHash)||same(approvedCodeHash,factoryCodeHash),'Approved factory runtime differs.');
  ensure(registered||previousFinished,'Previous canonical collection is unfinished.');
  const iface=new Interface(abi),calls=[];
  const add=(purpose,method,args)=>calls.push({purpose,chainId,from:address(owner),to:address(registry),value:'0',data:iface.encodeFunctionData(method,args)});
  if(same(approvedCodeHash,ZeroHash))add('Approve this reviewed official factory','approveFactory',[factory,factoryCodeHash]);
  if(!registered)add('Append the official collection to canonical enrollment order','registerCollection',[factory,BigInt(roundId)]);
  return calls;
}

async function main() {
  const [mode,...args]=process.argv.slice(2),options={};
  const expected=mode==='deploy'?['--chain','--owner','--output','--version']:mode==='collection'?['--manifest','--expected-hash','--factory','--round','--output']:mode==='legacy'?['--chain','--factory','--round','--factory-owner','--output','--version','--source-version']:[];
  for(let i=0;i<args.length;i+=2){ensure(expected.includes(args[i])&&!Object.hasOwn(options,args[i])&&args[i+1],'Invalid repeated/incomplete argument.');options[args[i]]=args[i+1];}
  ensure(expected.length&&Object.keys(options).length===expected.length-((mode==='deploy'||mode==='legacy')&&!options['--version']?1:0)-(mode==='legacy'&&!options['--source-version']?1:0),'Use deploy --chain ID --owner ADDRESS --output NEWFILE; collection --manifest FILE --expected-hash HASH --factory ADDRESS --round ADDRESS --output NEWFILE; or legacy --chain ID --factory ADDRESS --round ADDRESS --factory-owner ADDRESS --output NEWFILE.');
  const launch=mode==='collection'?verifyLaunchExport(JSON.parse(await readFile(options['--manifest'],'utf8')),options['--expected-hash']):null;
  const sourceVersion=mode==='legacy'?(options['--source-version']??'v5'):null;
  if(sourceVersion)ensure(['v5','v6','v7','v8','v9'].includes(sourceVersion),'Legacy source version must be v5 through v9.');
  const policy=eligibilityVersionPolicy(launch?.contractVersion??(sourceVersion?`affiliate-${sourceVersion}`:'affiliate-v6'),options['--version']);
  const gateArtifact=await artifact(policy.registryName),VERSION=policy.registryVersion;
  if(sourceVersion==='v6')ensure(['affiliate-eligibility-v2','affiliate-eligibility-v3','affiliate-eligibility-v4','affiliate-eligibility-v5'].includes(VERSION),'Historical V6 sources require eligibility V2 or V3.');
  if(sourceVersion==='v8')ensure(['affiliate-eligibility-v4','affiliate-eligibility-v5'].includes(VERSION),'Historical V8 sources require eligibility V4 or V5.');
  if(sourceVersion==='v9')ensure(VERSION==='affiliate-eligibility-v5','Historical V9 sources require eligibility V5.');
  if(sourceVersion==='v7')ensure(['affiliate-eligibility-v3','affiliate-eligibility-v4','affiliate-eligibility-v5'].includes(VERSION),'Historical V7 sources require eligibility V3.');
  if(mode==='deploy') {
    const chainId=Number(options['--chain']),owner=address(options['--owner']);
    ensure([1,11155111].includes(chainId),'Unsupported chain.');
    ensure(!process.env[`${policy.pinPrefix}ADDRESS_${chainId}`],'Reuse the canonical registry; replacement would reset bootstrap and NFT-use records.');
    const tx=await new ContractFactory(gateArtifact.abi,gateArtifact.bytecode).getDeployTransaction(owner);
    await writeFile(options['--output'],json({schemaVersion:1,kind:'affiliate-eligibility-deployment',registryVersion:VERSION,chainId,owner,transaction:{chainId,from:owner,data:tx.data,value:'0'},note:'Unsigned only. One canonical registry per version and network; never redeploy for each factory. Before a registry migration, import all completed prior official source collections in order so the NFT admission bootstrap is not reset.'}),{flag:'wx',mode:0o600});
    console.log('Prepared unsigned affiliate eligibility deployment. No transactions sent.');return;
  }
  if(launch)ensure(['affiliate-v6','affiliate-v7','affiliate-v8','affiliate-v9','affiliate-v10'].includes(launch.contractVersion)&&launch.operations.affiliateEligibilityAddress,'A finalized gated V6–V10 configuration is required.');
  const chainId=Number(launch?.contract.chainId??options['--chain']);ensure([1,11155111].includes(chainId),'Unsupported chain.');
  const registry=address(process.env[`${policy.pinPrefix}ADDRESS_${chainId}`]);
  if(launch)ensure(same(registry,launch.operations.affiliateEligibilityAddress),'Finalized registry differs from canonical configuration.');
  const pin=process.env[`${policy.pinPrefix}CODEHASH_${chainId}`];ensure(/^0x[0-9a-f]{64}$/i.test(pin??'')&&!same(pin,ZeroHash),'Configure the canonical eligibility runtime hash.');
  const rpc=process.env[chainId===1?'MAINNET_RPC_URL':'SEPOLIA_RPC_URL'];ensure(rpc?.startsWith('https://'),'Configure the correct HTTPS RPC.');
  const provider=new JsonRpcProvider(rpc,chainId,{staticNetwork:true});
  try {
    ensure(BigInt(await provider.send('eth_chainId',[]))===BigInt(chainId),'Wrong RPC network.');
    const head=await provider.getBlock('latest');ensure(head?.hash&&Math.abs(Date.now()/1000-head.timestamp)<300,'Stale RPC.');
    const block=await provider.getBlock(head.number-2);ensure(block?.hash,'No confirmed block.');const at={blockTag:block.number};
    const factoryAddress=address(options['--factory']),roundAddress=address(options['--round']),version=policy.componentVersion;
    const [fa,ra,rendererArtifact,helperArtifact]=await Promise.all([`ManekinekoFactory${version}`,`ManekinekoRound${version}`,`ManekinekoRenderer${version}`,`ManekinekoRoundDeployer${version}`].map(artifact));
    const [gateCode,factoryCode,roundCode]=await Promise.all([registry,factoryAddress,roundAddress].map(a=>provider.getCode(a,block.number)));
    ensure(matchesRuntime(gateCode,gateArtifact)&&same(keccak256(gateCode),pin)&&matchesRuntime(factoryCode,fa)&&matchesRuntime(roundCode,ra),'Compiled runtime or canonical pin differs.');
    const gate=new Contract(registry,gateArtifact.abi,provider),factory=new Contract(factoryAddress,fa.abi,provider),round=new Contract(roundAddress,ra.abi,provider);
    ensure(await gate.ELIGIBILITY_VERSION(at)===VERSION,'Unsupported gate version.');
    const roundId=await round.roundId(at),renderer=await factory.renderer(at),helper=await factory.deployer(at);
    ensure(same(await factory.rounds(roundId,at),roundAddress)&&same(await round.renderer(at),renderer),'Factory or renderer binding differs.');
    ensure(matchesRuntime(await provider.getCode(renderer,block.number),rendererArtifact)&&matchesRuntime(await provider.getCode(helper,block.number),helperArtifact),'Factory components differ.');
    ensure(same(await new Contract(helper,helperArtifact.abi,provider).factory(at),factoryAddress),'Round helper binding differs.');
    ensure(await round.CONTRACT_VERSION(at)===`affiliate-${version.toLowerCase()}`&&await round.ALGORITHM_VERSION(at)===policy.algorithmVersion,'Unsupported collection version.');
    if(['affiliate-v7','affiliate-v8','affiliate-v9','affiliate-v10'].includes(launch?.contractVersion)){
      const template=new Contract(helper,helperArtifact.abi,provider),code=ra.bytecode.slice(2),split=Math.floor(code.length/4)*2;
      const parts=[await template.codePart1(at),await template.codePart2(at)],expected=[`0x00${code.slice(0,split)}`,`0x00${code.slice(split)}`];
      for(let i=0;i<2;i++)ensure(same(await provider.getCode(parts[i],block.number),expected[i]),'Ranked-award creation template differs.');
      ensure(await round.saleStartAt(at)>BigInt(block.timestamp),'Register before the fixed enrollment closing time.');
      assertEligibilityMigrationReady(VERSION,chainId,await gate.collectionCount(at));
    }
    if(launch) {
      ensure(same(await round.affiliateEligibility(at),registry),'Round points to another gate.');
      ensure(!await round.saleActivated(at)&&await round.totalMinted(at)===0n&&!await round.refundsAvailable(at),'Register before enrollment and mint activation.');
      ensure(launch.operations.factoryMode!=='new'||roundId===1n,'New-factory plan requires round one.');
      if(launch.operations.factoryMode==='existing')ensure(same(factoryAddress,launch.operations.factoryAddress),'Reviewed factory differs.');
      const bindings=eligibilityRoundBindings(launch);
      for(const [field,value]of Object.entries(bindings))ensure(same(await round[field](at),value),`Reviewed ${field} differs.`);
    } else ensure(version==='V7'?await round.readyForNextRound(at):await round.prizePaid(at)&&await round.soldOut(at)&&await round.revealed(at),'Legacy sources must be completed with prizes protected.');
    const registration=await gate.collections(roundAddress,at),registered=registration.sequence>0n;
    if(registered)ensure(same(registration.factory,factoryAddress)&&registration.roundId===roundId&&same(registration.codeHash,keccak256(roundCode))&&registration.sourceOnly===!launch,'Existing registration differs.');
    const last=await gate.lastCollection(at);let previousFinished=true;
    if(!registered&&!same(last,ZeroAddress)) {
      const previous=new Contract(last,['function CONTRACT_VERSION() view returns(string)','function readyForNextRound() view returns(bool)','function prizePaid() view returns(bool)','function soldOut() view returns(bool)','function revealed() view returns(bool)','function refundsAvailable() view returns(bool)'],provider);
      previousFinished=(['affiliate-v7','affiliate-v8','affiliate-v9','affiliate-v10'].includes(await previous.CONTRACT_VERSION(at))?await previous.readyForNextRound(at):(await previous.prizePaid(at)&&await previous.soldOut(at)&&await previous.revealed(at)))||await previous.refundsAvailable(at);
    }
    const calls=eligibilityOperations({chainId,registry,owner:await gate.owner(at),factory:factoryAddress,roundId:String(roundId),factoryOwner:await factory.owner(at),expectedFactoryOwner:launch?.operations.factoryOwnerAddress??options['--factory-owner'],factoryCodeHash:keccak256(factoryCode),approvedCodeHash:await gate.approvedFactoryCodeHash(factoryAddress,at),registered,previousFinished},gateArtifact.abi);
    const sequence=registered?registration.sequence:(await gate.collectionCount(at))+1n;
    ensure((await provider.getBlock(block.number))?.hash===block.hash,'Snapshot reorganized.');
    await writeFile(options['--output'],json({schemaVersion:1,kind:'affiliate-eligibility-operations',registryVersion:VERSION,chainId,registry,round:roundAddress,configurationHash:launch?options['--expected-hash']:null,blockNumber:block.number,blockHash:block.hash,expectedSequence:String(sequence),enrollmentPolicy:launch?(sequence===1n?'bootstrap-open':'previous-completed-nft'):'legacy-source-only',calls,note:'Unsigned operations. Recheck canonical registry order before signing. A new factory does not reset bootstrap eligibility.'}),{flag:'wx',mode:0o600});
    console.log(`Prepared ${calls.length} unsigned eligibility operations. No transactions sent.`);
  } finally { provider.destroy(); }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Eligibility preparation stopped. No transactions sent; provider details withheld.');process.exitCode=1;});
