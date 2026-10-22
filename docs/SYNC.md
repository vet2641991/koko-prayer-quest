# Keeping the repo and Supabase in step

During the transition there are two writers:

- the **local production session**, which keeps committing lessons and audio to `main`;
- the **admin dashboard**, which edits the database.

Two jobs keep them in step:

| Job | Direction | When it runs |
|---|---|---|
| `scripts/import-json.ts` (this step) | repo → database | every push to `main` that touches `content/**`, `audio/**`, `media/**` or the migrations (workflow **Sync to Supabase**), or by hand |
| `scripts/export-static.ts` (step 5) | database → repo | when an admin publishes (workflow **Publish content**), or by hand |

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

## Running it

```bash
npm ci
npm run validate                                   # content checks only, no database
DATABASE_URL=postgres://… npm run import -- --dry-run   # everything, then roll back
DATABASE_URL=postgres://… npm run import
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
     a conflict with a dashboard edit, a re-cut sacred clip, unapproved sacred audio, and invalid content.
