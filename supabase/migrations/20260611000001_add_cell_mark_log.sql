CREATE TABLE IF NOT EXISTS cell_mark_log (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  card_id INTEGER NOT NULL,
  cell_index INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('mark', 'void')),
  note TEXT,
  voided_by TEXT,
  void_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cell_mark_log_user ON cell_mark_log (user_id);
CREATE INDEX IF NOT EXISTS cell_mark_log_card ON cell_mark_log (card_id);
