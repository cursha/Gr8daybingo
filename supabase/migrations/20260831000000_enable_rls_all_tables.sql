-- ============================================================
-- Lock the database's front door: enable Row Level Security on
-- every table in the public schema.
--
-- The problem this fixes: no table in this project has ever had RLS
-- turned on. The GRANT ALL in 20260718000000_local_dev_grants.sql is
-- normal and expected (that's how Supabase's PostgREST layer is meant
-- to be configured) — but a grant only controls table-level API
-- access; RLS is what should then decide which *rows* a request can
-- actually see or change. With RLS off, that second gate never
-- existed, so the public "anon" key (which is meant to be public and
-- ships inside the deployed frontend, as intended) could read or
-- write every row in every table via Supabase's REST API directly —
-- wallet balances, account records, the "I Dare Ya" odds table, all
-- of it — completely bypassing every check the edge functions make.
--
-- The fix: turn RLS on with no policies for anon/authenticated. This
-- app's entire frontend talks only to the Supabase Edge Functions
-- (confirmed: no direct table queries or realtime subscriptions
-- anywhere in frontend/src), and every edge function uses the
-- SUPABASE_SERVICE_ROLE_KEY (see supabase/functions/_shared/db.ts),
-- which bypasses RLS by design. So this closes direct table access
-- from the browser entirely while leaving every existing edge
-- function — which is where all real access-control logic already
-- lives — completely unaffected.
--
-- If a future feature needs the browser to query a table directly
-- (bypassing an edge function), add a specific, narrow policy for it
-- then — don't widen this migration.
-- ============================================================

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;
