# Store listing: Koko (draft for the owner to approve)

Everything here is typed into Google Play Console and App Store Connect by hand; nothing in this file is read by the
app. The character counts were checked against each store's limit.

## Names

| Where | Text | Limit |
|---|---|---|
| Icon and inside the app (`app.json`) | Koko | — |
| Store name (Play and App Store) | Koko: Arabic & Quran for Kids | 29 / 30 |
| App Store subtitle | Teach Koko Arabic & the prayer | 30 / 30 |
| Google Play short description | Kids teach Koko the cat Arabic, the prayer, Islamic Studies and short surahs. | 77 / 80 |
| App Store keywords | arabic,quran,islam,muslim,kids,prayer,salah,islamic studies,learn arabic,dua,surah,alphabet,madrasa | 99 / 100 |
| App Store promotional text | Teach Koko the cat a new Arabic word, the prayer or a short surah today. Approved audio, no ads, works offline. | 111 / 170 |

## Full description (Play and App Store)

> Koko the cat wants to learn Arabic, the prayer and his religion, and your child is his teacher!
>
> Koko is made by DHM Institute for children aged about 5 to 9. Every lesson is short (around 10 minutes) and full of
> play: a cartoon story, new words, letter sounds, listening games, matching, putting things in order, a quiz, and a
> moment to get up and move. Then your child teaches Koko a real conversation and can record their own voice to hear
> it back.
>
> WHAT YOUR CHILD LEARNS
> • Arabic Adventures, Books 1 and 2: greetings, names, "How are you?", numbers, family and the days of the week.
> • The Prayer: each part of the prayer, from "Allahu Akbar" to the salām, then the full prayer with Koko.
> • Islamic Studies, Levels 1 and 2: faith in Allah, the angels and the messengers, wudu and the adhan, the life of
>   the Prophet ﷺ, dhikr, du'a and short surahs, and good manners every day.
>
> RECORDED BY TEACHERS, APPROVED FOR CHILDREN
> • Every Arabic word is a real recording, never a computer voice.
> • Du'a, adhkar, the adhan, the tashahhud and Qur'an are approved by Dr. Hassan Muslim and shown with full tashkeel.
>
> MADE FOR CHILDREN, TRUSTED BY PARENTS
> • No ads, no chat, no tracking, and no account for children (a parent account is optional).
> • Progress, stars and the child's first name stay on the device.
> • Voice recordings are never uploaded and are deleted when the child leaves the screen.
> • Works offline once the lessons are downloaded.
> • Links for parents open only after a grown-up answers a question.
> • A Parents page shows what your child learned today, minutes, words and the daily streak, with a 2-minute
>   activity to try at home.
>
> KOKO PREMIUM
> Many lessons are free. Koko Premium opens every lesson, including new ones as they come out, for $34.99 a month.
> It is bought by a parent, behind a parental gate, and renews every month until cancelled in your account settings.
> Already subscribed on koko.dhm-institute.com? Sign in with the same email on the Parents page.
>
> Want more? DHM Institute offers one-to-one online classes with certified teachers. Book a free trial class from the
> Parents page.

## Store settings

| Setting | Google Play | App Store |
|---|---|---|
| Category | Education | Education; Kids category, age band **6–8** (or 5 and under) |
| Target audience | Children (ages 5–8 and 9–12), join *Designed for Families* | Made for Kids |
| Ads | No ads | No ads |
| In-app purchases | **Koko Premium**, auto-renewing monthly subscription: product `koko_premium`, base plan `monthly`, $34.99 or $35 | **Koko Premium**, auto-renewable subscription in the group *Koko Premium*: product `koko_premium_monthly`, $34.99 |
| Data safety / App privacy | **Collected, not shared, encrypted in transit, deletion in the app:** Personal info → *Email address* (optional; account management, app functionality); Personal info → *User IDs* (app functionality); Financial info → *Purchase history* (app functionality). Nothing about the child. Microphone: on the device only, not collected | **Data Linked to You, not used for tracking:** Contact Info → *Email Address*; Purchases → *Purchase History*; Identifiers → *User ID*; all for *App Functionality*. Nothing about the child |
| Privacy policy URL | https://koko.dhm-institute.com/privacy.html | same |
| Support / marketing URL | https://dhm-institute.com/ | same |
| Content rating questionnaire | No violence, no user interaction, no sharing, no location; **digital purchases: yes** | Age rating 4+; in-app purchases: yes |
| App review notes | Purchases and links are behind a parental gate (a multiplication in words). Restore purchases and account deletion are on the parents' screens | Same. Sign-in is optional: buying works without an account; Terms of Use and Privacy links are on the Koko Premium screen |

## Images in this folder

| File | Use | Size |
|---|---|---|
| `screenshots/iphone-6.9/*.png` | App Store, iPhone 6.9" (also accepted for smaller iPhones) | 1320 × 2868 |
| `screenshots/ipad-13/*.png` | App Store, iPad 13" (needed because the app runs on iPad) | 2064 × 2752 |
| `screenshots/android-phone/*.png` | Google Play, phone | 1080 × 1920 |
| `feature-graphic.png` | Google Play feature graphic | 1024 × 500 |
| `play-icon-512.png` | Google Play icon (32-bit PNG) | 512 × 512 |

The screenshots show seven screens: the map, a lesson's path, new words, Listen & choose, Talk with Koko, the reward
screen and the Parents page. They were taken from the app's web build with `app/scripts/store-screenshots.mts`; the
screens and fonts are the same as on the phone. After the first EAS build, compare them with a real phone.

**Still needed from DHM:** the App Store icon must be **1024 × 1024** with no transparency. The largest Koko icon in
the repo is 512 × 512, so iOS would scale it up and it would look blurry. Please add a 1024 × 1024 version of the same
icon and the app will use it.
