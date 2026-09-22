import type pg from 'pg';
import { verifyAward, awardCount, type AwardEvent } from './awards.ts';
import { decodeScrambledCombination } from '@manekineko/contract-abi/scrambled-rank';
import { ensure, type Checkpoint, type CommitBatch, type IndexerConfig, type IndexerStore, type RegisteredCollection } from './types.ts';

const date = (value: unknown) => new Date(value as string).toISOString();
function verifyWinningCombination(c: RegisteredCollection, s: NonNullable<CommitBatch['snapshot']>): void {
  const winner=s.winningCombination;
  ensure(winner && winner.numbers.length===4 && winner.numbers.every(n=>Number.isSafeInteger(n) && n>=1 && n<=16), 'winner_accounting_mismatch');
  const code=winner.numbers.reduce((packed,n)=>(packed<<4)|(n-1),0);
  let score:string;
  if(c.contractVersion==='affiliate-v6') {
    ensure(c.algorithmVersion==='unique-rank-v3' && typeof winner.key==='string' && /^0x[0-9a-f]{64}$/.test(winner.key), 'winner_accounting_mismatch');
    score=decodeScrambledCombination(winner.numbers,winner.key).score;
  } else {
    ensure(c.contractVersion==='affiliate-v5' && c.algorithmVersion==='unique-rank-v2' && winner.key==null, 'winner_accounting_mismatch');
    score=String(code+1);
  }
  ensure(winner.code===String(code) && winner.score===score && score===String(c.maxSupply) && score===s.highestScore, 'winner_accounting_mismatch');
}
export function collection(row: Record<string, any>): RegisteredCollection {
  return { contractVersion: row.contract_version, algorithmVersion: row.algorithm_version, id: row.id, seriesId: row.series_id, chainId: Number(row.chain_id), roundId: String(row.round_id), name: row.name, symbol: row.symbol,
    ...(row.season_id ? { seasonId: row.season_id, seasonName: row.season_name, collectionColor: row.collection_color, textColor: row.text_color } : {}),
    ...(["affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(row.contract_version) ? { winnerCount: row.winner_count, secondPrizeBps: row.second_prize_bps, minAffiliateReferrals: row.min_affiliate_referrals, affiliatePayoutCapBps: row.affiliate_payout_cap_bps, saleStartAt: new Date(row.sale_start_at).getTime() / 1000 } : {}),
    maxSupply: row.max_supply, mintPrice: String(row.mint_price_wei), prizeBps: row.prize_bps, affiliatePoolBps: row.affiliate_pool_bps,
    address: row.contract_address, factory: row.factory_address, deploymentTransaction: row.transaction_hash,
    deploymentBlock: Number(row.deployment_block), deployedAt: date(row.deployed_at), mintDeadline: new Date(row.mint_deadline).getTime() / 1000,
    maxAffiliateSlots: row.max_slots, enrollmentSigner: row.enrollment_signer };
}

export class PostgresIndexerStore implements IndexerStore {
  private pool: pg.Pool;
  constructor(pool: pg.Pool) { this.pool = pool; }
  async collections(config: IndexerConfig): Promise<RegisteredCollection[]> {
    const result = await this.pool.query(`SELECT c.*,d.contract_address,d.factory_address,d.transaction_hash,d.deployment_block,
      d.deployed_at,d.mint_deadline,p.max_slots,p.enrollment_signer
      FROM manekineko_collections c JOIN manekineko_deployments d ON d.collection_id=c.id
      JOIN manekineko_affiliate_programs p ON p.collection_id=c.id
      LEFT JOIN manekineko_indexer_checkpoints i ON i.collection_id=c.id
      WHERE c.chain_id=$1 AND c.contract_version=$4 AND c.algorithm_version=$5
        AND d.status='deployed' AND d.factory_address=$2 AND p.mode='live' AND p.contract_version=c.contract_version
      ORDER BY i.last_attempt_at ASC NULLS FIRST,c.created_at,c.id LIMIT $3`, [config.chainId, config.factory, config.maxCollections, config.contractVersion, config.contractVersion === "affiliate-v10" ? "unique-rank-v6" : (config.contractVersion === "affiliate-v8" || config.contractVersion === "affiliate-v9") ? "unique-rank-v5" : config.contractVersion === "affiliate-v7" ? "unique-rank-v4" : config.contractVersion === "affiliate-v6" ? "unique-rank-v3" : "unique-rank-v2"]);
    return result.rows.map(collection);
  }
  async acquire(c: RegisteredCollection, owner: string, leaseSeconds: number): Promise<Checkpoint | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO manekineko_indexer_checkpoints(collection_id) VALUES($1) ON CONFLICT DO NOTHING', [c.id]);
      const acquired = await client.query(`UPDATE manekineko_indexer_checkpoints SET lease_owner=$2,
        lease_expires_at=clock_timestamp()+make_interval(secs=>$3),last_attempt_at=clock_timestamp()
        WHERE collection_id=$1 AND (lease_owner IS NULL OR lease_expires_at<=clock_timestamp()) RETURNING *`, [c.id, owner, leaseSeconds]);
      if (!acquired.rowCount) { await client.query('ROLLBACK'); return null; }
      const row = acquired.rows[0];
      const snapshot = (await client.query('SELECT block_number,block_hash,phase FROM manekineko_collection_state WHERE collection_id=$1', [c.id])).rows[0];
      await client.query('COMMIT');
      return { blockNumber: row.block_number === null ? null : Number(row.block_number), blockHash: row.block_hash,
        trustFingerprint: row.trust_fingerprint, lastReconciledAt: row.last_reconciled_at ? new Date(row.last_reconciled_at).getTime() : null,
        snapshotBlock: snapshot ? Number(snapshot.block_number) : null, snapshotHash: snapshot?.block_hash ?? null, phase: snapshot?.phase ?? null };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async release(collectionId: string, owner: string, error?: string): Promise<void> {
    await this.pool.query(`UPDATE manekineko_indexer_checkpoints SET lease_owner=NULL,lease_expires_at=NULL,
      last_error_code=$3,failure_count=CASE WHEN $3::text IS NULL THEN 0 ELSE failure_count+1 END,updated_at=clock_timestamp()
      WHERE collection_id=$1 AND lease_owner=$2`, [collectionId, owner, error ?? null]);
  }
  async quarantine(collectionId: string, owner: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const lock = await client.query('SELECT collection_id FROM manekineko_indexer_checkpoints WHERE collection_id=$1 AND lease_owner=$2 AND lease_expires_at>clock_timestamp() FOR UPDATE', [collectionId, owner]);
      ensure(lock.rowCount, 'lease_expired');
      await this.clear(client, collectionId);
      await client.query(`UPDATE manekineko_indexer_checkpoints SET block_number=NULL,block_hash=NULL,trust_fingerprint=NULL,
        last_reconciled_at=NULL,last_success_at=NULL,reorg_count=reorg_count+1 WHERE collection_id=$1`, [collectionId]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  private async clear(client: pg.PoolClient, id: string): Promise<void> {
    // Only this registered collection's derived records are rebuilt. Immutable launch/auth rows are untouched.
    await client.query('DELETE FROM manekineko_collection_awards WHERE collection_id=$1', [id]);
    await client.query('DELETE FROM manekineko_chain_events WHERE collection_id=$1', [id]);
    await client.query('DELETE FROM manekineko_history_winners WHERE collection_id=$1', [id]);
    await client.query('DELETE FROM manekineko_collection_history WHERE id=$1 AND NOT is_mock', [id]);
    await client.query('DELETE FROM manekineko_collection_state WHERE collection_id=$1', [id]);
  }
  async commit(batch: CommitBatch): Promise<void> {
    const client = await this.pool.connect();
    const { collection: c, previous, block, owner, snapshot: s } = batch;
    try {
      await client.query('BEGIN');
      const current = (await client.query(`SELECT * FROM manekineko_indexer_checkpoints
        WHERE collection_id=$1 AND lease_owner=$2 AND lease_expires_at>clock_timestamp() FOR UPDATE`, [c.id, owner])).rows[0];
      ensure(current && (current.block_number === null ? null : Number(current.block_number)) === previous.blockNumber && current.block_hash === previous.blockHash, 'lease_expired');
      if (batch.reset) await this.clear(client, c.id);
      if (batch.events.length) {
        await client.query(`INSERT INTO manekineko_chain_events(collection_id,block_number,block_hash,transaction_hash,transaction_index,log_index,event_name,arguments,topics,data,block_timestamp)
          SELECT $1,x.block_number,x.block_hash,x.transaction_hash,x.transaction_index,x.log_index,x.event_name,x.arguments,x.topics,x.data,to_timestamp(x.timestamp)
          FROM jsonb_to_recordset($2::jsonb) AS x(block_number bigint,block_hash text,transaction_hash text,transaction_index integer,log_index integer,event_name text,arguments jsonb,topics jsonb,data text,timestamp bigint)
          ON CONFLICT(collection_id,transaction_hash,log_index) DO NOTHING`, [c.id, JSON.stringify(batch.events.map(e => ({
            block_number: e.blockNumber, block_hash: e.blockHash, transaction_hash: e.transactionHash, transaction_index: e.transactionIndex,
            log_index: e.logIndex, event_name: e.name, arguments: e.args, topics: e.topics, data: e.data, timestamp: e.timestamp,
          })))]);
      }
      if (s) {
        let prizeTransaction: string | null = null;
        let closing: string | null = null;
        let winner: Record<string, string> | null = null;
        let status: 'completed' | 'refunded' | null = null;
        let revealedAt: string | null = null;
        if (['affiliate-v7','affiliate-v8','affiliate-v9','affiliate-v10'].includes(c.contractVersion)) {
          const awards = s.awards ?? [];
          ensure(awards.length === (s.winningTokenId === null ? 0 : awardCount(c)), 'winner_accounting_mismatch');
          await client.query('DELETE FROM manekineko_collection_awards WHERE collection_id=$1', [c.id]);
          for (const award of awards) {
            const resultEvents = (await client.query<AwardEvent>(`SELECT transaction_hash,arguments,block_timestamp FROM manekineko_chain_events
              WHERE collection_id=$1 AND event_name='AwardDetermined' AND arguments->>'rank'=$2`, [c.id, String(award.rank)])).rows;
            const claimEvents = (await client.query<AwardEvent>(`SELECT transaction_hash,arguments,block_timestamp FROM manekineko_chain_events
              WHERE collection_id=$1 AND event_name='AwardClaimed' AND arguments->>'rank'=$2`, [c.id, String(award.rank)])).rows;
            const { result, claim } = verifyAward(c, award, resultEvents, claimEvents);
            revealedAt = date(result.block_timestamp);
            await client.query(`INSERT INTO manekineko_collection_awards(collection_id,rank,token_id,score,amount_wei,numbers,combination_code,combination_key,
              current_holder,determined_at,determined_transaction,claimed,winning_holder,recipient,paid_at,claim_transaction,block_number,block_hash)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
              [c.id,award.rank,award.tokenId,award.score,award.amountWei,award.numbers,award.code,award.key,award.holder,
                revealedAt,result.transaction_hash,award.claimed,award.winningHolder,claim?.arguments.recipient.toLowerCase() ?? null,
                claim ? date(claim.block_timestamp) : null,claim?.transaction_hash ?? null,block.number,block.hash]);
          }
        } else if (s.prizePaid) {
          verifyWinningCombination(c,s);
          const paid = (await client.query(`SELECT transaction_hash,arguments,block_timestamp FROM manekineko_chain_events
            WHERE collection_id=$1 AND event_name='PrizeDelivered'`, [c.id])).rows;
          ensure(paid.length === 1, 'prize_event_missing');
          const event = paid[0]; winner = event.arguments;
          ensure(winner && Number(winner.tokenId) === s.winningTokenId && winner.amount === s.prizePaidWei
            && winner.recipient.toLowerCase() === s.prizeRecipient && s.winningCombination, 'prize_event_mismatch');
          prizeTransaction = event.transaction_hash; closing = date(event.block_timestamp); status = 'completed';
        }
        if (s.phase === 'refundable' && s.totalMinted > 0 && s.refundedCount === s.totalMinted) {
          const refunds = (await client.query(`SELECT count(*)::integer AS count,count(DISTINCT arguments->>'tokenId')::integer AS tokens,
            min((arguments->>'tokenId')::numeric)::text AS first,max((arguments->>'tokenId')::numeric)::text AS last,
            min((arguments->>'amount')::numeric)::text AS least,max((arguments->>'amount')::numeric)::text AS greatest,
            max(block_timestamp) AS closed_at FROM manekineko_chain_events WHERE collection_id=$1 AND event_name='Refunded'`, [c.id])).rows[0];
          ensure(refunds.count === s.totalMinted && refunds.tokens === s.totalMinted && refunds.first === '1' && Number(refunds.last) === s.totalMinted
            && refunds.least === c.mintPrice && refunds.greatest === c.mintPrice, 'refund_event_mismatch');
          closing = date(refunds.closed_at); status = 'refunded';
        }
        const columns = ['collection_id','phase','total_minted','total_mint_revenue_wei','settled_count','refunded_count','total_refunded_wei','winning_token_id','highest_score',
          'randomness_state','randomness_request_id','randomness_word','prize_paid','prize_recipient','prize_paid_wei','prize_transaction_hash','block_number','block_hash','award_count','sold_out_at','revealed_at','all_prizes_paid'];
        const values = [c.id,s.phase,s.totalMinted,s.totalMintRevenueWei,s.settledCount,s.refundedCount,s.totalRefundedWei,s.winningTokenId,s.highestScore,
          s.randomnessState,s.randomnessRequestId,s.randomnessWord,s.prizePaid,s.prizeRecipient,s.prizePaidWei,prizeTransaction,block.number,block.hash,awardCount(c),s.soldOutAt ? new Date(s.soldOutAt * 1000).toISOString() : null,revealedAt,s.prizePaid];
        await client.query(`INSERT INTO manekineko_collection_state(${columns.join(',')}) VALUES(${values.map((_, i) => `$${i + 1}`).join(',')})
          ON CONFLICT(collection_id) DO UPDATE SET ${columns.slice(1).map(name => `${name}=EXCLUDED.${name}`).join(',')},synced_at=now()`, values);
        // Rebuild the terminal projection together with the source snapshot, so an orphan winner never remains visible.
        await client.query('DELETE FROM manekineko_history_winners WHERE collection_id=$1', [c.id]);
        await client.query('DELETE FROM manekineko_collection_history WHERE id=$1 AND NOT is_mock', [c.id]);
        if (status && !["affiliate-v7","affiliate-v8", "affiliate-v9", "affiliate-v10"].includes(c.contractVersion)) {
          await client.query(`INSERT INTO manekineko_collection_history(id,series_id,chain_id,round_id,name,symbol,max_supply,total_minted,mint_price_wei,total_refunded_wei,
            status,opened_at,closed_at,is_mock,algorithm_version,randomness_provider,contract_version,prize_bps,affiliate_pool_bps)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false,$16,'chainlink-vrf-v2.5',$17,$14,$15)`,
          [c.id,c.seriesId,c.chainId,c.roundId,c.name,c.symbol,c.maxSupply,s.totalMinted,c.mintPrice,s.totalRefundedWei,status,c.deployedAt,closing,c.prizeBps,c.affiliatePoolBps,c.algorithmVersion,c.contractVersion]);
          if (winner && s.winningCombination) {
            const w = s.winningCombination;
            await client.query(`INSERT INTO manekineko_history_winners(collection_id,token_id,number_a,number_b,number_c,number_d,combination_code,score,
              prize_recipient,prize_paid_wei,paid_at,algorithm_version,winning_holder,combination_key)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$13,$12,$14)`,
            [c.id,s.winningTokenId,...w.numbers,w.code,w.score,s.prizeRecipient,s.prizePaidWei,closing,winner.holder.toLowerCase(),c.algorithmVersion,w.key ?? null]);
          }
        }
      }
      await client.query(`UPDATE manekineko_indexer_checkpoints SET block_number=$2,block_hash=$3,trust_fingerprint=$4,
        last_success_at=clock_timestamp(),last_reconciled_at=CASE WHEN $5 THEN clock_timestamp() ELSE last_reconciled_at END,
        last_error_code=NULL,failure_count=0,reorg_count=reorg_count+CASE WHEN $6 THEN 1 ELSE 0 END,updated_at=clock_timestamp()
        WHERE collection_id=$1`, [c.id,block.number,block.hash,batch.fingerprint,Boolean(s),batch.reset]);
      // The HTTP RPC endpoint is re-read immediately before committing any new cursor or projection.
      await batch.beforeCommit();
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
}
