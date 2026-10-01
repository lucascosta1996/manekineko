import { Contract, Transaction, getAddress, keccak256, type Provider, type TransactionRequest, type Wallet } from "ethers";
import { ChainPendingError, createTransactionPipeline, transactionSpend, type ChainJournal } from "./chain-transactions.ts";
import { ensure } from "./store.ts";
import type { SepoliaScenario } from "./sepolia-scenarios.ts";

export const REVIEW_REUSE_POLICY = "completed-stage-to-operator-v1" as const;
export const REVIEW_REUSE_CAP_WEI = "15000000000000000000";
export const REVIEW_WALLET_GAS_UNITS = 2_500_000n;
const TRANSFER_GAS_UNITS = 25_200n;
export type ReviewReuseState = {
  binding?: string;
  journals: Record<string, ChainJournal>;
  completed?: { blockNumber: number; blockHash: string };
};
export type ReviewReuseSource = {
  runId: string; preparedHash: string; nextCollectionId: string;
  round: string; roundId: string; roundCodeHash: string; factory: string; factoryCodeHash: string;
  scenario: SepoliaScenario; rehearsalDone: boolean; manualClaimsComplete: boolean;
  walletAddresses: string[]; priorTransactionsConfirmed: boolean;
};
export const reviewReuseRoundAbi = [
  "function CONTRACT_VERSION() view returns(string)", "function ALGORITHM_VERSION() view returns(string)",
  "function owner() view returns(address)", "function roundId() view returns(uint256)",
  "function revealed() view returns(bool)", "function prizePaid() view returns(bool)",
  "function totalAffiliateAccrued() view returns(uint256)", "function totalAffiliateClaimed() view returns(uint256)",
  "function refundsAvailable() view returns(bool)", "function totalMinted() view returns(uint256)",
  "function totalRefunded() view returns(uint256)", "function mintPrice() view returns(uint256)",
  "function withdrawableBalance() view returns(uint256)", "function growthReserveBalance() view returns(uint256)",
  "function subscriptionClosed() view returns(bool)", "function withdraw(address,uint256)",
  "function withdrawGrowthReserve(address,uint256)", "function withdrawRandomnessFunding(address)",
];
export const reviewReuseCreditsAbi = [
  "function owner() view returns(address)", "function WINNER_CREDITS_VERSION() view returns(string)",
  "function sponsorBalance(address) view returns(uint256)", "function withdrawSponsorship(address,address,uint256)",
];
type Options = {
  chainId: number; provider: Provider; operator: Wallet; wallets: Wallet[];
  credits: { address: string; codeHash: string }; source: ReviewReuseSource;
  maxFeePerGasWei: string; confirmations: number; execute: boolean;
  state: ReviewReuseState; save: (state: ReviewReuseState) => Promise<void>; guard: () => Promise<unknown>;
};

/** One durable operation per step, under the previous run's exclusive network lock.
 * Claims stay manual. Only a fully settled previous collection can reach this path.
 * The next collection is not prepared until this separate handoff has completed. */
export async function reviewReuseStep(options: Options) {
  ensure(options.chainId === 11155111, "review_reuse_is_sepolia_only");
  const { source, provider, operator, wallets } = options;
  ensure(source.scenario.chainId === 11155111 && ["manual-affiliate-sellout", "refund-3-30m"].includes(source.scenario.kind), "invalid_reuse_source");
  ensure(source.rehearsalDone && source.priorTransactionsConfirmed && (source.scenario.kind !== "manual-affiliate-sellout" || source.manualClaimsComplete), "previous_review_manual_actions_or_refunds_pending");
  ensure(wallets.length === 50 && new Set(wallets.map(w=>w.address)).size === 50
    && JSON.stringify(wallets.map(w=>w.address.toLowerCase())) === JSON.stringify(source.walletAddresses.map(a=>a.toLowerCase()))
    && !wallets.some(w=>w.address===operator.address), "reuse_requires_original_wallet_vault");
  ensure(/^[1-9]\d*$/.test(options.maxFeePerGasWei) && options.maxFeePerGasWei===source.scenario.maxFeePerGasWei
    && options.confirmations >= 2, "reuse_policy_mismatch");
  ensure((await provider.getNetwork()).chainId === 11155111n, "review_rpc_is_not_sepolia");
  await options.guard();
  const state = options.execute ? options.state : structuredClone(options.state);
  const binding = JSON.stringify({policy:REVIEW_REUSE_POLICY,source,owner:operator.address,credits:options.credits,
    maxFeePerGasWei:options.maxFeePerGasWei,cap:REVIEW_REUSE_CAP_WEI,confirmations:options.confirmations});
  ensure(!state.binding || state.binding===binding, "reuse_binding_changed");
  state.binding=binding;
  const spent=()=>Object.values(state.journals).reduce((sum,j)=>sum+j.transactions.reduce((n,t)=>n+transactionSpend(t),0n),0n);
  const save=async()=>{ensure(spent()<=BigInt(REVIEW_REUSE_CAP_WEI),"reuse_spending_cap_exceeded");await options.guard();if(options.execute)await options.save(state);};
  const signers=new Map([operator,...wallets].map(w=>[w.address,w]));
  const pipeline=(signer:Wallet)=>{
    const journal=state.journals[signer.address]??={version:1,chainId:11155111,from:signer.address,maxFeePerGasWei:options.maxFeePerGasWei,maxTotalSpendWei:REVIEW_REUSE_CAP_WEI,transactions:[],collections:{}};
    ensure(journal.chainId===11155111 && journal.from===signer.address && journal.maxFeePerGasWei===options.maxFeePerGasWei && journal.maxTotalSpendWei===REVIEW_REUSE_CAP_WEI,"reuse_journal_policy_changed");
    return createTransactionPipeline({provider,signer,execute:options.execute,journal,confirmations:options.confirmations,save});
  };
  // Validate every saved receipt. Pending bytes are resumed only after rechecking
  // the source's canonical settled outcome below.
  let pendingTransaction: { signer: Wallet; entry: ChainJournal["transactions"][number] } | undefined;
  for(const journal of Object.values(state.journals)){
    const signer=signers.get(getAddress(journal.from));ensure(signer,"reuse_unknown_signer");
    const pending=journal.transactions.find(t=>t.state!=="confirmed");
    try{await pipeline(signer).confirmAll();}catch(error){if(!(error instanceof ChainPendingError)||!pending)throw error;}
    if(pending&&pending.state!=="confirmed"){ensure(!pendingTransaction,"reuse_multiple_pending_signers");pendingTransaction={signer,entry:pending};}
  }
  ensure(spent()<=BigInt(REVIEW_REUSE_CAP_WEI),"reuse_spending_cap_exceeded");
  const head=await provider.getBlock("latest"),block=head&&await provider.getBlock(head.number-options.confirmations+1);
  ensure(head&&block?.hash&&Math.abs(Date.now()/1000-head.timestamp)<180,"reuse_requires_fresh_chain");
  const at={blockTag:block.number};
  const canonical=async()=>{await options.guard();ensure((await provider.getBlock(block.number))?.hash===block.hash,"reuse_observation_reorganized");};
  if(state.completed){ensure(!pendingTransaction,"reuse_completed_with_pending_transaction");ensure((await provider.getBlock(state.completed.blockNumber))?.hash===state.completed.blockHash,"reuse_completion_reorganized");return {mode:"complete",action:"already-reused",blockNumber:state.completed.blockNumber};}
  const factory=new Contract(source.factory,["function rounds(uint256) view returns(address)","function owner() view returns(address)"],provider);
  const round=new Contract(source.round,reviewReuseRoundAbi,provider),credits=new Contract(options.credits.address,reviewReuseCreditsAbi,provider);
  for(const [address,hash]of [[source.factory,source.factoryCodeHash],[source.round,source.roundCodeHash],[options.credits.address,options.credits.codeHash]])
    ensure(keccak256(await provider.getCode(address,block.number))===hash,"reuse_runtime_changed");
  ensure(getAddress(await factory.rounds(source.roundId,at))===getAddress(source.round)
    && String(await round.roundId(at))===source.roundId && await round.CONTRACT_VERSION(at)==="affiliate-v10"
    && await round.ALGORITHM_VERSION(at)==="unique-rank-v6" && await credits.WINNER_CREDITS_VERSION(at)==="winner-credits-v6","reuse_provenance_changed");
  for(const contract of [factory,round,credits])ensure(getAddress(await contract.owner(at))===operator.address,"reuse_requires_original_owner");
  ensure(await provider.getCode(operator.address,block.number)==="0x","reuse_requires_plain_operator_wallet");
  const revealed=await round.revealed(at),refunded=await round.refundsAvailable(at);
  ensure(source.scenario.kind==="refund-3-30m"
    ? refunded&&!revealed&&await round.totalMinted(at)===3n&&await round.totalRefunded(at)===3n*await round.mintPrice(at)
    : revealed&&await round.prizePaid(at),"previous_review_outcome_not_confirmed");
  ensure(await round.totalAffiliateAccrued(at)===await round.totalAffiliateClaimed(at),"previous_review_commission_pending");
  if(pendingTransaction){
    const {signer,entry}=pendingTransaction;
    if(!options.execute)return {mode:"read_only",action:"pending-confirmation",transactionHash:entry.hash};
    const tx=Transaction.from(entry.rawTransaction);await canonical();
    await pipeline(signer).send(entry.action,{to:tx.to,data:tx.data,value:tx.value});
    return {mode:"reusing",action:"reconciled",transactionHash:entry.hash};
  }
  const send=async(signer:Wallet,action:string,request:TransactionRequest)=>{
    await canonical();
    if(!options.execute)return {mode:"read_only",action,from:signer.address,to:String(request.to),valueWei:String(request.value??0)};
    await save();await pipeline(signer).send(action,request);return {mode:"reusing",action};
  };
  const already=(signer:Wallet,action:string)=>state.journals[signer.address]?.transactions.some(t=>t.action===action&&t.state==="confirmed");
  for(const [getter,method]of [["withdrawableBalance","withdraw"],["growthReserveBalance","withdrawGrowthReserve"]]){
    const amount=BigInt(await round[getter](at));
    if(amount>0n && (revealed||method==="withdraw")){
      ensure(!already(operator,method),"reuse_contract_balance_changed_after_withdrawal");
      return send(operator,method,await round[method].populateTransaction(operator.address,amount));
    }
  }
  if(!await round.subscriptionClosed(at)){ensure(!already(operator,"withdraw-vrf"),"reuse_vrf_changed_after_withdrawal");return send(operator,"withdraw-vrf",await round.withdrawRandomnessFunding.populateTransaction(operator.address));}
  const sponsor=BigInt(await credits.sponsorBalance(source.round,at));
  if(sponsor>0n){ensure(!already(operator,"withdraw-sponsorship"),"reuse_sponsorship_changed_after_withdrawal");return send(operator,"withdraw-sponsorship",await credits.withdrawSponsorship.populateTransaction(source.round,operator.address,sponsor));}
  const reserve=REVIEW_WALLET_GAS_UNITS*BigInt(options.maxFeePerGasWei),transferGas=TRANSFER_GAS_UNITS*BigInt(options.maxFeePerGasWei);
  for(const wallet of wallets){
    const action=`return-surplus:${wallet.address}`;if(already(wallet,action))continue;
    ensure(await provider.getCode(wallet.address,block.number)==="0x","reuse_requires_plain_wallet");
    const amount=await provider.getBalance(wallet.address,block.number)-reserve-transferGas;
    if(amount>transferGas)return send(wallet,action,{to:operator.address,value:amount});
  }
  await canonical();
  if(options.execute){state.completed={blockNumber:block.number,blockHash:block.hash};await save();}
  return {mode:options.execute?"complete":"read_only",action:"reuse-complete",walletGasReserveWei:String(reserve),blockNumber:block.number};
}
