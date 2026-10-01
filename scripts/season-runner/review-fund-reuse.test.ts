import test from "node:test";
import assert from "node:assert/strict";
import { Interface, Transaction, Wallet, keccak256, parseEther, type Provider } from "ethers";
import { reviewReuseStep, reviewReuseRoundAbi, reviewReuseCreditsAbi, REVIEW_WALLET_GAS_UNITS, type ReviewReuseState } from "./review-fund-reuse.ts";
import { ChainPendingError } from "./chain-transactions.ts";

function fixture(refund=false){
  const wallets=Array.from({length:50},(_,i)=>new Wallet(`0x${(i+1).toString(16).padStart(64,"0")}`)),operator=new Wallet(`0x${"77".repeat(32)}`);
  const round=`0x${"11".repeat(20)}`,factory=`0x${"22".repeat(20)}`,credits=`0x${"33".repeat(20)}`,hash=`0x${"aa".repeat(32)}`,code="0x1234",fee=5_000_000_000n;
  const roundIface=new Interface(reviewReuseRoundAbi),creditIface=new Interface(reviewReuseCreditsAbi),factoryIface=new Interface(["function rounds(uint256) view returns(address)","function owner() view returns(address)"]);
  const controls={paid:true,commissionPaid:true,refunded:true,owner:operator.address,reorg:false,wrongCode:false,withdrawable:refund?0n:parseEther('2'),growth:0n,subscriptionClosed:false,sponsor:parseEther('0.06')};
  const state:ReviewReuseState={journals:{}},writes:string[]=[],receipts=new Map<string,any>(),nonces=new Map<string,number>();let saves=0;
  const balances=new Map([operator,...wallets].map(w=>[w.address,REVIEW_WALLET_GAS_UNITS*fee]));balances.set(operator.address,parseEther('2'));balances.set(wallets[0].address,parseEther('2'));balances.set(wallets[2].address,parseEther('1'));
  const provider={getNetwork:async()=>({chainId:11155111n}),getCode:async(a:string)=>[round,factory,credits].includes(a.toLowerCase())?(controls.wrongCode?'0x4321':code):'0x',
    getBlock:async(tag:unknown)=>({number:tag==='latest'?101:Number(tag),hash:controls.reorg?`0x${"bb".repeat(32)}`:hash,timestamp:Math.floor(Date.now()/1000),baseFeePerGas:1_000_000_000n}),
    getBalance:async(a:string)=>balances.get(a)??0n,getFeeData:async()=>({maxPriorityFeePerGas:1_000_000_000n}),getTransactionCount:async(a:string)=>nonces.get(a)??0,
    getTransactionReceipt:async(h:string)=>receipts.get(h)??null,getTransaction:async()=>null,estimateGas:async(r:any)=>r.data&&r.data!=='0x'?100_000n:21_000n,
    broadcastTransaction:async(raw:string)=>{writes.push(raw);return{hash:Transaction.from(raw).hash}},
    call:async(r:{to:string;data:string})=>{const iface=r.to.toLowerCase()===factory?factoryIface:r.to.toLowerCase()===credits?creditIface:roundIface,call=iface.parseTransaction(r)!;
      const values:Record<string,unknown>={owner:controls.owner,rounds:round,roundId:1n,CONTRACT_VERSION:'affiliate-v10',ALGORITHM_VERSION:'unique-rank-v6',WINNER_CREDITS_VERSION:'winner-credits-v6',revealed:!refund,prizePaid:controls.paid,
        totalAffiliateAccrued:refund?0n:parseEther('2'),totalAffiliateClaimed:refund?0n:controls.commissionPaid?parseEther('2'):0n,refundsAvailable:refund,totalMinted:refund?3n:1000n,totalRefunded:controls.refunded?parseEther('0.03'):0n,mintPrice:parseEther('0.01'),
        withdrawableBalance:controls.withdrawable,growthReserveBalance:controls.growth,subscriptionClosed:controls.subscriptionClosed,sponsorBalance:controls.sponsor};
      return iface.encodeFunctionResult(call.name,[values[call.name]]);
    }} as unknown as Provider;
  function confirm(){const tx=Transaction.from(writes.at(-1)!);assert.equal(tx.to===operator.address||tx.to?.toLowerCase()===round||tx.to?.toLowerCase()===credits,true);const gas=tx.data==='0x'?21_000n:100_000n;
    receipts.set(tx.hash!,{hash:tx.hash,status:1,from:tx.from,to:tx.to,blockNumber:100,blockHash:hash,gasUsed:gas,gasPrice:2_000_000_000n});nonces.set(tx.from!,tx.nonce+1);
    balances.set(tx.from!,balances.get(tx.from!)!-tx.value-gas*2_000_000_000n);
    if(tx.data==='0x')balances.set(operator.address,balances.get(operator.address)!+tx.value);
    else{const iface=tx.to?.toLowerCase()===credits?creditIface:roundIface,call=iface.parseTransaction(tx)!;
      if(call.name==='withdraw'){controls.withdrawable=0n;balances.set(operator.address,balances.get(operator.address)!+call.args[1]);}
      if(call.name==='withdrawGrowthReserve'){controls.growth=0n;balances.set(operator.address,balances.get(operator.address)!+call.args[1]);}
      if(call.name==='withdrawRandomnessFunding'){controls.subscriptionClosed=true;balances.set(operator.address,balances.get(operator.address)!+parseEther('0.29'));}
      if(call.name==='withdrawSponsorship'){controls.sponsor=0n;balances.set(operator.address,balances.get(operator.address)!+call.args[2]);}
    }
  }
  const common={chainId:11155111 as const,collectionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',maxFeePerGasWei:String(fee),maxTotalSpendWei:parseEther('25').toString()};
  const scenario=refund?{kind:'refund-3-30m' as const,...common,mintTarget:3 as const,durationSeconds:1800 as const,expectedOutcome:'unsold/refundable' as const}
    :{kind:'manual-affiliate-sellout' as const,...common,affiliateWallet:wallets[0].address,buyerWallet:wallets[1].address,manualMintsPerWallet:20 as const,expectedOutcome:'manual-prize-and-commission-claimed' as const};
  const options={chainId:11155111,provider,operator,wallets,credits:{address:credits,codeHash:keccak256(code)},source:{runId:'previous-run',preparedHash:'frozen-plan',nextCollectionId:'next-collection',round,roundId:'1',roundCodeHash:keccak256(code),factory,factoryCodeHash:keccak256(code),scenario,rehearsalDone:true,manualClaimsComplete:true,walletAddresses:wallets.map(w=>w.address),priorTransactionsConfirmed:true},
    maxFeePerGasWei:String(fee),confirmations:2,execute:true,state,save:async()=>{saves++;},guard:async()=>{}};
  return{options,controls,writes,confirm,balances,receipts,saves:()=>saves,operator,wallets,roundIface,creditIface};
}

test('reuse refuses Mainnet and unfinished manual or refund settlement before signing',async()=>{
  await assert.rejects(reviewReuseStep({chainId:1} as never),/sepolia_only/);
  const f=fixture();f.options.source.manualClaimsComplete=false;await assert.rejects(reviewReuseStep(f.options),/pending/);f.options.source.manualClaimsComplete=true;
  f.controls.paid=false;await assert.rejects(reviewReuseStep(f.options),/outcome/);f.controls.paid=true;f.controls.commissionPaid=false;await assert.rejects(reviewReuseStep(f.options),/commission_pending/);
  assert.equal(f.writes.length,0);const r=fixture(true);r.controls.refunded=false;await assert.rejects(reviewReuseStep(r.options),/outcome/);assert.equal(r.writes.length,0);
});
test('read-only reuse proposes a scoped owner withdrawal without modifying the state or signing',async()=>{
  const f=fixture(),before=structuredClone(f.options.state),result=await reviewReuseStep({...f.options,execute:false});assert.equal(result.action,'withdraw');assert.equal(result.mode,'read_only');assert.equal(f.writes.length,0);assert.equal(f.saves(),0);assert.deepEqual(f.options.state,before);
});
test('settled proceeds recycle once across a crash, retain wallet gas, and never auto-claim or transfer an NFT',async()=>{
  const f=fixture();f.controls.growth=parseEther('1.997');let complete=false;
  for(let i=0;i<20&&!complete;i++){
    try{complete=(await reviewReuseStep(f.options)).mode==='complete';}
    catch(e){assert.ok(e instanceof ChainPendingError);f.confirm();f.options.state=structuredClone(f.options.state);}
  }
  assert.ok(complete);assert.equal(f.writes.length,6); // surplus, growth, VRF, sponsorship, two wallet returns
  const txs=f.writes.map(raw=>Transaction.from(raw));assert.deepEqual(txs.filter(t=>t.data!=='0x').map(t=>(t.to?.toLowerCase()===`0x${'33'.repeat(20)}`?f.creditIface:f.roundIface).parseTransaction(t)!.name),['withdraw','withdrawGrowthReserve','withdrawRandomnessFunding','withdrawSponsorship']);
  const returns=txs.filter(t=>t.data==='0x');assert.deepEqual(returns.map(t=>t.from),[f.wallets[0].address,f.wallets[2].address]);assert.ok(returns.every(t=>t.to===f.operator.address));
  for(const w of f.wallets)assert.ok(f.balances.get(w.address)!>=REVIEW_WALLET_GAS_UNITS*5_000_000_000n);
  const written=f.writes.length;assert.equal((await reviewReuseStep(f.options)).action,'already-reused');assert.equal(f.writes.length,written);
});
test('refund handoff recovers unused VRF and sponsorship only after all three paid refunds',async()=>{
  const f=fixture(true);await assert.rejects(reviewReuseStep(f.options),ChainPendingError);assert.equal(f.roundIface.parseTransaction(Transaction.from(f.writes[0]))!.name,'withdrawRandomnessFunding');f.confirm();
  await assert.rejects(reviewReuseStep(f.options),ChainPendingError);assert.equal(f.creditIface.parseTransaction(Transaction.from(f.writes[1]))!.name,'withdrawSponsorship');
});
test('reuse fails closed on ownership, runtime, wallet substitution and changed frozen bindings',async()=>{
  const f=fixture();f.controls.owner=f.wallets[4].address;await assert.rejects(reviewReuseStep(f.options),/original_owner/);f.controls.owner=f.operator.address;
  f.controls.wrongCode=true;await assert.rejects(reviewReuseStep(f.options),/runtime/);f.controls.wrongCode=false;
  const swapped=[...f.wallets].reverse();await assert.rejects(reviewReuseStep({...f.options,wallets:swapped}),/original_wallet/);
  f.options.source.preparedHash='changed';await assert.rejects(reviewReuseStep(f.options),/binding_changed/);assert.equal(f.writes.length,0);
});
test('a lost network lock or reorganized confirmed receipt prevents the next transfer',async()=>{
  const f=fixture();await assert.rejects(reviewReuseStep({...f.options,guard:async()=>{throw Error('lock_lost')}}),/lock_lost/);assert.equal(f.writes.length,0);
  await assert.rejects(reviewReuseStep(f.options),ChainPendingError);f.confirm();f.controls.reorg=true;
  await assert.rejects(reviewReuseStep(f.options),/canonical|reorganized/);assert.equal(f.writes.length,1);
});
test('pending bytes are reused exactly, and a changed settlement blocks rebroadcast',async()=>{
  const f=fixture();await assert.rejects(reviewReuseStep(f.options),ChainPendingError);
  const original=f.writes[0];f.options.state=structuredClone(f.options.state);
  f.controls.paid=false;await assert.rejects(reviewReuseStep(f.options),/outcome/);assert.equal(f.writes.length,1);
  f.controls.paid=true;await assert.rejects(reviewReuseStep(f.options),ChainPendingError);assert.equal(f.writes.length,2);assert.equal(f.writes[1],original);
});
test('the separate recovery spending cap blocks an oversized wallet return before broadcast',async()=>{
  const f=fixture();f.controls.withdrawable=0n;f.controls.subscriptionClosed=true;f.controls.sponsor=0n;
  f.balances.set(f.wallets[0].address,parseEther('16'));
  await assert.rejects(reviewReuseStep(f.options),/spending cap/);assert.equal(f.writes.length,0);
});
test('the recovery cap is cumulative across different wallet journals',async()=>{
  const f=fixture();f.controls.withdrawable=0n;f.controls.subscriptionClosed=true;f.controls.sponsor=0n;
  f.balances.set(f.wallets[0].address,parseEther('8'));f.balances.set(f.wallets[2].address,parseEther('8'));
  await assert.rejects(reviewReuseStep(f.options),ChainPendingError);f.confirm();
  await assert.rejects(reviewReuseStep(f.options),(error:Error&{cause?:Error})=>error.cause?.message==='reuse_spending_cap_exceeded');
  assert.equal(f.writes.length,1);
});
