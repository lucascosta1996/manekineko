import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { VerifiedWebhook } from "./auth.ts";

export type DeliveryClaim = { state: "claimed"; token: string } | { state: "completed" } | { state: "busy" } | { state: "conflict" };
export interface DeliveryStore {
  claim(delivery: VerifiedWebhook): Promise<DeliveryClaim>;
  complete(deliveryId: string, token: string): Promise<boolean>;
  release(deliveryId: string, token: string): Promise<void>;
}

/** Only a current lease token can complete or release a delivery after a retry. */
export function createDeliveryStore(pool: Pick<Pool, "query">): DeliveryStore {
  return {
    async claim(delivery) {
      const token = randomUUID();
      const claimed = await pool.query<{ lease_token: string }>(`
        INSERT INTO manekineko_indexer_webhook_deliveries
          (delivery_id, payload_hash, signed_at, lease_token, lease_expires_at)
        VALUES ($1, $2, $3, $4, now() + interval '180 seconds')
        ON CONFLICT (delivery_id) DO UPDATE SET
          lease_token = EXCLUDED.lease_token,
          lease_expires_at = EXCLUDED.lease_expires_at,
          last_attempt_at = now(), attempt_count = manekineko_indexer_webhook_deliveries.attempt_count + 1
        WHERE manekineko_indexer_webhook_deliveries.completed_at IS NULL
          AND manekineko_indexer_webhook_deliveries.lease_expires_at <= now()
          AND manekineko_indexer_webhook_deliveries.payload_hash = EXCLUDED.payload_hash
        RETURNING lease_token`, [delivery.deliveryId, delivery.payloadHash, delivery.signedAt, token]);
      if (claimed.rowCount === 1) return { state: "claimed", token };
      const existing = await pool.query<{ payload_hash: string; completed_at: Date | null }>(
        "SELECT payload_hash, completed_at FROM manekineko_indexer_webhook_deliveries WHERE delivery_id = $1", [delivery.deliveryId],
      );
      const row = existing.rows[0];
      if (!row) throw new Error("delivery_unavailable");
      if (row.payload_hash !== delivery.payloadHash) return { state: "conflict" };
      return { state: row.completed_at ? "completed" : "busy" };
    },
    async complete(deliveryId, token) {
      const result = await pool.query(`UPDATE manekineko_indexer_webhook_deliveries
        SET completed_at = now() WHERE delivery_id = $1 AND lease_token = $2 AND completed_at IS NULL
        AND lease_expires_at > now() RETURNING delivery_id`, [deliveryId, token]);
      return result.rowCount === 1;
    },
    async release(deliveryId, token) {
      await pool.query(`UPDATE manekineko_indexer_webhook_deliveries SET lease_expires_at = now()
        WHERE delivery_id = $1 AND lease_token = $2 AND completed_at IS NULL`, [deliveryId, token]);
    },
  };
}
