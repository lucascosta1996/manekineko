import { createRequire } from "node:module";
import { configVariable, defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

const require = createRequire(import.meta.url);
const reviewedCompiler = {
  version: "0.8.37",
  path: require.resolve("solc/soljson.js"),
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "cancun",
  },
};
// V6's reversible display encoding needs a smaller creation template. Keep every
// historical artifact on its original settings, and use identical V6 settings for verification.
const v6Compiler = { ...reviewedCompiler, settings: { ...reviewedCompiler.settings, optimizer: { enabled: true, runs: 1 }, viaIR: true } };
const compilerProfile = {
  compilers: [reviewedCompiler],
  overrides: { "contracts/ManekinekoV16.sol": v6Compiler, "contracts/ManekinekoArtworkV16.sol": v6Compiler, "contracts/ManekinekoSeasonControllerV14.sol": v6Compiler, "contracts/ManekinekoVotingV14.sol": v6Compiler, "contracts/ManekinekoGenesisV14.sol": v6Compiler, "contracts/ManekinekoVotingV12.sol": v6Compiler, "contracts/ManekinekoSeasonControllerV12.sol": v6Compiler, "contracts/ManekinekoWinnerCreditsV8.sol": v6Compiler, "contracts/ManekinekoWinnerCreditsV9.sol": v6Compiler, "contracts/ManekinekoSeasonControllerV13.sol": v6Compiler, "contracts/ManekinekoHolderRewardsV13.sol": v6Compiler, ...Object.fromEntries(["Factory", "Round", "Renderer", "RoundDeployer"].flatMap(component =>
    [6, 7, 8, 9, 10, 11, 12, 13].map(version => [`contracts/Manekineko${component}V${version}.sol`, v6Compiler]))), },
};

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  verify: { etherscan: { apiKey: configVariable("ETHERSCAN_API_KEY") } },
  solidity: {
    // Hardhat verification defaults to production; the generated production profile
    // does not preserve every setting from the single-version shorthand.
    profiles: {
      default: compilerProfile,
      production: compilerProfile,
    },
  },
  networks: {
    hardhatMainnet: { type: "edr-simulated", chainType: "l1", hardfork: "cancun" },
    // EDR currently stops at Osaka. These isolated models test V16 behavior;
    // tests separately enforce the 64 KiB Sepolia bound. Actual network gas
    // and deployment acceptance must be checked independently through live RPCs.
    hardhatV16Adapters: { type: "edr-simulated", chainType: "l1", chainId: 11155111, hardfork: "cancun", allowUnlimitedContractSize: true },
    hardhatV16Model: { type: "edr-simulated", chainType: "l1", chainId: 31337, hardfork: "cancun", allowUnlimitedContractSize: true },
    hardhatV12Rehearsal: { type: "edr-simulated", chainType: "l1", chainId: 11155111, hardfork: "cancun" },
    localhost: { type: "http", chainType: "l1", url: "http://127.0.0.1:8545" },
    mainnetReadOnly: { type: "http", chainType: "l1", chainId: 1, url: configVariable("MAINNET_RPC_URL"), accounts: [] },
    sepoliaReadOnly: { type: "http", chainType: "l1", chainId: 11155111, url: configVariable("SEPOLIA_RPC_URL"), accounts: [] },
    mainnet: {
      type: "http",
      chainType: "l1",
      chainId: 1,
      url: configVariable("MAINNET_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      chainId: 11155111,
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
  },
});
