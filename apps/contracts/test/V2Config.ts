import { expect } from "chai";
import { ETHEREUM_VRF, parseV2Config } from "../scripts/v2-config.js";

const terms = {
  chainId: "1", name: "Round", symbol: "NEKO", maxSupply: "2000", mintPriceWei: "100",
  mintDurationSeconds: "604800", initialOwner: "0x0000000000000000000000000000000000000001",
  requestConfirmations: "64", callbackGasLimit: "200000", randomnessFundingWei: "100000000000000000", activateSale: false,
};
describe("V2 deployment configuration", function () {
  it("pins Ethereum verifier settings and preserves exact values without enabling sales", function () {
    const parsed = parseV2Config(terms, 1n, 1_000n);
    expect(parsed.config.vrfCoordinator).to.equal(ETHEREUM_VRF["1"].coordinator);
    expect(parsed.config.keyHash).to.equal(ETHEREUM_VRF["1"].keyHash);
    expect(parsed.config.maxSupply).to.equal(2000n);
    expect(parsed.config.mintDeadline).to.equal(605800n);
    expect(parsed.activateSale).to.equal(false);
    expect(parsed.randomnessFundingWei).to.equal(100000000000000000n);
  });
  it("fails closed on wrong networks, verifier overrides and invalid or ambiguous terms", function () {
    expect(() => parseV2Config(terms, 8453n, 1n)).to.throw();
    expect(() => parseV2Config(terms, 11155111n, 1n)).to.throw();
    for (const override of [
      { initialOwner: "0x0000000000000000000000000000000000000000" }, { maxSupply: "65537" },
      { maxSupply: "0" }, { mintPriceWei: "101" }, { requestConfirmations: "63" }, { requestConfirmations: "201" },
      { callbackGasLimit: "99999" }, { randomnessFundingWei: "0" }, { maxSupply: 1000 },
      { mintDurationSeconds: "-1" }, { mintDurationSeconds: "01" }, { activateSale: "false" },
      { keyHash: `0x${"01".repeat(32)}` }, { vrfCoordinator: terms.initialOwner },
    ]) expect(() => parseV2Config({ ...terms, ...override }, 1n, 1n)).to.throw();
  });
  it("keeps local mocks explicit and separate from production settings", function () {
    const local = { ...terms, chainId: "31337", vrfCoordinator: terms.initialOwner, keyHash: `0x${"ab".repeat(32)}` };
    expect(parseV2Config(local, 31337n, 1n).config.vrfCoordinator).to.equal(terms.initialOwner);
    expect(() => parseV2Config({ ...terms, chainId: "31337" }, 31337n, 1n)).to.throw();
    expect(() => parseV2Config(local, 1n, 1n)).to.throw();
  });
});
