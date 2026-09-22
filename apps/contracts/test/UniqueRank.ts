import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();
const { loadFixture } = networkHelpers;
const WORD_SPACE = 1n << 256n;
const MAX_WORD = WORD_SPACE - 1n;
const BATCH_SIZE = 200;
const candidateWord = (value: bigint) => ethers.toBeHex(value, 32);

async function fixture() {
  return ethers.deployContract("UniqueRankHarness");
}

describe("UniqueRank isolated candidate", function () {
  this.timeout(120_000);

  // These tests establish mapping and sampler arithmetic. They make no claim
  // that any production entropy source is unpredictable, unbiased, or authenticated.
  for (const supply of [1_000, 2_000]) {
    const count = BigInt(supply);

    it(`gives all ${supply} tickets unique ranks and number combinations for boundary and sampled offsets`, async function () {
      const harness = await loadFixture(fixture);
      const [accepted, sampledOffset] = await harness.tryOffset(candidateWord(MAX_WORD - 123n), count);
      expect(accepted).to.equal(true);
      for (const offset of [0n, 1n, count - 1n, sampledOffset]) {
        const ranks: bigint[] = [];
        const combinations: string[] = [];
        const winningIds: bigint[] = [];
        for (let first = 1; first <= supply; first += BATCH_SIZE) {
          const size = Math.min(BATCH_SIZE, supply - first + 1);
          const [batchRanks, batchNumbers, batchScores] = await harness.rankBatch(count, offset, first, size);
          for (let index = 0; index < size; index++) {
            const tokenId = BigInt(first + index);
            const rank = batchRanks[index];
            const numbers = batchNumbers[index];
            expect(rank >= 1n && rank <= count, `token ${tokenId} rank range`).to.equal(true);
            for (const number of numbers) {
              expect(number >= 1n && number <= 16n, `token ${tokenId} number range`).to.equal(true);
            }
            // Decode the displayed representation independently of the rotation.
            const decodedRank = 1n + (numbers[0] - 1n) * 4096n + (numbers[1] - 1n) * 256n
              + (numbers[2] - 1n) * 16n + (numbers[3] - 1n);
            expect(decodedRank).to.equal(rank);
            expect(batchScores[index]).to.equal(rank);
            ranks.push(rank);
            combinations.push(numbers.join(","));
            if (rank === count) winningIds.push(tokenId);
          }
        }
        expect(new Set(ranks.map(String)).size).to.equal(supply);
        expect(new Set(combinations).size).to.equal(supply);
        const orderedRanks = [...ranks].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
        expect(orderedRanks).to.deep.equal(Array.from({ length: supply }, (_, index) => BigInt(index + 1)));
        expect(winningIds).to.deep.equal([await harness.winningTokenId(count, offset)]);
        expect(winningIds[0]).to.equal(count - offset);
      }
    });

    it(`makes every one of ${supply} tickets the winner exactly once across all offsets`, async function () {
      const harness = await loadFixture(fixture);
      const winners: bigint[] = [];
      for (let firstOffset = 0; firstOffset < supply; firstOffset += BATCH_SIZE) {
        const size = Math.min(BATCH_SIZE, supply - firstOffset);
        const [tokenIds, ranks] = await harness.winnerBatch(count, firstOffset, size);
        expect(ranks.every((rank) => rank === count)).to.equal(true);
        winners.push(...tokenIds);
      }
      expect(winners).to.deep.equal(Array.from({ length: supply }, (_, index) => count - BigInt(index)));
      expect(new Set(winners.map(String)).size).to.equal(supply);
    });

    it(`rejects the incomplete modulo interval for supply ${supply}`, async function () {
      const harness = await loadFixture(fixture);
      const threshold = WORD_SPACE % count;
      expect(threshold > 0n).to.equal(true);
      expect((WORD_SPACE - threshold) % count).to.equal(0n);
      expect(await harness.tryOffset(candidateWord(0n), count)).to.deep.equal([false, 0n]);
      expect(await harness.tryOffset(candidateWord(threshold - 1n), count)).to.deep.equal([false, 0n]);
      expect(await harness.tryOffset(candidateWord(threshold), count)).to.deep.equal([true, threshold % count]);
      expect(await harness.tryOffset(candidateWord(MAX_WORD), count)).to.deep.equal([true, MAX_WORD % count]);
    });
  }

  it("accepts zero and maximum words for every supported power-of-two supply", async function () {
    const harness = await loadFixture(fixture);
    for (let supply = 1n; supply <= 65_536n; supply *= 2n) {
      expect(WORD_SPACE % supply).to.equal(0n);
      expect(await harness.tryOffset(candidateWord(0n), supply)).to.deep.equal([true, 0n]);
      expect(await harness.tryOffset(candidateWord(MAX_WORD), supply)).to.deep.equal([true, supply - 1n]);
    }
  });

  it("covers the single-ticket and maximum-supply boundaries", async function () {
    const harness = await loadFixture(fixture);
    expect(await harness.rank(1, 1, 0)).to.equal(1n);
    expect(await harness.winningTokenId(1, 0)).to.equal(1n);
    expect(await harness.combination(1, 1, 0)).to.deep.equal([1n, 1n, 1n, 1n]);
    expect(await harness.score([1, 1, 1, 1])).to.equal(1n);
    expect(await harness.rank(65_536, 65_536, 0)).to.equal(65_536n);
    expect(await harness.rank(1, 65_536, 65_535)).to.equal(65_536n);
    expect(await harness.rank(65_536, 65_536, 1)).to.equal(1n);
    expect(await harness.winningTokenId(65_536, 65_535)).to.equal(1n);
    expect(await harness.combination(1, 65_536, 65_535)).to.deep.equal([16n, 16n, 16n, 16n]);
    expect(await harness.score([16, 16, 16, 16])).to.equal(65_536n);
  });

  it("validates supply before modulo, subtraction, or other dependent arithmetic", async function () {
    const harness = await loadFixture(fixture);
    for (const supply of [0n, 65_537n, MAX_WORD]) {
      for (const call of [
        () => harness.tryOffset(candidateWord(MAX_WORD), supply),
        () => harness.rank(MAX_WORD, supply, MAX_WORD),
        () => harness.winningTokenId(supply, MAX_WORD),
        () => harness.combination(MAX_WORD, supply, MAX_WORD),
      ]) {
        await expect(call()).to.be.revertedWithCustomError(harness, "InvalidSupply").withArgs(supply);
      }
    }
  });

  it("rejects token IDs and offsets outside their collection before arithmetic", async function () {
    const harness = await loadFixture(fixture);
    for (const supply of [1n, 1_000n, 2_000n, 65_536n]) {
      for (const tokenId of [0n, supply + 1n, MAX_WORD]) {
        await expect(harness.rank(tokenId, supply, 0))
          .to.be.revertedWithCustomError(harness, "InvalidTokenId").withArgs(tokenId, supply);
        await expect(harness.combination(tokenId, supply, 0))
          .to.be.revertedWithCustomError(harness, "InvalidTokenId").withArgs(tokenId, supply);
      }
      for (const offset of [supply, MAX_WORD]) {
        await expect(harness.rank(1, supply, offset))
          .to.be.revertedWithCustomError(harness, "InvalidOffset").withArgs(offset, supply);
        await expect(harness.winningTokenId(supply, offset))
          .to.be.revertedWithCustomError(harness, "InvalidOffset").withArgs(offset, supply);
        await expect(harness.combination(1, supply, offset))
          .to.be.revertedWithCustomError(harness, "InvalidOffset").withArgs(offset, supply);
      }
    }
  });

  it("rejects invalid displayed numbers before score subtraction", async function () {
    const harness = await loadFixture(fixture);
    for (let index = 0; index < 4; index++) {
      for (const invalid of [0, 17, 255]) {
        const numbers: [number, number, number, number] = [1, 1, 1, 1];
        numbers[index] = invalid;
        await expect(harness.score(numbers))
          .to.be.revertedWithCustomError(harness, "InvalidNumber").withArgs(index, invalid);
      }
    }
  });
});
