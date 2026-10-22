// Which files a lesson makes the app load. A line-by-line port of the path rules in app.js (docs/AUDIT.md §6),
// so the export validator checks exactly what children's devices will request.
import type { Lesson, Word } from './schema.ts';

/** app.js `bare()`: Arabic letters only (tashkeel U+064B–U+0652, U+0670 and tatweel U+0640 removed). */
export const bare = (s: string | undefined): string =>
  String(s ?? '').replace(/[ً-ْٰـ]/g, '').replace(/[^ء-ي]/g, '');

export const wordAudio = (lessonId: string, w: Pick<Word, 'id' | 'from'>): string =>
  `audio/${w.from || lessonId}/w-${w.id}-ar.mp3`;

export const lessonAudio = (lessonId: string, name: string): string => `audio/${lessonId}/${name}.mp3`;

export type FileRef = { path: string; why: string };

/** Every file the lesson can play or show, with the reason (for readable validation errors). */
export function referencedFiles(L: Lesson): FileRef[] {
  const out: FileRef[] = [];
  const add = (path: string, why: string) => out.push({ path, why });
  const words = L.words ?? [];

  if (L.video) {
    add(L.video.src, 'video');
    if (L.video.poster) add(L.video.poster, 'video poster');
  }
  for (const w of words) add(wordAudio(L.id, w), `word "${w.id}"`);
  for (const d of L.dialogue ?? []) add(lessonAudio(L.id, `d-${d.id}-ar`), `dialogue line ${d.id}`);
  L.sounds?.pairs.forEach((pair, i) =>
    pair.forEach((_, j) => add(lessonAudio(L.id, `s-${i + 1}-${j}-ar`), `sounds pair ${i + 1}, letter ${j + 1}`)));
  if (L.move) add(lessonAudio(L.id, 'x-move-ar'), 'move');
  (L.learn ?? []).forEach((c, i) => {
    const clip = learnCardClip(L, i);
    if (clip) add(clip, `Learn card ${i + 1}`);
  });
  if (L.parents?.tryAudio) add(lessonAudio(L.id, L.parents.tryAudio), 'parents "try this"');
  for (const it of L.order?.items ?? []) add(wordAudio(L.id, it), `order item "${it.id}"`);
  return out;
}

/**
 * app.js `learn()`: a card's Arabic plays the clip of the lesson word with the same letters, else the card's own `aud`.
 * Returns null when the card has no Arabic or no clip (the app then reads only the English).
 */
export function learnCardClip(L: Lesson, index: number): string | null {
  const c = L.learn?.[index];
  if (!c) return null;
  const same = c.ar ? (L.words ?? []).find(w => bare(w.ar) === bare(c.ar)) : undefined;
  if (same) return wordAudio(L.id, same);
  return c.aud ? lessonAudio(L.id, c.aud) : null;
}

/** The steps the app shows for a lesson, in order (app.js `stepsFor()`). Used by the admin preview. */
export function stepsFor(L: Lesson): string[] {
  const s: string[] = [];
  if (L.video) s.push('story');
  if (L.learn?.length) s.push('learn');
  if (L.words?.length) s.push('words');
  if (L.sounds) s.push('sounds');
  for (const g of L.games ?? []) {
    if (g === 'listen') s.push('listen');
    if (g === 'match') s.push('match');
    if (g === 'order' && L.order) s.push('order');
  }
  if (L.talk?.length) s.push('talk');
  if (L.quiz?.length) s.push('quiz');
  if (L.move) s.push('move');
  if (L.think) s.push('think');
  return s;
}
