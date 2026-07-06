-- Lockout state (single row, keyed id=1)
CREATE TABLE IF NOT EXISTS admin_lockout (
  id INTEGER PRIMARY KEY DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  unlock_token TEXT,
  unlock_token_expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT admin_lockout_single_row CHECK (id = 1)
);
INSERT INTO admin_lockout (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Password reset tokens (separate from player password_reset_tokens,
-- since admin auth isn't tied to a users.id row)
CREATE TABLE IF NOT EXISTS admin_password_reset_tokens (
  id SERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_password_reset_tokens_token ON admin_password_reset_tokens (token);

-- Where lockout/reset emails go. A table (not a single game_configs value)
-- so a second admin can be added later without any code change.
CREATE TABLE IF NOT EXISTS admin_alert_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO admin_alert_recipients (email, is_active)
VALUES ('curt.skene@curtskene.com', TRUE)
ON CONFLICT (email) DO NOTHING;
