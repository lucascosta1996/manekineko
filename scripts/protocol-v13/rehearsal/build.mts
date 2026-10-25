import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { compiled } from '../verify-deployment.mts';
import { hash, makePlan, PROFILE } from './plan.mts';
const root = fileURLToPath(new URL('../../../', import.meta.url));
export async function buildRehearsal(destination: string, manifestPath = resolve(root, 'docs/deployments/sepolia-v13-2026-10-25.json')) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')), plan = makePlan(manifest.expected);
  await mkdir(destination, { recursive: false });
  const names = ['ManekinekoSeasonControllerV13', 'ManekinekoRoundV13', 'ManekinekoHolderRewardsV13', 'ManekinekoRoundDeployerV13', 'ManekinekoVotingV12', 'ManekinekoRendererV11', 'ManekinekoWinnerCreditsV9'];
  const artifacts = Object.fromEntries(await Promise.all(names.map(async name => [name, await compiled(name)])));
  const helper = JSON.parse(await readFile(resolve(root, 'apps/contracts/artifacts/contracts/test/V12RehearsalFunding.sol/V12RehearsalFunding.json'), 'utf8'));
  artifacts.V12RehearsalFunding = { ...helper, immutableNames: {} };
  for (const [name, data] of Object.entries({ 'artifacts.json': artifacts, 'plan.json': plan }))
    await writeFile(resolve(destination, name), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
  await build({ entryPoints: [resolve(root, 'scripts/protocol-v13/rehearsal/sepolia.mts')], outfile: resolve(destination, 'runner.mjs'), bundle: true, platform: 'node', target: 'node22', format: 'esm',
    banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' }, legalComments: 'inline' });
  const files: Record<string, string> = {};
  for (const name of ['runner.mjs', 'artifacts.json', 'plan.json']) files[name] = hash(await readFile(resolve(destination, name)));
  await writeFile(resolve(destination, 'manifest.json'), JSON.stringify({ profile: PROFILE, files }, null, 2) + '\n', { flag: 'wx' });
  return { runtime: destination, manifestHash: hash(await readFile(resolve(destination, 'manifest.json'))), collections: 10, wallets: 50, recovery: plan.recovery };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const destination = process.argv[2]; if (!destination) throw new Error('Usage: build.mts NEW_RUNTIME_DIRECTORY');
  await mkdir(dirname(resolve(destination)), { recursive: true });
  console.log(JSON.stringify(await buildRehearsal(resolve(destination))));
}
