'use strict';
/* Journey 2: player-visible sanctuary names (PD-027). Pure — no browser. Covers the optional
   `playerVisibility.revealedSanctuaryNameAnchorIds` field and its cross-field validation, the setSanctuaryNameRevealed command and
   its interaction with reroll / delete / replace-all and Undo/Redo, the strict `sanctuaryLabels` projection (print included), the
   deterministic world-space label layout and the source guards for the Player Preview layer, the overlay control and localization.
   Pointer / dialog behaviour is verified in the browser scripts (scripts/journey2/lib/sanctuary-name-checks.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../js/journey2-model.js');
const P = require('../js/journey2-projection.js');
const G = require('../js/journey2-geometry.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const template = JSON.parse(read('data/journey2/map-template.json'));
const anchorsDoc = JSON.parse(read('data/journey2/map-anchors.json'));
const i18n = JSON.parse(read('data/i18n.json'));
const ctx = M.createContext(template, anchorsDoc);
const AT = '2026-10-07T10:00:00.000Z', AT2 = '2026-10-07T11:00:00.000Z', AT3 = '2026-10-07T12:00:00.000Z';
const must = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.doc; };
const view = read('js/journey2-view.js');
const css = read('css/journey2.css');
const SANCT = anchorsDoc.anchors.filter(a => a.kind === 'sanctuary').map(a => a.stableId);
const DEST = anchorsDoc.anchors.filter(a => a.kind === 'destination').map(a => a.stableId);

const entry = (anchorId, over) => Object.assign({
  anchorId, name: 'Pikebun', trade: 9, quirk: 3, crisis: 9, drive: 5, politics: { rolls: [1] }, size: 4, population: 1,
}, over || {});
const withSanctuaries = (ids, nameOf) => must(M.apply(M.emptyDocument(ctx, AT), { type: 'setSanctuaries', entries: ids.map((id, i) => entry(id, { name: nameOf ? nameOf(i) : 'Town' + i })), at: AT }, ctx));
const reveal = (doc, id, revealed, at) => M.apply(doc, { type: 'setSanctuaryNameRevealed', anchorId: id, revealed, at: at || AT2 }, ctx);
const names = doc => doc.playerVisibility.revealedSanctuaryNameAnchorIds;

/* ---------------- document ---------------- */

test('a new document hides every name; an old document without the key loads with none visible', () => {
  const doc = M.emptyDocument(ctx, AT);
  assert.deepEqual(names(doc), []);
  const raw = JSON.parse(M.serializeBackup(doc));
  delete raw.playerVisibility.revealedSanctuaryNameAnchorIds;
  const r = M.validateDocument(raw, ctx);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(names(r.doc), []);
  delete raw.playerVisibility;
  assert.deepEqual(names(M.validateDocument(raw, ctx).doc), []);
  assert.equal(M.SCHEMA_VERSION, 1, 'no migration: the schema version stays');
});

test('validation: only generated printed sanctuaries, no duplicates, no destinations, no unknown fields', () => {
  const doc = withSanctuaries(SANCT.slice(0, 3));
  const base = JSON.parse(M.serializeBackup(doc));
  const tryIds = ids => { const j = JSON.parse(JSON.stringify(base)); j.playerVisibility.revealedSanctuaryNameAnchorIds = ids; return M.validateDocument(j, ctx); };
  assert.equal(tryIds([SANCT[1], SANCT[0]]).ok, true);
  assert.deepEqual(names(tryIds([SANCT[1], SANCT[0]]).doc), [SANCT[0], SANCT[1]], 'canonical sorted order');
  for (const bad of [[DEST[0]], [DEST[1]], ['mk-999'], [SANCT[10]], [SANCT[0], SANCT[0]], [5], ['']]) assert.equal(tryIds(bad).ok, false, JSON.stringify(bad));
  assert.equal(tryIds('mk-001').ok, false);
  const j = JSON.parse(JSON.stringify(base)); j.playerVisibility.extra = 1;
  assert.equal(M.validateDocument(j, ctx).ok, false, 'unknown playerVisibility field');
  const orphan = JSON.parse(JSON.stringify(base)); orphan.sanctuaries = { entries: [] }; orphan.playerVisibility.revealedSanctuaryNameAnchorIds = [SANCT[0]];
  assert.equal(M.validateDocument(orphan, ctx).ok, false, 'a visible name without a generated sanctuary');
});

test('helpers: derived, cached, non-mutating; a missing field is empty', () => {
  const doc = must(reveal(withSanctuaries(SANCT.slice(0, 2)), SANCT[0], true));
  const before = JSON.stringify(doc);
  assert.equal(M.isSanctuaryNameRevealed(doc, SANCT[0]), true);
  assert.equal(M.isSanctuaryNameRevealed(doc, SANCT[1]), false);
  assert.equal(M.getRevealedSanctuaryNameSet(doc), M.getRevealedSanctuaryNameSet(doc), 'the Set is cached per list');
  assert.equal(JSON.stringify(doc), before);
  assert.equal(M.getRevealedSanctuaryNameSet({ playerVisibility: { revealedCells: [] } }).size, 0);
  assert.equal(M.getRevealedSanctuaryNameSet({}).size, 0);
});

/* ---------------- command ---------------- */

test('setSanctuaryNameRevealed: reveal adds one id, hide removes it, updatedAt moves', () => {
  const doc0 = withSanctuaries(SANCT.slice(0, 3));
  const r1 = reveal(doc0, SANCT[2], true, AT2);
  assert.deepEqual(names(r1.doc), [SANCT[2]]);
  assert.equal(r1.doc.updatedAt, AT2);
  const r2 = must(reveal(r1.doc, SANCT[0], true, AT3));
  assert.deepEqual(names(r2), [SANCT[0], SANCT[2]]);
  const r3 = must(reveal(r2, SANCT[2], false, AT3));
  assert.deepEqual(names(r3), [SANCT[0]]);
  assert.deepEqual(r3.sanctuaries, doc0.sanctuaries, 'the generated sanctuaries are untouched');
  assert.deepEqual(r3.playerVisibility.revealedCells, doc0.playerVisibility.revealedCells, 'fog is untouched');
  assert.deepEqual(r3.soulEchoes, doc0.soulEchoes);
});

test('setSanctuaryNameRevealed: already in that state is a pure no-op (same object, same updatedAt)', () => {
  const doc = withSanctuaries(SANCT.slice(0, 2));
  const hide = reveal(doc, SANCT[0], false, AT3);
  assert.equal(hide.ok, true); assert.equal(hide.noop, true); assert.equal(hide.doc, doc); assert.equal(hide.doc.updatedAt, doc.updatedAt);
  const shown = must(reveal(doc, SANCT[0], true));
  const again = reveal(shown, SANCT[0], true, AT3);
  assert.equal(again.noop, true); assert.equal(again.doc, shown); assert.equal(again.doc.updatedAt, AT2);
});

test('setSanctuaryNameRevealed: refuses bad anchors, destinations, ungenerated sanctuaries and non-boolean flags', () => {
  const doc = withSanctuaries(SANCT.slice(0, 2));
  assert.equal(reveal(doc, 'mk-999', true).ok, false);
  assert.equal(reveal(doc, DEST[0], true).ok, false);
  assert.equal(reveal(doc, DEST[1], true).ok, false);
  assert.equal(reveal(doc, SANCT[5], true).error.code, 'no-sanctuary');
  assert.equal(reveal(doc, undefined, true).ok, false);
  for (const flag of ['true', 1, null, undefined]) assert.equal(M.apply(doc, { type: 'setSanctuaryNameRevealed', anchorId: SANCT[0], revealed: flag, at: AT2 }, ctx).ok, false);
});

test('fog commands never touch the revealed names (and vice versa)', () => {
  let doc = must(reveal(withSanctuaries(SANCT.slice(0, 2)), SANCT[0], true));
  const cell = [...ctx.sanctuaryCells][0];
  const free = (() => { for (let q = 20; q < 30; q++) for (let r = 0; r < 10; r++) if (M.isFoggableCell(ctx, q + ',' + r)) return q + ',' + r; })();
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: [free], revealed: true, at: AT3 }, ctx));
  assert.deepEqual(names(doc), [SANCT[0]]);
  assert.deepEqual(doc.playerVisibility.revealedCells, [free]);
  doc = must(reveal(doc, SANCT[0], false));
  assert.deepEqual(doc.playerVisibility.revealedCells, [free]);
  assert.ok(cell);
});

test('Soul Echo commands never reveal or hide a name', () => {
  let doc = must(reveal(withSanctuaries(SANCT.slice(0, 12)), SANCT[3], true));
  doc = must(M.apply(doc, { type: 'setSoulEchoes', anchorIds: SANCT.slice(0, 9), at: AT3 }, ctx));
  assert.deepEqual(names(doc), [SANCT[3]]);
  doc = must(M.apply(doc, { type: 'setSoulEchoes', anchorIds: [], at: AT3 }, ctx));
  assert.deepEqual(names(doc), [SANCT[3]]);
});

/* ---------------- interaction with the sanctuary commands ---------------- */

test('reroll keeps the visibility: a visible sanctuary stays visible with the new name, a hidden one stays hidden', () => {
  let doc = must(reveal(withSanctuaries(SANCT.slice(0, 2)), SANCT[0], true));
  doc = must(M.apply(doc, { type: 'setSanctuary', entry: entry(SANCT[0], { name: 'Newname' }), at: AT3 }, ctx));
  doc = must(M.apply(doc, { type: 'setSanctuary', entry: entry(SANCT[1], { name: 'Other' }), at: AT3 }, ctx));
  assert.deepEqual(names(doc), [SANCT[0]]);
  assert.equal(P.buildPlayerProjection(doc, ctx).sanctuaryLabels[0].name, 'Newname');
  assert.equal(P.buildPlayerProjection(doc, ctx).sanctuaryLabels.length, 1);
});

test('delete removes the entry and its visibility in ONE command; Undo restores both', () => {
  const doc0 = must(reveal(withSanctuaries(SANCT.slice(0, 3)), SANCT[1], true));
  const h = M.createHistory();
  const r = M.apply(doc0, { type: 'deleteSanctuary', anchorId: SANCT[1], at: AT3 }, ctx);
  const doc1 = must(r);
  M.historyCommit(h, doc0, doc1, 'sanctuaryDelete');
  assert.deepEqual(names(doc1), []);
  assert.ok(!doc1.sanctuaries.entries.some(e => e.anchorId === SANCT[1]));
  assert.equal(h.undo.length, 1);
  assert.equal(M.validateDocument(JSON.parse(M.serializeBackup(doc1)), ctx).ok, true, 'no orphan visibility is left behind');
  assert.deepEqual(names(M.historyUndo(h).before), [SANCT[1]]);
  assert.deepEqual(names(M.historyRedo(h).after), []);
  // deleting a hidden sanctuary keeps another one visible
  const doc2 = must(M.apply(must(reveal(withSanctuaries(SANCT.slice(0, 3)), SANCT[0], true)), { type: 'deleteSanctuary', anchorId: SANCT[2], at: AT3 }, ctx));
  assert.deepEqual(names(doc2), [SANCT[0]]);
});

test('replace-all keeps visibility only for anchors that survive, reveals nothing new and clears on an empty set', () => {
  let doc = withSanctuaries(SANCT.slice(0, 4));
  doc = must(reveal(doc, SANCT[0], true)); doc = must(reveal(doc, SANCT[3], true));
  const next = must(M.apply(doc, { type: 'setSanctuaries', entries: SANCT.slice(0, 3).concat(SANCT.slice(10, 12)).map((id, i) => entry(id, { name: 'Fresh' + i })), at: AT3 }, ctx));
  assert.deepEqual(names(next), [SANCT[0]], 'SANCT[3] vanished, new anchors stay hidden');
  assert.equal(P.buildPlayerProjection(next, ctx).sanctuaryLabels[0].name, 'Fresh0', 'the revealed anchor now shows the new generated name');
  const all = must(M.apply(doc, { type: 'setSanctuaries', entries: M.planSanctuaries(ctx, () => ({ name: 'X' + Math.random(), trade: 1, quirk: 1, crisis: 1, drive: 1, politics: { rolls: [2] }, size: 1, population: 1 })), at: AT3 }, ctx));
  assert.deepEqual(names(all), [SANCT[0], SANCT[3]], 'all 56 exist again; the previously revealed anchors stay revealed, the rest hidden');
  const none = must(M.apply(doc, { type: 'setSanctuaries', entries: [], at: AT3 }, ctx));
  assert.deepEqual(names(none), []);
});

test('Undo / Redo: reveal, hide, reroll of a visible sanctuary and replace-all each restore the exact state', () => {
  const h = M.createHistory();
  const step = (doc, cmd, label) => { const n = must(M.apply(doc, Object.assign({ at: AT3 }, cmd), ctx)); M.historyCommit(h, doc, n, label); return n; };
  const d0 = withSanctuaries(SANCT.slice(0, 3));
  const d1 = step(d0, { type: 'setSanctuaryNameRevealed', anchorId: SANCT[0], revealed: true }, 'reveal');
  const d2 = step(d1, { type: 'setSanctuary', entry: entry(SANCT[0], { name: 'Rerolled' }) }, 'reroll');
  const d3 = step(d2, { type: 'setSanctuaries', entries: [entry(SANCT[0], { name: 'Everything' }), entry(SANCT[1], { name: 'New' })] }, 'replace');
  const d4 = step(d3, { type: 'setSanctuaryNameRevealed', anchorId: SANCT[0], revealed: false }, 'hide');
  assert.equal(h.undo.length, 4);
  assert.equal(M.historyUndo(h).before, d3); assert.deepEqual(names(d3), [SANCT[0]]);
  assert.equal(M.historyUndo(h).before, d2);
  assert.equal(M.historyUndo(h).before, d1);
  assert.equal(M.historyUndo(h).before, d0); assert.deepEqual(names(d0), []);
  assert.equal(M.historyRedo(h).after, d1);
  assert.equal(M.historyRedo(h).after, d2);
  assert.equal(M.historyRedo(h).after, d3);
  assert.equal(M.historyRedo(h).after, d4); assert.deepEqual(names(d4), []);
});

test('export -> import preserves the visible names byte for byte; malformed or orphaned ids fail the import', () => {
  const doc = must(reveal(must(reveal(withSanctuaries(SANCT.slice(0, 5)), SANCT[4], true)), SANCT[1], true));
  const text = M.serializeBackup(doc);
  const back = M.parseBackupText(text, ctx);
  assert.equal(back.ok, true, JSON.stringify(back));
  assert.deepEqual(names(back.doc), [SANCT[1], SANCT[4]]);
  assert.equal(M.serializeBackup(back.doc), text);
  const bad = JSON.parse(text); bad.playerVisibility.revealedSanctuaryNameAnchorIds = [SANCT[1], 42];
  assert.equal(M.validateDocument(bad, ctx).ok, false);
  const orphan = JSON.parse(text); orphan.sanctuaries.entries = orphan.sanctuaries.entries.filter(e => e.anchorId !== SANCT[4]);
  assert.equal(M.validateDocument(orphan, ctx).ok, false);
  assert.equal(M.isEmptyDocument(M.emptyDocument(ctx, AT)), true);
  assert.equal(M.isEmptyDocument(doc), false);
});

/* ---------------- projection ---------------- */

test('projection: a hidden generated sanctuary emits no label at all', () => {
  const doc = withSanctuaries(SANCT.slice(0, 5));
  assert.deepEqual(P.buildPlayerProjection(doc, ctx).sanctuaryLabels, []);
  assert.ok(!JSON.stringify(P.buildPlayerProjection(doc, ctx)).includes('Town'));
});

test('projection: a revealed sanctuary emits exactly { anchorId, name } — nothing else — sorted, regardless of fog', () => {
  let doc = withSanctuaries(SANCT.slice(0, 6), i => 'Name' + i);
  doc = must(reveal(doc, SANCT[4], true)); doc = must(reveal(doc, SANCT[1], true));
  doc = must(M.apply(doc, { type: 'setSoulEchoes', anchorIds: SANCT.slice(0, 9), at: AT3 }, ctx));
  const p = P.buildPlayerProjection(doc, ctx);
  assert.deepEqual(p.sanctuaryLabels, [{ anchorId: SANCT[1], name: 'Name1' }, { anchorId: SANCT[4], name: 'Name4' }]);
  for (const l of p.sanctuaryLabels) assert.deepEqual(Object.keys(l).sort(), ['anchorId', 'name']);
  assert.deepEqual(p.revealedCells, [], 'the surrounding cell fog is irrelevant');
  const text = JSON.stringify(p).toLowerCase();
  for (const leak of ['trade', 'quirk', 'crisis', 'drive', 'politic', 'population', 'echo', 'soul', 'environment', 'size"']) assert.ok(!text.includes(leak), 'leaked ' + leak);
  assert.ok(!text.includes('name0') && !text.includes('name2'), 'only the revealed names');
});

test('projection: revealing a cell alone never emits a name; hiding the name removes the label', () => {
  let doc = withSanctuaries(SANCT.slice(0, 2));
  const cell = anchorsDoc.anchors.find(a => a.stableId === SANCT[0]).cellId;
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: [cell], revealed: true, at: AT3 }, ctx));
  assert.deepEqual(P.buildPlayerProjection(doc, ctx).sanctuaryLabels, []);
  doc = must(reveal(doc, SANCT[0], true));
  assert.equal(P.buildPlayerProjection(doc, ctx).sanctuaryLabels.length, 1);
  doc = must(reveal(doc, SANCT[0], false));
  assert.deepEqual(P.buildPlayerProjection(doc, ctx).sanctuaryLabels, []);
});

test('projection: an empty generated name emits no visual label; destinations are never labelled', () => {
  const doc = must(reveal(withSanctuaries(SANCT.slice(0, 2), i => (i === 0 ? '' : 'Real')), SANCT[0], true));
  assert.deepEqual(P.buildPlayerProjection(doc, ctx).sanctuaryLabels, []);
  const all = P.buildPlayerProjection(must(reveal(doc, SANCT[1], true)), ctx).sanctuaryLabels;
  assert.ok(all.every(l => !DEST.includes(l.anchorId)));
});

test('print projection: carries the revealed labels, no biome tint, no GM data', () => {
  const doc = must(reveal(withSanctuaries(SANCT.slice(0, 3)), SANCT[2], true));
  const p = P.buildPrintProjection(doc, ctx);
  assert.equal(p.printMode, 'bw');
  assert.deepEqual(p.sanctuaryLabels, [{ anchorId: SANCT[2], name: 'Town2' }]);
  assert.ok(p.overlays.every(o => !('tint' in o)));
  assert.deepEqual(P.buildPrintProjection(withSanctuaries(SANCT.slice(0, 3)), ctx).sanctuaryLabels, []);
  assert.deepEqual(P.buildPrintProjection(doc, ctx, { color: true }).sanctuaryLabels, p.sanctuaryLabels, 'colour mode changes no label');
});

/* ---------------- label layout ---------------- */

const anchorsForLayout = ctx.sanctuaries.map(s => ({ id: s.id, rect: s.rect }));
const layout = (ids, nameOf, opts) => G.layoutSanctuaryLabels(ids.map((id, i) => ({ anchorId: id, name: nameOf ? nameOf(i) : 'Pikebun' })), anchorsForLayout, Object.assign({ icons: ctx.iconRects, world: ctx.worldSize }, opts || {}));
const overlaps = (a, b) => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
const box = l => ({ x: l.x, y: l.y, w: l.w, h: l.h });
const rectBox = r => ({ x: r[0], y: r[1], w: r[2], h: r[3] });

test('layout: below the icon is preferred, centred, and never covers any printed icon', () => {
  const out = layout(SANCT);
  assert.equal(out.length, SANCT.length);
  const below = out.filter(l => l.placement === 'below');
  assert.ok(below.length > SANCT.length / 2, 'most labels sit below their icon');
  for (const l of out) {
    const s = ctx.sanctuaries.find(x => x.id === l.anchorId);
    assert.ok(!overlaps(box(l), rectBox(s.rect)), 'covers its own icon: ' + l.anchorId);
    if (l.placement === 'below') assert.ok(l.y >= s.rect[1] + s.rect[3], 'below the protection rectangle');
  }
  const first = out.find(l => l.placement === 'below'), s0 = ctx.sanctuaries.find(x => x.id === first.anchorId);
  assert.ok(Math.abs(first.cx - (s0.rect[0] + s0.rect[2] / 2)) < 30, 'centred under its icon unless clamped');
});

test('layout: stays inside the map, avoids Marrogate / Horizon and other labels, is deterministic', () => {
  const [W, H] = ctx.worldSize;
  const out = layout(SANCT, i => 'Longnamedtown ' + i);
  for (const l of out) assert.ok(l.x >= 0 && l.y >= 0 && l.x + l.w <= W && l.y + l.h <= H, 'inside the map: ' + l.anchorId);
  const dest = anchorsDoc.anchors.filter(a => a.kind === 'destination').map(a => rectBox(a.iconProtectionArea.rectPx));
  let hitsDest = 0;
  for (const l of out) for (const d of dest) if (overlaps(box(l), d)) hitsDest++;
  assert.equal(hitsDest, 0, 'no label covers Marrogate or Horizon');
  assert.deepEqual(layout(SANCT, i => 'Longnamedtown ' + i), out, 'same input, same layout');
  assert.deepEqual(layout(SANCT.slice().reverse(), i => 'Longnamedtown ' + (SANCT.length - 1 - i)).map(l => l.anchorId), out.map(l => l.anchorId), 'order independent');
});

test('layout: falls back near the map edge and keeps two close labels apart', () => {
  const edge = ctx.sanctuaries.slice().sort((a, b) => b.y - a.y)[0];
  const lone = G.layoutSanctuaryLabels([{ anchorId: edge.id, name: 'Edgeville' }], anchorsForLayout, { icons: ctx.iconRects, world: [4848, edge.rect[1] + edge.rect[3] + 8] })[0];
  assert.notEqual(lone.placement, 'below', 'no room below: another candidate is used');
  assert.ok(!overlaps(box(lone), rectBox(edge.rect)));
  const fake = [{ id: 'a', rect: [100, 100, 50, 50] }, { id: 'b', rect: [112, 110, 50, 50] }];
  const two = G.layoutSanctuaryLabels([{ anchorId: 'a', name: 'Alpha' }, { anchorId: 'b', name: 'Bravo' }], fake, { icons: fake, world: [1000, 1000] });
  assert.ok(!overlaps(box(two[0]), box(two[1])), 'two nearby labels do not stack');
});

test('layout: names wrap to at most two lines at word boundaries, an unfittable one gets one ellipsis', () => {
  assert.deepEqual(G.wrapLabelName('Pikebun'), ['Pikebun']);
  assert.deepEqual(G.wrapLabelName('Saint Mellowhaven of the Reeds'), ['Saint Mellowhaven', 'of the Reeds']);
  const long = G.wrapLabelName('Supercalifragilisticexpialidocious Village of Great Wonders and Many Many Words');
  assert.equal(long.length, 2);
  assert.ok(long.join(' ').includes('…'));
  assert.deepEqual(G.wrapLabelName('   '), []);
  const out = G.layoutSanctuaryLabels([{ anchorId: SANCT[0], name: 'Saint Mellowhaven of the Reeds' }], anchorsForLayout, { world: ctx.worldSize });
  assert.equal(out[0].lines.length, 2);
  assert.equal(out[0].name, 'Saint Mellowhaven of the Reeds', 'the full name is kept for assistive output');
  assert.deepEqual(G.layoutSanctuaryLabels([{ anchorId: SANCT[0], name: '' }], anchorsForLayout, {}), []);
  assert.deepEqual(G.layoutSanctuaryLabels([{ anchorId: 'nope', name: 'X' }], anchorsForLayout, {}), []);
});

test('layout: reads no viewport, camera or DOM state', () => {
  const src = read('js/journey2-geometry.js');
  const body = src.slice(src.indexOf('function layoutSanctuaryLabels'), src.indexOf('return {', src.indexOf('function layoutSanctuaryLabels')));
  assert.doesNotMatch(body, /\b(cam|camera|scale|window|document|getBoundingClientRect|innerWidth)\b/);
});

/* ---------------- view source guards ---------------- */

const fn = (from, to) => view.slice(view.indexOf('function ' + from), view.indexOf('function ' + to, view.indexOf('function ' + from) + 1));

test('view: the label layer is above the fog, pointer-transparent and aria-hidden; the GM view empties it', () => {
  const svg = view.slice(view.indexOf('<defs data-j2-defs>'), view.indexOf('</svg>', view.indexOf('<defs data-j2-defs>')));
  const at = k => svg.indexOf('data-j2-g="' + k + '"');
  assert.ok(at('fog') < at('sanctlabels') && at('sanctlabels') < at('select'));
  assert.match(svg, /data-j2-g="sanctlabels" pointer-events="none" aria-hidden="true"/);
  const body = fn('renderSanctuaryLabels', 'renderEnvMarks');
  assert.match(body, /playerProjection\.sanctuaryLabels/);
  assert.match(body, /Geo\.layoutSanctuaryLabels/);
  assert.doesNotMatch(body, /doc\.sanctuaries|cam\.|getBoundingClientRect/, 'drawn from the projection in world px only');
  assert.match(body, /!previewMode/);
  assert.match(css, /\.j2-sanc-label\s*\{[^}]*paint-order: stroke fill[^}]*\}/);
  const rule = css.match(/\.j2-overlay \.j2-sanc-label \{[^}]*\}/)[0];
  assert.doesNotMatch(rule, /background|glow|box-shadow|filter/, 'ink on the map: no sticker, no glow');
});

test('view: the Player Preview "Known sanctuaries" list holds revealed names only and is emptied in the GM view', () => {
  assert.match(view, /data-j2-known-sanc data-t-aria="journey2_sanc_known" hidden/);
  const body = fn('renderSanctuaryLabels', 'renderEnvMarks');
  assert.match(body, /labels\.map\(l => '<li>'/);
  assert.match(body, /ui\.knownSanc\.hidden = true; ui\.knownSanc\.innerHTML = ''/);
});

test('view: the overlay has a Player map row with explicit status text and an aria-pressed button; toggling does not close, pan or touch anything else', () => {
  assert.match(view, /data-j2-sanc-name aria-pressed="false"/);
  assert.ok(view.indexOf('data-j2-s="player"') > view.indexOf('data-j2-sanc-close') && view.indexOf('data-j2-s="player"') < view.indexOf('data-j2-s="rows"'), 'directly below the header, above the scrolling tables');
  const body = fn('toggleSanctuaryName', 'rerollSanctuary');
  assert.match(body, /setSanctuaryNameRevealed/);
  assert.doesNotMatch(body, /closeSanctuary|centerOnWorld|setCamera|setCells|soulEchoes|\.focus\(/);
  assert.match(body, /journey2_live_sanc_name_revealed/); assert.match(body, /journey2_live_sanc_name_hidden/);
  assert.match(view, /data-j2-sanc-name'\)\) toggleSanctuaryName\(\)/);
  const panel = fn('renderSanctuaryPanel', 'sanctuaryAnchorPx');
  assert.match(panel, /aria-pressed/); assert.match(panel, /journey2_sanc_name_visible/); assert.match(panel, /journey2_sanc_name_hidden/);
});

test('view: a visible sanctuary asks before reroll (rolling only after the confirmation); delete and replace-all say what happens to visible names', () => {
  const reroll = fn('rerollSanctuary', 'commitReroll');
  assert.match(reroll, /isSanctuaryNameRevealed/);
  assert.match(reroll, /autofocus: true/);
  assert.doesNotMatch(reroll, /generator\.rollSanctuary/, 'no roll before the confirmation');
  assert.match(fn('commitReroll', 'confirmDeleteSanctuary'), /generator\.rollSanctuary\(\)/);
  assert.match(fn('confirmDeleteSanctuary', 'renderSelection'), /journey2_sanc_delete_visible_note/);
  assert.match(fn('generateSanctuaries', 'toggleSanctuaryName'), /journey2_sanc_replace_visible_msg/);
});

test('view: the GM ring layer marks a visible name with a non-colour shape, pointer-transparent, and never reuses the Echo or Environment markers', () => {
  const rings = fn('renderSanctuaryRings', 'updateSanctuaryUi');
  assert.match(rings, /is-name-visible/); assert.match(rings, /isSanctuaryNameRevealed/);
  assert.match(rings, /names/, 'redrawn when the visibility list changes');
  assert.doesNotMatch(rings, /j2-echo|j2-envmark/);
  assert.match(view, /data-j2-g="sanct" pointer-events="none"/);
  assert.match(css, /\.j2-sanc-eye-lid/);
  assert.doesNotMatch(css.slice(css.indexOf('.j2-sanc-ring'), css.indexOf('.j2-sanc-ring') + 600), /#0b3b8c|#d6f1ff/, 'not the blue Echo palette');
  const tip = fn('updateSanctuaryTip', 'updateHover');
  assert.match(tip, /journey2_sanc_tip_name_visible/);
  assert.doesNotMatch(tip, /soulEchoes|echo/i);
});

test('view: the Player Preview path never opens the overlay or draws the ring for a name', () => {
  assert.match(fn('renderSanctuaryRings', 'updateSanctuaryUi'), /if \(previewMode\) \{ ui\.g\.sanct\.innerHTML = ''/);
  assert.match(fn('openSanctuary', 'closeSanctuary'), /previewMode/);
  assert.match(fn('renderSanctuaryPanel', 'sanctuaryAnchorPx'), /previewMode \? null/);
});

/* ---------------- localization and docs ---------------- */

test('every new string exists in English and Russian, uses the interpolation system, and the view hardcodes none of them', () => {
  const keys = Object.keys(i18n.en).filter(k => /^journey2_(sanc_(player_map|name_|known|reroll_visible|delete_visible|replace_visible|tip_name)|live_sanc_name)/.test(k));
  assert.ok(keys.length >= 15, String(keys.length));
  for (const k of keys) {
    assert.ok(i18n.ru[k] && i18n.ru[k] !== i18n.en[k], 'ru: ' + k);
    assert.deepEqual((i18n.en[k].match(/\{\w+\}/g) || []).sort(), (i18n.ru[k].match(/\{\w+\}/g) || []).sort(), 'placeholders: ' + k);
  }
  assert.equal(i18n.en.journey2_sanc_name_reveal, 'Reveal name');
  assert.equal(i18n.en.journey2_sanc_name_hide, 'Hide name');
  assert.equal(i18n.en.journey2_sanc_name_hidden, 'Name hidden from players');
  assert.equal(i18n.en.journey2_sanc_name_visible, 'Name visible to players');
  assert.doesNotMatch(view, /'(Reveal name|Hide name|Name visible to players|Name hidden from players|Known sanctuaries)'/);
});

test('the decision (PD-027) and the architecture are documented', () => {
  const pd = read('docs/product-decisions.md'), arch = read('docs/architecture.md');
  assert.match(pd, /PD-027/);
  assert.match(pd, /revealedSanctuaryNameAnchorIds/);
  assert.match(arch, /setSanctuaryNameRevealed/);
  assert.match(arch, /sanctuaryLabels/);
  assert.match(arch, /layoutSanctuaryLabels/);
});
