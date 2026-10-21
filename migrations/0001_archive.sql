-- Editorial drafts remain private. Public collections are still built from source.
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status = 'draft'),
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  created_at TEXT NOT NULL
);
CREATE INDEX posts_slug ON posts(slug);

CREATE TABLE models (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status = 'draft'),
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  created_at TEXT NOT NULL
);
CREATE INDEX models_slug ON models(slug);

CREATE TABLE benchmark_runs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  -- References may point to a build-time model that has no D1 draft.
  model_slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status = 'draft'),
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  created_at TEXT NOT NULL
);
CREATE INDEX benchmark_runs_model ON benchmark_runs(model_slug);

CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'claim' CHECK (status IN ('claim', 'needs-information', 'rejected')),
  submission_json TEXT NOT NULL CHECK (json_valid(submission_json)),
  challenge_version INTEGER NOT NULL DEFAULT 1 CHECK (challenge_version = 1),
  nonce TEXT NOT NULL UNIQUE,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL CHECK (expires_at > issued_at),
  claim_digest TEXT NOT NULL,
  challenge_token TEXT NOT NULL,
  -- Reserved for the future authenticated runner; intake/review cannot consume a nonce.
  nonce_consumed_at TEXT,
  nonce_job_id TEXT UNIQUE,
  CHECK ((nonce_consumed_at IS NULL) = (nonce_job_id IS NULL))
);
CREATE INDEX submissions_digest_expiry ON submissions(claim_digest, expires_at);
CREATE INDEX submissions_status_created ON submissions(status, created_at);

CREATE TABLE submission_reviews (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  decision TEXT NOT NULL CHECK (decision IN ('needs-information', 'rejected')),
  note TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX submission_reviews_claim ON submission_reviews(submission_id, created_at);

CREATE TABLE submission_limits (
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  kind TEXT NOT NULL CHECK (kind IN ('ip', 'endpoint')),
  key TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (submission_id, kind)
);
CREATE INDEX submission_limits_key_time ON submission_limits(key, at);

-- These guards execute inside the write transaction, including concurrent Workers.
CREATE TRIGGER submissions_active_challenge
BEFORE INSERT ON submissions
WHEN EXISTS (SELECT 1 FROM submissions WHERE claim_digest = NEW.claim_digest AND expires_at > NEW.issued_at)
BEGIN
  SELECT RAISE(ABORT, 'OWA_ACTIVE_CHALLENGE');
END;

CREATE TRIGGER submission_limits_quota
BEFORE INSERT ON submission_limits
WHEN (SELECT count(*) FROM submission_limits
      WHERE key = NEW.key AND kind = NEW.kind
        AND at > NEW.at - CASE NEW.kind WHEN 'ip' THEN 3600000 ELSE 86400000 END)
     >= CASE NEW.kind WHEN 'ip' THEN 5 ELSE 10 END
BEGIN
  SELECT RAISE(ABORT, 'OWA_RATE_LIMIT');
END;

CREATE TRIGGER submissions_frozen_declaration
BEFORE UPDATE OF id, created_at, submission_json, challenge_version, nonce, issued_at,
                 expires_at, claim_digest, challenge_token ON submissions
BEGIN
  SELECT RAISE(ABORT, 'OWA_IMMUTABLE_CLAIM');
END;

CREATE TRIGGER submission_reviews_no_update
BEFORE UPDATE ON submission_reviews
BEGIN
  SELECT RAISE(ABORT, 'OWA_APPEND_ONLY_REVIEW');
END;
