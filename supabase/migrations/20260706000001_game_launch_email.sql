-- Per-cycle dedupe guard for the automated "new game launch" email.
-- Card generation is lazy/per-player (POST /generate-card), so there is no
-- single bulk "cards created" event — instead, whichever player's card
-- generation is the first to successfully claim a given week_year here is
-- the one that triggers the one-time blast to all verified players. The
-- PRIMARY KEY is the actual atomicity guarantee: a concurrent second claim
-- for the same week_year fails the insert and simply doesn't send again.
CREATE TABLE IF NOT EXISTS game_launch_notifications (
  week_year TEXT PRIMARY KEY,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
