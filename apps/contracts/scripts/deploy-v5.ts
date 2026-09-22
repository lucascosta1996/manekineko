import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { artifacts, network } from "hardhat";
import { parseV5Config } from "./v5-config.js";
import { Wallet, getCreateAddress } from "ethers";
import { DeploymentError, configFingerprint, feeCeiling, cappedFees, json, openJournal, validateJournal, validateJournalAnchor, journaledTransactions } from "./deployment-journal.js";
import type { DeploymentJournal } from "./deployment-journal.js";
import { matchesRuntime } from "./runtime-match.js";

async function main() {
// Read-only unless V5_BROADCAST=1 is explicitly set. No automatic request, mint or prize transaction.
const broadcast = process.env.V5_BROADCAST === "1";
if (process.env.V5_BROADCAST && !["0", "1"].includes(process.env.V5_BROADCAST)) throw new DeploymentError("V5_BROADCAST must be 0 or 1.");
const path = process.env.V5_CONFIG_PATH;
if (!path) throw new DeploymentError("Set V5_CONFIG_PATH to reviewed V5 terms; example zero owners are intentionally invalid.");
const { ethers } = await network.create();
const chainId = (await ethers.provider.getNetwork()).chainId;
const block = await ethers.provider.getBlock("latest");
if (!block?.hash) throw new DeploymentError("Cannot pin a preflight block.");
const raw: unknown = JSON.parse(await readFile(resolve(path), "utf8"));
const ceiling = feeCeiling(process.env.V5_MAX_FEE_PER_GAS_WEI);
if (broadcast && !process.env.V5_JOURNAL_PATH) throw new DeploymentError("Broadcast requires an explicit V5_JOURNAL_PATH. Reuse this path for every resume.");
const store = broadcast ? await openJournal(process.env.V5_JOURNAL_PATH!) : null;
let signerLock: Awaited<ReturnType<typeof openJournal>> | null = null;
try {
const previous = await store?.load() ?? null;
if (previous && previous.version !== 2) throw new DeploymentError("Legacy journals require manual reconciliation; automatic resume requires version 2.");
const configTimestamp = previous ? BigInt(previous.configTimestamp) : BigInt(block.timestamp);
const terms = parseV5Config(raw, chainId, configTimestamp);
// HardhatEthersSigner cannot sign raw transactions; this wallet signs locally and never delegates signing to RPC.
if (broadcast && !process.env.DEPLOYER_PRIVATE_KEY) throw new DeploymentError("Broadcast requires DEPLOYER_PRIVATE_KEY in the runtime environment.");
const signer = broadcast ? new Wallet(process.env.DEPLOYER_PRIVATE_KEY!, ethers.provider) : undefined;
const from = signer?.address ?? ethers.getAddress(process.env.V5_PREFLIGHT_FROM ?? terms.config.initialOwner);
if (broadcast) signerLock = await openJournal(new URL(`../deployments/signer-${chainId}-${from.toLowerCase()}.json`, import.meta.url).pathname);
if (from === terms.config.enrollmentSigner) throw new DeploymentError("The deployment sender must not be the enrollment service signer.");
if (terms.activateSale && from !== terms.config.initialOwner) throw new DeploymentError("activateSale requires the configured owner as signer. Use false for separate multisig activation.");
const coordinatorCode = await ethers.provider.getCode(terms.config.vrfCoordinator, block.number);
if (coordinatorCode === "0x") throw new DeploymentError("Configured VRF coordinator has no deployed code.");
if (await ethers.provider.getCode(terms.config.enrollmentSigner, block.number) !== "0x") {
  throw new DeploymentError("The immutable enrollment signer must be a separate EOA controlled by the admission service.");
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
  if (!key.exists || key.maxGas === 0n) throw new DeploymentError("Reviewed VRF key is not currently registered.");
  if (terms.config.requestConfirmations < configuration.minimumRequestConfirmations || terms.config.requestConfirmations > maxConfirmations ||
      terms.config.callbackGasLimit > configuration.maxGasLimit) throw new DeploymentError("Round terms exceed the live coordinator limits.");
  coordinatorChecks = {
    codeHash: ethers.keccak256(coordinatorCode), keyRegistered: key.exists, gasLaneWei: key.maxGas,
    minimumConfirmations: configuration.minimumRequestConfirmations, maximumConfirmations: maxConfirmations,
    maximumCallbackGas: configuration.maxGasLimit, nativePremiumPercentage: configuration.nativePremiumPercentage,
    flatNativeFeePPM: configuration.fulfillmentFlatFeeNativePPM,
  };
}

const factoryArtifact = await artifacts.readArtifact("ManekinekoFactoryV5");
const roundArtifact = await artifacts.readArtifact("ManekinekoRoundV5");
const rendererArtifact = await artifacts.readArtifact("ManekinekoRendererV5");
const deployerArtifact = await artifacts.readArtifact("ManekinekoRoundDeployerV5");
for (const artifact of [factoryArtifact, roundArtifact, rendererArtifact, deployerArtifact]) {
  if (ethers.getBytes(artifact.deployedBytecode).length > 24_576 || ethers.getBytes(artifact.bytecode).length > 49_152) {
    throw new DeploymentError(`${artifact.contractName} exceeds Ethereum contract size limits.`);
  }
}
const originalFactory = process.env.FACTORY_ADDRESS ? ethers.getAddress(process.env.FACTORY_ADDRESS) : null;
const inputHash = configFingerprint(raw);
if (previous) {
  validateJournal(previous, { chainId, from, inputHash, ceiling, existingFactory: originalFactory });
  validateJournalAnchor(previous, await ethers.provider.getBlock(previous.preflight.blockNumber));
}
let existingFactory: import("ethers").Contract | undefined;
let roundId = previous ? BigInt(previous.preflight.config.roundId) : 1n;
if (process.env.FACTORY_ADDRESS) {
  const address = ethers.getAddress(process.env.FACTORY_ADDRESS);
  if (!matchesRuntime(await ethers.provider.getCode(address, block.number), factoryArtifact)) {
    throw new DeploymentError("Existing factory runtime differs from this V5 build.");
  }
  existingFactory = new ethers.Contract(address, factoryArtifact.abi, signer ?? ethers.provider);
  const renderer = await existingFactory.renderer({ blockTag: block.number });
  if (!matchesRuntime(await ethers.provider.getCode(renderer, block.number), rendererArtifact)) throw new DeploymentError("Existing factory renderer differs from this V5 build.");
  const deployerAddress = await existingFactory.deployer({ blockTag: block.number });
  if (!matchesRuntime(await ethers.provider.getCode(deployerAddress, block.number), deployerArtifact)) throw new DeploymentError("Existing factory deployer differs from this V5 build.");
  const deployer = new ethers.Contract(deployerAddress, deployerArtifact.abi, ethers.provider);
  if (await deployer.factory({ blockTag: block.number }) !== address) throw new DeploymentError("Existing deployer is not bound to this factory.");
  if (await existingFactory.owner({ blockTag: block.number }) !== from) throw new DeploymentError("Preflight sender is not the factory owner.");
  if (!previous) roundId = await existingFactory.roundCount({ blockTag: block.number }) + 1n;
  if (roundId > 1n) {
    const previous = await ethers.getContractAt("ManekinekoRoundV5", await existingFactory.rounds(roundId - 1n, { blockTag: block.number }));
    if (!await previous.readyForNextRound({ blockTag: block.number })) throw new DeploymentError("Previous V5 round has not delivered its prize.");
  }
}
const config = { ...terms.config, roundId };
const factoryBuilder = new ethers.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, ethers.provider);
const feeData = await ethers.provider.getFeeData();
if (block.baseFeePerGas === null || feeData.maxPriorityFeePerGas === null) throw new DeploymentError("RPC did not return EIP-1559 fees.");
const feePerGas = cappedFees(block.baseFeePerGas, feeData.maxPriorityFeePerGas, ceiling).maxFeePerGas;
const factoryGas = existingFactory ? 0n : await ethers.provider.estimateGas({ ...await factoryBuilder.getDeployTransaction(from), from });
const roundGas = existingFactory && !previous
  ? await existingFactory.createRound.estimateGas(config, { from })
  : 8_000_000n; // Conservative budget until the new factory's immutable renderer exists.
const roundGasKind = existingFactory ? "RPC estimate" : "8M gas budget; exact estimation occurs before createRound submission";
// Conservative transaction budget, not a VRF fee quote: new-factory creation wraps the round constructor.
const transactionGasBudget = (factoryGas + roundGas + 500_000n) * 120n / 100n;
const estimatedTransactionBudgetWei = transactionGasBudget * feePerGas;
const balance = await ethers.provider.getBalance(from, block.number);
const requiredBalance = estimatedTransactionBudgetWei + terms.randomnessFundingWei;
const report = {
  mode: broadcast ? "broadcast" : "preflight-only", chainId, blockNumber: block.number, blockHash: block.hash, configTimestamp, maxFeePerGasWei: ceiling,
  from, config, randomnessFundingWei: terms.randomnessFundingWei, activateSale: terms.activateSale,
  factory: existingFactory ? await existingFactory.getAddress() : null,
  coordinatorChecks, feePerGas, factoryGas, roundGas, roundGasKind, estimatedTransactionBudgetWei, senderBalanceWei: balance,
  senderFundingSufficientForEstimate: balance >= requiredBalance,
  budgetNote: "Gas estimates are not a price guarantee. The VRF subscription budget is separate and must cover live fulfillment fees; top-ups may be needed.",
  compiler: "0.8.37+commit.f401782d", evmVersion: "cancun",
  factoryRuntimeBytes: ethers.getBytes(factoryArtifact.deployedBytecode).length,
  roundRuntimeBytes: ethers.getBytes(roundArtifact.deployedBytecode).length,
  rendererRuntimeBytes: ethers.getBytes(rendererArtifact.deployedBytecode).length,
  deployerRuntimeBytes: ethers.getBytes(deployerArtifact.deployedBytecode).length,
  prizeBps: config.prizeBps,
  affiliatePoolBps: config.affiliatePoolBps,
  accountingNote: "A fixed share of all primary mint revenue forms the pool. At sellout it is allocated proportionally to referred ticket sales. Zero referrals receive nothing; no referrals release the unused pool to the operator. Pool and prize percentages are frozen at deployment.",
  enrollmentNote: "Enrollment is open until the owner activates minting. Automated admission needs a separately configured web signer and bot checks. No mint or enrollment transaction is broadcast by this script.",
};
console.log(json(report));
if (previous && configFingerprint(previous.preflight.config) !== configFingerprint(config)) throw new DeploymentError("Resume configuration differs from the saved constructor terms.");
if (broadcast) {
  if (!previous && balance < requiredBalance) throw new DeploymentError("Signer balance is below configured funding plus the estimated deployment budget.");
  const startingNonce = previous?.startingNonce ?? await signer!.getNonce("latest");
  if (!previous && await signer!.getNonce("pending") !== startingNonce) throw new DeploymentError("Signer has pending transactions. Reconcile before starting deployment.");
  const journal: DeploymentJournal = previous ?? {
    version: 2, inputHash, configTimestamp: String(configTimestamp), maxFeePerGasWei: String(ceiling),
    startingNonce, from, chainId: String(chainId), existingFactory: originalFactory,
    preflight: JSON.parse(json(report)), state: "prepared", transactions: [],
  };
  const save = () => store!.save(journal);
  if (!previous) await save();
  console.log(json({ deploymentJournal: store!.file, resume: !!previous }));
  const confirmed = journaledTransactions({ journal, provider: ethers.provider, signer: signer!, save,
    confirmations: chainId === 31337n ? 1 : 2, ceiling });
  try {
    if ((await ethers.provider.getBlock(block.number))?.hash !== block.hash) throw new DeploymentError("Preflight block was reorganized; rerun preflight before sending.");
    let factory = existingFactory;
    let factoryBlock = block.number;
    if (!factory) {
      const receipt = await confirmed("deploy-factory", await factoryBuilder.getDeployTransaction(from));
      if (!receipt.contractAddress || receipt.contractAddress !== getCreateAddress({ from, nonce: journal.startingNonce })) throw new DeploymentError("Factory deployment receipt has an unexpected contract address.");
      factoryBlock = receipt.blockNumber;
      factory = new ethers.Contract(receipt.contractAddress, factoryArtifact.abi, signer);
    }
    journal.factory = await factory.getAddress();
    journal.renderer = await factory.renderer({ blockTag: factoryBlock });
    journal.deployer = await factory.deployer({ blockTag: factoryBlock });
    const deployedFactoryCode = await ethers.provider.getCode(String(journal.factory), factoryBlock);
    if (!matchesRuntime(deployedFactoryCode, factoryArtifact) ||
        !matchesRuntime(await ethers.provider.getCode(String(journal.renderer), factoryBlock), rendererArtifact) ||
        !matchesRuntime(await ethers.provider.getCode(String(journal.deployer), factoryBlock), deployerArtifact)) {
      throw new DeploymentError("Deployed factory, immutable renderer or deployer does not match the local V5 build.");
    }
    const deployedTemplate = new ethers.Contract(String(journal.deployer), deployerArtifact.abi, ethers.provider);
    if (await deployedTemplate.factory({ blockTag: factoryBlock }) !== journal.factory) throw new DeploymentError("Round deployer is not bound to its creating factory.");
    if (await factory.owner({ blockTag: factoryBlock }) !== from) throw new DeploymentError("Factory owner differs from deployment sender.");
    journal.factoryCodeHash = ethers.keccak256(deployedFactoryCode);
    await save();
    const roundReceipt = await confirmed("create-round", await factory.createRound.populateTransaction(config));
    const roundBlock = { blockTag: roundReceipt.blockNumber };
    const roundAddress = await factory.rounds(roundId, roundBlock);
    const round = await ethers.getContractAt("ManekinekoRoundV5", roundAddress, signer);
    journal.round = roundAddress;
    journal.subscriptionId = String(await round.subscriptionId(roundBlock));
    await save();
    if (!matchesRuntime(await ethers.provider.getCode(roundAddress, roundReceipt.blockNumber), roundArtifact)) throw new DeploymentError("Deployed round runtime does not match the local V5 build.");
    if (await round.renderer(roundBlock) !== journal.renderer || await round.maxAffiliateSlots(roundBlock) !== config.maxAffiliateSlots ||
        await round.enrollmentSigner(roundBlock) !== config.enrollmentSigner || await round.CONTRACT_VERSION(roundBlock) !== "affiliate-v5") {
      throw new DeploymentError("Post-deployment affiliate/renderer immutable checks failed.");
    }
    if (await round.prizeBps(roundBlock) !== config.prizeBps || await round.affiliatePoolBps(roundBlock) !== config.affiliatePoolBps ||
        await round.affiliateCount(roundBlock) !== 0n || await round.nextAvailableAffiliateId(roundBlock) !== 1n) throw new DeploymentError("Post-deployment economic schedule checks failed.");
    if (await round.owner(roundBlock) !== config.initialOwner || await round.vrfCoordinator(roundBlock) !== config.vrfCoordinator ||
        await round.maxSupply(roundBlock) !== config.maxSupply || await round.requestConfirmations(roundBlock) !== config.requestConfirmations ||
        await round.roundId(roundBlock) !== config.roundId || await round.keyHash(roundBlock) !== config.keyHash ||
        await round.mintPrice(roundBlock) !== config.mintPrice || await round.mintDeadline(roundBlock) !== config.mintDeadline ||
        await round.callbackGasLimit(roundBlock) !== config.callbackGasLimit || await round.name(roundBlock) !== config.name || await round.symbol(roundBlock) !== config.symbol) {
      throw new DeploymentError("Post-deployment immutable/owner checks failed.");
    }
    if (BigInt((await ethers.provider.getBlock("latest"))!.timestamp) >= config.mintDeadline) throw new DeploymentError("Round expired during deployment. Reconcile this unsold round before creating a new series.");
    const fundingReceipt = await confirmed("fund-randomness", await round.fundRandomness.populateTransaction({ value: terms.randomnessFundingWei }));
    const coordinator = new ethers.Contract(config.vrfCoordinator, [
      "function getSubscription(uint256) view returns(uint96 balance,uint96 nativeBalance,uint64 reqCount,address owner,address[] consumers)",
    ], ethers.provider);
    const subscription = await coordinator.getSubscription(journal.subscriptionId, { blockTag: fundingReceipt.blockNumber });
    if (subscription.owner !== roundAddress || subscription.consumers.length !== 1 || subscription.consumers[0] !== roundAddress ||
        subscription.nativeBalance < terms.randomnessFundingWei) throw new DeploymentError("Dedicated VRF subscription ownership, registration or funding check failed.");
    if (await round.saleActivated({ blockTag: fundingReceipt.blockNumber })) throw new DeploymentError("Unexpected sale activation. This deployment must leave enrollment open.");
    for (const entry of journal.transactions) {
      if ((await ethers.provider.getBlock(entry.blockNumber!))?.hash !== entry.blockHash) throw new DeploymentError("A deployment receipt changed canonical block before completion.");
    }
    journal.state = "funded-enrollment-open";
    delete journal.error;
    await save();
    console.log(json({ journal: store!.file, factory: journal.factory, factoryCodeHash: journal.factoryCodeHash, renderer: journal.renderer, deployer: journal.deployer, round: roundAddress, subscriptionId: journal.subscriptionId, state: journal.state }));
  } catch (error) {
    journal.state = "needs-reconciliation";
    journal.error = error instanceof DeploymentError ? error.message : "Deployment interrupted; provider details and signed bytes withheld. Resume the same journal to reconcile.";
    await save();
    throw error;
  }
}

} finally { try { await signerLock?.close(); } finally { await store?.close(); } }
}
main().catch(error => {
  console.error(error instanceof DeploymentError ? error.message : "V5 deployment stopped; sensitive provider diagnostics were withheld. Reconcile V5_JOURNAL_PATH before resuming.");
  process.exitCode = 1;
});
