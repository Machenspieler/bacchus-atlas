#!/usr/bin/env node
// Stage 4 task 06 — contact sheets for the breakpoint cleanup. "Before" frames are the same page
// rendered with the pre-change stylesheet (--before-css=<file>, served in place of css/styles.css).
//   node scripts/design-audit/stage4-breakpoints-shots.mjs --before-css=<path>
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { startServer, ROOT } from './lib.mjs';
import { Recorder, launch, openSession, go, settle, parkMouse } from './harness.mjs';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
const OUT = path.resolve(ROOT, 'docs/design-audit/stage-4/task-06-breakpoints');
const RAW = path.join(OUT, 'frames');
fs.mkdirSync(RAW, { recursive: true });
const beforeCss = fs.readFileSync(arg('before-css'), 'utf8');
const rec = new Recorder(OUT);
const { server, url } = await startServer();
const browser = await launch();

async function frame(name, { width, height, hash, before = false, act }) {
  const s = await openSession(browser, url, { width, height }, 'full', rec);
  if (before) await s.context.route('**/css/styles.css*', r => r.fulfill({ status: 200, contentType: 'text/css', body: beforeCss }));
  await go(s, hash, { reload: true });
  if (hash === '#/prep') await s.page.waitForSelector('.prep-wrap');
  if (act) await act(s);
  await parkMouse(s); await settle(s.page);
  const file = path.join(RAW, name + '.png');
  await s.page.screenshot({ path: file, fullPage: false });
  await s.context.close();
  return file;
}
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const text = (w, h, t, size = 14, fill = '#d8cdb0') => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="2" y="${h - 6}" font-family="Arial, sans-serif" font-size="${size}" fill="${fill}">${esc(t)}</text></svg>`);
async function grid(file, title, rows, cell) {
  // rows: [{label, items:[[src,caption]...]}]
  const pad = 10, cap = 24, head = 40, lab = 26, cols = Math.max(...rows.map(r => r.items.length));
  const W = cols * (cell.w + pad) + pad, H = head + rows.length * (lab + cell.h + cap + pad) + pad;
  const comps = [{ input: text(W, head, title, 16), left: 8, top: 4 }];
  for (let r = 0; r < rows.length; r++) {
    const y0 = head + r * (lab + cell.h + cap + pad);
    comps.push({ input: text(W, lab, rows[r].label, 14, '#e6b34a'), left: 8, top: y0 });
    for (let i = 0; i < rows[r].items.length; i++) {
      const [src, c] = rows[r].items[i], x = pad + i * (cell.w + pad), y = y0 + lab;
      const buf = await sharp(src).resize(cell.w, cell.h, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      const m = await sharp(buf).metadata();
      comps.push({ input: buf, left: x, top: y + cap }, { input: text(cell.w, cap, c), left: x, top: y });
      void m;
    }
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: '#0b0908' } }).composite(comps).png().toFile(path.join(OUT, file));
  console.log('  + ' + file);
}

// 1 · 640 / 641 / 642 — catalog + prep, before vs after
const rowsA = [];
for (const [route, hash] of [['catalog', '#/catalog'], ['prep', '#/prep']]) {
  for (const before of [true, false]) {
    const items = [];
    for (const w of [640, 641, 642]) items.push([await frame(`${w}x900__${route}__${before ? 'before' : 'after'}`, { width: w, height: 900, hash, before }), `${w}×900`]);
    rowsA.push({ label: `${route} — ${before ? 'BEFORE (641 is its own state: dim watermark, wide-layout header)' : 'AFTER (641 matches 642; only the 640→641 composition step remains)'}`, items });
  }
}
await grid('contact-sheet__640-641-642__before-after.png', 'Phone boundary: 640 / 641 / 642 at 900px height — identical data/state, before vs after', rowsA, { w: 420, h: 420 });

// 2 · tablet fixes — Items toolbar overflow @1000, adv Type panel @700
const openType = async s => { const t = s.page.locator('.prep-adv-toolbar .ms-trigger').first(); await t.scrollIntoViewIfNeeded(); await t.click(); await s.page.waitForTimeout(250); };
const rowsB = [];
for (const before of [true, false]) {
  rowsB.push({ label: before ? 'BEFORE' : 'AFTER', items: [
    [await frame(`1000x800__prep__items-toolbar__${before ? 'before' : 'after'}`, { width: 1000, height: 800, hash: '#/prep', before, act: async s => { await s.page.locator('.prep-items-panel').scrollIntoViewIfNeeded(); } }), 'Items toolbar @ 1000×800 (viewport scrolled to the panel)'],
    [await frame(`700x900__prep__adv-type-panel__${before ? 'before' : 'after'}`, { width: 700, height: 900, hash: '#/prep', before, act: openType }), 'Adversary Type panel open @ 700×900'],
  ] });
}
await grid('contact-sheet__tablet-fixes__before-after.png', 'Geometry-tied thresholds fixed in this task (best-effort tablet range)', rowsB, { w: 640, h: 560 });

// 3 · main targets (unchanged layout) — catalog + prep at 1366 / 1440 / 1920
const rowsC = [];
for (const [route, hash] of [['catalog', '#/catalog'], ['prep', '#/prep']]) {
  const items = [];
  for (const [w, h] of [[1366, 768], [1440, 900], [1920, 1080]]) items.push([await frame(`${w}x${h}__${route}__after`, { width: w, height: h, hash }), `${w}×${h}`]);
  rowsC.push({ label: `${route} — after (layout measurements identical to before at ≥1200px; see boundaries__*.json)`, items });
}
await grid('contact-sheet__main-targets__1366-1440-1920.png', 'Main targets — catalog and Prep', rowsC, { w: 600, h: 400 });

await browser.close(); server.close();
