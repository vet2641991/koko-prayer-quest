// The signed-in frame: navigation, who is signed in, and the "Send to the site" button for publishers.
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth.tsx';
import { errText, supabase } from '../supabase.ts';
import { ActionButton, Message, type Msg } from './ui.tsx';

const ACTIONS_URL = 'https://github.com/vet2641991/koko-prayer-quest/actions/workflows/publish-content.yml';

export function Layout() {
  const { admin, role, perms, signOut } = useAuth();
  const [msg, setMsg] = useState<Msg>(null);
  async function sendToSite() {
    const { data, error } = await supabase.functions.invoke('request-export', { body: {} });
    if (error) {
      setMsg({ kind: 'error', text: `Could not start the export (${errText(error)}). You can start it by hand: GitHub → Actions → Publish content → Run workflow.` });
    } else setMsg({ kind: 'ok', text: (data as { message?: string })?.message ?? 'Export started. A pull request with the files will appear on GitHub in a minute or two.' });
  }
  return <div className="shell">
    <header className="top">
      <b>Koko admin</b>
      <nav>
        <NavLink to="/content">Content</NavLink>
        <NavLink to="/media">Media</NavLink>
        <NavLink to="/promos">Promos</NavLink>
        <NavLink to="/catalog">Catalog</NavLink>
        <NavLink to="/audit">Audit log</NavLink>
        {perms.manageAdmins ? <NavLink to="/admins">Admins</NavLink> : null}
      </nav>
      <span className="spacer" />
      {perms.publish ? <ActionButton className="primary" onRun={sendToSite}
        title="Writes everything that is published to the live site (opens a pull request on GitHub)">Send to the site</ActionButton> : null}
      <span className="who">{admin?.display_name} · {role?.label_en}</span>
      <button onClick={() => signOut()}>Sign out</button>
    </header>
    <Message msg={msg} onClose={() => setMsg(null)} />
    {msg?.kind === 'error' ? <p className="small"><a href={ACTIONS_URL} target="_blank" rel="noreferrer">Open the Publish content workflow</a></p> : null}
    <main><Outlet /></main>
  </div>;
}
