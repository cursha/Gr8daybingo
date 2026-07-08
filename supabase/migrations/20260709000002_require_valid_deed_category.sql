-- "All deeds must have a category" — enforce it at the source instead of
-- relying on every write path (single add, edit, CSV import) to remember to
-- validate. NOT NULL alone isn't enough: an unselected dropdown submits an
-- empty string, not null, and CSV import accepts arbitrary free text with no
-- validation at all (that's exactly how 'Test Cat' / 'About You' / blank
-- categories got into production — see 20260709000001). A FOREIGN KEY to the
-- existing deed_categories table closes both holes at once: NULL, '', and
-- any name that isn't a real category all get rejected by Postgres itself.

-- The retired test deed (20260709000001) still carries its old 'Test Cat'
-- category — harmless since is_active=false, but must be normalized before
-- the FK constraint below can be added.
UPDATE good_deeds SET category = 'HELP' WHERE id = 251 AND category = 'Test Cat';

ALTER TABLE good_deeds ALTER COLUMN category SET NOT NULL;
ALTER TABLE good_deeds
  ADD CONSTRAINT good_deeds_category_fkey FOREIGN KEY (category) REFERENCES deed_categories(name);
