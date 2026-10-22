-- Koko backend, migration 7: the rules the database enforces whoever is calling, and the workflow functions.
--
-- Callers:
--   * Admins in the dashboard run as the `authenticated` role with their own JWT. Tables are guarded by RLS
--     (migration 8) and by the triggers below.
--   * Workflow functions (publish_*, archive_*, approve_media …) are SECURITY DEFINER. Each one checks the
--     caller's permission first, then does the change as the table owner, which the guards trust.
--   * Jobs (import / export in GitHub Actions) use the secret key (`service_role`) or a direct database
--     connection. They are trusted, and the publish functions accept them, so the import mirrors the content
--     that the local production session has already put live through exactly the same code path.

-- ---------------------------------------------------------------------------------------------------------------
-- Who is calling
-- ---------------------------------------------------------------------------------------------------------------

-- True inside a trusted context: a SECURITY DEFINER workflow function, a job, or a migration.
-- False for dashboard users and the public (the API roles).
create function public.is_trusted_caller() returns boolean
language sql stable
set search_path = ''
as $$
  select current_user not in ('anon', 'authenticated')
$$;

-- True for a job: the secret key (JWT role service_role) or a direct connection with no JWT at all.
create function public.is_job() returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
      or (coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb = '{}'::jsonb
          and coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), '') = ''
          and session_user::text not in ('authenticator', 'anon', 'authenticated'))
$$;

create function public.require_permission(perm text) returns void
language plpgsql stable
set search_path = ''
as $$
begin
  if not (public.has_permission(perm) or public.is_job()) then
    raise exception 'Permission denied: this needs the "%" permission', perm using errcode = 'insufficient_privilege';
  end if;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Guard 1. Status changes only through the workflow functions. New rows always start as drafts.
-- ---------------------------------------------------------------------------------------------------------------
create function public.guard_status() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_trusted_caller() then
    return new;
  end if;
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'New % start as drafts; use the publish functions to make them public', tg_table_name
      using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    raise exception 'The status of % % changes only through publish_*, unpublish_*, archive_* or restore_content()',
      tg_table_name, old.id using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;
create trigger worlds_status_guard  before insert or update on public.worlds  for each row execute function public.guard_status();
create trigger units_status_guard   before insert or update on public.units   for each row execute function public.guard_status();
create trigger lessons_status_guard before insert or update on public.lessons for each row execute function public.guard_status();
create trigger promos_status_guard  before insert or update on public.promos  for each row execute function public.guard_status();

-- ---------------------------------------------------------------------------------------------------------------
-- Guard 2. Sacred classification and approval change only through approve_media / revoke_media_approval /
-- set_media_sacred (owner or reviewer). Files in the repo are recorded only by the import job.
-- Named so it runs before media_assets_guard (triggers fire in name order).
-- ---------------------------------------------------------------------------------------------------------------
create function public.guard_media_approval() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_trusted_caller() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.storage <> 'supabase' then
      raise exception 'Only the import job records files that are in the repo; dashboard uploads use storage = supabase'
        using errcode = 'insufficient_privilege';
    end if;
    if not new.sacred or new.approved_at is not null or new.approved_by is not null
       or new.approved_by_name is not null or new.approval_note is not null then
      raise exception 'A new file starts as sacred and unapproved; an owner or reviewer classifies and approves it'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;
  if (new.sacred, new.approved_at, new.approved_by, new.approved_by_name, new.approval_note)
     is distinct from (old.sacred, old.approved_at, old.approved_by, old.approved_by_name, old.approval_note) then
    raise exception 'sacred and approval fields change only through approve_media(), revoke_media_approval() or set_media_sacred()'
      using errcode = 'insufficient_privilege';
  end if;
  if old.storage = 'static' and (new.kind, new.lesson_id, new.storage, new.storage_object, new.bytes, new.sha256)
     is distinct from (old.kind, old.lesson_id, old.storage, old.storage_object, old.bytes, old.sha256) then
    raise exception 'Files in the repo are recorded only by the import job' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;
create trigger media_assets_approval_guard before insert or update on public.media_assets
  for each row execute function public.guard_media_approval();

-- ---------------------------------------------------------------------------------------------------------------
-- Guard 3. Sacred text in a lesson can be changed only by an owner or reviewer:
--   * every word marked "sacred": true keeps its id, ar, tr and the flag itself;
--   * every Learn card whose clip is a sacred media asset keeps its ar, tr and aud.
-- English explanations stay editable by editors.
-- ---------------------------------------------------------------------------------------------------------------
create function public.guard_sacred_text() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_trusted_caller() or public.has_permission('approve_sacred') then
    return new;
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(old.words, '[]')) ow
    where ow -> 'sacred' = 'true'::jsonb
      and not exists (
        select 1 from jsonb_array_elements(coalesce(new.words, '[]')) nw
        where nw -> 'id' = ow -> 'id' and nw -> 'ar' = ow -> 'ar'
          and (nw -> 'tr') is not distinct from (ow -> 'tr') and nw -> 'sacred' = 'true'::jsonb)
  ) then
    raise exception 'Lesson %: the Arabic of a sacred word can be changed only by an owner or reviewer', old.id
      using errcode = 'insufficient_privilege';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(old.learn, '[]')) with ordinality as oc (card, pos)
    join public.media_assets m on m.path = 'audio/' || old.id || '/' || (oc.card ->> 'aud') || '.mp3' and m.sacred
    where oc.card ? 'aud'
      and ((new.learn -> (oc.pos::int - 1) -> 'ar') is distinct from (oc.card -> 'ar')
        or (new.learn -> (oc.pos::int - 1) -> 'tr') is distinct from (oc.card -> 'tr')
        or (new.learn -> (oc.pos::int - 1) -> 'aud') is distinct from (oc.card -> 'aud'))
  ) then
    raise exception 'Lesson %: a Learn card with a sacred clip can be changed only by an owner or reviewer', old.id
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;
create trigger lessons_sacred_text_guard before update on public.lessons
  for each row execute function public.guard_sacred_text();

-- ---------------------------------------------------------------------------------------------------------------
-- Publishing internals (not callable from the API)
-- ---------------------------------------------------------------------------------------------------------------

-- Records a new revision and makes it live. Publishing an unchanged document is a no-op that returns the live
-- revision, so re-running the import or pressing Publish twice adds nothing to history.
create function public._publish(k text, eid text, wid text, srt integer, doc jsonb, note text) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  live public.published_content;
  rev  integer;
  rid  bigint;
begin
  select * into live from public.published_content p where p.kind = k and p.id = eid;
  if found and live.document = doc and live.world_id is not distinct from wid and live.sort is not distinct from srt then
    return live.revision_id;
  end if;
  select coalesce(max(r.revision), 0) + 1 into rev from public.content_revisions r where r.kind = k and r.entity_id = eid;
  insert into public.content_revisions (kind, entity_id, revision, document, published_by, note)
    values (k, eid, rev, doc, auth.uid(), note)
    returning id into rid;
  insert into public.published_content (kind, id, world_id, sort, document, revision_id, published_at, published_by)
    values (k, eid, wid, srt, doc, rid, now(), auth.uid())
    on conflict (kind, id) do update
      set world_id = excluded.world_id, sort = excluded.sort, document = excluded.document,
          revision_id = excluded.revision_id, published_at = excluded.published_at, published_by = excluded.published_by;
  return rid;
end
$$;

create function public._unpublish(k text, eid text) returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.published_content where kind = k and id = eid
$$;

-- Clips a lesson plays that are sacred but not approved (own folder, plus words and order items borrowed
-- through "from"). The full reference check runs in the export validator (step 5); this is the database's
-- own last line.
create function public.unapproved_sacred_clips(lesson_id text) returns setof text
language sql stable
set search_path = ''
as $$
  with l as (select * from public.lessons where id = lesson_id),
  refs as (
    select m.path from public.media_assets m where m.lesson_id = unapproved_sacred_clips.lesson_id
    union
    select 'audio/' || coalesce(w ->> 'from', l.id) || '/w-' || (w ->> 'id') || '-ar.mp3'
    from l, jsonb_array_elements(coalesce(l.words, '[]')) w
    union
    select 'audio/' || coalesce(i ->> 'from', l.id) || '/w-' || (i ->> 'id') || '-ar.mp3'
    from l, jsonb_array_elements(coalesce(l.order_game -> 'items', '[]')) i
  )
  select m.path from refs join public.media_assets m using (path)
  where m.sacred and m.approved_at is null
  order by 1
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Workflow functions (the API surface for publishers)
-- ---------------------------------------------------------------------------------------------------------------
create function public.publish_world(world_id text, note text default null) returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare w public.worlds;
begin
  perform public.require_permission('publish');
  select * into w from public.worlds where id = world_id for update;
  if not found then raise exception 'No world %', world_id using errcode = 'no_data_found'; end if;
  if w.status = 'archived' then raise exception 'World % is archived; restore it first', world_id using errcode = 'check_violation'; end if;
  update public.worlds set status = 'published' where id = world_id and status <> 'published';
  return public._publish('world', w.id, null, w.sort, public.world_document(w), note);
end
$$;

create function public.publish_unit(unit_id text, note text default null) returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare u public.units;
begin
  perform public.require_permission('publish');
  select * into u from public.units where id = unit_id for update;
  if not found then raise exception 'No unit %', unit_id using errcode = 'no_data_found'; end if;
  if u.status = 'archived' then raise exception 'Unit % is archived; restore it first', unit_id using errcode = 'check_violation'; end if;
  if not exists (select 1 from public.published_content p where p.kind = 'world' and p.id = u.world_id) then
    raise exception 'Publish world % before its units', u.world_id using errcode = 'check_violation';
  end if;
  if u.go_world_id is not null and not exists (select 1 from public.published_content p where p.kind = 'world' and p.id = u.go_world_id) then
    raise exception 'Unit % links to world %, which is not published', unit_id, u.go_world_id using errcode = 'check_violation';
  end if;
  update public.units set status = 'published' where id = unit_id and status <> 'published';
  return public._publish('unit', u.id, u.world_id, u.sort, public.unit_document(u), note);
end
$$;

-- Publishes the lesson and (again) its unit, so the map entry and the lesson always go live together.
create function public.publish_lesson(lesson_id text, note text default null) returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
  l   public.lessons;
  bad text;
begin
  perform public.require_permission('publish');
  select * into l from public.lessons where id = lesson_id for update;
  if not found then raise exception 'No lesson %', lesson_id using errcode = 'no_data_found'; end if;
  if l.status = 'archived' then raise exception 'Lesson % is archived; restore it first', lesson_id using errcode = 'check_violation'; end if;

  select string_agg(p, ', ') into bad from public.unapproved_sacred_clips(lesson_id) p;
  if bad is not null then
    raise exception 'Lesson % uses sacred audio that is not approved yet: %', lesson_id, bad using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(l.quiz, '[]')) q
    where (select count(*) from jsonb_array_elements(q -> 'opts') o where o -> 2 = '1'::jsonb) <> 1
  ) then
    raise exception 'Lesson %: every quiz question needs exactly one correct answer', lesson_id using errcode = 'check_violation';
  end if;

  perform public.publish_unit(lesson_id, note);
  update public.lessons set status = 'published' where id = lesson_id and status <> 'published';
  return public._publish('lesson', l.id, null, null, public.lesson_document(l), note);
end
$$;

create function public.publish_catalog(note text default null) returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare c public.catalog_settings;
begin
  perform public.require_permission('publish');
  select * into c from public.catalog_settings where id;
  if not found then raise exception 'catalog_settings has no row yet' using errcode = 'no_data_found'; end if;
  return public._publish('catalog', 'catalog', null, null, public.catalog_document(c), note);
end
$$;

-- An active promo goes live; a promo switched off is taken out of the app.
create function public.publish_promo(promo_id text, note text default null) returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare p public.promos;
begin
  perform public.require_permission('publish');
  select * into p from public.promos where id = promo_id for update;
  if not found then raise exception 'No promo %', promo_id using errcode = 'no_data_found'; end if;
  if p.status = 'archived' then raise exception 'Promo % is archived; restore it first', promo_id using errcode = 'check_violation'; end if;
  if not p.active then
    perform public._unpublish('promo', p.id);
    update public.promos set status = 'draft' where id = promo_id and status <> 'draft';
    return null;
  end if;
  update public.promos set status = 'published' where id = promo_id and status <> 'published';
  return public._publish('promo', p.id, null, p.sort, public.promo_document(p), note);
end
$$;

-- Back to draft: the unit stays on the map as a locked "soon" box.
create function public.unpublish_lesson(lesson_id text) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.require_permission('publish');
  update public.lessons set status = 'draft' where id = lesson_id and status = 'published';
  perform public._unpublish('lesson', lesson_id);
end
$$;

-- Archived lessons are not shown at all (owner, 2026-10-22): the lesson and its unit leave the app.
create function public.archive_lesson(lesson_id text) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.require_permission('publish');
  if not exists (select 1 from public.lessons where id = lesson_id) then
    raise exception 'No lesson %', lesson_id using errcode = 'no_data_found';
  end if;
  update public.lessons set status = 'archived' where id = lesson_id;
  update public.units   set status = 'archived' where id = lesson_id;
  perform public._unpublish('lesson', lesson_id);
  perform public._unpublish('unit', lesson_id);
end
$$;

create function public.archive_unit(unit_id text) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.require_permission('publish');
  if not exists (select 1 from public.units where id = unit_id) then
    raise exception 'No unit %', unit_id using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.lessons where id = unit_id) then
    perform public.archive_lesson(unit_id);   -- archives the unit too
  else
    update public.units set status = 'archived' where id = unit_id;
    perform public._unpublish('unit', unit_id);
  end if;
end
$$;

create function public.archive_world(world_id text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare u text;
begin
  perform public.require_permission('publish');
  if not exists (select 1 from public.worlds where id = world_id) then
    raise exception 'No world %', world_id using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.units x where x.go_world_id = archive_world.world_id
             and x.world_id <> archive_world.world_id and x.status <> 'archived') then
    raise exception 'World % is the target of a link unit in another world; archive that unit first', world_id
      using errcode = 'check_violation';
  end if;
  for u in select x.id from public.units x where x.world_id = archive_world.world_id loop
    perform public.archive_unit(u);
  end loop;
  update public.worlds set status = 'archived' where id = world_id;
  perform public._unpublish('world', world_id);
end
$$;

create function public.archive_promo(promo_id text) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.require_permission('publish');
  update public.promos set status = 'archived' where id = promo_id;
  if not found then raise exception 'No promo %', promo_id using errcode = 'no_data_found'; end if;
  perform public._unpublish('promo', promo_id);
end
$$;

-- Archived → draft. Nothing becomes public until it is published again.
create function public.restore_content(kind text, entity_id text) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.require_permission('publish');
  case kind
    when 'world'  then update public.worlds  set status = 'draft' where id = entity_id and status = 'archived';
    when 'unit'   then update public.units   set status = 'draft' where id = entity_id and status = 'archived';
    when 'lesson' then update public.lessons set status = 'draft' where id = entity_id and status = 'archived';
    when 'promo'  then update public.promos  set status = 'draft' where id = entity_id and status = 'archived';
    else raise exception 'Unknown kind %', kind using errcode = 'invalid_parameter_value';
  end case;
  if not found then raise exception '% % is not archived', kind, entity_id using errcode = 'no_data_found'; end if;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Sacred media (owner and reviewer only)
-- ---------------------------------------------------------------------------------------------------------------
create function public.approve_media(asset_path text, note text default null) returns void
language plpgsql security definer
set search_path = ''
as $$
declare who text;
begin
  if not public.has_permission('approve_sacred') then
    raise exception 'Permission denied: only an owner or reviewer approves sacred media' using errcode = 'insufficient_privilege';
  end if;
  select display_name into who from public.admins where user_id = auth.uid();
  update public.media_assets
     set approved_by = auth.uid(), approved_by_name = who, approved_at = now(), approval_note = note
   where path = asset_path;
  if not found then raise exception 'No media %', asset_path using errcode = 'no_data_found'; end if;
end
$$;

create function public.revoke_media_approval(asset_path text, note text) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.has_permission('approve_sacred') then
    raise exception 'Permission denied: only an owner or reviewer changes approvals' using errcode = 'insufficient_privilege';
  end if;
  update public.media_assets
     set approved_by = null, approved_by_name = null, approved_at = null,
         approval_note = 'Approval revoked: ' || coalesce(note, '')
   where path = asset_path;
  if not found then raise exception 'No media %', asset_path using errcode = 'no_data_found'; end if;
end
$$;

-- Marking a file sacred withdraws any approval it had: it must be approved as sacred.
create function public.set_media_sacred(asset_path text, is_sacred boolean, note text default null) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.has_permission('approve_sacred') then
    raise exception 'Permission denied: only an owner or reviewer classifies sacred media' using errcode = 'insufficient_privilege';
  end if;
  update public.media_assets m
     set sacred = is_sacred,
         approved_by      = case when is_sacred and not m.sacred then null else m.approved_by end,
         approved_by_name = case when is_sacred and not m.sacred then null else m.approved_by_name end,
         approved_at      = case when is_sacred and not m.sacred then null else m.approved_at end,
         approval_note    = coalesce(note, m.approval_note)
   where path = asset_path;
  if not found then raise exception 'No media %', asset_path using errcode = 'no_data_found'; end if;
end
$$;

-- internals stay closed; the workflow surface is granted in migration 8
revoke all on function public._publish(text, text, text, integer, jsonb, text) from public, anon, authenticated;
revoke all on function public._unpublish(text, text) from public, anon, authenticated;
