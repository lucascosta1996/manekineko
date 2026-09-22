-- Repeatable, read-only demonstration states. These are not deployed programs or real earnings.
BEGIN;
INSERT INTO manekineko_affiliate_programs(collection_id,mode,max_slots)
SELECT id,'demo',10 FROM manekineko_collections
WHERE id IN ('8fa5f8c0-6ef4-47f6-9af3-60b8101c9321','bd7a641e-125b-4d83-a7ec-9a5c87622002')
ON CONFLICT (collection_id) DO NOTHING;
INSERT INTO manekineko_affiliate_demo_accounts(collection_id,scenario,wallet,affiliate_id,enrolled_slots,accrued_wei,claimed_wei,sold_out,refundable)
SELECT p.collection_id, fixture.scenario, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 3, 7,
  (c.mint_price_wei / 100) * fixture.mints, (c.mint_price_wei / 100) * fixture.paid_mints, fixture.sold_out, fixture.refundable
FROM manekineko_affiliate_programs p JOIN manekineko_collections c ON c.id = p.collection_id
CROSS JOIN (VALUES
  ('no_referrals',0,0,false,false),('pending_sellout',12,0,false,false),
  ('claimable',12,0,true,false),('paid',12,12,true,false),('refunded',12,0,false,true)
) AS fixture(scenario,mints,paid_mints,sold_out,refundable)
WHERE p.mode = 'demo' AND p.contract_version = 'affiliate-v3' AND p.collection_id IN ('8fa5f8c0-6ef4-47f6-9af3-60b8101c9321','bd7a641e-125b-4d83-a7ec-9a5c87622002')
ON CONFLICT (collection_id,scenario) DO NOTHING;
COMMIT;
