// What a child gets, step by step (same rules as app.js), with the Arabic audio from the live site.
import { useMemo, useState } from 'react';
import { LessonSchema, learnCardClip, lessonAudio, stepsFor, wordAudio, type Lesson } from '@koko/shared';
import { LIVE } from '../supabase.ts';

const STEP_NAMES: Record<string, string> = {
  story: "Koko's story", learn: 'Learn with Koko', words: 'New words', sounds: 'Letter sounds', listen: 'Listen & choose',
  match: 'Match the pairs', order: 'Put them in order', talk: 'Talk with Koko', quiz: "Koko's questions", move: 'Move!', think: 'Think & talk',
};

function Play({ path }: { path: string }) {
  return <button className="play" title={path} aria-label={`Play ${path}`} onClick={() => { void new Audio(`${LIVE}/${path}`).play().catch(() => {}); }}>▶</button>;
}
const Ar = ({ t }: { t?: string }) => (t ? <span className="ar" lang="ar" dir="rtl">{t}</span> : null);

export function Preview({ doc }: { doc: unknown }) {
  const parsed = useMemo(() => LessonSchema.safeParse(doc), [doc]);
  const [tab, setTab] = useState('steps');
  if (!parsed.success) return <div className="card preview"><b>Preview</b><p className="muted">The preview appears when the lesson has a valid shape.</p></div>;
  const L: Lesson = parsed.data;
  const steps = stepsFor(L);
  const tabs = ['steps', 'words', 'learn', 'quiz', 'talk', 'parents'].filter(t =>
    t === 'steps' || (t === 'words' && L.words?.length) || (t === 'learn' && L.learn?.length) || (t === 'quiz' && L.quiz?.length)
    || (t === 'talk' && L.dialogue?.length) || (t === 'parents' && L.parents));
  return <div className="card preview">
    <div className="tabs">{tabs.map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    <div className="phone">
      <Ar t={L.title.ar} /><h4>{L.title.en}</h4>
      {tab === 'steps' ? <ol>{steps.map((s, i) => <li key={i}>{STEP_NAMES[s]}</li>)}</ol> : null}
      {tab === 'words' ? <ul className="words">{L.words!.map(w => <li key={w.id}>
        <Play path={wordAudio(L.id, w)} /> <Ar t={w.ar} /> {w.sacred ? '🔒' : ''}<br />
        <small>{w.tr ? <i>{w.tr} · </i> : null}{w.en}{w.badge ? ` · ${w.badge}` : ''}{w.from ? ` · from ${w.from}` : ''}</small></li>)}</ul> : null}
      {tab === 'learn' ? <ul className="cards">{L.learn!.map((c, i) => {
        const clip = learnCardClip(L, i);
        return <li key={i}><b>{c.title}</b>{c.ar ? <div>{clip ? <Play path={clip} /> : null} <Ar t={c.ar} />{c.tr ? <i> {c.tr}</i> : null}</div> : null}<p>{c.en}</p></li>;
      })}</ul> : null}
      {tab === 'quiz' ? <ol>{L.quiz!.map((q, i) => <li key={i}>{q.ar ? <Ar t={q.ar} /> : null} {q.en}
        <ul>{q.opts.map((o, j) => <li key={j} className={o[2] === 1 ? 'right' : ''}>{o[0] ? <Ar t={o[0]} /> : null} {o[1]} {o[2] === 1 ? '✓' : ''}</li>)}</ul></li>)}</ol> : null}
      {tab === 'talk' ? <ul className="chat">{L.dialogue!.map(d => <li key={d.id}>
        <small>{L.speakers?.[d.who]?.en ?? d.who} ({L.speakers?.[d.who]?.playedBy === 'koko' ? 'Koko' : 'the child'})</small><br />
        <Play path={lessonAudio(L.id, `d-${d.id}-ar`)} /> <Ar t={d.ar} /><br /><small>{d.en}</small></li>)}</ul> : null}
      {tab === 'parents' && L.parents ? <div><p>{L.parents.summary}</p>{L.parents.try ? <p><Ar t={L.parents.try.ar} /> “{L.parents.try.translit}” · {L.parents.try.en}
        {L.parents.tryAudio ? <> <Play path={lessonAudio(L.id, L.parents.tryAudio)} /></> : null}</p> : null}<p className="muted">{L.parents.tip}</p></div> : null}
    </div>
  </div>;
}
