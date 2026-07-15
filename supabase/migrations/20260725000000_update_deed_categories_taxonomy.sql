-- Curt's new 5-category taxonomy: CONNECT, ENCOURAGE, HELP, GIVE, PAMPER.
-- NOTICE, CELEBRATE, DELIGHT, CARE are retired (deactivated, not deleted —
-- good_deeds.category has a FOREIGN KEY into this table, so existing deeds
-- still tagged with a retired category would violate that constraint if the
-- row were removed outright; is_active=false is the existing toggle built
-- for exactly this). Curt is reassigning existing deeds off the retired
-- categories by hand via the admin panel, so this migration only changes
-- which categories are selectable going forward — it does not touch
-- good_deeds.category on any existing row.

INSERT INTO deed_categories (name, description, is_active) VALUES
  ('GIVE',    'Share your time, resources, or generosity with someone else.', TRUE),
  ('PAMPER',  'Treat someone to a little extra comfort or care.', TRUE)
ON CONFLICT (name) DO UPDATE SET is_active = TRUE;

UPDATE deed_categories SET is_active = FALSE
  WHERE name IN ('NOTICE', 'CELEBRATE', 'DELIGHT', 'CARE');
