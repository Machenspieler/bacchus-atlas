#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — shoot-list-covers.js
   DEV-ONLY visual QA for the adaptive My Lists covers (docs/research/adaptive-list-covers-implementation.md §8).
   Serves the repo root, seeds a fixed set of QA lists into a fresh browser profile
   (never a real user's localStorage), screenshots #/lists at the sizes the brief asks
   for, and prints a machine check of every cover. Needs `playwright` (devDependency) and
   an installed Google Chrome. Run: node scripts/shoot-list-covers.js [outDir]
   ============================================================ */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/research/adaptive-list-covers-review'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}

/* Runs in the page, after app.js: real environments, picked by the same rules the covers use. */
function seedInPage() {
  const E = allEnvs();
  const art = ListCoverArt;
  const plain = (b, n, skip = 0) => E.filter(e => artBiome(e) === b && !art.ARCHETYPE_FIT[e.id] && !art.UNIQUE_ENV_IDS.includes(e.id)).slice(skip, skip + n).map(e => e.id);
  const arch = a => Object.keys(art.ARCHETYPE_FIT).filter(id => art.ARCHETYPE_FIT[id][0] === a);
  const blank = b => E.filter(e => artBiome(e) === b && !ListCoverUtils.resolveEnvironmentArt({ id: e.id, artBiome: b })).map(e => e.id);
  const S = [
    ['Empty list', []],
    ['One painting', ['cauldera-valley']],
    ['One archetype', ['cursed-graveyard']],
    ['One biome', ['harsh-desert']],
    ['Two images', ['archmages-tower', 'harsh-desert']],
    ['Three paintings', ['cauldera-valley', 'field-of-dreams', 'ouroborean-pass']],
    ['Five forests', plain('forest', 5)],
    ['Five mixed', ['ouroborean-pass', 'masquerade-ball', ...plain('mountain', 1), ...plain('frozen', 1), ...plain('aquatic', 1)]],
    ['Ten mixed biomes', [...plain('forest', 4), ...plain('mountain', 3), ...plain('underground', 2), ...plain('tropical', 1)]],
    ['Ten haunted', arch('haunted-and-deathly')],
    ['Mixed priorities', ['field-of-dreams', 'grand-feast', 'ruined-castle', ...plain('wetland', 2), ...plain('badlands', 2), ...plain('drylands', 1)]],
    ['Universal only', blank('universal').slice(0, 6)],
    ['Settlement-heavy', blank('settlement').slice(0, 8)],
    ['Harbour plus streets', ['port-city', ...blank('settlement').slice(0, 4)]],
    ['Stale reference', ['harsh-desert', 'no-such-environment', 'cursed-graveyard']],
    ['Haunted + dark biomes', ['cursed-graveyard', ...plain('badlands', 1), ...plain('underground', 1), ...plain('wetland', 1)]],
  ];
  const lists = S.map(([name], i) => ({ id: 'qa-' + i, name }));
  const envLists = {};
  S.forEach(([, ids], i) => ids.forEach(id => { (envLists[id] = envLists[id] || []).push('qa-' + i); }));
  return { lists, envLists };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { server, port } = await serve();
  const browser = await chromium.launch({ channel: process.env.J2_BROWSER_CHANNEL || 'chrome' });
  const base = `http://127.0.0.1:${port}/`;
  const shots = [
    ['lists-1280x800', 1280, 800, 1, 'ru'], ['lists-1440x900', 1440, 900, 1, 'ru'], ['lists-1920x1080', 1920, 1080, 1, 'ru'],
    ['lists-1440x900-dpr2', 1440, 900, 2, 'ru'], ['lists-1440x900-en', 1440, 900, 1, 'en'], ['lists-phone-390-dpr2', 390, 844, 2, 'ru'],
  ];
  let failed = false;
  for (const [name, width, height, dpr, lang] of shots) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + 'index.html');
    await page.waitForFunction(() => typeof ListCoverUtils !== 'undefined' && typeof allEnvs === 'function' && allEnvs().length > 0);
    const seed = await page.evaluate(seedInPage);
    await page.evaluate(([s, l]) => {
      localStorage.setItem('dhcodex_lists', JSON.stringify(s.lists));
      localStorage.setItem('dhcodex_env_lists', JSON.stringify(s.envLists));
      localStorage.setItem('dhcodex_lang', l);
      localStorage.setItem('dhcodex_storage_notice_dismissed', '1');
    }, [seed, lang]);
    await page.goto(base + 'index.html#/lists');
    await page.reload();
    await page.waitForSelector('.list-card');
    /* lazy tiles below the fold only load once scrolled to; walk the page, then come back */
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight / 2) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
      scrollTo(0, 0);
    });
    await page.waitForFunction(() => [...document.images].every(i => i.complete));
    await page.waitForTimeout(400);
    const report = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.list-card')];
      return {
        cards: cards.length,
        heights: [...new Set(cards.map(c => Math.round(c.getBoundingClientRect().height)))],
        coverHeights: [...new Set(cards.map(c => Math.round(c.querySelector('.list-card-cover').getBoundingClientRect().height)))],
        broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0).length,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        tiles: cards.map(c => c.querySelectorAll('.list-card-cover picture').length),
        duplicates: cards.filter(c => { const s = [...c.querySelectorAll('.list-card-cover img')].map(i => i.currentSrc || i.src); return new Set(s).size !== s.length; }).length,
        /* file width (the -NNN suffix of the chosen candidate) over the device pixels the tile draws: below 1 is upscaling */
        minSourceToDevicePx: [...document.querySelectorAll('.list-card-cover img')].map(i => +i.currentSrc.match(/-(\d+)\.\w+$/)[1] / (i.getBoundingClientRect().width * devicePixelRatio)).reduce((m, v) => Math.min(m, v), Infinity),
      };
    });
    console.log(name, JSON.stringify(report), errors.length ? 'ERRORS ' + errors.join(' | ') : '');
    if (report.broken || report.overflowX || report.duplicates || errors.length || report.heights.length > 1 || report.coverHeights.length > 1 || Math.max(...report.tiles) > 3 || report.minSourceToDevicePx < 1) failed = true;
    await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });
    if (name === 'lists-1440x900') {
      await page.hover('.list-card:nth-child(6)');
      await page.waitForTimeout(300);
      const box = await page.locator('.list-card:nth-child(6)').boundingBox();
      await page.screenshot({ path: path.join(OUT, 'hover-three-paintings.png'), clip: { x: box.x - 12, y: box.y - 12, width: box.width + 24, height: box.height + 24 } });
    }
    await ctx.close();
  }
  await browser.close();
  server.close();
  if (failed) { console.error('visual QA check failed'); process.exit(1); }
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
