#!/usr/bin/env node
/* Dev-only browser check for Phase G (docs/product-decisions.md PD-029): #/journey is the map
   editor, #/journey2[/env/<id>] is a replace-redirect, Back/Forward never remount the editor,
   existing dhcodex_journey2_* storage loads untouched, EN/RU labels say Journey.
   Usage: node scripts/journey2/route-cutover-verify.js [--dir <served dir, default repo root>] */
'use strict';
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', '..');
const dirArg = process.argv.indexOf('--dir');
const DIR = dirArg > 0 ? path.resolve(process.argv[dirArg + 1]) : ROOT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.avif': 'image/avif', '.svg': 'image/svg+xml' };

let failed = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + msg); if (!ok) failed++; };

(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(DIR, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!f.startsWith(DIR) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  }).listen(0);
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch(process.env.J2_BROWSER_CHANNEL ? { channel: process.env.J2_BROWSER_CHANNEL } : {});
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const ready = () => page.waitForFunction(() => document.querySelector('.j2') && Journey2View.isMounted(), null, { timeout: 60000 });
  const snap = () => page.evaluate(() => ({ hash: location.hash, route: document.body.dataset.route, title: document.title,
    old: document.querySelectorAll('.journey-wrap,.journey-cols,#journey-version-switch').length,
    cur: document.getElementById('btn-journey').getAttribute('aria-current'), hist: history.length,
    keys: Object.keys(localStorage).filter(k => /journey/.test(k)).sort() }));

  await page.goto(base + '#/journey'); await ready();
  let s = await snap();
  check(s.route === 'journey' && s.cur === 'page' && s.old === 0, '#/journey renders the editor, nav current, no old page');
  check(s.keys.length === 0, 'a plain visit writes no journey storage');
  await page.evaluate(() => document.querySelector('[data-j2-echo-place]').click()); await page.waitForTimeout(500);
  const seeded = await page.evaluate(() => ({ map: localStorage.getItem('dhcodex_journey2_map'), ui: localStorage.getItem('dhcodex_journey2_ui') }));
  check(!!seeded.map, 'seeded a campaign in the existing dhcodex_journey2_* keys');

  await page.goto(base + '#/journey2'); await ready();
  s = await snap();
  check(s.hash === '#/journey', 'legacy #/journey2 repaired to #/journey (' + s.hash + ')');
  const histBefore = s.hist;
  const same = await page.evaluate(() => ({ map: localStorage.getItem('dhcodex_journey2_map'), ui: localStorage.getItem('dhcodex_journey2_ui') }));
  check(same.map === seeded.map && same.ui === seeded.ui, 'existing campaign loaded unchanged through the legacy route');

  await page.goto(base + '#/journey2/env/buzzing-swamp'); await ready(); await page.waitForTimeout(500);
  s = await snap();
  check(s.hash === '#/journey/env/buzzing-swamp' && /Buzzing Swamp|Гудящее Болото/.test(s.title), 'legacy overlay link redirects and opens the overlay');

  const mark = await page.evaluate(() => { document.querySelector('.j2').dataset.mark = '1'; return true; });
  await page.evaluate(() => { location.hash = '#/journey'; }); await page.waitForTimeout(500);
  check(await page.evaluate(() => document.querySelector('.j2').dataset.mark === '1'), 'closing the overlay does not remount the editor');
  await page.goBack(); await page.waitForTimeout(500);
  await page.goForward(); await page.waitForTimeout(500);
  s = await snap();
  check(await page.evaluate(() => document.querySelector('.j2').dataset.mark === '1'), 'Back/Forward keep the same editor instance');

  await page.evaluate(() => { location.hash = '#/prep'; }); await page.waitForTimeout(700);
  check(await page.evaluate(() => document.querySelectorAll('.j2').length === 0), 'leaving unmounts the editor');
  await page.goBack(); await ready();
  s = await snap();
  check(s.route === 'journey' && await page.evaluate(() => document.querySelectorAll('.j2').length === 1), 'Back to Journey mounts exactly one editor');
  check(await page.evaluate(() => localStorage.getItem('dhcodex_journey2_map')) === seeded.map, 'campaign untouched after route round-trip');

  await page.evaluate(() => document.querySelector('.lang-switch button:not(.active)').click()); await page.waitForTimeout(500);
  const labels = await page.evaluate(() => ({ title: document.title, nav: document.getElementById('btn-journey').textContent.trim(), bodyJ2: /Journey 2|Путешествие 2/.test(document.body.innerText) }));
  check(!labels.bodyJ2 && /—/.test(labels.title) && !/ 2 /.test(labels.title), 'title/nav carry no "Journey 2": ' + labels.title + ' / ' + labels.nav);

  await browser.close(); server.close();
  console.log(failed ? `\nRoute cutover verification FAILED (${failed}).` : '\nRoute cutover verification passed.');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
