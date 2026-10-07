'use strict';
/* Journey 2: Biome Tint layer (PD-026). Pure — no browser. Covers the centralized palette, the Habitat -> tint rule (Shadowblight keeps the
   Habitat colour, a fully overtaken region falls back to violet-grey), the derived GM tint across place / move / return / Undo / delete, the
   stored-only-in-UI preference, the player projection (revealed cells only, hidden cells leak nothing), Environment independence, fixed
   markers, and the black-and-white print contract (no tint at all, never grayscale, independent of the GM preference). The rendering in a
   real browser lives in scripts/journey2/lib (checks `biome.*`). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Geo = require('../js/journey2-geometry.js');
const M = require('../js/journey2-model.js');
const P = require('../js/journey2-projection.js');
const Tint = require('../js/journey2-biome-tint.js');
const Store = require('../js/journey2-store.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const template = JSON.parse(read('data/journey2/map-template.json'));
const anchorsDoc = JSON.parse(read('data/journey2/map-anchors.json'));
const ctx = M.createContext(template, anchorsDoc);
const AT = '2026-10-07T10:00:00.000Z';
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

function batch(id, habitat) {
  return M.batchFromRegion({
    habitat: Object.assign({ biome: 'wetland', blighted: false, overtaken: false, source: 'rolled', rolls: [11] }, habitat || {}), terrain: { value: 2, source: 'rolled' }, size: 6,
    encounter: { entries: [[3, 4]], combines: 0 }, rumor: 49,
  }, { id: id, createdAt: AT });
}
/** b1 wetland t0 t1 t2; b2 forest t3. */
function fixture() {
  let doc = M.emptyDocument(ctx, AT);
  doc = must(apply(doc, { type: 'createBatch', batch: batch('b1') }));
  doc = must(apply(doc, { type: 'createBatch', batch: batch('b2', { biome: 'forest' }) }));
  doc = must(apply(doc, { type: 'place', batchId: 'b1', tiles: [{ id: 't0', cell: at(0, 0) }, { id: 't1', cell: at(1, 0) }, { id: 't2', cell: at(2, 0) }] }));
  doc = must(apply(doc, { type: 'place', batchId: 'b2', tiles: [{ id: 't3', cell: at(0, 1) }] }));
  return doc;
}
const gm = (doc, on) => Tint.gmTintByCell(doc, on !== false);

/* ---------------- palette ---------------- */

test('palette: every supported Habitat and the overtaken fallback resolve to a tint definition', () => {
  for (const id of M.HABITAT_IDS) {
    const def = Tint.definitionOf(id);
    assert.ok(def, id);
    assert.match(def.color, /^#[0-9a-f]{6}$/i, id);
    assert.ok(def.opacity >= 0.06 && def.opacity <= 0.10, id + ' stays in the restrained 0.06-0.10 range');
  }
  assert.ok(Tint.definitionOf(Tint.OVERTAKEN_KEY));
  assert.deepEqual(Object.keys(Tint.PALETTE).sort(), M.HABITAT_IDS.concat([Tint.OVERTAKEN_KEY]).sort(), 'no stray or missing palette entry');
  assert.equal(Tint.definitionOf('nope'), null);
  assert.equal(Tint.definitionOf('__proto__'), null);
  assert.equal(Object.isFrozen(Tint.PALETTE), true);
});

test('palette: the greens stay distinguishable (distinct colours for Grassland, Tropical, Forest, Wetland)', () => {
  const hex = k => Tint.PALETTE[k].color;
  const hue = c => { const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
  const hues = ['grassland', 'tropical', 'forest', 'wetland'].map(k => hue(hex(k))).sort((a, b) => a - b);
  for (let i = 1; i < hues.length; i++) assert.ok(hues[i] - hues[i - 1] >= 12, 'adjacent green hues differ by at least 12 degrees: ' + hues.join(', '));
  assert.equal(new Set(M.HABITAT_IDS.map(hex)).size, M.HABITAT_IDS.length, 'all eleven colours are distinct');
});

test('habitat -> tint: Shadowblighted keeps the base Habitat colour; only a fully overtaken region falls back', () => {
  assert.equal(Tint.tintKeyOf({ biome: 'wetland', blighted: true, overtaken: false }), 'wetland');
  assert.equal(Tint.tintKeyOf({ biome: 'wetland', blighted: false, overtaken: false }), 'wetland');
  assert.equal(Tint.tintKeyOf({ biome: null, blighted: true, overtaken: true }), Tint.OVERTAKEN_KEY);
  assert.equal(Tint.tintKeyOf({ biome: 'ocean' }), null, 'unknown biome: no tint rather than a guess');
  assert.equal(Tint.tintKeyOf(null), null);
  let doc = M.emptyDocument(ctx, AT);
  doc = must(apply(doc, { type: 'createBatch', batch: batch('bs', { blighted: true }) }));
  doc = must(apply(doc, { type: 'createBatch', batch: batch('bo', { biome: null, blighted: true, overtaken: true }) }));
  doc = must(apply(doc, { type: 'place', batchId: 'bs', tiles: [{ id: 'a', cell: at(0, 0) }] }));
  doc = must(apply(doc, { type: 'place', batchId: 'bo', tiles: [{ id: 'b', cell: at(1, 0) }] }));
  const t = gm(doc);
  assert.equal(t.get(at(0, 0)), 'wetland');
  assert.equal(t.get(at(1, 0)), 'overtaken');
});

/* ---------------- GM render derivation ---------------- */

test('GM: a placed tile carries its Habitat tint; unplaced stock carries none', () => {
  const doc = fixture();
  const t = gm(doc);
  assert.equal(t.size, 4);
  assert.equal(t.get(at(0, 0)), 'wetland'); assert.equal(t.get(at(2, 0)), 'wetland'); assert.equal(t.get(at(0, 1)), 'forest');
  assert.equal(gm(M.emptyDocument(ctx, AT)).size, 0);
});

test('GM: moving a tile moves its tint; Return to stock and delete remove it; Undo/Redo restore it by derivation', () => {
  const d0 = fixture();
  const moved = must(apply(d0, { type: 'move', tileId: 't3', to: at(3, 0) }));
  assert.equal(gm(moved).has(at(0, 1)), false); assert.equal(gm(moved).get(at(3, 0)), 'forest');
  const back = must(apply(d0, { type: 'returnTile', tileId: 't3' }));
  assert.equal(gm(back).size, 3); assert.equal(gm(back).has(at(0, 1)), false);
  const gone = must(apply(d0, { type: 'deleteBatch', batchId: 'b2' }));
  assert.equal(gm(gone).size, 3);
  const h = M.createHistory();
  M.historyCommit(h, d0, back, 'return');
  const u = M.historyUndo(h);
  assert.equal(gm(u.before).get(at(0, 1)), 'forest', 'Undo restores the tint');
  const r = M.historyRedo(h);
  assert.equal(gm(r.after).has(at(0, 1)), false, 'Redo removes it again');
});

test('GM: the tint survives a backup export/import because it is recomputed, and is never part of the document', () => {
  const doc = fixture();
  const text = M.serializeBackup(doc);
  assert.doesNotMatch(text, /tint|#[0-9a-f]{6}\b|opacity/i, 'no tint geometry or colour in the backup');
  const back = M.parseBackupText(text, ctx);
  assert.equal(back.ok, true);
  assert.deepEqual(Array.from(gm(back.doc)), Array.from(gm(doc)));
});

test('preference: disabling hides the GM tint only, enabling restores it, and the document is untouched', () => {
  const doc = fixture();
  const before = M.serializeBackup(doc);
  assert.equal(gm(doc, false).size, 0);
  assert.equal(gm(doc, true).size, 4);
  assert.equal(M.serializeBackup(doc), before, 'toggling reads the document, never writes it');
  const revealed = must(apply(doc, { type: 'setCellsRevealed', cellKeys: [at(0, 0)], revealed: true }));
  assert.equal(P.buildPlayerProjection(revealed, ctx).overlays[0].tint, 'wetland', 'the GM preference has no input into the player projection');
});

test('preference: stored in dhcodex_journey2_ui, defaults to ON, survives a UI-state reload, never in the document or history', () => {
  const mem = new Map();
  const storage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); } };
  const store = Store.createStore(storage, ctx);
  assert.equal(store.loadUi().showBiomeColors, true, 'default ON');
  assert.equal(store.saveUi({ sideCollapsed: false, showFogState: true, showBiomeColors: false }).ok, true);
  assert.equal(Store.createStore(storage, ctx).loadUi().showBiomeColors, false, 'a new store (reload) reads it back');
  assert.deepEqual(Array.from(mem.keys()), [Store.KEYS.ui], 'only the UI key was written');
  assert.equal(Store.KEYS.ui, 'dhcodex_journey2_ui');
  mem.set(Store.KEYS.ui, JSON.stringify({ showBiomeColors: 'no' }));
  assert.equal(store.loadUi().showBiomeColors, true, 'a malformed value falls back to the default');
  // legacy UI blobs without the field keep working
  mem.set(Store.KEYS.ui, JSON.stringify({ sideCollapsed: true, showFogState: false }));
  const ui = store.loadUi();
  assert.deepEqual([ui.sideCollapsed, ui.showFogState, ui.showBiomeColors], [true, false, true]);
});

test('preference: toggling is a pure display change in the view (no command, history, document save or camera change)', () => {
  const view = read('js/journey2-view.js').replace(/\/\*[\s\S]*?\*\//g, '');
  const fn = view.match(/function toggleBiomeColors\(\) \{([\s\S]*?)\n    \}/);
  assert.ok(fn, 'toggleBiomeColors exists');
  assert.doesNotMatch(fn[1], /commit\(|Model\.apply|persist\(|setCamera|historyCommit|renderFog|doc\s*=/, 'no document, history, fog or camera work');
  assert.match(fn[1], /saveUiPrefs\(\)/);
});

/* ---------------- player projection ---------------- */

test('player projection: a revealed tile includes its tint', () => {
  const doc = must(apply(fixture(), { type: 'setCellsRevealed', cellKeys: [at(0, 0), at(0, 1)], revealed: true }));
  const p = P.buildPlayerProjection(doc, ctx);
  const byCell = new Map(p.overlays.map(o => [Geo.cellId(o.q, o.r), o]));
  assert.equal(byCell.get(at(0, 0)).tint, 'wetland');
  assert.equal(byCell.get(at(0, 1)).tint, 'forest');
});

test('player projection: hidden tiles emit nothing — no overlay, no tint key, no colour anywhere in the serialized projection', () => {
  const none = P.buildPlayerProjection(fixture(), ctx);
  assert.equal(none.overlays.length, 0);
  const text = JSON.stringify(none);
  assert.doesNotMatch(text, /wetland|forest|overtaken|tint|#[0-9a-f]{6}/i);
});

test('player projection: a mixed-visibility region colours only its revealed cells', () => {
  const doc = must(apply(fixture(), { type: 'setCellsRevealed', cellKeys: [at(0, 0), at(2, 0)], revealed: true }));
  const p = P.buildPlayerProjection(doc, ctx);
  assert.equal(p.overlays.length, 2);
  assert.deepEqual(p.overlays.map(o => Geo.cellId(o.q, o.r)).sort(), [at(0, 0), at(2, 0)].sort());
  assert.ok(p.overlays.every(o => o.tint === 'wetland'));
  assert.doesNotMatch(JSON.stringify(p), /forest/, 'the forest tile in a hidden cell leaks nothing');
});

test('player projection: a revealed blighted tile keeps its Habitat tint and an overtaken one uses the fallback', () => {
  let doc = M.emptyDocument(ctx, AT);
  doc = must(apply(doc, { type: 'createBatch', batch: batch('bs', { biome: 'frozen', blighted: true }) }));
  doc = must(apply(doc, { type: 'createBatch', batch: batch('bo', { biome: null, blighted: true, overtaken: true }) }));
  doc = must(apply(doc, { type: 'place', batchId: 'bs', tiles: [{ id: 'a', cell: at(0, 0) }] }));
  doc = must(apply(doc, { type: 'place', batchId: 'bo', tiles: [{ id: 'b', cell: at(1, 0) }] }));
  doc = must(apply(doc, { type: 'setCellsRevealed', cellKeys: [at(0, 0), at(1, 0)], revealed: true }));
  const p = P.buildPlayerProjection(doc, ctx);
  const byCell = new Map(p.overlays.map(o => [Geo.cellId(o.q, o.r), o]));
  assert.equal(byCell.get(at(0, 0)).tint, 'frozen'); assert.equal(byCell.get(at(0, 0)).blightMark, true);
  assert.equal(byCell.get(at(1, 0)).tint, 'overtaken');
});

/* ---------------- independence ---------------- */

test('Environment assignment does not change the tint (GM or player)', () => {
  const d0 = must(apply(fixture(), { type: 'setCellsRevealed', cellKeys: [at(0, 0)], revealed: true }));
  const d1 = must(apply(d0, { type: 'setTileEnvironment', tileId: 't0', environmentId: 'blood-marsh' }));
  assert.deepEqual(Array.from(gm(d1)), Array.from(gm(d0)));
  assert.deepEqual(P.buildPlayerProjection(d1, ctx).overlays, P.buildPlayerProjection(d0, ctx).overlays);
  assert.equal(gm(d1).get(at(0, 0)), 'wetland');
});

test('Soul Echoes and sanctuaries neither add nor remove tint, and the tint module knows nothing about them', () => {
  const d0 = fixture();
  const sanc = M.planSanctuaries ? apply(d0, { type: 'setSoulEchoes', anchorIds: ctx.sanctuaries.slice(0, 2).map(s => s.id) }) : null;
  if (sanc && sanc.ok) assert.deepEqual(Array.from(gm(sanc.doc)), Array.from(gm(d0)));
  const src = read('js/journey2-biome-tint.js').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(src, /soulEcho|sanctuar|environmentId|encounter|rumor|terrain/i);
});

test('view: the tint layer is aria-hidden, no events, under the symbols, with no stroke and nothing around fixed markers', () => {
  const view = read('js/journey2-view.js').replace(/\/\*[\s\S]*?\*\//g, ''), css = read('css/journey2.css');
  assert.match(view, /<g class="j2-biome-layer" pointer-events="none" aria-hidden="true">/);
  const order = view.match(/return \(cover \? [^\n]+/)[0];
  assert.ok(order.indexOf('wash') > order.indexOf('cover') && order.indexOf('wash') < order.indexOf('outlines') && order.indexOf('outlines') < order.indexOf('body'), 'cover, tint, outlines, then symbols');
  const rule = css.match(/\.j2-biome-tint[^{]*\{[^}]*\}/)[0];
  assert.match(rule, /\.j2-biome-halo/, 'the symbol halo is washed with the same tint');
  assert.match(rule, /stroke:\s*none[^}]*pointer-events:\s*none/);
  assert.doesNotMatch(rule, /gradient|filter|animation|drop-shadow/);
  assert.doesNotMatch(view, /markers[^\n]*tint|sanct[^\n]*Tint\./i);
});

test('view: Player Preview tints from projection keys only and the GM preference is not read there', () => {
  const view = read('js/journey2-view.js').replace(/\/\*[\s\S]*?\*\//g, '');
  const pv = view.match(/if \(previewMode\) \{\s*\/\/ Player Preview[\s\S]*?return;\s*\}/);
  assert.ok(pv, 'preview branch found');
  assert.match(pv[0], /tint: o\.tint/);
  assert.doesNotMatch(pv[0], /showBiome|gmTintByCell/);
});

/* ---------------- print contract ---------------- */

test('print: black-and-white projection contains no tint layer, key or colour — not grayscale, not hatch', () => {
  const doc = must(apply(fixture(), { type: 'setCellsRevealed', cellKeys: [at(0, 0), at(0, 1), at(1, 0)], revealed: true }));
  const bw = P.buildPrintProjection(doc, ctx);
  assert.equal(bw.printMode, 'bw');
  assert.equal(bw.overlays.length, 3, 'revealed symbols are still printed');
  for (const o of bw.overlays) assert.equal('tint' in o, false);
  assert.doesNotMatch(JSON.stringify(bw), /tint|grey|gray|hatch|fill|opacity|#[0-9a-f]{3,6}\b/i);
  assert.deepEqual(P.buildPrintProjection(doc, ctx, { color: false }), bw);
  assert.deepEqual(P.buildPrintProjection(doc, ctx, { color: 'yes' }), bw, 'only an explicit true opts in to colour');
});

test('print: output does not depend on the screen preview or the GM Biome colors preference', () => {
  const doc = must(apply(fixture(), { type: 'setCellsRevealed', cellKeys: [at(0, 0)], revealed: true }));
  assert.equal(P.buildPrintProjection.length <= 3, true);
  const screen = P.buildPlayerProjection(doc, ctx);
  assert.equal(screen.overlays[0].tint, 'wetland', 'the screen projection has colour');
  const bw = P.buildPrintProjection(doc, ctx);
  assert.equal('tint' in bw.overlays[0], false, 'while the print projection of the same document has none');
  const src = read('js/journey2-projection.js').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(src, /showBiome|loadUi|localStorage|dhcodex_/, 'the projection module reads no UI state');
});

test('print: a future colour mode may reuse the same tint keys; the tint is never baked into the base map or generated artwork', () => {
  const doc = must(apply(fixture(), { type: 'setCellsRevealed', cellKeys: [at(0, 0)], revealed: true }));
  const c = P.buildPrintProjection(doc, ctx, { color: true });
  assert.equal(c.printMode, 'color'); assert.equal(c.overlays[0].tint, 'wetland');
  assert.equal(P.buildPlayerProjection(doc, ctx, { biomeTint: false }).overlays[0].tint, undefined);
  assert.doesNotMatch(read('js/journey2-view.js').replace(/\/\*[\s\S]*?\*\//g, ''), /createImageData|toDataURL|canvas[^\n]*tint/i);
});

test('wiring: the module loads before the projection in index.html and ships in the build allow-list', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('js/journey2-biome-tint.js') > 0 && html.indexOf('js/journey2-biome-tint.js') < html.indexOf('js/journey2-projection.js'));
  assert.match(read('scripts/check-journey2-build.js'), /js\/journey2-biome-tint\.js/);
});
