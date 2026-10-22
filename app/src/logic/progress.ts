// Saved progress, the same shape and rules as the PWA (app.js), so behaviour matches:
// stars per unit, the step to resume, per-word right/wrong counts, learning time per day and the streak.
// Everything stays on the device (privacy policy).
export type WordStat = { seen: number; right: number; wrong: number };
export type Progress = {
  name?: string;
  stars: Record<string, number>;
  step: Record<string, number>;
  words: Record<string, WordStat>;
  time: Record<string, number>;
  days: string[];
  last: string | null;
};
export const STORAGE_KEY = 'koko-quest-v2';
export const emptyProgress = (): Progress => ({ stars: {}, step: {}, words: {}, time: {}, days: [], last: null });

export const today = (d = new Date()) => d.toISOString().slice(0, 10);

/** Progress key of a word: review lessons point words at their home lesson ("from"). */
export const wordKey = (lessonId: string, w: { id: string; from?: string }) => `${w.from || lessonId}|${w.id}`;

export function markWord(p: Progress, lessonId: string, w: { id: string; from?: string }, ok: boolean | null): Progress {
  const k = wordKey(lessonId, w), r = { ...(p.words[k] ?? { seen: 0, right: 0, wrong: 0 }) };
  if (ok === null) r.seen++; else if (ok) r.right++; else r.wrong++;
  return { ...p, words: { ...p.words, [k]: r } };
}

export function tick(p: Progress, seconds: number, now = new Date()): Progress {
  const d = today(now);
  return { ...p, time: { ...p.time, [d]: (p.time[d] ?? 0) + seconds }, days: p.days.includes(d) ? p.days : [...p.days, d] };
}

export function streak(p: Progress, now = new Date()): number {
  let n = 0;
  const d = new Date(now);
  for (;;) { if (!p.days.includes(today(d))) break; n++; d.setDate(d.getDate() - 1); }
  return n;
}

/** 3 stars for at most 1 mistake, 2 for at most 4, otherwise 1 (app.js win()). */
export const starsFor = (mistakes: number) => (mistakes <= 1 ? 3 : mistakes <= 4 ? 2 : 1);

export const totalStars = (p: Progress) => Object.values(p.stars).reduce((a, b) => a + b, 0);

/** Words Koko "forgot": more wrong than right answers. */
export const reviewList = (p: Progress) => Object.entries(p.words).filter(([, r]) => r.wrong > r.right).map(([k]) => k);

export const wordsLearned = (p: Progress) => Object.values(p.words).filter(r => r.seen || r.right).length;

type CatUnit = { id: string; file?: string; go?: string };
type CatWorld = { id: string; units: CatUnit[] };
type Cat = { worlds: CatWorld[]; focus?: string; start?: string; focusNew?: string };

/** The next unit to play (app.js nextUnit): focus world first, wrapping, the first ready unit without stars. */
export function nextUnit(cat: Cat, p: Progress): { world: CatWorld; unit: CatUnit } | null {
  const isH = /^\s*(haitham|هيثم)\s*$/i.test(p.name ?? '');
  const focus = isH ? cat.focus : (cat.focusNew || cat.focus), startId = isH ? cat.start : undefined;
  const order = [cat.worlds.find(w => w.id === focus), ...cat.worlds.filter(w => w.id !== focus)].filter(Boolean) as CatWorld[];
  for (const w of order) {
    const i = Math.max(0, w.units.findIndex(u => u.id === startId));
    for (const u of [...w.units.slice(i), ...w.units.slice(0, i)]) if (u.file && !((p.stars[u.id] ?? 0) > 0)) return { world: w, unit: u };
  }
  return null;
}

/** Carries over Haitham's first-version stars (app.js: localStorage 'haitham-quest-v1'). */
export function migrateLegacy(p: Progress, legacy: { stars?: Record<string, number> } | null): Progress {
  if (legacy?.stars?.['1'] && !p.stars['prayer-l01']) return { ...p, stars: { ...p.stars, 'prayer-l01': legacy.stars['1'] } };
  return p;
}

export function parseProgress(raw: string | null): Progress {
  try {
    const s = JSON.parse(raw ?? 'null');
    if (s && typeof s === 'object' && s.stars) return { ...emptyProgress(), ...s };
  } catch { /* corrupt: start fresh */ }
  return emptyProgress();
}
