-- Repair for Issue #17: ensure the anonymous-play schema is actually present and
-- that PostgREST's schema cache is refreshed. The 20260620000003 migration was
-- recorded as applied but the column did not materialize / the cache was stale,
-- which made register-anonymous fail with "Could not find the 'registration_type'
-- column ... in the schema cache". All statements are idempotent.

ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_type TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_registration_type_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_registration_type_check
      CHECK (registration_type IN ('standard', 'anonymous'));
  END IF;
END $$;

-- Force PostgREST to reload its schema cache so the new column/table are visible.
NOTIFY pgrst, 'reload schema';
