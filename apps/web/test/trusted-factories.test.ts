import test from "node:test";
import assert from "node:assert/strict";
import { trustedFactoryPin, trustedFactoryPins } from "../lib/trusted-factories.ts";
const first=`0x${"11".repeat(20)}`,second=`0x${"22".repeat(20)}`,hash=`0x${"aa".repeat(32)}`,secondHash=`0x${"bb".repeat(32)}`;
const additional={chainId:11155111,contractVersion:"affiliate-v10",factory:second,factoryCodeHash:secondHash};
const env={AFFILIATE_TRUSTED_FACTORY_V10_11155111:first,AFFILIATE_TRUSTED_FACTORY_CODEHASH_V10_11155111:hash,AFFILIATE_ADDITIONAL_TRUSTED_FACTORIES_JSON:JSON.stringify([additional])};
test("additional factory trust preserves existing history and stays bound to exact network version address and hash",()=>{
 assert.equal(trustedFactoryPins(env).length,2);
 assert.equal(trustedFactoryPin(11155111,"affiliate-v10",first,env)?.factoryCodeHash,hash);
 assert.equal(trustedFactoryPin(11155111,"affiliate-v10",second,env)?.factoryCodeHash,secondHash);
 assert.equal(trustedFactoryPin(1,"affiliate-v10",second,env),undefined);
 assert.equal(trustedFactoryPin(11155111,"affiliate-v9",second,env),undefined);
 assert.equal(trustedFactoryPin(11155111,"affiliate-v10",`0x${"33".repeat(20)}`,env),undefined);
});
test("malformed ambiguous and duplicate additional factory pins fail closed",()=>{
 for(const value of ["invalid","{}",JSON.stringify([{...additional,chainId:5}]),JSON.stringify([{...additional,extra:true}]),JSON.stringify([{...additional,factoryCodeHash:"0x"}]),JSON.stringify([{...additional,factory:first}]),JSON.stringify([additional,additional])])
  assert.throws(()=>trustedFactoryPins({...env,AFFILIATE_ADDITIONAL_TRUSTED_FACTORIES_JSON:value}));
});
