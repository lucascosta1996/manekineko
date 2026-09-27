import { Contract, ZeroAddress, getAddress } from "ethers";
import type { InterfaceAbi, Provider } from "ethers";
import { matchesRuntime } from "../../apps/contracts/scripts/runtime-match.ts";
import { verifyRetiredRegistryTargets } from "../winner-credit-retirement.ts";

type Block = { number: number; hash: string; timestamp: number };
type Artifact = { abi: InterfaceAbi; deployedBytecode: string; immutableReferences?: Record<string, { start: number; length: number }[]> };
const LINEAGE_ABI = [
  "function WINNER_CREDITS_VERSION() view returns(string)",
  "function previousRegistry() view returns(address)",
  "function legacyMerkleRoot() view returns(bytes32)",
];
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Winner-credit lineage: ${message}`);
}

/** Call after verifying the current V6 runtime and its canonical code-hash pin.
 * That pin binds its predecessor and root, but cannot freeze registrations on
 * older ledgers. Recheck their retirement before writes, including on resume. */
export function createV10CreditLineageVerifier(provider: Provider, registryAddress: string, loadArtifact: (name: string) => Promise<Artifact>) {
  const current = new Contract(getAddress(registryAddress), LINEAGE_ABI, provider);
  let cached: Block | undefined;
  return async function verify(block: Block): Promise<void> {
    check(Number.isSafeInteger(block.number) && block.number >= 0 && Number.isSafeInteger(block.timestamp) && block.timestamp >= 0 && /^0x[0-9a-f]{64}$/i.test(block.hash), "a canonical block anchor is required.");
    async function anchor() {
      const canonical = await provider.getBlock(block.number);
      check(canonical?.hash === block.hash && canonical.timestamp === block.timestamp, "the verification block was reorganized or changed.");
    }
    await anchor();
    // Keep only the most recently verified canonical block, never a time-based
    // or process-lifetime approval of mutable predecessor registries.
    if (cached?.number === block.number && cached.hash === block.hash && cached.timestamp === block.timestamp) return;
    cached = undefined;
    const at = { blockTag: block.number };
    const [currentVersion, currentRoot, currentPrevious] = await Promise.all([current.WINNER_CREDITS_VERSION(at), current.legacyMerkleRoot(at), current.previousRegistry(at)]);
    check(currentVersion === "winner-credits-v6", "the current registry must be V6.");
    const root = String(currentRoot).toLowerCase();
    let address = getAddress(currentPrevious), upperVersion = 6;
    const seen = new Set<string>();
    const registries: { address: string; artifact: Artifact }[] = [];
    while (address !== ZeroAddress) {
      check(!seen.has(address) && seen.size < 4, "the predecessor lineage is cyclic or too deep.");
      seen.add(address);
      const prior = new Contract(address, LINEAGE_ABI, provider);
      const [marker, code, priorRoot] = await Promise.all([prior.WINNER_CREDITS_VERSION(at), provider.getCode(address, block.number), prior.legacyMerkleRoot(at)]);
      const version = Number(/^winner-credits-v([2-5])$/.exec(marker)?.[1]);
      check(version >= 2 && version < upperVersion, "predecessor versions must strictly descend from V5 through V2.");
      const artifact = await loadArtifact(version === 2 ? "ManekinekoWinnerCredits" : `ManekinekoWinnerCreditsV${version}`);
      check(matchesRuntime(code, artifact), "a predecessor runtime differs from its reviewed compiled build.");
      check(String(priorRoot).toLowerCase() === root, "all predecessor ledgers must preserve the current historical winner root.");
      registries.push({ address, artifact });
      upperVersion = version;
      address = version === 2 ? ZeroAddress : getAddress(await prior.previousRegistry(at));
    }
    // Every ledger is independently checked at the same pinned block. The shared
    // provider limits wire requests; concurrency removes serial RTTs, not checks.
    await Promise.all(registries.map(({ address, artifact }) => verifyRetiredRegistryTargets(provider, address, artifact.abi, block, loadArtifact)));
    await anchor();
    cached = { ...block };
  };
}
