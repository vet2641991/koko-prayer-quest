# Launch: Google Play, the App Store and the website

The order the owner chose (2026-10-24): **Google Play first**, the **App Store later**, once the Apple account
exists. Everything Apple needs is ready, so on that day only the keys and one button are left.

| | Workflow (GitHub → Actions) | Needs |
|---|---|---|
| Google Play, Internal testing | **Store build: Android (Google Play internal testing)** | `EXPO_TOKEN` (already set), `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` |
| App Store, TestFlight | **Store build: iOS (TestFlight)** | `EXPO_TOKEN` and the six Apple values in §2. Until they exist it stops calmly: **"Needs Apple keys"**, with the list of what is missing |
| Test APK for your own phone | **App test build (Android APK)** | `EXPO_TOKEN` |

Both store builds:
- build on EAS with the `production` profile;
- raise the version code (Android) or build number (iOS) by themselves;
- write the public Koko Premium keys (GitHub Variables) into that build only;
- check that only `app/` and `packages/shared` are uploaded to EAS.

**Keys never go in a chat or in a file in the repository.** Each one goes into GitHub → repo → **Settings** →
**Secrets and variables** → **Actions**:
- **Secrets** tab → *New repository secret* for secrets;
- **Variables** tab → *New repository variable* for the public values.

The workflows write a key file only into the runner's temporary folder and delete it at the end.

## 1. Google Play (Internal testing)

1. **Play Console account:** https://play.google.com/console ($25, once). Google verifies your identity.
   - **Decision:** a *personal* account, or an *organization* account (DHM Institute; needs a D-U-N-S number).
   - Google requires new **personal** accounts to run a **closed test with at least 12 testers for 14 days** before
     the app can go to production. Organization accounts don't need this. Internal testing works either way.
2. **Create the app:** *Create app*:
   - name **Koko: Arabic & Quran for Kids**;
   - default language **English (United States)**;
   - **App**, **Free** (Koko Premium is an in-app subscription; the app itself is free);
   - accept the declarations.
3. **Policy → App content.** Answers are in `app/store/LISTING.md`:
   - **Privacy policy:** `https://koko.dhm-institute.com/privacy.html`
   - **App access:** all functionality is available without special access. The parent account is optional;
     Premium lessons need a subscription, which reviewers can test with a license tester.
   - **Ads:** no ads.
   - **Content rating:** the questionnaire (Education; no violence, no user interaction, no location; digital
     purchases: yes).
   - **Target audience:** ages 5–8 and 9–12, which puts the app under the **Families** policy.
   - **Data safety:** the answers in `LISTING.md`.
   - **Store listing:** the texts in `LISTING.md`, and the images in `app/store/`:
     - icon `play-icon-512.png`;
     - `feature-graphic.png`;
     - `screenshots/android-phone/`.
4. **Testers:** **Testing → Internal testing → Testers** → *Create email list* (up to 100 Google accounts) → Save.
   Copy the **join link** for the testers.
5. **The first version, by hand.** Google does not let an app's very first AAB arrive through the API.
   1. Actions → **Store build: Android (Google Play internal testing)** → *Run workflow*, with **upload** switched
      **off**.
   2. When the run is done, open its summary → **Download the AAB**.
   3. Play Console → **Internal testing** → *Create new release*.
      - **App signing:** choose **Use Google-generated key** (*Play App Signing*). EAS keeps the *upload* key;
        Google keeps the key that signs the app on phones.
      - Upload the AAB → *Next* → *Save* → **Start rollout to Internal testing**.
6. **A key so GitHub can upload the next versions** (a *service account*):
   1. https://console.cloud.google.com with the same Google account → *New project* `koko-play`.
   2. **APIs & Services → Library** → **Google Play Android Developer API** → *Enable*.
   3. **IAM & Admin → Service accounts** → *Create service account*: name `github-upload`, no roles → *Done*.
   4. Open it → **Keys → Add key → Create new key → JSON**. A `.json` file downloads.
   5. Play Console → **Users and permissions** → *Invite new users*:
      - email: the service account's address (`github-upload@…iam.gserviceaccount.com`);
      - **App permissions** → Koko → tick **Release apps to testing tracks** and **Manage testing tracks and edit
        tester lists** → *Invite user*.
   6. GitHub **Secret** `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`: open the `.json` file in a text editor, copy **all** of
      it, and paste it as the value.
   7. Then delete the file from Downloads, or keep it in a password manager.
7. **Every next version:** Actions → **Store build: Android …** → *Run workflow*, with upload **on** and
   `completed`. Testers get it from the join link about 10 minutes later.
   - If the summary says Google accepts only a **draft** release, run again with **release_status = draft** and
     the **build id** from the summary (no new build) → Play Console → Internal testing → **Start rollout**.
   - To retry an upload without building again, put the summary's **build id** in `build_id`.
8. **Version name:** `app/app.json` → `version` (now `1.0.0`). Ask for a change when a release needs a new number;
   the version code goes up by itself.

Koko Premium in Google Play (the product `koko_premium`, RevenueCat's own service account) is in
`docs/SUBSCRIPTIONS.md` §5. Products can be created only after step 5.

## 2. Apple (App Store and TestFlight), later

In this order. Each value goes into GitHub exactly where the list says.

1. **Apple Developer Program:** https://developer.apple.com/programs/enroll ($99 a year).
   - **Decision:** *Individual* (your name is shown as the seller) or *Organization* (DHM Institute; needs a
     D-U-N-S number and takes longer).
   - Approval takes from one day to about a week.
2. **Team ID and team type:** https://developer.apple.com/account → **Membership details**.
   - GitHub **Variable** `APPLE_TEAM_ID`: the **Team ID** (10 letters and digits).
   - GitHub **Variable** `APPLE_TEAM_TYPE`: `INDIVIDUAL` or `COMPANY_OR_ORGANIZATION`.
3. **The app's identifier:** **Certificates, Identifiers & Profiles** → **Identifiers** → **+** → *App IDs* →
   *App*:
   - description `Koko`;
   - **Explicit** Bundle ID `com.dhminstitute.koko`;
   - keep the default capabilities (*In-App Purchase* is on) → *Register*.
4. **The app in App Store Connect:** https://appstoreconnect.apple.com → **Apps** → **+** → *New App*:
   - iOS; name **Koko: Arabic & Quran for Kids**; primary language **English (U.S.)**;
   - Bundle ID `com.dhminstitute.koko`; SKU `koko-ios`; *Full access* → *Create*.
   - Then **App Information** → **Apple ID** (digits only) → GitHub **Variable** `APPLE_ASC_APP_ID`.
5. **The API key for GitHub:** App Store Connect → **Users and Access** → **Integrations** → **App Store Connect
   API** → **Team Keys**.
   - The first time, the Account Holder clicks *Request Access* and accepts.
   - **Generate API Key**: name `EAS GitHub`, access **Admin**. Admin is needed to create the signing certificate.
   - **Download** the `.p8` file. Apple shows the download **only once**.
   - GitHub **Secret** `APPLE_ASC_API_KEY_P8`: open the `.p8` in Notepad or TextEdit and copy **everything**,
     including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines.
   - GitHub **Secret** `APPLE_ASC_KEY_ID`: the key's **Key ID** (10 characters, in the keys list).
   - GitHub **Secret** `APPLE_ASC_ISSUER_ID`: the **Issuer ID** above the list.
   - Keep the `.p8` in a safe place (password manager) and delete it from Downloads. To stop GitHub's access at any
     time: **Revoke** the key on the same page.
6. **Agreements, Tax and Banking:** accept the **Paid Apps** agreement and add the bank and tax details. Without them
   the subscription doesn't work, even in TestFlight. The subscription itself: `docs/SUBSCRIPTIONS.md` §5.
7. **App Privacy:** the app → **App Privacy** → *Get Started*:
   - **Privacy Policy URL:** `https://koko.dhm-institute.com/privacy.html`
   - **Data collected:**
     - *Contact Info → Email Address*;
     - *Purchases → Purchase History*;
     - *Identifiers → User ID*.
   - For each of the three:
     - used for **App Functionality** only;
     - **linked to the user**: yes;
     - **used for tracking**: no.
   - Nothing else is collected. Voice recordings stay on the device and are not collected. Nothing about the
     child is collected.
   - Then **Publish**.
   - **Age rating:** 4+.
   - **Kids:** *Made for Kids*, age band **6–8**. The parental gate before links and purchases is already in the app.
8. **Build and upload:** Actions → **Store build: iOS (TestFlight)** → *Run workflow*.
   - The first run creates the **distribution certificate** and the **App Store provisioning profile** with the API
     key. You'll see them under *Certificates, Identifiers & Profiles*. EAS keeps them, and later runs reuse them.
   - The build takes about 20–40 minutes on EAS. Apple then processes it for 15–30 minutes.
9. **TestFlight:** App Store Connect → the app → **TestFlight**.
   - **Internal testers** are people in your App Store Connect team (up to 100). They get each build at once in the
     *TestFlight* app.
   - **External testers** (anyone, by email or a public link) need Apple's *Beta App Review* for the first build,
     usually about a day.
10. **Koko Premium for iPhone:**
    - the subscription `koko_premium_monthly`;
    - the *In-App Purchase* key for RevenueCat. This is a different key from step 5.
    - Both are in `docs/SUBSCRIPTIONS.md` §5.

**If the iOS run stops:**

| The summary or log says | Do this |
|---|---|
| **Needs Apple keys** (محتاج مفاتيح Apple) and a list | Add the listed Secrets/Variables (steps 2, 4, 5) and run again |
| *APPLE_TEAM_TYPE must be …* or another format error | Fix that Variable: `INDIVIDUAL` or `COMPANY_OR_ORGANIZATION`, a 10-character Team ID, an Apple ID of digits only |
| An error about permissions or the key's role | The API key must have **Admin** access (step 5): make a new one and replace the three Secrets |
| *maximum number of certificates* | **Certificates** → revoke an old, unused *Apple Distribution* certificate, then run again |
| The upload failed, but the build is done | Run again with the summary's **build id** in `build_id`. It uploads without building again |

## 3. Launch day: the website

The website (`koko.dhm-institute.com`) stays free during the trial. Locking its Premium lessons waits in the draft
**launch PR**, which is merged only when the owner says **"إطلاق"**. That PR adds its own launch-day checklist here.

## بالعربي: المطلوب منك

**Google Play (دلوقتي):**
- [ ] حساب Play Console، وتقرّر شخصي ولا مؤسسة.
- [ ] تعمل التطبيق، وتملا *App content* (الإجابات في `app/store/LISTING.md`).
- [ ] تعمل قايمة التستر (Internal testing → Testers).
- [ ] أول نسخة: تشغّل الـ workflow والرفع مقفول، وبعدين تنزّل الـ AAB وترفعه بإيدك.
- [ ] Service account، وتحط الـ JSON كله في السيكرت `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.

**Apple (بعدين):**
- [ ] حساب Apple Developer، وتقرّر فرد ولا مؤسسة.
- [ ] الـ Variables:
  - `APPLE_TEAM_ID`
  - `APPLE_TEAM_TYPE`
  - `APPLE_ASC_APP_ID`
- [ ] الـ Secrets:
  - `APPLE_ASC_API_KEY_P8`
  - `APPLE_ASC_KEY_ID`
  - `APPLE_ASC_ISSUER_ID`
- [ ] App Privacy، والـ Paid Apps agreement.
- [ ] تدوس *Run workflow* على **Store build: iOS (TestFlight)**.
