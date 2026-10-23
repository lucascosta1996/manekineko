/** Read-only full-graph verification. A matching controller hash alone is not a release certificate. */
import { Contract, JsonRpcProvider, getAddress, getBytes, hexlify, keccak256, toBeHex, toUtf8Bytes, zeroPadBytes, zeroPadValue, type Provider } from 'ethers';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { matchesRuntime } from '../../apps/contracts/scripts/runtime-match.ts';

type Artifact = { abi: any[]; bytecode: string; deployedBytecode: string; immutableReferences: Record<string, { start: number; length: number }[]>; buildInfoId: string };
export type Compiled = Artifact & { immutableNames: Record<string, string> };
export type DeploymentExpectation = {
  chainId: number; controller: string; controllerCodeHash: string; operator: string;
  credits: string; previousRegistry: string; legacyMerkleRoot: string;
  settings: { coordinator: string; keyHash: string; confirmations: number; callbackGas: number; votingDuration: number; votingDelay: number; randomnessBudget: string; sponsorshipBudget: string; bootstrapAllowed: boolean };
  catalog: { seasonId: string; seasonName: string; name: string; symbol: string; color: string; textColor: string }[];
  options: { supply: string; price: string; winners: string; duration: string }[];
  creditsDeploymentTx: string;
};
export type Verification = { status: 'verified'; chainId: number; block: number; blockHash: string; controller: string; buildHash: string; deploymentHash: string; preparedCollections: number; catalogHash: string; contracts: { name: string; address: string; codeHash: string }[] };
const root = new URL('../../apps/contracts/', import.meta.url);
function ensure(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const hashObject = (value: unknown) => keccak256(toUtf8Bytes(JSON.stringify(value)));
export function verifyVrfSettings(chainId: number, settings: DeploymentExpectation['settings']) {
  const pins: Record<number, [string, string]> = {
    1: ['0xD7f86b4b8Cae7D942340FF628F82735b7a20893a', '0x8077df514608a09f83e4e8d300645594e5d7234665448ba83f51a50f842bd3d9'],
    11155111: ['0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B', '0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae'],
  };
  ensure([1, 11155111, 31337].includes(chainId), 'Unsupported VRF network.');
  if (pins[chainId]) ensure(same(settings.coordinator, pins[chainId][0]) && same(settings.keyHash, pins[chainId][1]), 'VRF coordinator or lane differs from the release.');
  ensure(Number.isInteger(settings.confirmations) && settings.confirmations >= 64 && settings.confirmations <= 200 &&
    Number.isInteger(settings.callbackGas) && settings.callbackGas >= 100_000 && settings.callbackGas <= 2_500_000, 'Invalid VRF confirmation or callback policy.');
}
export async function compiled(name: string): Promise<Compiled> {
  const artifact: Artifact = JSON.parse(await readFile(new URL(`artifacts/contracts/${name}.sol/${name}.json`, root), 'utf8'));
  const build = JSON.parse(await readFile(new URL(`artifacts/build-info/${artifact.buildInfoId}.output.json`, root), 'utf8'));
  const immutableNames: Record<string, string> = {};
  function walk(node: any) {
    if (!node || typeof node !== 'object') return;
    if (node.nodeType === 'VariableDeclaration' && node.mutability === 'immutable') immutableNames[String(node.id)] = node.name;
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
  }
  for (const source of Object.values(build.output.sources) as any[]) walk(source.ast);
  return { ...artifact, immutableNames };
}
export function verifyRuntime(code: string, artifact: Compiled, values: Record<string, string | bigint | boolean>) {
  ensure(matchesRuntime(code, artifact), 'Executable runtime differs from the compiled release.');
  const bytes = getBytes(code);
  for (const [id, refs] of Object.entries(artifact.immutableReferences ?? {})) {
    const name = artifact.immutableNames[id], value = values[name];
    ensure(value !== undefined, `Unverified immutable: ${name ?? id}`);
    const encoded = typeof value === 'boolean' ? zeroPadValue(toBeHex(value ? 1 : 0), 32)
      : typeof value === 'bigint' ? zeroPadValue(toBeHex(value), 32)
      : name === 'backgroundHex' ? zeroPadBytes(hexlify(toUtf8Bytes(value)), 32) : zeroPadValue(value, 32);
    for (const ref of refs) ensure(same(hexlify(bytes.slice(ref.start, ref.start + ref.length)), encoded), `Immutable mismatch: ${name}`);
  }
}

export async function verifyDeployment(provider: Provider, expected: DeploymentExpectation, confirmedAt?: number, loadArtifact = compiled): Promise<Verification> {
  ensure([1, 11155111, 31337].includes(expected.chainId), 'Unsupported deployment chain.');
  ensure(Number((await provider.getNetwork()).chainId) === expected.chainId, 'Deployment network mismatch.');
  const finalized = await provider.getBlock('finalized');
  ensure(finalized?.hash && Date.now() / 1000 - finalized.timestamp < 3600, 'Fresh finalized deployment state unavailable.');
  ensure(confirmedAt === undefined || (Number.isSafeInteger(confirmedAt) && confirmedAt >= 0 && confirmedAt <= finalized.number), 'Verification block is not finalized.');
  const block = confirmedAt === undefined ? finalized : await provider.getBlock(confirmedAt);
  ensure(block?.hash && Date.now() / 1000 - block.timestamp < 3600, 'Fresh common block unavailable.');
  for (const key of ['coordinator', 'keyHash', 'confirmations', 'callbackGas', 'votingDuration', 'votingDelay', 'randomnessBudget', 'sponsorshipBudget', 'bootstrapAllowed'])
    ensure(expected.settings[key as keyof typeof expected.settings] !== undefined, `Missing expected setting: ${key}`);
  verifyVrfSettings(expected.chainId, expected.settings);
  ensure(await provider.getCode(expected.settings.coordinator, block.number) !== '0x', 'VRF coordinator has no code.');
  for (const plan of expected.catalog) for (const key of ['seasonId', 'seasonName', 'name', 'symbol', 'color', 'textColor'] as const)
    ensure(typeof plan[key] === 'string' && plan[key].length > 0, `Missing expected catalog identity: ${key}`);
  for (const option of expected.options) for (const key of ['supply', 'price', 'winners', 'duration'] as const)
    ensure(typeof option[key] === 'string' && /^[1-9][0-9]*$/.test(option[key]), `Missing exact economic option: ${key}`);
  const at = { blockTag: block.number };
  const names = ['ManekinekoSeasonControllerV12', 'ManekinekoVotingV12', 'ManekinekoRendererV11', 'ManekinekoWinnerCreditsV8', 'ManekinekoRoundDeployerV12', 'ManekinekoRoundV12'];
  const artifacts = Object.fromEntries(await Promise.all(names.map(async n => [n, await loadArtifact(n)])));
  const contracts: Verification['contracts'] = [];
  async function check(name: string, address: string, values: Record<string, string | bigint | boolean>) {
    const code = await provider.getCode(address, block!.number);
    verifyRuntime(code, artifacts[name], values);
    contracts.push({ name, address: getAddress(address), codeHash: keccak256(code) });
    return new Contract(address, artifacts[name].abi, provider);
  }
  const c = new Contract(expected.controller, artifacts.ManekinekoSeasonControllerV12.abi, provider);
  ensure(same(keccak256(await provider.getCode(expected.controller, block.number)), expected.controllerCodeHash), 'Controller pin mismatch.');
  const [voting, renderer, credits, deployer, settings, sealed, count, catalogCount, optionCount] = await Promise.all([
    c.voting(at), c.renderer(at), c.credits(at), c.deployer(at), c.settings(at), c.catalogSealed(at), c.roundCount(at), c.catalogCount(at), c.optionCount(at),
  ]);
  ensure(sealed, 'Catalog must be sealed.');
  ensure(same(credits, expected.credits) && same(settings.operator, expected.operator) && same(settings.credits, credits), 'Operator or registry binding mismatch.');
  for (const [key, value] of Object.entries(expected.settings)) ensure(String(settings[key]).toLowerCase() === String(value).toLowerCase(), `Unexpected setting: ${key}`);
  await check('ManekinekoSeasonControllerV12', expected.controller, { operator: expected.operator, voting, renderer, credits });
  const v = await check('ManekinekoVotingV12', voting, { controller: expected.controller, bootstrapAllowed: expected.settings.bootstrapAllowed });
  await check('ManekinekoRendererV11', renderer, {});
  const registry = await check('ManekinekoWinnerCreditsV8', credits, { previousRegistry: expected.previousRegistry, legacyMerkleRoot: expected.legacyMerkleRoot });
  ensure(await registry.factoriesSealed(at), 'Reward factories are not sealed.');
  ensure(same(await registry.owner(at), expected.operator), 'Unexpected registry owner.');
  ensure(same(await registry.approvedFactoryCodeHash(expected.controller, at), expected.controllerCodeHash), 'Controller is not approved with the reviewed runtime.');
  // V12 Mainnet genesis has no historical mint destinations. Migrations must not silently pass this verifier.
  ensure(BigInt(expected.previousRegistry) === 0n && BigInt(expected.legacyMerkleRoot) === 0n && await v.legacySourceCount(at) === 0n,
    'Migration requires independently verified immutable retirement of every prior registry/factory; this genesis verifier refuses it.');
  const receipt = await provider.getTransactionReceipt(expected.creditsDeploymentTx);
  ensure(receipt?.status === 1 && receipt.contractAddress && same(receipt.contractAddress, credits) && receipt.blockNumber <= block.number, 'Registry creation receipt is not finalized.');
  ensure((await provider.getBlock(receipt.blockNumber))?.hash === receipt.blockHash, 'Registry creation receipt is not canonical.');
  const approved: string[] = [];
  for (let from = receipt.blockNumber; from <= block.number; from += 5000) {
    const logs = await provider.getLogs({ address: credits, fromBlock: from, toBlock: Math.min(from + 4999, block.number), topics: [registry.interface.getEvent('FactoryApproved')!.topicHash] });
    for (const log of logs) approved.push(getAddress(registry.interface.parseLog(log)!.args.factory));
  }
  ensure(approved.length === 1 && same(approved[0], expected.controller), 'Unreviewed reward factories are approved.');
  ensure(await registry.collectionCount(at) === count, 'Unexpected registered collections.');
  const d = new Contract(deployer, artifacts.ManekinekoRoundDeployerV12.abi, provider);
  const [part1, part2] = await Promise.all([d.codePart1(at), d.codePart2(at)]);
  const creation = getBytes(artifacts.ManekinekoRoundV12.bytecode), split = Math.floor(creation.length / 2);
  await check('ManekinekoRoundDeployerV12', deployer, { factory: expected.controller, codePart1: part1, codePart2: part2, firstLength: BigInt(split), secondLength: BigInt(creation.length - split) });
  for (const [address, data] of [[part1, creation.slice(0, split)], [part2, creation.slice(split)]] as [string, Uint8Array][]) {
    const code = await provider.getCode(address, block.number);
    ensure(code === '0x00' + hexlify(data).slice(2), 'Stored round creation code differs from the compiled release.');
    contracts.push({ name: 'ManekinekoV12CodePart', address, codeHash: keccak256(code) });
  }
  ensure(expected.catalog.length > 0 && expected.catalog.length <= 256 && catalogCount === BigInt(expected.catalog.length) && count <= catalogCount, 'Catalog length mismatch.');
  ensure(expected.options.length > 0 && optionCount === BigInt(expected.options.length), 'Economic option count mismatch.');
  for (let i = 0; i < expected.catalog.length; i++) {
    const actual = await c.collectionPlan(i, at);
    for (const [key, value] of Object.entries(expected.catalog[i])) ensure(actual[key] === value, `Catalog identity mismatch at ${i + 1}: ${key}`);
  }
  for (let i = 0; i < expected.options.length; i++) {
    const actual = await c.option(i, at);
    for (const [key, value] of Object.entries(expected.options[i])) ensure(actual[key] === BigInt(value), `Economic option mismatch: ${i}/${key}`);
  }
  for (let id = 1; id <= Number(count); id++) {
    const address = await c.rounds(id, at), r = new Contract(address, artifacts.ManekinekoRoundV12.abi, provider), plan = expected.catalog[id - 1];
    const [subscriptionId, ballot, phase, reserve, execution, closed] = await Promise.all([r.subscriptionId(at), v.ballots(address, at), r.phase(at), r.protectedBalance(at), r.executionReserve(at), r.subscriptionClosed(at)]);
    await check('ManekinekoRoundV12', address, { identityChainId: BigInt(expected.chainId), operator: expected.operator, voting, renderer,
      roundId: BigInt(id), seasonId: plan.seasonId, backgroundHex: plan.color, whiteText: plan.textColor === '#FFFFFF',
      vrfCoordinator: expected.settings.coordinator, keyHash: expected.settings.keyHash, subscriptionId,
      requestConfirmations: BigInt(expected.settings.confirmations), callbackGasLimit: BigInt(expected.settings.callbackGas), maxAffiliateSlots: 10n, saleStartAt: ballot.endsAt });
    ensure(await r.name(at) === plan.name && await r.symbol(at) === plan.symbol && await r.seasonName(at) === plan.seasonName, 'Prepared collection identity mismatch.');
    ensure(await provider.getBalance(address, block.number) >= reserve, 'Participant reserves are underfunded.');
    if (Number(phase) <= 4) ensure(execution >= 10n ** 16n, 'Execution reserve missing.');
    ensure(await registry.totalFunded(address, at) >= BigInt(expected.settings.sponsorshipBudget), 'Committed sponsorship was not funded.');
    ensure(await v.optionCount(address, at) === optionCount && ballot.sequence === BigInt(id), 'Prepared ballot binding mismatch.');
    for (let i = 0; i < expected.options.length; i++) {
      const actual = await v.option(address, i, at);
      for (const [key, value] of Object.entries(expected.options[i])) ensure(actual[key] === BigInt(value), 'Prepared ballot option mismatch.');
    }
    if (!closed) {
      const coordinator = new Contract(expected.settings.coordinator, ['function getSubscription(uint256) view returns (uint96 balance,uint96 nativeBalance,uint64 reqCount,address subOwner,address[] consumers)'], provider);
      const sub = await coordinator.getSubscription(subscriptionId, at);
      ensure(same(sub.subOwner, address) && sub.consumers.length === 1 && same(sub.consumers[0], address), 'VRF subscription authority mismatch.');
      if (Number(phase) <= 2) ensure(sub.nativeBalance >= BigInt(expected.settings.randomnessBudget), 'VRF funding below committed amount.');
    }
  }
  ensure((await provider.getBlock(block.number))?.hash === block.hash, 'Verified block changed during inspection.');
  return { status: 'verified', chainId: expected.chainId, block: block.number, blockHash: block.hash, controller: getAddress(expected.controller),
    buildHash: hashObject(names.map(name => [name, artifacts[name].bytecode, artifacts[name].deployedBytecode])), deploymentHash: hashObject(expected),
    preparedCollections: Number(count), catalogHash: hashObject(expected.catalog), contracts };
}

async function main() {
  const [manifestFile, output] = process.argv.slice(2);
  ensure(manifestFile && output, 'Usage: verify-deployment.mts expectation.json output.json; set V12_VERIFY_RPC_URL.');
  const expected = JSON.parse(await readFile(manifestFile, 'utf8'));
  ensure([1, 11155111].includes(expected.chainId), 'CLI accepts public networks only.');
  const urls = [process.env.V12_VERIFY_RPC_URL, process.env.V12_VERIFY_SECONDARY_RPC_URL];
  ensure(urls.every(Boolean) && new URL(urls[0]!).hostname !== new URL(urls[1]!).hostname, 'Use two independently operated RPC endpoints on distinct hosts.');
  const providers = urls.map(url => new JsonRpcProvider(url));
  try {
    const heads = await Promise.all(providers.map(p => p.getBlock('finalized')));
    ensure(heads.every(Boolean), 'Both finalized heads are required.');
    const block = Math.min(...heads.map(b => b!.number));
    const reports = await Promise.all(providers.map(p => verifyDeployment(p, expected, block)));
    ensure(JSON.stringify(reports[0]) === JSON.stringify(reports[1]), 'Independent RPC verification disagrees.');
    await writeFile(output, JSON.stringify({ ...reports[0], independentRpcAgreement: true }, null, 2) + '\n', { flag: 'wx', mode: 0o600, flush: true });
    console.log('Full deployment graph verified through two RPC endpoints at one finalized block. This is not independent audit or live-rehearsal evidence.');
  } finally { providers.forEach(p => p.destroy()); }
}
if (process.argv[1]?.match(/verify-deployment\.m[tj]s$/) && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Deployment verification failed. Do not enable Mainnet; inspect the expected manifest and dependencies.'); process.exitCode = 1; });
