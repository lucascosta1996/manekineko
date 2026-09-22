import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import pg from "pg";
import { createDeliveryStore } from "../ingress/deliveries.ts";

const enabled = process.env.TEST_INDEXER_DATABASE === "1";
test("durable webhook nonce leases admit one worker and preserve replay protection across retries", { skip: !enabled ? "Set TEST_INDEXER_DATABASE=1 and local DATABASE_URL for isolated PostgreSQL regression." : false }, async () => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(connectionString).hostname), "This regression requires local PostgreSQL.");
  const schema = `manekineko_ingress_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString });
  let pool: pg.Pool | undefined, created = false;
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA ${schema}`); created = true;
    pool = new pg.Pool({ connectionString, max: 8, options: `-c search_path=${schema},public` });
    await pool.query(await readFile(new URL("../../../database/migrations/015_indexer_webhook_deliveries.sql", import.meta.url), "utf8"));
    const store = createDeliveryStore(pool);
    const delivery = { deliveryId: "a".repeat(64), payloadHash: "b".repeat(64), signedAt: new Date() };
    const attempts = await Promise.all(Array.from({ length: 8 }, () => store.claim(delivery)));
    assert.equal(attempts.filter(result => result.state === "claimed").length, 1);
    assert.equal(attempts.filter(result => result.state === "busy").length, 7);
    const winner = attempts.find(result => result.state === "claimed")!;
    assert.equal(winner.state, "claimed");
    if (winner.state !== "claimed") throw new Error("Missing claimed lease");
    assert.equal((await store.claim({ ...delivery, payloadHash: "c".repeat(64) })).state, "conflict");
    assert.equal(await store.complete(delivery.deliveryId, randomUUID()), false);
    await store.release(delivery.deliveryId, randomUUID());
    assert.equal((await store.claim(delivery)).state, "busy");
    await store.release(delivery.deliveryId, winner.token);
    const retried = await store.claim(delivery);
    assert.equal(retried.state, "claimed");
    if (retried.state !== "claimed") throw new Error("Missing retry lease");
    assert.notEqual(retried.token, winner.token);
    assert.equal(await store.complete(delivery.deliveryId, winner.token), false);
    assert.equal(await store.complete(delivery.deliveryId, retried.token), true);
    await store.release(delivery.deliveryId, retried.token);
    assert.equal((await createDeliveryStore(pool).claim(delivery)).state, "completed");
    assert.equal((await store.claim({ ...delivery, payloadHash: "d".repeat(64) })).state, "conflict");
    assert.equal((await pool.query("SELECT attempt_count FROM manekineko_indexer_webhook_deliveries")).rows[0].attempt_count, 2);

    const interrupted = { ...delivery, deliveryId: "e".repeat(64) };
    const crashed = await store.claim(interrupted);
    assert.equal(crashed.state, "claimed");
    await pool.query("UPDATE manekineko_indexer_webhook_deliveries SET lease_expires_at=now()-interval '1 second' WHERE delivery_id=$1", [interrupted.deliveryId]);
    assert.equal((await store.claim(interrupted)).state, "claimed", "Expired worker leases can be recovered.");
  } finally {
    await pool?.end();
    if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
