// Owner only: who can sign in, and with which role. New admins are added by the admin-invite Edge Function
// (there is no self-signup); they then set their password with "Forgot your password?" on the sign-in page.
import { useEffect, useState } from 'react';
import { useAuth } from '../auth.tsx';
import { ActionButton, Field, Message, fmtDate, type Msg } from '../components/ui.tsx';
import { errText, must, supabase } from '../supabase.ts';
import type { AdminRec, RoleRec } from '../types.ts';

export function AdminsPage() {
  const { perms, admin: me } = useAuth();
  const [admins, setAdmins] = useState<AdminRec[]>([]), [roles, setRoles] = useState<RoleRec[]>([]);
  const [invite, setInvite] = useState({ email: '', display_name: '', role: 'editor' });
  const [msg, setMsg] = useState<Msg>(null);
  const load = async () => {
    try {
      setAdmins(must(await supabase.from('admins').select('*').order('created_at')) as AdminRec[]);
      setRoles(must(await supabase.from('roles').select('*').order('sort')) as RoleRec[]);
    } catch (e) { setMsg({ kind: 'error', text: errText(e) }); }
  };
  useEffect(() => { load(); }, []);
  if (!perms.manageAdmins) return <p>Only the owner manages admins.</p>;
  const act = async (f: () => Promise<unknown>, ok: string) => { try { await f(); setMsg({ kind: 'ok', text: ok }); await load(); } catch (e) { setMsg({ kind: 'error', text: errText(e) }); } };
  return <div className="page">
    <h2>Admins</h2>
    <Message msg={msg} onClose={() => setMsg(null)} />
    <table className="list"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>Since</th></tr></thead><tbody>
      {admins.map(a => <tr key={a.user_id}><td>{a.display_name}</td><td>{a.email}</td>
        <td><select value={a.role} disabled={a.user_id === me?.user_id} onChange={e => act(async () => must(await supabase.from('admins').update({ role: e.target.value }).eq('user_id', a.user_id)), 'Role changed.')}>
          {roles.map(r => <option key={r.id} value={r.id}>{r.label_en}</option>)}</select></td>
        <td><input type="checkbox" checked={a.active} disabled={a.user_id === me?.user_id} aria-label="Active"
          onChange={e => act(async () => must(await supabase.from('admins').update({ active: e.target.checked }).eq('user_id', a.user_id)), e.target.checked ? 'Re-activated.' : 'Deactivated: they can no longer change anything.')} /></td>
        <td>{fmtDate(a.created_at)}</td></tr>)}
    </tbody></table>
    <h3>What each role can do</h3>
    <table className="list"><thead><tr><th>Role</th><th>Edit drafts</th><th>Publish</th><th>Approve sacred media</th><th>Manage admins</th></tr></thead><tbody>
      {roles.map(r => <tr key={r.id}><td>{r.label_en} <span className="ar inline">{r.label_ar}</span></td>
        {[r.can_edit_content, r.can_publish, r.can_approve_sacred, r.can_manage_admins].map((v, i) => <td key={i}>{v ? '✓' : '—'}</td>)}</tr>)}
    </tbody></table>
    <div className="card">
      <h3>Add an admin</h3>
      <div className="grid4">
        <Field label="Email"><input type="email" value={invite.email} onChange={e => setInvite({ ...invite, email: e.target.value })} /></Field>
        <Field label="Name"><input value={invite.display_name} onChange={e => setInvite({ ...invite, display_name: e.target.value })} /></Field>
        <Field label="Role"><select value={invite.role} onChange={e => setInvite({ ...invite, role: e.target.value })}>{roles.map(r => <option key={r.id} value={r.id}>{r.label_en}</option>)}</select></Field>
      </div>
      <ActionButton className="primary" disabled={!invite.email || !invite.display_name} onRun={() => act(async () => {
        const { data, error } = await supabase.functions.invoke('admin-invite', { body: invite });
        if (error) throw new Error((await (error as { context?: Response }).context?.json?.().catch(() => null))?.error ?? errText(error));
        setInvite({ email: '', display_name: '', role: 'editor' });
        return data;
      }, 'Added. Ask them to open the dashboard and use “Forgot your password?” to set their password.')}>Add admin</ActionButton>
    </div>
  </div>;
}
