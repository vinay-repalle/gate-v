/* Name + 4-digit PIN login.
 * Behind the scenes this is Firebase email/password: the name becomes a fake email and the
 * PIN is padded to the 6+ characters Firebase requires. Firebase rate-limits wrong guesses. */
import {
  auth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut,
} from './fb.js';

const $ = (s) => document.querySelector(s);
const nameKey = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const emailFor = (name) => `${nameKey(name)}@gate-tracker.example.com`;
const passwordFor = (pin) => `${pin}-gate27-ece`;

const MESSAGES = {
  'auth/invalid-credential': 'Wrong name or PIN.',
  'auth/invalid-login-credentials': 'Wrong name or PIN.',
  'auth/user-not-found': 'Wrong name or PIN.',
  'auth/wrong-password': 'Wrong name or PIN.',
  'auth/email-already-in-use': 'That name is already taken. Pick another, or sign in.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes and try again.',
  'auth/network-request-failed': 'No internet connection. Try again when you are online.',
  'auth/operation-not-allowed': 'Login is not switched on yet (Firebase → Authentication → Email/Password).',
};

function waitForAuth() {
  return new Promise((resolve) => {
    const off = onAuthStateChanged(auth, (user) => { off(); resolve(user); });
  });
}

/** Resolves with the signed-in Firebase user; shows the login screen if needed. */
export async function requireLogin() {
  const existing = await waitForAuth();
  if (existing) return existing;
  return new Promise((resolve) => {
    const box = $('#auth');
    const form = $('#authForm');
    const err = $('#authErr');
    let creating = false;

    const paint = () => {
      $('#authTitle').textContent = creating ? 'Create your account' : 'Welcome back';
      $('#authGo').textContent = creating ? 'Create account' : 'Sign in';
      $('#authSwitch').textContent = creating ? 'I already have an account' : 'New here? Create an account';
      form.elements.pin.autocomplete = creating ? 'new-password' : 'current-password';
      err.textContent = '';
    };
    $('#authSwitch').onclick = () => { creating = !creating; paint(); };
    form.elements.pin.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });

    form.onsubmit = async (e) => {
      e.preventDefault();
      const name = form.elements.name.value.trim();
      const pin = form.elements.pin.value;
      if (nameKey(name).length < 2) { err.textContent = 'Enter a name with at least 2 letters or numbers.'; return; }
      if (!/^\d{4}$/.test(pin)) { err.textContent = 'The PIN must be exactly 4 digits.'; return; }
      const btn = $('#authGo');
      btn.disabled = true; err.textContent = '';
      try {
        let cred;
        if (creating) {
          cred = await createUserWithEmailAndPassword(auth, emailFor(name), passwordFor(pin));
          try { await updateProfile(cred.user, { displayName: name }); } catch { /* name is only for display */ }
        } else {
          cred = await signInWithEmailAndPassword(auth, emailFor(name), passwordFor(pin));
        }
        box.hidden = true;
        resolve(cred.user);
      } catch (ex) {
        err.textContent = MESSAGES[ex.code] || `Could not sign in (${ex.code || ex.message}).`;
      } finally { btn.disabled = false; }
    };

    paint();
    box.hidden = false;
    form.elements.name.focus();
  });
}

export async function signOutUser() {
  await signOut(auth);
  location.reload();
}
