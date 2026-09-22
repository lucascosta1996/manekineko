import { expect } from "chai";
import { network } from "hardhat";
import { encodeScrambledRank, decodeScrambledCombination } from "@manekineko/contract-abi/scrambled-rank";

const { ethers, networkHelpers } = await network.create();
const { loadFixture } = networkHelpers;
const KEY = ethers.id("MANEKINEKO_TEST_COMBINATION_V3");
const coder = ethers.AbiCoder.defaultAbiCoder();
function roundByte(key: string, index: number, right: number): number {
  return Number(BigInt(ethers.keccak256(coder.encode(["bytes32", "uint256", "uint256"], [key, index, right]))) & 255n);
}
// Independently reconstruct the inverse from its Feistel equations, not the Solidity helper.
function decode(code: number, key: string): number {
  let high = code >>> 8, low = code & 255;
  for (let i = 3; i >= 0; i--) [high, low] = [low ^ roundByte(key, i, high), high];
  return high * 256 + low;
}
function copyNumbers(numbers: readonly bigint[]): [bigint,bigint,bigint,bigint] {
  return [numbers[0],numbers[1],numbers[2],numbers[3]];
}
async function fixture() { return ethers.deployContract("ScrambledRankHarness"); }

describe("V3 reversible rank display", function () {
  this.timeout(300_000);
  it("matches fixed independently computed Keccak/ABI vectors and invertible packing", async () => {
    const harness = await loadFixture(fixture);
    const vectors = [[0,48672],[1,21666],[19,40582],[999,3952],[1999,45071],[65535,12388]];
    for (const [input, expected] of vectors) {
      expect(await harness.encode(input, KEY)).to.equal(BigInt(expected));
      expect(await harness.decode(expected, KEY)).to.equal(BigInt(input));
      expect(decode(expected, KEY)).to.equal(input);
      const numbers = await harness.numbers(expected);
      expect(numbers.every((value) => value >= 1n && value <= 16n)).to.equal(true);
      expect(await harness.pack(copyNumbers(numbers))).to.equal(BigInt(expected));
      const display = encodeScrambledRank(input + 1, KEY);
      expect(display).to.deep.equal({ numbers: numbers.map(Number), combinationCode:String(expected), score:String(input + 1) });
      expect(decodeScrambledCombination(display.numbers,KEY)).to.deep.equal({ combinationCode:String(expected), score:String(input + 1) });
    }
    expect(await harness.numbers(48672)).to.deep.equal([12n,15n,3n,1n]);
  });
  it("is bijective and exactly invertible across all 65,536 possible codes in bounded calls", async () => {
    const harness = await loadFixture(fixture);
    const seen = new Uint8Array(65536);
    for (let first = 0; first < 65536; first += 256) {
      const [encoded, decoded] = await harness.permutationBatch(KEY, first, 256);
      for (let i = 0; i < 256; i++) {
        const value = Number(encoded[i]);
        expect(value).to.be.within(0, 65535);
        expect(seen[value], `duplicate code ${value}`).to.equal(0);
        seen[value] = 1;
        expect(decoded[i]).to.equal(BigInt(first + i));
      }
    }
    expect(seen.every(value => value === 1)).to.equal(true);
    expect(await harness.permutationBatch.estimateGas(KEY, 0, 256)).to.be.lessThan(4_000_000n);
  });
  for (const supply of [20, 1000, 2000]) it(`preserves all ${supply} ranks and one winner with varied unique combinations`, async () => {
    const harness = await loadFixture(fixture);
    for (const offset of [0, 1, supply - 1]) {
      const codes = new Set<string>(), ranks = new Set<string>(), winners: number[] = [];
      const firstDigits = new Set<string>();
      for (let first = 1; first <= supply; first += 100) {
        const count = Math.min(100, supply - first + 1);
        const [batchRanks, batchCodes, numbers, scores] = await harness.rankBatch(KEY, supply, offset, first, count);
        for (let i = 0; i < count; i++) {
          const id = first + i, expectedRank = 1 + (id - 1 + offset) % supply;
          expect(batchRanks[i]).to.equal(BigInt(expectedRank));
          expect(scores[i]).to.equal(BigInt(expectedRank));
          expect(decode(Number(batchCodes[i]), KEY) + 1).to.equal(expectedRank);
          const display = encodeScrambledRank(expectedRank,KEY);
          expect(display).to.deep.equal({ numbers:numbers[i].map(Number), combinationCode:String(batchCodes[i]), score:String(expectedRank) });
          expect(decodeScrambledCombination(display.numbers,KEY)).to.deep.equal({ combinationCode:String(batchCodes[i]), score:String(expectedRank) });
          codes.add(batchCodes[i].toString()); ranks.add(scores[i].toString()); firstDigits.add(numbers[i][0].toString());
          if (scores[i] === BigInt(supply)) winners.push(id);
        }
      }
      expect(codes.size).to.equal(supply); expect(ranks.size).to.equal(supply);
      expect(winners).to.deep.equal([supply - offset]);
      // A deterministic fixture verifies that the former leading-ones representation is gone;
      // this is not a statistical claim that every random key must give every digit.
      expect(firstDigits.size).to.be.greaterThan(1);
    }
  });
  it("works for zero/all-ones keys and single/max supply without selecting or rerolling a key", async () => {
    const harness = await loadFixture(fixture);
    for (const key of [ethers.ZeroHash, ethers.toBeHex((1n << 256n) - 1n, 32)]) {
      for (const value of [0, 1, 255, 256, 65535]) {
        const encoded = await harness.encode(value, key);
        expect(await harness.decode(encoded, key)).to.equal(BigInt(value));
        const numbers = copyNumbers(await harness.numbers(encoded));
        expect(await harness.score(numbers, key, 65536)).to.equal(BigInt(value + 1));
      }
      const numbers = copyNumbers(await harness.numbers(await harness.encode(0, key)));
      expect(await harness.score(numbers, key, 1)).to.equal(1n);
    }
  });
  it("rejects out-of-domain codes, invalid displayed digits, and unmintable ranks", async () => {
    const harness = await loadFixture(fixture);
    for (const value of [65536n, (1n << 256n) - 1n]) {
      for (const method of ["encode", "decode"] as const) await expect(harness[method](value, KEY)).to.be.revertedWithCustomError(harness, "InvalidCode");
      await expect(harness.numbers(value)).to.be.revertedWithCustomError(harness, "InvalidCode");
    }
    for (const invalid of [[0,1,1,1], [1,17,1,1], [1,1,256,1], [1,1,1,0]] as [number,number,number,number][]) {
      await expect(harness.pack(invalid)).to.be.revertedWithCustomError(harness, "InvalidNumber");
    }
    const unused = copyNumbers(await harness.numbers(await harness.encode(20, KEY)));
    await expect(harness.score(unused, KEY, 20)).to.be.revertedWithCustomError(harness, "InvalidRank").withArgs(21,20);
    for (const supply of [0,65537]) await expect(harness.score([1,1,1,1], KEY, supply)).to.be.revertedWithCustomError(harness, "InvalidSupply");
  });
});
