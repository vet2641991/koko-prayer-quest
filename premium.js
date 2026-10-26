/* Koko Premium on the website: the same rules as the phone app. Lessons the owner marks "premium" in catalog.json
   are locked until the family has Koko Premium; a parent signs in with an emailed 6-digit code (no password) and
   subscribes with Stripe. Everything for parents sits behind the parental gate. Nothing here slows the map down:
   the last answer is remembered on the device and checked again in the background. */
(() => {
'use strict';
const CONFIG_URL = 'https://pwgkxdiwqrxkndkyzwlw.supabase.co/functions/v1/public-config';
const K = { config: 'koko-config', session: 'koko-parent', access: 'koko-access' };
const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const write = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

let config = read(K.config);            // { supabaseUrl, publishableKey, stripe, portal }
let access = read(K.access);            // { premium, until, will_renew, sources, checkedAt }
const listeners = [];
const changed = () => listeners.forEach(f => { try { f(); } catch (e) {} });
const live = a => !!(a && a.premium && (a.until === null || Date.parse(a.until) > Date.now()));

const P = {
  /** Subscriptions are switched on for this site (the backend answered with its public settings). */
  get configured() { return !!(config && config.publishableKey); },
  get premium() { return live(access); },
  get until() { return access && access.until; },
  get sources() { return (access && access.sources) || []; },
  get parent() { const s = read(K.session); return s ? { email: s.email } : null; },
  get stripeOpen() { return !!(config && config.stripe); },
  get portalLoginUrl() { return config && config.portal; },
  isLocked(u) { return !!(u && u.premium === true && P.configured && !P.premium); },
  onChange(f) { listeners.push(f); },
};

function headers(token) {
  const h = { 'Content-Type': 'application/json', apikey: config.publishableKey };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
async function errorOf(r, fallback) {
  const b = await r.json().catch(() => ({}));
  return new Error(b.error || b.msg || b.error_description || fallback);
}
function toSession(b) {
  return { userId: b.user.id, email: b.user.email, accessToken: b.access_token, refreshToken: b.refresh_token, expiresAt: Date.now() + b.expires_in * 1000 };
}
async function token() {
  const s = read(K.session);
  if (!s || !P.configured) return null;
  if (s.expiresAt - Date.now() > 60000) return s.accessToken;
  const r = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: headers(), body: JSON.stringify({ refresh_token: s.refreshToken }) }).catch(() => null);
  if (!r) return s.accessToken;                       // offline: try with what we have
  if (!r.ok) { write(K.session, null); return null; } // signed out elsewhere, or the account was deleted
  const next = toSession(await r.json()); write(K.session, next); return next.accessToken;
}
async function fn(name, body) {
  const t = await token();
  const r = await fetch(`${config.supabaseUrl}/functions/v1/${name}`, { method: 'POST', headers: headers(t), body: JSON.stringify(body || {}) });
  if (!r.ok) throw await errorOf(r, 'Something went wrong. Please try again.');
  return r.json();
}

/** Asks the backend again: its settings, then this family's Koko Premium. */
P.refresh = async () => {
  try {
    const r = await fetch(CONFIG_URL, { cache: 'no-cache' });
    if (r.ok) { config = await r.json(); write(K.config, config); }
  } catch (e) { /* offline: keep the last settings */ }
  if (!P.configured) return changed();
  const t = await token().catch(() => null);
  if (!t) { access = null; write(K.access, null); return changed(); }
  try {
    const r = await fetch(`${config.supabaseUrl}/rest/v1/rpc/my_access`, { method: 'POST', headers: headers(t), body: '{}' });
    if (r.ok) { access = Object.assign(await r.json(), { checkedAt: Date.now() }); write(K.access, access); }
  } catch (e) { /* offline: the remembered answer counts until its end date */ }
  changed();
};
P.requestCode = async email => { await fn('parent-signin', { email: email.trim().toLowerCase() }); };
P.verifyCode = async (email, code) => {
  const r = await fetch(`${config.supabaseUrl}/auth/v1/verify`, { method: 'POST', headers: headers(), body: JSON.stringify({ type: 'email', email: email.trim().toLowerCase(), token: code.trim() }) });
  if (!r.ok) throw new Error('That code is not right or has expired. Ask for a new one.');
  write(K.session, toSession(await r.json()));
  await P.refresh();
};
P.signOut = async () => {
  const t = await token().catch(() => null);
  if (t) await fetch(`${config.supabaseUrl}/auth/v1/logout`, { method: 'POST', headers: headers(t) }).catch(() => {});
  write(K.session, null); write(K.access, null); access = null; changed();
};
P.deleteAccount = async () => { await fn('parent-delete'); write(K.session, null); write(K.access, null); access = null; changed(); };
P.checkout = async () => { const { url } = await fn('stripe-checkout'); location.assign(url); };
P.portal = async () => { const { url } = await fn('stripe-portal'); location.assign(url); };

/* The parental gate: a multiplication written in words, as in the app. */
const W = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
let passedAt = 0;
P.grownUpRecently = () => Date.now() - passedAt < 10 * 60000;
P.gate = (onPass, onCancel) => {
  let answer = 0;
  const box = document.createElement('div');
  box.className = 'gate';
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'For grown-ups');
  box.innerHTML = `<div class="gbox"><b style="font-size:21px">For grown-ups</b><p class="gnote">This part is for parents. Please ask a grown-up.</p>
    <p class="gq"></p><input inputmode="numeric" maxlength="3" aria-label="Answer"><p class="gwrong" hidden>Not quite. Here is a new question.</p>
    <div class="grow"><button class="btn ghost gcancel" type="button">Cancel</button><button class="btn gok" type="button">Continue</button></div></div>`;
  const q = box.querySelector('.gq'), inp = box.querySelector('input');
  const ask = () => { const a = 6 + Math.floor(Math.random() * 7), b = 3 + Math.floor(Math.random() * 7); answer = a * b; q.textContent = `What is ${W[a]} times ${W[b]}?`; inp.value = ''; inp.focus(); };
  const close = () => box.remove();
  box.querySelector('.gcancel').onclick = () => { close(); if (onCancel) onCancel(); };
  const go = () => {
    if (/^\s*\d+\s*$/.test(inp.value) && Number(inp.value) === answer) { passedAt = Date.now(); close(); onPass(); }
    else { box.querySelector('.gwrong').hidden = false; ask(); }
  };
  box.querySelector('.gok').onclick = go;
  inp.onkeydown = e => { if (e.key === 'Enter') go(); };
  document.body.appendChild(box); ask();
};

const css = document.createElement('style');
css.textContent = `.gate{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px;z-index:50}
.gbox{background:#fff;color:#14213D;border-radius:22px;padding:20px;width:100%;max-width:400px;display:flex;flex-direction:column;gap:10px}
.gnote{margin:0;font-weight:600;color:#5B6577}.gq{margin:0;font-size:20px;font-weight:800}.gwrong{margin:0;color:#d92d20;font-weight:700}
.gbox input,.kp-in{font:inherit;font-size:20px;padding:12px;border-radius:14px;border:2px solid #CFDCF7;text-align:center}
.grow{display:flex;gap:10px}.grow .btn{flex:1}.gbox .btn.ghost{background:#E8EEFC;color:#14213D;border:0}
.node.locked{opacity:.85}.node.locked .tag{font-size:16px}`;
document.head.appendChild(css);
window.KokoPremium = P;
P.refresh();
addEventListener('visibilitychange', () => { if (!document.hidden) P.refresh(); });
})();
