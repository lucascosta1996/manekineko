import { expect } from "chai";
import { parseV10Config } from "../scripts/v10-config.js";
import { parseV9Config } from "../scripts/v9-config.js";

const terms = {
  maxMintsPerWallet: "20", algorithmVersion: "unique-rank-v6",
  seasonId: `0x${"01".repeat(32)}`, seasonName: "Genesis", collectionColor: "#173C2C",
  chainId: "1", name: "Permanent combinations", symbol: "NEKO10", maxSupply: "1000",
  mintPriceWei: "10000000000000000", mintDurationSeconds: "86400",
  initialOwner: "0x0000000000000000000000000000000000000001",
  requestConfirmations: "64", callbackGasLimit: "200000", randomnessFundingWei: "100000000000000000",
  activateSale: false, maxAffiliateSlots: "10", enrollmentSigner: "0x0000000000000000000000000000000000000002",
  prizeBps: "6000", winnerCount: "6", affiliatePoolBps: "2000", minAffiliateReferrals: "1",
  affiliatePayoutCapBps: "3000", saleStartAt: "4600",
};

describe("V10 permanent-combination configuration boundary", () => {
  it("preserves V9 economics without mutating either version's input", () => {
    const frozen = Object.freeze({ ...terms });
    const parsed = parseV10Config(frozen, 1n, 1000n);
    expect(parsed).to.deep.equal(parseV9Config({ ...terms, algorithmVersion: "unique-rank-v5" }, 1n, 1000n));
    expect(frozen.algorithmVersion).to.equal("unique-rank-v6");
    expect(parsed.config.winnerCount).to.equal(6n);
    expect(parsed.config.maxSupply * parsed.config.mintPrice / 10_000n * parsed.config.prizeBps / 6n).to.equal(10n ** 18n);
  });

  it("rejects historical algorithm markers and never accepts a supplied presentation seed or numbers", () => {
    for (const algorithmVersion of [undefined, "unique-rank-v5", "unique-rank-v4", 6]) {
      expect(() => parseV10Config({ ...terms, algorithmVersion }, 1n, 1000n)).to.throw("V10 requires");
    }
    for (const field of ["combinationKey", "combinationSeed", "numbers", "combinations", "seed"]) {
      expect(() => parseV10Config({ ...terms, [field]: "external input" }, 1n, 1000n)).to.throw("derives permanent combinations in Solidity");
    }
    for (const value of [null, [], "V10"]) expect(() => parseV10Config(value, 1n, 1000n)).to.throw();
    expect(() => parseV9Config(terms, 1n, 1000n)).to.throw();
  });

  it("retains cap, winner-count, equal-prize and schedule validation", () => {
    for (const extra of [
      { maxMintsPerWallet: "21" }, { maxMintsPerWallet: undefined }, { winnerCount: "0" },
      { winnerCount: "11" }, { winnerCount: "6", maxSupply: "5" }, { prizeBps: "6001" },
      { secondPrizeBps: "2000" }, { saleStartAt: "0" }, { maxSupply: "65537" },
    ]) expect(() => parseV10Config({ ...terms, ...extra }, 1n, 1000n)).to.throw();
    for (const winnerCount of ["1", "2", "3", "4", "5", "6", "8", "10"]) {
      expect(parseV10Config({ ...terms, winnerCount }, 1n, 1000n).config.winnerCount).to.equal(BigInt(winnerCount));
    }
  });
});
