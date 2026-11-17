/* Firestore-backed store with the same interface as store.js.
 * Data lives in one document per person: users/{uid}  ->  { s:{}, r:{}, n:{}, c:{} }
 * Every change is written per topic id (merge), so two devices editing different topics
 * never overwrite each other. Live updates arrive through onSnapshot.
 */
import { db, doc, onSnapshot, setDoc, deleteField } from './fb.js';
import { emptyState, normalize, applyPatch } from './store.js';

const MAPS = ['s', 'r', 'n', 'c'];
const FLUSH_MS = 600;

const stable = (v) => (v && typeof v === 'object'
  ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'
  : JSON.stringify(v));
const sameState = (a, b) => MAPS.every((k) => stable(a[k]) === stable(b[k]));

export function createCloudStore(uid) {
  const ref = doc(db, 'users', uid);
  let state = emptyState();
  let pending = null;           // changes not yet sent to Firestore
  let timer = null;
  let statusText = 'Connecting…';
  const changeCbs = new Set();
  const statusCbs = new Set();
  const setStatus = (t) => { statusText = t; statusCbs.forEach((cb) => cb(t)); };

  function flush() {
    clearTimeout(timer); timer = null;
    if (!pending) return;
    const out = {};
    for (const k of MAPS) {
      const part = pending[k];
      if (!part || !Object.keys(part).length) continue;
      out[k] = {};
      for (const [id, v] of Object.entries(part)) out[k][id] = v === null ? deleteField() : v;
    }
    pending = null;
    if (!Object.keys(out).length) return;
    setDoc(ref, out, { merge: true }).catch((e) => {
      setStatus(e.code === 'permission-denied' ? 'Could not save: not allowed (check Firestore rules)' : 'Could not save: ' + (e.code || e.message));
    });
  }

  const ready = new Promise((resolve) => {
    let first = true;
    const giveUp = setTimeout(() => { if (first) { first = false; setStatus('Offline — working from this device'); resolve(); } }, 8000);
    onSnapshot(ref, { includeMetadataChanges: true }, (snap) => {
      const next = snap.exists() ? normalize(snap.data()) : emptyState();
      if (pending) applyPatch(next, pending);          // keep edits that haven't been sent yet
      const changed = !sameState(state, next);
      MAPS.forEach((k) => { state[k] = next[k]; });   // update in place: the app keeps a reference to this object

      if (pending || snap.metadata.hasPendingWrites) setStatus('Saving…');
      else if (snap.metadata.fromCache && !navigator.onLine) setStatus('Offline — saved on this device, will sync when online');
      else setStatus('Synced ✓');

      if (first) { first = false; clearTimeout(giveUp); resolve(); }
      else if (changed) changeCbs.forEach((cb) => cb());
    }, (err) => {
      setStatus(err.code === 'permission-denied' ? 'Not allowed to read your data (check Firestore rules)' : 'Sync problem: ' + (err.code || err.message));
      if (first) { first = false; clearTimeout(giveUp); resolve(); }
    });
  });

  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  return {
    ready,
    get state() { return state; },
    patch(change) {
      applyPatch(state, change);
      pending = pending || emptyState();
      for (const k of MAPS) for (const [id, v] of Object.entries(change[k] || {})) pending[k][id] = v === undefined ? null : v;
      setStatus('Saving…');
      clearTimeout(timer);
      timer = setTimeout(flush, FLUSH_MS);
    },
    onChange(cb) { changeCbs.add(cb); },
    onStatus(cb) { statusCbs.add(cb); cb(statusText); },
  };
}
