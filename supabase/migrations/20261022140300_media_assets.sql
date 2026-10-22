-- Koko backend, migration 4 of 5: media_assets.
--
-- One row per audio, video or image file the app can load. The files themselves stay on static hosting
-- (audio/, media/ in this repo); only new admin uploads live in Supabase Storage until a publish copies them in.
-- The row records what the file is, which lesson owns it, whether it is sacred, and who approved it.
--
-- "sacred" is admin-only information: it is never exported and never readable by the public API.

create type public.media_kind as enum ('audio', 'video', 'poster', 'image', 'file');

create table public.media_assets (
  id                uuid primary key default gen_random_uuid(),
  -- path as served next to index.html, e.g. audio/isl1-l13/c-3-ar.mp3 or media/prayer-1.mp4
  path              text not null unique check (
                      path ~ '^(audio|media)/[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*$'
                      and path !~ '\.\.'),
  kind              public.media_kind not null,
  -- owner lesson: the folder an audio clip lives in (review lessons borrow clips, they never own them)
  lesson_id         text references public.lessons (id) on update restrict on delete restrict,
  -- true = du'aa, adhkar, adhan, tashahhud, Qur'an … recorded or approved by Dr. Hassan Muslim.
  -- Defaults to true: an unclassified file is treated as sacred until an owner or reviewer says otherwise.
  sacred            boolean not null default true,
  approved_by       uuid references public.admins (user_id) on delete set null,
  approved_by_name  text,          -- always filled with the approver's name, so the record survives the admin being removed
                                   -- (for approvals given before the dashboard existed it is the only field: 'Dr. Hassan Muslim')
  approved_at       timestamptz,
  approval_note     text,
  storage           text not null default 'static' check (storage in ('static', 'supabase')),
  storage_object    text,          -- bucket/object of an upload that is not in the repo yet
  bytes             bigint check (bytes >= 0),
  sha256            text check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id) on delete set null,
  constraint media_audio_in_lesson_folder check (
    kind <> 'audio' or (lesson_id is not null and path like 'audio/' || lesson_id || '/%.mp3')),
  constraint media_approval_complete check (
    (approved_at is null and approved_by is null and approved_by_name is null) or
    (approved_at is not null and approved_by_name is not null)),
  constraint media_storage_object check ((storage = 'supabase') = (storage_object is not null))
);
comment on table public.media_assets is 'Every file the app loads. Admin-only. Files in audio/ and media/ are never edited, re-encoded, renamed or deleted.';
comment on column public.media_assets.sacred is 'Admin-only flag. Never exported, never shown to children.';
create index media_assets_lesson_idx on public.media_assets (lesson_id);
create index media_assets_needs_approval_idx on public.media_assets (lesson_id) where sacred and approved_at is null;

-- A file is identified by its path forever, and an approval belongs to the exact bytes that were approved.
-- If a sacred file's content changes (a re-cut clip), its approval is withdrawn until it is approved again.
create function public.media_assets_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.path is distinct from old.path then
    raise exception 'media path % cannot be changed (the app and the lessons refer to it)', old.path
      using errcode = 'check_violation';
  end if;
  if new.sacred and old.sha256 is not null and new.sha256 is distinct from old.sha256
     and new.approved_at is not distinct from old.approved_at then
    new.approved_at := null;
    new.approved_by := null;
    new.approved_by_name := null;
    new.approval_note := 'Approval withdrawn: file content changed on ' || now()::date || ' (was ' || old.sha256 || ')';
  end if;
  return new;
end
$$;
create trigger media_assets_guard before update on public.media_assets
  for each row execute function public.media_assets_guard();
create trigger media_assets_touch before insert or update on public.media_assets
  for each row execute function public.touch_row();
create trigger media_assets_audit after insert or update or delete on public.media_assets
  for each row execute function public.audit_row('path');

alter table public.media_assets enable row level security;
