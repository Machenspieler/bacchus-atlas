'use strict';
/* Journey 2: Soul Echoes (PD-022). Pure — no browser. Covers the document's optional `soulEchoes` field, the
   `setSoulEchoes` command and its Undo/Redo behaviour, the book-rule placement planner, the guarantee that the
   player projection can never carry an Echo, localization and the source guards that keep the layer GM-only.
   The real pointer/dialog behaviour is checked by hand (docs/manual-qa.md "Journey 2 map editor"). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../js/journey2-model.js');
const P = require('../js/journey2-projection.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const template = JSON.parse(read('data/journey2/map-template.json'));
const anchorsDoc = JSON.parse(read('data/journey2/map-anchors.json'));
const ctx = M.createContext(template, anchorsDoc);
const AT = '2026-10-07T10:00:00.000Z', AT2 = '2026-10-07T11:00:00.000Z';
const must = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.doc; };
const view = read('js/journey2-view.js');

/** Deterministic rng (mulberry32) so the planner tests never flake. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const SANCT = anchorsDoc.anchors.filter(a => a.kind === 'sanctuary').map(a => a.stableId);
const DEST = anchorsDoc.anchors.filter(a => a.kind === 'destination').map(a => a.stableId);

/* ---------------- document ---------------- */

test('context: exposes exactly the 56 sanctuaries (never HORIZON / MARROGATE), west to east', () => {
  assert.equal(ctx.sanctuaries.length, 56);
  for (const d of DEST) assert.equal(ctx.sanctuaryIds.has(d), false);
  for (let i = 1; i < ctx.sanctuaries.length; i++) assert.ok(ctx.sanctuaries[i - 1].x <= ctx.sanctuaries[i].x);
});

test('a new document has no Soul Echoes; a document without the field loads unchanged (schemaVersion stays 1)', () => {
  const doc = M.emptyDocument(ctx, AT);
  assert.deepEqual(doc.soulEchoes, { anchorIds: [], collectedAnchorIds: [] });
  assert.equal(M.SCHEMA_VERSION, 1);
  const old = JSON.parse(JSON.stringify(doc));
  delete old.soulEchoes;
  const r = M.validateDocument(old, ctx);
  assert.equal(r.ok, true);
  assert.deepEqual(r.doc.soulEchoes, { anchorIds: [], collectedAnchorIds: [] });
});

test('validation: dedupes and sorts, rejects more than nine, non-sanctuaries, unknown fields and malformed values', () => {
  const base = M.emptyDocument(ctx, AT);
  const withEchoes = v => Object.assign(JSON.parse(JSON.stringify(base)), { soulEchoes: v });
  const ok = M.validateDocument(withEchoes({ anchorIds: ['mk-012', 'mk-003', 'mk-012'] }), ctx);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.doc.soulEchoes.anchorIds, ['mk-003', 'mk-012']);
  for (const bad of [
    { anchorIds: SANCT.slice(0, 10) },                  // the hard limit is nine
    { anchorIds: [DEST[0]] },                           // a destination is not a sanctuary
    { anchorIds: ['mk-999'] },                          // unknown id
    { anchorIds: [7] }, { anchorIds: 'mk-003' }, { anchorIds: ['mk-003'], extra: 1 }, [], 'x',
  ]) {
    const r = M.validateDocument(withEchoes(bad), ctx);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.equal(r.code, 'invalid');
  }
});

test('backup round trip: Echoes survive export/import byte for byte; an empty document is not "empty" once it has Echoes', () => {
  let doc = M.emptyDocument(ctx, AT);
  assert.equal(M.isEmptyDocument(doc), true);
  doc = must(M.apply(doc, { type: 'setSoulEchoes', anchorIds: SANCT.slice(0, 9), at: AT }, ctx));
  assert.equal(M.isEmptyDocument(doc), false);
  const text = M.serializeBackup(doc);
  const back = M.parseBackupText(text, ctx);
  assert.equal(back.ok, true);
  assert.equal(M.serializeBackup(back.doc), text);
});

/* ---------------- command ---------------- */

test('setSoulEchoes: replaces the set, same set is a noop, bad input is refused whole, nothing else changes', () => {
  const doc0 = M.emptyDocument(ctx, AT);
  const doc1 = must(M.apply(doc0, { type: 'setSoulEchoes', anchorIds: ['mk-020', 'mk-004'], at: AT2 }, ctx));
  assert.deepEqual(doc1.soulEchoes.anchorIds, ['mk-004', 'mk-020']);
  assert.equal(doc1.updatedAt, AT2);
  assert.equal(doc1.batches, doc0.batches);
  assert.equal(doc1.tiles, doc0.tiles);
  assert.equal(doc1.playerVisibility, doc0.playerVisibility);
  const same = M.apply(doc1, { type: 'setSoulEchoes', anchorIds: ['mk-004', 'mk-020'], at: AT2 }, ctx);
  assert.equal(same.noop, true);
  assert.equal(same.doc, doc1);
  assert.equal(M.apply(doc1, { type: 'setSoulEchoes', anchorIds: SANCT.slice(0, 10), at: AT }, ctx).error.code, 'too-many-echoes');
  assert.equal(M.apply(doc1, { type: 'setSoulEchoes', anchorIds: [DEST[0]], at: AT }, ctx).error.code, 'bad-echoes');
  assert.equal(M.apply(doc1, { type: 'setSoulEchoes', anchorIds: 'mk-004', at: AT }, ctx).error.code, 'bad-echoes');
  const cleared = must(M.apply(doc1, { type: 'setSoulEchoes', anchorIds: [], at: AT2 }, ctx));
  assert.deepEqual(cleared.soulEchoes.anchorIds, []);
  assert.equal(M.apply(cleared, { type: 'setSoulEchoes', anchorIds: [], at: AT2 }, ctx).noop, true, 'removing from an empty map is a noop');
});

test('history: placing and removing are one Undo entry each; Redo restores the exact same ids (never re-rolls)', () => {
  const h = M.createHistory();
  const d0 = M.emptyDocument(ctx, AT);
  const plan = M.planSoulEchoes(ctx, seeded(7));
  const d1 = must(M.apply(d0, { type: 'setSoulEchoes', anchorIds: plan.anchorIds, at: AT }, ctx));
  M.historyCommit(h, d0, d1, 'echoesPlace');
  const d2 = must(M.apply(d1, { type: 'setSoulEchoes', anchorIds: [], at: AT2 }, ctx));
  M.historyCommit(h, d1, d2, 'echoesClear');
  assert.equal(h.undo.length, 2);
  const e = M.historyUndo(h);
  assert.equal(e.before, d1);
  assert.deepEqual(e.before.soulEchoes.anchorIds, plan.anchorIds);
  assert.equal(M.historyRedo(h).after, d2);
});

/* ---------------- planner (the book's rule) ---------------- */

test('planner: nine distinct sanctuaries, never a destination, for many seeds', () => {
  for (let s = 1; s <= 300; s++) {
    const p = M.planSoulEchoes(ctx, seeded(s));
    assert.equal(p.anchorIds.length, M.MAX_SOUL_ECHOES);
    assert.equal(new Set(p.anchorIds).size, 9);
    for (const id of p.anchorIds) assert.ok(ctx.sanctuaryIds.has(id), id);
    assert.equal(M.validateDocument(Object.assign(M.emptyDocument(ctx, AT), { soulEchoes: { anchorIds: p.anchorIds } }), ctx).ok, true);
  }
});

test('planner: spread evenly west to east — exactly one Echo in each of nine equal-count west-to-east bands', () => {
  const rank = new Map(ctx.sanctuaries.map((s, i) => [s.id, i]));
  const n = ctx.sanctuaries.length;
  for (let s = 1; s <= 200; s++) {
    const bandOf = r => { for (let i = 0; i < 9; i++) if (r >= Math.floor(i * n / 9) && r < Math.floor((i + 1) * n / 9)) return i; return -1; };
    const bands = new Set(M.planSoulEchoes(ctx, seeded(s)).anchorIds.map(id => bandOf(rank.get(id))));
    assert.equal(bands.size, 9, 'seed ' + s);
  }
});

test('planner: the nine are far apart, not on one latitude and not in a line (book: not predictable)', () => {
  const at = new Map(ctx.sanctuaries.map(x => [x.id, x]));
  let satisfied = 0;
  for (let s = 1; s <= 200; s++) {
    const p = M.planSoulEchoes(ctx, seeded(s));
    if (p.satisfied) satisfied++;
    const pts = p.anchorIds.map(id => at.get(id));
    let sep = Infinity;
    for (let i = 0; i < 9; i++) for (let j = i + 1; j < 9; j++) sep = Math.min(sep, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
    const ys = pts.map(q => q.y);
    if (p.satisfied) {
      assert.ok(sep > 400, 'seed ' + s + ' separation ' + sep);
      assert.ok(Math.max(...ys) - Math.min(...ys) > 1000, 'seed ' + s + ' north-south spread');
    }
  }
  assert.ok(satisfied >= 190, 'the bounded retry finds a valid placement almost every time: ' + satisfied + ' / 200');
});

test('planner: deterministic for a seed, and different seeds give different placements', () => {
  assert.deepEqual(M.planSoulEchoes(ctx, seeded(42)).anchorIds, M.planSoulEchoes(ctx, seeded(42)).anchorIds);
  const seen = new Set();
  for (let s = 1; s <= 30; s++) seen.add(M.planSoulEchoes(ctx, seeded(s)).anchorIds.join());
  assert.ok(seen.size > 25);
});

test('planner: a context without anchors plans nothing instead of throwing', () => {
  const bare = M.createContext(template, null);
  assert.deepEqual(M.planSoulEchoes(bare, seeded(1)).anchorIds, []);
});

/* ---------------- players never see it ---------------- */

test('projection: Soul Echoes never reach the player projection (GM-only, PD-022)', () => {
  let doc = M.emptyDocument(ctx, AT);
  doc = must(M.apply(doc, { type: 'setSoulEchoes', anchorIds: SANCT.slice(0, 9), at: AT }, ctx));
  const proj = P.buildPlayerProjection(doc, ctx);
  const text = JSON.stringify(proj).toLowerCase();
  assert.ok(!text.includes('echo') && !text.includes('soul') && !text.includes('mk-'), 'leaked into the projection');
  assert.deepEqual(Object.keys(proj).sort(), ['overlays', 'perimeter', 'revealedCells', 'sanctuaryLabels', 'version']);
  assert.ok(!/soulEchoes/.test(read('js/journey2-projection.js').replace(/\/\*[\s\S]*?\*\//g, '')), 'the projection code never reads the field');
});

/* ---------------- view source guards ---------------- */

const fn = (from, to) => view.slice(view.indexOf('function ' + from), view.indexOf('function ' + to, view.indexOf('function ' + from) + 1));

test('view: the echoes layer sits above the fog (the veil never hides a crystal) and below selection and the placement preview', () => {
  const svg = view.slice(view.indexOf('<defs data-j2-defs>'), view.indexOf('</svg>', view.indexOf('<defs data-j2-defs>')));
  const at = k => svg.indexOf('data-j2-g="' + k + '"');
  assert.ok(at('fog') < at('fogstroke') && at('fogstroke') < at('echoes') && at('echoes') < at('select') && at('select') < at('preview'));
  assert.match(svg, /data-j2-g="echoes" pointer-events="none"/);
});

test('view: Player Preview empties the echoes layer (data, not CSS) and hides the toolbar group', () => {
  const body = fn('renderEchoes', 'updateEchoUi');
  assert.match(body, /if \(previewMode\) \{ ui\.g\.echoes\.innerHTML = ''/);
  assert.doesNotMatch(body, /Projection|playerProjection/, 'the layer is never fed from the projection');
  assert.match(fn('applyPreviewChrome', 'enterPreview'), /ui\.echoGroup\.hidden = on/);
  assert.match(fn('placeSoulEchoes', 'confirmClearSoulEchoes'), /previewMode/, 'no placing from the preview');
});

test('view: placing is one planned command (ids chosen before dispatch); replacing and removing ask first, with Cancel focused', () => {
  const place = fn('placeSoulEchoes', 'confirmClearSoulEchoes');
  assert.match(place, /Model\.planSoulEchoes\(data\.ctx\)/);
  assert.match(place, /type: 'setSoulEchoes', anchorIds: plan\.anchorIds/);
  assert.match(place, /openDialog/);
  const clear = fn('confirmClearSoulEchoes', 'renderSelection');
  assert.match(clear, /btn-danger/);
  assert.match(clear, /autofocus: true/);
  assert.match(clear, /anchorIds: \[\]/);
});

test('view: the echoes are never drawn from the diagnostics layer toggles and the crystal is inlined (CSS cannot reach a <use> clone)', () => {
  assert.doesNotMatch(view, /<use href="#j2-echo/);
  assert.match(read('css/journey2.css'), /@media \(prefers-reduced-motion: reduce\) \{ \.j2-overlay \.j2-echo-glow/);
});

/* ---------------- localization ---------------- */

test('i18n: every Soul Echoes string exists in en and ru with identical placeholders, and the view has no hard-coded copy', () => {
  const i18n = JSON.parse(read('data/i18n.json'));
  const keys = Object.keys(i18n.en).filter(k => /^journey2_(echo_|live_echoes_)/.test(k));
  assert.ok(keys.length >= 14);
  for (const k of keys) {
    assert.ok(i18n.ru[k] && i18n.ru[k].length, 'ru missing ' + k);
    const ph = s => (s.match(/\{[a-z]+\}/g) || []).sort().join();
    assert.equal(ph(i18n.ru[k]), ph(i18n.en[k]), 'placeholders ' + k);
  }
  for (const k of view.match(/journey2_(echo_|live_echoes_)[a-z_]+/g) || []) assert.ok(i18n.en[k], 'view uses an undefined key ' + k);
  assert.doesNotMatch(view, /'Soul Echo/);
});

test('documentation records the decision (PD-022) and the player-view exclusion', () => {
  assert.match(read('docs/product-decisions.md'), /PD-022/);
  assert.match(read('docs/architecture.md'), /Soul Echoes/);
});
