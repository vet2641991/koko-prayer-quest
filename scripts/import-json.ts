// scripts/import-json.ts: brings content/**, audio/** and media/** from the repo into Supabase (Milestone 1, step 4).
//
//   npm run import               # import and commit
//   npm run import -- --dry-run  # do everything, report, then roll back
//
// What it does, in ONE transaction (all or nothing):
//   1. Validates the content with the shared validator. Any error: nothing is touched (exit 1).
//   2. Upserts worlds, units, lessons and the catalog settings into the working tables. It is idempotent: an entity
//      whose repo version did not change since the last import is left alone. If an entity changed in the repo
//      AND was edited in the dashboard since the last import, that is a conflict: it is reported, never overwritten.
//   3. Records every file in audio/ and media/ in media_assets, with bytes and sha256. A sacred file whose bytes
//      changed loses its approval (database trigger). Sacred flags are seeded on first sight (docs/SCHEMA.md §4).
//   4. Publishes what it imported through the same publish_* functions the dashboard uses: the repo is live
//      already, so the published layer must match it.
//   5. Round-trip check: rebuilds catalog.json and every imported lesson from the database and compares them with
//      the files (identical apart from key order). Any difference rolls everything back (exit 1).
// Exit 0: done. Exit 1: nothing changed, see the errors. Exit 2: committed, but something needs a person
// (a conflict, or sacred audio waiting for approval in the dashboard).
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type pg from 'pg';
import {
  CatalogSchema, LessonSchema, catalogToRow, formatReport, lessonToRow, sameJson, unitToRow, validateContent, wordAudio,
  worldToRow, type Catalog, type Lesson,
} from '../packages/shared/src/index.ts';
import { listMediaFiles, readContentTree } from './lib/content.ts';
import { connect, inTransaction } from './lib/db.ts';

const ACTOR = 'import-json';
const root = process.cwd();
const dryRun = process.argv.includes('--dry-run');

type Kind = 'catalog' | 'world' | 'unit' | 'lesson';
type J = Record<string, unknown>;
type Entity = { kind: Kind; id: string; doc: J; sort: number | null; file: string };
const key = (k: Kind, id: string) => `${k}:${id}`;
// sort is part of what the repo says (array order), so it is compared and synced with the document
const withSort = (doc: J, sort: number | null): J => (sort === null ? doc : { ...doc, '@sort': sort });

type Outcome = {
  applied: string[]; unchanged: number; conflicts: string[]; needsApproval: string[]; pendingExport: string[];
  warnings: string[]; errors: string[]; media: { added: number; updated: number; approvalsWithdrawn: string[] };
};

function gitCommit(): string | null {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { return null; }
}
function gitDate(path: string): string | null {
  try { return execFileSync('git', ['log', '-1', '--format=%cI', '--', path], { cwd: root, encoding: 'utf8' }).trim() || null; } catch { return null; }
}

async function main() {
  const tree = readContentTree(root);
  const v = validateContent(tree);
  if (v.errors.length) {
    console.error(formatReport(v));
    console.error(`\n${v.errors.length} validation errors: nothing was imported.`);
    process.exit(1);
  }
  const catalog: Catalog = CatalogSchema.parse(tree.catalog);
  const lessons = new Map<string, Lesson>();
  for (const w of catalog.worlds) for (const u of w.units) if (u.file) lessons.set(u.id, LessonSchema.parse(tree.lessons.get(u.file)));

  // entities as the repo has them now
  const entities: Entity[] = [];
  const { worlds: _w, ...catalogDoc } = tree.catalog as J;
  entities.push({ kind: 'catalog', id: 'catalog', doc: catalogDoc, sort: null, file: 'content/catalog.json' });
  catalog.worlds.forEach((w, wi) => {
    const { units: _u, ...wdoc } = w as J;
    entities.push({ kind: 'world', id: w.id, doc: wdoc, sort: worldToRow(w, wi).sort, file: 'content/catalog.json' });
    w.units.forEach((u, ui) => {
      const { file: _f, ...udoc } = u as J;
      entities.push({ kind: 'unit', id: u.id, doc: udoc, sort: unitToRow(u, w.id, ui).sort, file: 'content/catalog.json' });
      if (u.file) entities.push({ kind: 'lesson', id: u.id, doc: tree.lessons.get(u.file) as J, sort: null, file: u.file });
    });
  });

  const client = await connect(root, ACTOR);
  const commit = gitCommit();
  const out: Outcome = { applied: [], unchanged: 0, conflicts: [], needsApproval: [], pendingExport: [], warnings: [], errors: [],
    media: { added: 0, updated: 0, approvalsWithdrawn: [] } };
  for (const w of v.warnings) out.warnings.push(`${w.where}: ${w.message}`);

  try {
    await inTransaction(client, ACTOR, () => run(client, tree.root, catalog, lessons, entities, commit, out), !dryRun);
  } catch (e) {
    out.errors.push(e instanceof Error ? e.message : String(e));
  } finally {
    await client.end();
  }
  report(out);
  process.exit(out.errors.length ? 1 : out.conflicts.length || out.needsApproval.length || out.media.approvalsWithdrawn.length ? 2 : 0);
}

async function run(db: pg.Client, rootDir: string, catalog: Catalog, lessons: Map<string, Lesson>, entities: Entity[],
                   commit: string | null, out: Outcome): Promise<void> {
  const q = <T extends pg.QueryResultRow = J>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);

  // ---- state in the database ---------------------------------------------------------------------------------
  const synced = new Map<string, J>();
  for (const r of (await q<{ kind: Kind; id: string; document: J }>('select kind, id, document from public.repo_sync')).rows) synced.set(key(r.kind, r.id), r.document);
  const working = new Map<string, { doc: J; status: string | null }>();
  for (const r of (await q<{ kind: Kind; id: string; doc: J; status: string | null }>(`
      select 'world' as kind, id, public.world_document(w) || jsonb_build_object('@sort', sort) as doc, status::text from public.worlds w
      union all select 'unit', id, public.unit_document(u) || jsonb_build_object('@sort', sort), status::text from public.units u
      union all select 'lesson', id, public.lesson_document(l), status::text from public.lessons l
      union all select 'catalog', 'catalog', public.catalog_document(c), null from public.catalog_settings c`)).rows) {
    working.set(key(r.kind, r.id), { doc: r.doc, status: r.status });
  }

  const livePublished = new Map<string, J>();
  for (const r of (await q<{ kind: Kind; id: string; document: J; sort: number | null }>(
    'select kind, id, document, sort from public.published_content')).rows) livePublished.set(key(r.kind, r.id), withSort(r.document, r.sort));

  // ---- decide, entity by entity ------------------------------------------------------------------------------
  const apply = new Set<string>(), syncOnly = new Set<string>();
  for (const e of entities) {
    const k = key(e.kind, e.id), repo = withSort(e.doc, e.sort), last = synced.get(k), work = working.get(k);
    if (last && sameJson(last, repo) && work) { out.unchanged++; continue; }
    // the export wrote what the dashboard published: the repo now matches the live version, so there is nothing to
    // apply, and later dashboard edits in the working copy stay untouched (they are not a conflict)
    const live = livePublished.get(k);
    if (work && live && sameJson(live, repo)) { syncOnly.add(k); continue; }
    if (work?.status === 'archived') { out.conflicts.push(`${e.kind} ${e.id}: archived in the dashboard but still in the repo`); continue; }
    if (!work || sameJson(work.doc, repo) || (last && sameJson(work.doc, last))) { apply.add(k); continue; }
    out.conflicts.push(`${e.kind} ${e.id}: changed in the repo and edited in the dashboard since the last import (left as it is in the dashboard)`);
  }
  for (const k of synced.keys()) if (!entities.some(e => key(e.kind, e.id) === k)) out.warnings.push(`${k} is no longer in the repo (left in the database; archive it in the dashboard if that is intended)`);

  // ---- working tables -------------------------------------------------------------------------------------------
  for (const [wi, w] of catalog.worlds.entries()) {
    if (apply.has(key('world', w.id))) {
      const r = worldToRow(w, wi);
      await q(`insert into public.worlds (id, display_code, en, ar, tint, ink, sort, extra) values ($1,$2,$3,$4,$5,$6,$7,$8)
               on conflict (id) do update set display_code = excluded.display_code, en = excluded.en, ar = excluded.ar,
                 tint = excluded.tint, ink = excluded.ink, sort = excluded.sort, extra = excluded.extra`,
        [r.id, r.display_code, r.en, r.ar, r.tint, r.ink, r.sort, r.extra]);
    }
  }
  for (const w of catalog.worlds) for (const [ui, u] of w.units.entries()) {
    if (!apply.has(key('unit', u.id))) continue;
    const r = unitToRow(u, w.id, ui);
    await q(`insert into public.units (id, world_id, n, ar, en, go_world_id, premium, sort, extra) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             on conflict (id) do update set n = excluded.n, ar = excluded.ar, en = excluded.en, go_world_id = excluded.go_world_id,
               premium = excluded.premium, sort = excluded.sort, extra = excluded.extra`,
      [r.id, r.world_id, r.n, r.ar, r.en, r.go_world_id, r.premium, r.sort, r.extra]);
  }
  const J = (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v));
  for (const L of lessons.values()) {
    if (!apply.has(key('lesson', L.id))) continue;
    const r = lessonToRow(L);
    await q(`insert into public.lessons (id, unit_no, source, title_ar, title_en, topic, minutes, note, video, learn, words, sounds,
               games, order_game, dialogue, speakers, talk, quiz, move, think, parents, extra)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,
               $17::jsonb,$18::jsonb,$19::jsonb,$20::jsonb,$21::jsonb,$22::jsonb)
             on conflict (id) do update set unit_no = excluded.unit_no, source = excluded.source, title_ar = excluded.title_ar,
               title_en = excluded.title_en, topic = excluded.topic, minutes = excluded.minutes, note = excluded.note,
               video = excluded.video, learn = excluded.learn, words = excluded.words, sounds = excluded.sounds, games = excluded.games,
               order_game = excluded.order_game, dialogue = excluded.dialogue, speakers = excluded.speakers, talk = excluded.talk,
               quiz = excluded.quiz, move = excluded.move, think = excluded.think, parents = excluded.parents, extra = excluded.extra`,
      [r.id, r.unit_no, r.source, r.title_ar, r.title_en, r.topic, r.minutes, r.note, J(r.video), J(r.learn), J(r.words), J(r.sounds),
       J(r.games), J(r.order_game), J(r.dialogue), J(r.speakers), J(r.talk), J(r.quiz), J(r.move), J(r.think), J(r.parents), J(r.extra)]);
  }
  if (apply.has(key('catalog', 'catalog'))) {
    const r = catalogToRow(catalog);
    await q(`insert into public.catalog_settings (id, version, note, focus, start, focus_new, teacher_note, extra)
             values (true,$1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)
             on conflict (id) do update set version = excluded.version, note = excluded.note, focus = excluded.focus,
               start = excluded.start, focus_new = excluded.focus_new, teacher_note = excluded.teacher_note, extra = excluded.extra`,
      [r.version, r.note, r.focus, r.start, r.focus_new, J(r.teacher_note), J(r.extra)]);
  }

  // ---- media_assets -------------------------------------------------------------------------------------------
  await importMedia(q, rootDir, lessons, out);

  // ---- publish what was imported (the repo is already live) ------------------------------------------------------
  const failed = new Set<string>();
  const sp = async (k: string, sql: string, params: unknown[]) => {
    await q('savepoint publish_one');
    try { await q(sql, params); await q('release savepoint publish_one'); }
    catch (e) {
      await q('rollback to savepoint publish_one');
      failed.add(k);
      const msg = e instanceof Error ? e.message : String(e);
      if (/sacred audio that is not approved/.test(msg)) out.needsApproval.push(msg);
      else out.errors.push(`publishing ${k}: ${msg}`);
    }
  };
  const note = `import ${commit?.slice(0, 7) ?? ''}`.trim();
  for (const e of entities) if (e.kind === 'world' && apply.has(key('world', e.id))) await sp(key('world', e.id), 'select public.publish_world($1, $2)', [e.id, note]);
  for (const e of entities) {
    if (e.kind !== 'unit') continue;
    const unitApplied = apply.has(key('unit', e.id)), lessonApplied = apply.has(key('lesson', e.id));
    if (lessonApplied) await sp(key('lesson', e.id), 'select public.publish_lesson($1, $2)', [e.id, note]);
    else if (unitApplied) await sp(key('unit', e.id), 'select public.publish_unit($1, $2)', [e.id, note]);
  }
  if (apply.has(key('catalog', 'catalog'))) await sp('catalog:catalog', 'select public.publish_catalog($1)', [note]);

  // ---- round-trip check: the database must give back exactly what the repo has -----------------------------------
  const published = new Map<string, J>();
  for (const r of (await q<{ kind: Kind; id: string; document: J; sort: number | null }>(
    'select kind, id, document, sort from public.published_content')).rows) published.set(key(r.kind, r.id), withSort(r.document, r.sort));
  for (const e of entities) {
    const k = key(e.kind, e.id), repo = withSort(e.doc, e.sort), pub = published.get(k);
    if (failed.has(k)) continue;
    if (apply.has(k)) {
      if (!pub || !sameJson(pub, repo)) out.errors.push(`round trip: ${k} published from the database differs from ${e.file}`);
    } else if (!out.conflicts.some(c => c.startsWith(`${e.kind} ${e.id}:`)) && (!pub || !sameJson(pub, repo))) {
      out.pendingExport.push(`${k}: the dashboard published a newer version that is not exported yet`);
    }
  }
  const assembled = await q<{ doc: J }>(`
    select (select document from public.published_content where kind = 'catalog') || jsonb_build_object('worlds', coalesce((
      select jsonb_agg(w.document || jsonb_build_object('units', coalesce((
        select jsonb_agg(u.document || case when l.id is not null then jsonb_build_object('file', x.file_path) else '{}'::jsonb end order by u.sort)
        from public.published_content u
        join public.units x on x.id = u.id
        left join public.published_content l on l.kind = 'lesson' and l.id = u.id
        where u.kind = 'unit' and u.world_id = w.id), '[]'::jsonb)) order by w.sort)
      from public.published_content w where w.kind = 'world'), '[]'::jsonb)) as doc`);
  const catalogMatches = sameJson(assembled.rows[0]?.doc, JSON.parse(readFileSync(join(rootDir, 'content/catalog.json'), 'utf8')));
  if (!catalogMatches && !out.conflicts.length && !out.pendingExport.length && !failed.size) {
    out.errors.push('round trip: catalog.json assembled from the database differs from the file');
  }
  if (out.errors.length) throw new Error(`${out.errors.length} error(s); everything was rolled back`);

  // ---- remember what the repo had, for the next import and for the export's overwrite guard -------------------------
  for (const e of entities) {
    const k = key(e.kind, e.id);
    if (!(apply.has(k) || syncOnly.has(k)) || failed.has(k)) continue;
    await q(`insert into public.repo_sync (kind, id, document, git_commit) values ($1, $2, $3::jsonb, $4)
             on conflict (kind, id) do update set document = excluded.document, git_commit = excluded.git_commit, imported_at = now()`,
      [e.kind, e.id, JSON.stringify(withSort(e.doc, e.sort)), commit]);
    out.applied.push(k);
  }
  const blocked = [...out.conflicts, ...out.needsApproval];
  const tree = readContentTree(rootDir);
  const files = new Map<string, string>([['content/catalog.json', tree.catalogText], ...tree.texts]);
  for (const [path, text] of files) {
    const ents = entities.filter(e => e.file === path);
    if (ents.some(e => failed.has(key(e.kind, e.id)) || blocked.some(b => b.startsWith(`${e.kind} ${e.id}:`)))) continue;
    await q(`insert into public.repo_files (path, sha256, git_commit) values ($1, encode(sha256(convert_to($2, 'UTF8')), 'hex'), $3)
             on conflict (path) do update set sha256 = excluded.sha256, git_commit = excluded.git_commit, imported_at = now()`,
      [path, text, commit]);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// media_assets
// ---------------------------------------------------------------------------------------------------------------
type Seed = { sacred: { approvedBy: string; approvedOn: string; approvalNote: string; clips?: { path: string }[]; files?: { path: string }[] };
              notSacred?: { clips: { path: string }[] } };

async function importMedia(q: <T extends pg.QueryResultRow = J>(sql: string, p?: unknown[]) => Promise<pg.QueryResult<T>>,
                           rootDir: string, lessons: Map<string, Lesson>, out: Outcome) {
  const seeds = ['sacred-learn-cards.json', 'sacred-videos.json']
    .map(f => JSON.parse(readFileSync(join(rootDir, 'supabase/seed', f), 'utf8')) as Seed);
  const seededSacred = new Map<string, Seed['sacred']>(), seededOrdinary = new Set<string>();
  for (const s of seeds) {
    for (const c of [...(s.sacred.clips ?? []), ...(s.sacred.files ?? [])]) seededSacred.set(c.path, s.sacred);
    for (const c of s.notSacred?.clips ?? []) seededOrdinary.add(c.path);
  }
  // clips of words marked "sacred": true, at the path the app plays them from
  const sacredWordClips = new Set<string>();
  const videoOwner = new Map<string, string>();
  for (const L of lessons.values()) {
    for (const w of L.words ?? []) if (w.sacred) sacredWordClips.add(wordAudio(L.id, w));
    if (L.video) { videoOwner.set(L.video.src, L.id); if (L.video.poster) videoOwner.set(L.video.poster, L.id); }
  }

  const existing = new Map<string, { sha256: string | null; bytes: number | null; sacred: boolean }>();
  const uploads = new Map<string, boolean>();   // path -> sacred
  for (const r of (await q<{ path: string; sha256: string | null; bytes: string | null; sacred: boolean; storage: string }>(
    `select path, sha256, bytes, sacred, storage from public.media_assets`)).rows) {
    if (r.storage === 'supabase') uploads.set(r.path, r.sacred);
    else existing.set(r.path, { sha256: r.sha256, bytes: r.bytes === null ? null : Number(r.bytes), sacred: r.sacred });
  }
  const firstImport = existing.size === 0 && uploads.size === 0;
  const files = listMediaFiles(rootDir);
  // a dashboard upload that the export copied into the repo is a repo file from now on (approval kept: same bytes)
  for (const f of files.filter(f => uploads.has(f.path))) {
    await q(`update public.media_assets set storage = 'static', storage_object = null, bytes = $2, sha256 = $3 where path = $1`,
      [f.path, f.bytes, f.sha256]);
    existing.set(f.path, { sha256: f.sha256, bytes: f.bytes, sacred: uploads.get(f.path)! });
  }
  const onDisk = new Set(files.map(f => f.path));
  const knownLessons = new Set((await q<{ id: string }>('select id from public.lessons')).rows.map(r => r.id));

  const rows: J[] = [];
  for (const f of files) {
    const prev = existing.get(f.path);
    const repoSaysSacred = sacredWordClips.has(f.path) || seededSacred.has(f.path);
    if (prev) {
      if (prev.sha256 !== f.sha256 || prev.bytes !== f.bytes) {
        await q('update public.media_assets set sha256 = $2, bytes = $3 where path = $1', [f.path, f.sha256, f.bytes]);
        out.media.updated++;
        if (prev.sacred && prev.sha256) out.media.approvalsWithdrawn.push(f.path);
      }
      if (repoSaysSacred && !prev.sacred) {   // the repo can raise a file to sacred, never lower it
        await q(`update public.media_assets set sacred = true, approved_by = null, approved_by_name = null, approved_at = null,
                   approval_note = 'Marked sacred by the repo; needs approval' where path = $1`, [f.path]);
        out.needsApproval.push(`${f.path}: now sacred, needs approval in the dashboard`);
      }
      continue;
    }
    const kind = f.path.startsWith('audio/') ? 'audio' : f.path.endsWith('.mp4') ? 'video'
      : /-poster\.(jpe?g|png|webp)$/.test(f.path) ? 'poster' : /\.(png|jpe?g|webp|svg|gif)$/.test(f.path) ? 'image' : 'file';
    const lesson = kind === 'audio' ? f.path.split('/')[1]! : videoOwner.get(f.path) ?? null;
    if (lesson && !knownLessons.has(lesson)) { out.warnings.push(`${f.path}: its lesson ${lesson} is not in the database; not recorded`); continue; }
    if (kind === 'audio' && !/\.mp3$/.test(f.path)) { out.warnings.push(`${f.path}: not an .mp3 in audio/; not recorded`); continue; }

    let sacred = false, approvedBy: string | null = null, approvedAt: string | null = null, note: string | null = null;
    const seed = seededSacred.get(f.path);
    if (seed) {
      sacred = true; approvedBy = seed.approvedBy; approvedAt = seed.approvedOn; note = seed.approvalNote;
    } else if (sacredWordClips.has(f.path)) {
      sacred = true;
      if (firstImport) {
        approvedBy = 'Dr. Hassan Muslim'; approvedAt = gitDate(f.path) ?? new Date().toISOString();
        note = 'Approved before the admin dashboard existed (date of the last commit of this clip)';
      }
    } else if (/\/c-\d+-ar\.mp3$/.test(f.path) && !seededOrdinary.has(f.path)) {
      sacred = true;   // an unclassified Learn-card clip is treated as sacred until a reviewer decides
    }
    if (sacred && !approvedAt) out.needsApproval.push(`${f.path}: sacred, needs approval in the dashboard`);
    rows.push({ path: f.path, kind, lesson_id: lesson, sacred, bytes: f.bytes, sha256: f.sha256,
      approved_by_name: approvedBy, approved_at: approvedAt, approval_note: note });
  }
  if (rows.length) {
    const r = await q(`insert into public.media_assets (path, kind, lesson_id, sacred, bytes, sha256, approved_by_name, approved_at, approval_note)
      select path, kind, lesson_id, sacred, bytes, sha256, approved_by_name, approved_at, approval_note
      from jsonb_to_recordset($1::jsonb) as x(path text, kind public.media_kind, lesson_id text, sacred boolean, bytes bigint,
        sha256 text, approved_by_name text, approved_at timestamptz, approval_note text)
      on conflict (path) do nothing`, [JSON.stringify(rows)]);
    out.media.added = r.rowCount ?? 0;
  }
  for (const p of existing.keys()) if (!onDisk.has(p)) out.warnings.push(`${p} is recorded in the database but no longer in the repo`);
}

// ---------------------------------------------------------------------------------------------------------------
function report(o: Outcome) {
  const lines = [
    `## Content import${dryRun ? ' (dry run: rolled back)' : ''}`,
    '',
    `- applied: **${o.applied.length}** entities (including ones the export wrote back), unchanged: ${o.unchanged}`,
    `- media: ${o.media.added} added, ${o.media.updated} updated${o.media.approvalsWithdrawn.length ? `, approval withdrawn on ${o.media.approvalsWithdrawn.length}` : ''}`,
    `- round trip: ${o.errors.length ? '**failed**' : 'identical to the repo (apart from key order)'}`,
  ];
  const section = (title: string, xs: string[]) => { if (xs.length) lines.push('', `### ${title} (${xs.length})`, ...xs.map(x => `- ${x}`)); };
  section('Errors: nothing was changed', o.errors);
  section('Conflicts: left for a person to resolve', o.conflicts);
  section('Sacred media waiting for approval', o.needsApproval);
  section('Approvals withdrawn because the file changed', o.media.approvalsWithdrawn);
  section('Published in the dashboard, not exported yet', o.pendingExport);
  section('Warnings', o.warnings);
  const text = lines.join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
}

await main();
