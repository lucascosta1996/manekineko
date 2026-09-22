import assert from "node:assert/strict";
import test from "node:test";
import { Interface, keccak256 } from "ethers";
import { buildTinctaSvg } from "@manekineko/contract-abi/tincta-artwork";
import { contrastTextColor } from "@manekineko/contract-abi/season-appearance";
import { decodeOnChainMetadata, validateOnChainSvg, verifyMetadataNumbers, NftMetadataUnavailable } from "../lib/nfts/metadata.ts";
import { createNftMetadataReader, type MetadataRecord } from "../lib/nfts/metadata-reader.ts";
import { nftLinks } from "../lib/nfts/links.ts";

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><rect width="640" height="640" rx="32" fill="#f6f3e9"/><g fill="#173c2c" font-family="monospace"><text x="48" y="80" font-size="24">MANEKINEKO</text></g></svg>';
const dataUri = (mime: string, value: string) => `data:${mime};base64,${Buffer.from(value).toString("base64")}`;
const metadata = (revealed = true) => ({
  name: "Collection #3", description: "On-chain artwork", image: dataUri("image/svg+xml", svg),
  contract_version: "affiliate-v5", algorithm_version: "unique-rank-v2", randomness_provider: "chainlink-vrf-v2.5",
  attributes: revealed ? [1, 1, 2, 4, 19, 20].map((value, i) => ({ trait_type: ["A", "B", "C", "D", "Combination code", "Score"][i], value }))
    : [{ trait_type: "Status", value: "Sealed" }],
});
const encode = (value: unknown) => dataUri("application/json", JSON.stringify(value));
const metadataV6 = (revealed = true) => ({
  ...metadata(revealed), contract_version: "affiliate-v6", algorithm_version: "unique-rank-v3",
  attributes: revealed ? [9, 5, 12, 3, 33970, 20].map((value, i) => ({ trait_type: ["A", "B", "C", "D", "Combination code", "Score"][i], value }))
    : [{ trait_type: "Status", value: "Sealed" }],
});
const tinctaSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800" viewBox="0 0 640 800"><rect width="640" height="800" fill="#330000"/><g fill="none" stroke="#FFFFFF" stroke-width="1" opacity="0.25"><path d="M 48 240 C 100 200 200 280 592 240 L 592 300 Z"/></g><g fill="#FFFFFF" font-family="sans-serif" font-weight="500"><text x="48" y="80" font-size="24" letter-spacing="1.5">Tincta</text><text x="592" y="752" font-family="monospace" font-weight="400" text-anchor="end">No. 0003</text></g></svg>';

test("decodes original on-chain SVG/name/attributes and verifies actual revealed combination", () => {
  const decoded = decodeOnChainMetadata(encode(metadata()));
  assert.equal(decoded.name, "Collection #3"); assert.equal(decoded.image, metadata().image);
  assert.deepEqual(verifyMetadataNumbers(decoded, true, [[1n, 1n, 2n, 4n], 19n, 20n], 20), { numbers: [1, 1, 2, 4], score: "20" });
});
test("sealed and refundable tickets never invent numbers or scores", () => {
  for (const value of ["Sealed", "Refundable"]) {
    const decoded = decodeOnChainMetadata(encode({ ...metadata(false), attributes: [{ trait_type: "Status", value }] }));
    assert.deepEqual(verifyMetadataNumbers(decoded, false, null, 20), { numbers: null, score: null });
    assert.throws(() => verifyMetadataNumbers(decoded, true, null, 20), NftMetadataUnavailable);
  }
});
test("rejects metadata that disagrees with the real combination or exceeds collection supply", () => {
  const decoded = decodeOnChainMetadata(encode(metadata()));
  for (const combination of [[[1n, 1n, 2n, 4n], 18n, 20n], [[1n, 1n, 2n, 3n], 18n, 19n], [[0n, 1n, 2n, 4n], 19n, 20n]]) {
    assert.throws(() => verifyMetadataNumbers(decoded, true, combination, 20), NftMetadataUnavailable);
  }
  assert.throws(() => verifyMetadataNumbers(decoded, true, [[1n, 1n, 2n, 4n], 19n, 20n], 19), NftMetadataUnavailable);
  assert.throws(() => verifyMetadataNumbers(decoded, false, null, 20), NftMetadataUnavailable);
});
test("rejects remote metadata/images, malformed base64, duplicate traits, and oversized payloads", () => {
  for (const uri of ["https://example.invalid/metadata", "data:application/json;base64,eyA=\n", encode(null), encode({ ...metadata(), image: "https://example.invalid/a.svg" }),
    encode({ ...metadata(), name: "x".repeat(257) }), encode({ ...metadata(), attributes: [metadata().attributes[0], metadata().attributes[0]] }),
    dataUri("application/json", " ".repeat(131073)), encode({ ...metadata(), image: dataUri("image/svg+xml", svg + " ".repeat(65537)) })]) {
    assert.throws(() => decodeOnChainMetadata(uri), NftMetadataUnavailable);
  }
});
test("rejects script, handlers, foreign objects, external links, styles, entities, malformed and nested SVG", () => {
  for (const unsafe of [
    svg.replace("</svg>", "<script>alert(1)</script></svg>"), svg.replace("<g ", '<g onload="alert(1)" '),
    svg.replace("</svg>", '<foreignObject><div>unsafe</div></foreignObject></svg>'),
    svg.replace("</svg>", '<image href="https://example.invalid/a"/></svg>'),
    svg.replace('fill="#173c2c"', 'fill="url(https://example.invalid/a)"'),
    svg.replace('fill="#173c2c"', 'style="background:url(https://example.invalid/a)"'),
    svg.replace("MANEKINEKO", "&external;"), svg.replace("MANEKINEKO", "<![CDATA[unsafe]]>"),
    '<!DOCTYPE svg [<!ENTITY external SYSTEM "file:///etc/passwd">]>' + svg,
    svg.replace('width="640"', 'width="&#x36;40"'), svg.replace("<g ", '<g xmlns="https://example.invalid" '),
    svg.replace("</svg>", "</g></svg>"), svg + svg, svg.replace("<g ", "<svg "),
  ]) assert.throws(() => validateOnChainSvg(unsafe), NftMetadataUnavailable);
});
test("accepts passive portrait Tincta artwork without changing sealed or revealed number verification", () => {
  validateOnChainSvg(tinctaSvg);
  for (const revealed of [false, true]) {
    const decoded = decodeOnChainMetadata(encode({ ...metadataV6(revealed), image: dataUri("image/svg+xml", tinctaSvg),
      contract_version: "affiliate-v8", algorithm_version: "unique-rank-v5" }), "affiliate-v8");
    assert.equal(decoded.image, dataUri("image/svg+xml", tinctaSvg));
    assert.deepEqual(verifyMetadataNumbers(decoded, revealed, revealed ? [[9n, 5n, 12n, 3n], 33970n, 20n] : null, 20,
      { contractVersion: "affiliate-v8", decodedScore: revealed ? 20n : undefined }),
    revealed ? { numbers: [9, 5, 12, 3], score: "20" } : { numbers: null, score: null });
  }
  for (const d of ["M -1 2 L 640 800", "M 48 240 C 100 200 200 280 592 240 C 600 300 400 200 48 240 Z", "M 0 0 Z M 1 1 L 2 2 Z",
    "M320 350 C160 240 160 460 320 350", "M58 202 L70 202 M64 196 L64 208", "M-1 2 L640 800"]) {
    validateOnChainSvg(tinctaSvg.replace(/d="[^"]+"/, `d="${d}"`));
  }
});
test("accepts the shared Tincta generator in all lifecycle states on dark and light collection colors", () => {
  for (const collectionColor of ["#330000", "#FF6600", "#FFFFFF"]) {
    for (const state of ["sealed", "revealed", "refundable"] as const) {
      const artwork = buildTinctaSvg({ seasonId: `0x${"ab".repeat(32)}`, seasonName: "Crimson & Blood Orange", collectionName: collectionColor, collectionColor,
        textColor: contrastTextColor(collectionColor), tokenId: 42, state,
        ...(state === "revealed" ? { numbers: [9, 5, 12, 3], score: 20, awardRank: 6 } : {}) });
      validateOnChainSvg(artwork);
      assert.match(artwork, /viewBox="0 0 640 800"/);
    }
  }
});
test("rejects unsafe or malformed Tincta paths and decorative attributes", () => {
  const invalidPaths = ["", "L 1 2", "M 1", "M 1 2 3", "M 1 2 L 3", "M 1 2 C 3 4 5 6 7", "M 1 2 Z 3 4",
    "M 1 2 Q 3 4 5 6", "m 1 2", "M 1.5 2", "M 1e2 2", "M 1,2", "M 1 --2", "M 1 2 C NaN 0 0 0 0 0",
    "M 65537 0", "M -65537 0", "M 99999999999999999999999 0", "M 0 0 " + "L 1 1 ".repeat(1400),
    "M 0 0 url(https://example.invalid/a)"];
  for (const d of invalidPaths) assert.throws(() => validateOnChainSvg(tinctaSvg.replace(/d="[^"]+"/, `d="${d}"`)), NftMetadataUnavailable, d);
  for (const unsafe of [
    tinctaSvg.replace('<path d=', '<path onload="alert(1)" d='),
    tinctaSvg.replace('<path d=', '<path href="https://example.invalid/a" d='),
    tinctaSvg.replace('<path d=', '<path transform="translate(1 1)" d='),
    tinctaSvg.replace(/<path d="[^"]+"\/>/, '<path stroke="#FFFFFF"/>'),
    tinctaSvg.replace('<path d=', '<path d="M 0 0" d='),
    tinctaSvg.replace(/<path d="[^"]+"\/>/, '<path d="M 0 0"><text x="0" y="0">Nested</text></path>'),
    tinctaSvg.replace('stroke="#FFFFFF"', 'stroke="url(https://example.invalid/a)"'),
    tinctaSvg.replace('stroke-width="1"', 'stroke-width="-1"'),
    tinctaSvg.replace('stroke-width="1"', 'stroke-width="65"'),
    tinctaSvg.replace('opacity="0.25"', 'opacity="1.1"'),
    tinctaSvg.replace('opacity="0.25"', 'opacity="-0.1"'),
    tinctaSvg.replace('font-weight="500"', 'font-weight="bold"'),
    tinctaSvg.replace('text-anchor="end"', 'text-anchor="inherit"'),
    tinctaSvg.replace('letter-spacing="1.5"', 'letter-spacing="65"'),
    tinctaSvg.replace('letter-spacing="1.5"', 'letter-spacing="NaN"'),
    tinctaSvg.replace('</svg>', '<defs/><use href="#pattern"/></svg>'),
  ]) assert.throws(() => validateOnChainSvg(unsafe), NftMetadataUnavailable);
});
test("mainnet NFT links retain OpenSea and Etherscan", () => {
  const contract = `0x${"a".repeat(40)}`;
  assert.deepEqual(nftLinks(1, contract, "3"), {
    openSea: `https://opensea.io/assets/ethereum/${contract}/3`,
    blockscout: null,
    explorer: `https://etherscan.io/token/${contract}?a=3`,
  });
});
test("Sepolia NFT links point to Blockscout artwork and retain the Etherscan record without an OpenSea testnet link", () => {
  const contract = "0xAfFd7dc1B6A0D8974040F3216316240B724715A9";
  assert.deepEqual(nftLinks(11155111, contract, "16"), {
    openSea: null,
    blockscout: `https://eth-sepolia.blockscout.com/token/${contract.toLowerCase()}/instance/16`,
    explorer: `https://sepolia.etherscan.io/token/${contract.toLowerCase()}?a=16`,
  });
});
test("NFT links reject injected identifiers, zero addresses, and unsupported networks", () => {
  const contract = `0x${"a".repeat(40)}`;
  for (const [chain, at, id] of [[137, contract, "3"], [1, "https://evil.invalid", "3"], [1, contract, "3?bad"], [1, contract, "0"], [1, contract, "65537"], [11155111, contract, "16/../../"], [11155111, contract, "16#metadata"], [11155111, `0x${"0".repeat(40)}`, "16"]] as const) {
    assert.throws(() => nftLinks(chain, at, id));
  }
});

const contract = `0x${"1".repeat(40)}`, factory = `0x${"2".repeat(40)}`, renderer = `0x${"3".repeat(40)}`, owner = `0x${"4".repeat(40)}`;
const blockHash = `0x${"a".repeat(64)}`;
const record: MetadataRecord = {
  collectionId: "3342c115-3d41-4cb4-be45-fa103178f0ff", tokenId: "3", chainId: 11155111, contractAddress: contract, factoryAddress: factory,
  roundId: "1", maxSupply: 20, contractVersion: "affiliate-v5", algorithmVersion: "unique-rank-v2", blockNumber: "100", blockHash,
  revealed: true, ownerWallet: owner, burned: false,
};
const abi = new Interface([
  "function rounds(uint256) view returns(address)", "function renderer() view returns(address)",
  "function CONTRACT_VERSION() view returns(string)", "function ALGORITHM_VERSION() view returns(string)",
  "function roundId() view returns(uint256)", "function maxSupply() view returns(uint256)", "function totalMinted() view returns(uint256)",
  "function revealed() view returns(bool)", "function ownerOf(uint256) view returns(address)", "function tokenURI(uint256) view returns(string)",
  "function combination(uint256) view returns(uint256[4],uint256,uint256)",
  "function scoreCombination(uint256[4]) view returns(uint256)",
]);
function setup(options: { revealed?: boolean; wrongOwner?: boolean; wrongFactory?: boolean; chainId?: string; reorganize?: boolean; throwSecret?: boolean; v6?: boolean; v8?: boolean; wrongDecoder?: boolean; wrongAlgorithm?: boolean; wrongMetadataVersion?: boolean } = {}) {
  const calls: { method: string; params: unknown[]; fn?: string }[] = [];
  let blockReads = 0;
  const rpc = async (method: string, params: unknown[]) => {
    if (options.throwSecret) throw new Error("https://rpc.invalid/PRIVATE_KEY_DONT_EXPOSE");
    const item: typeof calls[number] = { method, params }; calls.push(item);
    if (method === "eth_chainId") return options.chainId ?? "0xaa36a7";
    if (method === "eth_getBlockByNumber") return { hash: options.reorganize && ++blockReads > 1 ? `0x${"b".repeat(64)}` : blockHash, number: "0x64" };
    if (method === "eth_getCode") return "0x6000";
    assert.equal(method, "eth_call");
    const tx = params[0] as { to: string; data: string };
    const parsed = abi.parseTransaction({ data: tx.data })!; item.fn = parsed.name;
    const result: Record<string, unknown[]> = {
      rounds: [options.wrongFactory ? renderer : contract], renderer: [renderer], CONTRACT_VERSION: [options.v8 ? "affiliate-v8" : options.v6 ? "affiliate-v6" : "affiliate-v5"], ALGORITHM_VERSION: [options.v8 && !options.wrongAlgorithm ? "unique-rank-v5" : options.v6 && !options.wrongAlgorithm ? "unique-rank-v3" : "unique-rank-v2"],
      roundId: [1n], maxSupply: [20n], totalMinted: [20n], revealed: [options.revealed ?? true], ownerOf: [options.wrongOwner ? renderer : owner],
      tokenURI: [encode(options.v8 && !options.wrongMetadataVersion ? {...metadataV6(options.revealed ?? true),contract_version:"affiliate-v8",algorithm_version:"unique-rank-v5",award_rank:6,prize_amount_wei:"1000000000000000000"} : options.v6 && !options.wrongMetadataVersion ? metadataV6(options.revealed ?? true) : metadata(options.revealed ?? true))],
      combination: options.v6 || options.v8 ? [[9n, 5n, 12n, 3n], 33970n, 20n] : [[1n, 1n, 2n, 4n], 19n, 20n],
      scoreCombination: [options.wrongDecoder ? 19n : 20n],
    };
    if (parsed.name === "scoreCombination") assert.deepEqual(Array.from(parsed.args[0]), [9n, 5n, 12n, 3n]);
    return abi.encodeFunctionResult(parsed.name, result[parsed.name]);
  };
  return { calls, read: createNftMetadataReader(rpc, { chainId: 11155111, factoryAddress: factory, factoryCodeHash: keccak256("0x6000"), contractVersion: options.v8 ? "affiliate-v8" : options.v6 ? "affiliate-v6" : "affiliate-v5" }) };
}
test("reads owner, metadata and numbers at exactly the indexed canonical block; checks canonical hash again", async () => {
  const { calls, read } = setup();
  const result = await read(record);
  assert.equal(result.score, "20"); assert.equal(result.blockHash, blockHash);
  for (const call of calls.filter(call => ["eth_call", "eth_getCode"].includes(call.method))) assert.deepEqual(call.params[1], { blockHash, requireCanonical: true });
  assert.equal(calls.filter(call => call.method === "eth_getBlockByNumber").length, 2);
  assert.equal(calls.some(call => call.method.startsWith("eth_send")), false);
});
test("shares bounded deployment verification across cards but independently verifies ownership and canonicality", async () => {
  const { calls, read } = setup();
  await Promise.all([read(record), read({ ...record, tokenId: "4" })]);
  assert.equal(calls.filter(call => call.fn === "CONTRACT_VERSION").length, 1);
  assert.equal(calls.filter(call => call.fn === "ownerOf").length, 2);
  assert.equal(calls.filter(call => call.method === "eth_getBlockByNumber").length, 3);
});
test("does not call combination for sealed tickets", async () => {
  const { calls, read } = setup({ revealed: false });
  const result = await read({ ...record, revealed: false });
  assert.equal(result.numbers, null); assert.equal(result.score, null);
  assert.equal(calls.some(call => call.fn === "combination"), false);
});
test("preserves confirmed burned records without calling ownerOf or tokenURI", async () => {
  const { calls, read } = setup();
  const result = await read({ ...record, burned: true, ownerWallet: null });
  assert.equal(result.status, "burned"); assert.equal(result.image, null);
  assert.equal(calls.some(call => call.fn === "ownerOf" || call.fn === "tokenURI"), false);
});
test("rejects reorgs, ownership mismatch, factory mismatch, wrong RPC network, and metadata failures without leaking secrets", async () => {
  for (const options of [{ reorganize: true }, { wrongOwner: true }, { wrongFactory: true }, { chainId: "0x1" }, { throwSecret: true }]) {
    const { read } = setup(options);
    await assert.rejects(read(record), error => {
      assert.ok(error instanceof NftMetadataUnavailable); assert.ok(!error.message.includes("PRIVATE")); assert.equal(error.cause, undefined); return true;
    });
  }
});
test("fail-closed inputs never issue RPC for unsupported networks and malformed identifiers", async () => {
  const { read, calls } = setup();
  for (const invalid of [{ chainId: 137 }, { factoryAddress: renderer }, { tokenId: "21" }, { blockNumber: "latest" }, { ownerWallet: null }, { blockHash: "0x123" }]) {
    await assert.rejects(read({ ...record, ...invalid }), NftMetadataUnavailable);
  }
  assert.equal(calls.length, 0);
});

const recordV6: MetadataRecord = { ...record, contractVersion: "affiliate-v6", algorithmVersion: "unique-rank-v3" };
test("V6 metadata verifies the on-chain decoder rather than treating the visible combination code as a rank", async () => {
  const { calls, read } = setup({ v6: true });
  const result = await read(recordV6);
  assert.deepEqual(result.numbers, [9, 5, 12, 3]);
  assert.equal(result.score, "20");
  assert.equal(calls.filter(call => call.fn === "scoreCombination").length, 1);
  for (const call of calls.filter(call => call.method === "eth_call")) assert.deepEqual(call.params[1], { blockHash, requireCanonical: true });
  const decoded = decodeOnChainMetadata(encode(metadataV6()), "affiliate-v6");
  assert.throws(() => verifyMetadataNumbers(decoded, true, [[9n, 5n, 12n, 3n], 33970n, 20n], 20, { contractVersion: "affiliate-v6" }), NftMetadataUnavailable);
  assert.throws(() => decodeOnChainMetadata(encode(metadataV6())), NftMetadataUnavailable);
  assert.throws(() => decodeOnChainMetadata(encode(metadata()), "affiliate-v6"), NftMetadataUnavailable);
});
test("V6 metadata rejects mismatched decoder results, on-chain algorithms, metadata versions and V5 factory pins", async () => {
  for (const options of [{ wrongDecoder: true }, { wrongAlgorithm: true }, { wrongMetadataVersion: true }]) {
    await assert.rejects(setup({ v6: true, ...options }).read(recordV6), NftMetadataUnavailable);
  }
  const v5 = setup();
  await assert.rejects(v5.read(recordV6), NftMetadataUnavailable);
  assert.equal(v5.calls.length, 0);
  const v6 = setup({ v6: true });
  await assert.rejects(v6.read(record), NftMetadataUnavailable);
  await assert.rejects(v6.read({ ...recordV6, algorithmVersion: "unique-rank-v2" }), NftMetadataUnavailable);
  assert.equal(v6.calls.length, 0);
});
test("sealed V6 NFTs never query the decoder or invent future numbers", async () => {
  const { calls, read } = setup({ v6: true, revealed: false });
  const result = await read({ ...recordV6, revealed: false });
  assert.equal(result.numbers, null);
  assert.equal(result.score, null);
  assert.equal(calls.some(call => call.fn === "combination" || call.fn === "scoreCombination"), false);
});

test("V8 on-chain artwork and encoded numbers use independent V8 trust and preserve sealed results", async () => {
 const v8={...record,contractVersion:"affiliate-v8" as const,algorithmVersion:"unique-rank-v5" as const};
 const live=setup({v8:true});const nft=await live.read(v8);assert.equal(nft.score,"20");assert.equal(nft.image,metadataV6().image);
 assert.equal(live.calls.filter(call=>call.fn==="scoreCombination").length,1);
 for(const options of [{wrongDecoder:true},{wrongAlgorithm:true},{wrongMetadataVersion:true}])await assert.rejects(setup({v8:true,...options}).read(v8),NftMetadataUnavailable);
 await assert.rejects(setup({v6:true}).read(v8),NftMetadataUnavailable);
 const sealed=await setup({v8:true,revealed:false}).read({...v8,revealed:false});assert.equal(sealed.numbers,null);
});
