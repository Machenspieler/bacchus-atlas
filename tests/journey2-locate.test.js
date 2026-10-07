'use strict';
/* Journey 2: Locate Soul Echoes (PD-030). Pure — no browser. Covers the collected-state schema and command, the bearing / sixteen-direction /
   nearest-Echo / tie / "here" logic, the transient session state machine, the GM-only isolation (projection, print, storage) and the source
   guards for the view. The real pointer / animation / overlay behaviour is checked in a browser by scripts/journey2/lib/locate-checks.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../js/journey2-model.js');
const L = require('../js/journey2-locate.js');
const P = require('../js/journey2-projection.js');
const PR = require('../js/journey2-print.js');
const Store = require('../js/journey2-store.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const template = JSON.parse(read('data/journey2/map-template.json'));
const anchorsDoc = JSON.parse(read('data/journey2/map-anchors.json'));
const i18n = JSON.parse(read('data/i18n.json'));
const ctx = M.createContext(template, anchorsDoc);
const AT = '2026-10-07T10:00:00.000Z', AT2 = '2026-10-07T11:00:00.000Z', AT3 = '2026-10-07T12:00:00.000Z';
const must = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.doc; };
const view = read('js/journey2-view.js');
const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SANCT = anchorsDoc.anchors.filter(a => a.kind === 'sanctuary').map(a => a.stableId);
const DEST = anchorsDoc.anchors.filter(a => a.kind === 'destination').map(a => a.stableId);
const sanc = id => ctx.sanctuaries.find(s => s.id === id);
const withEchoes = ids => must(M.apply(M.emptyDocument(ctx, AT), { type: 'setSoulEchoes', anchorIds: ids, at: AT }, ctx));
const collect = (doc, id, collected, at) => M.apply(doc, { type: 'setSoulEchoCollected', anchorId: id, collected, at: at || AT2 }, ctx);

/* ============================================================ collected state: schema ============================================================ */

test('collected: a new document and an old document without the field have every Echo Available', () => {
  assert.deepEqual(M.emptyDocument(ctx, AT).soulEchoes, { anchorIds: [], collectedAnchorIds: [] });
  const old = JSON.parse(M.serializeBackup(withEchoes(SANCT.slice(0, 3))));
  delete old.soulEchoes.collectedAnchorIds;
  const r = M.validateDocument(old, ctx);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.doc.soulEchoes.collectedAnchorIds, []);
  assert.deepEqual(M.availableEchoIds(r.doc), r.doc.soulEchoes.anchorIds);
  assert.equal(M.SCHEMA_VERSION, 1, 'no migration');
});

test('collected: validation canonicalizes duplicates + order and rejects ids outside the distribution, destinations and unknown ids', () => {
  const ids = SANCT.slice(0, 4);
  const base = JSON.parse(M.serializeBackup(withEchoes(ids)));
  const tryIds = c => { const j = JSON.parse(JSON.stringify(base)); j.soulEchoes.collectedAnchorIds = c; return M.validateDocument(j, ctx); };
  const ok = tryIds([ids[2], ids[0], ids[2]]);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.deepEqual(ok.doc.soulEchoes.collectedAnchorIds, [ids[0], ids[2]].sort());
  assert.equal(tryIds([]).ok, true);
  for (const bad of [[SANCT[10]], [DEST[0]], [DEST[1]], ['mk-999'], [5], [''], 'mk-001', null]) assert.equal(tryIds(bad).ok, false, JSON.stringify(bad));   // Marrogate / Horizon are the two destinations
  const extra = JSON.parse(JSON.stringify(base)); extra.soulEchoes.extra = 1;
  assert.equal(M.validateDocument(extra, ctx).ok, false, 'unknown field');
  const none = JSON.parse(M.serializeBackup(M.emptyDocument(ctx, AT))); none.soulEchoes = { collectedAnchorIds: ['mk-001'] };
  assert.equal(M.validateDocument(none, ctx).ok, false, 'collected without any distribution');
});

test('collected: JSON backup export / import round-trips the state byte for byte; reset clears it', () => {
  let doc = withEchoes(SANCT.slice(0, 5));
  doc = must(collect(doc, SANCT[1], true));
  doc = must(collect(doc, SANCT[3], true, AT3));
  const text = M.serializeBackup(doc);
  const back = M.parseBackupText(text, ctx);
  assert.equal(back.ok, true, JSON.stringify(back));
  assert.equal(M.serializeBackup(back.doc), text);
  assert.deepEqual(back.doc.soulEchoes.collectedAnchorIds, [SANCT[1], SANCT[3]].sort());
  const bad = JSON.parse(text); bad.soulEchoes.collectedAnchorIds.push(SANCT[30]);
  assert.equal(M.parseBackupText(JSON.stringify(bad), ctx).ok, false, 'invalid collected ids fail safely (the whole import is refused)');
  assert.deepEqual(M.emptyDocument(ctx, AT3).soulEchoes.collectedAnchorIds, [], 'a reset document has nothing collected');
});

test('collected: the local store loads and saves it through the same validator', () => {
  const mem = new Map();
  const storage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, v); }, removeItem: k => { mem.delete(k); } };
  const doc = must(collect(withEchoes(SANCT.slice(0, 3)), SANCT[0], true));
  const store = Store.createStore(storage, ctx);
  assert.equal(store.save(doc).ok, true);
  const loaded = Store.createStore(storage, ctx).load();
  assert.equal(loaded.status, 'ok');
  assert.deepEqual(loaded.doc.soulEchoes, doc.soulEchoes);
});

/* ============================================================ collected state: command ============================================================ */

test('setSoulEchoCollected: marks and restores, sorted, touching only soulEchoes; updatedAt moves only on a real change', () => {
  const d0 = withEchoes([SANCT[5], SANCT[2], SANCT[9]]);
  const d1 = must(collect(d0, SANCT[9], true));
  assert.deepEqual(d1.soulEchoes.collectedAnchorIds, [SANCT[9]]);
  assert.equal(d1.updatedAt, AT2);
  assert.equal(d1.batches, d0.batches); assert.equal(d1.tiles, d0.tiles); assert.equal(d1.playerVisibility, d0.playerVisibility); assert.equal(d1.sanctuaries, d0.sanctuaries);
  assert.deepEqual(d1.soulEchoes.anchorIds, d0.soulEchoes.anchorIds);
  const d2 = must(collect(d1, SANCT[2], true, AT3));
  assert.deepEqual(d2.soulEchoes.collectedAnchorIds, [SANCT[2], SANCT[9]].sort());
  const d3 = must(collect(d2, SANCT[9], false, AT3));
  assert.deepEqual(d3.soulEchoes.collectedAnchorIds, [SANCT[2]]);
  const again = collect(d1, SANCT[9], true, AT3);
  assert.equal(again.noop, true); assert.equal(again.doc, d1); assert.equal(again.doc.updatedAt, AT2, 'a no-op leaves updatedAt alone');
  const already = collect(d0, SANCT[9], false, AT3);
  assert.equal(already.noop, true); assert.equal(already.doc.updatedAt, AT);
});

test('setSoulEchoCollected: refuses an unknown anchor, a destination (Marrogate / Horizon), an anchor without an Echo and a non-boolean', () => {
  const d = withEchoes(SANCT.slice(0, 3));
  assert.equal(collect(d, 'mk-999', true).error.code, 'bad-anchor');
  assert.equal(collect(d, DEST[0], true).error.code, 'bad-anchor');
  assert.equal(collect(d, DEST[1], true).error.code, 'bad-anchor');
  assert.equal(collect(d, SANCT[20], true).error.code, 'no-echo');
  assert.equal(collect(d, 7, true).error.code, 'bad-anchor');
  for (const v of ['true', 1, null, undefined]) assert.equal(M.apply(d, { type: 'setSoulEchoCollected', anchorId: SANCT[0], collected: v, at: AT2 }, ctx).error.code, 'bad-collected');
  assert.equal(M.apply(M.emptyDocument(ctx, AT), { type: 'setSoulEchoCollected', anchorId: SANCT[0], collected: true, at: AT2 }, ctx).error.code, 'no-echo');
});

test('history: collect / restore are one Undo entry each and restore the exact state both ways', () => {
  const h = M.createHistory();
  const d0 = withEchoes(SANCT.slice(0, 3));
  const d1 = must(collect(d0, SANCT[1], true)); M.historyCommit(h, d0, d1, 'echoCollect');
  const d2 = must(collect(d1, SANCT[1], false, AT3)); M.historyCommit(h, d1, d2, 'echoRestore');
  assert.equal(h.undo.length, 2);
  assert.equal(M.historyUndo(h).before, d1);
  assert.equal(M.historyUndo(h).before, d0);
  assert.equal(M.historyRedo(h).after, d1);
  assert.equal(M.historyRedo(h).after, d2);
});

test('generating or removing Echoes clears the collected state atomically; Undo restores both, Redo restores the cleared state', () => {
  const h = M.createHistory();
  let d0 = withEchoes(SANCT.slice(0, 4));
  d0 = must(collect(d0, SANCT[0], true));
  const replaceWith = SANCT.slice(10, 14);
  const d1 = must(M.apply(d0, { type: 'setSoulEchoes', anchorIds: replaceWith, at: AT3 }, ctx));
  M.historyCommit(h, d0, d1, 'echoesPlace');
  assert.deepEqual(d1.soulEchoes.collectedAnchorIds, [], 'all newly distributed Echoes begin Available');
  const sameSet = M.apply(d0, { type: 'setSoulEchoes', anchorIds: SANCT.slice(0, 4), at: AT3 }, ctx);
  assert.notEqual(sameSet.noop, true, 're-placing the same ids still clears the collected state');
  assert.deepEqual(sameSet.doc.soulEchoes.collectedAnchorIds, []);
  const d2 = must(M.apply(d1, { type: 'setSoulEchoes', anchorIds: [], at: AT3 }, ctx));
  M.historyCommit(h, d1, d2, 'echoesClear');
  assert.deepEqual(d2.soulEchoes, { anchorIds: [], collectedAnchorIds: [] });
  const u = M.historyUndo(h).before;
  assert.equal(u, d1);
  const u2 = M.historyUndo(h).before;
  assert.deepEqual(u2.soulEchoes.anchorIds, d0.soulEchoes.anchorIds);
  assert.deepEqual(u2.soulEchoes.collectedAnchorIds, [SANCT[0]], 'Undo restores the previous distribution AND the collected state');
  assert.deepEqual(M.historyRedo(h).after.soulEchoes, d1.soulEchoes);
  const removeFromEmpty = M.apply(M.emptyDocument(ctx, AT), { type: 'setSoulEchoes', anchorIds: [], at: AT2 }, ctx);
  assert.equal(removeFromEmpty.noop, true);
});

/* ============================================================ bearing + sixteen directions ============================================================ */

const O = { x: 1000, y: 1000 };
const at = (deg, d) => ({ x: O.x + Math.sin(deg * Math.PI / 180) * (d || 100), y: O.y - Math.cos(deg * Math.PI / 180) * (d || 100) });

test('bearing: north / east / south / west, with the screen-down Y flipped', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' vs ' + b);
  near(L.bearingDegrees(O, { x: 1000, y: 900 }), 0);        // smaller y = up the map = north
  near(L.bearingDegrees(O, { x: 1100, y: 1000 }), 90);
  near(L.bearingDegrees(O, { x: 1000, y: 1100 }), 180);     // larger y = down the map = south
  near(L.bearingDegrees(O, { x: 900, y: 1000 }), 270);
  near(L.bearingDegrees(O, { x: 1100, y: 900 }), 45);
  for (const b of [0, 33, 90, 179.9, 270, 359.99]) { const r = L.bearingDegrees(O, at(b, 250)); assert.ok(r >= 0 && r < 360); near(r, b % 360); }
});

test('directions: the table has sixteen sectors, each with an English code, i18n keys and its centre angle', () => {
  assert.equal(L.SIXTEEN_DIRECTIONS.length, 16);
  const codes = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  L.SIXTEEN_DIRECTIONS.forEach((d, i) => {
    assert.equal(d.index, i); assert.equal(d.abbreviation, codes[i]); assert.equal(d.centerAngle, i * 22.5);
    assert.equal(d.abbrKey, 'journey2_loc_dir_' + d.id + '_abbr'); assert.equal(d.labelKey, 'journey2_loc_dir_' + d.id);
    for (const lang of ['en', 'ru']) { assert.ok(i18n[lang][d.labelKey] && i18n[lang][d.abbrKey], lang + ' ' + d.id); }
  });
  assert.ok(Object.isFrozen(L.SIXTEEN_DIRECTIONS));
});

test('directions: every sector centre maps to its own index, and the half-sector boundaries wrap around north', () => {
  for (let i = 0; i < 16; i++) {
    const d = L.directionForBearing(i * 22.5);
    assert.equal(d.index, i); assert.equal(d.centerAngle, i * 22.5);
    const viaTarget = L.directionForBearing(L.bearingDegrees(O, at(i * 22.5)));
    assert.equal(viaTarget.index, i, 'sector ' + i + ' through a real target');
  }
  for (let k = 0; k < 16; k++) {
    const boundary = k * 22.5 + 11.25;                       // 11.25, 33.75, 56.25 ... 348.75
    assert.equal(L.directionForBearing(boundary).index, (k + 1) % 16, 'at ' + boundary);
    assert.equal(L.directionForBearing(boundary - 1e-6).index, k, 'just below ' + boundary);
  }
  assert.equal(L.directionForBearing(348.75).index, 0); assert.equal(L.directionForBearing(348.7499).index, 15);
  assert.equal(L.directionForBearing(359.999).index, 0); assert.equal(L.directionForBearing(-10).index, 0); assert.equal(L.directionForBearing(-20).index, 15); assert.equal(L.directionForBearing(725).index, 0);
  const d = L.directionForBearing(30);
  assert.deepEqual(Object.keys(d).sort(), ['abbrKey', 'abbreviation', 'centerAngle', 'id', 'index', 'labelKey']);
});

/* ============================================================ nearest Echo, ties, "here" ============================================================ */

const C = (id, x, y, cellId) => ({ id, x, y, cellId: cellId || null });

test('nearest: one candidate; the nearest of several; nothing without candidates', () => {
  assert.equal(L.findNearestSoulEcho({ origin: O, candidates: [] }), null);
  assert.equal(L.findNearestSoulEcho({ origin: O }), null);
  const one = L.findNearestSoulEcho({ origin: O, candidates: [C('a', 1300, 1000)], random: () => 0 });
  assert.equal(one.target.id, 'a'); assert.equal(one.type, 'direction'); assert.equal(one.direction.index, 4);
  const many = L.findNearestSoulEcho({ origin: O, candidates: [C('far', 3000, 1000), C('near', 1000, 1300), C('mid', 1000, 2000)], random: () => 0.99 });
  assert.equal(many.target.id, 'near'); assert.equal(many.direction.index, 8); assert.equal(many.tied, 1);
  assert.ok(Math.abs(many.distance - 300) < 1e-9);
});

test('tie: exact ties use the injected RNG (once); near-equal distances inside the epsilon tie, outside it they do not', () => {
  assert.ok(L.NEAREST_TIE_EPSILON > 0 && L.NEAREST_TIE_EPSILON < ctx.grid.shortDimensionPx / 20, 'the tolerance is far smaller than one hex');
  const cands = [C('b', 1200, 1000), C('a', 800, 1000), C('c', 1000, 1200)];       // three at exactly 200
  const pickAt = r => L.findNearestSoulEcho({ origin: O, candidates: cands, random: () => r });
  assert.equal(pickAt(0).tied, 3);
  assert.deepEqual([pickAt(0).target.id, pickAt(0.4).target.id, pickAt(0.9).target.id], ['a', 'b', 'c'], 'stable order, so a seeded draw is reproducible');
  assert.equal(pickAt(0.9999999).target.id, 'c'); assert.equal(pickAt(1).target.id, 'c', 'an out-of-range draw never indexes past the end');
  const eps = L.NEAREST_TIE_EPSILON;
  const within = L.findNearestSoulEcho({ origin: O, candidates: [C('x', 1200 + eps * 0.9, 1000), C('y', 800, 1000)], random: () => 0.9 });
  assert.equal(within.tied, 2); assert.equal(within.target.id, 'y');
  const outside = L.findNearestSoulEcho({ origin: O, candidates: [C('x', 1200 + eps * 1.5, 1000), C('y', 800, 1000)], random: () => 0.9 });
  assert.equal(outside.tied, 1); assert.equal(outside.target.id, 'y', 'the strictly nearer one wins without a draw mattering');
});

test('tie: the RNG is drawn once per search and a frozen outcome never changes', () => {
  let draws = 0;
  const rng = () => { draws++; return 0.5; };
  const r = L.findNearestSoulEcho({ origin: O, candidates: [C('a', 1200, 1000), C('b', 800, 1000)], random: rng });
  assert.equal(draws, 1);
  const frozen = JSON.stringify(r);
  for (let i = 0; i < 5; i++) assert.equal(JSON.stringify(r), frozen);
  assert.equal(draws, 1, 'reading the result again never draws');
});

test('here: the origin hex of an Echo gives "here" (no bearing, no direction), even when another sanctuary is nearer', () => {
  const r = L.findNearestSoulEcho({ origin: { x: 1000, y: 1000 }, originCellId: '5,5', candidates: [C('far', 1900, 1000, '9,9'), C('mine', 1030, 1000, '5,5'), C('close', 1001, 1000, '6,6')], random: () => 0 });
  assert.equal(r.type, 'here'); assert.equal(r.target.id, 'mine'); assert.equal(r.bearing, null); assert.equal(r.direction, null);
  const elsewhere = L.findNearestSoulEcho({ origin: { x: 1000, y: 1000 }, originCellId: '1,1', candidates: [C('mine', 1030, 1000, '5,5')], random: () => 0 });
  assert.equal(elsewhere.type, 'direction');
});

/* ---- on the real map ---- */

const cellOf = id => sanc(id).cellId;
const originCellFar = (x, y) => { const c = ctx.grid.worldToCell(x, y); return c.q + ',' + c.r; };

test('candidates: only distributed, uncollected, real sanctuaries with geometry — never Marrogate / Horizon', () => {
  const ids = SANCT.slice(0, 5);
  let doc = withEchoes(ids);
  assert.deepEqual(L.soulEchoCandidates(doc, ctx).map(c => c.id).sort(), ids.slice().sort());
  doc = must(collect(doc, ids[2], true));
  assert.ok(!L.soulEchoCandidates(doc, ctx).some(c => c.id === ids[2]), 'collected is excluded');
  doc = must(M.apply(doc, { type: 'setSoulEchoes', anchorIds: ids.slice(0, 2), at: AT3 }, ctx));
  assert.deepEqual(L.soulEchoCandidates(doc, ctx).map(c => c.id).sort(), ids.slice(0, 2).sort(), 'removed Echoes are excluded');
  const orphan = Object.assign({}, doc, { soulEchoes: { anchorIds: ['mk-999', DEST[0], DEST[1], ids[0]], collectedAnchorIds: [] } });
  assert.deepEqual(L.soulEchoCandidates(orphan, ctx).map(c => c.id), [ids[0]], 'orphaned / destination ids are never candidates');
  for (const c of L.soulEchoCandidates(withEchoes(ids), ctx)) { assert.equal(c.x, sanc(c.id).x); assert.equal(c.y, sanc(c.id).y); }
  assert.deepEqual(L.soulEchoCandidates(M.emptyDocument(ctx, AT), ctx), []);
});

test('locate: the origin is the centre of the picked hex and the target the fixed anchor centre; pan, zoom and extra inputs are irrelevant', () => {
  const doc = withEchoes([SANCT[0], SANCT[30]]);
  const origin = originCellFar(2400, 1800);
  const a = L.locateSoulEcho({ doc, ctx, originCellId: origin, random: () => 0 });
  assert.equal(a.ok, true);
  const oc = require('../js/journey2-geometry.js').parseCellId(origin), ctr = ctx.grid.cellCenter(oc.q, oc.r);
  const best = [SANCT[0], SANCT[30]].map(id => ({ id, d: Math.hypot(sanc(id).x - ctr[0], sanc(id).y - ctr[1]) })).sort((x, y) => x.d - y.d)[0];
  assert.equal(a.targetAnchorId, best.id);
  const expected = L.bearingDegrees({ x: ctr[0], y: ctr[1] }, { x: sanc(best.id).x, y: sanc(best.id).y });
  assert.equal(a.bearing, expected);
  assert.equal(a.direction.index, L.directionForBearing(expected).index);
  const noisy = L.locateSoulEcho({ doc, ctx, originCellId: origin, random: () => 0, cam: { scale: 7, tx: 99, ty: -5 }, zoom: 3, pan: [1, 2] });
  assert.deepEqual(noisy, a, 'camera-like inputs cannot change a result');
  assert.deepEqual(Object.keys(a).sort(), ['bearing', 'direction', 'ok', 'originCellId', 'targetAnchorId', 'type'], 'direction only: no distance, name or target hex');
});

test('locate: fog, revealed sanctuary names, generated sanctuary data and terrain never change the answer', () => {
  const ids = [SANCT[3], SANCT[20], SANCT[40]];
  const origin = originCellFar(2000, 1500);
  const base = withEchoes(ids);
  const ref = L.locateSoulEcho({ doc: base, ctx, originCellId: origin, random: () => 0 });
  let doc = base;
  const key = a => { const c = ctx.grid.worldToCell(sanc(a).x, sanc(a).y); return c.q + ',' + c.r; };
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: ids.map(key).concat([origin]), revealed: true, at: AT2 }, ctx));
  const entry = id => ({ anchorId: id, name: 'Pikebun', trade: 9, quirk: 3, crisis: 9, drive: 5, politics: { rolls: [1] }, size: 4, population: 1 });
  doc = must(M.apply(doc, { type: 'setSanctuaries', entries: ids.map(entry), at: AT2 }, ctx));
  doc = must(M.apply(doc, { type: 'setSanctuaryNameRevealed', anchorId: ids[1], revealed: true, at: AT3 }, ctx));
  doc = must(M.apply(doc, { type: 'createBatch', batch: M.batchFromRegion({ habitat: { biome: 'mountain', blighted: true, overtaken: false, source: 'rolled', rolls: [4] }, terrain: { value: 4, source: 'rolled' }, size: 4, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 9 }, { id: 'r1', createdAt: AT }), at: AT2 }, ctx));
  assert.deepEqual(L.locateSoulEcho({ doc, ctx, originCellId: origin, random: () => 0 }), ref);
  doc = must(M.apply(doc, { type: 'deleteSanctuary', anchorId: ids[0], at: AT3 }, ctx));
  assert.deepEqual(L.locateSoulEcho({ doc, ctx, originCellId: origin, random: () => 0 }), ref, 'works without generated sanctuary data');
  const src = strip(read('js/journey2-locate.js'));
  assert.doesNotMatch(src, /revealedCells|revealedSanctuary|sanctuaries\.entries|playerVisibility|\.tiles|terrain|habitat/, 'the module never reads fog, names, generated data or terrain');
});

test('locate: standing on an Echo sanctuary\'s hex answers "here"; an invalid hex or no available Echo answers a refusal', () => {
  const doc = withEchoes([SANCT[7], SANCT[8], SANCT[9]]);
  for (const id of doc.soulEchoes.anchorIds) {
    const r = L.locateSoulEcho({ doc, ctx, originCellId: cellOf(id), random: () => 0 });
    assert.equal(r.ok, true); assert.equal(r.type, 'here'); assert.equal(r.targetAnchorId, id); assert.equal(r.bearing, null); assert.equal(r.direction, null);
  }
  assert.equal(L.locateSoulEcho({ doc, ctx, originCellId: '99999,99999', random: () => 0 }).reason, 'bad-origin');
  assert.equal(L.locateSoulEcho({ doc, ctx, originCellId: 'nope', random: () => 0 }).reason, 'bad-origin');
  let all = doc; for (const id of doc.soulEchoes.anchorIds) all = must(collect(all, id, true));
  assert.equal(L.locateSoulEcho({ doc: all, ctx, originCellId: cellOf(SANCT[7]), random: () => 0 }).reason, 'no-echo');
  assert.equal(L.locateSoulEcho({ doc: M.emptyDocument(ctx, AT), ctx, originCellId: cellOf(SANCT[7]), random: () => 0 }).reason, 'no-echo');
  const decorative = Array.from(ctx.decorativeCells)[0];
  if (decorative) assert.equal(L.locateSoulEcho({ doc, ctx, originCellId: decorative, random: () => 0 }).reason, 'bad-origin', 'decorative furniture is not a hex the party can stand on');
});

test('locate: a collected Echo is skipped once collected and eligible again after Restore', () => {
  const near = SANCT[0], far = SANCT[50];
  const origin = cellOf(near).split(',').map(Number);
  const oc = ctx.grid.cellCenter(origin[0] + 3, origin[1]), originCell = ctx.grid.worldToCell(oc[0], oc[1]);
  const originId = originCell.q + ',' + originCell.r;
  let doc = withEchoes([near, far]);
  assert.equal(L.locateSoulEcho({ doc, ctx, originCellId: originId, random: () => 0 }).targetAnchorId, near);
  doc = must(collect(doc, near, true));
  assert.equal(L.locateSoulEcho({ doc, ctx, originCellId: originId, random: () => 0 }).targetAnchorId, far);
  doc = must(collect(doc, near, false, AT3));
  assert.equal(L.locateSoulEcho({ doc, ctx, originCellId: originId, random: () => 0 }).targetAnchorId, near);
});

/* ============================================================ animation plan + session state machine ============================================================ */

test('animationPlan: two or more full turns + the exact bearing; shorter for "here"; direct with reduced motion', () => {
  const dir = L.animationPlan({ type: 'direction', bearing: 37.5 }, false);
  assert.equal(dir.finalAngle, 720 + 37.5); assert.ok(dir.durationMs >= 1300 && dir.durationMs <= 1700); assert.equal(dir.startAngle, 0);
  const here = L.animationPlan({ type: 'here', bearing: null }, false);
  assert.ok(here.durationMs < dir.durationMs); assert.equal(here.finalAngle % 360, 0);
  const red = L.animationPlan({ type: 'direction', bearing: 37.5 }, true);
  assert.equal(red.finalAngle, 37.5, 'no extra turns'); assert.ok(red.durationMs <= 300);
  assert.equal(L.animationPlan({ type: 'here' }, true).finalAngle, 0);
});

function fakeTimers() {
  const q = []; let id = 0;
  return {
    schedule(fn, ms) { const h = ++id; q.push({ h, fn, ms }); return h; },
    cancel(h) { const i = q.findIndex(x => x.h === h); if (i >= 0) q.splice(i, 1); },
    pending: () => q.length,
    fireAll() { const run = q.splice(0); run.forEach(x => x.fn()); },
    /** fires a callback that was cancelled (a stale one), the way a real timer that already left the queue would */
    stash: () => q.slice(),
  };
}
const outcome = (over) => Object.assign({ ok: true, type: 'direction', originCellId: '3,4', targetAnchorId: 'mk-010', bearing: 33.8, direction: L.directionForBearing(33.8) }, over || {});

test('session: selecting -> animating -> result, freezing the bearing; the direction exists only in the result', () => {
  const tm = fakeTimers(), log = [];
  const s = L.createLocateSession({ schedule: tm.schedule, cancel: tm.cancel, reducedMotion: () => false, onChange: (st, ev) => log.push([ev, st && st.status]) });
  assert.equal(s.state, null); assert.equal(s.isActive(), false);
  s.start(); assert.equal(s.state.status, 'selecting'); assert.equal(s.state.directionIndex, null);
  assert.equal(s.select(outcome(), 'sig-1').status, 'animating');
  assert.equal(s.state.bearing, 33.8); assert.equal(s.state.directionIndex, 2); assert.equal(s.state.sig, 'sig-1'); assert.equal(s.state.plan.finalAngle, 720 + 33.8);
  assert.equal(tm.pending(), 1, 'exactly one pending completion');
  tm.fireAll();
  assert.equal(s.state.status, 'result'); assert.equal(s.state.bearing, 33.8, 'the frozen bearing is retained'); assert.equal(s.state.resultType, 'direction');
  assert.deepEqual(log.map(x => x[0]), ['selecting', 'animating', 'result']);
  assert.ok(Object.isFrozen(s.state));
  assert.equal(s.select(outcome({ bearing: 200 })), null, 'a result cannot be re-selected without choosing another location');
  s.chooseAnother();
  assert.equal(s.state.status, 'selecting'); assert.equal(s.state.bearing, null); assert.equal(s.state.targetAnchorId, null); assert.equal(s.state.originCellId, null);
  s.close(); assert.equal(s.state, null); assert.equal(log[log.length - 1][0], 'closed');
});

test('session: close, choose-another, restart and dispose cancel the pending completion; a stale callback can never reopen a result', () => {
  const tm = fakeTimers();
  const log = [];
  const s = L.createLocateSession({ schedule: tm.schedule, cancel: tm.cancel, reducedMotion: () => false, onChange: (st, ev) => log.push(ev) });
  s.start(); s.select(outcome());
  const stale = tm.stash()[0].fn;
  s.close();
  assert.equal(tm.pending(), 0, 'close cancels the timer');
  stale();                                                  // a late fire of the cancelled completion
  assert.equal(s.state, null, 'a stale completion cannot reopen a closed result');
  s.start(); s.select(outcome()); const stale2 = tm.stash()[0].fn;
  s.chooseAnother(); stale2();
  assert.equal(s.state.status, 'selecting', 'nor resurrect one after Choose another');
  s.select(outcome({ bearing: 100, direction: L.directionForBearing(100) })); const stale3 = tm.stash()[0].fn;
  s.start(); stale3();
  assert.equal(s.state.status, 'selecting');
  s.select(outcome()); s.dispose();
  assert.equal(tm.pending(), 0, 'dispose (unmount) cancels the pending completion');
  const before = log.length; tm.fireAll();
  assert.equal(log.length, before, 'nothing notifies after dispose');
  assert.equal(s.start(), null);
});

test('session: "here" results and the reduced-motion path use their own short plans and the same information', () => {
  const tm = fakeTimers();
  const s = L.createLocateSession({ schedule: tm.schedule, cancel: tm.cancel, reducedMotion: () => true });
  s.start(); s.select(outcome({ type: 'here', bearing: null, direction: null }));
  assert.equal(s.state.resultType, 'here'); assert.equal(s.state.directionIndex, null); assert.equal(s.state.plan.reduced, true);
  tm.fireAll(); assert.equal(s.state.status, 'result');
  const s2 = L.createLocateSession({ schedule: tm.schedule, cancel: tm.cancel, reducedMotion: () => true });
  s2.start(); s2.select(outcome()); assert.equal(s2.state.plan.finalAngle, 33.8, 'reduced motion rotates straight to the bearing'); assert.equal(s2.state.directionIndex, 2);
  assert.equal(s2.select({ ok: false }), null);
});

/* ============================================================ GM-only isolation ============================================================ */

test('isolation: collected / Locate state never reaches the player projection, the print projection or the print model', () => {
  let doc = withEchoes(SANCT.slice(0, 9));
  doc = must(collect(doc, SANCT[0], true));
  for (const proj of [P.buildPlayerProjection(doc, ctx), P.buildPrintProjection(doc, ctx)]) {
    const text = JSON.stringify(proj).toLowerCase();
    assert.ok(!/echo|collected|locate|compass|bearing|mk-/.test(text), 'leaked: ' + text.slice(0, 80));
  }
  const model = PR.buildPrintModel(doc, ctx, template);
  assert.ok(!/echo|collected|locate|compass|bearing/.test(JSON.stringify(model).toLowerCase()), 'the print model carries no Echo data');
  for (const f of ['js/journey2-projection.js', 'js/journey2-print.js']) assert.doesNotMatch(strip(read(f)), /soulEcho|collected|Locate/, f);
});

test('isolation: Locate keeps no storage keys and the document has no Locate fields', () => {
  assert.doesNotMatch(strip(read('js/journey2-locate.js')), /localStorage|sessionStorage|SafeStorage|document\.|window\./);
  const store = strip(read('js/journey2-store.js'));
  assert.doesNotMatch(store, /locate/i);
  const doc = JSON.parse(M.serializeBackup(withEchoes(SANCT.slice(0, 2))));
  assert.deepEqual(Object.keys(doc.soulEchoes).sort(), ['anchorIds', 'collectedAnchorIds'], 'no timestamps, names, results or party location');
  assert.ok(!/bearing|locate|compass|"origin/i.test(JSON.stringify(doc)));
});

/* ============================================================ view source guards ============================================================ */

const fn = (from, to) => view.slice(view.indexOf('function ' + from), view.indexOf('function ' + to, view.indexOf('function ' + from) + 1));

test('view: Locate is a real, GM-only toolbar button inside the Echo group (hidden in Player Preview), unavailable with a reason', () => {
  assert.match(view, /<button type="button" class="btn btn-ghost btn-sm j2-tool" data-j2-echo-locate aria-pressed="false" aria-describedby="j2-locate-reason">/);
  assert.match(fn('applyPreviewChrome', 'enterPreview'), /ui\.echoGroup\.hidden = on/);
  const ui = fn('updateEchoUi', 'placeSoulEchoes');
  assert.match(ui, /aria-disabled/); assert.match(ui, /locateReason\.textContent/); assert.match(ui, /ui\.echoLocate\.title/);
  const av = fn('locateAvailability', 'startLocate');
  assert.match(av, /journey2_echo_locate_none/); assert.match(av, /journey2_echo_locate_all/);
  assert.match(fn('enterPreview', 'leavePreview'), /exitLocate\(\{ quiet: true \}\)/);
});

test('view: entering Locate cancels every competing tool and leaves camera, sidebar and fog alone', () => {
  const b = fn('startLocate', 'exitLocate');
  for (const re of [/cancelTransient\(\)/, /cancelFogStroke\(\)/, /setFogTool\(null/, /closeMenus\(\)/, /closeInspector\(/, /closeSanctuary\(/, /sel\.tileId = null/]) assert.match(b, re);
  assert.doesNotMatch(b, /setCamera|fitToView|toggleSide|sideCollapsed|revealed|dispatch\(/, 'no camera / sidebar / fog / document change');
  assert.match(fn('setFogTool', 'toggleFogState'), /exitLocate\(\{ quiet: true \}\)/, 'starting Reveal / Hide leaves Locate');
  assert.match(fn('armStock', 'computePreview'), /exitLocate/);
  assert.match(fn('onHandleDown', 'onHandleMove'), /exitLocate/);
});

test('view: while Locate runs, clicks pick a hex (tiles, sanctuary icons and markers never intercept) and Escape leaves it', () => {
  const click = fn('handleMapClick', 'selectTile');
  assert.ok(click.indexOf('locateSession.state') > -1 && click.indexOf('locateSession.state') < click.indexOf('sanctuaryAtScreen'), 'Locate is decided before any sanctuary / tile hit-test');
  assert.match(click, /foggable\.has\(id\)/); assert.match(click, /chooseLocateOrigin\(id\)/);
  assert.match(fn('onViewportDown', 'onViewportMove'), /!locateSession\.isActive\(\)/, 'no tile drag while Locate is active');
  assert.match(fn('onViewportMove', 'onViewportUp'), /updateLocateHover/);
  assert.match(fn('onViewportUp', 'onViewportCancel'), /insideViewport\(e\)/, 'a release under the sidebar never picks a hex');
  const esc = fn('onDocumentKey', 'fogSpaceTarget');
  assert.ok(esc.indexOf('locateSession.isActive()') > esc.indexOf('if (tr)') && esc.indexOf('locateSession.isActive()') < esc.indexOf('if (previewMode)'));
});

test('view: a search is one frozen draw, creates no history and never touches fog or names; stale results close on any Echo change', () => {
  const pick = fn('chooseLocateOrigin', 'chooseLocateAgain');
  assert.match(pick, /Locate\.locateSoulEcho/); assert.match(pick, /locateSession\.select\(out, echoSig\(\)\)/);
  assert.doesNotMatch(pick, /dispatch\(|history|persist|revealed|setCellsRevealed|setSanctuaryNameRevealed/);
  const sync = fn('syncLocate', 'onLocateChange');
  assert.match(sync, /journey2_loc_none_distributed/); assert.match(sync, /journey2_loc_stale/); assert.match(sync, /journey2_loc_none_remain/);
  assert.match(fn('afterDocChange', 'undo'), /syncLocate\(\)/, 'dispatch, Undo and Redo all pass through it');
  assert.match(fn('replaceDocument', 'startEmptyMap'), /exitLocate\(\{ quiet: true \}\)/, 'import / reset closes Locate');
  assert.match(fn('dispose', 'listen'), /locateSession\.dispose\(\)/, 'unmount / route change cancels the pending completion');
});

test('view: the compass is transient, screen-space, decorative, and shows text only once the result has settled', () => {
  const panel = fn('renderLocatePanel', 'toggleEchoCollected');
  assert.match(panel, /if \(!done\) \{ L\.line\.textContent = ''/, 'no direction text while animating');
  assert.match(panel, /Locate\.SIXTEEN_DIRECTIONS\[st\.directionIndex\]/); assert.match(panel, /journey2_loc_here/);
  assert.match(view, /<svg class="j2-compass"[^>]*aria-hidden="true"/);
  assert.match(view, /<aside class="j2-region-inspector j2-locate" id="j2-locate" role="dialog" aria-modal="false" aria-labelledby="j2-locate-title"/);
  assert.match(view, /data-j2-l="out" role="status" aria-live="polite"/);
  assert.match(fn('onLocateChange', 'updateLocateHover'), /ui\.locate\.focus/, 'focus enters the popover when the result is ready');
  assert.match(fn('hideLocatePopover', 'renderLocatePanel'), /ui\.echoLocate\.focus/, 'closing returns focus to the toolbar button');
  assert.match(view, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(panel + fn('paintLocate', 'locateAnchor'), /distance|targetAnchorId|sanctuaryTitle|sanctuaryEntry|\.name\b/, 'no target, name or distance in the result UI');
  assert.doesNotMatch(strip(view), /setInterval/, 'no uncontrolled timer loop');
  const store = fn('saveUiPrefs', 'toggleSide');
  assert.doesNotMatch(store, /locate/i);
});

test('view: the sanctuary overlay carries the Soul Echo row (explicit text + a real button), one command, overlay stays open', () => {
  assert.match(view, /<section class="j2-sanc-player j2-sanc-echo"[^>]*data-j2-s="echo" hidden>/);
  assert.ok(view.indexOf('data-j2-s="echo"') > view.indexOf('data-j2-s="player"') && view.indexOf('data-j2-s="echo"') < view.indexOf('data-j2-s="rows"'), 'before the generated characteristics, after the player-map row');
  const body = fn('toggleEchoCollected', 'locateDebug');
  assert.match(body, /type: 'setSoulEchoCollected'/); assert.match(body, /, true\);/, 'keepTransient: the overlay and camera stay');
  assert.match(body, /journey2_live_echo_collected/); assert.match(body, /journey2_live_echo_restored/);
  assert.doesNotMatch(body, /closeSanctuary|setCamera/);
  assert.match(fn('renderSanctuaryPanel', 'sanctuaryAnchorPx'), /ui\.s\.echo\.hidden = !echo/, 'a sanctuary without an Echo shows no empty section');
  assert.match(fn('renderSanctuaryPanel', 'sanctuaryAnchorPx'), /journey2_echo_state_collected/);
  assert.match(view, /const got = new Set\(doc\.soulEchoes\.collectedAnchorIds\)/, 'a collected Echo is drawn differently on the GM map');
});

/* ============================================================ localization + docs ============================================================ */

test('i18n: every Locate string exists in en and ru with identical placeholders, and the view / locate module hard-code no copy', () => {
  const keys = Object.keys(i18n.en).filter(k => /^journey2_(loc_|echo_locate|echo_section|echo_state|echo_mark|echo_restore|echo_failed|live_echo_collected|live_echo_restored)/.test(k));
  assert.ok(keys.length >= 55, 'got ' + keys.length);
  const ph = s => (s.match(/\{[a-z]+\}/g) || []).sort().join();
  for (const k of keys) { assert.ok(i18n.ru[k] && i18n.ru[k].length, 'ru missing ' + k); assert.equal(ph(i18n.ru[k]), ph(i18n.en[k]), 'placeholders ' + k); }
  assert.match(i18n.en.journey2_loc_points, /\{direction\}/);
  for (const k of (view.match(/journey2_(loc_|echo_locate|echo_section|echo_state|echo_mark|echo_restore|echo_failed|live_echo_collected|live_echo_restored)[a-z_]*/g) || []).filter(k => !k.endsWith('_'))) assert.ok(i18n.en[k], 'the view uses an undefined key ' + k);   // 'journey2_loc_dir_' + id is built from the table
  const ru = ['Север', 'Северо-северо-восток', 'Северо-восток', 'Востоко-северо-восток', 'Восток', 'Востоко-юго-восток', 'Юго-восток', 'Юго-юго-восток', 'Юг', 'Юго-юго-запад', 'Юго-запад', 'Западо-юго-запад', 'Запад', 'Западо-северо-запад', 'Северо-запад', 'Северо-северо-запад'];
  const en = ['North', 'North-northeast', 'Northeast', 'East-northeast', 'East', 'East-southeast', 'Southeast', 'South-southeast', 'South', 'South-southwest', 'Southwest', 'West-southwest', 'West', 'West-northwest', 'Northwest', 'North-northwest'];
  L.SIXTEEN_DIRECTIONS.forEach((d, i) => { assert.equal(i18n.ru[d.labelKey], ru[i]); assert.equal(i18n.en[d.labelKey], en[i]); assert.equal(i18n.en[d.abbrKey], d.abbreviation); });
  assert.deepEqual(L.SIXTEEN_DIRECTIONS.map(d => i18n.ru[d.abbrKey]), ['С', 'ССВ', 'СВ', 'ВСВ', 'В', 'ВЮВ', 'ЮВ', 'ЮЮВ', 'Ю', 'ЮЮЗ', 'ЮЗ', 'ЗЮЗ', 'З', 'ЗСЗ', 'СЗ', 'ССЗ']);
  assert.equal(i18n.ru.journey2_loc_searching, 'Компас ищет Эхо...'); assert.equal(i18n.ru.journey2_loc_here, 'Ближайшее Эхо Души находится здесь.');
  assert.doesNotMatch(strip(read('js/journey2-locate.js')), /North|Север|north-|'N'.*'E'.*'S'.*'W'.*translate/, 'no translated cardinal words in geometry code');
  assert.doesNotMatch(strip(view), /'(The compass|Locate Soul|Choose another|Mark collected|Restore Echo)/);
});

test('wiring: the script loads before the view and is in the build guard; documentation records PD-030', () => {
  const html = read('index.html');
  assert.match(html, /<script src="js\/journey2-locate\.js" data-cache-version="ui"><\/script>/);
  assert.ok(html.indexOf('journey2-locate.js') > html.indexOf('journey2-geometry.js') && html.indexOf('journey2-locate.js') < html.indexOf('journey2-view.js'));
  assert.match(read('scripts/check-journey2-build.js'), /'js\/journey2-locate\.js'/);
  const pd = read('docs/product-decisions.md');
  assert.match(pd, /## PD-030/); assert.match(pd, /Locate Soul Echoes/);
  const arch = read('docs/architecture.md');
  assert.match(arch, /Locate Soul Echoes/); assert.match(arch, /collectedAnchorIds/); assert.match(arch, /journey2-locate\.js/);
  assert.match(read('CLAUDE.md'), /PD-030/);
});
