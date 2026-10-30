#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — shoot-list-covers.js
   DEV-ONLY visual QA for the adaptive My Lists covers (docs/research/adaptive-list-covers-implementation.md §8).
   Serves the repo root, seeds a fixed set of QA lists into a fresh browser profile
   (never a real user's localStorage), screenshots #/lists at the sizes the brief asks
   for, and prints a machine check of every cover. Needs `playwright` (devDependency) and
   an installed Google Chrome. Run: node scripts/shoot-list-covers.js [outDir]
   --phase2 seeds the Phase 2 scenarios instead (docs/research/adaptive-list-covers-phase2.md §11).
   ============================================================ */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PHASE2 = process.argv.includes('--phase2');
const ARGS = process.argv.slice(2).filter(a => a !== '--phase2');
const OUT = path.resolve(ARGS[0] || path.join(ROOT, PHASE2 ? 'docs/research/adaptive-list-covers-phase2-review' : 'docs/research/adaptive-list-covers-review'));
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

/* Phase 2 scenarios A-G. Real environments by id; E reads the classification for the three
 * archetypes that have no approved picture. */
async function seedPhase2InPage() {
  const E = allEnvs();
  const cls = await (await fetch('docs/research/lists-cover-classification.json')).json();
  const of = a => cls.environments.filter(r => r.primary_archetype === a).map(r => r.id);
  const plain = (b, n, skip = 0) => E.filter(e => artBiome(e) === b && !ListCoverArt.ARCHETYPE_FIT[e.id] && !ListCoverArt.UNIQUE_ENV_IDS.includes(e.id)).slice(skip, skip + n).map(e => e.id);
  const S = [
    ['A1 Storm', ['tornado', 'megastorm', 'thunderstorm']],
    ['A2 Infernal', ['circles-below-dis', 'fallen-citadel', 'prison-city-pyrrhexis']],
    ['A3 Drowned', ['sunken-citadel', 'deep-one-city']],
    ['A4 Siege', ['castle-siege', 'defense-of-the-river-fort']],
    ['A all four', ['tornado', 'circles-below-dis', 'sunken-citadel', 'castle-siege']],
    ['B1 Dragon lair', ['dragons-lair']],
    ['B2 Lair rejects', ['acid-burrows', 'thrumming-hives', 'webbed-terrain']],
    ['B3 Blighted', ['rewritten-grove', 'gnarled-glen', 'cursed-valley']],
    ['B4 Blight rejects', ['devouring-green', 'heart-of-the-mire', 'green-doom-tangle']],
    ['B5 Fey', ['court-of-cats', 'fey-lands']],
    ['B6 Fey rejects', ['court-of-hounds', 'dark-forest-revel', 'hags-hut']],
    ['B7 Painting beats fey', ['cauldera-valley', 'court-of-cats']],
    ['C3 Mixed 3', ['cauldera-valley', 'tornado', 'castle-siege']],
    ['C5 Mixed 5', ['field-of-dreams', 'cursed-graveyard', 'sunken-citadel', 'circles-below-dis', ...plain('forest', 1)]],
    ['C8 Mixed 8', ['ouroborean-pass', 'archmages-tower', 'grand-feast', 'megastorm', 'rewritten-grove', 'court-of-cats', ...plain('badlands', 2)]],
    ['C10 Mixed 10', ['cauldera-valley', 'forgotten-temple-of-the-serpent', 'dragons-lair', 'tornado', 'fallen-citadel', 'drowned-sanctum', 'cursed-valley', 'fey-lands', ...plain('frozen', 2)]],
    ['D Disasters', ['tornado', 'forest-wildfire', 'volcanic-eruption', 'snow-squall']],
    ['E Starfaring', of('starfaring').slice(0, 5)],
    ['E Sacred', of('sacred-sanctuaries').slice(0, 5)],
    ['E Streets', of('streets-and-towns').slice(0, 5)],
    ['F Original four', ['cursed-graveyard', 'ruined-castle', 'archmages-tower', 'masquerade-ball']],
    ['F Three paintings', ['cauldera-valley', 'field-of-dreams', 'ouroborean-pass']],
    ['G Empty', []],
    ['G Stale reference', ['no-such-environment', 'tornado']],
  ];
  const lists = S.map(([name], i) => ({ id: 'qa-' + i, name }));
  const envLists = {};
  S.forEach(([, ids], i) => ids.forEach(id => { (envLists[id] = envLists[id] || []).push('qa-' + i); }));
  return { lists, envLists, summary: S.map(([n, ids]) => [n, ids.length]) };
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
    const seed = await page.evaluate(PHASE2 ? seedPhase2InPage : seedInPage);
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
    if (PHASE2 && name === 'lists-1440x900') {
      report.covers = await page.evaluate(() => [...document.querySelectorAll('.list-card')].map(c => [c.querySelector('.list-card-title, h3, .list-card-name')?.textContent.trim(), [...c.querySelectorAll('.list-card-cover img')].map(i => (i.currentSrc.match(/list-covers\/([^/]+?)-\d+\./) || i.currentSrc.match(/thumb\/([^/]+?)-\d+\./) || [])[1])]));
      fs.writeFileSync(path.join(OUT, 'covers.json'), JSON.stringify(report.covers, null, 1));
    }
    console.log(name, JSON.stringify({ ...report, covers: undefined }), errors.length ? 'ERRORS ' + errors.join(' | ') : '');
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
