// Who changed what, when. Read-only: the log can never be edited.
import { useEffect, useState } from 'react';
import { fmtDate } from '../components/ui.tsx';
import { errText, must, supabase } from '../supabase.ts';
import type { AuditRec } from '../types.ts';

export function AuditPage() {
  const [rows, setRows] = useState<AuditRec[]>([]);
  const [table, setTable] = useState(''), [rowId, setRowId] = useState(''), [actor, setActor] = useState(''), [onlyEvents, setOnlyEvents] = useState(false);
  const [before, setBefore] = useState<number | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let q = supabase.from('audit_log').select('*').order('id', { ascending: false }).limit(100);
    if (table) q = q.eq('table_name', table);
    if (rowId) q = q.eq('row_id', rowId.trim());
    if (actor) q = q.ilike('actor_label', `%${actor.trim()}%`);
    if (onlyEvents) q = q.not('event', 'is', null);
    if (before) q = q.lt('id', before);
    q.then(r => { try { setRows(must(r) as AuditRec[]); setError(''); } catch (e) { setError(errText(e)); } });
  }, [table, rowId, actor, onlyEvents, before]);
  return <div className="page">
    <h2>Audit log</h2>
    <div className="filters">
      <select value={table} onChange={e => { setTable(e.target.value); setBefore(null); }} aria-label="Table">
        <option value="">All tables</option>{['lessons', 'units', 'worlds', 'promos', 'media_assets', 'published_content', 'catalog_settings', 'admins', 'roles'].map(t => <option key={t}>{t}</option>)}</select>
      <input placeholder="Row id (e.g. isl1-l13)" value={rowId} onChange={e => { setRowId(e.target.value); setBefore(null); }} aria-label="Row id" />
      <input placeholder="Who" value={actor} onChange={e => { setActor(e.target.value); setBefore(null); }} aria-label="Who" />
      <label className="check"><input type="checkbox" checked={onlyEvents} onChange={e => setOnlyEvents(e.target.checked)} /> Publish / archive / approve only</label>
    </div>
    {error ? <p className="error">{error}</p> : null}
    <table className="list audit"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Row</th><th>Changed</th></tr></thead><tbody>
      {rows.map(r => <tr key={r.id}><td className="nowrap">{fmtDate(r.at)}</td><td>{r.actor_label}</td>
        <td>{r.event ? <b>{r.event}</b> : r.action}</td><td><span className="muted">{r.table_name}</span> <span className="mono">{r.row_id}</span></td>
        <td><details><summary>{r.changed?.join(', ') ?? (r.action === 'insert' ? 'new row' : 'whole row')}</summary>
          <pre className="code small">{JSON.stringify({ before: r.old_values, after: r.new_values }, null, 2)}</pre></details></td></tr>)}
    </tbody></table>
    {rows.length === 100 ? <button onClick={() => setBefore(rows[rows.length - 1]!.id)}>Older →</button> : null}
    {before ? <button onClick={() => setBefore(null)}>Back to the newest</button> : null}
  </div>;
}
