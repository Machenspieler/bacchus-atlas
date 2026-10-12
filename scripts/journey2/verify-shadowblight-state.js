#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — scripts/journey2/verify-shadowblight-state.js
   Dev-only check that Hex Stock, the Hex overlay and the Region overlay all reflect the SAME region state (habitat.blighted),
   and that switching between a normal and a Shadowblighted region never leaves a stale badge.

   Fixture rule: a Shadowblighted region is created through the model (`habitat.blighted: true` on a real batch dispatched with
   `createBatch`) — never by toggling a CSS class / `hidden` on a DOM badge. Every check compares the DOM with the committed document.

   Usage: node scripts/journey2/verify-shadowblight-state.js [--out <dir>]   (default qa/biome-headers/shadowblight-state)
   Exit code 1 when any check fails. Fresh browser contexts: the owner's browser storage is never touched.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const Geo = require('../../js/journey2-geometry.js');
const Model = require('../../js/journey2-model.js');

const ROOT = path.join(__dirname, '..', '..');
const outArg = process.argv.indexOf('--out');
const OUT = outArg > -1 ? path.resolve(process.argv[outArg + 1]) : path.join(ROOT, 'qa', 'biome-headers', 'shadowblight-state');
fs.mkdirSync(OUT, { recursive: true });

const template = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'map-template.json'), 'utf8'));
const anchorsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'map-anchors.json'), 'utf8'));
const ctx0 = Model.createContext(template, anchorsDoc), grid = ctx0.grid;
const SEAM_X = template.composition.seam.worldX;

const BIOMES = ['forest', 'drylands', 'aquatic', 'grassland'];
const LANGS = ['en', 'ru'];
const VIEWPORTS = [[1280, 800], [1440, 900]];
const BADGE = { en: 'Shadowblighted', ru: 'Теневая порча' };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
function serve(root) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(root, url);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0, passes = 0;
function record(id, ok, detail) { if (ok) passes++; else failures++; console.log((ok ? 'PASS ' : 'FAIL ') + id + (ok ? '' : '  ' + JSON.stringify(detail))); }

const open = (() => {
  const c0 = grid.worldToCell(SEAM_X, 900);
  for (let ring = 0; ring < 60; ring++) for (let dq = -ring; dq <= ring; dq++) for (let dr = -ring; dr <= ring; dr++) {
    if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) !== ring) continue;
    const q = c0.q + dq, r = c0.r + dr;
    let ok = true;
    for (let a = -5; a <= 5 && ok; a++) for (let b = -5; b <= 5; b++) if (!ctx0.policy(q + a, r + b).ok) { ok = false; break; }
    if (ok) return { q, r };
  }
  throw new Error('no open area');
})();
const at = (dq, dr) => Geo.cellId(open.q + dq, open.r + dr);

async function run(browser, base, lang, [w, h], biome) {
  const tag = `${biome}.${lang}.${w}`;
  const context = await browser.newContext({ viewport: { width: w, height: h }, locale: lang === 'ru' ? 'ru-RU' : 'en-US' });
  await context.addInitScript(l => { try { if (!sessionStorage.getItem('__j2_init')) { sessionStorage.setItem('__j2_init', '1'); localStorage.setItem('dhcodex_lang', JSON.stringify(l)); } } catch (e) { /* none */ } }, lang);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const docNow = () => page.evaluate(() => Journey2View.debugApi().document());
  const clientOf = cell => page.evaluate(c => Journey2View.debugApi().cellToClient(c), cell);
  const dispatch = cmd => page.evaluate(c => Journey2View.debugApi().dispatch(c), cmd);

  await page.goto(base + '#/journey');
  await page.waitForSelector('.j2-viewport', { timeout: 60000 });
  await page.waitForFunction(() => Journey2View.isMounted() && Journey2View.debugState() && Journey2View.debugState().anchors > 0, null, { timeout: 60000 });
  await sleep(300);
  const c0 = grid.cellCenter(open.q, open.r);
  await page.evaluate(([x0, y0, s]) => { const r = document.querySelector('.j2-viewport').getBoundingClientRect(); Journey2View.debugApi().setCamera({ scale: s, tx: r.width * 0.3 + 160 - x0 * s, ty: r.height / 2 - y0 * s }); }, [c0[0] + 60, c0[1] + 40, 0.8]);
  await sleep(280);

  // The fixture: two REAL batches of the same biome through the model — only the habitat flag differs.
  const make = blighted => page.evaluate(([b, bl]) => {
    const M = Journey2Model, id = M.newId('b');
    const region = { habitat: { biome: b, blighted: bl, overtaken: false, source: 'rolled', rolls: [4] }, terrain: { value: 2, source: 'rolled' }, size: 3, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 17 };
    return Journey2View.debugApi().dispatch({ type: 'createBatch', batch: M.batchFromRegion(region, { id, createdAt: new Date().toISOString() }) }).ok ? id : null;
  }, [biome, blighted]);
  const N = await make(false), S = await make(true);
  const pN = await dispatch({ type: 'place', batchId: N, tiles: [{ id: 'n0', cell: at(0, 0) }, { id: 'n1', cell: at(1, 0) }] });
  const pS = await dispatch({ type: 'place', batchId: S, tiles: [{ id: 's0', cell: at(0, 1) }, { id: 's1', cell: at(1, 1) }] });
  if (!N || !S || !pN.ok || !pS.ok) throw new Error('fixture failed: ' + JSON.stringify({ N, S, pN, pS }));
  await page.evaluate(() => document.querySelector('.j2-viewport').focus());

  const doc = await docNow();
  const stateOf = id => !!doc.batches.find(b => b.id === id).habitat.blighted;
  record(`${tag}.fixture: model flags differ (normal=false, blighted=true)`, stateOf(N) === false && stateOf(S) === true, { N: stateOf(N), S: stateOf(S) });

  /** What every surface shows right now. */
  const dom = () => page.evaluate(() => {
    const vis = e => !!e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().width > 0;   // RENDERED, not the hidden attribute: a CSS display rule can override [hidden]
    const insp = document.querySelector('[data-j2-inspector]');
    const cards = {};
    for (const c of document.querySelectorAll('.j2-card')) { const b = c.querySelector('[data-j2-c="blight"]'); cards[c.getAttribute('data-batch')] = { shown: vis(b), text: b ? b.textContent : '' }; }
    const ib = insp && insp.querySelector('[data-j2-i="blight"]');
    const st = Journey2View.debugState().inspector;
    return { cards, overlay: { open: vis(insp), shown: vis(ib), text: ib ? ib.textContent : '' }, inspector: st };
  });
  const expectBadge = (id, want, cond) => record(`${tag}.${id}`, cond, { want });
  const shot = (name) => page.screenshot({ path: path.join(OUT, `${biome}-${name}-${lang}-${w}.png`) });
  const closeInsp = async () => { await page.keyboard.press('Escape'); await sleep(120); };
  const clickCell = async cell => { await closeInsp(); const p = await clientOf(cell); await page.mouse.click(p.x, p.y); await sleep(220); };
  const openRegion = async batchId => { await closeInsp(); await page.click(`.j2-card[data-batch="${batchId}"] [data-j2-inspect]`); await sleep(260); };

  // 0. Hex Stock reflects the model on its own
  let d = await dom();
  expectBadge('stock: normal card has no badge', false, d.cards[N].shown === false);
  expectBadge('stock: blighted card has the badge', true, d.cards[S].shown === true && d.cards[S].text === BADGE[lang]);

  // 1-4. each surface, in the order that tests staleness: N, S, N, S (hex), then N, S, N, S (region), then cross-switch hex<->region
  const hex = async (cell, batchId, name) => {
    await clickCell(cell); d = await dom();
    const want = stateOf(batchId);
    expectBadge(`hex overlay ${name}: source is map and batch matches`, true, d.inspector.source === 'map' && d.inspector.batchId === batchId);
    expectBadge(`hex overlay ${name}: badge ${want ? 'shown' : 'hidden'}${want ? ' with localized text' : ''}`, want, d.overlay.open && d.overlay.shown === want && (!want || d.overlay.text === BADGE[lang]));
    expectBadge(`hex overlay ${name}: agrees with Hex Stock card`, want, d.cards[batchId].shown === want);
  };
  const region = async (batchId, name) => {
    await openRegion(batchId); d = await dom();
    const want = stateOf(batchId);
    expectBadge(`region overlay ${name}: source is card and batch matches`, true, d.inspector.source === 'card' && d.inspector.batchId === batchId);
    expectBadge(`region overlay ${name}: badge ${want ? 'shown' : 'hidden'}${want ? ' with localized text' : ''}`, want, d.overlay.open && d.overlay.shown === want && (!want || d.overlay.text === BADGE[lang]));
    expectBadge(`region overlay ${name}: agrees with Hex Stock card`, want, d.cards[batchId].shown === want);
  };

  await hex(at(0, 0), N, 'normal'); await shot('normal-hex');
  await hex(at(0, 1), S, 'shadowblighted'); await shot('shadowblighted-hex');
  await hex(at(1, 0), N, 'normal (again, stale check)');
  await hex(at(1, 1), S, 'shadowblighted (again)');
  await region(N, 'normal'); await shot('normal-region');
  await region(S, 'shadowblighted'); await shot('shadowblighted-region');
  await region(N, 'normal (again, stale check)');
  // switching inside an already-open overlay without closing it first (the strictest stale-badge case)
  await clickCell(at(0, 1)); await sleep(100);
  { const p = await clientOf(at(0, 0)); await page.mouse.click(p.x, p.y); await sleep(220); d = await dom();
    expectBadge('hex overlay: S -> N with the overlay left open drops the badge', false, d.inspector.batchId === N && d.overlay.shown === false); }
  { const p = await clientOf(at(0, 1)); await page.mouse.click(p.x, p.y); await sleep(220); d = await dom();
    expectBadge('hex overlay: N -> S with the overlay left open raises the badge', true, d.inspector.batchId === S && d.overlay.shown === true && d.overlay.text === BADGE[lang]); }
  await page.click(`.j2-card[data-batch="${N}"] [data-j2-inspect]`); await sleep(260); d = await dom();
  expectBadge('card inspect: hex overlay (S) -> region overlay (N) drops the badge', false, d.inspector.source === 'card' && d.inspector.batchId === N && d.overlay.shown === false);

  // The map is untouched by all of this: nothing but the two placed regions in the saved document.
  const after = await docNow();
  record(`${tag}.document: viewing never mutates habitat flags`, after.batches.find(b => b.id === N).habitat.blighted === false && after.batches.find(b => b.id === S).habitat.blighted === true, null);
  record(`${tag}.no page errors`, errors.length === 0, errors);
  await context.close();
}

(async () => {
  const { server, port } = await serve(ROOT);
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ channel: 'chrome' })   /* the installed Google Chrome; no browser download */;
  try {
    for (const vp of VIEWPORTS) for (const lang of LANGS) for (const biome of BIOMES) {
      try { await run(browser, base, lang, vp, biome); } catch (e) { record(`${biome}.${lang}.${vp[0]}.run`, false, e.message.split('\n')[0]); }
    }
  } finally { await browser.close(); server.close(); }
  console.log(`\n${passes} passed, ${failures} failed — screenshots in ${path.relative(ROOT, OUT)}`);
  process.exit(failures ? 1 : 0);
})();
