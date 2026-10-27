import {Interface,formatEther} from 'ethers';
import {v16Abi} from './v16.ts';
import type {Snapshot} from './chain.ts';
import type {ProtocolConfig} from './config.ts';
import type {OperatorAction} from './operator-actions.ts';

export function v16OperatorActions(s:Snapshot,config:ProtocolConfig):OperatorAction[]{
  const actions:OperatorAction[]=[],abi=new Interface(v16Abi),r=s.round;
  const add=(id:string,title:string,description:string,method:string,args:unknown[]=[],operatorOnly=false,value=0n,secondary=false)=>actions.push({id,title,description,operatorOnly,secondary,request:{to:config.controller,data:abi.encodeFunctionData(method,args),value}});
  // Sealing starts Genesis and is deliberately absent from the deployed, stopped app.
  if(s.canPrepare){
    if(s.operatingBalance<s.cost)add('fund-operating','Fund the next preparation',`Add ${formatEther(s.cost-s.operatingBalance)} ETH of separate operating funds. This does not prepare a collection or start its clock.`,'fundOperating',[],false,s.cost-s.operatingBalance);
    else add('prepare','Prepare the next collection','Start the next fixed voting schedule. Confirm that manual testers are ready first; its onchain clock cannot be paused.','prepareNext');
  }
  if(r){
    if(r.phase===2)add('request','Request the draw','Retry a request that never reached Chainlink. An accepted request cannot be rerolled.','requestRandomness',[r.id]);
    if(r.phase===4)add('finalize','Finalize the draw','Process up to eight deterministic attempts using the recorded randomness. The executor reward is claimed separately.','finalizeDraw',[r.id,8]);
    if(r.operatorAvailable>0n)add('withdraw','Withdraw protocol treasury',`Send ${formatEther(r.operatorAvailable)} ETH to the fixed operator. Prize, affiliate, refund and holder reserves remain protected.`,'withdrawBucket',[r.id,0,r.operatorAvailable],true);
    if(r.growth>0n)add('growth','Recover affiliate division dust',`Recover ${formatEther(r.growth)} ETH of division dust. Qualified affiliate claims remain protected.`,'withdrawBucket',[r.id,1,r.growth],true,0n,true);
    if(![0,1].includes(r.phase)&&r.sponsorship>0n)add('sponsor','Recover unused sponsorship',`Return ${formatEther(r.sponsorship)} ETH to the fixed operator.`,'withdrawBucket',[r.id,2,r.sponsorship],true,0n,true);
    if(r.phase===7&&r.executionReserve>0n)add('execution','Recover unused executor funding','Return the refundable collection’s separately funded executor budget.','withdrawBucket',[r.id,3,r.executionReserve],true,0n,true);
    if([4,5,6,7].includes(r.phase)&&!r.subscriptionClosed)add('vrf','Recover unused draw funding','Return unused Chainlink subscription funds to the fixed operator. A pending request can delay this recovery without blocking refunds.','recoverRandomness',[r.id],true,0n,true);
  }
  if(s.sealed&&s.count===s.catalogCount&&s.operatingBalance>0n)add('operating','Recover remaining operating funds','Return only the unused operating reserve to the fixed operator.','withdrawOperating',[s.operatingBalance],true,0n,true);
  return actions;
}
