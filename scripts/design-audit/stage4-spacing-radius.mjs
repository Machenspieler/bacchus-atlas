#!/usr/bin/env node
// Stage 4 task 09 — spacing / radius micro-drift. Measures changed components before vs after, and
// captures regression frames + the two contact sheets. "Before" is the same page rendered with the
// pre-change stylesheet (--before-css=<file>, served in place of css/styles.css).
//   node scripts/design-audit/stage4-spacing-radius.mjs --before-css=<path>
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { startServer, ROOT } from './lib.mjs';
import { Recorder, launch, openSession, go, settle, parkMouse } from './harness.mjs';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
const OUT = path.resolve(ROOT, 'docs/design-audit/stage-4/task-09-spacing-radius');
for (const d of ['regression', 'crops', 'before', 'after']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
const beforeCss = fs.readFileSync(arg('before-css'), 'utf8');
const rec = new Recorder(OUT);
const { server, url } = await startServer();
const browser = await launch();

async function open(vp, before, hash, wait) {
  const s = await openSession(browser, url, vp, 'full', rec);
  if (before) await s.context.route('**/css/styles.css*', r => r.fulfill({ status: 200, contentType: 'text/css', body: beforeCss }));
  await go(s, hash, { reload: true });
  if (wait) await s.page.waitForSelector(wait);
  await s.page.waitForTimeout(350);
  return s;
}

// ---- measurement ------------------------------------------------------------------------------
const MEASURE = sels => sels.map(q => {
  const els = [...document.querySelectorAll(q)].slice(0, 3);
  return [q, els.length ? els.map(el => {
    const c = getComputedStyle(el), r = el.getBoundingClientRect();
    return { w: +r.width.toFixed(2), h: +r.height.toFixed(2), pad: c.padding, gap: c.gap, radius: c.borderTopLeftRadius, mr: c.marginRight, ml: c.marginLeft };
  }) : null];
});
const PREP = ['.prep-central-title', '.prep-central-lead', '.prep-central-count', '.prep-central-head', '.prep-central-actions', '.bp-summary', '.prep-recommend-btn', '.prep-freshcutgrass-link',
  '.prep-adv-thumb', '.prep-adv-thumb img', '.prep-adv-thumb-btn', '.prep-item-name-overlay', '.prep-item-card .prep-checkbox-hit', '.prep-item-icon-btn .prep-item-thumb',
  '.sp-session-control', '.prep-sel', '.prep-sel--card', '.prep-env-row', '.prep-adv-row', '.prep-item-card', '.prep-central', '.prep-env-toolbar', '.prep-adv-toolbar'];
const DETAIL = [['harsh-desert', ['.modal .dice-btn', '.modal .countdown-btn', '.modal .feature-bullets', '.modal .feature-bullets li', '.modal .feature-type']],
  ['civic-library', ['.modal .item-btn']], ['court-of-cats', ['.modal .feature-bullets li.has-item']]];
const measured = { before: {}, after: {} };
for (const before of [true, false]) {
  const ph = before ? 'before' : 'after';
  for (const vp of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    const s = await open(vp, before, '#/prep', '.prep-wrap');
    measured[ph][`prep@${vp.width}`] = Object.fromEntries(await s.page.evaluate(MEASURE, PREP));
    await s.context.close();
  }
  const s = await open({ width: 1440, height: 900 }, before, '#/', '.card');
  measured[ph]['catalog@1440'] = Object.fromEntries(await s.page.evaluate(MEASURE, ['.card', '.toolbar', '.header-actions', '.site-header']));
  for (const [id, sels] of DETAIL) {
    await go(s, '#/env/' + id, { reload: true }); await s.page.waitForSelector('.modal'); await s.page.waitForTimeout(250);
    Object.assign(measured[ph], Object.fromEntries((await s.page.evaluate(MEASURE, sels)).map(([k, v]) => [`detail:${id}:${k}`, v])));
  }
  await s.context.close();
}
const diffs = [];
for (const k of Object.keys(measured.after)) {
  const b = measured.before[k], a = measured.after[k];
  for (const sel of Object.keys(a)) if (JSON.stringify(a[sel]) !== JSON.stringify(b[sel])) diffs.push({ key: `${k} ${sel}`, before: b[sel], after: a[sel] });
}
for (const k of Object.keys(measured.after)) if (!k.includes('@')) { // detail keys are flat selector->list
  if (JSON.stringify(measured.after[k]) !== JSON.stringify(measured.before[k])) diffs.push({ key: k, before: measured.before[k], after: measured.after[k] });
}
fs.writeFileSync(path.join(OUT, 'measurements.json'), JSON.stringify({ measured, changed: diffs.map(d => d.key) }, null, 1));
console.log('changed measurements:', diffs.length);
for (const d of diffs) {
  if (!d.before || !d.after) { console.log(' *', d.key, 'presence differs'); continue; }
  const fields = new Set();
  d.before.forEach((x, i) => Object.keys(x).forEach(f => { if (x[f] !== d.after[i]?.[f]) fields.add(`${f}: ${x[f]} -> ${d.after[i]?.[f]}`); }));
  console.log(' *', d.key, '|', [...fields].slice(0, 4).join(' ; '));
}

// ---- regression frames --------------------------------------------------------------------------
async function frame(name, vp, hash, wait) {
  const s = await open(vp, false, hash, wait);
  await parkMouse(s); await settle(s.page);
  await s.page.screenshot({ path: path.join(OUT, 'regression', name + '.png') });
  await s.context.close();
}
for (const [w, h] of [[1366, 768], [1440, 900], [1920, 1080]]) {
  await frame(`${w}x${h}__prep`, { width: w, height: h }, '#/prep', '.prep-wrap');
  await frame(`${w}x${h}__catalog`, { width: w, height: h }, '#/', '.card');
}
await frame('1440x900__lists', { width: 1440, height: 900 }, '#/lists', null);
await frame('1440x900__journey', { width: 1440, height: 900 }, '#/journey', null);

// ---- crops -------------------------------------------------------------------------------------
const VP = { width: 1440, height: 900 };
async function crop(name, hash, wait, locFn, { zoom = 2, pad = 10, act, before = false, dir = 'crops' } = {}) {
  const s = await open(VP, before, hash, wait);
  if (act) await act(s);
  const loc = locFn(s.page);
  await loc.first().scrollIntoViewIfNeeded().catch(() => {});
  await settle(s.page);
  const b = await loc.first().boundingBox();
  const x = Math.max(0, Math.floor(b.x - pad)), y = Math.max(0, Math.floor(b.y - pad));
  const w = Math.min(VP.width - x, Math.ceil(b.width + pad * 2)), h = Math.min(VP.height - y, Math.ceil(b.height + pad * 2));
  const raw = await s.page.screenshot({ clip: { x, y, width: w, height: h } });
  const f = path.join(OUT, dir, name + '.png');
  await sharp(raw).resize(w * zoom, h * zoom, { kernel: 'nearest' }).png().toFile(f);
  await s.context.close();
  return f;
}
const C = {};
const openTypes = async s => { await s.page.locator('#f-types-btn').click(); await s.page.waitForSelector('#f-types-panel', { state: 'visible' }); };
// spacing sheet
C.catalogToolbar = await crop('catalog-toolbar', '#/', '.card', p => p.locator('.toolbar'));
C.prepEnvToolbar = await crop('prep-env-toolbar', '#/prep', '.prep-wrap', p => p.locator('.prep-env-toolbar'));
C.prepAdvToolbar = await crop('prep-adv-toolbar', '#/prep', '.prep-wrap', p => p.locator('.prep-adv-toolbar'));
C.header = await crop('header-actions', '#/', '.card', p => p.locator('.site-header'), { zoom: 1 });
C.card = await crop('card-padding', '#/', '.card', p => p.locator('.card').first(), { zoom: 1 });
C.modal = await crop('modal-padding', '#/env/harsh-desert', '.modal', p => p.locator('.modal'), { zoom: 1, pad: 6 });
C.menu = await crop('menu-rows', '#/', '.card', p => p.locator('#f-types-panel'), { zoom: 2, pad: 24, act: openTypes });
C.pills = await crop('inline-pills', '#/env/harsh-desert', '.modal', p => p.locator('.modal :is(p, li):has(.dice-btn)').first(), { zoom: 3 });
C.prepHead = await crop('prep-central-head', '#/prep', '.prep-wrap', p => p.locator('.prep-central-head').nth(1), { zoom: 2 });
C.prepRows = await crop('prep-central-rows', '#/prep', '.prep-wrap', p => p.locator('.prep-central'), { zoom: 1 });
// radius sheet
C.rxs = await crop('r-xs', '#/env/harsh-desert', '.modal', p => p.locator('.modal .feature-type').first(), { zoom: 5 });
C.rsm = await crop('r-sm', '#/', '.card', p => p.locator('.toolbar input').first(), { zoom: 4 });
C.rmd = await crop('r-md', '#/', '.card', p => p.locator('.card').first(), { zoom: 1 });
C.rlg = C.menu;
C.rpill = await crop('r-pill', '#/env/harsh-desert', '.modal', p => p.locator('.modal :is(p, li):has(.countdown-btn)').first(), { zoom: 3 });
C.circle = await crop('circle', '#/prep', '.prep-wrap', p => p.locator('.prep-item-nav-btn:visible').first(), { zoom: 6, pad: 14 });
C.session = await crop('session-control', '#/prep', '.prep-wrap', p => p.locator('.sp-session-control'), { zoom: 4 });
// before/after of the only visible geometry changes
C.thumbB = await crop('adv-thumb', '#/prep', '.prep-wrap', p => p.locator('.prep-adv-thumb').first(), { zoom: 6, before: true, dir: 'before' });
C.thumbA = await crop('adv-thumb', '#/prep', '.prep-wrap', p => p.locator('.prep-adv-thumb').first(), { zoom: 6, dir: 'after' });
const hoverCard = async s => { const c = s.page.locator('.prep-item-card').first(); await c.scrollIntoViewIfNeeded(); await c.hover(); await s.page.waitForTimeout(300); };
C.ovB = await crop('item-name-overlay', '#/prep', '.prep-wrap', p => p.locator('.prep-item-card').first(), { zoom: 4, before: true, act: hoverCard, dir: 'before' });
C.ovA = await crop('item-name-overlay', '#/prep', '.prep-wrap', p => p.locator('.prep-item-card').first(), { zoom: 4, act: hoverCard, dir: 'after' });

// ---- contact sheets ----------------------------------------------------------------------------
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const BG = '#0b0908';
async function grid(file, items, { cols = 2, cell = { w: 700, h: 200 }, title }) {
  const pad = 10, cap = 38, top = 34, rows = Math.ceil(items.length / cols);
  const W = cols * (cell.w + pad) + pad, H = top + rows * (cell.h + cap + pad) + pad;
  const comps = [{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${top}"><text x="${pad}" y="23" font-family="Arial" font-size="16" font-weight="bold" fill="#e9dfc7">${esc(title)}</text></svg>`), left: 0, top: 0 }];
  for (let i = 0; i < items.length; i++) {
    const it = items[i], cx = pad + (i % cols) * (cell.w + pad), cy = top + pad + Math.floor(i / cols) * (cell.h + cap + pad);
    const buf = await sharp(it.src).resize(cell.w, cell.h, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    const m = await sharp(buf).metadata();
    comps.push({ input: buf, left: cx, top: cy + cap + Math.floor((cell.h - m.height) / 2) });
    const [a, b = ''] = it.label.split('|');
    comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cell.w}" height="${cap}"><text x="2" y="15" font-family="Arial" font-size="13" font-weight="bold" fill="#e9dfc7">${esc(a)}</text><text x="2" y="31" font-family="Arial" font-size="11" fill="#9a8f7d">${esc(b)}</text></svg>`), left: cx, top: cy });
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: BG } }).composite(comps).png().toFile(path.join(OUT, file));
  console.log('+', file);
}
await grid('contact-sheet__spacing__1440x900.png', [
  { src: C.catalogToolbar, label: 'Standard toolbar|catalog .toolbar' },
  { src: C.prepEnvToolbar, label: 'Dense Prep toolbar (environments)|--s-2 gap, 35px min-height' },
  { src: C.prepAdvToolbar, label: 'Dense Prep toolbar (adversaries)|same density class' },
  { src: C.header, label: 'Header actions|compact, --s-3 gap' },
  { src: C.card, label: 'Card padding|--s-4' },
  { src: C.modal, label: 'Modal / panel padding|larger than card, intentional' },
  { src: C.menu, label: 'Menu rows|--menu-item-gap hairline between rows' },
  { src: C.pills, label: 'Inline pills|dice / item / countdown: --inline-control-gap + optical icon-side padding' },
  { src: C.prepHead, label: 'Prep central header|--pc-dense (6px) gaps' },
  { src: C.prepRows, label: 'Prep central rows|--pc-dense card/row rhythm' },
], { cols: 2, cell: { w: 700, h: 260 }, title: 'Spacing rhythm — 1440×900, real components (global 4px scale + documented local steps)' });
await grid('contact-sheet__radius__1440x900.png', [
  { src: C.rxs, label: '--r-xs 2px|chips / badges' },
  { src: C.rsm, label: '--r-sm 4px|inputs / buttons / thumbnails' },
  { src: C.rmd, label: '--r-md 6px|cards' },
  { src: C.rlg, label: '--r-lg 10px|floating panels (filter panel shown)' },
  { src: C.rpill, label: '--r-pill|dice / item / countdown capsules' },
  { src: C.circle, label: '50%|geometric circle' },
  { src: C.session, label: '12px session control|intentional status/selector capsule (--sp-session-radius)' },
], { cols: 2, cell: { w: 700, h: 260 }, title: 'Radius hierarchy — 1440×900, real components' });
await grid('before-after__visible-geometry.png', [
  { src: C.thumbB, label: 'BEFORE — .prep-adv-thumb padding 7.5px|artwork 45px' },
  { src: C.thumbA, label: 'AFTER — padding var(--s-2) = 8px|artwork 44px' },
  { src: C.ovB, label: 'BEFORE — item name overlay 5/7/4px|hover state' },
  { src: C.ovA, label: 'AFTER — 4/8px (var(--s-1) var(--s-2))|hover state' },
], { cols: 2, cell: { w: 700, h: 300 }, title: 'Only visible geometry changes in this task' });
server.close(); await browser.close(); process.exit(0);
