# Koko Premium: subscriptions ($35 a month)

Parents subscribe in the **App Store**, in **Google Play** (through RevenueCat) or on the **website** (Stripe
Checkout). Every purchase ends up in one table, `public.entitlements`, written only by two Edge Functions that
receive the stores' webhooks. The owner decides in the dashboard which lessons are for subscribers.

```
 App (iPhone/Android) ──buy──▶ App Store / Google Play ──▶ RevenueCat ──webhook──▶ revenuecat-webhook ─┐
 koko.dhm-institute.com/account.html ──▶ stripe-checkout ──▶ Stripe Checkout ──webhook──▶ stripe-webhook ┤
                                                                                                         ▼
 App: "is this family Premium?" ◀── RevenueCat (store purchases)  +  my_access() ◀── public.entitlements
```

- **Without the keys below, nothing changes:** the app shows no subscription and every lesson stays open. You can
  merge this before any account exists.
- **The child never has an account.** A parent account (email + 6-digit code, no password) is **optional**: it links
  Premium across devices and with the website. Buying in the app works without it (Apple's rule).
- **Behind the parental gate:** the Koko Premium screen, the family account, and every purchase, restore and link.
- **The website (the PWA) stays free for now.** Premium locks lessons in the phone app only. The lesson files stay
  public on GitHub Pages (the brief forbids moving `audio/` and `media/`), so the lock is in the app. Locking the
  website too is a separate decision (see the end).

## 1. Which lessons are for subscribers (the dashboard)

1. **Content → a world.**
2. Each unit has an **Access** column with **Make Premium / Make free**, and above the list **All units: Premium /
   All units: free**. Only the owner sees these buttons; the database refuses everyone else.
3. Click **Send to the site**. `catalog.json` gets `"premium": true` on those units, and the app locks them.

**Catalog** shows how many families have Premium now (counts only, no names).

## 2. Accounts and keys: what to create and where it goes

**Never paste a key in a chat.** Each key goes in exactly one of these places:

- **GitHub Secret:** repo → Settings → Secrets and variables → Actions → **Secrets** → *New repository secret*.
- **GitHub Variable:** the same page → **Variables** tab → *New repository variable*. For public values only.
- The Supabase, Stripe or RevenueCat dashboard itself, where the table says so.

| Name | Where it goes | What it is | Where you get it |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | GitHub **Secret** | Stripe secret key (better: a *restricted* key, see §4) | Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | GitHub **Secret** | `whsec_…` of the webhook endpoint | Stripe → Developers → Webhooks → the endpoint → *Signing secret* |
| `STRIPE_PRICE_ID` | GitHub **Variable** | `price_…` of "Koko Premium, $35 monthly" | Stripe → Product catalog → Koko Premium → the price |
| `STRIPE_PORTAL_LOGIN_URL` | GitHub **Variable** | `https://billing.stripe.com/p/login/…` | Stripe → Settings → Billing → Customer portal → *Login link* |
| `REVENUECAT_SECRET_KEY` | GitHub **Secret** | RevenueCat **secret** API key (`sk_…`, API v1) | RevenueCat → Project settings → API keys → *+ New secret API key* |
| `REVENUECAT_WEBHOOK_AUTH` | GitHub **Secret** **and** RevenueCat webhook | A long random password you make up (40+ characters) | You create it; paste the same value in both places |
| `REVENUECAT_IOS_PUBLIC_KEY` | GitHub **Variable** | `appl_…` (public SDK key, safe in the app) | RevenueCat → Project settings → API keys → the iOS app |
| `REVENUECAT_ANDROID_PUBLIC_KEY` | GitHub **Variable** | `goog_…` (public SDK key, safe in the app) | RevenueCat → API keys → the Android app |
| `SUPABASE_PUBLISHABLE_KEY` | GitHub **Variable** | `sb_publishable_…` (safe in the app); **never** `sb_secret_…` | Supabase → Project Settings → API Keys |
| Resend API key (the SMTP password) | **Supabase dashboard** only | `re_…`, sending access, one domain | Resend → API Keys (§3) |

- **Sync to Supabase** copies the Stripe and RevenueCat values into the Edge Functions' secrets on every run.
- **App test build** writes the three public keys into that build only. They are never committed.

## 3. Sign-in emails with Resend (do this before launch)

Supabase's built-in email sends only 2 emails an hour and only to the project's own team, so parents' sign-in codes
need our own sender. These steps use **Resend**. Its free plan sends 3,000 emails a month and 100 a day.

**A. Resend: the sending domain**

1. Sign up at resend.com with the DHM Institute email.
2. **Domains** → **Add domain**:
   - name: **`mail.dhm-institute.com`** (a subdomain, as Resend recommends, so the main domain's email is never
     affected);
   - region: **Ireland (eu-west-1)**, the same region as our Supabase project.
3. Resend shows 3 or 4 DNS records: DKIM `TXT` `resend._domainkey.mail…`, an `MX` and a `TXT` (SPF) on
   `send.mail…`. Add each one, exactly as shown, where `dhm-institute.com`'s DNS is managed (the same place as the
   `koko` record). Click **Verify**; it usually turns *Verified* within minutes, sometimes a few hours.
4. Recommended once it is verified: a DMARC record, `TXT` `_dmarc.mail.dhm-institute.com` =
   `v=DMARC1; p=none; rua=mailto:<your email>` (Resend → the domain → *DMARC* shows it).

**B. Resend: the SMTP password**

5. **API Keys** → **Create API key**: name `supabase-auth`, permission **Sending access**, domain
   **mail.dhm-institute.com** only. Copy it once. It is the SMTP password, and it goes **only** into the Supabase
   dashboard in the next step: not GitHub, not a file, not a chat.

**C. Supabase: send through Resend**

6. Supabase → project **koko** → **Authentication** → **Emails** → **SMTP Settings** → *Enable custom SMTP*:

   | Field | Value |
   |---|---|
   | Sender email | `koko@mail.dhm-institute.com` |
   | Sender name | `Koko · DHM Institute` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | the API key from step 5 |
   | Minimum interval between emails | `60` seconds |

   **Save.** (Resend also has a one-click *Supabase* integration that fills the same fields.)
7. **Authentication** → **Rate Limits** → *Rate limit for sending emails*. Supabase starts custom SMTP at
   **30 an hour**; raise it to **100** (Resend's free plan allows 100 a day; on Resend's paid plan, higher).
8. **Authentication** → **Emails** → **Templates** → **Magic Link**:
   - subject: `Your Koko sign-in code`
   - body:
     ```html
     <h2>Your Koko sign-in code</h2>
     <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
     <p>Type this code in the Koko app or on koko.dhm-institute.com. It works for one hour.</p>
     <p>If you did not ask for it, you can ignore this email.</p>
     <p>Koko · DHM Institute</p>
     ```
   The app asks for the **code** (`{{ .Token }}`), not a link.
9. **Authentication** → **Sign In / Providers** → **Email**: *Email OTP length* **6**, *Email OTP expiration*
   **3600** seconds.

**D. Test**

10. In the Koko app: **Parents** → **Sign in** → your own email → the code arrives from
    `koko@mail.dhm-institute.com`. Resend → **Emails** lists every message with its status (*Delivered*,
    *Bounced*…). If it lands in spam, check that all the DNS records in step 3 show *Verified*.

*Allow new users to sign up* stays **off**. The Edge Function `parent-signin` creates parent accounts itself, and a
parent account can never use the dashboard.

## 4. Stripe (website)

Start in **Test mode** (the switch at the top of the Stripe dashboard). Repeat in Live mode when it works.

1. **Product:** Product catalog → *Add product* → name **Koko Premium**, recurring, **$35.00 USD monthly**. Copy the
   price id → GitHub Variable `STRIPE_PRICE_ID`.
2. **Customer portal:** Settings → Billing → **Customer portal**:
   - allow *Cancel subscriptions* and *Update payment methods*;
   - turn on the **login link** and copy it → GitHub Variable `STRIPE_PORTAL_LOGIN_URL`.
3. **Webhook:** Developers → **Webhooks** → *Add endpoint*.
   - URL: `https://pwgkxdiwqrxkndkyzwlw.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`.
   - Copy the *Signing secret* → GitHub Secret `STRIPE_WEBHOOK_SECRET`.
4. **Key:** Developers → API keys → *Create restricted key*. Give it these permissions, and none others:

   | Resource | Permission |
   |---|---|
   | Checkout Sessions | Write |
   | Customers | Read |
   | Subscriptions | Write (needed to cancel when a parent deletes the account) |
   | Customer portal | Write |

   Copy it → GitHub Secret `STRIPE_SECRET_KEY`.
5. **Test:** on `https://koko.dhm-institute.com/account.html` → Subscribe → card `4242 4242 4242 4242`, any future
   date, any CVC. Then sign in in the app with that email.

## 5. App Store and Google Play (through RevenueCat)

**Apple** (Apple Developer Program, $99 a year):

1. App Store Connect → the app `com.dhminstitute.koko` (Koko: Arabic & Quran for Kids).
2. **Agreements, Tax and Banking:** accept the *Paid Apps* agreement and add bank and tax details. Without them
   purchases do not work, even in testing.
3. The app → **Subscriptions**:
   - subscription group **Koko Premium**;
   - subscription **`koko_premium_monthly`**, duration 1 month, price $34.99 (Apple's nearest price point to $35);
   - a display name and description for review.
4. Users and Access → **Integrations** → **In-App Purchase** → generate a key (`.p8`) for RevenueCat.

**Google** (Play Console, $25 once):

1. The app `com.dhminstitute.koko`. Upload one build first (the first AAB, by hand: `docs/LAUNCH.md` §1, step 5):
   Google allows products only after that.
2. Monetize → **Subscriptions** → product **`koko_premium`** → base plan **`monthly`**, auto-renewing, $34.99 or $35.
3. Google Cloud → a **service account** for RevenueCat. RevenueCat's guide *Creating Play Service Credentials* shows
   each click; it ends with a JSON file you upload to RevenueCat.

**RevenueCat** (free until $2,500 monthly revenue):

1. New project **Koko**. Add an **App Store** app (bundle id, the `.p8` key) and a **Play Store** app (package name,
   the service-account JSON).
2. **Entitlements** → `premium` → attach both products.
3. **Offerings** → `default` (current) → package **Monthly** with both products.
4. **API keys:**
   - copy the two *public* keys → GitHub Variables `REVENUECAT_IOS_PUBLIC_KEY` and `REVENUECAT_ANDROID_PUBLIC_KEY`;
   - create a *secret* key (v1) → GitHub Secret `REVENUECAT_SECRET_KEY`.
5. **Integrations** → **Webhooks** → *Add*:
   - URL `https://pwgkxdiwqrxkndkyzwlw.supabase.co/functions/v1/revenuecat-webhook`;
   - **Authorization header value** = the password you made for `REVENUECAT_WEBHOOK_AUTH`;
   - all events, *Production and Sandbox*.
6. **Test:**
   - iPhone: a TestFlight build with a Sandbox Apple ID;
   - Android: a license tester in Play Console, on an internal-testing build.

## 6. Turn it on

1. Add the GitHub Secrets and Variables (§2) and the SMTP settings (§3).
2. Actions → **Sync to Supabase** → *Run workflow*. It deploys the functions and copies the secrets.
3. Actions → **App test build (Android APK)** → *Run workflow*. The new APK has Koko Premium.
4. In the dashboard, mark the lessons that need a subscription (§1) and **Send to the site**.

## 7. What is where in the code

| Part | Files |
|---|---|
| Database: `units.premium`, `entitlements`, `billing_customers`, `billing_events`, `my_access()`, `set_units_premium()`, `billing_summary()` | `supabase/migrations/20261025090000_subscriptions.sql`, tests in `supabase/tests/04_subscriptions.sql` |
| Webhooks and parent functions | `supabase/functions/{stripe-webhook,revenuecat-webhook,stripe-checkout,stripe-portal,parent-signin,parent-delete}`; rules in `_shared/billing.ts` (tests: `billing.test.ts`) |
| App | `app/src/account/` (sign-in, RevenueCat / Stripe), `app/src/state/access.tsx`, `app/src/app/{premium,account}.tsx`, locks in `Home.tsx` and the lesson screens |
| Website page | `account.html` |
| Dashboard | World page (Access column), Catalog page (subscriber count) |

### Rules the code keeps

- **Each subscription is re-read from Stripe or RevenueCat on every webhook**, so a late or repeated event cannot
  undo a newer state. Each event id is handled once.
- **A store's grace period keeps Premium on** (a failed renewal the store is still retrying).
- **Cancelling keeps Premium until the end of the paid month.**
- **Offline**, the app keeps the last answer until its end date. Signing out forgets it.
- **Deleting the parent account** cancels a website subscription at once. Store subscriptions are cancelled by the
  parent in the store (the app says so).

## 8. The website at launch (owner, 2026-10-23)

The website stays free during the trial. **On launch day it locks Premium lessons too, with the same rules as the
app.** That change waits, unmerged, in its own PR; the steps are in `docs/LAUNCH.md`. Nothing on `main` changes the
website until the owner says "launch".
