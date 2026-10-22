# Koko admin dashboard

React + TypeScript (Vite) on top of Supabase. It runs entirely in the browser with the **publishable** key. Every
permission is enforced by the database (RLS, guards, workflow functions; see `docs/SCHEMA.md` §5), so the UI only
hides buttons that would fail anyway.

| Page | Who | What |
|---|---|---|
| Content | all admins | Worlds → units → lessons, search (English, or Arabic with or without tashkeel), world and unit fields, reorder, new units |
| Lesson editor | all admins (editing: edit_content) | Form for the common parts, JSON for the rest with live schema validation (the same validator as the export), preview with the live audio, draft → publish / unpublish / archive / restore |
| Media | all admins (approvals: owner and reviewer) | Every file with its sacred flag and approval; listen; approve or withdraw; mark sacred or ordinary; upload images |
| Promos | all admins | DHM Institute messages for parents (https://dhm-institute.com links only; the app opens them behind a parental gate) |
| Catalog | owner edits | Where children start, and the teacher's note on the Parents page |
| Audit log | all admins | Who changed what and when (read-only) |
| Admins | owner | Roles, deactivate, add an admin (Edge Function `admin-invite`) |
| "Send to the site" | owner and reviewer | Starts the **Publish content** workflow (Edge Function `request-export`) |

Arabic fields are right-to-left in the Naskh font and are saved **exactly as typed**: no trimming, no normalisation,
tashkeel kept.

## Develop

```bash
cp admin/.env.example admin/.env.local    # URL + publishable key (never a secret key)
npm ci
npm run admin:dev                          # http://localhost:5174
npm run admin:build                        # → admin/dist (static files)
```

Hosting, environment variables and the first owner are covered in `docs/DEPLOY.md`.

## How it was tested

The dashboard was driven in Chromium against a real local stack: Postgres with every migration, Supabase Auth
(GoTrue v2.179), PostgREST v12 and the Edge Functions under Deno, with today's content imported. 21 checks passed.

**Sign-in and access:**
- a wrong password is refused;
- a signed-in non-admin gets "No access";
- a deep link opens after sign-in;
- sign-out works.

**Editor:**
- has no Publish or "Send to the site" button, and no approval buttons;
- Arabic search without tashkeel finds a lesson;
- an attempt to change a sacred word's Arabic is refused by the database, and the dashboard shows why;
- a normal edit saves as a draft and shows "unpublished changes";
- a quiz with two right answers is flagged while typing.

**Reviewer:**
- publishes the edit;
- sees the approval controls;
- has no Admins page.

**Owner:**
- adds an admin through the `admin-invite` function;
- sees the editor's change in the audit log.

**Not tested locally:** uploads, because there is no Storage service in that stack, and the password-reset email,
because there is no mail server.
