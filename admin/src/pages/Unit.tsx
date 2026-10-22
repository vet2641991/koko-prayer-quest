// One unit and its lesson: unit fields, the lesson editor (form for the common parts, JSON with schema validation
// for the rest), a preview, and the draft → publish workflow.
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  lessonToRow, rowToLessonDoc, rowToUnitDoc, sameJson, validateLesson, type LessonRow,
} from '@koko/shared';
import { useAuth } from '../auth.tsx';
import { Preview } from '../components/Preview.tsx';
import { ActionButton, ArabicInput, Field, Message, StatusBadge, fmtDate, type Msg } from '../components/ui.tsx';
import { errText, must, supabase } from '../supabase.ts';
import type { LessonRec, MediaRec, UnitRec } from '../types.ts';
import { useTree } from './Content.tsx';

// JSON parts of a lesson, in the order the app uses them
const SECTIONS = [
  ['video', 'Story video { src, poster }'], ['learn', 'Learn cards'], ['words', 'Words'], ['sounds', 'Letter sounds'],
  ['games', 'Games ["listen", "match", "order"]'], ['order', 'Order game'], ['dialogue', 'Dialogue lines'],
  ['speakers', 'Speakers'], ['talk', 'Talk with Koko'], ['quiz', 'Quiz'], ['move', 'Move!'], ['think', 'Think & talk'],
  ['parents', 'For parents'], ['extra', 'Other keys (kept as they are)'],
] as const;
type SectionKey = typeof SECTIONS[number][0];
type J = Record<string, unknown>;

type Form = { title_ar: string; title_en: string; topic: string; minutes: string; unit_no: string; source: string; note: string };
const pretty = (v: unknown) => (v === null || v === undefined ? '' : JSON.stringify(v, null, 2));

export function UnitPage() {
  const { unitId = '' } = useParams();
  const { tree, reload } = useTree();
  const { perms } = useAuth();
  const [unit, setUnit] = useState<UnitRec | null>(null);
  const [lesson, setLesson] = useState<LessonRec | null | undefined>(undefined);
  const [published, setPublished] = useState<{ lesson: J | null; unit: J | null }>({ lesson: null, unit: null });
  const [media, setMedia] = useState<MediaRec[]>([]);
  const [msg, setMsg] = useState<Msg>(null);

  async function load() {
    const [u, l, p, m] = await Promise.all([
      supabase.from('units').select('*').eq('id', unitId).maybeSingle(),
      supabase.from('lessons').select('*').eq('id', unitId).maybeSingle(),
      supabase.from('published_content').select('kind,document').in('kind', ['lesson', 'unit']).eq('id', unitId),
      supabase.from('media_assets').select('*').eq('lesson_id', unitId),
    ]);
    setUnit((u.data as UnitRec) ?? null);
    setLesson((l.data as LessonRec) ?? null);
    const docs = (p.data ?? []) as { kind: string; document: J }[];
    setPublished({ lesson: docs.find(d => d.kind === 'lesson')?.document ?? null, unit: docs.find(d => d.kind === 'unit')?.document ?? null });
    setMedia((m.data ?? []) as MediaRec[]);
  }
  useEffect(() => { setMsg(null); setLesson(undefined); load(); }, [unitId]);

  const run = async (f: () => Promise<unknown>, ok: string) => {
    try { await f(); setMsg({ kind: 'ok', text: ok }); await Promise.all([load(), reload()]); }
    catch (e) { setMsg({ kind: 'error', text: errText(e) }); }
  };
  if (!unit || lesson === undefined || !tree) return <p className="muted">{unit === null ? `No unit “${unitId}”.` : 'Loading…'}</p>;
  return <div>
    <div className="title-row"><h2><span className="mono">{unit.id}</span> {unit.en}</h2>
      <Link to={`/content/world/${unit.world_id}`} className="muted">{tree.worlds.find(w => w.id === unit.world_id)?.en}</Link></div>
    <Message msg={msg} onClose={() => setMsg(null)} />
    <UnitForm unit={unit} publishedDoc={published.unit} lessonPublished={Boolean(published.lesson)} run={run} />
    {unit.go_world_id ? <p className="card">This unit is a link to the world <b>{unit.go_world_id}</b>; it has no lesson.</p>
      : lesson ? <LessonEditor key={lesson.id + lesson.updated_at} unit={unit} lesson={lesson} publishedDoc={published.lesson} media={media} run={run} />
      : <div className="card"><p>This unit has no lesson yet: children see a locked “soon” box (once the unit is published).</p>
        {perms.edit ? <ActionButton onRun={() => run(async () => must(await supabase.from('lessons').insert({ id: unit.id, title_ar: unit.ar, title_en: unit.en, minutes: 10 })), 'Lesson created as a draft.')}>Create the lesson</ActionButton> : null}</div>}
  </div>;
}

function UnitForm({ unit, publishedDoc, lessonPublished, run }: {
  unit: UnitRec; publishedDoc: J | null; lessonPublished: boolean; run: (f: () => Promise<unknown>, ok: string) => Promise<void>;
}) {
  const { perms } = useAuth();
  const { tree } = useTree();
  const [f, setF] = useState(unit);
  useEffect(() => setF(unit), [unit]);
  const ro = !perms.edit;
  const changed = publishedDoc ? !sameJson(publishedDoc, rowToUnitDoc(unit)) : false;
  return <details className="card" open={!lessonPublished}>
    <summary><b>Map entry</b> <StatusBadge status={unit.status} dirty={changed} /></summary>
    <div className="grid4">
      <Field label="Label in the map dot"><input disabled={ro} value={f.n} onChange={e => setF({ ...f, n: e.target.value })} /></Field>
      <Field label="Title (English)"><input disabled={ro} value={f.en} onChange={e => setF({ ...f, en: e.target.value })} /></Field>
      <Field label="Title (Arabic)"><ArabicInput disabled={ro} value={f.ar} onChange={e => setF({ ...f, ar: e.target.value })} /></Field>
      <Field label="Link to another world"><select disabled={ro} value={f.go_world_id ?? ''} onChange={e => setF({ ...f, go_world_id: e.target.value || null })}>
        <option value="">— no, it is a lesson —</option>
        {tree?.worlds.filter(w => w.id !== unit.world_id).map(w => <option key={w.id} value={w.id}>{w.en}</option>)}</select></Field>
    </div>
    <p className="small muted">File when published: <span className="mono">{unit.file_path}</span></p>
    <div className="buttons">
      {perms.edit ? <ActionButton onRun={() => run(async () => must(await supabase.from('units').update({ n: f.n, en: f.en, ar: f.ar, go_world_id: f.go_world_id }).eq('id', unit.id)), 'Map entry saved as a draft.')}>Save draft</ActionButton> : null}
      {perms.publish && unit.status !== 'archived' ? <ActionButton onRun={() => run(async () => must(await supabase.rpc('publish_unit', { unit_id: unit.id })), lessonPublished ? 'Map entry published.' : 'Published: children see it as a locked “soon” box until the lesson is published.')}>
        {lessonPublished ? 'Publish map entry' : 'Show on the map as “soon”'}</ActionButton> : null}
      {perms.publish && unit.status !== 'archived' ? <ActionButton className="danger" confirm={`Archive ${unit.id}? It leaves the app (and its lesson too) at the next send to the site.`}
        onRun={() => run(async () => must(await supabase.rpc('archive_unit', { unit_id: unit.id })), 'Unit archived.')}>Archive unit</ActionButton> : null}
      {perms.publish && unit.status === 'archived' ? <ActionButton onRun={() => run(async () => must(await supabase.rpc('restore_content', { kind: 'unit', entity_id: unit.id })), 'Unit restored as a draft.')}>Restore unit</ActionButton> : null}
    </div>
  </details>;
}

function LessonEditor({ unit, lesson, publishedDoc, media, run }: {
  unit: UnitRec; lesson: LessonRec; publishedDoc: J | null; media: MediaRec[]; run: (f: () => Promise<unknown>, ok: string) => Promise<void>;
}) {
  const { perms } = useAuth();
  const ro = !perms.edit;
  const savedDoc = useMemo(() => rowToLessonDoc(lesson, unit.world_id), [lesson, unit.world_id]);
  const [form, setForm] = useState<Form>({
    title_ar: lesson.title_ar, title_en: lesson.title_en, topic: lesson.topic ?? '', minutes: lesson.minutes?.toString() ?? '',
    unit_no: lesson.unit_no?.toString() ?? '', source: lesson.source ?? '', note: lesson.note ?? '',
  });
  const [json, setJson] = useState<Record<SectionKey, string>>(() => Object.fromEntries(SECTIONS.map(([k]) =>
    [k, pretty(k === 'order' ? lesson.order_game : k === 'extra' ? (Object.keys(lesson.extra ?? {}).length ? lesson.extra : null) : (lesson as unknown as J)[k])])) as Record<SectionKey, string>);

  // the lesson document as it would be saved, plus JSON syntax errors per section
  const { doc, syntax } = useMemo(() => {
    const syntax: Partial<Record<SectionKey, string>> = {};
    const parts: J = {};
    for (const [k] of SECTIONS) {
      const t = json[k].trim();
      if (!t) continue;
      try { parts[k] = JSON.parse(t); } catch (e) { syntax[k] = (e as Error).message; }
    }
    const extra = (parts.extra ?? {}) as J; delete parts.extra;
    const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
    const doc: J = {
      id: lesson.id, world: unit.world_id, unit: num(form.unit_no), source: form.source || undefined,
      title: { ar: form.title_ar, en: form.title_en }, topic: form.topic || undefined, minutes: num(form.minutes),
      note: form.note || undefined, ...parts, ...extra,
    };
    for (const k of Object.keys(doc)) if (doc[k] === undefined) delete doc[k];
    return { doc, syntax };
  }, [form, json, lesson.id, unit.world_id]);

  const v = useMemo(() => validateLesson(doc, unit.file_path), [doc, unit.file_path]);
  const hasSyntax = Object.keys(syntax).length > 0;
  const dirty = !hasSyntax && !sameJson(doc, savedDoc);
  const unpublished = publishedDoc ? !sameJson(publishedDoc, savedDoc) : false;
  const changedKeys = publishedDoc ? [...new Set([...Object.keys(publishedDoc), ...Object.keys(savedDoc)])].filter(k => !sameJson(publishedDoc[k], savedDoc[k])) : [];

  const sacredWords = ((savedDoc.words as { id: string; ar: string; sacred?: boolean }[] | undefined) ?? []).filter(w => w.sacred);
  const sacredClips = media.filter(m => m.sacred);
  const unapproved = sacredClips.filter(m => !m.approved_at);

  async function save() {
    const row: Partial<LessonRow> = lessonToRow(doc as never);
    delete (row as J).id;
    await run(async () => must(await supabase.from('lessons').update(row).eq('id', lesson.id)), 'Saved as a draft. Children still see the published version.');
  }
  const rpc = (name: string, ok: string) => run(async () => must(await supabase.rpc(name, { lesson_id: lesson.id })), ok);

  return <div className="editor">
    <div className="card">
      <div className="title-row"><h3>Lesson</h3><StatusBadge status={lesson.status} dirty={unpublished} />
        <span className="muted small">saved {fmtDate(lesson.updated_at)}</span></div>
      {unpublished && changedKeys.length ? <p className="small">Not published yet: <b>{changedKeys.join(', ')}</b> differ from what children see.</p> : null}
      {sacredWords.length || sacredClips.length ? <p className="sacred-note">
        🔒 {sacredWords.length} sacred word(s){sacredClips.length ? ` and ${sacredClips.length} sacred clip(s)` : ''}.
        {perms.approveSacred ? ' You may correct them; every change is logged.' : ' Their Arabic can be changed only by an owner or a reviewer.'}
        {unapproved.length ? <> <b>{unapproved.length} clip(s) wait for approval</b> (<Link to={`/media?lesson=${lesson.id}`}>Media</Link>); the lesson cannot be published until then.</> : null}
      </p> : null}
      <div className="grid2">
        <Field label="Title (Arabic)"><ArabicInput disabled={ro} value={form.title_ar} onChange={e => setForm({ ...form, title_ar: e.target.value })} /></Field>
        <Field label="Title (English)"><input disabled={ro} value={form.title_en} onChange={e => setForm({ ...form, title_en: e.target.value })} /></Field>
        <Field label="Topic (Home card subtitle)"><input disabled={ro} value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} /></Field>
        <div className="grid2">
          <Field label="Minutes"><input disabled={ro} inputMode="numeric" value={form.minutes} onChange={e => setForm({ ...form, minutes: e.target.value })} /></Field>
          <Field label="Book unit number"><input disabled={ro} inputMode="numeric" value={form.unit_no} onChange={e => setForm({ ...form, unit_no: e.target.value })} /></Field>
        </div>
        <Field label="Source (book, page, approvals)"><textarea dir="auto" disabled={ro} rows={2} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} /></Field>
        <Field label="Editor's note (not shown in the app)"><textarea dir="auto" disabled={ro} rows={2} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></Field>
      </div>
    </div>

    <div className="split">
      <div>
        {SECTIONS.map(([k, label]) => <details key={k} className="card json" open={Boolean(syntax[k])}>
          <summary><b>{label}</b> <span className="muted small">{json[k].trim() ? '' : '(absent)'}</span>
            {syntax[k] ? <span className="error small"> · JSON error</span> : null}</summary>
          <textarea className="code" disabled={ro} spellCheck={false} rows={Math.min(24, Math.max(4, json[k].split('\n').length + 1))}
            value={json[k]} onChange={e => setJson({ ...json, [k]: e.target.value })} aria-label={`${label} (JSON)`} />
          {syntax[k] ? <p className="error small">{syntax[k]}</p> : null}
        </details>)}
      </div>
      <div className="sticky">
        <div className={`card checks ${v.errors.length || hasSyntax ? 'bad' : 'good'}`}>
          <b>{hasSyntax ? 'Fix the JSON first' : v.errors.length ? `${v.errors.length} problem(s): cannot be published` : 'Checks passed'}</b>
          <ul>{v.errors.map((x, i) => <li key={i} className="error">{x.where}: {x.message}</li>)}
            {v.warnings.map((x, i) => <li key={`w${i}`} className="warn">{x.message}</li>)}</ul>
          <div className="buttons">
            {perms.edit ? <ActionButton className={dirty ? 'primary' : ''} disabled={!dirty} onRun={save}>Save draft</ActionButton> : null}
            {perms.publish && lesson.status !== 'archived' ? <ActionButton className="primary" disabled={dirty || hasSyntax || v.errors.length > 0 || unapproved.length > 0}
              title={dirty ? 'Save first' : ''} onRun={() => rpc('publish_lesson', 'Published. Press “Send to the site” to put it live.')}>Publish</ActionButton> : null}
            {perms.publish && lesson.status === 'published' ? <ActionButton confirm="Unpublish? Children will see a locked “soon” box instead of this lesson."
              onRun={() => rpc('unpublish_lesson', 'Unpublished: the unit shows as “soon”.')}>Unpublish</ActionButton> : null}
            {perms.publish && lesson.status !== 'archived' ? <ActionButton className="danger" confirm="Archive this lesson? It disappears from the app, unit and all."
              onRun={() => rpc('archive_lesson', 'Archived.')}>Archive</ActionButton> : null}
            {perms.publish && lesson.status === 'archived' ? <ActionButton onRun={() => run(async () => must(await supabase.rpc('restore_content', { kind: 'lesson', entity_id: lesson.id })), 'Restored as a draft.')}>Restore</ActionButton> : null}
            {dirty ? <button onClick={() => location.reload()}>Discard changes</button> : null}
          </div>
        </div>
        <Preview doc={doc} />
      </div>
    </div>
  </div>;
}
