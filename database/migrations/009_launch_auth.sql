BEGIN;

-- Operator accounts are provisioned by the private CLI; there is no public registration.
CREATE TABLE manekineko_launch_users (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z][a-z0-9_.-]{2,63}$'),
  password_hash text NOT NULL CHECK (password_hash ~ '^scrypt\$131072\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$'),
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE manekineko_launch_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES manekineko_launch_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '8 hours')
);
CREATE INDEX manekineko_launch_sessions_user ON manekineko_launch_sessions(user_id, created_at DESC);
CREATE INDEX manekineko_launch_sessions_expiry ON manekineko_launch_sessions(expires_at);

CREATE TABLE manekineko_launch_login_limits (
  scope text NOT NULL CHECK (scope IN ('global', 'account', 'network')),
  subject_hash text NOT NULL CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL CHECK (attempts > 0),
  PRIMARY KEY (scope, subject_hash)
);

COMMIT;
