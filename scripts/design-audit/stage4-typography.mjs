#!/usr/bin/env node
// Stage 4 task 07 — typography micro-consistency. Renders identical states with the pre-change
// stylesheet and the current one, diffs every visible element's box + computed type, and writes
// full-context frames plus before/after crops of the elements whose typography actually changed.
//   node scripts/design-audit/stage4-typography.mjs --before-css=<old styles.css>
import fs from 'node:fs';
import path from 'node:path';
import { startServer, ROOT } from './lib.mjs';
import { Recorder, launch, openSession, go, settle, parkMouse } from './harness.mjs';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
const OUT = path.resolve(ROOT, 'docs/design-audit/stage-4/task-07-typography');
const FR = path.join(OUT, 'frames'), CR = path.join(OUT, 'crops');
fs.mkdirSync(FR, { recursive: true }); fs.mkdirSync(CR, { recursive: true });
const beforeCss = fs.readFileSync(arg('before-css'), 'utf8');
const rec = new Recorder(OUT);
const { server, url } = await startServer();
const browser = await launch();

const journeyAct = async ({ page }) => {
  const rp = page.locator('.journey-panel[data-kind="region"]'), sp = page.locator('.journey-panel[data-kind="sanctuary"]');
  let kept = 0, blight = false;
  for (let i = 0; i < 60 && !(kept >= 2 && blight); i++) {
    await rp.locator('[data-roll-new]').click();
    const b = (await rp.locator('.journey-draft .jr-blight').count()) > 0;
    if (kept < 2 || (b && !blight)) { await rp.locator('.journey-draft [data-save]').click(); kept++; blight = blight || b; }
    else await rp.locator('.journey-draft [data-discard]').click();
  }
  for (let i = 0; i < 2; i++) { await sp.locator('[data-roll-new]').click(); await sp.locator('.journey-draft [data-save]').click(); }
  await page.evaluate(() => window.scrollTo(0, 0));
};
const STATES = [
  { id: 'catalog-1440x900', vp: [1440, 900], hash: '#/', shot: true },
  { id: 'catalog-ru-1440x900', vp: [1440, 900], profile: 'ru', hash: '#/', crops: ['.badge.pending'] },
  { id: 'lists-1440x900', vp: [1440, 900], hash: '#/lists', shot: true },
  { id: 'journey-1440x900', vp: [1440, 900], hash: '#/journey', act: journeyAct, shot: true, crops: ['.jr-blight'] },
  { id: 'prep-1366x768', vp: [1366, 768], hash: '#/prep', shot: true },
  { id: 'prep-1440x900', vp: [1440, 900], hash: '#/prep', shot: true },
  { id: 'prep-1920x1080', vp: [1920, 1080], hash: '#/prep', shot: true },
  { id: 'detail-harsh-desert', vp: [1440, 900], hash: '#/env/harsh-desert', crops: ['.modal .feature-head:has(.feature-type)', '.modal .feature-prompt'] },
  { id: 'detail-adversary', vp: [1440, 900], hash: '#/env/progenitor-minds-lair', act: async ({ page }) => { await page.waitForSelector('.modal details.adversary-block'); await page.locator('.modal details.adversary-block').first().evaluate(e => { e.open = true; }); }, crops: ['.modal .adversary-range-badge'] },
  { id: 'catalog-420-filter', vp: [420, 900], hash: '#/', act: async ({ page }) => { await page.locator('.filter-toggle').click().catch(() => {}); await page.locator('.rank-pills .rank-icon').nth(1).click(); await page.waitForTimeout(200); }, crops: ['.filter-count'] },
  { id: 'dice-pop', vp: [1440, 900], hash: '#/env/harsh-desert', act: async ({ page }) => { await page.waitForSelector('.modal .dice-btn'); await page.locator('.modal .dice-btn').first().click(); await page.waitForSelector('.dice-result-pop .notation'); }, crops: ['.dice-result-pop'] },
];

const snapshot = page => page.evaluate(() => [...document.body.querySelectorAll('*')].filter(e => {
  const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && !/^(SCRIPT|STYLE)$/i.test(e.tagName) && !e.closest('svg');
}).map((e, i) => {
  const r = e.getBoundingClientRect(), c = getComputedStyle(e), lh = parseFloat(c.lineHeight) || parseFloat(c.fontSize) * 1.3;
  return {
    i, k: e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''),
    w: +r.width.toFixed(2), h: +r.height.toFixed(2), x: +r.x.toFixed(1), y: +r.y.toFixed(1), lines: Math.round(r.height / lh), over: e.scrollWidth > e.clientWidth + 1,
    fs: c.fontSize, lh: c.lineHeight, ls: c.letterSpacing, fw: c.fontWeight, ff: c.fontFamily.split(',')[0],
  };
}));

async function once(st, before) {
  const s = await openSession(browser, url, { width: st.vp[0], height: st.vp[1] }, st.profile || 'full', rec);
  if (before) await s.context.route('**/css/styles.css*', r => r.fulfill({ status: 200, contentType: 'text/css', body: beforeCss }));
  await go(s, st.hash, { reload: true });
  if (st.hash === '#/prep') await s.page.waitForSelector('.prep-wrap');
  if (st.act) await st.act(s);
  await parkMouse(s); await settle(s.page);
  const out = { snap: await snapshot(s.page), crops: {} };
  if (st.shot && !before) await s.page.screenshot({ path: path.join(FR, st.id + '.png') });
  for (const sel of st.crops || []) {
    const loc = s.page.locator(sel).first();
    if (!(await loc.count())) { out.crops[sel] = null; continue; }
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const b = await loc.boundingBox(); if (!b) { out.crops[sel] = null; continue; }
    const pad = 8, clip = { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + pad * 2, height: b.height + pad * 2 };
    out.crops[sel] = await s.page.screenshot({ clip });
  }
  await s.context.close();
  return out;
}

const report = {}; const pairs = [];
for (const st of STATES) {
  const b = await once(st, true), a = await once(st, false);
  const rep = { elements: a.snap.length, sameCount: a.snap.length === b.snap.length, layoutDiffs: [], typeDiffs: [] };
  if (rep.sameCount) a.snap.forEach((e, i) => {
    const o = b.snap[i];
    if (Math.abs(e.w - o.w) > 0.01 || Math.abs(e.h - o.h) > 0.01 || e.lines !== o.lines || e.over !== o.over || Math.abs(e.x - o.x) > 0.01 || Math.abs(e.y - o.y) > 0.01) {
      rep.layoutDiffs.push({ k: e.k, before: { w: o.w, h: o.h, x: o.x, y: o.y, lines: o.lines, over: o.over }, after: { w: e.w, h: e.h, x: e.x, y: e.y, lines: e.lines, over: e.over } });
    }
    if (['fs', 'lh', 'ls', 'fw', 'ff'].some(p => e[p] !== o[p])) {
      rep.typeDiffs.push({ k: e.k, before: { fs: o.fs, lh: o.lh, ls: o.ls, fw: o.fw }, after: { fs: e.fs, lh: e.lh, ls: e.ls, fw: e.fw } });
    }
  });
  for (const sel of st.crops || []) {
    if (a.crops[sel] && b.crops[sel]) {
      const f = st.id + '__' + sel.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '');
      fs.writeFileSync(path.join(CR, f + '__before.png'), b.crops[sel]);
      fs.writeFileSync(path.join(CR, f + '__after.png'), a.crops[sel]);
      pairs.push({ st: st.id, sel, f });
    } else console.log('  (no element for', st.id, sel + ')');
  }
  report[st.id] = rep;
  console.log(st.id.padEnd(24), 'els', rep.elements, 'sameCount', rep.sameCount, 'layoutDiffs', rep.layoutDiffs.length, 'typeDiffs', rep.typeDiffs.length);
}
fs.writeFileSync(path.join(OUT, 'measurements.json'), JSON.stringify({ report, pairs, consoleIssues: rec.consoleIssues }, null, 2));
await browser.close(); server.close();
