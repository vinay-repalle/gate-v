/* Single place that loads Firebase (version pinned here) and initialises it.
 * The web config is an identifier, not a secret: access is enforced by firestore.rules. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, onSnapshot, setDoc, deleteField,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBW4r7AZjIJqp4lusCdnwvasIBQLhdZRo8',
  authDomain: 'gate-ece-tracker-v.firebaseapp.com',
  projectId: 'gate-ece-tracker-v',
  storageBucket: 'gate-ece-tracker-v.firebasestorage.app',
  messagingSenderId: '828588747226',
  appId: '1:828588747226:web:57c6772fade128d9f538e3',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// offline cache: edits made without internet are kept and sent when the connection returns
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut,
  doc, onSnapshot, setDoc, deleteField,
};
