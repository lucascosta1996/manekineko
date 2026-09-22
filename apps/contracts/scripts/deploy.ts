import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { artifacts, network } from "hardhat";

// All external configuration is deployment tooling. The deployed game has no server dependency.
const { ethers } = await network.create();
const chainId = (await ethers.provider.getNetwork()).chainId;
if (![31337n, 11155111n].includes(chainId)) throw new Error("Deployment supports local development and Sepolia only. Configure and review another chain before adding it.");
const [deployer] = await ethers.getSigners();
if (!deployer) throw new Error("No deployment signer configured.");
const configPath = process.env.ROUND_CONFIG_PATH;
if (!configPath && chainId !== 31337n) throw new Error("Set ROUND_CONFIG_PATH to an explicit round JSON configuration.");

const raw: Record<string, unknown> = configPath
  ? JSON.parse(await readFile(resolve(configPath), "utf8"))
  : { name: "Manekineko Round 1", symbol: "NEKO", maxSupply: "100", mintPriceWei: "1000000000000000", mintDurationSeconds: "604800", revealDelayBlocks: "5" };

function integer(field: string): bigint {
  const value = raw[field];
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new Error(`${field} must be an unsigned decimal string.`);
  return BigInt(value);
}
function text(field: string): string {
  if (typeof raw[field] !== "string" || raw[field].length === 0) throw new Error(`${field} must be nonempty text.`);
  return raw[field];
}
const roundOwner = raw.initialOwner === undefined ? deployer.address : ethers.getAddress(text("initialOwner"));
const maxSupply = integer("maxSupply");
const mintPrice = integer("mintPriceWei");
const duration = integer("mintDurationSeconds");
const delay = integer("revealDelayBlocks");
const name = text("name");
const symbol = text("symbol");
if (maxSupply < 1n || maxSupply > 65_536n || mintPrice < 2n || mintPrice % 2n || mintPrice > ethers.MaxUint256 / maxSupply || duration < 1n || duration > 31_536_000n || delay < 2n || delay > 200n || Buffer.byteLength(name) > 80 || Buffer.byteLength(symbol) > 16 || roundOwner === ethers.ZeroAddress) {
  throw new Error("Invalid round settings; see docs/contracts.md for bounds.");
}

let factory;
if (process.env.FACTORY_ADDRESS) {
  const address = ethers.getAddress(process.env.FACTORY_ADDRESS);
  const code = await ethers.provider.getCode(address);
  const artifact = await artifacts.readArtifact("ManekinekoFactory");
  if (code.toLowerCase() !== artifact.deployedBytecode.toLowerCase()) throw new Error("Factory bytecode does not match this build.");
  factory = await ethers.getContractAt("ManekinekoFactory", address);
  if (await factory.owner() !== deployer.address) throw new Error("Signer is not the factory owner.");
} else {
  factory = await ethers.deployContract("ManekinekoFactory", [deployer.address]);
  await factory.waitForDeployment();
}

const latest = await ethers.provider.getBlock("latest");
if (!latest) throw new Error("Latest block unavailable.");
const roundId = await factory.roundCount() + 1n;
const config = { name, symbol, roundId, maxSupply, mintPrice, mintDeadline: BigInt(latest.timestamp) + duration, revealDelayBlocks: delay, initialOwner: roundOwner };
const transaction = await factory.createRound(config);
const receipt = await transaction.wait(chainId === 31337n ? 1 : 2);
if (!receipt || receipt.status !== 1) throw new Error("Round deployment was not confirmed.");
const roundAddress = await factory.rounds(roundId);
if (await ethers.provider.getCode(roundAddress) === "0x") throw new Error("Deployed round has no bytecode.");

const deployment = { chainId, factory: await factory.getAddress(), round: roundAddress, transactionHash: receipt.hash, blockNumber: receipt.blockNumber, config, compiler: "0.8.37+commit.f401782d", evmVersion: "cancun" };
const json = `${JSON.stringify(deployment, (_, value: unknown) => typeof value === "bigint" ? value.toString() : value, 2)}\n`;
const directory = new URL("../deployments/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL(`${chainId}-round-${roundId}.json`, directory), json);
console.log(json);
