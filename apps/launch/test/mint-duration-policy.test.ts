import assert from "node:assert/strict";
import test from "node:test";
import { assertEditableMintDuration } from "@manekineko/contract-abi/mint-duration";
import { parseV10Config } from "@manekineko/contract-abi/v10-config";
import { parseLaunchDraft,validateLaunchPayload } from "../lib/launch-config-validation.ts";
import { launchFixture } from "./launch-config.fixture.ts";
import { runtimeArtifact } from "./season-runtime.fixture.ts";
test("new ordinary plans cap at 24 hours while frozen historical reads preserve duration",()=>{
 const p=launchFixture();p.contract.mintDurationSeconds="604800";
 assert.equal(validateLaunchPayload(p).valid,false);
 assert.equal(validateLaunchPayload(p,{preserveHistoricalDuration:true}).valid,true);
 assert.deepEqual(parseLaunchDraft(p),p);
 assert.throws(()=>parseLaunchDraft(p,{editable:true}),/24 hours/);
 for(const seconds of ["3600","86400"])assert.doesNotThrow(()=>assertEditableMintDuration({...p.contract,mintDurationSeconds:seconds}));
});
test("1800 seconds requires the exact Sepolia V10 refund marker and supply greater than three",()=>{
 const contract={...runtimeArtifact().steps[0].payload.contract,algorithmVersion:"unique-rank-v6",sepoliaRehearsal:"refund-3-30m",mintDurationSeconds:"1800",saleStartAt:"2000"};
 assert.doesNotThrow(()=>assertEditableMintDuration(contract));
 const terms=parseV10Config(contract,11155111n,1000n);
 assert.equal(terms.config.mintDeadline-terms.config.saleStartAt,1800n);
 for(const patch of [{chainId:"1"},{algorithmVersion:"unique-rank-v5"},{sepoliaRehearsal:undefined},{maxSupply:"3"},{mintDurationSeconds:"3600"}])assert.throws(()=>assertEditableMintDuration({...contract,...patch}));
 assert.throws(()=>parseV10Config(contract,1n,1000n),/Sepolia-only/);
});
