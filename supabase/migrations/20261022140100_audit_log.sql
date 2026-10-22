-- Koko backend, migration 2 of 5: the audit log.
--
-- Every insert, update and delete on an audited table is recorded by a trigger, so it is captured whether it
-- comes from the dashboard, the import job or the SQL editor. Rows can be added but never changed or removed.

create table public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,                -- auth user (null for jobs that use the secret key)
  actor_label text not null,       -- admin email, or the job name set with `set local koko.actor = '…'`
  action      text not null check (action in ('insert', 'update', 'delete')),
  event       text check (event in ('publish', 'unpublish', 'archive', 'restore', 'approve', 'revoke_approval')),
  table_name  text not null,
  row_id      text not null,
  changed     text[],              -- columns that changed (update only)
  old_values  jsonb,               -- update: changed columns only; delete: the whole row
  new_values  jsonb                -- update: changed columns only; insert: the whole row
);
comment on table public.audit_log is 'Append-only history of every change. Written only by public.audit_row().';
create index audit_log_row_idx on public.audit_log (table_name, row_id, at desc);
create index audit_log_at_idx on public.audit_log (at desc);

create function public.audit_log_is_append_only() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only' using errcode = 'insufficient_privilege';
end
$$;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public.audit_log_is_append_only();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_is_append_only();

-- Generic row trigger. The primary key column is passed as the first trigger argument (default 'id').
-- Columns that only record bookkeeping (updated_at, updated_by) are left out of the diff.
create function public.audit_row() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pk        text := coalesce(tg_argv[0], 'id');
  o         jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n         jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  rid       text := coalesce(n, o) ->> pk;   -- taken before n/o are cut down to the changed columns
  cols      text[];
  ev        text;
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into cols
    from jsonb_object_keys(n) k
    where k not in ('updated_at', 'updated_by') and (o -> k) is distinct from (n -> k);
    if cols is null then
      return null;   -- nothing but bookkeeping changed
    end if;
    o := (select jsonb_object_agg(k, o -> k) from unnest(cols) k);
    n := (select jsonb_object_agg(k, n -> k) from unnest(cols) k);

    -- name the workflow transitions so the dashboard can show "published" instead of a raw diff
    if 'status' = any (cols) then
      ev := case
              when n ->> 'status' = 'published' and o ->> 'status' = 'archived' then 'restore'
              when n ->> 'status' = 'published' then 'publish'
              when n ->> 'status' = 'archived' then 'archive'
              when n ->> 'status' = 'draft' and o ->> 'status' = 'published' then 'unpublish'
              when n ->> 'status' = 'draft' and o ->> 'status' = 'archived' then 'restore'
            end;
    elsif 'approved_at' = any (cols) then
      ev := case when n ->> 'approved_at' is null then 'revoke_approval' else 'approve' end;
    end if;
  end if;

  if tg_table_name = 'published_content' then
    ev := case when tg_op = 'DELETE' then 'unpublish' else 'publish' end;
  end if;

  insert into public.audit_log (actor_id, actor_label, action, event, table_name, row_id, changed, old_values, new_values)
  values (auth.uid(), public.current_actor_label(), lower(tg_op), ev, tg_table_name,
          rid, cols, o, n);
  return null;
end
$$;
revoke all on function public.audit_row() from public, anon, authenticated;

create trigger roles_audit after insert or update or delete on public.roles
  for each row execute function public.audit_row('id');
create trigger admins_audit after insert or update or delete on public.admins
  for each row execute function public.audit_row('user_id');

alter table public.audit_log enable row level security;
