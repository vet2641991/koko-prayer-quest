// scripts/export-static.ts: writes what is PUBLISHED in Supabase to the static files GitHub Pages serves
// (Milestone 1, step 5).
//
//   npm run export               # write content/ (and copy approved uploads into media/)
//   npm run export -- --dry-run  # report what would change, write nothing
//
// It only ever reads `published_content`: drafts cannot reach the files. It fails closed. Nothing at all is written
// when any of these is true:
//   * the exported tree does not pass the shared validator (every referenced audio file exists, unit ids are unique,
//     every quiz question has exactly one correct answer, …);
//   * a file it would change or remove was changed in git since the last import (the local production session wrote
//     something the database has not seen: run "Sync to Supabase" first);
//   * an upload it needs cannot be downloaded.
// Files are written the way they are written today, key order included (packages/shared/src/json-format.ts), so
// exporting unchanged content is a zero diff.
// Exit 0: done (or nothing to do). Exit 1: nothing written, see the errors.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { formatContentFile, formatReport, validateContent } from '../packages/shared/src/index.ts';
import { connect } from './lib/db.ts';

const root = process.cwd();
const dryRun = process.argv.includes('--dry-run');
type J = Record<string, unknown>;
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

type Change = { path: string; action: 'write' | 'delete' | 'copy'; text?: string; bytes?: Buffer };

async function main() {
  const db = await connect(root, 'export-static');
  const errors: string[] = [];
  const changes: Change[] = [];
  try {
    await db.query('begin transaction isolation level repeatable read read only');   // one consistent snapshot
    const pub = (await db.query<{ kind: string; id: string; world_id: string | null; sort: number | null; document: J }>(
      'select kind, id, world_id, sort, document from public.published_content')).rows;
    const filePaths = new Map((await db.query<{ id: string; file_path: string }>('select id, file_path from public.units')).rows
      .map(r => [r.id, r.file_path]));
    const guard = new Map((await db.query<{ path: string; sha256: string }>('select path, sha256 from public.repo_files')).rows
      .map(r => [r.path, r.sha256]));
    const uploads = (await db.query<{ path: string; storage_object: string; sacred: boolean; approved_at: string | null; sha256: string | null }>(
      `select path, storage_object, sacred, approved_at, sha256 from public.media_assets where storage = 'supabase'`)).rows;
    await db.query('commit');

    // ---- assemble the documents ---------------------------------------------------------------------------------
    const of = (kind: string) => pub.filter(r => r.kind === kind);
    const lessons = new Map(of('lesson').map(r => [r.id, r.document]));
    const catalogRow = of('catalog')[0];
    if (!catalogRow) throw new Error('nothing is published yet (no catalog): run the import first');
    const byNumber = (a: { sort: number | null; id: string }, b: { sort: number | null; id: string }) =>
      (a.sort ?? 0) - (b.sort ?? 0) || a.id.localeCompare(b.id);
    const worlds = of('world').sort(byNumber).map(w => ({
      ...w.document,
      units: of('unit').filter(u => u.world_id === w.id).sort(byNumber)
        .map(u => (lessons.has(u.id) ? { ...u.document, file: filePaths.get(u.id) } : u.document)),
    }));
    const catalog = insertWorlds(catalogRow.document, worlds);

    const desired = new Map<string, unknown>([['content/catalog.json', catalog]]);
    const lessonFiles = new Map<string, unknown>();
    for (const [id, doc] of lessons) {
      const path = filePaths.get(id);
      if (!path) { errors.push(`lesson ${id} is published but has no unit`); continue; }
      desired.set(path, doc); lessonFiles.set(path, doc);
    }
    const promos = of('promo').sort((a, b) =>
      String(a.document.placement).localeCompare(String(b.document.placement)) || byNumber(a, b)).map(p => p.document);
    const promosPath = 'content/promos.json';
    if (promos.length || existsSync(join(root, promosPath))) desired.set(promosPath, { version: 1, promos });

    // ---- uploads the published content uses -------------------------------------------------------------------------
    const allText = JSON.stringify([...desired.values()]);
    const needed = uploads.filter(u => allText.includes(u.path));
    for (const u of needed) {
      if (u.sacred && !u.approved_at) { errors.push(`${u.path} is used by published content but is sacred and not approved`); continue; }
      if (existsSync(join(root, u.path))) { errors.push(`${u.path} already exists in the repo; an upload never replaces a repo file`); continue; }
      try {
        const bytes = await download(u.storage_object);
        if (u.sha256 && sha(bytes) !== u.sha256) { errors.push(`${u.path}: downloaded bytes do not match the recorded sha256`); continue; }
        changes.push({ path: u.path, action: 'copy', bytes });
      } catch (e) { errors.push(`${u.path}: ${e instanceof Error ? e.message : e}`); }
    }

    // ---- validate the tree exactly as the app will see it ---------------------------------------------------------
    const copied = new Set(changes.filter(c => c.action === 'copy').map(c => c.path));
    const report = validateContent({
      catalog, lessons: lessonFiles, promos: desired.get(promosPath),
      fileExists: p => copied.has(p) || (!p.includes('..') && existsSync(join(root, p))),
    });
    errors.push(...report.errors.map(i => `${i.where}: ${i.message}`));
    if (report.warnings.length) console.log(formatReport({ errors: [], warnings: report.warnings }));

    // ---- what changes on disk, and is it safe to change? ------------------------------------------------------------
    for (const [path, doc] of desired) {
      const existing = existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : null;
      const text = formatContentFile(doc, existing);
      if (text !== existing) changes.push({ path, action: 'write', text });
    }
    // a lesson file whose unit no longer has a published lesson (unpublished, archived) leaves the site
    const known = new Set(filePaths.values());
    for (const path of known) {
      if (!desired.has(path) && existsSync(join(root, path))) changes.push({ path, action: 'delete' });
    }
    for (const c of changes) {
      if (c.action === 'copy' || !existsSync(join(root, c.path))) continue;
      const onDisk = sha(readFileSync(join(root, c.path)));
      const last = guard.get(c.path);
      if (!last) errors.push(`${c.path} is in the repo but was never imported: run "Sync to Supabase" first`);
      else if (last !== onDisk) errors.push(`${c.path} changed in git since the last import: run "Sync to Supabase" first`);
    }
  } finally {
    await db.end();
  }

  const summary = [`## Content export${dryRun ? ' (dry run)' : ''}`, ''];
  if (errors.length) {
    summary.push(`**Nothing was written.** ${errors.length} problem(s):`, '', ...errors.map(e => `- ${e}`));
  } else if (!changes.length) {
    summary.push('Nothing to publish: the files already match what is published.');
  } else {
    summary.push(`${changes.length} file(s) ${dryRun ? 'would change' : 'changed'}:`, '', ...changes.map(c => `- ${c.action} \`${c.path}\``));
    if (!dryRun) for (const c of changes) {
      const abs = join(root, c.path);
      if (c.action === 'delete') { rmSync(abs); continue; }
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, c.action === 'copy' ? c.bytes! : c.text!);
    }
  }
  const text = summary.join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${!errors.length && changes.length > 0 && !dryRun}\n`);
  process.exit(errors.length ? 1 : 0);
}

/** catalog.json keeps "worlds" where it is today (between "focus" and "start"). */
function insertWorlds(catalogDoc: J, worlds: unknown[]): J {
  const out: J = {};
  let placed = false;
  for (const [k, v] of Object.entries(catalogDoc)) {
    if (k === 'start' && !placed) { out.worlds = worlds; placed = true; }
    out[k] = v;
  }
  if (!placed) out.worlds = worlds;
  return out;
}

/** Downloads an admin upload from Supabase Storage (storage_object = "<bucket>/<object path>"). */
async function download(storageObject: string): Promise<Buffer> {
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are needed to copy uploads');
  const res = await fetch(`${base.replace(/\/$/, '')}/storage/v1/object/${storageObject.split('/').map(encodeURIComponent).join('/')}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

await main();
