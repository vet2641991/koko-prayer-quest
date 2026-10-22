// DHM Institute promos for parents. Every link opens only behind the app's parental gate.
import { useEffect, useState } from 'react';
import { PROMO_PLACEMENTS } from '@koko/shared';
import { useAuth } from '../auth.tsx';
import { ActionButton, Field, Message, StatusBadge, type Msg } from '../components/ui.tsx';
import { errText, must, supabase } from '../supabase.ts';
import type { PromoRec } from '../types.ts';

type Draft = { id: string; text_en: string; url: string; placement: PromoRec['placement']; sort: number; active: boolean; existing?: boolean };
const EMPTY: Draft = { id: '', text_en: '', url: 'https://dhm-institute.com/trial-sessions/booking', placement: 'parents', sort: 10, active: true };
const PLACE: Record<string, string> = { after_lesson: 'After a lesson', map: 'On the map', parents: 'Parents page' };

export function PromosPage() {
  const { perms } = useAuth();
  const [rows, setRows] = useState<PromoRec[]>([]);
  const [edit, setEdit] = useState<Draft>(EMPTY);
  const [msg, setMsg] = useState<Msg>(null);
  const load = async () => { try { setRows(must(await supabase.from('promos').select('*').order('placement').order('sort')) as PromoRec[]); } catch (e) { setMsg({ kind: 'error', text: errText(e) }); } };
  useEffect(() => { load(); }, []);
  const act = async (f: () => Promise<unknown>, ok: string) => { try { await f(); setMsg({ kind: 'ok', text: ok }); await load(); } catch (e) { setMsg({ kind: 'error', text: errText(e) }); } };
  const urlOk = /^https:\/\/(www\.)?dhm-institute\.com(\/\S*)?$/.test(edit.url);

  async function save() {
    const row = { text_en: edit.text_en, url: edit.url, placement: edit.placement, sort: edit.sort, active: edit.active };
    await act(async () => must(edit.existing ? await supabase.from('promos').update(row).eq('id', edit.id)
      : await supabase.from('promos').insert({ id: edit.id, ...row })), 'Saved as a draft. Publish it to send it to the app.');
    setEdit(EMPTY);
  }
  return <div className="page">
    <h2>Promos for parents</h2>
    <p className="muted">Links must go to dhm-institute.com (https). The app opens them only after a parental gate, as Google Play Families and Apple Kids require.</p>
    <Message msg={msg} onClose={() => setMsg(null)} />
    <table className="list"><thead><tr><th>Where</th><th>Text</th><th>Link</th><th>On</th><th>Status</th><th /></tr></thead><tbody>
      {rows.map(p => <tr key={p.id}><td>{PLACE[p.placement]} · {p.sort}</td><td>{p.text_en}</td><td className="mono small">{p.url}</td><td>{p.active ? 'on' : 'off'}</td>
        <td><StatusBadge status={p.status} /></td>
        <td className="nowrap">{perms.edit ? <button onClick={() => setEdit({ id: p.id, text_en: p.text_en, url: p.url, placement: p.placement, sort: p.sort, active: p.active, existing: true })}>Edit</button> : null}
          {perms.publish && p.status !== 'archived' ? <ActionButton className="primary" onRun={() => act(async () => must(await supabase.rpc('publish_promo', { promo_id: p.id })), p.active ? 'Published.' : 'Switched off in the app.')}>Publish</ActionButton> : null}
          {perms.publish && p.status !== 'archived' ? <ActionButton className="danger" confirm="Archive this promo?" onRun={() => act(async () => must(await supabase.rpc('archive_promo', { promo_id: p.id })), 'Archived.')}>Archive</ActionButton> : null}
          {perms.publish && p.status === 'archived' ? <ActionButton onRun={() => act(async () => must(await supabase.rpc('restore_content', { kind: 'promo', entity_id: p.id })), 'Restored.')}>Restore</ActionButton> : null}</td></tr>)}
    </tbody></table>
    {perms.edit ? <div className="card">
      <h3>{edit.existing ? `Edit ${edit.id}` : 'New promo'}</h3>
      <div className="grid2">
        <Field label="Id" hint="a-z, 0-9 and dashes; permanent"><input disabled={edit.existing} value={edit.id} onChange={e => setEdit({ ...edit, id: e.target.value })} /></Field>
        <Field label="Where"><select value={edit.placement} onChange={e => setEdit({ ...edit, placement: e.target.value as Draft['placement'] })}>
          {PROMO_PLACEMENTS.map(p => <option key={p} value={p}>{PLACE[p]}</option>)}</select></Field>
        <Field label="Text (English, for parents)"><textarea rows={2} value={edit.text_en} onChange={e => setEdit({ ...edit, text_en: e.target.value })} /></Field>
        <Field label="Link" hint={urlOk ? 'Trial class: /trial-sessions/booking · recorded courses: a dhm-institute.com course page' : <span className="error">Must start with https://dhm-institute.com</span>}>
          <input value={edit.url} onChange={e => setEdit({ ...edit, url: e.target.value })} /></Field>
        <Field label="Order"><input inputMode="numeric" value={edit.sort} onChange={e => setEdit({ ...edit, sort: Number(e.target.value) || 0 })} /></Field>
        <label className="check"><input type="checkbox" checked={edit.active} onChange={e => setEdit({ ...edit, active: e.target.checked })} /> On</label>
      </div>
      <div className="buttons"><ActionButton className="primary" disabled={!edit.id || !edit.text_en || !urlOk} onRun={save}>Save draft</ActionButton>
        {edit.existing ? <button onClick={() => setEdit(EMPTY)}>Cancel</button> : null}</div>
    </div> : null}
  </div>;
}
