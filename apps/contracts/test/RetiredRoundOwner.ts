import { expect } from "chai";
import { artifacts, network } from "hardhat";

import { matchesReviewedV8RetirementRuntime, verifyRetiredUnactivatedV8Target } from "../scripts/retired-round-verification.ts";

const { ethers, networkHelpers } = await network.create();
const { loadFixture, time } = networkHelpers;
const PRICE = ethers.parseEther("0.01"), VRF_BUDGET = ethers.parseEther("0.3");

async function fixture() {
  const [owner, enrollmentSigner, other, buyer] = await ethers.getSigners();
  const coordinator = await ethers.deployContract("VRFCoordinatorV2Mock");
  const eligibility = await ethers.deployContract("ManekinekoAffiliateEligibilityV3", [owner.address]);
  const factory = await ethers.deployContract("ManekinekoFactoryV8", [owner.address]);
  await eligibility.approveFactory(await factory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await factory.getAddress())));
  const config = {
    name: "Unused V8", symbol: "UNUSED8", seasonId: ethers.id("Retirement test"), seasonName: "Retirement test",
    collectionColor: "#330000", textColor: "#FFFFFF", roundId: 1n, maxSupply: 1000n, mintPrice: PRICE,
    saleStartAt: BigInt(await time.latest()) + 3600n, mintDeadline: BigInt(await time.latest()) + 86400n,
    initialOwner: owner.address, vrfCoordinator: await coordinator.getAddress(), keyHash: ethers.id("mock-key"),
    requestConfirmations: 64, callbackGasLimit: 200000, maxAffiliateSlots: 10n, enrollmentSigner: enrollmentSigner.address,
    prizeBps: 6000n, winnerCount: 6n, affiliatePoolBps: 2000n, minAffiliateReferrals: 100n,
    affiliatePayoutCapBps: 3000n, affiliateEligibility: await eligibility.getAddress(),
  };
  await factory.createRound(config);
  const round = await ethers.getContractAt("ManekinekoRoundV8", await factory.rounds(1));
  await eligibility.registerCollection(await factory.getAddress(), 1);
  await round.fundRandomness({ value: VRF_BUDGET });
  const retirement = await ethers.deployContract("ManekinekoRetiredRoundOwner", [await round.getAddress(), owner.address]);
  return { owner, other, buyer, config, round, retirement, coordinator };
}

describe("Irreversible retirement of a never-activated zero-mint V8", function () {
  this.timeout(180000);

  it("requires the actual original owner and rejects empty or non-V8 targets", async () => {
    const c = await loadFixture(fixture), target = await c.round.getAddress();
    await expect(ethers.deployContract("ManekinekoRetiredRoundOwner", [target, c.other.address])).revertedWithCustomError(c.retirement, "InvalidOriginalOwner");
    await expect(ethers.deployContract("ManekinekoRetiredRoundOwner", [target, ethers.ZeroAddress])).revertedWithCustomError(c.retirement, "InvalidOriginalOwner");
    await expect(ethers.deployContract("ManekinekoRetiredRoundOwner", [c.owner.address, c.owner.address])).revertedWithCustomError(c.retirement, "InvalidTarget");
    await expect(ethers.deployContract("ManekinekoRetiredRoundOwner", [await c.coordinator.getAddress(), c.owner.address])).revert(ethers);
    await expect(c.retirement.acceptRetirement()).revertedWithCustomError(c.retirement, "OwnershipNotPending");
    await expect(c.retirement.recoverRandomnessFunding()).revertedWithCustomError(c.retirement, "RetirementNotComplete");
  });

  it("accepts only the expected two-step transfer and passes exact runtime/immutable verification", async () => {
    const c = await loadFixture(fixture), address = await c.retirement.getAddress();
    await c.round.transferOwnership(address);
    await expect(c.retirement.connect(c.other).acceptRetirement()).emit(c.retirement, "RoundPermanentlyRetired").withArgs(await c.round.getAddress(), c.owner.address);
    expect(await c.round.owner()).eq(address);
    expect(await c.round.pendingOwner()).eq(ethers.ZeroAddress);
    expect(await c.round.saleActivated()).eq(false);
    expect(await c.round.totalMinted()).eq(0n);
    expect(await c.retirement.recoveryRecipient()).eq(c.owner.address);
    const block = (await ethers.provider.getBlock("latest"))!;
    const proof = await verifyRetiredUnactivatedV8Target(ethers.provider, await c.round.getAddress(), { number: block.number, hash: block.hash!, timestamp: block.timestamp }, (name: string) => artifacts.readArtifact(name));
    expect(proof.retirementOwner).eq(address);
    expect(proof.recoveryRecipient).eq(c.owner.address);
    await expect(c.retirement.acceptRetirement()).revertedWithCustomError(c.retirement, "InvalidOriginalOwner");
  });

  it("invalidates retirement if the round is activated, minted or transferred after owner-contract deployment", async () => {
    const c = await loadFixture(fixture);
    await c.round.transferOwnership(await c.retirement.getAddress());
    await time.increaseTo(c.config.saleStartAt);
    await c.round.activateSale();
    await expect(c.retirement.acceptRetirement()).revertedWithCustomError(c.retirement, "RoundAlreadyUsed");
    await expect(ethers.deployContract("ManekinekoRetiredRoundOwner", [await c.round.getAddress(), c.owner.address])).revertedWithCustomError(c.retirement, "RoundAlreadyUsed");
    await c.round.connect(c.buyer).mint(c.buyer.address, 1, { value: PRICE });
    await expect(c.retirement.acceptRetirement()).revertedWithCustomError(c.retirement, "RoundAlreadyUsed");
    await c.round.transferOwnership(c.other.address);
    await c.round.connect(c.other).acceptOwnership();
    await c.round.connect(c.other).transferOwnership(await c.retirement.getAddress());
    await expect(c.retirement.acceptRetirement()).revertedWithCustomError(c.retirement, "InvalidOriginalOwner");
  });

  it("cannot reactivate or transfer ownership through any exposed entry point", async () => {
    const c = await loadFixture(fixture), address = await c.retirement.getAddress();
    await c.round.transferOwnership(address);
    await c.retirement.acceptRetirement();
    await time.increaseTo(c.config.saleStartAt);
    await expect(c.round.activateSale()).revertedWithCustomError(c.round, "OwnableUnauthorizedAccount");
    await expect(c.round.transferOwnership(c.owner.address)).revertedWithCustomError(c.round, "OwnableUnauthorizedAccount");
    await expect(c.round.connect(c.buyer).mint(c.buyer.address, 1, { value: PRICE })).revertedWithCustomError(c.round, "MintClosed");
    for (const data of [c.round.interface.encodeFunctionData("activateSale"), c.round.interface.encodeFunctionData("transferOwnership", [c.owner.address]), c.round.interface.encodeFunctionData("acceptOwnership"), "0x"]) {
      await expect(c.owner.sendTransaction({ to: address, data })).revert(ethers);
    }
    const mutable = c.retirement.interface.fragments.filter(fragment => fragment.type === "function" && "stateMutability" in fragment && !["view", "pure"].includes(String(fragment.stateMutability))).map(fragment => "name" in fragment ? fragment.name : "");
    expect(mutable.sort()).deep.eq(["acceptRetirement", "recoverRandomnessFunding"]);
    expect(await c.round.owner()).eq(address);
  });

  it("preserves the VRF budget until expiry then permissionlessly recovers it only to the original owner", async () => {
    const c = await loadFixture(fixture);
    await c.round.transferOwnership(await c.retirement.getAddress());
    await c.retirement.acceptRetirement();
    await expect(c.retirement.connect(c.other).recoverRandomnessFunding()).revertedWithCustomError(c.round, "InvalidPhase");
    expect(await c.round.subscriptionClosed()).eq(false);
    await time.increaseTo(c.config.mintDeadline);
    await expect(c.retirement.connect(c.other).recoverRandomnessFunding()).changeEtherBalances(ethers, [c.owner, c.other], [VRF_BUDGET, 0n]);
    expect(await c.round.subscriptionClosed()).eq(true);
    await expect(c.retirement.connect(c.other).recoverRandomnessFunding()).revertedWithCustomError(c.round, "InvalidPhase");
    await c.round.connect(c.other).cancelExpiredRound();
    expect(await c.round.cancelled()).eq(true);
    expect(await c.round.owner()).eq(await c.retirement.getAddress());
    expect(await c.round.totalMinted()).eq(0n);
  });

  it("accepts only the exact separately reviewed Aster template at its bound Sepolia address", async () => {
    const c = await loadFixture(fixture), artifact = await artifacts.readArtifact("ManekinekoRoundV8");
    const code = await ethers.provider.getCode(await c.round.getAddress());
    const historicalMetadata = "a2646970667358221220e093fe5ec9173a3cc8614a504cd905810a774055846b46829687037235a6b55164736f6c63430008250033";
    const historical = code.slice(0, -historicalMetadata.length) + historicalMetadata;
    const target = "0x1ff99e7a579c4df625e1f73d66cfebad4d0829bf";
    expect(matchesReviewedV8RetirementRuntime(historical, artifact, target, 11155111n)).eq(true);
    expect(matchesReviewedV8RetirementRuntime(historical, artifact, c.other.address, 11155111n)).eq(false);
    expect(matchesReviewedV8RetirementRuntime(historical, artifact, target, 1n)).eq(false);
    expect(matchesReviewedV8RetirementRuntime(`${historical.slice(0, -6)}ffffff`, artifact, target, 11155111n)).eq(false);
    const changedCode = `0x00${historical.slice(4)}`;
    expect(matchesReviewedV8RetirementRuntime(changedCode, artifact, target, 11155111n)).eq(false);
    const changedArtifact = { ...artifact, deployedBytecode: `0x00${artifact.deployedBytecode.slice(4)}` };
    expect(matchesReviewedV8RetirementRuntime(changedCode, changedArtifact, target, 11155111n)).eq(false);
  });
});
