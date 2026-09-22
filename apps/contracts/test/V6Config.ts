import { expect } from "chai";
import { parseV6Config } from "../scripts/v6-config.js";
import { parseV5Config } from "../scripts/v5-config.js";

const terms = { algorithmVersion: "unique-rank-v3",
  seasonId: `0x${"01".repeat(32)}`, seasonName: "Genesis", collectionColor: "#173C2C", textColor: "#FFFFFF",
  chainId: "1", name: "Shared pool", symbol: "POOL", maxSupply: "2000", mintPriceWei: "10000000000000000",
  mintDurationSeconds: "604800", initialOwner: "0x0000000000000000000000000000000000000001",
  requestConfirmations: "64", callbackGasLimit: "200000", randomnessFundingWei: "100000000000000000", activateSale: false,
  maxAffiliateSlots: "10", enrollmentSigner: "0x0000000000000000000000000000000000000002", prizeBps: "5000", affiliatePoolBps: "1000",
};
describe("V6 immutable pool configuration", function () {
  it("requires safe named seasons and chooses contrast before deployment", function () {
    expect(parseV6Config({ ...terms, textColor: undefined }, 1n, 1000n).config.textColor).to.equal("#FFFFFF");
    expect(parseV6Config({ ...terms, collectionColor: "#ffffff", textColor: "#000000" }, 1n, 1000n).config.collectionColor).to.equal("#FFFFFF");
    for (const override of [
      { seasonId: undefined }, { seasonId: `0x${"00".repeat(32)}` }, { seasonId: "Genesis" },
      { seasonName: undefined }, { seasonName: "春".repeat(22) }, { seasonName: "bad\u0000name" },
      { collectionColor: undefined }, { collectionColor: "#123" }, { textColor: "#000000" }, { name: "bad\nname" },
      { name: "bad\uffffname" }, { name: "bad\ud800name" },
    ]) expect(() => parseV6Config({ ...terms, ...override }, 1n, 1000n)).to.throw();
  });
  it("requires the explicit V3 algorithm and prevents reuse through the V5 deployer", function () {
    for (const algorithmVersion of [undefined, "unique-rank-v2", "unknown"]) {
      expect(() => parseV6Config({ ...terms, algorithmVersion }, 1n, 1000n)).to.throw();
    }
    expect(() => parseV5Config(terms, 1n, 1000n)).to.throw();
    const { algorithmVersion: _, ...legacy } = terms;
    expect(parseV5Config(legacy, 1n, 1000n).config.maxSupply).to.equal(2000n);
  });
  it("keeps the pool independent of position count", function () {
    for (const maxAffiliateSlots of ["1", "10", "20", "100"]) {
      const result = parseV6Config({ ...terms, maxAffiliateSlots }, 1n, 1000n);
      expect(result.config.affiliatePoolBps).to.equal(1000n);
      expect(result.config.maxAffiliateSlots).to.equal(BigInt(maxAffiliateSlots));
      expect(result.activateSale).to.equal(false);
    }
  });
  it("rejects ambiguous, oversubscribed, noncanonical and incompatible V4 terms", function () {
    for (const override of [
      { affiliatePoolBps: undefined }, { affiliatePoolBps: 1000 }, { affiliatePoolBps: "01000" },
      { affiliatePoolBps: "5001" }, { affiliatePoolBps: "-1" }, { affiliatePoolBps: "1.5" },
      { affiliateAllocationBps: "1000" }, { affiliateRatesBps: ["100"] }, { affiliateRatesBps: "" },
      { prizeBps: undefined }, { maxAffiliateSlots: "0" }, { maxAffiliateSlots: "101" },
      { enrollmentSigner: terms.initialOwner }, { mintPriceWei: "10100" }, { activateSale: true },
    ]) expect(() => parseV6Config({ ...terms, ...override }, 1n, 1000n)).to.throw();
  });
  it("accepts zero-pool and full-pool boundaries and empty compatibility rate arrays", function () {
    expect(parseV6Config({ ...terms, prizeBps: "0", affiliatePoolBps: "10000", affiliateRatesBps: [] }, 1n, 1000n).config.affiliatePoolBps).to.equal(10000n);
    expect(parseV6Config({ ...terms, prizeBps: "10000", affiliatePoolBps: "0" }, 1n, 1000n).config.affiliatePoolBps).to.equal(0n);
  });
});
