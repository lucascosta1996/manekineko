import "server-only";
import type { PoolClient } from "pg";

import { database } from "../database";
import { configuredChainId } from "../chain-policy";
import { buildHistoryResponse, type HistoryCollection, type HistoryResponse } from "./model";
import { listCollections } from "../collections/repository";
import { validateHistoryCollection } from "./validation";

interface HistoryRow {
  totalAffiliatePaidWei: string;
  contractVersion: HistoryCollection["contractVersion"];
  prizeBps: number;
  affiliatePoolBps?: number | null;
  algorithmVersion: HistoryCollection["algorithmVersion"];
  randomnessProvider: HistoryCollection["randomnessProvider"];
  id: string;
  seriesId: string;
  seriesName: string;
  roundId: string;
  name: string;
  symbol: string;
  chainId: string;
  networkName: string;
  currencySymbol: string;
  currencyDecimals: number;
  maxSupply: number;
  totalMinted: number;
  mintPriceWei: string;
  totalMintRevenueWei: string;
  totalRefundedWei: string;
  status: HistoryCollection["status"];
  openedAt: Date;
  closedAt: Date;
  isMock: boolean;
  tokenId: number | null;
  numberA: number | null;
  numberB: number | null;
  numberC: number | null;
  numberD: number | null;
  combinationCode: string | null;
  combinationKey: string | null;
  score: string | null;
  winningHolder: string | null;
  prizeRecipient: string | null;
  prizePaidWei: string | null;
  paidAt: Date | null;
}

async function readHistorySnapshot(client: PoolClient): Promise<HistoryResponse> {
  const { rows } = await client.query<HistoryRow>(`
    SELECT h.id, h.series_id AS "seriesId", s.name AS "seriesName",
      to_jsonb(c)->>'season_id' AS "seasonId", to_jsonb(c)->>'season_name' AS "seasonName",
      to_jsonb(c)->>'collection_color' AS "collectionColor", to_jsonb(c)->>'text_color' AS "textColor",
    COALESCE((SELECT SUM((e.arguments->>'amount')::numeric) FROM manekineko_chain_events e
      WHERE e.collection_id=h.id AND e.event_name='AffiliateCommissionClaimed'),0)::text AS "totalAffiliatePaidWei",
    h.contract_version AS "contractVersion", h.prize_bps AS "prizeBps", h.affiliate_pool_bps AS "affiliatePoolBps",
      h.algorithm_version AS "algorithmVersion", h.randomness_provider AS "randomnessProvider",
      h.round_id::text AS "roundId", h.name, h.symbol,
      h.chain_id::text AS "chainId", n.name AS "networkName",
      n.currency_symbol AS "currencySymbol", n.currency_decimals AS "currencyDecimals",
      h.max_supply AS "maxSupply", h.total_minted AS "totalMinted",
      h.mint_price_wei::text AS "mintPriceWei",
      (h.total_minted * h.mint_price_wei)::text AS "totalMintRevenueWei",
      h.total_refunded_wei::text AS "totalRefundedWei", h.status,
      h.opened_at AS "openedAt", h.closed_at AS "closedAt", h.is_mock AS "isMock",
      w.token_id AS "tokenId", w.number_a AS "numberA", w.number_b AS "numberB",
      w.number_c AS "numberC", w.number_d AS "numberD",
      (to_jsonb(w)->>'combination_key') AS "combinationKey", w.combination_code::text AS "combinationCode", w.score::text AS "score",
      w.winning_holder AS "winningHolder",
      w.prize_recipient AS "prizeRecipient", w.prize_paid_wei::text AS "prizePaidWei",
      w.paid_at AS "paidAt"
    FROM manekineko_collection_history h
    LEFT JOIN manekineko_collections c ON c.id = h.id
    JOIN manekineko_series s ON s.id = h.series_id
    JOIN manekineko_networks n ON n.chain_id = h.chain_id
    LEFT JOIN manekineko_history_winners w ON w.collection_id = h.id
    WHERE h.is_mock = false AND ($1::bigint IS NULL OR h.chain_id = $1)
    ORDER BY h.closed_at DESC, h.id
  `, [configuredChainId()]);

  // The archive and deployed states share one database snapshot and are de-duplicated below.
  const collections = rows.map((row): HistoryCollection => {
    const {
      currencySymbol, currencyDecimals, tokenId, numberA, numberB, numberC,
      numberD, combinationCode, combinationKey, score, winningHolder, prizeRecipient, prizePaidWei, paidAt,
      ...archive
    } = row;
    if (tokenId !== null && (
      numberA === null || numberB === null || numberC === null || numberD === null ||
      combinationCode === null || score === null || winningHolder === null || prizeRecipient === null ||
      prizePaidWei === null || paidAt === null
    )) throw new Error("Incomplete archive winner");

    return validateHistoryCollection({
      ...archive,
      chainId: Number(row.chainId),
      nativeCurrency: { symbol: currencySymbol, decimals: currencyDecimals },
      openedAt: row.openedAt.toISOString(),
      closedAt: row.closedAt.toISOString(),
      winner: tokenId === null ? null : {
        tokenId,
        combination: [numberA!, numberB!, numberC!, numberD!],
        combinationCode: combinationCode!,
        combinationKey,
        score: score!,
        winningHolder: winningHolder!,
        prizeRecipient: prizeRecipient!,
        prizePaidWei: prizePaidWei!,
        paidAt: paidAt!.toISOString(),
      },
    });
  });
  return buildHistoryResponse(collections, await listCollections(client));
}

/** Real outcomes and verified states from one consistent, read-only database snapshot. */
export async function getHistory(): Promise<HistoryResponse> {
  const client = await database().connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const history = await readHistorySnapshot(client);
    await client.query("COMMIT");
    return history;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
