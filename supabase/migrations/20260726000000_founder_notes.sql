-- Founder Notes: a personal, AI-drafted note "from Curt" triggered by a
-- random slice of deed completions (founder_note_pct in game_configs, same
-- percentage-setting pattern as weekly_update_percentage). Capped at one per
-- player per day. Queued with a randomized 12-24h delay so it doesn't read
-- as an instant bot reply, then picked up by the hourly send-founder-notes
-- cron job — see 20260726000001_schedule_send_founder_notes.sql.

CREATE TABLE IF NOT EXISTS founder_note_queue (
  id                  BIGSERIAL    PRIMARY KEY,
  completed_deed_id   BIGINT       NOT NULL REFERENCES completed_deeds(id) ON DELETE CASCADE,
  user_id             TEXT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deed_text_snapshot  TEXT         NOT NULL,
  scheduled_send_at   TIMESTAMPTZ  NOT NULL,
  generated_message   TEXT,
  sent_at             TIMESTAMPTZ,
  status              TEXT         NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- The hourly job's core query: pending rows due to send.
CREATE INDEX IF NOT EXISTS founder_note_queue_due_idx ON founder_note_queue (status, scheduled_send_at);
-- The 1/day-per-player cap check in recordCompletedDeed.
CREATE INDEX IF NOT EXISTS founder_note_queue_user_idx ON founder_note_queue (user_id, scheduled_send_at);

INSERT INTO game_configs (config_key, config_value, description) VALUES
  ('founder_note_pct', '5', 'Percent chance (0-100) that completing a deed queues a personal AI-drafted note from Curt, capped at one per player per day.')
ON CONFLICT (config_key) DO NOTHING;
