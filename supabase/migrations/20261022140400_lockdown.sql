-- Koko backend, migration 5 of 5: close every door until step 3 opens the right ones.
--
-- Supabase grants the API roles (anon, authenticated) full table privileges on the public schema by default
-- and relies on RLS alone. Here both layers are shut: RLS is on everywhere with no policies (migrations 1-4),
-- and the table privileges are revoked as well. Step 3 grants back exactly what each role needs, next to the
-- policy that limits it. New tables created later start closed too.
--
-- service_role (the secret key, used only inside GitHub Actions) bypasses RLS by design and keeps its grants.

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from public, anon, authenticated;

-- The two permission helpers are needed by step-3 policies evaluated as `authenticated`.
grant execute on function public.current_admin_role() to authenticated;
grant execute on function public.has_permission(text) to authenticated;
