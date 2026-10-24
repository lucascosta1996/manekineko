import type { NftLinks } from "./links";
import type { NftItem } from "./model";
import { type SeasonAppearance } from "@manekineko/contract-abi/season-appearance";

export interface NftAttribute { trait_type: string; value: string | number }
export interface NftMetadata extends Partial<SeasonAppearance> {
  status: "available" | "burned";
  collectionId: string;
  tokenId: string;
  blockNumber: string;
  blockHash: string;
  name: string | null;
  description: string | null;
  /** A validated SVG data URI. Display only as an img source, never inline markup. */
  image: string | null;
  attributes: NftAttribute[];
  numbers: [number, number, number, number] | null;
  score: string | null;
  links: NftLinks;
}
export { decodeOnChainMetadata, validateOnChainSvg, NftMetadataUnavailable } from "@manekineko/contract-abi/onchain-metadata";
import { NftMetadataUnavailable, type DecodedMetadata } from "@manekineko/contract-abi/onchain-metadata";
export type { DecodedMetadata } from "@manekineko/contract-abi/onchain-metadata";
const fail = (): never => { throw new NftMetadataUnavailable(); };

/** Permanent identities are available from mint; final scores are independently verified chain state. */
export function verifyMetadataNumbers(metadata: DecodedMetadata, revealed: boolean, combination: readonly unknown[] | null, maxSupply: number, options: { contractVersion: "affiliate-v5" | "affiliate-v6" | "affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10" | "affiliate-v11"; decodedScore?: bigint } = { contractVersion: "affiliate-v5" }): Pick<NftMetadata, "numbers" | "score"> {
  const attrs = new Map(metadata.attributes.map(value => [value.trait_type, value.value]));
  if (!revealed && (options.contractVersion !== "affiliate-v10" && options.contractVersion !== "affiliate-v11")) {
    if (combination !== null || attrs.size !== 1 || !["Sealed", "Refundable"].includes(String(attrs.get("Status")))) return fail();
    return { numbers: null, score: null };
  }
  if (!combination || combination.length !== 3 || !Array.isArray(combination[0]) || combination[0].length !== 4) return fail();
  const raw = combination[0] as unknown[];
  if (raw.some(value => typeof value !== "bigint" || value < 1n || value > 16n)
    || typeof combination[1] !== "bigint" || typeof combination[2] !== "bigint") return fail();
  const numbers = raw.map(Number) as [number, number, number, number];
  const code = (numbers[0] - 1) * 4096 + (numbers[1] - 1) * 256 + (numbers[2] - 1) * 16 + numbers[3] - 1;
  if ((options.contractVersion === "affiliate-v10" || options.contractVersion === "affiliate-v11")) {
    if (BigInt(code) !== combination[1] || attrs.size !== 5
      || ["A", "B", "C", "D"].some((key, index) => attrs.get(key) !== numbers[index])
      || attrs.get("Combination code") !== code) return fail();
    if (!revealed) {
      if (combination[2] !== 0n || options.decodedScore !== undefined) return fail();
      return { numbers, score: null };
    }
    if (typeof options.decodedScore !== "bigint" || options.decodedScore < 1n || options.decodedScore > BigInt(maxSupply)
      || combination[2] !== options.decodedScore) return fail();
    return { numbers, score: String(options.decodedScore) };
  }
  const score = (options.contractVersion === "affiliate-v6" || options.contractVersion === "affiliate-v7" || (options.contractVersion === "affiliate-v8" || options.contractVersion === "affiliate-v9")) ? options.decodedScore : BigInt(code + 1);
  if (typeof score !== "bigint" || score < 1n || score > BigInt(maxSupply) || score !== combination[2] || BigInt(code) !== combination[1]
    || attrs.size !== 6 || ["A", "B", "C", "D"].some((key, index) => attrs.get(key) !== numbers[index])
    || attrs.get("Score") !== Number(score) || attrs.get("Combination code") !== code) return fail();
  return { numbers, score: String(score) };
}

export type NftMetadataResponse = NftMetadata & { nft: NftItem };
