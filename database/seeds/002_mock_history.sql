-- Explicit sample archive, never claims a deployment, transaction or chain proof.
-- Repeatable: existing records are preserved, and current mint rounds stay intact.
BEGIN;

INSERT INTO manekineko_networks (chain_id, name, currency_symbol, currency_decimals, explorer_url)
VALUES (11155111, 'Sepolia', 'ETH', 18, 'https://sepolia.etherscan.io')
ON CONFLICT (chain_id) DO NOTHING;

INSERT INTO manekineko_series (id, name, created_at, updated_at)
VALUES ('942bc2a0-8b13-46a0-9434-05014f9b2026', 'Manekineko Archive Preview', '2026-07-01T12:00:00Z', '2026-07-01T12:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO manekineko_collection_history
  (id, series_id, chain_id, round_id, name, symbol, max_supply, total_minted, mint_price_wei, total_refunded_wei, status, opened_at, closed_at, is_mock)
VALUES
  ('ad348b5a-8ad4-4719-82c4-0e2d58002001', '942bc2a0-8b13-46a0-9434-05014f9b2026', 11155111, 1, 'Manekineko Round 1', 'NEKO', 1000, 1000, 10000000000000000, 0, 'completed', '2026-07-01T12:00:00Z', '2026-07-06T16:20:00Z', true),
  ('ad348b5a-8ad4-4719-82c4-0e2d58002002', '942bc2a0-8b13-46a0-9434-05014f9b2026', 11155111, 2, 'Manekineko Round 2', 'NEKO', 500, 500, 20000000000000000, 0, 'completed', '2026-07-08T12:00:00Z', '2026-07-12T20:15:00Z', true),
  ('ad348b5a-8ad4-4719-82c4-0e2d58002003', '942bc2a0-8b13-46a0-9434-05014f9b2026', 11155111, 3, 'Manekineko Round 3', 'NEKO', 2000, 2000, 7500000000000000, 0, 'completed', '2026-07-15T12:00:00Z', '2026-07-21T11:40:00Z', true),
  ('ad348b5a-8ad4-4719-82c4-0e2d58002004', '942bc2a0-8b13-46a0-9434-05014f9b2026', 11155111, 4, 'Manekineko Round 4', 'NEKO', 400, 93, 5000000000000000, 465000000000000000, 'refunded', '2026-07-22T12:00:00Z', '2026-07-30T14:00:00Z', true),
  ('ad348b5a-8ad4-4719-82c4-0e2d58002005', '942bc2a0-8b13-46a0-9434-05014f9b2026', 11155111, 5, 'Manekineko Round 5', 'NEKO', 750, 750, 8000000000000000, 0, 'completed', '2026-07-31T12:00:00Z', '2026-08-04T17:35:00Z', true),
  ('ad348b5a-8ad4-4719-82c4-0e2d58002006', '942bc2a0-8b13-46a0-9434-05014f9b2026', 11155111, 6, 'Manekineko Round 6', 'NEKO', 1000, 1000, 10000000000000000, 0, 'completed', '2026-08-06T12:00:00Z', '2026-08-10T13:50:00Z', true),
  ('ad348b5a-8ad4-4719-82c4-0e2d58002007', '942bc2a0-8b13-46a0-9434-05014f9b2026', 11155111, 7, 'Manekineko Round 7', 'NEKO', 600, 311, 10000000000000000, 3110000000000000000, 'refunded', '2026-08-12T12:00:00Z', '2026-08-20T10:00:00Z', true),
  ('ad348b5a-8ad4-4719-82c4-0e2d58002008', '942bc2a0-8b13-46a0-9434-05014f9b2026', 11155111, 8, 'Manekineko Round 8', 'NEKO', 1500, 1500, 12000000000000000, 0, 'completed', '2026-08-22T12:00:00Z', '2026-08-27T18:45:00Z', true)
ON CONFLICT (id) DO NOTHING;

-- Sample tuples obey the exact Solidity byte encoding and score formula.
-- Prize recipients are unmistakable dummy addresses, without fake explorer links.
WITH samples (collection_id, token_id, a, b, c, d, recipient, paid_at) AS (
  VALUES
    ('ad348b5a-8ad4-4719-82c4-0e2d58002001'::uuid, 824, 256, 250, 249, 255, '0x1111111111111111111111111111111111111111', '2026-07-06T16:20:00Z'::timestamptz),
    ('ad348b5a-8ad4-4719-82c4-0e2d58002002'::uuid, 64, 242, 254, 256, 248, '0x2222222222222222222222222222222222222222', '2026-07-12T20:15:00Z'::timestamptz),
    ('ad348b5a-8ad4-4719-82c4-0e2d58002003'::uuid, 1904, 255, 256, 252, 254, '0x3333333333333333333333333333333333333333', '2026-07-21T11:40:00Z'::timestamptz),
    ('ad348b5a-8ad4-4719-82c4-0e2d58002005'::uuid, 137, 248, 255, 251, 252, '0x4444444444444444444444444444444444444444', '2026-08-04T17:35:00Z'::timestamptz),
    ('ad348b5a-8ad4-4719-82c4-0e2d58002006'::uuid, 613, 256, 253, 254, 251, '0x5555555555555555555555555555555555555555', '2026-08-10T13:50:00Z'::timestamptz),
    ('ad348b5a-8ad4-4719-82c4-0e2d58002008'::uuid, 42, 256, 255, 254, 256, '0x1111111111111111111111111111111111111111', '2026-08-27T18:45:00Z'::timestamptz)
), encoded AS (
  SELECT *, (a - 1) * 16777216::bigint + (b - 1) * 65536::bigint + (c - 1) * 256 + d - 1 AS code FROM samples
)
INSERT INTO manekineko_history_winners
  (collection_id, token_id, number_a, number_b, number_c, number_d, combination_code, score, prize_recipient, prize_paid_wei, paid_at)
SELECT samples.collection_id, token_id, a, b, c, d, code,
  (a * b + c * d) * 4294967296::bigint + code,
  recipient, archive.total_minted * archive.mint_price_wei / 2, paid_at
FROM encoded samples JOIN manekineko_collection_history archive ON archive.id = samples.collection_id
WHERE archive.is_mock AND archive.status = 'completed'
ON CONFLICT (collection_id) DO NOTHING;

COMMIT;
