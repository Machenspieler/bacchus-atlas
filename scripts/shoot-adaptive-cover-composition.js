#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — shoot-adaptive-cover-composition.js
   DEV-ONLY visual QA for Adaptive 3-or-2 (PD-092). Serves the repo root, drives the REAL app in a fresh browser
   profile (fixture lists seeded into throw-away localStorage — never a real user's), and renders My Lists twice
   with identical lists, viewport and DPR: "before" (ART_RUNTIME.PANEL_REVIEWS emptied, so the unreviewed fallback
   keeps production's former three-panel arrangement) and "after" (the shipped registry). Writes screenshots and
   metrics.json (image requests, bytes, CLS, geometry, broken images, overflow) to
   docs/research/my-lists-adaptive-cover-composition-v2-integration/. Needs `playwright` and Chrome.
   Run: node scripts/shoot-adaptive-cover-composition.js [outDir]
   ============================================================ */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/research/my-lists-adaptive-cover-composition-v2-integration'));
const SCREENS = path.join(OUT, 'screens');
const Fx = require('../lab/cover-composition/fixtures.js');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'content-length': fs.statSync(file).size, 'cache-control': 'max-age=3600' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}

const LISTS = Fx.ALL.map(c => ({ id: c.id, name: c.name }));
const ENV_LISTS = {};
Fx.ALL.forEach(c => c.envIds.forEach(id => { (ENV_LISTS[id] = ENV_LISTS[id] || []).push(c.id); }));
const seed = lang => ({ dhcodex_lang: JSON.stringify(lang), dhcodex_lists: JSON.stringify(LISTS), dhcodex_env_lists: JSON.stringify(ENV_LISTS), dhcodex_storage_notice_dismissed: '1' });

async function ready(page) {
  await page.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach(i => { i.loading = 'eager'; }));
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForFunction(() => [...document.images].every(i => i.complete), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
}

async function listsPage(browser, port, mode, vw, vh, dpr, lang) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
  await ctx.addInitScript(s => { Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)); }, seed(lang));
  const page = await ctx.newPage();
  const requests = [], problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('response', r => { if (/\/img\/(list-covers|env\/thumb)\//.test(r.url())) requests.push({ url: r.url().split('/img/')[1], bytes: Number(r.headers()['content-length'] || 0), status: r.status() }); });
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver(l => { l.getEntries().forEach(e => { if (!e.hadRecentInput) window.__cls += e.value; }); }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(`http://127.0.0.1:${port}/index.html#/`);
  await page.waitForSelector('.card');
  await page.waitForTimeout(600);
  requests.length = 0;
  await page.evaluate(m => { window.__cls = 0; if (m === 'before') ART_RUNTIME.PANEL_REVIEWS = {}; location.hash = '#/lists'; }, mode);
  await page.waitForSelector('.list-card');
  await ready(page);
  return { ctx, page, requests, problems };
}

async function measure(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('.list-card')];
    const geo = {};
    cards.forEach(c => {
      const cv = c.querySelector('.list-card-cover'), r = c.getBoundingClientRect(), v = cv.getBoundingClientRect();
      geo[c.dataset.list] = { card: [Math.round(r.width), Math.round(r.height)], cover: [Math.round(v.width), Math.round(v.height)], tiles: cv.querySelectorAll('picture').length,
        broken: [...cv.querySelectorAll('img')].filter(i => !i.naturalWidth).length, srcs: [...cv.querySelectorAll('img')].map(i => i.currentSrc.split('/img/')[1]) };
    });
    return { geo, cls: window.__cls, overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
}

async function main() {
  fs.mkdirSync(SCREENS, { recursive: true });
  const { server, port } = await serve();
  const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
  const metrics = { generated: new Date().toISOString().slice(0, 10), problems: [], runs: {} };
  const shotPage = (page, name) => page.screenshot({ path: path.join(SCREENS, name + '.png'), fullPage: true }).then(() => console.log('wrote', name));
  try {
    const runs = [['1280', 1280, 800, 1, 'en'], ['1440', 1440, 900, 1, 'en'], ['1920', 1920, 1080, 1, 'en'], ['1440-dpr2', 1440, 900, 2, 'en'], ['1440-ru', 1440, 900, 1, 'ru']];
    for (const [key, vw, vh, dpr, lang] of runs) {
      for (const mode of ['before', 'after']) {
        const { ctx, page, requests, problems } = await listsPage(browser, port, mode, vw, vh, dpr, lang);
        const m = await measure(page);
        const urls = requests.map(r => r.url);
        metrics.runs[`${key}-${mode}`] = {
          imageRequests: requests.length, bytes: requests.reduce((s, r) => s + r.bytes, 0), duplicates: urls.length - new Set(urls).size,
          failed: requests.filter(r => r.status >= 400).length, cls: Number(m.cls.toFixed(4)), overflowX: m.overflowX,
          broken: Object.values(m.geo).reduce((s, g) => s + g.broken, 0), geometry: m.geo,
        };
        metrics.problems.push(...problems.map(p => `${key}-${mode} ${p}`));
        await shotPage(page, `lists-${key}-${mode}`);
        if (key === '1440') {
          for (const c of Fx.ALL) {
            const el = page.locator(`.list-card[data-list="${c.id}"]`).first();
            await el.scrollIntoViewIfNeeded();
            await el.screenshot({ path: path.join(SCREENS, `card-${c.id}-${mode}.png`) });
          }
        }
        await ctx.close();
      }
    }
  } finally { await browser.close(); server.close(); }
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
  console.log('problems:', metrics.problems.length);
}
main().catch(e => { console.error(e); process.exit(1); });
