import { expect } from "chai";
import { network } from "hardhat";
import { buildLegacyCreditChain, legacyCreditLeaf } from "@manekineko/contract-abi/winner-credit-proof";

const { ethers, networkHelpers } = await network.create();
const { loadFixture, time } = networkHelpers;
const PRICE = 10_000n;

async function fixture() {
  const [owner, signer, winner, other, recipient, outsider] = await ethers.getSigners();
  const coordinator = await ethers.deployContract("VRFCoordinatorV2Mock");
  const eligibility = await ethers.deployContract("ManekinekoAffiliateEligibility", [owner.address]);
  const factory = await ethers.deployContract("ManekinekoFactoryV6", [owner.address]);
  await eligibility.approveFactory(await factory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await factory.getAddress())));
  const registry = await ethers.deployContract("ManekinekoWinnerCredits", [owner.address, ethers.ZeroHash]);
  await registry.approveFactory(await factory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await factory.getAddress())));
  const config = {
    name: "Winner credit test", symbol: "CREDIT", roundId: 1n, maxSupply: 2n, mintPrice: PRICE,
    seasonId: ethers.id("credit-season"), seasonName: "Credit Season", collectionColor: "#F6F3E9", textColor: "#000000",
    mintDeadline: BigInt(await time.latest()) + 86_400n, initialOwner: owner.address,
    vrfCoordinator: await coordinator.getAddress(), keyHash: ethers.id("mock-key"),
    requestConfirmations: 64, callbackGasLimit: 200_000, maxAffiliateSlots: 2n,
    enrollmentSigner: signer.address, prizeBps: 5000n, affiliatePoolBps: 1000n, affiliateEligibility: await eligibility.getAddress(),
  };
  await factory.createRound(config);
  const source = await ethers.getContractAt("ManekinekoRoundV6", await factory.rounds(1));
  await eligibility.registerCollection(await factory.getAddress(), 1);
  await registry.connect(outsider).registerCollection(await factory.getAddress(), 1);
  await source.fundRandomness({ value: await coordinator.MOCK_FEE() });
  await source.activateSale();
  return { owner, signer, winner, other, recipient, outsider, coordinator, factory, registry, config, source, eligibility };
}
type Context = Awaited<ReturnType<typeof fixture>>;
type Round = Context["source"];

async function settle(c: Context, round: Round = c.source, holder: string = c.winner.address) {
  const left = await round.maxSupply() - await round.totalMinted();
  if (left) await round.mint(holder, left, { value: PRICE * left });
  await round.requestRandomness();
  await c.coordinator.fulfillRequest(await round.requestId(), 234n);
  await round.finalizeDraw(8);
  await round.distributePrize();
}
async function createTarget(c: Context, options: { activate?: boolean; fund?: bigint; supply?: bigint } = {}) {
  const id = await c.factory.roundCount() + 1n;
  await c.factory.createRound({ ...c.config, roundId: id, maxSupply: options.supply ?? 2n, mintDeadline: BigInt(await time.latest()) + 86_400n });
  const round = await ethers.getContractAt("ManekinekoRoundV6", await c.factory.rounds(id));
  await c.eligibility.registerCollection(await c.factory.getAddress(), id);
  await c.registry.registerCollection(await c.factory.getAddress(), id);
  if (options.activate !== false) {
    await round.fundRandomness({ value: await c.coordinator.MOCK_FEE() });
    await round.activateSale();
  }
  if (options.fund) await c.registry.fundCollection(await round.getAddress(), { value: options.fund });
  return round;
}
// Credit accounting can span independently governed factories; each test factory still has a real eligibility gate.
async function independentRound(c: Context) {
  const eligibility = await ethers.deployContract("ManekinekoAffiliateEligibility", [c.owner.address]);
  const factory = await ethers.deployContract("ManekinekoFactoryV6", [c.owner.address]);
  await eligibility.approveFactory(await factory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await factory.getAddress())));
  await factory.createRound({ ...c.config, mintDeadline: BigInt(await time.latest()) + 86_400n, affiliateEligibility: await eligibility.getAddress() });
  await eligibility.registerCollection(await factory.getAddress(), 1);
  return { factory, round: await ethers.getContractAt("ManekinekoRoundV6", await factory.rounds(1)) };
}
async function settledFixture() { const c = await fixture(); await settle(c); return c; }
async function fundedFixture() {
  const c = await settledFixture(); const target = await createTarget(c, { fund: PRICE * 2n });
  return { ...c, target };
}

describe("Winner credits: one operator-funded mint per winning wallet lifetime", function () {
  this.timeout(180_000);

  it("pins factory runtime hashes append-only and requires its real pre-activation V6 round", async () => {
    const c = await loadFixture(fixture);
    expect(await c.registry.WINNER_CREDITS_VERSION()).to.equal("winner-credits-v2");
    const hash = ethers.keccak256(await ethers.provider.getCode(await c.factory.getAddress()));
    await expect(c.registry.connect(c.other).approveFactory(c.other.address, hash)).to.be.revertedWithCustomError(c.registry, "OwnableUnauthorizedAccount");
    await expect(c.registry.approveFactory(c.other.address, hash)).to.be.revertedWithCustomError(c.registry, "InvalidFactory");
    await expect(c.registry.approveFactory(await c.factory.getAddress(), hash)).to.be.revertedWithCustomError(c.registry, "FactoryAlreadyApproved");
    await expect(c.registry.registerCollection(c.other.address, 1)).to.be.revertedWithCustomError(c.registry, "InvalidFactory");
    await expect(c.registry.registerCollection(await c.factory.getAddress(), 999)).to.be.revertedWithCustomError(c.registry, "InvalidCollection");
    await expect(c.registry.registerCollection(await c.factory.getAddress(), 1)).to.be.revertedWithCustomError(c.registry, "CollectionAlreadyRegistered");
    const another = await ethers.deployContract("ManekinekoWinnerCredits", [c.owner.address, ethers.ZeroHash]);
    await expect(another.approveFactory(await c.factory.getAddress(), ethers.id("wrong runtime"))).to.be.revertedWithCustomError(another, "InvalidFactory");
    await another.approveFactory(await c.factory.getAddress(), hash);
    await another.registerCollection(await c.factory.getAddress(), 1);
    expect((await another.collections(await c.source.getAddress())).rewardsOnly).to.equal(true);
    await expect(another.fundCollection(await c.source.getAddress(), { value: PRICE })).to.be.revertedWithCustomError(another, "MintUnavailable");
    await expect(c.registry.renounceOwnership()).to.be.revertedWithCustomError(c.registry, "OwnershipRenunciationDisabled");
  });

  it("rejects old V5 rounds even if their factory is approved", async () => {
    const c = await loadFixture(fixture);
    const oldFactory = await ethers.deployContract("ManekinekoFactoryV5", [c.owner.address]);
    await oldFactory.createRound(c.config);
    await c.registry.approveFactory(await oldFactory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await oldFactory.getAddress())));
    await expect(c.registry.registerCollection(await oldFactory.getAddress(), 1)).to.be.revertedWithCustomError(c.registry, "InvalidCollection");
  });

  it("only issues a settled credit to the recorded winning holder and cannot issue twice", async () => {
    const c = await loadFixture(fixture);
    await expect(c.registry.claimCredit(c.other.address)).to.be.revertedWithCustomError(c.registry, "CollectionNotRegistered");
    await expect(c.registry.claimCredit(await c.source.getAddress())).to.be.revertedWithCustomError(c.registry, "CreditUnavailable");
    await settle(c);
    const source = await c.source.getAddress();
    await expect(c.registry.connect(c.outsider).claimCredit(source)).to.emit(c.registry, "CreditIssued")
      .withArgs(source, c.winner.address, 1n, await c.source.prizePaidAt());
    expect((await c.registry.credits(source)).beneficiary).to.equal(c.winner.address);
    await expect(c.registry.claimCredit(source)).to.be.revertedWithCustomError(c.registry, "CreditAlreadyIssued");
  });

  it("snapshots the holder, not an alternate payout recipient or post-settlement NFT owner", async () => {
    const c = await loadFixture(fixture);
    await c.source.mint(c.winner.address, 2, { value: PRICE * 2n });
    await c.source.requestRandomness(); await c.coordinator.fulfillRequest(await c.source.requestId(), 234n); await c.source.finalizeDraw(8);
    await time.increaseTo(await c.source.finalizedAt() + await c.source.PRIZE_CLAIM_DELAY());
    await c.source.connect(c.winner).claimPrize(c.recipient.address);
    expect(await c.source.winningHolder()).to.equal(c.winner.address);
    expect(await c.source.prizeRecipient()).to.equal(c.recipient.address);
    await c.source.connect(c.winner).transferFrom(c.winner.address, c.other.address, await c.source.winningTokenId());
    await c.registry.connect(c.other).claimCredit(await c.source.getAddress());
    expect((await c.registry.credits(await c.source.getAddress())).beneficiary).to.equal(c.winner.address);
    const target = await createTarget(c, { fund: PRICE });
    for (const signer of [c.other, c.recipient, c.owner]) {
      await expect(c.registry.connect(signer).redeem(await c.source.getAddress(), await target.getAddress())).to.be.revertedWithCustomError(c.registry, "NotBeneficiary");
    }
    await c.registry.connect(c.winner).redeem(await c.source.getAddress(), await target.getAddress());
    expect(await target.ownerOf(1)).to.equal(c.winner.address);
  });

  it("records winningHolder before native payout callbacks and rolls back failed payout", async () => {
    const c = await loadFixture(fixture);
    const receiver = await ethers.deployContract("WinnerCreditReceiver");
    await c.source.mint(await receiver.getAddress(), 2, { value: PRICE * 2n });
    await c.source.requestRandomness(); await c.coordinator.fulfillRequest(await c.source.requestId(), 234n); await c.source.finalizeDraw(8);
    await receiver.configure(false, true, ethers.ZeroAddress, "0x", await c.source.getAddress());
    await expect(c.source.distributePrize()).to.be.revertedWithCustomError(c.source, "TransferFailed");
    expect(await c.source.winningHolder()).to.equal(ethers.ZeroAddress); expect(await c.source.prizePaid()).to.equal(false);
    expect(await c.source.prizePaidAt()).to.equal(0n);
    const transfer = c.source.interface.encodeFunctionData("transferFrom", [await receiver.getAddress(), c.other.address, await c.source.winningTokenId()]);
    await receiver.configure(false, false, await c.source.getAddress(), transfer, await c.source.getAddress());
    await c.source.distributePrize();
    expect(await c.source.prizePaidAt()).to.equal(BigInt(await time.latest()));
    expect(await receiver.observedWinningHolder()).to.equal(await receiver.getAddress());
    expect(await receiver.attackSucceeded()).to.equal(true);
    expect(await c.source.ownerOf(await c.source.winningTokenId())).to.equal(c.other.address);
    await c.registry.claimCredit(await c.source.getAddress());
    expect((await c.registry.credits(await c.source.getAddress())).beneficiary).to.equal(await receiver.getAddress());
  });

  it("pays the full ordinary price, consumes supply, and preserves the full prize and affiliate pool", async () => {
    const c = await loadFixture(settledFixture);
    const target = await createTarget(c, { activate: false, fund: PRICE });
    await c.source.connect(c.winner).transferFrom(c.winner.address, c.other.address, 1);
    const nonce = ethers.id("credit referral"), deadline = BigInt(await time.latest()) + 600n;
    const signature = await c.signer.signTypedData(
      { name: "ManekinekoAffiliateEnrollment", version: "4", chainId: 31337, verifyingContract: await target.getAddress() },
      { Enrollment: [{ name: "applicant", type: "address" }, { name: "affiliateId", type: "uint256" }, { name: "poolBps", type: "uint256" }, { name: "sourceCollection", type: "address" }, { name: "sourceTokenId", type: "uint256" }, { name: "nonce", type: "bytes32" }, { name: "deadline", type: "uint256" }] },
      { applicant: c.other.address, affiliateId: 1, poolBps: 1000, sourceCollection: await c.source.getAddress(), sourceTokenId: 1, nonce, deadline });
    await target.connect(c.other).enrollAffiliate(c.other.address, 1, 1000, await c.source.getAddress(), 1, nonce, deadline, signature);
    await target.fundRandomness({ value: await c.coordinator.MOCK_FEE() }); await target.activateSale();
    await target.mintWithAffiliate(c.winner.address, 1, 1, { value: PRICE });
    const sourceAddress = await c.source.getAddress(), targetAddress = await target.getAddress();
    await expect(c.registry.connect(c.winner).claimAndRedeem(sourceAddress, targetAddress)).to.emit(c.registry, "CreditRedeemed")
      .withArgs(sourceAddress, targetAddress, c.winner.address, 2n, PRICE);
    expect(await target.totalMinted()).to.equal(2n); expect(await target.totalMintRevenue()).to.equal(2n * PRICE);
    expect(await target.prizeAmount()).to.equal(PRICE); expect(await target.affiliatePoolAmount()).to.equal(2000n);
    expect(await target.affiliateClaimable(1)).to.equal(2000n); expect(await target.totalReferredMints()).to.equal(1n);
    expect(await target.ownerOf(2)).to.equal(c.winner.address); expect(await c.registry.sponsorBalance(targetAddress)).to.equal(0n);
    expect(await c.registry.totalSponsorBalance()).to.equal(0n);
    await settle(c, target);
    expect(await target.prizePaidAmount()).to.equal(PRICE); expect(await target.withdrawableBalance()).to.equal(8000n);
    await target.connect(c.other).claimAffiliateCommission(c.recipient.address);
    await target.withdraw(c.owner.address, 8000n);
    expect(await ethers.provider.getBalance(targetAddress)).to.equal(0n);
  });

  it("records multiple qualifying wins before spending, but allows only one lifetime sponsored mint", async () => {
    const c = await loadFixture(fundedFixture);
    await settle(c, c.target);
    const third = await createTarget(c, { fund: 2n * PRICE });
    for (const source of [c.source, c.target]) {
      await c.registry.connect(c.outsider).claimCredit(await source.getAddress());
    }
    expect(await c.registry.redeemedSource(c.winner.address)).to.equal(ethers.ZeroAddress);
    await c.registry.connect(c.winner).redeem(await c.target.getAddress(), await third.getAddress());
    expect(await third.totalMinted()).to.equal(1n);
    expect(await third.ownerOf(1)).to.equal(c.winner.address);
    expect(await c.registry.redeemedSource(c.winner.address)).to.equal(await c.target.getAddress());
    await expect(c.registry.connect(c.winner).redeem(await c.source.getAddress(), await third.getAddress())).to.be.revertedWithCustomError(c.registry, "LifetimeRewardAlreadyUsed");
    await expect(c.registry.connect(c.winner).claimAndRedeem(await c.source.getAddress(), await third.getAddress())).to.be.revertedWithCustomError(c.registry, "LifetimeRewardAlreadyUsed");
    expect((await c.registry.credits(await c.source.getAddress())).redeemedTokenId).to.equal(0n);
    expect((await c.registry.credits(await c.target.getAddress())).redeemedTokenId).to.equal(1n);
    expect(await c.registry.sponsorBalance(await third.getAddress())).to.equal(PRICE);
    await settle(c, third);
    await expect(c.registry.claimCredit(await third.getAddress())).to.be.revertedWithCustomError(c.registry, "LifetimeRewardAlreadyUsed");
    expect((await c.registry.credits(await third.getAddress())).beneficiary).to.equal(ethers.ZeroAddress);
  });

  it("keeps every other winning wallet's lifetime redemption independent", async () => {
    const c = await loadFixture(fundedFixture);
    await settle(c, c.target, c.other.address);
    const third = await createTarget(c, { fund: PRICE * 2n });
    await c.registry.connect(c.winner).claimAndRedeem(await c.source.getAddress(), await third.getAddress());
    await c.registry.connect(c.other).claimAndRedeem(await c.target.getAddress(), await third.getAddress());
    expect(await third.ownerOf(1)).to.equal(c.winner.address);
    expect(await third.ownerOf(2)).to.equal(c.other.address);
    expect(await c.registry.redeemedSource(c.winner.address)).to.equal(await c.source.getAddress());
    expect(await c.registry.redeemedSource(c.other.address)).to.equal(await c.target.getAddress());
    expect(await c.registry.sponsorBalance(await third.getAddress())).to.equal(0n);
  });

  it("shares the lifetime cap across factories without letting permissionless claims pick the source", async () => {
    const c = await loadFixture(settledFixture);
    const { factory: otherFactory, round: earlierTarget } = await independentRound(c);
    await c.registry.approveFactory(await otherFactory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await otherFactory.getAddress())));
    await c.registry.registerCollection(await otherFactory.getAddress(), 1);
    await c.registry.fundCollection(await earlierTarget.getAddress(), { value: PRICE });
    await earlierTarget.fundRandomness({ value: await c.coordinator.MOCK_FEE() }); await earlierTarget.activateSale();
    const secondWin = await createTarget(c);
    await settle(c, secondWin);
    await c.registry.connect(c.outsider).claimCredit(await secondWin.getAddress());
    await c.registry.connect(c.outsider).claimCredit(await c.source.getAddress());
    await expect(c.registry.connect(c.winner).redeem(await secondWin.getAddress(), await earlierTarget.getAddress())).to.be.revertedWithCustomError(c.registry, "NotFutureCollection");
    // A stranger's earlier claim of the newer win cannot stop using the older eligible source.
    await c.registry.connect(c.winner).redeem(await c.source.getAddress(), await earlierTarget.getAddress());
    expect(await earlierTarget.ownerOf(1)).to.equal(c.winner.address);
    const laterTarget = await createTarget(c, { fund: PRICE });
    await expect(c.registry.connect(c.winner).redeem(await secondWin.getAddress(), await laterTarget.getAddress())).to.be.revertedWithCustomError(c.registry, "LifetimeRewardAlreadyUsed");
    expect(await laterTarget.totalMinted()).to.equal(0n);
    expect(await c.registry.sponsorBalance(await laterTarget.getAddress())).to.equal(PRICE);
  });

  for (const first of ["native", "legacy"] as const) {
    it(`shares one lifetime cap between native and legacy evidence when ${first} is spent first`, async () => {
      const c = await loadFixture(fixture);
      const wins = [
        { sourceRound: c.outsider.address, holder: c.winner.address, tokenId: "1", paidAt: String(await time.latest()), transactionHash: ethers.id("legacy-win-1") },
        { sourceRound: c.recipient.address, holder: c.winner.address, tokenId: "2", paidAt: String(await time.latest()), transactionHash: ethers.id("legacy-win-2") },
        { sourceRound: c.other.address, holder: c.other.address, tokenId: "3", paidAt: String(await time.latest()), transactionHash: ethers.id("legacy-other-wallet") },
      ];
      const tree = buildLegacyCreditChain(31337, wins), legacy = tree.entries.find(entry => entry.sourceRound === c.outsider.address.toLowerCase())!;
      const extraWin = tree.entries.find(entry => entry.sourceRound === c.recipient.address.toLowerCase())!;
      const otherWin = tree.entries.find(entry => entry.holder === c.other.address.toLowerCase())!;
      const registry = await ethers.deployContract("ManekinekoWinnerCredits", [c.owner.address, tree.root]);
      await registry.approveFactory(await c.factory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await c.factory.getAddress())));
      await registry.registerCollection(await c.factory.getAddress(), 1);
      await settle(c);
      const target = await createTarget(c, { activate: false });
      await registry.registerCollection(await c.factory.getAddress(), 2);
      await registry.fundCollection(await target.getAddress(), { value: PRICE * 2n });
      await target.fundRandomness({ value: await c.coordinator.MOCK_FEE() }); await target.activateSale();
      await registry.connect(c.outsider).claimCredit(await c.source.getAddress());
      await registry.connect(c.outsider).claimLegacyCredit(legacy, legacy.proof);
      const firstSource = first === "native" ? await c.source.getAddress() : legacy.sourceRound;
      const unusedSource = first === "native" ? legacy.sourceRound : await c.source.getAddress();
      await registry.connect(c.winner).redeem(firstSource, await target.getAddress());
      expect((await registry.redeemedSource(c.winner.address)).toLowerCase()).to.equal(firstSource.toLowerCase());
      await expect(registry.connect(c.winner).redeem(unusedSource, await target.getAddress())).to.be.revertedWithCustomError(registry, "LifetimeRewardAlreadyUsed");
      await expect(registry.claimLegacyCredit(extraWin, extraWin.proof)).to.be.revertedWithCustomError(registry, "LifetimeRewardAlreadyUsed");
      await registry.connect(c.other).redeemLegacy(otherWin, otherWin.proof, await target.getAddress());
      expect(await target.totalMinted()).to.equal(2n);
      expect(await target.ownerOf(1)).to.equal(c.winner.address);
      expect(await target.ownerOf(2)).to.equal(c.other.address);
      expect(await registry.sponsorBalance(await target.getAddress())).to.equal(0n);
      expect((await registry.credits(unusedSource)).redeemedIn).to.equal(ethers.ZeroAddress);
    });
  }

  it("supports already-claimed claimAndRedeem and cannot spend the credit twice", async () => {
    const c = await loadFixture(fundedFixture), source = await c.source.getAddress(), target = await c.target.getAddress();
    await c.registry.claimCredit(source);
    await c.registry.connect(c.winner).claimAndRedeem(source, target);
    await expect(c.registry.connect(c.winner).claimAndRedeem(source, target)).to.be.revertedWithCustomError(c.registry, "CreditAlreadyRedeemed");
    expect(await c.registry.sponsorBalance(target)).to.equal(PRICE);
  });

  it("requires a genuinely later registered collection, including across approved factories", async () => {
    const c = await loadFixture(fixture);
    const { factory: earlyFactory, round: early } = await independentRound(c);
    await c.registry.approveFactory(await earlyFactory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await earlyFactory.getAddress())));
    await c.registry.registerCollection(await earlyFactory.getAddress(), 1);
    await settle(c);
    await c.registry.claimCredit(await c.source.getAddress());
    await expect(c.registry.connect(c.winner).redeem(await c.source.getAddress(), await c.source.getAddress())).to.be.revertedWithCustomError(c.registry, "NotFutureCollection");
    await expect(c.registry.connect(c.winner).redeem(await c.source.getAddress(), await early.getAddress())).to.be.revertedWithCustomError(c.registry, "NotFutureCollection");
    const target = await createTarget(c, { fund: PRICE });
    expect((await c.registry.collections(await target.getAddress())).sequence).to.equal(3n);
    await c.registry.connect(c.winner).redeem(await c.source.getAddress(), await target.getAddress());
    await settle(c, target);
    await expect(c.registry.claimCredit(await target.getAddress())).to.be.revertedWithCustomError(c.registry, "LifetimeRewardAlreadyUsed");
  });

  it("rejects a target registered after reveal but before successful prize settlement", async () => {
    const c = await loadFixture(fixture);
    await c.source.mint(c.winner.address, 2, { value: PRICE * 2n });
    await c.source.requestRandomness(); await c.coordinator.fulfillRequest(await c.source.requestId(), 234n); await c.source.finalizeDraw(8);
    const { factory: otherFactory, round: target } = await independentRound(c);
    await c.registry.approveFactory(await otherFactory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await otherFactory.getAddress())));
    await c.registry.registerCollection(await otherFactory.getAddress(), 1);
    await c.source.distributePrize();
    await c.registry.claimCredit(await c.source.getAddress());
    const credit = await c.registry.credits(await c.source.getAddress());
    expect(credit.earnedAt).to.equal(await c.source.prizePaidAt());
    expect(credit.earnedAt).to.be.greaterThan(await c.source.finalizedAt());
    await c.registry.fundCollection(await target.getAddress(), { value: PRICE });
    await target.fundRandomness({ value: await c.coordinator.MOCK_FEE() }); await target.activateSale();
    await expect(c.registry.connect(c.winner).redeem(await c.source.getAddress(), await target.getAddress())).to.be.revertedWithCustomError(c.registry, "NotFutureCollection");
  });

  it("requires a later timestamp even when target registration happens inside the settlement transaction", async () => {
    const c = await loadFixture(fixture), receiver = await ethers.deployContract("WinnerCreditReceiver");
    await c.source.mint(await receiver.getAddress(), 2, { value: PRICE * 2n });
    await c.source.requestRandomness(); await c.coordinator.fulfillRequest(await c.source.requestId(), 234n); await c.source.finalizeDraw(8);
    const { factory: otherFactory, round: target } = await independentRound(c);
    await c.registry.approveFactory(await otherFactory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await otherFactory.getAddress())));
    await receiver.configure(false, false, await c.registry.getAddress(), c.registry.interface.encodeFunctionData("registerCollection", [await otherFactory.getAddress(), 1]), ethers.ZeroAddress);
    await c.source.distributePrize();
    expect(await receiver.attackSucceeded()).to.equal(true);
    expect((await c.registry.collections(await target.getAddress())).registeredAt).to.equal(await c.source.prizePaidAt());
    await receiver.configure(false, false, ethers.ZeroAddress, "0x", ethers.ZeroAddress);
    await c.registry.fundCollection(await target.getAddress(), { value: PRICE });
    await target.fundRandomness({ value: await c.coordinator.MOCK_FEE() }); await target.activateSale();
    await expect(receiver.execute(await c.registry.getAddress(), c.registry.interface.encodeFunctionData("claimAndRedeem", [await c.source.getAddress(), await target.getAddress()]))).to.be.revertedWithCustomError(c.registry, "NotFutureCollection");
    const later = await createTarget(c, { fund: PRICE });
    await receiver.execute(await c.registry.getAddress(), c.registry.interface.encodeFunctionData("claimAndRedeem", [await c.source.getAddress(), await later.getAddress()]));
    expect(await later.ownerOf(1)).to.equal(await receiver.getAddress());
  });

  it("recovers a late registered winner without treating that source as a mint target", async () => {
    const c = await loadFixture(settledFixture);
    const registry = await ethers.deployContract("ManekinekoWinnerCredits", [c.owner.address, ethers.ZeroHash]);
    await registry.approveFactory(await c.factory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await c.factory.getAddress())));
    const target = await createTarget(c, { activate: false });
    await registry.registerCollection(await c.factory.getAddress(), 2);
    expect((await registry.collections(await target.getAddress())).rewardsOnly).to.equal(false);
    await registry.fundCollection(await target.getAddress(), { value: PRICE });
    await target.fundRandomness({ value: await c.coordinator.MOCK_FEE() }); await target.activateSale();
    await registry.registerCollection(await c.factory.getAddress(), 1);
    const sourceInfo = await registry.collections(await c.source.getAddress());
    expect(sourceInfo.rewardsOnly).to.equal(true);
    expect(sourceInfo.sequence).to.equal(2n);
    await expect(registry.fundCollection(await c.source.getAddress(), { value: PRICE })).to.be.revertedWithCustomError(registry, "MintUnavailable");
    await registry.claimCredit(await c.source.getAddress());
    expect((await registry.credits(await c.source.getAddress())).sourceSequence).to.equal(0n);
    expect((await registry.credits(await c.source.getAddress())).earnedAt).to.equal(await c.source.prizePaidAt());
    await registry.connect(c.winner).redeem(await c.source.getAddress(), await target.getAddress());
    expect(await target.ownerOf(1)).to.equal(c.winner.address);
  });

  it("does not consume a credit when inactive, unfunded or sold out, even if another target has funds", async () => {
    const c = await loadFixture(settledFixture);
    const target = await createTarget(c, { activate: false });
    const sourceAddress = await c.source.getAddress(), targetAddress = await target.getAddress();
    await expect(c.registry.connect(c.winner).claimAndRedeem(sourceAddress, targetAddress)).to.be.revertedWithCustomError(c.registry, "MintUnavailable");
    expect((await c.registry.credits(sourceAddress)).beneficiary).to.equal(ethers.ZeroAddress);
    await target.fundRandomness({ value: await c.coordinator.MOCK_FEE() }); await target.activateSale();
    await c.registry.fundCollection(sourceAddress, { value: PRICE * 10n });
    await expect(c.registry.connect(c.winner).claimAndRedeem(sourceAddress, targetAddress)).to.be.revertedWithCustomError(c.registry, "InsufficientSponsorship");
    await c.registry.fundCollection(targetAddress, { value: PRICE - 1n });
    await expect(c.registry.connect(c.winner).claimAndRedeem(sourceAddress, targetAddress)).to.be.revertedWithCustomError(c.registry, "InsufficientSponsorship");
    await target.mint(c.other.address, 2, { value: PRICE * 2n });
    await expect(c.registry.connect(c.winner).claimAndRedeem(sourceAddress, targetAddress)).to.be.revertedWithCustomError(c.registry, "MintUnavailable");
    expect((await c.registry.credits(sourceAddress)).beneficiary).to.equal(ethers.ZeroAddress);
    expect(await c.registry.sponsorBalance(targetAddress)).to.equal(PRICE - 1n);
  });

  it("rejects expired and cancelled targets without consuming an earned credit", async () => {
    const c = await loadFixture(fundedFixture), source = await c.source.getAddress(), target = await c.target.getAddress();
    await time.increaseTo(await c.target.mintDeadline());
    await expect(c.registry.connect(c.winner).claimAndRedeem(source, target)).to.be.revertedWithCustomError(c.registry, "MintUnavailable");
    await c.target.cancelExpiredRound();
    await expect(c.registry.connect(c.winner).claimAndRedeem(source, target)).to.be.revertedWithCustomError(c.registry, "MintUnavailable");
    expect((await c.registry.credits(source)).beneficiary).to.equal(ethers.ZeroAddress);
    expect(await c.registry.sponsorBalance(target)).to.equal(2n * PRICE);
  });

  it("keeps expired/cancelled targets unavailable and pays full unsold refunds without restoring spent credits", async () => {
    const c = await loadFixture(fundedFixture), source = await c.source.getAddress(), target = await c.target.getAddress();
    await c.registry.connect(c.winner).claimAndRedeem(source, target);
    expect(await c.registry.totalFunded(target)).to.equal(2n * PRICE);
    await time.increaseTo(await c.target.mintDeadline());
    await expect(c.target.connect(c.winner).refund(1, c.recipient.address)).to.changeEtherBalance(ethers, c.recipient, PRICE);
    expect(await c.target.totalRefunded()).to.equal(PRICE);
    expect((await c.registry.credits(source)).redeemedIn).to.equal(target);
    expect(await c.registry.redeemedSource(c.winner.address)).to.equal(source);
    await expect(c.registry.connect(c.winner).redeem(source, target)).to.be.revertedWithCustomError(c.registry, "CreditAlreadyRedeemed");
    await expect(c.registry.claimCredit(target)).to.be.revertedWithCustomError(c.registry, "CreditUnavailable");
    expect(await c.target.cancelled()).to.equal(true);
    await c.registry.withdrawSponsorship(target, c.owner.address, PRICE);
    expect(await c.registry.totalSponsorBalance()).to.equal(0n);
  });

  it("rechecks factory code and round mapping instead of trusting cached registration", async () => {
    const c = await loadFixture(fundedFixture);
    await networkHelpers.setCode(await c.factory.getAddress(), "0x00");
    await expect(c.registry.claimCredit(await c.source.getAddress())).to.be.revertedWithCustomError(c.registry, "InvalidFactory");
    await expect(c.registry.fundCollection(await c.target.getAddress(), { value: PRICE })).to.be.revertedWithCustomError(c.registry, "InvalidFactory");
  });

  it("rechecks a registered round's code and factory mapping", async () => {
    const c = await loadFixture(settledFixture);
    const target = await createTarget(c, { activate: false });
    const mutableFactory = await ethers.deployContract("MutableWinnerCreditFactory");
    const registry = await ethers.deployContract("ManekinekoWinnerCredits", [c.owner.address, ethers.ZeroHash]);
    await mutableFactory.setRound(2, await target.getAddress());
    await registry.approveFactory(await mutableFactory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await mutableFactory.getAddress())));
    await registry.registerCollection(await mutableFactory.getAddress(), 2);
    await mutableFactory.setRound(2, c.other.address);
    await expect(registry.fundCollection(await target.getAddress(), { value: PRICE })).to.be.revertedWithCustomError(registry, "InvalidCollection");
    await mutableFactory.setRound(2, await target.getAddress());
    await networkHelpers.setCode(await target.getAddress(), "0x00");
    await expect(registry.fundCollection(await target.getAddress(), { value: PRICE })).to.be.revertedWithCustomError(registry, "InvalidCollection");
  });

  it("accounts per target, rejects direct ETH, and limits withdrawals to owner and unspent amounts", async () => {
    const c = await loadFixture(fundedFixture), target = await c.target.getAddress();
    await expect(c.registry.fundCollection(c.other.address, { value: PRICE })).to.be.revertedWithCustomError(c.registry, "CollectionNotRegistered");
    await expect(c.registry.fundCollection(target)).to.be.revertedWithCustomError(c.registry, "InvalidAmount");
    await expect(c.owner.sendTransaction({ to: await c.registry.getAddress(), value: PRICE })).to.revert(ethers);
    await expect(c.registry.connect(c.other).withdrawSponsorship(target, c.other.address, PRICE)).to.be.revertedWithCustomError(c.registry, "OwnableUnauthorizedAccount");
    await expect(c.registry.withdrawSponsorship(target, ethers.ZeroAddress, PRICE)).to.be.revertedWithCustomError(c.registry, "InvalidRecipient");
    await expect(c.registry.withdrawSponsorship(target, c.owner.address, PRICE * 3n)).to.be.revertedWithCustomError(c.registry, "InvalidAmount");
    await expect(c.registry.withdrawSponsorship(target, c.recipient.address, PRICE)).to.changeEtherBalance(ethers, c.recipient, PRICE);
    expect(await c.registry.sponsorBalance(target)).to.equal(PRICE);
    expect(await c.registry.totalSponsorBalance()).to.equal(PRICE);
    expect(await c.registry.totalFunded(target)).to.equal(2n * PRICE);
    const force = await ethers.deployContract("ForceEther", [], { value: PRICE }); await force.force(await c.registry.getAddress());
    expect(await ethers.provider.getBalance(await c.registry.getAddress())).to.equal(PRICE * 2n);
    expect(await c.registry.totalSponsorBalance()).to.equal(PRICE);
    expect(await c.registry.totalFunded(target)).to.equal(2n * PRICE);
    await expect(c.registry.withdrawSponsorship(target, c.recipient.address, PRICE * 2n)).to.be.revertedWithCustomError(c.registry, "InvalidAmount");
  });

  it("rolls failed withdrawal state back", async () => {
    const c = await loadFixture(fundedFixture), target = await c.target.getAddress();
    const receiver = await ethers.deployContract("WinnerCreditReceiver");
    await receiver.configure(false, true, ethers.ZeroAddress, "0x", ethers.ZeroAddress);
    await expect(c.registry.withdrawSponsorship(target, await receiver.getAddress(), PRICE)).to.be.revertedWithCustomError(c.registry, "TransferFailed");
    expect(await c.registry.sponsorBalance(target)).to.equal(2n * PRICE);
    expect(await c.registry.totalSponsorBalance()).to.equal(2n * PRICE);
  });

  it("uses immutable double-hashed, chain-bound legacy proofs and awards each source only once", async () => {
    const c = await loadFixture(settledFixture);
    const wins = [
      { sourceRound: await c.source.getAddress(), holder: c.winner.address, tokenId: "1", paidAt: String(await time.latest()), transactionHash: ethers.id("canonical-paid-1") },
      { sourceRound: c.other.address, holder: c.winner.address, tokenId: "2", paidAt: String(await time.latest()), transactionHash: ethers.id("canonical-paid-2") },
      { sourceRound: c.recipient.address, holder: c.recipient.address, tokenId: "3", paidAt: String(await time.latest()), transactionHash: ethers.id("canonical-paid-3") },
    ];
    const tree = buildLegacyCreditChain(31337, wins);
    const registry = await ethers.deployContract("ManekinekoWinnerCredits", [c.owner.address, tree.root]);
    expect(await registry.legacyMerkleRoot()).to.equal(tree.root);
    for (const entry of tree.entries) {
      expect(await registry.legacyLeaf(entry)).to.equal(legacyCreditLeaf(31337, entry));
      await registry.connect(c.outsider).claimLegacyCredit(entry, entry.proof);
      expect((await registry.credits(entry.sourceRound)).beneficiary.toLowerCase()).to.equal(entry.holder);
      expect((await registry.credits(entry.sourceRound)).sourceSequence).to.equal(0n);
      await expect(registry.claimLegacyCredit(entry, entry.proof)).to.be.revertedWithCustomError(registry, "CreditAlreadyIssued");
    }
    const wrongChain = await ethers.deployContract("ManekinekoWinnerCredits", [c.owner.address, buildLegacyCreditChain(11155111, wins).root]);
    await expect(wrongChain.claimLegacyCredit(tree.entries[0], tree.entries[0].proof)).to.be.revertedWithCustomError(wrongChain, "InvalidLegacyProof");
  });

  it("rejects altered legacy holder, source, token, timestamp, transaction and proof", async () => {
    const c = await loadFixture(settledFixture);
    const win = { sourceRound: await c.source.getAddress(), holder: c.winner.address, tokenId: "1", paidAt: String(await time.latest()), transactionHash: ethers.id("canonical") };
    const registry = await ethers.deployContract("ManekinekoWinnerCredits", [c.owner.address, legacyCreditLeaf(31337, win)]);
    for (const change of [{ holder: c.other.address }, { sourceRound: c.other.address }, { tokenId: "2" }, { paidAt: "1" }, { transactionHash: ethers.id("fake") }]) {
      await expect(registry.claimLegacyCredit({ ...win, ...change }, [])).to.be.revertedWithCustomError(registry, "InvalidLegacyProof");
    }
    await expect(registry.claimLegacyCredit(win, [ethers.id("bad sibling")])).to.be.revertedWithCustomError(registry, "InvalidLegacyProof");
    await expect(c.registry.claimLegacyCredit(win, [])).to.be.revertedWithCustomError(c.registry, "InvalidLegacyProof");
    const future = { ...win, paidAt: String(BigInt(await time.latest()) + 86_400n) };
    const futureRegistry = await ethers.deployContract("ManekinekoWinnerCredits", [c.owner.address, legacyCreditLeaf(31337, future)]);
    await expect(futureRegistry.claimLegacyCredit(future, [])).to.be.revertedWithCustomError(futureRegistry, "InvalidLegacyProof");
  });

  it("allows a legacy winner to redeem once, while rejecting other callers atomically", async () => {
    const c = await loadFixture(settledFixture);
    const win = { sourceRound: await c.source.getAddress(), holder: c.winner.address, tokenId: "1", paidAt: String(await time.latest()), transactionHash: ethers.id("canonical") };
    const registry = await ethers.deployContract("ManekinekoWinnerCredits", [c.owner.address, legacyCreditLeaf(31337, win)]);
    const target = await createTarget(c, { activate: false });
    await registry.approveFactory(await c.factory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await c.factory.getAddress())));
    await registry.registerCollection(await c.factory.getAddress(), 2);
    await registry.fundCollection(await target.getAddress(), { value: PRICE });
    await target.fundRandomness({ value: await c.coordinator.MOCK_FEE() }); await target.activateSale();
    await expect(registry.connect(c.other).redeemLegacy(win, [], await target.getAddress())).to.be.revertedWithCustomError(registry, "NotBeneficiary");
    expect((await registry.credits(win.sourceRound)).beneficiary).to.equal(ethers.ZeroAddress);
    await registry.connect(c.winner).redeemLegacy(win, [], await target.getAddress());
    expect(await target.ownerOf(1)).to.equal(c.winner.address);
    await expect(registry.connect(c.winner).redeemLegacy(win, [], await target.getAddress())).to.be.revertedWithCustomError(registry, "CreditAlreadyRedeemed");
  });

  it("rolls back rejecting NFT callbacks, then prevents reentrant spending without losing a valid mint", async () => {
    const c = await loadFixture(fixture), receiver = await ethers.deployContract("WinnerCreditReceiver");
    await settle(c, c.source, await receiver.getAddress());
    const target = await createTarget(c, { fund: PRICE * 2n });
    const sourceAddress = await c.source.getAddress(), targetAddress = await target.getAddress(), registryAddress = await c.registry.getAddress();
    const redeem = c.registry.interface.encodeFunctionData("claimAndRedeem", [sourceAddress, targetAddress]);
    await receiver.configure(true, false, ethers.ZeroAddress, "0x", ethers.ZeroAddress);
    await expect(receiver.execute(registryAddress, redeem)).to.be.revertedWith("NFT rejected");
    expect((await c.registry.credits(sourceAddress)).beneficiary).to.equal(ethers.ZeroAddress);
    expect(await c.registry.redeemedSource(await receiver.getAddress())).to.equal(ethers.ZeroAddress);
    expect(await c.registry.sponsorBalance(targetAddress)).to.equal(2n * PRICE);
    expect(await target.totalMinted()).to.equal(0n); expect(await target.totalMintRevenue()).to.equal(0n);
    await receiver.configure(false, false, registryAddress, redeem, ethers.ZeroAddress);
    await receiver.execute(registryAddress, redeem);
    expect(await receiver.attackSucceeded()).to.equal(false); expect(await receiver.attackCount()).to.equal(1n);
    expect(await receiver.attackResult()).to.equal(c.registry.interface.getError("ReentrancyGuardReentrantCall")!.selector);
    expect(await target.totalMinted()).to.equal(1n); expect(await target.ownerOf(1)).to.equal(await receiver.getAddress());
    expect(await c.registry.sponsorBalance(targetAddress)).to.equal(PRICE);
    expect((await c.registry.credits(sourceAddress)).redeemedIn).to.equal(targetAddress);
    expect(await c.registry.redeemedSource(await receiver.getAddress())).to.equal(sourceAddress);
  });
});
