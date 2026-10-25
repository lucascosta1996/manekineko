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
import { rehearsalProvider, retryableRpcError } from './rpc.mts';
import { createServer } from 'node:http';
const expected = { genesis: "0x" + "7".repeat(40), genesisCodeHash: "0x" + "8".repeat(64), ...JSON.parse(await readFile(new URL('../../../docs/deployments/sepolia-v13-2026-10-25.json', import.meta.url), 'utf8')).expected };

test('51 concurrent wallet reads stay below a 50-request-per-second RPC quota', async () => {
  const arrivals: number[] = []; let maxBatch = 0, quotaErrors = 0;
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const input = JSON.parse(body), batch = Array.isArray(input) ? input : [input];
    maxBatch = Math.max(maxBatch, batch.length);
    const replies = batch.map(call => {
      const now = Date.now(); arrivals.push(now);
      const limited = arrivals.filter(at => now - at < 1000).length > 50;
      if (limited) quotaErrors++;
      return { jsonrpc: '2.0', id: call.id, ...(limited ? {error:{code:-32007,message:'50/second request limit reached'}} : {result:call.method === 'eth_chainId' ? '0xaa36a7' : '0x0'}) };
    });
    res.setHeader('content-type','application/json'); res.end(JSON.stringify(Array.isArray(input) ? replies : replies[0]));
  });
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const provider = rehearsalProvider(`http://127.0.0.1:${(server.address() as {port:number}).port}`);
  try {
    const balances = await Promise.all(Array.from({length:51},(_,i)=>provider.getBalance(`0x${(i+1).toString(16).padStart(40,'0')}`)));
    assert.equal(balances.length,51); assert.ok(balances.every(n=>n===0n));
    assert.ok(maxBatch<=10); assert.equal(quotaErrors,0);
    assert.equal(retryableRpcError({code:'CALL_EXCEPTION',info:{error:{code:-32007,message:'50/second request limit reached'}}}),true);
    assert.equal(retryableRpcError({code:'CALL_EXCEPTION',info:{error:{code:3,message:'execution reverted'}}}),false);
  } finally { provider.destroy(); await new Promise<void>(resolve=>server.close(()=>resolve())); }
});

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
