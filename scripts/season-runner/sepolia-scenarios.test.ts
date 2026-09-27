import assert from "node:assert/strict";
import test from "node:test";
import { parseSepoliaScenario, refundMintQuantity } from "./sepolia-scenarios.ts";
import { parseArguments } from "./config.ts";
const manifest={kind:"refund-3-30m",chainId:11155111,collectionId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",mintTarget:3,durationSeconds:1800,expectedOutcome:"unsold/refundable",maxTotalSpendWei:"100000000000000000",maxFeePerGasWei:"1000000000"};
test("refund manifest pins exact target, duration, network, spending and terminal outcome",()=>{
 assert.deepEqual(parseSepoliaScenario(manifest),manifest);
 for(const patch of [{chainId:1},{mintTarget:4},{durationSeconds:3600},{expectedOutcome:"sellout"},{maxTotalSpendWei:"0"},{privateKey:"secret"}])assert.throws(()=>parseSepoliaScenario({...manifest,...patch}));
 assert.throws(()=>parseArguments(["--sepolia-scenario","private.json"],1),/sepolia_only/);
});
test("restart planning purchases one each for three controlled recipients and stops at three",()=>{
 for(let minted=0;minted<3;minted++)assert.equal(refundMintQuantity(BigInt(minted),0n,minted),1n);
 assert.equal(refundMintQuantity(2n,1n,0),0n);
 assert.equal(refundMintQuantity(3n,0n,2),0n);
 assert.equal(refundMintQuantity(2n,0n,3),0n);
 assert.throws(()=>refundMintQuantity(4n,0n,0),/mismatch/);
 assert.throws(()=>refundMintQuantity(2n,2n,0),/mismatch/);
});
