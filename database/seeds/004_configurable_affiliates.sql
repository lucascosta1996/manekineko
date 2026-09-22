-- Upgrade only the explicitly undeployed demonstration program; preserve original NFT algorithm/prize.
BEGIN;
UPDATE manekineko_affiliate_programs SET contract_version='affiliate-v4',affiliate_rates_bps=ARRAY[100,200,150,100,200,0,100,100,100,100]
WHERE collection_id='8fa5f8c0-6ef4-47f6-9af3-60b8101c9321' AND mode='demo' AND contract_version='affiliate-v3';
UPDATE manekineko_affiliate_demo_accounts a SET
  accrued_wei=a.referred_mints*c.mint_price_wei*p.affiliate_rates_bps[a.affiliate_id]/10000,
  claimed_wei=CASE WHEN a.scenario='paid' THEN a.referred_mints*c.mint_price_wei*p.affiliate_rates_bps[a.affiliate_id]/10000 ELSE 0 END
FROM manekineko_collections c JOIN manekineko_affiliate_programs p ON p.collection_id=c.id
WHERE a.collection_id=c.id AND p.mode='demo' AND p.contract_version='affiliate-v4';
INSERT INTO manekineko_affiliate_demo_accounts(collection_id,scenario,wallet,affiliate_id,enrolled_slots,accrued_wei,claimed_wei,sold_out,refundable,referred_mints)
SELECT collection_id,'no_commission','0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',6,7,0,0,false,false,12
FROM manekineko_affiliate_programs WHERE collection_id='8fa5f8c0-6ef4-47f6-9af3-60b8101c9321' AND mode='demo' AND contract_version='affiliate-v4'
ON CONFLICT(collection_id,scenario) DO NOTHING;
COMMIT;
