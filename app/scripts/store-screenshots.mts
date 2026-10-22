// Store screenshots and the Google Play feature graphic, taken from the app's web build (the same screens and fonts
// as on the phone). Output: app/store/screenshots/<device>/NN-name.png and app/store/feature-graphic.png.
//
//   cd app && EXPO_PUBLIC_CONTENT_URL=https://koko.dhm-institute.com npx expo export --platform web --output-dir dist
//   (serve app/dist on http://localhost:8090 with a fallback to index.html)
//   npm i --no-save playwright-core@1.56.1
//   CHROME=/path/to/chrome npx tsx app/scripts/store-screenshots.mts http://localhost:8090
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright-core';
import { stepsFor } from '../../packages/shared/src/audio.ts';
import type { Lesson } from '../../packages/shared/src/schema.ts';

const APP = process.argv[2] ?? 'http://localhost:8090';
const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = `${ROOT}app/store/`;
const LESSON = 'ar1-u01';   // has every kind of step: story, words, sounds, games, talk, move
const L = JSON.parse(readFileSync(`${ROOT}content/ar1/u01.json`, 'utf8')) as Lesson;
const step = (k: string) => stepsFor(L).indexOf(k);

// Store sizes: App Store 6.9" iPhone and 13" iPad (the app supports tablets), Google Play phone (9:16).
const DEVICES = [
  { dir: 'iphone-6.9', width: 440, height: 956, scale: 3, mobile: true },     // 1320 × 2868
  { dir: 'ipad-13', width: 1032, height: 1376, scale: 2, mobile: true },      // 2064 × 2752
  { dir: 'android-phone', width: 360, height: 640, scale: 3, mobile: true },  // 1080 × 1920
];

const days = Array.from({ length: 5 }, (_, i) => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10)).reverse();
const PROGRESS = {   // a child a few days in: one lesson done with 3 stars, the next one started
  name: 'Yusuf', stars: { [LESSON]: 3 }, step: { 'ar1-u02': 2 }, words: {},
  time: Object.fromEntries(days.map(d => [d, 900])), days, last: 'ar1-u02',
};

const SHOTS: { name: string; go: (p: Page) => Promise<void> }[] = [
  { name: 'map', go: async p => { await p.goto(`${APP}/`); await p.getByText('Hi, Teacher Yusuf!').waitFor(); } },
  { name: 'lesson', go: async p => { await p.goto(`${APP}/lesson/${LESSON}`); await p.getByLabel(/^Step 1:/).waitFor(); } },
  { name: 'words', go: async p => { await p.goto(`${APP}/lesson/${LESSON}/${step('words')}`); await p.getByText('New words').waitFor(); } },
  { name: 'listen', go: async p => { await p.goto(`${APP}/lesson/${LESSON}/${step('listen')}`); await p.getByText(/Which one is it/).waitFor(); } },
  { name: 'talk', go: async p => {
    await p.goto(`${APP}/lesson/${LESSON}/${step('talk')}`); await p.getByText('Pick the best answer for Koko:').waitFor();
    const ex = L.talk![0]!; const a = L.dialogue!.find(d => d.id === ex.answer)!;
    await p.getByRole('button', { name: a.en, exact: true }).click(); await p.getByText('Now say it out loud — be the teacher!').waitFor();
  } },
  { name: 'reward', go: async p => { await p.goto(`${APP}/win/${LESSON}`); await p.getByText('LESSON COMPLETE').waitFor(); await p.waitForTimeout(450); } },
  { name: 'parents', go: async p => { await p.goto(`${APP}/parents`); await p.getByText('DHM Institute', { exact: true }).waitFor(); } },
];

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const d of DEVICES) {
  const ctx = await browser.newContext({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: d.scale, isMobile: d.mobile, hasTouch: true });
  await ctx.addInitScript(p => { if (!localStorage.getItem('koko-quest-v2')) localStorage.setItem('koko-quest-v2', p); }, JSON.stringify(PROGRESS));
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  mkdirSync(`${OUT}screenshots/${d.dir}`, { recursive: true });
  for (const [i, s] of SHOTS.entries()) {
    await s.go(page);
    await page.waitForTimeout(700);   // images and fonts settle
    await page.screenshot({ path: `${OUT}screenshots/${d.dir}/${String(i + 1).padStart(2, '0')}-${s.name}.png` });
  }
  await ctx.close();
}

// Google Play feature graphic, 1024 × 500: Koko, the app's name and the store name, in the app's colours and font.
const font = (f: string) => `data:font/ttf;base64,${readFileSync(`${ROOT}app/node_modules/@expo-google-fonts/baloo-2/${f}`).toString('base64')}`;
const koko = `data:image/png;base64,${readFileSync(`${ROOT}app/assets/koko-wave.png`).toString('base64')}`;
const ctx = await browser.newContext({ viewport: { width: 1024, height: 500 } });
const page = await ctx.newPage();
await page.setContent(`<style>
  @font-face{font-family:B;font-weight:800;src:url(${font('800ExtraBold/Baloo2_800ExtraBold.ttf')})}
  @font-face{font-family:B;font-weight:600;src:url(${font('600SemiBold/Baloo2_600SemiBold.ttf')})}
  body{margin:0;width:1024px;height:500px;background:radial-gradient(circle at 78% 40%,#1E6BFF,#0B4FD8 60%);display:flex;align-items:center;font-family:B;color:#fff;overflow:hidden}
  .t{padding-left:72px;flex:1}.t h1{font-size:120px;font-weight:800;margin:0;line-height:1}.t p{font-size:44px;font-weight:600;margin:6px 0 0;color:#FFC629;line-height:1.1}
  .t small{display:block;margin-top:22px;font-size:24px;font-weight:600;opacity:.85}
  img{width:360px;height:360px;border-radius:48px;margin-right:72px;box-shadow:0 18px 40px rgba(0,0,0,.25)}
</style><div class="t"><h1>Koko</h1><p>Arabic &amp; Quran<br>for Kids</p><small>by DHM Institute</small></div><img src="${koko}">`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: `${OUT}feature-graphic.png` });
await browser.close();
console.log(`written to ${OUT}`);
