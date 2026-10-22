-- Minimal stand-in for what a Supabase project provides before our migrations run, so the migrations and
-- tests can run on a plain Postgres (CI or a laptop) without Docker images. Not a migration: never run this
-- against the real project. It mirrors only what the migrations use: the API roles, auth.users, auth.uid(),
-- and Supabase's default "grant everything to the API roles" privileges, which the lockdown must undo.

do $$ begin   -- roles are cluster-wide, so a second test database reuses them
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;
grant anon, authenticated, service_role to current_user;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Same contract as Supabase: the user id comes from the request's JWT claims.
create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(coalesce(
    current_setting('request.jwt.claim.sub', true),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  ), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
