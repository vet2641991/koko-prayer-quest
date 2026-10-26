// Integration tests for scripts/import-json.ts against a real Postgres (a fresh migrated database of its own, created
// next to DATABASE_URL). Skipped when DATABASE_URL is not set. Each scenario runs the import in a scratch copy of the
// repo so the real files are never touched.
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { editJson as edit, freshDatabase, runScript, scratchRepo, skipDb as skip } from './helpers.ts';

let work = '', url = '', db: pg.Client;
const RECUT = 'isl1-l13';   // its audio folder is copied (not linked) so a clip can be "re-cut"
const runImport = (...args: string[]) => runScript('import-json', work, url, ...args);
const editJson = (path: string, fn: (doc: any) => void) => edit(work, path, fn);
// counts derived from the repo, so a new level does not break the tests
const CAT = JSON.parse(readFileSync('content/catalog.json', 'utf8'));
const LESSONS: number = CAT.worlds.reduce((n: number, w: any) => n + w.units.filter((u: any) => u.file).length, 0);
const ENTITIES: number = 1 + CAT.worlds.length + CAT.worlds.reduce((n: number, w: any) => n + w.units.length, 0) + LESSONS;
const published = async (kind: string, id: string) =>
  (await db.query('select document from public.published_content where kind = $1 and id = $2', [kind, id])).rows[0]?.document;

before(async () => {
  if (skip) return;
  url = await freshDatabase('koko_t_import');
  work = scratchRepo([RECUT]);
  db = new pg.Client({ connectionString: url });
  await db.connect();
});
after(async () => {
  if (skip) return;
  await db.end();
  rmSync(work, { recursive: true, force: true });
});

test('first import loads everything and the round trip is identical', { skip }, async () => {
  const r = runImport();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, new RegExp('applied: [*][*]' + ENTITIES + '[*][*] entities'));
  assert.match(r.out, /round trip: identical/);
  const n = (await db.query(`select count(*)::int as n from public.published_content where kind = 'lesson'`)).rows[0].n;
  assert.equal(n, LESSONS);
  const media = (await db.query(`select count(*)::int as n, count(*) filter (where sha256 is null or bytes is null)::int as missing
                                 from public.media_assets`)).rows[0];
  assert.ok(media.n > 800);
  assert.equal(media.missing, 0, 'every file has sha256 and bytes');
  const sacred = (await db.query(`select count(*)::int as n from public.media_assets where sacred and approved_at is null`)).rows[0].n;
  assert.equal(sacred, 0, 'all sacred media of today is seeded as approved');
  const video = (await db.query(`select sacred, approved_by_name from public.media_assets where path = 'media/prayer-3.mp4'`)).rows[0];
  assert.deepEqual(video, { sacred: true, approved_by_name: 'Dr. Hassan Muslim' });
  const surahName = (await db.query(`select sacred from public.media_assets where path = 'audio/isl2-l17/c-0-ar.mp3'`)).rows[0];
  assert.equal(surahName.sacred, false, 'surah names are titles, not sacred');
});

test('a second import changes nothing (idempotent)', { skip }, async () => {
  const before = (await db.query('select count(*)::int as n from public.content_revisions')).rows[0].n;
  const r = runImport();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, new RegExp('applied: [*][*]0[*][*] entities.*unchanged: ' + ENTITIES));
  assert.equal((await db.query('select count(*)::int as n from public.content_revisions')).rows[0].n, before);
});

test('a lesson changed in the repo is imported and published', { skip }, async () => {
  editJson('content/ar1/u02.json', d => { d.topic = 'Changed by the local production session'; });
  const r = runImport();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /applied: \*\*1\*\* entities/);
  assert.equal((await published('lesson', 'ar1-u02')).topic, 'Changed by the local production session');
});

test('a change in the repo never overwrites an edit made in the dashboard', { skip }, async () => {
  await db.query(`update public.lessons set topic = 'Edited in the dashboard' where id = 'ar1-u03'`);
  editJson('content/ar1/u03.json', d => { d.topic = 'Changed in the repo'; });
  const r = runImport();
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /lesson ar1-u03: changed in the repo and edited in the dashboard/);
  const work = (await db.query(`select topic from public.lessons where id = 'ar1-u03'`)).rows[0].topic;
  assert.equal(work, 'Edited in the dashboard', 'the dashboard edit is kept');
  assert.notEqual((await published('lesson', 'ar1-u03')).topic, 'Changed in the repo', 'nothing was published over it');
});

test('a re-cut sacred clip loses its approval and is reported', { skip }, async () => {
  const clip = `audio/${RECUT}/c-3-ar.mp3`;
  writeFileSync(join(work, clip), Buffer.concat([readFileSync(join(work, clip)), Buffer.from([0])]));
  const r = runImport();
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /Approvals withdrawn because the file changed \(1\)/);
  const row = (await db.query('select approved_at, approval_note from public.media_assets where path = $1', [clip])).rows[0];
  assert.equal(row.approved_at, null);
  assert.match(row.approval_note, /Approval withdrawn/);
});

test('a lesson using unapproved sacred audio is not published', { skip }, async () => {
  editJson(`content/isl1/l13.json`, d => { d.topic = d.topic + ' (new wording)'; });
  const r = runImport();
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /uses sacred audio that is not approved yet: audio\/isl1-l13\/c-3-ar\.mp3/);
  assert.doesNotMatch((await published('lesson', 'isl1-l13')).topic, /new wording/);
});

test('invalid content is refused and the database is untouched', { skip }, async () => {
  const before = (await db.query('select count(*)::int as n from public.audit_log')).rows[0].n;
  editJson('content/isl1/l01.json', d => { d.quiz[0].opts.forEach((o: unknown[]) => { o[2] = 1; }); });
  const r = runImport();
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /correct answers \(exactly one is needed\)/);
  assert.equal((await db.query('select count(*)::int as n from public.audit_log')).rows[0].n, before);
});

test('the dashboard\'s copy of lesson_document() agrees with the database for every lesson', { skip }, async () => {
  const { rowToLessonDoc, sameJson } = await import('../packages/shared/src/index.ts');
  const rows = (await db.query(`select l.*, u.world_id, public.lesson_document(l) as doc from public.lessons l join public.units u using (id)`)).rows;
  assert.equal(rows.length, LESSONS);
  for (const r of rows) assert.ok(sameJson(rowToLessonDoc(r, r.world_id), r.doc), r.id);
});
