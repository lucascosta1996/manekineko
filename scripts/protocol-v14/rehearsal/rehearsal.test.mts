import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createVault, readVault, privateRead, exclusive } from './store.mts';
import { makePlan, validatePlan, RECOVERY, canonicalHash } from './plan.mts';
import { approvalFor, type State } from './engine.mts';
import { loadBundle, verifyFunding } from './sepolia.mts';
import { buildRehearsal } from './build.mts';
const expected = { genesis: "0x" + "7".repeat(40), genesisCodeHash: "0x" + "8".repeat(64), ...JSON.parse(await readFile(new URL('../../../docs/deployments/sepolia-v13-2026-10-25.json', import.meta.url), 'utf8')).expected };

test('fixed plan protects chain, destination, 30 ETH funding ceiling, gas and season boundary', () => {
  const plan = makePlan(expected); validatePlan(plan);
  assert.deepEqual(plan.genesis, {wallets:50,supply:1000,duration:86400,mintsPerWallet:1});
  assert.equal(plan.recovery, RECOVERY); assert.equal(plan.collections.length, 10);
  assert.equal(plan.collections.filter(c => c.scenario === 'sellout').length, 8);
  assert.equal(plan.collections.filter(c => c.scenario === 'unsold-refund').length, 2);
  assert.equal(plan.maximumFundingEth, '30'); assert.equal(plan.initialFundingEth, '20');
  for (const changed of [{ ...plan, recovery: expected.operator }, { ...plan, chainId: 1 }, { ...plan, maxGasEth: '100' }, { ...plan, collections: plan.collections.slice(0, 9) }])
    assert.throws(() => validatePlan(changed));
  assert.throws(() => makePlan({ ...expected, chainId: 1 }));
});

test('encrypted 51-account vault requires original key, private mode and exclusive ownership', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'v14-vault-'));
  try {
    const path = join(directory, 'vault.json'), key = 'a'.repeat(64);
    const wallets = await createVault(path, key);
    assert.equal(wallets.length, 51); assert.equal(new Set(wallets.map(w => w.address)).size, 51);
    const serialized = await privateRead(path); for (const wallet of wallets) assert.equal(serialized.includes(wallet.privateKey), false);
    assert.deepEqual((await readVault(path, key)).map(w => w.address), wallets.map(w => w.address));
    await assert.rejects(readVault(path, 'b'.repeat(64)), /authentication/);
    await assert.rejects(createVault(path, key));
    const vault = JSON.parse(serialized); vault.chainId = 1; await writeFile(path, JSON.stringify(vault));
    await assert.rejects(readVault(path, key), /authentication/);
    await writeFile(path, serialized); await chmod(path, 0o644);
    await assert.rejects(privateRead(path), /private files/);
    const release = await exclusive(join(directory, 'run.lock'));
    await assert.rejects(exclusive(join(directory, 'run.lock'))); await release();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('approval binds vault, operator baseline, existing first round and exact runtime', () => {
  const state = { version: 1, bundleHash: 'abc', planHash: canonicalHash(makePlan(expected)), operator: expected.operator, bank: RECOVERY,
    wallets: ['one'], recoveryCode: '0x', operatorBaseline: '500', startBlock: 123, adoptedRound: 'first', prepaidOperatingWei: '600', journals: {}, rounds: {}, approvalHash: '' } as State;
  const original = approvalFor(state);
  for (const changed of [{ ...state, bank: expected.operator }, { ...state, recoveryCode: '0xef0100' }, { ...state, operatorBaseline: '0' }, { ...state, adoptedRound: 'second' }, { ...state, bundleHash: 'changed' }, { ...state, wallets: ['two'] }])
    assert.notEqual(approvalFor(changed), original);
});

test('frozen bundle detects changed runner, artifacts and financial plan', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'v14-bundle-')), runtime = join(directory, 'runtime');
  try {
    const manifest = join(directory, 'deployment.json'); await writeFile(manifest, JSON.stringify({expected}));
    await buildRehearsal(runtime, manifest); const bundle = await loadBundle(runtime);
    assert.equal(bundle.plan.recovery, RECOVERY);
    for (const name of ['runner.mjs', 'artifacts.json', 'plan.json']) {
      const path = join(runtime, name), original = await readFile(path);
      await writeFile(path, Buffer.concat([original, Buffer.from(' ')])); await assert.rejects(loadBundle(runtime), /changed/); await writeFile(path, original);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test('funding proof rejects other senders, chains, excessive amounts and unfinalized receipts', async () => {
  const plan = makePlan(expected), bank = expected.controller, hash = '0x' + 'a'.repeat(64);
  const tx = { chainId: 11155111n, from: RECOVERY, to: bank, data: '0x', value: 20n * 10n ** 18n };
  const provider = (changes = {}, finalized = 123) => ({ getNetwork: async () => ({ chainId: 11155111n }),
    getTransaction: async () => ({ ...tx, ...changes }), getTransactionReceipt: async () => ({ status: 1, blockNumber: 123, blockHash: 'canonical' }),
    getBlock: async (tag: unknown) => ({ number: tag === 'finalized' ? finalized : 123, hash: 'canonical' }) }) as any;
  assert.equal((await verifyFunding([provider(), provider()], plan, bank, hash)).amount, String(tx.value));
  for (const changes of [{ from: expected.operator }, { to: RECOVERY }, { chainId: 1n }, { data: '0x1234' }, { value: 31n * 10n ** 18n }, { value: 19n * 10n ** 18n }])
    await assert.rejects(verifyFunding([provider(changes), provider()], plan, bank, hash), /Funding must/);
  await assert.rejects(verifyFunding([provider({}, 122), provider()], plan, bank, hash), /Funding must/);
  await assert.rejects(verifyFunding([provider(), provider({ value: 21n * 10n ** 18n })], plan, bank, hash), /Independent funding/);
});
