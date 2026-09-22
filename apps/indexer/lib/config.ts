import { getAddress } from 'ethers';
import { ensure, type IndexerConfig } from './types.ts';

function integer(value: string | undefined, fallback: number, min: number, max: number): number {
  const result = value === undefined ? fallback : Number(value);
  ensure(Number.isSafeInteger(result) && result >= min && result <= max, 'invalid_configuration');
  return result;
}
export function readIndexerConfig(env: Record<string, string | undefined> = process.env): IndexerConfig {
  const chainId = integer(env.MANEKINEKO_CHAIN_ID, 11155111, 1, Number.MAX_SAFE_INTEGER);
  ensure(chainId === 1 || chainId === 11155111, 'unsupported_chain');
  const databaseUrl = env.DATABASE_URL ?? '';
  const rpcUrl = env.INDEXER_RPC_URL ?? '';
  const contractVersion = env.INDEXER_CONTRACT_VERSION ?? 'affiliate-v5';
  ensure(contractVersion === 'affiliate-v5' || contractVersion === 'affiliate-v6' || contractVersion === 'affiliate-v7' || (contractVersion === "affiliate-v8" || contractVersion === "affiliate-v9" || contractVersion === "affiliate-v10"), 'unsupported_contract_version');
  // V6 trust is independent: a V5 address/code hash must never be inherited.
  const factory = getAddress((contractVersion === "affiliate-v10" ? env.INDEXER_V10_TRUSTED_FACTORY : contractVersion === "affiliate-v9" ? env.INDEXER_V9_TRUSTED_FACTORY : contractVersion === "affiliate-v8" ? env.INDEXER_V8_TRUSTED_FACTORY : contractVersion === 'affiliate-v7' ? env.INDEXER_V7_TRUSTED_FACTORY : contractVersion === 'affiliate-v6' ? env.INDEXER_V6_TRUSTED_FACTORY : env.INDEXER_TRUSTED_FACTORY) ?? '').toLowerCase();
  const factoryCodeHash = ((contractVersion === "affiliate-v10" ? env.INDEXER_V10_TRUSTED_FACTORY_CODEHASH : contractVersion === "affiliate-v9" ? env.INDEXER_V9_TRUSTED_FACTORY_CODEHASH : contractVersion === "affiliate-v8" ? env.INDEXER_V8_TRUSTED_FACTORY_CODEHASH : contractVersion === 'affiliate-v7' ? env.INDEXER_V7_TRUSTED_FACTORY_CODEHASH : contractVersion === 'affiliate-v6' ? env.INDEXER_V6_TRUSTED_FACTORY_CODEHASH : env.INDEXER_TRUSTED_FACTORY_CODEHASH) ?? '').toLowerCase();
  ensure(/^postgres(ql)?:\/\//.test(databaseUrl) && /^https:\/\//.test(rpcUrl)
    && /^0x[0-9a-f]{64}$/.test(factoryCodeHash) && factory !== `0x${'0'.repeat(40)}`, 'invalid_configuration');
  return {
    databaseUrl, rpcUrl, chainId, factory, factoryCodeHash, contractVersion,
    confirmations: integer(env.INDEXER_CONFIRMATIONS, chainId === 1 ? 12 : 2, 1, 256),
    blockRange: integer(env.INDEXER_BLOCK_RANGE, 500, 1, 2000),
    maxBatches: integer(env.INDEXER_MAX_BATCHES, 8, 1, 100),
    maxCollections: integer(env.INDEXER_MAX_COLLECTIONS, 10, 1, 100),
    timeBudgetMs: integer(env.INDEXER_TIME_BUDGET_MS, 45000, 1000, 240000),
    reconcileSeconds: integer(env.INDEXER_RECONCILE_SECONDS, 900, 60, 86400),
    leaseSeconds: 300,
  };
}

/** Explicit factory/version pins keep historical claims covered while new V10 seasons are added. */
export function readIndexerConfigs(env: Record<string, string | undefined> = process.env): IndexerConfig[] {
  if (!env.INDEXER_TRUSTED_FACTORIES_JSON) return [readIndexerConfig(env)];
  let parsed: unknown;
  try { parsed = JSON.parse(env.INDEXER_TRUSTED_FACTORIES_JSON); } catch { throw new Error('invalid_configuration'); }
  ensure(Array.isArray(parsed) && parsed.length >= 1 && parsed.length <= 8, 'invalid_configuration');
  const seen = new Set<string>();
  return parsed.map((pin: unknown) => {
    ensure(pin !== null && typeof pin === 'object' && !Array.isArray(pin), 'invalid_configuration');
    const entry = pin as Record<string, unknown>;
    ensure(Object.keys(entry).every(key => ['contractVersion', 'factory', 'factoryCodeHash'].includes(key))
      && typeof entry.contractVersion === 'string' && /^affiliate-v(?:[5-9]|10)$/.test(entry.contractVersion)
      && typeof entry.factory === 'string' && typeof entry.factoryCodeHash === 'string', 'invalid_configuration');
    const prefix = entry.contractVersion === 'affiliate-v5' ? 'INDEXER_TRUSTED_FACTORY' : `INDEXER_V${entry.contractVersion.slice("affiliate-v".length)}_TRUSTED_FACTORY`;
    const config = readIndexerConfig({ ...env, INDEXER_CONTRACT_VERSION: entry.contractVersion, [prefix]: entry.factory, [`${prefix}_CODEHASH`]: entry.factoryCodeHash });
    ensure(!seen.has(config.factory), 'invalid_configuration'); seen.add(config.factory);
    return config;
  });
}
