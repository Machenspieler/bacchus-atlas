'use strict';
/* Journey 2 map-editor data model: placement policy, commands, history, footprint, quantity parsing,
   document validation and backup round trip. Pure — no browser. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Geo = require('../js/journey2-geometry.js');
const M = require('../js/journey2-model.js');

const ROOT = path.join(__dirname, '..');
const template = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'map-template.json'), 'utf8'));
const anchorsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'map-anchors.json'), 'utf8'));
const ctx = M.createContext(template, anchorsDoc);
const grid = ctx.grid;
const AT = '2026-10-06T10:00:00.000Z';

/** The nearest allowed cell to a world point (deterministic fixture picker, never guesses [0,0]). */
function allowedNear(x, y, skip) {
  const skipSet = new Set(skip || []);
  const c0 = grid.worldToCell(x, y);
  for (let ring = 0; ring < 30; ring++) {
    for (let dq = -ring; dq <= ring; dq++) for (let dr = -ring; dr <= ring; dr++) {
      if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) !== ring) continue;
      const q = c0.q + dq, r = c0.r + dr, id = Geo.cellId(q, r);
      if (ctx.policy(q, r).ok && !skipSet.has(id)) return id;
    }
  }
  throw new Error('no allowed cell near ' + x + ',' + y);
}
/** n allowed cells forming ONE connected cluster (breadth-first from a fixed start) — regions must stay connected. */
function cluster(n, startId, skip) {
  const start = startId || allowedNear(1500, 1500, []);
  const out = [start], seen = new Set([start, ...(skip || [])]);
  for (let i = 0; i < out.length && out.length < n; i++) {
    const c = Geo.parseCellId(out[i]);
    for (const d of Geo.NEIGHBOR_DELTAS) {
      const id = Geo.cellId(c.q + d.dq, c.r + d.dr);
      if (out.length < n && !seen.has(id) && ctx.policy(c.q + d.dq, c.r + d.dr).ok) { seen.add(id); out.push(id); }
    }
  }
  assert.equal(out.length, n);
  return out;
}
function sample(n, seed) { return cluster(n).map((cell, i) => ({ id: 't' + (seed || '') + i, cell: cell })); }

function region(over) {
  return Object.assign({
    habitat: { biome: 'forest', blighted: false, overtaken: false, source: 'manual' }, terrain: { value: 2, source: 'manual' }, size: 20,
    encounter: { entries: [[3, 4]], combines: 0 }, rumor: 17,
  }, over || {});
}
function batch(id, qty, over) { return M.batchFromRegion(region(over), { id: id, createdAt: AT, quantity: { value: qty, source: 'manual' } }); }
function withBatch(id, qty, over) {
  const r = M.apply(M.emptyDocument(ctx, AT), { type: 'createBatch', batch: batch(id, qty, over), at: AT }, ctx);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.doc;
}
function place(doc, batchId, cells, seed) { return M.apply(doc, { type: 'place', batchId: batchId, tiles: cells.map((cell, i) => ({ id: 'p' + (seed || '') + i, cell: cell })), at: AT }, ctx); }

/* ---------------- policy and structural counts ---------------- */

test('policy: template counts are read from the template; decorative cells stay structurally valid', () => {
  assert.equal(grid.validCellCount(), 4883);
  assert.equal(template.worldSizePx[0], 4848); assert.equal(template.worldSizePx[1], 3185);
  assert.ok(ctx.decorativeCells.size > 0 && ctx.decorativeCells.size < 400);
  for (const id of ctx.decorativeCells) { const c = Geo.parseCellId(id); assert.equal(grid.isValid(c.q, c.r), true); assert.deepEqual(ctx.policy(c.q, c.r), { ok: false, reason: 'decorative' }); }
  assert.equal(ctx.allowedCellCount, 4883 - ctx.decorativeCells.size);
});

test('policy: out-of-frame cells are outside; marker cells, water and negative-r cells are allowed', () => {
  assert.deepEqual(ctx.policy(9999, 9999), { ok: false, reason: 'outside' });
  assert.deepEqual(ctx.policy(1.5, 2), { ok: false, reason: 'outside' });
  for (const a of anchorsDoc.anchors) {
    const c = Geo.parseCellId(a.cellId);
    if (ctx.decorativeCells.has(a.cellId)) continue;
    assert.equal(ctx.policy(c.q, c.r).ok, true, a.stableId + ' ' + a.cellId);
  }
  assert.ok(anchorsDoc.anchors.some(a => Geo.parseCellId(a.cellId).r < 0), 'fixture includes a negative-r marker cell');
});

test('policy: title, compass and scale furniture cells are refused; their neighbours outside the rectangles are not', () => {
  const compass = template.decorativeAreas.find(d => d.id === 'compass').rectPx;
  const c = grid.worldToCell(compass[0] + compass[2] / 2, compass[1] + compass[3] / 2);
  assert.equal(ctx.policy(c.q, c.r).reason, 'decorative');
  const far = grid.worldToCell(2400, 1600);
  assert.equal(ctx.policy(far.q, far.r).ok, true);
});

/* ---------------- quantity ---------------- */

test('quantity: 1, 12 and 20 are accepted; zero, negative, fractional, non-finite and over-limit are rejected, never clamped', () => {
  for (const v of [1, 12, 20, '20', ' 7 ', 1000]) assert.equal(M.parseQuantity(v).ok, true, String(v));
  assert.equal(M.parseQuantity('20').value, 20);
  const bad = { 0: 'too-small', '-3': 'too-small', '2.5': 'not-integer', '1e3': 'not-integer', 'abc': 'not-integer', '': 'empty', '1001': 'too-large' };
  for (const [v, code] of Object.entries(bad)) assert.deepEqual(M.parseQuantity(v), { ok: false, code: code }, JSON.stringify(v));
  assert.equal(M.parseQuantity(NaN).ok, false); assert.equal(M.parseQuantity(Infinity).ok, false); assert.equal(M.parseQuantity(2.5).code, 'not-integer');
  assert.equal(M.parseQuantity(-1).code, 'too-small'); assert.equal(M.parseQuantity(0).code, 'too-small');
  assert.ok(M.MAX_BATCH_QUANTITY < ctx.allowedCellCount);
});

/* ---------------- footprint ---------------- */

test('footprint: exactly n unique connected offsets, centred, deterministic, prefix-stable', () => {
  for (const n of [1, 2, 7, 13, 20, 37, 61, 200]) {
    const f = M.compactFootprint(n);
    assert.equal(f.length, n);
    assert.deepEqual(f[0], { dq: 0, dr: 0 });
    const keys = new Set(f.map(o => o.dq + ',' + o.dr));
    assert.equal(keys.size, n, 'unique ' + n);
    // connected: flood fill from the centre over axial neighbours
    const seen = new Set(['0,0']), stack = [{ dq: 0, dr: 0 }];
    while (stack.length) { const c = stack.pop(); for (const d of Geo.NEIGHBOR_DELTAS) { const k = (c.dq + d.dq) + ',' + (c.dr + d.dr); if (keys.has(k) && !seen.has(k)) { seen.add(k); stack.push({ dq: c.dq + d.dq, dr: c.dr + d.dr }); } }
    }
    assert.equal(seen.size, n, 'connected ' + n);
    assert.deepEqual(M.compactFootprint(n), f);
  }
  assert.deepEqual(M.compactFootprint(13).slice(0, 7), M.compactFootprint(7));
  assert.deepEqual(M.compactFootprint(0), []);
  // 7 = a centre and its full first ring: every ring-1 offset is a neighbour delta
  assert.deepEqual(new Set(M.compactFootprint(7).slice(1).map(o => o.dq + ',' + o.dr)), new Set(Geo.NEIGHBOR_DELTAS.map(d => d.dq + ',' + d.dr)));
});

/* ---------------- commands: the 20 -> 7 -> All 13 scenario ---------------- */

test('scenario (with ctx): move keeps counts; undo/redo restore exact snapshots; redo never re-rolls', () => {
  const history = M.createHistory();
  let doc = withBatch('b1', 20);
  const grown = cluster(21);
  const seven = grown.slice(0, 7);
  const r7 = M.apply(doc, { type: 'place', batchId: 'b1', tiles: seven.map((cell, i) => ({ id: 's' + i, cell: cell })), at: AT }, ctx);
  assert.equal(r7.ok, true);
  doc = r7.doc;
  const original = doc;
  const cells = grown.slice(7, 20);                       // 13 more cells, each reaching the placed shape through its BFS parent
  const all = M.apply(doc, { type: 'place', batchId: 'b1', tiles: cells.map((cell, i) => ({ id: 'a' + i, cell: cell })), at: AT }, ctx);
  assert.equal(all.ok, true); M.historyCommit(history, doc, all.doc, 'all'); doc = all.doc;
  const afterAll = doc;
  const target = grown[20];                               // a free cell touching the shape: move a tile whose departure keeps it connected
  const mover = doc.tiles.slice().reverse().find(x => M.isConnected(doc.tiles.filter(y => y.id !== x.id).map(y => y.cell).concat([target])));
  const mv = M.apply(doc, { type: 'move', tileId: mover.id, to: target, at: AT }, ctx);
  assert.equal(mv.ok, true, JSON.stringify(mv)); M.historyCommit(history, doc, mv.doc, 'move'); doc = mv.doc;
  assert.deepEqual(M.derive(doc).counts.get('b1'), { quantity: 20, placed: 20, remaining: 0 });
  assert.equal(M.derive(doc).byId.get(mover.id).cell, target);
  // Undo the move, Undo the all-drop
  let e = M.historyUndo(history); doc = e.before; assert.equal(doc, afterAll);
  e = M.historyUndo(history); doc = e.before; assert.equal(doc, original);
  assert.deepEqual(M.derive(doc).counts.get('b1'), { quantity: 20, placed: 7, remaining: 13 });
  assert.deepEqual(doc.tiles.map(t => t.cell), seven);
  // Redo replays the SAME footprint ids/cells
  e = M.historyRedo(history); assert.deepEqual(e.after.tiles.slice(7).map(t => t.cell), cells);
  assert.deepEqual(e.after.tiles.slice(7).map(t => t.id), cells.map((_, i) => 'a' + i));
  // a new committed edit after Undo clears the redo branch
  const ret = M.apply(e.before, { type: 'returnTile', tileId: 's0', at: AT }, ctx);
  M.historyCommit(history, e.before, ret.doc, 'return');
  assert.equal(history.redo.length, 0);
});

test('place: one occupied destination in an All drop rejects the entire drop (no partial, no overwrite)', () => {
  let doc = withBatch('b1', 20);
  const anchor = Geo.parseCellId(allowedNear(1700, 1900));
  const cells = M.compactFootprint(7).map(o => Geo.cellId(anchor.q + o.dq, anchor.r + o.dr));
  const blocker = withBatch('b2', 5);
  const b = M.apply(doc, { type: 'createBatch', batch: batch('b2', 5), at: AT }, ctx).doc;
  const occ = M.apply(b, { type: 'place', batchId: 'b2', tiles: [{ id: 'x1', cell: cells[3] }], at: AT }, ctx).doc;
  const r = M.apply(occ, { type: 'place', batchId: 'b1', tiles: cells.map((cell, i) => ({ id: 'q' + i, cell: cell })), at: AT }, ctx);
  assert.equal(r.ok, false); assert.equal(r.error.code, 'blocked');
  assert.deepEqual(r.error.conflicts.map(c => [c.id, c.reason]), [[cells[3], 'occupied']]);
  assert.equal(M.derive(occ).counts.get('b1').placed, 0, 'input document untouched');
  void blocker;
});

test('place: outside-frame, decorative and over-stock drops are refused atomically', () => {
  const doc = withBatch('b1', 3);
  const compass = template.decorativeAreas.find(d => d.id === 'compass').rectPx;
  const deco = grid.worldToCell(compass[0] + compass[2] / 2, compass[1] + compass[3] / 2);
  const ok = allowedNear(2400, 1600);
  let r = M.apply(doc, { type: 'place', batchId: 'b1', tiles: [{ id: 'a', cell: ok }, { id: 'b', cell: Geo.cellId(deco.q, deco.r) }], at: AT }, ctx);
  assert.equal(r.error.conflicts[0].reason, 'decorative');
  r = M.apply(doc, { type: 'place', batchId: 'b1', tiles: [{ id: 'a', cell: ok }, { id: 'b', cell: '99999,99999' }], at: AT }, ctx);
  assert.equal(r.error.conflicts[0].reason, 'outside');
  r = M.apply(doc, { type: 'place', batchId: 'b1', tiles: sample(4), at: AT }, ctx);
  assert.equal(r.error.code, 'no-stock');
  r = M.apply(doc, { type: 'place', batchId: 'b1', tiles: [{ id: 'a', cell: ok }, { id: 'b', cell: ok }], at: AT }, ctx);
  assert.equal(r.error.code, 'duplicate-cell');
  assert.equal(M.apply(doc, { type: 'place', batchId: 'nope', tiles: [{ id: 'a', cell: ok }], at: AT }, ctx).error.code, 'no-batch');
});

test('move: origin is a no-op (same doc reference); a blocked move leaves the source in place; return restores one unit', () => {
  let doc = withBatch('b1', 4);
  const [a, b] = cluster(2);
  doc = M.apply(doc, { type: 'place', batchId: 'b1', tiles: [{ id: 'A', cell: a }, { id: 'B', cell: b }], at: AT }, ctx).doc;
  const same = M.apply(doc, { type: 'move', tileId: 'A', to: a, at: AT }, ctx);
  assert.equal(same.ok, true); assert.equal(same.noop, true); assert.equal(same.doc, doc);
  const blocked = M.apply(doc, { type: 'move', tileId: 'A', to: b, at: AT }, ctx);
  assert.equal(blocked.ok, false); assert.equal(blocked.error.conflicts[0].reason, 'occupied');
  assert.equal(M.derive(doc).byId.get('A').cell, a);
  const ret = M.apply(doc, { type: 'returnTile', tileId: 'A', at: AT }, ctx);
  assert.deepEqual(M.derive(ret.doc).counts.get('b1'), { quantity: 4, placed: 1, remaining: 3 });
  assert.equal(M.apply(doc, { type: 'returnTile', tileId: 'zzz', at: AT }, ctx).error.code, 'no-tile');
});

test('two forests stay separate batches; notes edits are undoable commands and unchanged notes are no-ops', () => {
  let doc = withBatch('f1', 5);
  doc = M.apply(doc, { type: 'createBatch', batch: batch('f2', 5), at: AT }, ctx).doc;
  assert.equal(doc.batches.length, 2);
  assert.equal(M.apply(doc, { type: 'createBatch', batch: batch('f2', 5), at: AT }, ctx).error.code, 'duplicate-batch');
  const n = M.apply(doc, { type: 'setNotes', batchId: 'f1', notes: 'Ruins at the north edge', at: AT }, ctx);
  assert.equal(M.batchById(n.doc, 'f1').notes, 'Ruins at the north edge'); assert.equal(M.batchById(doc, 'f1').notes, '');
  assert.equal(M.apply(n.doc, { type: 'setNotes', batchId: 'f1', notes: 'Ruins at the north edge', at: AT }, ctx).noop, true);
  assert.equal(M.apply(doc, { type: 'setNotes', batchId: 'f1', notes: 'x'.repeat(M.MAX_NOTES_LENGTH + 1), at: AT }, ctx).error.code, 'bad-notes');
});

test('history: bounded, redo cleared by a new edit, no entry for a no-op', () => {
  const h = M.createHistory(3);
  const a = { v: 1 }, b = { v: 2 }, c = { v: 3 }, d = { v: 4 }, e = { v: 5 };
  M.historyCommit(h, a, b, 1); M.historyCommit(h, b, c, 2); M.historyCommit(h, c, d, 3); M.historyCommit(h, d, e, 4);
  assert.equal(h.undo.length, 3); assert.equal(h.undo[0].before, b);
  M.historyCommit(h, e, e, 'noop'); assert.equal(h.undo.length, 3);
  M.historyUndo(h); assert.equal(h.redo.length, 1);
  M.historyCommit(h, d, a, 5); assert.equal(h.redo.length, 0);
});

/* ---------------- validation, import, round trip ---------------- */

function sampleDoc() {
  let doc = withBatch('b1', 20, { habitat: { biome: 'forest', blighted: true, overtaken: false, source: 'rolled', rolls: [1, 12] } });
  doc = M.apply(doc, { type: 'createBatch', batch: batch('b2', 3, { habitat: { biome: null, blighted: true, overtaken: true, source: 'rolled', rolls: [1, 1] } }), at: AT }, ctx).doc;
  doc = M.apply(doc, { type: 'place', batchId: 'b1', tiles: sample(4), at: AT }, ctx).doc;
  return M.apply(doc, { type: 'setNotes', batchId: 'b1', notes: 'Notes <b>not html</b>', at: AT }, ctx).doc;
}

test('backup: export -> import -> export is byte-identical and keeps every supported field', () => {
  const doc = sampleDoc();
  const text = M.serializeBackup(doc);
  const back = M.parseBackupText(text, ctx);
  assert.equal(back.ok, true, JSON.stringify(back.errors));
  assert.deepEqual(back.doc, doc);
  assert.equal(M.serializeBackup(back.doc), text);
  assert.ok(!/<svg|data:image|base64/.test(text), 'no embedded raster/SVG');
  assert.equal(M.batchById(back.doc, 'b1').notes, 'Notes <b>not html</b>', 'notes are data, stored verbatim');
  assert.equal(back.doc.batches[0].habitat.rolls.join(), '1,12');
  assert.equal(M.symbolIdOf(back.doc.batches[1]), 'fully-shadowblighted');
});

test('import: unknown/future schema, wrong template, bad JSON, wrong kind are rejected as a whole', () => {
  const doc = sampleDoc();
  const j = o => JSON.stringify(o);
  assert.equal(M.parseBackupText(j(Object.assign({}, doc, { schemaVersion: 2 })), ctx).code, 'unsupported-schema');
  assert.equal(M.parseBackupText(j(Object.assign({}, doc, { templateId: 'other-map' })), ctx).code, 'template-mismatch');
  assert.equal(M.parseBackupText(j(Object.assign({}, doc, { templateVersion: 9 })), ctx).code, 'template-mismatch');
  assert.equal(M.parseBackupText('{nope', ctx).code, 'invalid-json');
  assert.equal(M.parseBackupText(j(Object.assign({}, doc, { kind: 'x' })), ctx).code, 'invalid');
  assert.equal(M.parseBackupText(j([1, 2]), ctx).code, 'invalid');
  assert.equal(M.parseBackupText(j(Object.assign({}, doc, { extra: 1 })), ctx).ok, false, 'unknown field is rejected, never silently dropped');
});

test('import: duplicate cell, over-quantity, missing batch, duplicate ids, bad cells, decorative cells are rejected', () => {
  const doc = sampleDoc();
  const clone = () => JSON.parse(JSON.stringify(doc));
  let d = clone(); d.tiles[1].cell = d.tiles[0].cell;
  assert.match(M.parseBackupText(JSON.stringify(d), ctx).errors.join('|'), /occupied twice/);
  d = clone(); d.batches[0].quantity = 3;
  assert.match(M.parseBackupText(JSON.stringify(d), ctx).errors.join('|'), /4 tiles placed but quantity is 3/);
  d = clone(); d.tiles[0].batchId = 'ghost';
  assert.match(M.parseBackupText(JSON.stringify(d), ctx).errors.join('|'), /missing batch/);
  d = clone(); d.tiles[1].id = d.tiles[0].id;
  assert.match(M.parseBackupText(JSON.stringify(d), ctx).errors.join('|'), /duplicate tile id/);
  d = clone(); d.batches[1].id = d.batches[0].id;
  assert.match(M.parseBackupText(JSON.stringify(d), ctx).errors.join('|'), /duplicate batch id/);
  d = clone(); d.tiles[0].cell = '01,2';
  assert.match(M.parseBackupText(JSON.stringify(d), ctx).errors.join('|'), /malformed cell/);
  d = clone(); d.tiles[0].cell = '99999,1';
  assert.match(M.parseBackupText(JSON.stringify(d), ctx).errors.join('|'), /outside/);
  const compass = template.decorativeAreas.find(x => x.id === 'compass').rectPx, dc = grid.worldToCell(compass[0] + 100, compass[1] + 100);
  d = clone(); d.tiles[0].cell = Geo.cellId(dc.q, dc.r);
  assert.match(M.parseBackupText(JSON.stringify(d), ctx).errors.join('|'), /decorative/);
  d = clone(); d.batches[0].quantity = 2.5;
  assert.equal(M.parseBackupText(JSON.stringify(d), ctx).ok, false);
  d = clone(); d.batches[0].habitat.biome = 'settlement';
  assert.match(M.parseBackupText(JSON.stringify(d), ctx).errors.join('|'), /eleven terrains/);
  d = clone(); d.batches[0].habitat.source = 'manual';
  assert.match(M.parseBackupText(JSON.stringify(d), ctx).errors.join('|'), /manual habitat has no dice rolls/);
  d = clone(); d.batches[0].terrain.value = 5;
  assert.equal(M.parseBackupText(JSON.stringify(d), ctx).ok, false);
  d = clone(); d.batches[0].quantity = 1e9;
  assert.equal(M.parseBackupText(JSON.stringify(d), ctx).ok, false);
  d = clone(); d.batches[0].notes = 7;
  assert.equal(M.parseBackupText(JSON.stringify(d), ctx).ok, false);
});

test('import: a __proto__ key cannot pollute and the result is a clean copy', () => {
  const text = M.serializeBackup(sampleDoc()).replace('"batches"', '"__proto__": {"polluted": true}, "batches"');
  const r = M.parseBackupText(text, ctx);
  assert.equal(({}).polluted, undefined);
  assert.equal(r.ok, false);
});

test('manual provenance is never given fabricated dice rolls; a rolled habitat keeps its rolls', () => {
  const manual = batch('m', 20);
  assert.equal('rolls' in manual.habitat, false);
  assert.equal(manual.habitat.source, 'manual'); assert.equal(manual.terrain.source, 'manual'); assert.equal(manual.quantitySource, 'manual');
  const rolled = M.batchFromRegion(region({ habitat: { biome: 'forest', blighted: false, overtaken: false, source: 'rolled', rolls: [11] } }), { id: 'r', createdAt: AT, quantity: { value: 8, source: 'rolled' } });
  assert.deepEqual(rolled.habitat.rolls, [11]); assert.equal(rolled.quantitySource, 'rolled');
  assert.equal(M.validateBatch(manual, 'x').errors.length, 0);
  assert.equal(M.validateBatch(rolled, 'x').errors.length, 0);
});

test('a batch copy shares no mutable state with the generator result', () => {
  const reg = region();
  const b = M.batchFromRegion(reg, { id: 'c', createdAt: AT, quantity: { value: 5, source: 'manual' } });
  reg.encounter.entries[0][0] = 8; reg.habitat.biome = 'frozen';
  assert.equal(b.encounter.entries[0][0], 3); assert.equal(b.habitat.biome, 'forest');
});

test('large synthetic document: 1000 placed tiles validate and derive quickly', () => {
  let doc = withBatch('big', 1000);
  const tiles = []; const seen = new Set();
  const [W, H] = template.worldSizePx;
  for (let y = 150; tiles.length < 1000 && y < H - 50; y += 40) for (let x = 100; tiles.length < 1000 && x < W - 50; x += 70) {
    const c = grid.worldToCell(x, y), id = Geo.cellId(c.q, c.r);
    if (ctx.policy(c.q, c.r).ok && !seen.has(id)) { seen.add(id); tiles.push({ id: 'g' + tiles.length, cell: id }); }
  }
  assert.equal(tiles.length, 1000);
  const t0 = Date.now();
  doc = M.apply(doc, { type: 'place', batchId: 'big', tiles: tiles, at: AT }, ctx).doc;
  const v = M.validateDocument(JSON.parse(M.serializeBackup(doc)), ctx);
  assert.equal(v.ok, true);
  assert.ok(Date.now() - t0 < 2000, 'took ' + (Date.now() - t0) + ' ms');
  assert.equal(M.derive(doc).counts.get('big').remaining, 0);
});

/* ---------------- rendering protection (property test over the whole map) ---------------- */

test('glyph layout: on every allowed cell, for every symbol at worst-case size (4 dots + blight slot), the box is clear of every marker / label / decorative rect and inside its hexagon — or withheld', () => {
  const symbols = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'symbols.json'), 'utf8')).symbols.filter(s => s.kind === 'habitat' || s.kind === 'special-state');
  const GLYPH_SCALE = 0.55, BLIGHT_MIN_WIDTH_PX = 38;   // the same constants as js/journey2-view.js (a blighted box is at least this wide; the mark sits beside the dots)
  let cells = 0, shown = 0, withheld = 0;
  grid.forEachValidCell((q, r) => {
    if (!ctx.policy(q, r).ok) return;
    cells++;
    const poly = grid.cellCorners(q, r);
    for (const s of symbols) {
      const gw = Math.round(s.sizePx[0] * GLYPH_SCALE * 10) / 10, gh = Math.round(s.sizePx[1] * GLYPH_SCALE * 10) / 10;
      const L = Geo.layoutProofGlyph(grid, q, r, { w: Math.max(gw, BLIGHT_MIN_WIDTH_PX), h: gh, dots: 4 }, ctx.protections, 2);
      if (L.hidden) { withheld++; continue; }
      shown++;
      for (const p of ctx.protections) assert.equal(Geo.rectsIntersect(L.boxPx, p.rectPx), false, `${q},${r} ${s.id} overlaps ${p.id}`);
      const b = L.boxPx;
      for (const pt of [[b[0], b[1]], [b[0] + b[2], b[1]], [b[0], b[1] + b[3]], [b[0] + b[2], b[1] + b[3]]]) assert.equal(Geo.pointInConvexPolygon(pt, poly), true, `${q},${r} ${s.id} box leaves its cell`);
    }
  });
  assert.equal(cells, ctx.allowedCellCount);
  assert.ok(withheld > 0, 'at least the marker cells withhold the glyph rather than cover a marker');
  assert.ok(withheld < cells * symbols.length * 0.025, 'only cells touching protected artwork withhold a glyph (' + shown + ' shown, ' + withheld + ' withheld)');
});

test('glyph layout: every marker cell withholds or shifts its glyph so the original icon is never covered', () => {
  for (const a of anchorsDoc.anchors) {
    const c = Geo.parseCellId(a.cellId);
    if (!ctx.policy(c.q, c.r).ok) continue;
    const L = Geo.layoutProofGlyph(grid, c.q, c.r, { w: 33, h: 29, dots: 4 }, ctx.protections, 2);
    if (!L.hidden) assert.equal(Geo.rectsIntersect(L.boxPx, a.iconProtectionArea.rectPx), false, a.stableId);
  }
});
