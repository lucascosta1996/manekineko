import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { contractSourceVersion, etherscanContractUrl } from "../lib/collections/contract-presentation.ts";

const address = "0xAfFd7dc1B6A0D8974040F3216316240B724715A9";

test("historical V5 and current V8 select their own source despite algorithm version numbering", () => {
  assert.equal(contractSourceVersion({ contractVersion: "affiliate-v5", algorithmVersion: "unique-rank-v2" }), "V5");
  assert.equal(contractSourceVersion({ contractVersion: "affiliate-v9", algorithmVersion: "unique-rank-v5" }), "V9");
  assert.equal(contractSourceVersion({ contractVersion: "affiliate-v8", algorithmVersion: "unique-rank-v5" }), "V8");
  assert.equal(contractSourceVersion({ contractVersion: "affiliate-v7", algorithmVersion: "unique-rank-v4" }), "V7");
  assert.equal(contractSourceVersion({ contractVersion: "legacy", algorithmVersion: "feistel-v1" }), "V1");
  assert.equal(contractSourceVersion({ contractVersion: "legacy", algorithmVersion: "unique-rank-v2" }), "V2");
});

test("Etherscan links target the actual network and deployed address, with no placeholder links", () => {
  const deployed = { chainId: 11155111, contractStatus: "deployed" as const, contractAddress: address };
  assert.equal(etherscanContractUrl(deployed), `https://sepolia.etherscan.io/address/${address}#code`);
  assert.equal(etherscanContractUrl({ ...deployed, chainId: 1 }), `https://etherscan.io/address/${address}#code`);
  for (const change of [
    { chainId: 31337 }, { contractStatus: "undeployed" as const }, { contractStatus: "failed" as const },
    { contractAddress: null }, { contractAddress: "0x0000000000000000000000000000000000000000" },
    { contractAddress: `${address}/other` },
  ]) assert.equal(etherscanContractUrl({ ...deployed, ...change }), null);
});

test("the published V8 source bundle matches the current round, ranking and renderer implementation", () => {
  const source = JSON.parse(readFileSync(new URL("../../../packages/contracts/src/ManekinekoRoundV8.source.json", import.meta.url), "utf8"));
  assert.equal(source.contractName, "ManekinekoRoundV8");
  for (const [field, path] of [
    ["source", "ManekinekoRoundV8.sol"],
    ["rankingSource", "libraries/MultiAwardRank.sol"],
    ["rendererSource", "ManekinekoRendererV8.sol"],
  ]) {
    assert.equal(source[field], readFileSync(new URL(`../../contracts/contracts/${path}`, import.meta.url), "utf8"));
  }
});

test("the V9 source bundle publishes the cumulative cap and matches the compiled source",()=>{
 const source=JSON.parse(readFileSync(new URL("../../../packages/contracts/src/ManekinekoRoundV9.source.json",import.meta.url),"utf8"));
 assert.equal(source.source,readFileSync(new URL("../../contracts/contracts/ManekinekoRoundV9.sol",import.meta.url),"utf8"));assert(source.source.includes("MAX_MINTS_PER_WALLET = 20"));
});
