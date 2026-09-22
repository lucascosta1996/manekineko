import { expect } from "chai";
import { artifacts, network } from "hardhat";

const { ethers, networkHelpers } = await network.create();
const { time, loadFixture } = networkHelpers;
const PRICE = 10_000n;

async function fixture() {
  const [owner, admission, buyer, other] = await ethers.getSigners();
  const coordinator = await ethers.deployContract("VRFCoordinatorV2Mock");
  const gate = await ethers.deployContract("ManekinekoAffiliateEligibilityV5", [owner.address]);
  const credits = await ethers.deployContract("ManekinekoWinnerCreditsV6", [owner.address, ethers.ZeroHash, ethers.ZeroAddress]);
  const factory = await ethers.deployContract("ManekinekoFactoryV10", [owner.address]);
  const address = await factory.getAddress();
  const codeHash = ethers.keccak256(await ethers.provider.getCode(address));
  await gate.approveFactory(address, codeHash);
  await credits.approveFactory(address, codeHash);
  const start = BigInt(await time.latest()) + 3600n;
  const config = {
    name: "Permanent ticket registry test", symbol: "T10", seasonId: ethers.id("registry-v10"),
    seasonName: "Registry V10", collectionColor: "#330000", textColor: "#FFFFFF", roundId: 1n,
    maxSupply: 20n, mintPrice: PRICE, mintDeadline: start + 86400n, saleStartAt: start,
    initialOwner: owner.address, vrfCoordinator: await coordinator.getAddress(), keyHash: ethers.id("mock-key"),
    requestConfirmations: 64, callbackGasLimit: 200000, maxAffiliateSlots: 2n, enrollmentSigner: admission.address,
    prizeBps: 6000n, winnerCount: 6n, affiliatePoolBps: 2000n, minAffiliateReferrals: 1n,
    affiliatePayoutCapBps: 3000n, affiliateEligibility: await gate.getAddress(),
  };
  await factory.createRound(config);
  const round = await ethers.getContractAt("ManekinekoRoundV10", await factory.rounds(1));
  await gate.registerCollection(address, 1);
  await credits.registerCollection(address, 1);
  await round.fundRandomness({ value: await coordinator.MOCK_FEE() });
  return { owner, admission, buyer, other, coordinator, gate, credits, factory, config, round };
}

type Context = Awaited<ReturnType<typeof fixture>>;

async function finalize(c: Context) {
  await time.increaseTo(c.config.saleStartAt);
  await c.round.activateSale();
  await c.round.connect(c.buyer).mint(c.buyer.address, 20, { value: PRICE * 20n });
  await c.round.requestRandomness();
  await c.coordinator.fulfillRequest(await c.round.requestId(), 123);
  await c.round.finalizeDraw(8);
}

const enrollmentTypes = { Enrollment: [
  { name: "applicant", type: "address" }, { name: "affiliateId", type: "uint256" },
  { name: "poolBps", type: "uint256" }, { name: "sourceCollection", type: "address" },
  { name: "sourceTokenId", type: "uint256" }, { name: "nonce", type: "bytes32" },
  { name: "deadline", type: "uint256" },
] };

describe("V10 registry compatibility and migration", function () {
  this.timeout(180000);

  it("imports completed immutable V9 and consumes an existing NFT for V10 enrollment with domain version 4", async () => {
    const [owner, admission, buyer, other] = await ethers.getSigners();
    const coordinator = await ethers.deployContract("VRFCoordinatorV2Mock");
    const prior = await ethers.deployContract("ManekinekoAffiliateEligibilityV4", [owner.address]);
    const gate = await ethers.deployContract("ManekinekoAffiliateEligibilityV5", [owner.address]);
    const oldFactory = await ethers.deployContract("ManekinekoFactoryV9", [owner.address]);
    const factory = await ethers.deployContract("ManekinekoFactoryV10", [owner.address]);
    const oldFactoryAddress = await oldFactory.getAddress(), factoryAddress = await factory.getAddress();
    const oldHash = ethers.keccak256(await ethers.provider.getCode(oldFactoryAddress));
    await prior.approveFactory(oldFactoryAddress, oldHash);
    await gate.approveFactory(oldFactoryAddress, oldHash);
    await gate.approveFactory(factoryAddress, ethers.keccak256(await ethers.provider.getCode(factoryAddress)));
    const start = BigInt(await time.latest()) + 3600n;
    const config = {
      name: "Historical V9", symbol: "V9", seasonId: ethers.id("v9-migration"), seasonName: "Migration",
      collectionColor: "#330000", textColor: "#FFFFFF", roundId: 1n, maxSupply: 6n, mintPrice: PRICE,
      mintDeadline: start + 86400n, saleStartAt: start, initialOwner: owner.address,
      vrfCoordinator: await coordinator.getAddress(), keyHash: ethers.id("mock-key"), requestConfirmations: 64,
      callbackGasLimit: 200000, maxAffiliateSlots: 2n, enrollmentSigner: admission.address, prizeBps: 6000n,
      winnerCount: 6n, affiliatePoolBps: 2000n, minAffiliateReferrals: 1n, affiliatePayoutCapBps: 3000n,
      affiliateEligibility: await prior.getAddress(),
    };
    await oldFactory.createRound(config);
    const historical = await ethers.getContractAt("ManekinekoRoundV9", await oldFactory.rounds(1));
    const source = await historical.getAddress();
    await prior.registerCollection(oldFactoryAddress, 1);
    await expect(gate.registerCollection(oldFactoryAddress, 1)).revertedWithCustomError(gate, "InvalidCollection");
    await historical.fundRandomness({ value: await coordinator.MOCK_FEE() });
    await time.increaseTo(start); await historical.activateSale();
    await historical.connect(buyer).mint(buyer.address, 6, { value: PRICE * 6n });
    await historical.requestRandomness(); await coordinator.fulfillRequest(await historical.requestId(), 123);
    await historical.finalizeDraw(8);
    expect(await historical.prizePaid()).eq(false);
    await gate.registerCollection(oldFactoryAddress, 1);
    expect((await gate.collections(source)).sourceOnly).eq(true);
    await expect(gate.requireRegistered(source)).revertedWithCustomError(gate, "InvalidCollection");

    const nextStart = BigInt(await time.latest()) + 3600n;
    await factory.createRound({ ...config, name: "V10 target", affiliateEligibility: await gate.getAddress(), saleStartAt: nextStart, mintDeadline: nextStart + 86400n });
    const target = await ethers.getContractAt("ManekinekoRoundV10", await factory.rounds(1));
    const targetAddress = await target.getAddress();
    await gate.registerCollection(factoryAddress, 1);
    expect((await gate.collections(targetAddress)).sequence).eq(2n);
    expect(await gate.eligibilityStatus(targetAddress, buyer.address, ethers.ZeroAddress, 0)).eq(2n);
    expect(await gate.eligibilityStatus(targetAddress, other.address, source, 1)).eq(3n);
    expect(await gate.eligibilityStatus(targetAddress, buyer.address, source, 1)).eq(0n);
    const permit = { applicant: buyer.address, affiliateId: 1, poolBps: 2000, sourceCollection: source, sourceTokenId: 1, nonce: ethers.id("v10-permit"), deadline: nextStart - 1n };
    const signature = await admission.signTypedData({ name: "ManekinekoAffiliateEnrollment", version: "4", chainId: 31337, verifyingContract: targetAddress }, enrollmentTypes, permit);
    await target.connect(buyer).enrollAffiliate(permit.applicant, permit.affiliateId, permit.poolBps, source, 1, permit.nonce, permit.deadline, signature);
    expect(await gate.usedToken(targetAddress, source, 1)).eq(true);
    expect(await gate.enrollmentNonceUsed(targetAddress, permit.nonce)).eq(true);
    await target.fundRandomness({ value: await coordinator.MOCK_FEE() });
    await time.increaseTo(nextStart);
    expect(await target.saleActivated()).eq(false);
    expect(await gate.eligibilityStatus(targetAddress, buyer.address, source, 2)).eq(5n);
    await target.activateSale();
    await target.connect(other).mintWithAffiliate(other.address, 1, 1, { value: PRICE });
    expect(await target.totalReferredMints()).eq(1n);
    expect(await historical.CONTRACT_VERSION()).eq("affiliate-v9");
  });

  it("recognizes all V10 awards, permits a next collection before every claim, and preserves sponsored-mint caps and reserves", async () => {
    const c = await loadFixture(fixture), source = await c.round.getAddress();
    await finalize(c);
    expect(await c.round.prizePaid()).eq(false);
    await expect(c.credits.claimAwardCredit(source, 6)).revertedWithCustomError(c.credits, "CreditUnavailable");
    await c.round.connect(c.buyer).claimPrizeForRank(6, c.other.address);
    await c.credits.claimAwardCredit(source, 6);
    const credit = await c.credits.creditsForAward(source, 6);
    expect(credit.beneficiary).eq(c.buyer.address);
    expect(credit.earnedAt).eq(await c.round.finalizedAt());
    const start = BigInt(await time.latest()) + 3600n;
    await c.factory.createRound({ ...c.config, roundId: 2n, saleStartAt: start, mintDeadline: start + 86400n });
    const next = await ethers.getContractAt("ManekinekoRoundV10", await c.factory.rounds(2));
    const target = await next.getAddress();
    await c.gate.registerCollection(await c.factory.getAddress(), 2);
    await c.credits.registerCollection(await c.factory.getAddress(), 2);
    await next.fundRandomness({ value: await c.coordinator.MOCK_FEE() });
    await c.credits.fundCollection(target, { value: PRICE * 2n });
    await time.increaseTo(start); await next.activateSale();
    await next.connect(c.buyer).mint(c.buyer.address, 19, { value: PRICE * 19n });
    await c.credits.connect(c.buyer).redeemAward(source, 6, target);
    expect(await next.ownerOf(20)).eq(c.buyer.address);
    expect(await next.mintedPerWallet(c.buyer.address)).eq(20n);
    expect(await next.totalMintRevenue()).eq(PRICE * 20n);
    expect(await c.credits.sponsorBalance(target)).eq(PRICE);
    expect(await c.credits.totalFunded(target)).eq(PRICE * 2n);
    expect(await c.credits.redeemedAwardRank(c.buyer.address)).eq(6n);
    expect(await c.credits.lifetimeRewardUsed(c.buyer.address)).eq(true);
    await c.round.connect(c.buyer).claimPrizeForRank(5, c.buyer.address);
    await expect(c.credits.claimAwardCredit(source, 5)).revertedWithCustomError(c.credits, "LifetimeRewardAlreadyUsed");
  });

  it("retains lifetime redemption lineage through V5 and refuses a funded predecessor", async () => {
    const c = await loadFixture(fixture);
    const oldest = await ethers.deployContract("PriorWinnerCreditRegistryMock");
    await oldest.markRedeemed(c.buyer.address, await c.round.getAddress());
    const v3 = await ethers.deployContract("ManekinekoWinnerCreditsV3", [c.owner.address, ethers.ZeroHash, await oldest.getAddress()]);
    const v5 = await ethers.deployContract("ManekinekoWinnerCreditsV5", [c.owner.address, ethers.ZeroHash, await v3.getAddress()]);
    const migrated = await ethers.deployContract("ManekinekoWinnerCreditsV6", [c.owner.address, ethers.ZeroHash, await v5.getAddress()]);
    expect(await v5.redeemedSource(c.buyer.address)).eq(ethers.ZeroAddress);
    expect(await migrated.lifetimeRewardUsed(c.buyer.address)).eq(true);
    expect(await migrated.lifetimeRewardUsed(c.other.address)).eq(false);
    const oldFactory = await ethers.deployContract("ManekinekoFactoryV9", [c.owner.address]);
    await oldFactory.createRound(c.config);
    const address = await oldFactory.getAddress(), round = await oldFactory.rounds(1);
    await v5.approveFactory(address, ethers.keccak256(await ethers.provider.getCode(address)));
    await v5.registerCollection(address, 1);
    await v5.fundCollection(round, { value: PRICE });
    await expect(ethers.deployContract("ManekinekoWinnerCreditsV6", [c.owner.address, ethers.ZeroHash, await v5.getAddress()])).revertedWithCustomError(migrated, "InvalidCollection");
    await v5.withdrawSponsorship(round, c.owner.address, PRICE);
    const drainedMigration = await ethers.deployContract("ManekinekoWinnerCreditsV6", [c.owner.address, ethers.ZeroHash, await v5.getAddress()]);
    expect(await drainedMigration.lifetimeRewardUsed(c.buyer.address)).eq(true);
    const v10Factory = await c.factory.getAddress();
    await migrated.approveFactory(v10Factory, ethers.keccak256(await ethers.provider.getCode(v10Factory)));
    await migrated.registerCollection(v10Factory, 1);
    await finalize(c);
    await c.round.connect(c.buyer).claimPrizeForRank(6, c.buyer.address);
    await expect(migrated.claimAwardCredit(await c.round.getAddress(), 6)).revertedWithCustomError(migrated, "LifetimeRewardAlreadyUsed");
  });

  it("keeps registry ABI markers distinct and both contracts below deployment size limits", async () => {
    const c = await loadFixture(fixture);
    expect(await c.gate.ELIGIBILITY_VERSION()).eq("affiliate-eligibility-v5");
    expect(await c.credits.WINNER_CREDITS_VERSION()).eq("winner-credits-v6");
    for (const name of ["ManekinekoAffiliateEligibilityV5", "ManekinekoWinnerCreditsV6"]) {
      const artifact = await artifacts.readArtifact(name);
      expect((artifact.deployedBytecode.length - 2) / 2, name).at.most(24576);
      expect((artifact.bytecode.length - 2) / 2, name).at.most(49152);
    }
  });
});
