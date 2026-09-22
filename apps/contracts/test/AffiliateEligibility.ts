import { expect } from "chai";
import { artifacts, network } from "hardhat";

const { ethers, networkHelpers } = await network.create();
const { loadFixture, time } = networkHelpers;
const PRICE = 10_000n;
const types = { Enrollment: [
  { name: "applicant", type: "address" }, { name: "affiliateId", type: "uint256" }, { name: "poolBps", type: "uint256" },
  { name: "sourceCollection", type: "address" }, { name: "sourceTokenId", type: "uint256" },
  { name: "nonce", type: "bytes32" }, { name: "deadline", type: "uint256" },
] };

async function fixture() {
  const [owner, signer, alice, bob, carol, buyer] = await ethers.getSigners();
  const coordinator = await ethers.deployContract("VRFCoordinatorV2Mock");
  const gate = await ethers.deployContract("ManekinekoAffiliateEligibility", [owner.address]);
  const factory = await ethers.deployContract("ManekinekoFactoryV6", [owner.address]);
  await gate.approveFactory(await factory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await factory.getAddress())));
  const config = {
    name: "Eligibility collection", symbol: "ELIG", roundId: 1n, maxSupply: 4n, mintPrice: PRICE,
    seasonId: ethers.id("eligibility-season"), seasonName: "Eligibility Season", collectionColor: "#F6F3E9", textColor: "#000000",
    mintDeadline: BigInt(await time.latest()) + 86_400n, initialOwner: owner.address, vrfCoordinator: await coordinator.getAddress(),
    keyHash: ethers.id("local-key"), requestConfirmations: 64, callbackGasLimit: 200_000,
    maxAffiliateSlots: 2n, enrollmentSigner: signer.address, prizeBps: 5000n, affiliatePoolBps: 1000n,
    affiliateEligibility: await gate.getAddress(),
  };
  await factory.createRound(config);
  const first = await ethers.getContractAt("ManekinekoRoundV6", await factory.rounds(1));
  return { owner, signer, alice, bob, carol, buyer, coordinator, gate, factory, config, first };
}
type Context = Awaited<ReturnType<typeof fixture>>;
type Round = Context["first"];
async function register(c: Context, round: Round = c.first) { await c.gate.registerCollection(await c.factory.getAddress(), await round.roundId()); }
async function activate(c: Context, round: Round = c.first) {
  await round.fundRandomness({ value: await c.coordinator.MOCK_FEE() }); await round.activateSale();
}
async function complete(c: Context, round: Round = c.first) {
  if (!await round.saleActivated()) await activate(c, round);
  const left = await round.maxSupply() - await round.totalMinted();
  if (left) await round.connect(c.buyer).mint(c.alice.address, left, { value: PRICE * left });
  await round.requestRandomness(); await c.coordinator.fulfillRequest(await round.requestId(), 234n);
  await round.finalizeDraw(8); await round.distributePrize();
}
async function next(c: Context) {
  const id = await c.factory.roundCount() + 1n;
  await c.factory.createRound({ ...c.config, roundId: id, mintDeadline: BigInt(await time.latest()) + 86_400n });
  const round = await ethers.getContractAt("ManekinekoRoundV6", await c.factory.rounds(id));
  await register(c, round); return round;
}
async function secondFixture() {
  const c = await fixture(); await register(c); await complete(c); const second = await next(c); return { ...c, second };
}
async function permit(c: Context, round: Round, applicant: string, affiliateId = 1n, sourceCollection = ethers.ZeroAddress, sourceTokenId = 0n, nonce = ethers.hexlify(ethers.randomBytes(32)), domain: Record<string, unknown> = {}) {
  const values = { applicant, affiliateId, poolBps: 1000n, sourceCollection, sourceTokenId, nonce, deadline: BigInt(await time.latest()) + 600n };
  const signature = await c.signer.signTypedData({ name: "ManekinekoAffiliateEnrollment", version: "4", chainId: 31337, verifyingContract: await round.getAddress(), ...domain }, types, values);
  return { ...values, signature };
}
type Permit = Awaited<ReturnType<typeof permit>>;
function args(p: Permit): [string, bigint, bigint, string, bigint, string, bigint, string] {
  return [p.applicant, p.affiliateId, p.poolBps, p.sourceCollection, p.sourceTokenId, p.nonce, p.deadline, p.signature];
}

describe("Canonical NFT-backed affiliate eligibility", function () {
  this.timeout(180_000);

  it("pins reviewed factories and lets only registry governance append canonical collections", async () => {
    const c = await loadFixture(fixture), address = await c.factory.getAddress();
    expect(await c.gate.ELIGIBILITY_VERSION()).to.equal("affiliate-eligibility-v1");
    await expect(c.gate.connect(c.alice).registerCollection(address, 1)).to.be.revertedWithCustomError(c.gate, "OwnableUnauthorizedAccount");
    await expect(c.gate.connect(c.alice).approveFactory(address, ethers.ZeroHash)).to.be.revertedWithCustomError(c.gate, "OwnableUnauthorizedAccount");
    await expect(c.gate.approveFactory(c.alice.address, ethers.id("code"))).to.be.revertedWithCustomError(c.gate, "InvalidFactory");
    await expect(c.gate.approveFactory(address, ethers.keccak256(await ethers.provider.getCode(address)))).to.be.revertedWithCustomError(c.gate, "FactoryAlreadyApproved");
    await expect(c.gate.registerCollection(c.alice.address, 1)).to.be.revertedWithCustomError(c.gate, "InvalidFactory");
    await expect(c.gate.registerCollection(address, 99)).to.be.revertedWithCustomError(c.gate, "InvalidCollection");
    await expect(c.gate.registerCollection(address, 1)).to.emit(c.gate, "CollectionRegistered").withArgs(await c.first.getAddress(), address, 1n, 1n, false);
    await expect(c.gate.registerCollection(address, 1)).to.be.revertedWithCustomError(c.gate, "CollectionAlreadyRegistered");
    expect(await c.gate.lastCollection()).to.equal(await c.first.getAddress());
    await expect(c.gate.renounceOwnership()).to.be.revertedWithCustomError(c.gate, "OwnershipRenunciationDisabled");
  });

  it("cannot activate or enroll a round before canonical registration and cannot call consumption directly", async () => {
    const c = await loadFixture(fixture), p = await permit(c, c.first, c.alice.address);
    await c.first.fundRandomness({ value: await c.coordinator.MOCK_FEE() });
    await expect(c.first.activateSale()).to.be.revertedWithCustomError(c.gate, "CollectionNotRegistered");
    await expect(c.first.connect(c.alice).enrollAffiliate(...args(p))).to.be.revertedWithCustomError(c.gate, "EligibilityRequired").withArgs(1);
    await register(c);
    await expect(c.gate.connect(c.alice).consumeEnrollment(...args(p))).to.be.revertedWithCustomError(c.gate, "EligibilityRequired").withArgs(1);
    expect(await c.first.affiliateCount()).to.equal(0n);
    expect(await c.first.enrollmentNonceUsed(p.nonce)).to.equal(false);
  });

  it("opens the sole bootstrap without an NFT, binds caller and slot, and preserves nonce replay protection", async () => {
    const c = await loadFixture(fixture); await register(c);
    const p = await permit(c, c.first, c.alice.address);
    expect(await c.gate.eligibilityStatus(await c.first.getAddress(), c.alice.address, ethers.ZeroAddress, 0)).to.equal(0n);
    await expect(c.first.connect(c.bob).enrollAffiliate(...args(p))).to.be.revertedWithCustomError(c.first, "InvalidEnrollment");
    await expect(c.first.connect(c.alice).enrollAffiliate(...args(p))).to.emit(c.gate, "EligibilityConsumed")
      .withArgs(await c.first.getAddress(), c.alice.address, ethers.ZeroAddress, 0n, 1n, p.nonce);
    expect(await c.first.affiliateWallet(1)).to.equal(c.alice.address);
    expect(await c.first.enrollmentNonceUsed(p.nonce)).to.equal(true);
    expect(await c.gate.enrollmentNonceUsed(await c.first.getAddress(), p.nonce)).to.equal(true);
    const replay = await permit(c, c.first, c.bob.address, 2n, ethers.ZeroAddress, 0n, p.nonce);
    await expect(c.first.connect(c.bob).enrollAffiliate(...args(replay))).to.be.revertedWithCustomError(c.gate, "EnrollmentNonceUsed");
    await expect(c.first.connect(c.alice).enrollAffiliate(...args(p))).to.be.revertedWithCustomError(c.first, "AffiliateAlreadyEnrolled");
  });

  it("requires a completed earlier official NFT from the second collection onward", async () => {
    const c = await loadFixture(secondFixture), source = await c.first.getAddress(), target = await c.second.getAddress();
    expect((await c.gate.collections(target)).sequence).to.equal(2n);
    const noNFT = await permit(c, c.second, c.bob.address);
    await expect(c.second.connect(c.bob).enrollAffiliate(...args(noNFT))).to.be.revertedWithCustomError(c.gate, "EligibilityRequired").withArgs(2);
    const otherOwner = await permit(c, c.second, c.bob.address, 1n, source, 1n);
    await expect(c.second.connect(c.bob).enrollAffiliate(...args(otherOwner))).to.be.revertedWithCustomError(c.gate, "EligibilityRequired").withArgs(3);
    expect(await c.gate.eligibilityStatus(target, c.alice.address, source, 999)).to.equal(3n);
    expect(await c.gate.eligibilityStatus(target, c.alice.address, target, 1)).to.equal(2n);
    expect(await c.gate.eligibilityStatus(target, c.alice.address, c.alice.address, 1)).to.equal(2n);
    const p = await permit(c, c.second, c.alice.address, 1n, source, 1n);
    await c.second.connect(c.alice).enrollAffiliate(...args(p));
    expect(await c.gate.usedToken(target, source, 1)).to.equal(true);
    expect(await c.second.affiliateIdOf(c.alice.address)).to.equal(1n);
  });

  it("checks current ownership again after a signed permit and permits the new holder's own bound permit", async () => {
    const c = await loadFixture(secondFixture), source = await c.first.getAddress(), target = await c.second.getAddress();
    const stale = await permit(c, c.second, c.alice.address, 1n, source, 1n);
    await c.first.connect(c.alice).transferFrom(c.alice.address, c.bob.address, 1);
    await expect(c.second.connect(c.alice).enrollAffiliate(...args(stale))).to.be.revertedWithCustomError(c.gate, "EligibilityRequired").withArgs(3);
    expect(await c.gate.usedToken(target, source, 1)).to.equal(false);
    expect(await c.first.enrollmentNonceUsed(stale.nonce)).to.equal(false);
    const valid = await permit(c, c.second, c.bob.address, 1n, source, 1n);
    await c.second.connect(c.bob).enrollAffiliate(...args(valid));
    expect(await c.second.affiliateWallet(1)).to.equal(c.bob.address);
  });

  it("allows only one position per token per destination despite transfers, and one position per wallet", async () => {
    const c = await loadFixture(secondFixture), source = await c.first.getAddress(), target = await c.second.getAddress();
    const alice = await permit(c, c.second, c.alice.address, 1n, source, 1n);
    await c.second.connect(c.alice).enrollAffiliate(...args(alice));
    await c.first.connect(c.alice).transferFrom(c.alice.address, c.bob.address, 1);
    const recycled = await permit(c, c.second, c.bob.address, 2n, source, 1n);
    await expect(c.second.connect(c.bob).enrollAffiliate(...args(recycled))).to.be.revertedWithCustomError(c.gate, "EligibilityRequired").withArgs(4);
    const secondPosition = await permit(c, c.second, c.alice.address, 2n, source, 2n);
    await expect(c.second.connect(c.alice).enrollAffiliate(...args(secondPosition))).to.be.revertedWithCustomError(c.second, "AffiliateAlreadyEnrolled");
    expect(await c.gate.usedToken(target, source, 2)).to.equal(false);
    await c.first.connect(c.alice).transferFrom(c.alice.address, c.bob.address, 2);
    const bob = await permit(c, c.second, c.bob.address, 2n, source, 2n);
    await c.second.connect(c.bob).enrollAffiliate(...args(bob));
    expect(await c.second.affiliateCount()).to.equal(2n);
    expect(await c.gate.usedToken(target, source, 1)).to.equal(true);
    expect(await c.gate.usedToken(target, source, 2)).to.equal(true);
  });

  it("permits any earlier completed source and reuses that NFT only for a different destination", async () => {
    const c = await loadFixture(secondFixture), first = await c.first.getAddress(), second = await c.second.getAddress();
    await c.second.connect(c.alice).enrollAffiliate(...args(await permit(c, c.second, c.alice.address, 1n, first, 1n)));
    await complete(c, c.second); const third = await next(c), target = await third.getAddress();
    const sourceBound = await permit(c, third, c.alice.address, 1n, first, 1n);
    await expect(third.connect(c.alice).enrollAffiliate(...args({ ...sourceBound, sourceCollection: second }))).to.be.revertedWithCustomError(c.gate, "InvalidEnrollment");
    await c.first.connect(c.alice).transferFrom(c.alice.address, c.bob.address, 1);
    await c.second.connect(c.alice).transferFrom(c.alice.address, c.carol.address, 1);
    await third.connect(c.bob).enrollAffiliate(...args(await permit(c, third, c.bob.address, 1n, first, 1n)));
    await third.connect(c.carol).enrollAffiliate(...args(await permit(c, third, c.carol.address, 2n, second, 1n)));
    expect(await c.gate.usedToken(target, first, 1)).to.equal(true);
    expect(await c.gate.usedToken(target, second, 1)).to.equal(true);
    expect(await third.affiliateWallet(1)).to.equal(c.bob.address);
    expect(await third.affiliateWallet(2)).to.equal(c.carol.address);
  });

  it("preserves the registered affiliate and earned commissions after the qualifying NFT is sold", async () => {
    const c = await loadFixture(secondFixture), source = await c.first.getAddress();
    await c.second.connect(c.alice).enrollAffiliate(...args(await permit(c, c.second, c.alice.address, 1n, source, 1n)));
    await c.first.connect(c.alice).transferFrom(c.alice.address, c.bob.address, 1);
    await activate(c, c.second);
    await c.second.connect(c.buyer).mintWithAffiliate(c.buyer.address, 4, 1, { value: PRICE * 4n });
    expect(await c.second.affiliateClaimable(1)).to.equal(4_000n);
    await expect(c.second.connect(c.alice).claimAffiliateCommission(c.alice.address)).to.changeEtherBalance(ethers, c.alice, 4_000n);
    expect(await c.second.affiliateWallet(1)).to.equal(c.alice.address);
    expect(await c.gate.usedToken(await c.second.getAddress(), source, 1)).to.equal(true);
  });

  it("binds every permit field, the destination, chain and domain version without consuming failed eligibility", async () => {
    const c = await loadFixture(secondFixture), source = await c.first.getAddress(), target = await c.second.getAddress();
    const p = await permit(c, c.second, c.alice.address, 1n, source, 1n);
    for (const change of [{ affiliateId: 2n }, { sourceTokenId: 2n }, { nonce: ethers.id("mutated") }, { deadline: p.deadline + 1n }]) {
      await expect(c.second.connect(c.alice).enrollAffiliate(...args({ ...p, ...change }))).to.be.revertedWithCustomError(c.gate, "InvalidEnrollment");
    }
    await expect(c.second.connect(c.alice).enrollAffiliate(...args({ ...p, sourceCollection: ethers.ZeroAddress }))).to.be.revertedWithCustomError(c.gate, "EligibilityRequired").withArgs(2);
    await expect(c.second.connect(c.alice).enrollAffiliate(...args({ ...p, poolBps: 999n }))).to.be.revertedWithCustomError(c.second, "AffiliatePoolMismatch");
    for (const domain of [{ chainId: 1 }, { verifyingContract: source }, { verifyingContract: await c.gate.getAddress() }, { version: "3" }]) {
      const invalid = await permit(c, c.second, c.alice.address, 1n, source, 1n, ethers.hexlify(ethers.randomBytes(32)), domain);
      await expect(c.second.connect(c.alice).enrollAffiliate(...args(invalid))).to.be.revertedWithCustomError(c.gate, "InvalidEnrollment");
    }
    const wrongSigner = await c.bob.signTypedData({ name: "ManekinekoAffiliateEnrollment", version: "4", chainId: 31337, verifyingContract: target }, types, p);
    await expect(c.second.connect(c.alice).enrollAffiliate(...args({ ...p, signature: wrongSigner }))).to.be.revertedWithCustomError(c.gate, "InvalidEnrollment");
    await expect(c.second.connect(c.alice).enrollAffiliate(...args({ ...p, signature: "0x" }))).to.be.revertedWithCustomError(c.gate, "ECDSAInvalidSignatureLength");
    expect(await c.gate.usedToken(target, source, 1)).to.equal(false);
    expect(await c.gate.usedToken(target, source, 2)).to.equal(false);
    expect(await c.second.enrollmentNonceUsed(p.nonce)).to.equal(false);
    await c.second.connect(c.alice).enrollAffiliate(...args(p));
  });

  it("keeps slots and NFTs available when a signed position is already taken or permit is expired", async () => {
    const c = await loadFixture(secondFixture), source = await c.first.getAddress(), target = await c.second.getAddress();
    await c.first.connect(c.alice).transferFrom(c.alice.address, c.bob.address, 2);
    const alice = await permit(c, c.second, c.alice.address, 1n, source, 1n), bob = await permit(c, c.second, c.bob.address, 1n, source, 2n);
    await c.second.connect(c.alice).enrollAffiliate(...args(alice));
    await expect(c.second.connect(c.bob).enrollAffiliate(...args(bob))).to.be.revertedWithCustomError(c.second, "AffiliatePositionUnavailable");
    expect(await c.gate.usedToken(target, source, 2)).to.equal(false); expect(await c.second.enrollmentNonceUsed(bob.nonce)).to.equal(false);
    const expired = await permit(c, c.second, c.bob.address, 2n, source, 2n);
    await time.increaseTo(expired.deadline + 1n);
    await expect(c.second.connect(c.bob).enrollAffiliate(...args(expired))).to.be.revertedWithCustomError(c.second, "InvalidEnrollment");
    expect(await c.gate.usedToken(target, source, 2)).to.equal(false);
  });

  it("closes eligibility on activation, expiry and cancellation without consuming any NFT", async () => {
    const c = await loadFixture(secondFixture), source = await c.first.getAddress(), target = await c.second.getAddress();
    const p = await permit(c, c.second, c.alice.address, 1n, source, 1n);
    await activate(c, c.second);
    expect(await c.gate.eligibilityStatus(target, c.alice.address, source, 1)).to.equal(5n);
    await expect(c.second.connect(c.alice).enrollAffiliate(...args(p))).to.be.revertedWithCustomError(c.second, "EnrollmentClosed");
    await time.increaseTo(await c.second.mintDeadline()); await c.second.cancelExpiredRound();
    expect(await c.gate.eligibilityStatus(target, c.alice.address, source, 1)).to.equal(5n);
    expect(await c.gate.usedToken(target, source, 1)).to.equal(false);
  });

  it("has only one bootstrap across factories and refuses rollover before the preceding official round finishes", async () => {
    const c = await loadFixture(fixture); await register(c);
    const anotherFactory = await ethers.deployContract("ManekinekoFactoryV6", [c.owner.address]);
    await c.gate.approveFactory(await anotherFactory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await anotherFactory.getAddress())));
    await anotherFactory.createRound(c.config); const second = await ethers.getContractAt("ManekinekoRoundV6", await anotherFactory.rounds(1));
    await expect(c.gate.registerCollection(await anotherFactory.getAddress(), 1)).to.be.revertedWithCustomError(c.gate, "PreviousCollectionUnfinished");
    await activate(c); await c.first.mint(c.alice.address, 4, { value: PRICE * 4n });
    await c.first.requestRandomness(); await c.coordinator.fulfillRequest(await c.first.requestId(), 234n); await c.first.finalizeDraw(8);
    await expect(c.gate.registerCollection(await anotherFactory.getAddress(), 1)).to.be.revertedWithCustomError(c.gate, "PreviousCollectionUnfinished");
    await c.first.distributePrize(); await c.gate.registerCollection(await anotherFactory.getAddress(), 1);
    expect((await c.gate.collections(await second.getAddress())).sequence).to.equal(2n);
    expect(await c.gate.eligibilityStatus(await second.getAddress(), c.bob.address, ethers.ZeroAddress, 0)).to.equal(2n);
    await second.connect(c.alice).enrollAffiliate(...args(await permit(c, second, c.alice.address, 1n, await c.first.getAddress(), 1n)));
  });

  it("advances after a failed first collection without reopening bootstrap or accepting its refundable NFTs", async () => {
    const c = await loadFixture(fixture); await register(c); await activate(c);
    await c.first.mint(c.alice.address, 1, { value: PRICE });
    await time.increaseTo(await c.first.mintDeadline());
    const anotherFactory = await ethers.deployContract("ManekinekoFactoryV6", [c.owner.address]);
    await c.gate.approveFactory(await anotherFactory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await anotherFactory.getAddress())));
    await anotherFactory.createRound({ ...c.config, mintDeadline: BigInt(await time.latest()) + 86_400n });
    const second = await ethers.getContractAt("ManekinekoRoundV6", await anotherFactory.rounds(1));
    await c.gate.registerCollection(await anotherFactory.getAddress(), 1);
    expect((await c.gate.collections(await second.getAddress())).sequence).to.equal(2n);
    expect(await c.gate.eligibilityStatus(await second.getAddress(), c.alice.address, ethers.ZeroAddress, 0)).to.equal(2n);
    expect(await c.gate.eligibilityStatus(await second.getAddress(), c.alice.address, await c.first.getAddress(), 1)).to.equal(6n);
    await second.fundRandomness({ value: await c.coordinator.MOCK_FEE() }); await second.activateSale();
    await second.connect(c.buyer).mint(c.buyer.address, 1, { value: PRICE });
    expect(await second.affiliateCount()).to.equal(0n);
  });

  it("imports a completed immutable V5 collection as an authenticated source and consumes bootstrap once", async () => {
    const c = await loadFixture(fixture);
    const factory = await ethers.deployContract("ManekinekoFactoryV5", [c.owner.address]);
    await factory.createRound(c.config);
    const legacy = await ethers.getContractAt("ManekinekoRoundV5", await factory.rounds(1));
    await c.gate.approveFactory(await factory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await factory.getAddress())));
    await expect(c.gate.registerCollection(await factory.getAddress(), 1)).to.be.revertedWithCustomError(c.gate, "InvalidCollection");
    await legacy.fundRandomness({ value: await c.coordinator.MOCK_FEE() }); await legacy.activateSale();
    await legacy.mint(c.alice.address, 4, { value: PRICE * 4n });
    await legacy.requestRandomness(); await c.coordinator.fulfillRequest(await legacy.requestId(), 234n); await legacy.finalizeDraw(8); await legacy.distributePrize();
    await c.gate.registerCollection(await factory.getAddress(), 1);
    const old = await c.gate.collections(await legacy.getAddress());
    expect(old.sourceOnly).to.equal(true); expect(old.sequence).to.equal(1n);
    await register(c);
    expect((await c.gate.collections(await c.first.getAddress())).sequence).to.equal(2n);
    expect(await c.gate.eligibilityStatus(await legacy.getAddress(), c.alice.address, ethers.ZeroAddress, 0)).to.equal(1n);
    await c.first.connect(c.alice).enrollAffiliate(...args(await permit(c, c.first, c.alice.address, 1n, await legacy.getAddress(), 1n)));
    expect(await c.gate.usedToken(await c.first.getAddress(), await legacy.getAddress(), 1)).to.equal(true);
  });

  it("rejects targets bound to another registry and rechecks the pinned round code on every use", async () => {
    const c = await loadFixture(fixture);
    const otherGate = await ethers.deployContract("ManekinekoAffiliateEligibility", [c.owner.address]);
    await otherGate.approveFactory(await c.factory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await c.factory.getAddress())));
    await expect(otherGate.registerCollection(await c.factory.getAddress(), 1)).to.be.revertedWithCustomError(otherGate, "InvalidCollection");
    await register(c);
    await networkHelpers.setCode(await c.first.getAddress(), "0x00");
    await expect(c.gate.requireRegistered(await c.first.getAddress())).to.be.revertedWithCustomError(c.gate, "InvalidCollection");
  });

  it("fails closed if an approved factory runtime changes", async () => {
    const c = await loadFixture(secondFixture), source = await c.first.getAddress(), target = await c.second.getAddress();
    await networkHelpers.setCode(await c.factory.getAddress(), "0x00");
    await expect(c.gate.eligibilityStatus(target, c.alice.address, source, 1)).to.be.revertedWithCustomError(c.gate, "InvalidFactory");
  });

  it("rejects registration of an expired or cancelled V6 round", async () => {
    const c = await loadFixture(fixture);
    await time.increaseTo(await c.first.mintDeadline());
    await expect(c.gate.registerCollection(await c.factory.getAddress(), 1)).to.be.revertedWithCustomError(c.gate, "InvalidCollection");
    await c.first.cancelExpiredRound();
    await expect(c.gate.registerCollection(await c.factory.getAddress(), 1)).to.be.revertedWithCustomError(c.gate, "InvalidCollection");
    expect(await c.gate.collectionCount()).to.equal(0n);
  });

  it("rechecks the factory's round mapping after registration", async () => {
    const c = await loadFixture(fixture);
    const mutable = await ethers.deployContract("MutableWinnerCreditFactory");
    await mutable.setRound(1, await c.first.getAddress());
    await c.gate.approveFactory(await mutable.getAddress(), ethers.keccak256(await ethers.provider.getCode(await mutable.getAddress())));
    await c.gate.registerCollection(await mutable.getAddress(), 1);
    await mutable.setRound(1, c.bob.address);
    await expect(c.gate.requireRegistered(await c.first.getAddress())).to.be.revertedWithCustomError(c.gate, "InvalidCollection");
    await expect(c.gate.eligibilityStatus(await c.first.getAddress(), c.alice.address, ethers.ZeroAddress, 0)).to.be.revertedWithCustomError(c.gate, "InvalidCollection");
  });

  it("keeps the deployer and gate deployable and bounds a qualified enrollment's gas", async () => {
    for (const name of ["ManekinekoRoundV6", "ManekinekoRoundDeployerV6", "ManekinekoFactoryV6", "ManekinekoAffiliateEligibility"]) {
      const artifact = await artifacts.readArtifact(name);
      expect((artifact.deployedBytecode.length - 2) / 2, name).to.be.at.most(24_576);
      expect((artifact.bytecode.length - 2) / 2, name).to.be.lessThan(49_152);
    }
    const c = await loadFixture(secondFixture), p = await permit(c, c.second, c.alice.address, 1n, await c.first.getAddress(), 1n);
    expect(await c.second.connect(c.alice).enrollAffiliate.estimateGas(...args(p))).to.be.lessThan(350_000n);
  });
});
