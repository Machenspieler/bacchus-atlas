#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — shoot-semantic-reuse-lab.js
   DEV-ONLY visual QA for lab/semantic-reuse/. Serves the repo root, drives the lab in a fresh
   browser profile (never a real user's localStorage), writes screenshots and a browser-measured
   audit to docs/research/semantic-artwork-reuse-lab-v1/screens/. Needs `playwright` and Chrome.
   Run: node scripts/shoot-semantic-reuse-lab.js [outDir]
   ============================================================ */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/research/semantic-artwork-reuse-lab-v1/screens'));
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
  await page.goto(`http://127.0.0.1:${port}/lab/semantic-reuse/#${hash}`);
  await page.waitForSelector('.lab-body > *');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(900);
  return { ctx, page, problems };
}
async function shot(page, name, selector) {
  const file = path.join(OUT, name + '.png');
  if (selector) { const el = page.locator(selector).first(); await el.scrollIntoViewIfNeeded(); await page.evaluate(() => { const t = document.querySelector('.lab-top'); if (t) t.style.position = 'static'; }); await el.screenshot({ path: file }); }
  else await page.screenshot({ path: file, fullPage: false });
  console.log('wrote', path.relative(ROOT, file));
}
const q = o => new URLSearchParams(o).toString();

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { server, port } = await serve();
  const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
  const audit = { generated: new Date().toISOString().slice(0, 10), problems: [], frames: [] };
  try {
    /* viewports: the three required sizes, plus DPR 2 */
    for (const [vw, vh, dpr] of [[1280, 800, 1], [1440, 900, 1], [1440, 900, 2], [1920, 1080, 1]]) {
      const tag = `${vw}x${vh}${dpr > 1 ? '-dpr' + dpr : ''}`;
      const { ctx, page, problems } = await open(browser, port, q({ tab: 'editor', source: 'streets-and-towns', region: 'streets-and-towns-market-stalls' }), vw, vh, dpr);
      await shot(page, `01-source-regions-${tag}`);
      await page.goto(`http://127.0.0.1:${port}/lab/semantic-reuse/#` + q({ tab: 'contexts', region: 'streets-and-towns-market-stalls', env: 'bustling-marketplace' }));
      await page.reload(); await page.waitForSelector('.sr-ctxrow'); await page.waitForTimeout(900);
      await shot(page, `03-contexts-${tag}`);
      audit.problems.push(...problems.map(p => tag + ' ' + p));
      await ctx.close();
    }
    const grab = async (hash, name, selector, vw, vh, dpr) => {
      const { ctx, page, problems } = await open(browser, port, hash, vw || 1440, vh || 900, dpr || 1);
      await shot(page, name, selector); audit.problems.push(...problems.map(p => name + ' ' + p)); await ctx.close();
    };
    await grab(q({ tab: 'editor', source: 'streets-and-towns', region: 'streets-and-towns-market-stalls' }), '02-region-close-up', '#sr-meta');
    for (const [id, env] of [['streets-and-towns-market-stalls', 'bustling-marketplace'], ['taverns-and-inns-fireplace', 'local-tavern'], ['archives-and-libraries-shelves-ladder', 'library-of-the-dusk-tree'], ['starfaring-orbital-arch-planet', 'planetary-blockade'], ['strongholds-and-sieges-trebuchet', 'castle-siege']]) {
      await grab(q({ tab: 'contexts', region: id, env }), `04-contexts-${id}`, '.lab-body', 1440, 1400, 2);
      await grab(q({ tab: 'match', region: id, env }), `05-abc-${id}-${env}`, '.lab-body', 1440, 1500, 2);
    }
    await grab(q({ tab: 'match', region: 'taverns-and-inns-bar-counter', env: 'the-dungeoneer' }), '06-cross-the-dungeoneer', '.lab-body', 1440, 1500, 2);
    await grab(q({ tab: 'match', region: 'archives-and-libraries-scholars-desk', env: 'murder-mystery' }), '06-cross-murder-mystery', '.lab-body', 1440, 1500, 2);
    await grab(q({ tab: 'match', region: 'streets-and-towns-market-stalls', env: 'city-festival' }), '06-cross-city-festival', '.lab-body', 1440, 1500, 2);
    await grab(q({ tab: 'match', region: 'streets-and-towns-clock-tower-gate', env: 'archmages-tower' }), '07-rejected-clock-tower-archmage', '.lab-body', 1440, 1500, 2);
    await grab(q({ tab: 'match', region: 'streets-and-towns-tavern-terrace', env: 'jazz-speakeasy' }), '07-rejected-terrace-speakeasy', '.lab-body', 1440, 1500, 2);
    await grab(q({ tab: 'contexts', region: 'seafaring-lighthouse-coast', env: 'port-city' }), '08-insufficient-lighthouse', '.lab-body', 1440, 1400, 2);
    await grab(q({ tab: 'contexts', region: 'starfaring-docked-ship', env: 'planetary-blockade' }), '08-weak-docked-ship', '.lab-body', 1440, 1400, 2);
    await grab(q({ tab: 'contexts', region: 'taverns-and-inns-dining-table', env: 'local-tavern' }), '08-weak-dining-table', '.lab-body', 1440, 1400, 2);
    await grab(q({ tab: 'editor', source: 'archives-and-libraries', region: 'archives-and-libraries-shelves-ladder' }), '09-multiple-regions-archives');
    for (const s of ['taverns-and-inns', 'strongholds-and-sieges', 'starfaring', 'seafaring']) await grab(q({ tab: 'editor', source: s }), `09-source-${s}`, '.sr-viewer');
    await grab(q({ tab: 'assets' }), '10-approved-grid-and-sizes', '.lab-body', 1440, 1500, 1);
    await grab(q({ tab: 'coverage' }), '11-coverage', '.lab-body');
    await grab(q({ tab: 'library' }), '12-library-scan', '.lab-body', 1440, 1200);
    await grab(q({ tab: 'export' }), '13-export');
  } finally { await browser.close(); server.close(); }
  /* Evidence, not masters: keep the repo small — WebP q80, the PNGs are deleted. */
  const sharp = require('sharp');
  for (const f of fs.readdirSync(OUT).filter(n => n.endsWith('.png'))) {
    await sharp(path.join(OUT, f)).webp({ quality: 80, effort: 5 }).toFile(path.join(OUT, f.replace(/\.png$/, '.webp')));
    fs.unlinkSync(path.join(OUT, f));
  }
  fs.writeFileSync(path.join(OUT, 'browser-audit.json'), JSON.stringify(audit, null, 1) + '\n');
  console.log('problems:', audit.problems.length); audit.problems.slice(0, 20).forEach(p => console.log(' ', p));
}
main().catch(e => { console.error(e); process.exit(1); });
