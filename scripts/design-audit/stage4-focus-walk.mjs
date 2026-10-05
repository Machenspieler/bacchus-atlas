#!/usr/bin/env node
// Stage 4 task 04 — keyboard tab-walk. Presses a real Tab key through each page and, at every stop,
// reads what the user would actually see: the element's own ring, a ring worn by a container
// (:has() patterns), whether the ring is clipped by an overflow ancestor, and whether two rings stack.
//   node scripts/design-audit/stage4-focus-walk.mjs [label]
// Writes docs/design-audit/stage-4/task-04-focus-states/focus-walk.json and prints anomalies.
import fs from 'node:fs';
import path from 'node:path';
import { startServer, ROOT } from './lib.mjs';
import { Recorder, launch, openSession, go, settle } from './harness.mjs';

const OUT = path.resolve(ROOT, 'docs/design-audit/stage-4/task-04-focus-states');
const label = process.argv[2] || 'after';
const PAGES = [
  ['catalog', '#/', 'full'], ['lists', '#/lists', 'full'], ['prep', '#/prep', 'full'],
  ['journey', '#/journey', 'full'], ['env-detail', '#/env/harsh-desert', 'full'],
];

function probe() {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const ring = e => { const c = getComputedStyle(e); const w = parseFloat(c.outlineWidth) || 0; return c.outlineStyle !== 'none' && w > 0 ? { w, off: parseFloat(c.outlineOffset) || 0, color: c.outlineColor } : null; };
  const rc = el.getBoundingClientRect(), cs = getComputedStyle(el);
  const own = ring(el);
  let host = null;
  for (let p = el.parentElement, d = 0; p && p !== document.body && d < 4; p = p.parentElement, d++) {
    const r = ring(p); if (r) { host = { cls: (p.className || p.tagName).toString().split(' ')[0], ...r }; break; }
  }
  const eff = own || host;
  let clipped = null;
  const base = own ? el : null;
  if (eff) {
    const src = own ? el : [...document.querySelectorAll('*')].find(x => x.contains(el) && x !== el && ring(x));
    const q = (src || el).getBoundingClientRect(), o = eff.off + eff.w;
    const box = { l: q.left - o, t: q.top - o, r: q.right + o, b: q.bottom + o };
    for (let p = (src || el).parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const c = getComputedStyle(p);
      if (['hidden', 'auto', 'scroll', 'clip'].some(v => c.overflowX === v || c.overflowY === v)) {
        const pr = p.getBoundingClientRect();
        if (box.l < pr.left - 0.5 || box.r > pr.right + 0.5 || box.t < pr.top - 0.5 || box.b > pr.bottom + 0.5) { clipped = (p.className || p.tagName).toString().split(' ')[0]; break; }
      }
    }
  }
  const tiny = rc.width < 4 || rc.height < 4;
  return {
    tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().split(' ').filter(Boolean).slice(0, 3).join('.'),
    id: el.id || '', name: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 28),
    type: el.type || '', fv: el.matches(':focus-visible'), disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
    own, host, double: !!(own && host), tiny, clipped, boxShadow: cs.boxShadow !== 'none', borderBottom: cs.borderBottomColor,
    rect: { x: Math.round(rc.x), y: Math.round(rc.y), w: Math.round(rc.width), h: Math.round(rc.height) },
  };
}

const rec = new Recorder(OUT);
const { server, url } = await startServer();
const browser = await launch();
const result = {};
for (const [name, hash, prof] of PAGES) {
  const s = await openSession(browser, url, { width: 1440, height: 900 }, prof, rec);
  await go(s, hash, { reload: true });
  await settle(s.page, { long: true });
  const stops = []; const seen = new Set();
  await s.page.keyboard.press('Tab');
  for (let i = 0; i < 160; i++) {
    const d = await s.page.evaluate(probe);
    if (d) {
      const key = d.tag + d.cls + d.id + d.name + JSON.stringify(d.rect);
      if (seen.has(key)) break; seen.add(key); stops.push(d);
    }
    await s.page.keyboard.press('Tab');
  }
  result[name] = stops;
  await s.page.context().close();
}
await browser.close(); server.close();

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, `focus-walk__${label}.json`), JSON.stringify(result, null, 1));
let bad = 0;
for (const [page, stops] of Object.entries(result)) {
  console.log(`\n== ${page}: ${stops.length} tab stops`);
  for (const d of stops) {
    const id = `${d.tag}.${d.cls}${d.id ? '#' + d.id : ''} "${d.name}"`;
    const ring = d.own ? `own ${d.own.w}px@${d.own.off}` : d.host ? `host(${d.host.cls}) ${d.host.w}px@${d.host.off}` : 'NONE';
    const flags = [!d.fv && 'not-focus-visible', !d.own && !d.host && 'NO-RING', d.double && 'DOUBLE', d.tiny && 'tiny', d.clipped && `CLIPPED by ${d.clipped}`].filter(Boolean);
    if (flags.length) { bad++; console.log(`  ! ${id}  ${ring}  [${flags.join(', ')}]`); }
  }
}
console.log(`\n${bad} flagged stops`);
