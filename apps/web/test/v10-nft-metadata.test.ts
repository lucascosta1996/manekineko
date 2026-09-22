import assert from "node:assert/strict";
import test from "node:test";
import { Interface, keccak256 } from "ethers";
import { encodePermanentCombination } from "@manekineko/contract-abi/permanent-combinations";
import { buildTinctaPermanentSvg } from "@manekineko/contract-abi/tincta-artwork";
import { decodeOnChainMetadata, verifyMetadataNumbers, NftMetadataUnavailable } from "../lib/nfts/metadata.ts";
import { createNftMetadataReader, type MetadataRecord } from "../lib/nfts/metadata-reader.ts";

const at = `0x${"1".repeat(40)}`, factory = `0x${"2".repeat(40)}`, renderer = `0x${"3".repeat(40)}`, owner = `0x${"4".repeat(40)}`;
const blockHash = `0x${"a".repeat(64)}`, key = `0x${"42".repeat(32)}`;
const appearance = { seasonId: `0x${"7".repeat(64)}`, seasonName: "Copper Study", collectionName: "Warm Copper", collectionColor: "#330000", textColor: "#FFFFFF" as const };
const identity = encodePermanentCombination(3, key);
const uri = (type: string, data: unknown) => `data:${type};base64,${Buffer.from(typeof data === "string" ? data : JSON.stringify(data)).toString("base64")}`;
const metadata = {
  name: "Warm Copper #3", description: "Permanent identity. Scores are separate.",
  image: uri("image/svg+xml", buildTinctaPermanentSvg({ ...appearance, numbers: identity.numbers, combinationCode: identity.combinationCode, tokenId: 3 })),
  contract_version: "affiliate-v10", algorithm_version: "unique-rank-v6", randomness_provider: "chainlink-vrf-v2.5",
  artwork_version: "tincta-v3", combination_generation: "solidity-permutation-v1",
  season_id: appearance.seasonId, season_name: appearance.seasonName, collection_name: appearance.collectionName,
  collection_color: appearance.collectionColor, text_color: appearance.textColor, background_color: "330000",
  attributes: [...identity.numbers, Number(identity.combinationCode)].map((value, i) => ({ trait_type: ["A", "B", "C", "D", "Combination code"][i], value })),
};
const combination = (score: bigint) => [identity.numbers.map(BigInt), BigInt(identity.combinationCode), score];
const record: MetadataRecord = {
  collectionId: "3342c115-3d41-4cb4-be45-fa103178f0ff", tokenId: "3", chainId: 11155111, contractAddress: at, factoryAddress: factory,
  roundId: "1", maxSupply: 20, contractVersion: "affiliate-v10", algorithmVersion: "unique-rank-v6", blockNumber: "100", blockHash,
  revealed: false, ownerWallet: owner, burned: false, ...appearance,
};
const abi = new Interface([
  "function rounds(uint256) view returns(address)", "function renderer() view returns(address)",
  "function CONTRACT_VERSION() view returns(string)", "function ALGORITHM_VERSION() view returns(string)",
  "function roundId() view returns(uint256)", "function maxSupply() view returns(uint256)", "function totalMinted() view returns(uint256)",
  "function revealed() view returns(bool)", "function ownerOf(uint256) view returns(address)", "function tokenURI(uint256) view returns(string)",
  "function combination(uint256) view returns(uint256[4],uint256,uint256)", "function tokenIdForCombination(uint256[4]) view returns(uint256)",
  "function scoreCombination(uint256[4]) view returns(uint256)", "function score(uint256) view returns(uint256)",
]);
function fixture(revealed = false, overrides: Record<string, unknown[]> = {}) {
  const reads: string[] = [];
  const values: Record<string, unknown[]> = {
    rounds: [at], renderer: [renderer], CONTRACT_VERSION: ["affiliate-v10"], ALGORITHM_VERSION: ["unique-rank-v6"],
    roundId: [1n], maxSupply: [20n], totalMinted: [revealed ? 20n : 3n], revealed: [revealed], ownerOf: [owner],
    tokenURI: [uri("application/json", metadata)], combination: combination(revealed ? 19n : 0n), tokenIdForCombination: [3n], scoreCombination: [19n], score: [19n], ...overrides,
  };
  const read = createNftMetadataReader(async (method, params) => {
    if (method === "eth_chainId") return "0xaa36a7";
    if (method === "eth_getBlockByNumber") return { hash: blockHash, number: "0x64" };
    if (method === "eth_getCode") return "0x6000";
    assert.equal(method, "eth_call"); assert.deepEqual(params[1], { blockHash, requireCanonical: true });
    const call = abi.parseTransaction(params[0] as { data: string })!;
    reads.push(call.name);
    if (!revealed && ["score", "scoreCombination"].includes(call.name)) throw Error("RevealNotAvailable");
    return abi.encodeFunctionResult(call.name, values[call.name]);
  }, { chainId: 11155111, factoryAddress: factory, factoryCodeHash: keccak256("0x6000"), contractVersion: "affiliate-v10" });
  return { read: () => read({ ...record, revealed }), reads };
}

test("V10 first metadata read exposes permanent numbers with a null pending score and no score getter", async () => {
  const { read, reads } = fixture(); const result = await read();
  assert.deepEqual(result.numbers, identity.numbers); assert.equal(result.score, null);
  assert.ok(reads.includes("combination")); assert.ok(reads.includes("tokenIdForCombination"));
  assert.ok(!reads.includes("score")); assert.ok(!reads.includes("scoreCombination"));
  assert.equal(result.image, metadata.image);
});
test("V10 keeps identical metadata after the draw and verifies the separate score twice", async () => {
  const pending = await fixture().read(), complete = fixture(true), result = await complete.read();
  assert.equal(pending.image, result.image); assert.deepEqual(pending.attributes, result.attributes);
  assert.deepEqual(result.numbers, identity.numbers); assert.equal(result.score, "19");
  assert.ok(complete.reads.includes("score")); assert.ok(complete.reads.includes("scoreCombination"));
  assert.notEqual(result.score, identity.tokenId);
});
test("V10 rejects substituted identities, scores, versions and mutable metadata traits", async () => {
  const pendingOverrides: Record<string, unknown[]>[] = [{ tokenIdForCombination: [4n] }, { combination: combination(1n) }, { ALGORITHM_VERSION: ["unique-rank-v5"] }, { CONTRACT_VERSION: ["affiliate-v9"] }];
  for (const overrides of pendingOverrides) {
    await assert.rejects(fixture(false, overrides).read(), NftMetadataUnavailable);
  }
  const finalOverrides: Record<string, unknown[]>[] = [{ score: [18n] }, { scoreCombination: [18n] }, { combination: combination(0n) }];
  for (const overrides of finalOverrides) {
    await assert.rejects(fixture(true, overrides).read(), NftMetadataUnavailable);
  }
  for (const trait of ["Score", "Status", "Award Rank", "Prize"]) {
    const decoded = decodeOnChainMetadata(uri("application/json", { ...metadata, attributes: [...metadata.attributes, { trait_type: trait, value: 1 }] }), "affiliate-v10");
    assert.throws(() => verifyMetadataNumbers(decoded, false, combination(0n), 20, { contractVersion: "affiliate-v10" }), NftMetadataUnavailable);
  }
  for (const change of [{ artwork_version: "tincta-v2" }, { combination_generation: "vrf" }, { score: 19 }, { award_rank: 1 }]) {
    assert.throws(() => decodeOnChainMetadata(uri("application/json", { ...metadata, ...change }), "affiliate-v10"), NftMetadataUnavailable);
  }
});
