-- Koko backend, migration 3 of 5: content.
--
-- Two layers (docs/SCHEMA.md §2):
--   1. Working tables  — catalog_settings, worlds, units, lessons. What admins edit. Never public.
--   2. Published layer — published_content holds the exact JSON objects that are live right now, and
--                        content_revisions keeps every version ever published (history and rollback).
-- The static export reads ONLY published_content, and the public API (step 3) may read ONLY published_content.
-- Editing a published lesson therefore changes nothing for children until someone with the publish
-- permission publishes it again. Draft text cannot leak, even through a row that is "published".
--
-- Strings are stored exactly as written: no trimming, no Unicode normalisation, tashkeel untouched.

create type public.content_status as enum ('draft', 'published', 'archived');
comment on type public.content_status is
  'draft: not public. published: public (as of its last published revision). archived: removed from the app, kept here.';

-- ---------------------------------------------------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------------------------------------------------

-- Drops top-level keys whose value is SQL NULL / JSON null. Nested values are left exactly as they are.
create function public.jsonb_strip_top_nulls(doc jsonb) returns jsonb
language sql immutable parallel safe
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(doc)
  where jsonb_typeof(value) <> 'null'
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- worlds  →  catalog.json  worlds[]  (without "units")
-- ---------------------------------------------------------------------------------------------------------------
create table public.worlds (
  id          text primary key check (id ~ '^[a-z][a-z0-9]*$'),
  en          text not null,   -- the first digit in it is the world icon (AUDIT §4)
  ar          text not null,
  tint        text not null check (tint ~ '^#[0-9A-Fa-f]{6}$'),
  ink         text not null check (ink ~ '^#[0-9A-Fa-f]{6}$'),
  sort        integer not null,
  status      public.content_status not null default 'draft',
  extra       jsonb not null default '{}' check (jsonb_typeof(extra) = 'object'
                and not (extra ?| array['id', 'en', 'ar', 'tint', 'ink', 'units'])),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null,
  constraint worlds_sort_unique unique (sort) deferrable initially deferred
);
comment on column public.worlds.extra is 'JSON keys the schema does not know yet, kept so nothing is ever lost on a round trip.';

-- ---------------------------------------------------------------------------------------------------------------
-- units  →  catalog.json  worlds[].units[]
-- A unit can exist without a lesson: it then shows as a locked "soon" box (or, with go_world_id, as a link).
-- ---------------------------------------------------------------------------------------------------------------
create table public.units (
  id           text primary key check (id ~ '^[a-z][a-z0-9]*-[a-z][a-z0-9]*$'),
  world_id     text not null references public.worlds (id) on update restrict on delete restrict,
  n            text not null,          -- label in the map dot ("1", "R1"…). Text on purpose.
  ar           text not null,
  en           text not null,
  go_world_id  text references public.worlds (id) on update restrict on delete restrict,
  sort         integer not null,
  status       public.content_status not null default 'draft',
  extra        jsonb not null default '{}' check (jsonb_typeof(extra) = 'object'
                 and not (extra ?| array['id', 'n', 'ar', 'en', 'file', 'go'])),
  -- where the lesson file is published. Fixed by the id, exactly as every file is named today (AUDIT §4).
  file_path    text generated always as
                 ('content/' || world_id || '/' || substr(id, length(world_id) + 2) || '.json') stored,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null,
  constraint units_id_has_world_prefix check (left(id, length(world_id) + 1) = world_id || '-'),
  constraint units_go_elsewhere check (go_world_id is null or go_world_id <> world_id),
  constraint units_sort_unique unique (world_id, sort) deferrable initially deferred
);
create index units_world_idx on public.units (world_id, sort);

-- ---------------------------------------------------------------------------------------------------------------
-- lessons  →  content/<world>/<suffix>.json
-- Common parts are columns; parts whose shape varies are jsonb holding the original JSON verbatim.
-- A missing JSON key is SQL NULL (never [] or {}), so absent stays absent on export.
-- ---------------------------------------------------------------------------------------------------------------
create table public.lessons (
  id          text primary key references public.units (id) on update restrict on delete restrict,
  status      public.content_status not null default 'draft',
  -- JSON "id" and "world" are not columns: they always equal the unit's id and world (checked on import).
  unit_no     integer check (unit_no > 0),                 -- "unit"
  source      text,                                        -- "source" (provenance and approval notes)
  title_ar    text not null,                               -- "title".ar
  title_en    text not null,                               -- "title".en
  topic       text,                                        -- "topic"
  minutes     integer check (minutes between 1 and 120),   -- "minutes"
  note        text,                                        -- "note"
  video       jsonb check (video    is null or jsonb_typeof(video)    = 'object'),
  learn       jsonb check (learn    is null or jsonb_typeof(learn)    = 'array'),
  words       jsonb check (words    is null or jsonb_typeof(words)    = 'array'),
  sounds      jsonb check (sounds   is null or jsonb_typeof(sounds)   = 'object'),
  games       jsonb check (games    is null or jsonb_typeof(games)    = 'array'),
  order_game  jsonb check (order_game is null or jsonb_typeof(order_game) = 'object'),   -- "order"
  dialogue    jsonb check (dialogue is null or jsonb_typeof(dialogue) = 'array'),
  speakers    jsonb check (speakers is null or jsonb_typeof(speakers) = 'object'),
  talk        jsonb check (talk     is null or jsonb_typeof(talk)     = 'array'),
  quiz        jsonb check (quiz     is null or jsonb_typeof(quiz)     = 'array'),
  move        jsonb check (move     is null or jsonb_typeof(move)     = 'object'),
  think       jsonb check (think    is null or jsonb_typeof(think)    = 'object'),
  parents     jsonb check (parents  is null or jsonb_typeof(parents)  = 'object'),
  extra       jsonb not null default '{}' check (jsonb_typeof(extra) = 'object'
                and not (extra ?| array['id', 'world', 'unit', 'source', 'title', 'topic', 'minutes', 'note',
                  'video', 'learn', 'words', 'sounds', 'games', 'order', 'dialogue', 'speakers', 'talk', 'quiz',
                  'move', 'think', 'parents'])),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);
comment on table public.lessons is 'Working copy of each lesson. Children only ever see a published revision of it (published_content).';
comment on column public.lessons.order_game is 'The lesson JSON key "order" (renamed: ORDER is an SQL keyword).';
comment on column public.lessons.extra is 'Lesson JSON keys the schema does not know yet (e.g. a new field from the local production session).';

-- A "go" unit is a link to another world and can never carry a lesson.
create function public.lesson_unit_is_not_a_link() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'lessons' then
    if exists (select 1 from public.units u where u.id = new.id and u.go_world_id is not null) then
      raise exception 'Unit % links to another world and cannot have a lesson', new.id using errcode = 'check_violation';
    end if;
  elsif new.go_world_id is not null and exists (select 1 from public.lessons l where l.id = new.id) then
    raise exception 'Unit % has a lesson, so it cannot become a link', new.id using errcode = 'check_violation';
  end if;
  return new;
end
$$;
create trigger lessons_not_on_link before insert or update on public.lessons
  for each row execute function public.lesson_unit_is_not_a_link();
create trigger units_link_has_no_lesson before insert or update of go_world_id on public.units
  for each row execute function public.lesson_unit_is_not_a_link();

-- ---------------------------------------------------------------------------------------------------------------
-- catalog_settings  →  catalog.json top level (one row)
-- ---------------------------------------------------------------------------------------------------------------
create table public.catalog_settings (
  id            boolean primary key default true check (id),   -- exactly one row
  version       integer not null default 1,
  note          text,
  focus         text references public.worlds (id) on update restrict on delete restrict,  -- Haitham's world
  start         text references public.units (id)  on update restrict on delete restrict,  -- Haitham's unit
  focus_new     text references public.worlds (id) on update restrict on delete restrict,  -- "focusNew"
  teacher_note  jsonb check (teacher_note is null or jsonb_typeof(teacher_note) = 'object'),   -- "teacherNote"
  extra         jsonb not null default '{}' check (jsonb_typeof(extra) = 'object'
                  and not (extra ?| array['version', 'note', 'focus', 'worlds', 'start', 'focusNew', 'teacherNote'])),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null
);

-- ---------------------------------------------------------------------------------------------------------------
-- Document builders: working row → the exact JSON object the app reads.
-- Publishing (step 3) stores their output; the import round-trip check (step 4) compares it with the files.
-- ---------------------------------------------------------------------------------------------------------------
create function public.world_document(w public.worlds) returns jsonb
language sql stable
set search_path = ''
as $$
  select public.jsonb_strip_top_nulls(jsonb_build_object(
    'id', w.id, 'en', w.en, 'ar', w.ar, 'tint', w.tint, 'ink', w.ink)) || w.extra
$$;

-- Without "file": the export adds it only when the unit's lesson is published.
create function public.unit_document(u public.units) returns jsonb
language sql stable
set search_path = ''
as $$
  select public.jsonb_strip_top_nulls(jsonb_build_object(
    'id', u.id, 'n', u.n, 'ar', u.ar, 'en', u.en, 'go', u.go_world_id)) || u.extra
$$;

create function public.lesson_document(l public.lessons) returns jsonb
language sql stable
set search_path = ''
as $$
  select public.jsonb_strip_top_nulls(jsonb_build_object(
    'id',       l.id,
    'world',    (select u.world_id from public.units u where u.id = l.id),
    'unit',     l.unit_no,
    'source',   l.source,
    'title',    jsonb_build_object('ar', l.title_ar, 'en', l.title_en),
    'topic',    l.topic,
    'minutes',  l.minutes,
    'note',     l.note,
    'video',    l.video,
    'learn',    l.learn,
    'words',    l.words,
    'sounds',   l.sounds,
    'games',    l.games,
    'order',    l.order_game,
    'dialogue', l.dialogue,
    'speakers', l.speakers,
    'talk',     l.talk,
    'quiz',     l.quiz,
    'move',     l.move,
    'think',    l.think,
    'parents',  l.parents)) || l.extra
$$;

-- Without "worlds": the export assembles them from the published worlds and units.
create function public.catalog_document(c public.catalog_settings) returns jsonb
language sql stable
set search_path = ''
as $$
  select public.jsonb_strip_top_nulls(jsonb_build_object(
    'version', c.version, 'note', c.note, 'focus', c.focus, 'start', c.start, 'focusNew', c.focus_new,
    'teacherNote', c.teacher_note)) || c.extra
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- content_revisions: every version ever published. Append-only.
-- ---------------------------------------------------------------------------------------------------------------
create table public.content_revisions (
  id            bigint generated always as identity primary key,
  kind          text not null check (kind in ('catalog', 'world', 'unit', 'lesson')),
  entity_id     text not null,
  revision      integer not null check (revision > 0),
  document      jsonb not null check (jsonb_typeof(document) = 'object'),
  sha256        text not null,   -- of the stored document, set on insert
  published_at  timestamptz not null default now(),
  published_by  uuid references auth.users (id) on delete set null,
  published_by_label text not null default public.current_actor_label(),
  note          text,
  constraint content_revisions_unique unique (kind, entity_id, revision)
);
comment on table public.content_revisions is 'History of published versions. Re-publishing an old revision is the rollback path.';

create function public.content_revisions_append_only() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'content_revisions is append-only' using errcode = 'insufficient_privilege';
end
$$;
create trigger content_revisions_no_update before update or delete on public.content_revisions
  for each row execute function public.content_revisions_append_only();

create function public.content_revisions_hash() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.sha256 := encode(sha256(convert_to(new.document::text, 'UTF8')), 'hex');
  return new;
end
$$;
create trigger content_revisions_hash before insert on public.content_revisions
  for each row execute function public.content_revisions_hash();

-- ---------------------------------------------------------------------------------------------------------------
-- published_content: what is live right now. The ONLY source of the static export and of public reads.
-- One row per published thing. Archiving or unpublishing deletes the row (the revision history stays).
-- ---------------------------------------------------------------------------------------------------------------
create table public.published_content (
  kind          text not null check (kind in ('catalog', 'world', 'unit', 'lesson')),
  id            text not null,
  key           text generated always as (kind || ':' || id) stored unique,
  world_id      text,      -- units: their world (for assembling the catalog)
  sort          integer,   -- worlds and units: display order as of publishing
  document      jsonb not null check (jsonb_typeof(document) = 'object'),
  revision_id   bigint not null references public.content_revisions (id) on delete restrict,
  published_at  timestamptz not null default now(),
  published_by  uuid references auth.users (id) on delete set null,
  primary key (kind, id),
  constraint published_content_shape check (
    (kind = 'catalog' and id = 'catalog' and world_id is null and sort is null) or
    (kind = 'world'   and world_id is null and sort is not null) or
    (kind = 'unit'    and world_id is not null and sort is not null) or
    (kind = 'lesson'  and world_id is null and sort is null))
);
comment on table public.published_content is
  'The live content. A lesson appears to children only if it has a row here AND its unit has one; a unit row without a lesson row is a "soon" box.';

-- ---------------------------------------------------------------------------------------------------------------
-- Bookkeeping triggers
-- ---------------------------------------------------------------------------------------------------------------
create trigger worlds_touch   before insert or update on public.worlds   for each row execute function public.touch_row();
create trigger units_touch    before insert or update on public.units    for each row execute function public.touch_row();
create trigger lessons_touch  before insert or update on public.lessons  for each row execute function public.touch_row();
create trigger catalog_touch  before insert or update on public.catalog_settings for each row execute function public.touch_row();

create trigger worlds_id_fixed  before update on public.worlds  for each row execute function public.forbid_id_change();
create trigger units_id_fixed   before update on public.units   for each row execute function public.forbid_id_change();
create trigger lessons_id_fixed before update on public.lessons for each row execute function public.forbid_id_change();

-- A unit never moves to another world: its id carries the world prefix and its audio folder is named by it.
create function public.forbid_world_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.world_id is distinct from old.world_id then
    raise exception 'Unit % cannot move to another world', old.id using errcode = 'check_violation';
  end if;
  return new;
end
$$;
create trigger units_world_fixed before update on public.units for each row execute function public.forbid_world_change();

create trigger worlds_audit   after insert or update or delete on public.worlds   for each row execute function public.audit_row('id');
create trigger units_audit    after insert or update or delete on public.units    for each row execute function public.audit_row('id');
create trigger lessons_audit  after insert or update or delete on public.lessons  for each row execute function public.audit_row('id');
create trigger catalog_audit  after insert or update or delete on public.catalog_settings for each row execute function public.audit_row('id');
create trigger published_audit after insert or update or delete on public.published_content for each row execute function public.audit_row('key');

alter table public.worlds            enable row level security;
alter table public.units             enable row level security;
alter table public.lessons           enable row level security;
alter table public.catalog_settings  enable row level security;
alter table public.content_revisions enable row level security;
alter table public.published_content enable row level security;
