-- ============================================================
-- Admin login lockout, scoped per-visitor instead of globally.
--
-- The old admin_lockout table (20260706000000) is a single row: 5 wrong
-- guesses from ANYONE locks the admin panel for EVERYONE until the emailed
-- unlock link is used. That's a real denial-of-service knob handed to any
-- stranger who finds the login page. This table keys the same lockout
-- logic by bucket_key (the guesser's IP) instead, so a stranger guessing
-- wrong only ever locks themselves out — the real admin, on a different
-- connection, is unaffected. The old admin_lockout table is left in place
-- unused rather than dropped, since nothing depends on removing it.
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_lockout_by_ip (
  id SERIAL PRIMARY KEY,
  bucket_key TEXT NOT NULL UNIQUE,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  unlock_token TEXT UNIQUE,
  unlock_token_expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_lockout_by_ip_bucket_key ON admin_lockout_by_ip(bucket_key);

ALTER TABLE IF EXISTS public.admin_lockout_by_ip ENABLE ROW LEVEL SECURITY;
