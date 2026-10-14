'use strict';
/* Journey: the "Regions" display (PD-062) — one icon per region, as in the book. The pure anchor picker, the anonymous region number on the
   player projection, and the view wiring (a display switch like Biome colors: no command, no history, no document write). */
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
const ctx = M.createContext(template, JSON.parse(read('data/journey2/map-anchors.json')));
const AT = '2026-10-14T10:00:00.000Z';

let BASE;
for (let q = 40; q < 80 && !BASE; q++) for (let r = -20; r < 20 && !BASE; r++) {
  let ok = true;
  for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) if (!ctx.placeable(q + a, r + b)) ok = false;
  if (ok) BASE = { q: q, r: r };
}
const at = (dq, dr) => Geo.cellId(BASE.q + dq, BASE.r + dr);
const item = (cell, region) => ({ cell: cell, region: region });

test('one anchor per region: a single hex is its own anchor, a row picks the middle hex', () => {
  assert.deepEqual(Array.from(Geo.pickRegionIconCells(ctx.grid, [item(at(0, 0), 'a')])), [at(0, 0)]);
  const row = [at(0, 0), at(1, 0), at(2, 0)].map(c => item(c, 'a'));
  assert.deepEqual(Array.from(Geo.pickRegionIconCells(ctx.grid, row)), [at(1, 0)]);
});

test('two regions get two anchors; two separate patches of one region get one anchor each', () => {
  const two = Geo.pickRegionIconCells(ctx.grid, [item(at(0, 0), 'a'), item(at(1, 0), 'b')]);
  assert.equal(two.size, 2);
  const apart = Geo.pickRegionIconCells(ctx.grid, [item(at(0, 0), 'a'), item(at(3, 0), 'a')]);
  assert.equal(apart.size, 2, 'cells that do not touch never share an icon');
  const touching = Geo.pickRegionIconCells(ctx.grid, [item(at(0, 0), 'a'), item(at(1, 0), 'a')]);
  assert.equal(touching.size, 1);
});

test('the anchor prefers a hex with room for the glyph, and is deterministic whatever the input order', () => {
  const cells = [at(0, 0), at(1, 0), at(2, 0)].map(c => item(c, 'a'));
  const mid = Geo.parseCellId(at(1, 0));
  const room = Geo.pickRegionIconCells(ctx.grid, cells, (q, r) => !(q === mid.q && r === mid.r));
  assert.equal(room.size, 1); assert.ok(!room.has(at(1, 0)));
  assert.deepEqual(Array.from(Geo.pickRegionIconCells(ctx.grid, cells.slice().reverse())), Array.from(Geo.pickRegionIconCells(ctx.grid, cells)));
  assert.equal(Geo.pickRegionIconCells(ctx.grid, []).size, 0);
});

function twoRegionDoc() {
  const mk = (id, biome) => M.batchFromRegion({ habitat: { biome: biome, blighted: false, overtaken: false, source: 'rolled', rolls: [11] }, terrain: { value: 2, source: 'rolled' }, size: 3, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 49 }, { id: id, createdAt: AT });
  const doc = M.emptyDocument(ctx, AT);
  doc.batches = [mk('b1', 'forest'), mk('b2', 'wetland')];
  doc.tiles = [{ id: 't1', batchId: 'b1', cell: at(0, 0) }, { id: 't2', batchId: 'b1', cell: at(1, 0) }, { id: 't3', batchId: 'b2', cell: at(0, 1) }];
  doc.playerVisibility = { revealedCells: [at(0, 0), at(1, 0), at(0, 1)], revealedSanctuaryNameAnchorIds: [] };
  return doc;
}

test('projection: overlays carry an anonymous region number, the same for hexes of one region, never an id', () => {
  const o = P.buildPlayerProjection(twoRegionDoc(), ctx).overlays;
  const byCell = new Map(o.map(x => [Geo.cellId(x.q, x.r), x.region]));
  assert.equal(byCell.get(at(0, 0)), byCell.get(at(1, 0)));
  assert.notEqual(byCell.get(at(0, 0)), byCell.get(at(0, 1)));
  assert.ok(o.every(x => Number.isInteger(x.region)));
  assert.doesNotMatch(JSON.stringify(P.buildPlayerProjection(twoRegionDoc(), ctx)), /b1|b2/);
});

test('players: a region with one revealed hex shows its own icon there; more hexes share one icon', () => {
  const doc = twoRegionDoc();
  doc.playerVisibility = { revealedCells: [at(0, 0)], revealedSanctuaryNameAnchorIds: [] };
  let o = P.buildPlayerProjection(doc, ctx).overlays;
  assert.equal(Geo.pickRegionIconCells(ctx.grid, o.map(x => item(Geo.cellId(x.q, x.r), x.region))).size, 1);
  doc.playerVisibility = { revealedCells: [at(0, 0), at(1, 0)], revealedSanctuaryNameAnchorIds: [] };   // a new object: the model caches by identity
  o = P.buildPlayerProjection(doc, ctx).overlays;
  assert.equal(o.length, 2);
  assert.equal(Geo.pickRegionIconCells(ctx.grid, o.map(x => item(Geo.cellId(x.q, x.r), x.region))).size, 1);
});

test('view wiring: a Campaign display switch, stored as a UI preference, no command and no document write', () => {
  const view = read('js/journey2-view.js');
  assert.match(view, /data-j2-regions/);
  assert.match(view, /function toggleRegions\(\) \{\s*showRegions = !showRegions;\s*saveUiPrefs\(\);\s*updateFogUi\(\);\s*renderTiles\(\);\s*\}/);
  assert.match(view, /Geo\.pickRegionIconCells\(/);
  assert.match(view, /regionIcons: showRegions/);
  const i18n = JSON.parse(read('data/i18n.json'));
  for (const lang of Object.keys(i18n)) {
    const tbl = i18n[lang];
    if (tbl && tbl.journey2_biome_label) for (const k of ['journey2_regions_label', 'journey2_regions_show', 'journey2_regions_hide']) assert.ok(tbl[k], lang + ' ' + k);
  }
});
