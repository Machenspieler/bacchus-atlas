#!/usr/bin/env node
// Stage 4 task 01 — Prep column allocation. Measures the three Prep columns and
// captures the identical populated Prep state at 1366/1440/1920 (+1280/1200 measure only).
//   node scripts/design-audit/stage4-prep-layout.mjs --label=before|after [--out=<dir>]
import fs from 'node:fs';
import path from 'node:path';
import { startServer, ROOT } from './lib.mjs';
import { Recorder, launch, openSession, go, settle, full, crop } from './harness.mjs';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const label = arg('label') || 'after';
const OUT = path.resolve(ROOT, arg('out') || 'docs/design-audit/stage-4/task-01-prep-1366');
fs.mkdirSync(OUT, { recursive: true });

const rec = new Recorder(OUT);
const { server, url } = await startServer();
const browser = await launch();
const results = {};
const SHOTS = [[1366, 768], [1440, 900], [1920, 1080]];
const MEASURE_ONLY = [[1200, 800], [1280, 720], [1280, 800], [1600, 900]];

for (const [width, height] of [...SHOTS, ...MEASURE_ONLY]) {
  const vp = { width, height };
  const s = await openSession(browser, url, vp, 'full', rec);
  const { page } = s;
  await go(s, '#/prep', { reload: true });
  await page.waitForSelector('.prep-wrap');
  await settle(page, { long: true });
  results[`${width}x${height}`] = await page.evaluate(() => {
    const box = sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: +r.x.toFixed(1), w: +r.width.toFixed(1) }; };
    const cs = sel => getComputedStyle(document.querySelector(sel));
    const lines = sel => [...document.querySelectorAll(sel)].filter(e => e.getBoundingClientRect().width > 0).map(e => {
      const c = getComputedStyle(e), lh = parseFloat(c.lineHeight) || parseFloat(c.fontSize) * 1.3;
      return { t: e.textContent.trim().slice(0, 24), lines: Math.round(e.getBoundingClientRect().height / lh), clipped: e.scrollWidth > e.clientWidth + 1 };
    });
    const overflowing = [...document.querySelectorAll('.prep-env-toolbar, .prep-adv-toolbar, .item-toolbar, .prep-central-head')].map(e => ({ c: e.className, over: e.scrollWidth > e.clientWidth + 1, h: Math.round(e.getBoundingClientRect().height) }));
    return {
      shellPadL: cs('.shell').paddingLeft, shell: box('.shell'), wrap: box('.prep-wrap'), main: box('.prep-main'),
      gap: cs('.prep-main').columnGap, cols: cs('.prep-main').gridTemplateColumns,
      left: box('.prep-col-env'), center: box('.prep-central'), right: box('.prep-col-adv'),
      docScrollW: document.documentElement.scrollWidth, innerW: innerWidth,
      centralTitles: lines('.prep-central-title'), rowNames: lines('.prep-sel-name'), toolbars: overflowing,
    };
  });
  if (SHOTS.some(([w]) => w === width)) {
    const L = n => page.locator(n);
    await full(s, { page: 'prep', state: `all-sections-populated__${label}`, components: ['whole Prep'], purpose: `Stage 4 task 01 ${label}` });
    if (width === 1366) {
      await crop(s, { page: 'prep', state: `central-panel__${label}`, locators: [L('.prep-central')], pad: 6, zoom: 2 });
      await crop(s, { page: 'prep', state: `toolbars__${label}`, box: await (async () => { const a = await L('.prep-env-toolbar').boundingBox(), b = await L('.prep-adv-toolbar').boundingBox(), c = await L('.item-toolbar').boundingBox(); const x = Math.min(a.x, b.x, c.x), y = Math.min(a.y, b.y, c.y), r = Math.max(a.x + a.width, b.x + b.width, c.x + c.width), bt = Math.max(a.y + a.height, b.y + b.height, c.y + c.height); return { x, y, width: r - x, height: bt - y }; })(), pad: 6, zoom: 1 }).catch(e => console.log('toolbar crop skipped', e.message));
    }
  }
  await s.context.close();
}
fs.writeFileSync(path.join(OUT, `measurements__${label}.json`), JSON.stringify(results, null, 2));
await browser.close(); server.close();
for (const [k, v] of Object.entries(results)) console.log(k, 'L', v.left.w, 'C', v.center.w, 'R', v.right.w, 'gap', v.gap, 'main', v.main.w, 'shell', v.shell.w, 'scrollW', v.docScrollW, '/', v.innerW);
