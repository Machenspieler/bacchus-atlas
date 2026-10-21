'use strict';
/* Journey 2: destroyed sanctuaries (PD-070). Pure — no browser. Covers the document's optional `destroyedSanctuaries` field, the
   `setDestroyedSanctuaries` command, its two-way exclusion with Soul Echoes, both planners, the projection / print / share-link rules (players see
   a destroyed sanctuary only on a revealed hex; the print keeps it; the count never leaks), localization and the source guards.
   The real animation, the A4 print look and the phone page are checked by hand (docs/manual-qa.md "Journey 2 map editor"). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../js/journey2-model.js');
const P = require('../js/journey2-projection.js');
const PR = require('../js/journey2-print.js');
const S = require('../js/journey2-share.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
const template = JSON.parse(read('data/journey2/map-template.json'));
const anchorsDoc = JSON.parse(read('data/journey2/map-anchors.json'));
const i18n = JSON.parse(read('data/i18n.json'));
const ctx = M.createContext(template, anchorsDoc);
const AT = '2026-10-16T10:00:00.000Z';
const must = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.doc; };
const view = read('js/journey2-view.js');
const css = read('css/journey2.css');

function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const SANCT = anchorsDoc.anchors.filter(a => a.kind === 'sanctuary').map(a => a.stableId);
const DEST = anchorsDoc.anchors.filter(a => a.kind === 'destination').map(a => a.stableId);
const cellOf = id => ctx.sanctuaries.find(s => s.id === id).cellId;
const ruin = (doc, ids) => must(M.apply(doc, { type: 'setDestroyedSanctuaries', anchorIds: ids, at: AT }, ctx));

/* ---------------- document ---------------- */

test('a new document has no destroyed sanctuaries; a document without the field loads unchanged (schemaVersion stays 1)', () => {
  const doc = M.emptyDocument(ctx, AT);
  assert.deepEqual(doc.destroyedSanctuaries, { anchorIds: [] });
  assert.equal(M.SCHEMA_VERSION, 1);
  assert.equal(M.MAX_DESTROYED_SANCTUARIES, 5);
  const old = JSON.parse(JSON.stringify(doc));
  delete old.destroyedSanctuaries;
  const r = M.validateDocument(old, ctx);
  assert.equal(r.ok, true);
  assert.deepEqual(r.doc.destroyedSanctuaries, { anchorIds: [] });
  assert.equal(M.isEmptyDocument(doc), true);
  assert.equal(M.isEmptyDocument(ruin(doc, [SANCT[3]])), false, 'a map with a ruin is not "empty"');
});

test('validation: sorts, rejects more than five, duplicates, non-sanctuaries, unknown fields, malformed values and a sanctuary that also holds an Echo', () => {
  const base = M.emptyDocument(ctx, AT);
  const withRuins = v => Object.assign(JSON.parse(JSON.stringify(base)), { destroyedSanctuaries: v });
  const ok = M.validateDocument(withRuins({ anchorIds: ['mk-012', 'mk-003'] }), ctx);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.doc.destroyedSanctuaries.anchorIds, ['mk-003', 'mk-012']);
  for (const bad of [
    { anchorIds: SANCT.slice(0, 6) },                   // the hard limit is five
    { anchorIds: ['mk-003', 'mk-003'] },                // duplicate
    { anchorIds: [DEST[0]] },                           // a destination is not a sanctuary
    { anchorIds: ['mk-999'] }, { anchorIds: [7] }, { anchorIds: 'mk-003' }, { anchorIds: ['mk-003'], extra: 1 }, [], 'x',
  ]) assert.equal(M.validateDocument(withRuins(bad), ctx).ok, false, JSON.stringify(bad));
  const both = JSON.parse(JSON.stringify(base));
  both.soulEchoes = { anchorIds: ['mk-003'], collectedAnchorIds: [] };
  both.destroyedSanctuaries = { anchorIds: ['mk-003'] };
  const r = M.validateDocument(both, ctx);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /also holds a Soul Echo/.test(e)), JSON.stringify(r.errors));
});

test('a backup round-trips the destroyed sanctuaries', () => {
  const doc = ruin(M.emptyDocument(ctx, AT), SANCT.slice(10, 15));
  const back = M.parseBackupText(M.serializeBackup(doc), ctx);
  assert.equal(back.ok, true);
  assert.deepEqual(back.doc.destroyedSanctuaries, doc.destroyedSanctuaries);
});

/* ---------------- command and the two-way exclusion ---------------- */

test('setDestroyedSanctuaries: replaces the set, sorts it, is a no-op for the same set, and refuses bad input whole', () => {
  let doc = M.emptyDocument(ctx, AT);
  doc = ruin(doc, ['mk-020', 'mk-004', 'mk-011']);
  assert.deepEqual(doc.destroyedSanctuaries.anchorIds, ['mk-004', 'mk-011', 'mk-020']);
  const same = M.apply(doc, { type: 'setDestroyedSanctuaries', anchorIds: ['mk-011', 'mk-004', 'mk-020'], at: AT }, ctx);
  assert.equal(same.ok, true); assert.equal(same.noop, true); assert.equal(same.doc, doc);
  assert.deepEqual(ruin(doc, []).destroyedSanctuaries.anchorIds, []);
  const refuse = (ids, code) => { const r = M.apply(doc, { type: 'setDestroyedSanctuaries', anchorIds: ids, at: AT }, ctx); assert.equal(r.ok, false); assert.equal(r.error.code, code, JSON.stringify(ids)); };
  refuse(SANCT.slice(0, 6), 'too-many-destroyed');
  refuse(['mk-001', 'mk-001'], 'bad-destroyed');
  refuse([DEST[0]], 'bad-destroyed');
  refuse('mk-001', 'bad-destroyed');
  assert.equal(M.apply(doc, { type: 'setDestroyedSanctuaries', anchorIds: ['mk-001'] }, ctx).ok, true, 'a missing timestamp is not the command\'s problem');
});

test('a sanctuary with a Soul Echo can never be destroyed, and a destroyed one never receives an Echo (the model refuses both ways)', () => {
  let doc = must(M.apply(M.emptyDocument(ctx, AT), { type: 'setSoulEchoes', anchorIds: SANCT.slice(0, 9), at: AT }, ctx));
  const a = M.apply(doc, { type: 'setDestroyedSanctuaries', anchorIds: [SANCT[0]], at: AT }, ctx);
  assert.equal(a.ok, false); assert.equal(a.error.code, 'destroyed-with-echo');
  doc = ruin(doc, SANCT.slice(20, 25));
  const b = M.apply(doc, { type: 'setSoulEchoes', anchorIds: [SANCT[20]], at: AT }, ctx);
  assert.equal(b.ok, false); assert.equal(b.error.code, 'echo-on-destroyed');
  assert.equal(M.apply(doc, { type: 'setSoulEchoes', anchorIds: [], at: AT }, ctx).ok, true, 'removing the Echoes is always fine');
  assert.deepEqual(doc.soulEchoes.anchorIds, SANCT.slice(0, 9).sort(), 'the refused command changed nothing');
});

test('Undo / Redo: one command is one history entry and Redo never re-rolls', () => {
  const h = M.createHistory();
  const before = M.emptyDocument(ctx, AT);
  const plan = M.planDestroyedSanctuaries(ctx, seeded(5), new Set());
  const after = ruin(before, plan.anchorIds);
  M.historyCommit(h, before, after, 'ruinsPlace');
  assert.equal(h.undo.length, 1);
  const u = M.historyUndo(h);
  assert.deepEqual(u.before.destroyedSanctuaries.anchorIds, []);
  const r = M.historyRedo(h);
  assert.deepEqual(r.after.destroyedSanctuaries.anchorIds, plan.anchorIds);
});

/* ---------------- planners ---------------- */

test('planner: five distinct sanctuaries, never an excluded one, spread out, deterministic for a seed', () => {
  const echoes = new Set(SANCT.slice(0, 9));
  for (let s = 1; s <= 40; s++) {
    const p = M.planDestroyedSanctuaries(ctx, seeded(s), echoes);
    assert.equal(p.anchorIds.length, 5);
    assert.equal(new Set(p.anchorIds).size, 5);
    for (const id of p.anchorIds) { assert.ok(ctx.sanctuaryIds.has(id)); assert.ok(!echoes.has(id), 'picked an Echo sanctuary'); }
    assert.deepEqual(p.anchorIds, p.anchorIds.slice().sort());
  }
  assert.deepEqual(M.planDestroyedSanctuaries(ctx, seeded(42), echoes).anchorIds, M.planDestroyedSanctuaries(ctx, seeded(42), echoes).anchorIds);
  const seen = new Set();
  for (let s = 1; s <= 30; s++) seen.add(M.planDestroyedSanctuaries(ctx, seeded(s), echoes).anchorIds.join());
  assert.ok(seen.size > 20, 'not the same five every time: ' + seen.size);
  let satisfied = 0;
  for (let s = 1; s <= 40; s++) if (M.planDestroyedSanctuaries(ctx, seeded(s), echoes).satisfied) satisfied++;
  assert.ok(satisfied >= 36, 'almost every roll satisfies the spread rule: ' + satisfied);
});

test('planner: fewer than five left plans what is left; none or no anchors plans nothing instead of throwing', () => {
  assert.equal(M.planDestroyedSanctuaries(ctx, seeded(1), new Set(SANCT.slice(0, 53))).anchorIds.length, 3);
  assert.deepEqual(M.planDestroyedSanctuaries(ctx, seeded(1), new Set(SANCT)).anchorIds, []);
  assert.deepEqual(M.planDestroyedSanctuaries(M.createContext(template, null), seeded(1)).anchorIds, []);
});

test('the Echo planner skips destroyed sanctuaries and still places nine, spread west to east', () => {
  const ruined = new Set(SANCT.slice(30, 35));
  for (let s = 1; s <= 30; s++) {
    const p = M.planSoulEchoes(ctx, seeded(s), ruined);
    assert.equal(p.anchorIds.length, 9);
    for (const id of p.anchorIds) assert.ok(!ruined.has(id), 'an Echo on a destroyed sanctuary');
  }
  assert.deepEqual(M.planSoulEchoes(ctx, seeded(3)).anchorIds, M.planSoulEchoes(ctx, seeded(3), new Set()).anchorIds, 'no exclusion changes nothing');
});

/* ---------------- players: projection, print, link ---------------- */

test('projection: only a destroyed sanctuary on a REVEALED hex is emitted — fog wins, the party light counts, how many exist is never said', () => {
  const ids = SANCT.slice(0, 5);
  let doc = ruin(M.emptyDocument(ctx, AT), ids);
  assert.deepEqual(P.buildPlayerProjection(doc, ctx).destroyedSanctuaries, [], 'all under fog: nothing');
  assert.deepEqual(P.buildPlayerProjection(doc, null).destroyedSanctuaries, [], 'without a context nothing counts as revealed');
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: [cellOf(ids[0]), cellOf(ids[3]), cellOf(SANCT[20])], revealed: true, at: AT }, ctx));
  assert.deepEqual(P.buildPlayerProjection(doc, ctx).destroyedSanctuaries, [ids[0], ids[3]].sort(), 'the revealed destroyed ones only (a revealed intact sanctuary is not one)');
  const proj = JSON.stringify(P.buildPlayerProjection(doc, ctx));
  assert.ok(!/"count"|"total"/.test(proj));
  const lit = must(M.apply(doc, { type: 'setParty', cell: cellOf(ids[4]), shown: true, at: AT }, ctx));
  assert.ok(P.buildPlayerProjection(lit, ctx).destroyedSanctuaries.includes(ids[4]), 'the party standing there lights the hex and shows the ruin');
});

test('projection: the print KEEPS the destroyed sanctuaries (unlike the Echoes), still only on revealed hexes', () => {
  const ids = SANCT.slice(0, 5);
  let doc = ruin(M.emptyDocument(ctx, AT), ids);
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: [cellOf(ids[1])], revealed: true, at: AT }, ctx));
  assert.deepEqual(P.buildPrintProjection(doc, ctx).destroyedSanctuaries, [ids[1]]);
  assert.deepEqual(P.buildPrintProjection(doc, ctx).collectedEchoes, [], 'nothing collected, nothing printed');
});

test('print: a Collected Echo on a revealed hex is printed (PD-077), an Available or fogged one never', () => {
  const id = SANCT[0], other = SANCT[1];
  let doc = M.emptyDocument(ctx, AT);
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: [cellOf(id)], revealed: true, at: AT }, ctx));
  doc = Object.assign({}, doc, { soulEchoes: { anchorIds: [id, other], collectedAnchorIds: [id, other] } });
  assert.deepEqual(P.buildPrintProjection(doc, ctx).collectedEchoes, [id], 'the fogged one is absent');
  const model = PR.buildPrintModel(doc, ctx, template);
  const printed = model.pages.flatMap(p => p.spent.map(e => e.id));
  assert.ok(printed.length >= 1 && printed.every(x => x === id));
  doc = Object.assign({}, doc, { soulEchoes: { anchorIds: [id], collectedAnchorIds: [] } });
  assert.deepEqual(PR.buildPrintModel(doc, ctx, template).pages.flatMap(p => p.spent), [], 'Available stays secret');
});

test('print model: a revealed ruin is on the page(s) its glyph touches, an unrevealed one is absent, nothing else is carried', () => {
  const ids = SANCT.slice(0, 5);
  let doc = ruin(M.emptyDocument(ctx, AT), ids);
  const bare = PR.buildPrintModel(doc, ctx, template);
  assert.deepEqual(bare.pages.map(p => p.ruins), [[], [], [], [], [], [], [], []]);
  assert.equal(bare.summary.destroyedSanctuaries, 0);
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: ids.map(cellOf), revealed: true, at: AT }, ctx));
  const model = PR.buildPrintModel(doc, ctx, template);
  assert.equal(model.summary.destroyedSanctuaries, 5);
  const onPages = new Map();
  for (const p of model.pages) for (const r of p.ruins) { assert.deepEqual(Object.keys(r).sort(), ['glyph', 'id', 'x', 'y']); onPages.set(r.id, (onPages.get(r.id) || 0) + 1); }
  assert.deepEqual(Array.from(onPages.keys()).sort(), ids.slice().sort(), 'every revealed ruin is printed');
  for (const id of ids) {
    const s = ctx.sanctuaries.find(x => x.id === id), home = PR.pageOfPoint([s.rect[0] + s.rect[2] / 2, s.rect[1] + s.rect[3] / 2], PR.pagesFromTemplate(template));
    assert.ok(model.pages.find(p => p.id === home.id).ruins.some(r => r.id === id), 'on the page that holds its icon');
  }
  assert.equal(JSON.stringify(PR.buildPrintModel(doc, ctx, template)), JSON.stringify(model), 'deterministic');
});

test('share link (format 5): the revealed destroyed sanctuaries round-trip; hidden ones and the Echo-free count are not in the snapshot', async () => {
  const ids = SANCT.slice(0, 5);
  let doc = ruin(M.emptyDocument(ctx, AT), ids);
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: [cellOf(ids[0]), cellOf(ids[2])], revealed: true, at: AT }, ctx));
  const snap = S.buildSnapshot(doc, ctx);
  assert.deepEqual(snap.destroyed, [ids[0], ids[2]].sort());
  assert.deepEqual(S.decodeSnapshot(S.encodeSnapshot(snap, ctx), ctx).snap.destroyed, snap.destroyed);
  const opened = await S.openLinkText(await S.createLinkText(doc, ctx), ctx);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.doc.destroyedSanctuaries.anchorIds, snap.destroyed);
  assert.deepEqual(P.buildPlayerProjection(opened.doc, ctx).destroyedSanctuaries, P.buildPlayerProjection(doc, ctx).destroyedSanctuaries, 'the player page draws what Player Preview draws');
  const empty = await S.openLinkText(await S.createLinkText(M.emptyDocument(ctx, AT), ctx), ctx);
  assert.deepEqual(empty.doc.destroyedSanctuaries.anchorIds, []);
});

test('share link: a version 4 link still opens (no ruins), and format 5 refuses a malformed ruin list', async () => {
  const doc = ruin(M.emptyDocument(ctx, AT), SANCT.slice(0, 5));
  const snap = S.buildSnapshot(doc, ctx);
  const legacy = S.encodeSnapshot(snap, ctx, 4);
  assert.equal(S.encodeSnapshot(snap, ctx, 5).length, legacy.length + 1, 'format 5 adds exactly the count byte for an empty list');
  const r = S.decodeSnapshot(legacy, ctx, 4);
  assert.equal(r.ok, true); assert.deepEqual(r.snap.destroyed, []);
  assert.equal(S.decodeSnapshot(legacy, ctx, 5).ok, false, 'a version 4 payload is not a version 5 one');
  const bytes = i => Uint8Array.from([...legacy, ...i]);
  assert.equal(S.decodeSnapshot(bytes([6, 0, 1, 2, 3, 4, 5]), ctx, 5).code, 'invalid', 'more than five');
  assert.equal(S.decodeSnapshot(bytes([2, 7, 7]), ctx, 5).code, 'invalid', 'a duplicate');
  assert.equal(S.decodeSnapshot(bytes([1, 99]), ctx, 5).code, 'invalid', 'not a sanctuary');
  assert.equal(S.decodeSnapshot(bytes([1]), ctx, 5).code, 'truncated');
  assert.equal(S.decodeSnapshot(bytes([0, 0]), ctx, 5).code, 'trailing-bytes');
});

/* ---------------- view source guards ---------------- */

const fn = (from, to) => view.slice(view.indexOf('function ' + from), view.indexOf('function ' + to, view.indexOf('function ' + from) + 1));

test('view: the ruins layer sits above the fog, is pointer-transparent and below selection; the print page draws them before the labels', () => {
  const svg = view.slice(view.indexOf('<defs data-j2-defs>'), view.indexOf('</svg>', view.indexOf('<defs data-j2-defs>')));
  const at = k => svg.indexOf('data-j2-g="' + k + '"');
  assert.ok(at('fog') < at('ruins') && at('echoes') < at('ruins') && at('ruins') < at('select') && at('select') < at('preview'));
  assert.match(svg, /data-j2-g="ruins" pointer-events="none" aria-hidden="true"/);
  const print = fn('printPageMarkup', 'printPreviewMarkup');
  assert.ok(print.indexOf('j2-pp-ruins') > 0 && print.indexOf('j2-pp-ruins') < print.indexOf('j2-pp-labels'));
  assert.match(print, /ruinMarkup\(r, true\)/);
});

test('view: Player Preview and the player page read ONLY the projection; the GM view reads the document and redraws only when the set changed', () => {
  const body = strip(fn('renderRuins', 'updateRuinUi'));
  assert.match(body, /previewMode \? \(\(playerProjection && playerProjection\.destroyedSanctuaries\) \|\| \[\]\) : doc\.destroyedSanctuaries\.anchorIds/);
  assert.match(body, /ruinDrawn === doc\.destroyedSanctuaries/);
  assert.match(body, /ui\.legendRuin\.hidden = !ids\.length/, 'the legend line exists only while a ruin can be seen');
  assert.doesNotMatch(body.slice(0, body.indexOf('ruinDrawn ===')), /doc\.soulEchoes|Model\./, 'the players\' branch never consults the GM document');
  const at = view.indexOf('function renderTiles'), tiles = view.slice(at, at + 2400);
  assert.match(tiles, /renderEchoes\(\);\s*renderRuins\(\);/);
});

test('view: placing is one planned command that avoids the Echoes; replacing and removing ask first, with Cancel focused', () => {
  const place = fn('placeDestroyedSanctuaries', 'confirmClearDestroyedSanctuaries');
  assert.match(place, /Model\.planDestroyedSanctuaries\(data\.ctx, undefined, new Set\(doc\.soulEchoes\.anchorIds\)\)/);
  assert.match(place, /type: 'setDestroyedSanctuaries', anchorIds: plan\.anchorIds/);
  assert.match(place, /openDialog/);
  assert.match(place, /autofocus: true/);
  const from = view.indexOf('function confirmClearDestroyedSanctuaries');
  assert.match(view.slice(from, from + 1300), /btn-danger[\s\S]*type: 'setDestroyedSanctuaries', anchorIds: \[\]/);
});

test('view: the Campaign menu has a destroyed-sanctuaries group (place + remove), both GM-only and wired', () => {
  const menu = view.slice(view.indexOf('data-j2-menu="campaign"'), view.indexOf('</aside>', view.indexOf('data-j2-menu="campaign"')));
  assert.match(menu, /data-t="journey2_ruin_group"/);
  assert.match(menu, /data-j2-ruin-place[\s\S]*data-j2-ruin-clear/);
  assert.match(view, /b\.hasAttribute\('data-j2-ruin-place'\)\) placeDestroyedSanctuaries\(\)/);
  assert.match(view, /b\.hasAttribute\('data-j2-ruin-clear'\)\) confirmClearDestroyedSanctuaries\(\)/);
});

test('view: every screen ruin is the canvas FX; the still black-and-white drawing is the print (and only the no-canvas fallback on screen)', () => {
  const body = strip(fn('renderRuins', 'updateRuinUi'));
  assert.match(body, /h \+= ruinFxMarkup\(s\)/, 'all destroyed sanctuaries the viewer may see, not a prototype subset');
  assert.doesNotMatch(view, /RUIN_V2_COUNT|ruin2Markup/);
  assert.match(body, /Journey2RuinFx\.attach\(ui\.g\.ruins\)/);
  assert.match(body, /previewMode && key === ruinShownKey\) return/, 'Player Preview does not rebuild the canvases while the visible set is unchanged');
  const fx = strip(fn('ruinFxMarkup', 'ruinMarkup'));
  assert.match(fx, /scale\(' \+ RUIN_SCALE \+ '\)">' \+ Fx\.markup\(s\.id\)/);
  assert.match(fx, /getContext\) return ruinMarkup\(s, false\)/);
  const m = strip(fn('ruinMarkup', 'renderTiles'));
  assert.match(m, /print \? RUIN_SCALE_PRINT : RUIN_SCALE/);
  assert.match(m, /class="j2-ruin is-print"/);
  assert.doesNotMatch(m, /j2-ruin-glow|j2-ruin-puff|j2-ruin-ember|animation-delay/, 'no animated SVG parts are left');
  // the printed strands drift up and to the right and fit the print box
  const strands = view.match(/const RUIN_STRANDS = \[([^\]]*)\]/)[1].match(/'[^']*'/g).map(x => x.slice(1, -1));
  const nums = strands[0].match(/-?\d+(\.\d+)?/g).map(Number), end = [nums[nums.length - 2], nums[nums.length - 1]];
  assert.ok(end[0] > 60 && end[1] < -60, 'the long strand ends up and to the right');
  const k = Number(view.match(/const RUIN_SCALE_PRINT = ([\d.]+);/)[1]);
  assert.ok(end[0] * k <= PR_BOX()[2] - PR_BOX()[0] && -end[1] * k <= PR_BOX()[1] && 16 * k <= PR_BOX()[3] - PR_BOX()[1], 'the print box contains the printed glyph');
  assert.doesNotMatch(css.slice(css.indexOf('.j2-ruin.is-print .j2-ruin-still {')), /url\(#/, 'no gradient in the print rules');
});
function PR_BOX() { const m = read('js/journey2-print.js').match(/const RUIN_BOX = \[(\d+), (\d+), (\d+), (\d+)\]/); return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]; }

test('css: no CSS animation is left on the ruin glyph; the canvases are pointer-transparent; the print rules are black and white', () => {
  assert.doesNotMatch(css, /j2-ruin-(glow|puff|ember|still-puff|smoke)|@keyframes j2-ruin/, 'the old animated SVG look is gone');
  assert.doesNotMatch(css.slice(css.indexOf('/* Destroyed sanctuary (PD-070)'), css.indexOf('/* committed terrain')), /animation/);
  assert.match(css, /\.j2-r2-fo \{[^}]*pointer-events: none/);
  assert.match(css, /\.j2-ruin\.is-print \.j2-ruin-flame-out \{ fill: #fff; stroke: #000;/);
  assert.match(view, /RUIN_DEFS =\s*'<linearGradient id="j2-ruin-flame"/, 'the legend swatch keeps its flame gradient');
});

/* ---------------- localization ---------------- */

test('every new string exists in English and Russian with the same placeholders, and the count key has its singular variant', () => {
  const en = i18n.en, ru = i18n.ru;
  const keys = Object.keys(en).filter(k => /^journey2_(ruin_|menu_ruin|live_ruins|legend_ruin|sanc_ruin)/.test(k));
  assert.ok(keys.length >= 14, 'found ' + keys.length);
  for (const k of keys) {
    assert.ok(typeof ru[k] === 'string' && ru[k].trim(), 'missing in Russian: ' + k);
    assert.deepEqual((en[k].match(/\{\w+\}/g) || []).sort(), (ru[k].match(/\{\w+\}/g) || []).sort(), 'placeholders differ: ' + k);
  }
  for (const k of ['journey2_ruin_group', 'journey2_menu_ruin_place', 'journey2_legend_ruin', 'journey2_live_ruins_placed_one']) assert.ok(en[k] && ru[k], k);
  assert.equal(ru.journey2_ruin_group, 'Уничтоженные убежища');
  for (const k of keys.filter(x => en[x].includes('{n}') && !x.endsWith('_one'))) if (k === 'journey2_live_ruins_placed') assert.ok(en[k + '_one'] && ru[k + '_one']);
});
