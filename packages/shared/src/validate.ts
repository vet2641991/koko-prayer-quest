// Content validation shared by the import (step 4), the export (step 5) and the admin editor (step 6).
// Errors block: nothing is imported or published while one exists (fail closed). Warnings are reported only.
import { z } from 'zod';
import { learnCardClip, referencedFiles } from './audio.ts';
import {
  CATALOG_KEYS, CatalogSchema, LESSON_KEYS, LessonSchema, PromosFileSchema, UNIT_KEYS, WORLD_KEYS, unknownKeys,
  type Catalog, type Lesson,
} from './schema.ts';

export type Issue = { where: string; message: string };
export type Report = { errors: Issue[]; warnings: Issue[] };

export type ContentInput = {
  catalog: unknown;                       // parsed content/catalog.json
  lessons: Map<string, unknown>;          // file path (content/<world>/<f>.json) -> parsed JSON
  promos?: unknown;                       // parsed content/promos.json, when present
  fileExists: (path: string) => boolean;  // audio/ and media/ files on disk (or in the export tree)
};

const zodIssues = (where: string, err: z.ZodError): Issue[] =>
  err.issues.map(i => ({ where: `${where}${i.path.length ? ' › ' + i.path.join('.') : ''}`, message: i.message }));

/** Checks one lesson on its own (shape and internal references). Used by the admin editor as you type. */
export function validateLesson(raw: unknown, where = 'lesson'): Report & { lesson?: Lesson } {
  const r: Report = { errors: [], warnings: [] };
  const parsed = LessonSchema.safeParse(raw);
  if (!parsed.success) return { ...r, errors: zodIssues(where, parsed.error) };
  const L = parsed.data;
  const err = (m: string) => r.errors.push({ where: `${where} (${L.id})`, message: m });
  const warn = (m: string) => r.warnings.push({ where: `${where} (${L.id})`, message: m });

  for (const k of unknownKeys(L, LESSON_KEYS)) warn(`unknown top-level key "${k}" (kept as is)`);

  const wordIds = (L.words ?? []).map(w => w.id);
  for (const d of dupes(wordIds)) err(`word id "${d}" is used twice`);

  const lineIds = new Set((L.dialogue ?? []).map(d => d.id));
  for (const d of dupes((L.dialogue ?? []).map(x => x.id))) err(`dialogue id "${d}" is used twice`);
  for (const d of L.dialogue ?? []) if (!L.speakers?.[d.who]) err(`dialogue ${d.id}: speaker "${d.who}" is not in speakers`);
  (L.talk ?? []).forEach((t, i) => {
    for (const ref of [t.ask, t.answer, ...t.wrong]) if (!lineIds.has(ref)) err(`talk ${i + 1}: "${ref}" is not a dialogue line`);
  });

  if (L.sounds) L.sounds.pairs.forEach((p, i) => {
    if (p.length !== L.sounds!.letters.length) err(`sounds pair ${i + 1} has ${p.length} words for ${L.sounds!.letters.length} letters`);
  });

  if (L.games?.includes('order') && !L.order) err('the "order" game is listed but there is no "order" data');
  if (L.order && !L.games?.includes('order')) warn('"order" data exists but the "order" game is not in "games" (it will not be shown)');
  if (L.order && !L.order.items) for (const i of L.order.ids) if (!wordIds.includes(i)) err(`order: "${i}" is not a word of this lesson`);
  if (L.order?.items && L.order.items.map(x => x.id).join() !== L.order.ids.join()) err('order: "items" and "ids" differ');
  if ((L.games?.includes('listen') || L.games?.includes('match')) && !(L.words?.length)) err('listen/match games need words');

  (L.quiz ?? []).forEach((q, i) => {
    const right = q.opts.filter(o => o[2] === 1).length;
    if (right !== 1) err(`quiz question ${i + 1} has ${right} correct answers (exactly one is needed)`);
  });

  (L.learn ?? []).forEach((c, i) => {
    if (c.ar && !learnCardClip(L, i)) warn(`Learn card ${i + 1} has Arabic but no clip (only the English will be read)`);
  });
  return { ...r, lesson: L };
}

/** Validates the whole content tree as the app will see it. */
export function validateContent(input: ContentInput): Report {
  const r: Report = { errors: [], warnings: [] };
  const cat = CatalogSchema.safeParse(input.catalog);
  if (!cat.success) return { errors: zodIssues('catalog.json', cat.error), warnings: [] };
  const C: Catalog = cat.data;
  for (const k of unknownKeys(C, CATALOG_KEYS)) r.warnings.push({ where: 'catalog.json', message: `unknown key "${k}" (kept as is)` });

  const worldIds = C.worlds.map(w => w.id);
  for (const d of dupes(worldIds)) r.errors.push({ where: 'catalog.json', message: `world id "${d}" is used twice` });
  const unitIds = C.worlds.flatMap(w => w.units.map(u => u.id));
  for (const d of dupes(unitIds)) r.errors.push({ where: 'catalog.json', message: `unit id "${d}" is used twice` });
  const units = new Map(C.worlds.flatMap(w => w.units.map(u => [u.id, { u, w }] as const)));

  for (const ref of [C.focus, C.focusNew]) if (ref && !worldIds.includes(ref)) r.errors.push({ where: 'catalog.json', message: `"${ref}" is not a world` });
  if (C.start && !units.has(C.start)) r.errors.push({ where: 'catalog.json', message: `start "${C.start}" is not a unit` });

  const lessonsById = new Map<string, Lesson>();
  for (const w of C.worlds) {
    for (const k of unknownKeys(w, WORLD_KEYS)) r.warnings.push({ where: `world ${w.id}`, message: `unknown key "${k}" (kept as is)` });
    for (const u of w.units) {
      const where = `unit ${u.id}`;
      for (const k of unknownKeys(u, UNIT_KEYS)) r.warnings.push({ where, message: `unknown key "${k}" (kept as is)` });
      if (!u.id.startsWith(w.id + '-')) r.errors.push({ where, message: `id does not start with its world "${w.id}-"` });
      if (u.go && !worldIds.includes(u.go)) r.errors.push({ where, message: `"go" points at unknown world "${u.go}"` });
      if (u.go && u.file) r.errors.push({ where, message: 'a unit cannot have both "go" and "file"' });
      if (!u.file) continue;
      const expected = `content/${w.id}/${u.id.slice(w.id.length + 1)}.json`;
      if (u.file !== expected) r.errors.push({ where, message: `file should be "${expected}", not "${u.file}"` });
      const raw = input.lessons.get(u.file);
      if (raw === undefined) { r.errors.push({ where, message: `file ${u.file} is missing` }); continue; }
      const v = validateLesson(raw, u.file);
      r.errors.push(...v.errors); r.warnings.push(...v.warnings);
      if (!v.lesson) continue;
      if (v.lesson.id !== u.id) r.errors.push({ where: u.file, message: `"id" is "${v.lesson.id}" but the unit is "${u.id}"` });
      if (v.lesson.world !== w.id) r.errors.push({ where: u.file, message: `"world" is "${v.lesson.world}" but the unit is in "${w.id}"` });
      lessonsById.set(v.lesson.id, v.lesson);
    }
  }
  for (const path of input.lessons.keys()) {
    if (![...units.values()].some(({ u }) => u.file === path)) r.warnings.push({ where: path, message: 'no unit points at this file (the app never loads it)' });
  }

  // cross-lesson references and files on disk
  for (const L of lessonsById.values()) {
    for (const w of L.words ?? []) {
      if (!w.from) continue;
      const home = lessonsById.get(w.from);
      const hw = home?.words?.find(x => x.id === w.id);
      if (!hw) r.errors.push({ where: L.id, message: `word "${w.id}" comes from ${w.from}, which has no such word` });
      else if (hw.ar !== w.ar) r.errors.push({ where: L.id, message: `word "${w.id}" differs from its home lesson ${w.from}` });
    }
    for (const f of referencedFiles(L)) {
      if (!input.fileExists(f.path)) r.errors.push({ where: L.id, message: `${f.why}: ${f.path} does not exist` });
    }
  }

  if (input.promos !== undefined) {
    const p = PromosFileSchema.safeParse(input.promos);
    if (!p.success) r.errors.push(...zodIssues('promos.json', p.error));
    else for (const d of dupes(p.data.promos.map(x => x.id))) r.errors.push({ where: 'promos.json', message: `promo id "${d}" is used twice` });
  }
  return r;
}

function dupes(xs: string[]): string[] {
  const seen = new Set<string>(), out = new Set<string>();
  for (const x of xs) (seen.has(x) ? out : seen).add(x);
  return [...out];
}

export const formatReport = (r: Report): string =>
  [...r.errors.map(i => `ERROR   ${i.where}: ${i.message}`), ...r.warnings.map(i => `warning ${i.where}: ${i.message}`)].join('\n');
