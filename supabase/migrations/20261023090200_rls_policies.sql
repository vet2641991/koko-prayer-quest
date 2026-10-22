-- Koko backend, migration 8: row-level security policies and the exact grants behind them (Milestone 1, step 3).
--
--   Public (anon) and signed-in users : read published_content only. No admin column (published_by),
--                                       no media table (sacred flags), no working copy, no history.
--   Admins (active row in admins)    : read every admin table.
--   edit_content (owner/reviewer/editor) : write drafts: worlds, units, lessons, promos, media uploads.
--   publish (owner/reviewer)          : the publish_* / unpublish_* / archive_* / restore_content functions.
--   approve_sacred (owner/reviewer)   : approve_media, revoke_media_approval, set_media_sacred.
--   manage_admins (owner)             : admins, roles, catalog settings.
-- Status, approval and sacred columns cannot be written directly by anyone through the API (migration 7 guards).
-- Policies use (select …) around the helpers so Postgres evaluates them once per statement, not per row.

-- ---------------------------------------------------------------------------------------------------------------
-- The published layer: everyone may read it, nobody writes it except the workflow functions
-- ---------------------------------------------------------------------------------------------------------------
grant select (kind, id, world_id, sort, document, published_at) on public.published_content to anon, authenticated;
create policy published_content_read on public.published_content
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------------------------------------------
-- Admin reads
-- ---------------------------------------------------------------------------------------------------------------
grant select on public.worlds, public.units, public.lessons, public.promos, public.catalog_settings,
  public.media_assets, public.content_revisions, public.audit_log, public.roles to authenticated;

create policy worlds_admin_read            on public.worlds            for select to authenticated using ((select public.current_admin_role()) is not null);
create policy units_admin_read             on public.units             for select to authenticated using ((select public.current_admin_role()) is not null);
create policy lessons_admin_read           on public.lessons           for select to authenticated using ((select public.current_admin_role()) is not null);
create policy promos_admin_read            on public.promos            for select to authenticated using ((select public.current_admin_role()) is not null);
create policy catalog_settings_admin_read  on public.catalog_settings  for select to authenticated using ((select public.current_admin_role()) is not null);
create policy media_assets_admin_read      on public.media_assets      for select to authenticated using ((select public.current_admin_role()) is not null);
create policy content_revisions_admin_read on public.content_revisions for select to authenticated using ((select public.current_admin_role()) is not null);
create policy audit_log_admin_read         on public.audit_log         for select to authenticated using ((select public.current_admin_role()) is not null);
create policy roles_admin_read             on public.roles             for select to authenticated using ((select public.current_admin_role()) is not null);

-- ---------------------------------------------------------------------------------------------------------------
-- Drafts: anyone with edit_content. Rows that were ever published can only be archived, never deleted.
-- ---------------------------------------------------------------------------------------------------------------
grant insert, update, delete on public.worlds, public.units, public.lessons, public.promos to authenticated;

create policy worlds_edit_insert on public.worlds for insert to authenticated with check ((select public.has_permission('edit_content')));
create policy worlds_edit_update on public.worlds for update to authenticated
  using ((select public.has_permission('edit_content'))) with check ((select public.has_permission('edit_content')));
create policy worlds_edit_delete on public.worlds for delete to authenticated using (
  (select public.has_permission('edit_content'))
  and not exists (select 1 from public.content_revisions r where r.kind = 'world' and r.entity_id = worlds.id));

create policy units_edit_insert on public.units for insert to authenticated with check ((select public.has_permission('edit_content')));
create policy units_edit_update on public.units for update to authenticated
  using ((select public.has_permission('edit_content'))) with check ((select public.has_permission('edit_content')));
create policy units_edit_delete on public.units for delete to authenticated using (
  (select public.has_permission('edit_content'))
  and not exists (select 1 from public.content_revisions r where r.kind = 'unit' and r.entity_id = units.id));

create policy lessons_edit_insert on public.lessons for insert to authenticated with check ((select public.has_permission('edit_content')));
create policy lessons_edit_update on public.lessons for update to authenticated
  using ((select public.has_permission('edit_content'))) with check ((select public.has_permission('edit_content')));
create policy lessons_edit_delete on public.lessons for delete to authenticated using (
  (select public.has_permission('edit_content'))
  and not exists (select 1 from public.content_revisions r where r.kind = 'lesson' and r.entity_id = lessons.id));

create policy promos_edit_insert on public.promos for insert to authenticated with check ((select public.has_permission('edit_content')));
create policy promos_edit_update on public.promos for update to authenticated
  using ((select public.has_permission('edit_content'))) with check ((select public.has_permission('edit_content')));
create policy promos_edit_delete on public.promos for delete to authenticated using (
  (select public.has_permission('edit_content'))
  and not exists (select 1 from public.content_revisions r where r.kind = 'promo' and r.entity_id = promos.id));

-- Media: editors record uploads (the guard keeps them sacred and unapproved). Only uploads that never reached
-- the repo can be deleted; files in audio/ and media/ are never deleted.
grant insert, update, delete on public.media_assets to authenticated;
create policy media_assets_edit_insert on public.media_assets for insert to authenticated
  with check ((select public.has_permission('edit_content')));
create policy media_assets_edit_update on public.media_assets for update to authenticated
  using ((select public.has_permission('edit_content'))) with check ((select public.has_permission('edit_content')));
create policy media_assets_edit_delete on public.media_assets for delete to authenticated
  using ((select public.has_permission('edit_content')) and storage = 'supabase');

-- ---------------------------------------------------------------------------------------------------------------
-- Owner only: admins, roles, catalog settings
-- ---------------------------------------------------------------------------------------------------------------
grant select, insert, update, delete on public.admins to authenticated;
create policy admins_read on public.admins for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('manage_admins')));
create policy admins_owner_insert on public.admins for insert to authenticated with check ((select public.has_permission('manage_admins')));
create policy admins_owner_update on public.admins for update to authenticated
  using ((select public.has_permission('manage_admins'))) with check ((select public.has_permission('manage_admins')));
create policy admins_owner_delete on public.admins for delete to authenticated using ((select public.has_permission('manage_admins')));

grant insert, update, delete on public.roles to authenticated;
create policy roles_owner_insert on public.roles for insert to authenticated with check ((select public.has_permission('manage_admins')));
create policy roles_owner_update on public.roles for update to authenticated
  using ((select public.has_permission('manage_admins'))) with check ((select public.has_permission('manage_admins')));
create policy roles_owner_delete on public.roles for delete to authenticated using ((select public.has_permission('manage_admins')));

grant insert, update on public.catalog_settings to authenticated;
create policy catalog_settings_owner_insert on public.catalog_settings for insert to authenticated
  with check ((select public.has_permission('manage_admins')));
create policy catalog_settings_owner_update on public.catalog_settings for update to authenticated
  using ((select public.has_permission('manage_admins'))) with check ((select public.has_permission('manage_admins')));

-- ---------------------------------------------------------------------------------------------------------------
-- Functions the dashboard may call. Each checks its own permission; anon can call none of them.
-- ---------------------------------------------------------------------------------------------------------------
grant execute on function
  public.publish_world(text, text), public.publish_unit(text, text), public.publish_lesson(text, text),
  public.publish_catalog(text), public.publish_promo(text, text), public.unpublish_lesson(text),
  public.archive_lesson(text), public.archive_unit(text), public.archive_world(text), public.archive_promo(text),
  public.restore_content(text, text),
  public.approve_media(text, text), public.revoke_media_approval(text, text), public.set_media_sacred(text, boolean, text),
  public.unapproved_sacred_clips(text),
  public.world_document(public.worlds), public.unit_document(public.units), public.lesson_document(public.lessons),
  public.catalog_document(public.catalog_settings), public.promo_document(public.promos), public.jsonb_strip_top_nulls(jsonb),
  public.is_trusted_caller(), public.is_job(), public.require_permission(text)
to authenticated, service_role;
