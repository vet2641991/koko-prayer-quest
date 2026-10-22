# Keeping the repo and Supabase in step

During the transition there are two writers:

- the **local production session**, which keeps committing lessons and audio to `main`;
- the **admin dashboard**, which edits the database.

Two jobs keep them in step:

| Job | Direction | When it runs |
|---|---|---|
| `scripts/import-json.ts` | repo → database | every push to `main` that touches `content/**`, `audio/**`, `media/**` or the migrations (workflow **Sync to Supabase**), or by hand |
| `scripts/export-static.ts` | database → repo | when an admin presses "Send to the site" (workflow **Publish content**), or by hand |

Neither job can undo the other's work. The import remembers what the repo held (`repo_sync`, `repo_files`), so it can tell the two cases apart:

- **The repo changed and the dashboard didn't:** the import applies the change.
- **Both changed:** that's a conflict. It is reported and nothing is overwritten.

## The import, step by step

1. **Validate** `content/` with the shared validator (`packages/shared`). This checks the shape of every file, ids,
   cross-references, quiz answers, and that every referenced audio or video file exists. With any error, nothing is
   touched.
2. **Upsert** worlds, units, lessons and the catalog settings into the working tables. Anything unchanged since the
   last import is skipped, so running it twice changes nothing.
3. **Record every file** in `audio/` and `media/` in `media_assets`, with `bytes` and `sha256`. The sacred flags
   are seeded the first time a file is seen (`docs/SCHEMA.md` §4, `supabase/seed/`). If a sacred file's bytes
   change (a re-cut clip), it loses its approval.
4. **Publish** what was imported through the same `publish_*` functions the dashboard uses. The repo is already
   live, so the published layer has to match it. A lesson whose sacred audio isn't approved stays at its previous
   published version.
5. **Round trip.** Rebuild `catalog.json` and every imported lesson from the database and compare them with the
   files. They must be identical apart from key order. Any difference rolls the whole import back.

Everything runs in **one transaction**: either all of it is saved, or none of it.

| Exit | Meaning |
|---|---|
| 0 | Done. The database matches the repo. |
| 1 | Nothing was changed. The run summary lists the errors. |
| 2 | Saved, but something needs a person: a conflict, sacred audio waiting for approval, or an approval withdrawn because a file changed. The workflow turns red, so the owner is emailed. |

## The export, step by step

The export reads **only** `published_content`, inside one read-only snapshot, so draft text can't reach the files.

1. **Assemble** `catalog.json` from the published worlds and units, in `sort` order. A unit gets `"file"` only when
   its lesson is published; otherwise it is a "soon" box. Each published lesson goes to its unit's file path.
   Published promos go to `content/promos.json`.
2. **Copy uploads** the published content uses from Supabase Storage into the repo. Unapproved sacred uploads are
   refused, an upload never replaces a file that is already in the repo, and the bytes must match the recorded
   `sha256`.
3. **Validate** the tree exactly as the app will see it, with the same validator the import uses. This checks that
   every referenced audio file exists, that unit ids are unique, that every quiz question has exactly one correct
   answer, and more.
4. **Guard.** A file it would change or remove must still have the bytes the last import recorded
   (`repo_files`). If the local production session changed it in git since then, the export stops and asks for
   "Sync to Supabase" first.
5. **Write** each file the way the files are written today: same key order, `indent 2`, UTF-8, Arabic unescaped, no
   trailing newline. A file whose content didn't change is left byte for byte, so exporting today's content is a
   **zero diff**. A lesson that is no longer published (unpublished or archived) has its file removed, and its unit
   stays as a "soon" box (or disappears, if it was archived).

On any error in steps 1–4, **nothing is written** and the run is red (fail closed).

The workflow then opens a pull request with the changed files, or commits straight to `main` if that was chosen
when it was started. When it comes back through the import, the import sees that the repo now equals the
published version, records that, and leaves newer dashboard drafts alone.

**Rolling back** means putting an older version back in place. Revert the publish commit on `main`, or run the
export from an older revision. The next import brings the database back in line. Details are in `docs/DEPLOY.md`.

## Running it

```bash
npm ci
npm run validate                                   # content checks only, no database
DATABASE_URL=postgres://… npm run import -- --dry-run   # everything, then roll back
DATABASE_URL=postgres://… npm run import
DATABASE_URL=postgres://… npm run export -- --dry-run   # what would change, nothing written
DATABASE_URL=postgres://… npm run export
```

In GitHub Actions the connection comes from `supabase link` plus the `SUPABASE_DB_PASSWORD` secret. TLS is
verified against Supabase's public root CA (`supabase/prod-ca-2021.crt`).

## Tests

The **Database tests** workflow runs on every PR, and on every content push to `main`. It needs no secrets and uses
a throwaway Postgres:

1. the SQL suites in `supabase/tests/`;
2. `npm test`:
   - the validator on today's content;
   - the zero-diff JSON writer on every file;
   - seven import scenarios on a scratch copy of the repo: first import, idempotent second import, a repo change,
     a conflict with a dashboard edit, a re-cut sacred clip, unapproved sacred audio, and invalid content;
   - seven export scenarios, on a fresh database of their own:
     - today's content exports with a **zero diff**;
     - a draft edit is not exported, and once published it changes one line;
     - the export coming back through the import is not a conflict;
     - an unpublished lesson leaves the site as a "soon" box;
     - a file changed in git is never overwritten;
     - invalid content writes nothing;
     - promos are exported.
