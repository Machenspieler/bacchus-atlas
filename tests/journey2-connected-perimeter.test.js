'use strict';
/* Journey 2: the derived region perimeter (PD-021). Pure — no browser (the click/drag/render
   behaviour in a real browser is checked through the view's debug API, see docs/manual-qa.md). */
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

/* a free, placeable base cell far from the furniture, and relative offsets from it */
const BASE = (() => {
  for (let q = 40; q < 80; q++) for (let r = -20; r < 20; r++) {
    const ids = [];
    for (let dq = -3; dq <= 3; dq++) for (let dr = -3; dr <= 3; dr++) ids.push([q + dq, r + dr]);
    if (ids.every(([a, b]) => ctx.placeable(a, b))) return { q: q, r: r };
  }
  throw new Error('no open area');
})();
const at = (dq, dr) => Geo.cellId(BASE.q + dq, BASE.r + dr);
const D = { se: [1, 0], ne: [1, -1], n: [0, -1], nw: [-1, 0], sw: [-1, 1], s: [0, 1] };

function batch(id, size) {
  return M.batchFromRegion({
    habitat: { biome: 'forest', blighted: false, overtaken: false, source: 'rolled', rolls: [11] }, terrain: { value: 2, source: 'rolled' }, size: size || 6,
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

/* Prepared-map connectivity (the placement / move / return / delete rules) is covered in tests/journey2-phase-d.test.js. */

/* ---------------- perimeter ---------------- */

const seg = (doc, vis, fog) => M.regionBoundarySegments(doc, ctx, vis, fog);
const count = (segs, kind) => segs.filter(s => s.kind === kind).length;

test('perimeter: one hex has six outer edges; same-batch neighbours add no edge between them', () => {
  let doc = withBatches('A');
  doc = must(place(doc, 'A', [at(0, 0)]));
  assert.equal(seg(doc).length, 6);
  doc = must(place(doc, 'A', [at(1, 0)]));
  assert.equal(seg(doc).length, 10, 'two adjacent hexes of one region: 12 edges minus the shared one counted twice');
  assert.equal(count(seg(doc), 'divider'), 0);
});

test('perimeter: a divider between two regions is emitted exactly once; empty neighbours give outer edges', () => {
  let doc = withBatches('A', 'B');
  doc = must(place(doc, 'A', [at(0, 0)]));
  doc = must(place(doc, 'B', [at(1, 0)]));
  const s = seg(doc);
  assert.equal(count(s, 'divider'), 1);
  assert.equal(count(s, 'outer'), 10);
  const keys = s.map(x => x.cell + '#' + x.dir);
  assert.equal(new Set(keys).size, keys.length, 'no segment is repeated');
});

test('perimeter: it is derived from the tiles alone — never part of the document or its backup', () => {
  let doc = withBatches('A');
  doc = must(place(doc, 'A', [at(0, 0)]));
  assert.ok(!/perimeter|boundary/i.test(M.serializeBackup(doc)));
  assert.deepEqual(Object.keys(doc).sort(), ['batches', 'createdAt', 'kind', 'playerVisibility', 'sanctuaries', 'schemaVersion', 'soulEchoes', 'templateId', 'templateVersion', 'tiles', 'updatedAt']);
});

test('perimeter: an unplaced batch draws nothing; a document without tiles has no segments', () => {
  assert.deepEqual(seg(withBatches('A', 'B')), []);
});

test('perimeter: a disconnected legacy batch is outlined around every component', () => {
  let doc = withBatches('A');
  doc = must(place(doc, 'A', [at(0, 0), at(3, 3)].slice(0, 1)));
  // build the split state directly (an old save): two components
  doc = Object.assign({}, doc, { tiles: doc.tiles.concat([{ id: 'legacy', batchId: 'A', cell: at(3, 3) }]) });
  assert.equal(seg(doc).length, 12);
  const lines = Geo.chainEdgeSegments(ctx.grid, seg(doc));
  assert.equal(lines.length, 2, 'two separate closed outlines');
  assert.ok(lines.every(l => l.closed));
});

test('perimeter: an enclosed empty cell gets its own inner outline (and the hole warning stays)', () => {
  let doc = withBatches('A');
  const ring = Object.values(D).map(([a, b]) => at(a, b));
  doc = must(place(doc, 'A', ring));
  assert.equal(M.holeCounts(doc, ctx).get('A'), 1);
  const s = seg(doc);
  assert.equal(s.length, 18 + 6, '6 outer edges per outer side of the ring + 6 inner edges around the hole');
  const lines = Geo.chainEdgeSegments(ctx.grid, s);
  assert.equal(lines.length, 2, 'outer outline and inner outline');
});

test('perimeter geometry: the edge index really is the edge shared with that neighbour (template corners)', () => {
  const c = Geo.cellId(BASE.q, BASE.r);
  const centre = ctx.grid.cellCenter(BASE.q, BASE.r);
  Geo.NEIGHBOR_DELTAS.forEach((d, k) => {
    const corners = ctx.grid.cellCorners(BASE.q, BASE.r);
    const a = corners[(k + 5) % 6], b = corners[k];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const nc = ctx.grid.cellCenter(BASE.q + d.dq, BASE.r + d.dr);
    const expect = [(centre[0] + nc[0]) / 2, (centre[1] + nc[1]) / 2];
    assert.ok(Math.hypot(mid[0] - expect[0], mid[1] - expect[1]) < 0.6, 'edge ' + k + ' of ' + c + ' lies halfway to neighbour ' + d.name);
  });
});

test('perimeter geometry: chained outlines share exact corners; a two-region cluster is one outline plus a divider', () => {
  let doc = withBatches('A', 'B');
  doc = must(place(doc, 'A', [at(0, 0)]));
  doc = must(place(doc, 'B', [at(1, 0)]));
  const lines = Geo.chainEdgeSegments(ctx.grid, seg(doc));
  const total = lines.reduce((n, l) => n + l.points.length - 1 + (l.closed ? 0 : 0), 0);
  assert.equal(total, 11, 'every one of the 11 edges is drawn once');
  assert.ok(Geo.polylinesPath(lines).startsWith('M'));
});

test('player perimeter: edges exist only where the cells on both sides are revealed', () => {
  let doc = withBatches('A', 'B');
  doc = must(place(doc, 'A', [at(0, 0)]));
  doc = must(place(doc, 'B', [at(1, 0)]));
  const key = k => k;
  const none = P.buildPlayerProjection(doc, ctx).perimeter;
  assert.deepEqual(none, [], 'nothing revealed: nothing drawn');
  // reveal only A's cell: its outer edges towards hidden cells (all of them) are not drawn, and neither is the divider
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: [at(0, 0)], revealed: true, at: AT }, ctx));
  assert.deepEqual(P.buildPlayerProjection(doc, ctx).perimeter, [], 'no false ending line against unrevealed neighbours');
  // reveal A plus all its neighbours that are empty (not B): outer edges appear, the divider towards hidden B does not
  const around = M.neighborIds(at(0, 0)).filter(id => id !== at(1, 0));
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: around, revealed: true, at: AT }, ctx));
  let per = P.buildPlayerProjection(doc, ctx).perimeter;
  assert.equal(per.length, 5);
  assert.ok(per.every(s => s.kind === 'outer' && s.cell === at(0, 0)));
  // reveal B as well: the divider appears, once; B's outer edges need their empty neighbours revealed
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: [at(1, 0)], revealed: true, at: AT }, ctx));
  per = P.buildPlayerProjection(doc, ctx).perimeter;
  assert.equal(count(per, 'divider'), 1);
  assert.equal(count(per, 'outer'), 5 + 2, "A's 5, plus B's two edges towards revealed empty cells (its other neighbours stay hidden)");
  void key;
});

test('player perimeter: a hidden region never shows through, and the projection carries no region ids', () => {
  let doc = withBatches('A', 'B');
  doc = must(place(doc, 'A', [at(0, 0)]));
  doc = must(place(doc, 'B', [at(1, 0), at(2, 0)]));
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: M.neighborIds(at(0, 0)).concat([at(0, 0)]), revealed: true, at: AT }, ctx));
  const proj = P.buildPlayerProjection(doc, ctx);
  const text = JSON.stringify(proj);
  assert.ok(!/batch|"A"|"B"/.test(text.replace('"revealedCells"', '')), 'no region ids');
  for (const s of proj.perimeter) assert.deepEqual(Object.keys(s).sort(), ['cell', 'dir', 'kind']);
  assert.ok(proj.perimeter.every(s => s.cell === at(0, 0) || M.isCellRevealed(doc, s.cell)), 'every edge belongs to a revealed cell');
  assert.ok(!proj.perimeter.some(s => s.cell === at(2, 0)), 'the hidden region B beyond the fog contributes nothing');
});

test('player perimeter: a map-edge or furniture neighbour (never fogged) needs only the tile to be revealed', () => {
  // find a placeable cell next to a decorative (furniture) cell
  let found = null;
  for (const id of ctx.decorativeCells) {
    const c = Geo.parseCellId(id);
    for (const n of M.neighborIds(id)) { const p = Geo.parseCellId(n); if (ctx.placeable(p.q, p.r)) { found = { tile: n, deco: id, dir: M.neighborIds(n).indexOf(id) }; break; } }
    if (found) break;
  }
  assert.ok(found, 'the template has furniture cells');
  let doc = withBatches('A');
  doc = must(place(doc, 'A', [found.tile]));
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: [found.tile], revealed: true, at: AT }, ctx));
  const per = P.buildPlayerProjection(doc, ctx).perimeter;
  const nbs = M.neighborIds(found.tile);
  const expectDirs = nbs.map((id, k) => [id, k]).filter(([id]) => { const c = Geo.parseCellId(id); return !ctx.placeable(c.q, c.r); }).map(([, k]) => k);
  assert.ok(expectDirs.includes(found.dir));
  assert.deepEqual(per.map(s => s.dir).sort(), expectDirs.sort(), 'exactly the edges towards never-fogged cells (furniture, off-map) are drawn; hidden placeable neighbours draw none');
  const strict = P.buildPlayerProjection(doc).perimeter;
  assert.deepEqual(strict, [], 'without a context nothing is assumed to be unfogged (never leaks)');
  // GM mode always has the complete perimeter
  assert.equal(seg(doc).length, 6);
});

/* ---------------- view / localization / documentation guards ---------------- */

const view = read('js/journey2-view.js');
const i18n = JSON.parse(read('data/i18n.json'));
const NEW_KEYS = ['journey2_reason_detached_prepared_map', 'journey2_reason_would_split', 'journey2_reason_move_split', 'journey2_reason_return_split', 'journey2_separate_area', 'journey2_detached_title', 'journey2_detached_body', 'journey2_detached_hint', 'journey2_detached_label', 'journey2_connected_label', 'journey2_delete_splits', 'journey2_live_separate_started'];

test('localization: every prepared-map string exists in English and Russian', () => {
  for (const k of NEW_KEYS) {
    assert.ok(i18n.en[k] && i18n.ru[k], k);
    assert.notEqual(i18n.en[k], i18n.ru[k]);
  }
  for (const k of ['journey2_reason_not_adjacent', 'journey2_reason_detaches_region', 'journey2_reason_detaches_other', 'journey2_separate_note', 'journey2_separate_on_note']) assert.ok(!i18n.en[k] && !i18n.ru[k], k + ' was removed with the card toggle');
  assert.match(i18n.en.journey2_delete_splits, /\{n\}/);
  assert.match(i18n.ru.journey2_delete_splits, /\{n\}/);
});

test('view: the GM perimeter is above the fog, the player-safe one below it, both pointer-transparent and aria-hidden, selection above both', () => {
  const svg = view.slice(view.indexOf('<defs data-j2-defs>'), view.indexOf('</svg>', view.indexOf('<defs data-j2-defs>')));
  const idx = k => svg.indexOf('data-j2-g="' + k + '"');
  assert.ok(idx('tiles') < idx('perimeterPlayer') && idx('perimeterPlayer') < idx('fog') && idx('fog') < idx('perimeter') && idx('perimeter') < idx('select') && idx('select') < idx('preview'));
  assert.match(svg, /data-j2-g="perimeter" pointer-events="none"/);
  assert.match(svg, /data-j2-g="perimeterPlayer" pointer-events="none"/);
  assert.match(view, /<svg class="j2-overlay"[^>]*aria-hidden="true"/, 'every boundary group lives inside the aria-hidden overlay');
  const css = read('css/journey2.css');
  assert.match(css, /\.j2-perimeter \{[^}]*fill: none[^}]*pointer-events: none/);
  const w = Number(/\.j2-perimeter \{[^}]*stroke-width: (\d+(\.\d+)?)/.exec(css)[1]);
  assert.ok(w >= 2.5 && w <= 3, 'about 2.5-3x the 1px grid outline');
});

test('view: the perimeter is recomputed from the tiles on every render and never stored or persisted', () => {
  assert.match(view, /function renderPerimeter\(\)/);
  assert.match(view, /renderPerimeter\(\);\s*return;/, 'Player Preview draws the projection perimeter');
  assert.match(view, /Model\.regionBoundarySegments\(doc, data\.ctx\)/, 'GM mode draws the complete perimeter');
  assert.match(view, /playerProjection\.perimeter/, 'Player Preview draws only the projection perimeter');
  const store = read('js/journey2-store.js');
  assert.ok(!/perimeter/i.test(store));
});

test('documentation records the rule (PD-021) and the perimeter', () => {
  const pd = read('docs/product-decisions.md'), arch = read('docs/architecture.md');
  assert.match(pd, /PD-021/);
  assert.match(arch, /regionBoundarySegments/);
  assert.match(arch, /Start separate area/);
});
