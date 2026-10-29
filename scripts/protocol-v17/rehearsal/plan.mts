import { createHash } from 'node:crypto';
export const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export type Scenario={id:number;seasonId:string;name:string;choice:0|1|2;outcome:'sellout'|'refund';referrals:'manual'|'three'|'none'|'ten';noVotes:boolean;seasonFirst:boolean;seasonLast:boolean;sponsoredFromSeason?:string};
export function rehearsalPlan(release:any,runtimeSha256:string){
  if(!/^[a-f0-9]{64}$/.test(runtimeSha256)||release.version!==17||release.chainId!==11155111||release.sealed!==false||release.prepared!==0||release.genesisMints!==0||release.manifest.catalog.length!==6||release.manifest.options.length!==3||release.manifest.rehearsal!==true)throw new Error('A verified, unstarted accelerated V17 release is required.');
  const choices=[2,0,1,0,1,1] as const;
  const scenarios:Scenario[]=release.manifest.catalog.map((p:any,i:number)=>({id:i+1,seasonId:p.seasonId,name:p.name,choice:choices[i],outcome:[2,5].includes(i)?'refund':'sellout',referrals:[0,3].includes(i)?'manual':i===4?'none':'three',noVotes:i===3,seasonFirst:i%3===0,seasonLast:i%3===2}));
  return{runtimeSha256,version:17,chainId:11155111,address:release.address,codeHash:release.codeHash,deploymentBlock:release.deploymentBlock,releaseHash:release.manifestHash,settings:release.manifest.settings,options:release.manifest.options,catalog:release.manifest.catalog,scenarios,
    walletCount:11,bankIndex:10,manualAffiliateIndex:0,manualBuyerIndex:1,genesisParticipants:10,
    recoveryAddress:'0xC0Eb929903dCD29c7a33E6dA1f78a247CFB68145',maxExternalFundingWei:'500000000000000000',minimumInitialFundingWei:'350000000000000000',randomnessReserveWei:'250000000000000000',liquidReserveWei:'10000000000000000',maxFeePerGasWei:'500000000',maxGrossSpendWei:'3000000000000000000',gasAndVrfStopWei:'50000000000000000',
    requiredGates:['funding','start-genesis','manual-genesis-mints','before-genesis-sellout','every-next-collection','affiliate-enrollment','referral-mint','winner-wallet-handoff','prize-claims','affiliate-claim','sponsored-redemption','refund','every-season-holder-claim','every-season-review','final-review'],
    coverageLimits:['Six collections / two seasons are live; the full 216-collection catalog has separate local coverage.','Real Chainlink VRF uses three confirmations; the production profile retains at least 64.','Production supply, prices and deadlines have separate local regression coverage; compressed live timing is not production liveness evidence.','Invalid proofs, timeout, malicious receivers, exhaustive limits and ten affiliate slots require separate local tests.','Human wallet actions require exact confirmed receipts and UI evidence.','Only bot signing pauses. All immutable onchain deadlines continue.','Mainnet readiness remains false pending exact production artifact, deployment-limit qualification, independent review and wallet/hosted acceptance.']};
}
export type Plan=ReturnType<typeof rehearsalPlan>&{randomnessReserveWei?:string;continuation?:{parentPlanHash:string;reason:string;originalScenarios:Scenario[]}};
export class Hold extends Error{constructor(public status:string,public detail:string){super(detail);}}
export function assertCustody(custody:Record<string,unknown>,address:string){if(custody[address.toLowerCase()])throw new Hold('manual-wallet','This wallet is under human control. Automation cannot sign or sweep it.');}
export function assertMintBudget(choice:{supply:string;price:string},outcome:string,liquid:bigint,reserve:bigint){const principal=BigInt(choice.price)*(outcome==='sellout'?BigInt(choice.supply):3n);if(liquid<principal+reserve)throw new Hold('funding','Return test funds before opening the next immutable collection clock.');return principal;}
/** Reviewed Sepolia 500-gwei lane: 200k verification + 200k callback, 24% native premium, rounded upward. */
export function assertRandomnessReserve(settings:{keyHash:string;callbackGas:string},reserve:string|undefined){
 if(settings.keyHash.toLowerCase()!=='0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae'||BigInt(settings.callbackGas)!==200000n||!reserve||BigInt(reserve)<250000000000000000n)throw new Hold('vrf-funding-review','Review this lane and callback gas against Chainlink’s required native reserve before starting a clock.');
 return BigInt(reserve);
}
