import { Interface, keccak256 } from "ethers";
import { decodeOnChainMetadata, NftMetadataUnavailable, verifyMetadataNumbers, type NftMetadata } from "./metadata.ts";
import { nftLinks } from "./links.ts";

export interface MetadataRecord {
  seasonId?: string | null; seasonName?: string | null; collectionColor?: string | null; textColor?: string | null;
  collectionId: string; tokenId: string; chainId: number; contractAddress: string; factoryAddress: string;
  roundId: string; maxSupply: number; contractVersion: string; algorithmVersion: string;
  blockNumber: string; blockHash: string; revealed: boolean; ownerWallet: string | null; burned: boolean;
}
export type MetadataRpc = (method: string, params: unknown[]) => Promise<unknown>;
const round = new Interface([
  "function CONTRACT_VERSION() view returns(string)", "function ALGORITHM_VERSION() view returns(string)",
  "function roundId() view returns(uint256)", "function maxSupply() view returns(uint256)",
  "function totalMinted() view returns(uint256)", "function renderer() view returns(address)", "function revealed() view returns(bool)",
  "function ownerOf(uint256) view returns(address)", "function tokenURI(uint256) view returns(string)",
  "function combination(uint256) view returns(uint256[4],uint256,uint256)",
  "function score(uint256) view returns(uint256)",
  "function tokenIdForCombination(uint256[4]) view returns(uint256)",
  "function scoreCombination(uint256[4]) view returns(uint256)",
]);
const factory = new Interface(["function rounds(uint256) view returns(address)", "function renderer() view returns(address)"]);
const fail = (): never => { throw new NftMetadataUnavailable(); };
const address = (value: unknown): value is string => typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value) && !/^0x0{40}$/i.test(value);
const hash = (value: unknown): value is string => typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value);
const code = (value: unknown): value is string => typeof value === "string" && /^0x(?:[0-9a-f]{2})+$/i.test(value) && value.length <= 100002;

/** Each reader is scoped to one configured chain and an independently pinned versioned factory. */
export function createNftMetadataReader(rpc: MetadataRpc, settings: { chainId: number; factoryAddress: string; factoryCodeHash: string; contractVersion?: "affiliate-v5" | "affiliate-v6" | "affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10" }) {
  const contractVersion = settings.contractVersion ?? "affiliate-v5";
  const algorithmVersion = contractVersion === "affiliate-v10" ? "unique-rank-v6" : (contractVersion === "affiliate-v8" || contractVersion === "affiliate-v9") ? "unique-rank-v5" : contractVersion === "affiliate-v7" ? "unique-rank-v4" : contractVersion === "affiliate-v6" ? "unique-rank-v3" : "unique-rank-v2";
  type Trusted = { version: string; algorithm: string; roundId: bigint; supply: bigint; minted: bigint; revealed: boolean };
  const trustCache = new Map<string, { expires: number; value: Promise<Trusted> }>();
  async function canonical(record: MetadataRecord) {
    const block = await rpc("eth_getBlockByNumber", [`0x${BigInt(record.blockNumber).toString(16)}`, false]) as { hash?: unknown; number?: unknown } | null;
    if (!block || typeof block.hash !== "string" || block.hash.toLowerCase() !== record.blockHash.toLowerCase()
      || typeof block.number !== "string" || BigInt(block.number) !== BigInt(record.blockNumber)) fail();
  }
  async function read(record: MetadataRecord): Promise<NftMetadata> {
    try {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.collectionId)
        || ![1, 11155111].includes(record.chainId) || record.chainId !== settings.chainId
        || !["affiliate-v5", "affiliate-v6", "affiliate-v7", "affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(contractVersion)
        || record.contractVersion !== contractVersion || record.algorithmVersion !== algorithmVersion
        || !address(record.contractAddress) || !address(record.factoryAddress) || !address(settings.factoryAddress)
        || record.factoryAddress.toLowerCase() !== settings.factoryAddress.toLowerCase() || !hash(settings.factoryCodeHash)
        || !hash(record.blockHash) || !/^[1-9][0-9]{0,19}$/.test(record.blockNumber)
        || !/^[1-9][0-9]{0,77}$/.test(record.roundId) || !Number.isInteger(record.maxSupply) || record.maxSupply < 1 || record.maxSupply > 65536
        || !/^[1-9][0-9]{0,4}$/.test(record.tokenId) || Number(record.tokenId) > record.maxSupply
        || (record.burned ? record.ownerWallet !== null : !address(record.ownerWallet))) fail();
      const links = nftLinks(record.chainId, record.contractAddress, record.tokenId);
      const blockTag = { blockHash: record.blockHash, requireCanonical: true };
      async function call(at: string, abi: Interface, name: string, args: unknown[] = []) {
        const raw = await rpc("eth_call", [{ to: at, data: abi.encodeFunctionData(name, args) }, blockTag]);
        if (typeof raw !== "string" || raw.length > 400002 || !/^0x(?:[0-9a-f]{2})*$/i.test(raw)) return fail();
        return abi.decodeFunctionResult(name, raw);
      }
      const key = `${record.contractAddress.toLowerCase()}:${record.blockHash.toLowerCase()}`;
      let cached = trustCache.get(key);
      if (cached && cached.expires <= Date.now()) { trustCache.delete(key); cached = undefined; }
      if (!cached) {
        const value = (async (): Promise<Trusted> => {
          if (BigInt(String(await rpc("eth_chainId", []))) !== BigInt(settings.chainId)) return fail();
          await canonical(record);
          const [factoryCode, roundCode, mapped, factoryRenderer, roundRenderer, version, algorithm, roundId, supply, minted, revealed] = await Promise.all([
            rpc("eth_getCode", [settings.factoryAddress, blockTag]), rpc("eth_getCode", [record.contractAddress, blockTag]),
            call(settings.factoryAddress, factory, "rounds", [record.roundId]), call(settings.factoryAddress, factory, "renderer"),
            call(record.contractAddress, round, "renderer"), call(record.contractAddress, round, "CONTRACT_VERSION"),
            call(record.contractAddress, round, "ALGORITHM_VERSION"), call(record.contractAddress, round, "roundId"),
            call(record.contractAddress, round, "maxSupply"), call(record.contractAddress, round, "totalMinted"), call(record.contractAddress, round, "revealed"),
          ]);
          if (!code(factoryCode) || !code(roundCode) || keccak256(factoryCode).toLowerCase() !== settings.factoryCodeHash.toLowerCase()
            || String(mapped[0]).toLowerCase() !== record.contractAddress.toLowerCase() || !address(factoryRenderer[0])
            || String(factoryRenderer[0]).toLowerCase() !== String(roundRenderer[0]).toLowerCase()) return fail();
          return { version: version[0], algorithm: algorithm[0], roundId: roundId[0], supply: supply[0], minted: minted[0], revealed: revealed[0] };
        })();
        cached = { expires: Date.now() + 30_000, value };
        if (trustCache.size >= 64) trustCache.delete(trustCache.keys().next().value!);
        trustCache.set(key, cached);
        value.catch(() => { if (trustCache.get(key)?.value === value) trustCache.delete(key); });
      }
      const trusted = await cached.value;
      if (trusted.version !== record.contractVersion || trusted.algorithm !== record.algorithmVersion || trusted.roundId !== BigInt(record.roundId)
        || trusted.supply !== BigInt(record.maxSupply) || trusted.minted > trusted.supply || trusted.minted < BigInt(record.tokenId)
        || trusted.revealed !== record.revealed) fail();
      const base = { collectionId: record.collectionId, tokenId: record.tokenId, blockNumber: record.blockNumber, blockHash: record.blockHash, links };
      if (record.burned) {
        // A confirmed burn remains in mint history. ownerOf/tokenURI are intentionally unavailable after burn.
        await canonical(record);
        return { ...base, status: "burned", name: null, description: null, image: null, attributes: [], numbers: null, score: null };
      }
      const [owner, uri, combination] = await Promise.all([
        call(record.contractAddress, round, "ownerOf", [record.tokenId]),
        call(record.contractAddress, round, "tokenURI", [record.tokenId]),
        (record.revealed || contractVersion === "affiliate-v10") ? call(record.contractAddress, round, "combination", [record.tokenId]) : Promise.resolve(null),
      ]);
      if (String(owner[0]).toLowerCase() !== record.ownerWallet!.toLowerCase()) fail();
      const metadata = decodeOnChainMetadata(uri[0], contractVersion);
      if (record.seasonId && (metadata.seasonId !== record.seasonId || metadata.seasonName !== record.seasonName
        || metadata.collectionColor !== record.collectionColor || metadata.textColor !== record.textColor)) fail();
      if (contractVersion === "affiliate-v10" && combination
        && (await call(record.contractAddress, round, "tokenIdForCombination", [combination[0]]))[0] !== BigInt(record.tokenId)) fail();
      const decodedScore = (contractVersion === "affiliate-v6" || contractVersion === "affiliate-v7" || (contractVersion === "affiliate-v8" || contractVersion === "affiliate-v9" || contractVersion === "affiliate-v10")) && combination && record.revealed
        ? (await call(record.contractAddress, round, "scoreCombination", [combination[0]]))[0] as bigint : undefined;
      if (contractVersion === "affiliate-v10" && record.revealed
        && (await call(record.contractAddress, round, "score", [record.tokenId]))[0] !== decodedScore) fail();
      const numbers = verifyMetadataNumbers(metadata, record.revealed, combination, record.maxSupply, { contractVersion, decodedScore });
      await canonical(record);
      return { ...base, ...metadata, ...numbers, status: "available" };
    } catch { throw new NftMetadataUnavailable(); }
  }
  return read;
}
