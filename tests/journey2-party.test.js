'use strict';
/* Journey 2: the party marker (PD-045). Pure — no browser. Covers the document's optional `party`, the `setParty` command and its Undo, the derived light
   (the hex and its six neighbours while the marker is shown — never stored in the Fog of War), the player projection and the print model, and source-level
   guards for the input priority, the Locate / Route Planner hooks and localization. The real pointer behaviour is checked in the running app. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Geo = require('../js/journey2-geometry.js');
const M = require('../js/journey2-model.js');
const P = require('../js/journey2-projection.js');
const PR = require('../js/journey2-print.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const template = JSON.parse(read('data/journey2/map-template.json'));
const anchorsDoc = JSON.parse(read('data/journey2/map-anchors.json'));
const i18n = JSON.parse(read('data/i18n.json'));
const ctx = M.createContext(template, anchorsDoc);
const AT = '2026-10-09T10:00:00.000Z';
const must = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.doc; };
const cid = Geo.cellId;

/** An interior cell whose six neighbours are all on the map, found deterministically. */
const CENTER = (() => {
  for (let q = 30; q < 90; q++) for (let r = -40; r < 40; r++) {
    if (!M.isFoggableCell(ctx, cid(q, r))) continue;
    if (Geo.NEIGHBOR_DELTAS.every(d => M.isFoggableCell(ctx, cid(q + d.dq, r + d.dr)))) return { q, r };
  }
  throw new Error('no interior cell');
})();
const HOME = cid(CENTER.q, CENTER.r);
const SEVEN = [HOME].concat(Geo.NEIGHBOR_DELTAS.map(d => cid(CENTER.q + d.dq, CENTER.r + d.dr)));
const show = (doc, cell) => must(M.apply(doc, { type: 'setParty', cell: cell, shown: true, at: AT }, ctx));

/* ---------------- document ---------------- */

test('a new document has no party; an old document without the field loads as "not placed"', () => {
  const doc = M.emptyDocument(ctx, AT);
  assert.deepEqual(doc.party, { cell: null, shown: false });
  assert.equal(M.getPartyCell(doc), null);
  assert.equal(M.isEmptyDocument(doc), true);
  const raw = JSON.parse(M.serializeBackup(doc));
  delete raw.party;
  const r = M.validateDocument(raw, ctx);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.doc.party, { cell: null, shown: false });
});

test('a placed party makes the document non-empty and survives a backup round trip', () => {
  const doc = show(M.emptyDocument(ctx, AT), HOME);
  assert.equal(M.isEmptyDocument(doc), false);
  const back = M.parseBackupText(M.serializeBackup(doc), ctx);
  assert.equal(back.ok, true, JSON.stringify(back));
  assert.deepEqual(back.doc.party, { cell: HOME, shown: true });
});

test('validation: an unknown key, a malformed or off-map cell, a non-boolean flag and "shown without a position" are all refused', () => {
  const base = JSON.parse(M.serializeBackup(M.emptyDocument(ctx, AT)));
  const bad = [
    { cell: HOME, shown: true, extra: 1 }, { cell: 'nope', shown: false }, { cell: cid(-500, -500), shown: false },
    { cell: HOME, shown: 'yes' }, { cell: null, shown: true }, 'party', [],
  ];
  for (const party of bad) assert.equal(M.validateDocument(Object.assign({}, base, { party: party }), ctx).ok, false, JSON.stringify(party));
  for (const party of [{ cell: HOME, shown: false }, { cell: null, shown: false }, {}, null]) assert.equal(M.validateDocument(Object.assign({}, base, { party: party }), ctx).ok, true, JSON.stringify(party));
});

/* ---------------- command ---------------- */

test('setParty: place, move, hide (the position is remembered), show again; the same state is a noop', () => {
  let doc = M.emptyDocument(ctx, AT);
  doc = show(doc, HOME);
  assert.deepEqual(doc.party, { cell: HOME, shown: true });
  const other = SEVEN[1];
  doc = must(M.apply(doc, { type: 'setParty', cell: other, at: AT }, ctx));
  assert.deepEqual(doc.party, { cell: other, shown: true }, 'an omitted flag keeps its value');
  doc = must(M.apply(doc, { type: 'setParty', shown: false, at: AT }, ctx));
  assert.deepEqual(doc.party, { cell: other, shown: false });
  assert.equal(M.getPartyCell(doc), null, 'hidden: not on the map');
  doc = must(M.apply(doc, { type: 'setParty', shown: true, at: AT }, ctx));
  assert.deepEqual(doc.party, { cell: other, shown: true }, 'shown again where it was');
  const same = M.apply(doc, { type: 'setParty', cell: other, shown: true, at: AT }, ctx);
  assert.equal(same.ok && same.noop, true);
  assert.equal(same.doc, doc);
});

test('setParty: it cannot be shown without a position, and a bad cell or flag is refused whole', () => {
  const doc = M.emptyDocument(ctx, AT);
  const r = M.apply(doc, { type: 'setParty', shown: true, at: AT }, ctx);
  assert.equal(r.ok && r.noop, true, 'nothing to show');
  for (const cmd of [{ cell: 'x' }, { cell: cid(-500, -500) }, { cell: 5 }, { shown: 1 }]) assert.equal(M.apply(doc, Object.assign({ type: 'setParty', at: AT }, cmd), ctx).ok, false, JSON.stringify(cmd));
});

test('setParty may stand on any foggable cell — a sanctuary, Marrogate, Horizon and a fully overtaken hex included', () => {
  for (const a of anchorsDoc.anchors) {
    if (!a.cellId || !M.isFoggableCell(ctx, a.cellId)) continue;
    assert.equal(M.apply(M.emptyDocument(ctx, AT), { type: 'setParty', cell: a.cellId, shown: true, at: AT }, ctx).ok, true, a.cellId);
  }
  const decorative = Array.from(ctx.decorativeCells)[0];
  assert.equal(M.apply(M.emptyDocument(ctx, AT), { type: 'setParty', cell: decorative, shown: true, at: AT }, ctx).ok, false, 'title / compass furniture is not a place');
});

test('Undo / Redo: one move is one history entry, and nothing but `party` changes', () => {
  const h = M.createHistory();
  const a = M.emptyDocument(ctx, AT), b = show(a, HOME), c = show(b, SEVEN[2]);
  M.historyCommit(h, a, b, 'partyPlace'); M.historyCommit(h, b, c, 'partyMove');
  assert.equal(h.undo.length, 2);
  assert.deepEqual(M.historyUndo(h).before.party, { cell: HOME, shown: true });
  assert.deepEqual(c.playerVisibility, b.playerVisibility);
  assert.deepEqual(c.tiles, b.tiles);
});

/* ---------------- the light ---------------- */

test('the light is the hex and its six neighbours while the marker is shown — derived, never stored', () => {
  const doc = show(M.emptyDocument(ctx, AT), HOME);
  assert.deepEqual(Array.from(M.getPartyLightSet(doc, ctx)).sort(), SEVEN.slice().sort());
  assert.equal(M.getVisibleCellSet(doc, ctx).size, 7);
  assert.equal(M.getRevealedCellSet(doc).size, 0, 'the stored Fog of War is untouched');
  assert.deepEqual(doc.playerVisibility.revealedCells, []);
  const hidden = must(M.apply(doc, { type: 'setParty', shown: false, at: AT }, ctx));
  assert.equal(M.getPartyLightSet(hidden, ctx).size, 0, 'hiding removes the light');
  assert.equal(M.getVisibleCellSet(hidden, ctx), M.getRevealedCellSet(hidden));
});

test('the light never leaves the map and is merged with the hand-revealed cells', () => {
  const edge = (() => { for (let q = 0; q < 200; q++) for (let r = -80; r < 80; r++) { const id = cid(q, r); if (M.isFoggableCell(ctx, id) && !Geo.NEIGHBOR_DELTAS.every(d => M.isFoggableCell(ctx, cid(q + d.dq, r + d.dr)))) return id; } throw new Error('no edge cell'); })();
  const near = show(M.emptyDocument(ctx, AT), edge);
  const lit = M.getPartyLightSet(near, ctx);
  assert.ok(lit.has(edge) && lit.size < 7 && lit.size >= 1);
  for (const id of lit) assert.equal(M.isFoggableCell(ctx, id), true, id);
  const far = cid(CENTER.q + 20, CENTER.r);
  let doc = show(M.emptyDocument(ctx, AT), HOME);
  if (M.isFoggableCell(ctx, far)) {
    doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: [far, HOME], revealed: true, at: AT }, ctx));
    const vis = M.getVisibleCellSet(doc, ctx);
    assert.equal(vis.size, 8, 'seven lit + one revealed far away (the party hex counted once)');
    assert.ok(vis.has(far));
  }
});

test('the light is cached per document state and recomputed for a new one', () => {
  const doc = show(M.emptyDocument(ctx, AT), HOME);
  assert.equal(M.getVisibleCellSet(doc, ctx), M.getVisibleCellSet(doc, ctx));
  const moved = show(doc, SEVEN[3]);
  assert.notEqual(M.getVisibleCellSet(moved, ctx), M.getVisibleCellSet(doc, ctx));
  assert.ok(M.getVisibleCellSet(moved, ctx).has(SEVEN[3]));
});

/* ---------------- projection and print ---------------- */

test('projection: revealedCells carry the light, `party` is the marker, and a hidden or unplaced party contributes nothing', () => {
  const doc = show(M.emptyDocument(ctx, AT), HOME);
  const proj = P.buildPlayerProjection(doc, ctx);
  assert.deepEqual(proj.revealedCells, SEVEN.slice().sort(M.compareCellKeys));
  assert.deepEqual(proj.party, { q: CENTER.q, r: CENTER.r });
  const hidden = P.buildPlayerProjection(must(M.apply(doc, { type: 'setParty', shown: false, at: AT }, ctx)), ctx);
  assert.deepEqual(hidden.revealedCells, []);
  assert.equal(hidden.party, null);
  assert.equal(P.buildPlayerProjection(M.emptyDocument(ctx, AT), ctx).party, null);
});

test('projection: a tile inside the light reaches players (the light is a real reveal)', () => {
  let doc = M.emptyDocument(ctx, AT);
  const region = { habitat: { biome: 'forest', blighted: false, overtaken: false, source: 'rolled', rolls: [11] }, terrain: { value: 3, source: 'rolled' }, size: 2, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 49 };
  doc = must(M.apply(doc, { type: 'createBatch', batch: M.batchFromRegion(region, { id: 'b-party', createdAt: AT }), at: AT }, ctx));
  const inside = SEVEN[1];
  assert.equal(M.checkCells(doc, ctx, [Geo.parseCellId(inside)])[0].ok, true, 'the fixture cell is placeable');
  doc = must(M.apply(doc, { type: 'place', batchId: 'b-party', tiles: [{ id: 't-in', cell: inside }], at: AT }, ctx));
  const withParty = show(doc, HOME);
  assert.equal(P.buildPlayerProjection(doc, ctx).overlays.length, 0);
  const proj = P.buildPlayerProjection(withParty, ctx);
  assert.equal(proj.overlays.length, 1);
  assert.deepEqual([proj.overlays[0].q, proj.overlays[0].r], [Geo.parseCellId(inside).q, Geo.parseCellId(inside).r]);
});

test('projection: the party leaks nothing else (only a cell) and the projection shares nothing mutable with the document', () => {
  const doc = show(M.emptyDocument(ctx, AT), HOME);
  const proj = P.buildPlayerProjection(doc, ctx);
  assert.deepEqual(Object.keys(proj.party).sort(), ['q', 'r']);
  proj.party.q = 999;
  assert.equal(doc.party.cell, HOME);
});

test('print: the marker lands on the page that holds its hex, the print has the light, and a hidden party prints nothing', () => {
  const doc = show(M.emptyDocument(ctx, AT), HOME);
  const model = PR.buildPrintModel(doc, ctx, template);
  assert.equal(model.summary.party, true);
  const holding = model.pages.filter(p => p.party);
  assert.ok(holding.length >= 1 && holding.length <= 2);
  for (const p of holding) assert.deepEqual(p.party, { q: CENTER.q, r: CENTER.r });
  const hidden = PR.buildPrintModel(must(M.apply(doc, { type: 'setParty', shown: false, at: AT }, ctx)), ctx, template);
  assert.equal(hidden.summary.party, false);
  assert.ok(hidden.pages.every(p => p.party === null));
});

/* ---------------- source guards ---------------- */

const view = read('js/journey2-view.js').replace(/\r\n/g, '\n');
const css = read('css/journey2.css').replace(/\r\n/g, '\n');
const fn = (from, to) => { const a = view.indexOf('function ' + from); assert.ok(a >= 0, from); return view.slice(a, view.indexOf(to, a)); };

test('input priority: a press on the marker (or the drop while it follows the cursor) is handled before the fog brush, tile drag, Locate and Route picks', () => {
  const down = fn('onViewportDown', 'function onViewportMove');
  const party = down.indexOf('startPartyDrag(e)'), fog = down.indexOf('startFogStroke(e)'), tile = down.indexOf('tileAtScreen(x, y)');
  assert.ok(party > 0 && party < fog && party < tile, 'the marker is checked first');
  assert.match(down, /e\.button === 0 && !editLocked && !spaceDown && \(\(partyDraft && partyDraft\.placing\) \|\| partyHitAt\(x, y\)\)/);
  assert.match(fn('onViewportUp', 'function onViewportCancel'), /partyDraft && partyDraft\.pointerId === e\.pointerId\) \{ finishPartyDrag\(e\)/);
  assert.match(fn('onDocumentKey', 'function fogSpaceTarget'), /if \(partyDraft\) \{ cancelPartyDraft\(true\)/, 'Escape cancels a drop / drag');
  assert.match(fn('cancelTransient', '\n'), /cancelPartyDraft\(\)/, 'another tool, Undo or a document change cancels it');
});

test('the marker is one command per drop / drag and never writes the Fog of War', () => {
  const body = fn('finishPartyDrag', 'function cancelPartyDraft');
  assert.match(body, /dispatch\(\{ type: 'setParty', cell: d\.cell, shown: true \}/);
  assert.doesNotMatch(body, /setCellsRevealed/);
  assert.doesNotMatch(fn('movePartyDraft', 'function finishPartyDrag'), /dispatch\(/, 'moving while pressed only previews');
});

test('Locate and the Route Planner use a placed, shown marker as the starting hex and otherwise behave as before', () => {
  assert.match(fn('startLocate', 'function exitLocate'), /const party = Model\.getPartyCell\(doc\);[\s\S]*chooseLocateOrigin\(party\)/);
  assert.match(fn('startRoute', 'function exitRoute'), /const party = Model\.getPartyCell\(doc\);[\s\S]*routePlanner\.pick\(party\)/);
  assert.doesNotMatch(fn('chooseLocateOrigin', 'function chooseLocateAgain'), /partyDraft|doc\.party/, 'the tool only reads the hex; it never moves the marker');
});

test('Player Preview draws the marker from the projection and the print draws it black, above the labels', () => {
  assert.match(fn('partyDrawCell', 'function paintPartyMarker'), /playerProjection && playerProjection\.party/);
  assert.match(view, /<g class="j2-pp-party"[^]*?partyMarkup\(page\.party\.q, page\.party\.r, \{ bw: true \}\)/);
  assert.match(css, /\.j2-party-mark\.is-bw \.j2-party-star \{ fill: #111; stroke: #111; \}/);
});

test('the button exists in the panel (both views) and on the collapsed rail, and every string has English and Russian', () => {
  assert.match(view, /<div class="j2-ctl-row j2-ctl-party"[^]*?data-j2-party aria-pressed="false"/);
  assert.match(view, /data-j2-party data-j2-rail-src="party"/);
  assert.match(view, /party: \(\) => ui\.partyBtn/);
  const keys = Object.keys(i18n.en).filter(k => k.startsWith('journey2_party_') || k.startsWith('journey2_live_party_'));
  assert.ok(keys.length >= 12, 'found ' + keys.length);
  for (const k of keys) { assert.ok(i18n.ru[k], 'ru ' + k); assert.equal(i18n.en[k] === i18n.ru[k], false, 'translated ' + k); }
});
