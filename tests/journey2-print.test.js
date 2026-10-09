'use strict';
/* Journey 2 Phase F (PD-028): the two-page black-and-white player map print. Pure — no browser. Covers the print model's safety (fog is a
   data filter: nothing hidden, no tint / Environment / Soul Echo / sanctuary data / ids), player-safe boundaries, sanctuary names, the
   world -> page transforms and seam clipping, and source guards for the print DOM, the `@media print` rules, localization and wiring.
   The real print path (print media, one window.print(), PDF page count, camera independence, EN/RU) is scripts/journey2/lib/print-checks.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../js/journey2-model.js');
const G = require('../js/journey2-geometry.js');
const P = require('../js/journey2-projection.js');
const PR = require('../js/journey2-print.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
const template = JSON.parse(read('data/journey2/map-template.json'));
const anchorsDoc = JSON.parse(read('data/journey2/map-anchors.json'));
const i18n = JSON.parse(read('data/i18n.json'));
const ctx = M.createContext(template, anchorsDoc);
const grid = ctx.grid;
const AT = '2026-10-07T10:00:00.000Z';
const must = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.doc; };
const SEAM = template.composition.seam.worldX;

const region = (biome, over) => Object.assign({ habitat: { biome, blighted: false, overtaken: false, source: 'rolled', rolls: [6] }, terrain: { value: 3, source: 'rolled' }, size: 6, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 12 }, over || {});
function free(x, y) { const c = grid.worldToCell(x, y); for (let i = 0; i < 60; i++) if (ctx.placeable(c.q + i, c.r)) return { q: c.q + i, r: c.r }; throw new Error('no cell'); }
function row(x, y, len) { for (let dy = 0; dy < 400; dy += 10) { const c = grid.worldToCell(x, y + dy); for (let off = -len; off <= 0; off++) { let ok = true; for (let i = 0; i < len; i++) if (!ctx.placeable(c.q + off + i, c.r)) { ok = false; break; } if (ok) return Array.from({ length: len }, (_, i) => G.cellId(c.q + off + i, c.r)); } } throw new Error('no row'); }
function neighbours(cells, keep) { return Array.from(new Set(cells.flatMap(c => { const p = G.parseCellId(c); return G.NEIGHBOR_DELTAS.map(d => G.cellId(p.q + d.dq, p.r + d.dr)); }))).filter(c => !cells.includes(c) && !(keep || []).includes(c) && M.isFoggableCell(ctx, c)); }

/* a seam region (4 tiles revealed, 2 hidden), a far hidden region, a blighted revealed tile, an Environment, Echoes, sanctuaries with names */
function fixture() {
  let doc = M.emptyDocument(ctx, AT);
  const seamRow = row(SEAM, 1300, 6);
  const bSeam = M.newId('b'), bFar = M.newId('b'), bBlight = M.newId('b');
  doc = must(M.apply(doc, { type: 'createBatch', batch: M.batchFromRegion(region('forest'), { id: bSeam, createdAt: AT }), at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'place', batchId: bSeam, tiles: seamRow.map((cell, i) => ({ id: 'seam' + i, cell })), at: AT }, ctx));
  const far = row(700, 2100, 4);
  doc = must(M.apply(doc, { type: 'createBatch', batch: M.batchFromRegion(region('mountain', { size: 4 }), { id: bFar, createdAt: AT }), at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'place', batchId: bFar, tiles: far.map((cell, i) => ({ id: 'far' + i, cell })), allowDetached: true, at: AT }, ctx));
  const blightCell = row(4100, 1700, 2);
  doc = must(M.apply(doc, { type: 'createBatch', batch: M.batchFromRegion(region('aquatic', { size: 2, habitat: { biome: 'aquatic', blighted: true, overtaken: false, source: 'rolled', rolls: [6] } }), { id: bBlight, createdAt: AT }), at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'place', batchId: bBlight, tiles: blightCell.map((cell, i) => ({ id: 'bl' + i, cell })), allowDetached: true, at: AT }, ctx));
  const firstEast = seamRow.findIndex(c => { const p = G.parseCellId(c); return grid.cellCenter(p.q, p.r)[0] >= SEAM; });
  const lo = Math.max(1, Math.min(firstEast - 2, 1));
  const revealedTiles = seamRow.slice(lo, lo + 4).concat([blightCell[0]]);
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: revealedTiles.concat(neighbours(revealedTiles, seamRow.concat(far, blightCell))), revealed: true, at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'setTileEnvironment', tileId: 'seam1', environmentId: 'time-loop', at: AT }, ctx));
  const sw = ctx.sanctuaries.filter(s => s.x < SEAM - 300), se = ctx.sanctuaries.filter(s => s.x > SEAM + 300);
  const ids = [sw[3].id, se[3].id, se[4].id];
  const entry = (anchorId, name) => ({ anchorId, name, trade: 9, quirk: 3, crisis: 9, drive: 5, politics: { rolls: [1] }, size: 4, population: 1 });
  doc = must(M.apply(doc, { type: 'setSanctuaries', entries: [entry(ids[0], 'Westhaven'), entry(ids[1], 'Eastmere'), entry(ids[2], 'Secretton')], at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'setSoulEchoes', anchorIds: ctx.sanctuaries.slice(0, 9).map(s => s.id), at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'setSanctuaryNameRevealed', anchorId: ids[0], revealed: true, at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'setSanctuaryNameRevealed', anchorId: ids[1], revealed: true, at: AT }, ctx));
  return { doc, seamRow, revealedTiles, far, ids };
}
const FX = fixture();
const model = PR.buildPrintModel(FX.doc, ctx, template);
const both = fn => model.pages.flatMap(fn);

/* ---------------- pages and transforms ---------------- */

test('exactly two pages, the two original panels of the template, west first', () => {
  const pages = PR.pagesFromTemplate(template);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages.map(p => p.id), ['v1', 'v2']);
  assert.deepEqual(pages.map(p => p.panelId), ['west', 'east']);
  assert.deepEqual(pages.map(p => p.rect), template.composition.panels.map(p => p.worldRectPx));
  assert.equal(pages[0].rect[0] + pages[0].rect[2], pages[1].rect[0], 'they meet at the seam');
  assert.equal(pages[0].rect[0] + pages[0].rect[2], SEAM);
  assert.equal(pages[1].rect[0] + pages[1].rect[2], template.worldSizePx[0], 'together they cover the whole map');
  for (const p of pages) { assert.deepEqual(p.viewBox, [0, 0, p.rect[2], p.rect[3]]); assert.equal(p.source.path, template.assembledAsset.path); assert.equal(p.rect[3], template.worldSizePx[1]); }
  assert.ok(pages[0].scaleMmPerPx * pages[0].rect[2] <= 190 + 1e-9 && pages[0].scaleMmPerPx * pages[0].rect[3] <= 277 + 1e-9, 'fits the printable A4 area');
});

test('invalid page geometry fails loudly (no stretched full-map fallback)', () => {
  const bad = f => { const t = JSON.parse(JSON.stringify(template)); f(t); return () => PR.pagesFromTemplate(t); };
  assert.throws(bad(t => { t.composition.panels.pop(); }), /exactly two/);
  assert.throws(bad(t => { t.composition.panels[1].worldRectPx[0] += 10; }), /continue|cover/);
  assert.throws(bad(t => { t.composition.panels[1].worldRectPx[2] -= 10; }), /cover/);
  assert.throws(bad(t => { t.composition.panels[0].worldRectPx[3] -= 1; }), /height/);
  assert.throws(bad(t => { delete t.assembledAsset; }), /asset/);
});

test('world points map to the right page; the seam belongs to the east page', () => {
  const pages = PR.pagesFromTemplate(template);
  const marrogate = anchorsDoc.anchors.find(a => a.stableId === 'mk-056').worldPixelAnchor, horizon = anchorsDoc.anchors.find(a => a.stableId === 'mk-002').worldPixelAnchor;
  assert.equal(PR.pageOfPoint(marrogate, pages).id, 'v1');
  assert.equal(PR.pageOfPoint(horizon, pages).id, 'v2');
  assert.equal(PR.pageOfPoint([SEAM - 0.001, 10], pages).id, 'v1');
  assert.equal(PR.pageOfPoint([SEAM, 10], pages).id, 'v2');
  assert.equal(PR.pageOfPoint([template.worldSizePx[0], 10], pages).id, 'v2');
  assert.equal(PR.pageOfPoint([-1, 10], pages), null);
  assert.deepEqual(PR.worldToPage([100, 50], pages[0]), [100, 50]);
  assert.deepEqual(PR.worldToPage([SEAM + 100, 50], pages[1]), [100, 50]);
  assert.deepEqual(PR.worldToPage(horizon, pages[1]), [horizon[0] - SEAM, horizon[1]]);
  assert.deepEqual(PR.pageToWorld(PR.worldToPage([3000, 777], pages[1]), pages[1]), [3000, 777]);
});

test('rectangles and segments crossing the seam are clipped to each page, never moved', () => {
  const [a, b] = PR.pagesFromTemplate(template);
  assert.deepEqual(PR.clipRect([SEAM - 30, 100, 60, 40], a), [SEAM - 30, 100, 30, 40]);
  assert.deepEqual(PR.clipRect([SEAM - 30, 100, 60, 40], b), [SEAM, 100, 30, 40]);
  assert.equal(PR.clipRect([10, 10, 20, 20], b), null, 'outside the page: nothing');
  assert.equal(PR.clipRect([SEAM - 10, 10, 10, 20], b), null, 'touching only: nothing');
  const segA = PR.clipSegment([SEAM - 40, 10], [SEAM + 40, 10], a), segB = PR.clipSegment([SEAM - 40, 10], [SEAM + 40, 10], b);
  assert.deepEqual(segA, [[SEAM - 40, 10], [SEAM, 10]]);
  assert.deepEqual(segB, [[SEAM, 10], [SEAM + 40, 10]]);
  assert.equal(PR.clipSegment([SEAM + 10, 10], [SEAM + 40, 10], a), null);
});

test('the model is deterministic and has no input from camera, zoom, UI or preferences', () => {
  assert.equal(JSON.stringify(PR.buildPrintModel(FX.doc, ctx, template)), JSON.stringify(model));
  assert.equal(PR.buildPrintModel.length, 3, '(doc, ctx, template) — no options, no UI state');
  const src = strip(read('js/journey2-print.js'));
  assert.ok(!/document\.|window\.|localStorage|biomeTint|showBiome|camera|scale\s*:|innerWidth|getBoundingClientRect/.test(src.replace(/scaleMmPerPx/g, '')), 'reads nothing from the browser');
});

/* ---------------- safety: hidden / revealed ---------------- */

test('hidden cells leave no trace: only revealed tiles are in the model', () => {
  const revealed = new Set(FX.revealedTiles);
  const cells = both(p => p.overlays.map(o => G.cellId(o.q, o.r)));
  assert.ok(cells.length >= FX.revealedTiles.length);
  for (const c of cells) assert.ok(revealed.has(c), c + ' is not revealed');
  for (const c of FX.far.concat(FX.seamRow.filter(c => !revealed.has(c)))) assert.ok(!cells.includes(c), 'hidden tile ' + c);
  assert.equal(model.summary.wildernessHexes, FX.revealedTiles.length);
  const json = JSON.stringify(model);
  for (const t of FX.doc.tiles) assert.ok(!json.includes('"' + t.id + '"') && !json.includes(t.batchId), 'no tile/batch id');
});

test('the model carries no tint, fog, colour, Environment, Soul Echo, region id or revealed-cell list', () => {
  const json = JSON.stringify(model);
  assert.ok(!/tint|fog|hatch|pattern|color|colour|fill|opacity|#[0-9a-f]{3,6}\b/i.test(json), 'no colour or fog vocabulary');
  assert.ok(!/environment|time-loop|echo|soul|encounter|rumor|trade|quirk|crisis|drive|politic|population|batch|region|revealedCells/i.test(json));
  assert.equal(model.printMode, 'bw');
  for (const o of both(p => p.overlays)) assert.deepEqual(Object.keys(o).sort(), ['blightMark', 'dots', 'q', 'r', 'symbolId']);
});

test('revealed Habitat, Terrain and Shadowblight are included; the blight mark stays a monochrome flag', () => {
  const ov = both(p => p.overlays);
  assert.ok(ov.every(o => typeof o.symbolId === 'string' && o.dots === 3));
  assert.ok(ov.some(o => o.symbolId === 'forest') && ov.some(o => o.blightMark === true) && ov.some(o => o.blightMark === false));
});

test('Biome colors and the screen fog preference cannot change the model', () => {
  const withTint = P.buildPlayerProjection(FX.doc, ctx);
  assert.ok(withTint.overlays.some(o => o.tint), 'the screen projection does carry tint');
  assert.ok(!JSON.stringify(P.buildPrintProjection(FX.doc, ctx)).includes('"tint"'));
  assert.deepEqual(PR.buildPrintModel(FX.doc, ctx, template), model);
});

test('an empty reveal set prints the plain map: two pages, nothing generated', () => {
  const empty = PR.buildPrintModel(M.emptyDocument(ctx, AT), ctx, template);
  assert.equal(empty.pages.length, 2);
  for (const p of empty.pages) assert.deepEqual([p.overlays.length, p.segments.length, p.labels.length], [0, 0, 0]);
  assert.deepEqual(empty.summary, { wildernessHexes: 0, sanctuaryNames: 0, party: false });
  const none = M.apply(FX.doc, { type: 'setSanctuaryNameRevealed', anchorId: FX.ids[0], revealed: false, at: AT }, ctx);
  assert.equal(PR.buildPrintModel(must(none), ctx, template).summary.sanctuaryNames, 1);
});

/* ---------------- boundaries ---------------- */

test('boundary edges are player-safe: only between revealed cells, no edge toward a hidden neighbour', () => {
  const revealed = M.getRevealedCellSet(FX.doc);
  const segs = both(p => p.segments);
  assert.ok(segs.length > 0);
  const occ = new Map(FX.doc.tiles.map(t => [t.cell, FX.doc.batches.find(b => b.id === t.batchId).id]));
  for (const s of segs) {
    const c = G.parseCellId(s.cell), d = G.NEIGHBOR_DELTAS[s.dir], other = G.cellId(c.q + d.dq, c.r + d.dr);
    assert.ok(revealed.has(s.cell), 'edge of a hidden cell ' + s.cell);
    assert.ok(occ.has(s.cell), 'edge from a cell with no tile');
    if (M.isFoggableCell(ctx, other)) assert.ok(revealed.has(other), 'edge toward the hidden neighbour ' + other);
    assert.ok(s.kind === 'outer' || s.kind === 'divider');
  }
  const hidden = FX.seamRow.filter(c => !revealed.has(c));
  assert.ok(hidden.length > 0 && segs.every(s => !hidden.includes(s.cell)));
});

test('a revealed tile next to a revealed same-region tile has no shared edge; next to a different region it has one divider', () => {
  const rows = row(2000, 600, 3);
  let doc = M.emptyDocument(ctx, AT);
  const b1 = M.newId('b'), b2 = M.newId('b');
  doc = must(M.apply(doc, { type: 'createBatch', batch: M.batchFromRegion(region('forest', { size: 2 }), { id: b1, createdAt: AT }), at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'place', batchId: b1, tiles: [{ id: 'a', cell: rows[0] }, { id: 'b', cell: rows[1] }], at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'createBatch', batch: M.batchFromRegion(region('aquatic', { size: 1 }), { id: b2, createdAt: AT }), at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'place', batchId: b2, tiles: [{ id: 'c', cell: rows[2] }], at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: rows.concat(neighbours(rows)), revealed: true, at: AT }, ctx));
  const m = PR.buildPrintModel(doc, ctx, template);
  const segs = m.pages.flatMap(p => p.segments);
  const same = segs.filter(s => (s.cell === rows[0] && G.NEIGHBOR_DELTAS[s.dir].dq === 1 && G.NEIGHBOR_DELTAS[s.dir].dr === 0) || (s.cell === rows[1] && G.NEIGHBOR_DELTAS[s.dir].dq === -1 && G.NEIGHBOR_DELTAS[s.dir].dr === 0));
  assert.equal(same.length, 0, 'no thick edge inside a region');
  const dividers = segs.filter(s => s.kind === 'divider');
  assert.equal(dividers.length, 1, 'exactly one divider between the two regions');
  assert.ok(segs.some(s => s.kind === 'outer'));
});

/* ---------------- sanctuary names ---------------- */

test('only revealed sanctuary names, only { anchorId, name }, each on the page holding its icon', () => {
  const [w, e, secret] = FX.ids;
  const [v1, v2] = model.pages;
  assert.deepEqual(v1.labels.map(l => l.anchorId), [w]);
  assert.deepEqual(v2.labels.map(l => l.anchorId), [e]);
  assert.ok(!JSON.stringify(model).includes('Secretton') && !JSON.stringify(model).includes(secret));
  assert.equal(model.summary.sanctuaryNames, 2);
  const lab = P.buildPrintProjection(FX.doc, ctx).sanctuaryLabels;
  for (const l of lab) assert.deepEqual(Object.keys(l).sort(), ['anchorId', 'name']);
  for (const page of model.pages) for (const l of page.labels) {
    assert.ok(l.x >= page.rect[0] && l.x + l.w <= page.rect[0] + page.rect[2], 'inside its own page');
    assert.ok(l.y >= 0 && l.y + l.h <= page.rect[3]);
  }
});

test('a name next to the seam is clamped inside the page of its icon, never split', () => {
  const near = ctx.sanctuaries.slice().sort((a, b) => Math.abs(a.x - SEAM) - Math.abs(b.x - SEAM))[0];
  let doc = M.emptyDocument(ctx, AT);
  doc = must(M.apply(doc, { type: 'setSanctuaries', entries: [{ anchorId: near.id, name: 'Seamwatch Crossing Of Tides', trade: 9, quirk: 3, crisis: 9, drive: 5, politics: { rolls: [1] }, size: 4, population: 1 }], at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'setSanctuaryNameRevealed', anchorId: near.id, revealed: true, at: AT }, ctx));
  const m = PR.buildPrintModel(doc, ctx, template);
  const holder = near.x < SEAM ? m.pages[0] : m.pages[1], other = holder === m.pages[0] ? m.pages[1] : m.pages[0];
  assert.equal(holder.labels.length, 1);
  assert.equal(other.labels.length, 0);
  const l = holder.labels[0];
  assert.ok(l.x >= holder.rect[0] && l.x + l.w <= holder.rect[0] + holder.rect[2]);
});

test('seam-crossing generated content appears on both pages (clipped by each page), once per page', () => {
  const [a, b] = model.pages;
  const westHex = FX.revealedTiles.filter(c => { const p = G.parseCellId(c); return grid.cellCenter(p.q, p.r)[0] < SEAM; });
  assert.ok(westHex.length > 0 && a.overlays.length > 0 && b.overlays.length > 0, 'the seam region has revealed hexes on both sides');
  for (const page of model.pages) assert.equal(new Set(page.overlays.map(o => o.q + ',' + o.r)).size, page.overlays.length, 'no duplicates within a page');
  assert.ok(a.segments.length > 0 && b.segments.length > 0);
});

/* ---------------- source guards: DOM, CSS, wiring, i18n ---------------- */

test('print DOM: two .j2-print-page sections in one .j2-print-root, drawn from the model; no screenshots or camera', () => {
  const view = strip(read('js/journey2-view.js'));
  const start = view.indexOf('function printPageMarkup'), end = view.indexOf('function bindSurface');
  assert.ok(start > 0 && end > start);
  const code = view.slice(start, end);
  assert.match(code, /class="j2-print-page"/);
  assert.match(code, /class="j2-print-root"/);
  assert.match(code, /Print\.buildPrintModel\(doc, data\.ctx, data\.template\)/);
  assert.ok(!/html2canvas|toDataURL|toBlob|drawImage|cam\.|cam,|fogVeil|fog-veil|Tint\.|showBiome|tintKey/i.test(code), 'no raster capture, camera, fog or tint in the print path');
  assert.ok(!/dispatch\(|persist\(|historyCommit|store\./.test(code), 'read-only: no command, history or save');
  assert.equal((code.match(/window\.print\(\)/g) || []).length, 1, 'one print call');
  assert.match(code, /document\.fonts/);
  assert.match(code, /decode/);
});

test('print CSS: A4 portrait named page, page break after page 1 only, everything else hidden, no fog or colour', () => {
  const css = strip(read('css/journey2.css'));
  assert.match(css, /@page j2player\s*\{[^}]*size:\s*A4 portrait/);
  const printBlock = css.slice(css.indexOf('@page j2player'));
  assert.match(printBlock, /body\.j2-printpreview-mode > \*:not\(\.j2-printpreview\)\s*\{[^}]*display:\s*none !important/);
  assert.match(printBlock, /\.j2-print-page\s*\{[^}]*break-after:\s*page/);
  assert.match(printBlock, /\.j2-print-page:last-child\s*\{[^}]*break-after:\s*auto/);
  assert.match(printBlock, /\.j2-pp-pagelabel\s*\{\s*display:\s*none/);
  assert.match(printBlock, /\.j2-printpreview > :not\(\.j2-print-root\)\s*\{[^}]*display:\s*none/);
  const pp = printBlock.split('\n').filter(l => /^\.j2-pp-svg/.test(l)).join('\n');
  assert.ok(!/rgba|#(?!000|fff)[0-9a-f]{3,6}|var\(--hope|--teal|--fear|gold|hatch|url\(/i.test(pp), 'ink is black/white only');
  assert.ok(!/j2-fog|biome|echo/i.test(printBlock.split('@media print')[0].split('.j2-print-root')[1] || ''));
  assert.ok(!/height:\s*297mm[^}]*break-after:\s*page[\s\S]*print[\s\S]*height:\s*297mm/.test(printBlock), 'sheet is 296mm in print so rounding never adds a third page');
  assert.match(printBlock, /@media print[\s\S]*\.j2-print-page\s*\{[^}]*height:\s*296mm/);
});

test('the legacy diagnostic print proof no longer shares .j2-print-page and keeps its own landscape page box', () => {
  const css = read('css/journey2.css');
  assert.match(css, /#j2-print-root \{ display: none; page: j2proof; \}/);
  assert.match(css, /@page j2proof \{ size: A4 landscape/);
  assert.match(css, /\.j2-proof-page \{/);
  assert.ok(!/section class="j2-print-page">/.test(read('js/journey2-view.js').replace(/printPageMarkup[\s\S]*/, '')), 'proof markup uses j2-proof-page');
});

test('Print Preview is transient: nothing in it is stored, and the only entry is from Player Preview', () => {
  const view = read('js/journey2-view.js');
  assert.ok(!/printOpen|openPrintPreview|pp\./.test(read('js/journey2-store.js')), 'the store never learns about it');
  assert.match(view, /function openPrintPreview\(\) \{\s*if \(!previewMode \|\| printOpen/);
  assert.match(view, /if \(printOpen\) \{ closePrintPreview\(\{ focus: true \}\); e\.preventDefault\(\); return; \}/, 'Escape closes it first');
  assert.match(view, /closePrintPreview\(\{ quiet: true \}\);\n/, 'leaving Player Preview / disposing closes it');
  assert.match(view, /ui\.root\.inert = true/);
});

test('script wiring: the print module loads after the projection and before the view, and ships in the build list', () => {
  const html = read('index.html');
  const at = f => html.indexOf('js/' + f);
  assert.ok(at('journey2-projection.js') > 0 && at('journey2-print.js') > at('journey2-projection.js') && at('journey2-view.js') > at('journey2-print.js'));
  assert.match(html, /<script src="js\/journey2-print\.js" data-cache-version="ui"><\/script>/);
  assert.match(read('scripts/check-journey2-build.js'), /'js\/journey2-print\.js'/);
});

test('every new string exists in English and Russian, with the plural pair and interpolation intact', () => {
  const keys = Object.keys(i18n.en || i18n).filter(k => k.startsWith('journey2_pp_'));
  const dict = i18n.en ? i18n : null;
  const en = (i18n.en || {}), ru = (i18n.ru || {});
  assert.ok(keys.length >= 20, 'found ' + keys.length);
  for (const k of keys) { assert.ok(typeof en[k] === 'string' && en[k] && typeof ru[k] === 'string' && ru[k], k); assert.deepEqual((en[k].match(/\{\w+\}/g) || []).sort(), (ru[k].match(/\{\w+\}/g) || []).sort(), 'placeholders of ' + k); }
  for (const base of ['journey2_pp_hexes', 'journey2_pp_names']) assert.ok(en[base + '_n'] && en[base + '_one'] && ru[base + '_n'] && ru[base + '_one']);
  assert.ok(dict);
  for (const required of ['Print player map', 'Player Map Print Preview', 'Page {n} of {total}', 'Print', 'Back to Player Preview', 'Preparing print preview', 'Map pages are ready', 'Unable to prepare map for printing', 'Retry', 'Two-page player map', 'Print contains only player-visible information.', 'Unexplored areas remain blank on the Old Valloren map.']) assert.ok(Object.values(en).includes(required), required);
});
