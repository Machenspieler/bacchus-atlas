'use strict';
/* Journey 2 Phase C: Fog of War and Player Preview. Pure — no browser. Covers the document's `playerVisibility`, the
   `setCellsRevealed` command and its Undo/Redo behaviour, the hex-line helper behind fast strokes, the player projection
   (what players may see, and that GM-only data never reaches it), the UI-only preference storage, localization and the
   source-level guards that keep tools, preview and the document apart. The real pointer behaviour (strokes, Space-pan,
   priority, Player Preview DOM, camera restore) is covered in a browser by scripts/journey2/stage1-verify.js (`fog.*`)
   and scripts/journey2/browser-verify.js (`fog.*`). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Geo = require('../js/journey2-geometry.js');
const M = require('../js/journey2-model.js');
const Store = require('../js/journey2-store.js');
const P = require('../js/journey2-projection.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const template = JSON.parse(read('data/journey2/map-template.json'));
const anchorsDoc = JSON.parse(read('data/journey2/map-anchors.json'));
const ctx = M.createContext(template, anchorsDoc);
const AT = '2026-10-06T10:00:00.000Z', AT2 = '2026-10-06T11:00:00.000Z';
const must = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.doc; };
const cid = Geo.cellId;

/** A placeable centre whose radius-2 neighbourhood is placeable too, found deterministically. */
const CENTER = (() => {
  for (let q = 30; q < 90; q++) for (let r = -40; r < 40; r++) {
    let ok = true;
    for (let dq = -2; dq <= 2 && ok; dq++) for (let dr = -2; dr <= 2 && ok; dr++) if (Math.abs(dq + dr) <= 2 && !ctx.placeable(q + dq, r + dr)) ok = false;
    if (ok) return { q, r };
  }
  throw new Error('no open area');
})();
const ring = (n) => { const out = []; for (let dq = -n; dq <= n; dq++) for (let dr = -n; dr <= n; dr++) if (Math.abs(dq + dr) <= n) out.push(cid(CENTER.q + dq, CENTER.r + dr)); return out; };
const AREA = ring(2);                                   // 19 placeable cells, one connected blob

function batch(id, over) {
  return M.batchFromRegion(Object.assign({
    habitat: { biome: 'forest', blighted: false, overtaken: false, source: 'rolled', rolls: [11] }, terrain: { value: 3, source: 'rolled' }, size: 6,
    encounter: { entries: [[3, 4]], combines: 0 }, rumor: 49,
  }, over || {}), { id: id, createdAt: AT });
}
/** One region with 4 placed tiles + SECRET notes, so a leak into the projection is detectable. */
function fixture() {
  let doc = M.emptyDocument(ctx, AT);
  doc = must(M.apply(doc, { type: 'createBatch', batch: Object.assign(batch('region-secret-id', { habitat: { biome: 'forest', blighted: true, overtaken: false, source: 'rolled', rolls: [4] } }), { notes: 'SECRET-GM-NOTE' }), at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'place', batchId: 'region-secret-id', tiles: AREA.slice(0, 4).map((cell, i) => ({ id: 'tile-secret-' + i, cell: cell })), at: AT }, ctx));
  return doc;
}

/* ---------------- document ---------------- */

test('a new document has a visibility object and every cell is hidden', () => {
  const doc = M.emptyDocument(ctx, AT);
  assert.deepEqual(doc.playerVisibility, { revealedCells: [], revealedSanctuaryNameAnchorIds: [] });
  assert.equal(M.isCellRevealed(doc, AREA[0]), false);
  assert.equal(M.getRevealedCellSet(doc).size, 0);
});

test('a document without playerVisibility (old / partial prototype) normalizes to nothing revealed instead of failing', () => {
  const raw = JSON.parse(M.serializeBackup(fixture()));
  delete raw.playerVisibility;
  const r = M.validateDocument(raw, ctx);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.doc.playerVisibility, { revealedCells: [], revealedSanctuaryNameAnchorIds: [] });
  for (const bad of [{}, { revealedCells: undefined }, { revealedCells: null }]) {
    const x = M.validateDocument(Object.assign({}, raw, { playerVisibility: bad }), ctx);
    if (bad.revealedCells === null) assert.equal(x.ok, false); else assert.equal(x.ok, true, JSON.stringify(bad));
  }
  assert.equal(M.validateDocument(Object.assign({}, raw, { playerVisibility: null }), ctx).ok, true);
  assert.equal(M.isEmptyDocument(r.doc), false, 'a map with regions is not empty');
});

test('validation accepts canonical visibility, collapses duplicates and orders it; malformed data is rejected whole', () => {
  const raw = JSON.parse(M.serializeBackup(M.emptyDocument(ctx, AT)));
  const keys = [AREA[5], AREA[2], AREA[2], AREA[9]];
  const ok = M.validateDocument(Object.assign({}, raw, { playerVisibility: { revealedCells: keys } }), ctx);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.doc.playerVisibility.revealedCells, Array.from(new Set(keys)).sort(M.compareCellKeys));
  const out = Geo.parseCellId('0,0') && cid(-5, -5);
  const furniture = Array.from(ctx.decorativeCells)[0];
  for (const bad of [
    { revealedCells: 'x' }, { revealedCells: [1] }, { revealedCells: ['nope'] }, { revealedCells: ['01,2'] }, { revealedCells: [out] }, { revealedCells: [furniture] },
    { revealedCells: [], hiddenCells: [] }, 'x', [], { extra: 1 },
  ]) assert.equal(M.validateDocument(Object.assign({}, raw, { playerVisibility: bad }), ctx).ok, false, JSON.stringify(bad));
});

test('export -> import keeps the visibility, byte for byte, and only one list exists (no hiddenCells twin)', () => {
  let doc = fixture();
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: [AREA[7], AREA[1], AREA[3]], revealed: true, at: AT2 }, ctx));
  const text = M.serializeBackup(doc);
  const back = M.parseBackupText(text, ctx);
  assert.equal(back.ok, true);
  assert.deepEqual(back.doc.playerVisibility, doc.playerVisibility);
  assert.equal(M.serializeBackup(back.doc), text);
  const j = JSON.parse(text);
  assert.deepEqual(Object.keys(j.playerVisibility), ['revealedCells', 'revealedSanctuaryNameAnchorIds']);
  assert.ok(!('hiddenCells' in j) && j.batches.every(b => !('revealed' in b) && !('fog' in b)) && j.tiles.every(t => Object.keys(t).sort().join() === 'batchId,cell,id'), 'fog never lives on a batch or a tile');
});

/* ---------------- commands ---------------- */

test('reveal adds cells, hide removes them, serialization order is deterministic', () => {
  const d0 = M.emptyDocument(ctx, AT);
  const d1 = must(M.apply(d0, { type: 'setCellsRevealed', cellKeys: [AREA[9], AREA[0], AREA[4]], revealed: true, at: AT2 }, ctx));
  assert.deepEqual(d1.playerVisibility.revealedCells, [AREA[9], AREA[0], AREA[4]].sort(M.compareCellKeys));
  assert.equal(d1.updatedAt, AT2);
  const d2 = must(M.apply(d1, { type: 'setCellsRevealed', cellKeys: [AREA[0]], revealed: false, at: AT2 }, ctx));
  assert.equal(M.isCellRevealed(d2, AREA[0]), false);
  assert.equal(M.isCellRevealed(d2, AREA[4]), true);
  // same set, different insertion order -> identical stored list
  const a = must(M.apply(d0, { type: 'setCellsRevealed', cellKeys: AREA.slice(0, 6), revealed: true, at: AT }, ctx));
  const b = must(M.apply(d0, { type: 'setCellsRevealed', cellKeys: AREA.slice(0, 6).reverse(), revealed: true, at: AT }, ctx));
  assert.equal(JSON.stringify(a.playerVisibility), JSON.stringify(b.playerVisibility));
  assert.equal(M.compareCellKeys('2,10', '10,-3') < 0, true, 'numeric, not lexical');
});

test('duplicates and invalid / out-of-map / furniture cells are ignored; a command that changes nothing is a no-op', () => {
  const d0 = fixture();
  const furniture = Array.from(ctx.decorativeCells)[0];
  const d1 = must(M.apply(d0, { type: 'setCellsRevealed', cellKeys: [AREA[0], AREA[0], 'garbage', cid(-9, -9), furniture, 5, null], revealed: true, at: AT2 }, ctx));
  assert.deepEqual(d1.playerVisibility.revealedCells, [AREA[0]]);
  const noop = M.apply(d1, { type: 'setCellsRevealed', cellKeys: [AREA[0], 'garbage'], revealed: true, at: AT2 }, ctx);
  assert.equal(noop.ok, true); assert.equal(noop.noop, true); assert.equal(noop.doc, d1, 'the same document reference');
  assert.equal(M.apply(d1, { type: 'setCellsRevealed', cellKeys: [AREA[5]], revealed: false, at: AT2 }, ctx).doc, d1, 'hiding an already hidden cell changes nothing');
  assert.equal(M.apply(d1, { type: 'setCellsRevealed', cellKeys: [], revealed: true, at: AT2 }, ctx).noop, true);
  assert.equal(M.apply(d1, { type: 'setCellsRevealed', cellKeys: [AREA[1]], revealed: 'yes', at: AT2 }, ctx).ok, false);
  const h = M.createHistory();
  M.historyCommit(h, d1, noop.doc, 'fog');
  assert.equal(h.undo.length, 0, 'a no-op never reaches the history');
});

test('the command never mutates a batch or a tile; other commands never touch visibility', () => {
  const d0 = fixture();
  const d1 = must(M.apply(d0, { type: 'setCellsRevealed', cellKeys: AREA.slice(0, 8), revealed: true, at: AT2 }, ctx));
  assert.equal(d1.batches, d0.batches, 'batches are the same array');
  assert.equal(d1.tiles, d0.tiles, 'tiles are the same array');
  assert.equal(d1.batches[0].notes, 'SECRET-GM-NOTE');
  // generating, placing, moving and deleting do not reveal or hide anything
  const free = AREA[10];
  let d = must(M.apply(d1, { type: 'createBatch', batch: batch('b2'), at: AT2 }, ctx));
  d = must(M.apply(d, { type: 'place', batchId: 'b2', tiles: [{ id: 'tx', cell: free }], allowDetached: true, at: AT2 }, ctx));
  assert.equal(d.playerVisibility, d1.playerVisibility);
  d = must(M.apply(d, { type: 'move', tileId: 'tx', to: AREA[11], at: AT2 }, ctx));
  assert.equal(M.isCellRevealed(d, AREA[11]), false, 'moving content into a hidden cell does not reveal it');
  assert.equal(M.isCellRevealed(d, AREA[0]), true, 'moving content never hides a revealed cell');
  d = must(M.apply(d, { type: 'returnTile', tileId: 'tx', at: AT2 }, ctx));
  d = must(M.apply(d, { type: 'deleteBatch', batchId: 'region-secret-id', at: AT2 }, ctx));
  assert.deepEqual(d.playerVisibility.revealedCells, d1.playerVisibility.revealedCells, 'deleting a region keeps the fog of its cells');
});

test('Undo / Redo: one multi-cell stroke is one history entry, restored and replayed exactly', () => {
  const d0 = fixture(), h = M.createHistory();
  const stroke = AREA.slice(0, 12);
  const r = M.apply(d0, { type: 'setCellsRevealed', cellKeys: stroke, revealed: true, at: AT2 }, ctx);
  M.historyCommit(h, d0, r.doc, 'fogReveal');
  assert.equal(h.undo.length, 1);
  assert.equal(r.changed, 12);
  const e = M.historyUndo(h);
  assert.equal(e.before, d0, 'Undo restores the complete previous state, notes and regions untouched');
  assert.equal(M.getRevealedCellSet(e.before).size, 0);
  const again = M.historyRedo(h);
  assert.equal(again.after, r.doc, 'Redo is the stored document — nothing is recomputed or re-interpolated');
  assert.deepEqual(again.after.playerVisibility.revealedCells, r.doc.playerVisibility.revealedCells);
  // a second stroke hides part of it
  const r2 = M.apply(r.doc, { type: 'setCellsRevealed', cellKeys: stroke.slice(0, 5), revealed: false, at: AT2 }, ctx);
  M.historyCommit(h, r.doc, r2.doc, 'fogHide');
  assert.equal(M.getRevealedCellSet(r2.doc).size, 7);
  assert.equal(M.historyUndo(h).before, r.doc);
  assert.equal(M.getRevealedCellSet(h.redo[h.redo.length - 1].before).size, 12);
});

test('the revealed set is cached per document and shared between documents that did not change visibility', () => {
  const d0 = fixture();
  const d1 = must(M.apply(d0, { type: 'setCellsRevealed', cellKeys: [AREA[0]], revealed: true, at: AT2 }, ctx));
  assert.equal(M.getRevealedCellSet(d1), M.getRevealedCellSet(d1));
  const d2 = must(M.apply(d1, { type: 'setNotes', batchId: 'region-secret-id', notes: 'x', at: AT2 }, ctx));
  assert.equal(M.getRevealedCellSet(d2), M.getRevealedCellSet(d1));
  assert.deepEqual(M.getRevealedCellSet(M.emptyDocument(ctx, AT)), new Set());
  assert.equal(M.getRevealedCellSet({ batches: [], tiles: [] }).size, 0, 'a partial document does not crash');
});

/* ---------------- hex line (fast strokes) ---------------- */

const dist = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r));

test('cellLine: both ends, one adjacent step at a time, exactly distance + 1 cells, deterministic', () => {
  const pairs = [[{ q: 0, r: 0 }, { q: 0, r: 0 }], [{ q: 0, r: 0 }, { q: 5, r: 0 }], [{ q: 3, r: -2 }, { q: -4, r: 6 }], [{ q: -7, r: 9 }, { q: 8, r: -3 }], [{ q: 40, r: 10 }, { q: 41, r: 10 }], [{ q: 2, r: 2 }, { q: 15, r: -14 }]];
  for (const [a, b] of pairs) {
    const line = Geo.cellLine(a, b);
    assert.deepEqual(line[0], a); assert.deepEqual(line[line.length - 1], b);
    assert.equal(line.length, dist(a, b) + 1);
    for (let i = 1; i < line.length; i++) assert.equal(dist(line[i - 1], line[i]), 1, 'no gap at step ' + i);
    assert.deepEqual(Geo.cellLine(a, b), line);
    assert.equal(new Set(line.map(c => cid(c.q, c.r))).size, line.length, 'no cell twice');
  }
  assert.ok(!Object.is(Geo.cellLine({ q: 0, r: 0 }, { q: 2, r: -2 })[1].q, -0));
});

test('a fast pointer jump is filled with the intermediate cells and still commits as one entry', () => {
  // two samples far apart: the view feeds cellLine(last, current) into the stroke set, then ONE command
  const samples = [{ q: CENTER.q - 2, r: CENTER.r }, { q: CENTER.q + 2, r: CENTER.r }];
  const seen = new Set(), order = [];
  let last = null;
  for (const c of samples) for (const x of last ? Geo.cellLine(last, c) : [c]) { const k = cid(x.q, x.r); if (!seen.has(k)) { seen.add(k); order.push(k); } last = c; }
  assert.equal(order.length, 5);
  const d0 = M.emptyDocument(ctx, AT), h = M.createHistory();
  const r = M.apply(d0, { type: 'setCellsRevealed', cellKeys: order, revealed: true, at: AT2 }, ctx);
  M.historyCommit(h, d0, r.doc, 'fogReveal');
  assert.equal(r.changed, 5); assert.equal(h.undo.length, 1);
});

/* ---------------- player projection ---------------- */

test('projection: a tile in a revealed cell is included, a hidden one is not produced at all', () => {
  const d0 = fixture();
  assert.deepEqual(P.buildPlayerProjection(d0).overlays, [], 'nothing revealed -> no generated overlay');
  const d1 = must(M.apply(d0, { type: 'setCellsRevealed', cellKeys: [AREA[0], AREA[2]], revealed: true, at: AT2 }, ctx));
  const p = P.buildPlayerProjection(d1);
  assert.deepEqual(p.overlays.map(o => cid(o.q, o.r)), [AREA[0], AREA[2]], 'a region spanning revealed and hidden cells contributes only its revealed tiles');
  assert.deepEqual(p.overlays[0], { q: Geo.parseCellId(AREA[0]).q, r: Geo.parseCellId(AREA[0]).r, symbolId: 'forest', dots: 3, blightMark: true, tint: 'forest' });
  assert.equal(P.isCellVisibleToPlayers(d1, AREA[0]), true);
  assert.equal(P.isCellVisibleToPlayers(d1, AREA[1]), false);
  assert.deepEqual(p.revealedCells, [AREA[0], AREA[2]].sort(M.compareCellKeys));
  // revealing an EMPTY cell reveals no content; revealing a cell never reveals the rest of its region
  const d2 = must(M.apply(d0, { type: 'setCellsRevealed', cellKeys: [AREA[15]], revealed: true, at: AT2 }, ctx));
  assert.deepEqual(P.buildPlayerProjection(d2).overlays, []);
});

test('projection: content moved into a revealed cell becomes visible, into a hidden cell it is hidden; the move never changes fog', () => {
  let doc = M.emptyDocument(ctx, AT);
  doc = must(M.apply(doc, { type: 'createBatch', batch: batch('mv', { size: 1 }), at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'place', batchId: 'mv', tiles: [{ id: 'tm', cell: AREA[10] }], at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: [AREA[11]], revealed: true, at: AT }, ctx));
  assert.equal(P.buildPlayerProjection(doc).overlays.length, 0, 'it starts in a hidden cell');
  const into = must(M.apply(doc, { type: 'move', tileId: 'tm', to: AREA[11], at: AT2 }, ctx));
  assert.equal(P.buildPlayerProjection(into).overlays.length, 1, 'moving into a revealed cell shows it');
  const out = must(M.apply(into, { type: 'move', tileId: 'tm', to: AREA[12], at: AT2 }, ctx));
  assert.equal(P.buildPlayerProjection(out).overlays.length, 0, 'moving into a hidden cell hides it');
  assert.deepEqual(out.playerVisibility.revealedCells, [AREA[11]]);
});

test('projection: an overtaken region keeps its symbol and gets no blight mark', () => {
  let doc = M.emptyDocument(ctx, AT);
  doc = must(M.apply(doc, { type: 'createBatch', batch: batch('ov', { habitat: { biome: null, blighted: true, overtaken: true, source: 'manual' } }), at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'place', batchId: 'ov', tiles: [{ id: 'to', cell: AREA[0] }], at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: [AREA[0]], revealed: true, at: AT }, ctx));
  assert.deepEqual(P.buildPlayerProjection(doc).overlays.map(o => [o.symbolId, o.blightMark]), [[M.OVERTAKEN_SYMBOL, false]]);
});

test('projection: GM-only data never appears (region ids, Encounter, Rumor, notes, environments, selection, diagnostics)', () => {
  let doc = fixture();
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: AREA.slice(0, 4), revealed: true, at: AT2 }, ctx));
  const text = JSON.stringify(P.buildPlayerProjection(doc));
  for (const secret of ['SECRET-GM-NOTE', 'region-secret-id', 'tile-secret', 'batchId', 'encounter', 'rumor', 'notes', 'environment', 'inspector', 'selection', 'diagnostic', 'warning', 'history', 'undo']) {
    assert.ok(!text.toLowerCase().includes(secret.toLowerCase()), 'leaked: ' + secret);
  }
  assert.deepEqual(Object.keys(P.buildPlayerProjection(doc)).sort(), ['overlays', 'perimeter', 'revealedCells', 'sanctuaryLabels', 'shadowMarks', 'version']);
  for (const o of P.buildPlayerProjection(doc).overlays) assert.deepEqual(Object.keys(o).sort(), ['blightMark', 'dots', 'q', 'r', 'symbolId', 'tint']);
});

test('projection: it is a pure function — the document is untouched and the result shares nothing mutable with it', () => {
  const doc = M.apply(fixture(), { type: 'setCellsRevealed', cellKeys: AREA.slice(0, 3), revealed: true, at: AT2 }, ctx).doc;
  const before = JSON.stringify(doc);
  const p = P.buildPlayerProjection(doc);
  p.revealedCells.push('1,1'); p.overlays.length = 0;
  assert.equal(JSON.stringify(doc), before);
  assert.equal(P.buildPlayerProjection(doc).overlays.length, 3);
});

test('projection: the base map is never filtered, and the fog is never cut out around icons or labels (PD-024)', () => {
  assert.equal(P.fogMaskRects, undefined, 'no rectangular fog cut-outs exist any more');
  // the projection carries generated overlays only: there is no base-layer switch to turn off
  assert.ok(!('base' in P.buildPlayerProjection(fixture())));
  assert.ok(!/fog-mask|fogMaskRects/.test(view), 'the view builds no fog mask');
});

/* ---------------- UI-only preference ---------------- */

function fakeStorage() {
  const data = new Map();
  return { data, writes: [], getItem(k) { return data.has(k) ? data.get(k) : null; }, setItem(k, v) { this.writes.push(k); data.set(k, String(v)); }, removeItem(k) { data.delete(k); } };
}

test('the fog veil is not a preference (PD-036); Player Preview is stored (PD-035); the tool and stroke are never stored', () => {
  const s = fakeStorage(), store = Store.createStore(s, ctx);
  assert.deepEqual(store.saveUi({ sideCollapsed: false }), { ok: true });
  assert.deepEqual(store.loadUi(), { sideCollapsed: false, showBiomeColors: true, playerPreview: false, view: null });
  assert.deepEqual(Object.keys(JSON.parse(s.data.get(Store.KEYS.ui))).sort(), ['playerPreview', 'showBiomeColors', 'sideCollapsed', 'view']);
  assert.deepEqual(s.writes, [Store.KEYS.ui], 'nothing else is written');
  s.data.set(Store.KEYS.ui, '{"showFogState":false,"sideCollapsed":true}');
  assert.deepEqual(store.loadUi(), { sideCollapsed: true, showBiomeColors: true, playerPreview: false, view: null }, 'the retired showFogState key is ignored');
  assert.ok(!('showFogState' in JSON.parse((store.saveUi({ sideCollapsed: true }), s.data.get(Store.KEYS.ui)))), 'and dropped on the next save');
  // it is not part of the document / backup
  assert.ok(!JSON.stringify(M.emptyDocument(ctx, AT)).includes('showFogState'));
});

/* ---------------- localization ---------------- */

test('localization: every Phase C string exists in English and Russian with the same placeholders, and the view hard-codes none', () => {
  const i18n = JSON.parse(read('data/i18n.json'));
  const view = read('js/journey2-view.js');
  const keys = new Set(Object.keys(i18n.en).filter(k => /^journey2_(fog|preview|live_preview)/.test(k)));
  for (const m of view.matchAll(/['"`](journey2_(?:fog|preview|live_preview)[a-z_]*)['"`]/g)) keys.add(m[1]);
  for (const m of view.matchAll(/data-t(?:-aria|-title|-ph)?="(journey2_(?:fog|preview|live_preview)[a-z_]*)"/g)) keys.add(m[1]);
  for (const k of ['journey2_fog_group', 'journey2_fog_reveal', 'journey2_fog_hide', 'journey2_fog_paint_title', 'journey2_preview', 'journey2_preview_back',
    'journey2_fog_unexplored', 'journey2_fog_tool_active', 'journey2_fog_paint_active', 'journey2_fog_revealed_n', 'journey2_fog_hidden_n', 'journey2_fog_pan_hint'])assert.ok(keys.has(k), 'required string: ' + k);
  const ph = s => (String(s).match(/\{[A-Za-z0-9_]+\}/g) || []).sort().join();
  for (const k of keys) {
    assert.ok(typeof i18n.en[k] === 'string' && i18n.en[k], 'en:' + k);
    assert.ok(typeof i18n.ru[k] === 'string' && i18n.ru[k], 'ru:' + k);
    assert.equal(ph(i18n.en[k]), ph(i18n.ru[k]), 'placeholders:' + k);
  }
  assert.deepEqual(Object.keys(i18n.en).filter(k => k.startsWith('journey2_') && !(k in i18n.ru)), []);
  assert.equal(i18n.en.journey2_preview, 'Player Preview'); assert.equal(i18n.en.journey2_preview_back, 'Back to GM');
  assert.match(i18n.en.journey2_fog_paint_title, /left button reveals.*right button hides/);
  assert.equal(i18n.en.journey2_fog_pan_hint, 'Hold Space and drag to pan');
  const code = view.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/\s.*$/gm, '');   // comments may quote the English names
  const literals = code.match(/(['"`])(?:(?!\1)[^\\\n]|\\.)*\1/g) || [];
  for (const s of ['Player Preview', 'Back to GM', 'Unexplored', 'Fog of War', 'Show fog state', 'Hold Space', 'tool active', 'Suggested environments', 'No suggested environments']) {
    assert.deepEqual(literals.filter(l => l.includes(s)), [], 'hard-coded: ' + s);
  }
  assert.deepEqual(literals.filter(l => /\b(Reveal|Hide)\b/.test(l)), [], 'hard-coded tool names');
});

/* ---------------- source guards: tools, preview and the document stay apart ---------------- */

const view = read('js/journey2-view.js');
const fn = (name, next) => view.slice(view.indexOf('function ' + name), view.indexOf('function ' + next));

test('toolbar: Reveal and Hide are real toggle buttons with aria-pressed, the fog-state toggle and Player Preview are discoverable', () => {
  assert.match(view, /<button type="button" class="btn btn-sm j2-tool j2-paint-tool" data-j2-fog-tool="paint" aria-pressed="false"/);
  assert.doesNotMatch(view, /data-j2-fog-tool="(reveal|hide)"/, 'one brush button replaces Reveal and Hide');
  assert.doesNotMatch(view, /data-j2-fog-state/, 'no Fog overlay toggle (PD-036)');
  assert.match(view, /data-j2-preview data-t-title="journey2_preview_title"/);
  assert.match(view, /<button type="button" class="btn btn-ghost btn-sm j2-tool j2-preview-back" data-j2-preview-back>/);
  assert.match(view, /role="group" data-j2-fog-group/);
  assert.match(fn('updateFogUi', 'setFogTool'), /setAttribute\('aria-pressed', String\(!!fogTool\)\)/);
});

test('tools: activating one cancels armed placement, drags and the inspector, works only inside Player Preview, and never touches camera or sidebar', () => {
  const body = fn('setFogTool', 'toggleBiomeColors');
  for (const part of ['cancelTransient()', 'cancelFogStroke()', 'closeInspector({ quiet: true })', 'sel.tileId = null']) assert.ok(body.includes(part), part);
  assert.doesNotMatch(body, /setCamera|fitToView|sideCollapsed|toggleSide|dispatch\(/, 'pan, zoom, the sidebar and the document are left alone');
  assert.match(body, /mode === fogTool\) mode = null/, 'pressing the active tool returns to neutral');
  assert.match(body, /!previewMode \|\| editLocked/, 'the tool exists only inside Player Preview (PD-034), and not on a locked map');
  // placement outranks the tool: arming or dragging a stock handle switches the tool off
  assert.match(fn('armStock', 'computePreview'), /if \(fogTool\) setFogTool\(null/);
  assert.match(fn('onHandleDown', 'onHandleMove'), /if \(fogTool\) setFogTool\(null/);
});

test('priority: fog stroke beats neutral tile selection; Space or the middle button pans; Escape order is documented in code', () => {
  const down = fn('onViewportDown', 'onViewportMove');
  assert.ok(down.indexOf('startFogStroke(e)') > 0 && down.indexOf('startFogStroke(e)') < down.indexOf('tileAtScreen(x, y)'), 'the stroke is decided before a tile can be grabbed');
  assert.match(down, /fogTool && previewMode && !spaceDown/, 'Space-held and the middle button fall through to the pan');
  assert.match(down, /fogPaint && \(e\.button === 0 \|\| e\.button === 2\)/, 'left reveals, right hides');
  assert.match(fn('startFogStroke', 'fogStrokeTo'), /e\.button === 2 \? 'hide' : 'reveal'/);
  assert.match(down, /!previewMode && !fogTool && !\(tr && tr\.kind === 'armed'\)/, 'no tile grab in preview or with a tool');
  assert.match(down, /if \(pan \|\| fogStroke \|\| tr && tr\.kind !== 'armed'\) return;/, 'an existing drag or pan wins');
  assert.match(fn('handleMapClick', 'selectTile'), /if \(previewMode \|\| fogTool\) return;/, 'no inspector from a map click under a tool or in preview');
  const esc = view.slice(view.indexOf('function onDocumentKey'), view.indexOf('if (e.key === \' \' && fogTool'));
  const order = ['openMenu', 'fogStroke', 'if (pan)', 'if (tr)', 'if (fogTool)', 'if (previewMode)', 'inspectorOpen()'].map(s => esc.indexOf(s));
  assert.ok(order.every(i => i > 0) && order.every((x, i) => i === 0 || x > order[i - 1]), 'menu, stroke, pan, drag, tool, preview, inspector: ' + order);
  assert.match(view, /return t0 === document\.body \|\| t0 === ui\.viewport \|\| !!\(t0 && t0\.closest && t0\.closest\('\[data-j2-fog-group\], \[data-j2-echo-group\], \[data-j2-preview-bar\], \[data-j2-rail\]'\)\)/, 'Space pans from the map, the page, a fog button, a Soul Echoes button or the collapsed rail');
  assert.match(fn('onViewportKey', 'handleFromEvent').slice(0, 900) + view, /Delete/);
  assert.match(view, /if \(sel\.tileId && !fogTool && !previewMode\) returnSelected\(\)/, 'Return to stock is unavailable while a tool is active');
});

test('strokes: interpolated with cellLine, each cell once, one command on release, nothing on cancel, no write per cell', () => {
  const add = fn('fogStrokeTo', 'moveFogStroke');
  assert.match(add, /Geo\.cellLine\(s\.last, cell\)/);
  assert.match(add, /s\.seen\.has\(key\)\) continue/);
  const move = fn('moveFogStroke', 'updateFogHover');
  assert.doesNotMatch(move, /dispatch|persist|store\.|renderAll|renderInventory|renderInspector|innerHTML/, 'pointer moves only collect cells and schedule a paint');
  assert.match(move, /getCoalescedEvents/);
  const fin = fn('finishFogStroke', 'cancelFogStroke');
  assert.equal((fin.match(/dispatch\(/g) || []).length, 1);
  assert.match(fin, /type: 'setCellsRevealed', cellKeys: s\.cells/);
  const cancel = fn('cancelFogStroke', 'scheduleFogPaint');
  assert.doesNotMatch(cancel, /dispatch|persist/);
  assert.match(fn('onViewportCancel', 'endPan'), /fogStroke\.pointerId === e\.pointerId\) \{ cancelFogStroke\(true\)/);
  assert.match(fn('paintFogStroke', 'applyPreviewChrome').split('Player Preview')[0], /fogStroke/);
  assert.match(fn('scheduleFogPaint', 'paintFogStroke'), /requestAnimationFrame/);
  assert.match(fn('undo', 'redo'), /cancelTransient\(\)/, 'Undo mid-stroke cancels the stroke first');
});

test('GM view: every generated tile is drawn whatever the fog says; the veil sits above the tiles and below selection', () => {
  const gm = fn('renderTiles', 'renderSanctuaryLabels').split('ui.g.player.innerHTML = \'\';')[1];
  assert.ok(gm && gm.includes('doc.tiles.map'));
  assert.doesNotMatch(gm, /isCellRevealed|getRevealedCellSet|playerVisibility|Projection/, 'the GM render does not look at visibility');
  const svg = view.slice(view.indexOf('<defs data-j2-defs>'), view.indexOf('</svg>', view.indexOf('<defs data-j2-defs>')));
  const at = k => svg.indexOf('data-j2-g="' + k + '"');
  assert.ok(at('tiles') < at('fog') && at('fog') < at('fogstroke') && at('fogstroke') < at('select') && at('select') < at('preview'), 'tiles < fog < stroke feedback < selection outlines < placement preview');
  assert.match(svg, /data-j2-g="fog"><path class="j2-fog-veil"/, 'the veil covers the whole base map: no mask around icons and printed labels');
  assert.ok(at('fog') < at('perimeter') && at('perimeter') < at('fogstroke'), 'the full GM boundary stays above the veil');
  assert.match(fn('renderFog', 'updateFogUi'), /ui\.g\.fog\.style\.display = previewMode \? '' : 'none'/, 'the veil is drawn only in Player Preview, never in the GM view');
  assert.doesNotMatch(view, /showFog|toggleFogState/);
});

test('Player Preview: read-only, projection-driven, document and history untouched, camera shared with the GM view', () => {
  const enter = fn('enterPreview', 'leavePreview'), leave = fn('leavePreview', 'onViewportDown'.replace('onViewportDown', 'startFogStrokeNever'));
  for (const body of [enter, view.slice(view.indexOf('function leavePreview'), view.indexOf('/* ====', view.indexOf('function leavePreview')))]) {
    assert.doesNotMatch(body, /dispatch\(|persist\(|historyCommit|historyUndo|historyRedo|doc = /, 'no document or history change');
  }
  for (const part of ['cancelTransient()', 'cancelFogStroke()', 'closeMenus()', 'setFogTool(null', 'closeInspector({ quiet: true })', 'sel.tileId = null']) assert.ok(enter.includes(part), part);
  assert.doesNotMatch(view, /previewReturn/, 'GM view and Player Preview are one screen: the camera is never saved or restored per mode (PD-040)');
  const tiles = fn('renderTiles', 'renderSelection').split('ui.g.player.innerHTML = \'\';')[0];
  assert.match(tiles, /ui\.g\.tiles\.innerHTML = '';/, 'GM tiles are removed, not hidden');
  assert.match(tiles, /Projection\.buildPlayerProjection\(doc, data\.ctx\)/);
  assert.doesNotMatch(tiles, /doc\.tiles|doc\.batches/, 'the preview never reads regions directly');
  const chrome = fn('applyPreviewChrome', 'enterPreview');
  for (const part of ['ui.gmControls.hidden = on', 'ui.sideScroll.hidden = on', 'ui.previewBar.hidden = !on']) assert.ok(chrome.includes(part), part);
  assert.doesNotMatch(chrome, /ui\.sidewrap\.(hidden|inert) = on/, 'the panel stays in place: only its content is swapped (PD-040)');
  assert.doesNotMatch(chrome, /ui\.historyGroup\.hidden = on/, 'Undo / Redo stay available beside Reveal / Hide');
  assert.doesNotMatch(fn('undo', 'redo'), /previewMode\) return/, 'Undo works in Player Preview (PD-034)');
  assert.match(fn('applyLayerVisibility', 'clearProof'), /layers\[k\] && !previewMode/);
  assert.doesNotMatch(read('js/journey2-store.js'), /previewMode|fogTool|fogStroke/, 'never persisted');
  assert.match(fn('replaceDocument', 'startEmptyMap'), /leavePreview\(\{ quiet: true \}\);[\s\S]*setFogTool\(null/, 'import / reset closes the preview and the tool');
});

test('print readiness: the projection and the overlay drawing routine do not depend on the screen', () => {
  const proj = read('js/journey2-projection.js');
  const code = proj.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /document\.|window\.|innerHTML|getBoundingClientRect|scroll|viewport|sidebar/i, 'pure and DOM-free');
  const draw = fn('overlayMarkup', 'renderTiles');
  assert.doesNotMatch(draw, /cam\.|ui\.|sel\.|inspector|document\./, 'draws from a list of cells and specs only');
  assert.match(proj, /player map print \(js\/journey2-print\.js/);
});

test('CSS: the fog is a restrained translucent texture — no black fill, no blur, no animation', () => {
  const css = read('css/journey2.css');
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').filter(r => /j2-fogp|j2-fog-(veil|edge|pend|brush|glyph)/.test(r.split('{')[0]));
  assert.ok(rules.length >= 10);
  for (const r of rules) assert.doesNotMatch(r, /animation|transition(?!-)|filter|blur|#000\b|black/, r.trim().slice(0, 80));
  assert.match(css, /\.j2\[data-mode="preview"\] \.j2-overlay \.j2-fog-veil \{ fill: url\(#j2-fog-player\)/);
});

test('documentation names the projection renderer the future print phase must reuse', () => {
  const arch = read('docs/architecture.md'), pd = read('docs/product-decisions.md');
  assert.match(arch, /Fog of War/); assert.match(arch, /buildPlayerProjection/); assert.match(arch, /overlayMarkup/);
  assert.match(pd, /PD-020/);
});

/* ---------------- PD-034: Reveal / Hide live in Player Preview; the camera is remembered ---------------- */

test('PD-034: Reveal / Hide are in the Player Preview bar, not the GM toolbar', () => {
  const html = view.slice(view.indexOf('function buildSurface'), view.indexOf('<div class="j2-tip"'));
  const gm = html.slice(html.indexOf('data-j2-fog-group'), html.indexOf('data-j2-preview-bar'));
  const bar = html.slice(html.indexOf('data-j2-preview-bar'));
  assert.doesNotMatch(gm, /data-j2-fog-tool=/, 'the GM toolbar has no Reveal / Hide');
  assert.doesNotMatch(gm, /data-j2-fog-state/, 'the GM view has no Fog overlay toggle');
  assert.match(bar, /data-j2-fog-tool="paint"/);
  assert.match(fn('leavePreview', 'printPageMarkup'), /setFogTool\(null/, 'the tool never outlives the preview');
});

test('PD-034: the hidden-hex outline is a GM aid drawn only while a tool is armed in the preview', () => {
  const ghost = fn('renderFogGhost', 'updateFogUi');
  assert.match(ghost, /previewMode && !!fogTool/);
  assert.doesNotMatch(ghost, /dispatch|persist|store\.|playerProjection/, 'never part of the projection, history or storage');
  assert.match(fn('renderFog', 'renderFogGhost'), /renderFogGhost\(\)/);
});

test('PD-034: the camera is a stored view preference (world centre + zoom, or fit), restored clamped and saved debounced', () => {
  const s = fakeStorage(), store = Store.createStore(s, ctx);
  assert.equal(store.loadUi().view, null, 'no stored camera -> Fit');
  assert.deepEqual(store.saveUi({ view: { fit: false, cx: 120.5, cy: 340, scale: 1.5 } }), { ok: true });
  assert.deepEqual(store.loadUi().view, { fit: false, cx: 120.5, cy: 340, scale: 1.5 });
  store.saveUi({ view: { fit: true, cx: 9, cy: 9, scale: 9 } });
  assert.deepEqual(store.loadUi().view, { fit: true, cx: 0, cy: 0, scale: 1 }, 'a fitted map ignores the numbers');
  for (const bad of [{ fit: false, cx: 'a', cy: 1, scale: 1 }, { fit: false, cx: 1, cy: 1, scale: 0 }, { fit: false, cx: 1, cy: 1, scale: -2 }, { cx: 1, cy: 1, scale: 1 }, { fit: false, cx: null, cy: 1, scale: 1 }, 5, 'x']) {
    s.data.set(Store.KEYS.ui, JSON.stringify({ view: bad }));
    assert.equal(store.loadUi().view, null, JSON.stringify(bad));
  }
  assert.deepEqual(s.writes.filter(k => k !== Store.KEYS.ui), [], 'only the one view-preference key is written');
  assert.match(fn('restoreCamera', 'setCamera'), /MAX_ZOOM[\s\S]*setCamera\(/, 'a stored zoom is clamped before it is applied');
  for (const [name, next] of [['fitToView', 'setCamera'], ['setCamera', 'zoomBy']]) assert.match(fn(name, next), /scheduleCameraSave\(\)/, name + ' reaches the debounced save');
  assert.match(fn('currentView', 'scheduleCameraSave'), /cameraReady/, 'the stored camera is not overwritten before it was restored');
});

test('playerPreview round-trips through the UI preferences and a non-boolean falls back to false (PD-035)', () => {
  const s = fakeStorage(), store = Store.createStore(s, ctx);
  store.saveUi({ playerPreview: true });
  assert.equal(store.loadUi().playerPreview, true);
  s.data.set(Store.KEYS.ui, '{"playerPreview":"yes"}');
  assert.equal(store.loadUi().playerPreview, false);
});
