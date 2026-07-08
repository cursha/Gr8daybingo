-- Closes a registration race: two concurrent signups with the same email or
-- username could both pass the check-then-insert race in auth-custom/index.ts
-- (SELECT for an existing row, then INSERT if none was found) since nothing
-- at the database level ever rejected the second insert. The result was two
-- users rows sharing one email/username; PostgREST's .maybeSingle() then
-- errors on the resulting multi-row match at login, which silently becomes
-- "Invalid email or password" — a player randomly locked out of an account
-- that verifiably exists, with no way to self-recover.
--
-- Verified via `supabase db query` before this migration: no existing
-- duplicate emails or usernames in production, so this constraint is safe to
-- add outright. NULL is exempt from a UNIQUE constraint under normal SQL
-- semantics, so anonymous accounts (email: null) are unaffected.
ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);
