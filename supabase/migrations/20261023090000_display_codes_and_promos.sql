-- Koko backend, migration 6: DHM display codes for worlds, and in-app promos for the institute.
--
-- Display codes (owner, 2026-10-22) are names only: ARkid A1…D3 for the 12 Arabic books, ISL A1/A2/A3,
-- QAPRE1 and QR A1 for the two Qur'an worlds. World ids (ar1, ar2, isl1, isl2, prayer…) never change.
-- A code is exported as "code" on the world only when it is set, so today's catalog.json stays byte-identical.

alter table public.worlds
  add column display_code text unique check (display_code ~ '^[A-Za-z][A-Za-z0-9]*( [A-Za-z0-9]+)*$');
comment on column public.worlds.display_code is 'DHM level code shown to parents and teachers, e.g. "ARkid A1". A name only: the id stays the key.';

alter table public.worlds drop constraint worlds_extra_check;
alter table public.worlds add constraint worlds_extra_check check (jsonb_typeof(extra) = 'object'
  and not (extra ?| array['id', 'en', 'ar', 'tint', 'ink', 'units', 'code']));

create or replace function public.world_document(w public.worlds) returns jsonb
language sql stable
set search_path = ''
as $$
  select public.jsonb_strip_top_nulls(jsonb_build_object(
    'id', w.id, 'code', w.display_code, 'en', w.en, 'ar', w.ar, 'tint', w.tint, 'ink', w.ink)) || w.extra
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- promos: DHM Institute messages for parents (trial class booking, recorded courses).
-- Edited in the dashboard, published and exported like every other piece of content.
-- Every link leaves the app, so the app must open it only behind a parental gate (Google Play Families,
-- Apple Kids category). That is enforced in the app; here the link is limited to DHM's own https site.
-- ---------------------------------------------------------------------------------------------------------------
create type public.promo_placement as enum ('after_lesson', 'map', 'parents');

create table public.promos (
  id          text primary key check (id ~ '^[a-z][a-z0-9-]*$'),
  text_en     text not null check (length(btrim(text_en)) > 0),
  url         text not null check (url ~ '^https://(www\.)?dhm-institute\.com(/[^\s]*)?$'),
  placement   public.promo_placement not null,
  active      boolean not null default true,     -- off = removed from the app at the next publish
  sort        integer not null,
  status      public.content_status not null default 'draft',
  extra       jsonb not null default '{}' check (jsonb_typeof(extra) = 'object'
                and not (extra ?| array['id', 'text', 'url', 'placement', 'sort'])),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null,
  constraint promos_sort_unique unique (placement, sort) deferrable initially deferred
);
comment on table public.promos is 'Parent-facing promos for DHM Institute. Links open only behind the app''s parental gate.';

create function public.promo_document(p public.promos) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object('id', p.id, 'text', p.text_en, 'url', p.url, 'placement', p.placement::text, 'sort', p.sort)
    || p.extra
$$;

create trigger promos_touch    before insert or update on public.promos for each row execute function public.touch_row();
create trigger promos_id_fixed before update on public.promos for each row execute function public.forbid_id_change();
create trigger promos_audit    after insert or update or delete on public.promos for each row execute function public.audit_row('id');
alter table public.promos enable row level security;

-- promos join the published layer
alter table public.content_revisions drop constraint content_revisions_kind_check;
alter table public.content_revisions add constraint content_revisions_kind_check
  check (kind in ('catalog', 'world', 'unit', 'lesson', 'promo'));
alter table public.published_content drop constraint published_content_kind_check;
alter table public.published_content add constraint published_content_kind_check
  check (kind in ('catalog', 'world', 'unit', 'lesson', 'promo'));
alter table public.published_content drop constraint published_content_shape;
alter table public.published_content add constraint published_content_shape check (
  (kind = 'catalog' and id = 'catalog' and world_id is null and sort is null) or
  (kind = 'world'   and world_id is null and sort is not null) or
  (kind = 'unit'    and world_id is not null and sort is not null) or
  (kind = 'lesson'  and world_id is null and sort is null) or
  (kind = 'promo'   and world_id is null and sort is not null));

-- history can never be wiped in one go either (owner, 2026-10-22)
create trigger content_revisions_no_truncate before truncate on public.content_revisions
  for each statement execute function public.content_revisions_append_only();

revoke all on function public.world_document(public.worlds) from public, anon, authenticated;
revoke all on function public.promo_document(public.promos) from public, anon, authenticated;
