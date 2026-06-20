-- Impact Board foundation (Issue #14): one row per COMPLETED deed.
--
-- Players create impact; teams, locations, categories and time periods are all
-- ROLLUPS of these rows. We snapshot the player's team + location + the deed's
-- category AT COMPLETION TIME, so history stays correct even if the player later
-- changes team or moves city. Only completed deeds live here:
--   * a bingo-card deed marked complete  -> source_type = 'bingo_card'
--   * a quick action tapped              -> source_type = 'quick_action'
-- Open squares, purchases, referrals, partial progress and intentions never
-- create a row.
CREATE TABLE IF NOT EXISTS completed_deeds (
  id                          BIGSERIAL    PRIMARY KEY,
  player_id                   TEXT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id_at_completion       INTEGER      REFERENCES teams(id) ON DELETE SET NULL,
  source_type                 TEXT         NOT NULL CHECK (source_type IN ('bingo_card','quick_action')),
  deed_id                     INTEGER,     -- good_deeds.id (bingo-card deeds)
  quick_deed_id               INTEGER,     -- quick_deeds.id (quick actions)
  category                    TEXT,        -- denormalized category name at completion
  card_id                     INTEGER,     -- when source_type = 'bingo_card'
  cell_index                  INTEGER,
  city                        TEXT,
  province_state              TEXT,
  country_id                  INTEGER      REFERENCES countries(id) ON DELETE SET NULL,
  country_name                TEXT,        -- denormalized for fast rollups
  completed_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),
  is_hidden_from_impact_board BOOLEAN      NOT NULL DEFAULT false,
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Indexes for the Impact Board's filters and rollups (time, location, category,
-- team, deed, player). The board reads aggregates, never raw rows.
CREATE INDEX IF NOT EXISTS completed_deeds_completed_at_idx ON completed_deeds (completed_at);
CREATE INDEX IF NOT EXISTS completed_deeds_player_idx       ON completed_deeds (player_id);
CREATE INDEX IF NOT EXISTS completed_deeds_team_idx         ON completed_deeds (team_id_at_completion);
CREATE INDEX IF NOT EXISTS completed_deeds_category_idx     ON completed_deeds (category);
CREATE INDEX IF NOT EXISTS completed_deeds_country_idx      ON completed_deeds (country_id);
CREATE INDEX IF NOT EXISTS completed_deeds_deed_idx         ON completed_deeds (deed_id);
CREATE INDEX IF NOT EXISTS completed_deeds_geo_idx          ON completed_deeds (country_id, province_state, city);
CREATE INDEX IF NOT EXISTS completed_deeds_visible_idx      ON completed_deeds (is_hidden_from_impact_board);
