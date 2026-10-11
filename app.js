/* Koko's Quest — data-driven learning app for Haitham (DHM Institute).
   Content lives in content/catalog.json + one JSON per lesson; this file never
   needs editing to add a lesson. Progress is saved on the device only. */
(() => {
'use strict';

/* ---------- tiny helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const today = () => new Date().toISOString().slice(0, 10);
const AR = (t, cls = '') => `<span class="ar ${cls}" lang="ar" dir="rtl">${esc(t)}</span>`;
const ICON = {
  back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  star: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6z"/></svg>',
  speak: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14"/></svg>',
  mic: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>',
  map: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/></svg>',
  globe: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></svg>',
  book: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19V5M9 7h6"/></svg>',
  family: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c2.8 0 6 1.7 6 5"/></svg>'
};
let RT = 0; // route token: delayed actions die when the screen changes
const later = (fn, ms) => { const t = RT; setTimeout(() => { if (t === RT) fn(); }, ms); };
const IMG = { wave: 'media/koko-wave.png', cheer: 'media/koko-cheer.png', pray: 'media/koko-pray.png', logo: 'media/dhm-logo.png' };

/* ---------- saved progress (this device only) ---------- */
const KEY = 'koko-quest-v2';
let S = { stars: {}, step: {}, words: {}, time: {}, days: [], last: null };
try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.stars) S = Object.assign(S, s); } catch (e) {}
try { // carry over stars from the first version of the site
  const old = JSON.parse(localStorage.getItem('haitham-quest-v1') || 'null');
  if (old && old.stars && old.stars['1'] && !S.stars['prayer-l01']) S.stars['prayer-l01'] = old.stars['1'];
} catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const totalStars = () => Object.values(S.stars).reduce((a, b) => a + b, 0);
const wordKey = (L, w) => `${L.id}|${w.id}`;
function markWord(L, w, ok) {
  const k = wordKey(L, w), r = S.words[k] || { seen: 0, right: 0, wrong: 0 };
  if (ok === null) r.seen++; else if (ok) r.right++; else r.wrong++;
  S.words[k] = r; save();
}
function tick(sec) { // learning time per day + streak
  const d = today(); S.time[d] = (S.time[d] || 0) + sec;
  if (!S.days.includes(d)) S.days.push(d);
  save();
}
function streak() {
  let n = 0; const d = new Date();
  for (;;) { const k = d.toISOString().slice(0, 10); if (!S.days.includes(k)) break; n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* ---------- content ---------- */
let CAT = null; const LES = {};
async function catalog() { if (!CAT) CAT = await (await fetch('content/catalog.json', { cache: 'no-cache' })).json(); return CAT; }
async function lesson(id) {
  if (LES[id]) return LES[id];
  const u = unitById(id); if (!u || !u.file) return null;
  LES[id] = await (await fetch(u.file, { cache: 'no-cache' })).json();
  return LES[id];
}
const unitById = id => { for (const w of CAT.worlds) for (const u of w.units) if (u.id === id) return Object.assign({ world: w }, u); return null; };
const ready = u => !!u.file;
const done = u => (S.stars[u.id] || 0) > 0;
function nextUnit() {
  const order = [CAT.worlds.find(w => w.id === CAT.focus), ...CAT.worlds.filter(w => w.id !== CAT.focus)].filter(Boolean);
  for (const w of order) for (const u of w.units) if (ready(u) && !done(u)) return Object.assign({ world: w }, u);
  return null;
}

/* ---------- audio ---------- */
const player = new Audio();
let audioToken = 0;
function play(src) {
  return new Promise(res => {
    if (!src) return res(false);
    player.onended = () => res(true); player.onerror = () => res(false);
    player.src = src; player.play().catch(() => res(false));
  });
}
// English meanings are spoken by the device's own voice (free, unlimited); Arabic always uses the recorded Google AI Studio clips.
let enVoice = null;
function pickVoice() { const v = (speechSynthesis.getVoices ? speechSynthesis.getVoices() : []).filter(x => /^en[-_]/i.test(x.lang));
  enVoice = v.find(x => /female|samantha|zira|google uk english female|aria|jenny/i.test(x.name)) || v.find(x => /en[-_](GB|US)/i.test(x.lang)) || v[0] || null; }
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speakEn(text) {
  return new Promise(res => {
    if (!('speechSynthesis' in window) || !text) return res(false);
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'en-GB'; u.rate = .9; u.pitch = 1.05; if (enVoice) u.voice = enVoice;
    u.onend = () => res(true); u.onerror = () => res(false); speechSynthesis.speak(u);
    setTimeout(() => res(false), 8000);
  });
}
async function playSeq(items) { const t = ++audioToken; if ('speechSynthesis' in window) speechSynthesis.cancel();
  for (const s of items) { if (t !== audioToken) return; if (s && typeof s === 'object') await speakEn(s.en); else await play(s); await new Promise(r => setTimeout(r, 250)); } }
const aud = (L, name) => `audio/${L.id}/${name}.mp3`;
const sayWord = (L, w, which = 'both') => playSeq(which === 'ar' ? [aud(L, `w-${w.id}-ar`)] : which === 'en' ? [{ en: w.en }] : [aud(L, `w-${w.id}-ar`), { en: w.en }]);
const sayLine = (L, d, which = 'both') => playSeq(which === 'ar' ? [aud(L, `d-${d.id}-ar`)] : [aud(L, `d-${d.id}-ar`), { en: d.en }]);
let ac;
function blip(freqs, dur = .12, type = 'triangle') {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    freqs.forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + i * .09;
      o.type = type; o.frequency.value = f; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.16, t + .02);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + .05); });
  } catch (e) {}
}
const sfx = { right: () => blip([660, 880, 1175]), wrong: () => blip([300, 220], .16, 'sawtooth'), win: () => blip([523, 659, 784, 1047], .22) };

/* ---------- confetti ---------- */
const cv = $('#confetti'), cx = cv.getContext('2d'); let bits = [];
function confetti() {
  cv.width = innerWidth; cv.height = innerHeight; const cols = ['#FFC629', '#1E6BFF', '#22C55E', '#FF5A5F', '#ffffff'];
  for (let i = 0; i < 140; i++) bits.push({ x: innerWidth / 2, y: innerHeight / 3, vx: (Math.random() - .5) * 14, vy: Math.random() * -12 - 4, s: 6 + Math.random() * 7, c: cols[i % 5], r: Math.random() * 6, life: 120 });
  requestAnimationFrame(frame);
}
function frame() {
  cx.clearRect(0, 0, cv.width, cv.height); bits = bits.filter(b => b.life-- > 0);
  bits.forEach(b => { b.vy += .35; b.x += b.vx; b.y += b.vy; b.r += .2; cx.save(); cx.translate(b.x, b.y); cx.rotate(b.r); cx.fillStyle = b.c; cx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); cx.restore(); });
  if (bits.length) requestAnimationFrame(frame); else cx.clearRect(0, 0, cv.width, cv.height);
}

/* ---------- shell ---------- */
const app = $('#app');
function nav(on) {
  const it = (h, k, i, t) => `<a href="${h}" class="${on === k ? 'on' : ''}">${ICON[i]}${t}</a>`;
  return `<nav class="nav" aria-label="Main">${it('#/', 'home', 'map', 'Map')}${it('#/worlds', 'worlds', 'globe', 'Worlds')}${it('#/words', 'words', 'book', 'My words')}${it('#/parents', 'parents', 'family', 'Parents')}</nav>`;
}
const topbar = () => `<header class="top"><img class="avatar" src="${IMG.wave}" alt="Koko"><div class="hello"><b>Hi, Teacher Haitham!</b><span>Koko is ready to learn from you</span></div><div class="pill" aria-label="Stars">${ICON.star}<span>${totalStars()}</span></div></header>`;
const bar = (pct, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.round(pct)}%"></i></div>`;
function render(html, opts = {}) {
  app.innerHTML = html;
  document.body.style.background = opts.bg || '#0B4FD8';
  scrollTo(0, 0);
}

/* ---------- screens: home / worlds / words / parents ---------- */
function unitNode(u, cur) {
  const st = S.stars[u.id] || 0;
  const cls = !ready(u) ? 'soon' : (cur && cur.id === u.id ? 'now' : st ? '' : 'open');
  const tag = !ready(u) ? 'soon' : cur && cur.id === u.id ? 'NOW' : st ? '★'.repeat(st) : 'play';
  const inner = `<div class="dot">${esc(u.n)}</div><div class="t">${AR(u.ar)}<small>${esc(u.en)}</small></div><span class="tag">${tag}</span>`;
  return ready(u) ? `<a class="node ${cls}" href="#/lesson/${u.id}">${inner}</a>` : `<div class="node soon">${inner}</div>`;
}
function worldCard(w) {
  const built = w.units.filter(ready).length, fin = w.units.filter(done).length;
  const meta = !w.units.length ? 'Coming soon' : `${fin} of ${w.units.length} done${built < w.units.length ? ` · ${w.units.length - built} coming soon` : ''}`;
  return `<a class="world" href="#/world/${w.id}"><div class="ic" style="background:${w.tint};color:${w.ink}">${esc(w.en.match(/\d/) ? w.en.match(/\d/)[0] : '★')}</div>
    <div class="t"><b>${esc(w.en)}</b>${AR(w.ar)}${bar(w.units.length ? fin / w.units.length * 100 : 0)}<small>${meta}</small></div></a>`;
}
function reviewList() {
  return Object.entries(S.words).filter(([, r]) => r.wrong > r.right).map(([k]) => k);
}
async function home(worldId) {
  await catalog();
  const cur = nextUnit();
  const w = CAT.worlds.find(x => x.id === (worldId || (cur && cur.world.id) || CAT.focus));
  let cont = '';
  if (cur) {
    const L = await lesson(cur.id), steps = stepsFor(L), at = Math.min(S.step[cur.id] || 0, steps.length);
    cont = `<section class="card cont"><span class="over">Continue · ${esc(cur.world.en)} · ${cur.world.id.startsWith('ar') ? 'Unit' : 'Level'} ${esc(cur.n)}</span>
      <div class="head"><div>${AR(L.title.ar)}<h2>${esc(L.title.en)}</h2><div class="meta"><span>${esc(L.topic || '')}</span></div></div><img src="${IMG.cheer}" alt="Koko cheering"></div>
      <div class="meta"><span>Step ${Math.min(at + 1, steps.length)} of ${steps.length}</span><span>about ${L.minutes || 10} min</span></div>${bar(at / steps.length * 100)}
      <a class="btn" href="#/lesson/${cur.id}">${at ? 'Continue' : 'Play'} — teach Koko</a></section>`;
  } else {
    cont = `<section class="card cont"><div class="head"><div><h2>You finished every lesson that is ready!</h2><div class="meta"><span>New lessons are on the way. Replay any lesson to win more stars.</span></div></div><img src="${IMG.cheer}" alt="Koko cheering"></div></section>`;
  }
  const rv = reviewList();
  const review = rv.length ? `<a class="card cont" href="#/review" style="text-decoration:none;margin-top:12px"><span class="over">Quick review · 2 min</span><h2>Koko forgot ${rv.length} word${rv.length > 1 ? 's' : ''}. Help him remember!</h2></a>` : '';
  const map = `<div class="sec"><h3>${esc(w.en)}</h3>${AR(w.ar)}</div><div class="path">${w.units.map(u => unitNode(u, cur)).join('') || '<p>Lessons for this world are coming soon.</p>'}</div>`;
  const side = `<aside class="side">${CAT.worlds.map(worldCard).join('')}<a class="tbtn" href="#/parents" style="margin-top:8px">For parents</a></aside>`;
  render(`<div class="screen home dots">${side}<div>${topbar()}${cont}${review}${map}<footer class="brand"><img src="${IMG.logo}" alt="DHM Institute">Made for Haitham by DHM Institute</footer></div></div>${nav('home')}`);
}
async function worlds() {
  await catalog();
  render(`<div class="screen dots"><header class="top"><a class="back" href="#/" aria-label="Back">${ICON.back}</a><div class="hello"><b style="font-size:22px">Choose a world</b>${AR('اخْتَرْ عَالَمًا')}</div></header>
    ${CAT.worlds.map(worldCard).join('')}<p style="font-weight:600">New worlds and lessons appear here as soon as they are added. Nothing you finished is ever lost.</p></div>${nav('worlds')}`);
}
async function myWords() {
  await catalog();
  const keys = Object.keys(S.words); const items = [];
  for (const k of keys) { const [lid, wid] = k.split('|'); const L = await lesson(lid); const w = L && (L.words || []).find(x => x.id === wid); if (w) items.push({ L, w }); }
  render(`<div class="screen dots"><header class="top"><a class="back" href="#/" aria-label="Back">${ICON.back}</a><div class="hello"><b style="font-size:22px">My words</b><span>${items.length} words · tap to hear Arabic, then English</span></div></header>
    <div class="chips" style="justify-content:flex-start">${items.map((x, i) => `<button class="chip" data-i="${i}">${AR(x.w.ar)}<small>${esc(x.w.en)}</small></button>`).join('') || '<p>Words you learn will collect here.</p>'}</div></div>${nav('words')}`);
  app.querySelectorAll('.chip').forEach(b => b.onclick = () => { const x = items[+b.dataset.i]; sayWord(x.L, x.w); });
}
async function parents() {
  await catalog();
  const lastU = S.last && unitById(S.last), L = lastU && ready(lastU) ? await lesson(lastU.id) : null;
  const learned = Object.values(S.words).filter(r => r.seen || r.right).length;
  const mins = Math.round((S.time[today()] || 0) / 60);
  const note = CAT.teacherNote && CAT.teacherNote.text ? `<div class="pcard"><div class="k">Note from Dr. Hassan</div><p style="margin:4px 0 0;font-weight:600">${esc(CAT.teacherNote.text)}</p></div>` : '';
  const P = L && L.parents;
  const tryAud = P && P.tryAudio ? aud(L, P.tryAudio) : null;
  render(`<div class="parents"><div class="phead"><div class="in"><div style="display:flex;align-items:center;gap:10px"><a class="back" href="#/" aria-label="Back" style="background:rgba(251,249,243,.12)">${ICON.back}</a><h1>For parents</h1><img src="${IMG.logo}" alt="DHM Institute"></div>
    <span style="font-weight:600">What Haitham is learning, in two minutes.</span></div></div>
    <div class="body"><div class="stat3"><div><b>${mins}</b><span>minutes today</span></div><div><b>${learned}</b><span>words learned</span></div><div><b>${streak()}</b><span>days in a row</span></div></div>
    ${L ? `<div class="pcard"><div class="k">Latest · ${esc(lastU.world.en)}</div><b style="font-size:17px">${esc(L.title.en)}</b> ${AR(L.title.ar)}<p style="margin:4px 0 0;font-weight:600;color:#46615c">${esc(P ? P.summary : L.topic)}</p></div>` : '<div class="pcard">Haitham has not started a lesson on this device yet.</div>'}
    ${P && P.try ? `<div class="try"><b style="color:#042a2e">Try this at home (2 minutes)</b><span style="font-weight:600">${esc(P.tip || '')}</span>
      <div class="tryline">${tryAud ? `<button id="tryplay" aria-label="Play">${ICON.speak}</button>` : ''}<div>${AR(P.try.ar)}<div style="font-size:13px;font-weight:700;color:#46615c">“${esc(P.try.translit)}” · ${esc(P.try.en)}</div></div></div></div>` : ''}
    ${note}<a class="tbtn" href="#/">Back to Haitham’s map</a><p style="text-align:center;font-size:12px;color:#647d78;margin:0">Made for Haitham by DHM Institute · progress is saved on this device only</p></div></div>`, { bg: '#fbf9f3' });
  const tp = $('#tryplay'); if (tp) tp.onclick = () => play(tryAud);
}

/* ---------- lesson engine ---------- */
function stepsFor(L) {
  const s = [];
  if (L.video) s.push({ k: 'story', en: "Koko's story", sub: 'Watch the cartoon', min: 3 });
  if (L.words && L.words.length) s.push({ k: 'words', en: 'New words', sub: 'Hear each word, then its meaning', min: 2 });
  for (const g of L.games || []) {
    if (g === 'listen') s.push({ k: 'listen', en: 'Listen & choose', sub: 'Tap the word Koko says', min: 2 });
    if (g === 'match') s.push({ k: 'match', en: 'Match the pairs', sub: 'Arabic word ↔ English meaning', min: 2 });
    if (g === 'order' && L.order) s.push({ k: 'order', en: 'Put them in order', sub: L.order.en, min: 2 });
  }
  if (L.talk && L.talk.length) s.push({ k: 'talk', en: 'Talk with Koko', sub: 'Teach Koko the dialogue', min: 3 });
  if (L.quiz && L.quiz.length) s.push({ k: 'quiz', en: "Koko's questions", sub: 'Tap the right answer', min: 2 });
  if (L.move) s.push({ k: 'move', en: 'Move!', sub: L.move.en, min: 1 });
  return s;
}
let SESSION = null;
async function lessonPath(id) {
  await catalog(); const u = unitById(id); const L = await lesson(id);
  if (!L) return home();
  S.last = id; save();
  const steps = stepsFor(L), at = Math.min(S.step[id] || 0, steps.length);
  const li = steps.map((s, i) => {
    const cls = i < at ? 'done' : i === at ? 'now' : 'later';
    const inner = `<div class="dot">${i < at ? '✓' : i + 1}</div><div class="t"><b>${esc(s.en)}</b><small>${esc(s.sub)}</small></div><small style="font-weight:800">${s.min} min</small>`;
    return i <= at ? `<li><a class="step ${cls}" href="#/lesson/${id}/${i}">${inner}</a></li>` : `<li><div class="step later">${inner}</div></li>`;
  }).join('');
  render(`<div class="screen light" style="padding:0 0 40px"><div class="lhead"><div class="inner" style="max-width:560px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:8px">
    <div style="display:flex;align-items:center;gap:10px"><a class="back" href="#/world/${u.world.id}" aria-label="Back to map">${ICON.back}</a><b style="opacity:.9">${esc(u.world.en)} · ${esc(u.n)}</b><span class="pill" style="margin-left:auto;font-size:14px">about ${L.minutes || 10} min</span></div>
    ${AR(L.title.ar)}<h1>${esc(L.title.en)}</h1><div class="meta" style="color:#fff"><span>${at} of ${steps.length} steps done</span><span>Koko: “Teach me!”</span></div>${bar(at / steps.length * 100, 'on-blue')}</div></div>
    <div class="inner" style="padding:0 16px"><ol class="steps">${li}</ol>
    <a class="btn" href="#/lesson/${id}/${Math.min(at, steps.length - 1)}">${at >= steps.length ? 'Play again' : at ? 'Continue' : 'Start'}</a></div></div>`, { bg: '#F2F6FF' });
}
async function runStep(id, i) {
  await catalog(); const L = await lesson(id); if (!L) return home();
  const steps = stepsFor(L); i = Math.max(0, Math.min(i, steps.length - 1));
  if (!SESSION || SESSION.id !== id) SESSION = { id, mistakes: 0 };
  S.last = id; save();
  const st = steps[i];
  const finish = () => {
    S.step[id] = Math.max(S.step[id] || 0, i + 1); save();
    if (i + 1 < steps.length) location.hash = `#/lesson/${id}/${i + 1}`; else win(L);
  };
  const head = (title, sub) => `<header class="top"><a class="back" href="#/lesson/${id}" aria-label="Back to lesson">${ICON.back}</a><div class="hello"><b>${esc(title)}</b><span>${esc(sub)}</span></div><span class="pill" style="font-size:14px">${i + 1} / ${steps.length}</span></header>${bar((i + .5) / steps.length * 100, 'on-blue')}`;
  ({ story, words, listen, match, order, talk, quiz, move })[st.k](L, st, head, finish);
}

/* step: story video */
function story(L, st, head, finish) {
  render(`<div class="screen dots act">${head(st.en, L.title.en)}<div class="card" style="padding:12px">${AR(L.title.ar)}
    <video id="vid" src="${esc(L.video.src)}" poster="${esc(L.video.poster || '')}" controls playsinline preload="metadata"></video>
    <p id="vh" style="margin:10px 0 0;font-weight:600;color:var(--muted)">Watch to the end to go on.</p></div>
    <button class="btn" id="go" ${S.step[L.id] > 0 ? '' : 'hidden'}>Next →</button></div>`);
  const v = $('#vid'), go = $('#go');
  v.addEventListener('timeupdate', () => { if (v.duration && v.currentTime / v.duration > .9) { go.hidden = false; $('#vh').textContent = 'Well done! Tap Next.'; } });
  v.addEventListener('ended', finish); go.onclick = () => { v.pause(); finish(); };
}

/* step: word cards (Arabic then English, spoken) */
function words(L, st, head, finish) {
  let k = 0; const W = L.words;
  const show = () => {
    const w = W[k];
    render(`<div class="screen dots act">${head(st.en, `${k + 1} of ${W.length}`)}
      <div class="bigcard">${w.badge ? `<div class="badge">${esc(w.badge)}</div>` : ''}${AR(w.ar, 'word-ar')}<div class="word-en">${esc(w.en)}</div>
        <div class="say"><button id="pa">${ICON.speak}Arabic</button><button id="pe" class="soft">${ICON.speak}English</button></div></div>
      <div class="koko-say"><img src="${IMG.wave}" alt=""><span>Teacher Haitham, say it out loud so I can copy you!</span></div>
      <div class="row"><button class="btn soft" id="pv" ${k ? '' : 'disabled style="opacity:.5"'}>Back</button><button class="btn" id="nx" style="flex:2">${k + 1 < W.length ? 'I said it — next' : 'Done!'}</button></div></div>`);
    markWord(L, w, null); sayWord(L, w);
    $('#pa').onclick = () => sayWord(L, w, 'ar'); $('#pe').onclick = () => sayWord(L, w, 'en');
    $('#pv').onclick = () => { if (k) { k--; show(); } };
    $('#nx').onclick = () => { if (++k < W.length) show(); else finish(); };
  };
  show();
}

/* step: listen & choose */
function listen(L, st, head, finish, pool) {
  const W = pool || L.words.map(w => ({ L, w }));
  const rounds = shuffle(W).slice(0, Math.min(6, W.length)); let r = 0;
  const show = () => {
    const tgt = rounds[r];
    const same = W.filter(x => x.L.id === tgt.L.id && x.w.id !== tgt.w.id);
    const opts = shuffle([tgt, ...shuffle(same).slice(0, 3)]);
    render(`<div class="screen dots act">${head(st.en, `Round ${r + 1} of ${rounds.length}`)}
      <div style="text-align:center"><button class="playbig" id="again" aria-label="Play the word again">${ICON.speak.replace(/20/g, '52')}</button><p style="font-weight:800;font-size:18px;margin:10px 0 0">Koko says a word. Which one is it?</p></div>
      <div class="grid2">${opts.map((o, j) => `<button class="opt" data-j="${j}">${AR(o.w.ar)}<small>${esc(o.w.en)}</small></button>`).join('')}</div>
      <div class="koko-say" id="fb" hidden><img src="${IMG.cheer}" alt=""><span></span></div></div>`);
    const hear = () => sayWord(tgt.L, tgt.w, 'ar'); hear(); $('#again').onclick = hear;
    let missed = false;
    app.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      const o = opts[+b.dataset.j], fb = $('#fb');
      if (o === tgt) {
        b.classList.add('right'); sfx.right(); markWord(tgt.L, tgt.w, !missed);
        fb.hidden = false; fb.className = 'koko-say good'; fb.querySelector('span').textContent = `Yes! “${tgt.w.en}”. You taught me!`;
        app.querySelectorAll('.opt').forEach(x => x.disabled = true);
        sayWord(tgt.L, tgt.w, 'en');
        later(() => { if (++r < rounds.length) show(); else finish(); }, 1400);
      } else {
        missed = true; SESSION.mistakes++; b.classList.remove('wrong'); void b.offsetWidth; b.classList.add('wrong'); sfx.wrong();
        fb.hidden = false; fb.className = 'koko-say bad'; fb.querySelector('span').textContent = 'Hmm, listen again!'; hear();
      }
    });
  };
  show();
}

/* step: match Arabic ↔ English */
function match(L, st, head, finish) {
  const set = shuffle(L.words).slice(0, Math.min(5, L.words.length));
  const left = shuffle(set), right = shuffle(set); let pick = null, left_n = set.length;
  render(`<div class="screen dots act">${head(st.en, 'Tap an Arabic word, then its meaning')}
    <div class="grid2" style="flex:1;align-content:start"><div style="display:flex;flex-direction:column;gap:10px">${left.map(w => `<button class="opt" style="min-height:76px" data-a="${w.id}">${AR(w.ar)}</button>`).join('')}</div>
    <div style="display:flex;flex-direction:column;gap:10px">${right.map(w => `<button class="opt" style="min-height:76px" data-e="${w.id}"><b style="font-size:19px">${esc(w.en)}</b></button>`).join('')}</div></div>
    <div class="koko-say"><img src="${IMG.wave}" alt=""><span>Find the pairs for me, Teacher!</span></div></div>`);
  app.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
    app.querySelectorAll('[data-a]').forEach(x => x.classList.remove('picked')); b.classList.add('picked'); pick = b;
    sayWord(L, L.words.find(w => w.id === b.dataset.a), 'ar');
  });
  app.querySelectorAll('[data-e]').forEach(b => b.onclick = () => {
    if (!pick) return;
    const w = L.words.find(x => x.id === pick.dataset.a);
    if (b.dataset.e === pick.dataset.a) {
      sfx.right(); markWord(L, w, true); pick.classList.add('gone'); b.classList.add('gone'); pick = null;
      if (--left_n === 0) later(finish, 600);
    } else { SESSION.mistakes++; markWord(L, w, false); sfx.wrong(); b.classList.remove('wrong'); void b.offsetWidth; b.classList.add('wrong'); }
  });
}

/* step: put in order */
function order(L, st, head, finish) {
  const seq = L.order.ids.map(id => L.words.find(w => w.id === id)).filter(Boolean);
  const tiles = shuffle(seq); let n = 0;
  render(`<div class="screen dots act">${head(st.en, L.order.en)}
    <div class="orderbox" id="box" aria-live="polite"></div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">${tiles.map(w => `<button class="tile" data-id="${w.id}">${AR(w.ar)}<small>${esc(w.en)}</small></button>`).join('')}</div>
    <div class="koko-say"><img src="${IMG.wave}" alt=""><span>Who is first? Tap them in order, Teacher!</span></div></div>`);
  app.querySelectorAll('.tile').forEach(b => b.onclick = () => {
    const w = seq[n];
    if (b.dataset.id === w.id) { sfx.right(); sayWord(L, w, 'ar'); $('#box').appendChild(b); b.disabled = true; markWord(L, w, true); if (++n === seq.length) later(finish, 900); }
    else { SESSION.mistakes++; sfx.wrong(); b.classList.remove('wrong'); void b.offsetWidth; b.style.animation = 'shake .35s'; setTimeout(() => b.style.animation = '', 400); }
  });
}

/* step: talk with Koko (Koko plays one speaker, Haitham the other) */
function talk(L, st, head, finish) {
  const D = Object.fromEntries(L.dialogue.map(d => [d.id, d]));
  const name = who => (L.speakers && L.speakers[who] && L.speakers[who].playedBy === 'koko') ? 'Koko' : 'You (Teacher Haitham)';
  let t = 0; const log = [];
  let rec = null, chunks = [], myUrl = null;
  const msg = (d, me) => `<div class="msg ${me ? 'me' : ''}"><small>${name(d.who)}</small>${AR(d.ar)}<span class="en">${esc(d.en)}</span><button data-say="${d.id}">${ICON.speak.replace(/20/g, '16')} hear</button></div>`;
  const show = (answered) => {
    const ex = L.talk[t];
    const chat = log.map(([d, me]) => msg(d, me)).join('');
    const choices = answered ? '' : shuffle([ex.answer, ...ex.wrong]).map(id => `<button class="choice" data-c="${id}">${AR(D[id].ar)}<small>${esc(D[id].en)}</small></button>`).join('');
    const tray = answered
      ? `<b style="color:var(--muted)">Now say it out loud — be the teacher!</b>
         <div class="rec"><button class="btn blue" id="rec">${ICON.mic} Record</button><button class="btn soft" id="mine" ${myUrl ? '' : 'hidden'}>${ICON.speak} My voice</button></div>
         <button class="btn" id="nx">${t + 1 < L.talk.length ? 'Next question' : 'Finish'}</button>`
      : `<b style="color:var(--muted)">Pick the best answer for Koko:</b>${choices}`;
    render(`<div class="screen dots act">${head(st.en, `Question ${t + 1} of ${L.talk.length}`)}<div class="chat">${chat}</div><div class="tray">${tray}</div></div>`);
    app.querySelectorAll('[data-say]').forEach(b => b.onclick = () => sayLine(L, D[b.dataset.say]));
    if (!answered) {
      app.querySelectorAll('.choice').forEach(b => b.onclick = () => {
        if (b.dataset.c === ex.answer) { sfx.right(); log.push([D[ex.answer], true]); myUrl = null; show(true); sayLine(L, D[ex.answer]); }
        else { SESSION.mistakes++; sfx.wrong(); b.classList.remove('wrong'); void b.offsetWidth; b.classList.add('wrong'); }
      });
    } else {
      $('#nx').onclick = () => { if (rec && rec.state === 'recording') rec.stop(); if (++t < L.talk.length) ask(); else finish(); };
      const rb = $('#rec'), mb = $('#mine');
      mb.onclick = () => play(myUrl);
      rb.onclick = async () => {
        if (rec && rec.state === 'recording') { rec.stop(); return; }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          rec = new MediaRecorder(stream); chunks = [];
          rec.ondataavailable = e => chunks.push(e.data);
          rec.onstop = () => { stream.getTracks().forEach(x => x.stop()); myUrl = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType })); rb.innerHTML = `${ICON.mic} Record again`; mb.hidden = false; play(myUrl); };
          rec.start(); rb.innerHTML = `${ICON.mic} Stop`; setTimeout(() => rec.state === 'recording' && rec.stop(), 8000);
        } catch (e) { rb.textContent = 'Microphone not available — just say it out loud!'; rb.disabled = true; }
      };
    }
    app.querySelector('.chat').lastElementChild?.scrollIntoView({ block: 'end' });
  };
  const ask = () => { const d = D[L.talk[t].ask]; log.push([d, false]); show(false); sayLine(L, d); };
  ask();
}

/* step: multiple-choice questions */
function quiz(L, st, head, finish) {
  let q = 0;
  const show = () => {
    const Q = L.quiz[q]; const order = shuffle(Q.opts.map((o, j) => j));
    render(`<div class="screen dots act">${head(st.en, `Question ${q + 1} of ${L.quiz.length}`)}
      <div class="koko-say"><img src="${IMG.wave}" alt=""><span>Koko asks you a question. Tap the right answer!</span></div>
      <div class="card" style="text-align:center">${AR(Q.ar)}<p style="margin:0;font-weight:700;color:var(--muted)">${esc(Q.en)}</p></div>
      <div style="display:flex;flex-direction:column;gap:10px">${order.map(j => `<button class="opt" style="min-height:84px" data-j="${j}">${AR(Q.opts[j][0])}<small>${esc(Q.opts[j][1])}</small></button>`).join('')}</div></div>`);
    app.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      if (Q.opts[+b.dataset.j][2]) { b.classList.add('right'); sfx.right(); app.querySelectorAll('.opt').forEach(x => x.disabled = true); later(() => { if (++q < L.quiz.length) show(); else finish(); }, 900); }
      else { SESSION.mistakes++; sfx.wrong(); b.classList.remove('wrong'); void b.offsetWidth; b.classList.add('wrong'); }
    });
  };
  show();
}

/* step: move */
function move(L, st, head, finish) {
  render(`<div class="screen dots act">${head(st.en, 'Up you get!')}
    <div class="bigcard"><img src="${IMG.cheer}" alt="Koko" style="width:180px;height:180px;border-radius:50%;object-fit:cover;border:6px solid var(--yellow)">
      ${AR(L.move.ar, 'word-ar" style="font-size:30px')}<p style="margin:0;font-size:19px;font-weight:700">${esc(L.move.en)}</p>
      <div class="say"><button id="hm">${ICON.speak}Hear it</button></div></div>
    <button class="btn blue" id="did">I did it!</button></div>`);
  const hear = () => playSeq([aud(L, 'x-move-ar'), { en: L.move.en }]);
  hear(); $('#hm').onclick = hear; $('#did').onclick = () => { sfx.right(); finish(); };
}

/* reward */
function win(L) {
  const m = SESSION ? SESSION.mistakes : 0, stars = m <= 1 ? 3 : m <= 4 ? 2 : 1;
  S.stars[L.id] = Math.max(S.stars[L.id] || 0, stars); S.step[L.id] = 0; save(); SESSION = null;
  const chips = (L.words || []).slice(0, 12).map((w, i) => `<button class="chip" data-i="${i}">${AR(w.ar)}<small>${esc(w.en)}</small></button>`).join('');
  render(`<div class="screen dots"><div class="win"><span class="over" style="color:#fff">Lesson complete</span><img src="${IMG.cheer}" alt="Koko cheering">
    ${AR('أَحْسَنْتَ يَا هَيْثَمُ!')}<b style="font-size:20px;margin-top:-8px">Well done, Haitham! Koko learned it from you.</b>
    <div class="stars" role="img" aria-label="${stars} of 3 stars">${[1, 2, 3].map(i => `<svg viewBox="0 0 24 24" class="${i <= stars ? 'on' : ''}"><path d="M12 2l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6z"/></svg>`).join('')}</div>
    ${chips ? `<div class="card" style="width:100%"><span class="over">Words you taught Koko</span><div class="chips" style="margin-top:8px">${chips}</div></div>` : ''}
    <a class="btn" href="#/parents">Show Mum and Dad</a>${stars < 3 ? `<a class="btn ghost" href="#/lesson/${L.id}/0">Try again for 3 stars</a>` : ''}<a class="btn ghost" href="#/">Back to the map</a></div></div>`);
  app.querySelectorAll('.chip').forEach(b => b.onclick = () => sayWord(L, L.words[+b.dataset.i]));
  sfx.win(); confetti();
}

/* review of forgotten words, across lessons */
async function review() {
  await catalog(); const pool = [];
  for (const k of reviewList()) { const [lid, wid] = k.split('|'); const L = await lesson(lid); const w = L && L.words.find(x => x.id === wid); if (w) pool.push({ L, w }); }
  const extra = [];
  for (const p of pool) for (const w of p.L.words) if (!pool.some(x => x.w === w) && !extra.some(x => x.w === w)) extra.push({ L: p.L, w });
  if (!pool.length) return home();
  SESSION = { id: 'review', mistakes: 0 };
  const head = (t, s) => `<header class="top"><a class="back" href="#/" aria-label="Back">${ICON.back}</a><div class="hello"><b>${esc(t)}</b><span>${esc(s)}</span></div></header>`;
  listen(null, { en: 'Quick review' }, head, () => { confetti(); sfx.win(); home(); }, [...pool, ...extra].slice(0, Math.max(pool.length + 3, 4)));
}

/* ---------- router ---------- */
async function route() {
  RT++; audioToken++; player.pause(); bits = []; if ('speechSynthesis' in window) speechSynthesis.cancel();
  const p = location.hash.replace(/^#\/?/, '').split('/');
  try {
    if (p[0] === 'worlds') return worlds();
    if (p[0] === 'world') return home(p[1]);
    if (p[0] === 'words') return myWords();
    if (p[0] === 'parents') return parents();
    if (p[0] === 'review') return review();
    if (p[0] === 'lesson' && p[2] !== undefined) return runStep(p[1], +p[2]);
    if (p[0] === 'lesson') return lessonPath(p[1]);
    return home();
  } catch (e) {
    console.error(e);
    render(`<div class="screen dots"><div class="card"><h2>Oops — Koko tripped.</h2><p>Check the internet connection and try again.</p><a class="btn" href="#/">Back to the map</a></div></div>`);
  }
}
addEventListener('hashchange', route);
route();
setInterval(() => { if (!document.hidden && location.hash.startsWith('#/lesson/')) tick(15); }, 15000);
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
