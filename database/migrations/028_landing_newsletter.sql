BEGIN;

-- Registration records explicit consent to the adjacent landing form copy.
-- The public route cannot list, update, or remove subscriber addresses.
CREATE TABLE manekineko_newsletter_subscribers (
  email text PRIMARY KEY CHECK (
    email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254
    AND email !~ '[[:space:]]' AND email ~ '^[^@]+@[^@]+\.[^@]+$'
  ),
  source text NOT NULL DEFAULT 'landing' CHECK (source = 'landing'),
  consent_version text NOT NULL DEFAULT 'launch-updates-v1' CHECK (consent_version = 'launch-updates-v1'),
  subscribed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE manekineko_newsletter_rate_limits (
  subject_hash text PRIMARY KEY CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 5)
);
CREATE INDEX manekineko_newsletter_rate_expiry ON manekineko_newsletter_rate_limits(window_started_at);

REVOKE ALL ON manekineko_newsletter_subscribers, manekineko_newsletter_rate_limits FROM PUBLIC;

-- Provision a separate restricted Landing login outside this migration.
-- Its only table grants are INSERT(email) on subscribers and
-- SELECT, INSERT, UPDATE, DELETE on newsletter_rate_limits.
-- Never reuse a database owner, Web, Launch or Indexer credential in Landing.

COMMIT;
