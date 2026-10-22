-- Koko backend, migration 9: what the repo held at the last import (two writers during the transition).
--
-- Until the dashboard replaces it, the local production session keeps committing content/** to main. The import
-- (scripts/import-json.ts) brings those commits into the database; the export (scripts/export-static.ts) writes
-- what the dashboard published back to the repo. These tables let each side see what the other changed:
--   * import: a lesson that changed in the repo AND was edited in the dashboard since the last import is a
--     conflict. It is reported and left alone, never overwritten;
--   * export: a file whose bytes changed in git since the last import is not overwritten (it is reported).
-- Written only by the jobs (service role / direct connection). Admins can read it.

create table public.repo_sync (
  kind        text not null check (kind in ('catalog', 'world', 'unit', 'lesson')),
  id          text not null,
  document    jsonb not null check (jsonb_typeof(document) = 'object'),   -- the entity as the repo had it
  git_commit  text,
  imported_at timestamptz not null default now(),
  primary key (kind, id)
);
comment on table public.repo_sync is 'Each entity as content/** had it at the last import. Catalog and worlds without children, units without "file".';

create table public.repo_files (
  path        text primary key check (path ~ '^content/[a-z0-9/_-]+\.json$'),
  sha256      text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  git_commit  text,
  imported_at timestamptz not null default now()
);
comment on table public.repo_files is 'Bytes of each content JSON file at the last import or export. The export never overwrites a file whose bytes differ from this.';

alter table public.repo_sync  enable row level security;
alter table public.repo_files enable row level security;
grant select on public.repo_sync, public.repo_files to authenticated;
create policy repo_sync_admin_read  on public.repo_sync  for select to authenticated using ((select public.current_admin_role()) is not null);
create policy repo_files_admin_read on public.repo_files for select to authenticated using ((select public.current_admin_role()) is not null);
