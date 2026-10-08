/* ============================================================
   Bacchus's Atlas — tests/journey2-geometry.test.js
   Tests for js/journey2-geometry.js and the promoted Journey 2 data
   (data/journey2/*.json): geometry maths, cell ids, validity, seam
   adjacency, anchors, assets and the placement-readiness gate. The
   source-alignment evidence (grid vs raster) is not provable by maths
   alone; it lives in scripts/journey2/verify-template.js and
   docs/journey2-implementation/stage-0/CALIBRATION_REPORT.md.
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const Geo = require('../js/journey2-geometry.js');
const ROOT = path.join(__dirname, '..');
const template = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/journey2/map-template.json'), 'utf8'));
const anchorsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/journey2/map-anchors.json'), 'utf8'));
const grid = Geo.createGrid(template.grid);
const H = grid.shortDimensionPx;
const SEAM_X = template.composition.seam.worldX;

test('cell ids round-trip and malformed ids are rejected', () => {
  assert.equal(Geo.cellId(-3, 12), '-3,12');
  assert.deepEqual(Geo.parseCellId('-3,12'), { q: -3, r: 12 });
  for (const bad of ['', '1', '1,', '1,2,3', ' 1,2', '01,2', '+1,2', '-0,1', '1.5,2', 'a,b', null, 5]) assert.equal(Geo.parseCellId(bad), null, String(bad));
});

test('cell centre / world-to-cell round-trip for every valid cell', () => {
  let n = 0;
  grid.forEachValidCell((q, r) => {
    const c = grid.cellCenter(q, r);
    assert.deepEqual(grid.worldToCell(c[0], c[1]), { q, r });
    n++;
  });
  assert.equal(n, template.grid.validCells.count);
});

test('points inside a hexagon map to that cell (many angles)', () => {
  for (const [q, r] of [[0, 0], [46, 1], [93, -40], [20, 20]]) {
    const c = grid.cellCenter(q, r);
    for (let a = 0; a < 360; a += 15) {
      const rad = a * Math.PI / 180, k = 0.9 * H / 2; // inside the inscribed circle
      assert.deepEqual(grid.worldToCell(c[0] + k * Math.cos(rad), c[1] + k * Math.sin(rad)), { q, r });
    }
  }
});

test('corner geometry: six corners at circumradius, regular spacing, shared with neighbours', () => {
  const R = H / Math.sqrt(3);
  const cs = grid.cellCorners(10, 10), c = grid.cellCenter(10, 10);
  assert.equal(cs.length, 6);
  cs.forEach(p => assert.ok(Math.abs(Math.hypot(p[0] - c[0], p[1] - c[1]) - R) < 0.05));
  for (let k = 0; k < 6; k++) assert.ok(Math.abs(Math.hypot(cs[k][0] - cs[(k + 1) % 6][0], cs[k][1] - cs[(k + 1) % 6][1]) - R) < 0.05);
  assert.ok(Math.abs(cs[0][1] - c[1]) < 0.05 && cs[0][0] > c[0]);      // flat-top: corner 0 is the east vertex
  assert.ok(Math.abs(cs[1][1] - cs[2][1]) < 0.05);                    // top edge is horizontal
  const nb = grid.cellCorners(11, 10);
  assert.equal(cs.filter(p => nb.some(o => Math.hypot(o[0] - p[0], o[1] - p[1]) < 0.05)).length, 2);
});

test('interior cells have six unique neighbours, one lattice step away, reciprocal', () => {
  const ns = grid.neighbors(30, 10);
  assert.equal(new Set(ns.map(n => n.id)).size, 6);
  const c = grid.cellCenter(30, 10);
  for (const n of ns) {
    const nc = grid.cellCenter(n.q, n.r);
    assert.ok(Math.abs(Math.hypot(nc[0] - c[0], nc[1] - c[1]) - H) < 0.05);
    assert.ok(grid.neighbors(n.q, n.r).some(m => m.q === 30 && m.r === 10));
    assert.equal(n.valid, true);
  }
});

test('edge tie-breaking is deterministic: a point on a shared edge resolves to the smaller (q,r)', () => {
  for (const [q, r] of [[10, 10], [46, 1], [60, -5]]) {
    for (const n of grid.neighbors(q, r)) {
      const a = grid.cellCenter(q, r), b = grid.cellCenter(n.q, n.r);
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const want = (q < n.q || (q === n.q && r < n.r)) ? { q, r } : { q: n.q, r: n.r };
      for (let i = 0; i < 3; i++) assert.deepEqual(grid.worldToCell(mid[0], mid[1]), want);
    }
  }
});

test('valid-cell boundaries: centre inside the frame interior, nothing beyond', () => {
  const [fx, fy, fw, fh] = template.mapFrame.innerRectPx;
  let counted = 0;
  for (let q = -3; q < 100; q++) for (let r = -80; r < 120; r++) {
    const c = grid.cellCenter(q, r);
    const inside = c[0] >= fx && c[0] < fx + fw && c[1] >= fy && c[1] < fy + fh;
    assert.equal(grid.isValid(q, r), inside, q + ',' + r);
    if (inside) counted++;
  }
  assert.equal(counted, template.grid.validCells.count);
  assert.equal(grid.isValid(0.5, 1), false);
  assert.equal(grid.isValid(-1, 0), false);
  assert.equal(grid.isValid(94, 0), false);
});

test('cell ids are unique and continuous across the panel joint', () => {
  const ids = new Set();
  let pairs = 0;
  grid.forEachValidCell((q, r) => {
    const id = Geo.cellId(q, r);
    assert.ok(!ids.has(id)); ids.add(id);
    const c = grid.cellCenter(q, r);
    if (Math.abs(c[0] - SEAM_X) < 40) for (const n of grid.validNeighbors(q, r)) {
      const nc = grid.cellCenter(n.q, n.r);
      if ((c[0] < SEAM_X) !== (nc[0] < SEAM_X)) { pairs++; assert.ok(grid.neighbors(n.q, n.r).some(m => m.q === q && m.r === r)); }
    }
  });
  assert.ok(pairs > 90);
  const cols = Object.keys(template.grid.validCells.columns).map(Number).sort((a, b) => a - b);
  for (let i = 1; i < cols.length; i++) assert.equal(cols[i], cols[i - 1] + 1);
});

test('control points are valid cells within the 3 % tolerance and span west, east and the seam', () => {
  const cps = template.grid.controlPoints;
  assert.ok(cps.length >= 12);
  for (const cp of cps) {
    const c = Geo.parseCellId(cp.id);
    assert.ok(grid.isValid(c.q, c.r));
    assert.ok(cp.residualPx <= 0.03 * H, cp.id);
    const ctr = grid.cellCenter(c.q, c.r);
    assert.ok(Math.hypot(ctr[0] - cp.predictedCenterPx[0], ctr[1] - cp.predictedCenterPx[1]) < 0.01);
  }
  assert.ok(cps.some(c => c.predictedCenterPx[0] < SEAM_X - 600));
  assert.ok(cps.some(c => c.predictedCenterPx[0] > SEAM_X + 600));
  assert.ok(cps.filter(c => Math.abs(c.predictedCenterPx[0] - SEAM_X) < 70).length >= 3);
});

test('anchors: unique ids, required fields, valid cells, coordinates consistent with the grid and panels', () => {
  assert.equal(anchorsDoc.complete, true);
  const required = ['stableId', 'kind', 'sourcePanel', 'sourcePixelAnchor', 'worldPixelAnchor', 'cellId', 'hitArea', 'iconProtectionArea', 'labelAnchor', 'builtInLabel', 'verificationStatus'];
  const seen = new Set();
  for (const a of anchorsDoc.anchors) {
    for (const f of required) assert.ok(f in a, a.stableId + ' lacks ' + f);
    assert.ok(!seen.has(a.stableId)); seen.add(a.stableId);
    assert.match(a.stableId, /^mk-\d{3}$/);
    const c = Geo.parseCellId(a.cellId);
    assert.ok(grid.isValid(c.q, c.r));
    const w = a.worldPixelAnchor;
    assert.deepEqual(grid.worldToCell(w[0], w[1]), c);
    const panel = template.composition.panels.find(p => p.id === a.sourcePanel);
    assert.ok(Math.abs(a.sourcePixelAnchor[0] + panel.worldTranslatePx[0] - w[0]) < 0.11);
    assert.ok(Math.abs(a.sourcePixelAnchor[1] + panel.worldTranslatePx[1] - w[1]) < 0.11);
    assert.equal(a.sourcePanel, w[0] < SEAM_X ? 'west' : 'east');
    const p = a.iconProtectionArea.rectPx;
    assert.ok(w[0] >= p[0] && w[0] <= p[0] + p[2] && w[1] >= p[1] && w[1] <= p[1] + p[3]);
    if (a.kind === 'destination') assert.ok(a.builtInLabel && a.labelAnchor === null);
    else assert.ok(a.labelAnchor && a.builtInLabel === null);
  }
  assert.equal(anchorsDoc.anchors.length, anchorsDoc.counts.total);
  assert.deepEqual(anchorsDoc.anchors.filter(a => a.kind === 'destination').map(a => a.builtInLabel.text).sort(), ['HORIZON', 'MARROGATE']);
});

test('no two marker protection areas overlap and none lies on a built-in label', () => {
  const rects = Geo.protectionRects(template, anchorsDoc).filter(r => r.kind !== 'decorative');
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    if (rects[i].id === rects[j].id) continue;
    assert.ok(!Geo.rectsIntersect(rects[i].rectPx, rects[j].rectPx), rects[i].id + '/' + rects[j].id);
  }
});

test('proof glyphs never cover protected artwork: every candidate cell either clears it or is withheld', () => {
  const prot = Geo.protectionRects(template, anchorsDoc);
  let exercised = 0;
  for (const a of anchorsDoc.anchors) {
    const c = Geo.parseCellId(a.cellId);
    for (const cell of [c, ...grid.validNeighbors(c.q, c.r)]) {
      const L = Geo.layoutProofGlyph(grid, cell.q, cell.r, { w: 34, h: 24, dots: 4 }, prot, 2);
      if (L.hidden || L.shifted) { exercised++; if (L.hidden) continue; }
      assert.ok(!prot.some(p => Geo.rectsIntersect(L.boxPx, p.rectPx)));
      for (const corner of [[L.boxPx[0], L.boxPx[1]], [L.boxPx[0] + L.boxPx[2], L.boxPx[1] + L.boxPx[3]]]) assert.ok(Geo.pointInConvexPolygon(corner, grid.cellCorners(cell.q, cell.r)));
    }
  }
  assert.ok(exercised > 0);
  const hz = anchorsDoc.anchors.find(a => a.builtInLabel && a.builtInLabel.text === 'HORIZON');
  const hc = Geo.parseCellId(hz.cellId);
  assert.equal(Geo.layoutProofGlyph(grid, hc.q, hc.r, { w: 34, h: 24, dots: 4 }, prot, 2).hidden, true);
});

test('runtime assets exist, are relative, and match the recorded hashes', () => {
  const a = template.assembledAsset;
  assert.ok(!/^([a-z]:|\/|[a-z]+:)/i.test(a.path));
  const file = path.join(ROOT, a.path);
  assert.ok(fs.existsSync(file));
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), a.fileSha256);
  assert.equal(a.cacheKey, a.fileSha256.slice(0, 16));
  const symbols = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/journey2/symbols.json'), 'utf8')).symbols;
  assert.equal(symbols.length, 12);
  for (const s of symbols) {
    assert.ok(fs.existsSync(path.join(ROOT, s.path)), s.path);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, s.path))).digest('hex'), s.sha256);
  }
  assert.ok(!/[A-Za-z]:\\|\\Users\\|localhost|127\.0\.0\.1/.test(JSON.stringify([template, anchorsDoc])), 'no local paths or dev URLs baked into runtime data');
});

test('template validates structurally and rejects duplicates / missing grids', () => {
  assert.deepEqual(Geo.validateTemplate(template, anchorsDoc), { ok: true, errors: [] });
  const broken = JSON.parse(JSON.stringify(anchorsDoc));
  broken.anchors[1].stableId = broken.anchors[0].stableId;
  assert.equal(Geo.validateTemplate(template, broken).ok, false);
  assert.equal(Geo.validateTemplate(Object.assign({}, template, { grid: {} }), anchorsDoc).ok, false);
});

test('readiness gate rejects the supplied drafts and any unverified or incomplete definition', () => {
  const dir = path.join(ROOT, 'docs/journey2-handoff/data');
  if (fs.existsSync(dir)) {
    const draftT = JSON.parse(fs.readFileSync(path.join(dir, 'map-template.draft.json'), 'utf8'));
    const draftA = JSON.parse(fs.readFileSync(path.join(dir, 'sanctuary-anchors.draft.json'), 'utf8'));
    const r = Geo.assessPlacementReadiness(draftT, draftA);
    assert.equal(r.ready, false); assert.ok(r.reasons.length >= 5);
    assert.throws(() => Geo.createGrid(draftT.grid));
  }
  const ready = fn => { const t = JSON.parse(JSON.stringify(template)), a = JSON.parse(JSON.stringify(anchorsDoc)); fn(t, a); return Geo.assessPlacementReadiness(t, a).ready; };
  assert.equal(ready(t => { t.readyForInteractivePlacement = false; }), false);
  assert.equal(ready(t => { t.status = 'draft-needs-calibration'; }), false);
  assert.equal(ready(t => { t.grid.calibrationStatus = 'not-measured'; }), false);
  assert.equal(ready(t => { t.verification.printProof.status = 'pending'; }), false);
  assert.equal(ready((t, a) => { a.anchors[0].verificationStatus = 'candidate'; }), false);
  assert.equal(ready((t, a) => { a.complete = false; }), false);
  assert.equal(ready((t, a) => { a.anchors = []; a.complete = true; }), false);
});

test('the shipped template is ready only if all four verification slots pass, and physical printing is not claimed', () => {
  const allPass = ['preparedAssets', 'geometry', 'browserBehavior', 'printProof'].every(k => template.verification[k].status === 'pass');
  assert.equal(Geo.assessPlacementReadiness(template, anchorsDoc).ready, allPass);
  assert.equal(template.readyForInteractivePlacement, allPass);
  assert.equal(template.verification.physicalPrintTest.status, 'not-tested');
});

test('camera maths: round trip, cursor-anchored zoom, clamping, fit, grid agreement at several zooms', () => {
  const cam = { scale: 0.4, tx: 120, ty: -30 };
  const w = Geo.screenToWorld(cam, 500, 300), s = Geo.worldToScreen(cam, w[0], w[1]);
  assert.ok(Math.abs(s[0] - 500) < 1e-9 && Math.abs(s[1] - 300) < 1e-9);
  const z = Geo.zoomAt(cam, 500, 300, 2.5, 0.1, 8), w2 = Geo.screenToWorld(z, 500, 300);
  assert.ok(Math.hypot(w2[0] - w[0], w2[1] - w[1]) < 1e-9);
  assert.equal(Geo.zoomAt(cam, 0, 0, 1000, 0.1, 8).scale, 8);
  assert.equal(Geo.zoomAt(cam, 0, 0, 0.0001, 0.1, 8).scale, 0.1);
  const f = Geo.fitCamera(1000, 600, 4848, 3185, 10);
  assert.ok(f.scale * 4848 <= 980.001 && f.scale * 3185 <= 580.001);
  const cl = Geo.clampCamera({ scale: 1, tx: 99999, ty: -99999 }, 1000, 600, 4848, 3185, 80);
  assert.equal(cl.tx, 920); assert.equal(cl.ty, 80 - 3185);
  for (const sc of [0.2, 1, 4, 8]) {
    const c2 = { scale: sc, tx: 33, ty: 77 }, p = grid.cellCenter(46, 1);
    const scr = Geo.worldToScreen(c2, p[0], p[1]), back = Geo.screenToWorld(c2, scr[0], scr[1]);
    assert.deepEqual(grid.worldToCell(back[0], back[1]), { q: 46, r: 1 });
  }
});

test('fitted glyph: a tall symbol beside the blight strip shrinks to fit instead of being withheld, and never leaves its hexagon or covers artwork', () => {
  const prot = Geo.protectionRects(template, anchorsDoc).filter(p => p.kind !== 'built-in-label');
  const X = 7;                                                // the view's BLIGHT_X_HALF; the strip is the top of the hexagon
  const tall = { w: 24.2, h: 28.6, dots: 4 };                 // tropical / forest at the view's glyph scale, worst-case dots
  const mid = Geo.parseCellId(anchorsDoc.anchors[0].cellId);
  let shrunk = 0, shown = 0, cells = 0;
  grid.forEachValidCell((q, r) => {
    cells++;
    const c = grid.cellCenter(q, r), top = Math.min.apply(null, grid.cellCorners(q, r).map(p => p[1]));
    const strip = { rectPx: [c[0] - X - 1, top + 4 - 1, 2 * X + 2, 2 * X + 2] };
    const withStrip = prot.concat([strip]);
    const L = Geo.layoutFittedGlyph(grid, q, r, tall, withStrip, 2);
    if (L.hidden) return;
    shown++;
    if (Geo.layoutProofGlyph(grid, q, r, tall, withStrip, 2).hidden) { shrunk++; assert.ok(L.glyphScale < 1 && Geo.FIT_SCALES.includes(L.glyphScale)); }
    assert.ok(!withStrip.some(p => Geo.rectsIntersect(L.boxPx, p.rectPx)), q + ',' + r);
    for (const pt of [[L.boxPx[0], L.boxPx[1]], [L.boxPx[0] + L.boxPx[2], L.boxPx[1] + L.boxPx[3]]]) assert.ok(Geo.pointInConvexPolygon(pt, grid.cellCorners(q, r)), q + ',' + r);
  });
  assert.ok(shrunk > cells * 0.9, 'a blighted tall glyph needs the shrink on nearly every cell (' + shrunk + '/' + cells + ')');
  assert.ok(shown > cells * 0.9, 'and then fits on nearly every cell (' + shown + '/' + cells + ')');
  // a cell that already fits keeps the natural size; the Horizon marker cell still withholds
  assert.equal(Geo.layoutFittedGlyph(grid, mid.q + 6, mid.r, { w: 20, h: 10, dots: 1 }, [], 2).glyphScale, 1);
  const hz = Geo.parseCellId(anchorsDoc.anchors.find(a => a.builtInLabel && a.builtInLabel.text === 'HORIZON').cellId);
  assert.equal(Geo.layoutFittedGlyph(grid, hz.q, hz.r, { w: 34, h: 24, dots: 4 }, Geo.protectionRects(template, anchorsDoc), 2).hidden, true);
});
