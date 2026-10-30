BEGIN;
SET LOCAL lock_timeout = '5s';
-- Admit the new, independently verified Mainnet contract. Historical identities
-- and network restrictions stay unchanged. This migration registers no source.
ALTER TABLE manekineko_nft_mirror_sources DROP CONSTRAINT manekineko_nft_mirror_sources_version_check;
ALTER TABLE manekineko_nft_mirror_sources ADD CONSTRAINT manekineko_nft_mirror_sources_version_check
 CHECK (version IN (12,13,14,16,17,18) AND (version NOT IN (16,17) OR chain_id=11155111) AND (version<>18 OR chain_id=1));
ALTER TABLE manekineko_nft_mirror_v16_collections DROP CONSTRAINT manekineko_nft_mirror_v16_collections_check;
ALTER TABLE manekineko_nft_mirror_v16_collections ADD CONSTRAINT manekineko_nft_mirror_v16_collections_check
 CHECK (chain_id IN (1,11155111) AND address=controller AND renderer=address);
ALTER TABLE manekineko_wallet_activity DROP CONSTRAINT manekineko_wallet_activity_chain_id_check;
ALTER TABLE manekineko_wallet_activity ADD CONSTRAINT manekineko_wallet_activity_chain_id_check CHECK (chain_id IN (1,11155111));
ALTER TABLE manekineko_social_senders DROP CONSTRAINT manekineko_social_senders_config_check;
ALTER TABLE manekineko_social_senders ADD CONSTRAINT manekineko_social_senders_config_check CHECK (
 jsonb_typeof(config)='object' AND ((config->>'version'='17' AND config->>'chainId'='11155111') OR (config->>'version'='18' AND config->>'chainId'='1'))
 AND config ?& ARRAY['version','chainId','controller','controllerCodeHash','appUrl','xAccountId']
 AND config - ARRAY['version','chainId','controller','controllerCodeHash','appUrl','xAccountId']='{}'::jsonb);
COMMIT;
