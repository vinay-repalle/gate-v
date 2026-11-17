/* Offline + "install to home screen" support. Safe to fail: the site works without it. */
const $ = (s) => document.querySelector(s);

// 1. service worker (also skipped for the ?local test mode so UI tests aren't cached)
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Offline mode unavailable:', e));
  });
}

// 2. install button (Android / desktop Chrome / Edge). iPhone has no such button, so show a hint instead.
let deferred = null;
const row = $('#installRow');
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  if (row && !standalone) { row.hidden = false; $('#installHint').hidden = true; $('#install').hidden = false; }
});
window.addEventListener('appinstalled', () => { deferred = null; if (row) row.hidden = true; });

if (row && !standalone && /iphone|ipad|ipod/i.test(navigator.userAgent)) {
  row.hidden = false;
  $('#install').hidden = true;
  $('#installHint').hidden = false;       // "Share → Add to Home Screen"
}

$('#install')?.addEventListener('click', async () => {
  if (!deferred) return;
  deferred.prompt();
  await deferred.userChoice;
  deferred = null;
  row.hidden = true;
});
