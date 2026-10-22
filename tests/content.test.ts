// Tests that run on the real content in this repo: the shared validator, the JSON writer's zero-diff promise,
// and the validator catching the mistakes it exists for.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatContentFile, formatReport, orderLike, sameJson, validateContent, validateLesson } from '../packages/shared/src/index.ts';
import { readContentTree } from '../scripts/lib/content.ts';

const tree = readContentTree(process.cwd());

test('today\'s content passes validation with no errors', () => {
  const r = validateContent(tree);
  assert.equal(r.errors.length, 0, formatReport(r));
});

// Simulates what jsonb does to a document: same content, keys in a different order at every level.
const scramble = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(scramble);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, scramble(x)]));
  return v;
};

test('writing every content file back from scrambled (database) key order is a zero diff', () => {
  const files = [['content/catalog.json', tree.catalogText] as const, ...tree.texts];
  for (const [path, text] of files) {
    const doc = scramble(JSON.parse(text));
    assert.equal(formatContentFile(doc, text), text, `${path} would change`);
  }
});

test('the key order of the file on disk is kept even for changed content', () => {
  for (const [path, text] of tree.texts) {
    const parsed = JSON.parse(text);
    // a changed document: rebuilding from the scrambled order must give the original order back exactly
    const rebuilt = JSON.stringify(orderLike(scramble(parsed), parsed), null, 2);
    assert.equal(rebuilt, JSON.stringify(parsed, null, 2), `${path}: key order not restored`);
  }
  const text = tree.texts.get('content/ar1/u01.json')!;
  const doc = JSON.parse(text);
  doc.topic = doc.topic + ' (edited)';
  const out = formatContentFile(scramble(doc), text);
  const changed = out.split('\n').filter((line, i) => line !== text.split('\n')[i]);
  assert.equal(changed.length, 1, 'only the edited line changes');
  assert.match(changed[0]!, /\(edited\)/);
});

test('Arabic is written unescaped and byte for byte', () => {
  const text = tree.texts.get('content/prayer/l05.json')!;
  const out = formatContentFile(scramble(JSON.parse(text)), null);
  assert.ok(out.includes('رَبِّ اغْفِرْ لِي'));
  assert.ok(!/\\u06/.test(out));
  assert.ok(sameJson(JSON.parse(out), JSON.parse(text)));
});

test('the validator catches the mistakes that must never reach children', () => {
  const lesson = structuredClone(tree.lessons.get('content/isl1/l01.json')) as Record<string, any>;
  lesson.quiz[0].opts[0][2] = 1;
  lesson.quiz[0].opts[1][2] = 1;
  assert.match(formatReport(validateLesson(lesson)), /2 correct answers/);

  lesson.quiz[0].opts[0][2] = true;
  assert.ok(validateLesson(lesson).errors.length > 0, 'true instead of 1 is rejected');

  const withMissingAudio = new Map(tree.lessons);
  const ar = structuredClone(tree.lessons.get('content/ar1/u01.json')) as Record<string, any>;
  ar.words.push({ id: 'no-such-clip', ar: 'كَلِمَةٌ', en: 'word' });
  withMissingAudio.set('content/ar1/u01.json', ar);
  assert.match(formatReport(validateContent({ ...tree, lessons: withMissingAudio })), /no-such-clip-ar\.mp3 does not exist/);

  const cat = structuredClone(tree.catalog) as Record<string, any>;
  cat.worlds[0].units[1].id = cat.worlds[0].units[0].id;
  assert.match(formatReport(validateContent({ ...tree, catalog: cat })), /is used twice/);

  const cat2 = structuredClone(tree.catalog) as Record<string, any>;
  cat2.worlds[0].units[0].file = 'content/ar2/x01.json';
  assert.match(formatReport(validateContent({ ...tree, catalog: cat2 })), /file should be/);
});
