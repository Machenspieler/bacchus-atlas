#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — shoot-artwork-lab-v3.js
   DEV-ONLY visual QA for lab/artwork-v3/. Serves the repo root, drives the lab in a fresh browser
   profile (never a real user's localStorage), writes screenshots and the browser-measured image
   audit to docs/research/artwork-lab-v3/. Needs `playwright` (devDependency) and Google Chrome.
   Run: node scripts/shoot-artwork-lab-v3.js [outDir]
   ============================================================ */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/research/artwork-lab-v3'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'content-length': fs.statSync(file).size });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}

async function open(browser, port, hash, vw, vh, dpr) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) problems.push('console: ' + m.text()); });
  page.on('requestfailed', r => problems.push('requestfailed: ' + r.url()));
  await page.goto(`http://127.0.0.1:${port}/lab/artwork-v3/#${hash}`);
  await page.waitForSelector('.lab-body > *');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
  return { ctx, page, problems };
}
/* Lazy images below the fold only load once scrolled to, exactly as in production: walk the page first. */
async function lazyLoad(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(500);
}
async function shot(page, name, selector) {
  const file = path.join(OUT, name + '.png');
  if (selector) {
    await lazyLoad(page);
    const el = page.locator(selector).first();
    await el.scrollIntoViewIfNeeded();
    await page.evaluate(() => { const t = document.querySelector('.lab-top'); if (t) t.style.position = 'static'; });
    await el.screenshot({ path: file });
  } else await page.screenshot({ path: file, fullPage: false });
  console.log('wrote', path.relative(ROOT, file));
}
async function settle(page) { await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(700); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { server, port } = await serve();
  const browser = await chromium.launch({ channel: process.env.J2_BROWSER_CHANNEL || 'chrome' });
  const report = { audits: {}, problems: [], layout: {} };
  try {
    /* 1. The three-strategy comparisons at the three desktop sizes, DPR 1 and 2. */
    for (const [vw, vh, dpr] of [[1280, 800, 1], [1440, 900, 1], [1440, 900, 2], [1920, 1080, 1]]) {
      const tag = `${vw}x${vh}${dpr === 2 ? '-dpr2' : ''}`;
      let s = await open(browser, port, 'tab=catalog&env=floating-mountains&lang=en', vw, vh, dpr);
      await shot(s.page, `catalog-compare-${tag}`, '[data-triple]');
      await shot(s.page, `catalog-compare-page-${tag}`);
      report.problems.push(...s.problems.map(p => `${tag} catalog: ${p}`));
      await s.ctx.close();
      s = await open(browser, port, 'tab=prep&env=sunken-citadel&lang=en', vw, vh, dpr);
      await shot(s.page, `prep-compare-${tag}`, '[data-triple]');
      report.problems.push(...s.problems.map(p => `${tag} prep: ${p}`));
      await s.ctx.close();
      /* browser-measured delivery and sharpness at this size */
      s = await open(browser, port, 'tab=summary', vw, vh, dpr);
      report.audits[tag] = await s.page.evaluate(() => window.__labAuditAll());
      await s.ctx.close();
    }

    /* 2. Grids, lists, stress, library, crop experiments at 1440x900 DPR 2 (DPR 1 for page-size shots). */
    let s = await open(browser, port, 'tab=catalog&env=floating-mountains&lang=en', 1440, 900, 1);
    for (const m of ['A', 'B', 'C']) {
      await s.page.click(`[data-gm="${m}"]`); await settle(s.page);
      await shot(s.page, `catalog-grid-mixed-${m}`, '[data-grid]');
    }
    await s.page.click('[data-gm="tri"]'); await settle(s.page);
    await shot(s.page, 'catalog-grid-triptych-strips', '[data-grid]');
    await s.page.selectOption('[data-group]', 'c-downgraded'); await settle(s.page);
    await shot(s.page, 'catalog-triptych-c-keeps-biome', '[data-grid]');
    /* layout stability of the grid per strategy */
    for (const m of ['A', 'B', 'C']) {
      report.layout[m] = await s.page.evaluate(async mode => {
        let cls = 0; const po = new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) cls += e.value; });
        po.observe({ type: 'layout-shift', buffered: false });
        document.querySelector(`[data-gm="${mode}"]`).click();
        await new Promise(r => setTimeout(r, 2500)); po.disconnect(); return Math.round(cls * 1000) / 1000;
      }, m);
    }
    report.problems.push(...s.problems.map(p => 'catalog grid: ' + p));
    await s.ctx.close();

    s = await open(browser, port, 'tab=prep&env=sunken-citadel&lang=en', 1440, 900, 2);
    await shot(s.page, 'prep-list-mixed', '[data-lists]');
    await s.page.selectOption('[data-plist]', 'window'); await settle(s.page);
    await shot(s.page, 'prep-list-real-order', '[data-lists]');
    await s.page.selectOption('[data-plist]', 'archetype'); await settle(s.page);
    await shot(s.page, 'prep-list-repetition-archetype', '[data-lists]');
    report.problems.push(...s.problems.map(p => 'prep lists: ' + p));
    await s.ctx.close();

    s = await open(browser, port, 'tab=stress', 1440, 900, 1);
    await shot(s.page, 'stress-narrow-strips', '.lab-stress');
    await s.ctx.close();
    s = await open(browser, port, 'tab=stress', 1440, 900, 2);
    await shot(s.page, 'stress-square-thumbs', '.lab-stress.sq');
    await s.ctx.close();

    s = await open(browser, port, 'tab=library', 1440, 900, 1);
    await shot(s.page, 'library-28-matrix', '.lab-lib');
    report.problems.push(...s.problems.map(p => 'library: ' + p));
    await s.ctx.close();

    /* crop experiment: Catalog and Prep move independently */
    s = await open(browser, port, 'tab=catalog&env=floating-mountains&lang=en', 1440, 900, 2);
    await s.page.evaluate(() => { const r = document.querySelector('[data-editor="catalog"] [data-k="x"]'); r.value = 15; r.dispatchEvent(new Event('input', { bubbles: true })); });
    await settle(s.page);
    await shot(s.page, 'crop-catalog-x15-experiment', '[data-cands]');
    await shot(s.page, 'crop-catalog-editor', '[data-editor="catalog"]');
    const saved = await s.page.evaluate(() => JSON.parse(localStorage.getItem('labv3:crops')));
    report.layout.cropIndependence = { catalog: saved.catalog, prep: saved.prep };
    await s.ctx.close();

    /* ambiguous / biome-wins / archetype-wins examples */
    for (const [name, env, tab] of [['wins-archetype-sunken-citadel', 'sunken-citadel', 'catalog'], ['wins-biome-time-loop', 'time-loop', 'catalog'], ['ambiguous-dragons-lair', 'dragons-lair', 'prep'], ['wins-biome-haunted-city-prep', 'haunted-city', 'prep']]) {
      s = await open(browser, port, `tab=${tab}&env=${env}&lang=en`, 1440, 900, 2);
      await shot(s.page, name, '[data-triple]');
      await s.ctx.close();
    }
    fs.writeFileSync(path.join(OUT, 'browser-audit.json'), JSON.stringify(report, null, 1) + '\n');
    console.log('problems:', report.problems.length ? report.problems : 'none');
  } finally { await browser.close(); server.close(); }
})();
