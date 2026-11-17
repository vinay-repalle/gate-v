import { createLocalStore } from './store.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SN = ['To do', 'Partial', 'Done'];
const OPEN_KEY = 'gate_ece_open_v1';
const MAP_KEYS = ['s', 'r', 'n', 'c', 't', 'm'];
const short = (t) => t.replace(/ \(GA\)$/, '');

let store;
let S = { s: {}, r: {}, n: {}, c: {}, t: {}, m: {} };
let ME = '';                 // display name
let STATIC = [];
let ROOTS = [];
let MAP = new Map();
let LEAVES = [];             // every leaf, in syllabus order
let open = new Set();        // expanded branches (remembered per device)
let openNote = new Set();
let menuFor = null;          // topic whose options are showing
let addingTo = null;
let confirmDel = null;
let filter = 'all';          // all | 0 | 1 | 2 | rev   (inside a section)
let squery = '';             // search text
let examEdit = false;
let hlId = null;             // topic to flash after "open in tree"
let pm = new Map();          // progress memo
let vm = new Map();          // visibility memo

/* ---------- icons ---------- */
const IC = {
  home: '<path d="M3.5 10.8 12 3.5l8.5 7.3V20a.8.8 0 0 1-.8.8H15v-5.6H9v5.6H4.3a.8.8 0 0 1-.8-.8z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  flag: '<path d="M5.5 21V4.5m0 0h11.2l-2.2 3.8 2.2 3.8H5.5"/>',
  note: '<path d="M6 3.5h8.6L19 7.9V20.5H6z"/><path d="M9.2 12.5h6M9.2 16.2h6"/>',
  more: '<g fill="currentColor" stroke="none"><circle cx="5.5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18.5" cy="12" r="1.5"/></g>',
  chev: '<path d="m9.5 6 6 6-6 6"/>',
  chevd: '<path d="m6 9.5 6 6 6-6"/>',
  back: '<path d="m14.5 6-6 6 6 6"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  check: '<path d="m5.5 12.5 4.3 4.3L18.5 7.8"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  out: '<path d="M8 16 16 8M9 8h7v7"/>',
};
const ico = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${IC[n]}</svg>`;

function stIcon(s) {
  if (s === 2) return '<svg viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="var(--done)"/><path d="m6.4 11.4 3.1 3.1 6.1-6.9" stroke="#fff" stroke-width="2.1" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  if (s === 1) return '<svg viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="9" fill="none" stroke="var(--part)" stroke-width="2"/><path d="M11 2a9 9 0 0 1 0 18z" fill="var(--part)"/></svg>';
  return '<svg viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="9" fill="none" stroke="var(--none)" stroke-width="2"/></svg>';
}

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

  // topics she added herself: register first (they can nest), then attach in a stable order
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
  LEAVES = ROOTS.flatMap((r) => leaves(r));
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
const pctOf = (p) => (p.cnt ? Math.round((100 * p.sum) / p.cnt) : 0);
function stOf(n) {
  if (!n.children.length) return S.s[n.id] || 0;
  const p = prog(n);
  return p.sum === 0 ? 0 : p.done === p.cnt ? 2 : 1;
}
function leaves(n, out = []) { if (!n.children.length) out.push(n); else n.children.forEach((k) => leaves(k, out)); return out; }
const subtreeIds = (n, out = []) => { out.push(n.id); n.children.forEach((k) => subtreeIds(k, out)); return out; };
const rootOf = (n) => { while (n.parent) n = n.parent; return n; };
const crumb = (n) => { const out = []; for (let p = n.parent; p; p = p.parent) out.unshift(short(p.title)); return out.join(' › '); };
// shorter path for list rows: only the two nearest parents, e.g. "Calculus › Taylor series"
const crumbShort = (n) => { const out = []; for (let p = n.parent; p; p = p.parent) out.unshift(short(p.title)); return out.slice(-2).join(' › '); };

/* ---------- filter (inside one section) ---------- */
function selfOk(n) {
  if (filter === 'all') return true;
  if (filter === 'rev') return !!S.r[n.id];
  if (n.children.length) return false;
  return String(S.s[n.id] || 0) === filter;
}
function vis(n) {
  if (vm.has(n.id)) return vm.get(n.id);
  let any = false;
  for (const k of n.children) if (vis(k)) any = true;
  const res = selfOk(n) || any;
  vm.set(n.id, res);
  return res;
}

/* ---------- routing: #/  #/n/<id>  #/search  #/revise  #/notes ---------- */
function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  if (h.startsWith('n/')) { const id = decodeURIComponent(h.slice(2)); if (MAP.has(id)) return { name: 'node', id }; }
  if (h === 'search' || h === 'revise' || h === 'notes') return { name: h };
  return { name: 'home' };
}
function go(path) {
  const target = '#/' + path;
  if (location.hash === target) render(); else location.hash = target;
}
window.addEventListener('hashchange', () => { closePop(); render(); });

function reveal(id, { note = false } = {}) {
  const n = MAP.get(id);
  if (!n) return;
  for (let p = n.parent; p; p = p.parent) open.add(p.id);
  if (n.children.length) open.add(n.id);
  if (note) openNote.add(id);
  hlId = id; filter = 'all'; menuFor = null;
  saveOpen();
  go('n/' + rootOf(n).id);
}

/* ---------- small pieces ---------- */
function stack(p) {
  return `<span class="stack"><i class="b-done" style="width:${p.cnt ? (100 * p.done) / p.cnt : 0}%"></i><i class="b-part" style="width:${p.cnt ? (100 * p.part) / p.cnt : 0}%"></i></span>`;
}
function totals() {
  const T = { sum: 0, cnt: 0, done: 0, part: 0 };
  ROOTS.forEach((r) => { const p = prog(r); T.sum += p.sum; T.cnt += p.cnt; T.done += p.done; T.part += p.part; });
  return T;
}
const reviseCount = () => Object.keys(S.r).filter((k) => MAP.has(k)).length;
function touchedToday() {
  const t0 = new Date().setHours(0, 0, 0, 0);
  return Object.entries(S.t).filter(([id, ts]) => ts >= t0 && MAP.has(id) && S.s[id]).length;
}

/* ---------- chrome: top bar, tabs, sidebar ---------- */
const LOGO = '<span class="mark"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3a9 9 0 0 1 0 18z" fill="var(--accent)"/></svg></span>';
const NAV = [
  { k: 'home', label: 'Home', icon: 'home', href: '#/' },
  { k: 'search', label: 'Search', icon: 'search', href: '#/search' },
  { k: 'revise', label: 'Revise', icon: 'flag', href: '#/revise' },
  { k: 'notes', label: 'Notes', icon: 'note', href: '#/notes' },
];
const activeNav = (r) => (r.name === 'node' ? 'home' : r.name);

function renderChrome(r) {
  const avatar = `<button class="avatar" data-act="acct" aria-label="Account and sync status" aria-haspopup="dialog">${esc((ME || '?').trim().charAt(0).toUpperCase() || '?')}<i class="avdot"></i></button>`;
  let left;
  if (r.name === 'home') {
    left = `<div class="brand">${LOGO}<span class="brand-t"><b>GATE 2027</b><small>Electronics &amp; Communication</small></span></div>`;
  } else if (r.name === 'node') {
    const n = MAP.get(r.id);
    const back = n.parent ? '#/n/' + n.parent.id : '#/';
    const backLabel = n.parent ? short(n.parent.title) : 'Home';
    left = `<a class="back" href="${esc(back)}" aria-label="Back to ${esc(backLabel)}">${ico('back')}</a><div class="bar-t"><small>${n.parent ? esc(crumb(n) + ' ›') : 'Section ' + esc(n.num)}</small><b>${n.depth ? esc(n.num) + ' · ' : ''}${esc(short(n.title))}</b></div><span class="bar-pct">${pctOf(prog(n))}%</span>`;
  } else {
    const titles = { search: 'Search', revise: 'To revise', notes: 'My notes' };
    left = `<div class="bar-t only"><b>${titles[r.name]}</b></div>`;
  }
  $('#bar').innerHTML = left + avatar;

  const act = activeNav(r);
  const rc = reviseCount();
  $('#tabs').innerHTML = NAV.map((i) => `<a class="tab" href="${i.href}"${i.k === act ? ' aria-current="page"' : ''}>${ico(i.icon)}<span>${i.label}</span>${i.k === 'revise' && rc ? `<em class="badge">${rc}</em>` : ''}</a>`).join('');

  const nav = NAV.map((i) => `<a class="snav" href="${i.href}"${i.k === act ? ' aria-current="page"' : ''}>${ico(i.icon)}<span>${i.label}</span>${i.k === 'revise' && rc ? `<em class="badge">${rc}</em>` : ''}</a>`).join('');
  const secs = ROOTS.map((n) => {
    const here = r.name === 'node' && rootOf(MAP.get(r.id)).id === n.id;
    return `<a class="ssec" href="#/n/${esc(n.id)}"${here ? ' aria-current="true"' : ''}><span class="sn">${esc(n.num)}</span><span class="st2">${esc(short(n.title))}</span><span class="sp">${pctOf(prog(n))}%</span></a>`;
  }).join('');
  $('#side').innerHTML = `<div class="side-brand">${LOGO}<span class="brand-t"><b>GATE 2027</b><small>Electronics &amp; Communication</small></span></div><nav class="side-nav" aria-label="Main">${nav}</nav><p class="side-h">Syllabus</p><div class="side-secs">${secs}</div>`;
}

/* ---------- list rows used on Home / Search / Revise / Notes ---------- */
function itemHTML(n, { actions = '', body = '', full = false } = {}) {
  const id = esc(n.id);
  const hasK = n.children.length > 0;
  const p = prog(n);
  const st = stOf(n);
  const c = full ? crumb(n) : crumbShort(n);
  return `<li class="item" data-node="${id}">
    <button class="st" data-act="st" data-id="${id}" aria-label="${esc(n.title)}: ${SN[st]}. Tap to change">${stIcon(st)}</button>
    <div class="im" role="button" tabindex="0" data-act="open" data-id="${id}">
      ${c ? `<div class="crumb${full ? ' wrap' : ''}">${esc(c)}</div>` : ''}
      <div class="it">${esc(n.title)}${hasK ? ` <span class="cnt">${p.done}/${p.cnt}</span>` : ''}</div>
      ${body}
    </div>
    ${actions ? `<div class="ia">${actions}</div>` : ''}
  </li>`;
}
const quickBtn = (id, v, label) => `<button class="btn sm act" data-act="quick" data-v="${v}" data-id="${esc(id)}">${v === 2 ? ico('check') : ''}${label}</button>`;

function suggestions() {
  const byTime = (a, b) => (S.t[b.id] || 0) - (S.t[a.id] || 0);
  const partial = LEAVES.filter((l) => S.s[l.id] === 1).sort(byTime);
  const anchor = LEAVES.filter((l) => S.t[l.id]).sort(byTime)[0];
  const start = anchor ? LEAVES.indexOf(anchor) + 1 : 0;
  const next = [];
  for (let i = 0; i < LEAVES.length && next.length < 3; i++) {
    const l = LEAVES[(start + i) % LEAVES.length];
    if (!S.s[l.id]) next.push(l);
  }
  return { cont: partial.slice(0, 3), partialTotal: partial.length, next, started: !!anchor };
}

/* ---------- Home ---------- */
function planHTML(T) {
  const exam = S.m.exam;
  if (examEdit) {
    return `<div class="plan edit"><label for="examDate">Exam date</label><input type="date" id="examDate" value="${esc(exam || '')}"><button class="btn sm pri" data-act="exam-save">Save</button>${exam ? '<button class="btn sm" data-act="exam-clear">Remove</button>' : ''}<button class="btn sm" data-act="exam-cancel">Cancel</button></div>`;
  }
  if (!exam || !/^\d{4}-\d{2}-\d{2}$/.test(exam)) {
    return '<div class="plan"><button class="textbtn" data-act="exam-edit">Set exam date for a daily target</button></div>';
  }
  const t0 = new Date().setHours(0, 0, 0, 0);
  const days = Math.round((new Date(exam + 'T00:00:00') - t0) / 864e5);
  const left = T.cnt - T.done;
  let txt;
  if (days < 0) txt = '<span>Exam date has passed</span>';
  else if (days === 0) txt = '<span><b>Exam day</b></span>';
  else {
    const per = left / days;
    txt = `<span><b>${days}</b> day${days === 1 ? '' : 's'} left</span><span><b>${per >= 10 ? Math.round(per) : Math.round(per * 10) / 10}</b> topics a day to finish the other <b>${left}</b></span>`;
  }
  return `<div class="plan">${txt}<button class="textbtn" data-act="exam-edit">Change</button></div>`;
}

function homeHTML() {
  const T = totals();
  const today = touchedToday();
  const { cont, partialTotal, next, started } = suggestions();
  let h = '<div class="home"><div class="hl">';
  h += '<a class="searchlink" href="#/search">' + ico('search') + '<span>Search topics and notes</span></a>';

  h += `<section class="hero" aria-label="Overall progress">
    <div class="hero-top"><div class="pct">${pctOf(T)}<small>%</small></div>
      <div class="hero-m"><div class="lab">Overall progress</div><div class="cnts"><span><i class="k done"></i><b>${T.done}</b> done</span><span><i class="k part"></i><b>${T.part}</b> partial</span><span><i class="k none"></i><b>${T.cnt - T.done - T.part}</b> to do</span></div></div>
      ${today ? `<div class="today" title="Topics you updated today">+${today} today</div>` : ''}
    </div>
    ${stack(T)}
    ${planHTML(T)}
  </section>`;

  if (cont.length) {
    h += `<h2 class="sec"><span>Continue</span><small>${partialTotal} in progress</small></h2><ul class="list">${cont.map((n) => itemHTML(n, { actions: quickBtn(n.id, 2, 'Done') })).join('')}</ul>`;
  }
  if (next.length) {
    h += `<h2 class="sec"><span>${started ? 'Up next' : 'Start here'}</span><small>${started ? 'after your last topic' : 'first topics in the syllabus'}</small></h2><ul class="list">${next.map((n) => itemHTML(n, { actions: quickBtn(n.id, 1, 'Start') })).join('')}</ul>`;
  } else if (!cont.length) {
    h += '<div class="note-card"><b>Every topic is marked</b><p>Open Revise to go over anything you flagged</p></div>';
  }
  h += '</div><div class="hr">';

  h += `<h2 class="sec first"><span>Syllabus</span><small>${ROOTS.length} sections</small></h2><div class="list toc">${ROOTS.map((n) => {
    const p = prog(n);
    return `<a class="trow" href="#/n/${esc(n.id)}"><span class="tnum">${esc(n.num)}</span><span class="tmain"><span class="ttitle">${esc(short(n.title))}</span><span class="tsub">${stack(p)}<span class="tcnt">${p.done}/${p.cnt}</span></span></span><span class="tpct">${pctOf(p)}%</span>${ico('chev', 'tchev')}</a>`;
  }).join('')}</div>`;

  h += `<section class="about"><h2 class="sec"><span>About this syllabus</span></h2>
    <p>Built from the official GATE 2027 EC syllabus (IIT Madras) <a href="https://gate2027.iitm.ac.in/static/doc/GATE2027_Syllabus/EC_GATE2027_Syllabus.pdf" target="_blank" rel="noopener">PDF</a>. General Aptitude follows the standard GATE pattern. Always cross-check with the official PDF.</p>
    <p class="keys"><span><i class="src s-official"></i>Named in the official syllabus</span><span><i class="src s-notes"></i>From your handwritten notes</span><span><i class="src s-mine"></i>Added by you</span><span>No dot: added to show study depth</span></p>
    <p>Something missing? Tap any topic, then <b>Add sub-point</b>.</p></section></div></div>`;
  return h;
}

/* ---------- section / topic page (the tree) ---------- */
function nodeHTML(n, base) {
  const hasK = n.children.length > 0;
  const active = filter !== 'all';
  const isOpen = hasK && (open.has(n.id) || (active && n.children.some((k) => vm.get(k.id))));
  const st = stOf(n);
  const p = prog(n);
  const hasNote = !!(S.n[n.id] && S.n[n.id].trim());
  const flagged = !!S.r[n.id];
  const id = esc(n.id);
  const d = Math.min(n.depth - base, 3);
  const src = n.custom ? 'mine' : n.src === 'official' ? 'official' : n.src === 'notes' ? 'notes' : 'none';
  const srcTitle = { mine: 'Added by you', official: 'Named in the official syllabus', notes: 'From your handwritten notes', none: 'Added to show study depth' }[src];

  let h = `<div class="node d${d}${hasK ? ' hasK' : ''} s${st}${hlId === n.id ? ' hl' : ''}" data-node="${id}"><div class="row${flagged ? ' rv' : ''}">`;
  h += `<button class="st" data-act="st" data-id="${id}" aria-label="${esc(n.title)}: ${SN[st]}. Tap to change" title="${SN[st]}">${stIcon(st)}</button>`;
  h += `<div class="rt" role="button" tabindex="0" data-act="${hasK ? 'tog' : 'opt'}" data-id="${id}"${hasK ? ` aria-expanded="${isOpen}"` : ''}>`;
  h += `<div class="t1">${n.depth <= 1 ? `<span class="num">${esc(n.num)}</span>` : ''}<span class="title">${esc(n.title)}</span>${src === 'none' ? '' : `<i class="src s-${src}" title="${srcTitle}"></i>`}${hasK && d > 0 ? `<span class="cnt${p.done === p.cnt ? ' all' : ''}">${p.done}/${p.cnt}</span>` : ''}</div>`;
  if (n.note) h += `<div class="t2">${esc(n.note)}</div>`;
  h += '</div>';
  h += '<div class="rr">';
  if (flagged) h += `<span class="ind flag" title="To revise">${ico('flag')}</span>`;
  if (hasNote) h += `<span class="ind note" title="Has a note">${ico('note')}</span>`;
  if (hasK) {
    if (d === 0) h += `<span class="cnt${p.done === p.cnt ? ' all' : ''}">${p.done}/${p.cnt}</span>`;
    h += `<button class="chev${isOpen ? ' open' : ''}" data-act="tog" data-id="${id}" aria-label="${isOpen ? 'Collapse' : 'Expand'} ${esc(n.title)}" tabindex="-1">${ico('chev')}</button>`;
    h += `<button class="more" data-act="menu" data-id="${id}" aria-label="Options for ${esc(n.title)}" aria-expanded="${menuFor === n.id}">${ico('more')}</button>`;
  }
  h += '</div>';
  if (hasK && d === 0) h += `<div class="mbar">${stack(p)}</div>`;
  h += '</div>';

  if (menuFor === n.id) {
    h += `<div class="menu" role="group" aria-label="Options for ${esc(n.title)}">
      <div class="seg" role="group" aria-label="Status">${[0, 1, 2].map((v) => `<button class="${st === v ? 'on' : ''}" data-act="set" data-v="${v}" data-id="${id}" aria-pressed="${st === v}">${SN[v]}</button>`).join('')}</div>
      <button class="btn sm${flagged ? ' on' : ''}" data-act="flag" data-id="${id}" aria-pressed="${flagged}">${ico('flag')}${flagged ? 'Remove revise flag' : 'Revise'}</button>
      <button class="btn sm${openNote.has(n.id) || hasNote ? ' on' : ''}" data-act="note" data-id="${id}">${ico('note')}Note</button>
      <button class="btn sm" data-act="add" data-id="${id}">${ico('plus')}Add sub-point</button>
      ${hasK ? `<button class="btn sm" data-act="focus" data-id="${id}">${ico('out')}Open as page</button>` : ''}
      ${n.custom ? `<button class="btn sm danger" data-act="del" data-id="${id}">${confirmDel === n.id && hasK ? 'Tap again to remove with its sub-points' : 'Remove'}</button>` : ''}
    </div>`;
  }
  if (openNote.has(n.id)) h += `<div class="noteBox"><textarea data-note="${id}" aria-label="Note for ${esc(n.title)}" placeholder="Resources, formulas to remember, weak points…">${esc(S.n[n.id] || '')}</textarea></div>`;
  if (addingTo === n.id) h += `<form class="addForm" data-form="${id}"><input name="t" maxlength="120" placeholder="New sub-point under ${esc(n.num)}…" autocomplete="off" aria-label="New sub-point title"><button class="btn sm pri" type="submit">Add</button><button class="btn sm" type="button" data-act="canceladd">Done</button></form>`;
  if (isOpen) {
    const vk = n.children.filter((k) => vm.get(k.id));
    if (vk.length) h += `<div class="kids">${vk.map((k) => nodeHTML(k, base)).join('')}</div>`;
  }
  return h + '</div>';
}

function nodeView(n) {
  const p = prog(n);
  const ls = leaves(n);
  const cnt = { 0: 0, 1: 0, 2: 0, rev: 0 };
  ls.forEach((l) => { cnt[S.s[l.id] || 0]++; });
  cnt.rev = [...subtreeIds(n)].filter((i) => S.r[i]).length;
  const tabs = [['all', 'All', ls.length], ['0', 'To do', cnt[0]], ['1', 'Partial', cnt[1]], ['2', 'Done', cnt[2]], ['rev', 'Revise', cnt.rev]];

  n.children.forEach((k) => vis(k));
  const vr = n.children.filter((k) => vm.get(k.id));
  const base = n.depth + 1;
  let h = '';
  if (n.parent) h += `<nav class="crumbs" aria-label="Where you are"><a href="#/">Home</a>${(() => { const a = []; for (let q = n.parent; q; q = q.parent) a.unshift(q); return a.map((q) => ` ${ico('chev', 'cx')} <a href="#/n/${esc(q.id)}">${esc(short(q.title))}</a>`).join(''); })()}</nav>`;
  h += '<div class="page"><div class="pmain">';
  h += `<div class="ftabs" role="tablist" aria-label="Show">${tabs.map(([k, l, c]) => `<button role="tab" data-act="tab" data-f="${k}" aria-selected="${filter === k}">${l}<small>${c}</small></button>`).join('')}</div>`;
  if (vr.length) h += `<div class="tree">${vr.map((k) => nodeHTML(k, base)).join('')}</div>`;
  else {
    const msg = { 0: 'Nothing left to start here', 1: 'Nothing is partly done yet', 2: 'Nothing is marked done yet. Tap a circle to start', rev: 'No topics flagged for revision here' }[filter] || 'No topics';
    h += `<div class="empty">${msg}</div>`;
  }
  h += '<p class="keys foot"><span><i class="src s-official"></i>Official syllabus</span><span><i class="src s-notes"></i>Your notes</span><span>No dot: added for depth</span></p>';
  h += '</div>';
  h += `<aside class="rail"><div class="sum">${stack(p)}<div class="sum-t"><span><b>${p.done}</b> of ${p.cnt} done</span><span><b>${p.part}</b> partial</span></div></div>
    <div class="tree-tools"><button class="textbtn" data-act="expall">Expand all</button><button class="textbtn" data-act="colall">Collapse all</button></div>
    <p class="keys"><span><i class="src s-official"></i>Named in the official syllabus</span><span><i class="src s-notes"></i>From your notes</span><span>No dot: added for depth</span></p></aside></div>`;
  return h;
}

/* ---------- Search / Revise / Notes ---------- */
function searchShell() {
  return `<div class="narrow"><div class="sbox"><span class="sico">${ico('search')}</span><input id="sq" type="search" value="${esc(squery)}" placeholder="Search topics and notes" autocomplete="off" aria-label="Search topics and notes"></div><div id="results"></div></div>`;
}
function updateResults() {
  const box = $('#results');
  if (!box) return;
  const words = squery.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) { box.innerHTML = '<div class="empty">Searches topic titles, their paths and your notes</div>'; return; }
  const hits = [];
  for (const n of MAP.values()) {
    const hay = (n.title + ' ' + n.note + ' ' + (S.n[n.id] || '') + ' ' + crumb(n)).toLowerCase();
    if (words.every((w) => hay.includes(w))) hits.push(n);
  }
  hits.sort((a, b) => {
    const A = a.title.toLowerCase().includes(words[0]) ? 0 : 1;
    const B = b.title.toLowerCase().includes(words[0]) ? 0 : 1;
    return A - B || a.depth - b.depth;
  });
  box.innerHTML = hits.length
    ? `<p class="resn">${hits.length} result${hits.length === 1 ? '' : 's'}${hits.length > 60 ? ' (showing 60)' : ''}</p><ul class="list">${hits.slice(0, 60).map((n) => itemHTML(n, { full: true })).join('')}</ul>`
    : '<div class="empty">No topic matches. Try a shorter word</div>';
}

function reviseHTML() {
  const flagged = [...MAP.values()].filter((n) => S.r[n.id]);
  if (!flagged.length) {
    return '<div class="narrow"><div class="empty big"><b>Nothing flagged for revision</b><p>Tap any topic, then Revise, for things you keep forgetting. They collect here.</p><a class="btn pri" href="#/">Go to syllabus</a></div></div>';
  }
  let h = `<div class="narrow"><p class="resn">${flagged.length} topic${flagged.length === 1 ? '' : 's'} to revise</p>`;
  for (const r of ROOTS) {
    const mine = flagged.filter((n) => rootOf(n).id === r.id);
    if (!mine.length) continue;
    h += `<h2 class="sec"><span>${esc(r.num)} · ${esc(short(r.title))}</span><small>${mine.length}</small></h2><ul class="list">${mine.map((n) => itemHTML(n, { actions: `<button class="btn sm act" data-act="unflag" data-id="${esc(n.id)}">${ico('check')}Revised</button>` })).join('')}</ul>`;
  }
  return h + '</div>';
}

function notesHTML() {
  const withNotes = [...MAP.values()].filter((n) => S.n[n.id] && S.n[n.id].trim());
  if (!withNotes.length) {
    return '<div class="narrow"><div class="empty big"><b>No notes yet</b><p>Tap any topic, then Note, to save a formula, a trick or a resource. All your notes collect here.</p><a class="btn pri" href="#/">Go to syllabus</a></div></div>';
  }
  let h = `<div class="narrow"><p class="resn">${withNotes.length} note${withNotes.length === 1 ? '' : 's'}</p>`;
  for (const r of ROOTS) {
    const mine = withNotes.filter((n) => rootOf(n).id === r.id);
    if (!mine.length) continue;
    h += `<h2 class="sec"><span>${esc(r.num)} · ${esc(short(r.title))}</span><small>${mine.length}</small></h2><ul class="list">${mine.map((n) => itemHTML(n, { body: `<div class="nbody">${esc(S.n[n.id])}</div>` }).replace('data-act="open"', 'data-act="opennote"')).join('')}</ul>`;
  }
  return h + '</div>';
}

/* ---------- render ---------- */
let lastKey = null;
const scrollMemo = {};
function render() {
  if (!ROOTS.length) return;
  const r = parseRoute();
  const key = r.name + (r.id || '');
  const changed = key !== lastKey;
  if (changed && lastKey !== null) scrollMemo[lastKey] = window.scrollY;
  vm = new Map(); pm = new Map();
  if (changed && r.name === 'node' && !hlId) filter = 'all';   // each section starts on "All"

  renderChrome(r);
  const view = $('#view');
  if (r.name === 'search') {
    if (changed || !$('#sq')) { if (changed) squery = ''; view.innerHTML = searchShell(); }
    updateResults();
    if (changed) $('#sq').focus({ preventScroll: true });
  } else if (r.name === 'node') {
    view.innerHTML = nodeView(MAP.get(r.id));
  } else if (r.name === 'revise') view.innerHTML = reviseHTML();
  else if (r.name === 'notes') view.innerHTML = notesHTML();
  else view.innerHTML = homeHTML();

  if (changed) {
    lastKey = key;
    window.scrollTo(0, hlId ? 0 : scrollMemo[key] || 0);
  }
  if (addingTo) { const i = view.querySelector('.addForm input'); if (i) i.focus(); }
  if (hlId) {
    const el = view.querySelector(`[data-node="${CSS.escape(hlId)}"]`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'center' }));
    setTimeout(() => { hlId = null; document.querySelectorAll('.hl').forEach((e) => e.classList.remove('hl')); }, 2600);
  }
}

/* ---------- changes + undo ---------- */
let toastTimer = null;
let undoPatch = null;

function inverse(change) {
  const inv = {};
  for (const k of MAP_KEYS) { inv[k] = {}; for (const id of Object.keys(change[k] || {})) inv[k][id] = S[k][id] === undefined ? null : S[k][id]; }
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

function setStatus(id, v, withToast) {
  const n = MAP.get(id);
  if (!n) return;
  const ls = leaves(n);
  const now = Date.now();
  const change = { s: {}, t: {} };
  ls.forEach((l) => { change.s[l.id] = v || null; change.t[l.id] = v ? now : null; });
  const msg = withToast ? (ls.length > 1 ? `${ls.length} topics marked “${SN[v]}”` : `“${n.title}” marked ${SN[v].toLowerCase()}`) : (ls.length > 1 ? `${ls.length} topics marked “${SN[v]}”` : null);
  commit(change, msg);
}
const cycle = (id) => { const n = MAP.get(id); if (n) setStatus(id, (stOf(n) + 1) % 3, false); };

/* ---------- events ---------- */
/* A destructive button that needs a second tap: the first tap changes its label, the second runs the action.
   It goes back to normal after 4 seconds, or when the panel closes. */
let disarmSignout = null;
export function confirmTwice(btn, armedLabel, action) {
  const label = btn.textContent;
  let timer = null;
  const reset = () => { clearTimeout(timer); timer = null; btn.textContent = label; btn.classList.remove('danger'); };
  disarmSignout = reset;
  btn.addEventListener('click', () => {
    if (timer) { reset(); action(); return; }
    btn.textContent = armedLabel;
    btn.classList.add('danger');
    timer = setTimeout(reset, 4000);
  });
}
function closePop() { $('#pop').hidden = true; if (disarmSignout) disarmSignout(); }
function openPop(btn) {
  const pop = $('#pop');
  pop.hidden = !pop.hidden;
  if (!pop.hidden) { const r = btn.getBoundingClientRect(); pop.style.top = `${r.bottom + 6}px`; pop.style.right = `${Math.max(8, window.innerWidth - r.right)}px`; }
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#pop') && !e.target.closest('[data-act=acct]')) closePop();
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = b.dataset.id;
  const act = b.dataset.act;
  const n = id ? MAP.get(id) : null;

  switch (act) {
    case 'acct': openPop(b); return;
    case 'undo':
      if (undoPatch) { store.patch(undoPatch); undoPatch = null; $('#toast').hidden = true; buildTree(); render(); }
      return;
    case 'tog': open.has(id) ? open.delete(id) : open.add(id); saveOpen(); render(); return;
    case 'opt': menuFor = menuFor === id ? null : id; confirmDel = null; render(); return;
    case 'menu': menuFor = menuFor === id ? null : id; confirmDel = null; render(); return;
    case 'st': cycle(id); render(); return;
    case 'set': setStatus(id, Number(b.dataset.v), false); render(); return;
    case 'quick': setStatus(id, Number(b.dataset.v), true); render(); return;
    case 'flag': commit({ r: { [id]: S.r[id] ? null : 1 } }); render(); return;
    case 'unflag': commit({ r: { [id]: null } }, `“${n ? n.title : 'Topic'}” removed from revise`); render(); return;
    case 'note': {
      openNote.has(id) ? openNote.delete(id) : openNote.add(id); render();
      const t = document.querySelector(`[data-note="${CSS.escape(id)}"]`); if (t && openNote.has(id)) t.focus();
      return;
    }
    case 'add': addingTo = addingTo === id ? null : id; open.add(id); saveOpen(); render(); return;
    case 'canceladd': addingTo = null; render(); return;
    case 'focus': menuFor = null; go('n/' + id); return;
    case 'open': reveal(id); return;
    case 'opennote': reveal(id, { note: true }); return;
    case 'tab': filter = b.dataset.f; render(); return;
    case 'expall': { const r = parseRoute(); const root = MAP.get(r.id); if (root) subtreeIds(root).forEach((i) => { if (MAP.get(i).children.length) open.add(i); }); saveOpen(); render(); return; }
    case 'colall': { const r = parseRoute(); const root = MAP.get(r.id); if (root) subtreeIds(root).forEach((i) => open.delete(i)); saveOpen(); render(); return; }
    case 'exam-edit': examEdit = true; render(); return;
    case 'exam-cancel': examEdit = false; render(); return;
    case 'exam-clear': examEdit = false; commit({ m: { exam: null } }); render(); return;
    case 'exam-save': { const v = $('#examDate').value; examEdit = false; commit({ m: { exam: v || null } }); render(); return; }
    case 'del': {
      if (!n || !n.custom) return;
      if (n.children.length && confirmDel !== id) { confirmDel = id; render(); return; }
      const change = { s: {}, r: {}, n: {}, c: {}, t: {} };
      subtreeIds(n).forEach((i) => { change.s[i] = null; change.r[i] = null; change.n[i] = null; change.c[i] = null; change.t[i] = null; });
      commit(change, `Removed “${n.title}”`);
      menuFor = null; confirmDel = null;
      buildTree(); render();
      return;
    }
    default:
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closePop(); if (addingTo && e.target.closest('.addForm')) { addingTo = null; render(); } }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button][data-act]')) { e.preventDefault(); e.target.click(); }
});

$('#view').addEventListener('input', (e) => {
  if (e.target.matches('#sq')) { squery = e.target.value; updateResults(); return; }
  const t = e.target.closest('[data-note]');
  if (t) commit({ n: { [t.dataset.note]: t.value.trim() ? t.value : null } });
});
$('#view').addEventListener('focusout', (e) => { if (e.target.matches('[data-note]')) render(); });
$('#view').addEventListener('submit', (e) => {
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

/* ---------- per-device view state (which branches are open) ---------- */
function saveOpen() { try { localStorage.setItem(OPEN_KEY, JSON.stringify([...open])); } catch { /* ignore */ } }
function loadOpen() { try { const a = JSON.parse(localStorage.getItem(OPEN_KEY) || '[]'); if (Array.isArray(a)) open = new Set(a); } catch { /* ignore */ } }

/* ---------- mount: show the whole app at once, never a half-built page ---------- */
let mounted = false;
function mount() {
  if (mounted) return;
  mounted = true;
  document.documentElement.classList.add('ready');
  const b = $('#boot');
  b.classList.add('done');
  setTimeout(() => b.remove(), 260);
}
setTimeout(() => { if (!mounted) $('#bootMsg').textContent = 'Taking longer than usual. Check your connection'; }, 12000);

/* ---------- start ---------- */
async function loadSyllabus() {
  const res = await fetch('syllabus.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

function showSync(t) {
  $('#sync').textContent = t;
  const kind = /could not|problem|not allowed/i.test(t) ? 'err' : /synced|saved on this device/i.test(t) ? 'ok' : 'warn';
  document.documentElement.dataset.sync = kind;
}

async function init() {
  loadOpen();
  const syllabus = loadSyllabus();
  syllabus.catch(() => {}); // handled below; avoids an unhandled-rejection warning while login is open

  // ?local skips login and uses browser-only storage (for testing the UI)
  if (new URLSearchParams(location.search).has('local')) {
    store = createLocalStore();
    ME = 'Local';
    $('#acct').textContent = 'Local test mode (not synced).';
  } else {
    try {
      const [{ requireLogin, signOutUser }, { createCloudStore }] = await Promise.all([import('./login.js'), import('./cloud-store.js')]);
      const user = await requireLogin();
      store = createCloudStore(user.uid);
      await store.ready;
      ME = user.displayName || 'You';
      $('#acct').innerHTML = `Signed in as <b>${esc(ME)}</b><br><button type="button" id="signout" class="btn sm">Sign out</button>`;
      confirmTwice($('#signout'), 'Tap again to sign out', signOutUser);
    } catch (e) {
      $('#view').innerHTML = '<div class="empty">Could not connect to the login service. Check your internet connection and refresh</div>';
      console.error(e);
      mount();
      return;
    }
  }

  S = store.state;
  store.onStatus(showSync);
  store.onChange(() => {
    S = store.state;
    buildTree();
    if (document.activeElement && document.activeElement.matches('[data-note], #examDate')) renderChrome(parseRoute()); // don't steal focus while typing
    else render();
  });
  try {
    STATIC = await syllabus;
  } catch {
    $('#view').innerHTML = '<div class="empty">Could not load the syllabus. Check your connection and refresh</div>';
    mount();
    return;
  }
  buildTree(); render();
  mount();
}
init();
