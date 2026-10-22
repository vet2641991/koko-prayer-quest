// Every file the app loads: sacred flags and approvals (owner/reviewer), audio preview, and new uploads.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useAuth } from '../auth.tsx';
import { ActionButton, Message, fmtDate, type Msg } from '../components/ui.tsx';
import { LIVE, errText, must, supabase } from '../supabase.ts';
import type { MediaRec } from '../types.ts';

const PAGE = 200;

export function MediaPage() {
  const { perms } = useAuth();
  const [params, setParams] = useSearchParams();
  const lesson = params.get('lesson') ?? '', only = params.get('only') ?? '';
  const [rows, setRows] = useState<MediaRec[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [counts, setCounts] = useState({ waiting: 0 });

  async function load() {
    let q = supabase.from('media_assets').select('*').order('path').limit(PAGE);
    if (lesson) q = q.eq('lesson_id', lesson);
    if (only === 'waiting') q = q.eq('sacred', true).is('approved_at', null);
    if (only === 'sacred') q = q.eq('sacred', true);
    if (only === 'uploads') q = q.eq('storage', 'supabase');
    try {
      setRows(must(await q) as MediaRec[]);
      const w = await supabase.from('media_assets').select('id', { count: 'exact', head: true }).eq('sacred', true).is('approved_at', null);
      setCounts({ waiting: w.count ?? 0 });
    } catch (e) { setMsg({ kind: 'error', text: errText(e) }); }
  }
  useEffect(() => { load(); }, [lesson, only]);
  const act = async (f: () => Promise<unknown>, ok: string) => {
    try { await f(); setMsg({ kind: 'ok', text: ok }); await load(); } catch (e) { setMsg({ kind: 'error', text: errText(e) }); }
  };
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n); };

  return <div className="page">
    <h2>Media</h2>
    <p className="muted">Audio and video stay on the static site and are never edited here. A sacred file must be approved by an
      owner or reviewer before a lesson using it can be published; if its bytes ever change, the approval is withdrawn.</p>
    <Message msg={msg} onClose={() => setMsg(null)} />
    <div className="filters">
      <input placeholder="Lesson id, e.g. isl1-l13" value={lesson} onChange={e => set('lesson', e.target.value.trim())} aria-label="Lesson id" />
      <select value={only} onChange={e => set('only', e.target.value)} aria-label="Show">
        <option value="">All files</option><option value="waiting">Sacred, waiting for approval ({counts.waiting})</option>
        <option value="sacred">Sacred</option><option value="uploads">Dashboard uploads</option></select>
      {perms.edit ? <Upload onDone={(t) => act(async () => {}, t)} onError={t => setMsg({ kind: 'error', text: t })} /> : null}
    </div>
    <table className="list"><thead><tr><th>File</th><th>Sacred</th><th>Approval</th><th /></tr></thead><tbody>
      {rows.map(m => <tr key={m.id}>
        <td><span className="mono">{m.path}</span>{m.storage === 'supabase' ? <span className="badge draft">upload, not on the site yet</span> : null}
          {m.kind === 'audio' && m.storage === 'static' ? <audio controls preload="none" src={`${LIVE}/${m.path}`} /> : null}</td>
        <td>{m.sacred ? '🔒 sacred' : '—'}</td>
        <td>{m.approved_at ? <>✓ {m.approved_by_name}<br /><small>{fmtDate(m.approved_at)}</small></> : m.sacred ? <b className="warn">waiting</b> : '—'}
          {m.approval_note ? <><br /><small className="muted">{m.approval_note}</small></> : null}</td>
        <td className="nowrap">{perms.approveSacred ? <>
          {m.sacred && !m.approved_at ? <ActionButton className="primary" confirm={`Approve ${m.path}? Listen to it first: children will hear it.`}
            onRun={() => act(async () => must(await supabase.rpc('approve_media', { asset_path: m.path, note: null })), 'Approved.')}>Approve</ActionButton> : null}
          {m.approved_at ? <ActionButton confirm="Withdraw this approval? Lessons using the file cannot be published until it is approved again."
            onRun={() => act(async () => { const why = prompt('Why is the approval withdrawn?') ?? ''; must(await supabase.rpc('revoke_media_approval', { asset_path: m.path, note: why })); }, 'Approval withdrawn.')}>Withdraw</ActionButton> : null}
          <ActionButton confirm={m.sacred ? 'Mark as ordinary (not sacred)?' : 'Mark as sacred? It will need an approval.'}
            onRun={() => act(async () => must(await supabase.rpc('set_media_sacred', { asset_path: m.path, is_sacred: !m.sacred, note: null })), 'Saved.')}>
            {m.sacred ? 'Mark ordinary' : 'Mark sacred'}</ActionButton></> : null}</td>
      </tr>)}
    </tbody></table>
    {rows.length === PAGE ? <p className="muted small">Showing the first {PAGE}; filter by lesson to see the rest.</p> : null}
  </div>;
}

// New images or files for lessons. They go to the private "uploads" bucket and are copied into media/ by the export.
function Upload({ onDone, onError }: { onDone: (msg: string) => void; onError: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function pick(file: File) {
    setBusy(true);
    try {
      const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'bin').toLowerCase();
      if (!['png', 'jpg', 'jpeg', 'webp', 'svg', 'pdf'].includes(ext)) throw new Error('Upload images (png, jpg, webp, svg) or pdf. Audio and video come from the production session.');
      const slug = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'file';
      const month = new Date().toISOString().slice(0, 7);
      const path = `media/uploads/${month}/${slug}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const buf = await file.arrayBuffer();
      const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(b => b.toString(16).padStart(2, '0')).join('');
      must(await supabase.storage.from('uploads').upload(path, file, { contentType: file.type, upsert: false }));
      must(await supabase.from('media_assets').insert({ path, kind: ext === 'pdf' ? 'file' : 'image', storage: 'supabase', storage_object: `uploads/${path}`, bytes: buf.byteLength, sha256 }));
      onDone(`Uploaded as ${path}. Use that path in a lesson; a reviewer marks it ordinary or approves it.`);
    } catch (e) { onError(errText(e)); } finally { setBusy(false); }
  }
  return <label className="button">{busy ? 'Uploading…' : 'Upload an image or file'}
    <input type="file" hidden accept=".png,.jpg,.jpeg,.webp,.svg,.pdf" onChange={e => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ''; }} /></label>;
}
