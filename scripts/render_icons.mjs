// Renders scripts/app-icon.svg to the PNG app icons in public/icons/ using headless Chrome.
// Run:  node scripts/render_icons.mjs            (needs Google Chrome; set CHROME=/path/to/chrome if it is elsewhere)
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'public', 'icons');
mkdirSync(out, { recursive: true });
const svg = readFileSync(join(here, 'app-icon.svg'), 'utf8');

// the Android "maskable" icon is full-bleed (the phone crops it) and keeps the art inside the middle 80%
const maskable = svg
  .replace('rx="230"', 'rx="0"')
  .replace('translate(512 512) scale(1.08)', 'translate(512 512) scale(.8)');

const JOBS = [
  { file: 'icon-192.png', size: 192, svg },
  { file: 'icon-512.png', size: 512, svg },
  { file: 'icon-maskable-512.png', size: 512, svg: maskable },
  { file: 'apple-touch-icon.png', size: 180, svg: svg.replace('rx="230"', 'rx="0"') }, // iOS rounds the corners itself
];

const PORT = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(process.env.CHROME || '/usr/bin/google-chrome', [
  '--headless=new', '--no-first-run', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'icon-'))}`, `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(150); }
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const waiting = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id) { waiting.get(d.id)?.(d); waiting.delete(d.id); } };
const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
const cmd = (m, p) => send(m, p, sessionId);
await cmd('Page.enable');

for (const job of JOBS) {
  await cmd('Emulation.setDeviceMetricsOverride', { width: job.size, height: job.size, deviceScaleFactor: 1, mobile: false });
  await cmd('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }); // transparent corners
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block;width:${job.size}px;height:${job.size}px}</style>${job.svg}`;
  await cmd('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(html) });
  await sleep(500);
  const r = await cmd('Page.captureScreenshot', { format: 'png', omitBackground: true });
  writeFileSync(join(out, job.file), Buffer.from(r.result.data, 'base64'));
  console.log('wrote', job.file, job.size + 'px');
}
await send('Browser.close').catch(() => {});
chrome.kill();
process.exit(0);
