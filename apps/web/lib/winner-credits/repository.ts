import "server-only";

import legacyManifest from "@manekineko/contract-abi/winner-credits-legacy" with { type: "json" };
import { validateLegacyCreditManifest } from "@manekineko/contract-abi/winner-credit-proof";
import { database } from "../database";
import { configuredChainId } from "../chain-policy";
import { collectionSource } from "../collections/source-policy";
import { createReadRpc } from "../affiliates/rpc-read-transport";
import { createCreditSnapshot, registryConfig, type CreditTargetRecord } from "./chain";
import { WINNER_CREDIT_SOURCES, WINNER_CREDIT_TARGET } from "./queries";
import { WinnerCreditQueryError, availableLifetimeRewards, winnerCreditKey, type WinnerCreditQuery, type WinnerCreditResponse, type WinnerCreditSource } from "./model";

export async function getWinnerCredits(query: WinnerCreditQuery): Promise<WinnerCreditResponse> {
  collectionSource();
  const configuredChain = configuredChainId();
  const targetRecord = query.collectionId ? (await database().query<CreditTargetRecord>(WINNER_CREDIT_TARGET, [query.collectionId, configuredChain])).rows[0] : null;
  if (query.collectionId && !targetRecord) throw new WinnerCreditQueryError("This collection is not available for winner credits.");
  const chain = targetRecord?.chainId ?? configuredChain;
  const { rows } = await database().query<{ total: number; items: WinnerCreditSource[] }>(WINNER_CREDIT_SOURCES, [query.wallet, chain, query.pageSize, (query.page - 1) * query.pageSize]);
  const row = rows[0];
  const chains = chain ? [chain] : [1,11155111];
  const manifest = validateLegacyCreditManifest(legacyManifest);
  const response: WinnerCreditResponse = { wallet: query.wallet, page: query.page, pageSize: query.pageSize, total: row.total, hasMore: query.page * query.pageSize < row.total, availableOnPage: 0, networks: [], credits: [], target: null };
  for (const chainId of chains) {
    const config = registryConfig(chainId, process.env);
    const sources = row.items.filter((item) => item.chainId === chainId);
    if (!config) {
      response.networks.push({ chainId, configured: false, registryAddress: null, runtimeCodeHash: null, verifiedBlock: null, lifetimeRedemption: null });
      response.credits.push(...sources.map((source) => ({ ...source, available: false, used: false, claimed: false, legacy: source.contractVersion === "affiliate-v5", proof: [], legacyWin: null, redeemedIn: null, redeemedTokenId: null, reason: "Winner credits are not enabled on this network yet." })));
      continue;
    }
    const rpcUrl = process.env[`AFFILIATE_RPC_URL_${chainId}`];
    if (!rpcUrl || new URL(rpcUrl).protocol !== "https:") throw new Error("Secure winner credit RPC is not configured.");
    const snapshot = await createCreditSnapshot(chainId, process.env, createReadRpc(rpcUrl, { allowCallReverts: true }));
    const lifetimeRedemption = await snapshot.walletRedemption(query.wallet);
    const destination = targetRecord && targetRecord.chainId === chainId ? await snapshot.target(targetRecord) : null;
    if (destination) response.target = destination;
    for (const source of sources) {
      const credit = await snapshot.credit(source, query.wallet, manifest);
      response.credits.push(destination ? await snapshot.forTarget(credit, destination, query.wallet) : credit);
    }
    await snapshot.assertCanonical();
    response.networks.push({ chainId, configured: true, registryVersion: snapshot.registryVersion, registryAddress: config.address, runtimeCodeHash: config.hash, verifiedBlock: snapshot.blockNumber, lifetimeRedemption });
  }
  response.credits.sort((a, b) => row.items.findIndex((source) => winnerCreditKey(source) === winnerCreditKey(a)) - row.items.findIndex((source) => winnerCreditKey(source) === winnerCreditKey(b)));
  response.availableOnPage = availableLifetimeRewards(response.credits);
  return response;
}
