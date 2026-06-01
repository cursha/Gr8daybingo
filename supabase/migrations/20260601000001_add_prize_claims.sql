CREATE TABLE IF NOT EXISTS prize_claims (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  week_year TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  mailing_address TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS prize_claims_user_week
  ON prize_claims (user_id, week_year);
