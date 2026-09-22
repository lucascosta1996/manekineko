-- Repeatable seed: existing configuration and deployment records are never reset.
-- Values match apps/web/lib/collections/catalog.json; round 1 matches round.example.json.
BEGIN;

INSERT INTO manekineko_networks (chain_id, name, currency_symbol, currency_decimals, explorer_url)
VALUES (11155111, 'Sepolia', 'ETH', 18, 'https://sepolia.etherscan.io')
ON CONFLICT (chain_id) DO NOTHING;

INSERT INTO manekineko_series (id, name, created_at, updated_at)
VALUES ('551c5df8-224c-4dca-b972-2fcaf01dc689', 'Manekineko', '2026-09-10T00:00:00Z', '2026-09-10T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO manekineko_collections
  (id, series_id, chain_id, round_id, slug, name, symbol, description, max_supply, mint_price_wei, mint_duration_seconds, reveal_delay_blocks, created_at, updated_at)
VALUES
  ('8fa5f8c0-6ef4-47f6-9af3-60b8101c9321', '551c5df8-224c-4dca-b972-2fcaf01dc689', 11155111, 1, 'manekineko-round-1', 'Manekineko Round 1', 'NEKO',
    'Four numbers. One greatest result. A finite collection of tickets, with every rule and every pixel destined for the chain.', 1000, 10000000000000000, 604800, 5, '2026-09-10T00:00:00Z', '2026-09-10T00:00:00Z'),
  ('bd7a641e-125b-4d83-a7ec-9a5c87622002', '551c5df8-224c-4dca-b972-2fcaf01dc689', 11155111, 2, 'manekineko-round-2', 'Manekineko Round 2', 'NEKO',
    'A fresh collection. A new sealed set of combinations. The next round is configured and ready for a future deployment.', 500, 20000000000000000, 604800, 5, '2026-09-10T00:00:00Z', '2026-09-10T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO manekineko_deployments (collection_id, chain_id, status, created_at, updated_at)
VALUES
  ('8fa5f8c0-6ef4-47f6-9af3-60b8101c9321', 11155111, 'undeployed', '2026-09-10T00:00:00Z', '2026-09-10T00:00:00Z'),
  ('bd7a641e-125b-4d83-a7ec-9a5c87622002', 11155111, 'undeployed', '2026-09-10T00:00:00Z', '2026-09-10T00:00:00Z')
ON CONFLICT (collection_id) DO NOTHING;

COMMIT;
