# Deploying and running the Koko backend

This covers what runs where, every setting and secret, the first-time setup, everyday deploys, rollback and backups.
Design and rules: [`SCHEMA.md`](SCHEMA.md). The sync between the repo and the database: [`SYNC.md`](SYNC.md).

## 1. What runs where

| Piece | Where | Deployed by |
|---|---|---|
| **The live app** for children (`index.html`, `app.js`, `content/`, `audio/`, `media/`) | GitHub Pages from `main` → https://koko.dhm-institute.com | every push to `main` (unchanged) |
| **Database, Auth, Storage** | Supabase project `koko` (`pwgkxdiwqrxkndkyzwlw`, eu-west-1) | workflow **Sync to Supabase** (`supabase db push`) |
| **Edge Functions** `admin-invite`, `request-export` | Supabase | workflow **Sync to Supabase** |
| **Content import** (repo → database) | GitHub Actions | **Sync to Supabase**, on every push to `main` touching content, audio, media or migrations |
| **Content export** (database → repo) | GitHub Actions | **Publish content**: by hand, or the dashboard's "Send to the site" button |
| **Admin dashboard** (`admin/`) | a static host. Recommended: **Cloudflare Pages** → `admin.koko.dhm-institute.com` | the host's GitHub integration, on every push to `main` |
| **Backups** | GitHub Actions artifacts, encrypted | **Database backup**, weekly |
| **Tests** | GitHub Actions, throwaway Postgres, no secrets | **Database tests**, on every PR and every content push |

The children's app never talks to Supabase. It keeps reading the static files, so the backend being down never
affects children.

## 2. Settings and secrets

**Never put a secret in the repo, in this cloud environment, or in a chat.** Secrets go only where the tables below
say.

### GitHub → repo → Settings → Secrets and variables → Actions

| Name | Kind | Needed for | Where to get it |
|---|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | secret | sync, publish, backup | supabase.com → Account → Access Tokens → *Generate new token* |
| `SUPABASE_DB_PASSWORD` | secret | sync, publish, backup | the database password chosen when the project was created (Project Settings → Database → *Reset database password* if lost) |
| `BACKUP_PASSPHRASE` | secret | backup | a long passphrase you invent. **Also keep it outside GitHub**, or the backups can never be opened |
| `SUPABASE_SECRET_KEY` | secret | publish, only when a dashboard **upload** must be copied into the repo | Project Settings → API Keys → *Secret keys* (`sb_secret_…`) |
| `KOKO_DISPATCH_TOKEN` | secret, optional | the dashboard's "Send to the site" button | GitHub → Settings (your profile) → Developer settings → Fine-grained tokens → *Generate*: repository `koko-prayer-quest` only, permission **Contents: Read and write**, expiry up to 1 year |
| `EXPO_TOKEN` | secret | the phone app's test build (**App test build (Android APK)**) | expo.dev → Account settings → Access tokens → *Create token* (account `drhassan_muslim`) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `REVENUECAT_SECRET_KEY`, `REVENUECAT_WEBHOOK_AUTH` | secrets, for Koko Premium | the subscription webhooks and checkout | `docs/SUBSCRIPTIONS.md` §2 |
| `STRIPE_PRICE_ID`, `STRIPE_PORTAL_LOGIN_URL`, `SUPABASE_PUBLISHABLE_KEY`, `REVENUECAT_IOS_PUBLIC_KEY`, `REVENUECAT_ANDROID_PUBLIC_KEY` | variables (*Variables* tab), for Koko Premium | public values for the functions and the app build | `docs/SUBSCRIPTIONS.md` §2 |
| `ADMIN_ORIGIN` | variable (*Variables* tab), optional | lets only the dashboard's address call the Edge Functions | e.g. `https://admin.koko.dhm-institute.com` |

The project ref `pwgkxdiwqrxkndkyzwlw` and the URL `https://pwgkxdiwqrxkndkyzwlw.supabase.co` are not secrets.
They are written in the workflows.

GitHub → repo → Settings → Actions → General → *Workflow permissions*: tick **Allow GitHub Actions to create and
approve pull requests**. The Publish content workflow needs it to open its pull request.

### Supabase Edge Function secrets

These are set by **Sync to Supabase** from the GitHub entries above, so there's no need to set them by hand:

- `GITHUB_DISPATCH_TOKEN`, from `KOKO_DISPATCH_TOKEN`;
- `ADMIN_ORIGIN`.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase itself.

### The dashboard's host (build environment variables)

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://pwgkxdiwqrxkndkyzwlw.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_…` key (Project Settings → API Keys). It is safe in a browser. **Never** use a secret key here |
| `NODE_VERSION` | `22` |

### This cloud session

It holds only non-secret values: `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.

## 3. First-time setup, in order

1. **Add the GitHub secrets** `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`.
2. **Switch sign-ups off on the hosted project.** `supabase/config.toml` only affects a local stack.
   - Supabase dashboard → project **koko** → **Authentication** → **Sign In / Providers**:
     - turn **off** *Allow new users to sign up*;
     - keep *Allow anonymous sign-ins* **off**;
     - under **Email**, keep *Confirm email* on;
     - under **Email**, set *Minimum password length* to **12**.
   - **Authentication** → **URL Configuration**:
     - set *Site URL* to the dashboard address, e.g. `https://admin.koko.dhm-institute.com`;
     - add `https://admin.koko.dhm-institute.com/**` to *Redirect URLs*. Password-reset links only work for listed
       addresses.
3. **Merge the backend PRs in order** (#4, then #5, then #6, then this one). The merge of #4 starts **Sync to
   Supabase**, which:
   1. applies the migrations;
   2. deploys the functions;
   3. imports all content (round-trip checked).

   Open Actions → *Sync to Supabase* → the run → *Summary* and check that it says **round trip: identical**.
4. **Create the first owner** (once):
   1. Supabase → **Authentication** → **Users** → **Add user** → *Create new user*: your email, a strong password,
      and *Auto Confirm User* on.
   2. Supabase → **SQL Editor** → new query → run:
      ```sql
      select public.bootstrap_first_owner('your-email@example.com', 'Dr. Hassan Muslim');
      ```
      It works only while there are no admins at all. After that, the owner adds people from the dashboard's
      **Admins** page.
5. **Host the dashboard.** These steps are for Cloudflare Pages; Netlify works the same way, with the same
   `_redirects` and `_headers`.
   1. Cloudflare → Workers & Pages → Create → Pages → *Connect to Git* → `vet2641991/koko-prayer-quest`.
   2. Build settings:
      - production branch `main`;
      - framework *None*;
      - build command `npm ci && npm run admin:build`;
      - build output `admin/dist`;
      - root directory `/`.
   3. Add the environment variables from §2.
   4. Custom domain: `admin.koko.dhm-institute.com`. Cloudflare shows the CNAME to add at the DNS host of
      `dhm-institute.com`.
   5. Set the GitHub variable `ADMIN_ORIGIN` to that address.

   `admin/public/_headers` already sets a strict Content-Security-Policy and `noindex`. `_redirects` makes deep
   links work.
6. **Optional:**
   - `KOKO_DISPATCH_TOKEN`, for the "Send to the site" button. Without it, run **Publish content** from Actions by
     hand.
   - `BACKUP_PASSPHRASE`, to start weekly backups.
   - `SUPABASE_SECRET_KEY`, once uploads are used.

## 4. Everyday work

- **The local production session** keeps committing lessons and audio to `main` as before. Every push runs
  **Sync to Supabase**, which imports the change.
  - A red run with exit code 2 means a person is needed. The run summary says what: a conflict with a dashboard
    edit, or new sacred audio to approve on the dashboard's **Media** page.
- **In the dashboard:**
  1. An editor saves drafts.
  2. A reviewer or the owner publishes.
  3. **Send to the site** runs **Publish content**, which exports, validates (fails closed), and opens a pull
     request with the changed files.
  4. **Merging that PR puts it live** within minutes.
  - To skip the PR, run *Publish content* by hand with **Commit straight to main**.
- **Schema changes** are a new file in `supabase/migrations/`, reviewed in a PR, where the **Database tests** run
  them. The merge applies them through **Sync to Supabase**.
  - Never edit a migration that is already applied: always add a new one.

## 5. Deploy, step by step (any change)

1. Open a PR. **Database tests** must be green: SQL suites, typecheck, content validation, import and export tests,
   dashboard build, Edge Function check.
2. Merge to `main`.
   - **Sync to Supabase** applies migrations, deploys functions and imports content.
   - The dashboard host rebuilds `admin/`.
   - GitHub Pages serves the app files.
3. Check the run summaries in Actions.

## 6. Rollback

- **Content children see.** Revert the publish commit on `main` with GitHub's *Revert* button on the merged PR.
  Pages serves the previous files within minutes. The next **Sync to Supabase** imports the reverted files, so
  the database publishes the older version again: history is kept, nothing is lost.
  - The same works for any older commit: `git checkout <commit> -- content/`, open a PR, merge. That re-runs the
    export state from a previous commit.
- **A lesson only.** On its page in the dashboard: **Unpublish** shows a "soon" box, or **Archive** hides it. Then
  **Send to the site**.
- **Dashboard.** Cloudflare Pages → the project → Deployments → an older one → *Rollback to this deployment*.
- **Database schema.** Migrations go forward only: write a new migration that undoes the change, and merge it.
  For data, every published version is in `content_revisions`, and every change is in `audit_log` (both
  append-only).
- **The PWA itself** (`app.js`, …) is not touched by the backend. Revert its commit like any other file.

## 7. Backups

1. **Git is the primary backup** of everything children see: `content/`, `audio/`, `media/`, with full history.
   The database can always be rebuilt from it with the import.
2. **The database** (admins, drafts, history, audit log, sacred approvals) is dumped **weekly** by the
   **Database backup** workflow, and on demand with *Run workflow*. Each dump is encrypted with
   `BACKUP_PASSPHRASE` and kept 90 days as a workflow artifact. Depending on the plan, Supabase's own backups may not
   be downloadable, so this is the copy you control.

   **To restore:**
   1. Download the artifact.
   2. Decrypt it: `gpg -d koko-db-YYYY-MM-DD.tgz.gpg > db.tgz && tar xzf db.tgz`.
   3. On a new or empty project, run `supabase db push` (the migrations), then
      `psql "$DB_URL" -f auth-data.sql -f data.sql`.
   4. Check the result with `npm run import -- --dry-run`. It should report nothing to apply.
3. **Supabase Pro**, if the project upgrades, adds daily backups and point-in-time recovery. Keep the weekly dump
   anyway: it's the copy you control.

## 8. Security checklist

- [ ] No secret in the repo: every commit is checked, and `.env*` files are git-ignored.
- [ ] Secrets only in GitHub Actions secrets and Supabase function secrets.
- [ ] Sign-ups off on the hosted project (§3, step 2). Admins exist only through the owner.
- [ ] RLS on every table. The public can read only the published layer: `supabase/tests/02_access_and_workflow.sql`
      proves it on every PR.
- [ ] The dashboard uses only the publishable key, behind a strict CSP and `noindex`.
- [ ] Promo links go only to `https://dhm-institute.com`, and the app opens them behind a parental gate.
- [ ] The owner keeps `BACKUP_PASSPHRASE` and the database password in a password manager.
- [ ] Later: turn on multi-factor sign-in (TOTP) for admins (Supabase Auth → MFA). The dashboard can add the
      prompt in a follow-up.

## 9. When something is red

| Where | Meaning | What to do |
|---|---|---|
| Sync to Supabase, *exit 1* | Content didn't validate, or the round trip failed. **Nothing was changed** | Read the summary, fix the content in a PR |
| Sync to Supabase, *exit 2* | Imported, but a person is needed | Conflicts: decide in the dashboard which version wins. Sacred audio: approve it on **Media** |
| Publish content, "changed in git since the last import" | The production session changed a file the database hasn't seen | Run **Sync to Supabase**, then publish again |
| Publish content, validation errors | Published content references a missing audio file, has a wrong quiz, … | Fix the lesson in the dashboard, publish, and send again |
| Sync or Publish: "secrets are not set" | Missing GitHub secrets | §2 |

## 10. Owner checklist (بالعربي)

1. حط المفاتيح السرية في GitHub (الجزء ٢): `SUPABASE_ACCESS_TOKEN` و `SUPABASE_DB_PASSWORD`.
2. اقفل التسجيل في Supabase: **Authentication** ← **Sign In / Providers** ← اقفل *Allow new users to sign up*،
   وخلي أقل طول للباسورد ١٢. بعدين **URL Configuration** ← حط عنوان لوحة الإدارة في *Site URL* و *Redirect URLs*.
3. ادمج الـ PRs بالترتيب (#4 ثم #5 ثم #6 ثم ده). أول دمج بيعمل الجداول ويرفع المحتوى لوحده.
4. اعمل حسابك: **Authentication** ← **Users** ← **Add user** (إيميلك وباسورد قوي، و *Auto Confirm User*)، وبعدها
   في **SQL Editor** شغّل:
   `select public.bootstrap_first_owner('إيميلك', 'Dr. Hassan Muslim');`
5. ارفع لوحة الإدارة على Cloudflare Pages بالإعدادات اللي في الجزء ٣، الخطوة ٥.
6. (اختياري) `KOKO_DISPATCH_TOKEN` عشان زرار «Send to the site»، و `BACKUP_PASSPHRASE` عشان النسخ الاحتياطي، واحفظه
   برّه GitHub كمان.
