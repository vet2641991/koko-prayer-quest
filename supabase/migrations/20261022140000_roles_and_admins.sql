-- Koko backend, migration 1 of 5: roles, admins and the helpers every later table and policy uses.
--
-- There is no self-signup (supabase/config.toml: auth.enable_signup = false). The owner creates each admin's
-- auth user, then adds a row here. Being an auth user alone grants nothing: every permission check below
-- asks for an *active* row in public.admins.
--
-- Row-level security is switched on for every table in this milestone with no policies yet, so nothing is
-- reachable through the API until step 3 adds the policies (fail closed).

-- ---------------------------------------------------------------------------------------------------------------
-- Shared trigger helpers
-- ---------------------------------------------------------------------------------------------------------------

-- Who is making this change. Admin sessions are identified by their JWT; jobs that run with the secret key
-- (import, export) have no JWT and name themselves with:  set local koko.actor = 'import-json';
create function public.current_actor_label() returns text
language sql stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
    nullif(current_setting('koko.actor', true), ''),
    current_user::text
  )
$$;

-- Keeps updated_at / updated_by honest. created_at is set by its column default and never changes.
create function public.touch_row() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  return new;
end
$$;

-- Ids are part of the public contract: device progress, routes and audio folder names are keyed by them
-- (docs/AUDIT.md §8). Once a row exists its id can never change.
create function public.forbid_id_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception '%: id % cannot be changed (device progress and audio paths are keyed by it)',
      tg_table_name, old.id using errcode = 'check_violation';
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- roles: what each role may do. A data table rather than an enum, so the matrix is readable and adjustable.
-- ---------------------------------------------------------------------------------------------------------------
create table public.roles (
  id                  text primary key check (id ~ '^[a-z][a-z_]*$'),
  label_en            text not null,
  label_ar            text not null,
  can_edit_content    boolean not null,   -- create and edit drafts: worlds, units, lessons, media uploads
  can_publish         boolean not null,   -- publish / archive (draft content becomes public only this way)
  can_approve_sacred  boolean not null,   -- mark sacred media as approved, or reclassify it
  can_manage_admins   boolean not null,   -- add, remove and change admins and roles; edit catalog settings
  sort                integer not null unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users (id) on delete set null
);
comment on table public.roles is 'Permission matrix. owner > reviewer > editor. Edited by the owner only (step 3 policies).';

insert into public.roles (id, label_en, label_ar, can_edit_content, can_publish, can_approve_sacred, can_manage_admins, sort) values
  ('owner',    'Owner',    'المالك',   true, true,  true,  true,  1),
  ('reviewer', 'Reviewer', 'المراجع',  true, true,  true,  false, 2),
  ('editor',   'Editor',   'المحرر',   true, false, false, false, 3);

create trigger roles_touch before insert or update on public.roles
  for each row execute function public.touch_row();
create trigger roles_id_fixed before update on public.roles
  for each row execute function public.forbid_id_change();

-- ---------------------------------------------------------------------------------------------------------------
-- admins: the only people who can change anything. One role each.
-- ---------------------------------------------------------------------------------------------------------------
create table public.admins (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  email         text not null unique check (email = lower(email) and email like '%_@_%'),
  display_name  text not null check (length(btrim(display_name)) > 0),
  role          text not null references public.roles (id) on update restrict on delete restrict,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null
);
comment on table public.admins is 'Dashboard users. No self-signup: the owner adds rows. Deactivate instead of deleting to keep history readable.';

create trigger admins_touch before insert or update on public.admins
  for each row execute function public.touch_row();

-- The project must never lose its last active owner (that would lock everyone out of admin management).
create function public.keep_one_owner() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.admins a
    join public.roles r on r.id = a.role
    where a.active and r.can_manage_admins
  ) and exists (select 1 from public.admins) then
    raise exception 'At least one active admin with the owner role must remain' using errcode = 'check_violation';
  end if;
  return null;
end
$$;
create constraint trigger admins_keep_one_owner after update or delete on public.admins
  deferrable initially deferred
  for each row execute function public.keep_one_owner();

-- ---------------------------------------------------------------------------------------------------------------
-- Permission helpers used by triggers (here) and RLS policies (step 3).
-- SECURITY DEFINER so they can read admins/roles even though RLS hides those tables from normal users.
-- ---------------------------------------------------------------------------------------------------------------
create function public.current_admin_role() returns text
language sql stable security definer
set search_path = ''
as $$
  select a.role from public.admins a where a.user_id = (select auth.uid()) and a.active
$$;

create function public.has_permission(perm text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select case perm
             when 'edit_content'   then r.can_edit_content
             when 'publish'        then r.can_publish
             when 'approve_sacred' then r.can_approve_sacred
             when 'manage_admins'  then r.can_manage_admins
           end
    from public.admins a
    join public.roles r on r.id = a.role
    where a.user_id = (select auth.uid()) and a.active
  ), false)
$$;

revoke all on function public.current_admin_role() from public, anon;
revoke all on function public.has_permission(text) from public, anon;
grant execute on function public.current_admin_role() to authenticated, service_role;
grant execute on function public.has_permission(text) to authenticated, service_role;

alter table public.roles  enable row level security;
alter table public.admins enable row level security;
