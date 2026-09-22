import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, ContractFactory, JsonRpcProvider, Wallet, ZeroAddress, ZeroHash, getAddress, getCreateAddress, keccak256 } from "ethers";
import { matchesRuntime } from "../../apps/contracts/scripts/runtime-match.ts";
import { DeploymentError } from "../../apps/contracts/scripts/deployment-journal.ts";
import { createTransactionPipeline, type ChainJournal } from "./chain-transactions.ts";
import { createVersionedChainAdapter, type V9ChainOptions } from "./chain.ts";
import { verifyRetiredRegistryTargets } from "../winner-credit-retirement.ts";

import { seasonVersionPolicy, supportedHistoricalSource, type SeasonContractVersion } from "./version.ts";

export type V9RegistrySetupOptions = Omit<V9ChainOptions, "eligibility" | "credits" | "sponsorshipFundingWei"> & {
  previousCredits?: { address: string; codeHash: string };
  /** Explicit fresh-network bootstrap. Never use this to reset the previous Sepolia registry. */
  freshNetwork?: boolean;
  legacyMerkleRoot?: string;
};
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new DeploymentError(message); }
const same = (a: unknown, b: unknown) => String(a).toLowerCase() === String(b).toLowerCase();

/** One-time setup uses a SEPARATE persisted journal and signer lock; resume that same setup until it returns public pins. */
export function setupV9Registries(options: V9RegistrySetupOptions) { return setupVersionedRegistries(options, "affiliate-v9"); }
export function setupV10Registries(options: V9RegistrySetupOptions) { return setupVersionedRegistries(options, "affiliate-v10"); }
export async function setupVersionedRegistries(options: V9RegistrySetupOptions, version: SeasonContractVersion) {
  const policy = seasonVersionPolicy(version);
  check([1, 11155111].includes(options.chainId), "Only Mainnet and Sepolia registry setup is supported.");
  check(options.previousCredits || (options.freshNetwork === true && !(options.historicalSources?.length)), "Existing deployments require the prior winner-credit registry and reviewed completed historical imports.");
  check(!options.previousCredits || (options.historicalSources?.length ?? 0) > 0, "Migrating credits requires completed historical eligibility source imports.");
  const owner = getAddress(options.owner), provider = new JsonRpcProvider(options.rpcUrl);
  const signer = options.privateKey ? new Wallet(options.privateKey, provider) : undefined;
  const confirmations = options.confirmations ?? (options.chainId === 1 ? 12 : 2);
  try {
    check(!options.execute || signer?.address === owner, "Setup execute requires the reviewed local owner key.");
    check((await provider.getNetwork()).chainId === BigInt(options.chainId), "Setup provider differs from the selected chain.");
    const head = await provider.getBlock("latest"), block = head && await provider.getBlock(head.number - confirmations + 1);
    check(block?.hash, "No confirmed setup block is available.");
    const at = { blockTag: block.number };
    const artifactRoot = options.artifactRoot ?? fileURLToPath(new URL("../../apps/contracts/artifacts/", import.meta.url));
    async function readArtifact(name: string) {
      const artifact = JSON.parse(await readFile(join(artifactRoot, "contracts", `${name}.sol`, `${name}.json`), "utf8"));
      check(artifact.contractName === name && /^solc-[a-zA-Z0-9_-]+$/.test(artifact.buildInfoId), "Invalid setup artifact.");
      const build = JSON.parse(await readFile(join(artifactRoot, "build-info", `${artifact.buildInfoId}.json`), "utf8"));
      check(build.solcVersion === "0.8.37" && build.input?.settings?.evmVersion === "cancun", "Setup requires the pinned current build.");
      return artifact;
    }
    let previous = ZeroAddress, root = options.legacyMerkleRoot ?? ZeroHash;
    if (options.previousCredits) {
      previous = getAddress(options.previousCredits.address);
      check(/^0x[0-9a-f]{64}$/i.test(options.previousCredits.codeHash) && same(keccak256(await provider.getCode(previous, block.number)), options.previousCredits.codeHash), "Prior winner-credit registry code hash differs from the reviewed pin.");
      const old = new Contract(previous, ["function WINNER_CREDITS_VERSION() view returns(string)", "function totalSponsorBalance() view returns(uint256)", "function owner() view returns(address)", "function legacyMerkleRoot() view returns(bytes32)"], provider);
      check((policy.permanent ? ["winner-credits-v2", "winner-credits-v3", "winner-credits-v4", "winner-credits-v5"] : ["winner-credits-v2", "winner-credits-v3", "winner-credits-v4"]).includes(await old.WINNER_CREDITS_VERSION(at)), "Unsupported prior winner-credit registry.");
      check(same(await old.owner(at), owner) && await old.totalSponsorBalance(at) === 0n, "Prior sponsorship targets must be retired and their operator sponsorship balance recovered before migration; this command never withdraws funds.");
      const oldRoot = await old.legacyMerkleRoot(at);
      check(!options.legacyMerkleRoot || same(options.legacyMerkleRoot, oldRoot), "Keep the previous canonical historical winner root.");
      root = oldRoot;
      // Retire the entire predecessor lineage, not only its most recent ledger.
      let prior = previous, upperVersion = policy.permanent ? 6 : 5;
      const seen = new Set<string>();
      while (prior !== ZeroAddress) {
        check(!seen.has(prior.toLowerCase()), "Prior registry lineage contains a cycle."); seen.add(prior.toLowerCase());
        const probe = new Contract(prior, ["function WINNER_CREDITS_VERSION() view returns(string)"], provider);
        const marker = await probe.WINNER_CREDITS_VERSION(at);
        const registryNumber = Number(/^winner-credits-v([2-5])$/.exec(marker)?.[1]);
        check(registryNumber >= 2 && registryNumber < upperVersion, "Prior registry lineage must descend through supported versions.");
        const name = registryNumber === 2 ? "ManekinekoWinnerCredits" : `ManekinekoWinnerCreditsV${registryNumber}`;
        const artifact = await readArtifact(name), code = await provider.getCode(prior, block.number);
        check(matchesRuntime(code, artifact), "Prior registry lineage differs from the reviewed build.");
        const ledger = new Contract(prior, artifact.abi, provider);
        check(await ledger.totalSponsorBalance(at) === 0n && same(await ledger.legacyMerkleRoot(at), root), "Retire all predecessor sponsorship and preserve the historical winner root.");
        if (policy.permanent) await verifyRetiredRegistryTargets(provider, prior, artifact.abi, { number: block.number, hash: block.hash, timestamp: block.timestamp });
        upperVersion = registryNumber;
        prior = registryNumber === 2 ? ZeroAddress : getAddress(await ledger.previousRegistry(at));
      }
    }
    check(/^0x[0-9a-f]{64}$/i.test(root), "A canonical bytes32 winner root is required.");
    // Verify every source before spending any setup gas. Existing source identities and versions stay unchanged.
    for (const source of options.historicalSources ?? []) {
      check(/^0x[0-9a-f]{64}$/i.test(source.factoryCodeHash) && /^0x[0-9a-f]{64}$/i.test(source.roundCodeHash), "Historical imports require both factory and round runtime pins.");
      check(same(keccak256(await provider.getCode(source.factory, block.number)), source.factoryCodeHash) && same(keccak256(await provider.getCode(source.round, block.number)), source.roundCodeHash), "Historical import runtime differs from reviewed pins.");
      const factory = new Contract(source.factory, ["function rounds(uint256) view returns(address)"], provider);
      const round = new Contract(source.round, ["function CONTRACT_VERSION() view returns(string)", "function ALGORITHM_VERSION() view returns(string)", "function readyForNextRound() view returns(bool)", "function soldOut() view returns(bool)", "function revealed() view returns(bool)", "function prizePaid() view returns(bool)", "function roundId() view returns(uint256)"], provider);
      const sourceVersion = await round.CONTRACT_VERSION(at), algorithm = await round.ALGORITHM_VERSION(at);
      const complete = ["affiliate-v5", "affiliate-v6"].includes(sourceVersion) ? await round.soldOut(at) && await round.revealed(at) && await round.prizePaid(at) : await round.readyForNextRound(at);
      check(same(await factory.rounds(source.roundId, at), source.round) && String(await round.roundId(at)) === source.roundId
        && supportedHistoricalSource(version, sourceVersion, algorithm) && complete, "Migration sources must be completed immutable supported rounds from their pinned factories.");
    }
    const journal: ChainJournal = options.journal ?? { version: 1, chainId: options.chainId, from: owner, maxFeePerGasWei: options.maxFeePerGasWei, maxTotalSpendWei: options.maxTotalSpendWei, transactions: [], collections: {} };
    check(journal.chainId === options.chainId && journal.from === owner && journal.maxFeePerGasWei === options.maxFeePerGasWei && journal.maxTotalSpendWei === options.maxTotalSpendWei, "Setup journal differs from chain, signer or spending policy.");
    const pipeline = createTransactionPipeline({ provider, signer, execute: options.execute, journal, save: () => options.saveJournal(journal), confirmations });
    const components = [];
    for (const name of [`Manekineko${policy.eligibilityComponent}`, `Manekineko${policy.creditsComponent}`]) {
      components.push({ name, artifact: await readArtifact(name) });
    }
    if (!options.execute) return { mode: "preflight" as const, chainId: options.chainId, contractVersion: version, owner, previousCredits: previous, legacyMerkleRoot: root, historicalSources: options.historicalSources?.length ?? 0, blockNumber: block.number, blockHash: block.hash };
    check((await provider.getBlock(block.number))?.hash === block.hash, "Setup preflight block was reorganized.");
    const pins = [];
    for (const { name, artifact } of components) {
      const builder = new ContractFactory(artifact.abi, artifact.bytecode);
      const action = `setup:${name}`, constructor = name === `Manekineko${policy.eligibilityComponent}` ? [owner] : [owner, root, previous];
      const receipt = await pipeline.send(action, await builder.getDeployTransaction(...constructor));
      const entry = journal.transactions.find(item => item.action === action)!;
      check(receipt.contractAddress === getCreateAddress({ from: owner, nonce: entry.nonce }), "Setup receipt has an unexpected contract address.");
      const address = receipt.contractAddress!, code = await provider.getCode(address, receipt.blockNumber);
      check(matchesRuntime(code, artifact), "Setup runtime differs from the reviewed build.");
      const deployed = new Contract(address, artifact.abi, provider);
      check(same(await deployed.owner({ blockTag: receipt.blockNumber }), owner), "Setup owner differs.");
      if (name === `Manekineko${policy.creditsComponent}`) check(same(await deployed.previousRegistry({ blockTag: receipt.blockNumber }), previous) && same(await deployed.legacyMerkleRoot({ blockTag: receipt.blockNumber }), root), "New credits did not preserve previous registry/history.");
      pins.push({ address, codeHash: keccak256(code) });
    }
    const adapter = await createVersionedChainAdapter({ ...options, journal, eligibility: pins[0], credits: pins[1] }, version);
    try { await adapter.preflight(); await adapter.ensureHistoricalSources(); } finally { adapter.destroy(); }
    return { mode: "ready" as const, chainId: options.chainId, contractVersion: version, owner, eligibility: pins[0], credits: pins[1], previousCredits: previous, legacyMerkleRoot: root };
  } finally { provider.destroy(); }
}
