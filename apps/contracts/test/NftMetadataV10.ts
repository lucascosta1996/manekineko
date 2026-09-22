import { expect } from "chai";
import { network } from "hardhat";
import { buildTinctaPermanentSvg } from "../../../packages/contracts/src/tincta-artwork.ts";
import { derivePermanentCombinationKey, encodePermanentCombination, decodePermanentCombination } from "../../../packages/contracts/src/permanent-combinations.ts";

const { ethers, networkHelpers } = await network.create();
const { time, loadFixture } = networkHelpers;
const PRICE = ethers.parseEther("0.01");
const METADATA_UPDATE = ethers.id("BatchMetadataUpdate(uint256,uint256)");

async function fixture() {
  const [owner, buyer, other, enrollmentSigner] = await ethers.getSigners();
  const coordinator = await ethers.deployContract("VRFCoordinatorV2Mock");
  const eligibility = await ethers.deployContract("ManekinekoAffiliateEligibilityV5", [owner.address]);
  const factory = await ethers.deployContract("ManekinekoFactoryV10", [owner.address]);
  await eligibility.approveFactory(
    await factory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await factory.getAddress())),
  );
  const saleStartAt = BigInt(await time.latest()) + 3600n;
  const config = {
    name: 'Permanent "Color" & <Numbers>', symbol: "META10", seasonId: ethers.id("metadata-v10"),
    seasonName: "Permanent & numbered", collectionColor: "#330000", textColor: "#FFFFFF",
    roundId: 1n, maxSupply: 20n, mintPrice: PRICE, saleStartAt, mintDeadline: saleStartAt + 86400n,
    initialOwner: owner.address, vrfCoordinator: await coordinator.getAddress(),
    keyHash: ethers.id("mock-key"), requestConfirmations: 64, callbackGasLimit: 200000,
    maxAffiliateSlots: 1n, enrollmentSigner: enrollmentSigner.address, prizeBps: 6000n, winnerCount: 6n,
    affiliatePoolBps: 2000n, minAffiliateReferrals: 1n, affiliatePayoutCapBps: 3000n,
    affiliateEligibility: await eligibility.getAddress(),
  };
  await factory.createRound(config);
  const round = await ethers.getContractAt("ManekinekoRoundV10", await factory.rounds(1));
  await eligibility.registerCollection(await factory.getAddress(), 1);
  await round.fundRandomness({ value: await coordinator.MOCK_FEE() });
  return { owner, buyer, other, coordinator, eligibility, factory, config, round };
}
type Context = Awaited<ReturnType<typeof fixture>>;

async function open(c: Context) {
  await time.increaseTo(c.config.saleStartAt);
  await c.round.activateSale();
}

// Independent reference for the existing reversible 16-bit presentation encoding.
function encodeToken(tokenId: bigint, key: string) {
  let left = (tokenId - 1n) >> 8n;
  let right = (tokenId - 1n) & 255n;
  for (let i = 0; i < 4; i++) {
    const hash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint256", "uint256"], [key, i, right],
    ));
    [left, right] = [right, left ^ (BigInt(hash) & 255n)];
  }
  const code = (left << 8n) | right;
  const numbers: [bigint, bigint, bigint, bigint] = [(code >> 12n) + 1n, ((code >> 8n) & 15n) + 1n, ((code >> 4n) & 15n) + 1n, (code & 15n) + 1n];
  return { code, numbers };
}

function decodeMetadata(uri: string) {
  expect(uri).to.match(/^data:application\/json;base64,/);
  const metadata = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
  expect(metadata.image).to.match(/^data:image\/svg\+xml;base64,/);
  const svg = Buffer.from(metadata.image.split(",")[1], "base64").toString();
  const traits = Object.fromEntries(metadata.attributes.map(
    (trait: { trait_type: string; value: unknown }) => [trait.trait_type, trait.value],
  ));
  return { metadata, svg, traits };
}

async function assertUris(c: Context, uris: string[]) {
  for (let i = 0; i < uris.length; i++) expect(await c.round.tokenURI(i + 1), `token ${i + 1}`).to.equal(uris[i]);
}

describe("V10 permanent Solidity combinations and NFT metadata", function () {
  this.timeout(180000);

  it("assigns unique reversible numbers at mint without buyer numbers or a VRF request", async () => {
    const c = await loadFixture(fixture);
    const key = await c.round.combinationKey();
    expect(key).not.to.equal(ethers.ZeroHash);
    expect(await c.round.CONTRACT_VERSION()).to.equal("affiliate-v10");
    expect(await c.round.ALGORITHM_VERSION()).to.equal("unique-rank-v6");
    expect(c.round.interface.getFunction("mint")!.inputs.map(input => input.type)).to.deep.equal(["address", "uint256"]);
    expect(c.round.interface.getFunction("mintWithAffiliate")!.inputs.map(input => input.type)).to.deep.equal(["address", "uint256", "uint256"]);
    await open(c);
    await c.round.connect(c.buyer).mint(c.buyer.address, 10, { value: PRICE * 10n });
    expect(await c.round.soldOut()).to.equal(false);
    expect(await c.round.randomnessRequested()).to.equal(false);
    expect(await c.round.randomnessReceived()).to.equal(false);
    const codes = new Set<string>();
    for (let id = 1n; id <= 10n; id++) {
      const expected = encodeToken(id, key);
      const [numbers, code, score] = await c.round.combination(id);
      expect([...numbers]).to.deep.equal(expected.numbers);
      expect(code).to.equal(expected.code);
      expect(score).to.equal(0n);
      expect(await c.round.tokenIdForCombination([...numbers])).to.equal(id);
      codes.add(code.toString());
      const { metadata, svg, traits } = decodeMetadata(await c.round.tokenURI(id));
      expect(metadata.name).to.equal(`${c.config.name} #${id}`);
      expect(metadata.contract_version).to.equal("affiliate-v10");
      expect(metadata.algorithm_version).to.equal("unique-rank-v6");
      expect([traits.A, traits.B, traits.C, traits.D]).to.deep.equal(numbers.map(Number));
      expect(traits["Combination code"]).to.equal(Number(code));
      expect(traits).not.to.have.property("Score");
      expect(traits).not.to.have.property("Status");
      for (const field of ["award_rank", "prize_amount_wei", "score", "revealed", "refundable"]) expect(metadata).not.to.have.property(field);
      expect(svg).not.to.match(/SEALED|REFUNDABLE|WINNING EDITION|SCORE|Awaiting reveal/);
      expect(svg).to.include("Permanent &amp; numbered");
      expect(svg).to.include("&lt;Numbers&gt;");
      for (const number of numbers) expect(svg).to.include(`>${number}</text>`);
    }
    expect(codes.size).to.equal(10);
    await expect(c.round.score(1)).to.be.revertedWithCustomError(c.round, "RevealNotAvailable");
    await expect(c.round.scoreCombination(encodeToken(1n, key).numbers)).to.be.revertedWithCustomError(c.round, "RevealNotAvailable");
    await expect(c.round.tokenIdForCombination(encodeToken(11n, key).numbers)).to.be.revertedWithCustomError(c.round, "ERC721NonexistentToken").withArgs(11n);
    for (const id of [0, 11, 21]) {
      await expect(c.round.combination(id)).to.be.revertedWithCustomError(c.round, "ERC721NonexistentToken").withArgs(id);
      await expect(c.round.tokenURI(id)).to.be.revertedWithCustomError(c.round, "ERC721NonexistentToken").withArgs(id);
    }
    await expect(c.round.tokenIdForCombination([0, 1, 1, 1])).to.revert(ethers);
    await expect(c.round.tokenIdForCombination([1, 17, 1, 1])).to.revert(ethers);
    await expect(c.round.tokenIdForCombination(encodeToken(21n, key).numbers)).to.revert(ethers);
  });

  it("matches the shared deployment identity, decoder and permanent SVG byte-for-byte", async () => {
    const c = await loadFixture(fixture);
    const key = derivePermanentCombinationKey({ chainId: (await ethers.provider.getNetwork()).chainId,
      collectionAddress: await c.round.getAddress(), roundId: c.config.roundId,
      seasonId: c.config.seasonId, maxSupply: c.config.maxSupply });
    expect(key).to.equal(await c.round.combinationKey());
    await open(c);
    await c.round.connect(c.buyer).mint(c.buyer.address, 20, { value: PRICE * 20n });
    for (const tokenId of [1n, 7n, 20n]) {
      const identity = encodePermanentCombination(tokenId, key), onchain = await c.round.combination(tokenId);
      expect(identity.numbers).to.deep.equal(onchain[0].map(Number));
      expect(identity.combinationCode).to.equal(String(onchain[1]));
      expect(decodePermanentCombination(identity.numbers, key).tokenId).to.equal(String(tokenId));
      expect(buildTinctaPermanentSvg({ seasonId: c.config.seasonId, seasonName: c.config.seasonName,
        collectionName: c.config.name, collectionColor: c.config.collectionColor, textColor: "#FFFFFF",
        tokenId, numbers: identity.numbers, combinationCode: identity.combinationCode,
      })).to.equal(decodeMetadata(await c.round.tokenURI(tokenId)).svg);
    }
  });

  it("keeps every URI and number identical through sellout, VRF, six prize claims and transfers", async () => {
    const c = await loadFixture(fixture);
    await open(c);
    const key = await c.round.combinationKey();
    await c.round.connect(c.buyer).mint(c.buyer.address, 1, { value: PRICE });
    const firstUri = await c.round.tokenURI(1);
    await c.round.connect(c.buyer).transferFrom(c.buyer.address, c.other.address, 1);
    expect(await c.round.tokenURI(1)).to.equal(firstUri);
    await c.round.connect(c.other).transferFrom(c.other.address, c.buyer.address, 1);
    await c.round.connect(c.buyer).mint(c.buyer.address, 18, { value: PRICE * 18n });
    expect(await c.round.tokenURI(1)).to.equal(firstUri);
    const uris: string[] = [];
    for (let id = 1; id <= 19; id++) uris.push(await c.round.tokenURI(id));
    await c.round.connect(c.buyer).mint(c.buyer.address, 1, { value: PRICE });
    expect(await c.round.soldOut()).to.equal(true);
    await assertUris(c, uris);
    uris.push(await c.round.tokenURI(20));
    await c.round.requestRandomness();
    await assertUris(c, uris);
    await expect(c.round.connect(c.buyer).transferFrom(c.buyer.address, c.other.address, 1)).to.be.revertedWithCustomError(c.round, "TransfersLocked");
    await c.coordinator.fulfillRequest(await c.round.requestId(), 0);
    expect(await c.round.randomnessReceived()).to.equal(true);
    expect(await c.round.revealed()).to.equal(false);
    await assertUris(c, uris);
    expect((await c.round.combination(1))[2]).to.equal(0n);
    await expect(c.round.score(1)).to.be.revertedWithCustomError(c.round, "RevealNotAvailable");
    const receipt = await (await c.round.finalizeDraw(8)).wait();
    expect(receipt!.logs.some(log => log.topics[0] === METADATA_UPDATE)).to.equal(false);
    expect(await c.round.revealed()).to.equal(true);
    expect(await c.round.combinationKey()).to.equal(key);
    await assertUris(c, uris);
    const winners = await Promise.all(Array.from({ length: 6 }, (_, i) => c.round.winningTokenIds(i + 1)));
    expect(new Set(winners.map(String)).size).to.equal(6);
    const ranks = new Set<string>();
    const codes = new Set<string>();
    for (let id = 1n; id <= 20n; id++) {
      const [numbers, code, result] = await c.round.combination(id);
      const expected = encodeToken(id, key);
      expect([...numbers]).to.deep.equal(expected.numbers);
      expect(code).to.equal(expected.code);
      expect(await c.round.tokenIdForCombination([...numbers])).to.equal(id);
      expect(await c.round.score(id)).to.equal(result);
      expect(await c.round.scoreCombination([...numbers])).to.equal(result);
      const awardRank = winners.indexOf(id) + 1;
      if (awardRank) expect(result).to.equal(21n - BigInt(awardRank));
      else expect(result).to.be.within(1n, 14n);
      codes.add(code.toString());
      ranks.add(result.toString());
    }
    expect(codes.size).to.equal(20);
    expect([...ranks].map(Number).sort((a, b) => a - b)).to.deep.equal(Array.from({ length: 20 }, (_, i) => i + 1));
    await expect(c.round.scoreCombination([0, 1, 1, 1])).to.revert(ethers);
    await expect(c.round.scoreCombination([1, 1, 1, 17])).to.revert(ethers);
    await expect(c.round.scoreCombination(encodeToken(21n, key).numbers)).to.revert(ethers);
    await expect(c.round.score(21)).to.be.revertedWithCustomError(c.round, "ERC721NonexistentToken");
    const losingId = Array.from({ length: 20 }, (_, i) => BigInt(i + 1)).find(id => !winners.includes(id))!;
    await c.round.connect(c.buyer).transferFrom(c.buyer.address, c.other.address, losingId);
    expect(await c.round.tokenURI(losingId)).to.equal(uris[Number(losingId) - 1]);
    await expect(c.round.connect(c.buyer).transferFrom(c.buyer.address, c.other.address, winners[0])).to.be.revertedWithCustomError(c.round, "TransfersLocked");
    for (let rank = 1; rank <= 6; rank++) await c.round.connect(c.buyer).claimPrizeForRank(rank, c.buyer.address);
    expect(await c.round.claimedAwardCount()).to.equal(6n);
    expect(await c.round.prizePaid()).to.equal(true);
    await c.round.connect(c.buyer).transferFrom(c.buyer.address, c.other.address, winners[0]);
    await assertUris(c, uris);
    expect(await c.round.scoreCombination(encodeToken(winners[0], key).numbers)).to.equal(20n);
  });

  it("keeps numbered metadata through expiry and cancellation; refunded burns remove the token", async () => {
    const c = await loadFixture(fixture);
    await open(c);
    await c.round.connect(c.buyer).mint(c.buyer.address, 2, { value: PRICE * 2n });
    const key = await c.round.combinationKey();
    const uris = [await c.round.tokenURI(1), await c.round.tokenURI(2)];
    await time.increaseTo(c.config.mintDeadline);
    expect(await c.round.refundsAvailable()).to.equal(true);
    await assertUris(c, uris);
    const receipt = await (await c.round.cancelExpiredRound()).wait();
    expect(receipt!.logs.some(log => log.topics[0] === METADATA_UPDATE)).to.equal(false);
    await assertUris(c, uris);
    expect(await c.round.combinationKey()).to.equal(key);
    const refundReceipt = await (await c.round.connect(c.buyer).refund(1, c.buyer.address)).wait();
    expect(refundReceipt!.logs.some(log => log.topics[0] === METADATA_UPDATE)).to.equal(false);
    expect(await c.round.tokenURI(2)).to.equal(uris[1]);
    for (const read of [() => c.round.tokenURI(1), () => c.round.combination(1), () => c.round.tokenIdForCombination(encodeToken(1n, key).numbers)]) {
      await expect(read()).to.be.revertedWithCustomError(c.round, "ERC721NonexistentToken").withArgs(1n);
    }
    expect(await c.round.tokenIdForCombination(encodeToken(2n, key).numbers)).to.equal(2n);
    await expect(c.round.scoreCombination(encodeToken(2n, key).numbers)).to.be.revertedWithCustomError(c.round, "RevealNotAvailable");
  });

  it("does not emit metadata changes when the first refund also records cancellation", async () => {
    const c = await loadFixture(fixture);
    await open(c);
    await c.round.connect(c.buyer).mint(c.buyer.address, 2, { value: PRICE * 2n });
    const survivingUri = await c.round.tokenURI(2);
    await time.increaseTo(c.config.mintDeadline);
    const receipt = await (await c.round.connect(c.buyer).refund(1, c.buyer.address)).wait();
    expect(await c.round.cancelled()).to.equal(true);
    expect(receipt!.logs.some(log => log.topics[0] === METADATA_UPDATE)).to.equal(false);
    expect(await c.round.tokenURI(2)).to.equal(survivingUri);
  });
});
