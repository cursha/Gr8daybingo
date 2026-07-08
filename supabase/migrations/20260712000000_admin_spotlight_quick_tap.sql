-- Admin Spotlight Deed: a 4th Quick Tap slot, admin-set, same deed shown on
-- every player's board at once. Stamped with the week it was set for
-- (getCurrentWeekYear() — same convention as the weekly draw) so it expires
-- automatically at the weekly reset with no cron job or cleanup step: a
-- player only ever sees it while the stamped week matches the current one.
CREATE TABLE IF NOT EXISTS admin_spotlight_quick_tap (
  id INTEGER PRIMARY KEY DEFAULT 1,
  deed_id INTEGER REFERENCES good_deeds(id),
  week_year TEXT,
  set_at TIMESTAMPTZ,
  CONSTRAINT admin_spotlight_quick_tap_single_row CHECK (id = 1)
);
INSERT INTO admin_spotlight_quick_tap (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
