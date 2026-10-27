import {readFile} from 'node:fs/promises';
import {Contract,Interface,Wallet,ZeroAddress,Transaction,keccak256,type JsonRpcProvider,type TransactionRequest} from 'ethers';
import abi from '../../../packages/contracts/src/ManekinekoV16.json' with {type:'json'};
import {createTransactionPipeline,ChainPendingError,type ChainJournal} from '../../season-runner/chain-transactions.ts';
import {durable} from '../../protocol-v12/rehearsal/store.mts';
import {Hold,assertCustody,assertMintBudget,digest,type Plan,type Scenario} from './plan.mts';
const iface=new Interface(abi),eth=10n**18n,token=(id:number,serial:bigint)=>(BigInt(id)<<17n)|serial;
export type Gate={id:string;instruction:string;wallet?:string;request?:{to:string;data:string;value:string};token?:string;collection?:number};
export type RunState={version:16;planHash:string;addresses:string[];operatorBaseline:string;started:boolean;complete:boolean;current:number;gate:Gate|null;approvals:Record<string,{note:string;at:string;transaction?:string}>;custody:Record<string,{reason:string;token?:string}>;journals:Record<string,ChainJournal>;funding:{hash:string;value:string}[];genesisTokens:Record<string,string[]>;buyers:Record<string,number[]>;manualWinners:Record<string,{token:string;index:number}>;accounted:string[];gasWei:string;operatorBudgetWei:string;recoveries:Record<string,string>;vrfFeesWei:string;errors:{at:string;collection:number;code:string}[];outcomes:Record<string,unknown>;externalReceipts:string[];costReviews?:{limitWei:string;reason:string;at:string}[];overrides?:Record<string,{choice:0|1|2;outcome:'sellout'|'refund';referrals:Scenario['referrals'];reason:string;at:string;block:number}>};
export class RehearsalEngine{
 readonly plan:Plan;readonly state:RunState;readonly directory:string;
 private provider:JsonRpcProvider;private secondary:JsonRpcProvider;private wallets:Wallet[];private operator:Wallet;private c:Contract;
 private saveQueue:Promise<void>=Promise.resolve();private pipelines=new Map<number,ReturnType<typeof createTransactionPipeline>>();
 constructor(input:{plan:Plan;state:RunState;directory:string;provider:JsonRpcProvider;secondary:JsonRpcProvider;wallets:Wallet[];operator:Wallet}){Object.assign(this,input);this.plan=input.plan;this.state=input.state;this.directory=input.directory;this.provider=input.provider;this.secondary=input.secondary;this.wallets=input.wallets;this.operator=input.operator;this.c=new Contract(input.plan.address,abi,input.provider);}
 save(){const snapshot=JSON.parse(JSON.stringify(this.state));this.saveQueue=this.saveQueue.then(()=>durable(this.directory+'/state.json',snapshot));return this.saveQueue;}
 address(index:number){return index===-1?this.operator.address:this.wallets[index].address;}
 bank(){return this.address(this.plan.bankIndex);}
 async stopped(){try{await readFile(this.directory+'/PAUSED');throw new Hold('paused','Automation is paused; onchain clocks continue.');}catch(e:any){if(e.code!=='ENOENT')throw e;}}
 async verify(resumePending=false){
  if(this.plan.chainId!==11155111||this.state.version!==16||this.state.planHash!==digest(this.plan)||this.state.addresses.length!==501||this.operator.address!==this.plan.settings.operator)throw new Error('Runtime identity mismatch.');
  this.wallets.forEach((w,i)=>{if(w.address!==this.state.addresses[i])throw new Error('Wallet vault mismatch.');});
  if(new URL(this.provider._getConnection().url).hostname===new URL(this.secondary._getConnection().url).hostname)throw new Error('Independent RPC hosts are required.');
  for(const p of [this.provider,this.secondary]){
   if(await p.send('eth_chainId',[])!=='0xaa36a7')throw new Error('Sepolia is required.');
   const head=await p.getBlock('latest');if(!head||Math.abs(Date.now()/1000-head.timestamp)>180)throw new Error('Chain head is stale.');
   if(keccak256(await p.getCode(this.plan.address))!==this.plan.codeHash)throw new Error('Runtime changed.');
  }
  if(await this.c.CONTRACT_VERSION()!=='tincta-v16'||await this.c.catalogCount()!==216n||await this.c.optionCount()!==3n)throw new Error('Deployment policy mismatch.');
  for(const[k,j]of Object.entries(this.state.journals)){
   const index=Number(k),pipeline=this.pipeline(index);
   const last=j.transactions.at(-1);
   if(resumePending&&last&&last.state!=="confirmed"){
    const tx=Transaction.from(last.rawTransaction);await this.send(index,last.action,{to:tx.to,data:tx.data,value:tx.value},last.broadcastDeadline);
   }
   await pipeline.confirmAll();
   for(const entry of j.transactions){const receipt=await this.provider.getTransactionReceipt(entry.hash);if(receipt)await this.account(index,entry.action,receipt);}
  }
  for(const proof of this.state.funding)await this.verifyFunding(proof.hash,BigInt(proof.value));
  if(this.state.funding.reduce((sum,p)=>sum+BigInt(p.value),0n)>BigInt(this.plan.maxExternalFundingWei))throw new Error('Funding exceeds the 30 ETH ceiling.');
 }
 private pipeline(index:number){
  let pipeline=this.pipelines.get(index);if(pipeline)return pipeline;
  const signer=(index===-1?this.operator:this.wallets[index]).connect(this.provider);
  this.state.journals[index]??={version:1,chainId:11155111,from:signer.address,maxFeePerGasWei:this.plan.maxFeePerGasWei,maxTotalSpendWei:this.plan.maxGrossSpendWei,transactions:[],collections:{}};
  pipeline=createTransactionPipeline({provider:this.provider,signer,execute:true,journal:this.state.journals[index],save:()=>this.save(),confirmations:2});this.pipelines.set(index,pipeline);return pipeline;
 }
 private async account(index:number,action:string,receipt:any){
  if(this.state.accounted.includes(receipt.hash))return;
  const tx=await this.provider.getTransaction(receipt.hash);if(!tx)throw new Error('Confirmed transaction missing.');
  const gas=BigInt(receipt.gasUsed)*BigInt(receipt.gasPrice);this.state.gasWei=String(BigInt(this.state.gasWei)+gas);
  let operatorBudget=BigInt(this.state.operatorBudgetWei);
  if(index===this.plan.bankIndex&&tx.to?.toLowerCase()===this.operator.address.toLowerCase())operatorBudget+=tx.value;
  if(index===-1)operatorBudget-=tx.value+gas;
  for(const log of receipt.logs){if(log.address.toLowerCase()!==this.plan.address.toLowerCase())continue;
   let e;try{e=iface.parseLog(log);}catch{continue;}
   if(e?.name==='Minted'&&e.args.collectionId===0n){const a=e.args.recipient.toLowerCase();this.state.genesisTokens[a]??=[];for(let n=0n;n<e.args.quantity;n++){const id=String(e.args.firstTokenId+n);if(!this.state.genesisTokens[a].includes(id))this.state.genesisTokens[a].push(id);}}
   if(e?.name==='Paid'&&e.args.recipient.toLowerCase()===this.operator.address.toLowerCase())operatorBudget+=e.args.amount;
  }
  if(action.startsWith('recover-vrf:')){const recovered=BigInt(this.state.recoveries[action]??'0');operatorBudget+=recovered;this.state.vrfFeesWei=String(BigInt(this.state.vrfFeesWei)+BigInt(this.plan.settings.randomnessBudget)-recovered);}
  this.state.operatorBudgetWei=String(operatorBudget);this.state.accounted.push(receipt.hash);await this.save();
 }
 async send(index:number,action:string,request:TransactionRequest,deadline?:number){
  await this.stopped();assertCustody(this.state.custody,this.address(index));
  if(BigInt(this.state.gasWei)+BigInt(this.state.vrfFeesWei)>=BigInt(this.state.costReviews?.at(-1)?.limitWei??this.plan.gasAndVrfStopWei)&&!action.startsWith('recover-wallet:')&&action!=='recover-bank')throw new Hold('budget','Gas and known VRF fees reached the review limit.');
  if(index===-1&&!this.state.journals[index]?.transactions.some(t=>t.action===action)){const fee=await this.provider.getFeeData(),gas=await this.provider.estimateGas({...request,from:this.operator.address}),maximum=BigInt(String(request.value??0))+gas*120n/100n*(fee.maxFeePerGas??BigInt(this.plan.maxFeePerGasWei));
   if(BigInt(this.state.operatorBudgetWei)<maximum)await this.fund(-1,maximum-BigInt(this.state.operatorBudgetWei)+eth/1000n,'operator-budget');
  }
  if(index>=0&&index!==this.plan.bankIndex&&!this.state.journals[index]?.transactions.some(t=>t.action===action)){
   const fee=await this.provider.getFeeData(),gas=await this.provider.estimateGas({...request,from:this.address(index)}),price=fee.maxFeePerGas??fee.gasPrice;
   if(price===null||price>BigInt(this.plan.maxFeePerGasWei))throw new Hold('fee-cap','Wait for fees below the saved cap before funding a bot transaction.');
   const required=BigInt(String(request.value??0))+gas*120n/100n*price,balance=await this.provider.getBalance(this.address(index));
   if(balance<required)await this.fund(index,required-balance+eth/1000n,'transaction-gas');
  }
  const pipeline=this.pipeline(index);await this.save();
  for(;;){await this.stopped();try{const receipt=await pipeline.send(action,request,deadline?{broadcastDeadline:deadline}:{});await this.account(index,action,receipt);return receipt;}catch(e){if(!(e instanceof ChainPendingError))throw e;await new Promise(r=>setTimeout(r,4000));}}
 }
 async fund(index:number,amount:bigint,label:string){
  if(amount<=0n)return;
  if(await this.provider.getBalance(this.bank())<amount+BigInt(this.plan.liquidReserveWei))throw new Hold('funding','The bank needs returned test funds. The 30 ETH external funding cap remains fixed.');
  const sequence=this.state.journals[this.plan.bankIndex]?.transactions.length??0;
  await this.send(this.plan.bankIndex,`fund:${label}:${index}:${sequence}`,{to:this.address(index),value:amount});
 }
 async ensureBalance(index:number,target:bigint,label:string){const balance=await this.provider.getBalance(this.address(index));if(balance<target)await this.fund(index,target-balance,label);}
 async gate(gate:Gate,condition=true){
  if(this.state.approvals[gate.id]&&condition)return;
  this.state.gate=gate;await this.save();throw new Hold(gate.request?'manual-transaction':'manual-checkpoint',gate.instruction);
 }
 async manual(id:string,index:number,instruction:string,request:TransactionRequest,condition:boolean,extra:Partial<Gate>={}){
  const address=this.address(index);this.state.custody[address.toLowerCase()]??={reason:instruction};
  await this.gate({id,instruction,wallet:address,request:{to:String(request.to),data:String(request.data),value:String(request.value??0)},...extra},condition);
 }
 async verifyFunding(hash:string,value?:bigint){
  const receipt=await this.provider.getTransactionReceipt(hash),tx=await this.provider.getTransaction(hash),head=await this.provider.getBlock('latest');
  if(!receipt||receipt.status!==1||!tx||!head||head.number-receipt.blockNumber<2||(await this.provider.getBlock(receipt.blockNumber))?.hash!==receipt.blockHash||tx.chainId!==11155111n||tx.from.toLowerCase()!==this.plan.recoveryAddress.toLowerCase()||tx.to?.toLowerCase()!==this.bank().toLowerCase()||tx.data!=='0x'||tx.value<=0n||value!==undefined&&tx.value!==value)throw new Error('Funding receipt does not match the pinned recovery wallet and new bank.');
  return tx.value;
 }
 async acknowledge(id:string,note:string,hash?:string){
  const gate=this.state.gate;if(!gate||gate.id!==id||note.trim().length<8)throw new Error('A current checkpoint and a meaningful test note are required.');
  if(gate.request){
   if(!hash||!/^0x[0-9a-f]{64}$/i.test(hash))throw new Error('The wallet transaction hash is required.');hash=hash.toLowerCase();
   if(Object.entries(this.state.approvals).some(([key,a])=>key!==id&&a.transaction===hash))throw new Error('This receipt already proves a different manual checkpoint.');
   const tx=await this.provider.getTransaction(hash),r=await this.provider.getTransactionReceipt(hash),head=await this.provider.getBlock('latest');
   if(!tx||!r||r.status!==1||!head||head.number-r.blockNumber<2||tx.chainId!==11155111n||tx.from.toLowerCase()!==gate.wallet!.toLowerCase()||tx.to?.toLowerCase()!==gate.request.to.toLowerCase()||tx.data!==gate.request.data||String(tx.value)!==gate.request.value||(await this.provider.getBlock(r.blockNumber))?.hash!==r.blockHash)throw new Error('Receipt does not match the reserved manual transaction.');
   if(!this.state.externalReceipts.includes(hash)){this.state.externalReceipts.push(hash);await this.account(this.state.addresses.findIndex(a=>a.toLowerCase()===gate.wallet!.toLowerCase()),'manual:'+id,r);}
  }else if(hash)throw new Error('This checkpoint does not request a transaction.');
  this.state.approvals[id]={note:note.trim(),at:new Date().toISOString(),...(hash?{transaction:hash}:{})};this.state.gate=null;await this.save();
 }
 private async prepareBuyers(s:Scenario){
  if(this.state.buyers[s.id])return;
  const buyers=Array.from({length:498},(_,i)=>i+2).filter(i=>!this.state.custody[this.address(i).toLowerCase()]).slice(0,s.outcome==='sellout'?50:3);
  if(buyers.length<(s.outcome==='sellout'?50:3))throw new Error('Not enough automation-controlled wallets remain.');
  const option=this.plan.options[s.choice];assertMintBudget(option,s.outcome,await this.provider.getBalance(this.bank()),BigInt(this.plan.liquidReserveWei));
  for(const i of buyers)await this.ensureBalance(i,BigInt(option.price)*(s.outcome==='sellout'?20n:1n)+eth/500n,`collection-${s.id}`);
  this.state.buyers[s.id]=buyers;await this.save();
 }
 private async openGenesis(){
  if(await this.c.genesisSoldOutAt()>0n){
   if(!this.state.approvals['before-genesis-sellout'])throw new Hold('unexpected-launch','Genesis sold out before the recorded readiness checkpoint. Review the live first-ballot deadline immediately.');
   return;
  }
  if(!await this.c.catalogSealed()){
   await this.gate({id:'start-genesis',instruction:'Confirm funding, wallet imports, the deployed UI and the complete workflow. This opens Genesis, with no deadline; it does not open a paid ballot.'});
   const cost=await this.c.preparationCost();await this.send(-1,'fund-genesis',await this.c.fundOperating.populateTransaction({value:cost}));await this.send(-1,'seal-catalog',await this.c.sealCatalog.populateTransaction());
  }
  for(const index of [0,1]){
   await this.ensureBalance(index,eth/100n,'manual-genesis');
   for(let n=1;n<=2;n++)await this.manual(`genesis:${index}:${n}`,index,`Import manual wallet ${index}, then mint Genesis NFT ${n} of 2 through the website. Save its receipt and UI evidence.`,await this.c.mintGenesis.populateTransaction(),await this.c.primaryMints(0,this.address(index))>=BigInt(n));
  }
  for(let index=2;index<500&&(await this.c.round(0)).minted<999n;index++){
   await this.ensureBalance(index,eth/500n,'genesis-gas');
   while(await this.c.primaryMints(0,this.address(index))<2n&&(await this.c.round(0)).minted<999n)await this.send(index,`genesis:${index}:${await this.c.primaryMints(0,this.address(index))}`,await this.c.mintGenesis.populateTransaction());
  }
  await this.prepareBuyers(this.plan.scenarios[0]);
  await this.gate({id:'before-genesis-sellout',instruction:'Be present for the first vote and affiliate enrollment. The final Genesis mint opens a fixed one-hour ballot immediately.'});
  if((await this.c.round(0)).minted<1000n){const index=499;await this.ensureBalance(index,eth/500n,'final-genesis');await this.send(index,'genesis-final',await this.c.mintGenesis.populateTransaction());}
 }
 private async enroll(s:Scenario){
  if(s.referrals==='none')return;
  if(s.referrals==='manual'){
   const source=BigInt(this.state.genesisTokens[this.address(0).toLowerCase()]?.[0]??'0');if(!source)throw new Error('The manual affiliate needs its recorded Genesis NFT.');
   await this.manual(`affiliate:${s.id}`,0,`Test affiliate enrollment for ${s.name}. Use Genesis collection 0, NFT ${source}, then copy the referral link.`,await this.c.enrollAffiliate.populateTransaction(s.id,1,source),await this.c.affiliateId(s.id,this.address(0))===1n,{collection:s.id});return;
  }
  const count=s.referrals==='ten'?10:3;let enrolled=0;
  for(let slot=1;slot<=10;slot++){if((await this.c.affiliates(s.id,slot)).wallet!==ZeroAddress)enrolled++;}
  for(const i of this.state.buyers[s.id]){
   if(enrolled>=count)break;if(this.state.custody[this.address(i).toLowerCase()]||await this.c.affiliateId(s.id,this.address(i))>0n)continue;
   const ids=this.state.genesisTokens[this.address(i).toLowerCase()]??[];let proof:bigint|undefined;
   for(const id of ids)if((await this.c.ownerOf(id)).toLowerCase()===this.address(i).toLowerCase()&&!await this.c.eligibilityUsed(s.id,id)){proof=BigInt(id);break;}
   if(proof===undefined)continue;
   let slot=1;while((await this.c.affiliates(s.id,slot)).wallet!==ZeroAddress)slot++;
   await this.send(i,`affiliate:${s.id}:${slot}`,await this.c.enrollAffiliate.populateTransaction(s.id,slot,proof),Number((await this.c.round(s.id)).saleStart)-60);enrolled++;
  }
  if(enrolled!==count)throw new Error('Affiliate scenario could not be established.');
 }
 private async vote(s:Scenario){
  if(s.noVotes)return;
  if(s.id===1){const ids=(this.state.genesisTokens[this.address(0).toLowerCase()]??[]).map(BigInt);
   await this.manual('genesis-vote',0,`Test the first ballot with your Genesis NFTs. Select option ${s.choice+1}.`,await this.c.castGenesisVote.populateTransaction(s.choice,ids),ids.every(id=>id>0n)&&(await Promise.all(ids.map(id=>this.c.genesisVoted(id)))).every(Boolean),{collection:1});
  }
  let source=0;
  if(s.id>1){for(let id=s.id-1;id>=1;id--)if((await this.c.round(id)).finalizedAt>0n){source=id;break;}if(!source)throw new Error('No revealed voting source.');}
  // Fifty Genesis voters are enough for this controlled ballot. Five hundred
  // sequential transactions would not fit its production one-hour window.
  const indices=s.id===1?this.state.buyers[1]:Array.from({length:498},(_,i)=>i+2);
  for(const i of indices){
   if(this.state.custody[this.address(i).toLowerCase()])continue;
   const power=await this.c.votingPower(s.id,this.address(i),source);if(power===0n)continue;
   const r=await this.c.round(s.id);if((await this.provider.getBlock('latest'))!.timestamp>=Number(r.saleStart)-60)throw new Hold('deadline','The ballot is closing. Inspect its actual result; do not submit late votes.');
   await this.ensureBalance(i,eth/500n,'vote-gas');
   const tx=source===0?await this.c.castGenesisVote.populateTransaction(s.choice,(this.state.genesisTokens[this.address(i).toLowerCase()]??[]).map(BigInt)):await this.c.castVote.populateTransaction(s.id,s.choice,[source]);
   await this.send(i,`vote:${s.id}:${source}`,tx,Number(r.saleStart)-60);
  }
 }
 private async mint(s:Scenario){
  const r=await this.c.round(s.id),terms=await this.c.terms(s.id),expected=this.plan.options[s.choice];
  for(const key of ['supply','price','winners','duration'])if(String(terms[key])!==expected[key])throw new Hold('ballot-result','The real winning terms differ from the prepared scenario. Review the outcome before spending.');
  const hash=await this.c.termsHash(s.id),deadline=Number(await this.c.mintDeadline(s.id));
  if(s.referrals==='manual'){
   await this.ensureBalance(1,terms.price+eth/100n,'manual-referral');
   await this.manual(`referral-mint:${s.id}`,1,`Open /?collection=${s.id}&affiliate=1 with the buyer wallet. Mint one NFT through the affiliate link.`,await this.c.mint.populateTransaction(s.id,this.address(1),1,1,hash,{value:terms.price}),await this.c.primaryMints(s.id,this.address(1))>=1n&&(await this.c.affiliates(s.id,1)).referrals>=1n,{collection:s.id});
  }
  if(s.id===2&&this.state.manualWinners[this.plan.scenarios[0].seasonId]){
   const winner=this.state.manualWinners[this.plan.scenarios[0].seasonId];
   await this.manual('sponsored-redemption',winner.index,'Use the winner wallet to redeem its one lifetime sponsored NFT into collection 2. The winning collection and NFT numbers are in the handoff.',await this.c.redeemSponsored.populateTransaction(winner.token,s.id),await this.c.lifetimeRewardUsed(this.address(winner.index)),{collection:s.id,token:winner.token});
  }
  const target=s.outcome==='sellout'?terms.supply:3n;
  for(const i of this.state.buyers[s.id]){
   const current=await this.c.round(s.id);if(current.minted>=target)break;
   if(this.state.custody[this.address(i).toLowerCase()])continue;
   if((await this.provider.getBlock('latest'))!.timestamp>=deadline-90)throw new Hold('deadline','Minting is close to its fixed deadline. Inspect the actual outcome before continuing.');
   const remaining=20n-BigInt(await this.c.primaryMints(s.id,this.address(i))),quantity=[remaining,BigInt(target)-BigInt(current.minted),s.outcome==='sellout'?20n:1n].reduce((a,b)=>a<b?a:b);if(!quantity)continue;
   let referral=0;
   if(s.referrals!=='none')for(let slot=1;slot<=(s.referrals==='ten'?9:10);slot++){const a=await this.c.affiliates(s.id,slot);if(a.wallet!==ZeroAddress&&a.wallet.toLowerCase()!==this.address(i).toLowerCase()){referral=slot;if(a.referrals===0n)break;}}
   await this.send(i,`mint:${s.id}:${await this.c.primaryMints(s.id,this.address(i))}`,await this.c.mint.populateTransaction(s.id,this.address(i),quantity,referral,hash,{value:BigInt(terms.price)*BigInt(quantity)}),deadline-60);
  }
  if((await this.c.round(s.id)).minted<target)throw new Hold('mint-review','The planned mint quantity was not reached. Reconcile custody and balances.');
 }
 private async claim(s:Scenario){
  const r=await this.c.round(s.id),terms=await this.c.terms(s.id);
  if(r.finalizedAt>0n){
   if(!this.state.manualWinners[s.seasonId]){
    const global=token(s.id,r.winners[0]),owner=await this.c.ownerOf(global),index=this.state.addresses.findIndex(a=>a.toLowerCase()===owner.toLowerCase());if(index<0)throw new Hold('external-winner','The winner belongs to an external wallet. Obtain its manual claim evidence.');
    this.state.manualWinners[s.seasonId]={token:String(global),index};this.state.custody[owner.toLowerCase()]={reason:`Winner of ${s.name}; keep all its signatures under human control`,token:String(global)};await this.save();
   }
   const handoff=this.state.manualWinners[s.seasonId];
   if(Number(BigInt(handoff.token)>>17n)===s.id){
    const global=BigInt(handoff.token),owner=this.address(handoff.index);
    await this.gate({id:`winner-handoff:${s.seasonId}`,instruction:`Export and import the actual winning wallet. Collection ${s.id}, NFT ${r.winners[0]}, global token ${global}. Confirm that the wallet opens correctly before claiming.`,wallet:owner,token:String(global),collection:s.id});
   }
   for(let rank=0;rank<Number(terms.winners);rank++){
    const global=token(s.id,r.winners[rank]),owner=await this.c.ownerOf(global),index=this.state.addresses.findIndex(a=>a.toLowerCase()===owner.toLowerCase());
    if(index<0)throw new Hold('external-winner','An external winner must claim before this rehearsal advances.');
    if(this.state.custody[owner.toLowerCase()])await this.manual(`prize:${global}`,index,`Claim prize ${rank+1} for collection ${s.id}, NFT ${r.winners[rank]} through /claims?collection=${s.id}.`,await this.c.claimPrize.populateTransaction(global,owner),await this.c.awardBeneficiary(global)!==ZeroAddress,{collection:s.id,token:String(global)});
    else if(await this.c.awardBeneficiary(global)===ZeroAddress){await this.ensureBalance(index,eth/500n,'claim-gas');await this.send(index,`prize:${global}`,await this.c.claimPrize.populateTransaction(global,this.bank()));}
   }
   for(let slot=1;slot<=10;slot++){const a=await this.c.affiliates(s.id,slot);if(a.wallet===ZeroAddress||a.referrals===0n)continue;const i=this.state.addresses.findIndex(x=>x.toLowerCase()===a.wallet.toLowerCase());
    if(i<0)throw new Hold('external-affiliate','An external affiliate needs manual claim evidence.');
    if(this.state.custody[a.wallet.toLowerCase()])await this.manual(`affiliate-claim:${s.id}:${slot}`,i,`Claim the affiliate reward for ${s.name} through /affiliates?collection=${s.id}.`,await this.c.claimAffiliate.populateTransaction(s.id,a.wallet),a.claimed,{collection:s.id});
    else if(!a.claimed)await this.send(i,`affiliate-claim:${s.id}:${slot}`,await this.c.claimAffiliate.populateTransaction(s.id,this.bank()));
   }
  }else if(await this.c.refundsAvailable(s.id)){
   for(let serial=1n;serial<=r.minted;serial++){
    const global=token(s.id,serial);let owner:string;try{owner=await this.c.ownerOf(global);}catch(e:any){if(e.code==='CALL_EXCEPTION'){const pending=this.state.gate;if(pending?.id===`refund:${global}`)await this.gate(pending,true);continue;}throw e;}
    const i=this.state.addresses.findIndex(a=>a.toLowerCase()===owner.toLowerCase());if(i<0)throw new Hold('external-refund','An external holder needs a manual refund.');
    if(serial===1n||this.state.custody[owner.toLowerCase()]){
     this.state.custody[owner.toLowerCase()]??={reason:'Manual refund test',token:String(global)};await this.save();
     await this.manual(`refund:${global}`,i,`Export/import this holder wallet and refund NFT ${serial} of ${s.name} through /claims?collection=${s.id}.`,await this.c.refund.populateTransaction(global,owner),false,{collection:s.id,token:String(global)});
    }else await this.send(i,`refund:${global}`,await this.c.refund.populateTransaction(global,this.bank()));
   }
  }else throw new Hold('waiting','The collection has not settled yet.');
 }
 private async recover(s:Scenario){
  let r=await this.c.round(s.id);
  if(r.finalizedAt>0n){
   const treasury=r.revenue/10000n*(r.qualified===0n?3000n:1000n)-r.treasuryWithdrawn;if(treasury)await this.send(-1,`treasury:${s.id}`,await this.c.withdrawBucket.populateTransaction(s.id,0,treasury));
   const dust=r.qualified===0n?0n:r.revenue/10000n*2000n-BigInt(r.qualified)*BigInt(r.affiliateShare)-r.growthWithdrawn;if(dust)await this.send(-1,`affiliate-dust:${s.id}`,await this.c.withdrawBucket.populateTransaction(s.id,1,dust));
   if(r.executionReserve&&r.executor.toLowerCase()===this.operator.address.toLowerCase())await this.send(-1,`executor:${s.id}`,await this.c.claimExecution.populateTransaction(s.id,this.operator.address));
  }else if(r.executionReserve)await this.send(-1,`unused-execution:${s.id}`,await this.c.withdrawBucket.populateTransaction(s.id,3,r.executionReserve));
  if(r.sponsorReserve)await this.send(-1,`unused-sponsorship:${s.id}`,await this.c.withdrawBucket.populateTransaction(s.id,2,r.sponsorReserve));
  if(!r.subscriptionClosed){
   const coordinator=new Contract(this.plan.settings.coordinator,['function getSubscription(uint256) view returns(uint96 balance,uint96 nativeBalance,uint64 reqCount,address owner,address[] consumers)'],this.provider);
   const sub=await coordinator.getSubscription(r.subscription);const action=`recover-vrf:${s.id}`;this.state.recoveries[action]=String(sub.nativeBalance);await this.save();
   await this.send(-1,action,await this.c.recoverRandomness.populateTransaction(s.id));
  }
  const available=BigInt(this.state.operatorBudgetWei)-eth/500n,spendable=(await this.provider.getBalance(this.operator.address))-BigInt(this.state.operatorBaseline)-eth/500n;
  const amount=available<spendable?available:spendable;
  if(amount>0n)await this.send(-1,`return-operator:${s.id}`,{to:this.bank(),value:amount});
 }
 private async holders(s:Scenario){
  const summary=await this.c.holderSummary(s.seasonId);if(!summary.unlocked)throw new Hold('waiting','The season holder pool is still locked.');
  const winner=this.state.manualWinners[s.seasonId];if(!winner)throw new Hold('holder-review','No eligible manual holder exists for this season.');
  const owner=await this.c.ownerOf(winner.token),collection=Number(BigInt(winner.token)>>17n),serial=BigInt(winner.token)&131071n;
  const holderIndex=this.state.addresses.findIndex(a=>a.toLowerCase()===owner.toLowerCase());if(holderIndex<0)throw new Hold('holder-review','The holder NFT moved outside the managed wallet set; review its current owner.');
  await this.manual(`holder:${s.seasonId}`,holderIndex,`Test the season holder reward before bots claim. Open /holders?collection=${collection}, enter NFT ${serial}, and claim to your wallet.`,await this.c.claimHolder.populateTransaction(winner.token,owner),await this.c.holderClaimed(winner.token),{collection,token:winner.token});
  const season=await this.c.seasons(s.seasonId);
  for(let id=Number(season.first);id<=Number(season.last);id++){
   const r=await this.c.round(id);if(!r.finalizedAt)continue;
   for(let serial=1n;serial<=r.minted;serial++){
    if((await this.c.seasons(s.seasonId)).claims>=summary.limit)break;
    const global=token(id,serial);if(await this.c.holderClaimed(global))continue;const owner=await this.c.ownerOf(global),index=this.state.addresses.findIndex(a=>a.toLowerCase()===owner.toLowerCase());
    if(index<0||this.state.custody[owner.toLowerCase()])continue;
    await this.ensureBalance(index,eth/500n,'holder-gas');await this.send(index,`holder:${global}`,await this.c.claimHolder.populateTransaction(global,this.bank()));
   }
  }
  if((await this.c.seasons(s.seasonId)).claims<summary.limit)throw new Hold('holder-review','Some remaining holder slots require manual wallets.');
  await this.gate({id:`season-review:${s.seasonId}`,instruction:'Review this season’s report and UI evidence. Return excess funds from manual wallets to the bank before the next season. Record any button defects and their fixes; the contract stays deployed.'});
 }
 async reviewCost(limit:bigint,reason:string){
  await this.verify();const principal=this.plan.scenarios.filter(s=>s.outcome==='sellout').reduce((max,s)=>{const o=this.plan.options[s.choice],cost=BigInt(o.price)*BigInt(o.supply);return cost>max?cost:max;},0n);
  const maximum=BigInt(this.plan.maxExternalFundingWei)-principal-BigInt(this.plan.liquidReserveWei),old=BigInt(this.state.costReviews?.at(-1)?.limitWei??this.plan.gasAndVrfStopWei);
  if(reason.trim().length<25||limit<=old||limit<=BigInt(this.state.gasWei)+BigInt(this.state.vrfFeesWei)||limit>maximum)throw new Error('Review a higher cost limit that preserves mint principal and the 30 ETH ceiling.');
  this.state.costReviews??=[];this.state.costReviews.push({limitWei:String(limit),reason:reason.trim(),at:new Date().toISOString()});await this.save();
 }
 async reconcile(id:number,reason:string){
  await this.verify();if(id!==this.state.current||reason.trim().length<25)throw new Error('Review the current collection with a detailed incident note.');
  const r=await this.c.round(id),head=(await this.provider.getBlock('latest'))!,terms=await this.c.terms(id);
  if(head.timestamp<Number(r.saleStart))throw new Error('Do not bypass a live ballot or its manual checkpoints.');
  const choice=this.plan.options.findIndex((o:any)=>['supply','price','winners','duration'].every(k=>String(terms[k])===o[k]));if(choice<0||choice>2)throw new Error('Unrecognized immutable terms.');
  const original=this.plan.scenarios[id-1],expired=head.timestamp>=Number(await this.c.mintDeadline(id)),refundable=await this.c.refundsAvailable(id);
  const outcome=refundable||(!r.soldOutAt&&(expired||choice===1))?'refund':r.finalizedAt?'sellout':original.outcome;
  const enrolled=Number(await this.c.affiliateId(id,this.address(0)))===1;
  this.state.overrides??={};this.state.overrides[id]={choice:choice as 0|1|2,outcome,referrals:original.referrals==='manual'&&!enrolled?'none':original.referrals,reason:reason.trim(),at:new Date().toISOString(),block:head.number};
  this.state.errors.push({at:new Date().toISOString(),collection:id,code:'manual-incident-reconciliation'+(this.state.gate?':'+this.state.gate.id:'')});
  this.state.gate=null;await this.save();
 }
 async recoverUnspent(){
  if(!this.state.complete)throw new Error('Finish the final review before recovering all unspent funds.');
  await this.verify();const reserve=BigInt(this.plan.maxFeePerGasWei)*30000n;
  for(let i=0;i<500;i++){
   if(this.state.custody[this.address(i).toLowerCase()])continue;
   const balance=await this.provider.getBalance(this.address(i));if(balance>reserve)await this.send(i,`recover-wallet:${i}`,{to:this.bank(),value:balance-reserve});
  }
  const balance=await this.provider.getBalance(this.bank()),bankReserve=BigInt(this.plan.maxFeePerGasWei)*100000n;
  if(balance>bankReserve)await this.send(this.plan.bankIndex,'recover-bank',{to:this.plan.recoveryAddress,value:balance-bankReserve});
 }
 async run(){
  await this.stopped();await this.verify(true);
  const funds=this.state.funding.reduce((sum,p)=>sum+BigInt(p.value),0n);if(funds<BigInt(this.plan.minimumInitialFundingWei))throw new Hold('funding',`Register confirmed funding from the recovery wallet to ${this.bank()}. Do not move the paused V14 funds with this script.`);
  this.state.started=true;await this.save();await this.openGenesis();
  for(;this.state.current<=216;this.state.current++){
   const s={...this.plan.scenarios[this.state.current-1],...this.state.overrides?.[this.state.current]};
   if(Number(await this.c.prepared())<s.id){
    await this.prepareBuyers(s);await this.gate({id:`ready:${s.id}`,instruction:`Confirm readiness for ${s.name}: option ${s.choice+1}, ${s.outcome}. Check the UI before starting its immutable voting clock.`});
    const cost=await this.c.preparationCost(),reserve=await this.c.operatingReserve();if(reserve<cost)await this.send(-1,`fund-prepare:${s.id}`,await this.c.fundOperating.populateTransaction({value:cost-reserve}));await this.send(-1,`prepare:${s.id}`,await this.c.prepareNext.populateTransaction());
   }
   let r=await this.c.round(s.id),now=(await this.provider.getBlock('latest'))!.timestamp;
   if(now<Number(r.voteStart))throw new Hold('waiting',`Voting opens at ${new Date(Number(r.voteStart)*1000).toISOString()}.`);
   if(now<Number(r.saleStart)){await this.enroll(s);await this.vote(s);throw new Hold('waiting',`Minting opens at ${new Date(Number(r.saleStart)*1000).toISOString()}.`);}
   if(!r.soldOutAt&&now<Number(await this.c.mintDeadline(s.id)))await this.mint(s);
   r=await this.c.round(s.id);now=(await this.provider.getBlock('latest'))!.timestamp;
   if(r.soldOutAt&&!r.entropyAt&&!await this.c.refundsAvailable(s.id)){
    if(!r.requested)await this.send(-1,`request:${s.id}`,await this.c.requestRandomness.populateTransaction(s.id),Number(r.soldOutAt)+259140);
    throw new Hold('waiting','Awaiting genuine Chainlink randomness. No mock fulfillment or reroll is available.');
   }
   if(r.entropyAt&&!r.finalizedAt){await this.send(-1,`finalize:${s.id}:${r.counter}`,await this.c.finalizeDraw.populateTransaction(s.id,8));if(!(await this.c.round(s.id)).finalizedAt)throw new Hold('waiting','The same draw needs another bounded processing call.');}
   if(!r.soldOutAt&&!await this.c.refundsAvailable(s.id))throw new Hold('waiting',`Refunds open at ${new Date(Number(await this.c.mintDeadline(s.id))*1000).toISOString()}.`);
   await this.claim(s);await this.recover(s);if(s.seasonLast)await this.holders(s);
   const actual=await this.c.round(s.id);this.state.outcomes[s.id]={name:s.name,expected:s.outcome,actual:actual.finalizedAt>0n?'sellout':'refund',minted:String(actual.minted),refunded:String(actual.refunded),prizesClaimed:String(actual.prizesClaimed),saleStart:String(actual.saleStart),mintDeadline:String(await this.c.mintDeadline(s.id))};
   if((actual.finalizedAt>0n?'sellout':'refund')!==s.outcome)throw new Hold('unexpected-outcome','The real outcome differs from the scenario. Document and review this error before proceeding.');
   await this.save();
  }
  await this.gate({id:'final-review',instruction:'Review all 216 outcomes, all 22 holder pools, remaining claims, gas, VRF fees, manual wallet balances and UI defects. Confirm the final error report.'});
  this.state.complete=true;await this.save();return{status:'complete'};
 }
}
