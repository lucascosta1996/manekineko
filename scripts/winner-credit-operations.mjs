import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Contract, ContractFactory, Interface, JsonRpcProvider, getAddress, keccak256, ZeroHash, ZeroAddress } from 'ethers';
import { verifyLaunchExport } from '../apps/launch/lib/launch-export.ts';
import { matchesRuntime } from '../apps/contracts/scripts/runtime-match.ts';
import { validateLegacyCreditManifest } from '../packages/contracts/src/winner-credits.ts';
import { verifyRetiredRegistryTargets } from './winner-credit-retirement.ts';
const ROOT = new URL('../',import.meta.url);
const ensure=(ok,message)=>{if(!ok)throw new Error(message);};
const lower=address=>getAddress(address).toLowerCase();
const json=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n';
async function artifact(name){return JSON.parse(await readFile(new URL(`apps/contracts/artifacts/contracts/${name}.sol/${name}.json`,ROOT),'utf8'));}

export function winnerCreditVersionPolicy(contractVersion) {
  const policies = {
    'affiliate-v6': ['V6','ManekinekoWinnerCredits','winner-credits-v2','unique-rank-v3'],
    'affiliate-v7': ['V7','ManekinekoWinnerCreditsV3','winner-credits-v3','unique-rank-v4'],
    'affiliate-v8': ['V8','ManekinekoWinnerCreditsV4','winner-credits-v4','unique-rank-v5'],
    'affiliate-v9': ['V9','ManekinekoWinnerCreditsV5','winner-credits-v5','unique-rank-v5'],
    'affiliate-v10': ['V10','ManekinekoWinnerCreditsV6','winner-credits-v6','unique-rank-v6'],
  };
  ensure(Object.hasOwn(policies,contractVersion),'Finalized supported V6–V10 configuration required.');
  const [componentVersion,registryName,registryVersion,algorithmVersion] = policies[contractVersion];
  const v7=contractVersion==='affiliate-v7', v8=['affiliate-v8','affiliate-v9','affiliate-v10'].includes(contractVersion);
  return {v7,v8,ranked:v7||v8,componentVersion,registryName,registryVersion,algorithmVersion};
}
export function winnerCreditRoundBindings(launch) {
  const policy=winnerCreditVersionPolicy(launch.contractVersion),c=launch.contract;
  const bindings={name:c.name,symbol:c.symbol,maxSupply:c.maxSupply,mintPrice:c.mintPriceWei,prizeBps:c.prizeBps,affiliatePoolBps:c.affiliatePoolBps,enrollmentSigner:c.enrollmentSigner,maxAffiliateSlots:c.maxAffiliateSlots,requestConfirmations:c.requestConfirmations,callbackGasLimit:c.callbackGasLimit,vrfCoordinator:c.vrfCoordinator,keyHash:c.keyHash,affiliateEligibility:launch.operations.affiliateEligibilityAddress,ALGORITHM_VERSION:policy.algorithmVersion};
  for(const field of ['seasonId','seasonName','collectionColor','textColor'])if(c[field]!==undefined)bindings[field]=c[field];
  if(policy.ranked){
    for(const field of [policy.v8?'winnerCount':'secondPrizeBps','minAffiliateReferrals','affiliatePayoutCapBps','saleStartAt']){ensure(typeof c[field]==='string'&&/^[1-9][0-9]*$/.test(c[field]),`Resolved positive ${policy.componentVersion} ${field} required.`);bindings[field]=c[field];}
    ensure(typeof c.mintDurationSeconds==='string'&&/^[1-9][0-9]*$/.test(c.mintDurationSeconds),'Resolved scheduled sale duration required.');
    bindings.mintDeadline=String(BigInt(c.saleStartAt)+BigInt(c.mintDurationSeconds));bindings.awardCount=policy.v8?c.winnerCount:'2';
    if(policy.v8)ensure(BigInt(c.winnerCount)<=10n && BigInt(c.winnerCount)<=BigInt(c.maxSupply) && BigInt(c.prizeBps)>0n && BigInt(c.prizeBps)%BigInt(c.winnerCount)===0n,'V8 requires 1–10 equal awards within supply.');
  }
  if(['affiliate-v9','affiliate-v10'].includes(launch.contractVersion))bindings.MAX_MINTS_PER_WALLET='20';
  return bindings;
}
export async function verifyPreviousRegistry(provider, registry, chainId, block, expectedPrior, currentVersion='winner-credits-v3') {
  const at={blockTag:block.number},prior=getAddress(await registry.previousRegistry(at));
  const configured=process.env[`WINNER_CREDITS_PREVIOUS_ADDRESS_${chainId}`];
  ensure(lower(prior)===lower(expectedPrior??configured??ZeroAddress),'Previous registry does not match the reviewed migration.');
  if(prior===ZeroAddress)return prior;
  const hash=process.env[`WINNER_CREDITS_PREVIOUS_CODEHASH_${chainId}`];
  ensure(/^0x[0-9a-f]{64}$/i.test(hash??''),'Pin the previous winner registry before migration.');
  ensure(keccak256(await provider.getCode(prior,block.number)).toLowerCase()===hash.toLowerCase(),'Previous registry runtime differs from the reviewed pin.');
  let address=prior;
  let allowed=currentVersion==='winner-credits-v6'?['winner-credits-v2','winner-credits-v3','winner-credits-v4','winner-credits-v5']:currentVersion==='winner-credits-v5'?['winner-credits-v2','winner-credits-v3','winner-credits-v4']:currentVersion==='winner-credits-v4'?['winner-credits-v2','winner-credits-v3']:['winner-credits-v2'];
  const seen=new Set();
  const manifest=validateLegacyCreditManifest(JSON.parse(await readFile(new URL('packages/contracts/src/winner-credits-legacy.json',ROOT),'utf8')));
  const expectedRoot=manifest.chains.find(chain=>chain.chainId===chainId)?.root??ZeroHash;
  // V4 may inherit V3's V2 predecessor. Every sponsorship ledger in that lineage must be retired.
  while(address!==ZeroAddress){
    ensure(!seen.has(lower(address))&&seen.size<4,'Invalid prior registry lineage.');seen.add(lower(address));
    const probe=new Contract(address,['function WINNER_CREDITS_VERSION() view returns(string)'],provider);
    const version=await probe.WINNER_CREDITS_VERSION(at);
    ensure(allowed.includes(version),'Previous registry version differs.');
    const priorArtifact=await artifact(version==='winner-credits-v5'?'ManekinekoWinnerCreditsV5':version==='winner-credits-v4'?'ManekinekoWinnerCreditsV4':version==='winner-credits-v3'?'ManekinekoWinnerCreditsV3':'ManekinekoWinnerCredits');
    ensure(matchesRuntime(await provider.getCode(address,block.number),priorArtifact),'Previous registry differs from its reviewed build.');
    const previous=new Contract(address,priorArtifact.abi,provider);
    ensure(await previous.totalSponsorBalance(at)===0n,'Retire all prior registry sponsorship before migrating.');
    if(currentVersion==='winner-credits-v6'){
      ensure((await previous.legacyMerkleRoot(at)).toLowerCase()===expectedRoot,'Preserve the canonical historical winner root throughout the predecessor lineage.');
      await verifyRetiredRegistryTargets(provider,address,priorArtifact.abi,block);
    }
    address=version!=='winner-credits-v2'?getAddress(await previous.previousRegistry(at)):ZeroAddress;
    allowed=version==='winner-credits-v5'?['winner-credits-v2','winner-credits-v3','winner-credits-v4']:version==='winner-credits-v4'?['winner-credits-v2','winner-credits-v3']:['winner-credits-v2'];
  }
  return prior;
}

/** Pure unsigned operations. The budget is a cumulative funding cap, never an automatic refill target. */
export function collectionCreditOperations(input, abi) {
  const {chainId,registry,owner,funder,factory,factoryOwner,expectedFactoryOwner,factoryCodeHash,round,roundId,budgetWei,totalFundedWei,approvedCodeHash,registered,registrationRewardsOnly=false}=input;
  ensure([1,11155111].includes(chainId),'Unsupported network.');
  for(const value of [registry,owner,funder,factory,factoryOwner,expectedFactoryOwner,round])ensure(lower(value)!==ZeroAddress,'Zero operation address.');
  ensure(lower(factoryOwner)===lower(expectedFactoryOwner),'Reviewed factory owner differs.');
  for(const value of [budgetWei,totalFundedWei,roundId])ensure(typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value)&&BigInt(value)<(1n<<256n),'Invalid operation amount.');
  ensure(BigInt(budgetWei)>0n&&BigInt(roundId)>0n,'Positive budget and round ID required.');
  ensure(/^0x[0-9a-f]{64}$/i.test(factoryCodeHash)&&factoryCodeHash!==ZeroHash,'Invalid factory pin.');
  ensure(!registrationRewardsOnly,'Collection activated before reward-target registration; it can only earn credits.');
  ensure(approvedCodeHash===ZeroHash||approvedCodeHash.toLowerCase()===factoryCodeHash.toLowerCase(),'Registry factory pin differs.');
  const iface=new Interface(abi),calls=[];
  const add=(purpose,from,method,args,value='0')=>calls.push({purpose,chainId,from:getAddress(from),to:getAddress(registry),data:iface.encodeFunctionData(method,args),value});
  if(approvedCodeHash===ZeroHash)add('Approve this reviewed immutable factory',owner,'approveFactory',[factory,factoryCodeHash]);
  if(!registered)add('Register collection before activating its sale',funder,'registerCollection',[factory,roundId]);
  const remaining=BigInt(budgetWei)-BigInt(totalFundedWei);
  if(remaining>0n)add('Fund the remaining reviewed sponsorship budget',funder,'fundCollection',[round],String(remaining));
  return calls;
}

async function main(){
  const [mode,...args]=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i+=2){ensure(args[i]?.startsWith('--')&&args[i+1]&&!Object.hasOwn(options,args[i]),'Invalid repeated/incomplete option.');options[args[i]]=args[i+1];}
  const allowed=mode==='deploy'?['--chain','--owner','--output','--version']:mode==='collection'?['--manifest','--expected-hash','--factory','--round','--registry-codehash','--output']:[];
  ensure(allowed.length&&Object.keys(options).length===allowed.length-(mode==='deploy'&&!options['--version']?1:0)&&Object.keys(options).every(key=>allowed.includes(key)),'Use deploy --chain ID --owner ADDRESS --output NEWFILE, or collection --manifest FILE --expected-hash HASH --factory ADDRESS --round ADDRESS --registry-codehash HASH --output NEWFILE.');
  const launch=mode==='collection'?verifyLaunchExport(JSON.parse(await readFile(options['--manifest'],'utf8')),options['--expected-hash']):null;
  const policy=launch?winnerCreditVersionPolicy(launch.contractVersion):winnerCreditVersionPolicy((options['--version']??'v2')==='v2'?'affiliate-v6':options['--version']==='v6'?'affiliate-v10':options['--version']==='v5'?'affiliate-v9':options['--version']==='v4'?'affiliate-v8':'affiliate-v7');
  ensure(mode!=='deploy'||!options['--version']||['v2','v3','v4','v5','v6'].includes(options['--version']),'Use registry --version v2 through v6.');
  const registryArtifact=await artifact(policy.registryName);
  ensure(new Interface(registryArtifact.abi).getFunction('redeemedSource')!==null,'Rebuild the lifetime-limit registry before preparing operations.');
  ensure((registryArtifact.deployedBytecode.length-2)/2<=24576&&(registryArtifact.bytecode.length-2)/2<=49152,'Registry exceeds deployment size limits.');
  const manifest=validateLegacyCreditManifest(JSON.parse(await readFile(new URL('packages/contracts/src/winner-credits-legacy.json',ROOT),'utf8')));
  if(mode==='deploy'){
    const chainId=Number(options['--chain']),owner=getAddress(options['--owner']);
    ensure([1,11155111].includes(chainId)&&owner!==ZeroAddress,'Invalid deployment network/owner.');
    const root=manifest.chains.find(chain=>chain.chainId===chainId)?.root??ZeroHash;
    // A second canonical registry would reset spent-credit state. Existing configuration blocks this shortcut.
    const configured=process.env[`WINNER_CREDITS_ADDRESS_${chainId}`],prior=getAddress(process.env[`WINNER_CREDITS_PREVIOUS_ADDRESS_${chainId}`]??ZeroAddress);
    if(!policy.ranked)ensure(!configured,'A canonical registry is already configured; reuse it. Replacing it requires a spent-state migration.');
    else {
      ensure(!configured||(prior!==ZeroAddress&&lower(configured)===lower(prior)),'A canonical registry is already configured; a migration must carry that exact previous registry.');
      if(prior!==ZeroAddress){
        const rpc=process.env[chainId===1?'MAINNET_RPC_URL':'SEPOLIA_RPC_URL'];ensure(rpc?.startsWith('https://'),'Configure HTTPS RPC to verify prior spent-state migration.');
        const provider=new JsonRpcProvider(rpc,chainId,{staticNetwork:true});
        try{
          ensure(BigInt(await provider.send('eth_chainId',[]))===BigInt(chainId),'Wrong RPC network.');
          const block=await provider.getBlock('latest');ensure(block?.hash&&Math.abs(Date.now()/1000-block.timestamp)<300,'Stale RPC head.');
          await verifyPreviousRegistry(provider,{previousRegistry:async()=>prior},chainId,block,prior,policy.registryVersion);
        }finally{provider.destroy();}
      }
    }
    const tx=await new ContractFactory(registryArtifact.abi,registryArtifact.bytecode).getDeployTransaction(...(policy.ranked?[owner,root,prior]:[owner,root]));
    await writeFile(options['--output'],json({schemaVersion:1,kind:'winner-credits-deployment',registryVersion:policy.registryVersion,rewardLimit:'one-sponsored-mint-per-wallet-lifetime',chainId,legacyMerkleRoot:root,owner,...(policy.ranked?{previousRegistry:prior,previousRegistryRetirementRequired:prior!==ZeroAddress}:{}),
      transaction:{from:owner,data:tx.data,value:'0',chainId},note:'Unsigned deployment plan only. Deploy one canonical registry per network; preserve it across future factories.'}),{flag:'wx',mode:0o600});
    console.log('Prepared unsigned registry deployment; no transactions sent.');return;
  }
  ensure(['affiliate-v6','affiliate-v7','affiliate-v8','affiliate-v9','affiliate-v10'].includes(launch.contractVersion)&&launch.operations.winnerCreditsAddress&&launch.operations.winnerCreditSponsorshipWei&&launch.operations.affiliateEligibilityAddress,'Finalized V6–V10 winner-credit and holder-eligibility configuration required.');
  const chainId=Number(launch.contract.chainId),registryAddress=getAddress(launch.operations.winnerCreditsAddress);
  // Explicit canonical pins prevent a launch config from resetting the protocol reward ledger.
  ensure(lower(process.env[`WINNER_CREDITS_ADDRESS_${chainId}`]??ZeroAddress)===lower(registryAddress),'Configure the canonical registry address for this network.');
  ensure(process.env[`WINNER_CREDITS_CODEHASH_${chainId}`]?.toLowerCase()===options['--registry-codehash'].toLowerCase(),'Configure the matching canonical registry runtime pin.');
  const rpc=process.env[chainId===1?'MAINNET_RPC_URL':'SEPOLIA_RPC_URL'];ensure(typeof rpc==='string'&&rpc.startsWith('https://'),'Configure the correct HTTPS RPC.');
  const provider=new JsonRpcProvider(rpc,chainId,{staticNetwork:true});
  try{
    ensure(BigInt(await provider.send('eth_chainId',[]))===BigInt(chainId),'Wrong RPC network.');
    const head=await provider.getBlock('latest');ensure(head?.hash&&Date.now()/1000-head.timestamp<300,'Stale RPC head.');
    const block=await provider.getBlock(head.number-2);ensure(block?.hash,'No confirmed block.');const at={blockTag:block.number};
    const factoryAddress=getAddress(options['--factory']),roundAddress=getAddress(options['--round']);
    if(launch.operations.factoryMode==='existing')ensure(lower(factoryAddress)===lower(launch.operations.factoryAddress),'Reviewed existing factory differs.');
    const [fa,ra,rendererArtifact,helperArtifact]=await Promise.all(['Factory','Round','Renderer','RoundDeployer'].map(part=>artifact(`Manekineko${part}${policy.componentVersion}`)));
    const [factoryCode,roundCode,registryCode]=await Promise.all([factoryAddress,roundAddress,registryAddress].map(address=>provider.getCode(address,block.number)));
    ensure(matchesRuntime(factoryCode,fa)&&matchesRuntime(roundCode,ra)&&matchesRuntime(registryCode,registryArtifact)
      &&keccak256(registryCode).toLowerCase()===options['--registry-codehash'].toLowerCase(),'Compiled bytecode or registry pin differs.');
    const factory=new Contract(factoryAddress,fa.abi,provider),round=new Contract(roundAddress,ra.abi,provider),registry=new Contract(registryAddress,registryArtifact.abi,provider);
    const [roundId,price,supply,owner,version,renderer,helper,roundRenderer,active]=await Promise.all([round.roundId(at),round.mintPrice(at),round.maxSupply(at),round.owner(at),round.CONTRACT_VERSION(at),factory.renderer(at),factory.deployer(at),round.renderer(at),round.saleActivated(at)]);
    ensure(launch.operations.factoryMode!=='new'||roundId===1n,'A new-factory launch must target its first collection.');
    ensure(version===launch.contractVersion&&lower(await factory.rounds(roundId,at))===lower(roundAddress)&&lower(renderer)===lower(roundRenderer),'Collection/factory binding differs.');
    ensure(matchesRuntime(await provider.getCode(renderer,block.number),rendererArtifact)&&matchesRuntime(await provider.getCode(helper,block.number),helperArtifact),'Factory components differ.');
    ensure(lower(await new Contract(helper,helperArtifact.abi,provider).factory(at))===lower(factoryAddress),'Helper factory binding differs.');
    if(policy.ranked){
      const template=new Contract(helper,helperArtifact.abi,provider),code=ra.bytecode.slice(2),split=Math.floor(code.length/4)*2;
      const parts=[await template.codePart1(at),await template.codePart2(at)],expected=[`0x00${code.slice(0,split)}`,`0x00${code.slice(split)}`];
      for(let i=0;i<2;i++)ensure((await provider.getCode(parts[i],block.number)).toLowerCase()===expected[i].toLowerCase(),'Ranked-award creation template differs.');
      ensure(await round.saleStartAt(at)>BigInt(block.timestamp),'Register and fund before the fixed sale opening.');
    }
    const bindings=winnerCreditRoundBindings(launch);
    for(const [field,expected]of Object.entries(bindings))ensure(String(await round[field](at)).toLowerCase()===String(expected).toLowerCase(),`Reviewed ${field} differs.`);
    ensure(lower(owner)===lower(launch.contract.initialOwner),'Collection owner differs.');
    ensure(await round.mintDeadline(at)>BigInt(block.timestamp)&&!(await round.cancelled(at))&&await round.totalMinted(at)<supply,'Collection cannot accept future sponsored mints.');
    ensure(await registry.WINNER_CREDITS_VERSION(at)===policy.registryVersion,'Registry version differs.');
    if(policy.ranked)await verifyPreviousRegistry(provider,registry,chainId,block,undefined,policy.registryVersion);
    ensure((await registry.legacyMerkleRoot(at)).toLowerCase()===(manifest.chains.find(chain=>chain.chainId===chainId)?.root??ZeroHash),'Legacy winner snapshot differs.');
    const registration=await registry.collections(roundAddress,at);
    ensure(registration.sequence!==0n||!active,'Register sponsored collections before sale activation.');
    if(registration.sequence!==0n)ensure(lower(registration.factory)===lower(factoryAddress)&&registration.roundId===roundId&&registration.codeHash===keccak256(roundCode),'Stored registration differs.');
    const totalFunded=await registry.totalFunded(roundAddress,at),budget=launch.operations.winnerCreditSponsorshipWei;
    const calls=collectionCreditOperations({chainId,registry:registryAddress,owner:await registry.owner(at),funder:launch.operations.deployerAddress,factory:factoryAddress,factoryOwner:await factory.owner(at),expectedFactoryOwner:launch.operations.factoryOwnerAddress,factoryCodeHash:keccak256(factoryCode),round:roundAddress,roundId:String(roundId),budgetWei:budget,totalFundedWei:String(totalFunded),approvedCodeHash:await registry.approvedFactoryCodeHash(factoryAddress,at),registered:registration.sequence!==0n,registrationRewardsOnly:registration.rewardsOnly===true},registryArtifact.abi);
    ensure((await provider.getBlock(block.number))?.hash===block.hash,'Snapshot reorganized; repeat preparation.');
    await writeFile(options['--output'],json({schemaVersion:1,kind:'winner-credit-collection-operations',registryVersion:policy.registryVersion,rewardLimit:'one-sponsored-mint-per-wallet-lifetime',configurationHash:options['--expected-hash'],chainId,registry:registryAddress,round:roundAddress,blockNumber:block.number,blockHash:block.hash,reviewedCumulativeBudgetWei:budget,alreadyFundedWei:String(totalFunded),unspentBalanceWei:String(await registry.sponsorBalance(roundAddress,at)),plannedMaxMints:String(BigInt(budget)/price<supply?BigInt(budget)/price:supply),calls,
      note:'Unsigned, ordered operations. Recheck chain state immediately before execution; do not blindly replay a saved funding transaction. Register and fund before sale activation.'}),{flag:'wx',mode:0o600});
    console.log(`Prepared ${calls.length} unsigned winner-credit operations; no transactions sent.`);
  }finally{provider.destroy();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Winner credit operation preparation stopped. No transactions sent; provider diagnostics withheld.');process.exitCode=1;});
