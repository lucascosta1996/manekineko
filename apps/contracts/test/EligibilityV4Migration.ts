import { expect } from "chai";
import { network } from "hardhat";
const { ethers, networkHelpers } = await network.create();
const { time, loadFixture } = networkHelpers;

async function fixture() {
  const [owner, admission, buyer, other] = await ethers.getSigners();
  const coordinator = await ethers.deployContract("VRFCoordinatorV2Mock");
  const prior = await ethers.deployContract("ManekinekoAffiliateEligibilityV3", [owner.address]);
  const gate = await ethers.deployContract("ManekinekoAffiliateEligibilityV4", [owner.address]);
  const oldFactory = await ethers.deployContract("ManekinekoFactoryV8", [owner.address]);
  const factory = await ethers.deployContract("ManekinekoFactoryV9", [owner.address]);
  const oldAddress = await oldFactory.getAddress(), factoryAddress = await factory.getAddress();
  await prior.approveFactory(oldAddress, ethers.keccak256(await ethers.provider.getCode(oldAddress)));
  await gate.approveFactory(oldAddress, ethers.keccak256(await ethers.provider.getCode(oldAddress)));
  await gate.approveFactory(factoryAddress, ethers.keccak256(await ethers.provider.getCode(factoryAddress)));
  const start = BigInt(await time.latest()) + 3600n;
  const config = { name: "Historical V8", symbol: "V8", seasonId: ethers.id("migration"), seasonName: "Migration", collectionColor: "#330000", textColor: "#FFFFFF", roundId: 1n, maxSupply: 6n, mintPrice: 10_000n, mintDeadline: start + 86400n, saleStartAt: start, initialOwner: owner.address, vrfCoordinator: await coordinator.getAddress(), keyHash: ethers.id("mock-key"), requestConfirmations: 64, callbackGasLimit: 200000, maxAffiliateSlots: 2n, enrollmentSigner: admission.address, prizeBps: 6000n, winnerCount: 6n, affiliatePoolBps: 2000n, minAffiliateReferrals: 1n, affiliatePayoutCapBps: 3000n, affiliateEligibility: await prior.getAddress() };
  await oldFactory.createRound(config);
  const historical = await ethers.getContractAt("ManekinekoRoundV8", await oldFactory.rounds(1));
  await prior.registerCollection(oldAddress, 1);
  await historical.fundRandomness({ value: await coordinator.MOCK_FEE() });
  return { owner, admission, buyer, other, coordinator, prior, gate, oldFactory, factory, config, historical };
}

describe("V4 eligibility migration from immutable V8", function () {
  it("imports revealed V8 as source-only, preserves holders and never reopens the bootstrap", async () => {
    const c = await loadFixture(fixture), oldFactory = await c.oldFactory.getAddress(), oldRound = await c.historical.getAddress();
    await time.increaseTo(c.config.saleStartAt); await c.historical.activateSale();
    await c.historical.connect(c.buyer).mint(c.buyer.address, 6, { value: 60_000n });
    await expect(c.gate.registerCollection(oldFactory, 1)).revertedWithCustomError(c.gate, "InvalidCollection");
    await c.historical.requestRandomness(); await c.coordinator.fulfillRequest(await c.historical.requestId(), 123); await c.historical.finalizeDraw(8);
    expect(await c.historical.prizePaid()).eq(false); // Pending holder claims do not erase protected source rights.
    await c.gate.registerCollection(oldFactory, 1);
    expect((await c.gate.collections(oldRound)).sourceOnly).eq(true);
    await expect(c.gate.requireRegistered(oldRound)).revertedWithCustomError(c.gate, "InvalidCollection");
    expect(await c.gate.eligibilityStatus(oldRound, c.buyer.address, ethers.ZeroAddress, 0)).eq(1n);
    const start = BigInt(await time.latest()) + 3600n;
    await c.factory.createRound({ ...c.config, name: "New V9", symbol: "V9", affiliateEligibility: await c.gate.getAddress(), saleStartAt: start, mintDeadline: start + 86400n });
    const next = await c.factory.rounds(1); await c.gate.registerCollection(await c.factory.getAddress(), 1);
    expect((await c.gate.collections(next)).sequence).eq(2n);
    expect(await c.gate.eligibilityStatus(next, c.buyer.address, ethers.ZeroAddress, 0)).eq(2n);
    expect(await c.gate.eligibilityStatus(next, c.buyer.address, oldRound, 1)).eq(0n);
    expect(await c.gate.eligibilityStatus(next, c.other.address, oldRound, 1)).eq(3n);
    expect(await c.historical.CONTRACT_VERSION()).eq("affiliate-v8");
    await expect(c.gate.registerCollection(oldFactory, 1)).revertedWithCustomError(c.gate, "CollectionAlreadyRegistered");
  });
  it("rejects unactivated and failed old-registry V8 rounds as eligibility sources", async () => {
    const c = await loadFixture(fixture), factory = await c.oldFactory.getAddress();
    await expect(c.gate.registerCollection(factory, 1)).revertedWithCustomError(c.gate, "InvalidCollection");
    await time.increaseTo(c.config.mintDeadline); await c.historical.cancelExpiredRound();
    await expect(c.gate.registerCollection(factory, 1)).revertedWithCustomError(c.gate, "InvalidCollection");
  });
});
