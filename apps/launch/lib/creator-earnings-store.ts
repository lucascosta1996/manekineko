import "server-only";
import { FetchRequest, JsonRpcProvider } from "ethers";
import { LaunchConfigurationError } from "./launch-config";
import { database } from "./database";
import type { LaunchChainId } from "./chain-policy";
import { readCreatorEarnings, type EarningsCollection } from "./creator-earnings";

export async function loadCreatorEarnings(chainId: LaunchChainId) {
  // Include archived/retired deployments: public visibility does not determine ownership of ETH.
  const result = await database().query<EarningsCollection>(`SELECT c.id,c.name,c.season_name AS "seasonName",
    c.chain_id::text AS "chainId",c.round_id::text AS "roundId",c.contract_version AS version,d.contract_address AS address
    FROM manekineko_collections c JOIN manekineko_deployments d ON d.collection_id=c.id AND d.chain_id=c.chain_id
    WHERE c.chain_id=$1 AND d.status='deployed' ORDER BY c.created_at,c.id`, [chainId]).catch(() => {
    throw new LaunchConfigurationError("earnings_catalog_unavailable", "The collection catalog is unavailable. Check Launch database read access and retry.", 503);
  });
  const rpcUrl = process.env[`LAUNCH_EARNINGS_RPC_URL_${chainId}`];
  if (!rpcUrl || !result.rows.length) return readCreatorEarnings(result.rows, chainId, null);
  const request = new FetchRequest(rpcUrl);
  request.timeout = 8_000;
  const provider = new JsonRpcProvider(request, Number(chainId), { staticNetwork: true, cacheTimeout: -1, batchMaxCount: 10 });
  try { return await readCreatorEarnings(result.rows, chainId, provider); }
  finally { provider.destroy(); }
}
