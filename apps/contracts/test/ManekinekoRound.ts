import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();
const { loadFixture, mineUpTo, time } = networkHelpers;
const PRICE = 100n;
const ZERO = ethers.ZeroAddress;
const REENTRANCY_ERROR = ethers.id("ReentrancyGuardReentrantCall()").slice(0, 10);

interface RoundConfig {
  name: string;
  symbol: string;
  roundId: bigint;
  maxSupply: bigint;
  mintPrice: bigint;
  mintDeadline: bigint;
  revealDelayBlocks: bigint;
  initialOwner: string;
}

interface Metadata {
  name: string;
  description: string;
  image: string;
  attributes: { trait_type: string; value: number | string }[];
}

async function deployRound(overrides: Partial<RoundConfig> = {}) {
  const [owner, minter, holder, other, operator] = await ethers.getSigners();
  const config: RoundConfig = {
    name: "Manekineko",
    symbol: "NEKO",
    roundId: 1n,
    maxSupply: 6n,
    mintPrice: PRICE,
    mintDeadline: BigInt(await time.latest()) + 3600n,
    revealDelayBlocks: 2n,
    initialOwner: owner.address,
    ...overrides,
  };
  const round = await ethers.deployContract("ManekinekoRound", [config]);
  return { round, config, owner, minter, holder, other, operator };
}

type Round = Awaited<ReturnType<typeof deployRound>>["round"];

async function initialFixture() { return deployRound(); }

async function soldOutFixture() {
  const context = await deployRound();
  await context.round.connect(context.minter).mint(context.minter.address, context.config.maxSupply, {
    value: PRICE * context.config.maxSupply,
  });
  return context;
}

async function reveal(round: Round) {
  await mineUpTo(await round.revealBlock());
  await round.captureReveal();
}

async function revealedFixture() {
  const context = await soldOutFixture();
  await reveal(context.round);
  return context;
}

async function settledFixture() {
  const context = await revealedFixture();
  await context.round.settle(200);
  return context;
}

async function paidFixture() {
  const context = await settledFixture();
  await context.round.distributePrize();
  return context;
}

async function expiredFixture() {
  const context = await deployRound();
  await context.round.connect(context.minter).mint(context.minter.address, 2, { value: PRICE * 2n });
  await time.increaseTo(context.config.mintDeadline);
  return context;
}

function referenceCombination(seed: string, tokenId: bigint) {
  let left = (tokenId - 1n) >> 16n;
  let right = (tokenId - 1n) & 0xffffn;
  for (let round = 0n; round < 4n; round++) {
    const digest = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint256", "uint256"], [seed, round, right],
    ));
    [left, right] = [right, left ^ (BigInt(digest) & 0xffffn)];
  }
  const code = (left << 16n) | right;
  const numbers = [24n, 16n, 8n, 0n].map((shift) => ((code >> shift) & 255n) + 1n);
  const score = (numbers[0] * numbers[1] + numbers[2] * numbers[3]) * (1n << 32n) + code;
  return { code, numbers, score };
}

function decodeMetadata(uri: string): Metadata {
  expect(uri.startsWith("data:application/json;base64,")).to.equal(true);
  return JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString("utf8")) as Metadata;
}

async function forceEther(round: Round, amount: bigint) {
  const force = await ethers.deployContract("ForceEther", [], { value: amount });
  await force.force(await round.getAddress());
}

describe("ManekinekoRound", function () {
  describe("configuration and minting", function () {
    it("keeps deployment parameters immutable and supports ERC-721, metadata and refresh interfaces", async function () {
      const { round, config, owner } = await loadFixture(initialFixture);
      expect(await round.name()).to.equal(config.name);
      expect(await round.symbol()).to.equal(config.symbol);
      expect(await round.owner()).to.equal(owner.address);
      expect(await round.roundId()).to.equal(config.roundId);
      expect(await round.maxSupply()).to.equal(config.maxSupply);
      expect(await round.mintPrice()).to.equal(config.mintPrice);
      expect(await round.mintDeadline()).to.equal(config.mintDeadline);
      expect(await round.revealDelayBlocks()).to.equal(config.revealDelayBlocks);
      expect(await round.phase()).to.equal(0n);
      expect(await round.readyForNextRound()).to.equal(false);
      for (const id of ["0x01ffc9a7", "0x80ac58cd", "0x5b5e139f", "0x49064906"]) {
        expect(await round.supportsInterface(id)).to.equal(true);
      }
      expect(await round.supportsInterface("0xffffffff")).to.equal(false);
    });

    it("rejects invalid supply, prices, deadlines, reveal delays and metadata configuration", async function () {
      const { round, config } = await loadFixture(initialFixture);
      const invalid: Partial<RoundConfig>[] = [
        { name: "" }, { name: "n".repeat(81) }, { symbol: "" }, { symbol: "s".repeat(17) },
        { roundId: 0n }, { maxSupply: 0n }, { maxSupply: 65_537n },
        { mintPrice: 0n }, { mintPrice: 1n }, { mintPrice: 3n },
        { mintPrice: ethers.MaxUint256 - 1n }, { mintDeadline: BigInt(await time.latest()) },
        { revealDelayBlocks: 0n }, { revealDelayBlocks: 1n }, { revealDelayBlocks: 201n },
      ];
      for (const patch of invalid) {
        await expect(ethers.deployContract("ManekinekoRound", [{ ...config, ...patch }]))
          .to.be.revertedWithCustomError(round, "InvalidConfig");
      }
      await expect(ethers.deployContract("ManekinekoRound", [{ ...config, initialOwner: ZERO }]))
        .to.be.revertedWithCustomError(round, "OwnableInvalidOwner").withArgs(ZERO);
    });

    it("accepts boundary configuration and preserves exact half-wei accounting with an even price", async function () {
      const { round } = await deployRound({ maxSupply: 65_536n, mintPrice: 2n, revealDelayBlocks: 200n });
      expect(await round.maxSupply()).to.equal(65_536n);
      expect(await round.mintPrice()).to.equal(2n);
      expect(await round.revealDelayBlocks()).to.equal(200n);
    });

    it("requires exact native payment and mints a batch to the specified recipient", async function () {
      const { round, minter, holder } = await loadFixture(initialFixture);
      for (const value of [0n, PRICE * 2n - 1n, PRICE * 2n + 1n]) {
        await expect(round.connect(minter).mint(holder.address, 2, { value }))
          .to.be.revertedWithCustomError(round, "InvalidPayment").withArgs(PRICE * 2n, value);
      }
      await expect(round.connect(minter).mint(holder.address, 2, { value: PRICE * 2n }))
        .to.emit(round, "Minted").withArgs(minter.address, holder.address, 1n, 2n);
      expect(await round.ownerOf(1)).to.equal(holder.address);
      expect(await round.ownerOf(2)).to.equal(holder.address);
      expect(await round.totalMinted()).to.equal(2n);
      expect(await round.totalMintRevenue()).to.equal(PRICE * 2n);
      expect(await ethers.provider.getBalance(await round.getAddress())).to.equal(PRICE * 2n);
    });

    it("enforces batch and collection limits, rejects unsafe recipients, and closes at sellout", async function () {
      const { round, minter, config } = await loadFixture(initialFixture);
      for (const quantity of [0, 7, 21]) {
        await expect(round.mint(minter.address, quantity, { value: PRICE * BigInt(quantity) }))
          .to.be.revertedWithCustomError(round, "InvalidQuantity");
      }
      for (const address of [ZERO, await round.getAddress()]) {
        await expect(round.mint(address, 1, { value: PRICE }))
          .to.be.revertedWithCustomError(round, "InvalidRecipient");
      }
      const tx = await round.mint(minter.address, 6, { value: PRICE * 6n });
      const receipt = await tx.wait();
      expect(await round.revealBlock()).to.equal(BigInt(receipt!.blockNumber) + config.revealDelayBlocks);
      expect(await round.soldOut()).to.equal(true);
      expect(await round.phase()).to.equal(1n);
      await expect(round.mint(minter.address, 1, { value: PRICE, gasLimit: 1_000_000n })).to.be.revertedWithCustomError(round, "MintClosed");
      await expect(round.connect(minter).transferFrom(minter.address, await round.getAddress(), 1))
        .to.be.revertedWithCustomError(round, "InvalidRecipient");
    });

    it("closes minting at the configured deadline", async function () {
      const { round, config, minter } = await loadFixture(initialFixture);
      await time.setNextBlockTimestamp(config.mintDeadline);
      await expect(round.mint(minter.address, 1, { value: PRICE, gasLimit: 1_000_000n })).to.be.revertedWithCustomError(round, "MintClosed");
      expect(await round.refundsAvailable()).to.equal(true);
      expect(await round.phase()).to.equal(5n);
    });

    it("reserves the whole batch before receiver callbacks and rejects a reentrant overmint", async function () {
      const { round, minter } = await deployRound({ maxSupply: 1n });
      const wallet = await ethers.deployContract("RoundReceiver", [await round.getAddress()], { value: PRICE });
      const walletAddress = await wallet.getAddress();
      await wallet.configure(false, true, round.interface.encodeFunctionData("mint", [walletAddress, 1]), PRICE);
      await round.connect(minter).mint(walletAddress, 1, { value: PRICE });
      expect(await wallet.callbackAttempts()).to.equal(1n);
      expect(await wallet.callbackSucceeded()).to.equal(false);
      expect((await wallet.callbackResult()).slice(0, 10)).to.equal(REENTRANCY_ERROR);
      expect(await round.totalMinted()).to.equal(1n);
      expect(await round.totalMintRevenue()).to.equal(PRICE);
      expect(await round.ownerOf(1)).to.equal(walletAddress);
      await expect(round.ownerOf(2)).to.be.revertedWithCustomError(round, "ERC721NonexistentToken");
    });

    it("exposes the committed reveal block and sealed metadata during the final receiver callback", async function () {
      const { round } = await deployRound({ maxSupply: 1n });
      const wallet = await ethers.deployContract("RoundReceiver", [await round.getAddress()]);
      await mineUpTo(BigInt(await ethers.provider.getBlockNumber()) + 300n);
      await round.mint(await wallet.getAddress(), 1, { value: PRICE });
      expect(await wallet.observedRevealBlock()).to.equal(await round.revealBlock());
      expect(await wallet.observedRevealBlock()).to.be.greaterThan(300n);
      expect(await wallet.observedRefundsAvailable()).to.equal(false);
      expect(await wallet.observedPhase()).to.equal(1n);
      const metadata = decodeMetadata(await wallet.observedTokenURI());
      expect(metadata.attributes).to.deep.equal([{ trait_type: "Status", value: "Sealed" }]);
    });
  });

  describe("committed reveal and arithmetic", function () {
    it("keeps combinations sealed and rejects premature reveal, settlement and payout", async function () {
      const { round, minter } = await loadFixture(initialFixture);
      await round.mint(minter.address, 1, { value: PRICE });
      await expect(round.combination(1)).to.be.revertedWithCustomError(round, "RevealNotAvailable");
      await expect(round.captureReveal()).to.be.revertedWithCustomError(round, "InvalidPhase");
      await expect(round.settle(1)).to.be.revertedWithCustomError(round, "InvalidPhase");
      await expect(round.distributePrize()).to.be.revertedWithCustomError(round, "InvalidPhase");
      await expect(round.combination(2)).to.be.revertedWithCustomError(round, "ERC721NonexistentToken");
      await expect(round.tokenURI(2)).to.be.revertedWithCustomError(round, "ERC721NonexistentToken");
    });

    it("cannot capture in the source block and derives the seed from that fixed block, contract, chain and round", async function () {
      const { round, other, config } = await loadFixture(soldOutFixture);
      const sourceBlock = await round.revealBlock();
      await mineUpTo(sourceBlock - 1n);
      await expect(round.captureReveal({ gasLimit: 1_000_000n })).to.be.revertedWithCustomError(round, "RevealNotAvailable");
      const block = await ethers.provider.getBlock(Number(sourceBlock));
      const { chainId } = await ethers.provider.getNetwork();
      const expected = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "address", "uint256", "uint256"],
        [block!.hash, await round.getAddress(), chainId, config.roundId],
      ));
      await expect(round.connect(other).captureReveal()).to.emit(round, "Revealed").withArgs(expected, sourceBlock);
      expect(await round.revealSeed()).to.equal(expected);
      expect(await round.revealed()).to.equal(true);
      expect(await round.phase()).to.equal(2n);
      await expect(round.captureReveal()).to.be.revertedWithCustomError(round, "InvalidPhase");
    });

    it("allows capture exactly 256 blocks after the committed source block", async function () {
      const { round } = await loadFixture(soldOutFixture);
      await mineUpTo((await round.revealBlock()) + 255n);
      await round.captureReveal();
      expect(await round.revealed()).to.equal(true);
      expect(await round.refundsAvailable()).to.equal(false);
    });

    it("rejects capture at source plus 257 and makes a sold-out round refundable", async function () {
      const { round, other } = await loadFixture(soldOutFixture);
      await mineUpTo((await round.revealBlock()) + 256n);
      expect(await round.refundsAvailable()).to.equal(false);
      await expect(round.captureReveal({ gasLimit: 1_000_000n })).to.be.revertedWithCustomError(round, "RevealNotAvailable");
      expect(await round.refundsAvailable()).to.equal(true);
      await expect(round.connect(other).cancelExpiredRound()).to.emit(round, "RoundCancelled").withArgs(1);
      expect(await round.cancelled()).to.equal(true);
      expect(await round.phase()).to.equal(5n);
      expect(await round.readyForNextRound()).to.equal(false);
      await expect(round.captureReveal()).to.be.revertedWithCustomError(round, "InvalidPhase");
    });

    it("matches an independent permutation and score calculation, with unique tuples and a batch-independent winner", async function () {
      const { round, minter, other } = await deployRound({ maxSupply: 41n });
      for (const quantity of [20n, 20n, 1n]) await round.mint(minter.address, quantity, { value: PRICE * quantity });
      await reveal(round);
      const seed = await round.revealSeed();
      const seenCodes = new Set<string>();
      const seenScores = new Set<string>();
      let bestId = 0n;
      let bestScore = 0n;
      for (let id = 1n; id <= 41n; id++) {
        const expected = referenceCombination(seed, id);
        const [numbers, code, score] = await round.combination(id);
        expect([...numbers]).to.deep.equal(expected.numbers);
        expect(code).to.equal(expected.code);
        expect(score).to.equal(expected.score);
        for (const value of numbers) expect(value >= 1n && value <= 256n).to.equal(true);
        seenCodes.add(code.toString());
        seenScores.add(score.toString());
        if (expected.score > bestScore) { bestScore = expected.score; bestId = id; }
      }
      expect(seenCodes.size).to.equal(41);
      expect(seenScores.size).to.equal(41);
      await round.connect(other).settle(1);
      expect(await round.settledCount()).to.equal(1n);
      await round.connect(other).settle(17);
      expect(await round.settledCount()).to.equal(18n);
      await expect(round.connect(other).settle(200)).to.emit(round, "WinnerDetermined").withArgs(bestId, bestScore, PRICE * 41n / 2n);
      expect(await round.settledCount()).to.equal(41n);
      expect(await round.winningTokenId()).to.equal(bestId);
      expect(await round.highestScore()).to.equal(bestScore);
      expect(await round.phase()).to.equal(3n);
    });

    it("bounds settlement calls, prevents partial-settlement prizes, and cannot settle twice", async function () {
      const { round } = await loadFixture(revealedFixture);
      for (const count of [0, 201]) {
        await expect(round.settle(count)).to.be.revertedWithCustomError(round, "InvalidQuantity");
      }
      await round.settle(2);
      await expect(round.distributePrize()).to.be.revertedWithCustomError(round, "InvalidPhase");
      await round.settle(200);
      await expect(round.settle(1)).to.be.revertedWithCustomError(round, "InvalidPhase");
    });

    it("keeps a captured round settleable even after the hash window and mint deadline expire", async function () {
      const { round, config } = await loadFixture(revealedFixture);
      await mineUpTo((await round.revealBlock()) + 300n);
      await time.increaseTo(config.mintDeadline + 1n);
      expect(await round.refundsAvailable()).to.equal(false);
      await expect(round.cancelExpiredRound()).to.be.revertedWithCustomError(round, "InvalidPhase");
      await round.settle(200);
      await round.distributePrize();
      expect(await round.phase()).to.equal(4n);
    });
  });

  describe("prize and treasury", function () {
    it("reserves every receipt until the prize is paid and restricts treasury actions to the owner", async function () {
      const { round, owner, other } = await loadFixture(settledFixture);
      expect(await round.withdrawableBalance()).to.equal(0n);
      await expect(round.withdraw(owner.address, 1)).to.be.revertedWithCustomError(round, "InsufficientWithdrawableBalance");
      await expect(round.connect(other).withdraw(other.address, 1))
        .to.be.revertedWithCustomError(round, "OwnableUnauthorizedAccount").withArgs(other.address);
      await expect(round.connect(other).distributePrize())
        .to.be.revertedWithCustomError(round, "OwnableUnauthorizedAccount").withArgs(other.address);
      expect(await round.readyForNextRound()).to.equal(false);
    });

    it("pays exactly half of mint revenue once to the current winning holder after a transfer", async function () {
      const { round, minter, holder, config } = await loadFixture(settledFixture);
      const winningTokenId = await round.winningTokenId();
      const prize = config.maxSupply * PRICE / 2n;
      await round.connect(minter).transferFrom(minter.address, holder.address, winningTokenId);
      await expect(round.distributePrize()).to.changeEtherBalances(ethers, [round, holder], [-prize, prize]);
      expect(await round.prizePaid()).to.equal(true);
      expect(await round.prizeRecipient()).to.equal(holder.address);
      expect(await round.prizePaidAmount()).to.equal(prize);
      expect(await round.withdrawableBalance()).to.equal(prize);
      expect(await round.readyForNextRound()).to.equal(true);
      expect(await round.phase()).to.equal(4n);
      await expect(round.distributePrize()).to.be.revertedWithCustomError(round, "InvalidPhase");
    });

    it("excludes forced currency from the prize and releases the remainder after delivery", async function () {
      const { round, owner, minter } = await loadFixture(settledFixture);
      await forceEther(round, 77n);
      expect(await round.totalMintRevenue()).to.equal(600n);
      expect(await round.prizeAmount()).to.equal(300n);
      expect(await round.withdrawableBalance()).to.equal(0n);
      await expect(round.distributePrize()).to.changeEtherBalances(ethers, [round, minter], [-300n, 300n]);
      expect(await round.withdrawableBalance()).to.equal(377n);
      await expect(round.withdraw(owner.address, 377n)).to.emit(round, "Withdrawn").withArgs(owner.address, 377n);
      expect(await ethers.provider.getBalance(await round.getAddress())).to.equal(0n);
    });

    it("validates withdrawals and reverts atomically when the recipient rejects payment", async function () {
      const { round, owner } = await loadFixture(paidFixture);
      for (const recipient of [ZERO, await round.getAddress()]) {
        await expect(round.withdraw(recipient, 1)).to.be.revertedWithCustomError(round, "InvalidRecipient");
      }
      for (const amount of [0, 301]) {
        await expect(round.withdraw(owner.address, amount)).to.be.revertedWithCustomError(round, "InsufficientWithdrawableBalance");
      }
      const wallet = await ethers.deployContract("RoundReceiver", [await round.getAddress()]);
      await wallet.configure(true, false, "0x", 0);
      await expect(round.withdraw(await wallet.getAddress(), 300)).to.be.revertedWithCustomError(round, "TransferFailed");
      expect(await round.withdrawableBalance()).to.equal(300n);
      await round.withdraw(owner.address, 300);
      expect(await round.withdrawableBalance()).to.equal(0n);
    });

    it("rolls back a rejected prize and can retry after the winner transfers the NFT", async function () {
      const { round, minter, holder } = await loadFixture(settledFixture);
      const wallet = await ethers.deployContract("RoundReceiver", [await round.getAddress()]);
      const walletAddress = await wallet.getAddress();
      const id = await round.winningTokenId();
      await wallet.configure(true, false, "0x", 0);
      await round.connect(minter).transferFrom(minter.address, walletAddress, id);
      await expect(round.distributePrize()).to.be.revertedWithCustomError(round, "TransferFailed");
      expect(await round.prizePaid()).to.equal(false);
      expect(await round.prizeRecipient()).to.equal(ZERO);
      expect(await round.prizePaidAmount()).to.equal(0n);
      expect(await round.readyForNextRound()).to.equal(false);
      await wallet.execute(round.interface.encodeFunctionData("transferFrom", [walletAddress, holder.address, id]));
      await expect(round.distributePrize()).to.emit(round, "PrizeDelivered").withArgs(id, holder.address, 300n);
    });

    it("rejects prize reentrancy even when the receiving wallet is also the round owner", async function () {
      const { round, minter } = await loadFixture(settledFixture);
      const wallet = await ethers.deployContract("RoundReceiver", [await round.getAddress()]);
      const address = await wallet.getAddress();
      await round.connect(minter).transferFrom(minter.address, address, await round.winningTokenId());
      await round.transferOwnership(address);
      await wallet.execute(round.interface.encodeFunctionData("acceptOwnership"));
      const payout = round.interface.encodeFunctionData("distributePrize");
      await wallet.configure(false, false, payout, 0);
      await wallet.execute(payout);
      expect(await wallet.callbackAttempts()).to.equal(1n);
      expect(await wallet.callbackSucceeded()).to.equal(false);
      expect((await wallet.callbackResult()).slice(0, 10)).to.equal(REENTRANCY_ERROR);
      expect(await round.prizePaidAmount()).to.equal(300n);
      expect(await ethers.provider.getBalance(address)).to.equal(300n);
    });

    it("rejects withdrawal reentrancy while allowing the authorized outer withdrawal", async function () {
      const { round } = await loadFixture(paidFixture);
      const wallet = await ethers.deployContract("RoundReceiver", [await round.getAddress()]);
      const address = await wallet.getAddress();
      await round.transferOwnership(address);
      await wallet.execute(round.interface.encodeFunctionData("acceptOwnership"));
      await wallet.configure(false, false, round.interface.encodeFunctionData("withdraw", [address, 1]), 0);
      await wallet.execute(round.interface.encodeFunctionData("withdraw", [address, 300]));
      expect(await wallet.callbackAttempts()).to.equal(1n);
      expect(await wallet.callbackSucceeded()).to.equal(false);
      expect((await wallet.callbackResult()).slice(0, 10)).to.equal(REENTRANCY_ERROR);
      expect(await ethers.provider.getBalance(address)).to.equal(300n);
      expect(await round.withdrawableBalance()).to.equal(0n);
    });
  });

  describe("expiry and holder refunds", function () {
    it("cannot cancel or refund an active round", async function () {
      const { round, minter } = await loadFixture(initialFixture);
      await round.mint(minter.address, 1, { value: PRICE });
      await expect(round.cancelExpiredRound()).to.be.revertedWithCustomError(round, "InvalidPhase");
      await expect(round.connect(minter).refund(1, minter.address)).to.be.revertedWithCustomError(round, "InvalidPhase");
    });

    it("lets anyone cancel an expired unsold round and keeps all mint receipts reserved", async function () {
      const { round, other, owner } = await loadFixture(expiredFixture);
      await expect(round.connect(other).cancelExpiredRound()).to.emit(round, "RoundCancelled").withArgs(1);
      expect(await round.cancelled()).to.equal(true);
      expect(await round.withdrawableBalance()).to.equal(0n);
      await expect(round.withdraw(owner.address, 1)).to.be.revertedWithCustomError(round, "InsufficientWithdrawableBalance");
      await expect(round.cancelExpiredRound()).to.be.revertedWithCustomError(round, "InvalidPhase");
      await expect(round.mint(other.address, 1, { value: PRICE })).to.be.revertedWithCustomError(round, "MintClosed");
    });

    it("refund rights follow current ownership, not the payer or an approved operator, and burn exactly once", async function () {
      const { round, minter, holder, other, operator } = await loadFixture(expiredFixture);
      await round.connect(minter).transferFrom(minter.address, holder.address, 1);
      await round.connect(holder).approve(operator.address, 1);
      for (const account of [minter, operator, other]) {
        await expect(round.connect(account).refund(1, account.address)).to.be.revertedWithCustomError(round, "NotTokenHolder");
      }
      await expect(round.connect(holder).refund(1, other.address)).to.changeEtherBalances(ethers, [round, other], [-PRICE, PRICE]);
      expect(await round.cancelled()).to.equal(true);
      expect(await round.totalRefunded()).to.equal(PRICE);
      expect(await round.refundedCount()).to.equal(1n);
      expect(await round.totalMinted()).to.equal(2n);
      await expect(round.ownerOf(1)).to.be.revertedWithCustomError(round, "ERC721NonexistentToken");
      await expect(round.connect(holder).refund(1, other.address)).to.be.revertedWithCustomError(round, "ERC721NonexistentToken");
      await round.connect(minter).refund(2, minter.address);
      expect(await round.totalRefunded()).to.equal(PRICE * 2n);
      expect(await ethers.provider.getBalance(await round.getAddress())).to.equal(0n);
      expect(await round.readyForNextRound()).to.equal(false);
    });

    it("rejects invalid refund recipients and preserves ownership and liability after a rejected refund", async function () {
      const { round, minter } = await loadFixture(expiredFixture);
      for (const recipient of [ZERO, await round.getAddress()]) {
        await expect(round.connect(minter).refund(1, recipient)).to.be.revertedWithCustomError(round, "InvalidRecipient");
      }
      const wallet = await ethers.deployContract("RoundReceiver", [await round.getAddress()]);
      await wallet.configure(true, false, "0x", 0);
      await expect(round.connect(minter).refund(1, await wallet.getAddress())).to.be.revertedWithCustomError(round, "TransferFailed");
      expect(await round.ownerOf(1)).to.equal(minter.address);
      expect(await round.totalRefunded()).to.equal(0n);
      expect(await round.refundedCount()).to.equal(0n);
      expect(await round.cancelled()).to.equal(false);
      await round.connect(minter).refund(1, minter.address);
      expect(await round.totalRefunded()).to.equal(PRICE);
    });

    it("permits withdrawal of forced currency on expiry while protecting every outstanding refund", async function () {
      const { round, minter, owner } = await loadFixture(expiredFixture);
      await forceEther(round, 77n);
      expect(await round.withdrawableBalance()).to.equal(77n);
      await expect(round.withdraw(owner.address, 78n)).to.be.revertedWithCustomError(round, "InsufficientWithdrawableBalance");
      await round.withdraw(owner.address, 77n);
      await round.connect(minter).refund(1, minter.address);
      expect(await round.withdrawableBalance()).to.equal(0n);
      expect(await ethers.provider.getBalance(await round.getAddress())).to.equal(PRICE);
      await round.connect(minter).refund(2, minter.address);
      expect(await ethers.provider.getBalance(await round.getAddress())).to.equal(0n);
    });

    it("rejects refund reentrancy without burning the second NFT or paying it twice", async function () {
      const { round, config } = await loadFixture(initialFixture);
      const wallet = await ethers.deployContract("RoundReceiver", [await round.getAddress()]);
      const address = await wallet.getAddress();
      await round.mint(address, 2, { value: PRICE * 2n });
      await time.increaseTo(config.mintDeadline);
      await wallet.configure(false, false, round.interface.encodeFunctionData("refund", [2, address]), 0);
      await wallet.execute(round.interface.encodeFunctionData("refund", [1, address]));
      expect(await wallet.callbackAttempts()).to.equal(1n);
      expect(await wallet.callbackSucceeded()).to.equal(false);
      expect((await wallet.callbackResult()).slice(0, 10)).to.equal(REENTRANCY_ERROR);
      expect(await round.ownerOf(2)).to.equal(address);
      expect(await round.totalRefunded()).to.equal(PRICE);
      expect(await round.refundedCount()).to.equal(1n);
      expect(await ethers.provider.getBalance(address)).to.equal(PRICE);
    });
  });

  describe("on-chain metadata and ownership", function () {
    it("embeds valid JSON and a complete SVG and safely escapes collection names", async function () {
      const name = 'Neko "Lucky" \\ cats\n招き猫';
      const { round, minter } = await deployRound({ name });
      await round.mint(minter.address, 1, { value: PRICE });
      const metadata = decodeMetadata(await round.tokenURI(1));
      expect(metadata.name).to.equal(`${name} #1`);
      expect(metadata.attributes).to.deep.equal([{ trait_type: "Status", value: "Sealed" }]);
      expect(metadata.image.startsWith("data:image/svg+xml;base64,")).to.equal(true);
      const svg = Buffer.from(metadata.image.split(",")[1], "base64").toString("utf8");
      expect(svg).to.contain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).to.contain("Sealed until reveal");
      expect(svg).to.contain("TOKEN #1");
      expect(svg.endsWith("</svg>")).to.equal(true);
      expect(svg).not.to.match(/(?:href|src)=|<script|<foreignObject/);
    });

    it("renders revealed combinations and exact score attributes entirely from contract state", async function () {
      const { round } = await loadFixture(revealedFixture);
      const metadata = decodeMetadata(await round.tokenURI(1));
      const [numbers, code, score] = await round.combination(1);
      expect(metadata.attributes).to.deep.equal([
        ...["A", "B", "C", "D"].map((trait_type, index) => ({ trait_type, value: Number(numbers[index]) })),
        { trait_type: "Combination code", value: Number(code) },
        { trait_type: "Score", value: Number(score) },
      ]);
      const svg = Buffer.from(metadata.image.split(",")[1], "base64").toString("utf8");
      expect(svg).to.contain([...numbers].join(" / "));
      expect(metadata.description).to.contain("Score = (a*b+c*d)*4294967296+combinationCode");
    });

    it("renders refund availability before cancellation and removes metadata after a refund burn", async function () {
      const { round, minter } = await loadFixture(expiredFixture);
      const metadata = decodeMetadata(await round.tokenURI(1));
      expect(metadata.attributes).to.deep.equal([{ trait_type: "Status", value: "Refundable" }]);
      expect(Buffer.from(metadata.image.split(",")[1], "base64").toString("utf8")).to.contain("Refund available");
      await round.connect(minter).refund(1, minter.address);
      await expect(round.tokenURI(1)).to.be.revertedWithCustomError(round, "ERC721NonexistentToken");
    });

    it("requires two-step ownership transfer and prevents owner renunciation", async function () {
      const { round, owner, holder, other } = await loadFixture(initialFixture);
      await expect(round.renounceOwnership()).to.be.revertedWithCustomError(round, "OwnershipRenunciationDisabled");
      await round.transferOwnership(holder.address);
      expect(await round.owner()).to.equal(owner.address);
      expect(await round.pendingOwner()).to.equal(holder.address);
      await expect(round.connect(other).acceptOwnership()).to.be.revertedWithCustomError(round, "OwnableUnauthorizedAccount");
      await round.connect(holder).acceptOwnership();
      expect(await round.owner()).to.equal(holder.address);
      expect(await round.pendingOwner()).to.equal(ZERO);
      await expect(round.distributePrize()).to.be.revertedWithCustomError(round, "OwnableUnauthorizedAccount");
      await expect(round.connect(holder).renounceOwnership()).to.be.revertedWithCustomError(round, "OwnershipRenunciationDisabled");
    });
  });
});

describe("ManekinekoFactory", function () {
  async function factoryFixture() {
    const [owner, minter, holder, other] = await ethers.getSigners();
    const factory = await ethers.deployContract("ManekinekoFactory", [owner.address]);
    const config: RoundConfig = {
      name: "Manekineko Round 1", symbol: "NEKO", roundId: 1n, maxSupply: 2n,
      mintPrice: PRICE, mintDeadline: BigInt(await time.latest()) + 3600n,
      revealDelayBlocks: 2n, initialOwner: holder.address,
    };
    return { factory, config, owner, minter, holder, other };
  }

  it("restricts creation to its owner, validates round IDs and records an independently owned round", async function () {
    const { factory, config, holder, other } = await loadFixture(factoryFixture);
    await expect(factory.connect(other).createRound(config)).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    await expect(factory.createRound({ ...config, roundId: 2n })).to.be.revertedWithCustomError(factory, "InvalidRoundId");
    await factory.createRound(config);
    const address = await factory.rounds(1);
    const round = await ethers.getContractAt("ManekinekoRound", address);
    expect(await factory.roundCount()).to.equal(1n);
    expect(address).not.to.equal(ZERO);
    expect(await round.owner()).to.equal(holder.address);
    expect(await round.roundId()).to.equal(1n);
    expect(await round.mintPrice()).to.equal(PRICE);
    expect(await round.maxSupply()).to.equal(2n);
  });

  it("allows rollover only after sellout, complete settlement and actual prize delivery", async function () {
    const { factory, config, minter, holder } = await loadFixture(factoryFixture);
    await factory.createRound(config);
    const round = await ethers.getContractAt("ManekinekoRound", await factory.rounds(1));
    const next = { ...config, name: "Manekineko Round 2", roundId: 2n, maxSupply: 3n, mintPrice: 200n };
    await expect(factory.createRound(next)).to.be.revertedWithCustomError(factory, "PreviousRoundIncomplete");
    await round.connect(minter).mint(minter.address, 2, { value: PRICE * 2n });
    await expect(factory.createRound(next)).to.be.revertedWithCustomError(factory, "PreviousRoundIncomplete");
    await reveal(round);
    await round.settle(200);
    await expect(factory.createRound(next)).to.be.revertedWithCustomError(factory, "PreviousRoundIncomplete");
    await round.connect(holder).distributePrize();
    await expect(factory.createRound({ ...next, roundId: 3n })).to.be.revertedWithCustomError(factory, "InvalidRoundId");
    await expect(factory.createRound(next)).to.emit(factory, "RoundCreated");
    expect(await factory.roundCount()).to.equal(2n);
    const second = await ethers.getContractAt("ManekinekoRound", await factory.rounds(2));
    expect(await second.roundId()).to.equal(2n);
    expect(await second.maxSupply()).to.equal(3n);
    expect(await second.mintPrice()).to.equal(200n);
    expect(await second.totalMinted()).to.equal(0n);
    expect(await round.withdrawableBalance()).to.equal(PRICE);
  });

  it("does not roll over cancelled rounds, even after every holder has been refunded", async function () {
    const { factory, config, minter } = await loadFixture(factoryFixture);
    await factory.createRound(config);
    const round = await ethers.getContractAt("ManekinekoRound", await factory.rounds(1));
    await round.connect(minter).mint(minter.address, 1, { value: PRICE });
    await time.increaseTo(config.mintDeadline);
    await round.connect(minter).refund(1, minter.address);
    await expect(factory.createRound({ ...config, roundId: 2n, mintDeadline: config.mintDeadline + 3600n }))
      .to.be.revertedWithCustomError(factory, "PreviousRoundIncomplete");
    expect(await factory.roundCount()).to.equal(1n);
  });

  it("transfers factory control in two steps without changing existing round owners and blocks renunciation", async function () {
    const { factory, config, owner, holder, other } = await loadFixture(factoryFixture);
    await factory.createRound(config);
    await expect(factory.renounceOwnership()).to.be.revertedWithCustomError(factory, "OwnershipRenunciationDisabled");
    await factory.transferOwnership(other.address);
    expect(await factory.owner()).to.equal(owner.address);
    await expect(factory.connect(holder).acceptOwnership()).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    await factory.connect(other).acceptOwnership();
    expect(await factory.owner()).to.equal(other.address);
    const round = await ethers.getContractAt("ManekinekoRound", await factory.rounds(1));
    expect(await round.owner()).to.equal(holder.address);
    await expect(factory.connect(other).renounceOwnership()).to.be.revertedWithCustomError(factory, "OwnershipRenunciationDisabled");
  });
});
