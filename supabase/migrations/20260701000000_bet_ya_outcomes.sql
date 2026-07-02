-- I Bet Ya outcomes table: replaces dare_outcome_* game_config keys.
-- Admin creates/edits rows; odds_percent across active rows must sum to 100.
-- Each dollar amount is scoped to the action_type that uses it:
--   credit_amount  -> fund_credit (added to wallet)
--   remove_amount  -> remove_funds (deducted from wallet, floored at $0)
--   reward_amount  -> refer_friend (paid to the referrer on an instant email match)
CREATE TABLE IF NOT EXISTS bet_ya_outcomes (
  id            SERIAL        PRIMARY KEY,
  label         TEXT          NOT NULL,
  odds_percent  NUMERIC(5,2)  NOT NULL DEFAULT 0,
  action_type   TEXT          NOT NULL CHECK (action_type IN (
                  'free_square','refer_friend','fund_credit',
                  'remove_funds','replace_three','nothing')),
  credit_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  remove_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  reward_amount NUMERIC(10,2) NOT NULL DEFAULT 5,
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Default seed: active rows sum to exactly 100%
INSERT INTO bet_ya_outcomes (label, odds_percent, action_type, credit_amount, remove_amount, reward_amount, is_active) VALUES
  ('Fund Credit!',    25, 'fund_credit',   10.00, 0,    0,    TRUE),
  ('Oops, Pay Up!',   20, 'remove_funds',   0,    0.50, 0,    TRUE),
  ('Refer a Friend!', 15, 'refer_friend',   0,    0,    5.00, TRUE),
  ('Free Square!',    20, 'free_square',    0,    0,    0,    TRUE),
  ('Mix It Up!',      15, 'replace_three',  0,    0,    0,    TRUE),
  ('No Effect',        5, 'nothing',        0,    0,    0,    TRUE);
