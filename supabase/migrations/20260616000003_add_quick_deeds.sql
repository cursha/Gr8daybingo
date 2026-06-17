-- Quick deed buttons: configurable acts of kindness outside the bingo card
CREATE TABLE IF NOT EXISTS quick_deeds (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '❤️',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the initial 3 buttons
INSERT INTO quick_deeds (label, emoji, display_order) VALUES
  ('Buy a Coffee', '☕', 1),
  ('Smile to a Stranger', '😊', 2),
  ('Call an Old Friend', '📞', 3);

-- Log every tap
CREATE TABLE IF NOT EXISTS quick_deed_logs (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quick_deed_id INT NOT NULL REFERENCES quick_deeds(id) ON DELETE CASCADE,
  tapped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quick_deed_logs_user_idx ON quick_deed_logs(user_id);
CREATE INDEX IF NOT EXISTS quick_deed_logs_deed_idx ON quick_deed_logs(quick_deed_id);
CREATE INDEX IF NOT EXISTS quick_deed_logs_tapped_at_idx ON quick_deed_logs(tapped_at);
