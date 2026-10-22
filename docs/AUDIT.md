# Koko's Quest: audit of the current static app (Milestone 1, step 1)

Snapshot of `main` at `18111ed` (2026-10-19). This step changes no code. It records what the live PWA reads,
so the Supabase schema (step 2), the importer (step 4) and the static export (step 5) can reproduce it exactly.

Sources: `app.js` (the only reader of the content), `sw.js`, `index.html`, `content/**`, `audio/**`, `media/**`,
and a scripted cross-check of every lesson against every file on disk (results in §9).
`README-FOR-DEVELOPER.md` from the source zip is not in this repo, and neither is the `tools/learn_audio.py`
named in an `app.js` comment. Both stay with the local content-production session, so this audit is built from the code.

---

## 1. At a glance

| | |
|---|---|
| Hosting | GitHub Pages from `main`, repo root, no build step. `CNAME` = `koko.dhm-institute.com`. No `.github/` workflows yet. |
| App shell | `index.html`, `app.js` (vanilla JS, one IIFE), `app.css`, `sw.js`, `manifest.webmanifest`, `privacy.html` |
| Content | `content/catalog.json` + 87 lesson files in 5 world folders (564 KB) |
| Audio | `audio/<lesson-id>/*.mp3`: 831 files in 83 folders (19 MB) |
| Media | `media/`: 23 `.mp4` + 23 `-poster.jpg` + 6 app images (98 MB) |
| Worlds / units | 5 worlds, 89 units (87 with a lesson file, 1 "soon", 1 link to another world) |
| Integrity today | **Clean.** Every referenced audio and video file exists, no audio file is orphaned, ids are unique, and every quiz question has exactly one correct option (§9). |

| World id | Name (en) | Units | Folder | Unit id pattern |
|---|---|---|---|---|
| `ar2` | Arabic Adventures · Book 2 | 10 | `content/ar2/` | `ar2-u01`…`ar2-u08`, `ar2-r01`, `ar2-r02` |
| `prayer` | The Prayer | 9 | `content/prayer/` | `prayer-l01`…`prayer-l09` |
| `ar1` | Arabic Adventures · Book 1 | 10 | `content/ar1/` | `ar1-u01`…`ar1-u08`, `ar1-r01`, `ar1-r02` |
| `isl1` | Islamic Studies · Level 1 | 30 | `content/isl1/` | `isl1-l01`…`isl1-l30` (`l13` soon, `l14` links to `prayer`) |
| `isl2` | Islamic Studies · Level 2 | 30 | `content/isl2/` | `isl2-l01`…`isl2-l30` |

World order in `catalog.json` is the display order (Book 2 comes first because it was Haitham's book).

---

## 2. URLs

### Public URLs (all relative to `https://koko.dhm-institute.com/`)

| Path | What it is |
|---|---|
| `/` , `/index.html` | App shell |
| `/app.js?v=6`, `/app.css?v=6` | Shell assets. The `?v=` query string is a manual cache-buster, kept in sync with `sw.js` |
| `/sw.js` | Service worker, registered with `updateViaCache: 'none'` |
| `/manifest.webmanifest` | PWA manifest (`start_url: ./`, `scope: ./`) |
| `/privacy.html` | Privacy policy (see §11, item 7) |
| `/content/catalog.json` | Catalog |
| `/content/<world>/<file>.json` | One lesson. The exact path comes from the unit's `file` field, never built by the app |
| `/audio/<lesson-id>/<clip>.mp3` | Arabic clips (naming in §6) |
| `/media/<name>.mp4`, `/media/<name>-poster.jpg` | Story videos and posters (path taken from the lesson's `video`) |
| `/media/koko-wave.png`, `koko-cheer.png`, `koko-pray.png`, `dhm-logo.png`, `icon-192.png`, `icon-512.png` | App images, hard-coded in `app.js` / manifest |

GitHub Pages serves all of these with `Cache-Control: max-age=600` (checked live).

### In-app routes (hash router, `route()` in `app.js`)

| Hash | Screen |
|---|---|
| `#/` | Home map (current world) |
| `#/welcome` | Name prompt (also shown whenever no name is saved) |
| `#/worlds` | World list |
| `#/world/<worldId>` | Map of one world |
| `#/lesson/<unitId>` | Lesson path (list of steps) |
| `#/lesson/<unitId>/<stepIndex>` | One step |
| `#/words` | "My words" |
| `#/parents` | Parents page |
| `#/review` | Review of forgotten words, across lessons |

Deep links contain unit ids, so **unit ids are also part of the URL contract**.

### External URLs

- `https://dhm-institute.com/` and `https://dhm-institute.com/trial-sessions/booking` (booking card).
- Google Fonts: Baloo 2, Noto Naskh Arabic, Playfair Display.
- Device text-to-speech (`speechSynthesis`) speaks all English. No English audio files exist.

---

## 3. How content is loaded and cached (the offline contract)

1. `catalog()` fetches `content/catalog.json` once per page load with `cache: 'no-cache'`.
2. `lesson(id)` finds the unit in the catalog and fetches **`unit.file`**. A unit with no `file` is "soon" and
   can't be opened. The app never guesses a lesson path.
3. Service worker (`sw.js`):
   - **Install** pre-caches the shell and `content/catalog.json` into `koko-shell-v6`.
   - **Shell and JSON** (everything except `/audio/`, `/media/` and `.mp4`): network-first with `cache: 'no-cache'`,
     falling back to the cache when offline. **A lesson JSON is available offline only after it has been opened
     online once.**
   - **Audio and images** under `/audio/` or `/media/`: network-first into `koko-media-v3`, with the cache as the
     offline fallback.
   - **`.mp4` is never intercepted**, so story videos don't play offline.
   - On activate, the worker deletes every cache except the two current ones. When the controller changes, the
     page reloads once.
4. **What this means for the export:** it must keep the same paths (`content/catalog.json`,
   `content/<world>/<file>.json`, the `file` values in the catalog). Then the live app and the service worker
   keep working with no change to `app.js` or `sw.js`. A content-only publish needs no cache-version bump,
   because JSON is network-first.

---

## 4. `content/catalog.json`

Written as `JSON.stringify(obj, null, 2)`, UTF-8, Arabic unescaped, no trailing newline.

```jsonc
{
  "version": 1,                       // int. Not read by the app.
  "note": "Add a lesson: …",          // string. Human note, not read.
  "focus": "ar2",                     // world id. Starting world when the child's name is "Haitham"/"هيثم".
  "worlds": [ World, … ],             // display order
  "start": "ar2-u02",                 // unit id. Starting unit for Haitham only.
  "focusNew": "ar1"                   // world id. Starting world for every other child.
  // "teacherNote": { "text": "…" }   // optional. Shown on the Parents page. Not present today.
}
```

Top-level key order today: `version, note, focus, worlds, start, focusNew`.

**World** (all fields are read by the app):

| Field | Type | Use |
|---|---|---|
| `id` | string | World id (`ar1`, `ar2`, `prayer`, `isl1`, `isl2`), used in routes |
| `en` | string | Name. **The first digit in `en` is the world icon** (`'Book 2'` → "2"; no digit → ★) |
| `ar` | string | Arabic name, with tashkeel |
| `tint` | string | Icon background colour (hex) |
| `ink` | string | Icon text colour (hex) |
| `units` | Unit[] | Display order = path order on the map = "next lesson" order |

**Unit**:

| Field | Type | Req. | Use |
|---|---|---|---|
| `id` | string | yes | **Stable key** of progress, routes and the audio folder. `<world>-u<NN>`, `<world>-r<NN>` (review) or `<world>-l<NN>` |
| `n` | string | yes | Label in the map dot (`"1"`, `"R1"`…). A string, not a number |
| `ar` | string | yes | Arabic title on the map |
| `en` | string | yes | English title on the map |
| `file` | string | no | `content/<world>/<suffix>.json`. Present = playable. Absent = "soon" |
| `go` | string | no | World id. Turns the node into a link to that world (only `isl1-l14` → `prayer`) |

Every `file` today equals `content/<world>/<unit-id-without-world-prefix>.json`, and every lesson's `id` equals
its unit `id`. Unit key order: `id, n, ar, en, file|go`.

"Next lesson" logic (`nextUnit()`): it starts at the focus world (and, for Haitham, at `start`), then walks the
world's units in order, wrapping around, and moves to the next world. It returns the first unit that has a file
and no stars. **So `sort` order in the DB must reproduce the array order exactly.**

---

## 5. Lesson JSON (`content/<world>/<file>.json`)

Same formatting as the catalog, except in 3 files (§10). The app decides which steps to show from which fields
are present (§5.3). There is no `type` field.

### 5.1 Top-level fields

"Read" means `app.js` reads the field. Fields marked *not read* are still approved content and metadata:
they must be stored and exported unchanged.

| Field | Type | Lessons | Read | Notes |
|---|---|---|---|---|
| `id` | string | 87/87 | yes | Equals the unit id |
| `world` | string | 87 | *not read* | Equals the world id |
| `unit` | int | 16 (ar1/ar2 `u*` only) | *not read* | Book unit number |
| `source` | string | 87 | *not read* | Arabic and English provenance: book, page, approval notes (e.g. "Video approved by Dr. Hassan (2026-10-11)") |
| `title` | `{ar, en}` | 87 | yes | |
| `topic` | string | 87 | yes | Subtitle on the Home card and the Parents fallback |
| `minutes` | int | 87 | yes | Values 4, 8, 10, 12. Default 10 if missing |
| `note` | string | 1 (`ar1-u01`) | *not read* | Editorial note |
| `video` | `{src, poster}` | 23 | yes | `media/…mp4`, `media/…-poster.jpg` → **story** step |
| `learn` | Card[] | 58 (isl1, isl2) | yes | → **learn** step |
| `words` | Word[] | 86 (all but `prayer-l01`) | yes | → **words** step, plus the listen and match games |
| `sounds` | Sounds | 16 (ar1/ar2 units) | yes | → **sounds** step |
| `games` | string[] | 84 (absent in `isl1-l01`, `isl2-l15`, `prayer-l01`) | yes | Subset and order of `"listen"`, `"match"`, `"order"` |
| `order` | Order | 29 | yes | Used only if `"order"` is in `games` (29 lessons have both) |
| `dialogue` | Line[] | 16 | yes | Lines used by `talk` |
| `speakers` | `{[who]: Speaker}` | 16 | yes (`playedBy`) | |
| `talk` | Exchange[] | 16 | yes | → **talk** step |
| `quiz` | Question[] | 71 | yes | → **quiz** step |
| `move` | `{ar, en}` | 25 | yes | → **move** step, audio `x-move-ar` |
| `think` | `{q, a}` | 58 (isl1, isl2) | yes | → **think** step (both read aloud in English) |
| `parents` | Parents | 87 | yes | Parents page |

Top-level key order is not uniform (11 different orders across 87 files, e.g. `video` is last in ar1/ar2 and
before `quiz` in `prayer-l01`). The app doesn't care. The round-trip in step 4 compares ignoring key order, as the
brief says. I still recommend storing the original key order so exports don't reshuffle files (§12).

### 5.2 Nested shapes

**Word** (561 in total; ids unique within each lesson):

| Field | Type | Count | Read | Notes |
|---|---|---|---|---|
| `id` | string | 561 | yes | `[a-z0-9_-]`. **Stable progress key** `"<from‖lesson>|<id>"`, and the audio file name |
| `ar` | string | 561 | yes | Full tashkeel |
| `en` | string | 561 | yes | Meaning, spoken by TTS |
| `tr` | string | 58 | yes | Transliteration (isl1, isl2, prayer) |
| `badge` | string | 65 | yes | Small label on the card: `"1"`…`"10"`, `"1st"`…`"10th"`, `"×2"`, `"×3"`, `"last"`, `"?"`, `"40"`, `""` |
| `from` | string | 50 | yes | Lesson id that owns this word and its audio. Used by review lessons (`ar1-r0x`, `ar2-r0x`) and `prayer-l09` |
| `sacred` | bool | 76 (28 lessons) | *not read* | Marks du'aa, dhikr, adhan, Qur'an and similar. **The only sacred marker in the content** (§11, item 3) |

Each `from` word was checked: it exists in its home lesson with byte-identical `ar`.

**Learn card** (320 cards in 58 lessons): `{title, en, ar?, tr?, aud?, koko?}`.
- `title` and `en` are always present and read aloud as `"<title>. <en>"`.
- `ar` (96) is shown large, with `tr` (96) under it.
- `aud` (45), always `c-<cardIndex>-ar`, names the clip for the card's Arabic.
- `koko` (optional, used by none today) replaces Koko's speech bubble.
- Clip rule (`learn()`): if the card's `ar`, with tashkeel stripped (`U+064B–U+0652, U+0670, U+0640`), equals a
  lesson word's `ar` stripped the same way, the app plays **that word's** clip. Otherwise it plays `aud`. All 96
  cards with `ar` resolve to an existing clip today.
- Key order inside cards is irregular (`en, title, ar, tr`).

**Sounds** (16): `{letters: [{ch, name, tip}], pairs: string[][], prompt?, sub?}`. There are 2 letters per lesson, except `ar2-u07`, which has 3.
- Every pair has one word per letter (checked). `pairs[i][j]` plays `s-<i+1>-<j>-ar`.
- `ch` can be a single letter or a vowel mark on tatweel (`"ـَ"`, `"ـَا"`, …). These are the only 6 tatweel
  characters in the content, and they are intentional.
- `prompt` and `sub` exist only in ar2 u02–u05.

**Order** (29): `{en, ids: string[], items?: Item[]}`.
- `ids` lists word ids of the same lesson, in the correct order.
- `items` (5 prayer lessons) replaces `ids` in the app. Each item is `{id, ar, en, from}`, its audio comes from
  the `from` lesson, and `ids` is still present with the same order.

**Dialogue line** (123 in 16 lessons): `{id: "d<N>", who, ar, en}`. Audio is `d-<id>-ar`.

**Speaker**: `{en, ar, playedBy: "koko" | "haitham"}`. `"haitham"` means *the child* (the "Teacher").
Only `playedBy` is read; `en` and `ar` are stored as metadata. Every `who` in `dialogue` exists in `speakers`.

**Talk exchange** (55): `{ask, answer, wrong: [id, id]}`. All three are dialogue ids of the same lesson (checked).

**Quiz question** (324 in 71 lessons): `{en, opts, ar?, keep?}`.
- `en` is the question, `ar` (53) is an Arabic prompt shown above it, and `keep: true` (97, Islamic Studies) keeps
  the option order instead of shuffling.
- `opts` is a list of **3-element arrays `[ar, en, correct]`**: `ar` is `""` when the option is English only (623
  of 761), and `correct` is the **integer `0` or `1`, not a boolean**. 211 questions have 2 options and 113 have 3.
- **Every question has exactly one `1`** (checked).
- Quiz has no audio.

**Parents** (87): `{summary, tip, try: {ar, translit, en}, tryAudio?}`.
- `tryAudio` (12, ar1/ar2) is a clip name *inside this lesson's folder*, reusing an existing `w-…` or `d-…` clip
  (e.g. `w-ma-ar`, `d-d8-ar`).

### 5.3 Steps (`stepsFor(L)`, in this fixed order)

| # | Step key | Shown when | Data |
|---|---|---|---|
| 1 | `story` | `video` | `video.src`, `video.poster` |
| 2 | `learn` | `learn.length` | cards |
| 3 | `words` | `words.length` | words |
| 4 | `sounds` | `sounds` | letters, pairs |
| 5+ | `listen` / `match` / `order` | for each entry of `games`, in `games` order (`order` only if `L.order`) | words / order |
| … | `talk` | `talk.length` | dialogue, speakers, talk |
| … | `quiz` | `quiz.length` | quiz |
| … | `move` | `move` | move |
| … | `think` | `think` | think |

Stars: 3 for ≤1 mistake, 2 for ≤4, else 1. Listen uses at most 6 rounds, match 5 pairs, sounds 8 rounds.

---

## 6. Audio naming rules

All Arabic audio is `audio/<owner-lesson-id>/<name>.mp3`. The "owner" is the lesson itself, or `from` when the
item is borrowed. English is never a file: the device's TTS speaks it.

| Pattern | Count | Used by | Path built as |
|---|---|---|---|
| `w-<wordId>-ar.mp3` | 511 | word cards, listen, match, order, Learn cards that match a word, review | `audio/${w.from‖L.id}/w-${w.id}-ar.mp3` |
| `d-<lineId>-ar.mp3` | 123 | talk | `audio/${L.id}/d-${d.id}-ar.mp3` |
| `s-<pair#>-<letter#>-ar.mp3` | 127 | sounds (`pair#` is 1-based, `letter#` is 0-based) | `audio/${L.id}/s-${i+1}-${j}-ar.mp3` |
| `c-<cardIndex>-ar.mp3` | 45 | Learn card Arabic (via `learn[].aud`) | `audio/${L.id}/${c.aud}.mp3` |
| `x-move-ar.mp3` | 25 | move | `audio/${L.id}/x-move-ar.mp3` |
| *(reuse)* | 12 | `parents.tryAudio` | `audio/${L.id}/${tryAudio}.mp3` |

Facts that matter for the backend:

- **Audio file names come from ids.** Renaming a word id, a dialogue id or a card index (reordering `learn`)
  points the app at a different or missing clip. The admin must treat these ids as immutable, or validation must
  catch the change (step 5).
- The 4 review lessons (`ar1-r01/02`, `ar2-r01/02`) have **no audio folder**. All their sound comes from `from`
  lessons. That is why there are 83 audio folders for 87 lessons.
- `audio/_rejected/` is git-ignored (local production only).
- Total: 831 clips, 19 MB. Every one is referenced, and every reference exists.

## 7. Video and images

- 23 lessons have `video`: `media/ar1-u0N.mp4`, `media/ar2-u0N.mp4` (all 16 Book units) and
  `media/prayer-N.mp4` (N = 1…7, used by `prayer-l01`…`l07`). Each has a matching `-poster.jpg`.
- The largest video is about 6.7 MB, and `media/` is 98 MB in total. This is why media must stay on static hosting.
- 6 app images are hard-coded in `app.js` or the manifest and are not referenced by content.

## 8. What the device stores (why ids must never change)

`localStorage['koko-quest-v2']`:

```jsonc
{
  "name": "…",                                  // child's first name, device only
  "stars": { "<unitId>": 1-3 },
  "step":  { "<unitId>": <index of the next step> },
  "words": { "<ownerLessonId>|<wordId>": { "seen": n, "right": n, "wrong": n } },
  "time":  { "YYYY-MM-DD": seconds },
  "days":  ["YYYY-MM-DD", …],
  "last":  "<unitId>"
}
```

There is also a one-time migration from `localStorage['haitham-quest-v1']` (`stars['1']` → `prayer-l01`).

Consequences:

- **Unit ids** (`stars`, `step`, `last`, routes, audio folders) and **word ids together with their owner lesson**
  (`words`, audio names) must be kept exactly. "My words" and "Review" look a word up by owner lesson and id.
  A renamed or removed word disappears silently from the child's list.
- `step` stores a **step index**. If a lesson gains or loses a step (for example a video is added), a child in the
  middle of that lesson resumes one step off. This is harmless, but editors should know.
- No progress leaves the device. The privacy policy promises this (§11, item 7).

---

## 9. Validation run on the current content (2026-10-22)

A throwaway script checked the following. All checks pass. Step 5's validator will make them permanent and add
the rest of the list.

- [x] 89 unit ids, all unique. Every lesson `id` equals its unit `id`, every `world` equals its world, and every
      `file` equals `content/<world>/<suffix>.json`.
- [x] Word ids unique within each lesson. Every `from` word exists in its home lesson with identical `ar`.
- [x] Every `order.ids` entry is a word of the lesson. `order.items` ids equal `order.ids`. The `order` game is
      always paired with `order` data, and vice versa.
- [x] Every `talk.ask/answer/wrong` id exists in `dialogue`, and every `dialogue.who` exists in `speakers`.
- [x] Every `sounds.pairs[i]` has one entry per letter.
- [x] All 324 quiz questions have exactly one correct option. Every option is a `[string, string, 0|1]` triple.
- [x] 877 file references (831 audio + 23 videos + 23 posters): **0 missing**. 0 unreferenced audio files.
- [x] Every Learn card with Arabic resolves to a clip, either a matching word or `aud`.

## 10. Formatting (for the byte-level round trip)

- 85 of 88 JSON files are exactly `JSON.stringify(obj, null, 2)`: UTF-8, Arabic and diacritics unescaped, no
  trailing newline. The export should write with this exact call, so unchanged lessons produce **no git diff**.
- 3 files were hand-formatted with some objects on one line: `content/ar2/r01.json`, `content/ar2/r02.json` and
  `content/prayer/l01.json`. They are semantically identical after a parse, so the first export will reflow their
  whitespace only. The round-trip check compares parsed JSON (key order ignored), so this is not a difference.
  If the owner wants zero diff even there, the importer can skip rewriting files whose parsed content is unchanged.
- Strings are stored as written, with no Unicode normalisation (NFC/NFD) anywhere. The DB and the export must not
  normalise, trim or "clean" any string. Postgres `text` and `jsonb` both keep the exact code points.
- Numbers are all integers. The integer `0`/`1` in quiz options must stay integers: in `jsonb`, `1` and `true`
  are different values.

## 11. Findings and points for the owner

1. **Draft vs "soon".** A unit without `file` already renders as "soon". Recommendation: a unit whose lesson is
   still a draft is exported **without `file`** (shown as "soon", and no draft content leaves the DB). Archived
   units are not exported at all. *Owner decision needed:* should draft units appear as "soon", or be hidden
   until published?
2. **Two writers in the transition period.** The local production session keeps committing `content/**` and
   `audio/**`. Proposal for steps 4–5:
   - The import runs on every push to `main` that touches `content/**` (repo → DB).
   - The export (DB → repo) refuses to overwrite a lesson file that changed in git since that lesson was last
     imported (`source_sha` per lesson), and reports it instead.
   - So neither writer can silently undo the other.
3. **Sacred marking is incomplete in the data.** Only `words[].sacred` exists (76 words). Learn-card clips
   (`c-*`) carry no flag, yet many are sacred text: basmala, the shahada, tashahhud, adhan, the masjid du'aas,
   and the names of 6 short surahs in `isl2-l17`. Proposal for `media_assets.sacred`:
   - Seed it as true for every clip of a `sacred` word.
   - Seed it as true for every `c-*` clip in a lesson that has a sacred word, or whose card `ar` contains "الله".
   - Mark all of them *already approved* (the brief says the current audio is approved). The owner then reviews
     the list once in the admin.
4. **Ids that are effectively immutable:** unit id, word id, dialogue id, the position of a Learn card that has
   `aud`, and `sounds` pair and letter positions. All of them name audio files. The admin should lock them on
   published lessons.
5. **Unread fields** (`world`, `unit`, `source`, `note`, `sacred`, `speakers.*.en/ar`, catalog `version`/`note`)
   are kept in the schema and exported unchanged. `source` holds approval history.
6. **Offline gaps in the current PWA** (information only, not changed in this milestone): videos are never cached,
   and a lesson's JSON is cached only after it is opened once online. This matters later for the Expo app's
   offline design.
7. **Privacy policy.** `privacy.html` promises "no accounts, no in-app purchases, no tracking". The admin backend
   doesn't touch children's data, so it doesn't conflict. **Subscriptions (later milestone) will need the policy
   updated before launch.**
8. `README-FOR-DEVELOPER.md` and `tools/learn_audio.py` are not in the repo. Not blocking: everything the app
   reads is documented above from the code.

## 12. Implications for step 2 (schema preview, not final)

- `worlds(id text pk, en, ar, tint, ink, sort, status, …)`.
- `units(id text pk, world_id fk, n text, ar, en, go_world_id null, sort, …)`. A unit exists without a lesson
  ("soon").
- `lessons(id text pk = unit id, title_ar, title_en, topic, minutes, source, note, unit_no int null, status, …)`.
- The varying parts go in `jsonb` columns, one per top-level field, holding the original JSON **verbatim**: `words`,
  `learn`, `sounds`, `games`, `order`, `dialogue`, `speakers`, `talk`, `quiz`, `move`, `think`, `parents`,
  `video`. A missing field is stored as SQL `NULL`, never `[]` or `{}`. No lesson has an empty array or object today, so
  `NULL` ⇄ absent keeps the round trip exact.
- An optional `key_order text[]` per lesson, so the export can write keys in the original order and keep git
  diffs minimal.
- Catalog-level fields (`focus`, `start`, `focusNew`, `teacherNote`, `version`, `note`) go in a one-row `settings`
  table.
- `media_assets` is seeded from §6 (831 clips + 46 video files), with `sacred` set as in §11, item 3.
