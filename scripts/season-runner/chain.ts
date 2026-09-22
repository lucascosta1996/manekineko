import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Contract, ContractFactory, JsonRpcProvider, Wallet, ZeroAddress, ZeroHash, concat, getAddress, getBytes, getCreateAddress, hexlify, id, keccak256 } from "ethers";
import type { InterfaceAbi } from "ethers";
import { seasonVersionPolicy, supportedHistoricalSource, type SeasonContractVersion } from "./version.ts";
import { AbiCoder } from "ethers";
import { matchesRuntime } from "../../apps/contracts/scripts/runtime-match.ts";
import { configFingerprint, DeploymentError } from "../../apps/contracts/scripts/deployment-journal.ts";
import { createTransactionPipeline, type ChainJournal } from "./chain-transactions.ts";
import { createV10CreditLineageVerifier } from "./credit-lineage.ts";
export { ChainPendingError, type ChainJournal } from "./chain-transactions.ts";

type Pin = { address: string; codeHash: string };
type Artifact = { contractName: string; abi: InterfaceAbi; bytecode: string; deployedBytecode: string; immutableReferences: Record<string, { start: number; length: number }[]>; buildInfoId: string };
export type V9ChainOptions = {
  chainId: 1 | 11155111; rpcUrl: string; owner: string; privateKey?: string; execute: boolean;
  eligibility: Pin; credits: Pin; maxFeePerGasWei: string; maxTotalSpendWei: string;
  confirmations?: number; artifactRoot?: string; journal?: ChainJournal; saveJournal: (journal: ChainJournal) => Promise<void>;
  sponsorshipFundingWei?: string;
  /** Reviewed completed historical imports preserve prior holder rights and consume the sole canonical bootstrap. */
  historicalSources?: Array<{ factory: string; factoryCodeHash: string; round: string; roundCodeHash: string; roundId: string }>;
};
export type ChainSnapshot = {
  chainId: number; blockNumber: number; blockHash: string; timestamp: number; round: string;
  phase: string; saleActivated: boolean; saleStartAt: string; mintDeadline: string;
  totalMinted: string; maxSupply: string; mintPrice: string; soldOut: boolean; soldOutAt: string;
  randomnessRequested: boolean; randomnessReceived: boolean; revealed: boolean; readyForNextRound: boolean;
  refundsAvailable: boolean; cancelled: boolean; refundedCount: string; totalRefunded: string;
  prizePaid: boolean; prizePaidAmount: string; totalMintRevenue: string;
  affiliateCount: string; maxAffiliateSlots: string; totalAffiliateAccrued: string; totalAffiliateClaimed: string;
  affiliateQualifiedCount: string; affiliateEqualShare: string; drawCounter: string;
  awards: Array<{ rank: number; tokenId: string; holder: string; paidHolder: string; claimed: boolean; paidAt: string; amountWei: string }>;
};
export type ChainDeployment = {
  factory: string; round: string; roundId: string; subscriptionId: string; deploymentBlock: number; deploymentBlockHash: string;
  deploymentTransactionHash: string; factoryCodeHash: string; roundCodeHash: string; renderer: string; deployer: string;
  config: Record<string, string>;
};
const phases = ["pending_activation", "minting", "awaiting_request", "awaiting_randomness", "awaiting_finalization", "awaiting_prize", "complete", "refundable"];
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new DeploymentError(message); }
const same = (a: unknown, b: unknown) => String(a).toLowerCase() === String(b).toLowerCase();
const serial = (value: Record<string, unknown>): Record<string, string> => Object.fromEntries(Object.entries(value).map(([key, val]) => [key, String(val)]));

/** All public writes are explicit, versioned, locally signed and resumable. This adapter never mints or claims anyone's funds. */
export function createV9ChainAdapter(options: V9ChainOptions) { return createVersionedChainAdapter(options, "affiliate-v9"); }
export function createV10ChainAdapter(options: V9ChainOptions) { return createVersionedChainAdapter(options, "affiliate-v10"); }
export async function createVersionedChainAdapter(options: V9ChainOptions, version: SeasonContractVersion) {
  const policy = seasonVersionPolicy(version);
  check([1, 11155111].includes(options.chainId), "Only Ethereum Mainnet and Sepolia are supported.");
  check(/^[1-9]\d*$/.test(options.maxFeePerGasWei) && /^[1-9]\d*$/.test(options.maxTotalSpendWei), "Explicit positive fee and total-spending caps are required.");
  const confirmations = options.confirmations ?? (options.chainId === 1 ? 12 : 2);
  check(Number.isInteger(confirmations) && confirmations >= 2 && confirmations <= 256, "Confirmations must be from 2 to 256.");
  const owner = getAddress(options.owner);
  check(owner !== ZeroAddress, "A nonzero operator owner is required.");
  const provider = new JsonRpcProvider(options.rpcUrl);
  const signer = options.privateKey ? new Wallet(options.privateKey, provider) : undefined;
  check(!options.execute || (signer && signer.address === owner), "Execute requires a local key matching the reviewed owner.");
  for (const pin of [options.eligibility, options.credits]) check(getAddress(pin.address) !== ZeroAddress && /^0x[0-9a-f]{64}$/i.test(pin.codeHash), "Canonical registry address and runtime hash pins are required.");
  const sponsorshipFundingWei = BigInt(options.sponsorshipFundingWei ?? "0");
  check(sponsorshipFundingWei >= 0n, "Sponsorship funding cannot be negative.");
  const journal: ChainJournal = options.journal ?? { version: 1, chainId: options.chainId, from: owner, maxFeePerGasWei: options.maxFeePerGasWei, maxTotalSpendWei: options.maxTotalSpendWei, transactions: [], collections: {} };
  check(journal.chainId === options.chainId && journal.from === owner && journal.maxFeePerGasWei === options.maxFeePerGasWei && journal.maxTotalSpendWei === options.maxTotalSpendWei,
    "The saved run is bound to another chain, owner or spending policy.");
  const save = () => options.saveJournal(journal);
  const tx = createTransactionPipeline({ provider, signer, execute: options.execute, journal, save, confirmations });
  const artifactRoot = options.artifactRoot ?? fileURLToPath(new URL("../../apps/contracts/artifacts/", import.meta.url));
  const artifacts: Record<string, Artifact> = {};
  const compiledArtifacts = new Map<string, Artifact>();
  async function loadArtifact(full: string) {
    const cached = compiledArtifacts.get(full);
    if (cached) return cached;
    const artifact: Artifact = JSON.parse(await readFile(join(artifactRoot, "contracts", `${full}.sol`, `${full}.json`), "utf8"));
    check(artifact.contractName === full && /^solc-[a-zA-Z0-9_-]+$/.test(artifact.buildInfoId), "Invalid local build artifact.");
    const build = JSON.parse(await readFile(join(artifactRoot, "build-info", `${artifact.buildInfoId}.json`), "utf8"));
    check(build.solcVersion === "0.8.37" && build.input?.settings?.evmVersion === "cancun", "Rebuild with pinned Solidity 0.8.37 and Cancun.");
    check(getBytes(artifact.bytecode).length <= 49_152 && getBytes(artifact.deployedBytecode).length <= 24_576, "Versioned component exceeds deployment size limits.");
    compiledArtifacts.set(full, artifact);
    return artifact;
  }
  for (const [name, component] of Object.entries({ Factory: `Factory${policy.componentVersion}`, Round: `Round${policy.componentVersion}`, Renderer: `Renderer${policy.componentVersion}`, RoundDeployer: `RoundDeployer${policy.componentVersion}`, Eligibility: policy.eligibilityComponent, Credits: policy.creditsComponent })) {
    artifacts[name] = await loadArtifact(`Manekineko${component}`);
  }
  const contract = (name: string, address: string) => new Contract(getAddress(address), artifacts[name].abi, provider);
  const eligibility = contract("Eligibility", options.eligibility.address), credits = contract("Credits", options.credits.address);
  const verifyCreditLineage = policy.permanent ? createV10CreditLineageVerifier(provider, options.credits.address, loadArtifact) : undefined;

  async function confirmedBlock() {
    check((await provider.getNetwork()).chainId === BigInt(options.chainId), "RPC network differs from the selected profile.");
    const head = await provider.getBlock("latest");
    check(head && head.number >= confirmations, "No sufficiently confirmed RPC head.");
    const block = await provider.getBlock(head.number - confirmations + 1);
    check(block?.hash, "Canonical snapshot unavailable.");
    return block;
  }
  const send: typeof tx.send = async (...args) => {
    if (verifyCreditLineage) {
      const block = await confirmedBlock();
      await verifyRuntime("Credits", options.credits.address, block.number, options.credits.codeHash);
      await verifyCreditLineage({ number: block.number, hash: block.hash!, timestamp: block.timestamp });
    }
    return tx.send(...args);
  };
  async function anchor(number: number, hash: string) { check((await provider.getBlock(number))?.hash === hash, "Snapshot was reorganized; rerun before acting."); }
  async function verifyRuntime(name: string, address: string, block: number, pin?: string) {
    const code = await provider.getCode(address, block);
    check(matchesRuntime(code, artifacts[name]), `${name} runtime differs from the reviewed local build.`);
    const hash = keccak256(code);
    check(!pin || same(hash, pin), `${name} runtime differs from the canonical pin.`);
    return hash;
  }
  async function preflight(payload?: unknown) {
    const block = await confirmedBlock(), at = { blockTag: block.number };
    await verifyRuntime("Eligibility", options.eligibility.address, block.number, options.eligibility.codeHash);
    await verifyRuntime("Credits", options.credits.address, block.number, options.credits.codeHash);
    check(await eligibility.ELIGIBILITY_VERSION(at) === policy.eligibilityVersion && await credits.WINNER_CREDITS_VERSION(at) === policy.creditsVersion, "Canonical registries have unsupported markers.");
    check(same(await eligibility.owner(at), owner) && same(await credits.owner(at), owner), "Autonomous registry operations require the reviewed owner as registry owner.");
    await verifyCreditLineage?.({ number: block.number, hash: block.hash!, timestamp: block.timestamp });
    let terms;
    if (payload) {
      terms = policy.parseConfig(payload, BigInt(options.chainId), BigInt(block.timestamp));
      check(same(terms.config.initialOwner, owner), "Round owner differs from worker owner.");
      check(await provider.getCode(terms.config.enrollmentSigner, block.number) === "0x", "Enrollment signer must be the separate admission EOA.");
      check(await provider.getCode(terms.config.vrfCoordinator, block.number) !== "0x", "VRF coordinator is not deployed.");
      const coordinator = new Contract(terms.config.vrfCoordinator, [
        "function s_config() view returns (uint16 minimumRequestConfirmations,uint32 maxGasLimit,bool reentrancyLock,uint32 stalenessSeconds,uint32 gasAfterPaymentCalculation,uint32 fulfillmentFlatFeeNativePPM,uint32 fulfillmentFlatFeeLinkDiscountPPM,uint8 nativePremiumPercentage,uint8 linkPremiumPercentage)",
        "function s_provingKeys(bytes32) view returns (bool exists,uint64 maxGas)", "function MAX_REQUEST_CONFIRMATIONS() view returns (uint16)",
      ], provider);
      const [config, key, max] = await Promise.all([coordinator.s_config(at), coordinator.s_provingKeys(terms.config.keyHash, at), coordinator.MAX_REQUEST_CONFIRMATIONS(at)]);
      check(key.exists && key.maxGas > 0n && terms.config.requestConfirmations >= config.minimumRequestConfirmations && terms.config.requestConfirmations <= max && terms.config.callbackGasLimit <= config.maxGasLimit,
        "Round terms exceed current VRF coordinator/key limits.");
    }
    await anchor(block.number, block.hash!);
    return { chainId: options.chainId, owner, blockNumber: block.number, blockHash: block.hash!, timestamp: block.timestamp, balanceWei: String(await provider.getBalance(owner, block.number)), execute: options.execute, terms };
  }
  async function verifyFactory(address: string) {
    const block = await confirmedBlock(), at = { blockTag: block.number }, factory = contract("Factory", address);
    const factoryCodeHash = await verifyRuntime("Factory", address, block.number);
    check(same(await factory.owner(at), owner), "Factory owner differs from worker owner.");
    const renderer = getAddress(await factory.renderer(at)), deployerAddress = getAddress(await factory.deployer(at));
    await verifyRuntime("Renderer", renderer, block.number); await verifyRuntime("RoundDeployer", deployerAddress, block.number);
    const deployer = contract("RoundDeployer", deployerAddress);
    check(same(await deployer.factory(at), address), "Versioned deployer belongs to another factory.");
    const bytecode = getBytes(artifacts.Round.bytecode), split = Math.floor(bytecode.length / 2);
    const parts = [await deployer.codePart1(at), await deployer.codePart2(at)];
    for (let i = 0; i < 2; i++) check(same(await provider.getCode(parts[i], block.number), hexlify(concat(["0x00", i ? bytecode.slice(split) : bytecode.slice(0, split)]))), "Versioned deployer creation-code part differs from this build.");
    await anchor(block.number, block.hash!);
    return { factory, factoryCodeHash, renderer, deployer: deployerAddress, block };
  }
  async function approveFactory(key: string, registry: Contract, factory: string, hash: string) {
    const block = await confirmedBlock(), stored = await registry.approvedFactoryCodeHash(factory, { blockTag: block.number });
    if (stored === ZeroHash) await send(key, await registry.approveFactory.populateTransaction(factory, hash));
    else check(same(stored, hash), "Registry approved factory hash differs from the verified factory.");
  }
  async function ensureHistoricalSources() {
    for (const [index, source] of (options.historicalSources ?? []).entries()) {
      const block = await confirmedBlock(), at = { blockTag: block.number };
      check(/^0x[0-9a-f]{64}$/i.test(source.factoryCodeHash) && /^0x[0-9a-f]{64}$/i.test(source.roundCodeHash), "Historical imports require reviewed code hash pins.");
      check(same(keccak256(await provider.getCode(source.factory, block.number)), source.factoryCodeHash) && same(keccak256(await provider.getCode(source.round, block.number)), source.roundCodeHash), "Historical source code hashes differ.");
      const historicalFactory = contract("Factory", source.factory), round = contract("Round", source.round);
      const sourceVersion = await round.CONTRACT_VERSION(at), algorithm = await round.ALGORITHM_VERSION(at);
      const complete = ["affiliate-v5", "affiliate-v6"].includes(sourceVersion)
        ? await round.soldOut(at) && await round.revealed(at) && await round.prizePaid(at)
        : await round.readyForNextRound(at);
      check(same(await historicalFactory.rounds(source.roundId, at), source.round) && same(await round.roundId(at), source.roundId)
        && supportedHistoricalSource(version, sourceVersion, algorithm) && complete, "Historical import must be a reviewed completed immutable source collection.");
      await approveFactory(`history:${index}:eligibility:approve`, eligibility, source.factory, source.factoryCodeHash);
      if ((await eligibility.collections(source.round, at)).sequence === 0n) await send(`history:${index}:eligibility:register`, await eligibility.registerCollection.populateTransaction(source.factory, source.roundId));
      const registered = await eligibility.collections(source.round, { blockTag: (await confirmedBlock()).number });
      check(registered.sourceOnly && same(registered.factory, source.factory) && same(registered.codeHash, source.roundCodeHash), "Completed historical import did not preserve source-only eligibility.");
      await approveFactory(`history:${index}:credits:approve`, credits, source.factory, source.factoryCodeHash);
      if ((await credits.collections(source.round, { blockTag: (await confirmedBlock()).number })).sequence === 0n) await send(`history:${index}:credits:register`, await credits.registerCollection.populateTransaction(source.factory, source.roundId));
      const rewardSource = await credits.collections(source.round, { blockTag: (await confirmedBlock()).number });
      check(rewardSource.rewardsOnly && same(rewardSource.factory, source.factory) && same(rewardSource.codeHash, source.roundCodeHash), "Historical winner-credit source cannot reopen sponsorship.");
    }
  }
  async function ensureFactory(key: string, existingFactory?: string) {
    await preflight(); await ensureHistoricalSources();
    let address = existingFactory;
    if (!address) {
      const builder = new ContractFactory(artifacts.Factory.abi, artifacts.Factory.bytecode);
      const receipt = await send(`${key}:deploy-factory`, await builder.getDeployTransaction(owner));
      const entry = journal.transactions.find(item => item.action === `${key}:deploy-factory`)!;
      check(receipt.contractAddress && receipt.contractAddress === getCreateAddress({ from: owner, nonce: entry.nonce }), "Factory receipt has an unexpected address.");
      address = receipt.contractAddress;
    }
    const verified = await verifyFactory(address);
    await approveFactory(`${key}:eligibility:approve`, eligibility, address, verified.factoryCodeHash);
    await approveFactory(`${key}:credits:approve`, credits, address, verified.factoryCodeHash);
    return { factory: getAddress(address), factoryCodeHash: verified.factoryCodeHash, renderer: verified.renderer, deployer: verified.deployer };
  }
  async function deployCollection(key: string, payload: unknown, factoryAddress: string): Promise<ChainDeployment> {
    await preflight();
    const verified = await verifyFactory(factoryAddress), factory = verified.factory;
    const inputHash = configFingerprint({ payload, factory: getAddress(factoryAddress), eligibility: options.eligibility, credits: options.credits, sponsorshipFundingWei: String(sponsorshipFundingWei) });
    let prepared = journal.collections[key];
    if (!prepared) {
      const report = await preflight(payload), terms = report.terms!;
      const at = { blockTag: report.blockNumber }, count = await factory.roundCount(at), roundId = count + 1n;
      if (count > 0n) check(await contract("Round", await factory.rounds(count, at)).readyForNextRound(at), "Previous round is not revealed with protected liabilities backed.");
      const seasonCount = await factory.seasonCollectionCount(terms.config.seasonId, at);
      check(seasonCount < 10n && (seasonCount === 0n || await factory.seasonNameHash(terms.config.seasonId, at) === id(terms.config.seasonName)), "Factory season is full or has another name.");
      prepared = { inputHash, configTimestamp: String(report.timestamp), factory: getAddress(factoryAddress), roundId: String(roundId), config: serial({ ...terms.config, affiliateEligibility: options.eligibility.address, roundId }) };
      journal.collections[key] = prepared; await save();
    }
    check(prepared.inputHash === inputHash && same(prepared.factory, factoryAddress), "Saved collection constructor differs from the planned immutable payload.");
    const terms = policy.parseConfig(payload, BigInt(options.chainId), BigInt(prepared.configTimestamp));
    const config = { ...terms.config, affiliateEligibility: getAddress(options.eligibility.address), roundId: BigInt(prepared.roundId) };
    check(configFingerprint(serial(config)) === configFingerprint(prepared.config), "Saved immutable terms differ from parsed versioned terms.");
    const receipt = await send(`${key}:create-round`, await factory.createRound.populateTransaction(config));
    const roundAddress = getAddress(await factory.rounds(config.roundId, { blockTag: receipt.blockNumber }));
    const round = contract("Round", roundAddress), at = { blockTag: receipt.blockNumber };
    const roundCodeHash = await verifyRuntime("Round", roundAddress, receipt.blockNumber);
    for (const [field, expected] of Object.entries(config)) {
      const getter = field === "initialOwner" ? "owner" : field;
      const actual = await round[getter](at);
      check(["name", "symbol", "seasonName"].includes(field) ? actual === expected : same(actual, expected), `Deployed round differs from immutable ${field}.`);
    }
    check(await round.CONTRACT_VERSION(at) === policy.contractVersion && await round.ALGORITHM_VERSION(at) === policy.algorithmVersion && await round.MAX_MINTS_PER_WALLET(at) === 20n && same(await round.renderer(at), verified.renderer), "Deployed round version, wallet cap or renderer differs.");
    if (policy.permanent) {
      const expectedKey = keccak256(AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "uint256", "address", "uint256", "bytes32", "uint256"],
        [id("MANEKINEKO_PERMANENT_COMBINATION_V1"), options.chainId, roundAddress, config.roundId, config.seasonId, config.maxSupply],
      ));
      check(await round.combinationKey(at) === expectedKey, "Permanent combination key differs from deployment identity.");
    }
    const current = { blockTag: (await confirmedBlock()).number };
    if ((await eligibility.collections(roundAddress, current)).sequence === 0n) await send(`${key}:eligibility:register`, await eligibility.registerCollection.populateTransaction(factoryAddress, config.roundId));
    if ((await credits.collections(roundAddress, current)).sequence === 0n) await send(`${key}:credits:register`, await credits.registerCollection.populateTransaction(factoryAddress, config.roundId));
    check(!(await credits.collections(roundAddress, { blockTag: (await confirmedBlock()).number })).rewardsOnly, "Winner credits target was registered too late for sponsored rewards.");
    await send(`${key}:fund-randomness`, await round.fundRandomness.populateTransaction({ value: terms.randomnessFundingWei }));
    if (sponsorshipFundingWei > 0n) await send(`${key}:fund-sponsorship`, await credits.fundCollection.populateTransaction(roundAddress, { value: sponsorshipFundingWei }));
    const subscriptionId = String(await round.subscriptionId(at));
    const coordinator = new Contract(config.vrfCoordinator, ["function getSubscription(uint256) view returns(uint96 balance,uint96 nativeBalance,uint64 reqCount,address owner,address[] consumers)"], provider);
    const subscription = await coordinator.getSubscription(subscriptionId, { blockTag: (await confirmedBlock()).number });
    check(subscription.nativeBalance > 0n && same(subscription.owner, roundAddress) && subscription.consumers.length === 1 && same(subscription.consumers[0], roundAddress), "Round VRF subscription is not funded and exclusively bound.");
    return { factory: getAddress(factoryAddress), round: roundAddress, roundId: prepared.roundId, subscriptionId, deploymentBlock: receipt.blockNumber, deploymentBlockHash: receipt.blockHash, deploymentTransactionHash: receipt.hash, factoryCodeHash: verified.factoryCodeHash, roundCodeHash, renderer: verified.renderer, deployer: verified.deployer, config: prepared.config };
  }
  async function snapshot(roundAddress: string, blockNumber?: number): Promise<ChainSnapshot> {
    const confirmed = await confirmedBlock();
    check(blockNumber === undefined || Number.isSafeInteger(blockNumber) && blockNumber >= 0 && blockNumber <= confirmed.number, "Snapshot block is not sufficiently confirmed.");
    const block = blockNumber === undefined ? confirmed : await provider.getBlock(blockNumber);
    check(block?.hash, "Pinned snapshot block is unavailable.");
    const at = { blockTag: block.number }, round = contract("Round", roundAddress);
    await verifyRuntime("Round", roundAddress, block.number);
    check(await round.CONTRACT_VERSION(at) === policy.contractVersion && await round.ALGORITHM_VERSION(at) === policy.algorithmVersion && await round.MAX_MINTS_PER_WALLET(at) === 20n && same(await round.affiliateEligibility(at), options.eligibility.address), "Snapshot is not this canonical versioned round.");
    const names = ["phase", "saleActivated", "saleStartAt", "mintDeadline", "totalMinted", "maxSupply", "mintPrice", "soldOut", "soldOutAt", "randomnessRequested", "randomnessReceived", "revealed", "readyForNextRound", "refundsAvailable", "cancelled", "refundedCount", "totalRefunded", "prizePaid", "prizePaidAmount", "totalMintRevenue", "affiliateCount", "maxAffiliateSlots", "totalAffiliateAccrued", "totalAffiliateClaimed", "affiliateQualifiedCount", "affiliateEqualShare", "drawCounter", "awardCount"];
    const values = Object.fromEntries(await Promise.all(names.map(async name => [name, await round[name](at)])));
    check(Number(values.awardCount) >= 1 && Number(values.awardCount) <= 10 && phases[Number(values.phase)], "Invalid versioned phase or award count.");
    const awards: ChainSnapshot["awards"] = [];
    if (values.revealed) for (let rank = 1; rank <= Number(values.awardCount); rank++) {
      const tokenId = await round.winningTokenIds(rank, at);
      const [holder, paidHolder, claimed, paidAt, amount] = await Promise.all([round.ownerOf(tokenId, at), round.awardHolder(rank, at), round.prizeClaimed(rank, at), round.awardPaidAt(rank, at), round.prizeAmountForRank(rank, at)]);
      awards.push({ rank, tokenId: String(tokenId), holder, paidHolder, claimed, paidAt: String(paidAt), amountWei: String(amount) });
    }
    delete values.awardCount;
    const data = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typeof value === "bigint" ? String(value) : value]));
    await anchor(block.number, block.hash!);
    return { ...data, phase: phases[Number(values.phase)], chainId: options.chainId, round: getAddress(roundAddress), blockNumber: block.number, blockHash: block.hash!, timestamp: block.timestamp, awards } as ChainSnapshot;
  }
  async function advance(key: string, roundAddress: string) {
    await preflight();
    const round = contract("Round", roundAddress), state = await snapshot(roundAddress);
    check(same(await round.owner({ blockTag: state.blockNumber }), owner), "Collection owner differs from worker owner.");
    const head = await provider.getBlock("latest");
    check(head?.hash, "Current activation head is unavailable.");
    // At most one state-transition transaction per tick. The draw counter makes bounded retries distinct after progress.
    let action: string | null = null, request;
    if (!state.saleActivated && !state.refundsAvailable && BigInt(state.saleStartAt) <= BigInt(head.timestamp) && BigInt(head.timestamp) < BigInt(state.mintDeadline)) {
      action = "activate-sale"; request = await round.activateSale.populateTransaction();
    } else if (state.soldOut && !state.randomnessRequested) {
      action = "request-randomness"; request = await round.requestRandomness.populateTransaction();
    } else if (state.randomnessReceived && !state.revealed) {
      action = `finalize-draw:${state.drawCounter}`; request = await round.finalizeDraw.populateTransaction(8);
    } else if (state.refundsAvailable && !state.cancelled) {
      action = "cancel-expired"; request = await round.cancelExpiredRound.populateTransaction();
    }
    if (action && request) {
      await anchor(state.blockNumber, state.blockHash);
      // Persist the fixed launch grace with the signed intent. Generic restart reconciliation must enforce it too.
      await send(`${key}:${action}`, request, action === "activate-sale" ? { broadcastDeadline: Number(state.saleStartAt) + 60 } : {});
    }
    return { action, snapshot: action ? await snapshot(roundAddress) : state };
  }
  return { journal, provider, preflight, ensureFactory, deployCollection, snapshot, advance, ensureHistoricalSources, destroy: () => provider.destroy() };
}
