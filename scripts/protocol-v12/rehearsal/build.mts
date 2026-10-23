/** Creates a new self-contained runtime. Never edits production Solidity, artifacts or historical exports. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { hash, makePlan, PROFILE } from './plan.mts';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../../apps/contracts/package.json', import.meta.url));
const solc = require('solc') as { compile(input: string): string };
export function acceleratedInput(original: any, fundingSource: string) {
  const input = structuredClone(original);
  const change = (file: string, old: string, next: string) => {
    const content = input.sources[file]?.content;
    if (!content || content.split(old).length !== 2) throw new Error(`Rehearsal patch no longer matches ${file}; review the production change.`);
    input.sources[file].content = content.replace(old, next);
  };
  change('project/contracts/ManekinekoSeasonControllerV12.sol', 'config.votingDuration < 1 hours', 'config.votingDuration < 15 minutes');
  change('project/contracts/ManekinekoSeasonControllerV12.sol', 'constructor(Settings memory config, ManekinekoVotingV12.Terms[] memory candidates) {',
    'string public constant REHEARSAL_PROFILE = "sepolia-fast-v12-15m-15m";\n    constructor(Settings memory config, ManekinekoVotingV12.Terms[] memory candidates) {\n        if (block.chainid != 11155111) revert InvalidConfiguration();');
  change('project/contracts/ManekinekoVotingV12.sol', 't.duration < 1 hours', 't.duration < 15 minutes');
  input.sources['project/contracts/test/V12RehearsalFunding.sol'] = { content: fundingSource };
  input.settings.outputSelection = { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.deployedBytecode.immutableReferences'], '': ['ast'] } };
  return input;
}
export async function buildRehearsal(destination: string) {
  await mkdir(destination, { recursive: false });
  const production = JSON.parse(await readFile(resolve(root, 'apps/contracts/artifacts/contracts/ManekinekoSeasonControllerV12.sol/ManekinekoSeasonControllerV12.json'), 'utf8'));
  const buildInfo = JSON.parse(await readFile(resolve(root, `apps/contracts/artifacts/build-info/${production.buildInfoId}.json`), 'utf8'));
  const input = acceleratedInput(buildInfo.input, await readFile(resolve(root, 'apps/contracts/contracts/test/V12RehearsalFunding.sol'), 'utf8'));
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors?.some((e: any) => e.severity === 'error')) throw new Error(output.errors.filter((e: any) => e.severity === 'error').map((e: any) => e.formattedMessage).join('\n'));
  const immutableNames: Record<string, string> = {};
  const visit = (o: any) => { if (!o || typeof o !== 'object') return; if (o.nodeType === 'VariableDeclaration' && o.mutability === 'immutable') immutableNames[o.id] = o.name; Object.values(o).forEach(v => Array.isArray(v) ? v.forEach(visit) : visit(v)); };
  Object.values(output.sources).forEach((s: any) => visit(s.ast));
  const names = ['ManekinekoSeasonControllerV12', 'ManekinekoVotingV12', 'ManekinekoRendererV11', 'ManekinekoWinnerCreditsV8', 'ManekinekoRoundDeployerV12', 'ManekinekoRoundV12', 'V12RehearsalFunding'];
  const artifacts: Record<string, any> = {};
  for (const name of names) {
    const source = `project/contracts/${name === 'V12RehearsalFunding' ? 'test/' : ''}${name}.sol`, c = output.contracts[source][name];
    if (c.evm.deployedBytecode.object.length / 2 > 24576 || c.evm.bytecode.object.length / 2 > 49152) throw new Error(`${name} exceeds Ethereum deployment limits.`);
    artifacts[name] = { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object, deployedBytecode: '0x' + c.evm.deployedBytecode.object,
      immutableReferences: c.evm.deployedBytecode.immutableReferences, immutableNames, buildInfoId: hash(JSON.stringify(input)) };
  }
  const plan = makePlan(JSON.parse(await readFile(resolve(root, 'apps/launch/catalog/sepolia.json'), 'utf8')));
  for (const [name, data] of Object.entries({ 'artifacts.json': artifacts, 'plan.json': plan, 'compiler-input.json': input }))
    await writeFile(resolve(destination, name), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
  await build({ entryPoints: [resolve(root, 'scripts/protocol-v12/rehearsal/sepolia.mts')], outfile: resolve(destination, 'runner.mjs'), bundle: true, platform: 'node', target: 'node22', format: 'esm',
    banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' }, legalComments: 'inline' });
  const files: Record<string, string> = {};
  for (const name of ['runner.mjs', 'artifacts.json', 'plan.json', 'compiler-input.json']) files[name] = hash(await readFile(resolve(destination, name)));
  await writeFile(resolve(destination, 'manifest.json'), JSON.stringify({ profile: PROFILE, files }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ profile: PROFILE, collections: plan.collections.length, seasons: 2, runtime: destination, manifestHash: hash(await readFile(resolve(destination, 'manifest.json'))) }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const destination = process.argv[2]; if (!destination) throw new Error('Usage: build.mts NEW_RUNTIME_DIRECTORY');
  await mkdir(dirname(resolve(destination)), { recursive: true });
  await buildRehearsal(resolve(destination));
}
