import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { makePlan, PROFILE, assertSepolia, hash } from './rehearsal/plan.mts';
import { acceleratedInput } from './rehearsal/build.mts';
import { loadBundle } from './rehearsal/sepolia.mts';
import { createVault, readVault, privateRead, durable, exclusive } from './rehearsal/store.mts';

test('15-minute rehearsal preserves both fictional seasons and fixed economic/oracle safeguards', async () => {
  const catalog = JSON.parse(await readFile(new URL('../../apps/launch/catalog/sepolia.json', import.meta.url), 'utf8'));
  const plan = makePlan(catalog);
  assert.equal(plan.votingDuration, 900); assert.equal(plan.mintDuration, 900);
  assert.equal(plan.randomnessTimeout, 72 * 3600); assert.equal(plan.vrfConfirmations, 64);
  assert.equal(plan.collections.length, 20);
  assert.equal(plan.collections.filter(c => c.scenario === 'sellout').length, 18);
  assert.deepEqual(plan.collections.map(c => [c.seasonId, c.seasonName, c.name, c.color, c.textColor]), catalog.seasons.slice(0, 2).flatMap((s: any) => s.collections.map((c: any) => [s.seasonId, s.name, c.name, c.color, c.textColor])));
  assert(plan.options.every(o => o.duration === '900' && BigInt(o.price) >= 10n ** 16n && BigInt(o.supply) >= 1000n));
  for (const chain of [1, 31337, 8453]) assert.throws(() => assertSepolia(chain));
});

test('acceleration copies compiler input and fails closed when production source changes', () => {
  const controller = 'project/contracts/ManekinekoSeasonControllerV12.sol', voting = 'project/contracts/ManekinekoVotingV12.sol';
  const original = { sources: { [controller]: { content: 'constructor(Settings memory config, ManekinekoVotingV12.Terms[] memory candidates) { config.votingDuration < 1 hours' }, [voting]: { content: 't.duration < 1 hours' }, 'other.sol': { content: 'RANDOMNESS_TIMEOUT = 3 days' } }, settings: {} };
  const before = JSON.stringify(original), accelerated = acceleratedInput(original, 'funding helper');
  assert.equal(JSON.stringify(original), before);
  assert.match(accelerated.sources[controller].content, /block.chainid != 11155111/);
  assert.match(accelerated.sources[controller].content, /15 minutes/);
  assert.match(accelerated.sources[voting].content, /15 minutes/);
  assert.equal(accelerated.sources['other.sol'].content, original.sources['other.sol'].content);
  original.sources[voting].content = 'changed timing condition';
  assert.throws(() => acceleratedInput(original, ''), /no longer matches/);
});

test('frozen bundle rejects tampering; unrelated UI changes do not affect its hash', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'v12-frozen-'));
  try {
    const files: Record<string, string> = {};
    for (const [name, data] of Object.entries({ 'runner.mjs': '// standalone', 'artifacts.json': '{}', 'compiler-input.json': '{}', 'plan.json': JSON.stringify({ chainId: 11155111 }) })) {
      await writeFile(join(dir, name), data); files[name] = hash(data);
    }
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ profile: PROFILE, files }));
    const before = await loadBundle(dir);
    await writeFile(join(dir, 'unrelated-ui.tsx'), 'updated interface');
    assert.equal((await loadBundle(dir)).bundleHash, before.bundleHash);
    await writeFile(join(dir, 'runner.mjs'), '// tampered');
    await assert.rejects(loadBundle(dir), /Frozen runtime changed/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('encrypted cohort resumes exactly, rejects wrong keys, refuses overwrite and enforces private state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'v12-vault-')), path = join(dir, 'wallets.enc'), secret = randomBytes(32).toString('hex');
  try {
    const created = await createVault(path, secret), resumed = await readVault(path, secret), raw = await readFile(path, 'utf8');
    assert.deepEqual(resumed.map(w => w.address), created.map(w => w.address));
    assert(created.every(w => !raw.includes(w.privateKey)));
    await assert.rejects(readVault(path, randomBytes(32).toString('hex')), /authentication failed/);
    await assert.rejects(createVault(path, secret), /EEXIST/);
    await durable(join(dir, 'state.json'), { round: 2 });
    assert.equal(JSON.parse(await privateRead(join(dir, 'state.json'))).round, 2);
    await chmod(join(dir, 'state.json'), 0o644);
    await assert.rejects(privateRead(join(dir, 'state.json')), /private files/);
    const release = await exclusive(join(dir, 'run.lock'));
    await assert.rejects(exclusive(join(dir, 'run.lock')), /EEXIST/);
    await release();
  } finally { await rm(dir, { recursive: true, force: true }); }
});
