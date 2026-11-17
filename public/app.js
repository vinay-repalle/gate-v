import { createLocalStore } from './store.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SN = ['Not started', 'Partial', 'Done'];
const PILL = { official: 'official', notes: 'her notes' };
const OPEN_KEY = 'gate_ece_open_v1';

let store;
let S = { s: {}, r: {}, n: {}, c: {} };
let STATIC = [];
let ROOTS = [];
let MAP = new Map();
let open = new Set();
let openNote = new Set();
let menuFor = null;
let addingTo = null;
let confirmDel = null;
let filter = 'all';
let q = '';
let pm = new Map();   // progress memo
let vm = new Map();   // visibility memo

/* ---------- tree model ---------- */
function clone(n, depth, parent) {
  const c = { id: n.id, num: n.num, title: n.title, src: n.src, note: n.note || '', custom: false, depth, parent, children: [] };
  c.children = (n.children || []).map((k) => clone(k, depth + 1, c));
  return c;
}

function buildTree() {
  ROOTS = STATIC.map((n) => clone(n, 0, null));
  MAP = new Map();
  const reg = (n) => { MAP.set(n.id, n); n.children.forEach(reg); };
  ROOTS.forEach(reg);

  // custom nodes: register first (they can nest), then attach in a stable order
  const customs = Object.entries(S.c).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const made = customs.map(([id, c]) => {
    const node = { id, num: '', title: String(c.t || ''), src: 'custom', note: '', custom: true, depth: 0, parent: null, children: [] };
    MAP.set(id, node);
    return [node, c.p];
  });
  for (const [node, p] of made) {
    const parent = p && p !== 'root' && p !== node.id ? MAP.get(p) : null;
    if (parent) { node.parent = parent; parent.children.push(node); } else ROOTS.push(node);
  }
  const renum = (list, pre, depth) => list.forEach((n, i) => {
    n.num = pre ? `${pre}.${i + 1}` : String(i + 1);
    n.depth = depth;
    renum(n.children, n.num, depth + 1);
  });
  renum(ROOTS, '', 0);
}

/* ---------- progress ---------- */
function prog(n) {
  let r = pm.get(n.id);
  if (r) return r;
  if (!n.children.length) {
    const s = S.s[n.id] || 0;
    r = { sum: s === 2 ? 1 : s === 1 ? 0.5 : 0, cnt: 1, done: s === 2 ? 1 : 0, part: s === 1 ? 1 : 0 };
  } else {
    r = { sum: 0, cnt: 0, done: 0, part: 0 };
    for (const k of n.children) { const p = prog(k); r.sum += p.sum; r.cnt += p.cnt; r.done += p.done; r.part += p.part; }
  }
  pm.set(n.id, r);
  return r;
}
function stOf(n) {
  if (!n.children.length) return S.s[n.id] || 0;
  const p = prog(n);
  return p.sum === 0 ? 0 : p.done === p.cnt ? 2 : 1;
}
const leaves = (n, out = []) => { if (!n.children.length) out.push(n); else n.children.forEach((k) => leaves(k, out)); return out; };
const subtreeIds = (n, out = []) => { out.push(n.id); n.children.forEach((k) => subtreeIds(k, out)); return out; };

/* ---------- search / filter visibility ---------- */
function selfOk(n) {
  if (filter === 'all') return true;
  if (filter === 'rev') return !!S.r[n.id];
  if (n.children.length) return false;
  return String(S.s[n.id] || 0) === filter;
}
function vis(n, ancMatch) {
  if (vm.has(n.id)) return vm.get(n.id);
  const hit = q && (n.title.toLowerCase().includes(q) || n.note.toLowerCase().includes(q) || (S.n[n.id] || '').toLowerCase().includes(q));
  const textOk = !q || ancMatch || hit;
  let any = false;
  for (const k of n.children) if (vis(k, ancMatch || !!hit)) any = true;
  const res = (textOk && selfOk(n)) || any;
  vm.set(n.id, res);
  return res;
}

/* ---------- rendering ---------- */
function icon(s) {
  if (s === 2) return '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="var(--done)"/><path d="M5.6 10.4l3 3 5.8-6.6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  if (s === 1) return '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.6" fill="none" stroke="var(--part)" stroke-width="2"/><path d="M10 1.4a8.6 8.6 0 0 1 0 17.2z" fill="var(--part)"/></svg>';
  return '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.6" fill="none" stroke="var(--none)" stroke-width="2"/></svg>';
}

function nodeHTML(n) {
  const hasK = n.children.length > 0;
  const active = !!q || filter !== 'all';
  const isOpen = hasK && (open.has(n.id) || (active && n.children.some((k) => vm.get(k.id))));
  const st = stOf(n);
  const p = prog(n);
  const pc = Math.round((100 * p.sum) / p.cnt);
  const hasNote = !!(S.n[n.id] && S.n[n.id].trim());
  const flagged = !!S.r[n.id];
  const id = esc(n.id);

  let h = `<div class="node d${Math.min(n.depth, 3)}${hasK ? ' hasK' : ''} status-${st}" data-node="${id}"><div class="row${flagged ? ' rv' : ''}">`;
  h += hasK
    ? `<button class="chev${isOpen ? ' open' : ''}" data-act="tog" data-id="${id}" aria-label="${isOpen ? 'Collapse' : 'Expand'} ${esc(n.title)}" aria-expanded="${isOpen}">▶</button>`
    : '<span class="chev sp"></span>';
  h += `<button class="st" data-act="st" data-id="${id}" aria-label="${esc(n.title)}: ${SN[st]}. Tap to change" title="${SN[st]}">${icon(st)}</button>`;
  h += `<span class="num">${esc(n.num)}</span>`;
  h += `<span class="title"${hasK ? ` data-act="tog" data-id="${id}"` : ''}>${esc(n.title)}`;
  if (n.note) h += `<span class="tag">· ${esc(n.note)}</span>`;
  if (n.custom) h += '<span class="pill mine">mine</span>';
  else if (PILL[n.src]) h += `<span class="pill ${n.src}">${PILL[n.src]}</span>`;
  h += '</span>';
  if (hasK) h += `<span class="mb"><div class="bar"><i class="b-done" style="width:${(100 * p.done) / p.cnt}%"></i><i class="b-part" style="width:${(100 * p.part) / p.cnt}%"></i></div></span><span class="pct">${pc}%</span>`;
  if (flagged) h += '<span class="ind flag" title="To revise">⚑</span>';
  if (hasNote) h += '<span class="ind note" title="Has a note">✎</span>';
  h += `<button class="more" data-act="menu" data-id="${id}" aria-label="More actions for ${esc(n.title)}" aria-expanded="${menuFor === n.id}">⋯</button>`;
  h += '</div>';

  if (menuFor === n.id) {
    h += '<div class="menu">';
    h += `<button class="${flagged ? 'on' : ''}" data-act="flag" data-id="${id}" aria-pressed="${flagged}">⚑ ${flagged ? 'Remove revise flag' : 'Revise'}</button>`;
    h += `<button class="${openNote.has(n.id) || hasNote ? 'on' : ''}" data-act="note" data-id="${id}">✎ Note</button>`;
    h += `<button data-act="add" data-id="${id}">＋ Add sub-point</button>`;
    if (n.custom) h += `<button class="danger" data-act="del" data-id="${id}">${confirmDel === n.id && hasK ? 'Tap again to remove with its sub-points' : '✕ Remove'}</button>`;
    h += '</div>';
  }
  if (openNote.has(n.id)) h += `<div class="noteBox"><textarea data-note="${id}" aria-label="Note for ${esc(n.title)}" placeholder="Resources, formulas to remember, weak points…">${esc(S.n[n.id] || '')}</textarea></div>`;
  if (addingTo === n.id) h += `<form class="addForm" data-form="${id}"><input name="t" maxlength="120" placeholder="New sub-point under ${esc(n.num)}…" autocomplete="off" aria-label="New sub-point title"><button class="go" type="submit">Add</button><button type="button" data-act="canceladd">Done</button></form>`;
  if (isOpen) {
    const vk = n.children.filter((k) => vm.get(k.id));
    if (vk.length) h += `<div class="kids">${vk.map(nodeHTML).join('')}</div>`;
  }
  return h + '</div>';
}

function render() {
  vm = new Map(); pm = new Map();
  ROOTS.forEach((r) => vis(r, false));
  const vr = ROOTS.filter((r) => vm.get(r.id));
  const tree = $('#tree');
  tree.innerHTML = vr.length ? vr.map(nodeHTML).join('') : '<div class="empty">Nothing matches. Try another word or filter.</div>';
  if (addingTo) { const i = tree.querySelector('.addForm input'); if (i) i.focus(); }
  renderDash();
}

function renderDash() {
  const T = { sum: 0, cnt: 0, done: 0, part: 0 };
  ROOTS.forEach((r) => { const p = prog(r); T.sum += p.sum; T.cnt += p.cnt; T.done += p.done; T.part += p.part; });
  const pct = T.cnt ? Math.round((100 * T.sum) / T.cnt) : 0;
  $('#bigPct').textContent = pct + '%';
  $('#oBar').innerHTML = `<i class="b-done" style="width:${T.cnt ? (100 * T.done) / T.cnt : 0}%"></i><i class="b-part" style="width:${T.cnt ? (100 * T.part) / T.cnt : 0}%"></i>`;
  const rev = Object.keys(S.r).filter((k) => MAP.has(k)).length;
  $('#oStats').innerHTML = `<span><b>${T.done}</b> done</span><span><b>${T.part}</b> partial</span><span><b>${T.cnt - T.done - T.part}</b> not started</span><span><b>${rev}</b> to revise</span><span>${T.cnt} topics</span>`;
  $('#cards').innerHTML = ROOTS.map((r) => {
    const p = prog(r);
    return `<button class="card" data-act="goto" data-id="${esc(r.id)}"><div class="t"><span>${esc(r.title.replace(/ \(GA\)$/, ''))}</span><span>${Math.round((100 * p.sum) / p.cnt)}%</span></div><div class="bar"><i class="b-done" style="width:${(100 * p.done) / p.cnt}%"></i><i class="b-part" style="width:${(100 * p.part) / p.cnt}%"></i></div></button>`;
  }).join('');
}

/* ---------- changes + undo ---------- */
let toastTimer = null;
let undoPatch = null;

function inverse(change) {
  const inv = { s: {}, r: {}, n: {}, c: {} };
  for (const k of Object.keys(inv)) for (const id of Object.keys(change[k] || {})) inv[k][id] = S[k][id] === undefined ? null : S[k][id];
  return inv;
}
function commit(change, toastMsg) {
  const inv = inverse(change);
  store.patch(change);
  if (toastMsg) showToast(toastMsg, inv);
}
function showToast(msg, inv) {
  undoPatch = inv;
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span><button type="button" data-act="undo">Undo</button>`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; undoPatch = null; }, 6000);
}
$('#toast').addEventListener('click', (e) => {
  if (!e.target.closest('[data-act=undo]') || !undoPatch) return;
  store.patch(undoPatch);
  undoPatch = null; $('#toast').hidden = true;
  buildTree(); render();
});

function cycle(id) {
  const n = MAP.get(id);
  if (!n) return;
  const next = (stOf(n) + 1) % 3;
  const ls = leaves(n);
  const change = { s: {} };
  ls.forEach((l) => { change.s[l.id] = next || null; });
  commit(change, ls.length > 1 ? `${ls.length} topics marked “${SN[next]}”` : null);
}

/* ---------- events ---------- */
$('#tree').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = b.dataset.id;
  const act = b.dataset.act;
  if (act === 'tog') { open.has(id) ? open.delete(id) : open.add(id); saveOpen(); render(); }
  else if (act === 'st') { cycle(id); render(); }
  else if (act === 'menu') { menuFor = menuFor === id ? null : id; confirmDel = null; render(); }
  else if (act === 'flag') { commit({ r: { [id]: S.r[id] ? null : 1 } }); render(); }
  else if (act === 'note') { openNote.has(id) ? openNote.delete(id) : openNote.add(id); render(); const t = document.querySelector(`[data-note="${CSS.escape(id)}"]`); if (t && openNote.has(id)) t.focus(); }
  else if (act === 'add') { addingTo = addingTo === id ? null : id; open.add(id); saveOpen(); render(); }
  else if (act === 'canceladd') { addingTo = null; render(); }
  else if (act === 'del') {
    const n = MAP.get(id);
    if (!n || !n.custom) return;
    if (n.children.length && confirmDel !== id) { confirmDel = id; render(); return; }
    const change = { s: {}, r: {}, n: {}, c: {} };
    subtreeIds(n).forEach((i) => { change.s[i] = null; change.r[i] = null; change.n[i] = null; change.c[i] = null; });
    commit(change, `Removed “${n.title}”`);
    menuFor = null; confirmDel = null;
    buildTree(); render();
  }
});

$('#tree').addEventListener('input', (e) => {
  const t = e.target.closest('[data-note]');
  if (!t) return;
  commit({ n: { [t.dataset.note]: t.value.trim() ? t.value : null } });
});
$('#tree').addEventListener('focusout', (e) => { if (e.target.matches('[data-note]')) render(); });
$('#tree').addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && e.target.closest('.addForm')) { addingTo = null; render(); }
});
$('#tree').addEventListener('submit', (e) => {
  const f = e.target.closest('[data-form]');
  if (!f) return;
  e.preventDefault();
  const t = f.elements.t.value.trim();
  if (!t) return;
  const parent = f.dataset.form;
  const id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  open.add(parent); saveOpen();
  commit({ c: { [id]: { p: parent, t } } });
  buildTree(); render();
});

$('#cards').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act=goto]');
  if (!b) return;
  q = ''; $('#q').value = ''; filter = 'all'; syncChips();
  open.add(b.dataset.id); saveOpen(); render();
  const el = document.querySelector(`[data-node="${CSS.escape(b.dataset.id)}"]`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#q').addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); render(); });
function syncChips() { document.querySelectorAll('#chips .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.f === filter))); }
$('#chips').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; filter = c.dataset.f; syncChips(); render(); });
$('#expAll').onclick = () => { MAP.forEach((n, id) => { if (n.children.length) open.add(id); }); saveOpen(); render(); };
$('#colAll').onclick = () => { open.clear(); saveOpen(); render(); };

/* ---------- per-device view state (which branches are open) ---------- */
function saveOpen() { try { localStorage.setItem(OPEN_KEY, JSON.stringify([...open])); } catch { /* ignore */ } }
function loadOpen() { try { const a = JSON.parse(localStorage.getItem(OPEN_KEY) || '[]'); if (Array.isArray(a)) open = new Set(a); } catch { /* ignore */ } }

/* ---------- start ---------- */
async function loadSyllabus() {
  const res = await fetch('syllabus.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

async function init() {
  $('#legend').innerHTML = `<span>${icon(0)} Not started</span><span>${icon(1)} Partial</span><span>${icon(2)} Done</span><span style="color:var(--rev)">⚑ Revise</span><span>✎ Note</span><span>⋯ More</span>`;
  loadOpen();
  const syllabus = loadSyllabus();
  syllabus.catch(() => {}); // handled below; avoids an unhandled-rejection warning while login is open

  // ?local skips login and uses browser-only storage (for testing the UI)
  if (new URLSearchParams(location.search).has('local')) {
    store = createLocalStore();
    $('#acct').textContent = 'Local test mode (not synced).';
  } else {
    try {
      const [{ requireLogin, signOutUser }, { createCloudStore }] = await Promise.all([import('./login.js'), import('./cloud-store.js')]);
      const user = await requireLogin();
      store = createCloudStore(user.uid);
      await store.ready;
      $('#acct').innerHTML = `Signed in as <b>${esc(user.displayName || 'you')}</b> · <button type="button" id="signout">Sign out</button>`;
      $('#signout').onclick = signOutUser;
    } catch (e) {
      $('#tree').innerHTML = '<div class="empty">Could not connect to the login service. Check your internet connection and refresh.</div>';
      console.error(e);
      return;
    }
  }

  S = store.state;
  store.onStatus((t) => { $('#sync').textContent = t; });
  store.onChange(() => {
    S = store.state;
    buildTree();
    if (document.activeElement && document.activeElement.matches('[data-note]')) renderDash(); // don't steal focus while typing a note
    else render();
  });
  try {
    STATIC = await syllabus;
  } catch {
    $('#tree').innerHTML = '<div class="empty">Could not load the syllabus. Check your connection and refresh.</div>';
    return;
  }
  buildTree(); render();
}
init();
