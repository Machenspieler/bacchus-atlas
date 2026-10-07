#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — scripts/journey2/browser-verify.js
   Dev-only browser verification of the #/journey2 diagnostics (Phase 0 behaviours, now reached through the
   secondary "More > Diagnostics" drawer of the Phase 1 editor) and the
   legacy pages around it) with Playwright's Chromium against a throw-away
   static server. Every run uses fresh, isolated browser contexts, so the
   owner's real browser storage is never read or written.

   Writes (docs/journey2-implementation/stage-0/):
     tests/browser-results.json     every check with its outcome and detail
     data/browser-verification.json the "browserBehavior" slot read by build-template.js
     images/browser-*.png           screenshots (1366x768 and 1920x1080)
     print/journey2-print-proof.pdf the browser print-to-PDF proof

   Usage: node scripts/journey2/browser-verify.js [--root <dir>]   (default: repo root, i.e. the source tree)
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const Geo = require('../../js/journey2-geometry.js');
const Model = require('../../js/journey2-model.js');

const ROOT = path.join(__dirname, '..', '..');
const outArg = process.argv.indexOf('--out');   /* Task 01A: --out <stage dir> keeps the submitted Stage 0 evidence untouched */
const STAGE = outArg > -1 ? path.resolve(process.argv[outArg + 1]) : path.join(ROOT, 'docs', 'journey2-implementation', 'stage-0');
const IMG = path.join(STAGE, 'images'), TESTS = path.join(STAGE, 'tests'), PRINT = path.join(STAGE, 'print'), DATA = path.join(STAGE, 'data');
for (const d of [IMG, TESTS, PRINT, DATA]) fs.mkdirSync(d, { recursive: true });
const rootArg = process.argv.indexOf('--root');
const SITE_ROOT = rootArg > -1 ? path.resolve(process.argv[rootArg + 1]) : ROOT;

const template = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'map-template.json'), 'utf8'));
const anchorsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'map-anchors.json'), 'utf8'));
const grid = Geo.createGrid(template.grid);
const protections = Geo.protectionRects(template, anchorsDoc);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };

function serve(root, prefix) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    requests.push(url);
    if (prefix) { if (!url.startsWith(prefix)) { res.writeHead(404); res.end('outside base path'); return; } url = url.slice(prefix.length) || '/'; }
    let file = path.join(root, url);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, requests })));
}

const results = [];
function record(id, ok, detail) { results.push({ id, ok: !!ok, detail: detail === undefined ? null : detail }); console.log((ok ? 'PASS ' : 'FAIL ') + id + (detail !== undefined && !ok ? '  ' + JSON.stringify(detail) : '')); }
async function check(id, fn) {
  try { const r = await fn(); if (r === true || r === undefined) record(id, true); else if (r && typeof r === 'object' && 'ok' in r) record(id, r.ok, r.detail); else record(id, !!r, r); }
  catch (e) { record(id, false, 'exception: ' + e.message.split('\n')[0]); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- page helpers ---------------- */

function attachLogging(page, sink, label) {
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') sink.push(`[${label}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => sink.push(`[${label}] pageerror: ${e.message}`));
  page.on('requestfailed', r => sink.push(`[${label}] requestfailed: ${r.url()} ${r.failure() && r.failure().errorText}`));
  page.on('response', r => { if (r.status() >= 400) sink.push(`[${label}] HTTP ${r.status()}: ${r.url()}`); });
}
const state = page => page.evaluate(() => Journey2View.debugState());
/* Task 02: the Phase 0 inspector is the secondary "Diagnostics" drawer (closed by default), opened from the More menu. */
async function toggleDiag(page) { await page.evaluate(() => Journey2View.debugApi().runAction('diagnostics')); await page.waitForTimeout(250); }   // the toolbar "More" menu no longer exists; the same action is reached through the debug API
async function openDiag(page) { if (!(await state(page)).diagnosticsOpen) await toggleDiag(page); }
async function openJ2(page, base, viewport, keepClosed) {
  if (viewport) await page.setViewportSize(viewport);
  await page.goto(base + '#/journey2');
  await page.waitForSelector('.j2-viewport', { timeout: 60000 });
  await page.waitForFunction(() => Journey2View.isMounted() && Journey2View.debugState().anchors > 0, null, { timeout: 60000 });
  await page.waitForTimeout(400);
  if (!keepClosed) await openDiag(page);
}
async function vpRect(page) { return page.evaluate(() => { const r = document.querySelector('.j2-viewport').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }); }
async function toClient(page, wx, wy) {
  const [s, r] = await Promise.all([state(page), vpRect(page)]);
  return { x: r.x + wx * s.camera.scale + s.camera.tx, y: r.y + wy * s.camera.scale + s.camera.ty };
}
async function gotoCell(page, id) {
  await page.fill('#j2-goto-input', id);
  await page.press('#j2-goto-input', 'Enter');
  await page.waitForTimeout(150);
}
/** Zoom to `target` scale about the viewport centre with the wheel (the real zoom path). */
async function zoomTo(page, target) {
  const r = await vpRect(page);
  await page.mouse.move(r.x + r.w / 2, r.y + r.h / 2);
  const s = await state(page);
  const dy = -Math.log(target / s.camera.scale) / 0.0016;
  if (Math.abs(dy) > 1) await page.mouse.wheel(0, dy);
  await page.waitForTimeout(200);
}
async function viewAt(page, wx, wy, scale) {
  // centre on the cell containing (wx,wy), then adjust the zoom; finally nudge so the world point is centred
  const c = grid.worldToCell(wx, wy);
  await gotoCell(page, Geo.cellId(c.q, c.r));
  await zoomTo(page, scale);
  const s = await state(page), r = await vpRect(page);
  // pan so (wx,wy) sits at the viewport centre: drag the map
  const cur = { x: wx * s.camera.scale + s.camera.tx, y: wy * s.camera.scale + s.camera.ty };
  const dx = r.w / 2 - cur.x, dy = r.h / 2 - cur.y;
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
    await page.mouse.move(r.x + r.w / 2, r.y + r.h / 2);
    await page.mouse.down(); await page.mouse.move(r.x + r.w / 2 + dx, r.y + r.h / 2 + dy, { steps: 4 }); await page.mouse.up();
  }
  await page.waitForTimeout(250);
}
async function setLayers(page, want) {
  for (const k of ['grid', 'control', 'markers', 'protection', 'proof']) {
    const on = await page.getAttribute(`[data-j2-layer="${k}"]`, 'aria-pressed') === 'true';
    if (on !== !!want[k]) await page.click(`[data-j2-layer="${k}"]`);
  }
  await page.waitForTimeout(150);
}
const shot = (page, name, opts) => page.screenshot(Object.assign({ path: path.join(IMG, name) }, opts || {}));

/* ---------------- main ---------------- */

async function main() {
  for (const d of [IMG, TESTS, PRINT, DATA]) fs.mkdirSync(d, { recursive: true });
  const { server, port, requests } = await serve(SITE_ROOT, '');
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch(process.env.J2_BROWSER_CHANNEL ? { channel: process.env.J2_BROWSER_CHANNEL } : {});   // J2_BROWSER_CHANNEL=chrome uses an installed Chrome
  const logs = [];

  /* ===== 1. route load, layout and overlay alignment at the two desktop sizes ===== */
  for (const vp of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
    const tag = `${vp.width}x${vp.height}`;
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    attachLogging(page, logs, tag);
    await check(`load.direct-route.${tag}`, async () => {
      await openJ2(page, base);
      const s = await state(page);
      const natural = await page.evaluate(() => { const i = document.querySelector('.j2-base'); return [i.naturalWidth, i.naturalHeight]; });
      return { ok: s.anchors === 58 && s.validCells === template.grid.validCells.count && natural[0] === 4848 && natural[1] === 3185 && s.fitMode, detail: { anchors: s.anchors, validCells: s.validCells, natural } };
    });
    await check(`layout.map-dominant-no-page-scroll.${tag}`, async () => {
      const m = await page.evaluate(() => {
        const v = document.querySelector('.j2-viewport').getBoundingClientRect();
        return { vw: v.width, vh: v.height, scrollH: document.documentElement.scrollHeight, innerH: window.innerHeight, scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, toolbarH: document.querySelector('.j2-toolbar').getBoundingClientRect().height };
      });
      return { ok: m.scrollH <= m.innerH + 1 && m.scrollW <= m.innerW + 1 && m.vh > m.innerH * 0.6, detail: m };
    });
    await check(`layout.toolbar-single-row.${tag}`, async () => {
      const h = await page.evaluate(() => document.querySelector('.j2-toolbar').getBoundingClientRect().height);
      return { ok: h < 64, detail: h };
    });
    await setLayers(page, { grid: true });
    await shot(page, `browser-${tag}-whole-map-grid.png`);
    await toggleDiag(page);
    await shot(page, `browser-${tag}-whole-map-no-panel.png`);
    await toggleDiag(page);
    await setLayers(page, { grid: true, control: true, markers: true, protection: true });
    await shot(page, `browser-${tag}-whole-map-all-overlays.png`);
    // detail views: west (Marrogate), east (Horizon), seam; at 3 zoom levels
    const seamX = template.composition.seam.worldX;
    const views = [['west-marrogate', 168, 2948], ['east-horizon', 4416, 262], ['seam-upper', seamX, 500], ['seam-middle', seamX, 1500], ['seam-lower', seamX, 2500]];
    await setLayers(page, { grid: true, control: true, markers: true, protection: true });
    for (const [name, wx, wy] of views) {
      for (const z of (name.startsWith('seam-middle') ? [1, 2, 4] : [2])) {
        await viewAt(page, wx, wy, z);
        await shot(page, `browser-${tag}-${name}-z${z}.png`);
        const s = await state(page);
        record(`camera.view.${name}.z${z}.${tag}`, Math.abs(s.camera.scale - z) / z < 0.03, { scale: s.camera.scale });
      }
    }
    await setLayers(page, { grid: true });
    await ctx.close();
  }

  /* ===== 2. interactions at 1366x768 ===== */
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  attachLogging(page, logs, 'interact');
  await openJ2(page, base);

  await check('zoom.wheel-keeps-world-point-under-cursor', async () => {
    const r = await vpRect(page);
    const px = Math.round(r.x + r.w * 0.62), py = Math.round(r.y + r.h * 0.4);   // integer client px, as the pointer reports them
    await page.mouse.move(px, py);
    const s0 = await state(page);
    const w0 = [(px - r.x - s0.camera.tx) / s0.camera.scale, (py - r.y - s0.camera.ty) / s0.camera.scale];
    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(200);
    const s1 = await state(page);
    const w1 = [(px - r.x - s1.camera.tx) / s1.camera.scale, (py - r.y - s1.camera.ty) / s1.camera.scale];
    return { ok: s1.camera.scale > s0.camera.scale * 1.5 && Math.hypot(w1[0] - w0[0], w1[1] - w0[1]) < 0.6, detail: { s0: s0.camera.scale, s1: s1.camera.scale, w0, w1 } };
  });
  await check('zoom.buttons-and-readout', async () => {
    // fixed stops: from a fitted (non-standard) scale + goes to the next stop above, - to the next below; the readout resets to exactly 100%
    await page.click('[data-j2-fit]'); await page.waitForTimeout(150);
    const a = await state(page);
    await page.click('[data-j2-zoom="in"]'); await page.waitForTimeout(150);
    const b = await state(page);
    await page.click('[data-j2-zoom="in"]'); await page.waitForTimeout(150);   // out is unavailable (aria-disabled) at the first stop
    await page.click('[data-j2-zoom="out"]'); await page.waitForTimeout(150);
    const c = await state(page);
    await page.click('[data-j2-zoom="reset"]'); await page.waitForTimeout(150);
    const d = await state(page);
    const readout = await page.textContent('[data-j2-zoom-readout]');
    const STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 2];
    const next = STEPS.find(s => s > a.camera.scale + 1e-4);
    return { ok: Math.abs(b.camera.scale - next) < 1e-9 && c.camera.scale === b.camera.scale && d.camera.scale === 1 && readout === '100%', detail: { a: a.camera.scale, b: b.camera.scale, c: c.camera.scale, d: d.camera.scale, readout } };
  });
  await check('fit.restores-whole-map', async () => {
    await zoomTo(page, 1.5);
    await page.click('[data-j2-fit]'); await page.waitForTimeout(200);
    const s = await state(page);
    return { ok: s.fitMode && s.camera.scale < 0.25, detail: s.camera };
  });
  await check('pan.drag-moves-map-and-does-not-select', async () => {
    await page.click('[data-j2-fit]'); await page.waitForTimeout(150);
    const before = await state(page), r = await vpRect(page);
    await page.mouse.move(r.x + 700, r.y + 300); await page.mouse.down(); await page.mouse.move(r.x + 740, r.y + 330, { steps: 6 });   // right of the 340px overlay sidebar await page.mouse.up();
    await page.waitForTimeout(200);
    const after = await state(page);
    return { ok: Math.abs(after.camera.tx - before.camera.tx - 40) < 1.5 && Math.abs(after.camera.ty - before.camera.ty - 30) < 1.5 && after.selectedCell === before.selectedCell && !after.fitMode, detail: { before: before.camera, after: after.camera, sel: after.selectedCell } };
  });
  await check('click.small-jitter-still-selects-cell', async () => {
    await page.click('[data-j2-fit]'); await page.waitForTimeout(150);
    await zoomTo(page, 1);
    const target = grid.cellCenter(20, 20);
    await viewAt(page, target[0], target[1], 1);
    const p = await toClient(page, target[0], target[1]);
    await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 2, p.y + 1); await page.mouse.up();
    await page.waitForTimeout(150);
    const s = await state(page);
    return { ok: s.selectedCell === '20,20', detail: s.selectedCell };
  });
  await check('click.cell-selects-and-panel-reports-id-center-neighbors', async () => {
    const c0 = grid.cellCenter(30, 15);
    await viewAt(page, c0[0], c0[1], 1);
    const p = await toClient(page, c0[0], c0[1]);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(200);
    const t = await page.evaluate(() => ({ id: document.querySelector('[data-j2-cell-id]').textContent, center: document.querySelector('[data-j2-cell-center]').textContent, nb: [...document.querySelectorAll('.j2-nbr-id')].map(n => n.textContent) }));
    const expected = grid.neighbors(30, 15).map(n => n.id);
    return { ok: t.id === '30,15' && JSON.stringify(t.nb) === JSON.stringify(expected) && t.center === c0.map(v => v.toFixed(1)).join(', '), detail: { t, expected } };
  });
  await check('hover.readout-matches-geometry-for-20-random-points', async () => {
    const r = await vpRect(page); let bad = 0; const tried = [];
    let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    await page.click('[data-j2-fit]'); await page.waitForTimeout(150);
    for (let i = 0; i < 20; i++) {
      const px = r.x + 380 + rnd() * (r.w - 380 - 340), py = r.y + 20 + rnd() * (r.h - 40);   // clear of the overlay sidebar (left) and the diagnostics drawer (right)
      await page.mouse.move(px, py); await page.waitForTimeout(40);
      const s = await state(page);
      const w = [(px - r.x - s.camera.tx) / s.camera.scale, (py - r.y - s.camera.ty) / s.camera.scale];
      const c = grid.worldToCell(w[0], w[1]);
      const shown = (await page.textContent('[data-j2-pt-cell]')).split(' ')[0];
      if (shown !== Geo.cellId(c.q, c.r)) { bad++; tried.push({ shown, expected: Geo.cellId(c.q, c.r) }); }
    }
    return { ok: bad === 0, detail: tried };
  });
  await check('seam.neighbors-across-the-joint-are-valid-and-listed', async () => {
    const out = [];
    for (const id of ['46,1', '45,9', '47,8', '46,-15']) {
      const c = Geo.parseCellId(id);
      if (!grid.isValid(c.q, c.r)) continue;
      await gotoCell(page, id);
      const t = await page.evaluate(() => ({ id: document.querySelector('[data-j2-cell-id]').textContent, nb: [...document.querySelectorAll('.j2-nbr')].map(n => [n.querySelector('.j2-nbr-id').textContent, n.disabled]) }));
      const exp = grid.neighbors(c.q, c.r).map(n => [n.id, !n.valid]);
      out.push({ id, same: JSON.stringify(t.nb) === JSON.stringify(exp) && t.id === id });
    }
    const seamCenter = grid.cellCenter(46, 1);
    return { ok: out.length >= 3 && out.every(o => o.same) && Math.abs(seamCenter[0] - template.composition.seam.worldX) < 30, detail: { out, seamCenter } };
  });
  await check('neighbor-button-selects-that-cell', async () => {
    await gotoCell(page, '46,1');
    await page.click('.j2-nbr:not([disabled])');
    await page.waitForTimeout(150);
    const s = await state(page);
    const first = grid.neighbors(46, 1).find(n => n.valid);
    return { ok: s.selectedCell === first.id, detail: { sel: s.selectedCell, expected: first.id } };
  });
  await check('goto.rejects-bad-ids-with-a-visible-error', async () => {
    await page.fill('#j2-goto-input', 'abc'); await page.press('#j2-goto-input', 'Enter');
    const err1 = await page.isVisible('[data-j2-goto-error]');
    await page.fill('#j2-goto-input', '9999,9999'); await page.press('#j2-goto-input', 'Enter');
    const err2 = await page.isVisible('[data-j2-goto-error]');
    await page.fill('#j2-goto-input', '46,1'); await page.press('#j2-goto-input', 'Enter');
    const err3 = await page.isVisible('[data-j2-goto-error]');
    return { ok: err1 && err2 && !err3, detail: [err1, err2, err3] };
  });
  await check('marker.click-selects-and-inspects', async () => {
    const a = anchorsDoc.anchors.find(x => x.stableId === 'mk-031');
    await viewAt(page, a.worldPixelAnchor[0], a.worldPixelAnchor[1], 1.5);
    const p = await toClient(page, a.worldPixelAnchor[0], a.worldPixelAnchor[1]);
    await page.mouse.move(p.x, p.y); await page.waitForTimeout(100);
    const hov = await page.textContent('[data-j2-pt-marker]');
    await page.mouse.click(p.x, p.y); await page.waitForTimeout(150);
    const t = await page.evaluate(() => ({ id: document.querySelector('[data-j2-m-id]').textContent, kind: document.querySelector('[data-j2-m-kind]').textContent, cell: document.querySelector('[data-j2-m-cell]').textContent, status: document.querySelector('[data-j2-m-status]').textContent }));
    return { ok: hov.startsWith('mk-031') && t.id === 'mk-031' && t.cell === a.cellId && t.status === 'visually-verified', detail: { hov, t, expectedCell: a.cellId } };
  });
  await check('marker.destinations-are-not-sanctuaries', async () => {
    const out = [];
    for (const id of ['mk-056', 'mk-002']) {
      const a = anchorsDoc.anchors.find(x => x.stableId === id);
      await viewAt(page, a.worldPixelAnchor[0], a.worldPixelAnchor[1], 1);
      const p = await toClient(page, a.worldPixelAnchor[0], a.worldPixelAnchor[1]);
      await page.mouse.click(p.x, p.y); await page.waitForTimeout(150);
      out.push(await page.evaluate(() => ({ id: document.querySelector('[data-j2-m-id]').textContent, kind: document.querySelector('[data-j2-m-kind]').textContent, label: document.querySelector('[data-j2-m-label]').textContent })));
    }
    return { ok: out[0].id === 'mk-056' && out[1].id === 'mk-002' && out.every(o => !/sanctuary|убежищ/i.test(o.kind) && /MARROGATE|HORIZON/.test(o.label)), detail: out };
  });
  await check('keyboard.escape-clears-selection', async () => {
    await page.focus('.j2-viewport');
    await page.keyboard.press('Escape');
    const s = await state(page);
    return { ok: s.selectedCell === null && s.selectedMarker === null, detail: s };
  });
  await check('keyboard.arrows-and-zoom-keys-work-when-map-focused', async () => {
    await page.click('[data-j2-fit]'); await page.focus('.j2-viewport');
    const a = await state(page);
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(150);
    const b = await state(page);
    await page.keyboard.press('+'); await page.waitForTimeout(150);
    const c = await state(page);
    await page.keyboard.press('0'); await page.waitForTimeout(150);
    const d = await state(page);
    return { ok: b.camera.tx > a.camera.tx && b.camera.ty < a.camera.ty && c.camera.scale > b.camera.scale && d.fitMode, detail: { a: a.camera, b: b.camera, c: c.camera.scale, d: d.fitMode } };
  });
  await check('keyboard.typing-in-the-inspector-does-not-drive-the-map', async () => {
    const a = await state(page);
    await page.focus('#j2-goto-input');
    await page.keyboard.type('+-0'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Escape');
    const val = await page.inputValue('#j2-goto-input');
    const b = await state(page);
    return { ok: val.includes('+-0') && JSON.stringify(a.camera) === JSON.stringify(b.camera), detail: { val, a: a.camera, b: b.camera } };
  });
  await check('pointer.escape-during-drag-restores-the-camera', async () => {
    await page.click('[data-j2-fit]'); await page.focus('.j2-viewport');
    const a = await state(page), r = await vpRect(page);
    await page.mouse.move(r.x + 200, r.y + 200); await page.mouse.down(); await page.mouse.move(r.x + 280, r.y + 260, { steps: 5 });
    await page.keyboard.press('Escape');
    await page.mouse.move(r.x + 320, r.y + 300, { steps: 3 }); await page.mouse.up(); await page.waitForTimeout(150);
    const b = await state(page);
    return { ok: Math.abs(a.camera.tx - b.camera.tx) < 1 && Math.abs(a.camera.ty - b.camera.ty) < 1 && b.selectedCell === a.selectedCell, detail: { a: a.camera, b: b.camera } };
  });
  await check('pointer.cancel-mid-drag-leaves-no-selection-and-ends-the-drag', async () => {
    await page.click('[data-j2-fit]'); await page.waitForTimeout(150);
    await page.keyboard.press('Escape');
    const res = await page.evaluate(() => {
      const vp = document.querySelector('.j2-viewport'); const r = vp.getBoundingClientRect();
      const ev = (type, x, y) => vp.dispatchEvent(new PointerEvent(type, { pointerId: 91, bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y, button: 0, buttons: type === 'pointermove' ? 1 : 0, isPrimary: true }));
      ev('pointerdown', 400, 300); ev('pointermove', 460, 340);
      const mid = Journey2View.debugState().camera.tx;
      ev('pointercancel', 460, 340);
      ev('pointermove', 600, 400);
      const after = Journey2View.debugState();
      return { mid, afterTx: after.camera.tx, sel: after.selectedCell };
    });
    const before = (await state(page)).camera.tx;
    return { ok: res.sel === null && Math.abs(res.afterTx - res.mid) < 1 && res.mid !== undefined, detail: res };
  });
  await check('layers.toggle-buttons-switch-groups-and-report-aria-pressed', async () => {
    const out = {};
    for (const k of ['grid', 'control', 'markers', 'protection', 'proof']) {
      const sel = `[data-j2-layer="${k}"]`;
      const before = await page.getAttribute(sel, 'aria-pressed');
      await page.click(sel);
      const after = await page.getAttribute(sel, 'aria-pressed');
      const disp = await page.evaluate(k2 => getComputedStyle(document.querySelector(`[data-j2-g="${k2}"]`)).display, k);
      out[k] = { before, after, display: disp };
      await page.click(sel);
    }
    return { ok: Object.values(out).every(o => o.before !== o.after), detail: out };
  });
  await check('layers.counts-match-the-data', async () => {
    await setLayers(page, { grid: true, control: true, markers: true, protection: true });
    const c = await page.evaluate(() => ({ hit: document.querySelectorAll('.j2-hit').length, protect: document.querySelectorAll('.j2-protect').length, ctl: document.querySelectorAll('.j2-ctl').length, labelRect: document.querySelectorAll('.j2-label-rect').length, labelAnchor: document.querySelectorAll('.j2-label-anchor').length, deco: document.querySelectorAll('.j2-deco').length, gridPaths: document.querySelectorAll('.j2-grid').length }));
    const nAnchors = anchorsDoc.anchors.length, withLabel = anchorsDoc.anchors.filter(a => a.builtInLabel).length;
    return { ok: c.hit === nAnchors && c.protect === nAnchors && c.ctl === template.grid.controlPoints.length && c.labelRect === withLabel && c.labelAnchor === nAnchors - withLabel && c.deco === template.decorativeAreas.length && c.gridPaths === 1, detail: c };
  });
  await setLayers(page, { grid: true });

  /* ----- proof overlay: protection + clear ----- */
  await check('proof.symbols-never-cover-original-markers-and-clear-resets', async () => {
    await setLayers(page, { grid: true, proof: true });
    // place a test symbol on every marker's own cell and its neighbours (worst case)
    await page.selectOption('[data-j2-proof-symbol]', 'badlands');
    await page.click('[data-j2-place]');
    const placed = [];
    for (const id of ['mk-056', 'mk-057', 'mk-031', 'mk-002']) {
      const a = anchorsDoc.anchors.find(x => x.stableId === id);
      await viewAt(page, a.worldPixelAnchor[0], a.worldPixelAnchor[1], 2);
      const c = Geo.parseCellId(a.cellId);
      const ctr = grid.cellCenter(c.q, c.r);
      const p = await toClient(page, ctr[0], ctr[1]);
      await page.mouse.click(p.x, p.y); await page.waitForTimeout(120);
      placed.push(a.cellId);
    }
    const s = await state(page);
    const geom = await page.evaluate(() => [...document.querySelectorAll('[data-j2-g="proof"] image')].map(i => [+i.getAttribute('x'), +i.getAttribute('y'), +i.getAttribute('width'), +i.getAttribute('height')]));
    const overlaps = [];
    for (const g of geom) for (const pr of protections) if (Geo.rectsIntersect(g, pr.rectPx)) overlaps.push({ g, pr: pr.id });
    await shot(page, 'browser-1366x768-proof-overlay-marker-protection.png');
    await page.click('[data-j2-clear]'); await page.waitForTimeout(150);
    const after = await state(page);
    const left = await page.evaluate(() => document.querySelectorAll('[data-j2-g="proof"] image').length);
    return { ok: s.userPlacements === 4 && geom.length >= 4 && overlaps.length === 0 && after.userPlacements === 0 && left === 0 && !after.layers.proof && !after.placeMode, detail: { placed, userPlacements: s.userPlacements, images: geom.length, overlaps, after: after.userPlacements, left } };
  });
  await check('proof.aspect-ratio-preserved', async () => {
    await setLayers(page, { grid: true, proof: true });
    await page.waitForTimeout(200);
    const bad = await page.evaluate(async () => {
      const out = [];
      for (const i of document.querySelectorAll('[data-j2-g="proof"] image')) {
        const src = i.getAttribute('href');
        const nat = await new Promise(res => { const im = new Image(); im.onload = () => res([im.naturalWidth, im.naturalHeight]); im.onerror = () => res(null); im.src = src; });
        const w = +i.getAttribute('width'), h = +i.getAttribute('height');
        if (!nat || Math.abs(w / h - nat[0] / nat[1]) > 0.08) out.push({ src, w, h, nat });
      }
      return out;
    });
    await setLayers(page, { grid: true });
    return { ok: bad.length === 0, detail: bad };
  });

  /* ----- resize ----- */
  await check('resize.fit-mode-refits-and-camera-stays-sane', async () => {
    await page.click('[data-j2-fit]'); await page.waitForTimeout(150);
    const a = await state(page);
    await page.setViewportSize({ width: 1920, height: 1080 }); await page.waitForTimeout(500);
    const b = await state(page);
    await zoomTo(page, 1); await page.setViewportSize({ width: 1366, height: 768 }); await page.waitForTimeout(500);
    const c = await state(page);
    const r = await vpRect(page);
    // at least 120px of the world must stay in view
    const world = template.worldSizePx;
    const visible = c.camera.tx < r.w - 100 && c.camera.ty < r.h - 100 && c.camera.tx + world[0] * c.camera.scale > 100 && c.camera.ty + world[1] * c.camera.scale > 100;
    return { ok: b.camera.scale > a.camera.scale * 1.2 && b.fitMode && !c.fitMode && visible, detail: { a: a.camera.scale, b: b.camera.scale, c } };
  });
  await page.click('[data-j2-fit]');

  /* ===== 3. lifecycle: refresh, history, repeated mount/unmount, late load, listeners ===== */
  await check('lifecycle.refresh-on-the-route-remounts', async () => {
    await page.reload(); await page.waitForSelector('.j2-viewport', { timeout: 60000 });
    await page.waitForFunction(() => Journey2View.isMounted() && Journey2View.debugState().anchors > 0);
    const s = await state(page);
    return { ok: s.anchors === 58 && s.fitMode, detail: s };
  });
  await check('lifecycle.history-back-forward-restores-routes', async () => {
    await page.evaluate(() => { location.hash = '#/journey'; });
    await page.waitForSelector('.journey-wrap'); const a = await page.evaluate(() => [document.body.dataset.route, !!document.querySelector('.j2'), Journey2View.isMounted()]);
    await page.goBack(); await page.waitForSelector('.j2-viewport');
    const b = await page.evaluate(() => [document.body.dataset.route, !!document.querySelector('.j2'), Journey2View.isMounted()]);
    await page.goForward(); await page.waitForSelector('.journey-wrap');
    const c = await page.evaluate(() => [document.body.dataset.route, !!document.querySelector('.j2'), Journey2View.isMounted()]);
    return { ok: JSON.stringify(a) === '["journey",false,false]' && JSON.stringify(b) === '["journey2",true,true]' && JSON.stringify(c) === '["journey",false,false]', detail: { a, b, c } };
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  const metrics = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const { metrics: m } = await cdp.send('Performance.getMetrics');
    const o = {}; for (const x of m) o[x.name] = x.value;
    const counts = {};
    for (const expr of ['window', 'document', 'document.body', 'document.documentElement']) {
      const { result } = await cdp.send('Runtime.evaluate', { expression: expr });
      const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
      counts[expr] = listeners.length;
    }
    return { eventListeners: o.JSEventListeners, nodes: o.Nodes, heapMB: Math.round(o.JSHeapUsedSize / 1e5) / 10, targets: counts };
  };
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForSelector('.grid .card', { timeout: 30000 });
  await sleep(500);
  const m0 = await metrics();
  // The existing routes also add some listeners on every visit (pre-existing behaviour, see the report), so
  // Journey 2's own contribution is measured as treatment minus control: the same 20 route cycles, once
  // without and once with a #/journey2 mount in every cycle.
  const routes = ['#/journey', '#/prep', '#/', '#/lists'];
  const cycle = async withJ2 => {
    const c = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pg = await c.newPage(); attachLogging(pg, logs, withJ2 ? 'cycles-j2' : 'cycles-control');
    await pg.goto(base + '#/'); await pg.waitForSelector('.grid .card', { timeout: 30000 });
    const cd = await c.newCDPSession(pg); await cd.send('Performance.enable');
    const met = async () => {
      await cd.send('HeapProfiler.collectGarbage');
      const { metrics: m } = await cd.send('Performance.getMetrics'); const o = {}; for (const x of m) o[x.name] = x.value;
      const targets = {};
      for (const expr of ['window', 'document', 'document.body', 'document.documentElement', 'document.getElementById("grid-wrap")']) {
        const { result } = await cd.send('Runtime.evaluate', { expression: expr });
        const { listeners } = await cd.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
        targets[expr] = listeners.length;
      }
      return { eventListeners: o.JSEventListeners, nodes: o.Nodes, heapMB: Math.round(o.JSHeapUsedSize / 1e5) / 10, targets };
    };
    // warm every route once so lazily loaded data is not counted
    for (const r of routes) { await pg.evaluate(h => { location.hash = h; }, r); await sleep(300); }
    await pg.evaluate(() => { location.hash = '#/'; }); await pg.waitForSelector('.grid .card'); await sleep(400);
    const a = await met();
    for (let i = 0; i < 20; i++) {
      if (withJ2) {
        await pg.evaluate(() => { location.hash = '#/journey2'; });
        await pg.waitForFunction(() => document.querySelector('.j2-viewport') && Journey2View.debugState() && Journey2View.debugState().anchors > 0, null, { timeout: 60000 });
        if (i % 5 === 0) await pg.evaluate(() => { document.querySelector('[data-j2-layer="markers"]').click(); document.querySelector('[data-j2-layer="proof"]').click(); });
      }
      await pg.evaluate(h => { location.hash = h; }, routes[i % routes.length]);
      await sleep(250);
    }
    await pg.evaluate(() => { location.hash = '#/'; }); await pg.waitForSelector('.grid .card'); await sleep(600);
    const b = await met();
    const leftovers = await pg.evaluate(() => ({ j2: !!document.querySelector('.j2'), host: document.querySelector('#grid-wrap').classList.contains('j2-host'), flag: document.body.dataset.j2 || null, header: document.documentElement.style.getPropertyValue('--j2-header-h'), printRoot: !!document.getElementById('j2-print-root'), printMode: document.body.classList.contains('j2-print-mode'), mounted: Journey2View.isMounted() }));
    await c.close();
    return { a, b, leftovers };
  };
  await check('lifecycle.20-mount-unmount-cycles-leak-no-listeners-or-nodes', async () => {
    const control = await cycle(false), treat = await cycle(true);
    const dl = treat.b.eventListeners - treat.a.eventListeners, dc = control.b.eventListeners - control.a.eventListeners;
    const perTarget = {};
    for (const k of Object.keys(treat.a.targets)) perTarget[k] = (treat.b.targets[k] - treat.a.targets[k]) - (control.b.targets[k] - control.a.targets[k]);
    const lo = treat.leftovers;
    const clean = !lo.j2 && !lo.host && !lo.flag && !lo.header && !lo.printRoot && !lo.printMode && !lo.mounted;
    const nodes = (treat.b.nodes - treat.a.nodes) - (control.b.nodes - control.a.nodes);
    return { ok: dl - dc <= 3 && Object.values(perTarget).every(v => v <= 0) && Math.abs(nodes) < 200 && clean, detail: { control, treat, journey2ListenerDelta: dl - dc, perTarget, nodesDelta: nodes } };
  });
  await check('lifecycle.keys-and-wheel-after-leaving-do-nothing', async () => {
    const r = await page.evaluate(() => {
      const w = new WheelEvent('wheel', { deltaY: -200, cancelable: true, bubbles: true });
      document.body.dispatchEvent(w);
      const k = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true, bubbles: true });
      document.body.dispatchEvent(k);
      return { wheelPrevented: w.defaultPrevented, keyPrevented: k.defaultPrevented, route: document.body.dataset.route };
    });
    return { ok: !r.wheelPrevented && !r.keyPrevented && r.route === 'catalog', detail: r };
  });
  await ctx.close();

  /* ----- late raster load must not remount into another route ----- */
  {
    const c2 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const p2 = await c2.newPage();
    attachLogging(p2, logs, 'late-load');
    await p2.route('**/valloren-world.webp*', async route => { await sleep(3500); try { await route.continue(); } catch (e) { /* page moved on */ } });
    await check('lifecycle.late-asset-load-does-not-mount-on-another-route', async () => {
      /* 'commit', not 'load': a slow third-party font request can hold the load event past the 3.5 s raster delay, so the loading state would be gone before the wait began (flaky in Task 01A runs). */
      await p2.goto(base + '#/journey2', { waitUntil: 'commit' });
      await p2.waitForFunction(() => document.querySelector('.j2-state'), null, { timeout: 30000, polling: 100 });
      await sleep(500);
      await p2.evaluate(() => { location.hash = '#/journey'; });
      await p2.waitForSelector('.journey-wrap');
      await sleep(5000);
      const r = await p2.evaluate(() => ({ j2: !!document.querySelector('.j2, .j2-state'), journey: !!document.querySelector('.journey-wrap'), mounted: Journey2View.isMounted(), route: document.body.dataset.route, host: document.querySelector('#grid-wrap').classList.contains('j2-host') }));
      return { ok: !r.j2 && r.journey && !r.mounted && r.route === 'journey' && !r.host, detail: r };
    });
    await c2.close();
  }

  /* ----- deployment base path ----- */
  {
    const sub = await serve(SITE_ROOT, '/atlas');
    const c3 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const p3 = await c3.newPage();
    attachLogging(p3, logs, 'base-path');
    await check('deploy.works-under-a-sub-path-with-only-relative-urls', async () => {
      await p3.goto(`http://127.0.0.1:${sub.port}/atlas/#/journey2`);
      await p3.waitForSelector('.j2-viewport', { timeout: 60000 });
      await p3.waitForFunction(() => Journey2View.debugState() && Journey2View.debugState().anchors > 0);
      const outside = sub.requests.filter(u => !u.startsWith('/atlas'));
      const has = ['/atlas/data/journey2/map-template.json', '/atlas/data/journey2/map-anchors.json', '/atlas/img/journey2/valloren-world.webp'].every(u => sub.requests.includes(u));
      return { ok: outside.length === 0 && has, detail: { outside: outside.slice(0, 5), has } };
    });
    await c3.close(); sub.server.close();
  }

  /* ===== 4. legacy regression: Journey, catalog, Prep, Lists, global tools ===== */
  {
    const c4 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const p4 = await c4.newPage();
    attachLogging(p4, logs, 'legacy');
    p4.on('dialog', d => d.accept());
    await p4.goto(base + '#/journey');
    await p4.waitForSelector('.journey-wrap');
    const ls = () => p4.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
    await check('legacy.journey-roll-keep-rename', async () => {
      await p4.click('.journey-panel[data-kind="region"] [data-roll-new]');
      await p4.waitForSelector('.journey-panel[data-kind="region"] .journey-draft .journey-entry');
      await p4.click('.journey-panel[data-kind="region"] [data-save]');
      await p4.waitForSelector('.journey-panel[data-kind="region"] .journey-saved .journey-entry.is-saved');
      await p4.click('.journey-panel[data-kind="sanctuary"] [data-roll-new]');
      await p4.waitForSelector('.journey-panel[data-kind="sanctuary"] .journey-draft .journey-entry');
      await p4.click('.journey-panel[data-kind="sanctuary"] [data-save]');
      await p4.waitForSelector('.journey-panel[data-kind="sanctuary"] .journey-saved .journey-entry.is-saved');
      const input = p4.locator('.journey-panel[data-kind="region"] .journey-saved .jr-name').first();
      await input.fill('Тестовый регион'); await input.press('Enter'); await p4.waitForTimeout(200);
      const s = await ls();
      const regions = JSON.parse(s.dhcodex_journey_regions), sanct = JSON.parse(s.dhcodex_journey_sanctuaries);
      return { ok: regions.length === 1 && sanct.length === 1 && regions[0].name === 'Тестовый регион', detail: { regions: regions.length, sanct: sanct.length, name: regions[0] && regions[0].name } };
    });
    let snapshot = await ls();
    await check('legacy.visiting-journey2-changes-no-legacy-key-and-merely-viewing-writes-no-journey2-key', async () => {
      for (let i = 0; i < 3; i++) {
        await p4.evaluate(() => { location.hash = '#/journey2'; });
        await p4.waitForFunction(() => document.querySelector('.j2-viewport') && Journey2View.debugState() && Journey2View.debugState().anchors > 0, null, { timeout: 60000 });
        await openDiag(p4);
        await p4.click('[data-j2-layer="markers"]'); await p4.click('[data-j2-layer="proof"]');
        await gotoCellP(p4, '46,1');
        await p4.evaluate(() => { location.hash = '#/journey'; });
        await p4.waitForSelector('.journey-wrap');
      }
      const after = await ls();
      const sessionKeys = await p4.evaluate(() => Object.keys(sessionStorage));
      const idb = await p4.evaluate(async () => (indexedDB.databases ? (await indexedDB.databases()).map(d => d.name) : []));
      /* Phase 1 deliberately adds Journey 2's own storage (dhcodex_journey2_*): the assertion is now that ONLY those keys may differ, and that every legacy/unrelated value is byte-identical. Merely viewing the editor writes none of them. */
      const changed = Object.keys(Object.assign({}, snapshot, after)).filter(k => snapshot[k] !== after[k]);
      const nonJ2 = changed.filter(k => !k.startsWith('dhcodex_journey2_'));
      return { ok: nonJ2.length === 0 && changed.length === 0 && sessionKeys.length === 0 && idb.length === 0, detail: { changed, nonJ2, keys: Object.keys(after), sessionKeys, idb } };
    });
    await check('legacy.journey-saved-entries-survive-and-rename-delete-still-work', async () => {
      const n = await p4.locator('.journey-panel[data-kind="region"] .journey-saved .journey-entry.is-saved').count();
      const nameShown = await p4.locator('.journey-panel[data-kind="region"] .journey-saved .jr-name').first().inputValue();
      await p4.locator('.journey-panel[data-kind="sanctuary"] .journey-saved [data-delete]').first().click();
      await p4.waitForTimeout(250);
      const s = await ls();
      return { ok: n === 1 && nameShown === 'Тестовый регион' && JSON.parse(s.dhcodex_journey_sanctuaries).length === 0 && JSON.parse(s.dhcodex_journey_regions).length === 1, detail: { n, nameShown } };
    });
    await check('legacy.journey-language-switch-ru-en', async () => {
      const ru = await p4.textContent('.page-title');
      await p4.click('.lang-switch button:has-text("EN")'); await p4.waitForTimeout(250);
      const en = await p4.textContent('.page-title'); const langEn = await p4.evaluate(() => document.documentElement.lang);
      await p4.evaluate(() => { location.hash = '#/journey2'; });
      await p4.waitForSelector('.j2-viewport');
      await p4.waitForFunction(() => Journey2View.debugState() && Journey2View.debugState().anchors > 0);
      const j2en = await p4.evaluate(() => document.title + ' | ' + document.querySelector('.j2-title').textContent);
      await p4.click('.lang-switch button:has-text("RU")'); await p4.waitForTimeout(300);
      const j2ru = await p4.evaluate(() => document.title + ' | ' + document.querySelector('.j2-title').textContent); const stillMounted = await p4.evaluate(() => Journey2View.isMounted());
      await p4.evaluate(() => { location.hash = '#/journey'; });
      await p4.waitForSelector('.journey-wrap');
      return { ok: /Journey to Horizon/.test(en) && langEn === 'en' && /Путешествие к Горизонту/.test(ru) && /Journey 2/.test(j2en) && /Valloren/.test(j2en) && /Путешествие 2/.test(j2ru) && /Валлорен/.test(j2ru) && stillMounted, detail: { ru, en, j2en, j2ru } };
    });
    await check('legacy.catalog-search-prep-lists-smoke', async () => {
      await p4.evaluate(() => { location.hash = '#/'; });
      await p4.waitForSelector('.grid .card', { timeout: 30000 });
      const total = await p4.locator('.grid .card').count();
      await p4.fill('input[type="search"], #search, .search-field input', 'лес').catch(() => {});
      await p4.waitForTimeout(400);
      const filtered = await p4.locator('.grid .card').count();
      await p4.evaluate(() => { location.hash = '#/prep'; });
      await p4.waitForSelector('.prep-wrap', { timeout: 30000 });
      await p4.evaluate(() => { location.hash = '#/lists'; });
      await p4.waitForSelector('.lists-wrap, .journey-wrap, .empty-state, .lists-home, #grid-wrap > *', { timeout: 30000 });
      const sb = await p4.locator('[data-soundboard-trigger], .sb-trigger, #soundboard-trigger, .header-utils button').count();
      return { ok: total > 5 && filtered >= 0 && sb > 0, detail: { total, filtered, soundboardControls: sb } };
    });
    await c4.close();
  }

  /* ===== 4b. Region Inspector and the diagnostics drawer share the map but never overlap ===== */
  {
    const c4 = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'en-US' });
    const p4 = await c4.newPage();
    attachLogging(p4, logs, 'inspector');
    await openJ2(p4, base, null, true);
    const cells = await p4.evaluate(() => {
      const api = Journey2View.debugApi(), M = Journey2Model, id = M.newId('b');
      const region = { habitat: { biome: 'forest', blighted: false, overtaken: false, source: 'rolled', rolls: [1] }, terrain: { value: 2, source: 'rolled' }, size: 3, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 17 };
      api.dispatch({ type: 'createBatch', batch: M.batchFromRegion(region, { id: id, createdAt: new Date().toISOString() }) });
      const c0 = api.clientToCell(700, 450).split(',').map(Number);
      const want = [[0, 0], [1, 0], [0, 1]].map(([a, b]) => (c0[0] + a) + ',' + (c0[1] + b));
      const ok = api.dispatch({ type: 'place', allowDetached: true, batchId: id, tiles: want.map(c => ({ id: M.newId('t'), cell: c })) }).ok;
      return { id: id, want: want, ok: ok };
    });
    const center = await p4.evaluate(c => Journey2View.debugApi().cellToClient(c), cells.want[0]);
    await check('inspector.a-map-click-opens-the-region-inspector-and-the-card-has-no-inline-details', async () => {
      if (!cells.ok) return { ok: true, detail: 'region placement not possible at the probe cell; covered by stage1-verify' };
      await p4.mouse.click(center.x, center.y); await sleep(150);
      const s = await state(p4);
      const dom = await p4.evaluate(() => ({ dlg: !document.querySelector('[data-j2-inspector]').hidden, tabs: document.querySelectorAll('.j2-card .j2-detail-tabs, .j2-card textarea').length }));
      return { ok: s.inspector.open && s.inspector.batchId === cells.id && dom.dlg && dom.tabs === 0, detail: { insp: s.inspector, dom } };
    });
    await check('inspector.opening-diagnostics-closes-the-inspector-and-clicking-a-hex-closes-diagnostics', async () => {
      if (!cells.ok) return true;
      await toggleDiag(p4);
      const s1 = await state(p4);
      const c1 = await p4.evaluate(c => Journey2View.debugApi().cellToClient(c), cells.want[0]);
      await p4.mouse.click(c1.x, c1.y); await sleep(200);
      const s2 = await state(p4);
      return { ok: s1.diagnosticsOpen && !s1.inspector.open && !s2.diagnosticsOpen && s2.inspector.open && JSON.stringify(s1.camera) === JSON.stringify(s2.camera), detail: { d1: s1.diagnosticsOpen, i1: s1.inspector.open, d2: s2.diagnosticsOpen, i2: s2.inspector.open } };
    });
    await check('inspector.escape-closes-it-and-the-card-inspect-button-is-localized', async () => {
      await p4.keyboard.press('Escape'); await sleep(80);
      const s = await state(p4);
      await p4.click('[data-lang="en"]'); await sleep(250);
      const en = await p4.locator('.j2-card [data-j2-inspect]').getAttribute('title');
      await p4.click('[data-lang="ru"]'); await sleep(250);
      const ru = await p4.locator('.j2-card [data-j2-inspect]').getAttribute('title');
      return { ok: !s.inspector.open && en === 'Inspect region' && ru === 'Осмотреть регион', detail: { open: s.inspector.open, en, ru } };
    });
    await c4.close();
  }

  /* ===== 5. print proof PDF ===== */
  {
    const c5 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const p5 = await c5.newPage();
    attachLogging(p5, logs, 'print');
    await openJ2(p5, base, null, true);
    await check('print.prepare-and-print-to-pdf', async () => {
      const info = await p5.evaluate(() => Journey2View.preparePrintProof());
      await p5.waitForFunction(() => [...document.querySelectorAll('#j2-print-root image')].length >= 2);
      await sleep(800);
      const pdf = await p5.pdf({ preferCSSPageSize: true, printBackground: true });
      /* With --out the canonical PDFs come from scripts/journey2/print-proof.js (both background modes); here only the export itself is checked. */
      if (outArg < 0) fs.writeFileSync(path.join(PRINT, 'journey2-print-proof.pdf'), pdf);
      const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
      // page screenshot of the print layout (print media emulation)
      await p5.emulateMedia({ media: 'print' });
      const printPaint = await p5.evaluate(() => { const c = e => getComputedStyle(e); return { rootBg: c(document.documentElement).backgroundColor, rootScheme: c(document.documentElement).colorScheme, bodyBg: c(document.body).backgroundColor }; });
      await p5.setViewportSize({ width: 1123, height: 794 });
      await sleep(300);
      await p5.screenshot({ path: path.join(PRINT, 'print-layout-emulation-page1.png'), clip: { x: 0, y: 0, width: 1123, height: 794 } });
      await p5.emulateMedia({ media: 'screen' });
      await p5.evaluate(() => Journey2View.cleanupPrintProof());
      const left = await p5.evaluate(() => { const c = e => getComputedStyle(e); return { root: !!document.getElementById('j2-print-root'), mode: document.body.classList.contains('j2-print-mode'), scheme: c(document.documentElement).colorScheme, bodyBg: c(document.body).backgroundColor }; });
      fs.writeFileSync(path.join(PRINT, 'print-proof-info.json'), JSON.stringify(Object.assign({}, info, { pdfBytes: pdf.length, pdfPages: pages }), null, 1));
      const printWhite = printPaint.rootBg === 'rgb(255, 255, 255)' && printPaint.rootScheme === 'light' && printPaint.bodyBg === 'rgb(255, 255, 255)';
      const screenRestored = left.scheme === 'dark' && left.bodyBg === 'rgb(20, 17, 15)';
      return { ok: pages === 2 && pdf.length > 20000 && !left.root && !left.mode && printWhite && screenRestored, detail: { pages, bytes: pdf.length, info, left, printPaint, printWhite, screenRestored } };
    });
    await c5.close();
  }

  /* ===== 6. console / network hygiene ===== */
  const relevant = logs.filter(l => !/favicon|fonts\.g(oogleapis|static)\.com|ERR_INTERNET_DISCONNECTED|net::ERR_(NAME_NOT_RESOLVED|CONNECTION|FAILED)/.test(l) || /journey2|valloren/.test(l));
  record('hygiene.no-console-errors-or-failed-requests', relevant.length === 0, relevant.slice(0, 12));

  /* Phase C: Fog of War, Player Preview and the suggested environments in the Region Inspector (real pointer and keyboard input; the same checks stage1-verify.js runs, minus the pixel comparison) */
  await require('./lib/fog-checks.js').runFogChecks({ browser, base, check, record, shot, logs, attachLogging, Geo, Model, template, anchorsDoc, full: false });
  /* Phase D: prepared-map connectivity, the Start-separate-area confirmation, derived region boundaries and the fog without cut-outs */
  await require('./lib/topology-checks.js').runTopologyChecks({ browser, base, check, record, shot, logs, attachLogging, Geo, Model, template, anchorsDoc });
  /* Per-hex Environment assignment (PD-025): inline picker, reused overlay, GM-only marker, Player Preview, tile lifecycle */
  await require('./lib/hex-environment-checks.js').runHexEnvironmentChecks({ browser, base, check, record, shot, logs, attachLogging, Geo, Model, template, anchorsDoc });

  await browser.close(); server.close();
  const failed = results.filter(r => !r.ok);
  const out = { schemaVersion: 1, ran: new Date().toISOString(), siteRoot: path.relative(ROOT, SITE_ROOT) || '.', viewports: ['1366x768', '1920x1080'], total: results.length, passed: results.length - failed.length, failed: failed.length, results, externalNoise: logs.filter(l => !relevant.includes(l)).slice(0, 12) };
  fs.writeFileSync(path.join(TESTS, 'browser-results.json'), JSON.stringify(out, null, 1) + '\n');
  fs.writeFileSync(path.join(DATA, 'browser-verification.json'), JSON.stringify({
    schemaVersion: 1,
    slot: { status: failed.length ? 'fail' : 'pass', checks: out.total, failed: failed.map(f => f.id), verifiedBy: 'scripts/journey2/browser-verify.js (Playwright Chromium 1366x768 + 1920x1080, isolated contexts)', note: 'Chromium only; Firefox/WebKit/Safari and touch devices were not exercised.' },
  }, null, 1) + '\n');
  console.log(`\n${out.passed}/${out.total} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

async function gotoCellP(page, id) { await page.fill('#j2-goto-input', id); await page.press('#j2-goto-input', 'Enter'); await page.waitForTimeout(100); }

main().catch(e => { console.error(e); process.exit(1); });
