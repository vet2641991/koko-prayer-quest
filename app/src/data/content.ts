// Content, read from the static export (catalog.json, one JSON per lesson, promos.json). The lesson JSON is shown
// exactly as published: Arabic, tashkeel and translations are never changed by the app.
import { LessonSchema, type Lesson } from '../../../packages/shared/src/schema.ts';
import { referencedFiles } from '../../../packages/shared/src/audio.ts';
import { mediaUri, readText, saveMedia } from './store';

export type Unit = { id: string; n: string; ar: string; en: string; file?: string; go?: string; premium?: boolean };
export type World = { id: string; code?: string; en: string; ar: string; tint: string; ink: string; units: Unit[] };
export type Catalog = { worlds: World[]; focus?: string; start?: string; focusNew?: string; teacherNote?: { text?: string } };
export type Promo = { id: string; text: string; url: string; placement: 'after_lesson' | 'map' | 'parents'; sort: number };

let catalog: Catalog | null = null;
const lessons = new Map<string, Lesson>();

export async function getCatalog(force = false): Promise<Catalog> {
  if (catalog && !force) return catalog;
  const text = await readText('content/catalog.json');
  if (!text) throw new Error('The lessons could not be loaded. Check the internet connection and try again.');
  catalog = JSON.parse(text) as Catalog;
  return catalog;
}

export function unitById(cat: Catalog, id: string): { world: World; unit: Unit } | null {
  for (const w of cat.worlds) for (const u of w.units) if (u.id === id) return { world: w, unit: u };
  return null;
}

export async function getLesson(id: string): Promise<Lesson | null> {
  if (lessons.has(id)) return lessons.get(id)!;
  const cat = await getCatalog();
  const u = unitById(cat, id)?.unit;
  if (!u?.file) return null;
  const text = await readText(u.file);
  if (!text) return null;
  const parsed = LessonSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`Lesson ${id} could not be read.`);
  lessons.set(id, parsed.data);
  void saveMedia(lessonFiles(parsed.data));   // offline copy of its audio and poster, in the background
  return parsed.data;
}

/** Audio and the poster (videos are saved when the story is opened: they are large). */
export const lessonFiles = (L: Lesson) => referencedFiles(L).map(f => f.path).filter(p => !p.endsWith('.mp4'));

export async function getPromos(): Promise<Promo[]> {
  try {
    const text = await readText('content/promos.json', 5000);
    if (!text) return [];
    const doc = JSON.parse(text) as { promos?: Promo[] };
    return (doc.promos ?? []).filter(p => /^https:\/\/(www\.)?dhm-institute\.com(\/\S*)?$/.test(p.url));
  } catch { return []; }
}

export { mediaUri, saveMedia };
