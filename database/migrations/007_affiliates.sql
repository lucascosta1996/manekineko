-- Affiliate permissions are separate from mint accounting. Live balances are read from Ethereum.
BEGIN;

CREATE TABLE manekineko_affiliate_programs (
  collection_id uuid PRIMARY KEY REFERENCES manekineko_collections(id),
  mode text NOT NULL CHECK (mode IN ('demo', 'live')),
  contract_version text NOT NULL DEFAULT 'affiliate-v3' CHECK (contract_version = 'affiliate-v3'),
  max_slots integer NOT NULL DEFAULT 10 CHECK (max_slots BETWEEN 1 AND 100),
  commission_bps integer NOT NULL DEFAULT 100 CHECK (commission_bps = 100),
  enrollment_enabled boolean NOT NULL DEFAULT false,
  enrollment_signer text CHECK (enrollment_signer ~ '^0x[0-9a-f]{40}$' AND enrollment_signer <> '0x0000000000000000000000000000000000000000'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((mode = 'demo' AND enrollment_signer IS NULL AND NOT enrollment_enabled) OR (mode = 'live' AND enrollment_signer IS NOT NULL))
);

CREATE FUNCTION manekineko_validate_affiliate_program() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE config manekineko_collections%ROWTYPE;
BEGIN
  SELECT * INTO STRICT config FROM manekineko_collections WHERE id = NEW.collection_id;
  IF NEW.mode = 'live' AND (config.algorithm_version <> 'unique-rank-v2' OR config.chain_id NOT IN (1,11155111) OR mod(config.mint_price_wei,100) <> 0) THEN
    RAISE EXCEPTION 'Live affiliate programs require Ethereum V2 ranking and exact one percent mint prices';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.collection_id <> OLD.collection_id OR NEW.mode <> OLD.mode OR NEW.max_slots <> OLD.max_slots OR NEW.enrollment_signer IS DISTINCT FROM OLD.enrollment_signer) THEN
    RAISE EXCEPTION 'Affiliate program terms are immutable; create a new collection';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER manekineko_affiliate_program_valid BEFORE INSERT OR UPDATE ON manekineko_affiliate_programs
FOR EACH ROW EXECUTE FUNCTION manekineko_validate_affiliate_program();

-- Fictional UI examples only: cannot authorize enrollment or a payment and never overwrite NFT history.
CREATE TABLE manekineko_affiliate_demo_accounts (
  collection_id uuid NOT NULL REFERENCES manekineko_affiliate_programs(collection_id),
  scenario text NOT NULL CHECK (scenario IN ('no_referrals','pending_sellout','claimable','paid','refunded')),
  wallet text NOT NULL CHECK (wallet ~ '^0x[0-9a-f]{40}$' AND wallet <> '0x0000000000000000000000000000000000000000'),
  affiliate_id integer NOT NULL CHECK (affiliate_id BETWEEN 1 AND 100),
  enrolled_slots integer NOT NULL CHECK (enrolled_slots BETWEEN 1 AND 100),
  accrued_wei numeric(78,0) NOT NULL CHECK (accrued_wei BETWEEN 0 AND 115792089237316195423570985008687907853269984665640564039457584007913129639935),
  claimed_wei numeric(78,0) NOT NULL DEFAULT 0 CHECK (claimed_wei BETWEEN 0 AND accrued_wei),
  sold_out boolean NOT NULL,
  refundable boolean NOT NULL,
  PRIMARY KEY (collection_id, scenario),
  CHECK (NOT (sold_out AND refundable)),
  CHECK (claimed_wei = 0 OR sold_out),
  CHECK ((scenario = 'no_referrals' AND accrued_wei = 0 AND claimed_wei = 0 AND NOT refundable AND NOT sold_out)
    OR (scenario = 'pending_sellout' AND accrued_wei > 0 AND claimed_wei = 0 AND NOT refundable AND NOT sold_out)
    OR (scenario = 'claimable' AND accrued_wei > claimed_wei AND sold_out AND NOT refundable)
    OR (scenario = 'paid' AND accrued_wei > 0 AND accrued_wei = claimed_wei AND sold_out AND NOT refundable)
    OR (scenario = 'refunded' AND claimed_wei = 0 AND refundable AND NOT sold_out))
);
CREATE FUNCTION manekineko_validate_affiliate_demo() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE program manekineko_affiliate_programs%ROWTYPE; price numeric; supply integer;
BEGIN
  SELECT * INTO STRICT program FROM manekineko_affiliate_programs WHERE collection_id = NEW.collection_id;
  SELECT mint_price_wei,max_supply INTO STRICT price,supply FROM manekineko_collections WHERE id = NEW.collection_id;
  IF program.mode <> 'demo' OR NEW.affiliate_id > NEW.enrolled_slots OR NEW.enrolled_slots > program.max_slots
    OR mod(price,100) <> 0 OR mod(NEW.accrued_wei,price / 100) <> 0 OR NEW.accrued_wei > price / 100 * supply THEN
    RAISE EXCEPTION 'Invalid fictional affiliate fixture';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER manekineko_affiliate_demo_valid BEFORE INSERT OR UPDATE ON manekineko_affiliate_demo_accounts
FOR EACH ROW EXECUTE FUNCTION manekineko_validate_affiliate_demo();

CREATE TABLE manekineko_affiliate_challenges (
  id uuid PRIMARY KEY,
  collection_id uuid NOT NULL REFERENCES manekineko_affiliate_programs(collection_id),
  wallet text NOT NULL CHECK (wallet ~ '^0x[0-9a-f]{40}$' AND wallet <> '0x0000000000000000000000000000000000000000'),
  chain_id bigint NOT NULL CHECK (chain_id IN (1,11155111)),
  contract_address text NOT NULL CHECK (contract_address ~ '^0x[0-9a-f]{40}$' AND contract_address <> '0x0000000000000000000000000000000000000000'),
  origin text NOT NULL CHECK (origin ~ '^https://'),
  nonce text NOT NULL UNIQUE CHECK (nonce ~ '^0x[0-9a-f]{64}$'),
  ip_digest text NOT NULL CHECK (ip_digest ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '10 minutes'),
  CHECK (consumed_at IS NULL OR consumed_at <= expires_at)
);
CREATE INDEX manekineko_affiliate_challenges_expiry_idx ON manekineko_affiliate_challenges(expires_at);
CREATE FUNCTION manekineko_validate_affiliate_challenge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM manekineko_affiliate_programs p JOIN manekineko_deployments d USING(collection_id)
    WHERE p.collection_id = NEW.collection_id AND p.mode = 'live' AND p.enrollment_enabled AND d.status = 'deployed'
      AND d.chain_id = NEW.chain_id AND d.contract_address = NEW.contract_address) THEN
    RAISE EXCEPTION 'Enrollment challenge requires an enabled deployed affiliate program';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.id <> OLD.id OR NEW.collection_id <> OLD.collection_id OR NEW.wallet <> OLD.wallet OR NEW.chain_id <> OLD.chain_id OR NEW.contract_address <> OLD.contract_address OR NEW.origin <> OLD.origin OR NEW.nonce <> OLD.nonce OR NEW.ip_digest <> OLD.ip_digest OR NEW.expires_at <> OLD.expires_at OR NEW.created_at <> OLD.created_at OR OLD.consumed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Enrollment challenges are immutable and single use';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER manekineko_affiliate_challenge_valid BEFORE INSERT OR UPDATE ON manekineko_affiliate_challenges
FOR EACH ROW EXECUTE FUNCTION manekineko_validate_affiliate_challenge();

-- Atomic fixed-window counters survive concurrent serverless requests and cold starts.
-- Store a keyed hash, never raw addresses from network headers. No one-IP-one-person rule.
CREATE TABLE manekineko_affiliate_rate_limits (
  collection_id uuid NOT NULL REFERENCES manekineko_affiliate_programs(collection_id),
  scope text NOT NULL CHECK (scope IN ('challenge_ip','challenge_wallet','permit_ip','permit_wallet')),
  subject_hash text NOT NULL CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 1000),
  PRIMARY KEY (collection_id, scope, subject_hash, window_start)
);
CREATE INDEX manekineko_affiliate_rate_expiry_idx ON manekineko_affiliate_rate_limits(window_start);

COMMIT;
