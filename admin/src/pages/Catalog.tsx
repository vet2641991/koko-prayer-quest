// Catalog-level settings: where children start, and the optional note from the teacher on the Parents page.
import { useEffect, useState } from 'react';
import { useAuth } from '../auth.tsx';
import { ActionButton, Field, Message, type Msg } from '../components/ui.tsx';
import { errText, must, supabase } from '../supabase.ts';
import type { UnitRec, WorldRec } from '../types.ts';

type Row = { focus: string | null; start: string | null; focus_new: string | null; note: string | null; teacher_note: { text?: string } | null; version: number };

export function CatalogPage() {
  const { perms } = useAuth();
  const [row, setRow] = useState<Row | null>(null);
  const [worlds, setWorlds] = useState<WorldRec[]>([]), [units, setUnits] = useState<UnitRec[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [subs, setSubs] = useState<{ active: number; renewing: number; by_source: Record<string, number> } | null>(null);
  useEffect(() => { if (perms.manageAdmins) supabase.rpc('billing_summary').then(r => setSubs(r.data ?? null)); }, [perms.manageAdmins]);
  useEffect(() => {
    Promise.all([supabase.from('catalog_settings').select('*').maybeSingle(), supabase.from('worlds').select('*').order('sort'), supabase.from('units').select('id,world_id,en').order('sort')])
      .then(([c, w, u]) => { setRow(c.data as Row); setWorlds((w.data ?? []) as WorldRec[]); setUnits((u.data ?? []) as UnitRec[]); });
  }, []);
  if (!row) return <p className="muted">Loading…</p>;
  const ro = !perms.manageAdmins;
  const act = async (f: () => Promise<unknown>, ok: string) => { try { await f(); setMsg({ kind: 'ok', text: ok }); } catch (e) { setMsg({ kind: 'error', text: errText(e) }); } };
  return <div className="page">
    <h2>Catalog settings</h2>
    {ro ? <p className="muted">Only the owner can change these.</p> : null}
    <Message msg={msg} onClose={() => setMsg(null)} />
    <div className="card grid2">
      <Field label="Where every child starts (focusNew)"><select disabled={ro} value={row.focus_new ?? ''} onChange={e => setRow({ ...row, focus_new: e.target.value || null })}>
        {worlds.map(w => <option key={w.id} value={w.id}>{w.en}</option>)}</select></Field>
      <Field label="Haitham's world (focus)"><select disabled={ro} value={row.focus ?? ''} onChange={e => setRow({ ...row, focus: e.target.value || null })}>
        {worlds.map(w => <option key={w.id} value={w.id}>{w.en}</option>)}</select></Field>
      <Field label="Haitham's unit (start)"><select disabled={ro} value={row.start ?? ''} onChange={e => setRow({ ...row, start: e.target.value || null })}>
        <option value="">—</option>{units.filter(u => u.world_id === row.focus).map(u => <option key={u.id} value={u.id}>{u.id} · {u.en}</option>)}</select></Field>
      <Field label="Note from Dr. Hassan on the Parents page (empty = none)"><textarea disabled={ro} rows={3} value={row.teacher_note?.text ?? ''}
        onChange={e => setRow({ ...row, teacher_note: e.target.value ? { ...(row.teacher_note ?? {}), text: e.target.value } : null })} /></Field>
      <Field label="Internal note in catalog.json"><textarea disabled={ro} rows={3} value={row.note ?? ''} onChange={e => setRow({ ...row, note: e.target.value || null })} /></Field>
    </div>
    <div className="buttons">
      {!ro ? <ActionButton onRun={() => act(async () => must(await supabase.from('catalog_settings').update({ focus: row.focus, start: row.start, focus_new: row.focus_new, note: row.note, teacher_note: row.teacher_note }).eq('id', true)), 'Saved as a draft.')}>Save draft</ActionButton> : null}
      {perms.publish ? <ActionButton className="primary" onRun={() => act(async () => must(await supabase.rpc('publish_catalog', {})), 'Published.')}>Publish settings</ActionButton> : null}
    </div>
    {subs ? <div className="card">
      <h3>Koko Premium</h3>
      <p><b>{subs.active}</b> famil{subs.active === 1 ? 'y has' : 'ies have'} Koko Premium now; <b>{subs.renewing}</b> will renew.
        {Object.keys(subs.by_source).length ? ` By source: ${Object.entries(subs.by_source).map(([k, v]) => `${k === 'revenuecat' ? 'App Store / Google Play' : k === 'stripe' ? 'website' : k} ${v}`).join(', ')}.` : ''}</p>
      <p className="muted small">Counts only. Names, emails and payments are in Stripe and RevenueCat. Which lessons are Premium is set on each world's page.</p>
    </div> : null}
  </div>;
}
