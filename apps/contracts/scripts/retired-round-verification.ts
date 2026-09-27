import { readFile } from "node:fs/promises";
import { Contract, ZeroAddress, getAddress, getBytes, hexlify, keccak256, zeroPadValue } from "ethers";
import type { Provider } from "ethers";
import { matchesRuntime } from "./runtime-match.ts";

type PinnedBlock = { number: number; hash: string; timestamp: number };
const TARGET_ABI = ["function totalMinted() view returns(uint256)"];
export type RuntimeArtifact = { deployedBytecode: string; immutableReferences?: Record<string, { start: number; length: number }[]> };
export type ArtifactLoader = (name: string) => Promise<RuntimeArtifact>;
const RETIREMENT_OWNER = "ManekinekoRetiredRoundOwner";
// The Sepolia Aster deployment predates the renderer's Tincta branding. Its V8
// round source, compiler settings, executable runtime and immutable positions
// equal the current build; only this exact compiler metadata tail differs.
// Never strip arbitrary metadata or accept an operator-provided runtime hash.
const HISTORICAL_V8_TARGET = "0x1ff99e7a579c4df625e1f73d66cfebad4d0829bf";
const HISTORICAL_V8_METADATA = "a2646970667358221220e093fe5ec9173a3cc8614a504cd905810a774055846b46829687037235a6b55164736f6c63430008250033";
const HISTORICAL_V8_TEMPLATE_HASH = "0xf698828e1f0feb57b52cbcf91c8a96d43de7f19e531a7e051d4be0b602ead30f";
const RETIREMENT_ABI = [
  "function RETIREMENT_VERSION() view returns(string)",
  "function retiredRound() view returns(address)",
  "function recoveryRecipient() view returns(address)",
];
export async function localRetirementArtifact(name: string): Promise<RuntimeArtifact> {
  return JSON.parse(await readFile(new URL(`../artifacts/contracts/${name}.sol/${name}.json`, import.meta.url), "utf8"));
}
const same = (a: unknown, b: unknown) => String(a).toLowerCase() === String(b).toLowerCase();
function requireRetirement(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Winner-credit retirement: ${message}`);
}

/** Exact current build or the separately reviewed, address/chain-bound Aster
 * deployment template. The complete historical bytecode hash is pinned. */
export function matchesReviewedV8RetirementRuntime(code: string, artifact: RuntimeArtifact, targetAddress: string, chainId: bigint): boolean {
  if (matchesRuntime(code, artifact)) return true;
  if (chainId !== 11155111n || !same(targetAddress, HISTORICAL_V8_TARGET)) return false;
  const historical = { ...artifact, deployedBytecode: artifact.deployedBytecode.slice(0, -HISTORICAL_V8_METADATA.length) + HISTORICAL_V8_METADATA };
  return keccak256(historical.deployedBytecode) === HISTORICAL_V8_TEMPLATE_HASH && matchesRuntime(code, historical);
}

/** Exact reviewed custody proves that an unactivated V8 can never be activated.
 * Every occurrence of each immutable must agree: masking immutable slots alone
 * and trusting getters would permit inconsistent hidden call destinations. */
export async function verifyRetiredUnactivatedV8Target(provider: Provider, targetAddress: string, block: PinnedBlock, loadArtifact: ArtifactLoader = localRetirementArtifact) {
  requireRetirement(Number.isSafeInteger(block.number) && block.number >= 0 && Number.isSafeInteger(block.timestamp) && block.timestamp >= 0 && /^0x[0-9a-f]{64}$/i.test(block.hash), "a canonical block anchor is required.");
  async function anchor() {
    const current = await provider.getBlock(block.number);
    requireRetirement(current?.hash === block.hash && current.timestamp === block.timestamp, "the verification block was reorganized or changed.");
  }
  await anchor();
  const address = getAddress(targetAddress), at = { blockTag: block.number };
  const targetCode = await provider.getCode(address, block.number), targetArtifact = await loadArtifact("ManekinekoRoundV8");
  requireRetirement(matchesRuntime(targetCode, targetArtifact) || matchesReviewedV8RetirementRuntime(targetCode, targetArtifact, address, (await provider.getNetwork()).chainId), "retirement target differs from the reviewed V8 runtime.");
  const target = new Contract(address, [...TARGET_ABI, "function CONTRACT_VERSION() view returns(string)", "function saleActivated() view returns(bool)", "function owner() view returns(address)", "function pendingOwner() view returns(address)"], provider);
  const [version, activated, minted, owner, pending] = await Promise.all([target.CONTRACT_VERSION(at), target.saleActivated(at), target.totalMinted(at), target.owner(at), target.pendingOwner(at)]);
  requireRetirement(version === "affiliate-v8" && !activated && minted === 0n, "retirement custody requires a never-activated, zero-mint V8 target.");
  requireRetirement(owner !== ZeroAddress && pending === ZeroAddress, "retirement ownership must be accepted without a pending transfer.");
  const code = await provider.getCode(owner, block.number), artifact = await loadArtifact(RETIREMENT_OWNER);
  requireRetirement(matchesRuntime(code, artifact), "retirement owner differs from the reviewed compiled runtime.");
  const retirement = new Contract(owner, RETIREMENT_ABI, provider);
  const [marker, boundTarget, recipient] = await Promise.all([retirement.RETIREMENT_VERSION(at), retirement.retiredRound(at), retirement.recoveryRecipient(at)]);
  requireRetirement(marker === "unactivated-v8-retirement-v1" && same(boundTarget, address), "retirement owner marker or target binding differs.");
  requireRetirement(recipient !== ZeroAddress && !same(recipient, address) && !same(recipient, owner), "retirement recovery recipient is invalid.");
  const immutableGroups = Object.values(artifact.immutableReferences ?? {}), bytes = getBytes(code);
  const expected = new Set([zeroPadValue(address, 32).toLowerCase(), zeroPadValue(recipient, 32).toLowerCase()]);
  requireRetirement(immutableGroups.length === 2 && expected.size === 2, "retirement artifact must bind exactly the target and original owner.");
  for (const references of immutableGroups) {
    requireRetirement(references.length > 0, "retirement immutable references are missing.");
    let value: string | undefined;
    for (const { start, length } of references) {
      requireRetirement(length === 32, "retirement immutable has an unexpected width.");
      const current = hexlify(bytes.slice(start, start + length)).toLowerCase();
      requireRetirement(value === undefined || value === current, "retirement immutable values are inconsistent.");
      value = current;
    }
    requireRetirement(value && expected.delete(value), "retirement immutables differ from the target and original owner.");
  }
  requireRetirement(expected.size < 1, "retirement immutable bindings are incomplete.");
  await anchor();
  return { target: address, retirementOwner: getAddress(owner), recoveryRecipient: getAddress(recipient), codeHash: keccak256(code) };
}
