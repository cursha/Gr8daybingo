ALTER TABLE good_deeds ADD COLUMN IF NOT EXISTS status TEXT;
UPDATE good_deeds SET status = 'Approved' WHERE status IS NULL;
ALTER TABLE good_deeds ALTER COLUMN status SET DEFAULT 'Draft';
ALTER TABLE good_deeds ADD CONSTRAINT good_deeds_status_check
  CHECK (status IN ('Draft', 'Review', 'Approved', 'Retired'));
