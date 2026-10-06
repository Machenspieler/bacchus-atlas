'use strict';
/* Journey 2 Phase B: the Region Inspector. Pure — no browser. Covers the transient inspection state (js/journey2-model.js),
   the screen-space placement helper (js/journey2-geometry.js), localization coverage and the source-level guards that keep the
   inspector separate from the sidebar, persistence and history. The click/drag/notes/close behaviour in a real browser lives in
   scripts/journey2/stage1-verify.js (checks `insp.*`). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Geo = require('../js/journey2-geometry.js');
const M = require('../js/journey2-model.js');
const Store = require('../js/journey2-store.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const template = JSON.parse(read('data/journey2/map-template.json'));
const anchorsDoc = JSON.parse(read('data/journey2/map-anchors.json'));
const ctx = M.createContext(template, anchorsDoc);
const AT = '2026-10-06T10:00:00.000Z';
const must = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.doc; };

function open(ids) {
  for (let q = 30; q < 90; q++) for (let r = -40; r < 40; r++) {
    const cells = [Geo.cellId(q, r), Geo.cellId(q + 1, r), Geo.cellId(q, r + 1)];
    if (cells.every(c => { const p = Geo.parseCellId(c); return ctx.policy(p.q, p.r).ok; })) return cells;
  }
  throw new Error('no open cells');
}
function batch(id, over) {
  return M.batchFromRegion(Object.assign({
    habitat: { biome: 'forest', blighted: false, overtaken: false, source: 'rolled', rolls: [11] }, terrain: { value: 2, source: 'rolled' }, size: 5,
    encounter: { entries: [[3, 4]], combines: 0 }, rumor: 49,
  }, over || {}), { id: id, createdAt: AT });
}
function fixture() {
  let doc = M.emptyDocument(ctx, AT);
  doc = must(M.apply(doc, { type: 'createBatch', batch: batch('b1'), at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'createBatch', batch: batch('b2', { size: 3 }), at: AT }, ctx));
  const cells = open();
  doc = must(M.apply(doc, { type: 'place', batchId: 'b1', tiles: cells.map((cell, i) => ({ id: 't' + i, cell: cell })), at: AT }, ctx));
  return doc;
}

/* ---------------- inspection state ---------------- */

test('inspection: opening from a placed hex selects that hex and its region; nothing about the document changes', () => {
  const doc = fixture();
  const s = M.inspectTile(M.NO_INSPECTION, doc, 't1');
  assert.deepEqual({ batchId: s.batchId, tileId: s.tileId, source: s.source }, { batchId: 'b1', tileId: 't1', source: 'map' });
  assert.equal(JSON.stringify(doc), JSON.stringify(fixture()), 'inspecting is read-only');
});

test('inspection: opening from a card works for an unplaced region and selects no hex', () => {
  const doc = fixture();
  const s = M.inspectBatch(M.NO_INSPECTION, doc, 'b2');
  assert.deepEqual({ batchId: s.batchId, tileId: s.tileId, source: s.source }, { batchId: 'b2', tileId: null, source: 'card' });
  assert.deepEqual(M.inspectedTileIds(s, doc), []);
});

test('inspection: an unknown hex or region leaves the current inspection untouched', () => {
  const doc = fixture();
  const s = M.inspectTile(M.NO_INSPECTION, doc, 't0');
  assert.equal(M.inspectTile(s, doc, 'nope'), s);
  assert.equal(M.inspectBatch(s, doc, 'nope'), s);
});

test('inspection: every hex of the inspected region is highlighted, and no other region', () => {
  const doc = fixture();
  assert.deepEqual(M.inspectedTileIds(M.inspectTile(M.NO_INSPECTION, doc, 't2'), doc).sort(), ['t0', 't1', 't2']);
  assert.deepEqual(M.inspectedTileIds(M.NO_INSPECTION, doc), []);
});

test('inspection: clicking a hex of another region replaces the inspected region', () => {
  let doc = fixture();
  const free = open().map(c => { const p = Geo.parseCellId(c); return Geo.cellId(p.q + 4, p.r); }).find(c => { const p = Geo.parseCellId(c); return ctx.policy(p.q, p.r).ok; });
  doc = must(M.apply(doc, { type: 'place', batchId: 'b2', tiles: [{ id: 'x1', cell: free }], at: AT }, ctx));
  const a = M.inspectTile(M.NO_INSPECTION, doc, 't0');
  const b = M.inspectTile(a, doc, 'x1');
  assert.equal(b.batchId, 'b2');
  assert.equal(b.tileId, 'x1');
});

test('inspection: a region deleted by the document closes the inspection; undoing the deletion does not reopen it', () => {
  const doc = fixture();
  const history = M.createHistory();
  const s = M.inspectTile(M.NO_INSPECTION, doc, 't0');
  const after = must(M.apply(doc, { type: 'deleteBatch', batchId: 'b1', at: AT }, ctx));
  M.historyCommit(history, doc, after, 'deleteBatch');
  const closed = M.syncInspection(s, after);
  assert.equal(closed, M.NO_INSPECTION);
  const restored = M.historyUndo(history).before;
  assert.equal(M.syncInspection(closed, restored), M.NO_INSPECTION, 'the restored region stays closed');
});

test('inspection: a hex that leaves its region is dropped from the inspection but the region stays open', () => {
  const doc = fixture();
  const s = M.inspectTile(M.NO_INSPECTION, doc, 't1');
  const after = must(M.apply(doc, { type: 'returnTile', tileId: 't1', at: AT }, ctx));
  const next = M.syncInspection(s, after);
  assert.equal(next.batchId, 'b1');
  assert.equal(next.tileId, null);
  assert.equal(next.source, 'map');
});

test('inspection: it is not part of the document, the backup, history or the saved UI preferences', () => {
  const doc = fixture();
  M.inspectTile(M.NO_INSPECTION, doc, 't0');
  assert.doesNotMatch(M.serializeBackup(doc), /inspect/i);
  const view = read('js/journey2-view.js');
  const saves = view.match(/store\.saveUi\([^)]*\)/g) || [];
  assert.ok(saves.length >= 1 && saves.every(s => !/inspect/i.test(s)), saves.join());
  assert.ok(!Object.keys(Store.createStore(null, ctx).keys).some(k => /inspect/i.test(k)));
  const inspectorBlock = view.slice(view.indexOf('Region Inspector (screen-space'), view.indexOf('/* ---- tiles layer ---- */'));
  assert.doesNotMatch(inspectorBlock, /historyCommit|persist\(|store\./, 'opening, moving and closing the inspector never commits, saves or writes');
});

/* ---------------- placement helper ---------------- */

const VIEW = { w: 1300, h: 700 };
const SIZE = { w: 440, h: 420 };
const place = o => Geo.placeInspector(Object.assign({ view: VIEW, size: SIZE, anchor: null, blocked: [] }, o));
const inside = (p, view, m) => p.x >= m && p.y >= m && p.x + SIZE.w <= view.w - m && p.y + SIZE.h <= view.h - m;
const hits = (p, b) => p.x < b.x + b.w && p.x + SIZE.w > b.x && p.y < b.y + b.h && p.y + SIZE.h > b.y;

test('placement: prefers the right of the selected hex, with a caret pointing at it', () => {
  const p = place({ anchor: { x: 500, y: 300, r: 26 } });
  assert.equal(p.side, 'right');
  assert.equal(p.x, 500 + 26 + 14);
  assert.equal(p.caret.edge, 'left');
  assert.ok(inside(p, VIEW, 12));
});

test('placement: uses the left side when the right side has no room', () => {
  const p = place({ anchor: { x: 1100, y: 300, r: 26 } });
  assert.equal(p.side, 'left');
  assert.equal(p.x, Math.round(1100 - 26 - 14 - SIZE.w));
  assert.equal(p.caret.edge, 'right');
});

test('placement: goes above or below when neither side has room', () => {
  const p = place({ view: { w: 600, h: 900 }, anchor: { x: 300, y: 200, r: 26 } });
  assert.equal(p.side, 'below');
  assert.ok(p.y >= 200 + 26 + 14 - 1);
  assert.ok(inside(p, { w: 600, h: 900 }, 12));
});

test('placement: clamps inside the map area with a margin of at least 12px', () => {
  for (const anchor of [{ x: 30, y: 20, r: 26 }, { x: 1290, y: 690, r: 26 }, { x: 650, y: 5, r: 26 }]) {
    const p = place({ anchor });
    assert.ok(inside(p, VIEW, 12), JSON.stringify(p));
  }
});

test('placement: stays clear of the expanded sidebar and the collapsed rail', () => {
  const sidebar = { x: 8, y: 8, w: 340, h: 684 };
  const rail = { x: 8, y: 8, w: 44, h: 684 };
  for (const blocked of [sidebar, rail]) {
    for (const x of [60, 200, 400, 700, 1000, 1250]) {
      const p = place({ anchor: { x, y: 330, r: 26 }, blocked: [blocked] });
      assert.equal(hits(p, blocked), false, JSON.stringify({ x, p }));
      assert.ok(inside(p, VIEW, 12));
    }
  }
});

test('placement: stays clear of the diagnostics drawer', () => {
  const drawer = { x: 972, y: 12, w: 316, h: 676 };
  for (const x of [300, 600, 900, 1200]) {
    const p = place({ anchor: { x, y: 330, r: 26 }, blocked: [drawer] });
    assert.equal(hits(p, drawer), false, JSON.stringify({ x, p }));
  }
  const corner = place({ blocked: [drawer] });
  assert.equal(hits(corner, drawer), false);
});

test('placement: without an anchor it sits in a stable top-right position', () => {
  const p = place({});
  assert.equal(p.side, 'corner');
  assert.equal(p.caret, null);
  assert.equal(p.x, VIEW.w - 12 - SIZE.w);
  assert.equal(p.y, 12);
});

test('placement: the selected-tile bar only matters while a clean spot beside the hex exists', () => {
  const bar = { x: 360, y: 640, w: 400, h: 48, soft: true };
  const p = place({ anchor: { x: 500, y: 330, r: 26 }, blocked: [bar] });
  assert.equal(p.side, 'right', 'a soft rectangle does not push the panel away from its hex');
  const sidebar = { x: 8, y: 8, w: 340, h: 684 };
  const q = place({ anchor: { x: 500, y: 330, r: 26 }, blocked: [sidebar, bar] });
  assert.equal(hits(q, sidebar), false);
});

test('placement: the narrow layout centres the panel at the bottom of the map and hides the caret', () => {
  const view = { w: 520, h: 640 };
  const p = Geo.placeInspector({ view: view, size: { w: 496, h: 360 }, anchor: { x: 100, y: 100, r: 26 }, blocked: [], narrow: true });
  assert.equal(p.side, 'narrow');
  assert.equal(p.caret, null);
  assert.ok(p.x >= 12 && p.x + 496 <= view.w - 12);
  assert.ok(p.y + 360 <= view.h - 12 && p.y >= 12);
});

test('placement: a panel larger than the map is shrunk to fit and never leaves the map area', () => {
  const view = { w: 380, h: 300 };
  const p = Geo.placeInspector({ view: view, size: { w: 440, h: 420 }, anchor: { x: 190, y: 150, r: 20 }, blocked: [] });
  assert.ok(p.x >= 12 && p.y >= 12);
});

/* ---------------- localization and source guards ---------------- */

test('localization: every Region Inspector string exists in English and Russian with the same placeholders', () => {
  const i18n = JSON.parse(read('data/i18n.json'));
  const keys = ['journey2_inspect_region', 'journey2_inspect_aria', 'journey2_inspect_open', 'journey2_inspector_close', 'journey2_region_n', 'journey2_hexes_n',
    'journey2_placed_n', 'journey2_remaining_n', 'journey2_inspector_no_tiles', 'journey2_live_inspector_opened', 'journey2_live_inspector_closed',
    'journey2_terrain_n', 'journey2_days_per_hex', 'journey2_return', 'journey2_tile_cell', 'journey2_envs_label', 'tier_label', 'journey_k_encounter', 'journey_k_rumor', 'journey_shadowblighted', 'journey2_overtaken'];
  const ph = s => (String(s).match(/\{[A-Za-z0-9_]+\}/g) || []).sort().join();
  for (const k of keys) {
    assert.ok(i18n.en[k], 'en:' + k);
    assert.ok(i18n.ru[k], 'ru:' + k);
    assert.equal(ph(i18n.en[k]), ph(i18n.ru[k]), 'placeholders:' + k);
  }
  assert.match(i18n.en.journey2_inspect_region, /Inspect region/);
  assert.match(i18n.en.journey2_region_n, /Region #\{n\}/);
  assert.match(i18n.en.journey2_inspector_close, /Close region details/);
  assert.match(i18n.en.journey2_inspector_no_tiles, /no placed hexes/);
  for (const k of ['journey2_notes', 'journey2_notes_ph', 'journey2_notes_has', 'journey2_tile_label', 'journey2_deselect']) assert.ok(!(k in i18n.en) && !(k in i18n.ru), 'removed string is gone: ' + k);
  assert.ok(!('journey2_detail_label' in i18n.en) && !('journey2_detail_notes' in i18n.ru), 'the removed card-tab strings are gone');
});

test('view: no visible or screen-reader English is hard-coded in the inspector or the card Inspect button', () => {
  const view = read('js/journey2-view.js');
  const literals = view.match(/(['"`])(?:(?!\1)[^\\\n]|\\.)*\1/g) || [];
  for (const s of ['Inspect region', 'Region #', 'Close region details', 'GM Notes', 'GM notes', 'Notes for this region', 'Shadowblighted', 'days per hex', 'placed hexes', 'Encounter', 'Rumor']) {
    assert.deepEqual(literals.filter(l => l.includes(s)), [], 'hard-coded: ' + s);
  }
});

test('view: the inspector is a non-modal dialog, a sibling of the zoomed world, with a Return to stock footer for the anchored hex', () => {
  const view = read('js/journey2-view.js');
  const i = view.indexOf('data-j2-inspector');
  assert.ok(i > 0);
  const markup = view.slice(view.lastIndexOf('<aside', i), view.indexOf('</aside>', i));
  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="false"/);
  assert.match(markup, /aria-labelledby="j2-region-inspector-title"/);
  assert.equal((markup.match(/<h4/g) || []).length, 2, 'real headings for Encounter and Rumor');
  assert.doesNotMatch(markup, /<textarea|notes/i, 'no GM notes field');
  assert.match(markup, /<footer class="j2-insp-tile" data-j2-insp-tile hidden>[\s\S]*data-j2-return/, 'the anchored hex and its Return to stock action live in the inspector');
  assert.doesNotMatch(markup, /d20|d12|d8|d4|d100|reroll|keep|discard/i);
  const surface = view.slice(view.indexOf('function buildSurface'), view.indexOf('ui.root = container'));
  const world = surface.slice(surface.indexOf('<div class="j2-world"'), surface.indexOf('<p class="sr-only" id="j2-keys"'));
  assert.ok(!world.includes('data-j2-inspector'), 'never inside the scaled world');
});

test('view: region cards no longer carry inline Encounter, Rumor or Notes controls', () => {
  const view = read('js/journey2-view.js');
  assert.doesNotMatch(view, /detailSection|data-j2-detail|j2-detail-tabs|toggleDetail|j2-tab\b/);
  const card = view.slice(view.indexOf('function createCard'), view.indexOf('function autosizeNotes'));
  assert.match(card, /data-j2-inspect/);
  assert.doesNotMatch(card, /<textarea|data-j2-c="enc"|data-j2-c="rumor"/);
  const css = read('css/journey2.css');
  assert.doesNotMatch(css, /\.j2-tab\b|\.j2-detail\b|\.j2-detail-tabs|\.j2-detailbar/);
});

test('view: GM notes and the separate selected-tile bar are gone; Escape priority is menu, drag/armed placement, inspector', () => {
  const view = read('js/journey2-view.js');
  assert.doesNotMatch(view, /notesDirty|flushNotes|data-j2-insp-notes|j2-notes|journey2_notes|j2-tilebar|data-j2-deselect|journey2_tile_label/);
  assert.equal((view.match(/data-j2-return/g) || []).length, 3, 'one Return to stock button (markup, enable state, click handler)');
  const esc = view.slice(view.indexOf('function onDocumentKey'), view.indexOf('if (isEditableTarget(e.target) || e.defaultPrevented) return;'));
  assert.ok(esc.indexOf('openMenu') < esc.indexOf('cancelTransient') && esc.indexOf('cancelTransient') < esc.indexOf('closeInspector'));
  assert.match(esc, /\.modal-overlay/, 'an open environment overlay owns Escape');
  const css = read('css/journey2.css');
  assert.doesNotMatch(css, /\.j2-notes|\.j2-tilebar/);
});

test('view: an expanded region card lists the environments of its biome as links to the environment overlay', () => {
  const view = read('js/journey2-view.js');
  const card = view.slice(view.indexOf('function createCard'), view.indexOf('/** Updates a card'));
  assert.match(card, /data-j2-env-toggle[^>]*aria-expanded="false"[^>]*aria-controls=/);
  assert.match(card, /class="j2-envs-list"[^>]*hidden/);
  const fn = view.slice(view.indexOf('function updateEnvironments'), view.indexOf('function toggleEnvironments'));
  assert.match(fn, /habitat\.overtaken \? null/, 'an overtaken region has no biome and no list');
  assert.match(fn, /<a class="j2-env-link" href=/, 'plain links: the overlay is route-driven');
  assert.match(fn, /data-sig/, 'built once per biome + language, so an open list and its focus survive re-renders');
  const body = view.slice(view.indexOf('function updateCard'), view.indexOf('function updateEnvironments'));
  assert.ok(body.indexOf('if (!active) return;') < body.indexOf('updateEnvironments(refs, b)'), 'only an expanded card shows the dropdown');
  const app = read('js/app.js');
  assert.match(app, /environmentsForBiome: journey2EnvironmentsForBiome/);
  assert.match(app, /env\.biomes\.includes\(biome\)/);
});
