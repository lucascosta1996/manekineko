import { expect } from "chai";
import { parseV3Config } from "../scripts/v3-config.js";
import { matchesRuntime } from "../scripts/runtime-match.js";

const terms = {
  chainId: "1", name: "Affiliate Round", symbol: "NEKO", maxSupply: "2000", mintPriceWei: "10000000000000000",
  mintDurationSeconds: "604800", initialOwner: "0x0000000000000000000000000000000000000001",
  requestConfirmations: "64", callbackGasLimit: "200000", randomnessFundingWei: "100000000000000000", activateSale: false,
  maxAffiliateSlots: "10", enrollmentSigner: "0x0000000000000000000000000000000000000002",
};

describe("V3 affiliate deployment configuration", function () {
  it("preserves winner terms and opens ten positions without activating minting", function () {
    const parsed = parseV3Config(terms, 1n, 1000n);
    expect(parsed.config.maxAffiliateSlots).to.equal(10n);
    expect(parsed.config.enrollmentSigner).to.equal(terms.enrollmentSigner);
    expect(parsed.config.mintPrice).to.equal(10_000_000_000_000_000n);
    expect(parsed.config.mintPrice / 100n).to.equal(100_000_000_000_000n);
    expect(parsed.config.mintDeadline).to.equal(605800n);
    expect(parsed.activateSale).to.equal(false);
  });
  it("rejects invalid rates through price rounding, invalid capacity and premature activation", function () {
    for (const override of [
      { mintPriceWei: "102" }, { mintPriceWei: "2" }, { maxAffiliateSlots: "0" },
      { maxAffiliateSlots: "101" }, { maxAffiliateSlots: 10 }, { maxAffiliateSlots: "010" },
      { enrollmentSigner: "0x0000000000000000000000000000000000000000" },
      { enrollmentSigner: terms.initialOwner },
      { enrollmentSigner: "bad" }, { activateSale: true },
    ]) expect(() => parseV3Config({ ...terms, ...override }, 1n, 1000n)).to.throw();
    expect(() => parseV3Config(terms, 11155111n, 1000n)).to.throw();
    expect(() => parseV3Config(terms, 8453n, 1000n)).to.throw();
  });
  it("matches immutable runtime placeholders without overlooking executable code changes", function () {
    const artifact = { deployedBytecode: "0x6000006001", immutableReferences: { "1": [{ start: 1, length: 2 }] } };
    expect(matchesRuntime("0x60abcd6001", artifact)).to.equal(true);
    expect(matchesRuntime("0x60abcd6002", artifact)).to.equal(false);
    expect(matchesRuntime("0x60abcd600100", artifact)).to.equal(false);
    expect(matchesRuntime("0x", artifact)).to.equal(false);
    expect(matchesRuntime("0x6001", { deployedBytecode: "0x6001" })).to.equal(true);
    expect(() => matchesRuntime("0x6001", { deployedBytecode: "0x6001", immutableReferences: { bad: [{ start: 1, length: 3 }] } })).to.throw();
  });
});
