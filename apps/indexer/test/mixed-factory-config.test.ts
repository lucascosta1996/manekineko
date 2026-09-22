import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readIndexerConfigs } from '../lib/config.ts';
const env = { DATABASE_URL: 'postgres://localhost/test', INDEXER_RPC_URL: 'https://rpc.example.test', MANEKINEKO_CHAIN_ID: '11155111' };
const older = { contractVersion: 'affiliate-v8', factory: `0x${'11'.repeat(20)}`, factoryCodeHash: `0x${'aa'.repeat(32)}` };
const current = { contractVersion: 'affiliate-v9', factory: `0x${'22'.repeat(20)}`, factoryCodeHash: `0x${'bb'.repeat(32)}` };
const permanent = { contractVersion: 'affiliate-v10', factory: `0x${'33'.repeat(20)}`, factoryCodeHash: `0x${'cc'.repeat(32)}` };
test('mixed V8, V9 and V10 indexing retains independent exact factory/version/hash pins', () => {
  const configs = readIndexerConfigs({ ...env, INDEXER_TRUSTED_FACTORIES_JSON: JSON.stringify([older, current, permanent]) });
  assert.deepEqual(configs.map(({ contractVersion, factory, factoryCodeHash }) => ({ contractVersion, factory, factoryCodeHash })), [older, current, permanent]);
  assert.equal(configs[0].chainId, 11155111); assert.equal(configs[1].chainId, 11155111);
});
test('mixed indexing fails closed on duplicate factories, missing pins, unsupported versions and cross-chain overrides', () => {
  for (const pins of [[older, older], [{ ...current, factoryCodeHash: undefined }], [{ ...current, contractVersion: 'affiliate-v11' }], [{ ...current, chainId: 1 }], [], Array(9).fill(current)])
    assert.throws(() => readIndexerConfigs({ ...env, INDEXER_TRUSTED_FACTORIES_JSON: JSON.stringify(pins) }));
});
test('legacy single-factory configuration remains supported without fallback across versions', () => {
  const configs = readIndexerConfigs({ ...env, INDEXER_CONTRACT_VERSION: 'affiliate-v8', INDEXER_V8_TRUSTED_FACTORY: older.factory, INDEXER_V8_TRUSTED_FACTORY_CODEHASH: older.factoryCodeHash });
  assert.equal(configs.length, 1); assert.equal(configs[0].contractVersion, 'affiliate-v8');
  assert.throws(() => readIndexerConfigs({ ...env, INDEXER_CONTRACT_VERSION: 'affiliate-v9', INDEXER_V8_TRUSTED_FACTORY: older.factory, INDEXER_V8_TRUSTED_FACTORY_CODEHASH: older.factoryCodeHash }));
});
