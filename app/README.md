# Koko: Android and iOS app (Expo)

**Names.** On the phone (icon) and inside the app: **Koko**. In Google Play and the App Store: **Koko: Arabic & Quran
for Kids** (29 characters; both stores allow 30). That store name is typed into Play Console and App Store Connect;
it is not in `app.json`.

React Native + Expo (SDK 58), TypeScript, Expo Router. It shows the **same lessons as the live PWA** and reads the
**same static files** (`content/catalog.json`, the lesson JSONs, `audio/`, `media/` on https://koko.dhm-institute.com).
It never talks to the database.

## What it keeps exactly as the PWA does

- **Approved content is never changed.** Arabic text, tashkeel and translations are shown exactly as published.
  - Arabic is always a recorded, approved clip; only English meanings use the device voice.
  - Audio and video are played or downloaded byte for byte.
- **Same rules.** The steps (`stepsFor` from `packages/shared`), stars (≤1 mistake → 3, ≤4 → 2), "next lesson",
  review of forgotten words, learning time and streak.
- **Same rewards.** The PWA's game sounds (right, wrong, win) and confetti. The sounds are WAV files made by
  `app/scripts/make-sfx.mjs` from the same tones as `app.js` `blip()`; they play on their own players and never cut
  Koko's Arabic clip. Confetti is skipped when the phone asks for reduced motion.
- **Same progress format**, saved on the device only. The storage key stays `koko-quest-v2` so stars carry over;
  children never see it. The privacy promise is unchanged: no account, no ads, no tracking. Voice recordings stay on
  the device.

## Offline

On Android and iOS:

- **Lesson data:** each lesson's JSON is saved on first open (network first, so updates arrive).
- **Audio:** each lesson's clips and poster are downloaded in the background on first open.
- **Videos:** a story video is saved when it is first opened.
- **Corrections:** saved files are re-checked with their ETag, so a corrected clip replaces the old one. The PWA
  does the same with network-first media.

The web build relies on the browser cache.

## For parents only: the parental gate

Every link that leaves the app needs a grown-up to answer a multiplication written in words (e.g. *"What is eight
times seven?"*) first. That covers the DHM trial-class booking, course promos, DHM Institute and the privacy
policy. It is required for **Google Play Families** and the **Apple Kids** category.

- Promos come from `content/promos.json` (edited in the admin dashboard); without them, the PWA's booking card
  appears.
- Placements: map, parents page, after a lesson.

## Run it

```bash
cd app
npm ci
npx expo start            # Expo Go on a phone, or press w for the web
npx expo-doctor           # 20/20 checks
npm run typecheck
EXPO_PUBLIC_CONTENT_URL=http://localhost:8085 npx expo start   # use a local copy of the site instead of the live one
```

## Build for the stores (EAS)

Build and submit need the owner's Expo account and store accounts:

- **One-time:**
  1. `npx eas-cli@latest login`
  2. `npx eas-cli@latest init` (writes the project id into `app.json`).
- **Test builds:** `npx eas-cli@latest build --profile preview --platform android` makes an APK to install
  directly.
- **Store builds:** `npx eas-cli@latest build --profile production --platform all`, then
  `npx eas-cli@latest submit`.

Identifiers: `com.dhminstitute.koko`, the same for the Android package and the iOS bundle id, and the URL scheme.
They can no longer change once the first build is in a store.

**Store forms:**
- **Google Play, Data safety:** no data collected or shared. The microphone is used on the device only.
- **Google Play, target audience:** children. Join *Designed for Families*.
- **Apple:** *Kids* category, age band 5 and under / 6–8. No third-party analytics or ads. Links behind the
  parental gate.
