-- Step 2 tests: the schema's own rules (no RLS policies yet; those come with step 3's tests).
-- Runs on a database where supabase/tests/support/supabase_stub.sql and all migrations were applied.
-- Every check raises on failure, so psql exits non-zero if anything is wrong. Progress is printed as NOTICEs.
-- Everything happens inside one transaction that is rolled back at the end.

\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
begin;

create function pg_temp.expect_error(stmt text, want_state text, label text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate <> want_state then
      raise exception 'FAIL %: expected SQLSTATE %, got % (%)', label, want_state, sqlstate, sqlerrm;
    end if;
    raise notice 'ok   %', label;
    return;
  end;
  raise exception 'FAIL %: statement succeeded but should have been rejected', label;
end $$;

create function pg_temp.check(ok boolean, label text) returns void
language plpgsql as $$
begin
  if ok is not true then raise exception 'FAIL %', label; end if;
  raise notice 'ok   %', label;
end $$;

-- fixtures ---------------------------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@example.org'),
  ('00000000-0000-0000-0000-00000000000b', 'reviewer@example.org'),
  ('00000000-0000-0000-0000-00000000000c', 'editor@example.org');
insert into public.admins (user_id, email, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@example.org', 'Owner', 'owner'),
  ('00000000-0000-0000-0000-00000000000b', 'reviewer@example.org', 'Reviewer', 'reviewer'),
  ('00000000-0000-0000-0000-00000000000c', 'editor@example.org', 'Editor', 'editor');

insert into public.worlds (id, en, ar, tint, ink, sort) values
  ('isl1', 'Islamic Studies · Level 1', 'الدِّرَاسَاتُ الإِسْلَامِيَّةُ ١', '#E6F4F3', '#085a5a', 1),
  ('prayer', 'The Prayer', 'عَالَمُ الصَّلَاةِ', '#E1F7EA', '#16A34A', 2);
insert into public.units (id, world_id, n, ar, en, sort) values
  ('isl1-l13', 'isl1', '13', 'المَسْجِدُ', 'The masjid', 13);
insert into public.units (id, world_id, n, ar, en, go_world_id, sort) values
  ('isl1-l14', 'isl1', '14', 'كَيْفَ نُصَلِّي؟', 'How we pray — see The Prayer world', 'prayer', 14);
insert into public.lessons (id, title_ar, title_en, minutes, words) values
  ('isl1-l13', 'المَسْجِدُ', 'The masjid', 10,
   '[{"id": "dua_in", "ar": "بِسْمِ اللهِ", "en": "In the name of Allah", "sacred": true}]');

-- ids and structure ---------------------------------------------------------------------------------------------
select pg_temp.check((select file_path from public.units where id = 'isl1-l13') = 'content/isl1/l13.json',
  'unit file path follows the id');
select pg_temp.expect_error($$update public.units set id = 'isl1-l99' where id = 'isl1-l13'$$, '23514',
  'unit id can never change');
select pg_temp.expect_error($$update public.worlds set id = 'isl9' where id = 'isl1'$$, '23514',
  'world id can never change');
select pg_temp.expect_error($$update public.lessons set id = 'isl1-l14' where id = 'isl1-l13'$$, '23514',
  'lesson id can never change');
select pg_temp.expect_error($$update public.units set world_id = 'prayer' where id = 'isl1-l13'$$, '23514',
  'unit cannot move to another world');
select pg_temp.expect_error($$insert into public.units (id, world_id, n, ar, en, sort) values ('prayer-l20', 'isl1', '20', 'x', 'x', 20)$$,
  '23514', 'unit id must start with its world id');
select pg_temp.expect_error($$insert into public.lessons (id, title_ar, title_en) values ('isl1-l14', 'x', 'x')$$, '23514',
  'a link unit cannot have a lesson');
select pg_temp.expect_error($$update public.units set go_world_id = 'prayer' where id = 'isl1-l13'$$, '23514',
  'a unit with a lesson cannot become a link');
select pg_temp.expect_error($$insert into public.lessons (id, title_ar, title_en) values ('isl1-l77', 'x', 'x')$$, '23503',
  'a lesson needs its unit');
select pg_temp.expect_error($$update public.lessons set extra = '{"words": []}' where id = 'isl1-l13'$$, '23514',
  'extra cannot shadow a known lesson field');
select pg_temp.expect_error($$update public.lessons set words = '{}' where id = 'isl1-l13'$$, '23514',
  'words must be a JSON array');
select pg_temp.expect_error($$update public.worlds set tint = 'blue' where id = 'isl1'$$, '23514',
  'world colours are hex');

-- documents ----------------------------------------------------------------------------------------------------
select pg_temp.check(
  (select public.lesson_document(l) from public.lessons l where id = 'isl1-l13') =
  '{"id": "isl1-l13", "world": "isl1", "title": {"ar": "المَسْجِدُ", "en": "The masjid"}, "minutes": 10,
    "words": [{"id": "dua_in", "ar": "بِسْمِ اللهِ", "en": "In the name of Allah", "sacred": true}]}'::jsonb,
  'lesson document: absent fields stay absent, id/world come from the unit');
select pg_temp.check(
  (select public.unit_document(u) from public.units u where id = 'isl1-l14') =
  '{"id": "isl1-l14", "n": "14", "ar": "كَيْفَ نُصَلِّي؟", "en": "How we pray — see The Prayer world", "go": "prayer"}'::jsonb,
  'unit document carries "go" for a link');
select pg_temp.check(
  (select convert_to(words -> 0 ->> 'ar', 'UTF8') from public.lessons where id = 'isl1-l13')
    = convert_to('بِسْمِ اللهِ', 'UTF8'),
  'Arabic with tashkeel is stored byte for byte');

-- audit log ----------------------------------------------------------------------------------------------------
set local koko.actor = 'schema-test';
update public.lessons set topic = 'Our masjid' where id = 'isl1-l13';
select pg_temp.check(
  (select changed = array['topic'] and new_values = '{"topic": "Our masjid"}' and actor_label = 'schema-test'
     and action = 'update' and row_id = 'isl1-l13'
   from public.audit_log where table_name = 'lessons' order by id desc limit 1),
  'audit log records only the changed column, and who changed it');
update public.units set status = 'published' where id = 'isl1-l13';
select pg_temp.check(
  (select event = 'publish' from public.audit_log where table_name = 'units' order by id desc limit 1),
  'audit log names the publish event');
select pg_temp.expect_error($$update public.audit_log set actor_label = 'someone else'$$, '42501', 'audit log rows cannot be edited');
select pg_temp.expect_error($$delete from public.audit_log$$, '42501', 'audit log rows cannot be deleted');

-- revisions and the published layer -------------------------------------------------------------------------------
insert into public.content_revisions (kind, entity_id, revision, document)
select 'lesson', id, 1, public.lesson_document(l) from public.lessons l where id = 'isl1-l13';
select pg_temp.check((select sha256 ~ '^[0-9a-f]{64}$' from public.content_revisions where entity_id = 'isl1-l13'),
  'revision gets a sha256');
select pg_temp.expect_error($$update public.content_revisions set note = 'x'$$, '42501', 'revisions cannot be edited');
select pg_temp.expect_error($$delete from public.content_revisions$$, '42501', 'revisions cannot be deleted');
select pg_temp.expect_error(
  $$insert into public.published_content (kind, id, document, revision_id) select 'unit', 'isl1-l13', '{}', id from public.content_revisions limit 1$$,
  '23514', 'a published unit must carry its world and sort');

-- admins and roles ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
select pg_temp.check(public.has_permission('edit_content') and not public.has_permission('publish')
  and not public.has_permission('approve_sacred') and not public.has_permission('manage_admins'), 'editor: edit only');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
select pg_temp.check(public.has_permission('publish') and public.has_permission('approve_sacred')
  and not public.has_permission('manage_admins'), 'reviewer: publish and approve sacred, not manage admins');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
select pg_temp.check(public.has_permission('manage_admins') and public.current_admin_role() = 'owner', 'owner: everything');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ff', true);
select pg_temp.check(not public.has_permission('edit_content') and public.current_admin_role() is null,
  'a signed-in user who is not an admin has no permission');
select set_config('request.jwt.claim.sub', '', true);
update public.admins set active = false where role = 'editor';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
select pg_temp.check(not public.has_permission('edit_content'), 'a deactivated admin has no permission');
select set_config('request.jwt.claim.sub', '', true);

savepoint before_owner_change;
select pg_temp.expect_error($$update public.admins set active = false where role = 'owner'; set constraints all immediate$$, '23514',
  'the last active owner cannot be deactivated');
rollback to savepoint before_owner_change;
savepoint before_owner_delete;
select pg_temp.expect_error($$delete from public.admins where role = 'owner'; set constraints all immediate$$, '23514',
  'the last active owner cannot be deleted');
rollback to savepoint before_owner_delete;

-- media assets -------------------------------------------------------------------------------------------------
insert into public.media_assets (path, kind, lesson_id, sacred, sha256, approved_by_name, approved_at, approval_note) values
  ('audio/isl1-l13/c-3-ar.mp3', 'audio', 'isl1-l13', true, repeat('a', 64), 'Dr. Hassan Muslim', '2026-10-19', 'test');
insert into public.media_assets (path, kind, lesson_id) values ('audio/isl1-l13/w-new-ar.mp3', 'audio', 'isl1-l13');
select pg_temp.check((select sacred and approved_at is null from public.media_assets where path = 'audio/isl1-l13/w-new-ar.mp3'),
  'unclassified media defaults to sacred and unapproved');
select pg_temp.expect_error($$insert into public.media_assets (path, kind, lesson_id) values ('audio/isl1-l14/x.mp3', 'audio', 'isl1-l13')$$,
  '23514', 'an audio clip lives in its lesson folder');
select pg_temp.expect_error($$insert into public.media_assets (path, kind) values ('audio/../index.html', 'file')$$,
  '23514', 'media paths cannot climb out of audio/ or media/');
select pg_temp.expect_error($$update public.media_assets set approved_by_name = null where path = 'audio/isl1-l13/c-3-ar.mp3'$$,
  '23514', 'an approval must say who approved');
select pg_temp.expect_error($$update public.media_assets set path = 'audio/isl1-l13/c-9-ar.mp3' where path = 'audio/isl1-l13/c-3-ar.mp3'$$,
  '23514', 'a media path never changes');
update public.media_assets set sha256 = repeat('b', 64) where path = 'audio/isl1-l13/c-3-ar.mp3';
select pg_temp.check((select approved_at is null and approval_note like 'Approval withdrawn%'
  from public.media_assets where path = 'audio/isl1-l13/c-3-ar.mp3'),
  'changing a sacred file withdraws its approval');
select pg_temp.check((select event = 'revoke_approval' from public.audit_log where table_name = 'media_assets' order by id desc limit 1),
  'the withdrawal is in the audit log');

-- lockdown: until step 3, the API roles can reach nothing ----------------------------------------------------------
select pg_temp.check(not exists (
  select 1 from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')), 'anon and authenticated have no table grants');
select pg_temp.check(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 'row-level security is on for every table');
set local role anon;
select pg_temp.expect_error($$select * from public.lessons$$, '42501', 'anon cannot read lessons');
select pg_temp.expect_error($$select * from public.published_content$$, '42501', 'anon cannot read anything yet');
select pg_temp.expect_error($$insert into public.worlds (id, en, ar, tint, ink, sort) values ('x', 'x', 'x', '#000000', '#000000', 99)$$,
  '42501', 'anon cannot write');
select pg_temp.expect_error($$select public.has_permission('publish')$$, '42501', 'anon cannot call the permission helpers');
reset role;
set local role authenticated;
select pg_temp.expect_error($$select * from public.media_assets$$, '42501', 'a signed-in user cannot read media (sacred flags) yet');
select pg_temp.expect_error($$update public.lessons set topic = 'x'$$, '42501', 'a signed-in user cannot write yet');
reset role;

rollback;
\o
\echo 'schema integrity: all checks passed'
