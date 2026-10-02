// Shared helpers for the Stage 2 screenshot suite: tiny static server,
// deterministic browser context, and screenshot-noise neutraliser.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain',
};

/** Serves the repo root read-only (source, not dist/) on an ephemeral port. */
export function startServer(root = ROOT) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(buf);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    resolve({ server, url: `http://127.0.0.1:${server.address().port}` });
  }));
}

/** Test-only CSS: freezes motion without touching production stylesheets. */
export const NOISE_CSS = `
*,*::before,*::after{animation-duration:0s !important;animation-delay:0s !important;transition-duration:0s !important;transition-delay:0s !important;scroll-behavior:auto !important;caret-color:transparent !important}
`;

/** Seeded PRNG + frozen clock so Journey rolls and Prep timestamps are reproducible. */
export const DETERMINISM_INIT = `
(() => {
  let s = 0x2f6e2b1;
  Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const FIXED = Date.UTC(2026, 9, 2, 12, 0, 0);
  const RealDate = Date;
  Date = class extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(FIXED); }
    static now() { return FIXED; }
  };
})();
`;

/* ------------------------------------------------------------------ */
/* Deterministic app state (written to localStorage before app boot).  */
/* ------------------------------------------------------------------ */
export const FIXED_ISO = '2026-10-02T12:00:00.000Z';

const PREP_FULL = {
  environmentIds: ['harsh-desert', 'port-city', 'ancient-tomb'],
  adversaryIds: ['ahuizotl', 'acid-burrower', 'apprentice-assassin', 'arch-necromancer'],
  itemIds: ['ci1', 'ci2', 'ci3', 'ci4'],
};
const PREP_PARTIAL = { environmentIds: ['harsh-desert'], adversaryIds: ['ahuizotl'], itemIds: [] };

function prepStore(sel, title = 'Audit prep') {
  return JSON.stringify({
    schemaVersion: 2, activeSessionId: 'audit-1',
    sessions: [{ id: 'audit-1', title, notes: '', createdAt: FIXED_ISO, updatedAt: FIXED_ISO, ...sel }],
  });
}

/** Named, reproducible storage profiles. `hint: true` leaves the Prep
 *  session-hint flag unset so the hint appears naturally. */
export function profile(name) {
  const base = { dhcodex_lang: '"en"', dhcodex_storage_notice_dismissed: '1', dhcodex_session_prep_hint_seen: '1' };
  const lists = {
    dhcodex_lists: JSON.stringify([{ id: 'list-a', name: 'Frozen north' }, { id: 'list-b', name: 'Heist night' }, { id: 'list-c', name: 'Desert caravans' }]),
    dhcodex_env_lists: JSON.stringify({ 'harsh-desert': ['list-a', 'list-c'], 'port-city': ['list-b'], 'ancient-tomb': ['list-b'] }),
  };
  switch (name) {
    case 'full': return { ...base, ...lists, dhcodex_session_prep: prepStore(PREP_FULL) };
    case 'partial': return { ...base, ...lists, dhcodex_session_prep: prepStore(PREP_PARTIAL) };
    case 'empty': return { ...base };
    case 'hint': return { ...base, ...lists, dhcodex_session_prep: prepStore(PREP_FULL), dhcodex_session_prep_hint_seen: undefined };
    case 'notice': return { ...base, dhcodex_storage_notice_dismissed: undefined };
    case 'ru': return { ...base, ...lists, dhcodex_lang: '"ru"', dhcodex_session_prep: prepStore(PREP_FULL) };
    default: throw new Error('unknown profile ' + name);
  }
}

export function seedScript(values) {
  return `(() => { try { if (sessionStorage.getItem('__audit_seeded')) return;
    const v = ${JSON.stringify(values)};
    for (const k in v) { if (v[k] === undefined || v[k] === null) localStorage.removeItem(k); else localStorage.setItem(k, v[k]); }
    sessionStorage.setItem('__audit_seeded', '1'); } catch (e) {} })();`;
}
