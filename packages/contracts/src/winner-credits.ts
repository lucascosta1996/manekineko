import { AbiCoder, concat, getAddress, id, keccak256, ZeroAddress, ZeroHash } from "ethers";

export const LEGACY_CREDIT_DOMAIN = id("MANEKINEKO_WINNER_CREDIT_LEGACY_V1");
export interface LegacyWin {
  sourceRound: string; holder: string; tokenId: string; paidAt: string; transactionHash: string;
}
export interface LegacyCreditChain {
  chainId: number; root: string; entries: Array<LegacyWin & { proof: string[] }>;
}
export interface LegacyCreditManifest { schemaVersion: 1; chains: LegacyCreditChain[] }
const coder = AbiCoder.defaultAbiCoder();
const uint = (value: unknown) => typeof value === "string" && /^[1-9][0-9]*$/.test(value) && BigInt(value) < 1n << 256n;
const hash = (value: unknown): value is string => typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value);

/** Double-hashed ABI leaf, separated by network and legacy-credit domain. No wallet ownership inference. */
export function legacyCreditLeaf(chainId: number, win: LegacyWin): string {
  if (![1, 11155111, 31337].includes(chainId) || !win || !uint(win.tokenId) || !uint(win.paidAt)
    || !hash(win.transactionHash) || win.transactionHash.toLowerCase() === ZeroHash
    || getAddress(win.sourceRound) === ZeroAddress || getAddress(win.holder) === ZeroAddress) throw new Error("Invalid legacy winner evidence.");
  return keccak256(keccak256(coder.encode(
    ["bytes32", "uint256", "address", "address", "uint256", "uint256", "bytes32"],
    [LEGACY_CREDIT_DOMAIN, chainId, win.sourceRound, win.holder, win.tokenId, win.paidAt, win.transactionHash],
  )));
}
const parent = (left: string, right: string) => keccak256(concat([left, right].sort()));

/** Deterministic sorted-pair Merkle tree; odd nodes are promoted, not duplicated. */
export function buildLegacyCreditChain(chainId: number, wins: LegacyWin[]): LegacyCreditChain {
  if (!Array.isArray(wins) || wins.length > 10_000) throw new Error("Invalid legacy winner list.");
  const entries = wins.map(win => ({ ...win, sourceRound: getAddress(win.sourceRound).toLowerCase(), holder: getAddress(win.holder).toLowerCase(), transactionHash: win.transactionHash.toLowerCase() }))
    .sort((a, b) => a.sourceRound.localeCompare(b.sourceRound));
  if (new Set(entries.map(entry => entry.sourceRound)).size !== entries.length) throw new Error("A collection can award only one credit.");
  if (![1,11155111,31337].includes(chainId)) throw new Error("Invalid chain.");
  const layers: string[][] = [entries.map(entry => legacyCreditLeaf(chainId, entry))];
  while (layers.at(-1)!.length > 1) {
    const previous = layers.at(-1)!;
    layers.push(Array.from({length: Math.ceil(previous.length / 2)}, (_, i) => previous[2*i+1] ? parent(previous[2*i], previous[2*i+1]) : previous[2*i]));
  }
  return { chainId, root: layers.at(-1)![0] ?? ZeroHash, entries: entries.map((entry, original) => {
    let index = original; const proof: string[] = [];
    for (const layer of layers.slice(0, -1)) { if (layer[index ^ 1]) proof.push(layer[index ^ 1]); index = Math.floor(index / 2); }
    return { ...entry, proof };
  }) };
}
export function verifyLegacyCredit(chainId: number, win: LegacyWin, proof: readonly string[], root: string): boolean {
  try {
    if (!hash(root) || root.toLowerCase() === ZeroHash || !Array.isArray(proof) || proof.length > 32 || proof.some(item => !hash(item))) return false;
    return proof.reduce((leaf, sibling) => parent(leaf, sibling.toLowerCase()), legacyCreditLeaf(chainId, win)) === root.toLowerCase();
  } catch { return false; }
}
export function validateLegacyCreditManifest(input: unknown): LegacyCreditManifest {
  const manifest = input as LegacyCreditManifest;
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.chains) || manifest.chains.length > 3
    || new Set(manifest.chains.map(chain => chain.chainId)).size !== manifest.chains.length) throw new Error("Invalid legacy credit manifest.");
  for (const chain of manifest.chains) {
    const expected = buildLegacyCreditChain(chain.chainId, chain.entries);
    if (expected.root !== chain.root.toLowerCase() || chain.entries.some(entry => !verifyLegacyCredit(chain.chainId, entry, entry.proof, chain.root))) throw new Error("Legacy credit proof/root mismatch.");
  }
  return manifest;
}
