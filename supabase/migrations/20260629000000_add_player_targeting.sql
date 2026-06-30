-- Player targeting dimensions: attributes, values, and assignments to users and deeds

CREATE TABLE IF NOT EXISTS targeting_attributes (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS targeting_values (
  id            SERIAL PRIMARY KEY,
  attribute_id  INTEGER NOT NULL REFERENCES targeting_attributes(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  description   TEXT,
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attribute_id, label)
);

-- At most one default value per attribute
CREATE UNIQUE INDEX IF NOT EXISTS uq_targeting_values_one_default
  ON targeting_values (attribute_id)
  WHERE is_default = TRUE;

-- One targeting value per attribute per user
CREATE TABLE IF NOT EXISTS user_targeting_values (
  id                  SERIAL PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attribute_id        INTEGER NOT NULL REFERENCES targeting_attributes(id) ON DELETE CASCADE,
  targeting_value_id  INTEGER NOT NULL REFERENCES targeting_values(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, attribute_id)
);

-- Deeds can be restricted to one or more targeting values
CREATE TABLE IF NOT EXISTS deed_targeting_values (
  id                  SERIAL PRIMARY KEY,
  deed_id             INTEGER NOT NULL REFERENCES good_deeds(id) ON DELETE CASCADE,
  targeting_value_id  INTEGER NOT NULL REFERENCES targeting_values(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (deed_id, targeting_value_id)
);

-- Seed attributes
INSERT INTO targeting_attributes (name, display_order) VALUES
  ('Age Bracket',         1),
  ('Relationship',        2),
  ('Kids',                3),
  ('Place of Employment', 4)
ON CONFLICT (name) DO NOTHING;

-- Seed values (* marks the default used when a user has not set a preference)
INSERT INTO targeting_values (attribute_id, label, description, is_default, display_order)
SELECT id, 'Teen',        '17-21', FALSE, 1 FROM targeting_attributes WHERE name = 'Age Bracket'
UNION ALL
SELECT id, 'Early Adult', '22-30', FALSE, 2 FROM targeting_attributes WHERE name = 'Age Bracket'
UNION ALL
SELECT id, 'Adult',       '31-55', TRUE,  3 FROM targeting_attributes WHERE name = 'Age Bracket'
UNION ALL
SELECT id, 'Senior',      '56+',   FALSE, 4 FROM targeting_attributes WHERE name = 'Age Bracket'
UNION ALL
SELECT id, 'Single',      NULL,    TRUE,  1 FROM targeting_attributes WHERE name = 'Relationship'
UNION ALL
SELECT id, 'Partnered',   NULL,    FALSE, 2 FROM targeting_attributes WHERE name = 'Relationship'
UNION ALL
SELECT id, 'Yes',         NULL,    FALSE, 1 FROM targeting_attributes WHERE name = 'Kids'
UNION ALL
SELECT id, 'No',          NULL,    TRUE,  2 FROM targeting_attributes WHERE name = 'Kids'
UNION ALL
SELECT id, 'Home',        NULL,    FALSE, 1 FROM targeting_attributes WHERE name = 'Place of Employment'
UNION ALL
SELECT id, 'Office',      NULL,    FALSE, 2 FROM targeting_attributes WHERE name = 'Place of Employment'
UNION ALL
SELECT id, 'NA',          'No job', TRUE, 3 FROM targeting_attributes WHERE name = 'Place of Employment'
ON CONFLICT (attribute_id, label) DO NOTHING;
