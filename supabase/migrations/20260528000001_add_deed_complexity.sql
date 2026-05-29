-- Add complexity field to good_deeds
-- Scale: 1=Easy, 2=Easy-Medium, 3=Medium, 4=Medium-Hard, 5=Hard
-- Only 1, 3, and 5 are used in practice for now; 2 and 4 are valid but unused.
-- NULL means complexity has not been set yet.
ALTER TABLE good_deeds ADD COLUMN IF NOT EXISTS complexity INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deed_complexity_range'
  ) THEN
    ALTER TABLE good_deeds
      ADD CONSTRAINT deed_complexity_range
      CHECK (complexity IS NULL OR complexity BETWEEN 1 AND 5);
  END IF;
END
$$;
