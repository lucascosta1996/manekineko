import { AbiCoder, getAddress, keccak256, toUtf8Bytes, ZeroAddress } from "ethers";
import { decodeScrambledCombination, encodeScrambledRank } from "./scrambled-rank.ts";

const DOMAIN = keccak256(toUtf8Bytes("MANEKINEKO_PERMANENT_COMBINATION_V1"));
const coder = AbiCoder.defaultAbiCoder();
export type PermanentCombinationDeployment = { chainId: bigint | number | string; collectionAddress: string; roundId: bigint | number | string; seasonId: string; maxSupply: bigint | number | string };

/** Mirrors the V10 constructor. Deployment identity is public; this key is not draw entropy. */
export function derivePermanentCombinationKey(input: PermanentCombinationDeployment): string {
  if ([input.chainId, input.roundId, input.maxSupply].some(value => typeof value === "number" && !Number.isSafeInteger(value))) throw new Error("Deployment integers must be exact.");
  const chainId = BigInt(input.chainId), roundId = BigInt(input.roundId), maxSupply = BigInt(input.maxSupply);
  const collectionAddress = getAddress(input.collectionAddress);
  if (chainId < 1n || roundId < 1n || maxSupply < 1n || maxSupply > 65536n || collectionAddress === ZeroAddress || (!/^0x[0-9a-f]{64}$/i.test(input.seasonId) || /^0x0{64}$/.test(input.seasonId))) throw new Error("Invalid permanent combination deployment.");
  return keccak256(coder.encode(["bytes32", "uint256", "address", "uint256", "bytes32", "uint256"], [DOMAIN, chainId, collectionAddress, roundId, input.seasonId, maxSupply]));
}

/** Identity only: the legacy permutation's decoded rank now represents token ID, never score. */
export function encodePermanentCombination(tokenId: number | bigint, key: string): { tokenId: string; numbers: [number, number, number, number]; combinationCode: string } {
  const { numbers, combinationCode } = encodeScrambledRank(tokenId, key);
  return { tokenId: String(tokenId), numbers, combinationCode };
}

/** Decodes identity; callers must separately verify supply, minted existence and final score on-chain. */
export function decodePermanentCombination(numbers: readonly number[], key: string): { tokenId: string; combinationCode: string } {
  const { score: tokenId, combinationCode } = decodeScrambledCombination(numbers, key);
  return { tokenId, combinationCode };
}
