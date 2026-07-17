-- CARE is back in the active taxonomy (Curt's call) — un-retiring it via the
-- same is_active toggle 20260725000000 used to deactivate it. No schema
-- change, no effect on any existing good_deeds row.
UPDATE deed_categories SET is_active = TRUE WHERE name = 'CARE';
