// Sign in (email + password), forgot password, set a new password. There is no sign-up: the owner adds admins.
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth.tsx';
import { Message, type Msg } from '../components/ui.tsx';
import { errText, supabase } from '../supabase.ts';

export function Login() {
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [msg, setMsg] = useState<Msg>(null), [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;   // the page asked for before signing in
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMsg({ kind: 'error', text: error.message === 'Invalid login credentials' ? 'Wrong email or password.' : errText(error) });
    else nav(from && from.startsWith('/') && !from.startsWith('//') ? from : '/content', { replace: true });
  }
  return <div className="auth-page"><form className="card auth" onSubmit={submit}>
    <h1>Koko admin</h1>
    <p className="muted">Sign in with the account the owner created for you.</p>
    <label className="field"><span className="label">Email</span>
      <input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label className="field"><span className="label">Password</span>
      <input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
    <Message msg={msg} />
    <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    <Link to="/forgot" className="small">Forgot your password, or setting it for the first time?</Link>
  </form></div>;
}

export function ForgotPassword() {
  const [email, setEmail] = useState(''), [msg, setMsg] = useState<Msg>(null), [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/reset` });
    setBusy(false);
    // same answer whether or not the address has an account (no account discovery)
    setMsg(error ? { kind: 'error', text: errText(error) }
      : { kind: 'ok', text: 'If this address has an account, an email with a link is on its way. Open it in this browser.' });
  }
  return <div className="auth-page"><form className="card auth" onSubmit={submit}>
    <h1>Set or reset your password</h1>
    <p className="muted">We email you a link. Open it in <b>this same browser</b>.</p>
    <label className="field"><span className="label">Email</span>
      <input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
    <Message msg={msg} />
    <button className="primary" disabled={busy}>Send the link</button>
    <Link to="/login" className="small">Back to sign in</Link>
  </form></div>;
}

export function ResetPassword() {
  const { session, refresh } = useAuth();
  const [pw, setPw] = useState(''), [pw2, setPw2] = useState(''), [msg, setMsg] = useState<Msg>(null);
  const nav = useNavigate();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 12) return setMsg({ kind: 'error', text: 'Use at least 12 characters.' });
    if (pw !== pw2) return setMsg({ kind: 'error', text: 'The two passwords are different.' });
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return setMsg({ kind: 'error', text: errText(error) });
    await refresh();
    nav('/content');
  }
  if (!session) return <div className="auth-page"><div className="card auth">
    <h1>Link expired</h1><p>This reset link is no longer valid, or it was opened in another browser.</p>
    <Link to="/forgot">Send a new link</Link></div></div>;
  return <div className="auth-page"><form className="card auth" onSubmit={submit}>
    <h1>Choose a new password</h1>
    <label className="field"><span className="label">New password (12+ characters)</span>
      <input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></label>
    <label className="field"><span className="label">Once more</span>
      <input type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></label>
    <Message msg={msg} />
    <button className="primary">Save the password</button>
  </form></div>;
}
