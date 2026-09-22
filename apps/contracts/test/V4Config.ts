import { expect } from "chai";
import { parseV4Config } from "../scripts/v4-config.js";

const terms = {
  chainId: "1", name: "Configurable Affiliate Round", symbol: "NEKO4", maxSupply: "2000", mintPriceWei: "10000000000000000",
  mintDurationSeconds: "604800", initialOwner: "0x0000000000000000000000000000000000000001",
  requestConfirmations: "64", callbackGasLimit: "200000", randomnessFundingWei: "100000000000000000", activateSale: false,
  maxAffiliateSlots: "10", enrollmentSigner: "0x0000000000000000000000000000000000000002", prizeBps: "5000", affiliateAllocationBps: "1000",
};

describe("V4 immutable economic configuration", function () {
  it("splits a 10% allocation into 1% per link for 10 positions and 0.5% for 20 positions", function () {
    expect(parseV4Config(terms, 1n, 1000n).config.affiliateRatesBps).to.deep.equal(Array<bigint>(10).fill(100n));
    expect(parseV4Config({ ...terms, maxAffiliateSlots: "20" }, 1n, 1000n).config.affiliateRatesBps).to.deep.equal(Array<bigint>(20).fill(50n));
  });
  it("supports individual and zero rates independently of the configured prize share", function () {
    const result = parseV4Config({ ...terms, affiliateAllocationBps: undefined, affiliateRatesBps: ["100", "250", "0"], maxAffiliateSlots: "3", prizeBps: "6000" }, 1n, 1000n);
    expect(result.config.prizeBps).to.equal(6000n);
    expect(result.config.affiliateRatesBps).to.deep.equal([100n, 250n, 0n]);
    expect(result.activateSale).to.equal(false);
  });
  it("does not incorrectly treat the sum of all potential referral rates as a simultaneous liability", function () {
    const result = parseV4Config({ ...terms, affiliateAllocationBps: undefined, affiliateRatesBps: Array<string>(10).fill("5000") }, 1n, 1000n);
    expect(result.config.affiliateRatesBps.reduce((sum, rate) => sum + rate, 0n)).to.equal(50_000n);
  });
  it("requires unambiguous explicit terms and rejects fractional split dust or unsafe percentage sums", function () {
    for (const override of [
      { prizeBps: undefined }, { prizeBps: 5000 }, { prizeBps: "05000" }, { prizeBps: "10001" }, { prizeBps: "-1" },
      { affiliateAllocationBps: undefined }, { affiliateRatesBps: Array<string>(10).fill("100") },
      { affiliateAllocationBps: "10001" }, { affiliateAllocationBps: "1001" },
      { affiliateAllocationBps: undefined, affiliateRatesBps: ["100"] },
      { affiliateAllocationBps: undefined, affiliateRatesBps: Array<string>(10).fill("5001") },
      { affiliateAllocationBps: undefined, affiliateRatesBps: Array<string>(10).fill("01") },
      { mintPriceWei: "10100" }, { mintPriceWei: "100" }, { maxAffiliateSlots: "0" }, { maxAffiliateSlots: "101" },
      { enrollmentSigner: terms.initialOwner }, { enrollmentSigner: "0x0000000000000000000000000000000000000000" }, { activateSale: true },
    ]) expect(() => parseV4Config({ ...terms, ...override }, 1n, 1000n)).to.throw();
  });
});
