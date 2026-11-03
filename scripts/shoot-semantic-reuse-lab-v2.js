#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — shoot-semantic-reuse-lab-v2.js
   DEV-ONLY visual QA for the V2 pilot of lab/semantic-reuse/ (#pilot=v2). Serves the repo root, drives the lab in a fresh
   browser profile (never a real user's localStorage), writes screenshots and a browser-measured
   audit to docs/research/semantic-artwork-reuse-lab-v2/screens/. Needs `playwright` and Chrome.
   Run: node scripts/shoot-semantic-reuse-lab-v2.js [outDir]
   ============================================================ */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/research/semantic-artwork-reuse-lab-v2/screens'));
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
const q = o => new URLSearchParams(Object.assign({ pilot: 'v2' }, o)).toString();

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { server, port } = await serve();
  const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
  const audit = { generated: new Date().toISOString().slice(0, 10), problems: [] };
  const grab = async (hash, name, selector, vw, vh, dpr) => {
    const { ctx, page, problems } = await open(browser, port, hash, vw || 1440, vh || 900, dpr || 1);
    await shot(page, name, selector); audit.problems.push(...problems.map(p => name + ' ' + p)); await ctx.close();
  };
  const R = { cov: 'intrigue-and-underworld-covert-table', alley: 'intrigue-and-underworld-arch-alley', plot: 'intrigue-and-underworld-plotters-table', ban: 'intrigue-and-underworld-serpent-banner', sky: 'intrigue-and-underworld-night-skyline',
    stat: 'sacred-sanctuaries-statue-altar', vista: 'sacred-sanctuaries-arched-vista', lotus: 'sacred-sanctuaries-lotus-pool', candle: 'sacred-sanctuaries-candle-steps',
    gate: 'dungeon-delves-barred-gate', stair: 'dungeon-delves-stair-bridge', kit: 'dungeon-delves-explorers-kit', flood: 'dungeon-delves-flooded-steps', cage: 'dungeon-delves-hanging-cage' };
  try {
    /* required viewport sizes, plus DPR 2 */
    for (const [vw, vh, dpr] of [[1280, 800, 1], [1440, 900, 1], [1440, 900, 2], [1920, 1080, 1]]) {
      const tag = `${vw}x${vh}${dpr > 1 ? '-dpr' + dpr : ''}`;
      const { ctx, page, problems } = await open(browser, port, q({ tab: 'editor', source: 'intrigue-and-underworld', region: R.cov }), vw, vh, dpr);
      await shot(page, `01-source-regions-${tag}`);
      await page.goto(`http://127.0.0.1:${port}/lab/semantic-reuse/#` + q({ tab: 'contexts', region: R.cov, env: 'gang-hideout' }));
      await page.reload(); await page.waitForSelector('.sr-ctxrow'); await page.waitForTimeout(900);
      await shot(page, `03-contexts-${tag}`);
      audit.problems.push(...problems.map(p => tag + ' ' + p));
      await ctx.close();
    }
    for (const s of ['intrigue-and-underworld', 'sacred-sanctuaries', 'dungeon-delves']) await grab(q({ tab: 'editor', source: s }), `01-source-${s}`, '.sr-viewer');
    const pairs = [[R.cov, 'gang-hideout'], [R.plot, 'murder-mystery'], [R.plot, 'heist'], [R.stat, 'chapel-of-st-brenna'], [R.vista, 'blade-root-sanctum'], [R.lotus, 'garden-of-the-tranquil-order'], [R.gate, 'chthon-verlies']];
    for (const [id, env] of pairs) {
      await grab(q({ tab: 'contexts', region: id, env }), `03-contexts-${id}`, '.lab-body', 1440, 1400, 2);
      await grab(q({ tab: 'match', region: id, env }), `05-abc-${id}-${env}`, '.lab-body', 1440, 1500, 2);
    }
    /* no-gain: crop is suitable but the environment already wears the archetype picture */
    await grab(q({ tab: 'match', region: R.stat, env: 'hallowed-temple' }), '05-nogain-statue-hallowed-temple', '.lab-body', 1440, 1500, 2);
    await grab(q({ tab: 'match', region: R.stair, env: 'deadly-dungeon' }), '05-nogain-stair-deadly-dungeon', '.lab-body', 1440, 1500, 2);
    /* cross-archetype */
    await grab(q({ tab: 'match', region: R.alley, env: 'street-chase' }), '06-cross-street-chase', '.lab-body', 1440, 1500, 2);
    /* rejected regions and mappings */
    await grab(q({ tab: 'contexts', region: R.candle, env: 'hallowed-temple' }), '07-rejected-candle-steps', '.lab-body', 1440, 1400, 2);
    await grab(q({ tab: 'contexts', region: R.ban, env: 'gang-hideout' }), '07-rejected-serpent-banner', '.lab-body', 1440, 1400, 2);
    await grab(q({ tab: 'contexts', region: R.flood, env: 'dripping-caverns' }), '07-rejected-flooded-steps', '.lab-body', 1440, 1400, 2);
    await grab(q({ tab: 'contexts', region: R.sky, env: 'gang-hideout' }), '07-insufficient-skyline', '.lab-body', 1440, 1400, 2);
    await grab(q({ tab: 'contexts', region: R.kit, env: 'abandoned-mine' }), '07-needs-review-explorers-kit', '.lab-body', 1440, 1400, 2);
    await grab(q({ tab: 'match', region: R.cov, env: 'the-undermarket' }), '07-rejected-mapping-covert-undermarket', '.lab-body', 1440, 1500, 2);
    await grab(q({ tab: 'match', region: R.stat, env: 'blade-root-sanctum' }), '07-rejected-mapping-statue-bladeroot', '.lab-body', 1440, 1500, 2);
    await grab(q({ tab: 'assets' }), '10-approved-grid-and-sizes', '.lab-body', 1440, 1500, 1);
    await grab(q({ tab: 'coverage' }), '11-coverage', '.lab-body', 1440, 1400);
    await grab(q({ tab: 'export' }), '13-export');
    await grab(q({ tab: 'sheet' }), '00-comparison-sheet', '.lab-body', 1920, 1080, 1);
    await grab(q({ tab: 'sheet' }), '00-comparison-sheet-dpr2', '.lab-body', 1440, 900, 2);
  } finally { await browser.close(); server.close(); }
  const sharp = require('sharp');
  for (const f of fs.readdirSync(OUT).filter(n => n.endsWith('.png'))) {
    await sharp(path.join(OUT, f), { limitInputPixels: false }).webp({ quality: 80, effort: 5 }).toFile(path.join(OUT, f.replace(/\.png$/, '.webp')));
    fs.unlinkSync(path.join(OUT, f));
  }
  fs.writeFileSync(path.join(OUT, 'browser-audit.json'), JSON.stringify(audit, null, 1) + '\n');
  console.log('problems:', audit.problems.length); audit.problems.slice(0, 20).forEach(p => console.log(' ', p));
}
main().catch(e => { console.error(e); process.exit(1); });
