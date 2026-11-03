#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — shoot-cover-composition-lab.js
   DEV-ONLY visual QA and delivery measurement for lab/cover-composition/. Serves the repo root, drives the
   lab AND the real app (fresh browser profiles, never a real user's localStorage; fixture lists are seeded
   into the throw-away profile, lab/cover-composition/page-hook.js swaps only listCoverHtml), writes
   screenshots and metrics.json to docs/research/my-lists-cover-composition-lab-v2/. Needs `playwright` and Chrome.
   Run: node scripts/shoot-cover-composition-lab.js [outDir]
   ============================================================ */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/research/my-lists-cover-composition-lab-v2'));
const SCREENS = path.join(OUT, 'screens');
const Fx = require('../lab/cover-composition/fixtures.js');
const Core = require('../lab/cover-composition/lab-core.js');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };

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
const seed = { dhcodex_lang: JSON.stringify('en'), dhcodex_lists: JSON.stringify(LISTS), dhcodex_env_lists: JSON.stringify(ENV_LISTS), dhcodex_storage_notice_dismissed: '1' };

async function ready(page) {
  await page.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach(i => { i.loading = 'eager'; }));
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForFunction(() => [...document.images].every(i => i.complete), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
}
async function labPage(browser, port, hash, vw, vh, dpr) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) problems.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${port}/lab/cover-composition/#${hash}`);
  await page.waitForSelector('.lab-main');
  await ready(page);
  return { ctx, page, problems };
}
async function appPage(browser, port, strategy, vw, vh, dpr, ratio) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
  await ctx.addInitScript(s => { Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)); }, seed);
  const page = await ctx.newPage();
  const requests = [];
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('response', async r => { if (/\/img\/list-covers\//.test(r.url())) { const len = Number(r.headers()['content-length'] || 0); requests.push({ url: r.url().split('/img/')[1], bytes: len, status: r.status() }); } });
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver(l => { l.getEntries().forEach(e => { if (!e.hadRecentInput) window.__cls += e.value; }); }).observe({ type: 'layout-shift', buffered: true });
  });
  /* Start on the catalogue, which fetches no list-cover file, so the first list-cover requests are the strategy's own. */
  await page.goto(`http://127.0.0.1:${port}/index.html#/`);
  await page.waitForSelector('.card');
  await page.waitForTimeout(600);
  for (const f of ['lab-core.js', 'reviews.js', 'prod-bridge.js', 'page-hook.js']) await page.addScriptTag({ path: path.join(ROOT, 'lab/cover-composition', f) });
  await page.evaluate(([s, r]) => { window.__cls = 0; /* count only shifts caused by the lists page itself, not the catalogue it started from */ window.__labInstall(s, r); location.hash = '#/lists'; }, [strategy, ratio || '67:33']);
  await page.waitForSelector('.list-card');
  await ready(page);
  return { ctx, page, requests, problems };
}
async function shot(page, name, selector) {
  const file = path.join(SCREENS, name + '.png');
  if (selector) { const el = page.locator(selector).first(); await el.scrollIntoViewIfNeeded(); await page.evaluate(() => { const t = document.querySelector('.lab-top'); if (t) t.style.position = 'static'; }); await el.screenshot({ path: file }); }
  else await page.screenshot({ path: file, fullPage: true });
  console.log('wrote', path.relative(ROOT, file));
}

async function main() {
  fs.mkdirSync(SCREENS, { recursive: true });
  const { server, port } = await serve();
  const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
  const audit = { generated: new Date().toISOString().slice(0, 10), problems: [], metrics: {}, geometry: {} };
  try {
    /* 1 — lab views */
    const lab = async (hash, name, selector, vw, vh, dpr) => {
      const { ctx, page, problems } = await labPage(browser, port, hash, vw || 1920, vh || 1000, dpr || 1);
      await shot(page, name, selector); audit.problems.push(...problems.map(p => name + ' ' + p)); await ctx.close();
    };
    for (const id of ['baldur-test', 'darkheart', 'campaign-test', 'baldur-upper']) await lab(`tab=cases&cases=${id}`, 'case-' + id, `section[data-case="${id}"]`);
    await lab('tab=cases&cases=baldur-test', 'case-baldur-test-dpr2', 'section[data-case="baldur-test"]', 1920, 1000, 2);
    await lab('tab=cases&cases=s-busy3,s-calm3', 'collage-busy-vs-calm', '.lab-main');
    await lab('tab=cases&cases=s-two,s-ten-one,s-crop-family,s-paint-mix,s-empty', 'cases-synthetic', '.lab-main');
    await lab('tab=library', 'library-gallery', '.lab-lib', 1440, 900);
    for (const [img, n] of [['archetype:taverns-and-inns', 'taverns'], ['archetype:feasts-and-revelry', 'feasts'], ['archetype:starfaring', 'starfaring']]) await lab(`tab=crops&img=${encodeURIComponent(img)}`, 'crops-' + n, '.lab-crop-row', 1440, 900);

    /* 2 — the real page: five strategies at three viewports; delivery and geometry */
    for (const [vw, vh] of [[1280, 800], [1440, 900], [1920, 1080]]) {
      for (const s of Core.STRATEGY_IDS) {
        const { ctx, page, requests, problems } = await appPage(browser, port, s, vw, vh, 1);
        await shot(page, `page-${s}-${vw}`);
        const geo = await page.evaluate(() => ({ covers: [...document.querySelectorAll('.list-card-cover')].map(c => Math.round(c.getBoundingClientRect().height)), cards: [...document.querySelectorAll('.list-card')].map(c => { const r = c.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }), cls: window.__cls }));
        audit.geometry[`${s}@${vw}`] = { coverHeights: [...new Set(geo.covers)], cardSizes: [...new Set(geo.cards.map(x => x.join('x')))], cls: +geo.cls.toFixed(4) };
        audit.problems.push(...problems.map(p => `page-${s}-${vw} ${p}`));
        if (vw === 1440) {
          const uniq = new Map(); requests.forEach(r => { if (r.status === 200) uniq.set(r.url, r); });
          audit.metrics[`${s}@1440x1`] = { requests: requests.length, distinct: uniq.size, bytes: [...uniq.values()].reduce((a, b) => a + b.bytes, 0), widths: [...new Set([...uniq.keys()].map(k => k.match(/-(\d+)\.(avif|webp)$/)[1]))].sort() };
        }
        await ctx.close();
      }
    }
    for (const s of ['A', 'B', 'C', 'D', 'E']) {
      const { ctx, page, requests } = await appPage(browser, port, s, 1440, 900, 2);
      await shot(page, `page-${s}-1440-dpr2`, '.list-cards-grid');
      const uniq = new Map(); requests.forEach(r => { if (r.status === 200) uniq.set(r.url, r); });
      audit.metrics[`${s}@1440x2`] = { requests: requests.length, distinct: uniq.size, bytes: [...uniq.values()].reduce((a, b) => a + b.bytes, 0), widths: [...new Set([...uniq.keys()].map(k => k.match(/-(\d+)\.(avif|webp)$/)[1]))].sort() };
      await ctx.close();
    }
    /* Strategy D's three ratios on the problem list, real card */
    for (const r of ['60:40', '67:33', '75:25']) {
      const { ctx, page } = await appPage(browser, port, 'D', 1440, 900, 1, r);
      await shot(page, 'ratio-' + r.replace(':', '-'), '.list-card[data-list="baldur-test"]');
      await ctx.close();
    }
  } finally { await browser.close(); server.close(); }
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(audit, null, 2) + '\n');
  console.log(JSON.stringify(audit, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
