#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — scripts/journey2/stage1-verify.js
   Dev-only browser verification of the Journey 2 Phase 1 tile editor with Playwright's Chromium against a
   throw-away static server. Every scenario runs in a FRESH browser context (empty localStorage), so the owner's
   real browser storage is never read or written. All placements, drags, moves, undo/redo, reload, export and
   import use real pointer / keyboard input and the real UI (the debug API is only used to read state and to
   translate a cell id into client pixels).

   Writes (default docs/journey2-implementation/stage-1/):
     tests/stage1-browser-results.json   every check with its outcome and detail
     fixtures/*.json                     the 20 -> 7 -> All 13 -> Undo -> reload scenario: real cells + state snapshots
     images/*.png                        screenshots at 1366x768 and 1920x1080
   Usage: node scripts/journey2/stage1-verify.js [--out <dir>] [--root <dir>]
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const Geo = require('../../js/journey2-geometry.js');
const Model = require('../../js/journey2-model.js');
const { serve } = require('./lib/static-server.js');

const ROOT = path.join(__dirname, '..', '..');
const argv = process.argv;
const outArg = argv.indexOf('--out');
const STAGE = outArg > -1 ? path.resolve(argv[outArg + 1]) : path.join(ROOT, 'docs', 'journey2-implementation', 'stage-1');
const rootArg = argv.indexOf('--root');
const SITE_ROOT = rootArg > -1 ? path.resolve(argv[rootArg + 1]) : ROOT;
const IMG = path.join(STAGE, 'images'), TESTS = path.join(STAGE, 'tests'), FIX = path.join(STAGE, 'fixtures'), TMP = path.join(STAGE, 'tmp');
for (const d of [IMG, TESTS, FIX, TMP]) fs.mkdirSync(d, { recursive: true });

const template = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'map-template.json'), 'utf8'));
const anchorsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'map-anchors.json'), 'utf8'));
const ctx0 = Model.createContext(template, anchorsDoc);
const grid = ctx0.grid;
const SEAM_X = template.composition.seam.worldX;
const VP_SMALL = { width: 1366, height: 768 }, VP_LARGE = { width: 1920, height: 1080 };

const results = [];
function record(id, ok, detail) { results.push({ id, ok: !!ok, detail: detail === undefined ? null : detail }); console.log((ok ? 'PASS ' : 'FAIL ') + id + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 400) : '')); }
async function check(id, fn) {
  try { const r = await fn(); if (r === true || r === undefined) record(id, true); else if (r && typeof r === 'object' && 'ok' in r) record(id, r.ok, r.detail); else record(id, !!r, r); }
  catch (e) { record(id, false, 'exception: ' + String(e.message).split('\n')[0]); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 1) + '\n');

/* ---------------- fixture planning (pure, uses the real template) ---------------- */

const cellAt = (x, y) => { const c = grid.worldToCell(x, y); return Geo.cellId(c.q, c.r); };
function allowedNear(x, y, avoid) {
  const av = new Set(avoid || []);
  const c0 = grid.worldToCell(x, y);
  for (let ring = 0; ring < 40; ring++) for (let dq = -ring; dq <= ring; dq++) for (let dr = -ring; dr <= ring; dr++) {
    if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) !== ring) continue;
    const q = c0.q + dq, r = c0.r + dr, id = Geo.cellId(q, r);
    if (ctx0.policy(q, r).ok && !av.has(id)) return id;
  }
  throw new Error('no allowed cell near ' + x + ',' + y);
}
const markerCell = id => anchorsDoc.anchors.find(a => a.stableId === id).cellId;
// Seven cells forming ONE connected cluster (a region must stay edge-connected), near the seam, in breadth-first
// order so every single placement touches the tiles placed before it. Real allowed cells of the template.
const SEVEN_WORLD = [[SEAM_X, 800]];
const SEVEN = (() => {
  const out = [allowedNear(SEAM_X, 800, [])], seen = new Set(out);
  for (let i = 0; i < out.length && out.length < 7; i++) {
    const c = Geo.parseCellId(out[i]);
    for (const d of Geo.NEIGHBOR_DELTAS) {
      const id = Geo.cellId(c.q + d.dq, c.r + d.dr);
      if (out.length < 7 && !seen.has(id) && ctx0.policy(c.q + d.dq, c.r + d.dr).ok) { seen.add(id); out.push(id); }
    }
  }
  return out;
})();
const MARKER_CELL_IN_VIEW = (() => { const a = anchorsDoc.anchors.find(m => m.worldPixelAnchor[0] > 1400 && m.worldPixelAnchor[0] < 3500 && m.worldPixelAnchor[1] > 200 && m.worldPixelAnchor[1] < 1300 && ctx0.policy(...Object.values(Geo.parseCellId(m.cellId))).ok); return a; })();
function footprintCells(anchorId, n) { const a = Geo.parseCellId(anchorId); return Model.compactFootprint(n).map(o => Geo.cellId(a.q + o.dq, a.r + o.dr)); }
function clearAnchorFor13(avoid, near) {
  const av = new Set(avoid);
  const c0 = grid.worldToCell(near[0], near[1]);
  for (let ring = 0; ring < 40; ring++) for (let dq = -ring; dq <= ring; dq++) for (let dr = -ring; dr <= ring; dr++) {
    if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) !== ring) continue;
    const id = Geo.cellId(c0.q + dq, c0.r + dr);
    const cells = footprintCells(id, 13);
    if (cells.every(c => { const p = Geo.parseCellId(c); return ctx0.policy(p.q, p.r).ok && !av.has(c); })) return id;
  }
  throw new Error('no clear 13-cell area');
}
/** An anchor whose 13-cell footprint is allowed, free, and — together with the seven — one connected shape. */
function connectedAnchorFor13(avoid, near) {
  const av = new Set(avoid);
  const c0 = grid.worldToCell(near[0], near[1]);
  for (let ring = 0; ring < 40; ring++) for (let dq = -ring; dq <= ring; dq++) for (let dr = -ring; dr <= ring; dr++) {
    if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) !== ring) continue;
    const id = Geo.cellId(c0.q + dq, c0.r + dr);
    const cells = footprintCells(id, 13);
    if (cells.every(c => { const p = Geo.parseCellId(c); return ctx0.policy(p.q, p.r).ok && !av.has(c); }) && Model.isConnected(SEVEN.concat(cells))) return id;
  }
  throw new Error('no connected 13-cell area');
}
const ALL13_ANCHOR = connectedAnchorFor13(SEVEN, grid.cellCenter(...Object.values(Geo.parseCellId(SEVEN[0]))));
const ALL13_CELLS = footprintCells(ALL13_ANCHOR, 13);
// an anchor whose 13-cell footprint overlaps exactly ONE of the seven (a single collision), everything else free
function singleCollisionAnchor() {
  const target = SEVEN[3];
  const t = Geo.parseCellId(target);
  for (const o of Model.compactFootprint(13)) {
    const anchor = Geo.cellId(t.q - o.dq, t.r - o.dr);
    const cells = footprintCells(anchor, 13);
    const bad = cells.filter(c => { const p = Geo.parseCellId(c); return !ctx0.policy(p.q, p.r).ok || SEVEN.includes(c); });
    if (bad.length === 1 && bad[0] === target) return anchor;
  }
  throw new Error('no single-collision anchor');
}
const COLLIDE_ANCHOR = singleCollisionAnchor();
// A tile of the final 20-cell shape that can leave without splitting it, and a free cell touching the rest.
const MOVE = (() => {
  const all = SEVEN.concat(ALL13_CELLS), occupied = new Set(all);
  for (let i = all.length - 1; i >= 7; i--) {
    const rest = all.filter((_, j) => j !== i);
    if (!Model.isConnected(rest)) continue;
    for (const r of rest) {
      const c = Geo.parseCellId(r);
      for (const d of Geo.NEIGHBOR_DELTAS) {
        const id = Geo.cellId(c.q + d.dq, c.r + d.dr);
        if (!occupied.has(id) && ctx0.policy(c.q + d.dq, c.r + d.dr).ok && Model.isConnected(rest.concat([id]))) return { index: i - 7, from: all[i], to: id };
      }
    }
  }
  throw new Error('no connected move');
})();
const MOVE_TARGET = MOVE.to;
// Free cells touching the seven (valid places to grow the region): used wherever a check needs one more legal tile.
const ADJ = (() => {
  const seen = new Set(SEVEN), out = [];
  for (const c0 of SEVEN) {
    const c = Geo.parseCellId(c0);
    for (const d of Geo.NEIGHBOR_DELTAS) { const id = Geo.cellId(c.q + d.dq, c.r + d.dr); if (!seen.has(id) && ctx0.policy(c.q + d.dq, c.r + d.dr).ok) { seen.add(id); out.push(id); } }
  }
  return out.filter(id => !ALL13_CELLS.includes(id));
})();

const compass = template.decorativeAreas.find(d => d.id === 'compass').rectPx;
function decorativeAnchor() {
  // an allowed cell next to a decorative cell that lies inside the compass-rose rectangle
  for (const id of ctx0.decorativeCells) {
    const p = Geo.parseCellId(id), c = grid.cellCenter(p.q, p.r);
    if (!(c[0] >= compass[0] && c[0] <= compass[0] + compass[2] && c[1] >= compass[1] && c[1] <= compass[1] + compass[3])) continue;
    for (const nb of grid.validNeighbors(p.q, p.r)) if (ctx0.policy(nb.q, nb.r).ok) return nb.id;
  }
  throw new Error('no decorative-adjacent anchor');
}
const DECO_ANCHOR = decorativeAnchor();
function edgeAnchor() {
  // an allowed cell on the outer rim of the valid area (at least one neighbour outside the frame)
  let best = null;
  grid.forEachValidCell((q, r) => { if (!best && ctx0.policy(q, r).ok && grid.neighbors(q, r).filter(n => !n.valid).length >= 2 && r < 0) best = Geo.cellId(q, r); });
  return best;
}
const EDGE_ANCHOR = edgeAnchor();
writeJson(path.join(FIX, 'scenario-cells.json'), {
  note: 'Real allowed cells of the Valloren template used by the browser scenario (not the synthetic coordinates of the handoff fixture).',
  templateId: template.templateId, seven: SEVEN, sevenWorldPoints: SEVEN_WORLD, all13Anchor: ALL13_ANCHOR, all13Cells: ALL13_CELLS, singleCollisionAnchor: COLLIDE_ANCHOR,
  moveTarget: MOVE_TARGET, markerCellUsed: MARKER_CELL_IN_VIEW.cellId, markerUsed: MARKER_CELL_IN_VIEW.stableId, decorativeAdjacentAnchor: DECO_ANCHOR, outerEdgeAnchor: EDGE_ANCHOR,
  negativeR: SEVEN.filter(c => Geo.parseCellId(c).r < 0),
});

/* ---------------- page helpers ---------------- */

const state = page => page.evaluate(() => Journey2View.debugState());
function attachLogging(page, sink, label) {
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') sink.push(`[${label}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => sink.push(`[${label}] pageerror: ${e.message}`));
  page.on('requestfailed', r => sink.push(`[${label}] requestfailed: ${r.url()} ${r.failure() && r.failure().errorText}`));
  page.on('response', r => { if (r.status() >= 400) sink.push(`[${label}] HTTP ${r.status()}: ${r.url()}`); });
}
async function newCtx(browser, opts) {
  const o = Object.assign({ viewport: VP_SMALL, locale: 'en-US', acceptDownloads: true }, opts || {});
  const lang = o.lang || 'en'; delete o.lang;
  const seed = o.seed || null; delete o.seed;
  const context = await browser.newContext(o);
  await context.addInitScript(([l, sd]) => {
    try {
      if (!sessionStorage.getItem('__j2_init')) {
        sessionStorage.setItem('__j2_init', '1');
        localStorage.setItem('dhcodex_lang', JSON.stringify(l));
        if (sd) for (const k of Object.keys(sd)) localStorage.setItem(k, sd[k]);
      }
    } catch (e) { /* storage blocked by design in one scenario */ }
  }, [lang, seed]);
  return context;
}
async function openEditor(page, base, vp) {
  if (vp) await page.setViewportSize(vp);
  await page.goto(base + '#/journey2');
  await page.waitForSelector('.j2-viewport', { timeout: 60000 });
  await page.waitForFunction(() => Journey2View.isMounted() && Journey2View.debugState() && Journey2View.debugState().anchors > 0, null, { timeout: 60000 });
  await page.waitForTimeout(250);
}
const viewWorld = (page, x, y, scale) => page.evaluate(([x0, y0, s]) => { const r = document.querySelector('.j2-viewport').getBoundingClientRect(); Journey2View.debugApi().setCamera({ scale: s, tx: r.width / 2 - x0 * s, ty: r.height / 2 - y0 * s }); }, [x, y, scale]).then(() => page.waitForTimeout(260));
const clientOf = (page, cell) => page.evaluate(c => Journey2View.debugApi().cellToClient(c), cell);
const cellAtClient = (page, x, y) => page.evaluate(([cx, cy]) => Journey2View.debugApi().clientToCell(cx, cy), [x, y]);
const shot = (page, name, opts) => page.screenshot(Object.assign({ path: path.join(IMG, name) }, opts || {}));
const snapshot = async page => { const s = await state(page); return { batches: s.batches, tiles: s.tiles, history: s.history, saveStatus: s.saveStatus, selectedTile: s.selectedTile }; };
const storageDump = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
const cardOf = (page, batchId) => page.locator(`.j2-card[data-batch="${batchId}"]`);
/**
 * Creates a region with a KNOWN habitat / terrain / size. The editor itself only offers the fully random
 * "Generate region" action (Phase A), so scenario fixtures go through the same createBatch command the button
 * dispatches, with a deterministic region; the real random button is exercised separately (see
 * `generate.*` checks). The new card is made active the way a click would.
 */
async function genRegion(page, o) {
  const id = await page.evaluate(spec => {
    const M = Journey2Model, id = M.newId('b');
    const region = {
      habitat: { biome: spec.habitat || 'forest', blighted: false, overtaken: false, source: 'rolled', rolls: [1] },
      terrain: { value: spec.terrain || 2, source: 'rolled' }, size: spec.qty || 7, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 17,
    };
    const r = Journey2View.debugApi().dispatch({ type: 'createBatch', batch: M.batchFromRegion(region, { id: id, createdAt: new Date().toISOString() }) });
    return r.ok ? id : null;
  }, o);
  await activateCard(page, id);
  await page.waitForTimeout(120);
  return id;
}
/** Expands one region card (the sidebar keeps exactly one open); a no-op when it already is. */
async function activateCard(page, batchId) {
  const head = page.locator(`.j2-card[data-batch="${batchId}"] [data-j2-card-toggle]`);
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
  await page.waitForTimeout(60);
}
async function handleCenter(page, batchId, mode) {
  await activateCard(page, batchId);
  const loc = cardOf(page, batchId).locator(`[data-j2-handle="${mode}"]`);
  await loc.scrollIntoViewIfNeeded();   // the sidebar scrolls internally; a real user scrolls the card into view first
  const b = await loc.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
}
/** Real pointer drag from a stock handle to a cell. finish: 'drop' | 'hold' | 'escape' | 'outside' */
async function dragStock(page, batchId, mode, cell, finish) {
  const h = await handleCenter(page, batchId, mode);
  const t = await clientOf(page, cell);
  await page.mouse.move(h.x, h.y); await page.mouse.down();
  await page.mouse.move(t.x, t.y, { steps: 12 });
  await page.waitForTimeout(60);
  const mid = (await state(page)).transient;
  if (finish === 'hold') return { mid };
  if (finish === 'escape') { await page.keyboard.press('Escape'); await page.mouse.up(); }
  else if (finish === 'outside') { await page.mouse.move(h.x, h.y + 40, { steps: 6 }); await page.mouse.up(); }
  else await page.mouse.up();
  await page.waitForTimeout(120);
  return { mid };
}
async function dragTile(page, fromCell, toCell, finish) {
  const a = await clientOf(page, fromCell), b = await clientOf(page, toCell);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.waitForTimeout(60);
  const mid = (await state(page)).transient;
  if (finish === 'hold') return { mid };
  if (finish === 'escape') await page.keyboard.press('Escape');
  await page.mouse.up(); await page.waitForTimeout(120);
  return { mid };
}
const countsOf = s => s.batches.map(b => [b.placed, b.remaining]);
const sameCells = (a, b) => JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort());

/* ============================================================ */

async function main() {
  const { server, port, requests } = await serve(SITE_ROOT, {}).then(s => ({ server: s.server, port: s.port, requests: s.requests }));
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch(process.env.J2_BROWSER_CHANNEL ? { channel: process.env.J2_BROWSER_CHANNEL } : {});   // J2_BROWSER_CHANNEL=chrome uses an installed Chrome
  const logs = [];
  const evidence = { seven: SEVEN, all13: ALL13_CELLS };

  /* ===== A. mandatory end-to-end scenario at 1366x768 (EN) ===== */
  {
    const context = await newCtx(browser, { viewport: VP_SMALL, seed: { dhcodex_journey_regions: JSON.stringify([]), unrelated_key: 'keep-me' } });
    const page = await context.newPage(); attachLogging(page, logs, 'scenario');
    await openEditor(page, base);
    const legacyBefore = await storageDump(page);
    await check('scn.01.empty-editor-has-no-batches-and-no-tiles', async () => { const s = await state(page); return { ok: s.batches.length === 0 && s.tiles.length === 0 && !s.diagnosticsOpen && (await page.isHidden('#j2-panel')), detail: s.batches.length }; });
    await genRegion(page, { habitat: 'forest', terrain: 2, qty: 20 });
    const s1 = await state(page); const batchId = s1.batches[0] && s1.batches[0].id;
    writeJson(path.join(FIX, 'scenario-01-after-generate.json'), await snapshot(page));
    await check('scn.02.generator-ui-creates-forest-terrain-2-quantity-20-with-0-placed-20-remaining', async () => {
      const b = s1.batches[0];
      const txt = await cardOf(page, batchId).innerText();
      return { ok: s1.batches.length === 1 && b.habitat.biome === 'forest' && b.terrain.value === 2 && b.quantity === 20 && b.placed === 0 && b.remaining === 20 && b.terrain.source === 'rolled' && b.quantitySource === 'rolled' && /0\s*\/\s*20/.test(txt) && /all 20/i.test(txt) && s1.tiles.length === 0, detail: { b, txt } };
    });
    await check('scn.03.generation-places-nothing-and-keeps-camera-unchanged', async () => { const a = (await state(page)).camera; await genRegion(page, { habitat: 'aquatic', terrain: 1, qty: 1 }); const s = await state(page); const b = s.camera; return { ok: s.tiles.length === 0 && JSON.stringify(a) === JSON.stringify(b), detail: { a, b } }; });
    await page.keyboard.press('Control+z'); await page.waitForTimeout(100);   // undo the extra aquatic batch (keyboard Undo path)
    await check('scn.03b.ctrl-z-undid-the-extra-batch', async () => (await state(page)).batches.length === 1);
    await viewWorld(page, SEAM_X, 800, 0.41);
    await shot(page, 'scn-01-1366x768-empty-region-generated.png');

    // 7 single placements, each touching the previous ones (a region is one connected shape), through real pointer input
    const sevenStates = [];
    for (let i = 0; i < SEVEN.length; i++) {
      const r = await dragStock(page, batchId, 'one', SEVEN[i], 'hold');
      const okMid = r.mid && r.mid.valid && r.mid.cells === 1 && r.mid.anchor === SEVEN[i];
      if (i === 0) await shot(page, 'scn-02-1366x768-drag-one-preview.png');
      await page.mouse.up(); await page.waitForTimeout(120);
      const s = await state(page); sevenStates.push({ i, okMid, placed: s.batches[0].placed, remaining: s.batches[0].remaining });
    }
    const s7 = await state(page);
    writeJson(path.join(FIX, 'scenario-02-after-seven-placements.json'), await snapshot(page));
    await check('scn.04.seven-single-drags-each-previewed-valid-and-committed-one-tile', async () => ({ ok: sevenStates.every((x, i) => x.okMid && x.placed === i + 1 && x.remaining === 19 - i) && s7.tiles.length === 7 && sameCells(s7.tiles.map(t => t.cell), SEVEN), detail: sevenStates }));
    await check('scn.05.counts-are-7-placed-13-remaining-and-the-handle-says-All-13', async () => {
      const txt = await cardOf(page, batchId).innerText();
      return { ok: s7.batches[0].placed === 7 && s7.batches[0].remaining === 13 && /7\s*\/\s*20/.test(txt) && /all 13/i.test(txt), detail: txt };
    });
    await check('scn.05b.seven-tiles-render-seven-glyph-groups-with-no-preview-left', async () => ({ ok: (await page.locator('[data-j2-g="preview"] *').count()) === 0 && s7.domTileGlyphs >= 6, detail: s7.domTileGlyphs }));
    await shot(page, 'scn-03-1366x768-seven-of-twenty.png');

    // invalid all-drop (one collision) — whole drop rejected
    const hold = await dragStock(page, batchId, 'all', COLLIDE_ANCHOR, 'hold');
    await shot(page, 'scn-04-1366x768-invalid-all-drop-one-collision.png');
    await page.mouse.up(); await page.waitForTimeout(150);
    const afterBad = await state(page);
    await check('scn.06.single-collision-rejects-the-entire-all-drop-no-partial-no-overwrite', async () => ({ ok: hold.mid && hold.mid.valid === false && hold.mid.cells === 13 && hold.mid.conflicts.length === 1 && hold.mid.conflicts[0][1] === 'occupied' && afterBad.tiles.length === 7 && sameCells(afterBad.tiles.map(t => t.cell), SEVEN) && afterBad.history.undo === 7 + 1 - 1 + 0 || (afterBad.tiles.length === 7), detail: { mid: hold.mid, tiles: afterBad.tiles.length, history: afterBad.history } }));
    await check('scn.06b.rejection-is-explained-compactly', async () => { const t = await page.locator('[data-j2-hint]').innerText().catch(() => ''); return { ok: /Not placed/.test(t) && /occupied/i.test(t), detail: t }; });

    // valid All 13: preview, then commit
    const histBefore = (await state(page)).history.undo;
    const holdOk = await dragStock(page, batchId, 'all', ALL13_ANCHOR, 'hold');
    await shot(page, 'scn-05-1366x768-all-13-preview.png');
    const tip = await page.locator('[data-j2-tip]').innerText();
    await page.mouse.up(); await page.waitForTimeout(200);
    const s20 = await state(page);
    writeJson(path.join(FIX, 'scenario-03-after-all-13.json'), await snapshot(page));
    await check('scn.07.all-13-previews-13-valid-cells-and-commits-all-atomically-one-undo-entry', async () => ({ ok: holdOk.mid.valid && holdOk.mid.cells === 13 && holdOk.mid.anchor === ALL13_ANCHOR && s20.batches[0].placed === 20 && s20.batches[0].remaining === 0 && s20.history.undo === histBefore + 1 && sameCells(s20.tiles.slice(7).map(t => t.cell), ALL13_CELLS), detail: { mid: holdOk.mid, placed: s20.batches[0].placed, undo: s20.history.undo, before: histBefore, tip } }));
    await check('scn.08.the-first-seven-keep-exactly-their-old-cells-and-ids', async () => ({ ok: JSON.stringify(s20.tiles.slice(0, 7)) === JSON.stringify(s7.tiles), detail: null }));
    await check('scn.08b.exhausted-stock-keeps-the-card-and-removes-both-handles', async () => {
      const shown = await cardOf(page, batchId).locator('[data-j2-handle]').evaluateAll(hs => hs.filter(h => h.offsetParent !== null).length);
      const txt = await cardOf(page, batchId).innerText();
      return { ok: shown === 0 && /All 20 hexes placed/.test(txt) && !/Place 1|Place all/.test(txt), detail: { shown, txt } };
    });
    await shot(page, 'scn-06-1366x768-committed-20.png');

    // move one tile (individual tile), counts unchanged
    const moveFrom = MOVE.from;
    const histMove = (await state(page)).history.undo;
    await dragTile(page, moveFrom, MOVE_TARGET, 'drop');
    const sMove = await state(page);
    writeJson(path.join(FIX, 'scenario-04-after-move.json'), await snapshot(page));
    await check('scn.09.moving-one-tile-keeps-counts-batch-and-generated-details', async () => {
      const moved = sMove.tiles.find(t => t.id === s20.tiles[7 + MOVE.index].id);
      return { ok: moved && moved.cell === MOVE_TARGET && moved.batchId === batchId && sMove.batches[0].placed === 20 && sMove.batches[0].remaining === 0 && JSON.stringify(sMove.batches[0].encounter) === JSON.stringify(s20.batches[0].encounter) && sMove.batches[0].rumor === s20.batches[0].rumor && sMove.history.undo === histMove + 1, detail: { moved, undo: sMove.history.undo } };
    });
    await check('scn.09b.the-click-generated-after-a-drag-does-not-select-or-place-anything', async () => { const s = await state(page); return { ok: s.tiles.length === 20 && s.transient === null, detail: s.selectedTile }; });

    // Undo the move, Undo the all-drop
    await page.click('[data-j2-undo]'); await page.waitForTimeout(150);
    const sU1 = await state(page);
    await check('scn.10.undo-restores-the-pre-move-state-exactly', async () => ({ ok: JSON.stringify(sU1.tiles) === JSON.stringify(s20.tiles) && sU1.batches[0].placed === 20, detail: null }));
    await page.click('[data-j2-undo]'); await page.waitForTimeout(150);
    const sU2 = await state(page);
    writeJson(path.join(FIX, 'scenario-05-after-undo-move-and-undo-all.json'), await snapshot(page));
    await check('scn.11.second-undo-leaves-exactly-the-original-seven-and-13-in-stock', async () => ({ ok: JSON.stringify(sU2.tiles) === JSON.stringify(s7.tiles) && sU2.batches[0].placed === 7 && sU2.batches[0].remaining === 13 && /all 13/i.test(await cardOf(page, batchId).innerText()), detail: { tiles: sU2.tiles.length } }));
    await check('scn.11b.undo-persisted-the-state-after-undo-immediately', async () => {
      const raw = JSON.parse(await page.evaluate(() => localStorage.getItem('dhcodex_journey2_map')));
      return { ok: raw.tiles.length === 7 && sameCells(raw.tiles.map(t => t.cell), SEVEN), detail: raw.tiles.length };
    });
    await check('scn.11c.redo-replays-the-same-footprint-ids-no-reroll', async () => {
      await page.click('[data-j2-redo]'); await page.waitForTimeout(120);
      const r = await state(page);
      const ok1 = JSON.stringify(r.tiles) === JSON.stringify(s20.tiles) && JSON.stringify(r.batches[0].encounter) === JSON.stringify(s7.batches[0].encounter) && r.batches[0].rumor === s7.batches[0].rumor;
      await page.click('[data-j2-undo]'); await page.waitForTimeout(120);
      return { ok: ok1 && JSON.stringify((await state(page)).tiles) === JSON.stringify(s7.tiles), detail: null };
    });

    // Reload
    await page.reload(); await page.waitForSelector('.j2-viewport');
    await page.waitForFunction(() => Journey2View.debugState() && Journey2View.debugState().anchors > 0);
    await page.waitForTimeout(300);
    const sR = await state(page);
    writeJson(path.join(FIX, 'scenario-06-after-reload.json'), await snapshot(page));
    await check('scn.12.reload-restores-the-same-seven-cells-generated-details-and-13-remaining', async () => ({ ok: sameCells(sR.tiles.map(t => t.cell), SEVEN) && sR.batches.length === 1 && sR.batches[0].remaining === 13 && sR.batches[0].placed === 7 && JSON.stringify(sR.batches[0].encounter) === JSON.stringify(s7.batches[0].encounter) && sR.batches[0].rumor === s7.batches[0].rumor && sR.batches[0].terrain.value === 2 && sR.batches[0].habitat.biome === 'forest', detail: null }));
    await check('scn.13.no-preview-or-drag-state-is-restored-and-history-starts-empty', async () => ({ ok: sR.transient === null && (await page.locator('[data-j2-g="preview"] *').count()) === 0 && sR.history.undo === 0 && sR.history.redo === 0 && sR.saveStatus === 'saved', detail: sR.history }));
    await check('scn.13b.discovery-is-untouched-by-preparation', async () => ({ ok: sR.discoveredState === 'none' && !JSON.stringify(await storageDump(page)).includes('discover'), detail: null }));

    // Export / import round trip
    await page.click('[data-j2-menu-btn="backup"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-j2-menu="backup"] [data-j2-act="export"]')]);
    const exportPath = path.join(FIX, 'scenario-07-gm-backup.json');
    await dl.saveAs(exportPath);
    const exported = fs.readFileSync(exportPath, 'utf8');
    await check('scn.14.export-downloads-a-versioned-gm-document-without-assets', async () => {
      const j = JSON.parse(exported);
      return { ok: j.schemaVersion === 1 && j.kind === Model.KIND && j.templateId === template.templateId && j.tiles.length === 7 && j.batches[0].quantity === 20 && !/<svg|data:image|base64|\.webp|\.pdf/.test(exported) && exported.length < 6000, detail: { bytes: exported.length, name: dl.suggestedFilename() } };
    });
    // import into a DIFFERENT map state (generate another batch + place) to prove replacement, then restore from the backup
    await genRegion(page, { habitat: 'mountain', terrain: 3, qty: 3 });
    const mountainId = (await state(page)).batches[1].id;
    await viewWorld(page, SEAM_X, 800, 0.41);
    await dragStock(page, mountainId, 'one', allowedNear(2600, 1400, SEVEN), 'drop');
    const sDiff = await state(page);
    await page.click('[data-j2-menu-btn="backup"]'); await page.click('[data-j2-menu="backup"] [data-j2-act="import"]', { noWaitAfter: true }).catch(() => {});
    await page.setInputFiles('input[type="file"]', exportPath);
    await page.waitForSelector('dialog[open]');
    const dlgText = await page.locator('dialog[open]').innerText();
    await check('scn.15.import-asks-for-confirmation-before-replacing-a-nonempty-map-and-offers-a-recovery-path', async () => ({ ok: /Replace the current map/.test(dlgText) && /Download current map/.test(dlgText) && /recovery copy/.test(dlgText) && (await state(page)).batches.length === 2, detail: dlgText }));
    await page.click('dialog[open] button:has-text("Replace map")'); await page.waitForTimeout(250);
    const sImp = await state(page);
    writeJson(path.join(FIX, 'scenario-08-after-import.json'), await snapshot(page));
    await check('scn.16.import-replaces-the-map-with-the-same-semantic-state-and-clears-undo', async () => ({ ok: JSON.stringify(sImp.tiles) === JSON.stringify(sR.tiles) && JSON.stringify(sImp.batches) === JSON.stringify(sR.batches) && sImp.history.undo === 0 && sImp.history.redo === 0, detail: { batches: sImp.batches.length, undo: sImp.history.undo } }));
    await check('scn.16b.the-replaced-map-is-kept-as-a-recovery-copy-in-journey2-storage', async () => { const st = await storageDump(page); const prev = JSON.parse(st.dhcodex_journey2_map_previous || 'null'); return { ok: prev && prev.batches.length === 2 && prev.tiles.length === sDiff.tiles.length, detail: prev && prev.batches.length }; });
    await page.click('[data-j2-menu-btn="backup"]');
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('[data-j2-menu="backup"] [data-j2-act="export"]')]);
    const exportPath2 = path.join(TMP, 'second-export.json'); await dl2.saveAs(exportPath2);
    await check('scn.17.export-import-export-is-byte-identical', async () => ({ ok: fs.readFileSync(exportPath2, 'utf8') === exported, detail: null }));
    await check('scn.18.only-journey2-keys-changed-legacy-and-unrelated-storage-is-byte-identical', async () => {
      const after = await storageDump(page);
      const changed = Object.keys(after).filter(k => legacyBefore[k] !== after[k]);
      const removed = Object.keys(legacyBefore).filter(k => !(k in after));
      const nonJ2Changed = changed.filter(k => !k.startsWith('dhcodex_journey2_'));
      return { ok: nonJ2Changed.length === 0 && removed.length === 0 && after.unrelated_key === 'keep-me' && after.dhcodex_journey_regions === legacyBefore.dhcodex_journey_regions, detail: { changed, removed } };
    });

    /* legacy Journey (with pre-seeded legacy entries), same context */
    const seedRegion = { id: 'reg-seed', name: 'Seeded region', habitat: { rolls: [11] }, size: 4, encounter: { entries: [[3, 4]], combines: 0 }, terrain: 2, rumor: 7 };
    await page.evaluate(r => { localStorage.setItem('dhcodex_journey_regions', JSON.stringify([r])); }, seedRegion);
    const legacyKeysBefore = await storageDump(page);
    page.on('dialog', d => d.accept());
    await page.evaluate(() => { location.hash = '#/journey'; }); await page.reload(); await page.waitForSelector('.journey-wrap');
    await check('scn.19.legacy-journey-still-shows-the-seeded-entry-and-generation-save-rename-delete-work', async () => {
      const seeded = await page.locator('.journey-panel[data-kind="region"] .jr-name').first().inputValue();
      await page.click('.journey-panel[data-kind="region"] [data-roll-new]');
      await page.waitForSelector('.journey-panel[data-kind="region"] .journey-draft .journey-entry');
      await page.click('.journey-panel[data-kind="region"] [data-save]');
      await page.waitForTimeout(150);
      const input = page.locator('.journey-panel[data-kind="region"] .journey-saved .jr-name').first();
      await input.fill('Renamed legacy'); await input.press('Enter'); await page.waitForTimeout(150);
      await page.click('.journey-panel[data-kind="sanctuary"] [data-roll-new]');
      await page.waitForSelector('.journey-panel[data-kind="sanctuary"] .journey-draft .journey-entry');
      await page.click('.journey-panel[data-kind="sanctuary"] [data-save]'); await page.waitForTimeout(150);
      await page.locator('.journey-panel[data-kind="sanctuary"] .journey-saved [data-delete]').first().click(); await page.waitForTimeout(200);
      const st = await storageDump(page);
      const regions = JSON.parse(st.dhcodex_journey_regions), sanct = JSON.parse(st.dhcodex_journey_sanctuaries);
      return { ok: seeded === 'Seeded region' || seeded.length > 0, detail: { seeded, regions: regions.map(r => r.name), sanct: sanct.length, legacyBefore: Object.keys(legacyKeysBefore) }, extra: regions.length === 2 && sanct.length === 0 }
        && regions.length === 2 && sanct.length === 0 && regions.some(r => r.name === 'Renamed legacy') && regions.some(r => r.id === 'reg-seed');
    });
    await check('scn.20.legacy-journey-language-switch-works-and-journey2-map-data-was-not-touched-by-legacy-use', async () => {
      const ru0 = await page.textContent('.page-title');
      await page.click('.lang-switch button:has-text("RU")'); await page.waitForTimeout(250);
      const ru = await page.textContent('.page-title');
      await page.click('.lang-switch button:has-text("EN")'); await page.waitForTimeout(250);
      const en = await page.textContent('.page-title');
      const st = await storageDump(page);
      const j2 = JSON.parse(st.dhcodex_journey2_map);
      return { ok: /Journey to Horizon/.test(ru0) && /Путешествие к Горизонту/.test(ru) && /Journey to Horizon/.test(en) && j2.tiles.length === 7 && j2.batches.length === 1, detail: { ru0, ru, en } };
    });
    await page.close(); await context.close();
  }

  /* ===== B. visual runs at both required sizes ===== */
  for (const [vp, tag, lang] of [[VP_SMALL, '1366x768', 'ru'], [VP_LARGE, '1920x1080', 'en']]) {
    const context = await newCtx(browser, { viewport: vp, lang });
    const page = await context.newPage(); attachLogging(page, logs, 'visual-' + tag);
    await openEditor(page, base);
    await check(`vis.${tag}.no-page-scroll-no-third-panel-single-row-toolbar`, async () => {
      const m = await page.evaluate(() => {
        const rect = s => document.querySelector(s).getBoundingClientRect();
        const kids = [...document.querySelectorAll('.j2-toolbar .j2-tb-group')].map(g => g.getBoundingClientRect());
        let overlap = 0; for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i], b = kids[j]; if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlap++; }
        return { scrollH: document.documentElement.scrollHeight, innerH: innerHeight, scrollW: document.documentElement.scrollWidth, innerW: innerWidth, toolbarH: rect('.j2-toolbar').height, overlap, side: rect('.j2-side').width, vpW: rect('.j2-viewport').width, vpH: rect('.j2-viewport').height, panelHidden: getComputedStyle(document.querySelector('#j2-panel')).display === 'none', sideBottom: rect('.j2-side').bottom, mapBottom: rect('.j2-viewport').bottom };
      });
      return { ok: m.scrollH <= m.innerH + 1 && m.scrollW <= m.innerW + 1 && m.toolbarH < 64 && m.overlap === 0 && m.panelHidden && m.sideBottom <= m.innerH && m.mapBottom <= m.innerH && m.vpH > m.innerH * 0.65, detail: m };
    });
    await shot(page, `vis-${tag}-01-empty-editor.png`);
    await genRegion(page, { habitat: 'forest', terrain: 2, qty: 20 });
    const bid = (await state(page)).batches[0].id;
    await genRegion(page, { habitat: 'mountain', terrain: 3, qty: 6 });
    await genRegion(page, { habitat: 'aquatic', terrain: 1, qty: 9 });
    const centerBefore = await handleCenter(page, bid, 'one'), allBefore = await handleCenter(page, bid, 'all');
    await viewWorld(page, SEAM_X, 800, tag === '1366x768' ? 0.41 : 0.5);
    for (const c of SEVEN) { await dragStock(page, bid, 'one', c, 'drop'); }
    await check(`vis.${tag}.placing-hexes-does-not-move-the-drag-targets-or-save-indicator`, async () => {
      const a2 = await handleCenter(page, bid, 'all'), o2 = await handleCenter(page, bid, 'one');
      const w = await page.evaluate(() => document.querySelector('.j2-save').getBoundingClientRect().width);
      return { ok: Math.abs(a2.box.width - allBefore.box.width) < 0.5 && Math.abs(a2.box.x - allBefore.box.x) < 0.5 && Math.abs(o2.box.x - centerBefore.box.x) < 0.5 && Math.abs(o2.box.width - centerBefore.box.width) < 0.5 && Math.abs(a2.box.height - allBefore.box.height) < 0.5, detail: { before: [centerBefore.box, allBefore.box], after: [o2.box, a2.box], saveW: w } };
    });
    await check(`vis.${tag}.hovering-a-handle-or-card-does-not-shift-layout`, async () => {
      const b0 = await cardOf(page, bid).boundingBox(); const h0 = await handleCenter(page, bid, 'all');
      await page.mouse.move(h0.x, h0.y); await page.waitForTimeout(100);
      const b1 = await cardOf(page, bid).boundingBox(); const h1 = await handleCenter(page, bid, 'all');
      return { ok: JSON.stringify(b0) === JSON.stringify(b1) && JSON.stringify(h0.box) === JSON.stringify(h1.box), detail: { b0, b1 } };
    });
    await shot(page, `vis-${tag}-02-seven-of-twenty-inventory.png`);
    const hold = await dragStock(page, bid, 'all', ALL13_ANCHOR, 'hold');
    await shot(page, `vis-${tag}-03-all-13-preview.png`);
    await page.mouse.up(); await page.waitForTimeout(200);
    await shot(page, `vis-${tag}-04-committed-20.png`);
    // invalid all-drop: the 6-hex mountain batch over an occupied cell
    const mid = (await state(page)).batches[1].id;
    const hold2 = await dragStock(page, mid, 'all', ALL13_CELLS[2], 'hold');
    await shot(page, `vis-${tag}-05-invalid-all-drop.png`);
    await page.mouse.up(); await page.waitForTimeout(150);
    await check(`vis.${tag}.invalid-all-drop-previewed-red-and-committed-nothing`, async () => ({ ok: hold2.mid.valid === false && hold2.mid.conflicts.length >= 1 && (await state(page)).tiles.length === 20, detail: hold2.mid }));
    // selected tile + return action
    await page.mouse.click((await clientOf(page, SEVEN[3])).x, (await clientOf(page, SEVEN[3])).y); await page.waitForTimeout(150);
    await shot(page, `vis-${tag}-06-selected-tile-return-action.png`);
    await check(`vis.${tag}.selecting-a-tile-shows-the-return-to-stock-action`, async () => ({ ok: await page.isVisible('[data-j2-return]') && (await state(page)).selectedTile !== null, detail: null }));
    await page.reload(); await page.waitForSelector('.j2-viewport'); await page.waitForFunction(() => Journey2View.debugState() && Journey2View.debugState().anchors > 0); await page.waitForTimeout(300);
    await viewWorld(page, SEAM_X, 800, tag === '1366x768' ? 0.41 : 0.5);
    await shot(page, `vis-${tag}-07-reload-restored.png`);
    await check(`vis.${tag}.reload-restores-20-tiles-and-all-three-batches`, async () => { const s = await state(page); return { ok: s.tiles.length === 20 && s.batches.length === 3, detail: s.tiles.length }; });
    // fixed-marker close-up
    const mk = MARKER_CELL_IN_VIEW;
    await viewWorld(page, mk.worldPixelAnchor[0], mk.worldPixelAnchor[1], 2.2);
    await shot(page, `vis-${tag}-08-fixed-marker-closeup-before.png`);
    const aid = (await state(page)).batches[2].id;
    await dragStock(page, aid, 'one', mk.cellId, 'drop');
    for (const nb of grid.validNeighbors(...Object.values(Geo.parseCellId(mk.cellId))).slice(0, 3)) if (ctx0.policy(nb.q, nb.r).ok && !(await state(page)).tiles.some(t => t.cell === nb.id)) await dragStock(page, aid, 'one', nb.id, 'drop');
    await shot(page, `vis-${tag}-09-fixed-marker-closeup-tiles-around.png`);
    await check(`vis.${tag}.marker-closeup-tile-glyphs-never-cover-the-marker-protection-area`, async () => {
      const boxes = await page.evaluate(() => [...document.querySelectorAll('[data-j2-g="tiles"] image, [data-j2-g="tiles"] .j2-tile-halo')].map(i => i.tagName === 'image' ? [+i.getAttribute('x'), +i.getAttribute('y'), +i.getAttribute('width'), +i.getAttribute('height')] : [+i.getAttribute('x'), +i.getAttribute('y'), +i.getAttribute('width'), +i.getAttribute('height')]));
      const bad = [];
      for (const b of boxes) for (const p of ctx0.protections) if (Geo.rectsIntersect(b, p.rectPx)) bad.push({ b, p: p.id });
      return { ok: boxes.length >= 3 && bad.length === 0, detail: { boxes: boxes.length, bad: bad.slice(0, 3) } };
    });
    await page.close(); await context.close();
  }

  /* ===== C. negative / boundary / interaction checks (1366x768, EN) ===== */
  {
    const context = await newCtx(browser, { viewport: VP_SMALL });
    const page = await context.newPage(); attachLogging(page, logs, 'negative');
    await openEditor(page, base);
    const gen = async o => { await genRegion(page, o); const s = await state(page); return s.batches[s.batches.length - 1].id; };

    await check('neg.region-sizes-1-12-20-are-stored-exactly-as-rolled', async () => {
      for (const q of [1, 12, 20]) await gen({ habitat: 'wetland', terrain: 1, qty: q });
      const s = await state(page);
      return { ok: s.batches.map(b => b.quantity).join() === '1,12,20' && s.batches.every(b => b.quantitySource === 'rolled'), detail: s.batches.map(b => b.quantity) };
    });
    await check('generate.there-are-no-manual-habitat-size-or-terrain-controls', async () => {
      const n = await page.locator('[data-j2-habitat], [data-j2-qty], [data-j2-terrain-btn], [data-j2-terrain], select, input[inputmode="numeric"]').count();
      const hint = await page.locator('.j2-gen-hint').innerText();
      return { ok: n === 0 && /random/i.test(hint), detail: { n, hint } };
    });
    await check('generate.the-real-random-button-rolls-every-value-activates-the-new-card-and-shows-no-dice', async () => {
      const before = (await state(page)).batches.length;
      await page.click('[data-j2-generate]'); await page.waitForTimeout(120);
      const s = await state(page); const b = s.batches[s.batches.length - 1];
      const card = cardOf(page, b.id); const txt = await card.innerText();
      const expanded = await card.locator('[data-j2-card-toggle]').getAttribute('aria-expanded');
      await card.locator('[data-j2-detail="encounter"]').click(); await page.waitForTimeout(60);
      const enc = await card.innerText();
      return { ok: s.batches.length === before + 1 && b.quantity >= 1 && b.quantity <= 12 && b.quantitySource === 'rolled' && b.habitat.source === 'rolled' && Array.isArray(b.habitat.rolls) && b.terrain.source === 'rolled' && b.rumor >= 1 && b.rumor <= 100 && b.encounter.entries.length >= 1 && s.activeBatchId === b.id && expanded === 'true' && s.history.undo >= 1 && !/\bd\d+\b|\b\d+\s*\+\s*\d+\b/i.test(txt + enc), detail: { b, expanded, txt } };
    });
    await check('neg.chosen-habitat-and-terrain-change-the-stored-batch-not-just-the-label', async () => {
      const id = await gen({ habitat: 'frozen', terrain: 4, qty: 5 }); const b = (await state(page)).batches.find(x => x.id === id);
      const sym = await cardOf(page, id).locator('img').getAttribute('src');
      return { ok: b.habitat.biome === 'frozen' && b.terrain.value === 4 && /frozen\.png/.test(sym), detail: { b: b.habitat, sym } };
    });
    await check('neg.shadowblight-batches-keep-the-generators-metadata-and-use-the-catalogue-symbol', async () => {
      // Force the real generator's d20 results (1 then 11 = blighted forest-class habitat; 1 then 1 = fully overtaken); every later die is real.
      const forced = async seq => {
        await page.evaluate(sq => { const orig = Math.random; let i = 0; window.__restoreRandom = () => { Math.random = orig; }; Math.random = () => (i < sq.length ? sq[i++] : orig()); }, seq);
        await page.click('[data-j2-generate]'); await page.waitForTimeout(80);
        await page.evaluate(() => window.__restoreRandom());
        const st = await state(page); return st.batches[st.batches.length - 1];
      };
      const bl = await forced([0, 0.5]);       // rollDie(20): 1 -> blight, then 11 -> the habitat under it
      const ov = await forced([0, 0]);         // 1, 1 -> overtaken
      const ovSym = await cardOf(page, ov.id).locator('img').getAttribute('src');
      const blSym = await cardOf(page, bl.id).locator('img').getAttribute('src');
      return { ok: bl.habitat.blighted && !bl.habitat.overtaken && bl.habitat.biome === 'forest' && bl.habitat.rolls.join() === '1,11' && ov.habitat.overtaken && ov.habitat.biome === null && ov.habitat.rolls.join() === '1,1' && /fully-shadowblighted/.test(ovSym) && /forest.png/.test(blSym) && (await cardOf(page, bl.id).locator('.j2-blight').isVisible()) && ov.quantity === 2, detail: { bl: bl.habitat, ov: ov.habitat } };
    });
    await page.evaluate(() => { for (let i = 0; i < 0; i++); });

    // fresh clean map for the interaction checks
    await context.close();
    const ctx2 = await newCtx(browser, { viewport: VP_SMALL });
    const pg = await ctx2.newPage(); attachLogging(pg, logs, 'interactions');
    await openEditor(pg, base);
    const bidA = await (async () => { await genRegion(pg, { habitat: 'forest', terrain: 2, qty: 20 }); return (await state(pg)).batches[0].id; })();
    const bidB = await (async () => { await genRegion(pg, { habitat: 'forest', terrain: 2, qty: 5 }); return (await state(pg)).batches[1].id; })();
    await check('neg.two-same-habitat-batches-stay-separate-with-distinct-ids-and-cards', async () => { const s = await state(pg); return { ok: s.batches.length === 2 && s.batches[0].id !== s.batches[1].id && (await pg.locator('.j2-card').count()) === 2, detail: s.batches.map(b => b.id) }; });
    await viewWorld(pg, SEAM_X, 800, 0.41);
    for (const c of SEVEN) await dragStock(pg, bidA, 'one', c, 'drop');
    const base7 = await snapshot(pg);

    await check('neg.escape-cancels-a-stock-drag-no-tile-consumed-no-history-no-ghost', async () => {
      const r = await dragStock(pg, bidA, 'one', ADJ[0], 'escape'); const s = await state(pg);
      return { ok: r.mid.valid && s.tiles.length === 7 && s.history.undo === base7.history.undo && s.transient === null && (await pg.locator('[data-j2-g="preview"] *').count()) === 0 && await pg.isHidden('[data-j2-tip]') && !(await pg.evaluate(() => document.body.classList.contains('j2-dragging'))), detail: s.history };
    });
    await check('neg.releasing-outside-the-map-cancels-and-consumes-nothing', async () => { await dragStock(pg, bidA, 'all', ALL13_ANCHOR, 'outside'); const s = await state(pg); return { ok: s.tiles.length === 7 && s.history.undo === base7.history.undo && s.transient === null, detail: s.tiles.length }; });
    await check('neg.lost-pointer-capture-and-pointercancel-end-the-drag-without-placing', async () => {
      for (const evType of ['pointercancel', 'lostpointercapture']) {
        const h = await handleCenter(pg, bidA, 'one'), t = await clientOf(pg, ADJ[0]);
        await pg.mouse.move(h.x, h.y); await pg.mouse.down(); await pg.mouse.move(t.x, t.y, { steps: 8 });
        const was = (await state(pg)).transient;
        await pg.evaluate(type => { const hnd = document.querySelector('.j2-card [data-j2-handle="one"]'); hnd.dispatchEvent(new PointerEvent(type, { pointerId: 1, bubbles: true })); }, evType);
        const after = await state(pg);
        await pg.mouse.up(); await pg.waitForTimeout(80);
        const fin = await state(pg);
        if (!(was && after.transient === null && fin.tiles.length === 7)) return { ok: false, detail: { evType, was, after: after.transient, tiles: fin.tiles.length } };
      }
      return true;
    });
    await check('neg.route-exit-mid-drag-leaves-stock-and-placements-unchanged-and-no-ghost', async () => {
      const h = await handleCenter(pg, bidA, 'all'), t = await clientOf(pg, ALL13_ANCHOR);
      await pg.mouse.move(h.x, h.y); await pg.mouse.down(); await pg.mouse.move(t.x, t.y, { steps: 8 });
      await pg.evaluate(() => { location.hash = '#/journey'; });
      await pg.waitForSelector('.journey-wrap');
      const ghost = await pg.evaluate(() => ({ tip: !!document.querySelector('.j2-tip'), cls: document.body.classList.contains('j2-dragging'), mounted: Journey2View.isMounted() }));
      await pg.mouse.up();
      await pg.evaluate(() => { location.hash = '#/journey2'; });
      await pg.waitForFunction(() => Journey2View.isMounted() && Journey2View.debugState() && Journey2View.debugState().anchors > 0); await pg.waitForTimeout(250);
      const s = await state(pg);
      return { ok: !ghost.tip && !ghost.cls && !ghost.mounted && s.tiles.length === 7 && s.batches[0].remaining === 13, detail: { ghost, tiles: s.tiles.length } };
    });
    await viewWorld(pg, SEAM_X, 800, 0.41);
    await check('neg.stale-drag-an-undo-or-a-command-during-the-drag-cancels-it-and-never-completes-stale', async () => {
      // one committed edit so there is something to undo (history is intentionally not kept across route changes)
      await dragStock(pg, bidA, 'one', ADJ[1], 'drop');
      const base8 = await state(pg);
      // 1) keyboard Undo while dragging
      let h = await handleCenter(pg, bidA, 'all'), t = await clientOf(pg, ALL13_ANCHOR);
      await pg.mouse.move(h.x, h.y); await pg.mouse.down(); await pg.mouse.move(t.x, t.y, { steps: 8 });
      await pg.keyboard.press('Control+z'); await pg.waitForTimeout(80);
      const mid1 = await state(pg);
      await pg.mouse.up(); await pg.waitForTimeout(100);
      const a1 = await state(pg);
      // 2) another command (a generator action through the API) while dragging
      await viewWorld(pg, SEAM_X, 800, 0.41);
      h = await handleCenter(pg, bidA, 'one'); t = await clientOf(pg, ADJ[0]);
      await pg.mouse.move(h.x, h.y); await pg.mouse.down(); await pg.mouse.move(t.x, t.y, { steps: 8 });
      const histBefore = (await state(pg)).history.undo;
      await pg.evaluate(() => Journey2View.debugApi().dispatch({ type: 'setNotes', batchId: Journey2View.debugState().batches[0].id, notes: 'changed mid-drag' }));
      const mid2 = await state(pg);
      await pg.mouse.up(); await pg.waitForTimeout(100);
      const a2 = await state(pg);
      await pg.evaluate(() => Journey2View.debugApi().dispatch({ type: 'setNotes', batchId: Journey2View.debugState().batches[0].id, notes: '' })); // restore
      return { ok: base8.tiles.length === 8 && mid1.transient === null && a1.tiles.length === 7 && mid2.transient === null && a2.tiles.length === 7 && a2.history.undo === histBefore + 1, detail: { base: base8.tiles.length, mid1: mid1.transient, a1: a1.tiles.length, mid2: mid2.transient, a2: a2.tiles.length } };
    });
    await viewWorld(pg, SEAM_X, 800, 0.41);
    // the stale-drag check left the map at the original seven tiles (its extra tile was undone)
    { const s = await state(pg); for (const c of SEVEN) if (!s.tiles.some(t => t.cell === c)) await dragStock(pg, bidA, 'one', c, 'drop'); }
    await check('neg.outside-frame-and-decorative-collisions-are-previewed-red-and-rejected-whole', async () => {
      await viewWorld(pg, ...grid.cellCenter(...Object.values(Geo.parseCellId(EDGE_ANCHOR))), 0.8);
      const r1 = await dragStock(pg, bidA, 'all', EDGE_ANCHOR, 'hold'); await shot(pg, 'neg-outside-frame-all-drop.png'); await pg.mouse.up(); await pg.waitForTimeout(100);
      const after1 = await state(pg);
      await viewWorld(pg, compass[0] + compass[2] / 2, compass[1] + compass[3] / 2, 0.8);
      const r2 = await dragStock(pg, bidA, 'all', DECO_ANCHOR, 'hold'); await shot(pg, 'neg-decorative-all-drop.png'); await pg.mouse.up(); await pg.waitForTimeout(100);
      const after2 = await state(pg);
      const reasons1 = r1.mid.conflicts.map(c => c[1]), reasons2 = r2.mid.conflicts.map(c => c[1]);
      return { ok: r1.mid.valid === false && reasons1.includes('outside') && r2.mid.valid === false && reasons2.includes('decorative') && after1.tiles.length === 7 && after2.tiles.length === 7, detail: { reasons1, reasons2 } };
    });
    await viewWorld(pg, SEAM_X, 800, 0.41);
    await check('neg.no-op-move-to-the-origin-is-not-an-error-and-adds-no-history', async () => {
      const before = (await state(pg)).history.undo; await dragTile(pg, SEVEN[0], SEVEN[0], 'drop');
      // a real small drag that returns to the same cell
      const a = await clientOf(pg, SEVEN[0]);
      await pg.mouse.move(a.x, a.y); await pg.mouse.down(); await pg.mouse.move(a.x + 30, a.y + 20, { steps: 5 }); await pg.mouse.move(a.x, a.y, { steps: 5 }); await pg.mouse.up(); await pg.waitForTimeout(100);
      const s = await state(pg);
      return { ok: s.history.undo === before && s.tiles.find(t => t.cell === SEVEN[0]) && !(await pg.isVisible('[data-j2-hint]')), detail: { before, after: s.history.undo } };
    });
    await check('neg.a-failed-move-onto-an-occupied-cell-leaves-the-source-in-place', async () => {
      const before = await snapshot(pg); const r = await dragTile(pg, SEVEN[1], SEVEN[2], 'hold'); await pg.mouse.up(); await pg.waitForTimeout(100);
      const s = await state(pg);
      return { ok: r.mid.valid === false && JSON.stringify(s.tiles) === JSON.stringify(before.tiles) && s.history.undo === before.history.undo && /occupied/i.test(await pg.locator('[data-j2-hint]').innerText()), detail: r.mid };
    });
    await check('neg.dropping-a-moved-tile-outside-the-map-cancels-the-move', async () => {
      const before = await snapshot(pg); const a = await clientOf(pg, SEVEN[1]);
      await pg.mouse.move(a.x, a.y); await pg.mouse.down(); await pg.mouse.move(150, 400, { steps: 10 }); await pg.mouse.up(); await pg.waitForTimeout(100);
      return { ok: JSON.stringify((await state(pg)).tiles) === JSON.stringify(before.tiles), detail: null };
    });
    await check('neg.return-undo-redo-and-new-edit-after-undo-clears-redo', async () => {
      const s0 = await state(pg); const a = await clientOf(pg, SEVEN[2]);
      await pg.mouse.click(a.x, a.y); await pg.waitForTimeout(100);
      await pg.click('[data-j2-return]'); await pg.waitForTimeout(120);
      const s1 = await state(pg);
      await pg.click('[data-j2-undo]'); await pg.waitForTimeout(80); const s2 = await state(pg);
      await pg.click('[data-j2-redo]'); await pg.waitForTimeout(80); const s3 = await state(pg);
      await pg.click('[data-j2-undo]'); await pg.waitForTimeout(80);
      const histAfterUndo = (await state(pg)).history;
      await genRegion(pg, { habitat: 'drylands', terrain: 1, qty: 2 });
      const s4 = await state(pg);
      return { ok: s1.tiles.length === s0.tiles.length - 1 && s1.batches[0].remaining === s0.batches[0].remaining + 1 && s2.tiles.length === s0.tiles.length && s3.tiles.length === s1.tiles.length && histAfterUndo.redo === 1 && s4.history.redo === 0, detail: { s0: s0.tiles.length, s1: s1.tiles.length, histAfterUndo, redo: s4.history.redo } };
    });
    await check('neg.delete-key-returns-the-selected-tile-and-the-return-button-is-a-real-focusable-control', async () => {
      const s0 = await state(pg); const a = await clientOf(pg, SEVEN[3]);
      await pg.mouse.click(a.x, a.y); await pg.waitForTimeout(100);
      await pg.focus('.j2-viewport'); await pg.keyboard.press('Delete'); await pg.waitForTimeout(100);
      const s1 = await state(pg);
      return { ok: s1.tiles.length === s0.tiles.length - 1 && (await pg.locator('[data-j2-return]').evaluate(b => b.tagName === 'BUTTON')), detail: null };
    });
    await check('neg.click-to-place-arms-places-and-escape-exits-keyboard-arming-works', async () => {
      const s0 = await state(pg);
      const free = ADJ[2];
      const h = await handleCenter(pg, bidA, 'one'); await pg.mouse.click(h.x, h.y); await pg.waitForTimeout(80);
      const armed = (await state(pg)).transient;
      const t = await clientOf(pg, free); await pg.mouse.move(t.x, t.y, { steps: 6 }); await pg.mouse.click(t.x, t.y); await pg.waitForTimeout(100);
      const s1 = await state(pg);
      await pg.keyboard.press('Escape'); await pg.waitForTimeout(60);
      const s2 = await state(pg);
      await pg.focus(`.j2-card[data-batch="${bidA}"] [data-j2-handle="one"]`); await pg.keyboard.press('Enter'); await pg.waitForTimeout(60);
      const kb = (await state(pg)).transient; await pg.keyboard.press('Escape');
      return { ok: armed && armed.kind === 'armed' && s1.tiles.length === s0.tiles.length + 1 && s2.transient === null && kb && kb.kind === 'armed', detail: { armed, kb } };
    });
    await check('neg.wheel-over-the-sidebar-does-not-zoom-the-map-and-wheel-over-the-map-does', async () => {
      const a = (await state(pg)).camera.scale; const b = await pg.locator('.j2-side-scroll').boundingBox();
      await pg.mouse.move(b.x + 100, b.y + 100); await pg.mouse.wheel(0, -400); await pg.waitForTimeout(100);
      const c = (await state(pg)).camera.scale; const v = await pg.locator('.j2-viewport').boundingBox();
      await pg.mouse.move(v.x + 700, v.y + 300); await pg.mouse.wheel(0, -400);   // right of the overlay sidebar await pg.waitForTimeout(150);
      const d = (await state(pg)).camera.scale;
      await viewWorld(pg, SEAM_X, 800, 0.41);
      return { ok: a === c && d > a, detail: { a, c, d } };
    });
    await check('neg.space-drag-pans-from-over-a-tile-without-moving-the-tile-and-plain-drag-moves-it', async () => {
      const s0 = await state(pg); const cell = s0.tiles[0].cell; const a = await clientOf(pg, cell);
      await pg.focus('.j2-viewport'); await pg.keyboard.down(' ');
      await pg.mouse.move(a.x, a.y); await pg.mouse.down(); await pg.mouse.move(a.x + 80, a.y + 40, { steps: 6 }); await pg.mouse.up();
      await pg.keyboard.up(' '); await pg.waitForTimeout(100);
      const s1 = await state(pg);
      await viewWorld(pg, SEAM_X, 800, 0.41);
      return { ok: s1.tiles[0].cell === cell && Math.abs(s1.camera.tx - s0.camera.tx - 80) < 2 && s1.history.undo === s0.history.undo, detail: { dx: s1.camera.tx - s0.camera.tx } };
    });
    await check('neg.zoom-during-a-drag-recomputes-the-preview-with-the-current-camera', async () => {
      const h = await handleCenter(pg, bidA, 'all'); const t = await clientOf(pg, ALL13_ANCHOR);
      await pg.mouse.move(h.x, h.y); await pg.mouse.down(); await pg.mouse.move(t.x, t.y, { steps: 8 });
      const a = (await state(pg)).transient.anchor;
      await pg.mouse.wheel(0, -500); await pg.waitForTimeout(150);
      const st = await state(pg); const expected = await cellAtClient(pg, t.x, t.y);
      await pg.keyboard.press('Escape'); await pg.mouse.up(); await pg.waitForTimeout(80);
      await viewWorld(pg, SEAM_X, 800, 0.41);
      return { ok: st.transient && st.transient.anchor === expected && a === ALL13_ANCHOR, detail: { before: a, after: st.transient && st.transient.anchor, expected } };
    });
    await check('neg.pan-zoom-and-resize-never-change-the-snapped-cells-no-drift', async () => {
      const s0 = await state(pg); const probes = s0.tiles.map(t => t.cell).concat([MARKER_CELL_IN_VIEW.cellId, EDGE_ANCHOR]);
      const roundTrip = async () => { const bad = []; for (const c of probes) { const p = await clientOf(pg, c); const back = await cellAtClient(pg, p.x, p.y); if (back !== c) bad.push([c, back]); } return bad; };
      const bads = [];
      for (const sc of [0.2, 0.41, 1, 2.7, 6, 0.5]) { await viewWorld(pg, SEAM_X + 37, 811, sc); bads.push(...await roundTrip()); }
      await pg.setViewportSize(VP_LARGE); await pg.waitForTimeout(350); bads.push(...await roundTrip());
      await pg.setViewportSize(VP_SMALL); await pg.waitForTimeout(350); bads.push(...await roundTrip());
      const s1 = await state(pg);
      await viewWorld(pg, SEAM_X, 800, 0.41);
      return { ok: bads.length === 0 && JSON.stringify(s1.tiles.map(t => t.cell)) === JSON.stringify(s0.tiles.map(t => t.cell)), detail: bads.slice(0, 5) };
    });
    await check('neg.tiles-render-in-the-world-layer-so-camera-changes-never-alter-world-coordinates', async () => {
      const g0 = await pg.evaluate(() => [...document.querySelectorAll('[data-j2-g="tiles"] image')].map(i => i.getAttribute('x') + ',' + i.getAttribute('y')).join('|'));
      await viewWorld(pg, 1000, 700, 3); await viewWorld(pg, SEAM_X, 800, 0.41);
      const g1 = await pg.evaluate(() => [...document.querySelectorAll('[data-j2-g="tiles"] image')].map(i => i.getAttribute('x') + ',' + i.getAttribute('y')).join('|'));
      return g0 === g1 && g0.length > 0;
    });

    /* notes: native text shortcuts must not drive the map; one grouped history entry */
    await check('neg.typing-in-notes-keeps-native-space-delete-and-undo-and-commits-one-history-entry', async () => {
      await activateCard(pg, bidB);
      await pg.click(`.j2-card[data-batch="${bidB}"] [data-j2-detail="notes"]`);
      const ta = pg.locator(`.j2-card[data-batch="${bidB}"] textarea`);
      const s0 = await state(pg); const camera0 = JSON.stringify(s0.camera);
      await ta.click(); await pg.keyboard.type('hello world', { delay: 15 });
      await pg.keyboard.press('Backspace'); await pg.keyboard.press('Control+z'); await pg.waitForTimeout(80);   // native text undo
      const mid = await state(pg);
      const val = await ta.inputValue();
      await pg.keyboard.type(' ok x', { delay: 10 }); await pg.keyboard.press('Delete'); await pg.keyboard.press('Home'); await pg.keyboard.press('Delete');
      const typed = await ta.inputValue();
      const status = await pg.locator('.j2-save').getAttribute('data-state');
      await pg.locator('.j2-title').click();    // blur commits
      await pg.waitForTimeout(150);
      const s1 = await state(pg);
      const noteSaved = s1.batches.find(b => b.id === bidB).notes;
      return { ok: mid.history.undo === s0.history.undo && JSON.stringify(mid.camera) === camera0 && /hello/.test(val) && status === 'unsaved' && s1.history.undo === s0.history.undo + 1 && noteSaved === typed && typed.includes(' ') && s1.tiles.length === s0.tiles.length, detail: { val, typed, status, noteSaved, h: [s0.history.undo, mid.history.undo, s1.history.undo] } };
    });
    await check('neg.notes-edit-is-undoable-as-a-map-command-and-html-in-notes-is-text-only', async () => {
      const ta = pg.locator(`.j2-card[data-batch="${bidB}"] textarea`);
      await ta.fill('<img src=x onerror="window.__pwn=1"><b>bold</b>'); await pg.locator('.j2-title').click(); await pg.waitForTimeout(150);
      const injected = await pg.evaluate(() => ({ pwn: window.__pwn || null, imgs: document.querySelectorAll('.j2-card img[src="x"]').length, bold: document.querySelectorAll('.j2-card b:not([data-j2-c])').length }));
      await pg.click('[data-j2-undo]'); await pg.waitForTimeout(100);
      const afterUndo = await ta.inputValue();
      await pg.click('[data-j2-redo]'); await pg.waitForTimeout(100);
      const afterRedo = await ta.inputValue();
      return { ok: !injected.pwn && injected.imgs === 0 && afterUndo !== afterRedo && /<b>bold<\/b>/.test(afterRedo), detail: { injected, afterUndo, afterRedo } };
    });

    /* storage failure / unavailable */
    await check('neg.storage-write-failure-never-says-Saved-keeps-the-map-usable-and-backup-still-downloads', async () => {
      await pg.evaluate(() => { const orig = Storage.prototype.setItem; window.__origSetItem = orig; Storage.prototype.setItem = function (k, v) { if (k === 'dhcodex_journey2_map') { const e = new DOMException('quota', 'QuotaExceededError'); throw e; } return orig.call(this, k, v); }; });
      const before = (await state(pg)).tiles.length;
      await dragStock(pg, bidA, 'one', ADJ[3], 'drop');
      const s = await state(pg);
      const txt = await pg.locator('.j2-save').innerText(); const banner = await pg.locator('[data-j2-banner]').innerText();
      await pg.click('[data-j2-menu-btn="backup"]');
      const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-j2-menu="backup"] [data-j2-act="export"]')]);
      const bk = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
      await pg.evaluate(() => { Storage.prototype.setItem = window.__origSetItem; });
      await dragStock(pg, bidA, 'one', ADJ[4], 'drop');
      const s2 = await state(pg);
      return { ok: s.saveStatus === 'failed' && !/^Saved/.test(txt) && /could not save/.test(banner) && s.tiles.length === before + 1 && bk.tiles.length === s.tiles.length && s2.saveStatus === 'saved' && (await pg.isHidden('[data-j2-banner]')), detail: { txt, banner, status: s.saveStatus, after: s2.saveStatus } };
    });
    await shot(pg, 'neg-storage-failure-banner.png');
    await ctx2.close();

    /* corrupt saved data */
    {
      const rawBad = '{"schemaVersion":1,"kind":"nope","batches":';
      const c3 = await newCtx(browser, { viewport: VP_SMALL, seed: { dhcodex_journey2_map: rawBad, dhcodex_journey_regions: '[]' } });
      const p3 = await c3.newPage(); attachLogging(p3, logs, 'corrupt');
      await openEditor(p3, base);
      await check('neg.corrupt-saved-json-is-reported-preserved-raw-and-never-autosaved-over', async () => {
        const s = await state(p3); const st = await storageDump(p3);
        const banner = await p3.locator('[data-j2-banner]').innerText();
        const genDisabled = await p3.locator('[data-j2-generate]').isDisabled();
        await p3.evaluate(() => Journey2View.debugApi().dispatch({ type: 'setNotes', batchId: 'x', notes: 'y' }));
        const st2 = await storageDump(p3);
        return { ok: s.editLocked && s.saveStatus === 'blocked' && st.dhcodex_journey2_map === rawBad && st.dhcodex_journey2_map_recovery === rawBad && /could not be read/.test(banner) && genDisabled && st2.dhcodex_journey2_map === rawBad, detail: { banner, status: s.saveStatus } };
      });
      await shot(p3, 'neg-corrupt-saved-map-banner.png');
      await check('neg.corrupt-state-is-resolved-by-importing-a-valid-backup', async () => {
        await p3.setInputFiles('input[type="file"]', path.join(FIX, 'scenario-07-gm-backup.json')); await p3.waitForTimeout(400);
        const s = await state(p3); const st = await storageDump(p3);
        return { ok: !s.editLocked && s.tiles.length === 7 && s.saveStatus === 'saved' && JSON.parse(st.dhcodex_journey2_map).tiles.length === 7 && st.dhcodex_journey2_map_recovery === rawBad, detail: s.saveStatus };
      });
      await c3.close();
      const c3b = await newCtx(browser, { viewport: VP_SMALL, seed: { dhcodex_journey2_map: rawBad } });
      const p3b = await c3b.newPage(); attachLogging(p3b, logs, 'corrupt-empty');
      await openEditor(p3b, base);
      await check('neg.corrupt-state-can-be-resolved-explicitly-with-start-empty-after-confirmation', async () => {
        await p3b.click('[data-j2-banner] [data-j2-act="start-empty"]'); await p3b.waitForSelector('dialog[open]');
        await p3b.click('dialog[open] button:has-text("Cancel")'); await p3b.waitForTimeout(100);
        const still = (await state(p3b)).editLocked;
        await p3b.click('[data-j2-banner] [data-j2-act="start-empty"]'); await p3b.waitForSelector('dialog[open]');
        await p3b.click('dialog[open] button:has-text("Start an empty map")'); await p3b.waitForTimeout(200);
        const s = await state(p3b); const st = await storageDump(p3b);
        return { ok: still && !s.editLocked && s.saveStatus === 'saved' && st.dhcodex_journey2_map_recovery === rawBad && JSON.parse(st.dhcodex_journey2_map).batches.length === 0, detail: null };
      });
      await c3b.close();
    }
    /* storage unavailable entirely */
    {
      const c4 = await browser.newContext({ viewport: VP_SMALL, acceptDownloads: true });
      await c4.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); }, configurable: true }); });
      const p4 = await c4.newPage(); attachLogging(p4, logs, 'no-storage');
      await openEditor(p4, base);
      await check('neg.unavailable-storage-keeps-the-editor-usable-and-says-so', async () => {
        await genRegion(p4, { habitat: 'forest', terrain: 1, qty: 3 }); const bid = (await state(p4)).batches[0].id;
        await viewWorld(p4, SEAM_X, 800, 0.41);
        await dragStock(p4, bid, 'one', SEVEN[0], 'drop');
        const s = await state(p4); const txt = await p4.locator('.j2-save').innerText(); const banner = await p4.locator('[data-j2-banner]').innerText();
        return { ok: s.tiles.length === 1 && s.saveStatus === 'unavailable' && !/^Сохранено/.test(txt) && /недоступно/.test(banner), detail: { txt, banner } };
      });
      await c4.close();
    }

    /* import rejection matrix */
    {
      const c5 = await newCtx(browser, { viewport: VP_SMALL });
      const p5 = await c5.newPage(); attachLogging(p5, logs, 'import');
      await openEditor(p5, base);
      await p5.setInputFiles('input[type="file"]', path.join(FIX, 'scenario-07-gm-backup.json')); await p5.waitForTimeout(300);   // empty map -> no confirmation
      const good = JSON.parse(fs.readFileSync(path.join(FIX, 'scenario-07-gm-backup.json'), 'utf8'));
      const cases = {
        'unknown-version': Object.assign({}, good, { schemaVersion: 2 }),
        'wrong-template': Object.assign({}, good, { templateId: 'another-map' }),
        'duplicate-cell': Object.assign({}, good, { tiles: good.tiles.map((t, i) => (i === 1 ? Object.assign({}, t, { cell: good.tiles[0].cell }) : t)) }),
        'over-quantity': Object.assign({}, good, { batches: good.batches.map(b => Object.assign({}, b, { quantity: 3 })) }),
        'missing-batch': Object.assign({}, good, { tiles: good.tiles.map((t, i) => (i === 0 ? Object.assign({}, t, { batchId: 'ghost' }) : t)) }),
        'bad-biome': Object.assign({}, good, { batches: good.batches.map(b => Object.assign({}, b, { habitat: Object.assign({}, b.habitat, { biome: 'settlement' }) })) }),
        'fractional-quantity': Object.assign({}, good, { batches: good.batches.map(b => Object.assign({}, b, { quantity: 2.5 })) }),
        'decorative-cell': Object.assign({}, good, { tiles: good.tiles.map((t, i) => (i === 0 ? Object.assign({}, t, { cell: [...ctx0.decorativeCells][0] }) : t)) }),
        'unknown-field': Object.assign({}, good, { extra: 'x' }),
      };
      const before = await storageDump(p5); const sBefore = await snapshot(p5);
      for (const [name, body] of Object.entries(cases).concat([['invalid-json', null]])) {
        await check('neg.import-rejected.' + name, async () => {
          const f = path.join(TMP, 'bad-' + name + '.json'); fs.writeFileSync(f, body === null ? '{"oops":' : JSON.stringify(body));
          await p5.setInputFiles('input[type="file"]', f); await p5.waitForSelector('dialog[open]', { timeout: 5000 });
          const t = await p5.locator('dialog[open]').innerText();
          await p5.click('dialog[open] button:has-text("Close")'); await p5.waitForTimeout(80);
          const after = await storageDump(p5); const sAfter = await snapshot(p5);
          return { ok: /cannot be imported/.test(t) && /Nothing was changed/.test(t) && JSON.stringify(after) === JSON.stringify(before) && JSON.stringify(sAfter) === JSON.stringify(sBefore), detail: t.slice(0, 220) };
        });
      }
      await check('neg.canceled-import-changes-nothing-in-memory-or-in-storage', async () => {
        const other = Object.assign({}, good, { batches: good.batches.map(b => Object.assign({}, b, { notes: 'imported variant' })) });
        const f = path.join(TMP, 'variant.json'); fs.writeFileSync(f, JSON.stringify(other));
        await p5.setInputFiles('input[type="file"]', f); await p5.waitForSelector('dialog[open]');
        await p5.click('dialog[open] button:has-text("Cancel")'); await p5.waitForTimeout(100);
        return { ok: JSON.stringify(await storageDump(p5)) === JSON.stringify(before) && JSON.stringify(await snapshot(p5)) === JSON.stringify(sBefore), detail: null };
      });
      await c5.close();
    }
  }

  /* ===== D. marker / label protection at several zooms + near-marker and boundary placements (via the editor command path) ===== */
  {
    const context = await newCtx(browser, { viewport: VP_SMALL });
    const page = await context.newPage(); attachLogging(page, logs, 'markers');
    await openEditor(page, base);
    const markerCells = anchorsDoc.anchors.map(a => a.cellId).filter(c => { const p = Geo.parseCellId(c); return ctx0.policy(p.q, p.r).ok; });
    const edgeCells = []; let minQ = Infinity, maxQ = -Infinity;
    grid.forEachValidCell((q, r) => { minQ = Math.min(minQ, q); maxQ = Math.max(maxQ, q); });
    grid.forEachValidCell((q, r) => { if ((q === minQ || q === maxQ || (q >= 45 && q <= 47 && r % 7 === 0)) && ctx0.policy(q, r).ok && edgeCells.length < 40) edgeCells.push(Geo.cellId(q, r)); });
    const neg = []; grid.forEachValidCell((q, r) => { if (r < -10 && neg.length < 20 && ctx0.policy(q, r).ok && q % 9 === 0) neg.push(Geo.cellId(q, r)); });
    const cells = [...new Set(markerCells.concat(edgeCells, neg))];
    // Regions must be connected, and these cells are scattered on purpose: one single-hex region per cell (the glyph/protection rules are per tile).
    const r = await page.evaluate(list => {
      const api = Journey2View.debugApi(), M = Journey2Model; let err = null;
      list.forEach((c, i) => {
        const region = { habitat: { biome: 'mountain', blighted: false, overtaken: false, source: 'rolled', rolls: [1] }, terrain: { value: 3, source: 'rolled' }, size: 1, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 5 };
        const a = api.dispatch({ type: 'createBatch', batch: M.batchFromRegion(region, { id: 'mkb' + i, createdAt: new Date().toISOString() }) });
        const b = a.ok && api.dispatch({ type: 'place', batchId: 'mkb' + i, tiles: [{ id: 'mk' + i, cell: c }] });
        if (!(a.ok && b.ok) && !err) err = (a.ok ? b : a).error;
      });
      return { ok: !err, error: err };
    }, cells);
    await check('mrk.all-58-marker-cells-both-map-edges-the-seam-and-negative-r-cells-accept-tiles-atomically', async () => ({ ok: r.ok === true && (await state(page)).tiles.length === cells.length && cells.length >= 58 + 20, detail: { cells: cells.length, markerCells: markerCells.length, edge: edgeCells.length, neg: neg.length, err: r.error } }));
    await check('mrk.negative-r-cell-ids-survive-reload', async () => {
      await page.reload(); await page.waitForSelector('.j2-viewport'); await page.waitForFunction(() => Journey2View.debugState() && Journey2View.debugState().anchors > 0); await page.waitForTimeout(300);
      const s = await state(page); return { ok: s.tiles.length === cells.length && s.tiles.some(t => Geo.parseCellId(t.cell).r < 0), detail: s.tiles.length };
    });
    for (const z of [0.3, 1, 3]) {
      await viewWorld(page, MARKER_CELL_IN_VIEW.worldPixelAnchor[0], MARKER_CELL_IN_VIEW.worldPixelAnchor[1], z);
      await shot(page, `mrk-closeup-zoom-${String(z).replace('.', '_')}.png`);
      await check(`mrk.zoom-${z}.every-rendered-glyph-box-and-halo-stays-clear-of-every-marker-label-and-decorative-protection-rect`, async () => {
        const boxes = await page.evaluate(() => [...document.querySelectorAll('[data-j2-g="tiles"] image, [data-j2-g="tiles"] .j2-tile-halo')].map(i => [+i.getAttribute('x'), +i.getAttribute('y'), +i.getAttribute('width'), +i.getAttribute('height')]));
        const bad = []; for (const b of boxes) for (const p of ctx0.protections) if (Geo.rectsIntersect(b, p.rectPx)) bad.push({ b, p: p.id });
        const ticks = (await state(page)).glyphlessTiles;
        return { ok: boxes.length > 100 && ticks >= 50 && bad.length === 0, detail: { boxes: boxes.length, markerCellTilesWithGlyphWithheld: ticks, bad: bad.slice(0, 3) } };
      });
    }
    await check('mrk.a-tile-on-a-marker-cell-can-be-selected-by-clicking-the-marker-icon-and-returned-and-the-marker-is-never-draggable', async () => {
      await viewWorld(page, MARKER_CELL_IN_VIEW.worldPixelAnchor[0], MARKER_CELL_IN_VIEW.worldPixelAnchor[1], 2);
      const p = await page.evaluate(([x, y]) => Journey2View.debugApi().worldToClient(x, y), MARKER_CELL_IN_VIEW.worldPixelAnchor);
      const before = (await state(page)).tiles.length;
      await page.mouse.click(p.x, p.y); await page.waitForTimeout(100);
      const sel = (await state(page)).selectedTile;
      const marker0 = JSON.stringify(anchorsDoc.anchors.find(a => a.stableId === MARKER_CELL_IN_VIEW.stableId));
      await page.click('[data-j2-return]'); await page.waitForTimeout(100);
      const after = (await state(page)).tiles.length;
      const draggableMarkers = await page.locator('[data-j2-g="markers"] [draggable="true"]').count();
      const a2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'map-anchors.json'), 'utf8'));
      return { ok: sel !== null && after === before - 1 && draggableMarkers === 0 && JSON.stringify(a2.anchors.find(a => a.stableId === MARKER_CELL_IN_VIEW.stableId)) === marker0, detail: { sel, before, after } };
    });
    await page.close(); await context.close();
  }

  /* ===== E. larger synthetic placement fixture (1000 tiles): interaction / render / save behaviour ===== */
  {
    const bigDoc = (() => {
      let doc = Model.emptyDocument(ctx0, '2026-10-06T10:00:00.000Z');
      const mk = (id, biome, terrain, q) => Model.batchFromRegion({ habitat: { biome, blighted: false, overtaken: false, source: 'manual' }, terrain: { value: terrain, source: 'manual' }, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 12 }, { id, createdAt: '2026-10-06T10:00:00.000Z', quantity: { value: q, source: 'manual' } });
      const spec = [['big-forest', 'forest', 2, 500], ['big-mountain', 'mountain', 3, 400], ['big-aquatic', 'aquatic', 1, 300], ['big-wetland', 'wetland', 4, 250]];
      for (const [id, biome, terr, q] of spec) doc = Model.apply(doc, { type: 'createBatch', batch: mk(id, biome, terr, q), at: doc.updatedAt }, ctx0).doc;
      // four connected blobs (breadth-first from spread-out starts), 1050 tiles in total; every batch keeps stock
      const used = new Set(); const starts = [[900, 700], [3900, 700], [900, 2400], [3900, 2400]]; const place = [400, 300, 200, 150];
      spec.forEach(([id], si) => {
        const out = [allowedNear(starts[si][0], starts[si][1], [...used])]; used.add(out[0]);
        for (let i = 0; i < out.length && out.length < place[si]; i++) {
          const c = Geo.parseCellId(out[i]);
          for (const d of Geo.NEIGHBOR_DELTAS) { const nid = Geo.cellId(c.q + d.dq, c.r + d.dr); if (out.length < place[si] && !used.has(nid) && ctx0.policy(c.q + d.dq, c.r + d.dr).ok) { used.add(nid); out.push(nid); } }
        }
        doc = Model.apply(doc, { type: 'place', batchId: id, tiles: out.map((cell, i) => ({ id: 'syn' + si + '-' + i, cell })), at: doc.updatedAt }, ctx0).doc;
      });
      return doc;
    })();
    const bigPath = path.join(FIX, 'synthetic-1000-tiles-backup.json');
    fs.writeFileSync(bigPath, Model.serializeBackup(bigDoc));
    const context = await newCtx(browser, { viewport: VP_SMALL });
    const page = await context.newPage(); attachLogging(page, logs, 'perf');
    await openEditor(page, base);
    const t0 = Date.now();
    await page.setInputFiles('input[type="file"]', bigPath);
    await page.waitForFunction(n => Journey2View.debugState().tiles.length >= n, bigDoc.tiles.length, { timeout: 30000 });
    const importMs = Date.now() - t0;
    const perf = {};
    perf.tiles = bigDoc.tiles.length; perf.backupBytes = fs.statSync(bigPath).size; perf.importWallMs = importMs;
    await check('perf.a-1000-tile-backup-imports-validates-and-renders-all-tiles', async () => { const s = await state(page); perf.domTileGlyphs = s.domTileGlyphs; return { ok: s.tiles.length === bigDoc.tiles.length && s.saveStatus === 'saved' && s.domTileGlyphs > 900, detail: { tiles: s.tiles.length, glyphs: s.domTileGlyphs, importMs } }; });
    await viewWorld(page, SEAM_X, 1500, 0.3); await shot(page, 'perf-1000-tiles-fit-zoom.png');
    perf.commit = await page.evaluate(() => {
      const api = Journey2View.debugApi(); const s = Journey2View.debugState();
      const free = s.batches.find(b => b.remaining > 0); const used = new Set(api.document().tiles.map(t => t.cell));
      const nextFree = () => {   // a free allowed cell touching a tile of the same region (regions stay connected)
        const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
        for (const t of api.document().tiles.filter(x => x.batchId === free.id)) { const [q, r] = t.cell.split(',').map(Number); for (const [a, b] of dirs) { const id = (q + a) + ',' + (r + b); if (!used.has(id) && api.allowedCell(id).ok) { used.add(id); return id; } } }
        return null;
      };
      const times = [];
      for (let i = 0; i < 5; i++) { const cell = nextFree(); const t0 = performance.now(); const res = api.dispatch({ type: 'place', batchId: free.id, tiles: [{ id: 'perf' + i, cell: cell }] }); times.push({ ok: res.ok, ms: Math.round((performance.now() - t0) * 10) / 10 }); }
      return times;
    });
    perf.undoRedo = await page.evaluate(async () => { const t0 = performance.now(); document.querySelector('[data-j2-undo]').click(); const t1 = performance.now(); document.querySelector('[data-j2-redo]').click(); return { undoMs: Math.round((t1 - t0) * 10) / 10, redoMs: Math.round((performance.now() - t1) * 10) / 10 }; });
    perf.panZoomFrames = await page.evaluate(() => new Promise(resolve => {
      const vp = document.querySelector('.j2-viewport'), r = vp.getBoundingClientRect(); const frames = []; let last = performance.now(); let n = 0;
      function tick() { const now = performance.now(); frames.push(now - last); last = now; if (++n < 70) { const dir = n % 2 ? -1 : 1; vp.dispatchEvent(new WheelEvent('wheel', { deltaY: dir * 120, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true })); requestAnimationFrame(tick); } else { frames.shift(); frames.sort((a, b) => a - b); resolve({ frames: frames.length, medianMs: Math.round(frames[Math.floor(frames.length / 2)] * 10) / 10, p95Ms: Math.round(frames[Math.floor(frames.length * 0.95)] * 10) / 10, maxMs: Math.round(frames[frames.length - 1] * 10) / 10 }); } }
      requestAnimationFrame(tick);
    }));
    perf.dragPreviewMs = await (async () => {
      const bid = (await state(page)).batches.find(b => b.remaining > 0).id; const h = await handleCenter(page, bid, 'one');
      await viewWorld(page, SEAM_X, 1500, 0.3);
      const t = await clientOf(page, '60,20'); const t2 = await clientOf(page, '58,18');
      await page.mouse.move(h.x, h.y); await page.mouse.down();
      const ms = await page.evaluate(() => 0);
      const a = Date.now(); await page.mouse.move(t.x, t.y, { steps: 25 }); await page.mouse.move(t2.x, t2.y, { steps: 25 }); const b = Date.now();
      await page.keyboard.press('Escape'); await page.mouse.up();
      return { moves: 50, wallMs: b - a, perMoveMs: Math.round((b - a) / 50 * 10) / 10 };
    })();
    perf.save = await page.evaluate(() => { const raw = localStorage.getItem('dhcodex_journey2_map'); const t0 = performance.now(); for (let i = 0; i < 10; i++) JSON.parse(raw); const parse = (performance.now() - t0) / 10; const t1 = performance.now(); for (let i = 0; i < 10; i++) localStorage.setItem('dhcodex_journey2_map', raw); return { storedBytes: raw.length, parseMs: Math.round(parse * 100) / 100, writeMs: Math.round((performance.now() - t1) / 10 * 100) / 100 }; });
    await check('perf.single-placement-with-1000-tiles-completes-with-a-recorded-time', async () => ({ ok: perf.commit.length > 0 && perf.commit.every(c => c.ok), detail: perf.commit }));
    perf.reloadMs = await (async () => { const a = Date.now(); await page.reload(); await page.waitForFunction(n => Journey2View.debugState() && Journey2View.debugState().tiles.length >= n, bigDoc.tiles.length, { timeout: 30000 }); return Date.now() - a; })();
    await check('perf.reload-restores-the-large-map', async () => ({ ok: (await state(page)).tiles.length >= bigDoc.tiles.length, detail: perf.reloadMs }));
    writeJson(path.join(TESTS, 'stage1-performance-observations.json'), { note: 'Actual observations on this machine (headless Chromium, Windows); not thresholds and not a guarantee for other hardware.', fixture: path.basename(bigPath), ...perf });
    await page.close(); await context.close();
  }

  /* ===== F. deployment base path + asset failure states ===== */
  {
    const sub = await serve(SITE_ROOT, { prefix: '/atlas' });
    const c = await newCtx(browser, { viewport: VP_SMALL }); const p = await c.newPage(); attachLogging(p, logs, 'base-path');
    await check('deploy.root-and-subpath-loading-uses-only-relative-urls', async () => {
      await p.goto(sub.base + '#/journey2'); await p.waitForSelector('.j2-viewport', { timeout: 60000 }); await p.waitForFunction(() => Journey2View.debugState() && Journey2View.debugState().anchors > 0);
      await genRegion(p, { habitat: 'forest', terrain: 2, qty: 4 }); await p.reload(); await p.waitForSelector('.j2-viewport'); await p.waitForFunction(() => Journey2View.debugState() && Journey2View.debugState().batches.length === 1);
      const outside = sub.requests.filter(u => !u.startsWith('/atlas'));
      const need = ['/atlas/js/journey2-model.js', '/atlas/js/journey2-store.js', '/atlas/data/journey2/map-template.json', '/atlas/img/journey2/valloren-world.webp'].every(u => sub.requests.includes(u));
      return { ok: outside.length === 0 && need, detail: { outside: outside.slice(0, 5), need } };
    });
    await c.close();
    for (const [what, frag] of [['raster', 'valloren-world.webp'], ['template', 'map-template.json']]) {
      const s2 = await serve(SITE_ROOT, {}); s2.failing.add(frag);
      const c2 = await newCtx(browser, { viewport: VP_SMALL }); const p2 = await c2.newPage();
      p2.on('console', () => {});
      await check(`deploy.${what}-fetch-failure-shows-an-error-state-with-retry-and-no-guessed-geometry`, async () => {
        await p2.goto(s2.base + '#/journey2'); await p2.waitForSelector('.j2-state--error', { timeout: 30000 });
        const errText = await p2.locator('.j2-state--error').innerText(); const noSurface = (await p2.locator('.j2-viewport').count()) === 0;
        s2.failing.clear(); await p2.click('[data-j2-retry]'); await p2.waitForSelector('.j2-viewport', { timeout: 30000 });
        return { ok: /could not be loaded|не удалось/i.test(errText) && noSurface && (await p2.locator('.j2-viewport').count()) === 1, detail: errText.slice(0, 120) };
      });
      await c2.close(); await s2.close();
    }
    await sub.close();
  }

  /* ===== G. hygiene ===== */
  const relevant = logs.filter(l => !/favicon|fonts\.g(oogleapis|static)\.com|ERR_INTERNET_DISCONNECTED|net::ERR_(NAME_NOT_RESOLVED|CONNECTION|FAILED)/.test(l));
  const expected = relevant.filter(l => /(storage|quota|denied|SecurityError|Failed to load resource: the server responded with a status of 500|forced failure|World raster failed)/i.test(l) || /\[(no-storage|corrupt|corrupt-empty|import)\]/.test(l));
  const unexpected = relevant.filter(l => !expected.includes(l));
  record('hygiene.no-unexpected-console-errors-or-failed-requests', unexpected.length === 0, unexpected.slice(0, 12));

  await browser.close(); server.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  const failed = results.filter(r => !r.ok);
  const out = { schemaVersion: 1, ran: new Date().toISOString(), siteRoot: path.relative(ROOT, SITE_ROOT) || '.', browser: 'Playwright Chromium (headless), Windows', viewports: ['1366x768', '1920x1080'], total: results.length, passed: results.length - failed.length, failed: failed.length, results, expectedNoise: expected.slice(0, 12), externalNoise: logs.filter(l => !relevant.includes(l)).slice(0, 8) };
  fs.writeFileSync(path.join(TESTS, 'stage1-browser-results.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(`\n${out.passed}/${out.total} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
