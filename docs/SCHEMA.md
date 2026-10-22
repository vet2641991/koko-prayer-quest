# Koko backend: database schema (Milestone 1, step 2)

Migrations: `supabase/migrations/` (5 files, applied in order).
Tests: `supabase/tests/` (`run.sh`, plus the **Database tests** GitHub Action on every PR that touches `supabase/`).
This builds on [`AUDIT.md`](AUDIT.md). Section numbers like "AUDIT §5" point there.

This step adds tables only. **Nothing is deployed yet, and nothing can be read through the API yet**:

- Row-level security is on for every table, with no policies.
- Every table grant has been taken away from the `anon` and `authenticated` API roles.

Step 3 opens exactly the access each role needs, with tests that prove it.

---

## 1. Shape

```
                 roles ──< admins >── auth.users              audit_log  (every change, append-only)

   WORKING LAYER (admins only, never public)              PUBLISHED LAYER (what children get)
   ─────────────────────────────────────────              ───────────────────────────────────
   catalog_settings (1 row)                ── publish ──►  published_content   kind = catalog | world | unit | lesson
   worlds ──< units ──1:0..1── lessons                         │ one row per live item, exact JSON object
                 └──< media_assets (owner lesson)              │
                                                              content_revisions (every version ever published)

   static export (step 5) reads ONLY published_content ──► content/catalog.json + content/<world>/<file>.json
```

## 2. Working copy vs published copy: why there are two layers

Admins edit `worlds`, `units`, `lessons` and `catalog_settings`. Children never get those rows.

**Publishing** (an RPC written in step 3, allowed only for roles with `can_publish`) does three things in one
transaction:

1. Builds the exact JSON object with `lesson_document()` (or `unit_document()`, `world_document()`,
   `catalog_document()`).
2. Appends it to `content_revisions`.
3. Puts it in `published_content`.

The export and the public API read **only** `published_content`.

So:

- **Editing a lesson that is already live changes nothing for children** until it is published again. With a
  single table and a `status` column, a half-finished edit to a published row would leak into the next export.
  With two layers it can't.
- **Rollback** means publishing an older revision again, and the history is never lost. `content_revisions` is
  append-only, and so is `audit_log`.
- **Publish** writes one row per item, so publishing one lesson cannot accidentally ship another lesson's draft.

## 3. What a child sees (owner's decisions of 2026-10-22)

| State | On the map | Lesson content leaves the DB? |
|---|---|---|
| Unit published, lesson **published** | Playable unit | Yes: the published revision only |
| Unit published, lesson **draft** (or no lesson yet) | Locked **"soon"** box, exactly as today's units without a `file` | **No, never** |
| Unit published, `go` link | Link to the other world (today: `isl1-l14` → `prayer`) | — |
| Lesson **archived** | **Not shown at all.** Archiving a lesson also removes its unit from `published_content` | No |
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
- `worlds`, `units` and `catalog_settings` have the same `extra` column.

### `content_revisions` and `published_content` (published layer)

- `content_revisions(kind, entity_id, revision, document, sha256, published_at, published_by…)` is append-only.
- `published_content(kind, id, world_id, sort, document, revision_id…)` holds one row per live item. Its shape
  check makes units carry their world and sort.

### `roles`, `admins`

There is no self-signup. `auth.enable_signup = false` is set in `supabase/config.toml`, and the hosted project must
also have sign-ups turned off (DEPLOY, step 7). The owner adds each admin.

- An auth account by itself grants nothing. Every permission check asks for an **active** row in `admins`.
- A trigger keeps **at least one active owner** at all times, so nobody can be locked out.
- `has_permission('edit_content' | 'publish' | 'approve_sacred' | 'manage_admins')` and `current_admin_role()`
  are what step 3's policies call.

**Role matrix (proposal, stored as data in `roles`):**

| Role | Edit drafts | Publish / archive | Approve sacred media | Manage admins and catalog settings |
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
- **An approval belongs to the exact bytes approved.** If a sacred file's `sha256` changes (a re-cut clip),
  the approval is withdrawn automatically and the withdrawal is logged.
- The sacred flag is **admin-only**: it is never exported, and step 3 makes it unreadable by the public API.

**How the sacred flags are seeded** (by the import in step 4):

| Clips | sacred | Approved |
|---|---|---|
| `w-<id>-ar.mp3` of every word with `"sacred": true` (76 words today) | true | yes. Approved before the dashboard existed; date taken from git history |
| The 17 Learn-card clips in [`supabase/seed/sacred-learn-cards.json`](../supabase/seed/sacred-learn-cards.json) | true | yes: Dr. Hassan Muslim, 2026-10-19 |
| The 30 Learn-card clips listed there as not sacred (surah *names* in `isl2-l17` are titles) | false | — |
| Any other `c-*` clip (none today) | true | **no**, named in the import report |
| `d-*`, `s-*`, `x-move` clips, other words, posters, app images | false | — |

The owner's list covers all 47 `c-*` clips on `main` today. I checked it: the two `isl1-l13` clips are
byte-identical to the approved `isl2-l12` ones.

### `audit_log`

A trigger on every audited table records each insert, update and delete, whoever does it: dashboard, import job
or SQL editor.

- It stores **only the changed columns** for updates, plus the actor (admin email, or the job name such as
  `import-json`).
- It names the workflow events: `publish`, `unpublish`, `archive`, `restore`, `approve`, `revoke_approval`.
- It is append-only: updates, deletes and truncates are rejected.

## 5. Proof that the schema holds today's content losslessly

Run locally on Postgres 16, using a throwaway loader. Step 4's `scripts/import-json.ts` will make this the permanent
round-trip check.

- All **88 lessons** and **89 units** load into the working tables, with no use of `extra`.
- For **88 / 88** lessons, `lesson_document()` rebuilt from the columns **equals the file** (parsed JSON, so key
  order is ignored).
- The catalog rebuilt from `catalog_settings` + `worlds` + `units` **equals `content/catalog.json`**.
- Arabic is stored **byte for byte**: no normalisation, tashkeel intact, checked on a sacred word.
- `supabase/tests/01_schema_integrity.sql`: **45 checks pass**. They cover permanent ids, structure rules, the
  document builders, the audit log, append-only history, role permissions, the last-owner guard, the media rules,
  and the lockdown (anon can't read or write anything, and a signed-in non-admin can't either).

**Key order.** `jsonb` doesn't keep key order, and the owner accepted that ("identical apart from key order").
To keep git diffs small, the export (step 5) will write each object with the key order of the file already on
disk, putting new keys in a fixed order. Unchanged lessons will then produce **no diff at all**.

## 6. Transition: two writers

Until the dashboard replaces it, the local production session keeps committing `content/**` and `audio/**` to
`main`. Plan for steps 4–5:

1. The import runs on every push to `main` that touches `content/**` or `audio/**`, and brings the change into
   the DB, both the working copy and the published copy.
2. The export refuses to overwrite a file that changed in git after its last import, and reports it instead.

Neither writer can silently undo the other.

## 7. Ready for subscriptions later (not built now)

Paid content can't go into the public static export, so subscriptions will add, without changing anything above:

- `units.access` (`free` | `premium`). The export will refuse to publish non-free content publicly.
- `subscriptions` (user, RevenueCat app-user id, store, status, period end) and `entitlements`, filled by a
  RevenueCat webhook (Edge Function).
- A signed-download path for premium lesson JSON.

Child or parent accounts will be needed then, so **`privacy.html` must be updated before that launch** (AUDIT §11).

## 8. Next (step 3)

- RLS policies and grants: anon reads `published_content` only, without media or sacred flags.
- Writes only through `has_permission`. Sacred approval only for owner and reviewer.
- A guard so the Arabic of a sacred word can be changed only by an owner or reviewer.
- `publish_*` / `archive_*` RPCs.
- SQL tests proving anon can't write or read drafts.
