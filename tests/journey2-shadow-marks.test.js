'use strict';
/* Journey 2: Shadow marks (PD-041). Pure — no browser. Covers the optional `shadowMarks` document key (schema, canonical form, command, tile-edit
   normalization), the deterministic seeker planner behind "Locate Soul Echoes" (nearest block, ties, packing, skulls, obstacles, exact "-"),
   the projection / print carrying the moved X's, and the source guards. The real bubble, drawing and Undo coalescing are checked in a browser
   by scripts/journey2/lib/locate-checks.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Geo = require('../js/journey2-geometry.js');
const M = require('../js/journey2-model.js');
const S = require('../js/journey2-shadow-marks.js');
const P = require('../js/journey2-projection.js');
const PR = require('../js/journey2-print.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const template = JSON.parse(read('data/journey2/map-template.json'));
const anchorsDoc = JSON.parse(read('data/journey2/map-anchors.json'));
const ctx = M.createContext(template, anchorsDoc);
const AT = '2026-10-08T10:00:00.000Z', AT2 = '2026-10-08T11:00:00.000Z';
const must = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.doc; };
const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** A row of free hexes along one axial axis: (q0 + i, r0) for i in [-4, 24]. Found once, so the tests do not depend on a hard-coded corner of the map. */
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
  return M.batchFromRegion({ habitat: Object.assign({ biome: 'forest', blighted: false, overtaken: false, source: 'rolled', rolls: [11] }, habitat), terrain: { value: 2, source: 'rolled' }, size: size || 10, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 5 }, { id: id, createdAt: AT, quantity: { value: size || 10, source: 'rolled' } });
}
const BLIGHT = { biome: 'forest', blighted: true, overtaken: false, rolls: [1, 11] };
const SKULL = { biome: null, blighted: true, overtaken: true, rolls: [1, 1] };

/** A document with the given tiles (set directly, so a test can lay out separate blocks without the placement rules getting in the way). */
function world(specs) {
  let doc = M.emptyDocument(ctx, AT);
  const batches = [], tiles = [];
  specs.forEach((s, bi) => {
    const b = batch('b' + bi, s.habitat, s.cells.length);
    batches.push(b);
    s.cells.forEach((c, ti) => tiles.push({ id: 't' + bi + '-' + ti, batchId: b.id, cell: c }));
  });
  return Object.assign({}, doc, { batches: batches, tiles: tiles });
}
const withMarks = (doc, marks) => Object.assign({}, doc, { shadowMarks: marks });
const xSet = doc => Array.from(M.getShadowXSet(doc)).sort(M.compareCellKeys);
const docAt = (doc, plan, k) => must(M.apply(doc, { type: 'setShadowMarks', added: plan.frames[k].added, suppressed: plan.frames[k].suppressed, at: AT2 }, ctx));

/* ============================================================ schema + command ============================================================ */

test('shadow marks: a new document has none, an old document without the key loads as none, schemaVersion stays 1', () => {
  assert.deepEqual(M.emptyDocument(ctx, AT).shadowMarks, { added: [], suppressed: [] });
  const old = JSON.parse(M.serializeBackup(M.emptyDocument(ctx, AT)));
  delete old.shadowMarks;
  const r = M.validateDocument(old, ctx);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.doc.shadowMarks, { added: [], suppressed: [] });
  assert.equal(M.SCHEMA_VERSION, 1);
});

test('shadow marks: with no stored marks the X\'s are exactly the blighted tiles, and an overtaken tile holds one pending skull X', () => {
  const doc = world([{ habitat: BLIGHT, cells: [at(0), at(1)] }, { habitat: SKULL, cells: [at(5)] }, { habitat: {}, cells: [at(9)] }]);
  assert.deepEqual(xSet(doc), [at(0), at(1)].sort(M.compareCellKeys));
  assert.deepEqual(Array.from(M.getPendingSkullSet(doc)), [at(5)]);
});

test('shadow marks: the displayed set is (blighted cells - suppressed) + added', () => {
  const doc = withMarks(world([{ habitat: BLIGHT, cells: [at(0), at(1)] }, { habitat: SKULL, cells: [at(5)] }]), { added: [at(3)], suppressed: [at(0), at(5)] });
  assert.deepEqual(xSet(doc), [at(1), at(3)].sort(M.compareCellKeys));
  assert.equal(M.getPendingSkullSet(doc).size, 0, 'a suppressed skull cell has released its X');
});

test('shadow marks: the command stores a canonical form — sorted, unique, only meaningful cells — and is a no-op when nothing changes', () => {
  const doc = world([{ habitat: BLIGHT, cells: [at(0), at(1)] }]);
  const next = must(M.apply(doc, { type: 'setShadowMarks', added: [at(4), at(3), at(4), at(0)], suppressed: [at(1), at(1), at(9)], at: AT2 }, ctx));
  assert.deepEqual(next.shadowMarks, { added: [at(3), at(4)].sort(M.compareCellKeys), suppressed: [at(1)] }, 'a duplicate, a home cell in `added` and a stale suppression are dropped');
  const again = M.apply(next, { type: 'setShadowMarks', added: next.shadowMarks.added, suppressed: next.shadowMarks.suppressed, at: AT2 }, ctx);
  assert.equal(again.ok, true); assert.equal(again.noop, true); assert.equal(again.doc, next);
});

test('shadow marks: bad input is refused (not arrays, malformed, off-map, an X on a printed icon)', () => {
  const doc = M.emptyDocument(ctx, AT);
  const icon = Array.from(ctx.sanctuaryCells)[0];
  for (const bad of [{ added: 'x', suppressed: [] }, { added: ['nope'], suppressed: [] }, { added: ['99999,99999'], suppressed: [] }, { added: [icon], suppressed: [] }]) {
    const r = M.apply(doc, Object.assign({ type: 'setShadowMarks', at: AT2 }, bad), ctx);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.equal(r.error.code, 'bad-shadow-marks');
  }
});

test('shadow marks: a backup round-trips them and import canonicalizes; unknown keys are rejected', () => {
  const doc = withMarks(world([{ habitat: BLIGHT, cells: [at(0)] }]), { added: [at(3), at(2)], suppressed: [at(0)] });
  const back = M.parseBackupText(M.serializeBackup(doc), ctx);
  assert.equal(back.ok, true, JSON.stringify(back));
  assert.deepEqual(back.doc.shadowMarks, { added: [at(2), at(3)].sort(M.compareCellKeys), suppressed: [at(0)] });
  const j = JSON.parse(M.serializeBackup(doc)); j.shadowMarks.extra = 1;
  assert.equal(M.validateDocument(j, ctx).ok, false);
  assert.equal(M.isEmptyDocument(withMarks(M.emptyDocument(ctx, AT), { added: [at(3)], suppressed: [] })), false);
});

test('shadow marks: a tile edit keeps the stored marks canonical (a returned blighted tile releases its suppression)', () => {
  let doc = M.emptyDocument(ctx, AT);
  doc = must(M.apply(doc, { type: 'createBatch', batch: batch('b1', BLIGHT, 3), at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'place', batchId: 'b1', tiles: [{ id: 't1', cell: at(0) }, { id: 't2', cell: at(1) }], at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'setShadowMarks', added: [at(8)], suppressed: [at(0)], at: AT2 }, ctx));
  assert.deepEqual(xSet(doc), [at(1), at(8)].sort(M.compareCellKeys));
  const back = must(M.apply(doc, { type: 'returnTile', tileId: 't1', at: AT2 }, ctx));
  assert.deepEqual(back.shadowMarks, { added: [at(8)], suppressed: [] }, 'the suppression of a cell with no blighted tile is dropped, the loose X stays');
  assert.deepEqual(xSet(back), [at(1), at(8)].sort(M.compareCellKeys));
});

/* ============================================================ planner ============================================================ */

test('planner: no X and no unreleased skull anywhere -> null (nothing is offered)', () => {
  assert.equal(S.createSeekerPlan({ doc: world([{ habitat: {}, cells: [at(0)] }]), ctx, origin: at(10) }), null);
  assert.equal(S.createSeekerPlan({ doc: M.emptyDocument(ctx, AT), ctx, origin: at(10) }), null);
});

test('planner: a block walks one hex closer per step, X\'s never stack, the count is conserved, and the nearest X ends on the origin', () => {
  const doc = world([{ habitat: BLIGHT, cells: [at(0), at(1), at(2)] }]);
  const plan = S.createSeekerPlan({ doc, ctx, origin: at(10) });
  assert.deepEqual(plan.frames[0], { added: [], suppressed: [] });
  const f1 = docAt(doc, plan, 1);
  assert.deepEqual(xSet(f1), [at(1), at(2), at(3)].sort(M.compareCellKeys), 'the whole row shifts by one');
  for (let k = 0; k <= plan.maxStep; k++) {
    const d = docAt(doc, plan, k), xs = xSet(d);
    assert.equal(xs.length, 3, 'count conserved at step ' + k);
    assert.equal(new Set(xs).size, 3);
  }
  const last = xSet(docAt(doc, plan, plan.maxStep));
  assert.deepEqual(last, [at(8), at(9), at(10)].sort(M.compareCellKeys), 'packed against the origin: the front X stands on it, the rest right behind');
  assert.equal(plan.maxStep, 8, 'the front X needs 10 hexes to the origin... minus the 2 the row already started ahead of its tail');
});

test('planner: a step beyond the packed state changes nothing, and the number of steps is capped at 20', () => {
  const doc = world([{ habitat: BLIGHT, cells: [at(0)] }]);
  const far = S.createSeekerPlan({ doc, ctx, origin: at(24) });
  assert.equal(far.maxStep, S.MAX_STEPS);
  assert.equal(far.frames.length, S.MAX_STEPS + 1);
  const near = S.createSeekerPlan({ doc, ctx, origin: at(3) });
  assert.equal(near.maxStep, 3);
  assert.deepEqual(xSet(docAt(doc, near, 3)), [at(3)]);
  const standing = S.createSeekerPlan({ doc, ctx, origin: at(0) });
  assert.equal(standing.maxStep, 0, 'already on the origin: nothing can move');
});

test('planner: only the nearest block moves; the others stand still, even when it has stopped', () => {
  const doc = world([{ habitat: BLIGHT, cells: [at(0), at(1)] }, { habitat: BLIGHT, cells: [at(18), at(19)] }]);
  const plan = S.createSeekerPlan({ doc, ctx, origin: at(9) });
  const end = xSet(docAt(doc, plan, plan.maxStep));
  assert.ok(end.includes(at(18)) && end.includes(at(19)), 'the far block never started');
  assert.equal(plan.movers, 2);
});

test('planner: blocks at exactly the same distance both move', () => {
  const doc = world([{ habitat: BLIGHT, cells: [at(0)] }, { habitat: BLIGHT, cells: [at(20)] }]);
  const plan = S.createSeekerPlan({ doc, ctx, origin: at(10) });
  assert.equal(plan.movers, 2);
  assert.deepEqual(xSet(docAt(doc, plan, 1)), [at(1), at(19)].sort(M.compareCellKeys));
  assert.deepEqual(xSet(docAt(doc, plan, plan.maxStep)), [at(10), at(11)].sort(M.compareCellKeys), 'the nearer-by-id one stands on the origin, the other packs right beside it; a hex never holds two');
});

test('planner: an overtaken block releases one X per skull; skulls stay and never receive an X', () => {
  const doc = world([{ habitat: SKULL, cells: [at(0), at(1)] }]);
  const plan = S.createSeekerPlan({ doc, ctx, origin: at(10) });
  assert.equal(plan.movers, 2);
  const f1 = docAt(doc, plan, 1);
  assert.equal(xSet(f1).length, 2, 'both skulls release their X on the first step (the rear one slips past its neighbour skull)');
  assert.equal(M.getPendingSkullSet(f1).size, 0);
  assert.ok(xSet(f1).includes(at(2)), 'the X of the front skull steps straight toward the origin');
  const end = docAt(doc, plan, plan.maxStep);
  assert.equal(M.getPendingSkullSet(end).size, 0, 'every skull has released its X exactly once');
  assert.equal(xSet(end).length, 2);
  for (const c of xSet(end)) assert.ok(!M.shadowBase(end).skull.has(c), 'no X on a skull');
  assert.deepEqual(end.tiles.map(t => t.cell), doc.tiles.map(t => t.cell), 'the skull tiles themselves are untouched');
});

test('planner: X blocks and skull blocks never merge into one block', () => {
  const doc = world([{ habitat: BLIGHT, cells: [at(0)] }, { habitat: SKULL, cells: [at(1)] }]);
  const plan = S.createSeekerPlan({ doc, ctx, origin: at(10) });
  assert.equal(plan.movers, 1, 'only the nearer kind moves: the skull (distance 9) beats the X (distance 10)');
  assert.deepEqual(S.componentsOf(new Set([at(0), at(1)])).length, 1, 'adjacency by itself would join them — the planner groups each kind on its own');
});

test('planner: a printed sanctuary / destination hex is never entered, and the origin on one leaves the X\'s packed beside it', () => {
  const icon = Array.from(ctx.sanctuaryCells)[0], c = Geo.parseCellId(icon);
  const free = Geo.NEIGHBOR_DELTAS.map(d => Geo.cellId(c.q + d.dq, c.r + d.dr)).filter(id => { const p = Geo.parseCellId(id); return ctx.placeable(p.q, p.r); });
  assert.ok(free.length >= 1);
  const doc = world([{ habitat: BLIGHT, cells: [free[0]] }]);
  const plan = S.createSeekerPlan({ doc, ctx, origin: icon });
  for (let k = 0; k <= plan.maxStep; k++) for (const x of xSet(docAt(doc, plan, k))) assert.ok(!ctx.sanctuaryCells.has(x), 'never on a printed icon hex');
});

test('planner: deterministic, no RNG — the same inputs give the same frames, and every frame is a function of the start and the step alone', () => {
  const doc = world([{ habitat: BLIGHT, cells: [at(0), at(1), at(2), at(0, 1), at(1, 1)] }]);
  const a = S.createSeekerPlan({ doc, ctx, origin: at(12, 0) }), b = S.createSeekerPlan({ doc, ctx, origin: at(12, 0) });
  assert.deepEqual(a, b);
  const src = strip(read('js/journey2-shadow-marks.js'));
  assert.doesNotMatch(src, /Math\.random|Date\.now|localStorage|document\.|window\./);
});

test('planner: "-" is the exact inverse of "+": stepping back to frame 0 restores the very same document content', () => {
  const doc = world([{ habitat: BLIGHT, cells: [at(0), at(1)] }, { habitat: SKULL, cells: [at(2, 1)] }]);
  const plan = S.createSeekerPlan({ doc, ctx, origin: at(14) });
  const there = docAt(doc, plan, Math.min(3, plan.maxStep)), back = docAt(there, plan, 0);
  assert.deepEqual(back.shadowMarks, { added: [], suppressed: [] });
  assert.deepEqual(xSet(back), xSet(doc));
});

/* ============================================================ players + print ============================================================ */

test('projection: a moved X is shown to players only on a revealed cell, on a tile or on an empty hex', () => {
  const doc0 = world([{ habitat: BLIGHT, cells: [at(0)] }, { habitat: {}, cells: [at(2)] }]);
  const plan = S.createSeekerPlan({ doc: doc0, ctx, origin: at(5) });
  let doc = docAt(doc0, plan, 2);                                  // the X now stands on at(2), a plain tile
  const hidden = P.buildPlayerProjection(doc, ctx);
  assert.deepEqual(hidden.overlays, []); assert.deepEqual(hidden.shadowMarks, []);
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: [at(2), at(4)], revealed: true, at: AT2 }, ctx));
  const shown = P.buildPlayerProjection(doc, ctx);
  assert.equal(shown.overlays.length, 1);
  assert.equal(shown.overlays[0].blightMark, true, 'the X moved onto a non-blighted tile');
  assert.deepEqual(shown.shadowMarks, [], 'nothing floats: the X is on a tile');
  doc = docAt(doc0, plan, 4);                                      // now on at(4), a hex with no tile
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: [at(4)], revealed: true, at: AT2 }, ctx));
  const floating = P.buildPlayerProjection(doc, ctx);
  assert.deepEqual(floating.shadowMarks.map(m => Geo.cellId(m.q, m.r)), [at(4)]);
  assert.deepEqual(Object.keys(floating.shadowMarks[0]).sort(), ['q', 'r']);
});

test('projection: the home tile of an X that left no longer carries the mark', () => {
  const doc0 = world([{ habitat: BLIGHT, cells: [at(0)] }]);
  const plan = S.createSeekerPlan({ doc: doc0, ctx, origin: at(5) });
  let doc = docAt(doc0, plan, 1);
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: [at(0)], revealed: true, at: AT2 }, ctx));
  assert.equal(P.buildPlayerProjection(doc, ctx).overlays[0].blightMark, false);
});

test('print: moved X\'s reach the page that holds them and nothing else changes in the model', () => {
  const doc0 = world([{ habitat: BLIGHT, cells: [at(0)] }]);
  const plan = S.createSeekerPlan({ doc: doc0, ctx, origin: at(5) });
  let doc = docAt(doc0, plan, 3);
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: [at(3)], revealed: true, at: AT2 }, ctx));
  const model = PR.buildPrintModel(doc, ctx, template);
  const marks = model.pages.reduce((n, pg) => n + (pg.marks || []).length, 0);
  assert.ok(marks >= 1, 'the floating X is on at least one page');
  for (const pg of model.pages) for (const m of pg.marks || []) assert.deepEqual(Object.keys(m).sort(), ['q', 'r']);
  assert.equal(model.printMode, 'bw');
});

/* ============================================================ source guards ============================================================ */

test('guards: the planner module reads no fog / environments / names, and the view keeps the bubble GM-only and the session transient', () => {
  const src = strip(read('js/journey2-shadow-marks.js'));
  assert.doesNotMatch(src, /revealedCells|playerVisibility|soulEchoes|environmentId|sanctuaries\.entries/);
  const view = strip(read('js/journey2-view.js'));
  assert.match(view, /createSeekerPlan/);
  assert.doesNotMatch(view, /localStorage[^;]*seeker|seeker[^;]*localStorage/i);
});

test('documentation: PD-041, the architecture note and the QA checklist exist', () => {
  const pd = read('docs/product-decisions.md'), arch = read('docs/architecture.md'), qa = read('docs/manual-qa.md');
  assert.match(pd, /## PD-041/); assert.match(pd, /shadowMarks/); assert.match(pd, /one bubble session is one Undo entry/);
  assert.match(arch, /Shadowblight control \(PD-041\)/); assert.match(qa, /Shadowblight control \(GM only, PD-041\)/);
  const i18n = JSON.parse(read('data/i18n.json'));
  for (const k of ['journey2_seek_group', 'journey2_seek_less', 'journey2_seek_more', 'journey2_seek_close', 'journey2_seek_count', 'journey2_seek_settled', 'journey2_live_seek']) assert.ok(i18n.en[k] && i18n.ru[k], k);
});
