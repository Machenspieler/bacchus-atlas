#!/usr/bin/env node
// Stage 4 task 07 — labelled typography contact sheet (live elements, current stylesheet) and the
// before/after sheet for the elements whose typography changed (reads task-07 crops/ + measurements.json).
//   node scripts/design-audit/stage4-typography-sheets.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { startServer, ROOT } from './lib.mjs';
import { Recorder, launch, openSession, go, settle, parkMouse, hover } from './harness.mjs';

const OUT = path.resolve(ROOT, 'docs/design-audit/stage-4/task-07-typography');
const rec = new Recorder(OUT);
const { server, url } = await startServer();
const browser = await launch();
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const text = (w, h, t, size = 13, fill = '#d8cdb0') => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="2" y="${h - 6}" font-family="Arial, sans-serif" font-size="${size}" fill="${fill}">${esc(t)}</text></svg>`);

const prepSel = {
  title: '.prep-central-title', count: '.prep-central-count', selCard: '.prep-sel--card', selRow: '.prep-sel--row',
  pickRow: '.prep-env-panel .prep-row, .prep-col-env .prep-row', advRow: '.prep-adv-row',
};
// [label, state hash, act, selector, which-element-to-describe]
const ITEMS = [
  ['Site title (display, brand tracking)', '#/', null, '.brand-text h1'],
  ['Page title', '#/lists', null, '.page-title'],
  ['Section heading (Prep central)', '#/prep', null, '.prep-central-title'],
  ['Card title', '#/', null, '.grid .card:not(.card-random) .card-title'],
  ['Body text (card lore)', '#/', null, '.grid .card .card-lore'],
  ['Button label', '#/lists', null, '#new-list-btn'],
  ['Row name + metadata (Prep picker)', '#/prep', null, '.prep-adv-row .prep-adv-link', '.prep-row-name'],
  ['Row name + metadata (Prep central)', '#/prep', null, '.prep-sel--card .prep-sel-main', '.prep-sel-name'],
  ['Row metadata (Prep central)', '#/prep', null, '.prep-sel--card .prep-sel-meta'],
  ['Micro metadata (loot craft label / journey count)', '#/journey', null, '.journey-count'],
  ['Caps label (section label)', '#/env/harsh-desert', null, '.modal .section-label'],
  ['Informational chip (biome)', '#/', null, '.grid .card .biome-chip'],
  ['Status badge (feature type)', '#/env/harsh-desert', null, '.modal .feature-type.action'],
  ['Count badge (Prep central)', '#/prep', null, '.prep-central-count'],
  ['Tooltip', '#/', async s => { await hover(s, s.page.locator('.grid .card:not(.card-random) .card-add-btn').nth(1)); await s.page.waitForSelector('.tooltip', { state: 'visible', timeout: 4000 }); }, '.tooltip'],
  ['Toast', '#/lists', async s => { await s.page.fill('#new-list-input', 'Sheet list'); await s.page.click('#new-list-btn'); await s.page.waitForSelector('.toast', { timeout: 4000 }); }, '.toast'],
];

const cells = [];
let lastKey = '', s = null;
for (const [label, hash, act, sel, describe] of ITEMS) {
  s = await openSession(browser, url, { width: 1440, height: 900 }, 'full', rec);
  await go(s, hash, { reload: true });
  if (hash === '#/prep') await s.page.waitForSelector('.prep-wrap');
  if (act) await act(s);
  await settle(s.page);
  const loc = s.page.locator(sel).first();
  if (!(await loc.count())) { console.log('missing', label, sel); await s.context.close(); continue; }
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  if (!act) await parkMouse(s);
  const spec = await loc.evaluate((el, d) => {
    const t = d ? el.querySelector(d) || el : el, c = getComputedStyle(t);
    return `${c.fontFamily.split(',')[0].replace(/["']/g, '')} · ${c.fontSize}/${c.lineHeight} · wt ${c.fontWeight} · ls ${c.letterSpacing}${c.textTransform === 'uppercase' ? ' · CAPS' : ''}`;
  }, describe || null);
  const b = await loc.boundingBox();
  const pad = 8, clip = { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: Math.min(b.width + pad * 2, 680), height: b.height + pad * 2 };
  cells.push({ label, spec, buf: await s.page.screenshot({ clip }) });
  await s.context.close();
}

// Contact sheet — two columns, native pixel size (no upscaling) so the hierarchy reads as shipped.
const COLW = 700, PAD = 12, HEAD = 44;
const placed = []; const colY = [HEAD, HEAD];
for (const c of cells) {
  const m = await sharp(c.buf).metadata();
  const col = colY[0] <= colY[1] ? 0 : 1, x = PAD + col * (COLW + PAD), y = colY[col];
  placed.push({ ...c, x, y, w: m.width, h: m.height });
  colY[col] = y + 40 + m.height + PAD;
}
const H = Math.max(...colY) + PAD, W = PAD + 2 * (COLW + PAD);
const comps = [{ input: text(W, HEAD, 'Typography contact sheet — live elements at 1440×900, shipped pixel size (current stylesheet)', 16), left: 8, top: 6 }];
for (const p of placed) {
  comps.push({ input: text(COLW, 20, p.label, 13, '#e6b34a'), left: p.x, top: p.y });
  comps.push({ input: text(COLW, 20, p.spec, 11, '#9d927a'), left: p.x, top: p.y + 16 });
  comps.push({ input: p.buf, left: p.x, top: p.y + 40 });
}
await sharp({ create: { width: W, height: H, channels: 4, background: '#0b0908' } }).composite(comps).png().toFile(path.join(OUT, 'contact-sheet__typography-roles__1440x900.png'));
console.log('contact sheet', W, 'x', H, cells.length, 'cells');

// Before/after sheet — crops written by stage4-typography.mjs, 3× nearest-neighbour so 1px differences are visible.
const { pairs } = JSON.parse(fs.readFileSync(path.join(OUT, 'measurements.json'), 'utf8'));
const NAMES = {
  'journey-1440x900__.jr-blight': 'Journey blight badge — tracking .05em → --tracking-badge (.06em)',
  'catalog-420-filter__.filter-count': 'Filter count badge — 10px → --fs-micro (11px)',
  'detail-harsh-desert__.modal .feature-head:has(.feature-type)': 'Feature type badge — unchanged value (.06em → --tracking-badge)',
  'detail-harsh-desert__.modal .feature-prompt': 'Feature prompt — raw 14px → --fs-card-copy (no visual change)',
  'detail-adversary__.modal .adversary-range-badge': 'Range / damage badge — unchanged value (.06em → --tracking-badge)',
  'dice-pop__.dice-result-pop': 'Dice result pop — notation 10px → --fs-micro (11px)',
};
const rows = [];
for (const p of pairs) {
  const sc = 3;
  const load = async f => { const m = await sharp(f).metadata(); return { buf: await sharp(f).resize(Math.min(m.width * sc, 560), null, { kernel: 'nearest', fit: 'inside' }).png().toBuffer() }; };
  const b = await load(path.join(OUT, 'crops', p.f + '__before.png')), a = await load(path.join(OUT, 'crops', p.f + '__after.png'));
  const mb = await sharp(b.buf).metadata(), ma = await sharp(a.buf).metadata();
  rows.push({ label: NAMES[`${p.st}__${p.sel}`] || p.f, b: b.buf, a: a.buf, h: Math.max(mb.height, ma.height) });
}
const W2 = 1180; let y = 40; const comps2 = [{ input: text(W2, 36, 'Typography before / after — only elements whose typography changed (3× zoom; left BEFORE, right AFTER)', 15), left: 8, top: 4 }];
for (const r of rows) {
  comps2.push({ input: text(W2, 22, r.label, 13, '#e6b34a'), left: 8, top: y });
  comps2.push({ input: r.b, left: 8, top: y + 26 }, { input: r.a, left: 600, top: y + 26 });
  y += 26 + r.h + 18;
}
await sharp({ create: { width: W2, height: y + 6, channels: 4, background: '#0b0908' } }).composite(comps2).png().toFile(path.join(OUT, 'before-after__typography-changes.png'));
console.log('before/after sheet', rows.length, 'rows');
await browser.close(); server.close();
