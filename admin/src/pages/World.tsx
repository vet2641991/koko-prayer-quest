// One world: its fields, its units in order (reorder, add a unit), and publishing.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { rowToWorldDoc, sameJson } from '@koko/shared';
import { useAuth } from '../auth.tsx';
import { ActionButton, ArabicInput, Field, Message, StatusBadge, type Msg } from '../components/ui.tsx';
import { errText, must, supabase } from '../supabase.ts';
import type { WorldRec } from '../types.ts';
import { useTree } from './Content.tsx';

export function WorldPage() {
  const { worldId = '' } = useParams();
  const { tree, reload } = useTree();
  const { perms } = useAuth();
  const nav = useNavigate();
  const world = tree?.worlds.find(w => w.id === worldId);
  const [form, setForm] = useState<WorldRec | null>(null);
  const [published, setPublished] = useState<Record<string, unknown> | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [newUnit, setNewUnit] = useState({ suffix: '', n: '', en: '', ar: '' });

  useEffect(() => { setForm(world ? { ...world } : null); }, [world]);
  useEffect(() => {
    supabase.from('published_content').select('document').eq('kind', 'world').eq('id', worldId).maybeSingle()
      .then(r => setPublished((r.data?.document as Record<string, unknown>) ?? null));
  }, [worldId, tree]);
  if (!tree) return null;
  if (!world || !form) return <p>No world “{worldId}”.</p>;
  const units = tree.units.filter(u => u.world_id === world.id);
  const ro = !perms.edit;
  const dirtyPublish = published ? !sameJson(published, rowToWorldDoc(world)) : false;
  const run = async (f: () => Promise<unknown>, ok: string) => {
    try { await f(); setMsg({ kind: 'ok', text: ok }); await reload(); } catch (e) { setMsg({ kind: 'error', text: errText(e) }); }
  };

  async function save() {
    await run(async () => must(await supabase.from('worlds').update({
      en: form!.en, ar: form!.ar, tint: form!.tint, ink: form!.ink, display_code: form!.display_code || null,
    }).eq('id', world!.id)), 'Saved as a draft. Publish the world to make it public.');
  }
  async function move(i: number, d: -1 | 1) {
    const ids = units.map(u => u.id);
    const j = i + d; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    await run(async () => must(await supabase.rpc('reorder_units', { world: world!.id, unit_ids: ids })), 'Order saved. Publish the order to make it public.');
  }
  async function setPremium(ids: string[], premium: boolean) {
    await run(async () => must(await supabase.rpc('set_units_premium', { unit_ids: ids, premium })),
      `${ids.length === 1 ? ids[0] : `${ids.length} units`}: ${premium ? 'for Koko Premium subscribers' : 'free for everyone'}. Published units change at the next “Send to the site”.`);
  }
  async function addUnit() {
    const suffix = newUnit.suffix.trim().toLowerCase();
    if (!/^[a-z][a-z0-9]*$/.test(suffix)) return setMsg({ kind: 'error', text: 'The id suffix uses a–z and 0–9, starting with a letter (e.g. l31 or u09).' });
    const id = `${world!.id}-${suffix}`;
    const sort = Math.max(0, ...units.map(u => u.sort)) + 10;
    await run(async () => must(await supabase.from('units').insert({ id, world_id: world!.id, n: newUnit.n || suffix.replace(/^\D+/, ''), en: newUnit.en, ar: newUnit.ar, sort })),
      `Unit ${id} created as a draft.`);
    nav(`/content/unit/${id}`);
  }

  return <div>
    <div className="title-row"><h2>{world.display_code ? `${world.display_code} · ` : ''}{world.en}</h2><StatusBadge status={world.status} dirty={dirtyPublish} />
      <span className="mono muted">{world.id}</span></div>
    <Message msg={msg} onClose={() => setMsg(null)} />
    <div className="card grid2">
      <Field label="Name (English)" hint="The first digit in the name becomes the world's icon in the app."><input disabled={ro} value={form.en} onChange={e => setForm({ ...form, en: e.target.value })} /></Field>
      <Field label="Name (Arabic)"><ArabicInput disabled={ro} value={form.ar} onChange={e => setForm({ ...form, ar: e.target.value })} /></Field>
      <Field label="DHM level code" hint='Display name only, e.g. "ARkid A1". The id never changes.'><input disabled={ro} value={form.display_code ?? ''} onChange={e => setForm({ ...form, display_code: e.target.value })} /></Field>
      <div className="grid2">
        <Field label="Icon background"><input disabled={ro} type="color" value={form.tint} onChange={e => setForm({ ...form, tint: e.target.value.toUpperCase() })} /></Field>
        <Field label="Icon colour"><input disabled={ro} type="color" value={form.ink} onChange={e => setForm({ ...form, ink: e.target.value.toUpperCase() })} /></Field>
      </div>
      <div className="buttons">
        {perms.edit ? <ActionButton onRun={save}>Save draft</ActionButton> : null}
        {perms.publish && world.status !== 'archived' ? <ActionButton className="primary" onRun={() => run(async () => must(await supabase.rpc('publish_world', { world_id: world.id })), 'World published.')}>Publish world</ActionButton> : null}
        {perms.publish && world.status !== 'archived' ? <ActionButton className="danger" confirm={`Archive ${world.id}? The whole world and its lessons leave the app at the next send to the site.`}
          onRun={() => run(async () => must(await supabase.rpc('archive_world', { world_id: world.id })), 'World archived.')}>Archive</ActionButton> : null}
        {perms.publish && world.status === 'archived' ? <ActionButton onRun={() => run(async () => must(await supabase.rpc('restore_content', { kind: 'world', entity_id: world.id })), 'Restored as a draft.')}>Restore</ActionButton> : null}
      </div>
    </div>

    <h3>Units, in the order children meet them</h3>
    <p className="muted small">Free or Koko Premium: only the owner decides. A premium lesson is locked in the app until a parent subscribes
      (the website stays free for now).</p>
    {perms.manageAdmins && units.length ? <div className="buttons">
      <ActionButton onRun={() => setPremium(units.filter(u => !u.go_world_id).map(u => u.id), true)}
        confirm={`Make every unit of ${world.id} Koko Premium only?`}>All units: Premium</ActionButton>
      <ActionButton onRun={() => setPremium(units.map(u => u.id), false)}>All units: free</ActionButton>
    </div> : null}
    <table className="list"><thead><tr><th>#</th><th>Unit</th><th>Lesson</th><th>Access</th><th /></tr></thead><tbody>
      {units.map((u, i) => {
        const L = tree.lessons.get(u.id);
        return <tr key={u.id}><td>{u.n}</td>
          <td><Link to={`/content/unit/${u.id}`}><span className="mono">{u.id}</span> {u.en}</Link> <span className="ar inline">{u.ar}</span></td>
          <td>{u.go_world_id ? `link → ${u.go_world_id}` : <StatusBadge status={L?.status ?? 'none'} />}</td>
          <td className="nowrap">{u.go_world_id ? null : <>
            <span className={`badge ${u.premium ? 'premium' : ''}`}>{u.premium ? '🔒 Premium' : 'Free'}</span>
            {perms.manageAdmins ? <button onClick={() => setPremium([u.id], !u.premium)}>{u.premium ? 'Make free' : 'Make Premium'}</button> : null}</>}</td>
          <td className="nowrap">{perms.edit ? <><button aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
            <button aria-label="Move down" onClick={() => move(i, 1)} disabled={i === units.length - 1}>↓</button></> : null}</td></tr>;
      })}
    </tbody></table>
    {perms.publish ? <ActionButton onRun={() => run(async () => must(await supabase.rpc('publish_unit_order', { world: world.id })), 'The new order is published.')}>Publish the order</ActionButton> : null}

    {perms.edit ? <div className="card">
      <h3>Add a unit</h3>
      <div className="grid4">
        <Field label="Id" hint={`${world.id}-…`}><input placeholder="l31" value={newUnit.suffix} onChange={e => setNewUnit({ ...newUnit, suffix: e.target.value })} /></Field>
        <Field label="Label in the map dot"><input placeholder="31" value={newUnit.n} onChange={e => setNewUnit({ ...newUnit, n: e.target.value })} /></Field>
        <Field label="Title (English)"><input value={newUnit.en} onChange={e => setNewUnit({ ...newUnit, en: e.target.value })} /></Field>
        <Field label="Title (Arabic)"><ArabicInput value={newUnit.ar} onChange={e => setNewUnit({ ...newUnit, ar: e.target.value })} /></Field>
      </div>
      <p className="muted small">Ids are permanent: children's progress and the audio folder are keyed by them.</p>
      <ActionButton onRun={addUnit} disabled={!newUnit.suffix || !newUnit.en || !newUnit.ar}>Create unit</ActionButton>
    </div> : null}
  </div>;
}
