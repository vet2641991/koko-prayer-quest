// Integration tests for scripts/export-static.ts (and the import seeing the export come back), against a fresh migrated
// database of its own. Skipped when DATABASE_URL is not set. Everything happens in a scratch copy of the repo.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { freshDatabase, repo, runScript, scratchRepo, skipDb as skip } from './helpers.ts';

let work = '', url = '', db: pg.Client;
const exportFiles = (...a: string[]) => runScript('export-static', work, url, ...a);
const importFiles = (...a: string[]) => runScript('import-json', work, url, ...a);
const read = (p: string) => readFileSync(join(work, p), 'utf8');
// a job connection (no JWT): what the dashboard does as a reviewer goes through the same functions
const asJob = (sql: string, params: unknown[] = []) => db.query(sql, params);

/** Lines that differ between two versions of a file (the files are pretty-printed, one value per line). */
const diffLines = (a: string, b: string) => {
  const x = a.split('\n'), y = b.split('\n');
  return y.filter((line, i) => line !== x[i]).length + Math.max(0, x.length - y.length);
};

before(async () => {
  if (skip) return;
  url = await freshDatabase('koko_t_export');
  work = scratchRepo();
  db = new pg.Client({ connectionString: url });
  await db.connect();
  const r = importFiles();
  assert.equal(r.code, 0, r.out);
});
after(async () => {
  if (skip) return;
  await db.end();
  rmSync(work, { recursive: true, force: true });
});

test('exporting today\'s content changes nothing: zero diff on every file', { skip }, () => {
  const r = exportFiles();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Nothing to publish/);
  const diff = execFileSync('diff', ['-r', join(repo, 'content'), join(work, 'content')], { encoding: 'utf8' });
  assert.equal(diff, '');
});

test('a published edit is written to its file, in the original key order, and nothing else changes', { skip }, async () => {
  const before = read('content/isl1/l05.json'), catalogBefore = read('content/catalog.json');
  await asJob(`update public.lessons set topic = 'Angels: new wording' where id = 'isl1-l05'`);
  const r = exportFiles();
  assert.match(r.out, /Nothing to publish/, 'a draft edit is not exported');
  await asJob(`select public.publish_lesson('isl1-l05')`);
  const r2 = exportFiles();
  assert.equal(r2.code, 0, r2.out);
  assert.match(r2.out, /1 file\(s\) changed/);
  assert.equal(diffLines(before, read('content/isl1/l05.json')), 1, 'only the topic line changes');
  assert.equal(read('content/catalog.json'), catalogBefore);
  assert.equal(JSON.parse(read('content/isl1/l05.json')).topic, 'Angels: new wording');
});

test('when the export comes back through the import, later dashboard drafts are not a conflict', { skip }, async () => {
  await asJob(`update public.lessons set topic = 'A newer draft, not published' where id = 'isl1-l05'`);
  const r = importFiles();
  assert.equal(r.code, 0, r.out);
  const topic = (await asJob(`select topic from public.lessons where id = 'isl1-l05'`)).rows[0].topic;
  assert.equal(topic, 'A newer draft, not published', 'the draft is kept');
});

test('an unpublished lesson leaves the site and its unit becomes a "soon" box', { skip }, async () => {
  await asJob(`select public.unpublish_lesson('isl2-l30')`);
  const r = exportFiles();
  assert.equal(r.code, 0, r.out);
  assert.ok(!existsSync(join(work, 'content/isl2/l30.json')), 'the lesson file is removed');
  const unit = JSON.parse(read('content/catalog.json')).worlds.find((w: any) => w.id === 'isl2').units.find((u: any) => u.id === 'isl2-l30');
  assert.ok(unit, 'the unit is still on the map');
  assert.equal(unit.file, undefined, 'without a file: shown as "soon"');
  importFiles();   // bring the repo state back in line for the next tests
});

test('a file changed in git since the last import is never overwritten (nothing is written)', { skip }, async () => {
  const path = 'content/ar2/u04.json';
  const changed = read(path).replace('"minutes": 12', '"minutes": 11');
  writeFileSync(join(work, path), changed);
  await asJob(`update public.lessons set topic = topic || ' (edited)' where id = 'ar2-u04'`);
  await asJob(`select public.publish_lesson('ar2-u04')`);
  const catalogBefore = read('content/catalog.json');
  const r = exportFiles();
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /changed in git since the last import/);
  assert.equal(read(path), changed, 'the local change is kept');
  assert.equal(read('content/catalog.json'), catalogBefore);
});

test('content that fails validation is not exported at all (fail closed)', { skip }, async () => {
  await asJob(`update public.lessons set words = words || '[{"id": "no-clip-yet", "ar": "كَلِمَةٌ", "en": "word"}]'::jsonb where id = 'ar1-u05'`);
  await asJob(`select public.publish_lesson('ar1-u05')`);
  const before = read('content/ar1/u05.json');
  const r = exportFiles();
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /no-clip-yet-ar\.mp3 does not exist/);
  assert.equal(read('content/ar1/u05.json'), before);
});

test('a published promo is exported to content/promos.json', { skip }, async () => {
  // undo the two broken publications above so the tree is valid again
  writeFileSync(join(work, 'content/ar2/u04.json'), readFileSync(join(repo, 'content/ar2/u04.json')));
  await asJob(`update public.lessons set words = (select jsonb_agg(w) from jsonb_array_elements(words) w where w->>'id' <> 'no-clip-yet') where id = 'ar1-u05'`);
  await asJob(`select public.publish_lesson('ar1-u05')`);
  await asJob(`insert into public.promos (id, text_en, url, placement, sort) values
    ('trial-class', 'Book a free trial class with a certified DHM teacher', 'https://dhm-institute.com/trial-sessions/booking', 'parents', 1)`);
  await asJob(`select public.publish_promo('trial-class')`);
  const r = exportFiles();
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(JSON.parse(read('content/promos.json')), { version: 1, promos: [
    { id: 'trial-class', text: 'Book a free trial class with a certified DHM teacher',
      url: 'https://dhm-institute.com/trial-sessions/booking', placement: 'parents', sort: 1 }] });
  assert.ok(!/\n$/.test(read('content/promos.json')), 'written like the other content files');
});
