/** V17 deployment stops before fundOperating/sealCatalog. This file cannot start a rehearsal. */
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {Contract,ContractFactory,Wallet,keccak256,toUtf8Bytes} from 'ethers';
import {compiled,verifyRuntime} from '../protocol-v14/verify-deployment.mts';
import {publishSources} from '../protocol-v14/source-publication.mts';
import {explorerTransport} from '../protocol-v14/explorer-fetch.mts';
import {rehearsalProvider} from '../protocol-v14/rehearsal/rpc.mts';
import {createTransactionPipeline,ChainPendingError} from '../season-runner/chain-transactions.ts';
import {durable,exclusive,privateRead} from '../protocol-v12/rehearsal/store.mts';
import {v17FastBallotOptions} from '../../apps/contracts/config/v17-ballot.ts';
export const releaseSettings={operator:'0x3b2571129c05bD71B6504596aB2ca52B3ffB7223',coordinator:'0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B',keyHash:'0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae',confirmations:3,callbackGas:200000,votingDuration:180,votingDelay:1,randomnessBudget:'10000000000000000',sponsorshipBudget:'1000000000000000'};
const normalize=(v:unknown)=>JSON.parse(JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x));
export async function releaseManifest(){
 const source=JSON.parse(await readFile(new URL('../../apps/launch/catalog/sepolia.json',import.meta.url),'utf8'));
 assert.equal(source.chainId,11155111);assert.equal(source.seasons.length,22);
 const catalog=source.seasons.slice(0,2).flatMap((s:any)=>s.collections.slice(0,3).map((c:any)=>({seasonId:s.seasonId,seasonName:s.name,name:c.name,color:c.color,textColor:c.textColor})));
 assert.equal(catalog.length,6);
 const artifact=await compiled('ManekinekoV17');
 assert.ok((artifact.deployedBytecode.length-2)/2<=65536&&(artifact.bytecode.length-2)/2<=131072);
 return{version:17,chainId:11155111,rehearsal:true,settings:releaseSettings,options:normalize(v17FastBallotOptions),catalog,creationHash:keccak256(artifact.bytecode),maxFeePerGasWei:'500000000',maxTotalSpendWei:'49000000000000000',state:'deployed-unsealed-rehearsal-not-started'};
}
export async function verifyStopped(provider:any,address:string,manifest:any,blockTag:number){
 assert.equal(await provider.send('eth_chainId',[]),'0xaa36a7');
 const artifact=await compiled('ManekinekoV17'),code=await provider.getCode(address,blockTag),c=new Contract(address,artifact.abi,provider),at={blockTag};
 verifyRuntime(code,artifact,{identityChain:11155111n,REHEARSAL_MODE:true,GENESIS_SUPPLY:20n,RANDOMNESS_TIMEOUT:900n,EXECUTION_REWARD:100000000000000n});
 assert.equal(await c.CONTRACT_VERSION(at),'tincta-v17');assert.equal(await c.REHEARSAL_MODE(at),true);assert.equal(await c.GENESIS_SUPPLY(at),20n);assert.equal(await c.ALGORITHM_VERSION(at),'unique-rank-v6');
 const settings=await c.settings(at);for(const[k,v]of Object.entries(manifest.settings))assert.equal(String(settings[k]).toLowerCase(),String(v).toLowerCase());
 assert.equal(await c.catalogCount(at),6n);assert.equal(await c.optionCount(at),3n);
 for(let i=0;i<3;i++){const t=await c.option(i,at);for(const[k,v]of Object.entries(manifest.options[i]))assert.equal(String(t[k]),v);}
 for(let offset=0;offset<6;offset+=8)await Promise.all(manifest.catalog.slice(offset,offset+8).map(async(p:any,i:number)=>{const actual=await c.collection(offset+i+1,at);for(const[k,v]of Object.entries(p))assert.equal(actual[k],v);}));
 assert.equal(await c.catalogSealed(at),false);assert.equal(await c.prepared(at),0n);assert.equal((await c.round(0,at)).minted,0n);assert.equal(await c.genesisStartsAt(at),0n);assert.equal(await c.genesisSoldOutAt(at),0n);assert.equal(await c.operatingReserve(at),0n);assert.equal(await c.accountedBalance(at),0n);assert.equal(await provider.getBalance(address,blockTag),0n);
 return{address,codeHash:keccak256(code),block:blockTag,blockHash:(await provider.getBlock(blockTag)).hash,prepared:0,genesisMints:0,sealed:false};
}
async function main(){
 const directory=process.env.V17_DEPLOY_DIRECTORY;assert.ok(directory?.startsWith('/'),'An absolute private release directory is required.');await mkdir(directory,{recursive:true,mode:0o700});
 const manifest=await releaseManifest(),hash=keccak256(toUtf8Bytes(JSON.stringify(manifest)));
 let prior;try{prior=JSON.parse(await privateRead(directory+'/manifest.json'));}catch(e:any){if(e.code!=='ENOENT')throw e;}
 if(prior)assert.deepEqual(prior,manifest);else await durable(directory+'/manifest.json',manifest);
 if(process.argv.includes('--manifest-only')){console.log(JSON.stringify({status:'prepared',manifestHash:hash,collections:6,options:3,willSeal:false}));return;}
 assert.ok(process.argv.includes('--execute'),'Use --execute for the authorized deployment.');
 const urls=[process.env.V17_RPC_URL!,process.env.V17_SECONDARY_RPC_URL!];assert.ok(urls.every(x=>x&&new URL(x).protocol==='https:'));assert.notEqual(new URL(urls[0]).hostname,new URL(urls[1]).hostname);assert.ok(process.env.ETHERSCAN_API_KEY,'Exact source publication credentials required.');
 const providers=urls.map(url=>{const p=rehearsalProvider(url),estimate=p.estimateGas.bind(p);p.estimateGas=async request=>estimate({...request,...(!request.to?{gasLimit:(await p.getBlock('latest'))!.gasLimit}:{})});return p;}),unlock=await exclusive(directory+'/signer.lock'),transport=explorerTransport();
 try{
  for(const p of providers){assert.equal(await p.send('eth_chainId',[]),'0xaa36a7');const b=await p.getBlock('latest');assert.ok(b&&Math.abs(Date.now()/1000-b.timestamp)<180&&b.gasLimit>=100000000n);}
  const provider=providers[0],signer=new Wallet(process.env.V17_DEPLOYER_KEY!,provider);assert.equal(signer.address,manifest.settings.operator);
  let state:any;try{state=JSON.parse(await privateRead(directory+'/journal.json'));}catch(e:any){if(e.code!=='ENOENT')throw e;}
  state??={manifestHash:hash,journal:{version:1,chainId:11155111,from:signer.address,maxFeePerGasWei:manifest.maxFeePerGasWei,maxTotalSpendWei:manifest.maxTotalSpendWei,transactions:[],collections:{}}};assert.equal(state.manifestHash,hash);
  const save=()=>durable(directory+'/journal.json',state);await save();const pipeline=createTransactionPipeline({provider,signer,execute:true,journal:state.journal,save,confirmations:2});
  async function send(action:string,request:any){for(;;){try{const receipt=await pipeline.send(action,request);console.log(JSON.stringify({action,hash:receipt.hash,block:receipt.blockNumber}));return receipt;}catch(e){if(!(e instanceof ChainPendingError))throw e;await new Promise(r=>setTimeout(r,4000));}}}
  const artifact=await compiled('ManekinekoV17'),receipt=await send('deploy-v17',await new ContractFactory(artifact.abi,artifact.bytecode).getDeployTransaction(manifest.settings,manifest.options,true));assert.ok(receipt.contractAddress);
  const address=receipt.contractAddress,c=new Contract(address,artifact.abi,provider);state.address=address;await save();
  for(let i=0;i<6;i+=10)await send(`catalog:${i}`,await c.appendCollections.populateTransaction(manifest.catalog.slice(i,i+10)));
  await pipeline.confirmAll();
  const finalBlock=state.journal.transactions.at(-1).blockNumber;
  let anchor=0;
  do{anchor=Math.min(...await Promise.all(providers.map(async p=>(await p.getBlock('latest'))!.number)))-2;if(anchor<finalBlock)await new Promise(r=>setTimeout(r,4000));}while(anchor<finalBlock);
  const verified=await Promise.all(providers.map(p=>verifyStopped(p,address,manifest,anchor)));assert.deepEqual(verified[0],verified[1]);
  const published=await publishSources(11155111,[{name:'ManekinekoV17',address,args:[manifest.settings,manifest.options,true]}],directory+'/source-publication.json',{apiKey:process.env.ETHERSCAN_API_KEY!,fetcher:transport.fetcher,passes:24});
  const result={...verified[0],version:17,chainId:11155111,deploymentBlock:receipt.blockNumber,deploymentTransaction:receipt.hash,manifestHash:hash,verifiedAt:new Date().toISOString(),sources:published.map(p=>({address:p.address,verification:p.verification,published:p.published})),manifest};
  await durable(directory+'/verification.json',result);console.log(JSON.stringify({status:'deployed-and-verified-unsealed',address,codeHash:result.codeHash,deploymentBlock:receipt.blockNumber,genesisMints:0,rehearsalStarted:false}));
 }finally{await unlock();providers.forEach(p=>p.destroy());await transport.close();}
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)main().catch(async e=>{if(process.env.V17_DEPLOY_DIRECTORY)await durable(process.env.V17_DEPLOY_DIRECTORY+'/last-error.json',{code:e.code,message:e.message,stack:e.stack});console.error(JSON.stringify({status:'stopped',code:e.code??e.constructor?.name??'error',location:String(e.stack).match(/scripts\/protocol-v17\/release\.mts:\d+:\d+/)?.[0],detail:e.constructor?.name==='DeploymentError'?e.message:undefined}));process.exitCode=1;});
