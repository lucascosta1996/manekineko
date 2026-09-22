import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();
const { loadFixture, time } = networkHelpers;
const PRICE = 10_000n;
const types = { Enrollment: [
  { name: "applicant", type: "address" },
  { name: "affiliateId", type: "uint256" },
  { name: "commissionBps", type: "uint256" },
  { name: "nonce", type: "bytes32" },
  { name: "deadline", type: "uint256" },
] };

async function fixture() {
  const [owner, signer, affiliate, secondAffiliate, buyer, holder, destination, outsider] = await ethers.getSigners();
  const coordinator = await ethers.deployContract("VRFCoordinatorV2Mock");
  const renderer = await ethers.deployContract("ManekinekoRendererV4");
  const config = {
    name: "Affiliates", symbol: "NEKO3", roundId: 1n, maxSupply: 6n, mintPrice: PRICE,
    mintDeadline: BigInt(await time.latest()) + 86_400n, initialOwner: owner.address,
    vrfCoordinator: await coordinator.getAddress(), keyHash: ethers.id("test-vrf-key"),
    requestConfirmations: 64, callbackGasLimit: 100_000, maxAffiliateSlots: 10n, enrollmentSigner: signer.address,
    prizeBps: 5000n, affiliateRatesBps: Array<bigint>(10).fill(100n),
  };
  const round = await ethers.deployContract("ManekinekoRoundV4", [config, await renderer.getAddress()]);
  return { round, renderer, coordinator, config, owner, signer, affiliate, secondAffiliate, buyer, holder, destination, outsider };
}
type Context = Awaited<ReturnType<typeof fixture>>;
async function permit(context: Context, applicant = context.affiliate.address, overrides: {
  affiliateId?: bigint; commissionBps?: bigint; nonce?: string; deadline?: bigint; chainId?: bigint; verifyingContract?: string; signingWallet?: Context["signer"];
} = {}) {
  const affiliateId = overrides.affiliateId ?? await context.round.nextAvailableAffiliateId();
  const commissionBps = overrides.commissionBps ?? await context.round.affiliateRateBps(affiliateId);
  const nonce = overrides.nonce ?? ethers.hexlify(ethers.randomBytes(32));
  const deadline = overrides.deadline ?? BigInt(await time.latest()) + 600n;
  const signature = await (overrides.signingWallet ?? context.signer).signTypedData({
    name: "ManekinekoAffiliateEnrollment", version: "2",
    chainId: overrides.chainId ?? (await ethers.provider.getNetwork()).chainId,
    verifyingContract: overrides.verifyingContract ?? await context.round.getAddress(),
  }, types, { applicant, affiliateId, commissionBps, nonce, deadline });
  return { applicant, affiliateId, commissionBps, nonce, deadline, signature };
}
async function enroll(context: Context, applicant = context.affiliate) {
  const p = await permit(context, applicant.address);
  await context.round.connect(applicant).enrollAffiliate(p.applicant, p.affiliateId, p.commissionBps, p.nonce, p.deadline, p.signature);
  return p;
}
async function enrolledFixture() {
  const context = await fixture();
  await enroll(context);
  await enroll(context, context.secondAffiliate);
  await context.round.fundRandomness({ value: await context.coordinator.MOCK_FEE() });
  await context.round.activateSale();
  return context;
}
async function soldFixture() {
  const c = await enrolledFixture();
  await c.round.connect(c.buyer).mintWithAffiliate(c.holder.address, 2, 1, { value: PRICE * 2n });
  await c.round.connect(c.buyer).mintWithAffiliate(c.buyer.address, 1, 2, { value: PRICE });
  await c.round.connect(c.buyer).mint(c.buyer.address, 3, { value: PRICE * 3n });
  return c;
}
async function reveal(c: Context) {
  await c.round.requestRandomness();
  await c.coordinator.fulfillRequest(await c.round.requestId(), 923n);
  expect(await c.coordinator.lastCallbackSucceeded()).to.equal(true);
  await c.round.finalizeDraw(8);
}

// Public referral links are intentionally reusable; only successful paid mints accrue a commission.
describe("V4 affiliate enrollment, commission solvency and adversarial calls", function () {
  this.timeout(180_000);

  it("publishes immutable per-position rates, prize terms and the exact enrollment signing domain", async function () {
    const c = await loadFixture(fixture);
    expect(await c.round.CONTRACT_VERSION()).to.equal("affiliate-v4");
    expect(await c.round.ALGORITHM_VERSION()).to.equal("unique-rank-v2");
    expect(await c.round.affiliateRateBps(1)).to.equal(100n);
    expect(await c.round.prizeBps()).to.equal(5_000n);
    expect(await c.round.maxAffiliateSlots()).to.equal(10n);
    expect(await c.round.enrollmentSigner()).to.equal(c.signer.address);
    const domain = await c.round.eip712Domain();
    expect(domain.name).to.equal("ManekinekoAffiliateEnrollment");
    expect(domain.version).to.equal("2");
    expect(domain.chainId).to.equal(31337n);
    expect(domain.verifyingContract).to.equal(await c.round.getAddress());
    expect(await c.round.ENROLLMENT_TYPEHASH()).to.equal(ethers.id("Enrollment(address applicant,uint256 affiliateId,uint256 commissionBps,bytes32 nonce,uint256 deadline)"));
  });

  it("enrolls only the authorized applicant and prevents wallet reuse and owner enrollment bypass", async function () {
    const c = await loadFixture(fixture);
    const p = await permit(c);
    await expect(c.round.connect(c.outsider).enrollAffiliate(p.applicant, p.affiliateId, p.commissionBps, p.nonce, p.deadline, p.signature))
      .to.be.revertedWithCustomError(c.round, "InvalidEnrollment");
    await expect(c.round.connect(c.affiliate).enrollAffiliate(p.applicant, p.affiliateId, p.commissionBps, p.nonce, p.deadline, p.signature))
      .to.emit(c.round, "AffiliateEnrolled").withArgs(1, c.affiliate.address, 100n, p.nonce);
    expect(await c.round.affiliateWallet(1)).to.equal(c.affiliate.address);
    expect(await c.round.affiliateIdOf(c.affiliate.address)).to.equal(1n);
    expect(await c.round.enrollmentNonceUsed(p.nonce)).to.equal(true);
    await expect(c.round.connect(c.affiliate).enrollAffiliate(p.applicant, p.affiliateId, p.commissionBps, p.nonce, p.deadline, p.signature))
      .to.be.revertedWithCustomError(c.round, "AffiliateAlreadyEnrolled");
    const forged = await permit(c, c.owner.address, { signingWallet: c.owner });
    await expect(c.round.enrollAffiliate(forged.applicant, forged.affiliateId, forged.commissionBps, forged.nonce, forged.deadline, forged.signature))
      .to.be.revertedWithCustomError(c.round, "InvalidEnrollment");
  });

  it("rejects cross-chain, cross-collection and wrong-signer signatures without consuming nonces", async function () {
    const c = await loadFixture(fixture);
    const otherRound = await ethers.deployContract("ManekinekoRoundV4", [c.config, await c.renderer.getAddress()]);
    for (const override of [{ chainId: 1n }, { verifyingContract: await otherRound.getAddress() }, { signingWallet: c.outsider }]) {
      const p = await permit(c, c.affiliate.address, override);
      await expect(c.round.connect(c.affiliate).enrollAffiliate(p.applicant, p.affiliateId, p.commissionBps, p.nonce, p.deadline, p.signature))
        .to.be.revertedWithCustomError(c.round, "InvalidEnrollment");
      expect(await c.round.enrollmentNonceUsed(p.nonce)).to.equal(false);
    }
    expect(await c.round.affiliateCount()).to.equal(0n);
  });

  it("rejects altered signed fields, malformed signatures and high-s malleability", async function () {
    const c = await loadFixture(fixture);
    const p = await permit(c);
    for (const [applicant, nonce, deadline] of [
      [c.outsider.address, p.nonce, p.deadline],
      [p.applicant, ethers.id("altered"), p.deadline],
      [p.applicant, p.nonce, p.deadline + 1n],
    ] as const) {
      const caller = applicant === c.outsider.address ? c.outsider : c.affiliate;
      await expect(c.round.connect(caller).enrollAffiliate(applicant, p.affiliateId, p.commissionBps, nonce, deadline, p.signature))
        .to.be.revertedWithCustomError(c.round, "InvalidEnrollment");
    }
    await expect(c.round.connect(c.affiliate).enrollAffiliate(p.applicant, p.affiliateId, p.commissionBps, p.nonce, p.deadline, "0x1234"))
      .to.be.revertedWithCustomError(c.round, "ECDSAInvalidSignatureLength");
    const sig = ethers.Signature.from(p.signature);
    const curveOrder = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
    const malleable = ethers.concat([sig.r, ethers.toBeHex(curveOrder - BigInt(sig.s), 32), ethers.toBeHex(sig.v === 27 ? 28 : 27, 1)]);
    await expect(c.round.connect(c.affiliate).enrollAffiliate(p.applicant, p.affiliateId, p.commissionBps, p.nonce, p.deadline, malleable))
      .to.be.revertedWithCustomError(c.round, "ECDSAInvalidSignatureS");
  });

  it("prevents nonce reuse even when the admission service signs two distinct applicants", async function () {
    const c = await loadFixture(fixture);
    const p = await enroll(c);
    const reused = await permit(c, c.secondAffiliate.address, { nonce: p.nonce });
    await expect(c.round.connect(c.secondAffiliate).enrollAffiliate(reused.applicant, reused.affiliateId, reused.commissionBps, reused.nonce, reused.deadline, reused.signature))
      .to.be.revertedWithCustomError(c.round, "EnrollmentNonceUsed");
    expect(await c.round.affiliateCount()).to.equal(1n);
  });

  it("enforces ten slots even if the service authorizes eleven wallets", async function () {
    const c = await loadFixture(fixture);
    const applicants = (await ethers.getSigners()).slice(2, 13);
    for (const applicant of applicants.slice(0, 10)) await enroll(c, applicant);
    const eleventh = await permit(c, applicants[10].address);
    await expect(c.round.connect(applicants[10]).enrollAffiliate(eleventh.applicant, eleventh.affiliateId, eleventh.commissionBps, eleventh.nonce, eleventh.deadline, eleventh.signature))
      .to.be.revertedWithCustomError(c.round, "AffiliateCapacityReached");
    expect(await c.round.affiliateCount()).to.equal(10n);
    expect(await c.round.enrollmentNonceUsed(eleventh.nonce)).to.equal(false);
  });

  it("rejects expired permits, permits beyond the sale deadline, and enrollment after activation", async function () {
    const c = await loadFixture(fixture);
    for (const deadline of [BigInt(await time.latest()) - 1n, c.config.mintDeadline + 1n]) {
      const p = await permit(c, c.affiliate.address, { deadline });
      await expect(c.round.connect(c.affiliate).enrollAffiliate(p.applicant, p.affiliateId, p.commissionBps, p.nonce, p.deadline, p.signature))
        .to.be.revertedWithCustomError(c.round, "InvalidEnrollment");
    }
    const p = await permit(c);
    await c.round.fundRandomness({ value: 1n });
    await c.round.activateSale();
    await expect(c.round.connect(c.affiliate).enrollAffiliate(p.applicant, p.affiliateId, p.commissionBps, p.nonce, p.deadline, p.signature))
      .to.be.revertedWithCustomError(c.round, "EnrollmentClosed");
  });

  it("closes enrollment at an unactivated round's deadline", async function () {
    const c = await loadFixture(fixture);
    const p = await permit(c, c.affiliate.address, { deadline: c.config.mintDeadline });
    await time.increaseTo(c.config.mintDeadline);
    await expect(c.round.connect(c.affiliate).enrollAffiliate(p.applicant, p.affiliateId, p.commissionBps, p.nonce, p.deadline, p.signature))
      .to.be.revertedWithCustomError(c.round, "EnrollmentClosed");
  });

  it("validates affiliate config and exact percentage-compatible prices at deployment", async function () {
    const c = await loadFixture(fixture);
    for (const override of [
      { maxAffiliateSlots: 0n }, { maxAffiliateSlots: 101n }, { mintPrice: 2n }, { mintPrice: 101n },
      { enrollmentSigner: ethers.ZeroAddress }, { enrollmentSigner: await c.renderer.getAddress() },
    ]) {
      await expect(ethers.deployContract("ManekinekoRoundV4", [{ ...c.config, ...override }, await c.renderer.getAddress()]))
        .to.be.revertedWithCustomError(c.round, "InvalidConfig");
    }
    await expect(ethers.deployContract("ManekinekoRoundV4", [c.config, c.owner.address]))
      .to.be.revertedWithCustomError(c.round, "InvalidConfig");
  });

  it("accrues exactly 1% per paid batch, keeps 50% prize, and exposes no-usage versus pending states", async function () {
    const c = await loadFixture(enrolledFixture);
    expect(await c.round.affiliateAccrued(1)).to.equal(0n);
    await expect(c.round.connect(c.buyer).mintWithAffiliate(c.holder.address, 2, 1, { value: PRICE * 2n }))
      .to.emit(c.round, "AffiliateCommissionAccrued").withArgs(1, c.buyer.address, c.holder.address, 1, 2, PRICE * 2n / 100n);
    expect(await c.round.totalMintRevenue()).to.equal(PRICE * 2n);
    expect(await c.round.prizeAmount()).to.equal(PRICE);
    expect(await c.round.affiliateAccrued(1)).to.equal(PRICE * 2n / 100n);
    expect(await c.round.affiliateAccrued(2)).to.equal(0n);
    expect(await c.round.affiliateClaimable(1)).to.equal(0n);
    expect(await c.round.withdrawableBalance()).to.equal(0n);
    await expect(c.round.connect(c.affiliate).claimAffiliateCommission(c.affiliate.address))
      .to.be.revertedWithCustomError(c.round, "AffiliateClaimUnavailable");
  });

  it("rejects nonexistent, zero and self referrals and never accrues on failed payments", async function () {
    const c = await loadFixture(enrolledFixture);
    for (const id of [0, 3, 999]) {
      await expect(c.round.connect(c.buyer).mintWithAffiliate(c.buyer.address, 1, id, { value: PRICE }))
        .to.be.revertedWithCustomError(c.round, "InvalidAffiliate");
    }
    await expect(c.round.connect(c.affiliate).mintWithAffiliate(c.buyer.address, 1, 1, { value: PRICE }))
      .to.be.revertedWithCustomError(c.round, "SelfReferral");
    await expect(c.round.connect(c.buyer).mintWithAffiliate(c.affiliate.address, 1, 1, { value: PRICE }))
      .to.be.revertedWithCustomError(c.round, "SelfReferral");
    for (const value of [0n, PRICE - 1n, PRICE + 1n]) {
      await expect(c.round.connect(c.buyer).mintWithAffiliate(c.buyer.address, 1, 1, { value }))
        .to.be.revertedWithCustomError(c.round, "InvalidPayment");
    }
    expect(await c.round.totalAffiliateAccrued()).to.equal(0n);
    expect(await c.round.totalMinted()).to.equal(0n);
  });

  it("rolls back mint receipts and commissions when the NFT recipient rejects safe minting", async function () {
    const c = await loadFixture(enrolledFixture);
    await expect(c.round.connect(c.buyer).mintWithAffiliate(await c.renderer.getAddress(), 2, 1, { value: PRICE * 2n }))
      .to.be.revertedWithCustomError(c.round, "ERC721InvalidReceiver");
    expect(await c.round.totalMinted()).to.equal(0n);
    expect(await c.round.totalMintRevenue()).to.equal(0n);
    expect(await c.round.affiliateAccrued(1)).to.equal(0n);
    expect(await c.round.totalAffiliateAccrued()).to.equal(0n);
    expect(await ethers.provider.getBalance(await c.round.getAddress())).to.equal(0n);
  });

  it("allows reusable referral links only against new paid mints, including quantities split across transactions", async function () {
    const c = await loadFixture(enrolledFixture);
    for (let i = 0; i < 3; i++) await c.round.connect(c.buyer).mintWithAffiliate(c.buyer.address, 1, 1, { value: PRICE });
    await c.round.connect(c.buyer).mintWithAffiliate(c.buyer.address, 3, 2, { value: PRICE * 3n });
    expect(await c.round.affiliateAccrued(1)).to.equal(PRICE * 3n / 100n);
    expect(await c.round.affiliateAccrued(2)).to.equal(PRICE * 3n / 100n);
    expect(await c.round.totalAffiliateAccrued()).to.equal(await c.round.totalMintRevenue() / 100n);
    await expect(c.round.connect(c.buyer).mintWithAffiliate(c.buyer.address, 1, 1, { value: PRICE }))
      .to.be.revertedWithCustomError(c.round, "MintClosed");
  });

  it("allows sold-out claims before VRF while preserving the full winner reserve and preventing duplicate claims", async function () {
    const c = await loadFixture(soldFixture);
    const accrued = PRICE * 2n / 100n;
    expect(await c.round.randomnessRequested()).to.equal(false);
    expect(await c.round.affiliateClaimable(1)).to.equal(accrued);
    await expect(c.round.connect(c.affiliate).claimAffiliateCommission(c.destination.address))
      .to.changeEtherBalances(ethers, [c.round, c.destination], [-accrued, accrued]);
    expect(await c.round.affiliateClaimed(1)).to.equal(accrued);
    expect(await c.round.totalAffiliateClaimed()).to.equal(accrued);
    expect(await c.round.affiliateClaimable(1)).to.equal(0n);
    await expect(c.round.connect(c.affiliate).claimAffiliateCommission(c.destination.address))
      .to.be.revertedWithCustomError(c.round, "AffiliateClaimUnavailable");
    await expect(c.round.connect(c.outsider).claimAffiliateCommission(c.destination.address))
      .to.be.revertedWithCustomError(c.round, "AffiliateClaimUnavailable");
    expect(await c.round.withdrawableBalance()).to.equal(0n);
    await reveal(c);
    await c.round.distributePrize();
    expect(await c.round.prizePaidAmount()).to.equal(PRICE * 3n);
    expect(await c.round.withdrawableBalance()).to.equal(PRICE * 3n - PRICE * 3n / 100n);
  });

  it("reserves all unpaid commissions after prize payment and owner withdrawal, regardless of claim order", async function () {
    const c = await loadFixture(soldFixture);
    await reveal(c);
    await c.round.distributePrize();
    const operatorAmount = PRICE * 3n - PRICE * 3n / 100n;
    expect(await c.round.withdrawableBalance()).to.equal(operatorAmount);
    await expect(c.round.withdraw(c.owner.address, operatorAmount + 1n))
      .to.be.revertedWithCustomError(c.round, "InsufficientWithdrawableBalance");
    await c.round.withdraw(c.owner.address, operatorAmount);
    expect(await ethers.provider.getBalance(await c.round.getAddress())).to.equal(PRICE * 3n / 100n);
    expect(await c.round.withdrawableBalance()).to.equal(0n);
    for (const affiliate of [c.secondAffiliate, c.affiliate]) {
      await expect(c.round.connect(affiliate).claimAffiliateCommission(c.destination.address))
        .to.emit(c.round, "AffiliateCommissionClaimed");
    }
    expect(await ethers.provider.getBalance(await c.round.getAddress())).to.equal(0n);
    expect(await c.round.totalAffiliateClaimed()).to.equal(await c.round.totalAffiliateAccrued());
  });

  it("voids pending commissions on unsold expiry and preserves full refunds for transferred NFTs", async function () {
    const c = await loadFixture(enrolledFixture);
    await c.round.connect(c.buyer).mintWithAffiliate(c.buyer.address, 2, 1, { value: PRICE * 2n });
    await c.round.connect(c.buyer).transferFrom(c.buyer.address, c.holder.address, 1);
    await time.increaseTo(c.config.mintDeadline);
    expect(await c.round.affiliateAccrued(1)).to.equal(PRICE * 2n / 100n);
    expect(await c.round.affiliateClaimable(1)).to.equal(0n);
    await expect(c.round.connect(c.affiliate).claimAffiliateCommission(c.destination.address))
      .to.be.revertedWithCustomError(c.round, "AffiliateClaimUnavailable");
    expect(await c.round.withdrawableBalance()).to.equal(0n);
    await expect(c.round.connect(c.holder).refund(1, c.destination.address))
      .to.changeEtherBalances(ethers, [c.round, c.destination], [-PRICE, PRICE]);
    await c.round.connect(c.buyer).refund(2, c.destination.address);
    expect(await ethers.provider.getBalance(await c.round.getAddress())).to.equal(0n);
    expect(await c.round.totalRefunded()).to.equal(PRICE * 2n);
    expect(await c.round.totalAffiliateClaimed()).to.equal(0n);
  });

  it("preserves credit on a failed affiliate transfer and permits an alternate recipient", async function () {
    const c = await loadFixture(soldFixture);
    const receiver = await ethers.deployContract("V2RoundReceiver", [await c.round.getAddress()]);
    await receiver.configure(true, false, "0x", 0);
    await expect(c.round.connect(c.affiliate).claimAffiliateCommission(await receiver.getAddress()))
      .to.be.revertedWithCustomError(c.round, "TransferFailed");
    expect(await c.round.affiliateClaimed(1)).to.equal(0n);
    expect(await c.round.totalAffiliateClaimed()).to.equal(0n);
    expect(await c.round.affiliateClaimable(1)).to.equal(PRICE * 2n / 100n);
    await c.round.connect(c.affiliate).claimAffiliateCommission(c.destination.address);
  });

  it("blocks claim reentrancy from an enrolled smart wallet without losing its legitimate commission", async function () {
    const c = await loadFixture(fixture);
    const receiver = await ethers.deployContract("V2RoundReceiver", [await c.round.getAddress()]);
    const receiverAddress = await receiver.getAddress();
    const p = await permit(c, receiverAddress);
    await receiver.execute(c.round.interface.encodeFunctionData("enrollAffiliate", [p.applicant, p.affiliateId, p.commissionBps, p.nonce, p.deadline, p.signature]));
    await c.round.fundRandomness({ value: 1n });
    await c.round.activateSale();
    await c.round.connect(c.buyer).mintWithAffiliate(c.buyer.address, 6, 1, { value: PRICE * 6n });
    const call = c.round.interface.encodeFunctionData("claimAffiliateCommission", [receiverAddress]);
    await receiver.configure(false, false, call, 0);
    await receiver.execute(call);
    expect(await receiver.callbackAttempts()).to.equal(1n);
    expect(await receiver.callbackSucceeded()).to.equal(false);
    expect(await c.round.totalAffiliateClaimed()).to.equal(PRICE * 6n / 100n);
    expect(await ethers.provider.getBalance(receiverAddress)).to.equal(PRICE * 6n / 100n);
  });

  it("reserves final-batch credits before safe-mint callbacks and blocks claims during mint execution", async function () {
    const c = await loadFixture(fixture);
    const receiver = await ethers.deployContract("V2RoundReceiver", [await c.round.getAddress()]);
    const receiverAddress = await receiver.getAddress();
    const p = await permit(c, receiverAddress);
    await receiver.execute(c.round.interface.encodeFunctionData("enrollAffiliate", [p.applicant, p.affiliateId, p.commissionBps, p.nonce, p.deadline, p.signature]));
    await enroll(c, c.secondAffiliate);
    await c.round.fundRandomness({ value: 1n });
    await c.round.activateSale();
    await c.round.connect(c.buyer).mintWithAffiliate(c.buyer.address, 5, 1, { value: PRICE * 5n });
    const claim = c.round.interface.encodeFunctionData("claimAffiliateCommission", [receiverAddress]);
    await receiver.configure(false, true, claim, 0);
    await c.round.connect(c.buyer).mintWithAffiliate(receiverAddress, 1, 2, { value: PRICE });
    expect(await receiver.observedSoldOut()).to.equal(true);
    expect(await receiver.callbackSucceeded()).to.equal(false);
    expect(await c.round.totalAffiliateClaimed()).to.equal(0n);
    expect(await c.round.totalAffiliateAccrued()).to.equal(PRICE * 6n / 100n);
    await receiver.configure(false, false, "0x", 0);
    await receiver.execute(claim);
    expect(await c.round.totalAffiliateClaimed()).to.equal(PRICE * 5n / 100n);
  });

  it("rejects zero, self-contract and coordinator payout destinations without consuming credit", async function () {
    const c = await loadFixture(soldFixture);
    for (const recipient of [ethers.ZeroAddress, await c.round.getAddress(), await c.coordinator.getAddress()]) {
      await expect(c.round.connect(c.affiliate).claimAffiliateCommission(recipient))
        .to.be.revertedWithCustomError(c.round, "InvalidRecipient");
    }
    expect(await c.round.totalAffiliateClaimed()).to.equal(0n);
  });

  it("fits factory and maximum-length collection deployment inside the declared 8M transaction budgets", async function () {
    const c = await loadFixture(fixture);
    const factory = await ethers.deployContract("ManekinekoFactoryV4", [c.owner.address]);
    const factoryReceipt = await factory.deploymentTransaction()!.wait();
    const roundReceipt = await (await factory.createRound({ ...c.config, name: "N".repeat(80), symbol: "S".repeat(16), maxSupply: 65_536n, maxAffiliateSlots: 100n, affiliateRatesBps: Array<bigint>(100).fill(100n) })).wait();
    expect(factoryReceipt!.gasUsed).to.be.lessThan(8_000_000n);
    expect(roundReceipt!.gasUsed).to.be.lessThan(8_000_000n);
    console.log(`      Local mock deployment gas: factory ${factoryReceipt!.gasUsed}, round ${roundReceipt!.gasUsed}`);
  });

  it("rejects invalid prize/rate schedules, price precision and owner admission-key reuse", async function () {
    const c = await loadFixture(fixture);
    for (const override of [
      { prizeBps: 10_001n }, { prizeBps: 9_901n }, { affiliateRatesBps: [] },
      { affiliateRatesBps: Array<bigint>(9).fill(100n) }, { affiliateRatesBps: Array<bigint>(11).fill(100n) },
      { affiliateRatesBps: Array<bigint>(10).fill(10_001n) }, { affiliateRatesBps: Array<bigint>(10).fill(5_001n) },
      { mintPrice: 100n }, { mintPrice: 10_100n }, { enrollmentSigner: c.owner.address },
    ]) {
      await expect(ethers.deployContract("ManekinekoRoundV4", [{ ...c.config, ...override }, await c.renderer.getAddress()]))
        .to.be.revertedWithCustomError(c.round, "InvalidConfig");
    }
  });

  it("does not sum unused referral positions into a false payment liability", async function () {
    const c = await loadFixture(fixture);
    const config = { ...c.config, affiliateRatesBps: Array<bigint>(10).fill(5_000n) };
    const round = await ethers.deployContract("ManekinekoRoundV4", [config, await c.renderer.getAddress()]);
    const context = { ...c, config, round };
    await enroll(context);
    await round.fundRandomness({ value: 1n });
    await round.activateSale();
    await round.connect(c.buyer).mintWithAffiliate(c.buyer.address, 1, 1, { value: PRICE });
    expect(await round.affiliateAccrued(1)).to.equal(PRICE / 2n);
    expect(await round.affiliateAccrued(2)).to.equal(0n);
    expect(await round.totalAffiliateAccrued()).to.equal(PRICE / 2n);
    expect(await round.prizeAmount()).to.equal(PRICE / 2n);
  });

  for (const positions of [10, 20]) {
    it(`applies only the used link's ${1000 / positions} bps share for a 10% allocation across ${positions} positions`, async function () {
      const c = await loadFixture(fixture);
      const rate = 1_000n / BigInt(positions);
      const config = { ...c.config, maxAffiliateSlots: BigInt(positions), affiliateRatesBps: Array<bigint>(positions).fill(rate) };
      const round = await ethers.deployContract("ManekinekoRoundV4", [config, await c.renderer.getAddress()]);
      const context = { ...c, config, round };
      await enroll(context);
      await round.fundRandomness({ value: 1n });
      await round.activateSale();
      await round.connect(c.buyer).mintWithAffiliate(c.buyer.address, 1, 1, { value: PRICE });
      await round.connect(c.buyer).mint(c.buyer.address, 5, { value: PRICE * 5n });
      expect(await round.affiliateReferredMints(1)).to.equal(1n);
      expect(await round.affiliateReferredMints(2)).to.equal(0n);
      expect(await round.totalAffiliateAccrued()).to.equal(PRICE / 10_000n * rate);
      expect(await round.affiliateClaimable(1)).to.equal(PRICE / 10_000n * rate);
    });
  }

  it("binds an offer to its exact vacant position and rate instead of reassigning after a competing enrollment", async function () {
    const c = await loadFixture(fixture);
    const config = { ...c.config, maxAffiliateSlots: 2n, affiliateRatesBps: [250n, 50n] };
    const round = await ethers.deployContract("ManekinekoRoundV4", [config, await c.renderer.getAddress()]);
    const context = { ...c, config, round };
    const original = await permit(context);
    const competing = await permit(context, c.secondAffiliate.address);
    await round.connect(c.secondAffiliate).enrollAffiliate(competing.applicant, competing.affiliateId, competing.commissionBps, competing.nonce, competing.deadline, competing.signature);
    await expect(round.connect(c.affiliate).enrollAffiliate(original.applicant, original.affiliateId, original.commissionBps, original.nonce, original.deadline, original.signature))
      .to.be.revertedWithCustomError(round, "AffiliatePositionUnavailable");
    expect(await round.affiliateIdOf(c.affiliate.address)).to.equal(0n);
    expect(await round.nextAvailableAffiliateId()).to.equal(2n);
    await expect(round.connect(c.affiliate).enrollAffiliate(original.applicant, 2, 50, original.nonce, original.deadline, original.signature))
      .to.be.revertedWithCustomError(round, "InvalidEnrollment");
    await expect(round.connect(c.affiliate).enrollAffiliate(original.applicant, 2, 250, original.nonce, original.deadline, original.signature))
      .to.be.revertedWithCustomError(round, "AffiliateRateMismatch");
    expect(await round.enrollmentNonceUsed(original.nonce)).to.equal(false);
  });

  it("supports explicit sparse positions and rejects wrong-rate permits even signed by the admission service", async function () {
    const c = await loadFixture(fixture);
    const bad = await permit(c, c.affiliate.address, { affiliateId: 10n, commissionBps: 101n });
    await expect(c.round.connect(c.affiliate).enrollAffiliate(bad.applicant, bad.affiliateId, bad.commissionBps, bad.nonce, bad.deadline, bad.signature))
      .to.be.revertedWithCustomError(c.round, "AffiliateRateMismatch");
    const valid = await permit(c, c.affiliate.address, { affiliateId: 10n });
    await c.round.connect(c.affiliate).enrollAffiliate(valid.applicant, valid.affiliateId, valid.commissionBps, valid.nonce, valid.deadline, valid.signature);
    expect(await c.round.affiliateCount()).to.equal(1n);
    expect(await c.round.affiliateIdOf(c.affiliate.address)).to.equal(10n);
    expect(await c.round.nextAvailableAffiliateId()).to.equal(1n);
  });

  it("accounts unequal and zero-rate referrals independently while paying the configured winner share", async function () {
    const c = await loadFixture(fixture);
    const config = { ...c.config, prizeBps: 6_000n, maxAffiliateSlots: 3n, affiliateRatesBps: [100n, 250n, 0n] };
    const round = await ethers.deployContract("ManekinekoRoundV4", [config, await c.renderer.getAddress()]);
    const context = { ...c, config, round };
    await enroll(context); await enroll(context, c.secondAffiliate); await enroll(context, c.outsider);
    expect(await round.nextAvailableAffiliateId()).to.equal(0n);
    await round.fundRandomness({ value: await c.coordinator.MOCK_FEE() });
    await round.activateSale();
    await round.connect(c.buyer).mintWithAffiliate(c.buyer.address, 2, 1, { value: PRICE * 2n });
    await round.connect(c.buyer).mintWithAffiliate(c.buyer.address, 1, 2, { value: PRICE });
    await round.connect(c.buyer).mintWithAffiliate(c.buyer.address, 1, 3, { value: PRICE });
    await round.connect(c.buyer).mint(c.buyer.address, 2, { value: PRICE * 2n });
    expect(await round.affiliateReferredMints(1)).to.equal(2n);
    expect(await round.affiliateReferredMints(2)).to.equal(1n);
    expect(await round.affiliateReferredMints(3)).to.equal(1n);
    expect(await round.affiliateAccrued(1)).to.equal(200n);
    expect(await round.affiliateAccrued(2)).to.equal(250n);
    expect(await round.affiliateAccrued(3)).to.equal(0n);
    expect(await round.totalAffiliateAccrued()).to.equal(450n);
    await expect(round.connect(c.outsider).claimAffiliateCommission(c.destination.address))
      .to.be.revertedWithCustomError(round, "AffiliateClaimUnavailable");
    await reveal(context);
    await round.distributePrize();
    expect(await round.prizePaidAmount()).to.equal(36_000n);
    expect(await round.withdrawableBalance()).to.equal(23_550n);
    await round.withdraw(c.owner.address, 23_550n);
    await round.connect(c.affiliate).claimAffiliateCommission(c.destination.address);
    await round.connect(c.secondAffiliate).claimAffiliateCommission(c.destination.address);
    expect(await ethers.provider.getBalance(await round.getAddress())).to.equal(0n);
  });

  for (const prizeBps of [0n, 10_000n]) {
    it(`settles the ${prizeBps} bps prize boundary with exact reserves and no unintended affiliate earnings`, async function () {
      const c = await loadFixture(fixture);
      const config = { ...c.config, prizeBps, affiliateRatesBps: Array<bigint>(10).fill(0n) };
      const round = await ethers.deployContract("ManekinekoRoundV4", [config, await c.renderer.getAddress()]);
      const context = { ...c, config, round };
      await enroll(context);
      await round.fundRandomness({ value: await c.coordinator.MOCK_FEE() });
      await round.activateSale();
      await round.connect(c.buyer).mintWithAffiliate(c.buyer.address, 6, 1, { value: PRICE * 6n });
      await reveal(context);
      await round.distributePrize();
      const prize = PRICE * 6n / 10_000n * prizeBps;
      expect(await round.prizePaidAmount()).to.equal(prize);
      expect(await round.prizePaid()).to.equal(true);
      expect(await round.readyForNextRound()).to.equal(true);
      expect(await round.withdrawableBalance()).to.equal(PRICE * 6n - prize);
      expect(await round.affiliateReferredMints(1)).to.equal(6n);
      expect(await round.totalAffiliateAccrued()).to.equal(0n);
    });
  }

  it("permits a 100% referral share with a zero prize while protecting the earned balance from owner withdrawal", async function () {
    const c = await loadFixture(fixture);
    const config = { ...c.config, prizeBps: 0n, affiliateRatesBps: Array<bigint>(10).fill(10_000n) };
    const round = await ethers.deployContract("ManekinekoRoundV4", [config, await c.renderer.getAddress()]);
    const context = { ...c, config, round };
    await enroll(context);
    await round.fundRandomness({ value: await c.coordinator.MOCK_FEE() });
    await round.activateSale();
    await round.connect(c.buyer).mintWithAffiliate(c.buyer.address, 6, 1, { value: PRICE * 6n });
    await reveal(context); await round.distributePrize();
    expect(await round.withdrawableBalance()).to.equal(0n);
    await round.connect(c.affiliate).claimAffiliateCommission(c.destination.address);
    expect(await ethers.provider.getBalance(await round.getAddress())).to.equal(0n);
  });

  it("only the immutable factory can use its fixed V4 deployer", async function () {
    const c = await loadFixture(fixture);
    const factory = await ethers.deployContract("ManekinekoFactoryV4", [c.owner.address]);
    const deployer = await ethers.getContractAt("ManekinekoRoundDeployerV4", await factory.deployer());
    expect(await deployer.factory()).to.equal(await factory.getAddress());
    await expect(deployer.deploy(c.config, await factory.renderer())).to.be.revertedWithCustomError(deployer, "OnlyFactory");
    await factory.createRound(c.config);
    const round = await ethers.getContractAt("ManekinekoRoundV4", await factory.rounds(1));
    expect(await round.CONTRACT_VERSION()).to.equal("affiliate-v4");
    for (const deployed of [factory, deployer, round, await ethers.getContractAt("ManekinekoRendererV4", await factory.renderer())]) {
      expect(ethers.getBytes(await ethers.provider.getCode(await deployed.getAddress())).length).to.be.lessThanOrEqual(24_576);
    }
    for (const name of ["ManekinekoFactoryV4", "ManekinekoRoundDeployerV4", "ManekinekoRendererV4"]) {
      const artifact = await ethers.getContractFactory(name);
      const tx = name === "ManekinekoFactoryV4" ? await artifact.getDeployTransaction(c.owner.address) : await artifact.getDeployTransaction();
      expect(ethers.getBytes(tx.data!).length).to.be.lessThanOrEqual(49_152);
    }
    const maximumConfig = { ...c.config, name: "N".repeat(80), symbol: "S".repeat(16), maxAffiliateSlots: 100n, affiliateRatesBps: Array<bigint>(100).fill(100n) };
    const roundDeployment = await (await ethers.getContractFactory("ManekinekoRoundV4")).getDeployTransaction(maximumConfig, await factory.renderer());
    expect(ethers.getBytes(roundDeployment.data!).length).to.be.lessThanOrEqual(49_152);
  });

  it("keeps previous commissions claimable when the factory creates the next collection", async function () {
    const c = await loadFixture(fixture);
    const factory = await ethers.deployContract("ManekinekoFactoryV4", [c.owner.address]);
    await factory.createRound(c.config);
    const first = await ethers.getContractAt("ManekinekoRoundV4", await factory.rounds(1));
    const firstContext = { ...c, round: first };
    await enroll(firstContext);
    await first.fundRandomness({ value: await c.coordinator.MOCK_FEE() });
    await first.activateSale();
    await first.connect(c.buyer).mintWithAffiliate(c.buyer.address, 6, 1, { value: PRICE * 6n });
    await reveal(firstContext);
    await first.distributePrize();
    await factory.createRound({ ...c.config, roundId: 2n });
    const second = await ethers.getContractAt("ManekinekoRoundV4", await factory.rounds(2));
    expect(await second.affiliateCount()).to.equal(0n);
    expect(await first.affiliateClaimable(1)).to.equal(PRICE * 6n / 100n);
    expect(await second.renderer()).to.equal(await first.renderer());
    expect(await first.renderer()).to.equal(await factory.renderer());
    await first.connect(c.affiliate).claimAffiliateCommission(c.destination.address);
    expect(await first.affiliateClaimed(1)).to.equal(PRICE * 6n / 100n);
  });
});
