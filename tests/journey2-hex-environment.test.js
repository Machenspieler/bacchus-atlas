'use strict';
/* Journey 2: per-hex Environment assignment. Pure — no browser. Covers the optional tile `environmentId` (schema, the single
   `setTileEnvironment` command, Undo/Redo, move / return / delete, backup round-trip, unknown ids), the player projection that must
   never carry it, localization, and source-level guards on the view (inline picker, reused overlay link, GM-only marker, no storage of
   transient state). The click / picker / overlay / Player Preview behaviour in a real browser lives in
   scripts/journey2/lib/hex-environment-checks.js (checks `hexenv.*`). */
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
const apply = (doc, cmd) => M.apply(doc, Object.assign({ at: AT }, cmd), ctx);

const BASE = (() => {
  for (let q = 40; q < 80; q++) for (let r = -20; r < 20; r++) {
    let ok = true;
    for (let dq = -4; dq <= 4 && ok; dq++) for (let dr = -4; dr <= 4; dr++) if (!ctx.placeable(q + dq, r + dr)) { ok = false; break; }
    if (ok) return { q: q, r: r };
  }
  throw new Error('no open area');
})();
const at = (dq, dr) => Geo.cellId(BASE.q + dq, BASE.r + dr);

function batch(id, biome) {
  return M.batchFromRegion({
    habitat: { biome: biome || 'wetland', blighted: false, overtaken: false, source: 'rolled', rolls: [11] }, terrain: { value: 2, source: 'rolled' }, size: 6,
    encounter: { entries: [[3, 4]], combines: 0 }, rumor: 49,
  }, { id: id, createdAt: AT });
}
/** b1 (wetland) with t0 t1 t2, b2 with t3 beside them. */
function fixture() {
  let doc = M.emptyDocument(ctx, AT);
  doc = must(apply(doc, { type: 'createBatch', batch: batch('b1') }));
  doc = must(apply(doc, { type: 'createBatch', batch: batch('b2', 'forest') }));
  doc = must(apply(doc, { type: 'place', batchId: 'b1', tiles: [{ id: 't0', cell: at(0, 0) }, { id: 't1', cell: at(1, 0) }, { id: 't2', cell: at(2, 0) }] }));
  doc = must(apply(doc, { type: 'place', batchId: 'b2', tiles: [{ id: 't3', cell: at(0, 1) }] }));
  return doc;
}
const tile = (doc, id) => doc.tiles.find(t => t.id === id);
const set = (doc, id, env) => apply(doc, { type: 'setTileEnvironment', tileId: id, environmentId: env });

/* ---------------- schema ---------------- */

test('schema: a tile without environmentId is valid and has no key; old documents load unchanged', () => {
  const doc = fixture();
  assert.equal('environmentId' in tile(doc, 't0'), false);
  const back = M.parseBackupText(M.serializeBackup(doc), ctx);
  assert.equal(back.ok, true);
  assert.equal(M.serializeBackup(back.doc), M.serializeBackup(doc));
});

test('schema: a tile with a stable id validates; malformed ids are rejected as a whole', () => {
  const doc = must(set(fixture(), 't0', 'buzzing-swamp'));
  assert.equal(M.validateDocument(JSON.parse(JSON.stringify(doc)), ctx).ok, true);
  for (const bad of ['', 'Has Caps', 'has space', 'a'.repeat(65), 5, null, {}, '../x', '-lead', 'trail-']) {
    const raw = JSON.parse(JSON.stringify(doc));
    raw.tiles[0].environmentId = bad;
    assert.equal(M.validateDocument(raw, ctx).ok, false, 'rejects ' + JSON.stringify(bad));
  }
  const extra = JSON.parse(JSON.stringify(doc)); extra.tiles[0].environmentName = 'Buzzing Swamp';
  assert.equal(M.validateDocument(extra, ctx).ok, false, 'no copied catalog text');
});

test('schema: an unknown but well-formed id survives import and a round trip untouched', () => {
  const doc = must(set(fixture(), 't1', 'long-gone-environment'));
  const back = M.parseBackupText(M.serializeBackup(doc), ctx);
  assert.equal(back.ok, true);
  assert.equal(tile(back.doc, 't1').environmentId, 'long-gone-environment');
  assert.equal(M.serializeBackup(back.doc), M.serializeBackup(doc));
});

test('schema: every real catalog id satisfies the id format', () => {
  const envs = JSON.parse(read('data/environments.json'));
  const list = Array.isArray(envs) ? envs : envs.environments || Object.values(envs);
  assert.ok(list.length > 100);
  for (const e of list) assert.equal(M.isEnvironmentId(e.id), true, e.id);
});

/* ---------------- command ---------------- */

test('command: assign adds the id, touches only that tile and updatedAt', () => {
  const doc = fixture(), r = apply(doc, { type: 'setTileEnvironment', tileId: 't0', environmentId: 'buzzing-swamp', at: '2026-10-07T00:00:00.000Z' });
  assert.equal(r.ok, true);
  assert.equal(tile(r.doc, 't0').environmentId, 'buzzing-swamp');
  assert.equal('environmentId' in tile(r.doc, 't1'), false);
  assert.equal(r.doc.updatedAt, '2026-10-07T00:00:00.000Z');
  assert.equal(tile(doc, 't0').environmentId, undefined, 'the previous document is untouched');
  assert.deepEqual(r.doc.batches, doc.batches); assert.equal(r.doc.playerVisibility, doc.playerVisibility);
});

test('command: assigning the id already stored is a no-op (same document, no updatedAt change)', () => {
  const doc = must(set(fixture(), 't0', 'buzzing-swamp'));
  const r = apply(doc, { type: 'setTileEnvironment', tileId: 't0', environmentId: 'buzzing-swamp', at: '2030-01-01T00:00:00.000Z' });
  assert.equal(r.ok, true); assert.equal(r.noop, true); assert.equal(r.doc, doc); assert.equal(r.doc.updatedAt, doc.updatedAt);
  const n = set(fixture(), 't0', null);
  assert.equal(n.noop, true, 'detaching nothing is a no-op too');
});

test('command: change replaces the id in ONE command; detach removes the key', () => {
  const a = must(set(fixture(), 't0', 'buzzing-swamp'));
  const b = must(set(a, 't0', 'blood-marsh'));
  assert.equal(tile(b, 't0').environmentId, 'blood-marsh');
  const c = must(set(b, 't0', null));
  assert.equal('environmentId' in tile(c, 't0'), false);
  assert.equal(M.serializeBackup(c), M.serializeBackup(fixture()).replace(/"updatedAt": "[^"]+"/, '"updatedAt": "' + AT + '"'));
});

test('command: unknown tile, unplaced tile and malformed ids are refused', () => {
  const doc = fixture();
  assert.equal(set(doc, 'nope', 'buzzing-swamp').error.code, 'no-tile');
  assert.equal(set(doc, undefined, 'buzzing-swamp').error.code, 'no-tile');
  for (const bad of ['', 'BAD', 7, undefined, {}, 'x'.repeat(80)]) assert.equal(set(doc, 't0', bad).error.code, 'bad-environment', JSON.stringify(bad));
});

test('command: the same environment may sit on many tiles', () => {
  let doc = fixture();
  for (const id of ['t0', 't1', 't2']) doc = must(set(doc, id, 'buzzing-swamp'));
  assert.equal(doc.tiles.filter(t => t.environmentId === 'buzzing-swamp').length, 3);
});

test('place never carries an assignment: a fresh tile starts without one', () => {
  const doc = must(apply(must(set(fixture(), 't0', 'buzzing-swamp')), { type: 'place', batchId: 'b1', tiles: [{ id: 'n1', cell: at(0, -1) }] }));
  assert.equal('environmentId' in tile(doc, 'n1'), false);
});

/* ---------------- tile lifecycle ---------------- */

test('move: the assignment follows the tile; fog is unaffected', () => {
  let doc = must(set(fixture(), 't2', 'blood-marsh'));
  doc = must(apply(doc, { type: 'setCellsRevealed', cellKeys: [at(2, 0)], revealed: true }));
  const fog = doc.playerVisibility;
  const moved = must(apply(doc, { type: 'move', tileId: 't2', to: at(2, -1) }));
  assert.equal(tile(moved, 't2').cell, at(2, -1));
  assert.equal(tile(moved, 't2').environmentId, 'blood-marsh');
  assert.equal(moved.playerVisibility, fog, 'fog is coordinate-based and untouched');
});

test('return to stock removes tile and assignment; the stock tile placed again starts clean', () => {
  const doc = must(set(fixture(), 't2', 'blood-marsh'));
  const ret = must(apply(doc, { type: 'returnTile', tileId: 't2' }));
  assert.equal(tile(ret, 't2'), undefined);
  const again = must(apply(ret, { type: 'place', batchId: 'b1', tiles: [{ id: 't9', cell: at(2, 0) }] }));
  assert.equal('environmentId' in tile(again, 't9'), false);
});

test('delete batch removes its assigned tiles', () => {
  const doc = must(set(fixture(), 't0', 'blood-marsh'));
  const del = must(apply(doc, { type: 'deleteBatch', batchId: 'b1' }));
  assert.equal(del.tiles.some(t => t.environmentId), false);
});

test('fog commands never touch assignments', () => {
  const doc = must(set(fixture(), 't0', 'blood-marsh'));
  const r = must(apply(doc, { type: 'setCellsRevealed', cellKeys: [at(0, 0)], revealed: true }));
  assert.equal(r.tiles, doc.tiles);
});

/* ---------------- history ---------------- */

test('history: assign, change, detach are one entry each and undo/redo restore the exact id', () => {
  const h = M.createHistory();
  let doc = fixture();
  const step = (cmd, label) => { const r = apply(doc, cmd); assert.equal(r.ok, true); M.historyCommit(h, doc, r.doc, label); doc = r.doc; };
  step({ type: 'setTileEnvironment', tileId: 't0', environmentId: 'buzzing-swamp' }, 'assign');
  step({ type: 'setTileEnvironment', tileId: 't0', environmentId: 'blood-marsh' }, 'change');
  step({ type: 'setTileEnvironment', tileId: 't0', environmentId: null }, 'detach');
  assert.equal(h.undo.length, 3);
  let e = M.historyUndo(h); assert.equal(tile(e.before, 't0').environmentId, 'blood-marsh');
  e = M.historyUndo(h); assert.equal(tile(e.before, 't0').environmentId, 'buzzing-swamp', 'undoing a change restores the previous id directly');
  e = M.historyUndo(h); assert.equal('environmentId' in tile(e.before, 't0'), false);
  e = M.historyRedo(h); assert.equal(tile(e.after, 't0').environmentId, 'buzzing-swamp');
  e = M.historyRedo(h); assert.equal(tile(e.after, 't0').environmentId, 'blood-marsh');
  e = M.historyRedo(h); assert.equal('environmentId' in tile(e.after, 't0'), false);
});

test('history: undoing a return or a batch delete restores tiles with their assignments', () => {
  const doc = must(set(fixture(), 't2', 'blood-marsh'));
  const h = M.createHistory();
  const ret = must(apply(doc, { type: 'returnTile', tileId: 't2' })); M.historyCommit(h, doc, ret, 'returnTile');
  assert.equal(tile(M.historyUndo(h).before, 't2').environmentId, 'blood-marsh');
  const del = must(apply(doc, { type: 'deleteBatch', batchId: 'b1' })); M.historyCommit(h, doc, del, 'deleteBatch');
  assert.equal(tile(M.historyUndo(h).before, 't2').environmentId, 'blood-marsh');
});

/* ---------------- player projection ---------------- */

test('projection: a revealed assigned tile exposes no environment data at all', () => {
  let doc = must(set(fixture(), 't0', 'buzzing-swamp'));
  doc = must(apply(doc, { type: 'setCellsRevealed', cellKeys: [at(0, 0), at(1, 0)], revealed: true }));
  const proj = P.buildPlayerProjection(doc, ctx), json = JSON.stringify(proj);
  assert.equal(proj.overlays.length, 2);
  assert.doesNotMatch(json, /environment|buzzing-swamp/i);
  assert.deepEqual(Object.keys(proj.overlays[0]).sort(), ['blightMark', 'dots', 'q', 'r', 'symbolId', 'tint']);
  const hidden = P.buildPlayerProjection(must(set(fixture(), 't0', 'buzzing-swamp')), ctx);
  assert.doesNotMatch(JSON.stringify(hidden), /environment|buzzing-swamp/i);
});

/* ---------------- localization ---------------- */

test('localization: every Hex Environment string exists in English and Russian with the same placeholders', () => {
  const i18n = JSON.parse(read('data/i18n.json'));
  const keys = Object.keys(i18n.en).filter(k => k.startsWith('journey2_hexenv_'));
  assert.ok(keys.length >= 18);
  const ph = s => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const k of keys) {
    assert.ok(i18n.ru[k], 'ru:' + k);
    assert.equal(ph(i18n.en[k]), ph(i18n.ru[k]), 'placeholders:' + k);
  }
  for (const k of ['Hex Environment', 'No Environment assigned to this hex', 'Choose Environment', 'Detach', 'Assign', 'Assigned', 'Environment unavailable', 'Stored id', 'Open Environment details', 'Tier {n}', 'No habitat-specific environments are available for this region']) {
    assert.ok(Object.values(i18n.en).some(v => v.replace(/\.$/, '') === k), k);
  }
});

/* ---------------- view source guards ---------------- */

const view = read('js/journey2-view.js'), css = read('css/journey2.css');
const fn = (from, to) => view.slice(view.indexOf('function ' + from), view.indexOf('function ' + to, view.indexOf('function ' + from) + 1));

test('view: Hex Environment is map-opened only; the card-opened inspector shows no environment section', () => {
  const r = fn('renderHexEnvironment', 'hexEnvButton');
  assert.match(r, /if \(!tile\)[\s\S]*hexEnvSec\.hidden = true/);
  assert.match(fn('renderInspector', 'inspectorAnchor'), /inspector\.source === 'map' && inspector\.tileId \? Model\.derive\(doc\)\.byId\.get/);
});

test('view: the list comes only from the existing biome adapter; an overtaken region has none; nothing is re-sorted or re-fetched', () => {
  const list = fn('hexEnvironmentList', 'envRowHtml');
  assert.match(list, /b\.habitat\.overtaken \? null : b\.habitat\.biome/);
  assert.match(list, /environmentsFor\(biome\)/);
  const mine = fn('hexEnvironmentList', 'setEnvironmentsOpen');
  assert.doesNotMatch(mine, /\.sort\(|fetch\(|environments\.json|envHash|location\.hash/);
  assert.doesNotMatch(read('js/journey2-view.js').replace(/\/\*[\s\S]*?\*\//g, ''), /data\/environments\.json/);
});

test('view: Assign goes through one setTileEnvironment command and re-checks the adapter list first', () => {
  const h = fn('onHexEnvClick', 'setEnvironmentsOpen');
  assert.equal((h.match(/type: 'setTileEnvironment'/g) || []).length, 2, 'assign / change share one command; detach is the second');
  assert.match(h, /hexEnvironmentList\(b\)\.find\(e => e\.id === id\)[\s\S]*if \(!pick\) return/);
  assert.match(h, /environmentId: null/);
  assert.doesNotMatch(fn('setEnvPicker', 'onHexEnvClick'), /dispatch\(|persist\(|historyCommit/, 'opening or closing the picker is pure UI state');
});

test('view: names are real links to the existing overlay href, Assign is a real button with a contextual label', () => {
  const r = fn('envRowHtml', 'renderHexEnvironment') + fn('renderHexEnvironment', 'hexEnvButton');
  assert.match(r, /<a class="j2-env-link"[^>]*href="' \+ esc\(e\.href\)/);
  assert.match(r, /<button type="button" class="btn btn-sm" data-j2-hexenv="assign"[^>]*aria-label="' \+ esc\(fill\('journey2_hexenv_assign_aria'/);
  assert.match(r, /found\.href/);
  assert.doesNotMatch(r, /#\/journey2\?|#\/env|envHash/, 'no hand-built overlay URLs');
  assert.match(r, /journey2_hexenv_open/);
});

test('view: unknown ids render an unavailable state with Detach and no link; nothing is auto-cleared', () => {
  const r = fn('renderHexEnvironment', 'hexEnvButton');
  assert.match(r, /is-unavailable[\s\S]*journey2_hexenv_unavailable[\s\S]*journey2_hexenv_stored_id/);
  assert.match(r, /data-j2-hexenv="detach"/);
  assert.doesNotMatch(r, /dispatch\(/);
});

test('view: picker state is transient — never stored, closed on every inspector change, Undo/Redo, fog tool and preview', () => {
  assert.doesNotMatch(read('js/journey2-store.js'), /envPicker|environmentId/);
  assert.doesNotMatch(fn('saveUiPrefs', 'toggleSide') || '', /envPicker/);
  assert.match(fn('openInspectorFromTile', 'openInspectorFromCard'), /envPicker = null/);
  assert.match(fn('openInspectorFromCard', 'announceInspector'), /envPicker = null/);
  assert.match(fn('closeInspector', 'syncInspector'), /envPicker = null/);
  assert.match(fn('undo', 'redo'), /envPicker = null/);
  assert.match(fn('redo', 'buildStaticLayers'), /envPicker = null/);
  assert.match(fn('enterPreview', 'leavePreview'), /closeInspector\(/);
  assert.match(fn('setFogTool', 'toggleFogState'), /closeInspector\(/);
});

test('view: focus rules — detach lands on Choose, assign on the selected link, closing the picker on its opener', () => {
  const h = fn('onHexEnvClick', 'setEnvironmentsOpen');
  assert.match(h, /hexEnvButton\('choose'\)[\s\S]*focus/);
  assert.match(h, /querySelector\('\[data-j2-hexenv-link\]'\)[\s\S]*focus/);
  assert.match(fn('setEnvPicker', 'onHexEnvClick'), /tile\.environmentId \? 'change' : 'choose'/);
});

test('view: the map carries no environment marker; the shared drawing and the projection know nothing about environments', () => {
  assert.doesNotMatch(view, /envmarks|j2-envmark|renderEnvMarks|envMarkersMarkup/);
  assert.doesNotMatch(css, /j2-envmark/);
  assert.doesNotMatch(read('js/journey2-print.js'), /envmark|environmentId/);
  assert.doesNotMatch(fn('overlayMarkup', 'renderTiles'), /environment/i, 'the shared drawing routine (and so Player Preview / print) knows nothing about environments');
  assert.doesNotMatch(read('js/journey2-projection.js').replace(/\/\*[\s\S]*?\*\//g, ''), /environment/i);
});

test('view: the hover tooltip is neutral-GM only and never competes with a drag, fog tool, placement or preview', () => {
  const r = fn('updateEnvTip', 'updateHover');
  assert.match(r, /!tr && !pan && !fogStroke && !fogTool && !previewMode && !placeMode/);
  assert.match(r, /sanctuaryAtScreen/);
});

test('view: opening the overlay is plain link navigation — nothing here listens to it, dispatches, or persists', () => {
  assert.doesNotMatch(fn('renderHexEnvironment', 'hexEnvButton'), /addEventListener|persist\(|dispatch\(|location/);
});

test('view: no visible English is hard-coded in the Hex Environment code', () => {
  const code = fn('hexEnvironmentList', 'setEnvironmentsOpen');
  assert.doesNotMatch(code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), /'(Choose|Assign|Detach|Change|Assigned|No Environment|Tier)\b/);
});

test('docs: the decision and the architecture section exist', () => {
  assert.match(read('docs/product-decisions.md'), /PD-025/);
  assert.match(read('docs/architecture.md'), /Hex Environment/);
});

test('css: a hidden inspector section really disappears (display:grid must not override [hidden])', () => {
  assert.match(css, /\.j2-insp-sec\[hidden\]\s*\{\s*display:\s*none/);
});
