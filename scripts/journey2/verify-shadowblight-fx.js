#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — scripts/journey2/verify-shadowblight-fx.js
   Dev-only real-browser check of the Shadowblight FX on the production Journey (PD-072): living Hybrid shadows on Shadowblighted land, torn
   holes onto the screen-locked Nebula on Fully Shadowblighted land, X / skull glyphs only in print.

   Fixture rule (as in verify-shadowblight-state.js): the campaign is built through the MODEL — real `createBatch` / `place` / `setShadowMarks` /
   `setCellsRevealed` / `setSoulEchoes` / `setDestroyedSanctuaries` commands dispatched through Journey2View.debugApi() — never by editing the DOM.
   It holds a 1-hex, a 6-hex and a 26-hex Shadowblighted region, two Shadowblighted regions that touch, a 1-hex and a 9-hex Fully Shadowblighted
   region, Shadowblighted land beside a tear, a tear over a printed sanctuary icon, separate tears, two X marks walked off their region, a Soul
   Echo and a destroyed sanctuary; part of it stays under Fog of War.

   Usage: node scripts/journey2/verify-shadowblight-fx.js [--out <dir>] [--bench] [--shots] [--checks] [--label <name>]
     (no mode flag = all three). Writes <out>/<label>-bench.json and PNGs. Exit code 1 when any check fails.
   Fresh browser contexts on a private static server: the owner's browser storage is never touched.
   Set J2_BROWSER_CHANNEL=chrome to use an installed Chrome (real GPU); the default Playwright Chromium may render WebGL in software.
   ============================================================ */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const Geo = require('../../js/journey2-geometry.js');
const Model = require('../../js/journey2-model.js');

const ROOT = path.join(__dirname, '..', '..');
const arg = n => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const has = n => process.argv.includes(n);
const OUT = path.resolve(arg('--out') || path.join(os.tmpdir(), 'j2-shadowblight-fx'));
const LABEL = arg('--label') || 'run';
const ALL = !has('--bench') && !has('--shots') && !has('--checks');
fs.mkdirSync(OUT, { recursive: true });

const template = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'map-template.json'), 'utf8'));
const anchorsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'map-anchors.json'), 'utf8'));
const ctx = Model.createContext(template, anchorsDoc), grid = ctx.grid;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
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
function record(id, ok, detail) { if (ok) passes++; else failures++; console.log((ok ? 'PASS ' : 'FAIL ') + id + (ok || detail === undefined ? '' : '  ' + JSON.stringify(detail))); }

/* ---------------- the fixture, planned and validated in Node first ---------------- */

function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const nb = id => { const c = Geo.parseCellId(id); return Geo.NEIGHBOR_DELTAS.map(d => Geo.cellId(c.q + d.dq, c.r + d.dr)); };
const markerCells = new Set(anchorsDoc.anchors.map(a => a.cellId).filter(Boolean));   // a tile is never placed on a printed marker's own hex
const placeable = id => { const c = Geo.parseCellId(id); return ctx.policy(c.q, c.r).ok && !markerCells.has(id); };
function grow(start, n, seed, used) {
  const R = rng(seed);
  if (used.has(start) || !placeable(start)) {                     // the nearest free placeable cell (breadth-first): the planned layouts stay stable when one start is taken
    const seen = new Set([start]); let ring = [start], found = null;
    while (!found && ring.length) { const next = []; for (const c of ring) for (const m of nb(c)) if (!seen.has(m)) { seen.add(m); if (!used.has(m) && placeable(m)) { found = found || m; } next.push(m); } ring = next; }
    start = found;
  }
  const set = new Set([start]);
  while (set.size < n) {
    const cand = new Map();
    for (const id of set) for (const m of nb(id)) if (!set.has(m) && !used.has(m) && placeable(m)) cand.set(m, (cand.get(m) || 0) + 1);
    if (!cand.size) break;
    let tot = 0; for (const w of cand.values()) tot += w * w * w;
    let x = R() * tot;
    for (const [id, w] of cand) { x -= w * w * w; if (x <= 0) { set.add(id); break; } }
  }
  for (const id of set) used.add(id);
  return [...set];
}
/** The sanctuary nearest a world point that sits on a placeable cell. */
function sanctuaryNear(x, y, skip) {
  return anchorsDoc.anchors.filter(a => a.kind === 'sanctuary' && a.cellId && !(skip || []).includes(a.stableId))
    .sort((a, b) => Math.hypot(a.worldPixelAnchor[0] - x, a.worldPixelAnchor[1] - y) - Math.hypot(b.worldPixelAnchor[0] - x, b.worldPixelAnchor[1] - y))[0];
}

function planFixture() {
  const used = new Set(), R = [];
  const add = (key, kind, biome, start, n, seed) => { R.push({ key, kind, biome, cells: grow(start, n, seed, used) }); };
  add('tearBig', 'overtaken', null, '41,1', 9, 21);         // a large tear, surrounded by corruption
  add('blightA', 'blighted', 'forest', '42,-1', 14, 22);    // two Shadowblighted regions that touch each other and the tear
  add('blightB', 'blighted', 'mountain', '39,3', 11, 23);
  add('normal1', 'normal', 'grassland', '45,-2', 8, 24);
  add('normal2', 'normal', 'aquatic', '37,1', 6, 25);
  add('blight6', 'blighted', 'drylands', '50,4', 6, 26);    // six connected
  add('tearOne', 'overtaken', null, '48,7', 1, 27);         // a single-hex tear
  add('tearMid', 'overtaken', null, '53,-3', 7, 28);        // a separate tear
  add('normal3', 'normal', 'mountain', '51,-6', 10, 29);
  add('normal4', 'normal', 'forest', '46,4', 8, 30);
  add('blightOne', 'blighted', 'rolling', '35,7', 1, 31);   // a single Shadowblighted hex
  add('normal5', 'normal', 'tropical', '44,8', 6, 32);
  add('blightBig', 'blighted', 'forest', '57,3', 26, 33);   // a large region
  // a tear hugging a printed sanctuary (its icon box overhangs the neighbouring hexes): the icon must stay on parchment, never fall into the void
  const c0 = grid.cellCenter(46, 0), iconS = anchorsDoc.anchors.filter(a => a.kind === 'sanctuary' && a.cellId && nb(a.cellId).some(n => placeable(n) && !used.has(n)))
    .sort((a, b) => Math.hypot(a.worldPixelAnchor[0] - c0[0], a.worldPixelAnchor[1] - c0[1]) - Math.hypot(b.worldPixelAnchor[0] - c0[0], b.worldPixelAnchor[1] - c0[1]))[0];
  add('tearIcon', 'overtaken', null, nb(iconS.cellId).find(n => placeable(n) && !used.has(n)), 4, 34);
  // a Soul Echo and a destroyed sanctuary near the action, never the same icon, never the tear's icon
  const echo = sanctuaryNear(c0[0] - 200, c0[1] + 150, [iconS.stableId]), ruin = sanctuaryNear(c0[0] + 250, c0[1] + 250, [iconS.stableId, echo.stableId]);
  return { regions: R, iconSanctuary: iconS.stableId, echo: echo.stableId, ruin: ruin.stableId };
}

/** Builds the command list and replays it in Node (Model.apply) so the browser receives only commands known to succeed. */
function buildCommands(plan) {
  let doc = Model.emptyDocument(ctx, '2026-10-19T12:00:00.000Z');
  const cmds = [], at = '2026-10-19T12:00:00.000Z';
  plan.regions.forEach((r, i) => {
    const id = 'fx' + i + r.key;
    const region = { habitat: { biome: r.biome || 'forest', blighted: r.kind !== 'normal', overtaken: r.kind === 'overtaken', source: 'rolled', rolls: [r.kind === 'normal' ? 9 : 1] }, terrain: { value: 2, source: 'rolled' }, size: r.cells.length, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 7 };
    cmds.push({ type: 'createBatch', batch: Model.batchFromRegion(region, { id, createdAt: at }), at });
    cmds.push({ type: 'place', batchId: id, tiles: r.cells.map((c, k) => ({ id: id + 't' + k, cell: c })), allowDetached: true, at });
    r.batchId = id;
  });
  if (doc) for (const c of cmds) { const res = Model.apply(doc, c, ctx); if (!res.ok) throw new Error('fixture command failed in Node: ' + c.type + ' ' + JSON.stringify(res.error || res)); doc = res.doc; }
  // two X marks walk off blightB onto open ground (Locate '+', PD-041): its two edge tiles nearest the east are suppressed, two free cells added
  const B = plan.regions.find(r => r.key === 'blightB'), occupied = new Set(plan.regions.flatMap(r => r.cells));
  const edge = B.cells.filter(c => nb(c).some(n => !occupied.has(n) && placeable(n))).sort((a, b) => Geo.parseCellId(b).q - Geo.parseCellId(a).q).slice(0, 2);
  const added = [];
  for (const c of edge) { const free = nb(c).filter(n => !occupied.has(n) && placeable(n) && !added.includes(n)); let far = free[0]; for (const f of nb(far)) if (!occupied.has(f) && placeable(f) && !added.includes(f) && !nb(f).some(x => B.cells.includes(x))) { far = f; break; } added.push(far); }
  cmds.push({ type: 'setShadowMarks', added: added.slice().sort(Model.compareCellKeys), suppressed: edge.slice().sort(Model.compareCellKeys), at });
  cmds.push({ type: 'setSoulEchoes', anchorIds: [plan.echo], at });
  cmds.push({ type: 'setDestroyedSanctuaries', anchorIds: [plan.ruin], at });
  // Fog of War: everything revealed except all of blightBig's eastern half, all of tearMid, and a ring of open ground; the walked marks stay revealed
  const hidden = new Set(plan.regions.find(r => r.key === 'tearMid').cells);
  const big = plan.regions.find(r => r.key === 'blightBig').cells, qMid = big.map(c => Geo.parseCellId(c).q).sort((a, b) => a - b)[Math.floor(big.length / 2)];
  for (const c of big) if (Geo.parseCellId(c).q > qMid) hidden.add(c);
  const reveal = [];
  for (const r of plan.regions) for (const c of r.cells) if (!hidden.has(c)) { reveal.push(c); for (const n of nb(c)) if (!hidden.has(n) && placeable(n)) reveal.push(n); }
  for (const c of added) reveal.push(c, ...nb(c).filter(placeable));
  cmds.push({ type: 'setCellsRevealed', cellKeys: Array.from(new Set(reveal)).filter(c => !hidden.has(c)), revealed: true, at });
  return { cmds, hidden: [...hidden], marksAdded: added, marksSuppressed: edge };
}

/* ---------------- browser helpers ---------------- */

async function openJourney(browser, base, opts) {
  const context = await browser.newContext(Object.assign({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'en-US' }, opts || {}));
  await context.addInitScript(() => { try { if (!sessionStorage.getItem('__j2_init')) { sessionStorage.setItem('__j2_init', '1'); localStorage.setItem('dhcodex_lang', JSON.stringify('en')); } } catch (e) { /* none */ } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + '#/journey');
  await page.waitForSelector('.j2-viewport', { timeout: 60000 });
  await page.waitForFunction(() => window.Journey2View && Journey2View.debugApi && Journey2View.debugApi(), null, { timeout: 60000 });
  await sleep(500);
  return { context, page, errors };
}
async function loadFixture(page, fx) {
  for (const c of fx.cmds) {
    const r = await page.evaluate(cmd => Journey2View.debugApi().dispatch(cmd), c);
    if (!r || !r.ok) throw new Error('fixture command failed in browser: ' + c.type + ' ' + JSON.stringify(r && r.error));
  }
  await sleep(400);
}
/** Puts `cell` at the viewport centre at `scale` through the view's own camera API (never the stored camera format). */
async function focus(page, cell, scale) {
  await page.evaluate(([cell, s]) => {
    const api = Journey2View.debugApi(), r = document.querySelector('.j2-viewport').getBoundingClientRect();
    api.setCamera({ scale: s, tx: 0, ty: 0 });
    const p = api.cellToClient(cell);                                     // with tx = ty = 0 this is the cell's world point times s (+ the viewport origin)
    api.setCamera({ scale: s, tx: r.width / 2 - (p.x - r.left), ty: r.height / 2 - (p.y - r.top) });
  }, [cell, scale]);
  await sleep(450);
}

/** rAF-interval sampler while a scripted camera runs through the view's own setCamera (the same path a drag takes). */
async function benchPhase(page, ms, kind) {
  return page.evaluate(([ms, kind]) => new Promise(res => {
    const api = Journey2View.debugApi(), r = document.querySelector('.j2-viewport').getBoundingClientRect();
    const iv = []; let t0 = 0, prev = 0;
    const cam0 = window.__j2cam0;
    function step(now) {
      if (!t0) { t0 = now; prev = now; } else { iv.push(now - prev); prev = now; }
      const u = (now - t0) / ms;
      if (kind === 'pan') api.setCamera({ scale: cam0.scale, tx: cam0.tx + 260 * Math.sin(u * Math.PI * 4), ty: cam0.ty + 160 * Math.sin(u * Math.PI * 6) });
      if (kind === 'zoom') { const s = cam0.scale * (0.6 + 0.9 * (0.5 - 0.5 * Math.cos(u * Math.PI * 4))), cx = r.width / 2, cy = r.height / 2; api.setCamera({ scale: s, tx: cx - (cx - cam0.tx) * s / cam0.scale, ty: cy - (cy - cam0.ty) * s / cam0.scale }); }
      if (now - t0 < ms) requestAnimationFrame(step);
      else {
        api.setCamera(cam0);
        const s = iv.slice().sort((a, b) => a - b), avg = iv.reduce((a, b) => a + b, 0) / iv.length;
        const fx = window.Journey2ShadowblightFx && window.__j2fxStats ? window.__j2fxStats() : null;
        res({ kind, fps: +(1000 / avg).toFixed(1), avg: +avg.toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), max: +s[s.length - 1].toFixed(1), over50: iv.filter(v => v > 50).length,
          heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, fx });
      }
    }
    requestAnimationFrame(step);
  }), [ms, kind]);
}
async function bench(page, label, cell, scale) {
  await focus(page, cell, scale);
  await page.evaluate(() => { const st = Journey2View.debugState(); window.__j2cam0 = Object.assign({}, st.camera); });
  const out = [];
  for (const [k, ms] of [['idle', 4000], ['pan', 6000], ['zoom', 6000]]) { out.push(Object.assign({ scene: label }, await benchPhase(page, ms, k))); await sleep(600); }
  return out;
}


/* ---------------- checks (production, real browser) ---------------- */

/** In-page: every non-transparent shadow pixel mapped back to its cell (the canvases are in world px boxes). Returns { cells: {id: n}, total }. */
const shadowPixelCells = page => page.evaluate(async () => {
  if (!window.__j2grid) window.__j2grid = Journey2Geometry.createGrid((await (await fetch('data/journey2/map-template.json')).json()).grid);
  const g = window.__j2grid, out = {}; let total = 0;
  for (const fo of document.querySelectorAll('[data-j2-g="blight"] foreignObject')) {
    const x0 = +fo.getAttribute('x'), y0 = +fo.getAttribute('y'), w = +fo.getAttribute('width'), h = +fo.getAttribute('height'), cv = fo.querySelector('canvas');
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    for (let j = 0; j < cv.height; j++) for (let i = 0; i < cv.width; i++) {
      if (d[(j * cv.width + i) * 4 + 3] < 2) continue;
      const c = g.worldToCell(x0 + (i + 0.5) / cv.width * w, y0 + (j + 0.5) / cv.height * h), id = c.q + ',' + c.r;
      out[id] = (out[id] || 0) + 1; total++;
    }
  }
  return { cells: out, total };
});
const sbState = page => page.evaluate(() => Journey2View.debugState().shadowFx);
const lumAt = async (page, pt, r) => { const b = await page.screenshot({ clip: { x: pt.x - r, y: pt.y - r, width: 2 * r, height: 2 * r } }); const { data, info } = await require('sharp')(b).raw().toBuffer({ resolveWithObject: true }); let s = 0; for (let i = 0; i < data.length; i += info.channels) s += (data[i] + data[i + 1] + data[i + 2]) / 3; return s / (data.length / info.channels); };
const patchAt = async (page, pt, r) => { const b = await page.screenshot({ clip: { x: pt.x - r, y: pt.y - r, width: 2 * r, height: 2 * r } }); return (await require('sharp')(b).raw().toBuffer()); };
const maxDiff = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };

async function checks(browser, base, plan, fx, page) {
  const R = k => plan.regions.find(r => r.key === k);
  const Fx = require('../../js/journey2-shadowblight-fx.js');
  const tearBig = new Set(R('tearBig').cells), overtaken = new Set(plan.regions.filter(r => r.kind === 'overtaken').flatMap(r => r.cells));
  const interior = [...tearBig].sort((a, b) => nb(b).filter(n => tearBig.has(n)).length - nb(a).filter(n => tearBig.has(n)).length)[0];

  // C1 — the FX draw on the GM map and replace the glyphs there
  const st = await sbState(page);
  const docNow = await page.evaluate(() => Journey2View.debugApi().document());
  const expected = Fx.cellsFromDocument(docNow, Model);
  record('C1 GM: FX active on WebGL with the expected areas and tears', !!st && /^webgl/.test(st.backend) && st.areas > 0 && st.holes > 0 && st.cells.blighted === expected.blighted.length && st.cells.overtaken === expected.overtaken.length, st);
  const dom = await page.evaluate(() => ({ x: document.querySelectorAll('[data-j2-g="tiles"] .j2-tile-blight').length, skull: [...document.querySelectorAll('[data-j2-g="tiles"] image')].filter(i => /fully-shadowblighted/.test(i.getAttribute('href'))).length,
    mask: getComputedStyle(document.querySelector('[data-j2-ground]')).maskImage || getComputedStyle(document.querySelector('[data-j2-ground]')).webkitMaskImage, sbfx: document.querySelector('.j2').hasAttribute('data-sbfx') }));
  record('C1 GM: no X and no skull glyph on screen; the ground carries the tear mask', dom.x === 0 && dom.skull === 0 && /data:image\/svg/.test(dom.mask) && dom.sbfx, { x: dom.x, skull: dom.skull, mask: String(dom.mask).slice(0, 30), sbfx: dom.sbfx });

  // C2 / C3 — shadow follows the marks, never enters a tear, never leaves its cells
  await focus(page, R('blightA').cells[0], 0.6); await sleep(900);
  let px = await shadowPixelCells(page);
  const pxCells = Object.keys(px.cells), allowed = new Set(expected.blighted);
  record('C3 GM: no shadow pixel inside a Fully Shadowblighted cell', pxCells.every(c => !overtaken.has(c)), pxCells.filter(c => overtaken.has(c)));
  record('C3 GM: every shadow pixel lies on a Shadowblighted cell or a current X', pxCells.every(c => allowed.has(c)), pxCells.filter(c => !allowed.has(c)).slice(0, 5));
  record('C2 GM: the walked X marks carry their shadow onto open ground', fx.marksAdded.every(c => px.cells[c] > 50), fx.marksAdded.map(c => [c, px.cells[c] || 0]));

  // C4 — the Nebula is screen-locked: inside a tear the void does not change under pans and zooms, the map beside it does
  await focus(page, interior, 2); await sleep(900);
  const ctr = await page.evaluate(c => Journey2View.debugApi().cellToClient(c), interior);
  await page.evaluate(() => { window.__j2c0 = Object.assign({}, Journey2View.debugState().camera); });
  const vp = await page.evaluate(() => { const r = document.querySelector('.j2-viewport').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const mapPt = { x: Math.round(vp.x + vp.w - 40), y: Math.round(vp.y + vp.h / 2) };   // open map at the right edge (the side panel floats over the left)
  const v0 = await patchAt(page, { x: Math.round(ctr.x), y: Math.round(ctr.y) }, 12), m0 = await patchAt(page, mapPt, 12);
  const lock = [];
  for (const [dx, dy, k] of [[13, -9, 1], [-15, 11, 1], [0, 0, 1.06], [0, 0, 0.95]]) {
    await page.evaluate(([dx, dy, k, cx, cy]) => { const c0 = window.__j2c0, s = c0.scale * k; Journey2View.debugApi().setCamera({ scale: s, tx: cx - (cx - c0.tx) * k + dx, ty: cy - (cy - c0.ty) * k + dy }); }, [dx, dy, k, ctr.x - vp.x, ctr.y - vp.y]);
    await sleep(500);
    lock.push([maxDiff(v0, await patchAt(page, { x: Math.round(ctr.x), y: Math.round(ctr.y) }, 12)), maxDiff(m0, await patchAt(page, mapPt, 12))]);
  }
  await page.evaluate(() => Journey2View.debugApi().setCamera(window.__j2c0));
  record('C4 cosmos screen-locked: the void at a fixed screen spot is unchanged by 2 pans + 2 zooms (<= 6/255) while the map beside it changes', lock.every(l => l[0] <= 6) && lock.every(l => l[1] > 20), lock);   // <= 6/255: the artwork never moves; the faint tail of the map-anchored inner depth shading may reach the sample
  const camBefore = await page.evaluate(() => Journey2View.debugState().camera);
  await sleep(300);
  const camAfter = await page.evaluate(() => Journey2View.debugState().camera);
  record('C4 the FX never move the camera on their own', JSON.stringify(camBefore) === JSON.stringify(camAfter), [camBefore, camAfter]);

  // C12 — FX layers never take the pointer
  const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return { cls: e && (e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className), inFx: !!(e && e.closest && e.closest('[data-j2-g="blight"],[data-j2-g="tear"],[data-j2-cosmos],[data-j2-ground]')) }; }, [ctr.x, ctr.y]);
  record('C12 a click on a tear reaches the viewport, never an FX element', !hit.inFx, hit);

  // C11 — regressions on the GM map: inspectors, Return to stock + Undo, sanctuary + Echo collection, ruin fire
  await focus(page, interior, 1); await sleep(500);
  for (const key of ['tearBig', 'blightA']) {
    const cell = R(key).cells[0], pt = await page.evaluate(c => Journey2View.debugApi().cellToClient(c), cell);
    await page.mouse.click(pt.x, pt.y); await sleep(450);
    const ins = await page.evaluate(() => Journey2View.debugState().inspector);
    record('C11 a click on a ' + key + ' hex opens its Region Inspector', ins.open && ins.batchId === R(key).batchId, ins);
    await page.keyboard.press('Escape'); await sleep(250);
  }
  const normalCell = R('normal1').cells[0];
  await focus(page, normalCell, 1);
  const tilesBefore = (await page.evaluate(() => Journey2View.debugState().tiles.length));
  const npt = await page.evaluate(c => Journey2View.debugApi().cellToClient(c), normalCell);
  await page.mouse.click(npt.x, npt.y); await sleep(450);
  await page.click('[data-j2-return]'); await sleep(450);
  const tilesAfter = await page.evaluate(() => Journey2View.debugState().tiles.length);
  await page.click('[data-j2-undo]'); await sleep(450);
  const tilesUndo = await page.evaluate(() => Journey2View.debugState().tiles.length);
  record('C11 Return to stock and Undo work with the FX', tilesAfter === tilesBefore - 1 && tilesUndo === tilesBefore, [tilesBefore, tilesAfter, tilesUndo]);
  await page.keyboard.press('Escape');
  const ruin = await page.evaluate(() => { const cs = [...document.querySelectorAll('.j2-ruin2 canvas')]; let lit = 0; for (const c of cs) { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) { lit++; break; } } return { n: cs.length, lit }; });
  record('C11 the destroyed sanctuary still burns (fire + smoke canvases drawn)', ruin.n >= 2 && ruin.lit >= 2, ruin);

  // Locate '+' moves an X; the FX follow the new state (and the gameplay state is the model's, untouched by the FX)
  const xsBefore = await page.evaluate(() => Journey2View.debugApi().document().shadowMarks);
  const party = R('normal2').cells[0];
  await focus(page, party, 0.8);
  await page.click('[data-j2-echo-locate]'); await sleep(300);
  const ppt = await page.evaluate(c => Journey2View.debugApi().cellToClient(c), party);
  await page.mouse.click(ppt.x, ppt.y); await sleep(3200);
  let stepped = false;
  if (await page.$('[data-j2-seek-more]:not([disabled])')) { await page.click('[data-j2-seek-more]'); await sleep(600); stepped = true; }
  const xsAfter = await page.evaluate(() => Journey2View.debugApi().document().shadowMarks);
  const fxCellsNow = await page.evaluate(() => Journey2ShadowblightFx.cellsFromDocument(Journey2View.debugApi().document(), Journey2Model).blighted);
  const stNow = await sbState(page);
  record('C11 Locate "+" moves the X marks (model state) and the shadow cells follow', stepped && JSON.stringify(xsBefore) !== JSON.stringify(xsAfter) && stNow.cells.blighted === fxCellsNow.length, { stepped, before: xsBefore, after: xsAfter });
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await sleep(300);

  // (after Locate: collecting the only Echo disables Locate, by design — PD-030 points at the nearest UNCOLLECTED Echo)
  const echoPt = await page.evaluate(id => { const api = Journey2View.debugApi(); return api.sanctuaryClient(id); }, plan.echo);
  await page.evaluate(id => { const api = Journey2View.debugApi(), a = api.markers().find(m => m.id === id), r = document.querySelector('.j2-viewport').getBoundingClientRect(); const c = Journey2View.debugState().camera; api.setCamera({ scale: 1, tx: r.width / 2 - (a.rect[0] + a.rect[2] / 2), ty: r.height / 2 - (a.rect[1] + a.rect[3] / 2) }); }, plan.echo);
  await sleep(500);
  const ep = await page.evaluate(id => Journey2View.debugApi().sanctuaryClient(id), plan.echo);
  await page.mouse.click(ep.x, ep.y); await sleep(500);
  const sOpen = await page.evaluate(() => Journey2View.debugState().sanctuaryOpen);
  let collected = false;
  if (sOpen && await page.$('[data-j2-echo-collect]:not([hidden])')) { await page.click('[data-j2-echo-collect]'); await sleep(400); collected = (await page.evaluate(() => Journey2View.debugApi().document().soulEchoes.collectedAnchorIds)).includes(plan.echo); }
  record('C11 a sanctuary opens and its Soul Echo can be marked collected', !!sOpen && collected, { sOpen, collected });
  await page.keyboard.press('Escape'); await sleep(300);
  // C5 — Player Preview: projection only; hidden cells produce nothing
  await page.click('[data-j2-preview]'); await sleep(900);
  const proj = await page.evaluate(() => Journey2View.debugApi().projection());
  const pc = Fx.cellsFromProjection(proj), pAllowed = new Set(pc.blighted), hidden = new Set(fx.hidden);
  const pst = await sbState(page);
  record('C5 Preview: FX cells are exactly the projection\'s', pst && pst.cells.blighted === pc.blighted.length && pst.cells.overtaken === pc.overtaken.length, { pst: pst && pst.cells, pc: [pc.blighted.length, pc.overtaken.length] });
  record('C5 Preview: no hidden cell is a shadow or tear cell', pc.blighted.every(c => !hidden.has(c)) && pc.overtaken.every(c => !hidden.has(c)));
  await focus(page, R('blightBig').cells[0], 0.8); await sleep(900);
  px = await shadowPixelCells(page);
  record('C5 Preview: every shadow pixel is on a revealed X cell (none on the hidden half of the large region)', Object.keys(px.cells).every(c => pAllowed.has(c) && !hidden.has(c)), Object.keys(px.cells).filter(c => !pAllowed.has(c)).slice(0, 5));
  const tm = R('tearMid').cells[0];
  await focus(page, tm, 2); await sleep(900);
  const tmPt = await page.evaluate(c => Journey2View.debugApi().cellToClient(c), tm);
  const tmLum = await lumAt(page, tmPt, 10);
  record('C5 Preview: a hidden tear shows no void (fogged parchment, not the cosmos)', tmLum > 90, { lum: tmLum });
  await page.screenshot({ path: path.join(OUT, LABEL + '-check-preview-hidden-tear-200.png') });

  // C7 — print: glyphs back, no FX
  await page.click('[data-j2-print-open]');
  await page.waitForSelector('.j2-print-page', { timeout: 30000 }); await sleep(1500);
  const pr = await page.evaluate(() => { const root = document.querySelector('.j2-printpreview') || document.querySelector('.j2-print-root'); const html = root.innerHTML;
    return { pages: root.querySelectorAll('.j2-print-page').length, x: root.querySelectorAll('.j2-tile-blight').length, skulls: [...root.querySelectorAll('image')].filter(i => /fully-shadowblighted/.test(i.getAttribute('href'))).length,
      fx: root.querySelectorAll('canvas, foreignObject, [data-j2-cosmos], .j2-sbfx-worn, .j2-sbfx-patch').length, nebula: /void-nebula/.test(html), paused: Journey2View.debugState().shadowFx.paused }; });
  record('C7 Print: two pages with X and skull glyphs, no FX layer, no Nebula; the screen FX are paused behind it', pr.pages === 2 && pr.x > 0 && pr.skulls > 0 && pr.fx === 0 && !pr.nebula && pr.paused, pr);
  await page.screenshot({ path: path.join(OUT, LABEL + '-check-print-preview.png') });
  await page.keyboard.press('Escape'); await sleep(700);
  const afterPrint = await sbState(page);
  record('C7 closing the Print Preview resumes the FX and leaves the map as it was', afterPrint && !afterPrint.paused && afterPrint.holes === pst.holes, afterPrint);

  // C6 — the player link: same camera with and without the FX, FX from the link's projection, phone width
  await page.click('[data-j2-share-link]'); await sleep(900);
  const link = await page.evaluate(() => document.querySelector('[data-j2-share-url]').value);
  record('C6 Preview produced a player link', /#\/map\//.test(link), link.slice(0, 60));
  const openLink = async block => {
    const ctxP = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    if (block) await ctxP.route(/journey2-shadowblight-fx\.js/, r => r.abort());
    const p = await ctxP.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(link.replace(/^https?:\/\/[^/]+\//, base)); await p.waitForSelector('.j2-viewport', { timeout: 60000 }); await sleep(2200);
    const r = await p.evaluate(() => { const s = Journey2View.debugState(); return { cam: s.camera, fx: s.shadowFx, x: document.querySelectorAll('[data-j2-g="player"] .j2-tile-blight').length, skull: [...document.querySelectorAll('[data-j2-g="player"] image')].filter(i => /fully-shadowblighted/.test(i.getAttribute('href'))).length }; });
    if (!block) await p.screenshot({ path: path.join(OUT, LABEL + '-check-player-link-phone.png') });
    await ctxP.close(); return Object.assign(r, { errs });
  };
  const withFx = await openLink(false), noFx = await openLink(true);
  record('C6 player link: the camera is the GM\'s, identical with and without the FX', JSON.stringify(withFx.cam) === JSON.stringify(noFx.cam), [withFx.cam, noFx.cam]);
  record('C6 player link (phone): FX from the link only — same cells as Player Preview, no X / skull', withFx.fx && withFx.fx.cells.blighted === pc.blighted.length && withFx.fx.cells.overtaken === pc.overtaken.length && withFx.x === 0 && withFx.skull === 0 && !withFx.errs.length, { fx: withFx.fx && withFx.fx.cells, x: withFx.x, skull: withFx.skull, errs: withFx.errs });
  record('C10 without the FX module: no errors, and the X / skull glyphs come back', !noFx.fx && noFx.x > 0 && noFx.skull > 0 && !noFx.errs.length, { x: noFx.x, skull: noFx.skull, errs: noFx.errs });
  await page.click('[data-j2-preview-back]'); await sleep(600);

  // save / load and camera restoration: a reload returns the same document, camera and FX
  await focus(page, R('blightA').cells[0], 1.25); await sleep(1500);
  const docA = await page.evaluate(() => JSON.stringify(Journey2View.debugApi().document())), camA = await page.evaluate(() => Journey2View.debugState().camera);
  await page.reload(); await page.waitForSelector('.j2-viewport'); await page.waitForFunction(() => Journey2View.debugApi && Journey2View.debugApi()); await sleep(1500);
  const docB = await page.evaluate(() => JSON.stringify(Journey2View.debugApi().document())), camB = await page.evaluate(() => Journey2View.debugState().camera), stB = await sbState(page);
  const near = (a, b) => Math.abs(a.scale - b.scale) < 1e-6 && Math.abs(a.tx - b.tx) < 1.5 && Math.abs(a.ty - b.ty) < 1.5;
  record('C11 reload: same saved document, camera restored, FX rebuilt', docA === docB && near(camA, camB) && stB && stB.holes > 0, { sameDoc: docA === docB, camA, camB });
}

/* ---------------- run ---------------- */

(async () => {
  const plan = planFixture(), fx = buildCommands(plan);
  const { server, port } = await serve(ROOT), base = 'http://127.0.0.1:' + port + '/';
  const browser = await chromium.launch({ channel: process.env.J2_BROWSER_CHANNEL || undefined, args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
  const report = { label: LABEL, when: new Date().toISOString(), browser: browser.version(), bench: [], gpu: null };
  try {
    const { context, page, errors } = await openJourney(browser, base);
    report.gpu = await page.evaluate(() => { const g = document.createElement('canvas').getContext('webgl'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return g ? (e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'webgl') : 'no webgl'; });
    await loadFixture(page, fx);
    const R = k => plan.regions.find(r => r.key === k);
    if (ALL || has('--bench')) {
      report.bench.push(...await bench(page, 'GM mixed 100%', R('blightA').cells[0], 1));
      report.bench.push(...await bench(page, 'GM mixed 50%', R('blightA').cells[0], 0.5));
      report.bench.push(...await bench(page, 'GM large region 200%', R('blightBig').cells[0], 2));
      await page.click('[data-j2-preview]'); await sleep(900);
      report.bench.push(...await bench(page, 'Player Preview 100%', R('blightA').cells[0], 1));
      await page.click('[data-j2-preview-back]'); await sleep(600);
    }
    if (ALL || has('--shots')) {
      const shot = async (name, cell, scale) => { await focus(page, cell, scale); await sleep(700); await page.screenshot({ path: path.join(OUT, LABEL + '-' + name + '.png') }); };
      await shot('gm-mixed-100', R('blightA').cells[0], 1);
      await shot('gm-mixed-50', R('blightA').cells[0], 0.5);
      await shot('gm-mixed-150', R('blightA').cells[0], 1.5);
      await shot('gm-mixed-200', R('blightA').cells[0], 2);
      await shot('gm-tear-150', R('tearBig').cells[0], 1.5);
      await shot('gm-large-200', R('blightBig').cells[0], 2);
      await shot('gm-icon-tear-200', plan.regions.find(r => r.key === 'tearIcon').cells[0], 2);
      await page.click('[data-j2-preview]'); await sleep(900);
      await shot('pp-mixed-100', R('blightA').cells[0], 1);
      await shot('pp-large-100', R('blightBig').cells[0], 1);
      await page.click('[data-j2-preview-back]'); await sleep(500);
    }
    if (ALL || has('--checks')) {
      await checks(browser, base, plan, fx, page);
      const sum = p2 => p2.evaluate(() => { let h = 0; for (const c of document.querySelectorAll('[data-j2-g="blight"] canvas')) { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 97) h = (h * 31 + d[i]) % 1000003; } return h; });
      // C8 — reduced motion: a still shadow (no frame changes), tears still there, no X / skull
      const rm = await openJourney(browser, base, { reducedMotion: 'reduce' });
      await loadFixture(rm.page, fx); await focus(rm.page, plan.regions.find(r => r.key === 'blightA').cells[0], 1); await sleep(1500);
      const h1 = await sum(rm.page); await sleep(1800); const h2 = await sum(rm.page), st = await sbState(rm.page);
      const glyphs = await rm.page.evaluate(() => document.querySelectorAll('[data-j2-g="tiles"] .j2-tile-blight').length);
      record('C8 reduced motion: the shadow is a still frame, tears stay, no X glyph', st && st.reduce && h1 === h2 && h1 !== 0 && st.holes > 0 && glyphs === 0, { reduce: st && st.reduce, h1, h2, holes: st && st.holes, glyphs });
      await rm.page.screenshot({ path: path.join(OUT, LABEL + '-check-reduced-motion.png') });
      const anim = await openJourney(browser, base);
      await loadFixture(anim.page, fx); await focus(anim.page, plan.regions.find(r => r.key === 'blightA').cells[0], 1); await sleep(1500);
      const a1 = await sum(anim.page); await sleep(1200); const a2 = await sum(anim.page);
      record('C8 (control) without reduced motion the shadow does move', a1 !== a2, { a1, a2 });
      await rm.context.close(); await anim.context.close();
    }
    report.errors = errors.slice(0, 20);
    report.fixture = { iconSanctuary: plan.iconSanctuary, echo: plan.echo, ruin: plan.ruin, marksAdded: fx.marksAdded, marksSuppressed: fx.marksSuppressed, hidden: fx.hidden.length, regions: plan.regions.map(r => ({ key: r.key, kind: r.kind, n: r.cells.length, first: r.cells[0] })) };
    await context.close();
    if (ALL || has('--checks')) {
      // C9 — no WebGL: the static CPU shadow, tears unchanged, still no X / skull
      const b2 = await chromium.launch({ channel: process.env.J2_BROWSER_CHANNEL || undefined, args: ['--disable-webgl', '--disable-3d-apis'] });
      try {
        const nw = await openJourney(b2, base);
        await loadFixture(nw.page, fx); await focus(nw.page, plan.regions.find(r => r.key === 'blightA').cells[0], 1); await sleep(1500);
        const st = await sbState(nw.page), px = await shadowPixelCells(nw.page), x = await nw.page.evaluate(() => document.querySelectorAll('[data-j2-g="tiles"] .j2-tile-blight').length);
        record('C9 no WebGL: static CPU shadow + tears, no X glyph, no page error', st && st.backend === 'cpu-still' && px.total > 1000 && st.holes > 0 && x === 0 && !nw.errors.length, { backend: st && st.backend, px: px.total, holes: st && st.holes, x, errors: nw.errors });
        await nw.page.screenshot({ path: path.join(OUT, LABEL + '-check-no-webgl.png') });
        await nw.context.close();
      } finally { await b2.close(); }
    }
  } finally {
    await browser.close(); server.close();
  }
  fs.writeFileSync(path.join(OUT, LABEL + '-bench.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ gpu: report.gpu, errors: report.errors, bench: report.bench.map(b => [b.scene, b.kind, b.fps, b.p95, b.max, b.over50, b.heapMB]) }, null, 1));
  if (failures) { console.log(failures + ' check(s) failed, ' + passes + ' passed'); process.exit(1); }
  if (passes) console.log('all ' + passes + ' checks passed');
})().catch(e => { console.error(e); process.exit(1); });
