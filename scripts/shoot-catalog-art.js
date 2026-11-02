#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — shoot-catalog-art.js
   DEV-ONLY visual and delivery QA for the Catalog's context-adaptive strips (PD-089,
   docs/research/catalog-context-adaptive-artwork-integration.md). Serves the repo root, and for
   each viewport loads the REAL catalogue twice in fresh browser profiles: once with
   js/catalog-art.js replaced by a stub that always answers "biome" (the exact pre-rollout
   production output — biomeArtHtml is unchanged) and once as shipped. Same code, same data,
   same order, same viewport. It records card geometry (must be identical), every strip's
   source and sharpness (source pixels / device pixels drawn), image requests and bytes
   (cold, then warm), and writes screenshots and report.json.
   Needs `playwright` (devDependency) and Google Chrome. Run: node scripts/shoot-catalog-art.js [outDir]
   ============================================================ */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/research/catalog-context-adaptive-artwork-integration'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const STUB = 'window.CatalogArt={WIDTHS:[],DIR:"",PICTURES:{},ENV_KEEP_BIOME:{},files(){},resolveCatalogArt(){return{kind:"biome",imageId:null,reason:"baseline"}}};';

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'content-length': fs.statSync(file).size, 'cache-control': 'max-age=3600' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}

async function newPage(browser, port, mode, vw, vh, dpr, hash, lang) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
  if (lang) await ctx.addInitScript(l => { try { localStorage.setItem('dhcodex_lang', JSON.stringify(l)); } catch (e) {} }, lang);
  if (mode === 'baseline') await ctx.route('**/js/catalog-art.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }));
  const page = await ctx.newPage();
  const stats = { problems: [], images: new Map() };
  page.on('pageerror', e => stats.problems.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) stats.problems.push('console: ' + m.text()); });
  page.on('requestfailed', r => stats.problems.push('requestfailed: ' + r.url()));
  page.on('response', async r => {
    const u = r.url();
    if (/\/img\/(biomes|catalog-art|env)\//.test(u) && /\.(avif|webp|jpg)$/.test(u)) {
      const len = +(r.headers()['content-length'] || 0);
      stats.images.set(u, len);
    }
  });
  await page.goto(`http://127.0.0.1:${port}/#${hash || '/'}`);
  await page.waitForSelector('.card[data-id]');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(700);
  return { ctx, page, stats };
}

async function showAll(page) {
  for (let i = 0; i < 40; i++) {
    const btn = page.locator('#catalog-more-btn');
    if (!(await btn.count())) break;
    await btn.click(); await page.waitForTimeout(80);
  }
}
async function walk(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(500);
}
const total = m => [...m.values()].reduce((a, b) => a + b, 0);

/* Per-card geometry and per-strip sharpness, read from the live DOM. */
async function measure(page) {
  return page.evaluate(() => {
    const dpr = window.devicePixelRatio;
    return [...document.querySelectorAll('.card[data-id]')].map(c => {
      const r = c.getBoundingClientRect(), a = c.querySelector('.card-art'), img = c.querySelector('.card-art img');
      const ar = a.getBoundingClientRect();
      const src = img.currentSrc || img.src;
      return {
        id: c.dataset.id, x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height * 10) / 10,
        artW: Math.round(ar.width * 10) / 10, artH: Math.round(ar.height * 10) / 10,
        title: c.querySelector('.card-title').getBoundingClientRect().height,
        src: src.replace(/^https?:\/\/[^/]+\//, ''), natW: img.naturalWidth, natH: img.naturalHeight, complete: img.complete && img.naturalWidth > 0,
        fileW: +((src.match(/-(\d+)\.(?:avif|webp)$/) || [])[1] || 0),
        sharp: +((src.match(/-(\d+)\.(?:avif|webp)$/) || [])[1] || 0) / (ar.width * dpr),
      };
    });
  });
}

async function shotEl(page, selector, file) {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await el.screenshot({ path: path.join(OUT, file) });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { server, port } = await serve();
  const browser = await chromium.launch({ channel: 'chrome' });
  const report = { viewports: {}, problems: [] };
  const VIEWPORTS = [[1280, 800], [1440, 900], [1920, 1080]];
  const PAIRS = ['heros-tomb', 'teal-heart-inn', 'library-of-the-dusk-tree', 'shadowfen', 'floating-mountains', 'sunken-citadel', 'ocean-voyage', 'fighting-arena',
    'stop-the-collapse-of-reality', 'cursed-graveyard', 'tornado', 'planetary-blockade', 'time-loop', 'dragons-lair', 'haunted-city', 'cauldera-valley', 'field-of-dreams', 'ouroborean-pass', 'port-city', 'gang-hideout'];

  for (const [vw, vh] of VIEWPORTS) {
    for (const dpr of [1, 2]) {
      const key = `${vw}x${vh}@${dpr}x`;
      const out = report.viewports[key] = {};
      const cards = {};
      for (const mode of ['baseline', 'final']) {
        const { ctx, page, stats } = await newPage(browser, port, mode, vw, vh, dpr);
        // first screen (what a visitor fetches on load) — cold
        const first = { requests: stats.images.size, bytes: total(stats.images) };
        await showAll(page); await walk(page);
        const m = await measure(page);
        cards[mode] = m;
        out[mode] = {
          cards: m.length, firstScreen: first, fullCatalog: { requests: stats.images.size, bytes: total(stats.images) },
          distinctStrips: new Set(m.map(c => c.src.replace(/-\d+\.(avif|webp)$/, ''))).size,
          broken: m.filter(c => !c.complete).length, minSharp: Math.min(...m.map(c => c.sharp)),
          horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
          problems: stats.problems,
        };
        report.problems.push(...stats.problems.map(p => key + ' ' + mode + ' ' + p));
        if (dpr === 2 && vw === 1440) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: path.join(OUT, `grid-${mode}-${vw}x${vh}-dpr2.png`) });
          // a long run of the real grid, same cards in both: the whole page's first 60 cards
          await page.evaluate(() => { document.querySelectorAll('.card')[60]?.scrollIntoView(); });
          await page.waitForTimeout(400);
          await page.screenshot({ path: path.join(OUT, `grid-mid-${mode}-${vw}x${vh}-dpr2.png`) });
          for (const id of PAIRS) {
            const sel = `.card[data-id="${id}"]`;
            if (await page.locator(sel).count()) await shotEl(page, sel, `pair-${id}-${mode}.png`);
          }
        }
        if (dpr === 1 && vw === 1280 && mode === 'final') {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: path.join(OUT, 'grid-final-1280x800-dpr1.png') });
        }
        // warm: reload in the same context — cached files cost no requests
        if (vw === 1440) {
          const before = stats.images.size;
          await page.reload(); await page.waitForSelector('.card[data-id]'); await page.waitForTimeout(800);
          out[mode].warmReload = { newRequestsAfterReload: stats.images.size - before };
        }
        await ctx.close();
      }
      // geometry: every card identical in position and size, strip panel included
      const diffs = [];
      cards.baseline.forEach((b, i) => {
        const f = cards.final[i];
        if (!f || f.id !== b.id || f.x !== b.x || f.y !== b.y || f.w !== b.w || f.h !== b.h || f.artW !== b.artW || f.artH !== b.artH || f.title !== b.title) diffs.push([b, f]);
      });
      out.geometry = { compared: cards.baseline.length, identical: diffs.length === 0, differing: diffs.slice(0, 5).map(([b, f]) => [b.id, f && f.id]) };
      const heights = cards.final.map(c => c.artH);
      out.artHeightRange = [Math.min(...heights), Math.max(...heights)];
      out.changedStrips = cards.final.filter((f, i) => f.src.replace(/-\d+\.(avif|webp)$/, '') !== cards.baseline[i].src.replace(/-\d+\.(avif|webp)$/, '')).length;
      if (dpr === 2 && vw === 1440) report.cards = cards.final.map(c => ({ id: c.id, src: c.src, fileW: c.fileW, h: c.h, artH: c.artH, sharp: +c.sharp.toFixed(2) }));
    }
  }

  // Language and interactions: RU/EN screenshots, search, filters, random, details, add-to-list, nav
  const checks = report.functional = {};
  for (const lang of ['en', 'ru']) {
    const { ctx, page, stats } = await newPage(browser, port, 'final', 1440, 900, 2, '/', lang);
    await page.screenshot({ path: path.join(OUT, `catalog-final-${lang}-1440x900-dpr2.png`) });
    checks['lang-' + lang] = { htmlLang: await page.evaluate(() => document.documentElement.lang), firstTitle: await page.locator('.card[data-id] .card-title').first().innerText(), problems: stats.problems };
    await ctx.close();
  }
  {
    const { ctx, page, stats } = await newPage(browser, port, 'final', 1440, 900, 1, '/');
    const count = () => page.locator('.card[data-id]').count();
    checks.initial = await count();
    await page.fill('#f-search', 'crypt'); await page.waitForTimeout(500);
    checks.search = { crypt: await count(), ids: await page.locator('.card[data-id]').evaluateAll(n => n.slice(0, 5).map(x => x.dataset.id)) };
    await page.fill('#f-search', ''); await page.waitForTimeout(400);
    await page.goto(`http://127.0.0.1:${port}/#/?biome=forest&tier=2`); await page.waitForTimeout(700);
    checks.filterBiomeTier = { cards: await count(), allHaveStrip: await page.locator('.card[data-id] .card-art img').count() === await count() };
    await page.goto(`http://127.0.0.1:${port}/#/`); await page.waitForSelector('.card[data-id]'); await page.waitForTimeout(500);
    await page.fill('#f-search', 'tomb'); await page.waitForTimeout(600);
    checks.searchTomb = await page.locator('.card[data-id]').evaluateAll(n => n.map(x => x.dataset.id));
    await page.locator('.card[data-id] .card-open').first().click(); await page.waitForTimeout(700);
    checks.openDetail = { hash: await page.evaluate(() => location.hash) };
    await page.goto(`http://127.0.0.1:${port}/#/`); await page.waitForSelector('.card[data-random-card]'); await page.waitForTimeout(500);
    await page.locator('.card[data-random-card]').first().click(); await page.waitForTimeout(900);
    checks.random = { hash: await page.evaluate(() => location.hash) };
    await page.goto(`http://127.0.0.1:${port}/#/`); await page.waitForSelector('.card[data-id]'); await page.waitForTimeout(500);
    await page.locator('[data-add-to-list]').first().click(); await page.waitForTimeout(500);
    checks.addToList = { dialog: await page.locator('[role="dialog"]').count() };
    report.problems.push(...stats.problems.map(p => 'functional ' + p));
    await ctx.close();
  }
  await browser.close(); server.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const k = 'viewports';
  for (const [key, v] of Object.entries(report[k])) {
    console.log(key, 'geometry identical:', v.geometry.identical, '| changed strips:', v.changedStrips, '| art h', v.artHeightRange.join('-'),
      '| base', v.baseline.fullCatalog.requests, 'req', Math.round(v.baseline.fullCatalog.bytes / 1024), 'KB',
      '| final', v.final.fullCatalog.requests, 'req', Math.round(v.final.fullCatalog.bytes / 1024), 'KB',
      '| first screen', v.baseline.firstScreen.requests + '→' + v.final.firstScreen.requests, '| minSharp', v.final.minSharp.toFixed(2), '| broken', v.final.broken, '| overflow', v.final.horizontalOverflow);
  }
  console.log('functional', JSON.stringify(report.functional));
  console.log('problems', report.problems.length, report.problems.slice(0, 5));
})().catch(e => { console.error(e); process.exit(1); });
