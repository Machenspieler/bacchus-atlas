#!/usr/bin/env node
/* Dev-only. Exports the Journey 2 diagnostic print proof to PDF with the real app (Playwright
   Chromium, isolated context, throw-away static server), once with background printing enabled and
   once disabled, and records the on-screen theme before/after so "the normal dark appearance is
   unchanged" is measured rather than assumed.

   Usage: node scripts/journey2/print-proof.js [--out <dir>] [--root <dir>]
   Writes <out>/journey2-print-proof.pdf (background printing ON, the canonical proof),
          <out>/journey2-print-proof-nobg.pdf, <out>/print-proof-info.json, <out>/screen-theme.json */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? path.resolve(process.argv[i + 1]) : d; };
const OUT = arg('--out', path.join(ROOT, 'docs', 'journey2-implementation', 'stage-0a', 'print'));
const SITE = arg('--root', ROOT);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function serve(root) {
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]); let file = path.join(root, url);
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

/** What the user sees on screen: canvas/root/body paint and a few computed values. */
const themeProbe = () => {
  const cs = (e) => getComputedStyle(e);
  const pick = (e) => ({ bg: cs(e).backgroundColor, bgImage: cs(e).backgroundImage.slice(0, 40), color: cs(e).color, colorScheme: cs(e).colorScheme });
  return { html: pick(document.documentElement), body: pick(document.body), printMode: document.body.classList.contains('j2-print-mode'), printRoot: !!document.getElementById('j2-print-root') };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve(SITE);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/#/journey`);
  await page.waitForSelector('.j2-viewport', { timeout: 60000 });
  await page.waitForFunction(() => Journey2View.isMounted() && Journey2View.debugState().anchors > 0, null, { timeout: 60000 });
  await page.waitForTimeout(400);
  const before = await page.evaluate(themeProbe);
  const info = await page.evaluate(() => Journey2View.preparePrintProof());
  await page.waitForFunction(() => document.querySelectorAll('#j2-print-root image').length >= 2);
  await page.waitForTimeout(800);
  const during = await page.evaluate(themeProbe);
  const pdfOn = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const pdfOff = await page.pdf({ preferCSSPageSize: true, printBackground: false });
  fs.writeFileSync(path.join(OUT, 'journey2-print-proof.pdf'), pdfOn);
  fs.writeFileSync(path.join(OUT, 'journey2-print-proof-nobg.pdf'), pdfOff);
  await page.evaluate(() => Journey2View.cleanupPrintProof());
  const after = await page.evaluate(themeProbe);
  // leave Journey 2 and check the legacy route paints the same dark theme again
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForTimeout(500);
  const afterLeave = await page.evaluate(themeProbe);
  const pageCount = b => (b.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  fs.writeFileSync(path.join(OUT, 'print-proof-info.json'), JSON.stringify(Object.assign({}, info, { pdfBytes: pdfOn.length, pdfPages: pageCount(pdfOn), pdfNoBackgroundBytes: pdfOff.length, pdfNoBackgroundPages: pageCount(pdfOff) }), null, 1));
  fs.writeFileSync(path.join(OUT, 'screen-theme.json'), JSON.stringify({ before, during, after, afterLeave }, null, 1));
  console.log(JSON.stringify({ pdfOn: pdfOn.length, pdfOff: pdfOff.length, before: before.html.bg + '/' + before.body.bg, after: after.html.bg + '/' + after.body.bg }));
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
