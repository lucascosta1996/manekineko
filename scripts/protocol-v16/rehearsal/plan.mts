import {createHash} from 'node:crypto';
export const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export type Scenario={id:number;seasonId:string;name:string;choice:0|1|2;outcome:'sellout'|'refund';referrals:'manual'|'three'|'none'|'ten';noVotes:boolean;seasonFirst:boolean;seasonLast:boolean};
export function rehearsalPlan(release:any,runtimeSha256:string){
 if(!/^[0-9a-f]{64}$/.test(runtimeSha256))throw new Error('A frozen runtime hash is required.');
 if(release.version!==16||release.chainId!==11155111||release.sealed!==false||release.prepared!==0||release.genesisMints!==0||release.manifest.catalog.length!==216||release.manifest.options.length!==3)throw new Error('A verified, unstarted V16 Sepolia deployment is required.');
 const scenarios:Scenario[]=release.manifest.catalog.map((p:any,i:number,all:any[])=>{
  const first=all.findIndex(q=>q.seasonId===p.seasonId),position=i-first;
  return{id:i+1,seasonId:p.seasonId,name:p.name,choice:i===2?1:[0,4,7,9].includes(position)?2:0,outcome:[2,5].includes(position)?'refund':'sellout',referrals:position===0?'manual':position===3?'none':position===4?'ten':'three',noVotes:position===3,seasonFirst:position===0,seasonLast:!all[i+1]||all[i+1].seasonId!==p.seasonId};
 });
 return{runtimeSha256,version:16,chainId:11155111,address:release.address,codeHash:release.codeHash,deploymentBlock:release.deploymentBlock,releaseHash:release.manifestHash,settings:release.manifest.settings,options:release.manifest.options,catalog:release.manifest.catalog,scenarios,
  walletCount:501,bankIndex:500,manualAffiliateIndex:0,manualBuyerIndex:1,genesisParticipants:500,
  recoveryAddress:'0xC0Eb929903dCD29c7a33E6dA1f78a247CFB68145',maxExternalFundingWei:'30000000000000000000',minimumInitialFundingWei:'25000000000000000000',liquidReserveWei:'1000000000000000000',maxFeePerGasWei:'500000000',maxGrossSpendWei:'5000000000000000000000',gasAndVrfStopWei:'3000000000000000000',
  requiredGates:['funding','start-genesis','manual-genesis-mints','before-genesis-sellout','every-next-collection','affiliate-enrollment','referral-mint','winner-wallet-handoff','prize-claims','affiliate-claim','sponsored-redemption','refund','every-season-holder-claim','every-season-review','final-review'],
  coverageLimits:['Option 2 sellout needs 40 ETH and is excluded from this 30 ETH run. Its vote, partial mint and refund run live.','VRF timeout, invalid proofs, rejection-sampling progress and malicious receivers are deterministic local tests; live outcomes are recorded only if observed.','Browser cancellation, wrong network, offline, retry, mobile and button behavior require manual UI evidence.','Only the automation pauses. Ballots, mint windows and the 72-hour randomness cutoff keep running.','Recycled funds count once against external funding; gas, VRF fees, locked holder pools and money held by manual wallets are reported separately.'],
 };
}
export type Plan=ReturnType<typeof rehearsalPlan>;
export class Hold extends Error{constructor(public status:string,public detail:string){super(detail);}}
export function assertCustody(custody:Record<string,unknown>,address:string){if(custody[address.toLowerCase()])throw new Hold('manual-wallet','This wallet is under human control. Automation cannot sign or sweep it.');}
export function assertMintBudget(choice:{supply:string;price:string},outcome:string,liquid:bigint,reserve:bigint){const principal=BigInt(choice.price)*(outcome==='sellout'?BigInt(choice.supply):3n);if(liquid<principal+reserve)throw new Hold('funding','Recover test funds before opening the next timed collection.');return principal;}
