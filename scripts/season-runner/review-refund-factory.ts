import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { createV10ChainAdapter } from "./chain.ts";
import { ChainPendingError } from "./chain-transactions.ts";
import { preparationEnvironment } from "./prepare-sepolia.ts";
import { readPrivateFile, writePrivateFile, loadPrivateEnvironment } from "./config.ts";
import { parseReviewSeason } from "./review-season-plan.ts";
import { getLaunchAutomation, updateLaunchAutomation } from "../../apps/launch/lib/launch-automation-store.ts";
import { encryptRuntimeSecret, decryptRuntimeSecret } from "../../apps/launch/lib/season-runtime-crypto.ts";
import { getSeasonRuntime } from "../../apps/launch/lib/season-runtime-store.ts";
import { ensure } from "./store.ts";
import { safeError } from "./worker-cli.ts";

/** Run separately before the refund's opening is frozen. Default is a read-only prerequisite report. */
async function main() {
  let manifest="",execute=false;const envFiles:string[]=[];
  const args=process.argv.slice(2);
  for(let index=0;index<args.length;index++){
    const flag=args[index];if(flag==="--execute"&&!execute){execute=true;continue;}
    ensure(["--manifest","--env-file"].includes(flag),"invalid_refund_factory_option");
    const value=args[++index];ensure(value&&!value.startsWith("--"),"invalid_refund_factory_option");
    if(flag==="--manifest"){ensure(!manifest,"duplicate_manifest");manifest=value;}else envFiles.push(value);
  }
  ensure(manifest,"review_manifest_required");
  const review=parseReviewSeason(JSON.parse((await readPrivateFile(manifest))!)),stage=review.stages[1];
  await loadPrivateEnvironment(envFiles);const config=preparationEnvironment();
  ensure(stage.automationId,"review_draft_not_saved");
  const worker=new pg.Pool({connectionString:config.databaseUrl,max:1,connectionTimeoutMillis:10000}),launch=new pg.Pool({connectionString:config.launchDatabaseUrl,max:1,connectionTimeoutMillis:10000});
  let db:pg.PoolClient|undefined,adapter:Awaited<ReturnType<typeof createV10ChainAdapter>>|undefined;
  try{
    db=await worker.connect();
    ensure((await db.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked",["tincta-season-chain:11155111"])).rows[0].locked,"another_worker_owns_this_network");
    const saved=await getLaunchAutomation(launch,stage.automationId),runtime=await getSeasonRuntime(launch,stage.automationId);
    ensure(saved.status==="draft"&&!runtime.run&&saved.plan.steps.length===1&&saved.plan.steps[0].id===stage.scenario.collectionId,"refund_factory_requires_unstarted_review_draft");
    const comparison=structuredClone(saved.plan);
    Object.assign(comparison.steps[0].payload.operations,{factoryMode:stage.plan.steps[0].payload.operations.factoryMode,factoryAddress:stage.plan.steps[0].payload.operations.factoryAddress});
    ensure(isDeepStrictEqual(comparison,stage.plan),"refund_draft_changed_since_review");
    const context=`sepolia-review-refund-factory:${stage.automationId}`,journalPath=resolve(dirname(manifest),"refund-factory.enc");
    const prior=await readPrivateFile(journalPath,true),journal=prior?JSON.parse(decryptRuntimeSecret(prior,context)):undefined;
    adapter=await createV10ChainAdapter({...config,privateKey:execute?config.privateKey:undefined,chainId:11155111,execute,journal,
      saveJournal:async value=>{await db!.query("SELECT 1");await writePrivateFile(journalPath,encryptRuntimeSecret(JSON.stringify(value),context));}});
    const preflight=await adapter.preflight();
    if(!execute){console.log(JSON.stringify({mode:"read_only",automationId:stage.automationId,action:"Deploy a dedicated V10 refund factory and approve it in the existing V5/V6 registries; leave opening unset.",preflight,hostedChangesRequired:["Web additional exact factory/address/runtime pin","Indexer append exact factory to INDEXER_TRUSTED_FACTORIES_JSON"]},null,2));return;}
    let result;
    while(!result){try{result=await adapter.ensureFactory(context,saved.plan.steps[0].payload.operations.factoryMode==="existing"?saved.plan.steps[0].payload.operations.factoryAddress:undefined);}catch(error){if(!(error instanceof ChainPendingError))throw error;console.log(JSON.stringify({mode:"pending",action:error.action,transactionHash:error.hash}));await delay(3000);}}
    ensure(result.factory.toLowerCase()!==review.stages[0].plan.steps[0].payload.operations.factoryAddress.toLowerCase(),"refund_factory_must_be_separate");
    const plan=structuredClone(saved.plan);Object.assign(plan.steps[0].payload.operations,{factoryMode:"existing",factoryAddress:result.factory});
    const updated=saved.plan.steps[0].payload.operations.factoryAddress===result.factory?saved:await updateLaunchAutomation(launch,{userId:saved.updatedBy},saved.id,{revision:saved.revision,plan});
    stage.plan=updated.plan;await writePrivateFile(manifest,JSON.stringify(review,null,2));
    const pin={chainId:11155111,contractVersion:"affiliate-v10",factory:result.factory,factoryCodeHash:result.factoryCodeHash};
    const proof={mode:"factory_ready_hosted_configuration_pending",pin,automationId:saved.id,opening:null,
      web:{variable:"AFFILIATE_ADDITIONAL_TRUSTED_FACTORIES_JSON",append:pin},indexer:{variable:"INDEXER_TRUSTED_FACTORIES_JSON",append:{contractVersion:pin.contractVersion,factory:pin.factory,factoryCodeHash:pin.factoryCodeHash}}};
    await writePrivateFile(resolve(dirname(manifest),"refund-factory-proof.json"),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));
  }finally{adapter?.destroy();db?.release(true);await worker.end();await launch.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(JSON.stringify({mode:"blocked",reason:safeError(error)}));process.exitCode=1;});
