// JSON file ⇄ database row. The reverse direction (row → JSON) is done by the SQL functions lesson_document(),
// unit_document(), world_document() and catalog_document(), so there is one builder of what children get.
// Unknown keys go to `extra` and come back unchanged.
import type { Catalog, Lesson, Unit, World } from './schema.ts';

type J = Record<string, unknown>;
const pick = (o: J, k: string) => (o[k] === undefined ? null : o[k]);
const rest = (o: J, known: readonly string[]) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !known.includes(k)));

export type WorldRow = { id: string; display_code: string | null; en: string; ar: string; tint: string; ink: string; sort: number; extra: J };
export type UnitRow = { id: string; world_id: string; n: string; ar: string; en: string; go_world_id: string | null; sort: number; extra: J };
export type CatalogRow = { version: number; note: string | null; focus: string | null; start: string | null; focus_new: string | null; teacher_note: unknown; extra: J };
export type LessonRow = {
  id: string; unit_no: number | null; source: string | null; title_ar: string; title_en: string; topic: string | null;
  minutes: number | null; note: string | null; video: unknown; learn: unknown; words: unknown; sounds: unknown; games: unknown;
  order_game: unknown; dialogue: unknown; speakers: unknown; talk: unknown; quiz: unknown; move: unknown; think: unknown;
  parents: unknown; extra: J;
};

/** Sort keys are spaced by 10 so an admin can slot a new unit between two existing ones without renumbering. */
export const sortKey = (index: number) => (index + 1) * 10;

export function worldToRow(w: World, index: number): WorldRow {
  const o = w as J;
  return {
    id: w.id, display_code: (pick(o, 'code') as string | null), en: w.en, ar: w.ar, tint: w.tint, ink: w.ink,
    sort: sortKey(index), extra: rest(o, ['id', 'code', 'en', 'ar', 'tint', 'ink', 'units']),
  };
}

export function unitToRow(u: Unit, worldId: string, index: number): UnitRow {
  const o = u as J;
  return {
    id: u.id, world_id: worldId, n: u.n, ar: u.ar, en: u.en, go_world_id: (pick(o, 'go') as string | null),
    sort: sortKey(index), extra: rest(o, ['id', 'n', 'ar', 'en', 'file', 'go']),
  };
}

export function catalogToRow(c: Catalog): CatalogRow {
  const o = c as J;
  return {
    version: (o.version as number | undefined) ?? 1, note: pick(o, 'note') as string | null, focus: pick(o, 'focus') as string | null,
    start: pick(o, 'start') as string | null, focus_new: pick(o, 'focusNew') as string | null, teacher_note: pick(o, 'teacherNote'),
    extra: rest(o, ['version', 'note', 'focus', 'worlds', 'start', 'focusNew', 'teacherNote']),
  };
}

export function lessonToRow(L: Lesson): LessonRow {
  const o = L as J;
  return {
    id: L.id, unit_no: pick(o, 'unit') as number | null, source: pick(o, 'source') as string | null,
    title_ar: L.title.ar, title_en: L.title.en, topic: pick(o, 'topic') as string | null,
    minutes: pick(o, 'minutes') as number | null, note: pick(o, 'note') as string | null,
    video: pick(o, 'video'), learn: pick(o, 'learn'), words: pick(o, 'words'), sounds: pick(o, 'sounds'),
    games: pick(o, 'games'), order_game: pick(o, 'order'), dialogue: pick(o, 'dialogue'), speakers: pick(o, 'speakers'),
    talk: pick(o, 'talk'), quiz: pick(o, 'quiz'), move: pick(o, 'move'), think: pick(o, 'think'), parents: pick(o, 'parents'),
    extra: rest(o, ['id', 'world', 'unit', 'source', 'title', 'topic', 'minutes', 'note', 'video', 'learn', 'words', 'sounds',
      'games', 'order', 'dialogue', 'speakers', 'talk', 'quiz', 'move', 'think', 'parents']),
  };
}

/** Lesson JSON as the database will rebuild it (title split into two columns keeps only ar/en). */
export const LESSON_ROW_JSON_COLUMNS = ['video', 'learn', 'words', 'sounds', 'games', 'order_game', 'dialogue', 'speakers',
  'talk', 'quiz', 'move', 'think', 'parents', 'extra'] as const;

const stripNulls = (o: J): J => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));

/** Mirror of SQL lesson_document(): the lesson JSON a working-copy row will publish as. */
export function rowToLessonDoc(r: LessonRow, worldId: string): J {
  return {
    ...stripNulls({
      id: r.id, world: worldId, unit: r.unit_no, source: r.source, title: { ar: r.title_ar, en: r.title_en }, topic: r.topic,
      minutes: r.minutes, note: r.note, video: r.video, learn: r.learn, words: r.words, sounds: r.sounds, games: r.games,
      order: r.order_game, dialogue: r.dialogue, speakers: r.speakers, talk: r.talk, quiz: r.quiz, move: r.move, think: r.think,
      parents: r.parents,
    }),
    ...(r.extra ?? {}),
  };
}

/** Mirror of SQL world_document() and unit_document(). */
export const rowToWorldDoc = (r: WorldRow): J =>
  ({ ...stripNulls({ id: r.id, code: r.display_code, en: r.en, ar: r.ar, tint: r.tint, ink: r.ink }), ...(r.extra ?? {}) });
export const rowToUnitDoc = (r: UnitRow): J =>
  ({ ...stripNulls({ id: r.id, n: r.n, ar: r.ar, en: r.en, go: r.go_world_id }), ...(r.extra ?? {}) });
