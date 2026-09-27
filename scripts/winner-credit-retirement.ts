import { Contract, Interface, ZeroHash, getAddress, keccak256 } from "ethers";
import type { InterfaceAbi, Provider } from "ethers";
import { localRetirementArtifact, verifyRetiredUnactivatedV8Target, type ArtifactLoader } from "../apps/contracts/scripts/retired-round-verification.ts";
export { matchesReviewedV8RetirementRuntime, verifyRetiredUnactivatedV8Target } from "../apps/contracts/scripts/retired-round-verification.ts";

const LOG_RANGE = 5_000;
const MAX_COLLECTIONS = 100_000n;
const TARGET_ABI = [
  "function cancelled() view returns (bool)",
  "function mintDeadline() view returns (uint256)",
  "function totalMinted() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
];
const FACTORY_ABI = ["function rounds(uint256) view returns (address)"];
type PinnedBlock = { number: number; hash: string; timestamp: number };
type CreationBoundary = { number: number; hash: string };
// Cache only an immutable deployment boundary, never a registry's mutable
// registration/funding/target state or a successful retirement decision.
// Provider identity prevents sharing historical evidence between RPC sessions.
const creationBoundaries = new WeakMap<Provider, Map<string, CreationBoundary>>();
const same = (a: unknown, b: unknown) => String(a).toLowerCase() === String(b).toLowerCase();
function requireRetirement(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Winner-credit retirement: ${message}`);
}

/** Read-only migration gate. An empty sponsorship balance does not retire a
 * permissionlessly fundable destination: every old target must have closed.
 * Governance must also stop approving/registering new targets on the old ledger. */
export async function verifyRetiredRegistryTargets(provider: Provider, registryAddress: string, abi: InterfaceAbi, block: PinnedBlock, loadArtifact: ArtifactLoader = localRetirementArtifact) {
  requireRetirement(Number.isSafeInteger(block.number) && block.number >= 0 && Number.isSafeInteger(block.timestamp) && block.timestamp >= 0 && /^0x[0-9a-f]{64}$/i.test(block.hash), "a canonical block anchor is required.");
  const address = getAddress(registryAddress), at = { blockTag: block.number };
  async function anchor() {
    const current = await provider.getBlock(block.number);
    requireRetirement(current?.hash === block.hash && current.timestamp === block.timestamp, "the verification block was reorganized or changed.");
  }
  await anchor();
  const registry = new Contract(address, abi, provider), iface = new Interface(abi);
  const [registryCode, registeredCount, sponsorBalance] = await Promise.all([
    provider.getCode(address, block.number), registry.collectionCount(at), registry.totalSponsorBalance(at),
  ]);
  requireRetirement(registryCode !== "0x", "the previous registry has no code at the pinned block.");
  const codeHash = keccak256(registryCode), count = BigInt(registeredCount);
  requireRetirement(count >= 0n && count <= MAX_COLLECTIONS, "the registry collection count exceeds the bounded verification limit.");
  requireRetirement(sponsorBalance === 0n, "the previous registry still holds sponsorship funds.");

  // Immutable registries have code continuously from deployment. Discover the
  // boundary ourselves once, then revalidate its canonical block, exact runtime
  // and preceding absence before reuse. A reorg discards the cached boundary.
  let boundaries = creationBoundaries.get(provider);
  if (!boundaries) { boundaries = new Map(); creationBoundaries.set(provider, boundaries); }
  const boundaryKey = `${address}:${codeHash}`;
  let boundary = boundaries.get(boundaryKey);
  if (boundary) {
    const [birth, birthCode, precedingCode] = await Promise.all([
      provider.getBlock(boundary.number), provider.getCode(address, boundary.number),
      boundary.number === 0 ? Promise.resolve("0x") : provider.getCode(address, boundary.number - 1),
    ]);
    if (boundary.number > block.number || birth?.hash !== boundary.hash) {
      boundaries.delete(boundaryKey); boundary = undefined;
    } else requireRetirement(birthCode !== "0x" && keccak256(birthCode) === codeHash && precedingCode === "0x", "the cached registry creation boundary is inconsistent.");
  }
  if (!boundary) {
    let low = 0, high = block.number;
    while (low < high) {
      const middle = Math.floor((low + high) / 2), code = await provider.getCode(address, middle);
      if (code === "0x") low = middle + 1;
      else {
        requireRetirement(keccak256(code) === codeHash, "the registry runtime changed within its history.");
        high = middle;
      }
    }
    const [birth, birthCode, precedingCode] = await Promise.all([
      provider.getBlock(low), provider.getCode(address, low),
      low === 0 ? Promise.resolve("0x") : provider.getCode(address, low - 1),
    ]);
    requireRetirement(birth?.hash && /^0x[0-9a-f]{64}$/i.test(birth.hash) && birthCode !== "0x" && keccak256(birthCode) === codeHash && precedingCode === "0x", "the registry creation boundary is inconsistent.");
    boundary = { number: low, hash: birth.hash };
  }
  const creationBlock = boundary.number;
  const event = iface.getEvent("CollectionRegistered");
  requireRetirement(event, "the previous registry ABI has no collection registration event.");
  const registrations = new Map<string, { round: string; factory: string; roundId: bigint; sequence: bigint; registeredAt: bigint; rewardsOnly: boolean }>();
  const rounds = new Set<string>(), eventBlocks = new Map<number, string>();
  for (let fromBlock = creationBlock; fromBlock <= block.number; fromBlock += LOG_RANGE) {
    const toBlock = Math.min(fromBlock + LOG_RANGE - 1, block.number);
    const logs = await provider.getLogs({ address, topics: [event.topicHash], fromBlock, toBlock });
    for (const log of logs) {
      requireRetirement(!log.removed && same(log.address, address) && Number.isSafeInteger(log.blockNumber) && log.blockNumber >= fromBlock && log.blockNumber <= toBlock && /^0x[0-9a-f]{64}$/i.test(log.blockHash), "a registration log is outside the canonical requested range.");
      const eventBlockHash = eventBlocks.get(log.blockNumber);
      if (eventBlockHash) requireRetirement(eventBlockHash === log.blockHash, "registration logs disagree about their canonical block.");
      else {
        requireRetirement((await provider.getBlock(log.blockNumber))?.hash === log.blockHash, "a registration log is not canonical.");
        eventBlocks.set(log.blockNumber, log.blockHash);
      }
      const parsed = iface.parseLog(log);
      requireRetirement(parsed?.name === "CollectionRegistered", "an unexpected registration event was returned.");
      const args = parsed.args, sequence = BigInt(args.sequence), round = getAddress(args.round), factory = getAddress(args.factory);
      requireRetirement(sequence > 0n && sequence <= count && !registrations.has(String(sequence)) && !rounds.has(round), "registration sequences or collection addresses are duplicated or inconsistent.");
      registrations.set(String(sequence), { round, factory, roundId: BigInt(args.roundId), sequence, registeredAt: BigInt(args.registeredAt), rewardsOnly: args.rewardsOnly });
      rounds.add(round);
    }
  }
  requireRetirement(BigInt(registrations.size) === count, "registration history is incomplete; every collection must be verified.");
  let targetCount = 0;
  const factories = new Map<string, Contract>();
  for (let sequence = 1n; sequence <= count; sequence++) {
    const entry = registrations.get(String(sequence));
    requireRetirement(entry, "registration history has a missing sequence.");
    const [stored, code] = await Promise.all([registry.collections(entry.round, at), provider.getCode(entry.round, block.number)]);
    requireRetirement(same(stored.factory, entry.factory) && stored.roundId === entry.roundId && stored.sequence === sequence && stored.registeredAt === entry.registeredAt && stored.rewardsOnly === entry.rewardsOnly, "registration history differs from canonical registry storage.");
    requireRetirement(code !== "0x" && same(keccak256(code), stored.codeHash), "a registered collection runtime differs from its stored code hash.");
    let factory = factories.get(entry.factory);
    if (!factory) {
      const [approved, factoryCode] = await Promise.all([registry.approvedFactoryCodeHash(entry.factory, at), provider.getCode(entry.factory, block.number)]);
      requireRetirement(approved !== ZeroHash && factoryCode !== "0x" && same(keccak256(factoryCode), approved), "a registered factory differs from its canonical approved runtime.");
      factory = new Contract(entry.factory, FACTORY_ABI, provider); factories.set(entry.factory, factory);
    }
    requireRetirement(same(await factory.rounds(entry.roundId, at), entry.round), "a factory no longer binds the registered round ID to its collection.");
    if (entry.rewardsOnly) continue;
    targetCount++;
    const target = new Contract(entry.round, TARGET_ABI, provider);
    const [cancelled, deadline, minted, supply] = await Promise.all([target.cancelled(at), target.mintDeadline(at), target.totalMinted(at), target.maxSupply(at)]);
    requireRetirement(supply > 0n && minted <= supply && deadline > 0n, "a prior target has invalid immutable mint terms.");
    if (cancelled || BigInt(block.timestamp) >= deadline || minted >= supply) continue;
    let permanentlyRetired = false;
    if (minted === 0n) {
      try {
        await verifyRetiredUnactivatedV8Target(provider, entry.round, block, loadArtifact);
        permanentlyRetired = true;
      } catch { /* Unsupported owners or incomplete proof remain closed to migration. */ }
    }
    requireRetirement(permanentlyRetired, `target ${entry.round} can still mint; zero sponsorship does not retire it.`);
  }
  await anchor();
  // Only retain evidence after this complete read was anchored successfully.
  boundaries.set(boundaryKey, boundary);
  return { registryAddress: address, creationBlock, collectionCount: String(count), targetCount, blockNumber: block.number, blockHash: block.hash };
}
