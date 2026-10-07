'use strict';
/* Journey 2 Phase D (PD-024): prepared-map connectivity (global component count, non-worsening rule, the explicit
   `allowDetached` override), delete topology, the derived boundary geometry and the player-safe boundary projection.
   Pure — no browser; the click/drag/dialog behaviour is covered by scripts/journey2/browser-verify.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Geo = require('../js/journey2-geometry.js');
const M = require('../js/journey2-model.js');
const P = require('../js/journey2-projection.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const template = JSON.parse(read('data/journey2/map-template.json'));
const anchorsDoc = JSON.parse(read('data/journey2/map-anchors.json'));
const ctx = M.createContext(template, anchorsDoc);
const AT = '2026-10-06T10:00:00.000Z';
const must = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.doc; };

const BASE = (() => {
  for (let q = 40; q < 80; q++) for (let r = -20; r < 20; r++) {
    let ok = true;
    for (let dq = -6; dq <= 6 && ok; dq++) for (let dr = -6; dr <= 6; dr++) if (!ctx.placeable(q + dq, r + dr)) { ok = false; break; }
    if (ok) return { q: q, r: r };
  }
  throw new Error('no open area');
})();
const at = (dq, dr) => Geo.cellId(BASE.q + dq, BASE.r + dr);
const D = { se: [1, 0], ne: [1, -1], n: [0, -1], nw: [-1, 0], sw: [-1, 1], s: [0, 1] };

function batch(id, size) {
  return M.batchFromRegion({
    habitat: { biome: 'forest', blighted: false, overtaken: false, source: 'rolled', rolls: [11] }, terrain: { value: 2, source: 'rolled' }, size: size || 12,
    encounter: { entries: [[3, 4]], combines: 0 }, rumor: 49,
  }, { id: id, createdAt: AT });
}
function withBatches(...ids) {
  let doc = M.emptyDocument(ctx, AT);
  for (const id of ids) doc = must(M.apply(doc, { type: 'createBatch', batch: batch(id), at: AT }, ctx));
  return doc;
}
let seq = 0;
const tiles = cells => cells.map(c => ({ id: 'x' + (++seq), cell: c }));
const place = (doc, batchId, cells, extra) => M.apply(doc, Object.assign({ type: 'place', batchId: batchId, tiles: tiles(cells), at: AT }, extra || {}), ctx);
const tileAt = (doc, cell) => doc.tiles.find(t => t.cell === cell);
const move = (doc, from, to) => M.apply(doc, { type: 'move', tileId: tileAt(doc, from).id, to: to, at: AT }, ctx);
const ret = (doc, cell) => M.apply(doc, { type: 'returnTile', tileId: tileAt(doc, cell).id, at: AT }, ctx);
const areas = doc => M.preparedMapComponentCount(doc.tiles.map(t => t.cell));
const cellsOf = (cq, cr, n) => M.compactFootprint(n).map(o => ({ q: cq + o.dq, r: cr + o.dr }));
const ids = list => list.map(c => Geo.cellId(c.q, c.r));
/** a legacy (disconnected) map built by hand, as an old save would be */
function legacy(spec) {
  let doc = withBatches(...Array.from(new Set(spec.map(s => s[0]))));
  return Object.assign({}, doc, { tiles: spec.map(([b, c], i) => ({ id: 'L' + i, batchId: b, cell: c })) });
}

/* ---------------- helpers ---------------- */

test('component count: all placed cells across batches; corner-free hex edges only', () => {
  assert.equal(M.preparedMapComponentCount([]), 0);
  assert.equal(M.preparedMapComponentCount([at(0, 0)]), 1);
  assert.equal(M.preparedMapComponentCount([at(0, 0), at(1, 0)]), 1);
  assert.equal(M.preparedMapComponentCount([at(0, 0), at(2, 0)]), 2, 'two cells apart do not touch');
  const doc = legacy([['A', at(0, 0)], ['B', at(1, 0)], ['C', at(4, 4)]]);
  assert.equal(areas(doc), 2, 'batches do not matter, only contact');
  const pc = M.preparedMapConnectivity(doc, doc.tiles.concat([{ id: 'n', batchId: 'C', cell: at(4, 5) }]));
  assert.deepEqual([pc.before, pc.after, pc.ok], [2, 2, true]);
});

/* ---------------- first region, later regions ---------------- */

test('the first region may be placed anywhere valid: one tile or a connected Place all footprint', () => {
  const doc = withBatches('A');
  must(place(doc, 'A', [at(3, 3)]));
  must(place(doc, 'A', ids(cellsOf(BASE.q + 2, BASE.r + 2, 7))));
});

test('a later region must share a full edge with ANY placed tile (not just the latest region)', () => {
  let doc = withBatches('A', 'B', 'C');
  doc = must(place(doc, 'A', [at(0, 0)]));
  doc = must(place(doc, 'B', [at(1, 0)]));
  for (const [dq, dr] of Object.values(D)) { const c = at(dq, dr); if (c !== at(1, 0)) must(place(doc, 'C', [c])); }
  must(place(doc, 'C', [at(-1, 0)]));                        // touches the OLDER region A only
  // only one tile of the new region needs to touch; the rest stays internally connected
  const r = place(doc, 'C', [at(1, 1), at(2, 1), at(3, 1)]);
  assert.equal(areas(must(r)), 1);
});

test('detached first tile: detached-prepared-map (not blocked / disconnected-region); a cell two steps away does not touch', () => {
  let doc = withBatches('A', 'B');
  doc = must(place(doc, 'A', [at(0, 0)]));
  for (const c of [at(2, 0), at(3, 3)]) {
    const r = place(doc, 'B', [c]);
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'detached-prepared-map');
  }
  assert.equal(doc.tiles.length, 1, 'nothing was placed');
});

test('Place all: connected + touching accepted; connected + detached needs the override; internally disconnected never can', () => {
  let doc = withBatches('A', 'B');
  doc = must(place(doc, 'A', [at(0, 0)]));
  const touching = ids(cellsOf(BASE.q + 1, BASE.r, 6));
  must(place(doc, 'B', touching));
  const apart = ids(cellsOf(BASE.q + 4, BASE.r + 4, 6));
  assert.equal(place(doc, 'B', apart).error.code, 'detached-prepared-map');
  const sep = must(place(doc, 'B', apart, { allowDetached: true }));
  assert.equal(areas(sep), 2);
  const split = [at(3, 3), at(3, 4), at(3, 7)];
  assert.equal(place(doc, 'B', split, { allowDetached: true }).error.code, 'disconnected-region', 'the override never repairs an internally disconnected footprint');
  assert.equal(place(doc, 'B', split).error.code, 'disconnected-region');
});

/* ---------------- separate area (override) ---------------- */

test('override: adds exactly one component, only for a boolean true, and is never stored', () => {
  let doc = withBatches('A', 'B');
  doc = must(place(doc, 'A', [at(0, 0)]));
  assert.equal(place(doc, 'B', [at(4, 4)], { allowDetached: false }).ok, false);
  assert.equal(place(doc, 'B', [at(4, 4)], { allowDetached: 'yes' }).ok, false);
  assert.equal(place(doc, 'B', [at(4, 4)], { separate: true }).ok, false, 'the old toggle flag no longer means anything');
  const sep = must(place(doc, 'B', [at(4, 4), at(4, 5)], { allowDetached: true }));
  assert.equal(areas(sep), 2);
  for (const k of Object.keys(sep)) assert.ok(!/separate|detached/i.test(k));
  assert.ok(!/separate|detached|allowDetached/i.test(M.serializeBackup(sep)));
  for (const b of sep.batches) assert.ok(!Object.keys(b).some(k => /separate|detached/i.test(k)));
  // the confirmed candidate is committed exactly as attempted
  assert.deepEqual(sep.tiles.filter(t => t.batchId === 'B').map(t => t.cell), [at(4, 4), at(4, 5)]);
});

test('override: does not allow occupied cells or cells the policy refuses', () => {
  let doc = withBatches('A', 'B');
  doc = must(place(doc, 'A', [at(0, 0)]));
  assert.equal(place(doc, 'B', [at(0, 0)], { allowDetached: true }).error.code, 'blocked');
  const deco = Array.from(ctx.decorativeCells)[0];
  assert.equal(place(doc, 'B', [deco], { allowDetached: true }).error.code, 'blocked');
  const outside = M.checkPlacement(doc, ctx, 'B', [{ q: 9999, r: 9999 }], null, { allowDetached: true });
  assert.equal(outside.valid, false);
  assert.equal(outside.separateEligible, false);
});

test('override: unavailable once the batch already has placed tiles', () => {
  let doc = withBatches('A', 'B');
  doc = must(place(doc, 'A', [at(0, 0)]));
  doc = must(place(doc, 'B', [at(1, 0)]));
  const cells = [{ q: BASE.q + 5, r: BASE.r + 5 }];
  const chk = M.checkPlacement(doc, ctx, 'B', cells);
  assert.equal(chk.separateEligible, false);
  assert.equal(place(doc, 'B', [at(5, 5)], { allowDetached: true }).ok, false, 'a second tile far from a placed batch is refused whatever the flag');
});

test('checkPlacement: separateEligible only when the sole failed rule is detached-prepared-map', () => {
  let doc = withBatches('A', 'B');
  doc = must(place(doc, 'A', [at(0, 0)]));
  const ok = M.checkPlacement(doc, ctx, 'B', cellsOf(BASE.q + 4, BASE.r + 4, 3));
  assert.deepEqual([ok.valid, ok.separateEligible, ok.attachCode, ok.connected], [false, true, 'detached-prepared-map', true]);
  const near = M.checkPlacement(doc, ctx, 'B', [{ q: BASE.q + 1, r: BASE.r }]);
  assert.deepEqual([near.valid, near.separateEligible], [true, false], 'a connected placement is simply valid');
  const occupied = M.checkPlacement(doc, ctx, 'B', [{ q: BASE.q + 4, r: BASE.r + 4 }, { q: BASE.q, r: BASE.r }]);
  assert.equal(occupied.separateEligible, false);
  const broken = M.checkPlacement(doc, ctx, 'B', [{ q: BASE.q + 4, r: BASE.r + 4 }, { q: BASE.q + 4, r: BASE.r + 8 }]);
  assert.equal(broken.separateEligible, false);
  const withOverride = M.checkPlacement(doc, ctx, 'B', cellsOf(BASE.q + 4, BASE.r + 4, 3), null, { allowDetached: true });
  assert.deepEqual([withOverride.valid, withOverride.attached], [true, true]);
  // the first region of an empty map is simply valid
  const first = M.checkPlacement(withBatches('A'), ctx, 'A', [{ q: BASE.q, r: BASE.r }]);
  assert.deepEqual([first.valid, first.separateEligible], [true, false]);
});

test('Undo removes the whole separate area and Redo restores the exact placement without another check', () => {
  let doc = withBatches('A', 'B');
  const h = M.createHistory();
  const d1 = must(place(doc, 'A', [at(0, 0)])); M.historyCommit(h, doc, d1, 'place');
  const d2 = must(place(d1, 'B', ids(cellsOf(BASE.q + 4, BASE.r + 4, 4)), { allowDetached: true })); M.historyCommit(h, d1, d2, 'place');
  assert.equal(h.undo.length, 2, 'one history entry for the confirmed placement');
  const u = M.historyUndo(h);
  assert.equal(u.before, d1);
  assert.equal(areas(u.before), 1);
  const r = M.historyRedo(h);
  assert.equal(r.after, d2);
  assert.equal(areas(r.after), 2);
  assert.deepEqual(r.after.tiles, d2.tiles, 'exact coordinates');
});

/* ---------------- move and return ---------------- */

test('moving a bridge tile that increases the number of areas is rejected with would-split-prepared-map', () => {
  let doc = withBatches('A', 'B', 'C');
  doc = must(place(doc, 'A', [at(0, 0)]));
  doc = must(place(doc, 'B', [at(1, 0)]));        // the bridge
  doc = must(place(doc, 'C', [at(2, 0)]));
  const r = move(doc, at(1, 0), at(1, 3));
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'would-split-prepared-map');
  const pv = M.checkPlacement(doc, ctx, 'B', [{ q: BASE.q + 1, r: BASE.r + 3 }], tileAt(doc, at(1, 0)).id);
  assert.deepEqual([pv.valid, pv.attachCode, pv.separateEligible], [false, 'would-split-prepared-map', false], 'no override for an ordinary move');
});

test('moving a non-bridge tile (of its own region, keeping it connected) is accepted', () => {
  let doc = withBatches('A', 'B');
  doc = must(place(doc, 'A', [at(0, 0), at(0, 1)]));
  doc = must(place(doc, 'B', [at(1, 0), at(2, 0)]));
  must(move(doc, at(2, 0), at(2, -1)));
  assert.equal(move(doc, at(1, 0), at(4, 4)).error.code, 'disconnected-region', 'an internal split keeps its own error');
});

test('a move that splits its own region reports disconnected-region (a separate error)', () => {
  let doc = withBatches('A');
  doc = must(place(doc, 'A', [at(0, 0), at(1, 0), at(2, 0)]));
  assert.equal(move(doc, at(1, 0), at(1, 3)).error.code, 'disconnected-region');
});

test('returning a bridge tile is rejected; returning a non-bridge tile is accepted', () => {
  let doc = withBatches('A', 'B', 'C');
  doc = must(place(doc, 'A', [at(0, 0)]));
  doc = must(place(doc, 'B', [at(1, 0)]));
  doc = must(place(doc, 'C', [at(2, 0)]));
  const r = ret(doc, at(1, 0));
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'would-split-prepared-map');
  const end = must(ret(doc, at(2, 0)));
  assert.equal(areas(end), 1);
  // the last tile of a region (a leaf) may always go while one area stays
  assert.equal(areas(must(ret(doc, at(0, 0)))), 1);
});

test('an already disconnected map stays editable at the same component count; edits may reduce it; they may not increase it', () => {
  let doc = legacy([['A', at(0, 0)], ['A', at(1, 0)], ['B', at(5, 5)], ['B', at(5, 6)]]);
  assert.equal(areas(doc), 2);
  assert.equal(areas(must(move(doc, at(5, 6), at(6, 5)))), 2, 'within one component, count unchanged');
  assert.equal(areas(must(ret(doc, at(1, 0)))), 2);
  // returning one end of a two-tile component keeps two areas; the other end too
  let big = legacy([['A', at(0, 0)], ['A', at(1, 0)], ['A', at(2, 0)], ['B', at(5, 5)]]);
  assert.equal(move(big, at(1, 0), at(1, 3)).ok, false, 'splitting a component increases the count');
  // bridging: B's lone tile (a different region) moved next to A reduces the count 2 -> 1
  let two = legacy([['A', at(0, 0)], ['B', at(4, 4)], ['B', at(4, 5)]]);
  assert.equal(areas(two), 2);
  assert.equal(areas(must(M.apply(two, { type: 'returnTile', tileId: tileAt(two, at(4, 5)).id, at: AT }, ctx))), 2);
  let lone = legacy([['A', at(0, 0)], ['B', at(4, 4)]]);
  assert.equal(areas(must(move(lone, at(4, 4), at(1, 0)))), 1, 'an edit that bridges two components is allowed');
  assert.equal(areas(must(ret(lone, at(4, 4)))), 1, 'returning an isolated area\'s last tile reduces the count');
});

/* ---------------- delete ---------------- */

test('deleting a bridge region is allowed and reports the future area count; Undo restores the previous topology', () => {
  let doc = withBatches('A', 'B', 'C');
  doc = must(place(doc, 'A', [at(0, 0)]));
  doc = must(place(doc, 'B', [at(1, 0)]));
  doc = must(place(doc, 'C', [at(2, 0)]));
  assert.deepEqual(M.deleteTopology(doc, 'B'), { before: 1, after: 2 });
  assert.deepEqual(M.deleteTopology(doc, 'C'), { before: 1, after: 1 });
  const r = M.apply(doc, { type: 'deleteBatch', batchId: 'B', at: AT }, ctx);
  assert.equal(r.ok, true);
  assert.deepEqual(r.topology, { before: 1, after: 2 });
  assert.equal(areas(r.doc), 2);
  const h = M.createHistory();
  M.historyCommit(h, doc, r.doc, 'deleteBatch');
  assert.equal(h.undo.length, 1);
  const u = M.historyUndo(h);
  assert.equal(areas(u.before), 1);
  assert.equal(u.before.tiles.length, 3);
});

/* ---------------- imports ---------------- */

test('import: a document with several prepared areas loads as it is; later edits follow the non-worsening rule', () => {
  let doc = withBatches('A', 'B');
  doc = must(place(doc, 'A', [at(0, 0)]));
  doc = must(place(doc, 'B', [at(4, 4)], { allowDetached: true }));
  const r = M.parseBackupText(M.serializeBackup(doc), ctx);
  assert.equal(r.ok, true);
  assert.equal(areas(r.doc), 2);
  assert.equal(place(M.apply(r.doc, { type: 'createBatch', batch: batch('C'), at: AT }, ctx).doc, 'C', [at(-5, -5)]).error.code, 'detached-prepared-map');
});

/* ---------------- boundary geometry ---------------- */

const seg = (doc, vis, fog) => M.regionBoundarySegments(doc, ctx, vis, fog);
const kinds = (segs, k) => segs.filter(s => s.kind === k).length;
const sig = segs => segs.map(s => s.cell + '#' + s.dir + s.kind).sort();

test('canonicalEdgeKey is independent of the side visited first', () => {
  for (const [dq, dr] of Object.values(D)) {
    const a = at(0, 0), b = at(dq, dr);
    assert.equal(M.canonicalEdgeKey(a, b), M.canonicalEdgeKey(b, a));
  }
  assert.notEqual(M.canonicalEdgeKey(at(0, 0), at(1, 0)), M.canonicalEdgeKey(at(0, 0), at(0, 1)));
});

test('cellEdge: all six directions map to the corners shared with that neighbour', () => {
  Geo.NEIGHBOR_DELTAS.forEach((d, k) => {
    const [a, b] = ctx.grid.cellEdge(BASE.q, BASE.r, k);
    const mine = ctx.grid.cellCorners(BASE.q, BASE.r), theirs = ctx.grid.cellCorners(BASE.q + d.dq, BASE.r + d.dr);
    for (const p of [a, b]) assert.ok(mine.some(m => Math.hypot(m[0] - p[0], m[1] - p[1]) < 1e-9), 'an end point is a corner of the cell');
    for (const p of [a, b]) assert.ok(theirs.some(m => Math.hypot(m[0] - p[0], m[1] - p[1]) < 0.6), 'and also a corner of neighbour ' + d.name);
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) > 5, 'two distinct points');
  });
  const [x0, y0] = ctx.grid.cellEdge(BASE.q, BASE.r, 0), [x1, y1] = ctx.grid.cellEdge(BASE.q, BASE.r, 6);
  assert.deepEqual([x0, y0], [x1, y1], 'directions wrap modulo six');
});

test('boundary: one tile has six outer edges; same-batch neighbours omit their shared edge; a three-tile line has 14', () => {
  let doc = must(place(withBatches('A'), 'A', [at(0, 0)]));
  assert.equal(seg(doc).length, 6);
  doc = must(place(doc, 'A', [at(1, 0), at(2, 0)]));
  const s = seg(doc);
  assert.equal(s.length, 14);
  assert.equal(kinds(s, 'divider'), 0);
});

test('boundary: a compact seven-hex cluster has 18 outer edges and a concave shape follows its outline', () => {
  let doc = must(place(withBatches('A'), 'A', ids(cellsOf(BASE.q, BASE.r, 7))));
  assert.equal(seg(doc).length, 18);
  // a "C": a ring of six minus one cell — the notch is an outer boundary joined to the outside, not bridged by a hull
  const ringCells = Object.values(D).map(([a, b]) => at(a, b)).slice(0, 5);
  const c = must(place(withBatches('A'), 'A', ringCells));
  assert.equal(seg(c).length, 5 * 6 - 2 * 4, 'five cells, four shared edges');
  assert.equal(Geo.chainEdgeSegments(ctx.grid, seg(c)).length, 1, 'one open outline that follows the notch');
  assert.equal(M.holeCounts(c, ctx).get('A'), undefined, 'a C encloses nothing');
});

test('boundary: different batches share exactly one divider, deduplicated', () => {
  let doc = withBatches('A', 'B');
  doc = must(place(doc, 'A', [at(0, 0)]));
  doc = must(place(doc, 'B', [at(1, 0)]));
  const s = seg(doc);
  assert.equal(kinds(s, 'divider'), 1);
  assert.equal(kinds(s, 'outer'), 10);
  const keys = s.map(x => M.canonicalEdgeKey(x.cell, M.neighborIds(x.cell)[x.dir]));
  assert.equal(new Set(keys).size, keys.length);
});

test('boundary: a ring has an inner outline; disconnected legacy components each get a perimeter', () => {
  let ring = must(place(withBatches('A'), 'A', Object.values(D).map(([a, b]) => at(a, b))));
  assert.equal(seg(ring).length, 24);
  assert.equal(Geo.chainEdgeSegments(ctx.grid, seg(ring)).length, 2);
  const split = legacy([['A', at(0, 0)], ['A', at(4, 4)]]);
  assert.equal(seg(split).length, 12);
  assert.equal(Geo.chainEdgeSegments(ctx.grid, seg(split)).length, 2);
});

test('boundary: a move changes only the expected edges; a return and a delete remove the obsolete ones', () => {
  let doc = withBatches('A', 'B');
  doc = must(place(doc, 'A', [at(0, 0), at(1, 0), at(2, 0)]));
  doc = must(place(doc, 'B', [at(0, 1)]));
  const before = new Set(sig(seg(doc)));
  const moved = must(move(doc, at(2, 0), at(1, -1)));
  const after = new Set(sig(seg(moved)));
  const gone = Array.from(before).filter(x => !after.has(x)), added = Array.from(after).filter(x => !before.has(x));
  assert.ok(gone.length > 0 && added.length > 0);
  for (const x of gone.concat(added)) assert.ok(/^(\d+,-?\d+)#/.test(x));
  const touched = new Set([at(2, 0), at(1, -1)]);
  const edgeOf = x => { const m = /^([-\d]+,[-\d]+)#(\d)/.exec(x); return [m[1], M.neighborIds(m[1])[Number(m[2])]]; };
  assert.ok(gone.concat(added).every(x => edgeOf(x).some(c => touched.has(c))), 'only edges against the origin or the destination change');
  const returned = must(ret(doc, at(2, 0)));
  assert.ok(!seg(returned).some(s => s.cell === at(2, 0)), 'the returned tile has no edges any more');
  const deleted = must(M.apply(doc, { type: 'deleteBatch', batchId: 'B', at: AT }, ctx));
  assert.ok(seg(deleted).every(s => s.kind === 'outer'), 'no divider remains');
  assert.equal(seg(deleted).length, 14);
  const wiped = must(M.apply(deleted, { type: 'deleteBatch', batchId: 'A', at: AT }, ctx));
  assert.deepEqual(seg(wiped), []);
});

test('boundary: an import recomputes exactly the same deterministic set', () => {
  let doc = withBatches('A', 'B');
  doc = must(place(doc, 'A', [at(0, 0), at(1, 0)]));
  doc = must(place(doc, 'B', [at(2, 0), at(2, 1)]));
  const r = M.parseBackupText(M.serializeBackup(doc), ctx);
  assert.deepEqual(seg(r.doc), seg(doc));
  assert.ok(!/segments|perimeter|boundary/i.test(M.serializeBackup(doc)), 'nothing derived is stored');
});

/* ---------------- player projection ---------------- */

const reveal = (doc, cells) => must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: cells, revealed: true, at: AT }, ctx));
const per = doc => P.buildPlayerProjection(doc, ctx).perimeter;

test('player boundary: revealed + revealed empty neighbour emits an outer edge; hidden neighbours emit nothing', () => {
  let doc = must(place(withBatches('A'), 'A', [at(0, 0)]));
  doc = reveal(doc, [at(0, 0)]);
  assert.deepEqual(per(doc), [], 'every neighbour is hidden');
  doc = reveal(doc, [at(1, 0)]);
  const p = per(doc);
  assert.equal(p.length, 1);
  assert.equal(M.neighborIds(at(0, 0))[p[0].dir], at(1, 0));
});

test('player boundary: revealed same-region neighbour emits no divider; different region emits one; hidden same/different emit nothing', () => {
  let doc = withBatches('A', 'B');
  doc = must(place(doc, 'A', [at(0, 0), at(1, 0)]));
  doc = must(place(doc, 'B', [at(0, 1)]));
  const around = cell => M.neighborIds(cell);
  const allNb = new Set([at(0, 0), at(1, 0), at(0, 1)].flatMap(around));
  const empty = Array.from(allNb).filter(c => !doc.tiles.some(t => t.cell === c));
  // reveal A0, A1 and all empty cells but not B: no divider towards hidden B, no shared A edge
  let d1 = reveal(doc, [at(0, 0), at(1, 0)].concat(empty));
  const p1 = per(d1);
  assert.equal(kinds(p1, 'divider'), 0, 'hidden different-region neighbour: no edge');
  assert.ok(!p1.some(s => M.neighborIds(s.cell)[s.dir] === at(1, 0) || M.neighborIds(s.cell)[s.dir] === at(0, 0)) || p1.every(s => ![at(0, 0), at(1, 0)].includes(M.neighborIds(s.cell)[s.dir])), 'same-region revealed neighbours: no shared edge');
  // now reveal B too: exactly the dividers between A and B (0,1) touches both (0,0) and (1,0)
  let d2 = reveal(d1, [at(0, 1)]);
  const p2 = per(d2);
  const expectDividers = [at(0, 0), at(1, 0)].filter(c => M.neighborIds(c).includes(at(0, 1))).length;
  assert.equal(kinds(p2, 'divider'), expectDividers);
  // hidden same-region neighbour: reveal only A0 and its empty neighbours
  const d3 = reveal(doc, [at(0, 0)].concat(M.neighborIds(at(0, 0)).filter(c => !doc.tiles.some(t => t.cell === c))));
  assert.ok(!per(d3).some(s => M.neighborIds(s.cell)[s.dir] === at(1, 0)), 'no edge towards a hidden same-region cell');
});

test('player boundary: a hidden region cell emits no overlay and no boundary, and a partial reveal draws only safe segments', () => {
  let doc = withBatches('A');
  doc = must(place(doc, 'A', [at(0, 0), at(1, 0), at(2, 0)]));
  const nbOf = c => M.neighborIds(c);
  const revealed = [at(0, 0), at(2, 0)].concat(nbOf(at(0, 0)).filter(c => c !== at(1, 0)), nbOf(at(2, 0)).filter(c => c !== at(1, 0)));
  doc = reveal(doc, revealed);
  const proj = P.buildPlayerProjection(doc, ctx);
  assert.equal(proj.overlays.length, 2, 'the hidden middle tile is not produced');
  assert.ok(!proj.overlays.some(o => Geo.cellId(o.q, o.r) === at(1, 0)));
  assert.ok(!proj.perimeter.some(s => s.cell === at(1, 0)), 'no boundary segment of the hidden tile');
  assert.ok(!proj.perimeter.some(s => nbOf(s.cell)[s.dir] === at(1, 0)), 'and none that ends against it');
  assert.equal(proj.perimeter.length, 10, 'two revealed tiles, five revealed empty neighbours each');
  for (const s of proj.perimeter) assert.ok(M.isCellRevealed(doc, s.cell) && M.isCellRevealed(doc, nbOf(s.cell)[s.dir]));
});

test('player boundary: the outside-map edge of a revealed cell is emitted; the GM projection still has everything', () => {
  let found = null;
  for (const id of ctx.decorativeCells) {
    for (const n of M.neighborIds(id)) { const p = Geo.parseCellId(n); if (ctx.placeable(p.q, p.r)) { found = { tile: n, dir: M.neighborIds(n).indexOf(id) }; break; } }
    if (found) break;
  }
  let doc = must(place(withBatches('A'), 'A', [found.tile]));
  doc = reveal(doc, [found.tile]);
  assert.ok(per(doc).some(s => s.dir === found.dir), 'the never-fogged side is drawn');
  assert.equal(seg(doc).length, 6, 'GM view: the complete boundary');
});

/* ---------------- source guards ---------------- */

const view = read('js/journey2-view.js');

test('view: the detached flow is a frozen candidate in a real dialog; the override is command intent only', () => {
  assert.match(view, /function confirmSeparateArea\(x, preview\)/);
  assert.match(view, /const tiles = preview\.cells\.map\(c => \(\{ id: Model\.newId\('t'\), cell: c\.id \}\)\);\s*detachedConfirm = /, 'ids and cells frozen at the moment of the attempt');
  assert.match(view, /placeTiles\(x\.batchId, tiles, true\)/, 'confirmation commits exactly the frozen tiles');
  assert.match(view, /cmd\.allowDetached = true/);
  assert.match(view, /el\('dialog'/);
  assert.match(view, /autofocus: true/);
  assert.ok(!/separateBatchId|data-j2-separate|journey2_separate_note/.test(view), 'no per-card separate-area control or state');
  for (const f of ['js/journey2-store.js', 'js/journey2-model.js']) assert.ok(!/detachedConfirm/.test(read(f)), 'never persisted: ' + f);
});

test('view: preview has a distinct detached state with a non-colour indicator; Redo has no dialog path', () => {
  assert.match(view, /is-detached/);
  assert.match(view, /j2-pv-detach/);
  assert.match(view, /journey2_detached_hint/);
  assert.ok(view.includes('function redo()'));
  const undoRedo = view.slice(view.indexOf('function undo()'), view.indexOf('function undo()') + 800);
  assert.ok(!/confirmSeparateArea/.test(undoRedo));
  assert.match(read('css/journey2.css'), /\.j2-pv\.is-detached \{[^}]*stroke-dasharray/);
});

test('view: move / return failures get their own messages; delete warns about splitting the prepared map', () => {
  assert.match(view, /errorText\(r\.error, 'move'\)/);
  assert.match(view, /errorText\(r\.error, 'return'\)/);
  assert.match(view, /journey2_delete_splits/);
  assert.match(view, /Model\.deleteTopology\(doc, batchId\)/);
});
