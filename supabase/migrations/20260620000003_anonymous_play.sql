-- ============================================================
-- Anonymous Play (Issue #17)
-- Lets people register and play with only a nickname + password,
-- no name or email required.
-- ============================================================

-- Tag each account as 'standard' (name/email) or 'anonymous' (nickname only).
-- Existing rows default to 'standard'.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS registration_type TEXT NOT NULL DEFAULT 'standard';

-- Anonymous accounts have no email, so email can no longer be required.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- Restrict registration_type to the two valid values.
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
