import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();
const { loadFixture, time } = networkHelpers;
const PRICE = 10_000n;
const KEY_HASH = ethers.id("local-test-only-vrf-key-hash");
const ZERO = ethers.ZeroAddress;

interface RoundConfig {
  name: string;
  symbol: string;
  roundId: bigint;
  maxSupply: bigint;
  mintPrice: bigint;
  mintDeadline: bigint;
  initialOwner: string;
  vrfCoordinator: string;
  keyHash: string;
  requestConfirmations: number;
  callbackGasLimit: number;
  maxAffiliateSlots: bigint;
  enrollmentSigner: string;
  prizeBps: bigint;
  affiliateRatesBps: bigint[];
}

async function deployRound(overrides: Partial<RoundConfig> = {}) {
  const [owner, minter, holder, other, operator] = await ethers.getSigners();
  const coordinator = await ethers.deployContract("VRFCoordinatorV2Mock");
  const config: RoundConfig = {
    name: "Manekineko VRF",
    symbol: "NEKO2",
    roundId: 1n,
    maxSupply: 6n,
    mintPrice: PRICE,
    mintDeadline: BigInt(await time.latest()) + 86_400n,
    initialOwner: owner.address,
    vrfCoordinator: await coordinator.getAddress(),
    keyHash: KEY_HASH,
    requestConfirmations: 64,
    callbackGasLimit: 200_000,
    maxAffiliateSlots: 10n,
    enrollmentSigner: operator.address,
    prizeBps: 5000n,
    affiliateRatesBps: Array<bigint>(10).fill(100n),
    ...overrides,
  };
  const renderer = await ethers.deployContract("ManekinekoRendererV4");
  const round = await ethers.deployContract("ManekinekoRoundV4", [config, await renderer.getAddress()]);
  return { round, coordinator, config, owner, minter, holder, other, operator };
}

type Context = Awaited<ReturnType<typeof deployRound>>;

async function fundedFixture() {
  const context = await deployRound();
  await context.round.fundRandomness({ value: (await context.coordinator.MOCK_FEE()) * 3n });
  await context.round.activateSale();
  return context;
}

async function mintOut(context: Context, recipient = context.minter.address) {
  for (let minted = 0n; minted < context.config.maxSupply;) {
    const remaining = context.config.maxSupply - minted;
    const quantity = remaining > 20n ? 20n : remaining;
    await context.round.connect(context.minter).mint(recipient, quantity, { value: PRICE * quantity });
    minted += quantity;
  }
}

async function soldOutFixture() {
  const context = await fundedFixture();
  await mintOut(context);
  return context;
}

async function requestedFixture() {
  const context = await soldOutFixture();
  await context.round.connect(context.operator).requestRandomness();
  return context;
}

async function finalizedFixture() {
  const context = await requestedFixture();
  await context.coordinator.fulfillRequest(await context.round.requestId(), 123_456n);
  await context.round.connect(context.operator).finalizeDraw(8);
  return context;
}

// V4 preserves the V2 lifecycle invariants with a separate immutable deployment.
describe("ManekinekoRoundV4 VRF lifecycle regression", function () {
  this.timeout(180_000);

  it("creates an isolated round-owned subscription and requires funded owner activation", async function () {
    const { round, coordinator, owner, minter, other } = await deployRound();
    const subscriptionId = await round.subscriptionId();
    const subscription = await coordinator.getSubscription(subscriptionId);
    expect(subscription.owner).to.equal(await round.getAddress());
    expect([...subscription.consumers]).to.deep.equal([await round.getAddress()]);
    expect(subscription.nativeBalance).to.equal(0n);
    await expect(coordinator.connect(owner).addConsumer(subscriptionId, owner.address))
      .to.be.revertedWithCustomError(coordinator, "SubscriptionOwnerOnly");
    await expect(round.connect(minter).mint(minter.address, 1, { value: PRICE })).to.be.revertedWithCustomError(round, "MintClosed");
    await expect(round.activateSale()).to.be.revertedWithCustomError(round, "SubscriptionNotReady");
    await round.connect(other).fundRandomness({ value: await coordinator.MOCK_FEE() });
    await expect(round.connect(other).activateSale())
      .to.be.revertedWithCustomError(round, "OwnableUnauthorizedAccount");
    await round.activateSale();
    await round.connect(minter).mint(minter.address, 1, { value: PRICE });
    expect(await round.totalMintRevenue()).to.equal(PRICE);
    expect(await ethers.provider.getBalance(await round.getAddress())).to.equal(PRICE);
    expect((await coordinator.getSubscription(subscriptionId)).nativeBalance).to.equal(await coordinator.MOCK_FEE());
  });

  it("keeps final mint independent of the coordinator and permits retry only when a request reverted", async function () {
    const context = await deployRound();
    const { round, coordinator } = context;
    await round.fundRandomness({ value: 1n });
    await round.activateSale();
    await mintOut(context);
    expect(await round.soldOut()).to.equal(true);
    expect(await round.requestId()).to.equal(0n);
    const receipts = await round.totalMintRevenue();
    await coordinator.setRequestFailure(true);
    await expect(round.requestRandomness()).to.be.revertedWithCustomError(coordinator, "InjectedRequestFailure");
    expect(await round.requestId()).to.equal(0n);
    expect(await ethers.provider.getBalance(await round.getAddress())).to.equal(receipts);
    await coordinator.setRequestFailure(false);
    await round.requestRandomness();
    expect(await round.requestId()).to.be.greaterThan(0n);
    await expect(round.requestRandomness()).to.be.revertedWithCustomError(round, "InvalidPhase");
    expect(await ethers.provider.getBalance(await round.getAddress())).to.equal(receipts);
  });

  it("keeps an underfunded accepted request pending until top-up without permitting a new draw", async function () {
    const context = await deployRound();
    const { round, coordinator } = context;
    await round.fundRandomness({ value: 1n });
    await round.activateSale();
    await mintOut(context);
    await round.requestRandomness();
    const requestId = await round.requestId();
    expect(requestId).to.be.greaterThan(0n);
    await expect(coordinator.fulfillRequest(requestId, 333n))
      .to.be.revertedWithCustomError(coordinator, "InsufficientNativeBalance");
    expect(await round.randomnessReceived()).to.equal(false);
    await expect(round.requestRandomness()).to.be.revertedWithCustomError(round, "InvalidPhase");
    await round.fundRandomness({ value: await coordinator.MOCK_FEE() });
    await coordinator.fulfillRequest(requestId, 333n);
    expect(await round.randomnessReceived()).to.equal(true);
    expect(await round.requestId()).to.equal(requestId);
    await round.finalizeDraw(1);
    expect(await round.totalMintRevenue()).to.equal(PRICE * context.config.maxSupply);
  });

  it("binds one native-paid request to the closed collection and its immutable configuration", async function () {
    const { round, coordinator, config, minter } = await loadFixture(requestedFixture);
    const [consumer, request] = await coordinator.requestDetails(await round.requestId());
    expect(consumer).to.equal(await round.getAddress());
    expect(request.keyHash).to.equal(config.keyHash);
    expect(request.subId).to.equal(await round.subscriptionId());
    expect(request.requestConfirmations).to.equal(BigInt(config.requestConfirmations));
    expect(request.callbackGasLimit).to.equal(BigInt(config.callbackGasLimit));
    expect(request.numWords).to.equal(1n);
    const extraArgs = ethers.concat([
      ethers.id("VRF ExtraArgsV1").slice(0, 10), ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]),
    ]);
    expect(request.extraArgs).to.equal(extraArgs);
    expect((await coordinator.getSubscription(request.subId)).reqCount).to.equal(0n);
    expect(await coordinator.pendingRequests(request.subId)).to.equal(1n);
    await expect(round.connect(minter).mint(minter.address, 1, { value: PRICE })).to.be.revertedWithCustomError(round, "MintClosed");
    await expect(round.requestRandomness()).to.be.revertedWithCustomError(round, "InvalidPhase");
    for (const name of ["setCoordinator", "setKeyHash", "setSubscriptionId", "setMaxSupply", "setMintPrice", "setOffset"]) {
      expect(new ethers.Interface(round.interface.fragments).getFunction(name)).to.equal(null);
    }
  });

  it("does not allow requesting or finalizing before the required preceding phases", async function () {
    const { round, minter } = await loadFixture(fundedFixture);
    await expect(round.requestRandomness()).to.be.revertedWithCustomError(round, "InvalidPhase");
    await expect(round.finalizeDraw(1)).to.be.revertedWithCustomError(round, "InvalidPhase");
    await expect(round.combination(1)).to.be.revertedWithCustomError(round, "ERC721NonexistentToken");
    await round.connect(minter).mint(minter.address, 1, { value: PRICE });
    await expect(round.combination(1)).to.be.revertedWithCustomError(round, "RevealNotAvailable");
    await expect(round.distributePrize()).to.be.revertedWithCustomError(round, "InvalidPhase");
  });

  it("accepts a legitimate zero random word within the configured callback gas and finalizes separately", async function () {
    const { round, coordinator, operator } = await loadFixture(requestedFixture);
    await coordinator.fulfillRequest(await round.requestId(), 0, { gasLimit: 500_000 });
    expect(await coordinator.lastCallbackSucceeded()).to.equal(true);
    expect(await coordinator.lastCallbackGasUsed()).to.be.lessThan(200_000n);
    expect(await round.randomnessReceived()).to.equal(true);
    expect(await round.randomWord()).to.equal(0n);
    expect((await coordinator.getSubscription(await round.subscriptionId())).reqCount).to.equal(1n);
    expect(await coordinator.pendingRequests(await round.subscriptionId())).to.equal(0n);
    expect(await round.revealed()).to.equal(false);
    await expect(round.distributePrize()).to.be.revertedWithCustomError(round, "InvalidPhase");
    await round.connect(operator).finalizeDraw(8);
    expect(await round.highestScore()).to.equal(6n);
    expect(await round.winningTokenId()).to.be.greaterThan(0n);
    expect(await round.winningTokenId()).to.be.lessThanOrEqual(6n);
    await expect(round.finalizeDraw(1)).to.be.revertedWithCustomError(round, "InvalidPhase");
  });

  it("authenticates fulfillment and rejects malformed, wrong-request, premature, and replay callbacks", async function () {
    const context = await loadFixture(soldOutFixture);
    const { round, coordinator, other } = context;
    const address = await round.getAddress();
    await expect(round.connect(other).rawFulfillRandomWords(1, [123n]))
      .to.be.revertedWithCustomError(round, "OnlyCoordinator");
    await expect(coordinator.deliver(address, 0, [123n]))
      .to.be.revertedWithCustomError(round, "InvalidFulfillment");
    await round.requestRandomness();
    const requestId = await round.requestId();
    for (const [id, words] of [[requestId + 1n, [123n]], [requestId, []], [requestId, [123n, 456n]]] as const) {
      await expect(coordinator.deliver(address, id, [...words]))
        .to.be.revertedWithCustomError(round, "InvalidFulfillment");
      expect(await round.randomnessReceived()).to.equal(false);
    }
    await coordinator.fulfillRequest(requestId, 123n);
    expect(await round.randomWord()).to.equal(123n);
    await expect(coordinator.deliver(address, requestId, [456n]))
      .to.be.revertedWithCustomError(round, "InvalidFulfillment");
    await expect(coordinator.fulfillRequest(requestId, 456n))
      .to.be.revertedWithCustomError(coordinator, "InvalidRequest");
    expect(await round.randomWord()).to.equal(123n);
  });

  it("fulfills a nonzero word within the minimum configured 100,000 callback gas", async function () {
    const context = await deployRound({ callbackGasLimit: 100_000 });
    const { round, coordinator } = context;
    await round.fundRandomness({ value: await coordinator.MOCK_FEE() });
    await round.activateSale();
    await mintOut(context);
    await round.requestRandomness();
    await coordinator.fulfillRequest(await round.requestId(), ethers.MaxUint256, { gasLimit: 500_000 });
    expect(await coordinator.lastCallbackSucceeded()).to.equal(true);
    expect(await coordinator.lastCallbackGasUsed()).to.be.lessThan(100_000n);
    expect(await round.randomWord()).to.equal(ethers.MaxUint256);
    expect(await round.randomnessReceived()).to.equal(true);
  });

  it("derives one domain-bound stream and finalizes the same result for different work budgets", async function () {
    const { round, coordinator, config, operator, other } = await loadFixture(requestedFixture);
    const word = 998_877n;
    await coordinator.fulfillRequest(await round.requestId(), word);
    const snapshot = await networkHelpers.takeSnapshot();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint256", "uint256", "address", "uint256", "uint256", "uint256"],
      [await round.DRAW_DOMAIN(), word, chainId, await round.getAddress(), config.roundId, config.maxSupply, 0n],
    );
    const candidate = BigInt(ethers.keccak256(encoded));
    expect(candidate).to.be.greaterThanOrEqual((1n << 256n) % config.maxSupply);
    const expectedOffset = candidate % config.maxSupply;
    await round.connect(operator).finalizeDraw(1);
    expect(await round.drawOffset()).to.equal(expectedOffset);
    expect(await round.drawCounter()).to.equal(1n);
    expect(await round.winningTokenId()).to.equal(config.maxSupply - expectedOffset);
    await snapshot.restore();
    await round.connect(other).finalizeDraw(8);
    expect(await round.drawOffset()).to.equal(expectedOffset);
    expect(await round.drawCounter()).to.equal(1n);
    expect(await round.winningTokenId()).to.equal(config.maxSupply - expectedOffset);
  });

  it("bounds finalization work and does not permit a second result", async function () {
    const { round, coordinator } = await loadFixture(requestedFixture);
    await coordinator.fulfillRequest(await round.requestId(), 999n);
    for (const count of [0, 9, 1_000]) await expect(round.finalizeDraw(count)).to.be.revertedWithCustomError(round, "InvalidQuantity");
    await round.finalizeDraw(1);
    const winner = await round.winningTokenId();
    await expect(round.requestRandomness()).to.be.revertedWithCustomError(round, "InvalidPhase");
    await expect(round.finalizeDraw(8)).to.be.revertedWithCustomError(round, "InvalidPhase");
    expect(await round.winningTokenId()).to.equal(winner);
  });

  it("never refunds or releases prize receipts after sellout, including a delayed provider", async function () {
    const { round, coordinator, config, minter, owner } = await loadFixture(requestedFixture);
    await time.increaseTo(config.mintDeadline + 30n * 86_400n);
    expect(await round.refundsAvailable()).to.equal(false);
    await expect(round.cancelExpiredRound()).to.be.revertedWithCustomError(round, "InvalidPhase");
    await expect(round.connect(minter).refund(1, minter.address)).to.be.revertedWithCustomError(round, "InvalidPhase");
    await expect(round.withdraw(owner.address, 1)).to.be.revertedWithCustomError(round, "InsufficientWithdrawableBalance");
    await expect(round.withdrawRandomnessFunding(owner.address)).to.be.revertedWithCustomError(round, "InvalidPhase");
    await coordinator.fulfillRequest(await round.requestId(), 100n);
    expect(await round.refundsAvailable()).to.equal(false);
    await expect(round.cancelExpiredRound()).to.be.revertedWithCustomError(round, "InvalidPhase");
    await expect(round.connect(minter).refund(1, minter.address)).to.be.revertedWithCustomError(round, "InvalidPhase");
    await expect(round.withdraw(owner.address, 1)).to.be.revertedWithCustomError(round, "InsufficientWithdrawableBalance");
    await round.finalizeDraw(1);
    await round.distributePrize();
    expect(await round.readyForNextRound()).to.equal(true);
  });

  it("allows transfers while selling and freezes them from sellout through actual payout", async function () {
    const context = await loadFixture(fundedFixture);
    const { round, coordinator, minter, holder } = context;
    await round.connect(minter).mint(minter.address, 1, { value: PRICE });
    await round.connect(minter).transferFrom(minter.address, holder.address, 1);
    await round.connect(minter).mint(minter.address, 5, { value: PRICE * 5n });
    await expect(round.connect(holder).transferFrom(holder.address, minter.address, 1)).to.be.revertedWithCustomError(round, "TransfersLocked");
    await round.requestRandomness();
    await expect(round.connect(holder).transferFrom(holder.address, minter.address, 1)).to.be.revertedWithCustomError(round, "TransfersLocked");
    await coordinator.fulfillRequest(await round.requestId(), 1234n);
    await expect(round.connect(holder).transferFrom(holder.address, minter.address, 1)).to.be.revertedWithCustomError(round, "TransfersLocked");
    await round.finalizeDraw(1);
    await expect(round.connect(holder).transferFrom(holder.address, minter.address, 1)).to.be.revertedWithCustomError(round, "TransfersLocked");
    await round.distributePrize();
    await round.connect(holder).transferFrom(holder.address, minter.address, 1);
    expect(await round.ownerOf(1)).to.equal(minter.address);
  });

  it("keeps the owner-only payout and allows only the winning holder to recover after seven days", async function () {
    const { round, minter, holder, other } = await loadFixture(finalizedFixture);
    await expect(round.connect(other).distributePrize())
      .to.be.revertedWithCustomError(round, "OwnableUnauthorizedAccount");
    await expect(round.connect(minter).claimPrize(holder.address)).to.be.revertedWithCustomError(round, "ClaimNotAvailable");
    const finalizedAt = await round.finalizedAt();
    const delay = await round.PRIZE_CLAIM_DELAY();
    expect(delay).to.equal(7n * 86_400n);
    await time.increaseTo(finalizedAt + delay);
    await expect(round.connect(other).claimPrize(holder.address)).to.be.revertedWithCustomError(round, "NotTokenHolder");
    await expect(round.connect(minter).claimPrize(ZERO)).to.be.revertedWithCustomError(round, "InvalidRecipient");
    await expect(round.connect(minter).claimPrize(await round.getAddress())).to.be.revertedWithCustomError(round, "InvalidRecipient");
    const amount = await round.prizeAmount();
    await expect(round.connect(minter).claimPrize(holder.address))
      .to.changeEtherBalances(ethers, [round, holder], [-amount, amount]);
    expect(await round.prizeRecipient()).to.equal(holder.address);
    expect(await round.prizePaid()).to.equal(true);
    await expect(round.connect(minter).claimPrize(holder.address)).to.be.revertedWithCustomError(round, "InvalidPhase");
    await expect(round.distributePrize()).to.be.revertedWithCustomError(round, "InvalidPhase");
  });

  it("keeps payment atomic for rejecting smart-wallet winners and permits delayed recipient recovery", async function () {
    const context = await loadFixture(fundedFixture);
    const { round, coordinator, holder } = context;
    const receiver = await ethers.deployContract("V2RoundReceiver", [await round.getAddress()]);
    await receiver.configure(true, false, "0x", 0);
    await mintOut(context, await receiver.getAddress());
    await round.requestRandomness();
    await coordinator.fulfillRequest(await round.requestId(), 55n);
    await round.finalizeDraw(1);
    await expect(round.distributePrize()).to.be.revertedWithCustomError(round, "TransferFailed");
    expect(await round.prizePaid()).to.equal(false);
    expect(await round.prizeRecipient()).to.equal(ZERO);
    expect(await round.withdrawableBalance()).to.equal(0n);
    await time.increaseTo((await round.finalizedAt()) + (await round.PRIZE_CLAIM_DELAY()));
    const amount = await round.prizeAmount();
    await expect(receiver.execute(round.interface.encodeFunctionData("claimPrize", [holder.address])))
      .to.changeEtherBalances(ethers, [round, holder], [-amount, amount]);
    expect(await round.prizePaid()).to.equal(true);
  });

  it("closes sales before the final receiver callback and blocks reentrant randomness requests", async function () {
    const context = await deployRound({ maxSupply: 1n });
    const { round, coordinator } = context;
    await round.fundRandomness({ value: await coordinator.MOCK_FEE() });
    await round.activateSale();
    const receiver = await ethers.deployContract("V2RoundReceiver", [await round.getAddress()]);
    await receiver.configure(false, true, round.interface.encodeFunctionData("requestRandomness"), 0);
    await mintOut(context, await receiver.getAddress());
    expect(await receiver.observedSoldOut()).to.equal(true);
    expect(await receiver.callbackAttempts()).to.equal(1n);
    expect(await receiver.callbackSucceeded()).to.equal(false);
    expect(await round.requestId()).to.equal(0n);
    await round.requestRandomness();
  });

  it("returns unused oracle funding separately from the protected NFT receipts", async function () {
    const { round, coordinator, owner, holder } = await loadFixture(requestedFixture);
    const subId = await round.subscriptionId();
    const receipts = await round.totalMintRevenue();
    await expect(round.withdrawRandomnessFunding(holder.address)).to.be.revertedWithCustomError(round, "InvalidPhase");
    await coordinator.fulfillRequest(await round.requestId(), 12n);
    const balance = (await coordinator.getSubscription(subId)).nativeBalance;
    await expect(round.withdrawRandomnessFunding(holder.address))
      .to.changeEtherBalances(ethers, [coordinator, holder, round], [-balance, balance, 0n]);
    expect(await ethers.provider.getBalance(await round.getAddress())).to.equal(receipts);
    await expect(round.withdraw(owner.address, 1)).to.be.revertedWithCustomError(round, "InsufficientWithdrawableBalance");
    await expect(round.withdrawRandomnessFunding(holder.address)).to.be.revertedWithCustomError(round, "InvalidPhase");
    await round.finalizeDraw(1);
    await round.distributePrize();
    await round.withdraw(holder.address, receipts / 2n);
    expect(await ethers.provider.getBalance(await round.getAddress())).to.equal(0n);
  });

  it("refunds only unsold expired tickets once and releases separate oracle funding", async function () {
    const { round, coordinator, config, minter, holder } = await loadFixture(fundedFixture);
    await round.connect(minter).mint(minter.address, 2, { value: PRICE * 2n });
    await time.increaseTo(config.mintDeadline);
    expect(await round.refundsAvailable()).to.equal(true);
    await round.cancelExpiredRound();
    await expect(round.connect(minter).refund(1, holder.address))
      .to.changeEtherBalances(ethers, [round, holder], [-PRICE, PRICE]);
    await expect(round.connect(minter).refund(1, holder.address)).to.be.revertedWithCustomError(round, "ERC721NonexistentToken");
    await expect(round.requestRandomness()).to.be.revertedWithCustomError(round, "InvalidPhase");
    expect(await round.readyForNextRound()).to.equal(false);
    const nativeBalance = (await coordinator.getSubscription(await round.subscriptionId())).nativeBalance;
    await expect(round.withdrawRandomnessFunding(holder.address))
      .to.changeEtherBalances(ethers, [coordinator, holder], [-nativeBalance, nativeBalance]);
    expect(await ethers.provider.getBalance(await round.getAddress())).to.equal(PRICE);
    await round.connect(minter).refund(2, holder.address);
    expect(await ethers.provider.getBalance(await round.getAddress())).to.equal(0n);
  });

  it("renders sealed then revealed SVG and exact number attributes entirely on-chain", async function () {
    const { round, coordinator } = await loadFixture(requestedFixture);
    const decode = (uri: string) => JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString("utf8"));
    const sealed = decode(await round.tokenURI(1));
    expect(sealed.image).to.match(/^data:image\/svg\+xml;base64,/);
    expect(sealed.attributes.some((attribute: { value: unknown }) => attribute.value === "Sealed")).to.equal(true);
    await coordinator.fulfillRequest(await round.requestId(), 1n);
    await round.finalizeDraw(1);
    const revealed = decode(await round.tokenURI(1));
    const [numbers, code, score] = await round.combination(1);
    expect(numbers.every((number: bigint) => number >= 1n && number <= 16n)).to.equal(true);
    expect(code + 1n).to.equal(score);
    expect(revealed.image).to.match(/^data:image\/svg\+xml;base64,/);
    const attributes = new Map(revealed.attributes.map((attribute: { trait_type: string; value: unknown }) => [attribute.trait_type, attribute.value]));
    for (let index = 0; index < 4; index++) expect(attributes.get(["A", "B", "C", "D"][index])).to.equal(Number(numbers[index]));
    expect(attributes.get("Score")).to.equal(Number(score));
    const svg = Buffer.from(revealed.image.split(",")[1], "base64").toString("utf8");
    expect(svg).to.contain("<svg");
    expect(svg).not.to.match(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
  });

  it("rejects invalid constructor configuration and disables ownership renunciation", async function () {
    const { round, config, owner } = await deployRound();
    const invalid: Partial<RoundConfig>[] = [
      { name: "" }, { name: "n".repeat(81) }, { symbol: "" }, { symbol: "s".repeat(17) },
      { roundId: 0n }, { maxSupply: 0n }, { maxSupply: 65_537n }, { mintPrice: 0n },
      { mintPrice: 1n }, { mintPrice: 3n }, { mintPrice: ethers.MaxUint256 - 1n },
      { mintDeadline: 0n }, { vrfCoordinator: ZERO }, { vrfCoordinator: owner.address },
      { keyHash: ethers.ZeroHash }, { requestConfirmations: 0 }, { requestConfirmations: 63 },
      { requestConfirmations: 201 }, { callbackGasLimit: 99_999 }, { callbackGasLimit: 2_500_001 },
    ];
    for (const override of invalid) {
      await expect(ethers.deployContract("ManekinekoRoundV4", [{ ...config, ...override }, await round.renderer()]))
        .to.be.revertedWithCustomError(round, "InvalidConfig");
    }
    await expect(ethers.deployContract("ManekinekoRoundV4", [{ ...config, initialOwner: ZERO }, await round.renderer()]))
      .to.be.revertedWithCustomError(round, "OwnableInvalidOwner");
    await expect(round.renounceOwnership())
      .to.be.revertedWithCustomError(round, "OwnershipRenunciationDisabled");
  });

  it("validates mint quantities, exact payment, recipients, and one-way sale activation", async function () {
    const { round, coordinator, minter } = await loadFixture(fundedFixture);
    await expect(round.activateSale()).to.be.revertedWithCustomError(round, "InvalidPhase");
    for (const quantity of [0, 7, 21]) {
      await expect(round.connect(minter).mint(minter.address, quantity, { value: PRICE * BigInt(quantity) }))
        .to.be.revertedWithCustomError(round, "InvalidQuantity");
    }
    for (const value of [0n, PRICE - 1n, PRICE + 1n]) {
      await expect(round.connect(minter).mint(minter.address, 1, { value }))
        .to.be.revertedWithCustomError(round, "InvalidPayment");
    }
    for (const recipient of [ZERO, await round.getAddress(), await coordinator.getAddress()]) {
      await expect(round.connect(minter).mint(recipient, 1, { value: PRICE }))
        .to.be.revertedWithCustomError(round, "InvalidRecipient");
    }
    expect(await round.totalMintRevenue()).to.equal(0n);
    expect(await round.totalMinted()).to.equal(0n);
  });

  it("gates factory rollover on actual prize delivery and gives each round its own subscription", async function () {
    const { config, coordinator, owner, minter, other } = await deployRound();
    const factory = await ethers.deployContract("ManekinekoFactoryV4", [owner.address]);
    const nextConfig = { ...config, roundId: 2n };
    await expect(factory.connect(other).createRound(config))
      .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    await expect(factory.createRound(nextConfig)).to.be.revertedWithCustomError(factory, "InvalidRoundId");
    await factory.createRound(config);
    const first = await ethers.getContractAt("ManekinekoRoundV4", await factory.rounds(1));
    await expect(factory.createRound(nextConfig)).to.be.revertedWithCustomError(factory, "PreviousRoundIncomplete");
    await first.fundRandomness({ value: await coordinator.MOCK_FEE() });
    await first.activateSale();
    await first.connect(minter).mint(minter.address, config.maxSupply, { value: PRICE * config.maxSupply });
    await first.requestRandomness();
    await coordinator.fulfillRequest(await first.requestId(), 4321n);
    await first.finalizeDraw(1);
    await expect(factory.createRound(nextConfig)).to.be.revertedWithCustomError(factory, "PreviousRoundIncomplete");
    await first.distributePrize();
    await factory.createRound(nextConfig);
    const second = await ethers.getContractAt("ManekinekoRoundV4", await factory.rounds(2));
    expect(await factory.roundCount()).to.equal(2n);
    expect(await second.subscriptionId()).not.to.equal(await first.subscriptionId());
    expect((await coordinator.getSubscription(await second.subscriptionId())).owner).to.equal(await second.getAddress());
    await expect(factory.renounceOwnership())
      .to.be.revertedWithCustomError(factory, "OwnershipRenunciationDisabled");
    for (const contract of [factory, first, second]) {
      expect(ethers.getBytes(await ethers.provider.getCode(await contract.getAddress())).length).to.be.lessThanOrEqual(24_576);
    }
    const roundFactory = await ethers.getContractFactory("ManekinekoRoundV4");
    const roundDeployment = await roundFactory.getDeployTransaction(config, await first.renderer());
    expect(ethers.getBytes(roundDeployment.data!).length).to.be.lessThanOrEqual(49_152);
    const factoryDeployment = await (await ethers.getContractFactory("ManekinekoFactoryV4")).getDeployTransaction(owner.address);
    expect(ethers.getBytes(factoryDeployment.data!).length).to.be.lessThanOrEqual(49_152);
  });

  for (const supply of [1, 1_000, 2_000]) {
    it(`gives all ${supply} referred NFTs distinct scores, one winner and exactly 1% protected commissions`, async function () {
      const context = await deployRound({ maxSupply: BigInt(supply) });
      const { round, coordinator, minter, owner, holder, operator, other } = context;
      const nonce = ethers.id(`full-collection-${supply}`);
      const deadline = BigInt(await time.latest()) + 600n;
      const signature = await operator.signTypedData({
        name: "ManekinekoAffiliateEnrollment", version: "2", chainId: 31337,
        verifyingContract: await round.getAddress(),
      }, { Enrollment: [
        { name: "applicant", type: "address" }, { name: "affiliateId", type: "uint256" }, { name: "commissionBps", type: "uint256" }, { name: "nonce", type: "bytes32" }, { name: "deadline", type: "uint256" },
      ] }, { applicant: other.address, affiliateId: 1n, commissionBps: 100n, nonce, deadline });
      await round.connect(other).enrollAffiliate(other.address, 1, 100, nonce, deadline, signature);
      await round.fundRandomness({ value: (await coordinator.MOCK_FEE()) * 2n });
      await round.activateSale();
      const ticketHolders = [minter, holder];
      for (let minted = 0, batch = 0; minted < supply; batch++) {
        const quantity = Math.min(20, supply - minted);
        const buyer = ticketHolders[batch % ticketHolders.length];
        await round.connect(buyer).mintWithAffiliate(buyer.address, quantity, 1, { value: PRICE * BigInt(quantity) });
        minted += quantity;
      }
      await round.connect(operator).requestRandomness();
      await coordinator.fulfillRequest(await round.requestId(), BigInt(supply));
      await round.connect(operator).finalizeDraw(1);
      const seenScores = new Set<string>();
      const seenCombinations = new Set<string>();
      const winners: bigint[] = [];
      for (let first = 1; first <= supply; first += 32) {
        const ids = Array.from({ length: Math.min(32, supply - first + 1) }, (_, offset) => BigInt(first + offset));
        const tickets = await Promise.all(ids.map(async (id) => ({ id, values: await round.combination(id) })));
        for (const { id, values: [numbers, code, score] } of tickets) {
          const reconstructed = numbers.reduce((value: bigint, number: bigint) => value * 16n + number - 1n, 0n);
          expect(code).to.equal(reconstructed);
          expect(score).to.equal(reconstructed + 1n);
          expect(score >= 1n && score <= BigInt(supply)).to.equal(true);
          seenScores.add(score.toString());
          seenCombinations.add(numbers.join(","));
          if (score === BigInt(supply)) winners.push(id);
        }
      }
      expect(seenScores.size).to.equal(supply);
      expect(seenCombinations.size).to.equal(supply);
      expect(winners).to.deep.equal([await round.winningTokenId()]);
      expect(await round.highestScore()).to.equal(BigInt(supply));
      const winningAddress = await round.ownerOf(winners[0]);
      const winningHolder = ticketHolders.find(({ address }) => address === winningAddress)!;
      const losingHolder = ticketHolders.find(({ address }) => address !== winningAddress)!;
      expect(winningHolder).not.to.equal(undefined);
      if (supply > 1) {
        expect(await round.balanceOf(minter.address)).to.be.greaterThan(0n);
        expect(await round.balanceOf(holder.address)).to.be.greaterThan(0n);
      }
      const prize = PRICE * BigInt(supply) / 2n;
      await expect(round.connect(owner).distributePrize())
        .to.changeEtherBalances(ethers, [round, winningHolder, losingHolder], [-prize, prize, 0n]);
      expect(await round.prizePaidAmount()).to.equal(prize);
      expect(await round.prizeRecipient()).to.equal(winningHolder.address);
      expect(await round.readyForNextRound()).to.equal(true);
      await expect(round.distributePrize()).to.be.revertedWithCustomError(round, "InvalidPhase");
      await round.connect(winningHolder).transferFrom(winningHolder.address, other.address, winners[0]);
      await expect(round.connect(other).claimPrize(other.address)).to.be.revertedWithCustomError(round, "InvalidPhase");
      const commissions = PRICE * BigInt(supply) / 100n;
      expect(await round.totalAffiliateAccrued()).to.equal(commissions);
      expect(await round.withdrawableBalance()).to.equal(prize - commissions);
      await round.withdraw(owner.address, prize - commissions);
      expect(await ethers.provider.getBalance(await round.getAddress())).to.equal(commissions);
      await round.connect(other).claimAffiliateCommission(operator.address);
      expect(await round.totalAffiliateClaimed()).to.equal(commissions);
      expect(await ethers.provider.getBalance(await round.getAddress())).to.equal(0n);
    });
  }
});
