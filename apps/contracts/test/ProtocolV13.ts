import { expect } from "chai";
import assert from "node:assert/strict";
import { artifacts, network } from "hardhat";
import { readProtocol } from "../../../packages/protocol/src/chain.js";
import { verifyDeployment } from "../../../scripts/protocol-v13/verify-deployment.mjs";
import { holderClaimTransaction } from "../../../packages/protocol/src/holder-rewards.js";
const { ethers, networkHelpers } = await network.create();
const { time, loadFixture } = networkHelpers;
const price = ethers.parseEther("0.01");
const season = ethers.id("Holder season");
async function fixture() {
  return setup(1000);
}
async function oddSupplyFixture() {
  return setup(1021);
}
async function votedTermsFixture() {
  return setup(1000, [
    { supply: 2000, price: price * 2n, winners: 4, duration: 3600 },
    { supply: 1000, price: price * 3n, winners: 10, duration: 3600 },
  ]);
}
async function setup(
  supply: number,
  additionalChoices: {
    supply: number;
    price: bigint;
    winners: number;
    duration: number;
  }[] = []
) {
  const [operator, buyer, other, affiliate] = await ethers.getSigners();
  const vrf = await ethers.deployContract("VRFCoordinatorV2Mock");
  const credits = await ethers.deployContract("ManekinekoWinnerCreditsV9", [
    operator.address,
    ethers.ZeroHash,
    ethers.ZeroAddress,
  ]);
  const controller = await ethers.deployContract(
    "ManekinekoSeasonControllerV13",
    [
      {
        operator: operator.address,
        coordinator: await vrf.getAddress(),
        credits: await credits.getAddress(),
        keyHash: ethers.id("mock"),
        confirmations: 64,
        callbackGas: 200000,
        votingDuration: 3600,
        votingDelay: 60,
        randomnessBudget: price,
        sponsorshipBudget: price,
        bootstrapAllowed: true,
      },
      [{ supply, price, winners: 6, duration: 3600 }, ...additionalChoices],
    ]
  );
  const pool = await ethers.deployContract("ManekinekoHolderRewardsV13", [
    await controller.getAddress(),
  ]);
  const deployer = await ethers.deployContract("ManekinekoRoundDeployerV13", [
    await controller.getAddress(),
  ]);
  await controller.bindDeployer(await deployer.getAddress());
  await controller.appendCollections(
    [1, 2, 3].map((i) => ({
      seasonId: i < 3 ? season : ethers.id("Other season"),
      seasonName: i < 3 ? "Holder season" : "Other season",
      name: `Collection ${i}`,
      symbol: `H${i}`,
      color: "#330000",
      textColor: "#FFFFFF",
    }))
  );
  await credits.approveFactory(
    await controller.getAddress(),
    ethers.keccak256(
      await ethers.provider.getCode(await controller.getAddress())
    )
  );
  await credits.sealFactories();
  await expect(controller.sealCatalog()).revertedWithCustomError(
    controller,
    "InvalidConfiguration"
  );
  await controller.bindHolderRewards(await pool.getAddress());
  await controller.sealCatalog();
  await operator.sendTransaction({
    to: await controller.getAddress(),
    value: ethers.parseEther("1"),
  });
  await controller.prepareNext();
  const round = await ethers.getContractAt(
    "ManekinekoRoundV13",
    await controller.rounds(1)
  );
  await time.increaseTo((await round.saleStartAt()) - 3600n);
  await round.connect(affiliate).enrollAffiliate(1, ethers.ZeroAddress, 0);
  await time.increaseTo(await round.saleStartAt());
  await round
    .connect(buyer)
    .mintWithAffiliate(buyer.address, 20, 1, { value: price * 20n });
  for (let n = 20; n < supply; n += 20) {
    const quantity = Math.min(20, supply - n);
    await round.mint(
      ethers.getAddress(
        ethers.dataSlice(ethers.id(`Holder recipient ${n}`), 12)
      ),
      quantity,
      { value: price * BigInt(quantity) }
    );
  }
  return {
    operator,
    buyer,
    other,
    affiliate,
    vrf,
    credits,
    controller,
    pool,
    round,
  };
}
type Context = Awaited<ReturnType<typeof fixture>>;
async function reveal(c: Context) {
  await c.vrf.fulfillRequest(await c.round.requestId(), 0);
  await c.round.connect(c.other).finalizeDrawAndClaim(c.other.address);
}
async function endedFixture() {
  const c = await fixture();
  await reveal(c);
  await c.controller.prepareNext();
  const failed = await ethers.getContractAt(
    "ManekinekoRoundV13",
    await c.controller.rounds(2)
  );
  await time.increaseTo(await failed.saleStartAt());
  await failed.connect(c.buyer).mint(c.buyer.address, 1, { value: price });
  await time.increaseTo(await failed.mintDeadline());
  return { ...c, failed };
}
async function nonWinner(c: Context) {
  const wins = new Set(
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        c.round.winningTokenIds(i + 1).then(String)
      )
    )
  );
  for (let id = 1n; id <= 20n; id++) if (!wins.has(String(id))) return id;
  throw Error("No non-winning token");
}
describe("V13 protected season holder rewards", function () {
  this.timeout(120000);
  it("keeps 100% reserved until a successful draw, then funds exactly 60/20/8/12", async () => {
    const c = await loadFixture(fixture);
    expect(await c.round.protectedBalance()).equal(price * 1000n + price);
    expect((await c.pool.summary(season)).funded).equal(0);
    expect(await c.round.operatorWithdrawable()).equal(0);
    await reveal(c);
    expect(await c.round.prizeAmount()).equal(ethers.parseEther("6"));
    expect(await c.round.affiliateClaimable(1)).equal(ethers.parseEther("2"));
    expect(await c.round.operatorWithdrawable()).equal(
      ethers.parseEther("1.2")
    );
    expect(await ethers.provider.getBalance(await c.pool.getAddress())).equal(
      ethers.parseEther("0.8")
    );
    expect(await c.round.protectedBalance()).equal(ethers.parseEther("8"));
    await c.round.withdrawOperator(
      c.operator.address,
      ethers.parseEther("1.2")
    );
    await expect(
      c.round.withdrawOperator(c.operator.address, 1)
    ).revertedWithCustomError(c.round, "InsufficientWithdrawableBalance");
    await c.round
      .connect(c.affiliate)
      .claimAffiliateCommission(c.affiliate.address);
    expect(await ethers.provider.getBalance(await c.round.getAddress())).equal(
      ethers.parseEther("6")
    );
    expect(await c.round.readyForNextRound()).equal(true);
  });
  it("unlocks at season completion without requiring prize claims or the next season", async () => {
    const c = await loadFixture(fixture);
    await reveal(c);
    expect((await c.pool.summary(season)).unlocked).equal(false);
    await expect(
      c.pool
        .connect(c.buyer)
        .claim(await c.round.getAddress(), 1, c.buyer.address)
    ).revertedWithCustomError(c.pool, "SeasonLocked");
    await c.controller.prepareNext();
    const last = await ethers.getContractAt(
      "ManekinekoRoundV13",
      await c.controller.rounds(2)
    );
    await time.increaseTo((await last.mintDeadline()) - 1n);
    expect((await c.pool.summary(season)).unlocked).equal(false);
    await time.increase(1);
    const state = await c.pool.summary(season);
    expect(state.unlocked).equal(true);
    expect(state.collections).equal(2);
    expect(state.settledCollections).equal(2);
    expect(state.eligibleNfts).equal(1000);
    expect(state.claimLimit).equal(50);
    expect(state.rewardPerNft).equal(ethers.parseEther("0.016"));
    expect(await c.round.claimedAwardCount()).equal(0);
    expect(await c.controller.roundCount()).equal(2);
  });
  it("pays the current owner only and keeps the one-claim flag through transfers", async () => {
    const c = await loadFixture(endedFixture),
      token = await nonWinner(c),
      address = await c.round.getAddress();
    await c.round.connect(c.buyer).approve(c.other.address, token);
    await expect(
      c.pool.connect(c.other).claim(address, token, c.other.address)
    ).revertedWithCustomError(c.pool, "NotTokenHolder");
    await c.round
      .connect(c.buyer)
      .transferFrom(c.buyer.address, c.other.address, token);
    await expect(
      c.pool.connect(c.buyer).claim(address, token, c.buyer.address)
    ).revertedWithCustomError(c.pool, "NotTokenHolder");
    await expect(
      c.pool.connect(c.other).claim(address, token, c.other.address)
    ).changeEtherBalance(ethers, c.other, ethers.parseEther("0.016"));
    await c.round
      .connect(c.other)
      .transferFrom(c.other.address, c.buyer.address, token);
    await expect(
      c.pool.connect(c.buyer).claim(address, token, c.buyer.address)
    ).revertedWithCustomError(c.pool, "AlreadyClaimed");
  });
  it("includes winning NFTs without consuming or altering their prize claim", async () => {
    const c = await loadFixture(endedFixture),
      token = await c.round.winningTokenIds(1),
      owner = await c.round.ownerOf(token);
    const signer = await ethers.getImpersonatedSigner(owner);
    await networkHelpers.setBalance(owner, ethers.parseEther("1"));
    await c.pool
      .connect(signer)
      .claim(await c.round.getAddress(), token, owner);
    expect(await c.round.prizeClaimed(1)).equal(false);
    await expect(
      c.round.connect(signer).claimPrizeForRank(1, owner)
    ).changeEtherBalance(ethers, signer, ethers.parseEther("1"));
  });
  it("pays exactly the first 5%, never another season or a 51st NFT", async () => {
    const c = await loadFixture(endedFixture),
      address = await c.round.getAddress();
    for (let token = 1; token <= 50; token++) {
      const owner = await c.round.ownerOf(token),
        signer = await ethers.getImpersonatedSigner(owner);
      await networkHelpers.setBalance(owner, ethers.parseEther("1"));
      await c.pool.connect(signer).claim(address, token, owner);
    }
    const state = await c.pool.summary(season);
    expect(state.claims).equal(50);
    expect(state.paid).equal(state.funded);
    const owner = await c.round.ownerOf(51),
      signer = await ethers.getImpersonatedSigner(owner);
    await expect(
      c.pool.connect(signer).claim(address, 51, owner)
    ).revertedWithCustomError(c.pool, "ClaimsExhausted");
    expect((await c.pool.summary(ethers.id("Other season"))).funded).equal(0);
  });
  it("excludes refundable NFTs and keeps every refund fully backed", async () => {
    const c = await loadFixture(endedFixture);
    await expect(
      c.pool
        .connect(c.buyer)
        .claim(await c.failed.getAddress(), 1, c.buyer.address)
    ).revertedWithCustomError(c.pool, "InvalidCollection");
    expect(await c.failed.operatorAllocation()).equal(0);
    await expect(
      c.failed.connect(c.buyer).refund(1, c.buyer.address)
    ).changeEtherBalance(ethers, c.buyer, price);
    expect((await c.pool.summary(season)).eligibleNfts).equal(1000);
  });
  it("never funds holders or the operator when a sold-out draw times out", async () => {
    const c = await loadFixture(fixture);
    await time.increaseTo(await c.round.randomnessDeadline());
    expect(await c.round.refundsAvailable()).equal(true);
    expect(await c.round.operatorWithdrawable()).equal(0);
    expect((await c.pool.summary(season)).funded).equal(0);
    await expect(
      c.round.connect(c.buyer).refund(1, c.buyer.address)
    ).changeEtherBalance(ethers, c.buyer, price);
    expect(await c.round.protectedBalance()).equal(price * 999n + price);
  });
  it("rolls back a rejected payout and blocks reentry", async () => {
    const c = await loadFixture(endedFixture),
      token = await nonWinner(c),
      receiver = await ethers.deployContract("HolderRewardsV13Receiver");
    await c.round
      .connect(c.buyer)
      .transferFrom(c.buyer.address, await receiver.getAddress(), token);
    await receiver.configure(
      await c.pool.getAddress(),
      await c.round.getAddress(),
      token,
      true
    );
    await expect(receiver.claim()).revertedWithCustomError(
      c.pool,
      "TransferFailed"
    );
    expect(await c.pool.claimed(await c.round.getAddress(), token)).equal(
      false
    );
    expect((await c.pool.summary(season)).claims).equal(0);
    await receiver.configure(
      await c.pool.getAddress(),
      await c.round.getAddress(),
      token,
      false
    );
    await receiver.claim();
    expect(await receiver.reentryBlocked()).equal(true);
    expect((await c.pool.summary(season)).claims).equal(1);
  });
  it("cannot rebind the vault, alter coverage, withdraw the pool or fund it by donation", async () => {
    const c = await loadFixture(endedFixture);
    await expect(
      c.controller.bindHolderRewards(await c.pool.getAddress())
    ).revertedWithCustomError(c.controller, "InvalidConfiguration");
    await expect(
      c.operator.sendTransaction({ to: await c.pool.getAddress(), value: 1 })
    ).revert(ethers);
    expect(
      c.pool.interface.fragments
        .filter((f) => f.type === "function")
        .map((f) => ("name" in f ? f.name : ""))
    ).not.include("withdraw");
    expect(await c.pool.COVERAGE_BPS()).equal(500);
  });
  it("adds all successful collections and keeps the first season isolated from the next", async () => {
    const c = await loadFixture(fixture);
    await reveal(c);
    await c.controller.prepareNext();
    const second = await ethers.getContractAt(
      "ManekinekoRoundV13",
      await c.controller.rounds(2)
    );
    await time.increaseTo(await second.saleStartAt());
    for (let n = 0; n < 1000; n += 20)
      await second.mint(
        ethers.getAddress(ethers.dataSlice(ethers.id(`Second ${n}`), 12)),
        20,
        { value: price * 20n }
      );
    await c.vrf.fulfillRequest(await second.requestId(), 0);
    await second.finalizeDraw(8);
    const final = await c.pool.summary(season);
    expect(final.unlocked).equal(true);
    expect(final.funded).equal(ethers.parseEther("1.6"));
    expect(final.eligibleNfts).equal(2000);
    expect(final.claimLimit).equal(100);
    expect(final.rewardPerNft).equal(ethers.parseEther("0.016"));
    await c.controller.prepareNext();
    expect((await c.pool.summary(ethers.id("Other season"))).unlocked).equal(
      false
    );
    expect((await c.pool.summary(season)).funded).equal(final.funded);
  });
  it("derives each season's funds, slots and equal payouts from different voted mint terms", async () => {
    const c = await loadFixture(votedTermsFixture);
    const voting = await ethers.getContractAt(
      "ManekinekoVotingV12",
      await c.controller.voting()
    );
    const config = {
      version: 13 as const,
      chainId: 31337,
      controller: await c.controller.getAddress(),
      codeHash: ethers.keccak256(
        await ethers.provider.getCode(await c.controller.getAddress())
      ),
      holderRewardsCodeHash: ethers.keccak256(
        await ethers.provider.getCode(await c.pool.getAddress())
      ),
      rpcUrl: "https://unused.invalid",
    };
    await reveal(c);
    const provisional = (await readProtocol(ethers.provider, config, 1))
      .holders!;
    expect(provisional.unlocked).equal(false);
    expect(provisional.funded).equal(ethers.parseEther("0.8"));
    expect(provisional.eligibleNfts).equal(1000);
    expect(provisional.claimLimit).equal(50);
    expect(provisional.rewardPerNft).equal(ethers.parseEther("0.016"));

    async function prepareVotedCollection(id: number, choice: number) {
      await c.controller.prepareNext();
      const round = await ethers.getContractAt(
        "ManekinekoRoundV13",
        await c.controller.rounds(id)
      );
      const address = await round.getAddress();
      await time.increaseTo((await voting.ballots(address)).startsAt);
      await voting
        .connect(c.buyer)
        .castVote(address, choice, [await c.round.getAddress()]);
      await time.increaseTo(await round.saleStartAt());
      expect(await voting.winningOption(address)).equal(choice);
      return round;
    }
    async function sellAndReveal(round: Context["round"]) {
      const supply = await round.maxSupply(),
        mintPrice = await round.mintPrice();
      for (let n = 0n; n < supply; n += 20n) {
        const quantity = supply - n < 20n ? supply - n : 20n;
        const recipient =
          n === 0n
            ? c.buyer.address
            : ethers.getAddress(
                ethers.dataSlice(
                  ethers.id(`Voted holder ${await round.getAddress()} ${n}`),
                  12
                )
              );
        await round.mint(recipient, quantity, { value: mintPrice * quantity });
      }
      await reveal({ ...c, round });
    }

    // First season: 1,000 at 0.01 ETH, then voters choose 2,000 at 0.02 ETH.
    const second = await prepareVotedCollection(2, 1);
    expect(await second.maxSupply()).equal(2000);
    expect(await second.mintPrice()).equal(ethers.parseEther("0.02"));
    expect(await second.winnerCount()).equal(4);
    await sellAndReveal(second);
    expect(await second.totalMintRevenue()).equal(ethers.parseEther("40"));
    expect(await second.prizeAmountForRank(1)).equal(ethers.parseEther("6"));
    expect(await second.affiliatePoolAmount()).equal(ethers.parseEther("8"));
    expect(await second.operatorWithdrawable()).equal(ethers.parseEther("4.8"));
    const firstSeason = (await readProtocol(ethers.provider, config, 2))
      .holders!;
    const firstPayout = ethers.parseEther("4") / 150n;
    expect(firstSeason.unlocked).equal(true);
    expect(firstSeason.funded).equal(ethers.parseEther("4"));
    expect(firstSeason.eligibleNfts).equal(3000);
    expect(firstSeason.claimLimit).equal(150);
    expect(firstSeason.rewardPerNft).equal(firstPayout);
    expect(firstSeason.rewardPerNft).not.equal(provisional.rewardPerNft);
    expect((await readProtocol(ethers.provider, config, 1)).holders).deep.equal(
      firstSeason
    );

    // Equal season rewards even when the NFTs were minted at different prices.
    for (const round of [c.round, second]) {
      await expect(
        c.pool
          .connect(c.buyer)
          .claim(await round.getAddress(), 1, c.other.address)
      ).changeEtherBalance(ethers, c.other, firstPayout);
    }

    // Next season: voters choose 1,000 at 0.03 ETH, with its own pool and payout.
    const third = await prepareVotedCollection(3, 2);
    expect(await third.maxSupply()).equal(1000);
    expect(await third.mintPrice()).equal(ethers.parseEther("0.03"));
    expect(await third.winnerCount()).equal(10);
    await sellAndReveal(third);
    expect(await third.totalMintRevenue()).equal(ethers.parseEther("30"));
    expect(await third.prizeAmountForRank(1)).equal(ethers.parseEther("1.8"));
    expect(await third.affiliatePoolAmount()).equal(ethers.parseEther("6"));
    expect(await third.operatorWithdrawable()).equal(ethers.parseEther("3.6"));
    const next = await readProtocol(
      ethers.provider,
      config,
      3,
      c.buyer.address
    );
    expect(next.holders!.unlocked).equal(true);
    expect(next.holders!.funded).equal(ethers.parseEther("2.4"));
    expect(next.holders!.eligibleNfts).equal(1000);
    expect(next.holders!.claimLimit).equal(50);
    expect(next.holders!.rewardPerNft).equal(ethers.parseEther("0.048"));
    const tx = await holderClaimTransaction(
      ethers.provider,
      config,
      next,
      1n,
      c.buyer.address,
      ethers.parseEther("0.048")
    );
    await expect(c.buyer.sendTransaction(tx)).changeEtherBalance(
      ethers,
      c.buyer,
      ethers.parseEther("0.048")
    );
    const previous = (await readProtocol(ethers.provider, config, 1)).holders!;
    expect(previous.funded).equal(firstSeason.funded);
    expect(previous.rewardPerNft).equal(firstPayout);
    expect(previous.claims).equal(2);
    expect(previous.paid).equal(firstPayout * 2n);
    expect(await ethers.provider.getBalance(await c.pool.getAddress())).equal(
      ethers.parseEther("6.4") - firstPayout * 2n - ethers.parseEther("0.048")
    );
  });
  it("rounds coverage and payouts down and retains protected wei dust", async () => {
    const c = await loadFixture(oddSupplyFixture);
    await reveal(c);
    await c.controller.prepareNext();
    const failed = await ethers.getContractAt(
      "ManekinekoRoundV13",
      await c.controller.rounds(2)
    );
    await time.increaseTo(await failed.mintDeadline());
    const state = await c.pool.summary(season);
    expect(state.claimLimit).equal(51);
    expect(state.rewardPerNft).equal(state.funded / 51n);
    expect(state.funded % 51n).greaterThan(0);
    for (let token = 1; token <= 51; token++) {
      const owner = await c.round.ownerOf(token),
        signer = await ethers.getImpersonatedSigner(owner);
      await networkHelpers.setBalance(owner, ethers.parseEther("1"));
      await c.pool
        .connect(signer)
        .claim(await c.round.getAddress(), token, owner);
    }
    expect(await ethers.provider.getBalance(await c.pool.getAddress())).equal(
      state.funded % 51n
    );
    expect((await c.pool.summary(season)).paid).equal(state.rewardPerNft * 51n);
  });
  it("ends an entirely refundable season without creating a zero-value claim", async () => {
    const c = await loadFixture(fixture);
    await time.increaseTo(await c.round.randomnessDeadline());
    await c.controller.prepareNext();
    const second = await ethers.getContractAt(
      "ManekinekoRoundV13",
      await c.controller.rounds(2)
    );
    await time.increaseTo(await second.mintDeadline());
    const state = await c.pool.summary(season);
    expect(state.unlocked).equal(true);
    expect(state.funded).equal(0);
    expect(state.claimLimit).equal(0);
    await expect(
      c.pool
        .connect(c.buyer)
        .claim(await c.round.getAddress(), 1, c.buyer.address)
    ).revertedWithCustomError(c.pool, "InvalidCollection");
  });
  it("atomically settles the 12% treasury while preserving the 8% holder allocation", async () => {
    const c = await loadFixture(fixture);
    await c.vrf.fulfillRequest(await c.round.requestId(), 0);
    await expect(
      c.controller.settleAndPrepare(1, ethers.parseEther("2"))
    ).revertedWithCustomError(c.controller, "OperatorProceedsChanged");
    await c.controller.settleAndPrepare(1, ethers.parseEther("1.2"));
    expect(await c.round.operatorWithdrawn()).equal(ethers.parseEther("1.2"));
    expect((await c.pool.summary(season)).funded).equal(
      ethers.parseEther("0.8")
    );
    expect(await c.controller.roundCount()).equal(2);
  });
  it("reads actual V13 state and checks current NFT ownership and used claims before signing", async () => {
    const c = await loadFixture(endedFixture);
    const config = {
      version: 13 as const,
      chainId: 31337,
      controller: await c.controller.getAddress(),
      codeHash: ethers.keccak256(
        await ethers.provider.getCode(await c.controller.getAddress())
      ),
      holderRewardsCodeHash: ethers.keccak256(
        await ethers.provider.getCode(await c.pool.getAddress())
      ),
      rpcUrl: "https://unused.invalid",
    };
    const state = await readProtocol(
      ethers.provider,
      config,
      1,
      c.buyer.address
    );
    expect(state.holders?.unlocked).equal(true);
    expect(state.holders?.claimLimit).equal(50);
    const tx = await holderClaimTransaction(
      ethers.provider,
      config,
      state,
      1n,
      c.buyer.address,
      ethers.parseEther("0.016")
    );
    expect(tx.to).equal(await c.pool.getAddress());
    await c.buyer.sendTransaction(tx);
    const after = await readProtocol(
      ethers.provider,
      config,
      1,
      c.buyer.address
    );
    expect(after.holders?.claims).equal(1);
    await assert.rejects(
      holderClaimTransaction(
        ethers.provider,
        config,
        after,
        1n,
        c.buyer.address,
        ethers.parseEther("0.016")
      ),
      /already claimed/
    );
    await assert.rejects(
      holderClaimTransaction(
        ethers.provider,
        config,
        after,
        2n,
        c.other.address,
        ethers.parseEther("0.016")
      ),
      /current owner/
    );
    await assert.rejects(
      readProtocol(
        ethers.provider,
        { ...config, holderRewardsCodeHash: ethers.ZeroHash },
        1
      ),
      /could not be verified/
    );
  });
  it("verifies the complete compiled graph, season accounting and immutable pool binding", async () => {
    const c = await loadFixture(endedFixture);
    const expected = {
      chainId: 31337,
      controller: await c.controller.getAddress(),
      controllerCodeHash: ethers.keccak256(
        await ethers.provider.getCode(await c.controller.getAddress())
      ),
      holderRewards: await c.pool.getAddress(),
      holderRewardsCodeHash: ethers.keccak256(
        await ethers.provider.getCode(await c.pool.getAddress())
      ),
      operator: c.operator.address,
      credits: await c.credits.getAddress(),
      previousRegistry: ethers.ZeroAddress,
      legacyMerkleRoot: ethers.ZeroHash,
      settings: {
        coordinator: await c.vrf.getAddress(),
        keyHash: ethers.id("mock"),
        confirmations: 64,
        callbackGas: 200000,
        votingDuration: 3600,
        votingDelay: 60,
        randomnessBudget: String(price),
        sponsorshipBudget: String(price),
        bootstrapAllowed: true,
      },
      options: [
        {
          supply: "1000",
          price: String(price),
          winners: "6",
          duration: "3600",
        },
      ],
      catalog: await Promise.all(
        [0, 1, 2].map(async (i) => {
          const p = await c.controller.collectionPlan(i);
          return {
            seasonId: p.seasonId,
            seasonName: p.seasonName,
            name: p.name,
            symbol: p.symbol,
            color: p.color,
            textColor: p.textColor,
          };
        })
      ),
      creditsDeploymentTx: c.credits.deploymentTransaction()!.hash,
    };
    const verified = await verifyDeployment(ethers.provider, expected);
    expect(verified.preparedCollections).equal(2);
    expect(
      verified.contracts.some((c) => c.name === "ManekinekoHolderRewardsV13")
    ).equal(true);
    await assert.rejects(
      verifyDeployment(ethers.provider, {
        ...expected,
        holderRewardsCodeHash: ethers.ZeroHash,
      }),
      /Holder pool pin mismatch/
    );
    await networkHelpers.setBalance(expected.holderRewards, 1n);
    await assert.rejects(
      verifyDeployment(ethers.provider, expected),
      /underfunded/
    );
  });
  it("keeps permanent metadata and the lifetime sponsored mint independent of holder claims", async () => {
    const c = await loadFixture(fixture);
    const uri = await c.round.tokenURI(1);
    await reveal(c);
    expect(await c.round.tokenURI(1)).equal(uri);
    await c.controller.prepareNext();
    const next = await ethers.getContractAt(
      "ManekinekoRoundV13",
      await c.controller.rounds(2)
    );
    const winner = await c.round.winningTokenIds(1),
      owner = await c.round.ownerOf(winner),
      signer = await ethers.getImpersonatedSigner(owner);
    await networkHelpers.setBalance(owner, ethers.parseEther("1"));
    await c.round.connect(signer).claimPrizeForRank(1, owner);
    await time.increaseTo(await next.saleStartAt());
    await c.credits
      .connect(signer)
      .claimAndRedeemAward(
        await c.round.getAddress(),
        1,
        await next.getAddress()
      );
    expect(await next.ownerOf(1)).equal(owner);
    await time.increaseTo(await next.mintDeadline());
    await c.pool
      .connect(signer)
      .claim(await c.round.getAddress(), winner, owner);
    expect((await c.pool.summary(season)).claims).equal(1);
    expect(await c.round.prizeClaimed(1)).equal(true);
    await expect(
      c.credits
        .connect(signer)
        .claimAndRedeemAward(
          await c.round.getAddress(),
          1,
          await next.getAddress()
        )
    ).revert(ethers);
  });
  it("fits real Ethereum runtime and initcode limits", async () => {
    for (const name of [
      "ManekinekoRoundV13",
      "ManekinekoSeasonControllerV13",
      "ManekinekoRoundDeployerV13",
      "ManekinekoHolderRewardsV13",
      "ManekinekoWinnerCreditsV9",
    ]) {
      const artifact = await artifacts.readArtifact(name);
      expect((artifact.deployedBytecode.length - 2) / 2, name).at.most(24576);
      expect((artifact.bytecode.length - 2) / 2, name).at.most(49152);
    }
  });
});
