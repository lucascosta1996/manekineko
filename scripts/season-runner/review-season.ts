import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { Contract, JsonRpcProvider, Wallet, getAddress, keccak256 } from "ethers";
import { setTimeout as delay } from "node:timers/promises";
import { loadPrivateEnvironment, readPrivateFile, writePrivateFile } from "./config.ts";
import { preparationEnvironment, prepareSepoliaRun } from "./prepare-sepolia.ts";
import { getLaunchAutomation } from "../../apps/launch/lib/launch-automation-store.ts";
import { getSeasonRuntime } from "../../apps/launch/lib/season-runtime-store.ts";
import { openRunStore, ensure } from "./store.ts";
import { parseReviewSeason, reviewPreparationStartAt } from "./review-season-plan.ts";
import { safeError } from "./worker-cli.ts";
import { trustedFactoryPin } from "../../apps/web/lib/trusted-factories.ts";
import { encryptRuntimeSecret, decryptRuntimeSecret } from "../../apps/launch/lib/season-runtime-crypto.ts";
import { ensureSepoliaWallets, donorWallets } from "./sepolia-wallets.ts";
import { ChainPendingError, type ChainJournal } from "./chain-transactions.ts";
import { REVIEW_REUSE_POLICY, REVIEW_REUSE_CAP_WEI, reviewReuseStep, type ReviewReuseState } from "./review-fund-reuse.ts";
import { reviewFundingCheck, readReviewRpc } from "./review-funding.ts";

export function reviewArguments(args: string[]) {
  const values: Record<string,string> = {}, envFiles: string[] = []; let execute = false;
  for (let index=0;index<args.length;index++) {
    const flag=args[index];
    if(flag==="--execute"&&!execute){execute=true;continue;}
    ensure(["--manifest","--stage","--wallet-vault","--env-file"].includes(flag),"invalid_review_option");
    const value=args[++index];ensure(value&&!value.startsWith("--")&&(flag==="--env-file"||!values[flag]),"invalid_review_option");
    if(flag==="--env-file")envFiles.push(value);else values[flag]=value;
  }
  ensure(values["--manifest"]&&/^[123]$/.test(values["--stage"]??"")&&values["--wallet-vault"],"review_requires_manifest_stage_and_vault");
  return {manifest:values["--manifest"],stage:Number(values["--stage"]),vault:values["--wallet-vault"],envFiles,execute};
}

async function main() {
  const args=reviewArguments(process.argv.slice(2)), review=parseReviewSeason(JSON.parse((await readPrivateFile(args.manifest))!)), stage=review.stages[args.stage-1];
  await loadPrivateEnvironment(args.envFiles);
  const config=preparationEnvironment(),pool=new pg.Pool({connectionString:config.launchDatabaseUrl,max:2,connectionTimeoutMillis:10000});
  const workerPool=new pg.Pool({connectionString:config.databaseUrl,max:1,connectionTimeoutMillis:10000}),provider=new JsonRpcProvider(config.rpcUrl,undefined,{cacheTimeout:-1});
  try {
    ensure((await readReviewRpc(()=>provider.getNetwork())).chainId===11155111n,"review_rpc_is_not_sepolia");
    ensure(stage.automationId,"review_draft_not_saved");
    if(args.execute)for(const later of review.stages.slice(args.stage)){
      ensure(later.automationId,"review_draft_not_saved");
      const runtime=await getSeasonRuntime(pool,later.automationId);
      const reusePath=resolve(dirname(args.manifest),`reuse-before-${later.scenario.collectionId}.enc`);
      ensure(!runtime.run&&!await readPrivateFile(reusePath,true),"review_stage_already_handed_off");
    }
    const saved=await getLaunchAutomation(pool,stage.automationId);
    if(review.schemaVersion===2){
      ensure(isDeepStrictEqual(saved.reviewGroup, {seasonId:stage.plan.seasonId, seasonName:stage.plan.name, stages:review.stages.map(s=>({automationId:s.automationId,collectionId:s.plan.steps[0].id,name:s.plan.steps[0].payload.contract.name,color:s.plan.steps[0].payload.contract.collectionColor}))}), "review_group_not_saved");
    }else ensure(!args.execute,"legacy_review_superseded_use_grouped_manifest");
    const payload=saved.plan.steps[0]?.payload;
    const expected=structuredClone(stage.plan), actual=structuredClone(saved.plan);
    // Only run-day scheduling may differ once frozen. Factory changes must be reviewed in the manifest too.
    actual.startAt=null;
    ensure(isDeepStrictEqual(actual,expected),"review_saved_plan_changed");
    ensure(stage.scenario.maxFeePerGasWei===config.maxFeePerGasWei&&stage.scenario.maxTotalSpendWei===config.maxTotalSpendWei,"review_spending_policy_mismatch");
    ensure(payload.operations.factoryMode==="existing"&&payload.operations.factoryAddress,"review_factory_must_be_provisioned_before_run_day");
    const factory=getAddress(payload.operations.factoryAddress), head=await readReviewRpc(()=>provider.getBlock("latest")), block=head&&await readReviewRpc(()=>provider.getBlock(head.number-config.confirmations+1));
    ensure(head&&block?.hash&&Math.abs(Date.now()/1000-head.timestamp)<180,"review_requires_fresh_chain");
    const codeHash=keccak256(await readReviewRpc(()=>provider.getCode(factory,block.number)));
    ensure(trustedFactoryPin(11155111,"affiliate-v10",factory)?.factoryCodeHash===codeHash,"review_web_factory_configuration_not_ready");
    if(args.stage===2)ensure(factory.toLowerCase()!==review.stages[0].plan.steps[0].payload.operations.factoryAddress.toLowerCase(),"refund_requires_dedicated_factory");
    if(args.stage>1){
      const previous=review.stages[args.stage-2];ensure(previous.automationId,"previous_review_draft_missing");
      const runtime=await getSeasonRuntime(pool,previous.automationId);ensure(runtime.run,"previous_review_run_not_started");
      const store=await openRunStore(workerPool,runtime.run.id,11155111,false);
      try {
        const item=store.state.collections?.[previous.scenario.collectionId],round=item?.deployment?.round;
        ensure(round&&store.state.rehearsalDone?.includes(round),"previous_review_manual_actions_or_refunds_pending");
        ensure(keccak256(await provider.getCode(round,block.number))===item.deployment.roundCodeHash,"previous_review_runtime_changed");
        const contract=new Contract(round,["function revealed() view returns(bool)","function prizePaid() view returns(bool)","function refundsAvailable() view returns(bool)","function totalMinted() view returns(uint256)","function totalRefunded() view returns(uint256)","function mintPrice() view returns(uint256)"],provider),at={blockTag:block.number};
        ensure(args.stage===2 ? await contract.revealed(at)&&await contract.prizePaid(at)
          : await contract.refundsAvailable(at)&&await contract.totalMinted(at)===3n&&await contract.totalRefunded(at)===3n*await contract.mintPrice(at),"previous_review_outcome_not_confirmed");
        if(review.fundReuse===REVIEW_REUSE_POLICY){
          ensure(isDeepStrictEqual(store.state.rehearsal?.scenarios?.[round.toLowerCase()]?.manifest,previous.scenario),"reuse_previous_scenario_changed");
          const phasePath=resolve(dirname(args.manifest),`reuse-before-${stage.scenario.collectionId}.enc`),context=`review-reuse:${runtime.run.id}:${stage.scenario.collectionId}`;
          const encrypted=await readPrivateFile(phasePath,true);
          const reuseState:ReviewReuseState=encrypted?JSON.parse(decryptRuntimeSecret(encrypted,context)):{journals:{}};
          const targetRuntime=await getSeasonRuntime(pool,stage.automationId);
          ensure(!targetRuntime.run||reuseState.completed,"reuse_must_finish_before_next_run");
          const wallets=await ensureSepoliaWallets({chainId:11155111,path:args.vault,masterKey:Buffer.from(process.env.SEASON_RUNNER_MASTER_KEY??"","base64").toString("hex"),create:false});
          const sourceFactory=item.deployment.factory,sourcePin=trustedFactoryPin(11155111,"affiliate-v10",sourceFactory);
          ensure(sourcePin,"reuse_previous_factory_not_trusted");
          const source={runId:runtime.run.id,preparedHash:store.row.prepared_hash,nextCollectionId:stage.scenario.collectionId,
            round,roundId:String(item.deployment.roundId),roundCodeHash:item.deployment.roundCodeHash,factory:sourceFactory,factoryCodeHash:sourcePin.factoryCodeHash,
            scenario:previous.scenario,rehearsalDone:true,manualClaimsComplete:store.state.rehearsal?.manual?.[round.toLowerCase()]?.checkpoint==="complete",
            walletAddresses:store.state.walletAddresses??[],priorTransactionsConfirmed:Object.values(store.state.rehearsal?.journals??{}).every(j=>(j as ChainJournal).transactions.every(t=>t.state==="confirmed"))};
          let result;
          do{
            try{result=await reviewReuseStep({chainId:11155111,provider,operator:new Wallet(config.privateKey!),wallets,credits:config.credits,source,
              maxFeePerGasWei:config.maxFeePerGasWei,confirmations:config.confirmations,execute:args.execute,state:reuseState,
              guard:()=>store.query("SELECT 1"),save:value=>writePrivateFile(phasePath,encryptRuntimeSecret(JSON.stringify(value),context))});
              process.stdout.write(`${JSON.stringify({stage:args.stage,fundReuse:result})}\n`);
            }catch(error){if(!(error instanceof ChainPendingError))throw error;process.stdout.write(`${JSON.stringify({stage:args.stage,fundReuse:{mode:"pending",action:error.action,transactionHash:error.hash}})}\n`);}
            if(!args.execute||result?.mode==="complete")break;
            await delay(3000);
          }while(true);
          // A dry-run proposal has not released funds yet, so it cannot qualify
          // the next opening against the balances that recovery would produce.
          if(!args.execute&&result?.mode!=="complete"&&result?.action!=="reuse-complete")return;
        }
      }finally{await store.close();}
    }
    ensure((await provider.getBlock(block.number))?.hash===block.hash,"review_observation_reorganized");
    // After recovery, only balances actually received can qualify a new opening.
    // An existing run already spent its initial capital and keeps its frozen clock.
    if(review.fundReuse===REVIEW_REUSE_POLICY && !(await getSeasonRuntime(pool,stage.automationId)).run){
      const wallets=await ensureSepoliaWallets({chainId:11155111,path:args.vault,masterKey:Buffer.from(process.env.SEASON_RUNNER_MASTER_KEY??"","base64").toString("hex"),create:false});
      const funding=await reviewFundingCheck(provider,stage,[config.owner,...donorWallets().map(w=>w.address),...wallets.map(w=>w.address)],config.confirmations);
      process.stdout.write(`${JSON.stringify({stage:args.stage,funding})}\n`);
      ensure(funding.fundingPass,"review_funding_insufficient_before_new_opening");
    }
    const startAt=reviewPreparationStartAt(review,saved.status);
    const result=await prepareSepoliaRun(pool,{automationId:stage.automationId,envFiles:args.envFiles,execute:args.execute,help:false,reviewSeasonId:stage.plan.seasonId,...(startAt?{startAt}:{})},config);
    process.stdout.write(`${JSON.stringify({stage:args.stage,...result,...("collections" in result?{executionCollections:result.collections,collections:review.stages.length}:{}),seasonId:stage.plan.seasonId,collectionName:payload.contract.name,fundReuse:review.fundReuse??"disabled",
      ...(review.mintOpeningDelaySeconds?{mintOpeningDelaySeconds:review.mintOpeningDelaySeconds,enrollmentWindowSeconds:Number(payload.operations.enrollmentWindowSeconds)}:{}),
      ...(review.fundReuse?{reuseTiming:"After prior claims/refunds and before preparing the next opening",reuseTransferCapWei:REVIEW_REUSE_CAP_WEI}:{})},null,2)}\n`);
    if(!args.execute)return;
    ensure("runId" in result&&(!("desiredState" in result)||result.desiredState==="running"),"review_run_is_paused");
    const scenarioPath=resolve(dirname(args.manifest),`scenario-${stage.scenario.collectionId}.json`);
    await writePrivateFile(scenarioPath,JSON.stringify(stage.scenario));
    const child=spawn(process.execPath,["--import","tsx","--",resolve("scripts/season-runner/sepolia.ts"),"--run-id",result.runId,
      ...args.envFiles.flatMap(file=>["--env-file",resolve(file)]),"--wallet-vault",resolve(args.vault),"--sepolia-scenario",scenarioPath,
      "--log-file",resolve(`.private/season-runner/${result.runId}.log`),"--execute","--sepolia-rehearsal"],{stdio:"inherit"});
    for(const signal of ["SIGINT","SIGTERM"] as const)process.once(signal,()=>child.kill(signal));
    await new Promise<void>((resolve,reject)=>{child.once("error",reject);child.once("exit",code=>{process.exitCode=code??1;resolve();});});
  }finally{provider.destroy();await pool.end();await workerPool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(JSON.stringify({mode:"blocked",reason:safeError(error)}));process.exitCode=1;});
