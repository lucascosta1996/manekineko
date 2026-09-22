import type { LaunchPayload } from "../lib/launch-config.ts";

export function launchFixture(): LaunchPayload {
  return {
    contract: {
      chainId: "11155111", name: "Sepolia qualification", symbol: "QUAL", maxSupply: "1000", mintPriceWei: "10000000000000000",
      mintDurationSeconds: "604800", initialOwner: "0x1111111111111111111111111111111111111111", requestConfirmations: "64", callbackGasLimit: "200000",
      randomnessFundingWei: "100000000000000000", maxAffiliateSlots: "3", enrollmentSigner: "0x2222222222222222222222222222222222222222", prizeBps: "6000",
      affiliateRatesBps: ["100", "200", "0"], activateSale: false,
    },
    operations: { factoryMode: "new", factoryAddress: "", deployerAddress: "0x3333333333333333333333333333333333333333", factoryOwnerAddress: "0x3333333333333333333333333333333333333333", enrollmentWindowSeconds: "86400", notes: "Qualification configuration only." },
  };
}
