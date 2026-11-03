#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — shoot-prep-art.js
   DEV-ONLY visual and delivery QA for Session Prep's context-adaptive thumbnails (PD-091,
   docs/research/session-prep-context-adaptive-artwork-integration.md). Serves the repo root and
     matrix   writes matrix.html (all 28 archetypes: source, square crop, the real 48px and 96px
              files at native size, status) and screenshots it at DPR 1 and 2;
     app      loads the REAL #/prep twice in fresh profiles — js/prep-art.js stubbed to "always
              biome" (the exact pre-rollout output) and as shipped — on one deterministic fixture
              of real environment ids, records row geometry (must be identical), the sharpness
              of every thumbnail, image requests and bytes (cold, warm), and screenshots.
   Needs `playwright` (devDependency), Google Chrome, and `node scripts/generate-prep-art.js <dir> --all`
   already run into <outDir>/candidates. Run: node scripts/shoot-prep-art.js [matrix|app|all] [outDir]
   ============================================================ */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');
const Prep = require('../js/prep-art.js');
const Art = require('../js/list-cover-art.js');
const { SOURCES } = require('./generate-list-covers.js');

const ROOT = path.join(__dirname, '..');
const MODE = process.argv[2] || 'all';
const OUT = path.resolve(process.argv[3] || path.join(ROOT, 'docs/research/session-prep-context-adaptive-artwork-integration'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const STUB = 'window.PrepArt={SIZES:[],DIR:"",PICTURES:{},ENV_KEEP_BIOME:{},inUse(){return false},files(){},resolvePrepArt(){return{kind:"biome",imageId:null,reason:"baseline"}}};';

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'content-length': fs.statSync(file).size, 'cache-control': 'max-age=3600' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}

/* ---------------------------------------------------------------- matrix */
function matrixHtml() {
  const rows = Object.entries(Prep.PICTURES).filter(([id]) => id.startsWith('archetype:')).map(([id, pic]) => {
    const name = id.slice(10);
    const src = path.relative(OUT, path.join(ROOT, SOURCES[pic.stem]));
    const c = n => `candidates/${pic.stem}-thumb-${n}.webp`;
    const fits = Object.entries(Art.ARCHETYPE_FIT).filter(([, f]) => f[0] === name);
    const strong = fits.filter(([, f]) => f[1] === 'strong').length;
    const status = { all: 'approved', strong: 'approved (strong fits only)', rejected: 'rejected', deferred: 'deferred' }[pic.use];
    return `<tr class="${pic.use}">
      <td class="n">${name}</td>
      <td><img class="src" src="${src}" width="160" height="90"></td>
      <td><img src="${c(144)}" width="144" height="144"></td>
      <td><img src="${c(48)}" srcset="${c(96)} 2x, ${c(144)} 3x" width="48" height="48"></td>
      <td><img src="${c(96)}" width="96" height="96"></td>
      <td class="s">${status}<br><small>${fits.length} mapped (${strong} strong)</small></td>
      <td class="r">${pic.note}</td></tr>`;
  }).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>Prep art matrix</title>
<style>body{background:#16130f;color:#e8dcc4;font:13px system-ui;margin:16px}table{border-collapse:collapse}td{padding:4px 10px;vertical-align:middle;border-bottom:1px solid #333}
.n{font-weight:600;width:180px}.s{width:150px}.r{max-width:320px;color:#bbb}tr.rejected td.s{color:#e07a6a}tr.deferred td.s{color:#e0b84a}tr.all td.s,tr.strong td.s{color:#8ccf8c}img{display:block}</style>
<h2>Session Prep — all 28 archetypes: source, square crop (144), actual 48px (srcset 1x/2x/3x), 96px file at native size</h2>
<table><tr><th>archetype<th>source<th>square crop<th>48px<th>96px<th>status<th>reason</tr>${rows}</table>`;
}

async function matrix(browser, port) {
  fs.writeFileSync(path.join(OUT, 'matrix.html'), matrixHtml());
  for (const dpr of [1, 2]) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}/${path.relative(ROOT, OUT)}/matrix.html`);
    await page.waitForLoadState('load');
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `matrix-dpr${dpr}.jpg`), fullPage: true });
    await ctx.close();
  }
}


/* ---------------------------------------------------------------- app */
const FIXTURE = ['heros-tomb', 'circles-below-dis', 'floating-mountains']; // the three-environment cap

async function newPage(browser, port, mode, vw, vh, dpr, lang) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
  if (lang) await ctx.addInitScript(l => { try { localStorage.setItem('dhcodex_lang', JSON.stringify(l)); } catch (e) {} }, lang);
  if (mode === 'baseline') await ctx.route('**/js/prep-art.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }));
  const page = await ctx.newPage();
  const stats = { problems: [], images: new Map() };
  page.on('pageerror', e => stats.problems.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) stats.problems.push('console: ' + m.text()); });
  page.on('response', r => {
    const u = r.url();
    if (/\/img\/(biomes|prep-art|env)\//.test(u) && /\.(avif|webp|jpg)$/.test(u)) stats.images.set(u.replace(/^.*\/img\//, 'img/'), +(r.headers()['content-length'] || 0));
  });
  await page.goto(`http://127.0.0.1:${port}/#/prep`);
  await page.waitForSelector('.prep-env-row');
  return { ctx, page, stats };
}

async function select(page, ids) {
  for (const id of ids) {
    await page.locator(`#prep-env-list [data-sp-toggle-env="${id}"]`).first().check({ force: true });
    await page.waitForTimeout(40);
  }
}
async function walk(page) {
  await page.evaluate(async () => {
    const list = document.getElementById('prep-env-list');
    const sc = [list, list.parentElement, document.scrollingElement].find(e => e && e.scrollHeight > e.clientHeight + 4) || list;
    for (let y = 0; y < sc.scrollHeight; y += 200) { sc.scrollTop = y; await new Promise(r => setTimeout(r, 25)); }
    sc.scrollTop = 0;
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(400);
}
async function measure(page) {
  return page.evaluate(() => {
    const dpr = window.devicePixelRatio;
    const q = sel => [...document.querySelectorAll(sel)].map(el => {
      const r = el.getBoundingClientRect(), img = el.querySelector('img') || (el.matches('img') ? el : null);
      const t = img ? img.getBoundingClientRect() : null;
      return { id: (el.closest('[data-env-id]') || el).dataset.envId, row: [Math.round(r.width), Math.round(r.height)], thumb: t && [Math.round(t.width), Math.round(t.height)],
        src: img && img.currentSrc.replace(/^.*\/img\//, 'img/'), natural: img && img.naturalWidth, art: img && img.dataset.prepArt || '',
        sharp: img && t.width ? +((+((img.currentSrc.match(/-(\d+)\.webp/) || [])[1] || img.naturalWidth)) / (t.width * dpr)).toFixed(2) : null };  // file pixels per device pixel drawn (naturalWidth is in CSS px for a density srcset)
    });
    return { picker: q('#prep-env-list .prep-env-row'), selected: q('.prep-sel-grid--env .prep-sel') , shift: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
}
const sum = m => [...m.values()].reduce((a, b) => a + b, 0);

async function app(browser, port) {
  const report = { fixture: FIXTURE, runs: {} };
  for (const mode of ['baseline', 'new']) {
    for (const [vw, vh] of [[1280, 800], [1440, 900], [1920, 1080]]) {
      const tag = `${mode}-${vw}x${vh}`;
      const { ctx, page, stats } = await newPage(browser, port, mode, vw, vh, 2, 'en');
      await select(page, FIXTURE);
      await walk(page);
      const m = await measure(page);
      await page.screenshot({ path: path.join(OUT, `prep-${tag}-dpr2.jpg`) });
      report.runs[tag] = { picker: m.picker.length, selected: m.selected.length, requests: stats.images.size, bytes: sum(stats.images), problems: stats.problems, overflowX: m.shift };
      if (vw === 1440) {
        report.runs[tag].rows = m;
        report.runs[tag].files = Object.fromEntries(stats.images);
        if (mode === 'new') {
          // warm cache: a second load in the same profile
          const warm = new Map();
          page.on('response', r => { const u = r.url(); if (/\/img\//.test(u) && !r.fromServiceWorker()) warm.set(u, r.status()); });
          await page.reload(); await page.waitForSelector('.prep-env-row'); await walk(page);
          report.runs[tag].warmRequestsToServer = warm.size;
        }
      }
      await ctx.close();
    }
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  const a = report.runs['baseline-1440x900'], b = report.runs['new-1440x900'];
  let geometry = 0;
  for (let i = 0; i < a.rows.picker.length; i++) {
    const x = a.rows.picker[i], y = b.rows.picker[i];
    if (x.id !== y.id || x.row.join() !== y.row.join() || String(x.thumb) !== String(y.thumb)) geometry++;
  }
  console.log(JSON.stringify({ baseline: { req: a.requests, bytes: a.bytes }, new: { req: b.requests, bytes: b.bytes }, geometryDiffs: geometry, problems: [...a.problems, ...b.problems] }));
}

async function extras(browser, port) {
  const out = {};
  const listClip = async (page, file) => {
    const box = await page.locator('.prep-col-env').boundingBox();
    await page.screenshot({ path: path.join(OUT, file), clip: box });
  };
  for (const mode of ['baseline', 'new']) {
    // dense list: a tall window shows ~17 rows; scroll to where thematic rows cluster (search narrows to a tier-1 mix)
    for (const [dpr, lang, tag, scrollTo] of [[2, 'en', 'dense-top', 0], [2, 'en', 'dense-mid', 1600], [2, 'en', 'dense-tombs', 3200], [1, 'en', 'dpr1', 0], [2, 'ru', 'ru', 0]]) {
      const { ctx, page } = await newPage(browser, port, mode, 1440, 1500, dpr, lang);
      await select(page, FIXTURE);
      await page.evaluate(y => { const l = document.getElementById('prep-env-list'); [l, l.parentElement].forEach(e => { if (e.scrollHeight > e.clientHeight) e.scrollTop = y; }); }, scrollTo);
      await page.waitForTimeout(500); await page.waitForLoadState('networkidle').catch(() => {});
      await listClip(page, `list-${tag}-${mode}.png`);
      if (tag === 'ru') await page.screenshot({ path: path.join(OUT, `prep-ru-${mode}-1440x1500.jpg`) });
      await ctx.close();
    }
  }
  // missing-derivative fallback: every prep-art file aborted
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('dhcodex_lang', JSON.stringify('en')); } catch (e) {} });
  await ctx.route('**/img/prep-art/**', r => r.abort());
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/#/prep`); await page.waitForSelector('.prep-env-row');
  await select(page, FIXTURE); await walk(page);
  const m = await measure(page);
  out.fallback = { brokenPickerImages: await page.evaluate(() => [...document.querySelectorAll('#prep-env-list img, .prep-sel-grid--env img')].filter(i => i.complete && i.naturalWidth === 0).length),
    stillThematic: m.picker.concat(m.selected).filter(r => /prep-art/.test(r.src || '')).length, selectedIcons: await page.locator('.prep-sel-grid--env .prep-sel-thumb.is-fallback').count() };
  await page.screenshot({ path: path.join(OUT, 'prep-missing-derivative-fallback.jpg') });
  await ctx.close();
  fs.writeFileSync(path.join(OUT, 'extras.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { server, port } = await serve();
  const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
  try {
    if (MODE === 'matrix' || MODE === 'all') await matrix(browser, port);
    if (MODE === 'app' || MODE === 'all') await app(browser, port);
    if (MODE === 'extras' || MODE === 'all') await extras(browser, port);
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
