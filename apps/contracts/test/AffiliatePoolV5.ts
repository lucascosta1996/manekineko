import { expect } from "chai";
import { network } from "hardhat";
import { allocateAffiliatePool } from "@manekineko/contract-abi/affiliate-pool";

const { ethers, networkHelpers } = await network.create();
const { time, loadFixture } = networkHelpers;
const PRICE = 10_000n;
const TYPES = { Enrollment: [
  { name: "applicant", type: "address" }, { name: "affiliateId", type: "uint256" },
  { name: "poolBps", type: "uint256" }, { name: "nonce", type: "bytes32" }, { name: "deadline", type: "uint256" },
] };
async function fixture() {
  const [owner, signer, first, second, idle, buyer, recipient] = await ethers.getSigners();
  const coordinator = await ethers.deployContract("VRFCoordinatorV2Mock");
  const renderer = await ethers.deployContract("ManekinekoRendererV5");
  const config = { name: "Referral pool", symbol: "POOL", roundId: 1n, maxSupply: 10n, mintPrice: PRICE,
    mintDeadline: BigInt(await time.latest()) + 86400n, initialOwner: owner.address, vrfCoordinator: await coordinator.getAddress(),
    keyHash: ethers.id("mock-vrf-key"), requestConfirmations: 64, callbackGasLimit: 200_000,
    maxAffiliateSlots: 20n, enrollmentSigner: signer.address, prizeBps: 5000n, affiliatePoolBps: 1000n };
  const round = await ethers.deployContract("ManekinekoRoundV5", [config, await renderer.getAddress()]);
  return { round, coordinator, renderer, config, owner, signer, first, second, idle, buyer, recipient };
}
type Context = Awaited<ReturnType<typeof fixture>>;
async function offer(c: Context, applicant: string, id: number, poolBps = c.config.affiliatePoolBps, version = "3") {
  const nonce = ethers.hexlify(ethers.randomBytes(32)), deadline = BigInt(await time.latest()) + 600n;
  const signature = await c.signer.signTypedData({ name: "ManekinekoAffiliateEnrollment", version,
    chainId: 31337, verifyingContract: await c.round.getAddress() }, TYPES, { applicant, affiliateId: id, poolBps, nonce, deadline });
  return { applicant, id, poolBps, nonce, deadline, signature };
}
async function enroll(c: Context, wallet: Context["first"], id: number) {
  const p = await offer(c, wallet.address, id);
  await c.round.connect(wallet).enrollAffiliate(p.applicant, p.id, p.poolBps, p.nonce, p.deadline, p.signature);
  return p;
}
async function activate(c: Context) {
  await c.round.fundRandomness({ value: await c.coordinator.MOCK_FEE() });
  await c.round.activateSale();
}
async function settle(c: Context) {
  await c.round.requestRandomness();
  await c.coordinator.fulfillRequest(await c.round.requestId(), 234n);
  await c.round.finalizeDraw(8);
  await c.round.distributePrize();
}
async function mint(c: Context, count: number, id = 0) {
  const call = id ? c.round.connect(c.buyer).mintWithAffiliate(c.buyer.address, count, id, { value: PRICE * BigInt(count) })
    : c.round.connect(c.buyer).mint(c.buyer.address, count, { value: PRICE * BigInt(count) });
  return (await call).wait();
}
describe("V5 shared pool accounting", function () {
  this.timeout(180_000);
  it("binds the immutable pool in enrollment and rejects another pool, domain or replay", async () => {
    const c = await loadFixture(fixture);
    for (const [pool, version, error] of [[2000n, "3", "AffiliatePoolMismatch"], [1000n, "2", "InvalidEnrollment"]] as const) {
      const p = await offer(c, c.first.address, 1, pool, version);
      await expect(c.round.connect(c.first).enrollAffiliate(p.applicant, p.id, p.poolBps, p.nonce, p.deadline, p.signature)).to.be.revertedWithCustomError(c.round, error);
    }
    const p = await enroll(c, c.first, 1);
    await expect(c.round.connect(c.first).enrollAffiliate(p.applicant, p.id, p.poolBps, p.nonce, p.deadline, p.signature)).to.be.revertedWithCustomError(c.round, "AffiliateAlreadyEnrolled");
    const substituted = await offer(c, c.second.address, 2);
    await expect(c.round.connect(c.second).enrollAffiliate(substituted.applicant, 3, substituted.poolBps, substituted.nonce, substituted.deadline, substituted.signature)).to.be.revertedWithCustomError(c.round, "InvalidEnrollment");
  });
  for (const slots of [10n, 20n, 100n]) it(`reserves the same pool with ${slots} positions and pays only actual referral shares`, async () => {
    const base = await loadFixture(fixture), config = { ...base.config, maxAffiliateSlots: slots };
    const round = await ethers.deployContract("ManekinekoRoundV5", [config, await base.renderer.getAddress()]);
    const c = { ...base, config, round };
    await enroll(c, c.first, 1); await enroll(c, c.second, 2); await enroll(c, c.idle, 3); await activate(c);
    await mint(c, 2, 1); await mint(c, 3, 2); await mint(c, 5);
    expect(await round.affiliatePoolAmount()).to.equal(10_000n);
    expect(await round.affiliateClaimable(1)).to.equal(4_000n);
    expect(await round.affiliateClaimable(2)).to.equal(6_000n);
    expect(await round.affiliateClaimable(3)).to.equal(0n);
    expect(await round.totalReferredMints()).to.equal(5n);
    await settle(c);
    expect(await round.prizePaidAmount()).to.equal(50_000n);
    expect(await round.withdrawableBalance()).to.equal(40_000n);
    await round.withdraw(c.owner.address, 40_000n);
    await round.connect(c.second).claimAffiliateCommission(c.recipient.address);
    await round.connect(c.first).claimAffiliateCommission(c.recipient.address);
    expect(await ethers.provider.getBalance(await round.getAddress())).to.equal(0n);
    await expect(round.connect(c.first).claimAffiliateCommission(c.recipient.address)).to.be.revertedWithCustomError(round, "AffiliateClaimUnavailable");
  });
  it("keeps pre-sellout amounts provisional and includes direct sales in the pool", async () => {
    const c = await loadFixture(fixture);
    await enroll(c, c.first, 1); await enroll(c, c.second, 2); await activate(c);
    await mint(c, 1, 1); await mint(c, 3);
    expect(await c.round.affiliateEstimatedShare(1)).to.equal(4000n);
    expect(await c.round.affiliateAccrued(1)).to.equal(0n);
    expect(await c.round.affiliateClaimable(1)).to.equal(0n);
    await expect(c.round.connect(c.first).claimAffiliateCommission(c.recipient.address)).to.be.revertedWithCustomError(c.round, "AffiliateClaimUnavailable");
    await mint(c, 4, 2);
    expect(await c.round.affiliateEstimatedShare(1)).to.equal(1600n);
    expect(await c.round.withdrawableBalance()).to.equal(0n);
  });
  it("allocates to all 100 active positions within a bounded final-mint gas budget", async () => {
    const base = await loadFixture(fixture), config = { ...base.config, maxAffiliateSlots: 100n, maxSupply: 101n };
    const round = await ethers.deployContract("ManekinekoRoundV5", [config, await base.renderer.getAddress()]);
    const c = { ...base, config, round };
    for (let id = 1; id <= 100; id++) {
      const wallet = await ethers.getImpersonatedSigner(ethers.getAddress(ethers.toBeHex(10_000 + id, 20)));
      await networkHelpers.setBalance(wallet.address, ethers.parseEther("1"));
      await enroll(c, wallet, id);
    }
    await activate(c);
    for (let id = 1; id <= 100; id++) await mint(c, 1, id);
    const receipt = await mint(c, 1);
    expect(receipt!.gasUsed).to.be.lessThan(4_000_000n);
    expect(await round.totalAffiliateAccrued()).to.equal(101_000n);
    for (let id = 1; id <= 100; id++) expect(await round.affiliateClaimable(id)).to.equal(1010n);
  });
  it("fully refunds unsold collections without releasing the pool or operator reserve", async () => {
    const c = await loadFixture(fixture);
    await enroll(c, c.first, 1); await activate(c); await mint(c, 2, 1);
    await time.increaseTo(c.config.mintDeadline);
    expect(await c.round.affiliateEstimatedShare(1)).to.equal(0n);
    expect(await c.round.withdrawableBalance()).to.equal(0n);
    await c.round.connect(c.buyer).refund(1, c.buyer.address); await c.round.connect(c.buyer).refund(2, c.buyer.address);
    expect(await c.round.totalRefunded()).to.equal(PRICE * 2n);
    expect(await c.round.totalAffiliateAccrued()).to.equal(0n);
  });
  it("releases an unused pool only after the winner is paid when there are no referrals", async () => {
    const c = await loadFixture(fixture); await activate(c); await mint(c, 10);
    expect(await c.round.totalAffiliateAccrued()).to.equal(0n);
    expect(await c.round.withdrawableBalance()).to.equal(0n);
    await settle(c); expect(await c.round.withdrawableBalance()).to.equal(50_000n);
  });
  it("allocates every wei with sparse positions and indivisible shares", async () => {
    const c = await loadFixture(fixture);
    await enroll(c, c.first, 1); await enroll(c, c.second, 10); await enroll(c, c.idle, 20); await activate(c);
    await mint(c, 1, 1); await mint(c, 1, 10); await mint(c, 1, 20); await mint(c, 7);
    const expected = allocateAffiliatePool(100_000n, 1000n, Array.from({ length: 20 }, (_, i) => [0, 9, 19].includes(i) ? 1n : 0n));
    const actual = await Promise.all(expected.map((_, i) => c.round.affiliateAccrued(i + 1)));
    expect(actual).to.deep.equal(expected); expect(actual.reduce((sum, n) => sum + n, 0n)).to.equal(10_000n);
    await settle(c); await c.round.withdraw(c.owner.address, 40_000n);
    for (const wallet of [c.idle, c.first, c.second]) await c.round.connect(wallet).claimAffiliateCommission(c.recipient.address);
    expect(await ethers.provider.getBalance(await c.round.getAddress())).to.equal(0n);
  });
  it("rejects oversubscribed pools and invalid primary payments, including direct self-referral", async () => {
    const c = await loadFixture(fixture);
    for (const affiliatePoolBps of [5001n, 10001n]) await expect(ethers.deployContract("ManekinekoRoundV5", [{ ...c.config, affiliatePoolBps }, await c.renderer.getAddress()])).to.be.revertedWithCustomError(c.round, "InvalidConfig");
    await enroll(c, c.first, 1); await activate(c);
    await expect(c.round.connect(c.first).mintWithAffiliate(c.buyer.address, 1, 1, { value: PRICE })).to.be.revertedWithCustomError(c.round, "SelfReferral");
    await expect(c.round.connect(c.buyer).mintWithAffiliate(c.buyer.address, 1, 1, { value: PRICE - 1n })).to.be.revertedWithCustomError(c.round, "InvalidPayment");
    expect(await c.round.totalReferredMints()).to.equal(0n);
  });
  for (const [prizeBps, affiliatePoolBps] of [[0n, 10000n], [10000n, 0n], [0n, 0n], [5000n, 3000n]]) it(`settles the ${prizeBps}/${affiliatePoolBps} bps boundary`, async () => {
    const base = await loadFixture(fixture), config = { ...base.config, prizeBps, affiliatePoolBps };
    const round = await ethers.deployContract("ManekinekoRoundV5", [config, await base.renderer.getAddress()]);
    const c = { ...base, config, round }; await enroll(c, c.first, 1); await activate(c); await mint(c, 10, 1); await settle(c);
    expect(await round.totalAffiliateAccrued()).to.equal(10n * affiliatePoolBps);
    expect(await round.withdrawableBalance()).to.equal(100_000n - 10n * (prizeBps + affiliatePoolBps));
  });
});
