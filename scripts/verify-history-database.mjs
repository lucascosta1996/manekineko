import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";

// Development integration suite: requires the unchanged 001/002 sample seeds.
// It is not a production audit. Every test mutation is rolled back.
if (!process.env.DATABASE_URL) {
  throw new Error("Set DATABASE_URL for the seeded integration-test database.");
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
  application_name: "manekineko-history-integrity-test",
});
let passed = 0;

async function rejectsMutation(label, operation, pattern) {
  await client.query("BEGIN");
  try {
    await operation();
    // Force deferred constraints while the transaction can still be rolled back.
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    assert.fail(`${label}: invalid archive mutation was accepted`);
  } catch (error) {
    assert.ok(error && ["23514", "23503", "23502", "P0001"].includes(error.code), `${label}: expected a SQL constraint error (${error?.message})`);
    assert.match(error.message, pattern, label);
    passed += 1;
    console.log(`PASS ${label}`);
  } finally {
    await client.query("ROLLBACK");
  }
}

async function snapshot() {
  const { rows } = await client.query(`SELECT jsonb_build_object(
    'networks', (SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.chain_id), '[]'::jsonb) FROM manekineko_networks n),
    'series', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id), '[]'::jsonb) FROM manekineko_series s),
    'collections', (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id), '[]'::jsonb) FROM manekineko_collections c),
    'deployments', (SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.collection_id), '[]'::jsonb) FROM manekineko_deployments d),
    'history', (SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.id), '[]'::jsonb) FROM manekineko_collection_history h),
    'winners', (SELECT coalesce(jsonb_agg(to_jsonb(w) ORDER BY w.collection_id), '[]'::jsonb) FROM manekineko_history_winners w)
  ) AS data`);
  return rows[0].data;
}

const completeId = "ad348b5a-8ad4-4719-82c4-0e2d58002008";
const refundId = "ad348b5a-8ad4-4719-82c4-0e2d58002007";

async function insertV2Archive(includeHolder = true) {
  const id = randomUUID();
  await client.query(`INSERT INTO manekineko_collection_history
    (id, series_id, chain_id, round_id, name, symbol, max_supply, total_minted, mint_price_wei, total_refunded_wei,
     status, opened_at, closed_at, is_mock, algorithm_version, randomness_provider)
    SELECT $1, series_id, 1, 100001, 'Rollback-only V2 archive', symbol, 1000, 1000, 2, 0,
      status, opened_at, closed_at, true, 'unique-rank-v2', 'chainlink-vrf-v2.5'
    FROM manekineko_collection_history WHERE id = $2`, [id, completeId]);
  await client.query(`INSERT INTO manekineko_history_winners
    (collection_id, algorithm_version, token_id, number_a, number_b, number_c, number_d,
     combination_code, score, winning_holder, prize_recipient, prize_paid_wei, paid_at)
    SELECT $1, 'unique-rank-v2', 42, 1, 4, 15, 8, 999, 1000, CASE WHEN $3::boolean THEN prize_recipient ELSE NULL END, prize_recipient, 1000, paid_at
    FROM manekineko_history_winners WHERE collection_id = $2`, [id, completeId, includeHolder]);
  return id;
}

async function insertV2Snapshot() {
  const id = randomUUID();
  await client.query(`INSERT INTO manekineko_collections
    (id, series_id, chain_id, round_id, slug, name, symbol, max_supply, mint_price_wei, mint_duration_seconds, reveal_delay_blocks, algorithm_version, randomness_provider)
    SELECT $1, series_id, 1, 100001, $2, 'Rollback-only V2 snapshot', symbol, 1000, 2, 604800, NULL, 'unique-rank-v2', 'chainlink-vrf-v2.5'
    FROM manekineko_collections LIMIT 1`, [id, `test-${id}`]);
  await client.query(`INSERT INTO manekineko_deployments
    (collection_id, chain_id, status, contract_address, owner_address, transaction_hash, deployment_block, mint_deadline, deployed_at)
    VALUES ($1, 1, 'deployed', $2, $2, $3, 1, '2026-09-17T00:00:00Z', '2026-09-10T00:00:00Z')`, [id, `0x${id.replaceAll("-", "")}00000000`, `0x${"a".repeat(64)}`]);
  await client.query(`INSERT INTO manekineko_collection_state
    (collection_id, phase, total_minted, total_mint_revenue_wei, settled_count, winning_token_id, highest_score,
     block_number, block_hash, randomness_request_id, randomness_state, randomness_word)
    VALUES ($1, 'awaiting_prize', 1000, 2000, 1000, 42, 1000, 10, $2, 1, 'fulfilled', 0)`, [id, `0x${"b".repeat(64)}`]);
  return id;
}

try {
  await client.connect();
  await client.query("SET statement_timeout = '10s'");
  await client.query("SET lock_timeout = '5s'");
  const initial = await snapshot();
  const { rows: [totals] } = await client.query(`SELECT
    count(*)::integer AS collections,
    count(*) FILTER (WHERE h.status = 'completed')::integer AS completed,
    count(*) FILTER (WHERE h.status = 'refunded')::integer AS refunded,
    sum(h.total_minted)::text AS minted,
    count(DISTINCT w.prize_recipient)::integer AS recipients,
    sum(h.total_minted * h.mint_price_wei)::text AS revenue,
    sum(h.total_refunded_wei)::text AS refunds,
    sum(w.prize_paid_wei)::text AS prizes,
    max(w.prize_paid_wei)::text AS largest_prize
    FROM manekineko_collection_history h
    LEFT JOIN manekineko_history_winners w ON w.collection_id = h.id
    WHERE h.series_id = '942bc2a0-8b13-46a0-9434-05014f9b2026' AND h.is_mock`);
  assert.deepEqual(totals, {
    collections: 8,
    completed: 6,
    refunded: 2,
    minted: "7154",
    recipients: 5,
    revenue: "72575000000000000000",
    refunds: "3575000000000000000",
    prizes: "34500000000000000000",
    largest_prize: "9000000000000000000",
  }, "Apply the unchanged sample seeds before running integration checks");
  passed += 1;
  console.log("PASS persisted sample totals, distinct winners and exact native amounts");

  const { rows: [provenance] } = await client.query(`SELECT
    (SELECT count(*)::integer FROM manekineko_collection_history h JOIN manekineko_deployments d ON d.collection_id = h.id WHERE h.is_mock) AS fabricated_deployments,
    (SELECT count(*)::integer FROM manekineko_collection_history h JOIN manekineko_collection_state s ON s.collection_id = h.id WHERE h.is_mock) AS fabricated_chain_states`);
  assert.deepEqual(provenance, { fabricated_deployments: 0, fabricated_chain_states: 0 });
  passed += 1;
  console.log("PASS mock archives remain separate from deployments and chain state");

  await rejectsMutation("incorrect Solidity score", () => client.query("UPDATE manekineko_history_winners SET score = score + 1 WHERE collection_id = $1", [completeId]), /check constraint/);
  await rejectsMutation("incorrect tuple encoding", () => client.query("UPDATE manekineko_history_winners SET combination_code = combination_code - 1 WHERE collection_id = $1", [completeId]), /check constraint/);
  await rejectsMutation("completed archive without winner", () => client.query("DELETE FROM manekineko_history_winners WHERE collection_id = $1", [completeId]), /Completed archive requires a winner/);
  await rejectsMutation("prize other than the legacy 50 percent of primary receipts", () => client.query("UPDATE manekineko_history_winners SET prize_paid_wei = prize_paid_wei - 2 WHERE collection_id = $1", [completeId]), /configured prize percentage/);
  await rejectsMutation("winning token outside minted supply", () => client.query("UPDATE manekineko_history_winners SET token_id = 1501 WHERE collection_id = $1", [completeId]), /supply/);
  await rejectsMutation("prize payment after archive closure", () => client.query("UPDATE manekineko_history_winners SET paid_at = paid_at + interval '1 day' WHERE collection_id = $1", [completeId]), /dates/);
  await rejectsMutation("completed collection that did not sell out", () => client.query("UPDATE manekineko_collection_history SET total_minted = total_minted - 1 WHERE id = $1", [completeId]), /check constraint/);
  await rejectsMutation("incomplete refunds marked as fully refunded", () => client.query("UPDATE manekineko_collection_history SET total_refunded_wei = 0 WHERE id = $1", [refundId]), /check constraint/);
  await rejectsMutation("refunded collection with a prize winner", () => client.query(`INSERT INTO manekineko_history_winners
    (collection_id, token_id, number_a, number_b, number_c, number_d, combination_code, score, prize_recipient, prize_paid_wei, paid_at)
    SELECT $1, token_id, number_a, number_b, number_c, number_d, combination_code, score, prize_recipient, prize_paid_wei, paid_at
    FROM manekineko_history_winners WHERE collection_id = $2`, [refundId, completeId]), /Refunded archive cannot have a winner/);

  assert.equal(initial.history.every((row) => row.algorithm_version === "feistel-v1" && row.randomness_provider === "future-blockhash"), true);
  assert.equal(initial.collections.every((row) => row.algorithm_version === "feistel-v1" && row.randomness_provider === "future-blockhash"), true);
  passed += 1;
  console.log("PASS original collection and mock-history records retain V1 provenance");
  assert.equal(initial.winners.every((row) => row.algorithm_version === "feistel-v1" && row.winning_holder === row.prize_recipient), true);
  passed += 1;
  console.log("PASS original V1 winning holders match their historical prize recipients");
  await rejectsMutation("V1 cannot record a separate winning holder", () => client.query("UPDATE manekineko_history_winners SET winning_holder = '0x9999999999999999999999999999999999999999' WHERE collection_id = $1", [completeId]), /check constraint/);
  await rejectsMutation("V2 winning holder must be explicit", async () => {
    await insertV2Archive(false);
  }, /null value.*winning_holder/);
  await rejectsMutation("V2 winning holder cannot be zero", async () => {
    const id = await insertV2Archive();
    await client.query("UPDATE manekineko_history_winners SET winning_holder = '0x0000000000000000000000000000000000000000' WHERE collection_id = $1", [id]);
  }, /check constraint/);
  await rejectsMutation("immutable archived algorithm", () => client.query("UPDATE manekineko_collection_history SET algorithm_version = 'unique-rank-v2', randomness_provider = 'chainlink-vrf-v2.5' WHERE id = $1", [completeId]), /immutable/);
  await rejectsMutation("immutable catalog algorithm", () => client.query("UPDATE manekineko_collections SET algorithm_version = 'unique-rank-v2', randomness_provider = 'chainlink-vrf-v2.5', reveal_delay_blocks = NULL"), /immutable/);
  await rejectsMutation("V2 winner cannot use V1 tuple encoding", async () => {
    const id = await insertV2Archive();
    await client.query("UPDATE manekineko_history_winners SET combination_code = 200967, score = 519691244807 WHERE collection_id = $1", [id]);
  }, /check constraint/);
  await rejectsMutation("V2 winner must have the highest rank equal to supply", async () => {
    const id = await insertV2Archive();
    await client.query("UPDATE manekineko_history_winners SET number_d = 7, combination_code = 998, score = 999 WHERE collection_id = $1", [id]);
  }, /rank must equal collection supply/);
  await rejectsMutation("V2 winner algorithm must match archive", async () => {
    const id = await insertV2Archive();
    await client.query("UPDATE manekineko_history_winners SET algorithm_version = 'feistel-v1', number_a = 1, number_b = 1, number_c = 1, number_d = 1, combination_code = 0, score = 8589934592 WHERE collection_id = $1", [id]);
  }, /foreign key constraint/);
  await rejectsMutation("V2 cannot change to a non-Ethereum chain", async () => {
    const id = await insertV2Archive();
    await client.query("INSERT INTO manekineko_networks (chain_id, name, currency_symbol, currency_decimals, explorer_url) VALUES (8453, 'Test network', 'ETH', 18, 'https://example.com') ON CONFLICT (chain_id) DO NOTHING");
    await client.query("UPDATE manekineko_collection_history SET chain_id = 8453 WHERE id = $1", [id]);
  }, /check constraint/);
  await rejectsMutation("V2 sold-out archives cannot report refunds", async () => {
    const id = await insertV2Archive();
    await client.query("DELETE FROM manekineko_history_winners WHERE collection_id = $1", [id]);
    await client.query("UPDATE manekineko_collection_history SET status = 'refunded', total_refunded_wei = 2000 WHERE id = $1", [id]);
  }, /sold-out collections cannot refund/);
  await rejectsMutation("Ethereum currency cannot be relabeled", () => client.query("UPDATE manekineko_networks SET currency_symbol = 'FLOW' WHERE chain_id = 1"), /Ethereum networks must use ETH/);
  for (const [label, mutation, pattern] of [
    ["V2 fulfilled snapshot requires a word", "randomness_word = NULL", /check constraint/],
    ["V2 request cannot have a null status", "randomness_state = NULL", /V2 snapshot cannot contain V1 randomness/],
    ["V2 pending randomness cannot be finalized", "randomness_state = 'pending', randomness_word = NULL", /state does not match phase/],
    ["V2 finalized snapshot requires the highest rank", "highest_score = 999", /highest rank equal to supply/],
    ["V2 cannot reuse a legacy reveal seed", "reveal_seed = '0x" + "c".repeat(64) + "'", /V2 snapshot cannot contain V1 randomness/],
    ["V2 request ID cannot be negative", "randomness_request_id = -1", /check constraint/],
    ["V2 absent request must use NULL rather than zero", "phase = 'awaiting_request', settled_count = 0, winning_token_id = NULL, highest_score = NULL, randomness_state = 'not_requested', randomness_word = NULL, randomness_request_id = 0", /check constraint/],
    ["V2 pending request must have an ID", "phase = 'awaiting_randomness', settled_count = 0, winning_token_id = NULL, highest_score = NULL, randomness_state = 'pending', randomness_word = NULL, randomness_request_id = NULL", /check constraint/],
  ]) await rejectsMutation(label, async () => {
    const id = await insertV2Snapshot();
    await client.query(`UPDATE manekineko_collection_state SET ${mutation} WHERE collection_id = $1`, [id]);
  }, pattern);
  await client.query("BEGIN");
  try {
    const archiveId = await insertV2Archive();
    await client.query("UPDATE manekineko_history_winners SET winning_holder = '0x9999999999999999999999999999999999999999' WHERE collection_id = $1", [archiveId]);
    const snapshotId = await insertV2Snapshot();
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    assert.equal((await client.query("SELECT score::text FROM manekineko_history_winners WHERE collection_id = $1", [archiveId])).rows[0].score, "1000");
    assert.equal((await client.query("SELECT randomness_word::text FROM manekineko_collection_state WHERE collection_id = $1", [snapshotId])).rows[0].randomness_word, "0");
    assert.equal((await client.query("SELECT winning_holder <> prize_recipient AS distinct_destination FROM manekineko_history_winners WHERE collection_id = $1", [archiveId])).rows[0].distinct_destination, true);
    await client.query("UPDATE manekineko_collection_state SET randomness_request_id = 0 WHERE collection_id = $1", [snapshotId]);
    assert.equal((await client.query("SELECT randomness_request_id::text FROM manekineko_collection_state WHERE collection_id = $1", [snapshotId])).rows[0].randomness_request_id, "0");
    await client.query("UPDATE manekineko_collection_state SET phase = 'awaiting_randomness', settled_count = 0, winning_token_id = NULL, highest_score = NULL, randomness_state = 'pending', randomness_word = NULL WHERE collection_id = $1", [snapshotId]);
    assert.equal((await client.query("SELECT randomness_request_id::text FROM manekineko_collection_state WHERE collection_id = $1", [snapshotId])).rows[0].randomness_request_id, "0");
    await client.query("UPDATE manekineko_collection_state SET phase = 'awaiting_request', randomness_state = 'not_requested', randomness_request_id = NULL WHERE collection_id = $1", [snapshotId]);
    assert.equal((await client.query("SELECT randomness_request_id FROM manekineko_collection_state WHERE collection_id = $1", [snapshotId])).rows[0].randomness_request_id, null);
    passed += 1;
    console.log("PASS valid V2 archive, zero-valued word/request ID and NULL absent request with exact ranking");
  } finally {
    await client.query("ROLLBACK");
  }

  // Exercise two actual connections. The archive writer reduces supply while
  // preserving revenue; the winner writer chooses a token inside the old supply
  // but outside the new supply. Their validations must not run independently.
  // Roll the archive writer back to release the lock, then roll the winner back.
  const concurrentClient = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
    application_name: "manekineko-history-concurrency-test",
  });
  let pendingValidation;
  try {
    await concurrentClient.connect();
    await concurrentClient.query("SET statement_timeout = '10s'");
    await concurrentClient.query("SET lock_timeout = '5s'");
    const mainPid = (await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    const concurrentPid = (await concurrentClient.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    await client.query("BEGIN");
    await concurrentClient.query("BEGIN");
    await client.query("UPDATE manekineko_collection_history SET max_supply = 1000, total_minted = 1000, mint_price_wei = 18000000000000000 WHERE id = $1", [completeId]);
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    await concurrentClient.query("UPDATE manekineko_history_winners SET token_id = 1200 WHERE collection_id = $1", [completeId]);
    pendingValidation = concurrentClient.query("SET CONSTRAINTS ALL IMMEDIATE")
      .then(() => ({ ok: true }), (error) => ({ ok: false, error }));
    let blocked = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      blocked = (await client.query("SELECT $1::integer = ANY(pg_blocking_pids($2::integer)) AS blocked", [mainPid, concurrentPid])).rows[0].blocked;
      if (blocked) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(blocked, true, "Winner validation must wait on the concurrent archive writer");
    await client.query("ROLLBACK");
    const result = await pendingValidation;
    assert.equal(result.ok, true, "Winner validation resumes against the unchanged supply after rollback");
    passed += 1;
    console.log("PASS concurrent archive and winner validation serialize on the same archive");
  } finally {
    await client.query("ROLLBACK");
    if (pendingValidation) await pendingValidation;
    await concurrentClient.query("ROLLBACK");
    await concurrentClient.end();
  }

  // Exercise the intended worker transaction without retaining an extra archive.
  const testSeriesId = randomUUID();
  const testCollectionId = randomUUID();
  await client.query("BEGIN");
  try {
    await client.query("INSERT INTO manekineko_series (id, name) VALUES ($1, 'Rollback-only integration fixture')", [testSeriesId]);
    await client.query(`INSERT INTO manekineko_collection_history
      (id, series_id, chain_id, round_id, name, symbol, max_supply, total_minted, mint_price_wei, total_refunded_wei, status, opened_at, closed_at, is_mock)
      SELECT $1, $2, chain_id, 1, name, symbol, max_supply, total_minted, mint_price_wei, total_refunded_wei, status, opened_at, closed_at, true
      FROM manekineko_collection_history WHERE id = $3`, [testCollectionId, testSeriesId, completeId]);
    await client.query(`INSERT INTO manekineko_history_winners
      (collection_id, token_id, number_a, number_b, number_c, number_d, combination_code, score, prize_recipient, prize_paid_wei, paid_at)
      SELECT $1, token_id, number_a, number_b, number_c, number_d, combination_code, score, prize_recipient, prize_paid_wei, paid_at
      FROM manekineko_history_winners WHERE collection_id = $2`, [testCollectionId, completeId]);
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    assert.equal((await client.query("SELECT count(*)::integer AS count FROM manekineko_history_winners WHERE collection_id = $1", [testCollectionId])).rows[0].count, 1);
    passed += 1;
    console.log("PASS atomic archive and winner insert with deferred validation");
  } finally {
    await client.query("ROLLBACK");
  }

  // Seed files normally own their transactions. Strip only transaction boundary
  // lines so this verification can replay both seeds and then roll everything back.
  await client.query("BEGIN");
  try {
    const seedsDirectory = new URL("../database/seeds/", import.meta.url);
    const seeds = (await readdir(seedsDirectory)).filter((name) => name.endsWith(".sql")).sort();
    for (let replay = 0; replay < 2; replay += 1) {
      for (const name of seeds) {
        const sql = (await readFile(new URL(name, seedsDirectory), "utf8"))
          .replace(/^\s*BEGIN;\s*$/gm, "")
          .replace(/^\s*COMMIT;\s*$/gm, "");
        // Fail closed if a future seed adds a transaction boundary in another form.
        assert.doesNotMatch(sql, /^\s*(?:BEGIN|COMMIT|END|START\s+TRANSACTION|ROLLBACK)\b/im, `Unexpected transaction control in ${name}`);
        await client.query(sql);
      }
    }
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    assert.deepEqual(await snapshot(), initial, "Seed replay must not overwrite or duplicate persisted data");
    passed += 1;
    console.log("PASS repeatable seeds preserve records and timestamps after two replays");
  } finally {
    await client.query("ROLLBACK");
  }

  assert.deepEqual(await snapshot(), initial, "Integrity checks must leave all persisted records unchanged");
  passed += 1;
  console.log("PASS all integrity mutations rolled back; persisted records unchanged");
  console.log(`${passed} database integrity checks passed.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "History database verification failed.");
  process.exitCode = 1;
} finally {
  await client.end();
}
