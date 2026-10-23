/** Offline, allowlisted source packet for independent review. Never includes env files or private journals. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.argv[2];
if (!output) throw new Error('Usage: audit-bundle.mjs NEW_OUTPUT_DIRECTORY; compile contracts first.');
const destination = resolve(output);
await mkdir(destination, { recursive: false }); // Never replace a previously reviewed packet.
const names = ['ManekinekoRoundV12', 'ManekinekoRoundDeployerV12', 'ManekinekoVotingV12', 'ManekinekoSeasonControllerV12', 'ManekinekoWinnerCreditsV8', 'ManekinekoRendererV11'];
const files = new Set([
  'package.json', 'package-lock.json', 'apps/contracts/package.json', 'apps/contracts/hardhat.config.ts',
  'apps/contracts/contracts/ManekinekoV12Policy.sol', 'apps/contracts/test/ProtocolV12.ts',
  'apps/contracts/contracts/test/ProtocolV12BatchMocks.sol', 'apps/contracts/contracts/test/VRFCoordinatorV2Mock.sol',
  'apps/contracts/scripts/runtime-match.ts',
  'scripts/protocol-v12/executor.mts', 'scripts/protocol-v12/executor.test.mts',
  'scripts/protocol-v12/verify-deployment.mts', 'scripts/protocol-v12/verify-deployment.test.mts',
  'scripts/protocol-v12/prepare.mjs', 'scripts/protocol-v12/prepare.test.mjs',
  'scripts/protocol-v12/ops/tincta-executor@.service', 'scripts/protocol-v12/audit-bundle.mjs',
  'scripts/protocol-v12/rehearsal/plan.mts', 'scripts/protocol-v12/rehearsal/build.mts',
  'scripts/protocol-v12/rehearsal/engine.mts', 'scripts/protocol-v12/rehearsal/sepolia.mts',
  'scripts/protocol-v12/rehearsal/store.mts', 'scripts/protocol-v12/rehearsal/environment.example',
  'scripts/protocol-v12/rehearsal.test.mts', 'scripts/protocol-v12/ops/tincta-rehearsal.service',
  'scripts/season-runner/chain-transactions.ts', 'scripts/season-runner/chain-transactions.test.ts',
  'apps/contracts/scripts/deployment-journal.ts',
  'apps/contracts/test/ProtocolV12Rehearsal.ts', 'apps/contracts/contracts/test/V12RehearsalFunding.sol',
  'apps/launch/catalog/sepolia.json', 'docs/v12-two-season-rehearsal.md',
  'docs/deadline-governance-v12.md', 'docs/v12-draw-failure-policy-2026-10-22.md',
  'docs/v12-architecture-security-review-2026-10-22.md', 'docs/v12-mainnet-readiness-2026-10-22.md',
]);
for (const name of names) {
  const source = `apps/contracts/contracts/${name}.sol`, artifact = `apps/contracts/artifacts/contracts/${name}.sol/${name}.json`;
  const compiled = JSON.parse(await readFile(resolve(root, artifact), 'utf8'));
  files.add(source); files.add(artifact);
  // Standard JSON inputs contain exact transitive dependency sources and compiler settings.
  files.add(`apps/contracts/artifacts/build-info/${compiled.buildInfoId}.json`);
}
const manifest = [];
for (const file of [...files].sort()) {
  const data = await readFile(resolve(root, file));
  await mkdir(dirname(resolve(destination, file)), { recursive: true });
  await writeFile(resolve(destination, file), data, { flag: 'wx' });
  manifest.push({ path: file, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}
const index = JSON.stringify({ schemaVersion: 1, purpose: 'Independent review input; not an audit, deployment or Mainnet readiness certificate.', files: manifest }, null, 2) + '\n';
await writeFile(resolve(destination, 'manifest.json'), index, { flag: 'wx' });
console.log(JSON.stringify({ files: manifest.length, manifestSha256: createHash('sha256').update(index).digest('hex') }));
