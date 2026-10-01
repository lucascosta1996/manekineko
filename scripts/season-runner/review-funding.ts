import { setTimeout as delay } from "node:timers/promises";
import { formatEther, getAddress, type Provider } from "ethers";
import type { ReviewStage } from "./review-season-plan.ts";
import { ensure } from "./store.ts";
import { REVIEW_WALLET_GAS_UNITS } from "./review-fund-reuse.ts";

/** Retry only known provider throttling on read-only calls. Never use for submission. */
export async function readReviewRpc<T>(read: () => Promise<T>, wait: (ms: number) => Promise<unknown> = delay): Promise<T> {
  for (let attempt=0;;attempt++) {
    try { return await read(); } catch(error) {
      const e=error as {code?:unknown;error?:{code?:unknown};info?:{error?:{code?:unknown};responseStatus?:unknown}};
      const code=e?.error?.code ?? e?.info?.error?.code ?? e?.code;
      if(attempt>=3 || !([-32007,429].includes(Number(code)) || e?.info?.responseStatus===429)) throw error;
      await wait(1000 * 2 ** attempt);
    }
  }
}

/** Fresh liquid balances only: unsettled awards, refunds and contract reserves
 * cannot qualify a new opening. These are conservative allowances, not gas estimates. */
export async function reviewFundingCheck(provider: Provider, stage: ReviewStage, accounts: string[], confirmations: number, wait: (ms: number) => Promise<unknown> = delay) {
  const read = <T>(call: () => Promise<T>) => readReviewRpc(call, wait);
  ensure(stage.plan.chainId === "11155111" && stage.scenario.chainId === 11155111
    && (await read(()=>provider.getNetwork())).chainId === 11155111n, "review_funding_is_sepolia_only");
  ensure(Number.isSafeInteger(confirmations) && confirmations >= 2, "invalid_funding_confirmations");
  const head = await read(()=>provider.getBlock("latest")), block = head && await read(()=>provider.getBlock(head.number - confirmations + 1));
  ensure(head && block?.hash && Math.abs(Date.now()/1000-head.timestamp) < 180, "review_funding_requires_fresh_chain");
  const addresses = [...new Set(accounts.map(getAddress))], balances = new Map<string,bigint>();
  for (let index=0;index<addresses.length;index+=4) {
    if(index) await wait(650); // Leave request capacity for hosted indexing and wallet readers.
    for (const [address,balance] of await Promise.all(addresses.slice(index,index+4).map(async address =>
      [address,await read(()=>provider.getBalance(address,block.number))] as const))) balances.set(address,balance);
  }
  const { contract,operations } = stage.plan.steps[0].payload, scenario = stage.scenario;
  const fee = BigInt(scenario.maxFeePerGasWei), price = BigInt(contract.mintPriceWei), refund = scenario.kind === "refund-3-30m";
  const mint = price*(refund?3n:BigInt(contract.maxSupply));
  const vrf = BigInt(contract.randomnessFundingWei), sponsorship = BigInt(operations.winnerCreditSponsorshipWei!);
  const affiliateCount = scenario.kind === "manual-affiliate-sellout" ? BigInt(scenario.affiliateCohort?.slots.length??1) : 0n;
  const claimCount = refund ? 3n : BigInt(contract.winnerCount) + (scenario.kind === "manual-affiliate-sellout" ? BigInt(scenario.affiliateCohort?.successfulIds.length??1) : 0n);
  const gasUnits = (refund?3n:51n)*REVIEW_WALLET_GAS_UNITS + 25_000_000n + affiliateCount*1_000_000n + claimCount*500_000n + 100n*25_200n;
  let excluded = 0n;
  const manualWallets: {role:string;address:string;balanceEth:string;requiredEth:string;topUpEth:string}[] = [];
  if (scenario.kind === "manual-affiliate-sellout") {
    for (const [address,usable] of [[scenario.affiliateWallet,REVIEW_WALLET_GAS_UNITS*fee],[scenario.buyerWallet,price+REVIEW_WALLET_GAS_UNITS*fee]] as const) {
      const balance = balances.get(getAddress(address)); ensure(balance !== undefined, "funding_manual_wallet_missing");
      manualWallets.push({role:getAddress(address)===getAddress(scenario.affiliateWallet)?"affiliate":"referral-buyer",address:getAddress(address),balanceEth:formatEther(balance),requiredEth:formatEther(usable),topUpEth:formatEther(balance<usable?usable-balance:0n)});
      if (balance > usable) excluded += balance-usable;
    }
  }
  const total = [...balances.values()].reduce((sum,balance)=>sum+balance,0n), required = mint+vrf+sponsorship+gasUnits*fee;
  ensure((await read(()=>provider.getBlock(block.number)))?.hash === block.hash, "review_funding_observation_reorganized");
  ensure(Math.abs(Date.now()/1000-head.timestamp)<180,"review_funding_observation_expired");
  return { manualWallets, blockNumber:block.number, blockHash:block.hash, totalLiquidEth:formatEther(total), reservedSurplusExcludedEth:formatEther(excluded),
    requiredEth:formatEther(required), availableEth:formatEther(total-excluded), marginEth:formatEther(total-excluded-required),
    fundingPass:total-excluded>=required, futureIncomeCounted:false, gasPolicy:"Conservative allowances at the manifest fee ceiling" };
}
