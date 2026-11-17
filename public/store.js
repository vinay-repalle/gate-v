/* Storage layer. The UI only talks to this interface:
 *
 *   store.state            -> { s:{id:1|2}, r:{id:1}, n:{id:text}, c:{id:{p,t}}, t:{id:ms}, m:{exam:'YYYY-MM-DD'} }
 *   (t = when a topic's status was last changed, m = small settings such as the exam date)
 *   store.patch(change)    -> same shape as state; a null value deletes that key
 *   store.onChange(cb)     -> called when data changed from outside (other tab / other device)
 *   store.onStatus(cb)     -> called with a short status string for the footer
 *
 * Every map is keyed by node id, so two devices editing different topics never overwrite
 * each other once the Firebase store is plugged in (step 3).
 */

const KEY = 'gate_ece_progress_v2';
const MAPS = ['s', 'r', 'n', 'c', 't', 'm'];

export const emptyState = () => ({ s: {}, r: {}, n: {}, c: {}, t: {}, m: {} });

export function normalize(d) {
  const out = emptyState();
  if (d && typeof d === 'object') {
    for (const k of MAPS) if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) out[k] = { ...d[k] };
  }
  return out;
}

export function applyPatch(state, change) {
  for (const k of MAPS) {
    const part = change[k];
    if (!part) continue;
    for (const [id, v] of Object.entries(part)) {
      if (v === null || v === undefined) delete state[k][id];
      else state[k][id] = v;
    }
  }
}

export function createLocalStore() {
  let state = emptyState();
  let statusText = 'Saved on this device';
  const changeCbs = new Set();
  const statusCbs = new Set();

  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = normalize(JSON.parse(raw));
  } catch { /* private mode / blocked storage: start empty */ }

  const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch { setStatus('Could not save on this device (storage blocked)'); }
  };
  const setStatus = (t) => { statusText = t; statusCbs.forEach((cb) => cb(t)); };

  // Another tab on this device changed the data.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    try { state = normalize(JSON.parse(e.newValue)); } catch { return; }
    changeCbs.forEach((cb) => cb());
  });

  return {
    get state() { return state; },
    patch(change) { applyPatch(state, change); persist(); },
    onChange(cb) { changeCbs.add(cb); },
    onStatus(cb) { statusCbs.add(cb); cb(statusText); },
  };
}
