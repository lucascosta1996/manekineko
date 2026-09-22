import { AbiCoder, keccak256 } from "ethers";

const coder = AbiCoder.defaultAbiCoder();
function validateKey(key: string): void {
  if (typeof key !== "string" || !/^0x[0-9a-f]{64}$/i.test(key)) throw new Error("Invalid combination key.");
}
function roundFunction(key: string, round: number, right: number): number {
  return Number(BigInt(keccak256(coder.encode(["bytes32", "uint256", "uint256"], [key, round, right]))) & 255n);
}

/** Display encoding only. Scores and winning probabilities remain those of UniqueRank. */
export function encodeScrambledRank(rank: number | bigint, key: string): {
  numbers: [number, number, number, number]; combinationCode: string; score: string;
} {
  validateKey(key);
  if ((typeof rank !== "number" && typeof rank !== "bigint") || (typeof rank === "number" && !Number.isSafeInteger(rank))
    || rank < 1 || rank > 65536) throw new Error("Rank must be from 1 to 65536.");
  const value = Number(rank) - 1;
  let left = value >>> 8, right = value & 255;
  for (let round = 0; round < 4; round++) [left, right] = [right, left ^ roundFunction(key, round, right)];
  const code = (left << 8) | right;
  return { numbers: [(code >>> 12) + 1, ((code >>> 8) & 15) + 1, ((code >>> 4) & 15) + 1, (code & 15) + 1],
    combinationCode: String(code), score: String(rank) };
}

/** Exact inverse of the Solidity four-round Feistel permutation; not a source of entropy. */
export function decodeScrambledCombination(numbers: readonly number[], key: string): { combinationCode: string; score: string } {
  validateKey(key);
  if (numbers.length !== 4 || numbers.some(n => !Number.isSafeInteger(n) || n < 1 || n > 16)) throw new Error("Invalid combination.");
  const code = numbers.reduce((packed, n) => (packed << 4) | (n - 1), 0);
  let left = code >>> 8, right = code & 255;
  for (let round = 3; round >= 0; round--) [left, right] = [right ^ roundFunction(key, round, left), left];
  return { combinationCode: String(code), score: String(((left << 8) | right) + 1) };
}
