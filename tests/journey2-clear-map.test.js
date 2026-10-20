'use strict';
/* Journey 2: "Return Shadowblight home" and "Clear the whole map" (PD-074). Pure — no browser. Covers the model facts the two Campaign-menu items rely on
   (an empty `setShadowMarks` resets to the tiles' implied X's; a fresh document is empty in every campaign field), the view wiring and the localization.
   The two dialogs, the backup download and the recovery copy are checked by hand (docs/manual-qa.md "Journey 2 map editor"). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Geo = require('../js/journey2-geometry.js');
const M = require('../js/journey2-model.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const template = JSON.parse(read('data/journey2/map-template.json'));
const anchorsDoc = JSON.parse(read('data/journey2/map-anchors.json'));
const i18n = JSON.parse(read('data/i18n.json'));
const ctx = M.createContext(template, anchorsDoc);
const AT = '2026-10-20T10:00:00.000Z', AT2 = '2026-10-20T11:00:00.000Z';
const must = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.doc; };
const view = read('js/journey2-view.js');
const css = read('css/journey2.css');

const ROW = (() => {
  for (let r = 10; r < 70; r += 3) for (let q = 20; q < 60; q++) {
    let ok = true;
    for (let i = 0; i <= 12 && ok; i++) ok = ctx.placeable(q + i, r);
    if (ok) return { q, r };
  }
  throw new Error('no free row on the map');
})();
const at = i => Geo.cellId(ROW.q + i, ROW.r);

function blightedWorld() {
  const b = M.batchFromRegion({ habitat: { biome: 'forest', blighted: true, overtaken: false, source: 'rolled', rolls: [1, 11] }, terrain: { value: 2, source: 'rolled' }, size: 3, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 5 }, { id: 'b0', createdAt: AT, quantity: { value: 3, source: 'rolled' } });
  const tiles = [0, 1, 2].map(i => ({ id: 't' + i, batchId: b.id, cell: at(i) }));
  return Object.assign({}, M.emptyDocument(ctx, AT), { batches: [b], tiles: tiles });
}

test('an empty setShadowMarks puts every X back where its blighted hexes imply it and drops the wanderers (the reset)', () => {
  const base = blightedWorld();
  const implied = Array.from(M.getShadowXSet(base)).sort(M.compareCellKeys);
  assert.ok(implied.length >= 1, 'the blighted region implies at least one X');
  // one home X walks off to open ground: it is suppressed at home and added where it stands
  const wandered = must(M.apply(base, { type: 'setShadowMarks', added: [at(8)], suppressed: [implied[0]], at: AT2 }, ctx));
  assert.ok(M.getShadowXSet(wandered).has(at(8)));
  assert.ok(!M.getShadowXSet(wandered).has(implied[0]));
  const reset = must(M.apply(wandered, { type: 'setShadowMarks', added: [], suppressed: [], at: AT2 }, ctx));
  assert.deepEqual(reset.shadowMarks, { added: [], suppressed: [] });
  assert.deepEqual(Array.from(M.getShadowXSet(reset)).sort(M.compareCellKeys), implied, 'the home X is back, the wanderer is gone');
});

test('the reset is a no-op on a document that already shows only implied X\'s (no history, no write)', () => {
  const base = blightedWorld();
  const r = M.apply(base, { type: 'setShadowMarks', added: [], suppressed: [], at: AT2 }, ctx);
  assert.equal(r.ok, true);
  assert.equal(r.doc, base);
});

test('a wandering X whose tile was deleted is orphaned, and the reset removes it', () => {
  const base = must(M.apply(blightedWorld(), { type: 'setShadowMarks', added: [at(9)], suppressed: [], at: AT2 }, ctx));
  assert.deepEqual(base.shadowMarks.added, [at(9)]);
  assert.deepEqual(must(M.apply(base, { type: 'setShadowMarks', added: [], suppressed: [], at: AT2 }, ctx)).shadowMarks.added, []);
});

test('a document with any campaign data is not empty; a fresh emptyDocument is empty in every field the clear removes', () => {
  assert.equal(M.isEmptyDocument(M.emptyDocument(ctx, AT)), true);
  const busy = Object.assign({}, M.emptyDocument(ctx, AT), { shadowMarks: { added: [at(4)], suppressed: [] } });
  assert.equal(M.isEmptyDocument(busy), false, 'a wandering X alone makes the map non-empty (the Clear item stays enabled)');
  const fresh = M.emptyDocument(ctx, AT2);
  assert.deepEqual(fresh.batches, []);
  assert.deepEqual(fresh.tiles, []);
  assert.deepEqual(fresh.playerVisibility, { revealedCells: [], revealedSanctuaryNameAnchorIds: [] });
  assert.deepEqual(fresh.soulEchoes, { anchorIds: [], collectedAnchorIds: [] });
  assert.deepEqual(fresh.destroyedSanctuaries, { anchorIds: [] });
  assert.deepEqual(fresh.sanctuaries, { entries: [] });
  assert.deepEqual(fresh.shadowMarks, { added: [], suppressed: [] });
  assert.deepEqual(fresh.party, { cell: null, shown: false });
});

/* ---------------- view ---------------- */

const fn = (name, next) => view.slice(view.indexOf('function ' + name), view.indexOf(next, view.indexOf('function ' + name)));

test('view: the Campaign menu ends with a Shadowblight group and a Whole map group, both GM-only and wired', () => {
  const menu = view.slice(view.indexOf('data-j2-menu="campaign"'), view.indexOf('</aside>', view.indexOf('data-j2-menu="campaign"')));
  assert.match(menu, /data-j2-ruin-clear[\s\S]*data-t="journey2_shadow_group"[\s\S]*data-j2-shadow-reset[\s\S]*data-t="journey2_clearmap_group"[\s\S]*data-j2-clear-map/);
  assert.match(view, /b\.hasAttribute\('data-j2-shadow-reset'\)\) confirmResetShadow\(\)/);
  assert.match(view, /b\.hasAttribute\('data-j2-clear-map'\)\) confirmClearMap\(\)/);
  assert.match(view, /updateRuinUi\(\);\s*updateShadowUi\(\);/, 'renderAll keeps both items\' enabled state current');
});

test('view: the reset is ONE undoable setShadowMarks with empty lists behind a cancel-first confirmation', () => {
  const body = fn('confirmResetShadow', 'async function confirmClearMap');
  assert.match(body, /autofocus: true/);
  assert.match(body, /btn-danger/);
  assert.match(body, /dispatch\(\{ type: 'setShadowMarks', added: \[\], suppressed: \[\] \}, 'shadowReset'\)/);
  assert.match(body, /journey2_echo_undo_note/);
  assert.match(fn('updateShadowUi', 'function confirmResetShadow'), /shadowMarks\.added\.length \|\| doc\.shadowMarks\.suppressed\.length/);
});

test('view: clearing the map takes two dialogs (backup offered first, Cancel focused), a recovery copy, then replaces the document', () => {
  const body = fn('confirmClearMap', 'function updateEchoUi');
  assert.equal((body.match(/await openDialog\(/g) || []).length, 3, 'dialog 1, dialog 2 and the recovery-failed notice');
  assert.match(body, /journey2_import_download_first[\s\S]*keepOpen: true[\s\S]*Model\.serializeBackup\(doc\)/);
  assert.equal((body.match(/autofocus: true/g) || []).length, 3, 'every dialog focuses its safe button');
  assert.match(body, /store\.savePrevious\(doc\)\.ok/);
  assert.ok(body.indexOf('store.savePrevious(doc)') < body.indexOf('replaceDocument(Model.emptyDocument(data.ctx))'), 'the recovery copy is stored before anything is replaced');
  assert.match(body, /second !== 'clear' \|\| conflictBlocks\(\)\) \{ back\(\); return; \}/);
  assert.doesNotMatch(body, /localStorage|JSON\.parse/, 'storage goes through the store only');
});

test('css: the Clear item carries the destructive colour at rest, from tokens', () => {
  assert.match(css, /\.j2-mi-danger, \.j2-mi-danger \.j2-mi-ico \{ color: var\(--fear-soft\); \}/);
  assert.match(css, /\.j2-mi-danger:hover:not\(:disabled\), \.j2-mi-danger:focus-visible \{ background: var\(--fear-tint\); \}/);
});

/* ---------------- localization ---------------- */

test('every new string exists in English and Russian with the same placeholders, and the two-count key has its singular variants', () => {
  const en = i18n.en, ru = i18n.ru;
  const keys = Object.keys(en).filter(k => /^journey2_(shadow_(group|reset)|live_shadow_reset|clearmap)/.test(k));
  assert.ok(keys.length >= 20, 'found ' + keys.length);
  for (const k of keys) {
    assert.ok(typeof ru[k] === 'string' && ru[k].trim(), 'missing in Russian: ' + k);
    assert.deepEqual((en[k].match(/\{\w+\}/g) || []).sort(), (ru[k].match(/\{\w+\}/g) || []).sort(), 'placeholders differ: ' + k);
  }
  for (const v of ['_one1', '_one2', '_one12']) assert.ok(en['journey2_clearmap_msg' + v] && ru['journey2_clearmap_msg' + v], v);
  assert.equal(ru.journey2_shadow_group, 'Теневая порча');
});
