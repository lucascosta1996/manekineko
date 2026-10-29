import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Wallet} from 'ethers';
import {durable,exclusive,privateRead} from '../../protocol-v12/rehearsal/store.mts';
import {rehearsalProvider} from '../../protocol-v14/rehearsal/rpc.mts';
import {rehearsalPlan,digest,Hold,type Plan} from './plan.mts';
import {createVault,readVault,exportWallet} from './vault.mts';
import {RehearsalEngine,type RunState} from './engine.mts';
import {report,renderReport} from './report.mts';
async function saveReport(plan:any,state:any,provider:any){const value=await report(plan,state,provider);await durable(directory+'/report.json',value);await writeFile(directory+'/report.md',renderReport(value),{mode:0o600});return value;}
const [command,directoryInput,...args]=process.argv.slice(2);
if(!directoryInput?.startsWith('/'))throw new Error('Use an absolute private rehearsal directory.');
const directory=resolve(directoryInput);await mkdir(directory,{recursive:true,mode:0o700});
if(command==='pause'){await writeFile(directory+'/PAUSED',new Date().toISOString()+'\n',{mode:0o600});console.log(JSON.stringify({status:'paused',onchainClocksContinue:true}));process.exit(0);}
const unlock=await exclusive(directory+'/runner.lock');
let providers:ReturnType<typeof rehearsalProvider>[]=[];
try{
 if(command==='init'){
  if(!args[0])throw new Error('Provide the private verified deployment JSON.');
  const release=JSON.parse(await privateRead(resolve(args[0]))),plan=rehearsalPlan(release,createHash('sha256').update(await readFile(process.argv[1])).digest('hex'));
  if(!release.sources?.length||release.sources.some((s:any)=>!s.published))throw new Error('Exact public contract sources are required.');
  try{await privateRead(directory+'/state.json');throw new Error('This rehearsal already exists.');}catch(e:any){if(e.code!=='ENOENT')throw e;}
  const addresses=await createVault(directory+'/vault.json',process.env.V17_VAULT_KEY!);
  const state:RunState={version:17,planHash:digest(plan),addresses,operatorBaseline:'0',started:false,complete:false,current:1,gate:null,approvals:{},custody:{[addresses[0].toLowerCase()]:{reason:'Manual Genesis and affiliate tests'},[addresses[1].toLowerCase()]:{reason:'Manual referred mint tests'}},journals:{},funding:[],genesisTokens:{},buyers:{},manualWinners:{},accounted:[],gasWei:'0',operatorBudgetWei:'0',recoveries:{},vrfFeesWei:'0',errors:[],outcomes:{},externalReceipts:[]};
  // Initialization is offline; the protected operator baseline is established by
  // the first read-only preflight, before any funding or transaction can run.
  await durable(directory+'/plan.json',plan);await durable(directory+'/state.json',state);await writeFile(directory+'/PAUSED','Prepared; waiting for the user to start.\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({status:'prepared-not-started',planHash:state.planHash,bank:addresses[10],manualAffiliate:addresses[0],manualBuyer:addresses[1],collections:6,options:3}));
 }else{
  const plan:Plan=JSON.parse(await privateRead(directory+'/plan.json')),state:RunState=JSON.parse(await privateRead(directory+'/state.json'));
  if(plan.runtimeSha256!==createHash('sha256').update(await readFile(process.argv[1])).digest('hex'))throw new Error('Use the original frozen rehearsal runtime.');
  if(state.planHash!==digest(plan))throw new Error('Plan hash changed.');
  if(command==='resume'){await unlink(directory+'/PAUSED').catch(e=>{if(e.code!=='ENOENT')throw e;});console.log(JSON.stringify({status:'ready-to-resume',transactionsSent:false}));}
  else if(command==='handoff'){
   const index=Number(args[0]);if(!Number.isInteger(index)||index<0||index>=10||!state.custody[state.addresses[index].toLowerCase()])throw new Error('Only a wallet reserved for human testing can be exported.');
   if(state.journals[index]?.transactions.some(e=>e.state!=='confirmed'))throw new Error('Resolve this wallet’s pending transaction before handoff.');
   const wallets=await readVault(directory+'/vault.json',process.env.V17_VAULT_KEY!);
   console.log(JSON.stringify({status:'human-custody',...await exportWallet(directory+'/handoffs/wallet-'+index,wallets[index]),sepoliaOnly:true}));
  }else{
   const urls=[process.env.V17_RPC_URL!,process.env.V17_SECONDARY_RPC_URL!];if(urls.some(u=>!u||new URL(u).protocol!=='https:')||new URL(urls[0]).hostname===new URL(urls[1]).hostname)throw new Error('Two independent private Sepolia RPCs are required.');providers=urls.map(rehearsalProvider);
   const operator=new Wallet(process.env.V17_OPERATOR_KEY!),wallets=await readVault(directory+'/vault.json',process.env.V17_VAULT_KEY!);
   const engine=new RehearsalEngine({plan,state,directory,provider:providers[0],secondary:providers[1],wallets,operator});
   if(state.operatorBaseline==='0'&&!state.started){state.operatorBaseline=String(await providers[0].getBalance(operator.address));await engine.save();}
   if(command==='preflight'){await engine.verify();console.log(JSON.stringify({status:'verified-not-started',started:state.started,bank:engine.bank(),planHash:state.planHash,gate:state.gate}));}
   else if(command==='status'||command==='report'){const value=await saveReport(plan,state,providers[0]);console.log(JSON.stringify({status:state.complete?'complete':state.started?'stopped-at-checkpoint':'prepared-not-started',preparedCollections:value.preparedCollections,genesisMints:value.genesisMints,bank:value.bank,gate:state.gate,report:directory+'/report.json'}));}
   else if(command==='funding'){await engine.verify();const hash=args[0],value=await engine.verifyFunding(hash);if(state.funding.some(p=>p.hash===hash))throw new Error('Funding is already recorded.');if(state.funding.reduce((s,p)=>s+BigInt(p.value),value)>BigInt(plan.maxExternalFundingWei))throw new Error('The 0.5 ETH funding ceiling cannot be exceeded.');state.funding.push({hash,value:String(value)});await engine.save();console.log(JSON.stringify({status:'funding-recorded',transactionsSent:false}));}
   else if(command==='ack'){await engine.verify();const[id,note,hash]=args;await engine.acknowledge(id,note,hash);console.log(JSON.stringify({status:'checkpoint-recorded',transactionsSent:false}));}
   else if(command==='ack-failure'){await engine.verify();const[id,note,hash]=args;await engine.acknowledgeFailure(id,note,hash);console.log(JSON.stringify({status:'manual-failure-recorded',transactionsSent:false,checkpointUnchanged:true}));}
   else if(command==='review-cost'){await engine.reviewCost(BigInt(args[0]),args[1]??'');console.log(JSON.stringify({status:'cost-review-recorded',transactionsSent:false,review:state.costReviews?.at(-1)}));}
   else if(command==='reconcile'){await engine.reconcile(Number(args[0]),args[1]??'');console.log(JSON.stringify({status:'incident-recorded',transactionsSent:false,override:state.overrides?.[state.current]}));}
   else if(command==='recover'){if(!args.includes('--execute')||!args.includes(state.planHash))throw new Error('Recovery requires --execute and the plan hash.');await engine.recoverUnspent();await saveReport(plan,state,providers[0]);console.log(JSON.stringify({status:'unspent-funds-recovered',manualWalletsExcluded:true}));}
   else if(command==='run'){
    if(!args.includes('--execute')||!args.includes(state.planHash))throw new Error('Run requires --execute and the exact reviewed plan hash.');
    try{
     const wait=args.includes('--wait'),minutesIndex=args.indexOf('--max-minutes'),minutes=minutesIndex<0?180:Number(args[minutesIndex+1]);
     if(!Number.isFinite(minutes)||minutes<1||minutes>240)throw new Error('Use a wait budget of 1–240 minutes.');
     const stopAt=Date.now()+minutes*60000;
     for(;;){try{await engine.run();console.log(JSON.stringify({status:'complete'}));break;}catch(e){
      if(!wait||!(e instanceof Hold)||e.status!=='waiting'||Date.now()>=stopAt)throw e;
      await saveReport(plan,state,providers[0]);await new Promise(resolve=>setTimeout(resolve,10000));
     }}
    }
    catch(e:any){
     if(e instanceof Hold)console.log(JSON.stringify({status:e.status,detail:e.detail,gate:state.gate}));
     else{state.errors.push({at:new Date().toISOString(),collection:state.current,code:String(e.code??e.constructor?.name??'error')});await engine.save();throw e;}
    }finally{await saveReport(plan,state,providers[0]);}
   }else throw new Error('Use init, preflight, status, report, handoff, funding, ack, run, reconcile, review-cost, recover, pause or resume.');
  }
 }
}catch(e:any){await durable(directory+'/last-error.json',{at:new Date().toISOString(),code:e.code,message:e.message,stack:e.stack});console.error(JSON.stringify({status:'stopped',code:e.code??e.constructor?.name??'error',detail:e instanceof Hold?e.detail:undefined}));process.exitCode=1;}
finally{await unlock();providers.forEach(p=>p.destroy());}
