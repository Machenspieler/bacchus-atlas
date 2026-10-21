/* Shadowblight FX on the screen map (PD-072): pure core of js/journey2-shadowblight-fx.js + source guards on how the view, the print and the build use it.
   The rendering itself (WebGL, masks, the screen-locked cosmos) is verified in a real browser by scripts/journey2/verify-shadowblight-fx.js. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Geo = require('../js/journey2-geometry.js');
const M = require('../js/journey2-model.js');
const P = require('../js/journey2-projection.js');
const PR = require('../js/journey2-print.js');
const Fx = require('../js/journey2-shadowblight-fx.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const template = JSON.parse(read('data/journey2/map-template.json'));
const anchorsDoc = JSON.parse(read('data/journey2/map-anchors.json'));
const ctx = M.createContext(template, anchorsDoc), grid = ctx.grid;
const AT = '2026-10-19T10:00:00.000Z';
const must = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.doc; };

const ROW = (() => {
  for (let r = 10; r < 70; r += 3) for (let q = 20; q < 60; q++) {
    let ok = true;
    for (let i = -4; i <= 24 && ok; i++) ok = ctx.placeable(q + i, r) && ctx.placeable(q + i, r + 1) && ctx.placeable(q + i, r - 1);
    if (ok) return { q, r };
  }
  throw new Error('no free row on the map');
})();
const at = (i, dr) => Geo.cellId(ROW.q + i, ROW.r + (dr || 0));
function batch(id, habitat, size) {
  return M.batchFromRegion({ habitat: Object.assign({ biome: 'forest', blighted: false, overtaken: false, source: 'rolled', rolls: [11] }, habitat), terrain: { value: 2, source: 'rolled' }, size: size, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 5 }, { id: id, createdAt: AT, quantity: { value: size, source: 'rolled' } });
}
const BLIGHT = { biome: 'forest', blighted: true, overtaken: false, rolls: [1, 11] };
const SKULL = { biome: null, blighted: true, overtaken: true, rolls: [1, 1] };
function world(specs) {
  const batches = [], tiles = [];
  specs.forEach((s, bi) => { const b = batch('b' + bi, s.habitat, s.cells.length); batches.push(b); s.cells.forEach((c, ti) => tiles.push({ id: 't' + bi + '-' + ti, batchId: b.id, cell: c })); });
  return Object.assign({}, M.emptyDocument(ctx, AT), { batches, tiles });
}

/* ---------------- which cells ---------------- */

test('GM cells: every Shadowblighted tile, every current X (a walked one too), tears on overtaken tiles; overtaken wins, normal land is untouched', () => {
  let doc = world([{ habitat: BLIGHT, cells: [at(0), at(1), at(2)] }, { habitat: SKULL, cells: [at(6), at(7)] }, { habitat: {}, cells: [at(10)] }]);
  // the X of at(2) walked to open ground at(4) (PD-041): suppressed at home, added where it stands
  doc = Object.assign({}, doc, { shadowMarks: { added: [at(4)], suppressed: [at(2)] } });
  const c = Fx.cellsFromDocument(doc, M);
  assert.deepEqual(c.blighted, [at(0), at(1), at(2), at(4)].sort(M.compareCellKeys), 'the home tile stays dark because its region is Shadowblighted; the X carries its shadow to at(4)');
  assert.deepEqual(c.overtaken, [at(6), at(7)].sort(M.compareCellKeys));
  assert.ok(!c.blighted.includes(at(10)) && !c.overtaken.includes(at(10)));
  // an X that leaves open ground leaves no trail
  const moved = Object.assign({}, doc, { shadowMarks: { added: [at(5)], suppressed: [at(2)] } });
  assert.ok(!Fx.cellsFromDocument(moved, M).blighted.includes(at(4)), 'no residual corruption where an X used to be');
});

test('player cells come from the projection only: hidden tiles, hidden X marks and hidden tears are absent', () => {
  let doc = world([{ habitat: BLIGHT, cells: [at(0), at(1)] }, { habitat: SKULL, cells: [at(6), at(7)] }]);
  doc = Object.assign({}, doc, { shadowMarks: { added: [at(4)], suppressed: [at(1)] } });
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: [at(0), at(4), at(6)], revealed: true, at: AT }, ctx));
  const c = Fx.cellsFromProjection(P.buildPlayerProjection(doc, ctx));
  assert.deepEqual(c.blighted, [at(0), at(4)].sort(M.compareCellKeys), 'a revealed X on a tile and on open ground; the hidden tile at(1) is absent');
  assert.deepEqual(c.overtaken, [at(6)], 'only the revealed part of a tear');
  const none = Fx.cellsFromProjection(P.buildPlayerProjection(world([{ habitat: BLIGHT, cells: [at(0)] }, { habitat: SKULL, cells: [at(6)] }]), ctx));
  assert.deepEqual(none, { blighted: [], overtaken: [] }, 'nothing revealed, nothing drawn');
});

/* ---------------- geometry ---------------- */

test('components: touching cells of different regions form ONE area, separate ones stay separate', () => {
  const comps = Fx.componentsOf(new Set([at(0), at(1), at(2), at(8)]));
  assert.deepEqual(comps.map(c => c.length), [3, 1]);
});

test('distance field: zero outside the area\'s own cells, non-zero inside — a tear\'s cell or a hidden neighbour can never receive shadow', () => {
  const members = new Set([at(0), at(1), at(2)]);
  const f = Fx.buildField(grid, members);
  let inside = 0, outsideNonZero = 0;
  for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
    const x = f.box.x0 + (i + 0.5) * (f.box.x1 - f.box.x0) / f.w, y = f.box.y0 + (j + 0.5) * (f.box.y1 - f.box.y0) / f.h, c = grid.worldToCell(x, y);
    const v = f.data[(j * f.w + i) * 4];
    if (members.has(Geo.cellId(c.q, c.r))) { if (v > 0) inside++; } else if (v > 0) outsideNonZero++;
  }
  assert.ok(inside > 50);
  assert.equal(outsideNonZero, 0);
});

test('torn edge: inward only — every point of a tear lies inside its own cells; adjacent tears form one outline (no internal edge)', () => {
  for (const cells of [[at(3)], [at(3), at(4), at(5), at(4, -1), at(5, -1), at(3, 1)]]) {
    const set = new Set(cells), loops = Fx.tornLoops(grid, set, 2.2);
    assert.equal(loops.length, 1, 'one outline for connected cells');
    for (const l of loops) for (const p of l.torn) { const c = grid.worldToCell(p[0], p[1]); assert.ok(set.has(Geo.cellId(c.q, c.r)), 'torn point outside its cells'); }
  }
  for (let i = 0; i < 2000; i++) assert.ok(Fx.tearDepth(i * 7.3, i * 3.1) >= 0.4);
});

test('torn rim: deterministic in map coordinates, band keeps its width, tone runs taper to the tear line and stay inside the band', () => {
  const set = new Set([at(3), at(4), at(5), at(4, -1)]);
  const a = Fx.tornLoops(grid, set, 2.2), b = Fx.tornLoops(grid, set, 2.2);
  assert.deepEqual(a, b, 'the same cells tear the same way on every rebuild');
  const widths = [];
  for (const l of a) l.torn.forEach((p, i) => widths.push(Math.hypot(l.worn[i][0] - p[0], l.worn[i][1] - p[1])));
  widths.sort((x, y) => x - y);
  const med = widths[widths.length >> 1];
  assert.ok(med > 2.5 && med < 6.5 && widths[0] >= 0.3 && widths[widths.length - 1] < 16, 'band width stays in the approved range: ' + med);
  for (const l of a) {
    const d = Fx.stainPath(l, () => 1), none = Fx.stainPath(l, () => 0);
    assert.equal(d, '', 'a loop with no gap has no run');
    assert.equal(none, '');
    const half = Fx.stainPath(l, (x, y) => (x + y) % 40 < 20 ? 0 : 1);
    assert.match(half, /^M[-\d. LZM]+$/);
  }
});

test('mask and rim: the ground mask keeps islands with evenodd; the rim has no light outline, its blurs are bounded to the tear\'s own box', () => {
  const set = new Set([at(3), at(4)]), loops = Fx.tornLoops(grid, set, 2.2);
  assert.match(decodeURIComponent(Fx.holeMaskCss(4848, 3185, Fx.loopsPath(loops))), /fill-rule="evenodd" d="M0 0H4848V3185H0Z/);
  for (const mode of ['full', 'soft', 'flat']) {
    const rim = Fx.rimMarkup(loops, Fx.boundsOf(grid, [...set], 8), mode, 't');
    const all = rim.defs + rim.body;
    assert.doesNotMatch(all, /#fff|#fbf5e6|white|#7b5fd0/i, 'no white fibre, no violet leak');
    assert.doesNotMatch(all, /<animate|animation/);
    for (const f of all.match(/<filter[^>]*>/g) || []) assert.match(f, /filterUnits="userSpaceOnUse" x="[-\d]+" y="[-\d]+" width="\d+" height="\d+"/);
    if (mode === 'flat') assert.doesNotMatch(all, /<filter/, 'Low quality uses no filter at all');
  }
});

test('patches: a printed icon or label overhanging a tear is redrawn above it from the same raster; one that does not touch a tear is left alone', () => {
  const sanc = anchorsDoc.anchors.find(a => a.kind === 'sanctuary' && a.cellId && Geo.parseCellId(a.cellId));
  const near = Geo.parseCellId(sanc.cellId), rect = sanc.iconProtectionArea.rectPx;
  const touching = Geo.NEIGHBOR_DELTAS.map(d => Geo.cellId(near.q + d.dq, near.r + d.dr)).find(id => { const c = Geo.parseCellId(id); return Geo.rectIntersectsPolygon(rect, grid.cellCorners(c.q, c.r)); });
  assert.ok(touching, 'an icon box overhangs a neighbouring hex');
  const p = Fx.patchMarkup([{ ids: [touching] }], ctx.protections, grid, 'img/journey2/valloren-world.webp', 4848, 3185, 't');
  assert.ok((p.body.match(/class="j2-sbfx-patch"/g) || []).length >= 1);
  assert.match(p.body, /<image class="j2-sbfx-raster" href="img\/journey2\/valloren-world\.webp" x="0" y="0" width="4848" height="3185"/, 'the same raster at the same place: pixel-identical over intact ground');
  assert.match(p.body, /<svg x="[-\d.]+" y="[-\d.]+" width="\d+" height="\d+" viewBox="[^"]+" overflow="hidden"><rect class="j2-sbfx-paper"/, 'the raster is confined to the patch box even without its clip');
  const far = Fx.patchMarkup([{ ids: [at(12)] }], ctx.protections.filter(x => x.id === sanc.stableId), grid, 'x.webp', 4848, 3185, 't');
  assert.equal(far.body, '');
});

/* ---------------- the shader and the controller ---------------- */

test('Hybrid only: the shader bakes the approved Hybrid constants — no style uniforms, no style switch in production', () => {
  const src = Fx.fragmentSource('highp', 5, 2);
  assert.match(src, /const vec2 VA=vec2\(\.112,\.036\);/);
  assert.match(src, /const float ANISO=\.45;/);
  assert.doesNotMatch(src, /uniform (vec2|float) u(VA|VB|VC|Wind|Aniso|Warp|Tend|Intensity|Opacity)\b/);
  const mod = strip(read('js/journey2-shadowblight-fx.js'));
  assert.doesNotMatch(mod, /STYLES|setStyle|wind-swept|'fluid'|fragmentSourceV1|renderAt/i);
  assert.doesNotMatch(mod, /localStorage|sessionStorage|indexedDB|SafeStorage/, 'the FX persist nothing');
  assert.doesNotMatch(mod, /setCamera\(\s*\{|cam\.(scale|tx|ty)\s*=[^=]/, 'the FX never write the camera');
});

test('quality: a capability guess without the user agent, and a slow governor (two slow windows down, never twice in 8 s)', () => {
  assert.equal(Fx.initialQuality({ webgl: false, vw: 1440, vh: 900, dpr: 2 }), 'low');
  assert.equal(Fx.initialQuality({ webgl: true, vw: 390, vh: 844, dpr: 3, coarse: true }), 'balanced');
  assert.equal(Fx.initialQuality({ webgl: true, vw: 1440, vh: 900, dpr: 2, cores: 10, memory: 8 }), 'high');
  assert.doesNotMatch(strip(read('js/journey2-shadowblight-fx.js')), /userAgent/);
  const g = Fx.createGovernor({ level: 'high' });
  let t = 10000, out = null;
  for (let i = 0; i < 180 && !out; i++) out = g.frame(40, (t += 40));
  assert.equal(out, 'balanced');
  for (let i = 0; i < 180; i++) assert.equal(g.frame(40, (t += 20)), null, 'no second change within 8 s');
});

/* ---------------- how the view and the print use it ---------------- */

test('view: FX groups sit between the biome wash and the glyphs, pointer-transparent; the cosmos is outside the camera transform', () => {
  const view = read('js/journey2-view.js');
  assert.match(view, /<div class="j2-cosmos" data-j2-cosmos aria-hidden="true"><\/div>\s*<div class="j2-world"/, 'the cosmos is a sibling BEFORE the world, not inside it');
  assert.match(view, /<g data-j2-g="tint"><\/g><g data-j2-g="blight" pointer-events="none" aria-hidden="true"><\/g><g data-j2-g="tear" pointer-events="none" aria-hidden="true"><\/g><g data-j2-g="tiles"><\/g>/);
  assert.match(view, /<div class="j2-ground" data-j2-ground[^>]*><img class="j2-base"/, 'only the ground (paper + raster) is masked');
  assert.match(view, /defs: container\.querySelector\('\[data-j2-sbfx-defs\]'\)/, 'the FX own their <defs>: the view rebuilds ui.defs (fog layers) and would wipe the clips');
  const css = read('css/journey2.css');
  assert.match(css, /\.j2-cosmos \{[^}]*pointer-events: none/);
  assert.match(css, /\.j2-sbfx-fo \{ pointer-events: none/);
  assert.match(css, /\.j2-ground \{[^}]*pointer-events: none/);
});

test('view: X and skull glyphs are hidden ONLY on the screen while the FX draw; the print draws every glyph through the same routine', () => {
  const view = strip(read('js/journey2-view.js'));
  assert.match(view, /function overlayMarkup\(entries\) \{ const o = overlayParts\(entries, false\); return o\.under \+ o\.rest; \}/);
  assert.equal((view.match(/overlayParts\([^;]*!!sbfx\)/g) || []).length, 2, 'GM and Player Preview pass the FX state');
  assert.match(view, /class="j2-pp-gen"[^\n]*overlayMarkup\(/, 'the print pages keep overlayMarkup (glyphs on)');
  assert.match(view, /if \(!fx\.available\) \{ fx\.destroy\(\); return; \}/, 'no FX: the glyphs stay');
  assert.match(view, /if \(sbfx\) \{ const \[vw, vh\] = viewSize\(\); sbfx\.setCamera\(cam, vw, vh\); \}/, 'pushed from the camera frame');
  assert.match(view, /previewMode \? Sbfx\(\)\.cellsFromProjection\(playerProjection\) : Sbfx\(\)\.cellsFromDocument\(doc, Model\)/, 'players get the projection, never the document');
});

test('print: X and skull glyphs print, no FX layer and no Nebula ever reach a page', () => {
  const view = read('js/journey2-view.js');
  const pageFn = view.slice(view.indexOf("'<svg class=\"j2-pp-svg\""), view.indexOf("'<p class=\"j2-pp-pagelabel\">"));
  assert.ok(pageFn.length > 100);
  assert.doesNotMatch(pageFn, /sbfx|blight"|tear"|cosmos|nebula/i);
  assert.doesNotMatch(read('js/journey2-print.js') + read('js/journey2-projection.js'), /shadowblight-fx|void-nebula/i);
  assert.doesNotMatch(strip(read('js/journey2-projection.js')), /p\.shadowMarks = \[\]|o\.blightMark = false/, 'the print projection keeps the X marks');
});

test('build: the module loads after the geometry and before the view, ships in the Journey allow-list with both assets', () => {
  const html = read('index.html');
  const i = n => html.indexOf('js/' + n);
  assert.ok(i('journey2-geometry.js') < i('journey2-shadowblight-fx.js') && i('journey2-shadowblight-fx.js') < i('journey2-view.js'));
  assert.match(html, /<script src="js\/journey2-shadowblight-fx\.js" data-cache-version="ui"><\/script>/);
  const guard = read('scripts/check-journey2-build.js');
  for (const f of ['js/journey2-shadowblight-fx.js', 'img/journey2/void-nebula.webp', 'img/journey2/legend-shadowblight.webp']) { assert.ok(guard.includes("'" + f + "'"), f); assert.ok(fs.existsSync(path.join(ROOT, f)), f); }
});

test('documentation: PD-072 exists and the print decision names the X marks again', () => {
  const pd = read('docs/product-decisions.md');
  assert.match(pd, /## PD-072/);
  assert.doesNotMatch(pd, /Shadowblight X's never print \(amended 2026-10-16/, 'the print no longer claims X marks never print');
  assert.match(read('docs/architecture.md'), /Shadowblight FX \(PD-072\)/);
});
