-- Quick Tap buttons are small and fixed-size; deed_text runs 50-70+ chars and
-- was never going to fit reliably. quick_tap_label is a separate, enforced-
-- short field used only for Quick Tap button display — deed_text is untouched
-- everywhere else (board cells, admin deed list, CSV import/export).

ALTER TABLE good_deeds ADD COLUMN IF NOT EXISTS quick_tap_label TEXT;

ALTER TABLE good_deeds ADD CONSTRAINT quick_tap_label_max_length
  CHECK (quick_tap_label IS NULL OR char_length(quick_tap_label) <= 36);

-- NOT VALID: enforced on every future insert/update immediately, but doesn't
-- retroactively fail the migration over deeds that are quick_tap_eligible
-- today with no label yet. A good short label is a judgment call, not
-- something to auto-truncate from deed_text — those existing rows need a
-- human-written label (tracked separately) before they can be edited again;
-- until then the app-level read queries also exclude label-less rows from
-- ever being served to players, so no button ever renders blank text.
ALTER TABLE good_deeds ADD CONSTRAINT quick_tap_requires_label
  CHECK (quick_tap_eligible = FALSE OR quick_tap_label IS NOT NULL) NOT VALID;
