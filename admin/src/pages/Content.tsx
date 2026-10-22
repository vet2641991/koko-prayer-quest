// Worlds → units → lessons, with search. The selected world or unit opens on the right.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useOutletContext, useParams } from 'react-router';
import { bare } from '@koko/shared';
import { StatusBadge } from '../components/ui.tsx';
import { errText, must, supabase } from '../supabase.ts';
import type { Status, UnitRec, WorldRec } from '../types.ts';

export type LessonState = { id: string; status: Status; title_en: string; title_ar: string; updated_at: string };
export type Tree = {
  worlds: WorldRec[]; units: UnitRec[]; lessons: Map<string, LessonState>;
  publishedAt: Map<string, string>;   // "lesson:id" → when it was last published
};
export type TreeCtx = { tree: Tree | null; reload: () => Promise<void> };
export const useTree = () => useOutletContext<TreeCtx>();

export async function loadTree(): Promise<Tree> {
  const [w, u, l, p] = await Promise.all([
    supabase.from('worlds').select('*').order('sort'),
    supabase.from('units').select('*').order('sort'),
    supabase.from('lessons').select('id,status,title_en,title_ar,updated_at'),
    supabase.from('published_content').select('kind,id,published_at'),
  ]);
  return {
    worlds: must(w) as WorldRec[], units: must(u) as UnitRec[],
    lessons: new Map((must(l) as LessonState[]).map(x => [x.id, x])),
    publishedAt: new Map((must(p) as { kind: string; id: string; published_at: string }[]).map(x => [`${x.kind}:${x.id}`, x.published_at])),
  };
}

/** Edited after it was last published (the working copy may hold unpublished changes). */
export const editedSincePublish = (t: Tree, kind: string, id: string, updatedAt: string) => {
  const at = t.publishedAt.get(`${kind}:${id}`);
  return Boolean(at && new Date(updatedAt).getTime() > new Date(at).getTime() + 1000);
};

export function ContentPage() {
  const [tree, setTree] = useState<Tree | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const params = useParams();
  const reload = useCallback(async () => {
    try { setTree(await loadTree()); setError(''); } catch (e) { setError(errText(e)); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const needle = q.trim().toLowerCase(), needleAr = bare(q);
  const matches = useMemo(() => {
    if (!tree || !needle) return null;
    return new Set(tree.units.filter(u => {
      const L = tree.lessons.get(u.id);
      return [u.id, u.en, u.n, L?.title_en ?? ''].some(s => s.toLowerCase().includes(needle))
        || (needleAr && [u.ar, L?.title_ar ?? ''].some(s => bare(s).includes(needleAr)));
    }).map(u => u.id));
  }, [tree, needle, needleAr]);

  return <div className="content">
    <aside className="tree">
      <input type="search" placeholder="Search id, English or Arabic…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search lessons" />
      {error ? <p className="error">{error}</p> : null}
      {!tree ? <p className="muted">Loading…</p> : tree.worlds.map(w => {
        const units = tree.units.filter(u => u.world_id === w.id && (!matches || matches.has(u.id)));
        if (matches && !units.length) return null;
        const isOpen = Boolean(matches) || open.has(w.id) || params.worldId === w.id || units.some(u => u.id === params.unitId);
        return <div key={w.id} className="tree-world">
          <div className="tree-row">
            <button className="link toggle" aria-expanded={isOpen} onClick={() => setOpen(s => { const n = new Set(s); n.has(w.id) ? n.delete(w.id) : n.add(w.id); return n; })}>{isOpen ? '▾' : '▸'}</button>
            <Link to={`/content/world/${w.id}`} className={params.worldId === w.id ? 'active' : ''}>
              <b>{w.display_code ? `${w.display_code} · ` : ''}{w.en}</b></Link>
            <StatusBadge status={w.status} />
          </div>
          {isOpen ? <ul>{units.map(u => {
            const L = tree.lessons.get(u.id);
            return <li key={u.id} className="tree-row">
              <Link to={`/content/unit/${u.id}`} className={params.unitId === u.id ? 'active' : ''}>
                <span className="mono">{u.id}</span> {u.en} <span className="ar inline">{u.ar}</span></Link>
              {u.go_world_id ? <span className="badge link">→ {u.go_world_id}</span>
                : <StatusBadge status={L ? L.status : 'none'} dirty={L ? editedSincePublish(tree, 'lesson', u.id, L.updated_at) : false} />}
            </li>;
          })}</ul> : null}
        </div>;
      })}
    </aside>
    <section className="detail"><Outlet context={{ tree, reload } satisfies TreeCtx} /></section>
  </div>;
}

export function ContentHome() {
  const { tree } = useTree();
  if (!tree) return null;
  const count = (s: Status) => [...tree.lessons.values()].filter(l => l.status === s).length;
  return <div className="card">
    <h2>Content</h2>
    <p>{tree.worlds.length} worlds · {tree.units.length} units · {tree.lessons.size} lessons
      ({count('published')} published, {count('draft')} drafts, {count('archived')} archived).</p>
    <p className="muted">Pick a world or a lesson on the left. Changes are saved as drafts; children see a lesson only after
      someone with the publish permission publishes it and the content is sent to the site.</p>
  </div>;
}
