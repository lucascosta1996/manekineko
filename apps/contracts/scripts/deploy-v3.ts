import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { artifacts, network } from "hardhat";
import { parseV3Config } from "./v3-config.js";
import type { TransactionRequest } from "ethers";
import { matchesRuntime } from "./runtime-match.js";

// Read-only unless V3_BROADCAST=1 is explicitly set. No automatic request, mint or prize transaction.
const broadcast = process.env.V3_BROADCAST === "1";
if (process.env.V3_BROADCAST && !["0", "1"].includes(process.env.V3_BROADCAST)) throw new Error("V3_BROADCAST must be 0 or 1.");
const path = process.env.V3_CONFIG_PATH;
if (!path) throw new Error("Set V3_CONFIG_PATH to reviewed V3 terms; example zero owners are intentionally invalid.");
const { ethers } = await network.create();
const chainId = (await ethers.provider.getNetwork()).chainId;
const block = await ethers.provider.getBlock("latest");
if (!block?.hash) throw new Error("Cannot pin a preflight block.");
const raw: unknown = JSON.parse(await readFile(resolve(path), "utf8"));
const terms = parseV3Config(raw, chainId, BigInt(block.timestamp));
const signers = broadcast ? await ethers.getSigners() : [];
const signer = signers[0];
if (broadcast && !signer) throw new Error("Broadcast requires a configured signer.");
const from = signer?.address ?? ethers.getAddress(process.env.V3_PREFLIGHT_FROM ?? terms.config.initialOwner);
if (from === terms.config.enrollmentSigner) throw new Error("The deployment sender must not be the enrollment service signer.");
if (terms.activateSale && from !== terms.config.initialOwner) throw new Error("activateSale requires the configured owner as signer. Use false for separate multisig activation.");
const coordinatorCode = await ethers.provider.getCode(terms.config.vrfCoordinator, block.number);
if (coordinatorCode === "0x") throw new Error("Configured VRF coordinator has no deployed code.");
if (await ethers.provider.getCode(terms.config.enrollmentSigner, block.number) !== "0x") {
  throw new Error("The immutable enrollment signer must be a separate EOA controlled by the admission service.");
}

let coordinatorChecks: unknown = { localMock: true };
if (chainId !== 31337n) {
  const coordinator = new ethers.Contract(terms.config.vrfCoordinator, [
    "function s_config() view returns (uint16 minimumRequestConfirmations,uint32 maxGasLimit,bool reentrancyLock,uint32 stalenessSeconds,uint32 gasAfterPaymentCalculation,uint32 fulfillmentFlatFeeNativePPM,uint32 fulfillmentFlatFeeLinkDiscountPPM,uint8 nativePremiumPercentage,uint8 linkPremiumPercentage)",
    "function s_provingKeys(bytes32) view returns (bool exists,uint64 maxGas)",
    "function MAX_REQUEST_CONFIRMATIONS() view returns (uint16)",
  ], ethers.provider);
  const [configuration, key, maxConfirmations] = await Promise.all([
    coordinator.s_config({ blockTag: block.number }),
    coordinator.s_provingKeys(terms.config.keyHash, { blockTag: block.number }),
    coordinator.MAX_REQUEST_CONFIRMATIONS({ blockTag: block.number }),
  ]);
  if (!key.exists || key.maxGas === 0n) throw new Error("Reviewed VRF key is not currently registered.");
  if (terms.config.requestConfirmations < configuration.minimumRequestConfirmations || terms.config.requestConfirmations > maxConfirmations ||
      terms.config.callbackGasLimit > configuration.maxGasLimit) throw new Error("Round terms exceed the live coordinator limits.");
  coordinatorChecks = {
    codeHash: ethers.keccak256(coordinatorCode), keyRegistered: key.exists, gasLaneWei: key.maxGas,
    minimumConfirmations: configuration.minimumRequestConfirmations, maximumConfirmations: maxConfirmations,
    maximumCallbackGas: configuration.maxGasLimit, nativePremiumPercentage: configuration.nativePremiumPercentage,
    flatNativeFeePPM: configuration.fulfillmentFlatFeeNativePPM,
  };
}

const factoryArtifact = await artifacts.readArtifact("ManekinekoFactoryV3");
const roundArtifact = await artifacts.readArtifact("ManekinekoRoundV3");
const rendererArtifact = await artifacts.readArtifact("ManekinekoRendererV3");
for (const artifact of [factoryArtifact, roundArtifact, rendererArtifact]) {
  if (ethers.getBytes(artifact.deployedBytecode).length > 24_576 || ethers.getBytes(artifact.bytecode).length > 49_152) {
    throw new Error(`${artifact.contractName} exceeds Ethereum contract size limits.`);
  }
}
let existingFactory;
let roundId = 1n;
if (process.env.FACTORY_ADDRESS) {
  const address = ethers.getAddress(process.env.FACTORY_ADDRESS);
  if (!matchesRuntime(await ethers.provider.getCode(address, block.number), factoryArtifact)) {
    throw new Error("Existing factory runtime differs from this V3 build.");
  }
  existingFactory = await ethers.getContractAt("ManekinekoFactoryV3", address, signer ?? ethers.provider);
  const renderer = await existingFactory.renderer({ blockTag: block.number });
  if (!matchesRuntime(await ethers.provider.getCode(renderer, block.number), rendererArtifact)) throw new Error("Existing factory renderer differs from this V3 build.");
  if (await existingFactory.owner({ blockTag: block.number }) !== from) throw new Error("Preflight sender is not the factory owner.");
  roundId = await existingFactory.roundCount({ blockTag: block.number }) + 1n;
  if (roundId > 1n) {
    const previous = await ethers.getContractAt("ManekinekoRoundV3", await existingFactory.rounds(roundId - 1n, { blockTag: block.number }));
    if (!await previous.readyForNextRound({ blockTag: block.number })) throw new Error("Previous V3 round has not delivered its prize.");
  }
}
const config = { ...terms.config, roundId };
const factoryBuilder = new ethers.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, ethers.provider);
const feeData = await ethers.provider.getFeeData();
const feePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
if (feePerGas === null) throw new Error("RPC did not return a usable fee estimate.");
const factoryGas = existingFactory ? 0n : await ethers.provider.estimateGas({ ...await factoryBuilder.getDeployTransaction(from), from });
const roundGas = existingFactory
  ? await existingFactory.createRound.estimateGas(config, { from })
  : 8_000_000n; // Conservative budget until the new factory's immutable renderer exists.
const roundGasKind = existingFactory ? "RPC estimate" : "8M gas budget; exact estimation occurs before createRound submission";
// Conservative transaction budget, not a VRF fee quote: new-factory creation wraps the round constructor.
const transactionGasBudget = (factoryGas + roundGas + 500_000n) * 120n / 100n;
const estimatedTransactionBudgetWei = transactionGasBudget * feePerGas;
const balance = await ethers.provider.getBalance(from, block.number);
const requiredBalance = estimatedTransactionBudgetWei + terms.randomnessFundingWei;
const report = {
  mode: broadcast ? "broadcast" : "preflight-only", chainId, blockNumber: block.number, blockHash: block.hash,
  from, config, randomnessFundingWei: terms.randomnessFundingWei, activateSale: terms.activateSale,
  factory: existingFactory ? await existingFactory.getAddress() : null,
  coordinatorChecks, feePerGas, factoryGas, roundGas, roundGasKind, estimatedTransactionBudgetWei, senderBalanceWei: balance,
  senderFundingSufficientForEstimate: balance >= requiredBalance,
  budgetNote: "Gas estimates are not a price guarantee. The VRF subscription budget is separate and must cover live fulfillment fees; top-ups may be needed.",
  compiler: "0.8.37+commit.f401782d", evmVersion: "cancun",
  factoryRuntimeBytes: ethers.getBytes(factoryArtifact.deployedBytecode).length,
  roundRuntimeBytes: ethers.getBytes(roundArtifact.deployedBytecode).length,
  rendererRuntimeBytes: ethers.getBytes(rendererArtifact.deployedBytecode).length,
  affiliateCommissionBps: 100,
  enrollmentNote: "Enrollment is open until the owner activates minting. Automated admission needs a separately configured web signer and bot checks. No mint or enrollment transaction is broadcast by this script.",
};
const json = (value: unknown) => JSON.stringify(value, (_, item: unknown) => typeof item === "bigint" ? item.toString() : item, 2);
console.log(json(report));
if (broadcast) {
  if (balance < requiredBalance) throw new Error("Signer balance is below the configured funding plus estimated deployment transaction budget.");
  const directory = new URL("../deployments/", import.meta.url);
  await mkdir(directory, { recursive: true });
  // Reserve a unique journal BEFORE the first transaction so partial execution is recoverable.
  const file = new URL(`${chainId}-v3-${Date.now()}-${roundId}.json`, directory);
  await writeFile(file, `${json({ preflight: report, state: "prepared", transactions: [] })}\n`, { flag: "wx" });
  console.log(json({ deploymentJournal: file.pathname }));
  const journal: Record<string, unknown> = { preflight: report, state: "prepared", transactions: [] };
  const transactions = journal.transactions as Record<string, unknown>[];
  async function save() {
    const temporary = new URL(`${file.href}.tmp`);
    await writeFile(temporary, `${json(journal)}\n`);
    await rename(temporary, file);
  }
    async function confirmed(action: string, request: TransactionRequest) {
    // One serialized writer per deployment signer is required. An RPC timeout is ambiguous,
    // so preserve the exact intent and nonce before allowing the provider to submit it.
    const nonce = await signer!.getNonce("pending");
    const gasLimit = (await signer!.estimateGas(request)) * 120n / 100n;
    const prepared = { ...request, nonce, chainId, gasLimit,
      ...(feeData.maxFeePerGas !== null ? { maxFeePerGas: feeData.maxFeePerGas, maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? 0n } : { gasPrice: feePerGas }) };
    const entry: Record<string, unknown> = { action, state: "prepared", request: prepared };
    if (!request.to) entry.expectedContract = ethers.getCreateAddress({ from, nonce });
    transactions.push(entry);
    await save();
    const transaction = await signer!.sendTransaction(prepared);
    entry.hash = transaction.hash;
    entry.state = "submitted";
    await save();
    const receipt = await transaction.wait(chainId === 31337n ? 1 : 2);
    if (!receipt || receipt.status !== 1) throw new Error(`${action} did not confirm successfully. Inspect ${file.pathname} before retrying.`);
    entry.blockNumber = receipt.blockNumber;
    entry.blockHash = receipt.blockHash;
    entry.state = "confirmed";
    await save();
    return receipt;
  }
  try {
    if ((await ethers.provider.getBlock(block.number))?.hash !== block.hash) throw new Error("Preflight block was reorganized; rerun preflight before sending.");
    let factory = existingFactory;
    if (!factory) {
      const receipt = await confirmed("deploy-factory", await factoryBuilder.getDeployTransaction(from));
      if (!receipt.contractAddress) throw new Error("Factory deployment receipt has no contract address.");
      factory = await ethers.getContractAt("ManekinekoFactoryV3", receipt.contractAddress, signer);
    }
    journal.factory = await factory.getAddress();
    journal.renderer = await factory.renderer();
    const deployedFactoryCode = await ethers.provider.getCode(String(journal.factory));
    if (!matchesRuntime(deployedFactoryCode, factoryArtifact) ||
        !matchesRuntime(await ethers.provider.getCode(String(journal.renderer)), rendererArtifact)) {
      throw new Error("Deployed factory or immutable renderer does not match the local V3 build.");
    }
    journal.factoryCodeHash = ethers.keccak256(deployedFactoryCode);
    await save();
    await confirmed("create-round", await factory.createRound.populateTransaction(config));
    const roundAddress = await factory.rounds(roundId);
    const round = await ethers.getContractAt("ManekinekoRoundV3", roundAddress, signer);
    journal.round = roundAddress;
    journal.subscriptionId = await round.subscriptionId();
    await save();
    if (!matchesRuntime(await ethers.provider.getCode(roundAddress), roundArtifact)) throw new Error("Deployed round runtime does not match the local V3 build.");
    if (await round.renderer() !== journal.renderer || await round.maxAffiliateSlots() !== config.maxAffiliateSlots ||
        await round.enrollmentSigner() !== config.enrollmentSigner || await round.CONTRACT_VERSION() !== "affiliate-v3") {
      throw new Error("Post-deployment affiliate/renderer immutable checks failed.");
    }
    if (await round.owner() !== config.initialOwner || await round.vrfCoordinator() !== config.vrfCoordinator ||
        await round.maxSupply() !== config.maxSupply || await round.requestConfirmations() !== config.requestConfirmations ||
        await round.roundId() !== config.roundId || await round.keyHash() !== config.keyHash ||
        await round.mintPrice() !== config.mintPrice || await round.mintDeadline() !== config.mintDeadline ||
        await round.callbackGasLimit() !== config.callbackGasLimit || await round.name() !== config.name || await round.symbol() !== config.symbol) {
      throw new Error("Post-deployment immutable/owner checks failed.");
    }
    if (BigInt((await ethers.provider.getBlock("latest"))!.timestamp) >= config.mintDeadline) throw new Error("Round expired during deployment. Reconcile this unsold round before creating a new series.");
    await confirmed("fund-randomness", await round.fundRandomness.populateTransaction({ value: terms.randomnessFundingWei }));
    const coordinator = new ethers.Contract(config.vrfCoordinator, [
      "function getSubscription(uint256) view returns(uint96 balance,uint96 nativeBalance,uint64 reqCount,address owner,address[] consumers)",
    ], ethers.provider);
    const subscription = await coordinator.getSubscription(journal.subscriptionId);
    if (subscription.owner !== roundAddress || subscription.consumers.length !== 1 || subscription.consumers[0] !== roundAddress ||
        subscription.nativeBalance < terms.randomnessFundingWei) throw new Error("Dedicated VRF subscription ownership, registration or funding check failed.");
    if (terms.activateSale) await confirmed("activate-sale", await round.activateSale.populateTransaction());
    journal.state = "funded-enrollment-open";
    await save();
    console.log(json({ journal: file.pathname, factory: journal.factory, factoryCodeHash: journal.factoryCodeHash, renderer: journal.renderer, round: roundAddress, subscriptionId: journal.subscriptionId, state: journal.state }));
  } catch (error) {
    journal.state = "needs-reconciliation";
    journal.error = error instanceof Error ? error.message : "Unknown deployment error";
    await save();
    throw error;
  }
}
