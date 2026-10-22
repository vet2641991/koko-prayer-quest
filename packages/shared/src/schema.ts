// The lesson content schema, written once and shared by the import/export scripts, the admin dashboard and the
// future Expo app. It describes exactly what the live PWA reads today (docs/AUDIT.md §4–§5).
//
// Objects are "loose": a key the schema doesn't know is kept, never dropped. The admin and the importer report it,
// and the database keeps it in the `extra` column, so content written by the local production session can never be lost.
import { z } from 'zod';

const text = z.string();
const nonEmpty = z.string().min(1);
const id = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, 'ids use a-z, 0-9, "_" and "-" only');
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

// ---------------------------------------------------------------------------------------------------------------
// catalog.json
// ---------------------------------------------------------------------------------------------------------------
export const UnitSchema = z.looseObject({
  id: z.string().regex(/^[a-z][a-z0-9]*-[a-z][a-z0-9]*$/),
  n: text,
  ar: nonEmpty,
  en: nonEmpty,
  file: z.string().regex(/^content\/[a-z][a-z0-9]*\/[a-z0-9]+\.json$/).optional(),
  go: z.string().optional(),
});

export const WorldSchema = z.looseObject({
  id: z.string().regex(/^[a-z][a-z0-9]*$/),
  code: z.string().optional(),   // DHM display code, e.g. "ARkid A1" (absent today)
  en: nonEmpty,
  ar: nonEmpty,
  tint: hex,
  ink: hex,
  units: z.array(UnitSchema),
});

export const CatalogSchema = z.looseObject({
  version: z.number().int().optional(),
  note: text.optional(),
  focus: text.optional(),
  worlds: z.array(WorldSchema),
  start: text.optional(),
  focusNew: text.optional(),
  teacherNote: z.looseObject({ text: text.optional() }).optional(),
});

// ---------------------------------------------------------------------------------------------------------------
// content/<world>/<file>.json
// ---------------------------------------------------------------------------------------------------------------
export const WordSchema = z.looseObject({
  id,
  ar: nonEmpty,
  en: text,
  tr: text.optional(),
  badge: text.optional(),
  from: text.optional(),     // the lesson that owns this word and its audio (review lessons)
  sacred: z.boolean().optional(),
});

export const LearnCardSchema = z.looseObject({
  title: text,
  en: text,
  ar: text.optional(),
  tr: text.optional(),
  aud: z.string().regex(/^c-\d+-ar$/).optional(),
  koko: text.optional(),
});

export const SoundsSchema = z.looseObject({
  letters: z.array(z.looseObject({ ch: nonEmpty, name: text, tip: text })).min(2),
  pairs: z.array(z.array(nonEmpty)),
  prompt: text.optional(),
  sub: text.optional(),
});

export const OrderSchema = z.looseObject({
  en: text,
  ids: z.array(id),
  items: z.array(z.looseObject({ id, ar: nonEmpty, en: text, from: text.optional() })).optional(),
});

export const DialogueLineSchema = z.looseObject({ id: z.string().regex(/^d\d+$/), who: id, ar: nonEmpty, en: text });
export const SpeakerSchema = z.looseObject({ en: text, ar: text, playedBy: z.enum(['koko', 'haitham']) });
export const TalkSchema = z.looseObject({ ask: text, answer: text, wrong: z.array(text) });

// opts are [arabic or "", english, 1 = correct / 0 = wrong]. The 0/1 are integers, not booleans (AUDIT §5.2).
export const QuizOptionSchema = z.tuple([text, text, z.union([z.literal(0), z.literal(1)])]);
export const QuizSchema = z.looseObject({
  en: text,
  ar: text.optional(),
  opts: z.array(QuizOptionSchema).min(2),
  keep: z.boolean().optional(),
});

export const GAMES = ['listen', 'match', 'order'] as const;

export const LessonSchema = z.looseObject({
  id: z.string().regex(/^[a-z][a-z0-9]*-[a-z][a-z0-9]*$/),
  world: text,
  unit: z.number().int().positive().optional(),
  source: text.optional(),
  title: z.looseObject({ ar: nonEmpty, en: nonEmpty }),
  topic: text.optional(),
  minutes: z.number().int().min(1).max(120).optional(),
  note: text.optional(),
  video: z.looseObject({ src: z.string().regex(/^media\//), poster: z.string().regex(/^media\//).optional() }).optional(),
  learn: z.array(LearnCardSchema).optional(),
  words: z.array(WordSchema).optional(),
  sounds: SoundsSchema.optional(),
  games: z.array(z.enum(GAMES)).optional(),
  order: OrderSchema.optional(),
  dialogue: z.array(DialogueLineSchema).optional(),
  speakers: z.record(id, SpeakerSchema).optional(),
  talk: z.array(TalkSchema).optional(),
  quiz: z.array(QuizSchema).optional(),
  move: z.looseObject({ ar: nonEmpty, en: text }).optional(),
  think: z.looseObject({ q: text, a: text.optional() }).optional(),
  parents: z.looseObject({
    summary: text,
    tip: text.optional(),
    try: z.looseObject({ ar: text, translit: text, en: text }).optional(),
    tryAudio: z.string().regex(/^[wd]-[A-Za-z0-9_-]+-ar$/).optional(),
  }).optional(),
});

// Promos for parents (DHM Institute). Exported to content/promos.json; links open only behind a parental gate.
export const PROMO_PLACEMENTS = ['after_lesson', 'map', 'parents'] as const;
export const PromoSchema = z.looseObject({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  text: nonEmpty,
  url: z.string().regex(/^https:\/\/(www\.)?dhm-institute\.com(\/\S*)?$/, 'promo links must be https://dhm-institute.com'),
  placement: z.enum(PROMO_PLACEMENTS),
  sort: z.number().int(),
});
export const PromosFileSchema = z.looseObject({ version: z.literal(1), promos: z.array(PromoSchema) });

export type Catalog = z.infer<typeof CatalogSchema>;
export type World = z.infer<typeof WorldSchema>;
export type Unit = z.infer<typeof UnitSchema>;
export type Lesson = z.infer<typeof LessonSchema>;
export type Word = z.infer<typeof WordSchema>;
export type LearnCard = z.infer<typeof LearnCardSchema>;
export type Quiz = z.infer<typeof QuizSchema>;
export type Promo = z.infer<typeof PromoSchema>;

// Top-level lesson keys the schema (and the database columns) know, in the order a new file is written.
export const LESSON_KEYS = ['id', 'world', 'unit', 'source', 'title', 'topic', 'minutes', 'note', 'video', 'learn',
  'words', 'sounds', 'dialogue', 'speakers', 'talk', 'games', 'order', 'quiz', 'move', 'think', 'parents'] as const;
export const WORLD_KEYS = ['id', 'code', 'en', 'ar', 'tint', 'ink', 'units'] as const;
export const UNIT_KEYS = ['id', 'n', 'ar', 'en', 'file', 'go'] as const;
export const CATALOG_KEYS = ['version', 'note', 'focus', 'worlds', 'start', 'focusNew', 'teacherNote'] as const;

/** Keys of an object that the schema does not know (kept, but worth a warning). */
export function unknownKeys(obj: Record<string, unknown>, known: readonly string[]): string[] {
  return Object.keys(obj).filter(k => !known.includes(k));
}
