# Koko backend: database schema and access rules (Milestone 1, steps 2–3)

Migrations: `supabase/migrations/` (8 files, applied in order).
Tests: `supabase/tests/` (`run.sh`, plus the **Database tests** GitHub Action on every PR that touches `supabase/`).
This builds on [`AUDIT.md`](AUDIT.md). Section numbers like "AUDIT §5" point there.

**Nothing is deployed to the Supabase project yet.** That needs a workflow and the GitHub secrets, which come
with the import (step 4).

---

## 1. Shape

```
                 roles ──< admins >── auth.users              audit_log  (every change, append-only)

   WORKING LAYER (admins only, never public)              PUBLISHED LAYER (what children get)
   ─────────────────────────────────────────              ───────────────────────────────────
   catalog_settings (1 row)                ── publish ──►  published_content   kind = catalog | world | unit | lesson | promo
   worlds ──< units ──1:0..1── lessons                         │ one row per live item, exact JSON object
                 └──< media_assets (owner lesson)              │
   promos                                                     content_revisions (every version ever published)

   static export (step 5) reads ONLY published_content ──► content/catalog.json + content/<world>/<file>.json (+ promos)
```

## 2. Working copy vs published copy: why there are two layers

Admins edit `worlds`, `units`, `lessons`, `promos` and `catalog_settings`. Children never get those rows.

**Publishing** is done by a `publish_*` function. Only owners and reviewers may call them, and so may the import
job. Each call does three things in one transaction:

1. Builds the exact JSON object with `lesson_document()` (or `unit_document()`, `world_document()`,
   `catalog_document()`, `promo_document()`).
2. Appends it to `content_revisions`.
3. Puts it in `published_content`.

The export and the public API read **only** `published_content`.

So:

- **Editing a lesson that is already live changes nothing for children** until it is published again. With a
  single table and a `status` column, a half-finished edit to a published row would leak into the next export.
  With two layers it can't.
- **Rollback** means publishing an older revision again, and the history is never lost. `content_revisions` and
  `audit_log` are append-only and can't be truncated.
- **Publish** writes one row per item, so publishing one lesson cannot accidentally ship another lesson's draft.
- **Publishing an unchanged item is a no-op.** Re-running the import or pressing Publish twice adds no history.

## 3. What a child sees (owner's decisions of 2026-10-22)

| State | On the map | Lesson content leaves the DB? |
|---|---|---|
| Unit published, lesson **published** | Playable unit | Yes: the published revision only |
| Unit published, lesson **draft** (or no lesson yet) | Locked **"soon"** box, exactly as today's units without a `file` | **No, never** |
| Unit published, `go` link | Link to the other world (today: `isl1-l14` → `prayer`) | — |
| Lesson **archived** | **Not shown at all.** Archiving a lesson also archives its unit and removes both from `published_content` | No |
| Unit or world **draft / archived** | Not shown | No |

`published_content` holds the rule: a unit row with no lesson row is a "soon" box, and a unit with both rows gets
`"file": "content/<world>/<suffix>.json"` in the catalog. Anything that is not explicitly published is absent
(fail closed).

## 4. Tables

### `worlds`, `units`, `lessons`, `catalog_settings` (working layer)

- **Ids are permanent.** A trigger rejects any id change, and a unit can never move to another world. Device
  progress, routes and audio folders are keyed by these ids (AUDIT §8).
- `units.file_path` is generated from the id (`isl1-l13` → `content/isl1/l13.json`), exactly as every file is
  named today.
- `sort` reproduces the array order of `catalog.json`. The "next lesson" logic depends on it (AUDIT §4).
  Uniqueness is checked at commit time, so units can be reordered in one save.
- A unit can exist without a lesson ("soon"). A `go` unit can never have a lesson (trigger).
- Every row has `created_at`, `updated_at` and `updated_by` (set by trigger from the signed-in admin).
- `worlds.display_code` holds the DHM level code, a display name only. The ids stay the key:

  | Track | Codes | Worlds |
  |---|---|---|
  | Arabic (books 1–12) | ARkid A1 … D3 | `ar1`, `ar2` today; one new world per book later |
  | Islamic Studies | ISL A1 / A2 / A3 | `isl1`, `isl2` today; one new world later |
  | Qur'an | QAPRE1 (letters), then QR A1 (letters and vowels) | two new worlds later |

  The code is exported as `"code"` on the world **only when it is set**, so today's `catalog.json` stays
  byte-identical until an owner fills the codes in from the dashboard and publishes.

**Lesson JSON → columns.** The common parts are columns. The parts whose shape varies are `jsonb` holding the
original JSON verbatim:

| JSON key | Column | Type |
|---|---|---|
| `id`, `world` | *(none: always the unit's id and world; the import checks they match)* | |
| `unit` | `unit_no` | int |
| `source` | `source` | text |
| `title.ar` / `title.en` | `title_ar` / `title_en` | text, required |
| `topic`, `minutes`, `note` | same names | text / int / text |
| `video`, `learn`, `words`, `sounds`, `games`, `dialogue`, `speakers`, `talk`, `quiz`, `move`, `think`, `parents` | same names | jsonb (array or object checked) |
| `order` | `order_game` (`ORDER` is an SQL keyword) | jsonb |
| *any key not listed* | `extra` | jsonb object |

- A JSON key that is absent is SQL `NULL`, never `[]`, so absent stays absent.
- `extra` keeps fields the schema doesn't know yet. For example, the local production session may add a new
  field before the admin knows about it. Nothing is lost, and `extra` can't shadow a known key.
- `worlds`, `units`, `promos` and `catalog_settings` have the same `extra` column.
- `"sacred": true` on words stays in the lesson files exactly as today (owner, 2026-10-22). The app never shows it.

### `promos` (DHM Institute messages for parents)

| Column | |
|---|---|
| `id` | slug, e.g. `trial-class` |
| `text_en` | the message, in English |
| `url` | **https on dhm-institute.com only** (database check). Examples: `https://dhm-institute.com/trial-sessions/booking` for a trial class, and the recorded-course pages on `dhm-institute.com` |
| `placement` | `after_lesson` / `map` / `parents` |
| `active` | on or off. Switching it off and publishing takes the promo out of the app |
| `sort` | order within its placement |

Promos are published and exported like the rest of the content. Every promo link leaves the app, so **the app
must open it only behind a parental gate** (Google Play Families, Apple Kids category). That is an app
requirement for the Expo app and any PWA change. The database's part is limiting links to DHM's own https site.

### `content_revisions` and `published_content` (published layer)

- `content_revisions(kind, entity_id, revision, document, sha256, published_at, published_by…)` is append-only:
  no update, delete or truncate.
- `published_content(kind, id, world_id, sort, document, revision_id…)` holds one row per live item. Its shape
  check makes units carry their world and sort.

### `roles`, `admins`

There is no self-signup. `auth.enable_signup = false` is set in `supabase/config.toml`, but that file affects only a
local stack: **sign-ups must also be switched off on the hosted project.** The steps will be in DEPLOY.md, and the
owner will be walked through them when we connect the project. The owner adds each admin.

- An auth account by itself grants nothing. Every permission check asks for an **active** row in `admins`.
- A trigger keeps **at least one active owner** at all times, so nobody can be locked out.

**Role matrix (approved by the owner, 2026-10-22; stored as data in `roles`, editable by the owner only):**

| Role | Edit drafts | Publish / archive | Approve sacred media | Manage admins, roles, catalog settings |
|---|:-:|:-:|:-:|:-:|
| owner | ✓ | ✓ | ✓ | ✓ |
| reviewer | ✓ | ✓ | ✓ | — |
| editor | ✓ | — | — | — |

### `media_assets`

One row per file the app loads: `path` (e.g. `audio/isl1-l13/c-3-ar.mp3`), `kind`, owner `lesson_id`,
**`sacred`**, `approved_by` / `approved_by_name`, `approved_at`, `approval_note`, `storage` (`static` = in the
repo, `supabase` = an admin upload waiting to be copied in at publish), `bytes` and `sha256`.

- **The path is permanent**, and an audio clip must sit in its owner lesson's folder.
- `sacred` **defaults to true.** A file nobody has classified is treated as sacred and unapproved until an owner or
  reviewer says otherwise.
- **An approval belongs to the exact bytes approved.** If a sacred file's `sha256` changes (a re-cut clip), the
  approval is withdrawn automatically and the withdrawal is logged.
  - The import (step 4) fills `sha256` and `bytes` for **every** file in `audio/` and `media/`, so this
    protection works from day one.
- `approved_by_name` is always filled, so an approval stays readable even if that admin is later removed.
- The sacred flag is **admin-only**: it is never exported, and it is unreadable by the public API (§5).

**How the sacred flags are seeded** (by the import in step 4):

| Files | sacred | Approved |
|---|---|---|
| `w-<id>-ar.mp3` of every word with `"sacred": true` (76 words today) | true | yes. Approved before the dashboard existed; date taken from git history |
| The 17 Learn-card clips in [`supabase/seed/sacred-learn-cards.json`](../supabase/seed/sacred-learn-cards.json) | true | yes: Dr. Hassan Muslim, 2026-10-19 |
| The 30 Learn-card clips listed there as not sacred (surah *names* in `isl2-l17` are titles) | false | — |
| `media/prayer-1.mp4` … `prayer-7.mp4`, in [`supabase/seed/sacred-videos.json`](../supabase/seed/sacred-videos.json) | true | yes: Dr. Hassan Muslim, 2026-10-22 |
| Any other `c-*` clip (none today) | true | **no**, named in the import report |
| `d-*`, `s-*`, `x-move` clips, other words, other videos, posters, app images | false | — |

The owner's list covers all 47 `c-*` clips on `main` today. I checked it: the two `isl1-l13` clips are
byte-identical to the approved `isl2-l12` ones.

### `audit_log`

A trigger on every audited table records each insert, update and delete, whoever does it: dashboard, import job
or SQL editor.

- It stores **only the changed columns** for updates, plus the actor (admin email, or the job name such as
  `import-json`).
- It names the workflow events: `publish`, `unpublish`, `archive`, `restore`, `approve`, `revoke_approval`.
- It is append-only: updates, deletes and truncates are rejected.

## 5. Who can do what (step 3)

The rules are enforced **in the database**: RLS policies, column-level grants and triggers. Nothing relies on the
dashboard hiding a button.

| | Public app (`anon`) and signed-in non-admins | editor | reviewer | owner |
|---|:-:|:-:|:-:|:-:|
| Read `published_content` (without `published_by`) | ✓ | ✓ | ✓ | ✓ |
| Read working copies, media flags, history, audit log | — | ✓ | ✓ | ✓ |
| Create and edit drafts (worlds, units, lessons, promos) | — | ✓ | ✓ | ✓ |
| Delete a draft that was **never** published | — | ✓ | ✓ | ✓ |
| Record a dashboard upload (always starts sacred and unapproved) | — | ✓ | ✓ | ✓ |
| Change the Arabic of a sacred word, or of a Learn card with a sacred clip | — | — | ✓ | ✓ |
| `publish_*`, `unpublish_lesson`, `archive_*`, `restore_content` | — | — | ✓ | ✓ |
| `approve_media`, `revoke_media_approval`, `set_media_sacred` | — | — | ✓ | ✓ |
| Admins, roles, catalog settings | — | — | — | ✓ |

These are blocked for **everyone** through the API, owners included, and are changed only by the workflow
functions:

- `status` on any content row
- `sacred`, `approved_at`, `approved_by`, `approved_by_name`, `approval_note`
- the recorded hash and size of a file that is in the repo (only the import job records those)
- the published layer and the history

Nobody can ever delete content that was published once: it is archived instead. Files in `audio/` and `media/` are
never deleted.

**Publishing checks.** `publish_lesson` refuses a lesson that:

- plays sacred audio that is not approved yet (its own clips and the words it borrows through `from`), or
- has a quiz question without exactly one correct answer.

It also requires the lesson's world to be published. Step 5's export validator then repeats the full reference
check before anything is written (fail closed).

**Jobs.** The import and export run in GitHub Actions with the secret key, or with a direct database connection.
They are trusted, and they publish through the same functions, so there is one code path for what goes live.

## 6. Proof

All of this was run locally on Postgres 16. CI runs it on Postgres 17 for every PR.

- **Lossless.** All **88 lessons** and **89 units** load into the working tables with no use of `extra`. Rebuilt from
  the columns, **88 / 88** lessons equal their files (parsed JSON, so key order is ignored), and so does the catalog.
- **End to end through the real publish functions.** Publishing every world, unit and lesson reproduces
  `catalog.json` and every lesson file exactly. Publishing a second time adds **zero** revisions.
- **Arabic is stored byte for byte**: no normalisation, tashkeel intact.
- `01_schema_integrity.sql`, **40 checks**: permanent ids, structure, document builders, audit log, append-only
  history, last-owner guard, media rules, and RLS on every table.
- `02_access_and_workflow.sql`, **97 checks**:
  - anon can't read drafts, media, history or admin data, and can't write or call anything;
  - a signed-in non-admin sees nothing;
  - the editor gets one check per protected approval column, and can't change sacred text, publish, edit roles or
    promote themselves;
  - the reviewer can publish and approve, but can't manage roles or admins;
  - the owner can manage roles;
  - the workflow: an edit after publishing stays private until republished; unpublish leaves a "soon" box;
    archive removes the lesson and its unit; restore gives a draft;
  - promos accept only DHM https links;
  - display codes appear only when set;
  - neither history table can be truncated.

## 7. Requirements recorded for the next steps (owner, 2026-10-22)

- **Export (step 5).** It must write `content/*.json` with **the same key order and formatting as today**:
  `JSON.stringify(doc, null, 2)`, UTF-8, Arabic unescaped, no trailing newline (AUDIT §10).
  - For an existing file, each object keeps the key order of the file on disk. New keys follow the canonical order.
  - **The first export of today's content must produce a zero diff.** The 3 hand-formatted files (AUDIT §10)
    are left untouched while their parsed content is unchanged.
- **Import (step 4).** It records `sha256` and `bytes` for every file in `audio/` and `media/`.
- **Hosted project.** Sign-ups are switched off in the Supabase dashboard. The steps will come with DEPLOY.md, and
  the owner will be shown exactly where to click.

## 8. Transition: two writers

Until the dashboard replaces it, the local production session keeps committing `content/**` and `audio/**` to
`main`. Plan for steps 4–5:

1. The import runs on every push to `main` that touches `content/**` or `audio/**`, and brings the change into
   the DB, both the working copy and the published copy.
2. The export refuses to overwrite a file that changed in git after its last import, and reports it instead.

Neither writer can silently undo the other.

## 9. Subscriptions (Koko Premium, migration 11)

Built on 2026-10-23; the setup is in `docs/SUBSCRIPTIONS.md`.

- **`units.premium`** (owner only, `set_units_premium()`): exported as `"premium": true`, and only when true.
- **`entitlements`**: one row per subscription, written only by the store webhooks (service role). Read with
  `my_access()` by the parent, and counted by `billing_summary()` for the owner.
- **`billing_customers`**: the Stripe customer of each parent.
- **`billing_events`**: each webhook id is handled once.
- Parents are auth users created by Edge Functions, while sign-ups stay off. They are never admins.

**The lesson files of Premium units are still exported publicly.** The app locks them; the website (PWA) does not.
The brief keeps `audio/`, `media/` and `app.js` as they are, so private storage and signed downloads are a later
decision (`docs/SUBSCRIPTIONS.md` §8). `privacy.html` was updated for the parent's email and the subscription.
