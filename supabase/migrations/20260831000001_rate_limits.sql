-- ============================================================
-- Generic rate-limit tracker, used to slow down password-guessing on
-- login and bot account creation on registration.
--
-- One bucket per thing being limited (e.g. "login:someone@example.com"
-- or "register:203.0.113.4"). A bucket that hits its attempt cap within
-- its time window gets a locked_until timestamp; after that time passes,
-- the next attempt starts a fresh window automatically. No admin
-- involvement needed to clear it, unlike admin_lockout (that one is a
-- single low-volume account where a human-verified email unlock makes
-- sense; this covers many player accounts and arbitrary IPs, so lockouts
-- have to expire on their own).
-- ============================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  id SERIAL PRIMARY KEY,
  bucket_key TEXT NOT NULL UNIQUE,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_bucket_key ON rate_limits(bucket_key);

ALTER TABLE IF EXISTS public.rate_limits ENABLE ROW LEVEL SECURITY;
