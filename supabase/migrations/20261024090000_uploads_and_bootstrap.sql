-- Koko backend, migration 10: the uploads bucket for the dashboard, and a safe way to create the very first owner.

-- ---------------------------------------------------------------------------------------------------------------
-- Storage bucket for new admin uploads (images and files). Private: children never fetch from it. The export
-- copies the uploads that published content uses into media/ (docs/SYNC.md). audio/ and media/ stay on static hosting.
-- ---------------------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;

create policy uploads_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'uploads' and (select public.current_admin_role()) is not null);
create policy uploads_editor_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and (select public.has_permission('edit_content')));
-- an upload is never overwritten or deleted from the dashboard once stored: a new file gets a new name

-- ---------------------------------------------------------------------------------------------------------------
-- bootstrap_first_owner: makes an existing auth user the first owner. It works only while there are no admins at
-- all, and only from a trusted connection (the SQL editor in the Supabase dashboard). docs/DEPLOY.md shows how.
-- ---------------------------------------------------------------------------------------------------------------
create function public.bootstrap_first_owner(owner_email text, owner_name text) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid;
begin
  if not public.is_trusted_caller() then
    raise exception 'Run this in the Supabase SQL editor' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.admins) then
    raise exception 'There are admins already; the owner adds new ones in the dashboard' using errcode = 'check_violation';
  end if;
  select id into uid from auth.users where lower(email) = lower(owner_email);
  if uid is null then
    raise exception 'No auth user with email %: add it first (Authentication → Users → Add user)', owner_email
      using errcode = 'no_data_found';
  end if;
  insert into public.admins (user_id, email, display_name, role) values (uid, lower(owner_email), owner_name, 'owner');
  return 'Owner created: ' || lower(owner_email);
end
$$;
revoke all on function public.bootstrap_first_owner(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Reordering units from the dashboard: one statement, so the (deferred) unique sort check sees the final order.
-- SECURITY INVOKER: RLS and the guards apply exactly as for a direct update (edit_content).
-- ---------------------------------------------------------------------------------------------------------------
create function public.reorder_units(world text, unit_ids text[]) returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.has_permission('edit_content') then
    raise exception 'Permission denied: this needs the "edit_content" permission' using errcode = 'insufficient_privilege';
  end if;
  if (select count(*) from public.units u where u.world_id = world) <> cardinality(unit_ids)
     or exists (select 1 from unnest(unit_ids) x where not exists (select 1 from public.units u where u.id = x and u.world_id = world)) then
    raise exception 'Pass every unit of world % exactly once', world using errcode = 'invalid_parameter_value';
  end if;
  update public.units u set sort = array_position(unit_ids, u.id) * 10 where u.world_id = world;
end
$$;

-- After a reorder, publishes the new order of every unit of the world that is already public.
create function public.publish_unit_order(world text) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare u text; n integer := 0;
begin
  perform public.require_permission('publish');
  for u in select p.id from public.published_content p where p.kind = 'unit' and p.world_id = world loop
    perform public.publish_unit(u, 'new order');
    n := n + 1;
  end loop;
  return n;
end
$$;

revoke all on function public.reorder_units(text, text[]) from public, anon;
revoke all on function public.publish_unit_order(text) from public, anon;
grant execute on function public.reorder_units(text, text[]) to authenticated, service_role;
grant execute on function public.publish_unit_order(text) to authenticated, service_role;
