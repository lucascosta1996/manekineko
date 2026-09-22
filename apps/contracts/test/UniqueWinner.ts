import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();
const { mineUpTo, time } = networkHelpers;
const PRICE = 100n;
const SCORE_BASE = 1n << 32n;
const READ_CONCURRENCY = 32;

interface TicketResult {
  id: bigint;
  tuple: string;
  code: bigint;
  score: bigint;
}

describe("complete collections have exactly one winning NFT", function () {
  this.timeout(120_000);

  // Exhausting a collection checks uniqueness and settlement behavior. It does
  // not establish that the entropy source or permutation is unbiased.
  for (const supply of [1, 1_000, 2_000]) {
    it(`resolves all ${supply.toLocaleString("en-US")} tickets and pays only the current winning holder once`, async function () {
      const [owner, minterA, minterB, operator, finalHolder] = await ethers.getSigners();
      const roundId = BigInt(supply);
      const round = await ethers.deployContract("ManekinekoRound", [{
        name: `Unique winner ${supply}`,
        symbol: "NEKO",
        roundId,
        maxSupply: BigInt(supply),
        mintPrice: PRICE,
        mintDeadline: BigInt(await time.latest()) + 86_400n,
        revealDelayBlocks: 2n,
        initialOwner: owner.address,
      }]);

      const minters = [minterA, minterB];
      for (let minted = 0, batch = 0; minted < supply; batch++) {
        const quantity = Math.min(20, supply - minted);
        const minter = minters[batch % minters.length];
        await (await round.connect(minter).mint(minter.address, quantity, {
          value: PRICE * BigInt(quantity),
        })).wait();
        minted += quantity;
      }
      expect(await round.totalMinted()).to.equal(BigInt(supply));
      expect(await round.totalMintRevenue()).to.equal(PRICE * BigInt(supply));
      expect(await round.soldOut()).to.equal(true);
      if (supply > 1) {
        expect(await round.balanceOf(minterA.address)).to.be.greaterThan(0n);
        expect(await round.balanceOf(minterB.address)).to.be.greaterThan(0n);
      }

      const sourceBlock = await round.revealBlock();
      await mineUpTo(sourceBlock);
      const block = await ethers.provider.getBlock(Number(sourceBlock));
      const { chainId } = await ethers.provider.getNetwork();
      const expectedSeed = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "address", "uint256", "uint256"],
        [block!.hash, await round.getAddress(), chainId, roundId],
      ));
      await expect(round.connect(operator).captureReveal())
        .to.emit(round, "Revealed").withArgs(expectedSeed, sourceBlock);
      expect(await round.revealSeed()).to.equal(expectedSeed);

      const tickets: TicketResult[] = [];
      for (let first = 1; first <= supply; first += READ_CONCURRENCY) {
        const ids = Array.from(
          { length: Math.min(READ_CONCURRENCY, supply - first + 1) },
          (_, offset) => BigInt(first + offset),
        );
        const batch = await Promise.all(ids.map(async (id): Promise<TicketResult> => {
          const [numbers, code, score] = await round.combination(id);
          for (const number of numbers) {
            expect(number >= 1n && number <= 256n, `token ${id} component range`).to.equal(true);
          }
          // Decode the published numbers without duplicating the Feistel code.
          const reconstructedCode = numbers.reduce(
            (accumulator, number) => accumulator * 256n + number - 1n,
            0n,
          );
          const arithmeticResult = numbers[0] * numbers[1] + numbers[2] * numbers[3];
          expect(code, `token ${id} code`).to.equal(reconstructedCode);
          expect(score, `token ${id} full score`).to.equal(arithmeticResult * SCORE_BASE + reconstructedCode);
          return { id, tuple: numbers.join(","), code, score };
        }));
        tickets.push(...batch);
      }

      expect(new Set(tickets.map(({ tuple }) => tuple)).size).to.equal(supply);
      expect(new Set(tickets.map(({ code }) => code.toString())).size).to.equal(supply);
      expect(new Set(tickets.map(({ score }) => score.toString())).size).to.equal(supply);
      const independentWinner = tickets.reduce((best, ticket) => ticket.score > best.score ? ticket : best);
      expect(tickets.filter(({ score }) => score === independentWinner.score)).to.have.lengthOf(1);

      await expect(round.distributePrize()).to.be.revertedWithCustomError(round, "InvalidPhase");
      const settlementSizes = supply === 2_000 ? [37, 200, 1, 83] : [1, 83, 200, 37];
      const settlers = [operator, minterB, minterA];
      let settled = 0;
      for (let batch = 0; settled < supply; batch++) {
        const requested = settlementSizes[batch % settlementSizes.length];
        settled = Math.min(settled + requested, supply);
        await (await round.connect(settlers[batch % settlers.length]).settle(requested)).wait();
        const prefixWinner = tickets.slice(0, settled)
          .reduce((best, ticket) => ticket.score > best.score ? ticket : best);
        expect(await round.settledCount()).to.equal(BigInt(settled));
        expect(await round.winningTokenId()).to.equal(prefixWinner.id);
        expect(await round.highestScore()).to.equal(prefixWinner.score);
        expect(await round.prizePaid()).to.equal(false);
        if (settled < supply) {
          await expect(round.distributePrize()).to.be.revertedWithCustomError(round, "InvalidPhase");
        }
      }
      expect(await round.winningTokenId()).to.equal(independentWinner.id);
      expect(await round.highestScore()).to.equal(independentWinner.score);
      await expect(round.connect(operator).settle(1)).to.be.revertedWithCustomError(round, "InvalidPhase");

      const previousHolder = await round.ownerOf(independentWinner.id);
      const winningSigner = minters.find(({ address }) => address === previousHolder);
      expect(winningSigner, "winner must be one of the original holders").not.to.equal(undefined);
      await (await round.connect(winningSigner!).transferFrom(
        previousHolder, finalHolder.address, independentWinner.id,
      )).wait();
      expect(await round.ownerOf(independentWinner.id)).to.equal(finalHolder.address);

      const prize = PRICE * BigInt(supply) / 2n;
      await expect(round.connect(operator).distributePrize())
        .to.be.revertedWithCustomError(round, "OwnableUnauthorizedAccount").withArgs(operator.address);
      await expect(round.distributePrize()).to.changeEtherBalances(
        ethers, [round, finalHolder, winningSigner!], [-prize, prize, 0n],
      );
      expect(await round.prizeRecipient()).to.equal(finalHolder.address);
      expect(await round.prizePaidAmount()).to.equal(prize);
      expect(await round.prizePaid()).to.equal(true);
      expect(await round.withdrawableBalance()).to.equal(prize);
      expect(await round.readyForNextRound()).to.equal(true);
      await expect(round.distributePrize()).to.be.revertedWithCustomError(round, "InvalidPhase");
      expect(await ethers.provider.getBalance(await round.getAddress())).to.equal(prize);
    });
  }
});
