ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verify_token TEXT,
  ADD COLUMN IF NOT EXISTS email_verify_token_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_email_verify_token ON users (email_verify_token);
