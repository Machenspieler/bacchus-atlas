#!/usr/bin/env node
/* Bacchus's Atlas — measure-cls.js
   DEV-ONLY. Measures Cumulative Layout Shift of a real navigation to #/lists: fixtures are seeded into
   localStorage BEFORE the first byte of the page (addInitScript), the observer is installed before any
   page script runs, and the score is the official session-window CLS (scripts/lib/cls.js) — never a sum
   over a long session. Every shift is printed with the elements that moved.
   Run: node scripts/measure-cls.js [--json] [--route=#/lists] [--scenario=illustrated|biome|empty|none]
        [--cache=cold|warm|both] [--lang=ru|en] [--viewport=1440x900] [--dpr=1] [--all] */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { cls, naiveSum, sessionWindows } = require('./lib/cls');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    /* cacheable like GitHub Pages, so the warm run really is warm */
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'max-age=600' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}

/* runs in a throwaway page just to resolve real environment ids by the same rules the covers use */
function pickInPage() {
  const E = allEnvs();
  const plain = (b, n) => E.filter(e => artBiome(e) === b && !ListCoverArt.ARCHETYPE_FIT[e.id] && !ListCoverArt.UNIQUE_ENV_IDS.includes(e.id)).slice(0, n).map(e => e.id);
  const art = ['cauldera-valley', 'cursed-graveyard', 'heros-tomb', 'shadowfen', 'ocean-voyage', 'fighting-arena', 'time-loop', 'field-of-dreams', 'tornado', 'castle-siege'];
  const biomes = ['forest', 'mountain', 'frozen', 'aquatic', 'badlands', 'wetland', 'underground', 'tropical'];
  const mk = sets => {
    const lists = sets.map((ids, i) => ({ id: 'qa-' + i, name: 'List ' + (i + 1) }));
    const envLists = {};
    sets.forEach((ids, i) => ids.forEach(id => { (envLists[id] = envLists[id] || []).push('qa-' + i); }));
    return { lists, envLists };
  };
  return {
    illustrated: mk([...art.map(id => [id]), ['cauldera-valley', 'field-of-dreams', 'ouroborean-pass'], ['heros-tomb', 'fighting-arena'], ['no-such-environment'], [], ['harsh-desert']]),
    biome: mk(biomes.flatMap(b => [plain(b, 1), plain(b, 3)])),
  };
}

const OBSERVER = () => {
  window.__shifts = [];
  const desc = n => n ? (n.nodeType === 1 ? n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).slice(0, 3).join('.') : '') : '#' + n.nodeName) : null;
  const r = x => x && [Math.round(x.x), Math.round(x.y), Math.round(x.width), Math.round(x.height)];
  new PerformanceObserver(list => {
    for (const e of list.getEntries()) {
      window.__shifts.push({
        startTime: Math.round(e.startTime), value: e.value, hadRecentInput: e.hadRecentInput,
        fonts: document.fonts ? document.fonts.status : '?', ready: document.readyState,
        imgs: [...document.images].filter(i => !i.complete).length,
        sources: (e.sources || []).map(s => ({ node: desc(s.node), prev: r(s.previousRect), cur: r(s.currentRect) })),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
};

async function measure(browser, base, opts, seeds, ctxState) {
  const { route, scenario, lang, width, height, dpr, warmup } = opts;
  const ctx = ctxState || await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  const seed = seeds[scenario];
  await page.addInitScript(([s, l]) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    if (s) { localStorage.setItem('dhcodex_lists', JSON.stringify(s.lists)); localStorage.setItem('dhcodex_env_lists', JSON.stringify(s.envLists)); }
    localStorage.setItem('dhcodex_lang', l);
    localStorage.setItem('dhcodex_storage_notice_dismissed', '1');
  }, [seed, lang]);
  await page.addInitScript(OBSERVER);
  await page.goto(base + 'index.html' + route, { waitUntil: 'load' });
  await page.waitForSelector(scenario === 'none' ? 'body' : '.list-card, .empty, [data-empty]', { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500);
  const shifts = await page.evaluate(() => window.__shifts);
  const fonts = await page.evaluate(() => [...document.fonts].map(f => f.family + ' ' + f.weight + ' ' + f.status));
  await page.close();
  if (!ctxState) await ctx.close();
  return { shifts, fonts, cls: cls(shifts), naive: naiveSum(shifts), windows: sessionWindows(shifts).length };
}

async function main() {
  const { server, port } = await serve();
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ channel: process.env.J2_BROWSER_CHANNEL || 'chrome' });
  const probeCtx = await browser.newContext();
  const probe = await probeCtx.newPage();
  await probe.goto(base + 'index.html');
  await probe.waitForFunction(() => typeof ListCoverUtils !== 'undefined' && typeof allEnvs === 'function' && allEnvs().length > 0);
  const seeds = await probe.evaluate(pickInPage);
  seeds.empty = { lists: [], envLists: {} };
  seeds.none = null;
  await probeCtx.close();

  const all = process.argv.includes('--all');
  const viewports = all ? ['1280x800', '1440x900', '1920x1080', '390x844'] : [arg('viewport', '1440x900')];
  const scenarios = all ? ['illustrated', 'biome', 'empty'] : [arg('scenario', 'illustrated')];
  const langs = all ? ['ru', 'en'] : [arg('lang', 'ru')];
  const caches = (all || arg('cache', 'both') === 'both') ? ['cold', 'warm'] : [arg('cache')];
  const route = arg('route', '#/lists');
  const rows = [];
  for (const vp of viewports) for (const scenario of scenarios) for (const lang of langs) for (const cache of caches) {
    const [width, height] = vp.split('x').map(Number);
    const opts = { route, scenario, lang, width, height, dpr: +arg('dpr', 1) };
    let r;
    if (cache === 'warm') {
      /* same context twice: the second navigation hits the HTTP cache */
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: opts.dpr });
      await measure(browser, base, opts, seeds, ctx);
      r = await measure(browser, base, opts, seeds, ctx);
      await ctx.close();
    } else r = await measure(browser, base, opts, seeds, null);
    rows.push({ vp, scenario, lang, cache, cls: +r.cls.toFixed(4), naive: +r.naive.toFixed(4), shifts: r.shifts.length, detail: r.shifts, fonts: r.fonts });
    console.log(`${vp.padEnd(9)} ${scenario.padEnd(11)} ${lang} ${cache.padEnd(4)} CLS ${r.cls.toFixed(4)}  (naive sum ${r.naive.toFixed(4)}, ${r.shifts.length} shifts)`);
  }
  if (process.argv.includes('--json')) fs.writeFileSync(arg('out', 'cls-report.json'), JSON.stringify(rows, null, 1));
  else if (!all) for (const s of rows[rows.length - 1].detail) console.log(JSON.stringify(s));
  await browser.close();
  server.close();
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
