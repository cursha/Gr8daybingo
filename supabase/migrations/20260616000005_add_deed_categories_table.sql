-- Deed categories with active/inactive toggle
CREATE TABLE IF NOT EXISTS deed_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO deed_categories (name, description, is_active) VALUES
  ('NOTICE',    'Pay attention to people and opportunities around you.', TRUE),
  ('CONNECT',   'Build or strengthen relationships.', TRUE),
  ('CELEBRATE', 'Recognize and acknowledge others.', TRUE),
  ('ENCOURAGE', 'Lift people up and increase confidence.', TRUE),
  ('HELP',      'Provide practical assistance.', TRUE),
  ('DELIGHT',   'Create unexpected moments of joy or fun.', TRUE)
ON CONFLICT (name) DO NOTHING;
