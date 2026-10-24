# Launch day: Koko Premium on the website too

During the trial the website (`koko.dhm-institute.com`) plays every lesson for free and only the phone app locks
Premium lessons. On launch day the website locks them as well, with the same rules as the app. The code waits in the
**launch PR**, which is never merged before the owner says **"launch"** (owner, 2026-10-23).

## What the launch PR changes

| File | Change |
|---|---|
| `premium.js` (new) | The website's Koko Premium. It reads the public settings from the Edge Function `public-config` (no key in the page), remembers the last answer on the device, and checks again in the background. Parent sign-in with a 6-digit code, Stripe Checkout and portal, sign out, delete account, and the parental gate (the same multiplication question as the app). |
| `app.js` | Premium units show 🔒 and open the parental gate, then Koko Premium. A locked lesson or step opened by its address shows "ask a grown-up". New screen `#/premium`. A Koko Premium card on the Parents page. Re-draws when access changes, but never in the middle of a lesson step. |
| `index.html`, `sw.js` | Load `premium.js`; bump `?v=6` → `?v=7` and the cache name, so every device gets the new version on its next visit. |
| `supabase/functions/public-config` (new) | GET: the project URL, the **publishable** key (checked; a secret key is never sent), whether website subscriptions are open, and the portal link. |

The rules are those of the app:

- **What locks:** a unit is locked only when it has `"premium": true`, subscriptions are switched on, and the family
  has no Premium.
- **Backend unreachable on a first visit:** nothing locks, so the site never breaks for a child.
- **Offline:** the last answer counts until its end date. Signing out forgets it.
- **Free lessons, progress, audio and video:** unchanged.

## Launch day, in order

1. **Before:**
   - PR #14 merged;
   - Stripe **Live** keys and webhook in GitHub (`docs/SUBSCRIPTIONS.md` §4);
   - Resend set up (§3);
   - one real test purchase made and refunded.
2. **Dashboard:** mark the Premium lessons (world page → Make Premium) → **Send to the site**. From now on the phone
   app locks them; the website is still free.
3. **Merge the launch PR.** Two workflows run by themselves:
   - **Sync to Supabase** deploys `public-config`;
   - GitHub Pages publishes `premium.js` and the new `app.js` in about a minute. Open devices reload once (the
     service worker), and progress is kept.
4. **Check**, in a private window on a phone:
   - [ ] the map shows 🔒 on Premium lessons, and free lessons play as before;
   - [ ] tapping 🔒 asks the grown-up question, then shows Koko Premium at $35 / month;
   - [ ] Subscribe opens Stripe Checkout;
   - [ ] sign in with a subscribed email (code by email from Resend): the lessons open;
   - [ ] sign out: locked again.

## If something is wrong

- **Fastest:** the dashboard → world page → **All units: free** → Send to the site. Nothing is locked anywhere; the
  code stays.
- **Full rollback:** revert the launch PR on GitHub (*Revert* button). The site goes back to `?v=6`, and devices
  reload once.

## What this lock is, and what it is not

The lesson files of Premium units are still public on GitHub Pages and in the repository's history. The lock is in
the app and on the website, like most children's apps: it stops children and ordinary visitors, not someone who
downloads files by hand.

A stronger lock for **new** Premium lessons is possible later: their files would never enter the public repo, and
would be served from private Supabase Storage to subscribers only. That is a separate project, and it changes how
lessons are published.
