import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();
const PRICE = ethers.parseEther("0.01");

function decodeMetadata(uri: string) {
  expect(uri).to.match(/^data:application\/json;base64,/);
  const metadata = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
  const svg = Buffer.from(metadata.image.split(",")[1], "base64").toString();
  return { metadata, svg };
}

for (const version of [8, 9]) {
  describe(`V${version} explorer metadata lifecycle`, function () {
    it("replaces sealed metadata at reveal, emits ERC-4906, and stays revealed after every prize is claimed", async () => {
      const [owner, buyer, enrollmentSigner] = await ethers.getSigners();
      const coordinator = await ethers.deployContract("VRFCoordinatorV2Mock");
      const eligibility = await ethers.deployContract(
        version === 8 ? "ManekinekoAffiliateEligibilityV3" : "ManekinekoAffiliateEligibilityV4",
        [owner.address],
      );
      const factory = await ethers.deployContract(`ManekinekoFactoryV${version}`, [owner.address]);
      await eligibility.approveFactory(
        await factory.getAddress(), ethers.keccak256(await ethers.provider.getCode(await factory.getAddress())),
      );
      const saleStartAt = BigInt(await networkHelpers.time.latest()) + 3600n;
      await factory.createRound({
        name: "Metadata lifecycle", symbol: "META", seasonId: ethers.id("metadata-lifecycle"),
        seasonName: "Metadata test", collectionColor: "#330000", textColor: "#FFFFFF",
        roundId: 1n, maxSupply: 20n, mintPrice: PRICE, saleStartAt, mintDeadline: saleStartAt + 86400n,
        initialOwner: owner.address, vrfCoordinator: await coordinator.getAddress(),
        keyHash: ethers.id("mock-key"), requestConfirmations: 64, callbackGasLimit: 200000,
        maxAffiliateSlots: 1n, enrollmentSigner: enrollmentSigner.address, prizeBps: 6000n, winnerCount: 6n,
        affiliatePoolBps: 2000n, minAffiliateReferrals: 1n, affiliatePayoutCapBps: 3000n,
        affiliateEligibility: await eligibility.getAddress(),
      });
      const address = await factory.rounds(1);
      const round = version === 8
        ? await ethers.getContractAt("ManekinekoRoundV8", address)
        : await ethers.getContractAt("ManekinekoRoundV9", address);
      await eligibility.registerCollection(await factory.getAddress(), 1);
      await round.fundRandomness({ value: await coordinator.MOCK_FEE() });
      await networkHelpers.time.increaseTo(saleStartAt);
      await round.activateSale();
      await round.connect(buyer).mint(buyer.address, 20, { value: PRICE * 20n });

      expect(await round.soldOut()).to.equal(true);
      const sealedUri = await round.tokenURI(1);
      const sealed = decodeMetadata(sealedUri);
      expect(sealed.metadata.attributes).to.deep.equal([{ trait_type: "Status", value: "Sealed" }]);
      expect(sealed.svg).to.include(">SEALED<");
      await round.requestRandomness();
      await coordinator.fulfillRequest(await round.requestId(), 0);
      expect(await round.tokenURI(1)).to.equal(sealedUri);

      expect(await round.supportsInterface("0x49064906")).to.equal(true);
      await expect(round.finalizeDraw(8)).to.emit(round, "BatchMetadataUpdate").withArgs(1n, 20n);
      expect(await round.prizePaid()).to.equal(false);
      const winners = await Promise.all(Array.from({ length: 6 }, (_, i) => round.winningTokenIds(i + 1)));
      const revealedUris: string[] = [];
      for (let tokenId = 1; tokenId <= 20; tokenId++) {
        const uri = await round.tokenURI(tokenId);
        revealedUris.push(uri);
        const { metadata, svg } = decodeMetadata(uri);
        const traits = Object.fromEntries(metadata.attributes.map((trait: { trait_type: string; value: unknown }) => [trait.trait_type, trait.value]));
        const [numbers, , score] = await round.combination(tokenId);
        const awardRank = winners.findIndex(id => id === BigInt(tokenId)) + 1;
        expect(metadata.contract_version).to.equal(`affiliate-v${version}`);
        expect([traits.A, traits.B, traits.C, traits.D]).to.deep.equal(numbers.map(Number));
        expect(traits.Score).to.equal(Number(score));
        expect(traits.Status).not.to.equal("Sealed");
        expect(metadata.award_rank).to.equal(awardRank);
        expect(metadata.prize_amount_wei).to.equal(awardRank ? (await round.prizeAmountForRank(awardRank)).toString() : "0");
        expect(svg).not.to.include(">SEALED<");
        expect(svg).to.include(awardRank ? ">WINNING EDITION<" : ">REVEALED<");
      }

      for (let rank = 1; rank <= 6; rank++) await round.connect(buyer).claimPrizeForRank(rank, buyer.address);
      expect(await round.claimedAwardCount()).to.equal(6n);
      expect(await round.prizePaid()).to.equal(true);
      for (let tokenId = 1; tokenId <= 20; tokenId++) {
        expect(await round.tokenURI(tokenId)).to.equal(revealedUris[tokenId - 1]);
      }
    });
  });
}
