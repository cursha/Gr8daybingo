-- Fresh local stacks (`supabase db reset`) come up with anon/authenticated/
-- service_role lacking privileges on public-schema objects — hosted Supabase
-- projects grant these automatically at provisioning time, but a local reset
-- doesn't replicate that. Without this, every edge function call fails with
-- "permission denied for table users" (or similar) against a clean local DB.
-- A no-op against production, which already has these grants.
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
