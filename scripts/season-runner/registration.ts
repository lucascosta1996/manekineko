import { createHash } from "node:crypto";
import { getAddress, type JsonRpcProvider } from "ethers";
import type pg from "pg";
import type { LaunchPayload } from "../../apps/launch/lib/launch-config.ts";
import { seasonVersionPolicy, type SeasonContractVersion } from "./version.ts";
import { executeIndexerCycle } from "../../apps/indexer/lib/indexer.ts";
import { readIndexerConfig } from "../../apps/indexer/lib/config.ts";
import { RpcChainReader } from "../../apps/indexer/lib/chain.ts";
import { PostgresIndexerStore } from "../../apps/indexer/lib/store.ts";
import type { ChainDeployment } from "./chain.ts";

const same = (a: unknown, b: unknown) => String(a).toLowerCase() === String(b).toLowerCase();
const lower = (value: string) => getAddress(value).toLowerCase();
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const iso = (value: string | number) => {
  const number = Number(value);
  check(Number.isSafeInteger(number) && number > 0 && number < 8_640_000_000_000, "Invalid verified deployment timestamp");
  return new Date(number * 1000).toISOString();
};

/** Same historical namespace as sync-staging-collection; the chain is part of
 * identity, while a season rename/network view switch never rewrites it. */
export function seasonFactorySeriesId(chainId: 1 | 11155111, factory: string): string {
  check(chainId === 1 || chainId === 11155111, "Unsupported collection network");
  const digest = createHash("sha256").update(`manekineko:${chainId}:${lower(factory)}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

/** Register only a receipt/runtime/immutable-verified chain adapter result.
 * This owns catalog admission, not chain snapshots: the indexer owns those.
 * A retry compares every immutable column and never overwrites prior records. */
export async function registerVerifiedCollection(pool: pg.Pool, stepId: string, deployment: ChainDeployment, payload: LaunchPayload, chainId: 1 | 11155111, createdTimestamp: number) {
  check(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stepId), "A stable collection step UUID is required");
  check(chainId === 1 || chainId === 11155111, "Unsupported collection network");
  const policy = seasonVersionPolicy(payload.contract.algorithmVersion === "unique-rank-v6" ? "affiliate-v10" : "affiliate-v9");
  check(payload.contract.chainId === String(chainId) && payload.contract.algorithmVersion === policy.algorithmVersion && payload.contract.maxMintsPerWallet === "20", "Only same-network frozen V9/V10 terms may be registered");
  check(Number.isSafeInteger(deployment.deploymentBlock) && deployment.deploymentBlock > 0 && /^0x[0-9a-fA-F]{64}$/.test(deployment.deploymentBlockHash) && /^0x[0-9a-fA-F]{64}$/.test(deployment.deploymentTransactionHash), "Verified canonical deployment evidence is required");
  for (const hash of [deployment.factoryCodeHash, deployment.roundCodeHash]) check(/^0x[0-9a-fA-F]{64}$/.test(hash), "Verified runtime hashes are required");
  const c = deployment.config;
  const expected = { ...policy.parseConfig(payload.contract, BigInt(chainId), BigInt(createdTimestamp)).config, roundId: BigInt(deployment.roundId), affiliateEligibility: getAddress(payload.operations.affiliateEligibilityAddress ?? "") };
  check(BigInt(deployment.roundId) > 0n && same(c.roundId, deployment.roundId), "Invalid verified factory round ID");
  check(Object.keys(c).length === Object.keys(expected).length, "Verified constructor has unexpected fields");
  for (const [key, value] of Object.entries(expected)) check(["name", "symbol", "seasonName"].includes(key) ? c[key] === value : same(c[key], value), `Verified constructor differs from frozen ${key}`);
  if (payload.operations.factoryMode === "existing") check(same(deployment.factory, payload.operations.factoryAddress), "Verified factory differs from the frozen configuration");
  const factory = lower(deployment.factory), round = lower(deployment.round), owner = lower(c.initialOwner);
  check(factory !== round && ![factory, round, owner].includes(`0x${"0".repeat(40)}`), "Invalid verified deployment addresses");
  const seriesId = seasonFactorySeriesId(chainId, factory);
  const deployedAt = iso(createdTimestamp), saleStartAt = iso(c.saleStartAt), mintDeadline = iso(c.mintDeadline);
  const collectionValues: Record<string, unknown> = {
    id: stepId, series_id: seriesId, chain_id: chainId, round_id: c.roundId,
    slug: `${chainId === 1 ? "ethereum" : "sepolia"}-${stepId}`,
    name: c.name, symbol: c.symbol,
    description: `A Tincta collection on ${chainId === 1 ? "Ethereum Mainnet" : "Ethereum Sepolia"} with on-chain artwork and verifiable Chainlink VRF randomness.`,
    max_supply: c.maxSupply, mint_price_wei: c.mintPrice, mint_duration_seconds: payload.contract.mintDurationSeconds,
    reveal_delay_blocks: null, algorithm_version: policy.algorithmVersion, randomness_provider: "chainlink-vrf-v2.5", contract_version: policy.contractVersion,
    prize_bps: c.prizeBps, affiliate_pool_bps: c.affiliatePoolBps, created_at: deployedAt,
    season_id: c.seasonId, season_name: c.seasonName, collection_color: c.collectionColor, text_color: c.textColor,
    second_prize_bps: null, min_affiliate_referrals: c.minAffiliateReferrals, affiliate_payout_cap_bps: c.affiliatePayoutCapBps,
    sale_start_at: saleStartAt, winner_count: c.winnerCount,
  };
  const deploymentValues: Record<string, unknown> = { collection_id: stepId, chain_id: chainId, status: "deployed", contract_address: round, factory_address: factory, owner_address: owner, transaction_hash: deployment.deploymentTransactionHash.toLowerCase(), deployment_block: deployment.deploymentBlock, mint_deadline: mintDeadline, deployed_at: deployedAt };
  const programValues: Record<string, unknown> = { collection_id: stepId, mode: "live", contract_version: policy.contractVersion, max_slots: c.maxAffiliateSlots, commission_bps: null, enrollment_enabled: false, enrollment_signer: lower(c.enrollmentSigner), affiliate_rates_bps: [] };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`season-collection:${stepId}`]);
    const existing = (await client.query("SELECT id FROM manekineko_collections WHERE id=$1 FOR UPDATE", [stepId])).rows.length > 0;
    await client.query("INSERT INTO manekineko_networks(chain_id,name,currency_symbol,currency_decimals,explorer_url) VALUES($1,$2,'ETH',18,$3) ON CONFLICT(chain_id) DO NOTHING", [chainId, chainId === 1 ? "Ethereum Mainnet" : "Ethereum Sepolia", chainId === 1 ? "https://etherscan.io" : "https://sepolia.etherscan.io"]);
    await client.query("INSERT INTO manekineko_series(id,name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING", [seriesId, `Tincta ${chainId === 1 ? "Mainnet" : "Sepolia"}`]);
    for (const [table, values, primary] of [["manekineko_collections", collectionValues, "id"], ["manekineko_deployments", deploymentValues, "collection_id"], ["manekineko_affiliate_programs", programValues, "collection_id"]] as const) {
      // Table/column names are local constants; all data is parameterized.
      const columns = Object.keys(values);
      await client.query(`INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map((_, i) => `$${i + 1}`).join(",")}) ON CONFLICT(${primary}) DO NOTHING`, Object.values(values));
      const stored = (await client.query(`SELECT * FROM ${table} WHERE ${primary}=$1 FOR UPDATE`, [stepId])).rows[0];
      check(stored, "Collection registration was not persisted");
      for (const [key, expectedValue] of Object.entries(values)) {
        // A resumed run preserves a separately enabled admission gate. Public
        // descriptive copy/slugs are not immutable protocol terms.
        if (["enrollment_enabled", "description", "slug"].includes(key)) continue;
        const actual = stored[key];
        const matches = expectedValue === null ? actual === null
          : ["created_at", "sale_start_at", "mint_deadline", "deployed_at"].includes(key) ? new Date(actual).toISOString() === expectedValue
          : key === "affiliate_rates_bps" ? Array.isArray(actual) && actual.length === 0
          : ["name", "symbol", "season_name", "collection_color", "text_color"].includes(key) ? actual === expectedValue
          : same(actual, expectedValue);
        check(matches, `Existing ${table}.${key} differs; refusing to relabel or overwrite it`);
      }
    }
    await client.query("COMMIT");
    return { collectionId: stepId, seriesId, existing };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export async function indexSeasonFactory(pool: pg.Pool, provider: JsonRpcProvider, options: { databaseUrl: string; rpcUrl: string; chainId: 1 | 11155111; factory: string; factoryCodeHash: string; confirmations: number; contractVersion?: SeasonContractVersion }) {
  check(Number.isSafeInteger(options.confirmations) && options.confirmations >= 2, "At least two chain confirmations are required");
  const policy = seasonVersionPolicy(options.contractVersion);
  const config = readIndexerConfig({
    DATABASE_URL: options.databaseUrl, INDEXER_RPC_URL: options.rpcUrl, MANEKINEKO_CHAIN_ID: String(options.chainId),
    INDEXER_CONTRACT_VERSION: policy.contractVersion, [`INDEXER_${policy.componentVersion}_TRUSTED_FACTORY`]: options.factory, [`INDEXER_${policy.componentVersion}_TRUSTED_FACTORY_CODEHASH`]: options.factoryCodeHash,
    INDEXER_CONFIRMATIONS: String(options.confirmations), INDEXER_MAX_COLLECTIONS: "100", INDEXER_MAX_BATCHES: "24", INDEXER_TIME_BUDGET_MS: "45000",
  });
  return executeIndexerCycle({ chain: new RpcChainReader(provider, config), store: new PostgresIndexerStore(pool), config });
}
