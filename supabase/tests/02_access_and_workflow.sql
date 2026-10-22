-- Step 3 tests: who can read and write what through the API (RLS + grants + guards), and the publish workflow.
-- The public (anon) can read only published content; drafts, media flags, history and admin data stay hidden;
-- each admin role can do exactly what docs/SCHEMA.md §4 says. Everything is rolled back at the end.

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

-- count of rows a statement touches (for RLS, which filters silently instead of raising)
create function pg_temp.rows(stmt text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;

create function pg_temp.login(uid uuid, mail text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'email', mail, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end $$;

create function pg_temp.as_job() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- fixtures (as a job: a direct connection with no JWT) ---------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@example.org'),
  ('00000000-0000-0000-0000-00000000000b', 'reviewer@example.org'),
  ('00000000-0000-0000-0000-00000000000c', 'editor@example.org'),
  ('00000000-0000-0000-0000-00000000000d', 'outsider@example.org');
insert into public.admins (user_id, email, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@example.org', 'Dr. Owner', 'owner'),
  ('00000000-0000-0000-0000-00000000000b', 'reviewer@example.org', 'Reviewer', 'reviewer'),
  ('00000000-0000-0000-0000-00000000000c', 'editor@example.org', 'Editor', 'editor');

insert into public.worlds (id, en, ar, tint, ink, sort) values
  ('isl1', 'Islamic Studies · Level 1', 'الدِّرَاسَاتُ الإِسْلَامِيَّةُ ١', '#E6F4F3', '#085a5a', 1);
insert into public.units (id, world_id, n, ar, en, sort) values
  ('isl1-l13', 'isl1', '13', 'المَسْجِدُ', 'The masjid', 13),
  ('isl1-l20', 'isl1', '20', 'دَرْسٌ', 'Draft lesson', 20);
insert into public.lessons (id, title_ar, title_en, topic, minutes, words, learn, quiz) values
  ('isl1-l13', 'المَسْجِدُ', 'The masjid', 'Original topic', 10,
   '[{"id": "masjid", "ar": "المَسْجِدُ", "en": "mosque"},
     {"id": "dua_in", "ar": "بِسْمِ اللهِ", "en": "In the name of Allah", "tr": "Bismillah", "sacred": true}]',
   '[{"title": "Entering", "en": "Say the du''aa.", "ar": "بِسْمِ اللهِ، وَالصَّلَاةُ", "aud": "c-0-ar"}]',
   '[{"en": "Which foot first?", "opts": [["", "Right", 1], ["", "Left", 0]]}]'),
  ('isl1-l20', 'دَرْسٌ', 'Draft lesson', 'Secret draft text', 10, null, null, null);
insert into public.media_assets (path, kind, lesson_id, sacred, sha256, approved_by_name, approved_at) values
  ('audio/isl1-l13/c-0-ar.mp3',      'audio', 'isl1-l13', true,  repeat('a', 64), 'Dr. Hassan Muslim', '2026-10-19'),
  ('audio/isl1-l13/w-dua_in-ar.mp3', 'audio', 'isl1-l13', true,  repeat('b', 64), 'Dr. Hassan Muslim', '2026-10-19'),
  ('audio/isl1-l13/w-masjid-ar.mp3', 'audio', 'isl1-l13', false, repeat('c', 64), null, null);
insert into public.catalog_settings (focus_new) values ('isl1');

select pg_temp.as_job();
select public.publish_world('isl1');
select public.publish_lesson('isl1-l13');
select public.publish_unit('isl1-l20');   -- a draft lesson on a published unit: a "soon" box
select public.publish_catalog();
select pg_temp.check((select count(*) = 4 from public.published_content where kind in ('world', 'unit', 'lesson')),
  'a job can publish (the import path)');

-- anon: the public -----------------------------------------------------------------------------------------------
select pg_temp.as_anon();
select pg_temp.check((select count(*) from public.published_content where kind = 'lesson' and id = 'isl1-l13') = 1,
  'anon reads a published lesson');
select pg_temp.check((select document ->> 'topic' from public.published_content where kind = 'lesson' and id = 'isl1-l13') = 'Original topic',
  'anon gets the published document');
select pg_temp.check(not exists (select 1 from public.published_content where kind = 'lesson' and id = 'isl1-l20'),
  'anon cannot read a draft lesson');
select pg_temp.check(exists (select 1 from public.published_content where kind = 'unit' and id = 'isl1-l20'),
  'a draft lesson''s unit is listed (shown as "soon")');
select pg_temp.check(not exists (select 1 from public.published_content where document::text like '%Secret draft text%'),
  'no draft text anywhere in what anon can read');
select pg_temp.expect_error($$select published_by from public.published_content$$, '42501', 'anon cannot see who published (admin ids)');
select pg_temp.expect_error($$select * from public.worlds$$,            '42501', 'anon cannot read worlds (working copy)');
select pg_temp.expect_error($$select * from public.units$$,             '42501', 'anon cannot read units (working copy)');
select pg_temp.expect_error($$select * from public.lessons$$,           '42501', 'anon cannot read lessons (drafts)');
select pg_temp.expect_error($$select * from public.promos$$,            '42501', 'anon cannot read promos (working copy)');
select pg_temp.expect_error($$select * from public.media_assets$$,      '42501', 'anon cannot read media assets (sacred flags)');
select pg_temp.expect_error($$select * from public.content_revisions$$, '42501', 'anon cannot read the revision history');
select pg_temp.expect_error($$select * from public.audit_log$$,         '42501', 'anon cannot read the audit log');
select pg_temp.expect_error($$select * from public.admins$$,            '42501', 'anon cannot read admins');
select pg_temp.expect_error($$select * from public.roles$$,             '42501', 'anon cannot read roles');
select pg_temp.expect_error($$select * from public.catalog_settings$$,  '42501', 'anon cannot read catalog settings (working copy)');
select pg_temp.expect_error($$insert into public.lessons (id, title_ar, title_en) values ('isl1-l20', 'x', 'x')$$, '42501', 'anon cannot insert content');
select pg_temp.expect_error($$update public.published_content set document = '{}'$$, '42501', 'anon cannot change published content');
select pg_temp.expect_error($$delete from public.published_content$$, '42501', 'anon cannot delete published content');
select pg_temp.expect_error($$insert into public.media_assets (path, kind) values ('media/x.png', 'image')$$, '42501', 'anon cannot add media');
select pg_temp.expect_error($$select public.publish_lesson('isl1-l20')$$, '42501', 'anon cannot publish');
select pg_temp.expect_error($$select public.approve_media('audio/isl1-l13/w-masjid-ar.mp3')$$, '42501', 'anon cannot approve media');
select pg_temp.expect_error($$select public.has_permission('publish')$$, '42501', 'anon cannot call the permission helpers');

-- a signed-in user who is not an admin -------------------------------------------------------------------------
select pg_temp.as_job();
select pg_temp.login('00000000-0000-0000-0000-00000000000d', 'outsider@example.org');
select pg_temp.check((select count(*) from public.lessons) = 0, 'a non-admin sees no working rows');
select pg_temp.check((select count(*) from public.media_assets) = 0, 'a non-admin sees no media flags');
select pg_temp.check(pg_temp.rows($$update public.lessons set topic = 'hacked'$$) = 0, 'a non-admin cannot update content');
select pg_temp.expect_error($$insert into public.units (id, world_id, n, ar, en, sort) values ('isl1-l21', 'isl1', '21', 'x', 'x', 21)$$,
  '42501', 'a non-admin cannot insert content');
select pg_temp.expect_error($$select public.publish_lesson('isl1-l20')$$, '42501', 'a non-admin cannot publish');
select pg_temp.check((select count(*) from public.published_content) > 0, 'a non-admin can still read published content');

-- editor --------------------------------------------------------------------------------------------------------
select pg_temp.as_job();
select pg_temp.login('00000000-0000-0000-0000-00000000000c', 'editor@example.org');
select pg_temp.check((select count(*) from public.lessons) = 2, 'editor reads drafts');
insert into public.units (id, world_id, n, ar, en, sort) values ('isl1-l21', 'isl1', '21', 'جَدِيدٌ', 'New', 21);
insert into public.lessons (id, title_ar, title_en) values ('isl1-l21', 'جَدِيدٌ', 'New');
select pg_temp.check((select status from public.lessons where id = 'isl1-l21') = 'draft', 'editor creates a draft');
select pg_temp.check((select actor_label from public.audit_log where table_name = 'lessons' and row_id = 'isl1-l21') = 'editor@example.org',
  'the audit log names the editor');
select pg_temp.expect_error($$insert into public.units (id, world_id, n, ar, en, sort, status) values ('isl1-l22', 'isl1', '22', 'x', 'x', 22, 'published')$$,
  '42501', 'editor cannot create published content');
select pg_temp.expect_error($$update public.lessons set status = 'published' where id = 'isl1-l21'$$, '42501', 'editor cannot change status directly');
select pg_temp.expect_error($$select public.publish_lesson('isl1-l21')$$, '42501', 'editor cannot publish');
select pg_temp.expect_error($$select public.archive_lesson('isl1-l13')$$, '42501', 'editor cannot archive');

update public.lessons set topic = 'Edited after publishing' where id = 'isl1-l13';
select pg_temp.check((select document ->> 'topic' from public.published_content where kind = 'lesson' and id = 'isl1-l13') = 'Original topic',
  'editing a published lesson does not change what children get');
select pg_temp.check(pg_temp.rows($$delete from public.lessons where id = 'isl1-l13'$$) = 0, 'editor cannot delete a lesson that was ever published');
select pg_temp.check(pg_temp.rows($$delete from public.lessons where id = 'isl1-l21'$$) = 1, 'editor can delete a draft that was never published');

-- editor vs sacred media: one test per protected column (owner, 2026-10-22)
select pg_temp.expect_error($$update public.media_assets set approved_at = now() where path = 'audio/isl1-l13/w-masjid-ar.mp3'$$,
  '42501', 'editor cannot set approved_at');
select pg_temp.expect_error($$update public.media_assets set approved_at = null, approved_by_name = null where path = 'audio/isl1-l13/c-0-ar.mp3'$$,
  '42501', 'editor cannot clear an approval');
select pg_temp.expect_error($$update public.media_assets set approved_by = '00000000-0000-0000-0000-00000000000c' where path = 'audio/isl1-l13/c-0-ar.mp3'$$,
  '42501', 'editor cannot set approved_by');
select pg_temp.expect_error($$update public.media_assets set approved_by_name = 'Someone Else' where path = 'audio/isl1-l13/c-0-ar.mp3'$$,
  '42501', 'editor cannot set approved_by_name');
select pg_temp.expect_error($$update public.media_assets set sacred = false where path = 'audio/isl1-l13/c-0-ar.mp3'$$,
  '42501', 'editor cannot unmark sacred');
select pg_temp.expect_error($$update public.media_assets set sacred = true where path = 'audio/isl1-l13/w-masjid-ar.mp3'$$,
  '42501', 'editor cannot mark sacred');
select pg_temp.expect_error($$update public.media_assets set approval_note = 'fine' where path = 'audio/isl1-l13/c-0-ar.mp3'$$,
  '42501', 'editor cannot write the approval note');
select pg_temp.expect_error($$update public.media_assets set sha256 = repeat('f', 64) where path = 'audio/isl1-l13/c-0-ar.mp3'$$,
  '42501', 'editor cannot change the recorded hash of a repo file');
select pg_temp.expect_error($$select public.approve_media('audio/isl1-l13/w-masjid-ar.mp3')$$, '42501', 'editor cannot call approve_media');
select pg_temp.expect_error($$select public.set_media_sacred('audio/isl1-l13/c-0-ar.mp3', false)$$, '42501', 'editor cannot call set_media_sacred');
select pg_temp.expect_error($$select public.revoke_media_approval('audio/isl1-l13/c-0-ar.mp3', 'x')$$, '42501', 'editor cannot call revoke_media_approval');
select pg_temp.expect_error($$insert into public.media_assets (path, kind, storage, storage_object, sacred) values ('media/up/a.png', 'image', 'supabase', 'uploads/a.png', false)$$,
  '42501', 'editor cannot upload a file as not sacred');
select pg_temp.expect_error($$insert into public.media_assets (path, kind, storage, storage_object, approved_by_name, approved_at) values ('media/up/a.png', 'image', 'supabase', 'uploads/a.png', 'x', now())$$,
  '42501', 'editor cannot upload a pre-approved file');
select pg_temp.expect_error($$insert into public.media_assets (path, kind, lesson_id) values ('audio/isl1-l13/w-x-ar.mp3', 'audio', 'isl1-l13')$$,
  '42501', 'editor cannot record a repo file (import job only)');
insert into public.media_assets (path, kind, storage, storage_object) values ('media/up/new.png', 'image', 'supabase', 'uploads/new.png');
select pg_temp.check((select sacred and approved_at is null from public.media_assets where path = 'media/up/new.png'),
  'editor uploads start as sacred and unapproved');
select pg_temp.check(pg_temp.rows($$delete from public.media_assets where path = 'audio/isl1-l13/w-masjid-ar.mp3'$$) = 0,
  'nobody deletes a file that is in the repo');

-- editor vs sacred text
select pg_temp.expect_error(
  $$update public.lessons set words = jsonb_set(words, '{1,ar}', '"بِسْمِ الله"') where id = 'isl1-l13'$$,
  '42501', 'editor cannot change the Arabic of a sacred word');
select pg_temp.expect_error(
  $$update public.lessons set words = words - 1 where id = 'isl1-l13'$$, '42501', 'editor cannot delete a sacred word');
select pg_temp.expect_error(
  $$update public.lessons set words = jsonb_set(words, '{1,sacred}', 'false') where id = 'isl1-l13'$$, '42501', 'editor cannot unmark a sacred word');
select pg_temp.expect_error(
  $$update public.lessons set learn = jsonb_set(learn, '{0,ar}', '"بِسْمِ اللهِ"') where id = 'isl1-l13'$$,
  '42501', 'editor cannot change the Arabic of a Learn card with a sacred clip');
update public.lessons set words = jsonb_set(words, '{1,en}', '"In the name of Allah (said before entering)"') where id = 'isl1-l13';
update public.lessons set learn = jsonb_set(learn, '{0,en}', '"Say this du''aa as you enter."') where id = 'isl1-l13';
select pg_temp.check(true, 'editor can still edit the English around sacred text');

-- editor vs roles and admins (owner only)
select pg_temp.check(pg_temp.rows($$update public.roles set can_publish = true where id = 'editor'$$) = 0, 'editor cannot change roles');
select pg_temp.expect_error($$insert into public.roles (id, label_en, label_ar, can_edit_content, can_publish, can_approve_sacred, can_manage_admins, sort) values ('boss', 'Boss', 'x', true, true, true, true, 9)$$,
  '42501', 'editor cannot add a role');
select pg_temp.check(pg_temp.rows($$delete from public.roles where id = 'reviewer'$$) = 0, 'editor cannot delete a role');
select pg_temp.check((select count(*) from public.admins) = 1, 'editor sees only their own admin row');
select pg_temp.check(pg_temp.rows($$update public.admins set role = 'owner' where user_id = '00000000-0000-0000-0000-00000000000c'$$) = 0,
  'editor cannot promote themselves');
select pg_temp.expect_error($$insert into public.admins (user_id, email, display_name, role) values ('00000000-0000-0000-0000-00000000000d', 'outsider@example.org', 'X', 'editor')$$,
  '42501', 'editor cannot add admins');
select pg_temp.check(pg_temp.rows($$update public.catalog_settings set focus_new = null$$) = 0, 'editor cannot change catalog settings');
select pg_temp.expect_error($$insert into public.content_revisions (kind, entity_id, revision, document, sha256) values ('lesson', 'isl1-l20', 9, '{}', 'x')$$,
  '42501', 'editor cannot write history');
select pg_temp.expect_error($$insert into public.published_content (kind, id, document, revision_id) values ('lesson', 'isl1-l20', '{}', 1)$$,
  '42501', 'editor cannot write the published layer directly');
select pg_temp.expect_error($$delete from public.audit_log$$, '42501', 'editor cannot touch the audit log');

-- reviewer ------------------------------------------------------------------------------------------------------
select pg_temp.as_job();
select pg_temp.login('00000000-0000-0000-0000-00000000000b', 'reviewer@example.org');
select public.publish_lesson('isl1-l13', 'reviewed');
select pg_temp.check((select document ->> 'topic' from public.published_content where kind = 'lesson' and id = 'isl1-l13') = 'Edited after publishing',
  'reviewer publishes: the edit goes live');
select pg_temp.check((select max(revision) from public.content_revisions where kind = 'lesson' and entity_id = 'isl1-l13') = 2,
  'publishing adds a revision');
select public.publish_lesson('isl1-l13');
select pg_temp.check((select max(revision) from public.content_revisions where kind = 'lesson' and entity_id = 'isl1-l13') = 2,
  'publishing unchanged content adds nothing');
select public.approve_media('audio/isl1-l13/w-masjid-ar.mp3', 'checked');
select pg_temp.check((select approved_by_name = 'Reviewer' and approved_by = '00000000-0000-0000-0000-00000000000b'
  from public.media_assets where path = 'audio/isl1-l13/w-masjid-ar.mp3'), 'reviewer approves media under their own name');
select public.set_media_sacred('audio/isl1-l13/w-masjid-ar.mp3', true);
select pg_temp.check((select sacred and approved_at is null from public.media_assets where path = 'audio/isl1-l13/w-masjid-ar.mp3'),
  'marking a file sacred withdraws its approval');
select pg_temp.expect_error($$select public.publish_lesson('isl1-l13')$$, '23514', 'a lesson with unapproved sacred audio cannot be published');
select public.approve_media('audio/isl1-l13/w-masjid-ar.mp3');
savepoint reviewer_text;
update public.lessons set words = jsonb_set(words, '{1,tr}', '"Bismillāh"') where id = 'isl1-l13';
select pg_temp.check(true, 'reviewer can correct sacred text');
rollback to savepoint reviewer_text;
update public.lessons set quiz = '[{"en": "Q", "opts": [["", "A", 1], ["", "B", 1]]}]' where id = 'isl1-l20';
select pg_temp.expect_error($$select public.publish_lesson('isl1-l20')$$, '23514', 'a quiz question with two right answers cannot be published');
select pg_temp.check(pg_temp.rows($$update public.roles set can_publish = true where id = 'editor'$$) = 0, 'reviewer cannot change roles');
select pg_temp.expect_error($$insert into public.admins (user_id, email, display_name, role) values ('00000000-0000-0000-0000-00000000000d', 'outsider@example.org', 'X', 'editor')$$,
  '42501', 'reviewer cannot add admins');

-- workflow: unpublish, archive, restore
select public.unpublish_lesson('isl1-l13');
select pg_temp.check(not exists (select 1 from public.published_content where kind = 'lesson' and id = 'isl1-l13')
  and exists (select 1 from public.published_content where kind = 'unit' and id = 'isl1-l13'),
  'unpublishing leaves a "soon" box');
select public.publish_lesson('isl1-l13');
select public.archive_lesson('isl1-l13');
select pg_temp.check(not exists (select 1 from public.published_content where id = 'isl1-l13')
  and (select status from public.lessons where id = 'isl1-l13') = 'archived'
  and (select status from public.units where id = 'isl1-l13') = 'archived', 'an archived lesson disappears from the app, unit and all');
select pg_temp.expect_error($$select public.publish_lesson('isl1-l13')$$, '23514', 'an archived lesson must be restored before publishing');
select public.restore_content('lesson', 'isl1-l13');
select public.restore_content('unit', 'isl1-l13');
select pg_temp.check((select status from public.lessons where id = 'isl1-l13') = 'draft'
  and not exists (select 1 from public.published_content where id = 'isl1-l13'), 'restoring makes a draft, not a public lesson');
select pg_temp.check((select count(*) from public.audit_log where table_name = 'lessons' and row_id = 'isl1-l13' and event = 'archive') = 1,
  'the audit log names the archive event');

-- promos
select pg_temp.expect_error($$insert into public.promos (id, text_en, url, placement, sort) values ('bad', 'x', 'https://example.com/', 'map', 1)$$,
  '23514', 'a promo can only link to dhm-institute.com');
select pg_temp.expect_error($$insert into public.promos (id, text_en, url, placement, sort) values ('bad', 'x', 'http://dhm-institute.com/', 'map', 1)$$,
  '23514', 'a promo link must be https');
insert into public.promos (id, text_en, url, placement, sort) values
  ('trial-class', 'Book a free trial class with a certified DHM teacher', 'https://dhm-institute.com/trial-sessions/booking', 'parents', 1);
select public.publish_promo('trial-class');
select pg_temp.check((select document = '{"id": "trial-class", "text": "Book a free trial class with a certified DHM teacher",
  "url": "https://dhm-institute.com/trial-sessions/booking", "placement": "parents", "sort": 1}'::jsonb
  from public.published_content where kind = 'promo' and id = 'trial-class'), 'an active promo is published');
update public.promos set active = false where id = 'trial-class';
select public.publish_promo('trial-class');
select pg_temp.check(not exists (select 1 from public.published_content where kind = 'promo'), 'a promo switched off leaves the app at publish');

-- owner ---------------------------------------------------------------------------------------------------------
select pg_temp.as_job();
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'owner@example.org');
select pg_temp.check(pg_temp.rows($$update public.roles set label_en = 'Teacher-reviewer' where id = 'reviewer'$$) = 1, 'owner can change roles');
select pg_temp.check((select count(*) from public.admins) = 3, 'owner sees every admin');
select pg_temp.check(pg_temp.rows($$update public.catalog_settings set note = 'owner note'$$) = 1, 'owner can change catalog settings');
select pg_temp.check(not (select public.world_document(w) ? 'code' from public.worlds w where id = 'isl1'),
  'a world without a display code exports no "code" key (catalog.json stays unchanged)');
update public.worlds set display_code = 'ISL A1' where id = 'isl1';
select public.publish_world('isl1');
select pg_temp.check((select document ->> 'code' from public.published_content where kind = 'world' and id = 'isl1') = 'ISL A1',
  'a display code is published as "code"');

-- history cannot be wiped -----------------------------------------------------------------------------------------
select pg_temp.as_job();
select pg_temp.expect_error($$truncate public.content_revisions cascade$$, '42501', 'content_revisions cannot be truncated');
select pg_temp.expect_error($$truncate public.audit_log$$, '42501', 'audit_log cannot be truncated');

rollback;
\o
\echo 'access and workflow: all checks passed'
