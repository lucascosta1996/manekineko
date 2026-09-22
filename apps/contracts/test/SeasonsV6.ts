import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();
const { time, loadFixture } = networkHelpers;

async function fixture() {
  const [owner, signer, buyer] = await ethers.getSigners();
  const coordinator = await ethers.deployContract("VRFCoordinatorV2Mock");
  const eligibility = await ethers.deployContract("ManekinekoAffiliateEligibility", [owner.address]);
  const factory = await ethers.deployContract("ManekinekoFactoryV6", [owner.address]);
  await eligibility.approveFactory(await factory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await factory.getAddress())));
  const renderer = await ethers.getContractAt("ManekinekoRendererV6", await factory.renderer());
  const config = {
    name: 'Collection <One> & "Moon"', symbol: "SEASON", roundId: 1n, maxSupply: 1n, mintPrice: 10_000n,
    seasonId: ethers.id("genesis"), seasonName: 'Season <Spring> & "Sun"', collectionColor: "#173C2C", textColor: "#FFFFFF",
    mintDeadline: BigInt(await time.latest()) + 86_400n, initialOwner: owner.address,
    vrfCoordinator: await coordinator.getAddress(), keyHash: ethers.id("seasons-local-key"),
    requestConfirmations: 64, callbackGasLimit: 200_000, maxAffiliateSlots: 10n,
    enrollmentSigner: signer.address, prizeBps: 5000n, affiliatePoolBps: 1000n, affiliateEligibility: await eligibility.getAddress(),
  };
  return { owner, signer, buyer, coordinator, eligibility, factory, renderer, config };
}
type Context = Awaited<ReturnType<typeof fixture>>;
async function mintAndSettle(c: Context, id: bigint) {
  const round = await ethers.getContractAt("ManekinekoRoundV6", await c.factory.rounds(id));
  await c.eligibility.registerCollection(await c.factory.getAddress(), id);
  await round.fundRandomness({ value: await c.coordinator.MOCK_FEE() }); await round.activateSale();
  await round.connect(c.buyer).mint(c.buyer.address, 1, { value: c.config.mintPrice });
  await round.requestRandomness(); await c.coordinator.fulfillRequest(await round.requestId(), 234n);
  await round.finalizeDraw(8); await round.distributePrize(); return round;
}
function metadata(uri: string) {
  const data = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
  return { data, svg: Buffer.from(data.image.split(",")[1], "base64").toString() };
}

describe("V6 immutable seasons and on-chain artwork", function () {
  this.timeout(180_000);
  it("caps a season at ten settled collections and preserves global round IDs across seasons", async () => {
    const c = await loadFixture(fixture);
    for (let id = 1n; id <= 10n; id++) {
      await expect(c.factory.createRound({ ...c.config, roundId: id })).to.emit(c.factory, "SeasonCollectionCreated");
      const round = await mintAndSettle(c, id);
      expect(await round.roundId()).to.equal(id);
      expect(await round.seasonId()).to.equal(c.config.seasonId);
      expect(await c.factory.seasonCollectionCount(c.config.seasonId)).to.equal(id);
    }
    await expect(c.factory.createRound({ ...c.config, roundId: 11n })).to.be.revertedWithCustomError(c.factory, "SeasonFull");
    expect(await c.factory.roundCount()).to.equal(10n);
    const seasonId = ethers.id("second-season");
    await c.factory.createRound({ ...c.config, roundId: 11n, seasonId, seasonName: "Second Season" });
    expect(await c.factory.roundCount()).to.equal(11n);
    expect(await c.factory.seasonCollectionCount(seasonId)).to.equal(1n);
    expect(await c.factory.seasonCollectionCount(c.config.seasonId)).to.equal(10n);
  });
  it("rejects zero season IDs, renamed seasons, and rollover before prize delivery", async () => {
    const c = await loadFixture(fixture);
    await expect(c.factory.createRound({ ...c.config, seasonId: ethers.ZeroHash })).to.be.revertedWithCustomError(c.factory, "InvalidSeason");
    await c.factory.createRound(c.config);
    await expect(c.factory.createRound({ ...c.config, roundId: 2n })).to.be.revertedWithCustomError(c.factory, "PreviousRoundIncomplete");
    await mintAndSettle(c, 1n);
    await expect(c.factory.createRound({ ...c.config, roundId: 2n, seasonName: "Changed name" })).to.be.revertedWithCustomError(c.factory, "SeasonNameMismatch");
    expect(await c.factory.seasonNameHash(c.config.seasonId)).to.equal(ethers.id(c.config.seasonName));
  });
  it("renders escaped season and collection names with frozen dark colors and valid metadata", async () => {
    const c = await loadFixture(fixture); await c.factory.createRound(c.config);
    const round = await mintAndSettle(c, 1n); const { data, svg } = metadata(await round.tokenURI(1));
    expect(data.season_id).to.equal(c.config.seasonId); expect(data.season_name).to.equal(c.config.seasonName);
    expect(data.collection_name).to.equal(c.config.name); expect(data.name).to.equal(`${c.config.name} #1`);
    expect(data.background_color).to.equal("173C2C"); expect(data.collection_color).to.equal("#173C2C");
    expect(data.text_color).to.equal("#FFFFFF"); expect(data.attributes).to.have.length(6);
    expect(svg).to.contain('fill="#173C2C"').and.contain('fill="#FFFFFF"');
    expect(svg).to.contain("Season &lt;Spring&gt; &amp; &quot;Sun&quot;");
    expect(svg).to.contain("Collection &lt;One&gt; &amp; &quot;Moon&quot;");
    expect(svg).not.to.contain("MANEKINEKO"); expect(svg).not.to.contain("ROUND 1");
    expect(await round.seasonName()).to.equal(c.config.seasonName);
    expect(await round.collectionColor()).to.equal("#173C2C"); expect(await round.textColor()).to.equal("#FFFFFF");
  });
  it("uses the off-chain selected black foreground on light backgrounds without changing rank math", async () => {
    const c = await loadFixture(fixture);
    await c.factory.createRound({ ...c.config, collectionColor: "#FFFFFF", textColor: "#000000", seasonName: "春の季節", name: "明るい月" });
    const round = await mintAndSettle(c, 1n); const { data, svg } = metadata(await round.tokenURI(1));
    expect(data.season_name).to.equal("春の季節"); expect(data.collection_name).to.equal("明るい月");
    expect(svg).to.contain('fill="#FFFFFF"').and.contain('fill="#000000"').and.contain("春の季節");
    const [numbers, , score] = await round.combination(1);
    expect(await round.scoreCombination([numbers[0], numbers[1], numbers[2], numbers[3]])).to.equal(score);
    expect(score).to.equal(1n); expect(await round.prizePaidAmount()).to.equal(5000n);
  });
  it("passes actual max-length ASCII and multibyte on-chain artwork through the public NFT metadata reader", async () => {
    // Import the real web reader at runtime without imposing the web project's bundler tsconfig on Hardhat.
    const readerUrl = new URL("../../web/lib/nfts/metadata.ts", import.meta.url).href;
    const { decodeOnChainMetadata, verifyMetadataNumbers } = await import(readerUrl);
    const c = await loadFixture(fixture);
    const names = [
      { seasonName: "S".repeat(64), name: "C".repeat(80), collectionColor: "#173C2C", textColor: "#FFFFFF" },
      { seasonName: "春".repeat(21) + "S", name: "月".repeat(26) + "AB", collectionColor: "#FFFFFF", textColor: "#000000" },
    ];
    for (let index = 0; index < names.length; index++) {
      const appearance = names[index], roundId = BigInt(index + 1);
      expect(Buffer.byteLength(appearance.seasonName)).to.equal(64);
      expect(Buffer.byteLength(appearance.name)).to.equal(80);
      await c.factory.createRound({ ...c.config, ...appearance, roundId, seasonId: ethers.id(`reader-season-${index}`) });
      const round = await mintAndSettle(c, roundId);
      const tokenUri = await round.tokenURI(1);
      const decoded = decodeOnChainMetadata(tokenUri, "affiliate-v6");
      const { svg } = metadata(tokenUri);
      expect(decoded.name).to.equal(`${appearance.name} #1`);
      expect(decoded.image).to.be.a("string").and.contain("data:image/svg+xml;base64,");
      expect(svg).to.contain('y="80" font-size="13"').and.contain('y="128" font-size="10"');
      expect(svg).to.contain(appearance.seasonName).and.contain(appearance.name);
      const combination = await round.combination(1);
      const numbers = [combination[0][0], combination[0][1], combination[0][2], combination[0][3]] as [bigint, bigint, bigint, bigint];
      const decodedScore = await round.scoreCombination(numbers);
      expect(verifyMetadataNumbers(decoded, true, combination, 1, { contractVersion: "affiliate-v6", decodedScore }))
        .to.deep.equal({ numbers: numbers.map(Number), score: "1" });
    }
  });
  it("rejects unsafe appearance, unsupported colors and overlong UTF-8 names before creating a round", async () => {
    const c = await loadFixture(fixture);
    for (const override of [
      { seasonName: "" }, { seasonName: "a".repeat(65) }, { seasonName: "春".repeat(22) },
      { seasonName: "unsafe\u0000name" }, { name: "unsafe\nname" }, { name: "a".repeat(81) },
      { collectionColor: "red" }, { collectionColor: "#123" }, { collectionColor: '#123456"' },
      { collectionColor: "#GGGGGG" }, { textColor: "#555555" },
    ]) await expect(c.factory.createRound({ ...c.config, ...override })).to.be.revertedWithCustomError(c.renderer, "InvalidAppearance");
    expect(await c.factory.roundCount()).to.equal(0n);
    expect(await c.factory.seasonCollectionCount(c.config.seasonId)).to.equal(0n);
  });
});
