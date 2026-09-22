import type { NftLinks } from "./links";
import type { NftItem } from "./model";
import { normalizeSeasonAppearance, type SeasonAppearance } from "@manekineko/contract-abi/season-appearance";

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
export interface DecodedMetadata extends Partial<SeasonAppearance> {
  name: string; description: string; image: string; attributes: NftAttribute[];
}
export class NftMetadataUnavailable extends Error {
  constructor() { super("This NFT's on-chain artwork is temporarily unavailable. Please try again."); }
}
const fail = (): never => { throw new NftMetadataUnavailable(); };

function decodeDataUri(value: unknown, prefix: string, maxBytes: number): string {
  if (typeof value !== "string" || !value.startsWith(prefix) || value.length > prefix.length + Math.ceil(maxBytes / 3) * 4) return fail();
  const encoded = value.slice(prefix.length);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded) || !encoded.length) return fail();
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length > maxBytes || bytes.toString("base64") !== encoded) return fail();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return fail(); }
}

/** Only the bounded, absolute line and curve commands used by the on-chain artwork. */
function validateArtworkPath(value: string): void {
  if (!value.length || value.length > 8192) fail();
  // SVG allows M320 and M 320. Coordinates themselves remain space-separated integers.
  const commands = value.replace(/([MLCZ])(?=-?\d)/g, "$1 ");
  if (!/^(?:[MLCZ]|-?\d+)(?: +(?:[MLCZ]|-?\d+))*$/.test(commands)) fail();
  const tokens = commands.split(/ +/);
  if (tokens[0] !== "M") fail();
  for (let i = 0; i < tokens.length;) {
    const command = tokens[i++];
    const count = command === "M" || command === "L" ? 2 : command === "C" ? 6 : command === "Z" ? 0 : -1;
    if (count < 0 || i + count > tokens.length) fail();
    for (let end = i + count; i < end; ++i) {
      if (!/^-?\d+$/.test(tokens[i]) || !Number.isSafeInteger(Number(tokens[i])) || Math.abs(Number(tokens[i])) > 65536) fail();
    }
  }
}

/** Accept the immutable renderers' passive SVG vocabulary. Unknown markup fails closed. */
export function validateOnChainSvg(svg: string): void {
  if (svg.length > 65536 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(svg)) fail();
  const stack: string[] = [];
  const elements = new Set(["svg", "g", "rect", "text", "path"]);
  const numeric = new Set(["width", "height", "x", "y", "rx", "font-size"]);
  let offset = 0, roots = 0;
  const tags = /<([^<>]*)>/g;
  for (let match; (match = tags.exec(svg));) {
    const text = svg.slice(offset, match.index);
    if (/[<>]/.test(text) || (text.trim() && stack.at(-1) !== "text")) fail();
    // No declared entities or XML directives; text may use only standard XML escapes.
    if (/&(?!(?:amp|lt|gt|quot|apos);)/.test(text)) fail();
    offset = tags.lastIndex;
    const tag = match[1];
    if (tag.startsWith("/")) {
      if (!/^\/[a-z]+\s*$/.test(tag) || stack.pop() !== tag.slice(1).trim()) fail();
      continue;
    }
    const parsed = /^([a-z]+)([\s\S]*?)(\/?)$/.exec(tag);
    if (!parsed || !elements.has(parsed[1])) fail();
    const [, name, attributes, closing] = parsed!;
    if (!stack.length) { if (name !== "svg" || ++roots !== 1) fail(); }
    else if (name === "svg" || stack.at(-1) === "text" || stack.at(-1) === "rect" || stack.at(-1) === "path") fail();
    const attrs = new Set<string>();
    let cursor = 0;
    const pattern = /\s+([a-zA-Z-]+)="([^"<>]*)"/g;
    for (let attr; (attr = pattern.exec(attributes));) {
      if (attr.index !== cursor || attrs.has(attr[1]) || /[&\\]/.test(attr[2])) fail();
      cursor = pattern.lastIndex; attrs.add(attr[1]);
      const [key, value] = [attr[1], attr[2]];
      if (numeric.has(key)) { if (!/^-?\d+(?:\.\d+)?$/.test(value)) fail(); }
      else if (key === "viewBox") { if (name !== "svg" || !/^-?\d+(?:\.\d+)?(?:\s+-?\d+(?:\.\d+)?){3}$/.test(value)) fail(); }
      else if (key === "fill") { if (!/^(?:#[0-9a-fA-F]{3,8}|none)$/.test(value)) fail(); }
      else if (key === "stroke") { if (!/^#[0-9a-fA-F]{3,8}$/.test(value)) fail(); }
      else if (key === "stroke-width") { if (!/^\d+(?:\.\d+)?$/.test(value) || Number(value) > 64) fail(); }
      else if (key === "opacity") { if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(value)) fail(); }
      else if (key === "d") { if (name !== "path") fail(); validateArtworkPath(value); }
      else if (key === "text-anchor") { if (!/^(?:start|middle|end)$/.test(value)) fail(); }
      else if (key === "font-weight") { if (!/^(?:400|500|600)$/.test(value)) fail(); }
      else if (key === "letter-spacing") { if (!/^-?\d+(?:\.\d+)?$/.test(value) || Math.abs(Number(value)) > 64) fail(); }
      else if (key === "font-family") { if (!/^[a-zA-Z -]{1,64}$/.test(value)) fail(); }
      else if (key === "xmlns") { if (name !== "svg" || value !== "http://www.w3.org/2000/svg") fail(); }
      else fail();
    }
    if (attributes.slice(cursor).trim() || (name === "svg" && !attrs.has("xmlns")) || (name === "path" && !attrs.has("d"))) fail();
    if (!closing) stack.push(name);
  }
  if (roots !== 1 || stack.length || svg.slice(offset).trim()) fail();
}

export function decodeOnChainMetadata(tokenUri: unknown, contractVersion: "affiliate-v5" | "affiliate-v6" | "affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10" = "affiliate-v5"): DecodedMetadata {
  try {
    if (contractVersion !== "affiliate-v5" && contractVersion !== "affiliate-v6" && contractVersion !== "affiliate-v7" && (contractVersion !== "affiliate-v8" && contractVersion !== "affiliate-v9" && contractVersion !== "affiliate-v10")) return fail();
    const data: unknown = JSON.parse(decodeDataUri(tokenUri, "data:application/json;base64,", 131072));
    if (!data || typeof data !== "object" || Array.isArray(data)) return fail();
    const item = data as Record<string, unknown>;
    if (typeof item.name !== "string" || !item.name.length || item.name.length > 256
      || typeof item.description !== "string" || item.description.length > 4096
      || item.contract_version !== contractVersion || item.algorithm_version !== (contractVersion === "affiliate-v10" ? "unique-rank-v6" : (contractVersion === "affiliate-v8" || contractVersion === "affiliate-v9") ? "unique-rank-v5" : contractVersion === "affiliate-v7" ? "unique-rank-v4" : contractVersion === "affiliate-v6" ? "unique-rank-v3" : "unique-rank-v2")
      || item.randomness_provider !== "chainlink-vrf-v2.5" || !Array.isArray(item.attributes) || item.attributes.length > 32) return fail();
    if (contractVersion === "affiliate-v10" && (item.artwork_version !== "tincta-v3" || item.combination_generation !== "solidity-permutation-v1"
      || item.season_id === undefined || ["score", "status", "award_rank", "prize_amount_wei"].some(key => key in item))) return fail();
    validateOnChainSvg(decodeDataUri(item.image, "data:image/svg+xml;base64,", 65536));
    const names = new Set<string>();
    const attributes: NftAttribute[] = item.attributes.map(value => {
      if (!value || typeof value !== "object" || Array.isArray(value)
        || typeof value.trait_type !== "string" || !value.trait_type.length || value.trait_type.length > 64
        || names.has(value.trait_type)
        || !(typeof value.value === "string" && value.value.length <= 256 || typeof value.value === "number" && Number.isSafeInteger(value.value))) return fail();
      names.add(value.trait_type);
      return { trait_type: value.trait_type, value: value.value };
    });
    let appearance: Partial<SeasonAppearance> = {};
    if (item.season_id !== undefined) {
      if ((contractVersion !== "affiliate-v6" && contractVersion !== "affiliate-v7" && (contractVersion !== "affiliate-v8" && contractVersion !== "affiliate-v9" && contractVersion !== "affiliate-v10")) || typeof item.collection_name !== "string" || !item.collection_name.length
        || new TextEncoder().encode(item.collection_name).length > 80) return fail();
      appearance = normalizeSeasonAppearance({ seasonId: item.season_id, seasonName: item.season_name, collectionColor: item.collection_color, textColor: item.text_color });
      if (item.background_color !== appearance.collectionColor?.slice(1)) return fail();
    }
    return { name: item.name, description: item.description, image: item.image as string, attributes, ...appearance };
  } catch { return fail(); }
}

/** Permanent identities are available from mint; final scores are independently verified chain state. */
export function verifyMetadataNumbers(metadata: DecodedMetadata, revealed: boolean, combination: readonly unknown[] | null, maxSupply: number, options: { contractVersion: "affiliate-v5" | "affiliate-v6" | "affiliate-v7" | "affiliate-v8" | "affiliate-v9" | "affiliate-v10"; decodedScore?: bigint } = { contractVersion: "affiliate-v5" }): Pick<NftMetadata, "numbers" | "score"> {
  const attrs = new Map(metadata.attributes.map(value => [value.trait_type, value.value]));
  if (!revealed && options.contractVersion !== "affiliate-v10") {
    if (combination !== null || attrs.size !== 1 || !["Sealed", "Refundable"].includes(String(attrs.get("Status")))) return fail();
    return { numbers: null, score: null };
  }
  if (!combination || combination.length !== 3 || !Array.isArray(combination[0]) || combination[0].length !== 4) return fail();
  const raw = combination[0] as unknown[];
  if (raw.some(value => typeof value !== "bigint" || value < 1n || value > 16n)
    || typeof combination[1] !== "bigint" || typeof combination[2] !== "bigint") return fail();
  const numbers = raw.map(Number) as [number, number, number, number];
  const code = (numbers[0] - 1) * 4096 + (numbers[1] - 1) * 256 + (numbers[2] - 1) * 16 + numbers[3] - 1;
  if (options.contractVersion === "affiliate-v10") {
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
