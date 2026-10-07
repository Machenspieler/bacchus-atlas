'use strict';
/* Journey 2: generated sanctuaries (PD-023). Pure — no browser. Covers the document's optional `sanctuaries` field, the
   setSanctuaries / setSanctuary / deleteSanctuary commands and their Undo/Redo behaviour, the one-click planner, the guarantee
   that the player projection can never carry a sanctuary, localization and the source guards that keep the layer GM-only.
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
const journey = JSON.parse(read('data/journey.json'));
const ctx = M.createContext(template, anchorsDoc);
const AT = '2026-10-07T10:00:00.000Z', AT2 = '2026-10-07T11:00:00.000Z';
const must = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.doc; };
const view = read('js/journey2-view.js');
const SANCT = anchorsDoc.anchors.filter(a => a.kind === 'sanctuary').map(a => a.stableId);
const DEST = anchorsDoc.anchors.filter(a => a.kind === 'destination').map(a => a.stableId);

const entry = (anchorId, over) => Object.assign({
  anchorId, name: 'Knockgate', trade: 9, quirk: 3, crisis: 9, drive: 5, politics: { rolls: [1] }, size: 4, population: 1,
}, over || {});

/** A deterministic stand-in for the generator adapter: a new name every call unless told otherwise. */
function counterRoll(names) {
  let i = 0;
  return () => ({ name: names ? names[i++ % names.length] : 'Town' + (i++), trade: 1, quirk: 1, crisis: 1, drive: 1, politics: { rolls: [2, 5] }, size: 6, population: 4 });
}

/* ---------------- document ---------------- */

test('a new document has no sanctuaries; a document without the field loads unchanged (schemaVersion stays 1)', () => {
  const doc = M.emptyDocument(ctx, AT);
  assert.deepEqual(doc.sanctuaries, { entries: [] });
  assert.equal(M.SCHEMA_VERSION, 1);
  const old = JSON.parse(JSON.stringify(doc));
  delete old.sanctuaries;
  const r = M.validateDocument(old, ctx);
  assert.equal(r.ok, true);
  assert.deepEqual(r.doc.sanctuaries, { entries: [] });
});

test('validation: sorts by sanctuary id; rejects duplicates, non-sanctuaries, bad rolls, unknown fields and malformed values', () => {
  const base = M.emptyDocument(ctx, AT);
  const withS = v => Object.assign(JSON.parse(JSON.stringify(base)), { sanctuaries: v });
  const ok = M.validateDocument(withS({ entries: [entry('mk-012'), entry('mk-003', { name: '' })] }), ctx);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.doc.sanctuaries.entries.map(e => e.anchorId), ['mk-003', 'mk-012']);
  for (const bad of [
    { entries: [entry('mk-003'), entry('mk-003')] },                // one entry per sanctuary
    { entries: [entry(DEST[0])] },                                  // a destination is not a sanctuary
    { entries: [entry('mk-999')] },
    { entries: [entry('mk-003', { trade: 21 })] }, { entries: [entry('mk-003', { quirk: 0 })] }, { entries: [entry('mk-003', { crisis: 11 })] },
    { entries: [entry('mk-003', { drive: 1.5 })] }, { entries: [entry('mk-003', { size: 7 })] }, { entries: [entry('mk-003', { population: 5 })] },
    { entries: [entry('mk-003', { politics: { rolls: [8] } })] },   // an 8 is resolved at roll time, never stored
    { entries: [entry('mk-003', { politics: { rolls: [] } })] },
    { entries: [entry('mk-003', { politics: { rolls: [2, 2] } })] },
    { entries: [entry('mk-003', { politics: { rolls: [1, 2, 3, 4, 5] } })] },
    { entries: [entry('mk-003', { politics: { rolls: [1], extra: 1 } })] },
    { entries: [entry('mk-003', { name: 'x'.repeat(M.MAX_SANCTUARY_NAME + 1) })] },
    { entries: [entry('mk-003', { name: 7 })] },
    { entries: [Object.assign(entry('mk-003'), { extra: 1 })] },
    { entries: SANCT.concat(['mk-001']).map(id => entry(id)) },     // more than the map has
    { entries: 'x' }, { entries: [], extra: 1 }, [], 'x',
  ]) {
    const r = M.validateDocument(withS(bad), ctx);
    assert.equal(r.ok, false, JSON.stringify(bad).slice(0, 120));
    assert.equal(r.code, 'invalid');
  }
});

test('backup round trip: sanctuaries survive export/import byte for byte; a map with only sanctuaries is not "empty"', () => {
  let doc = M.emptyDocument(ctx, AT);
  assert.equal(M.isEmptyDocument(doc), true);
  doc = must(M.apply(doc, { type: 'setSanctuaries', entries: M.planSanctuaries(ctx, counterRoll()), at: AT }, ctx));
  assert.equal(M.isEmptyDocument(doc), false);
  const text = M.serializeBackup(doc);
  const back = M.parseBackupText(text, ctx);
  assert.equal(back.ok, true);
  assert.equal(M.serializeBackup(back.doc), text);
});

/* ---------------- planner ---------------- */

test('planner: one entry for each of the 56 sanctuaries, never a destination, every entry valid', () => {
  const entries = M.planSanctuaries(ctx, counterRoll());
  assert.equal(entries.length, 56);
  assert.equal(new Set(entries.map(e => e.anchorId)).size, 56);
  for (const e of entries) {
    assert.ok(ctx.sanctuaryIds.has(e.anchorId));
    assert.equal(M.validateSanctuaryEntry(e, ctx, 'e').errors.length, 0);
  }
  assert.equal(M.validateDocument(Object.assign(M.emptyDocument(ctx, AT), { sanctuaries: { entries } }), ctx).ok, true);
});

test('planner: a name another sanctuary already took is rolled again, but a stubborn roll never loops forever', () => {
  const names = ['Ashford', 'Ashford', 'Brookdale'];
  const entries = M.planSanctuaries(ctx, counterRoll(names));
  assert.deepEqual(entries.slice(0, 2).map(e => e.name), ['Ashford', 'Brookdale']);
  const stubborn = M.planSanctuaries(ctx, counterRoll(['Same']));
  assert.equal(stubborn.length, 56, 'bounded retries: it still returns every sanctuary');
});

test('planner: a context without anchors plans nothing instead of throwing', () => {
  assert.deepEqual(M.planSanctuaries(M.createContext(template, null), counterRoll()), []);
});

/* ---------------- commands ---------------- */

test('setSanctuaries: replaces the set, same set is a noop, bad input is refused whole, nothing else changes', () => {
  const doc0 = M.emptyDocument(ctx, AT);
  const doc1 = must(M.apply(doc0, { type: 'setSanctuaries', entries: [entry('mk-020'), entry('mk-004')], at: AT2 }, ctx));
  assert.deepEqual(doc1.sanctuaries.entries.map(e => e.anchorId), ['mk-004', 'mk-020']);
  assert.equal(doc1.updatedAt, AT2);
  for (const k of ['batches', 'tiles', 'playerVisibility', 'soulEchoes']) assert.equal(doc1[k], doc0[k], k);
  const same = M.apply(doc1, { type: 'setSanctuaries', entries: [entry('mk-004'), entry('mk-020')], at: AT2 }, ctx);
  assert.equal(same.noop, true);
  assert.equal(same.doc, doc1);
  assert.equal(M.apply(doc1, { type: 'setSanctuaries', entries: [entry(DEST[0])], at: AT }, ctx).error.code, 'bad-sanctuaries');
  assert.equal(M.apply(doc1, { type: 'setSanctuaries', entries: [entry('mk-004'), entry('mk-004')], at: AT }, ctx).error.code, 'bad-sanctuaries');
  assert.equal(M.apply(doc1, { type: 'setSanctuaries', entries: 'mk-004', at: AT }, ctx).error.code, 'bad-sanctuaries');
  assert.equal(M.apply(doc1, { type: 'setSanctuaries', entries: [entry('mk-004', { trade: 99 })], at: AT }, ctx).error.code, 'bad-sanctuaries');
  assert.equal(M.apply(doc1, { type: 'setSanctuaries', entries: SANCT.concat(['mk-001']).map(id => entry(id)), at: AT }, ctx).error.code, 'bad-sanctuaries');
  const cleared = must(M.apply(doc1, { type: 'setSanctuaries', entries: [], at: AT2 }, ctx));
  assert.deepEqual(cleared.sanctuaries.entries, []);
  assert.equal(M.apply(cleared, { type: 'setSanctuaries', entries: [], at: AT2 }, ctx).noop, true);
});

test('setSanctuary (reroll) replaces exactly one existing entry; an unknown or invalid one is refused', () => {
  const doc1 = must(M.apply(M.emptyDocument(ctx, AT), { type: 'setSanctuaries', entries: [entry('mk-004'), entry('mk-020')], at: AT }, ctx));
  const doc2 = must(M.apply(doc1, { type: 'setSanctuary', entry: entry('mk-020', { name: 'Newtown', trade: 2, politics: { rolls: [3, 6] } }), at: AT2 }, ctx));
  assert.equal(doc2.sanctuaries.entries[0], doc1.sanctuaries.entries[0], 'the other sanctuary is the very same object');
  assert.equal(doc2.sanctuaries.entries[1].name, 'Newtown');
  assert.deepEqual(doc2.sanctuaries.entries[1].politics.rolls, [3, 6]);
  assert.equal(M.apply(doc1, { type: 'setSanctuary', entry: entry('mk-020'), at: AT2 }, ctx).noop, true);
  assert.equal(M.apply(doc1, { type: 'setSanctuary', entry: entry('mk-030'), at: AT2 }, ctx).error.code, 'no-sanctuary');
  assert.equal(M.apply(doc1, { type: 'setSanctuary', entry: entry('mk-020', { size: 9 }), at: AT2 }, ctx).error.code, 'bad-sanctuary');
});

test('deleteSanctuary removes exactly one entry and nothing else; an unknown one is refused', () => {
  const doc1 = must(M.apply(M.emptyDocument(ctx, AT), { type: 'setSanctuaries', entries: [entry('mk-004'), entry('mk-020')], at: AT }, ctx));
  const doc2 = must(M.apply(doc1, { type: 'deleteSanctuary', anchorId: 'mk-004', at: AT2 }, ctx));
  assert.deepEqual(doc2.sanctuaries.entries.map(e => e.anchorId), ['mk-020']);
  assert.equal(doc2.soulEchoes, doc1.soulEchoes);
  assert.equal(M.apply(doc2, { type: 'deleteSanctuary', anchorId: 'mk-004', at: AT2 }, ctx).error.code, 'no-sanctuary');
});

test('history: generating, rerolling and deleting are one Undo entry each; Redo restores the exact same entries (never re-rolls)', () => {
  const h = M.createHistory();
  const d0 = M.emptyDocument(ctx, AT);
  const planned = M.planSanctuaries(ctx, counterRoll());
  const d1 = must(M.apply(d0, { type: 'setSanctuaries', entries: planned, at: AT }, ctx));
  M.historyCommit(h, d0, d1, 'sanctuariesGenerate');
  const d2 = must(M.apply(d1, { type: 'setSanctuary', entry: entry('mk-001', { name: 'Rerolled' }), at: AT2 }, ctx));
  M.historyCommit(h, d1, d2, 'sanctuaryReroll');
  const d3 = must(M.apply(d2, { type: 'deleteSanctuary', anchorId: 'mk-001', at: AT2 }, ctx));
  M.historyCommit(h, d2, d3, 'sanctuaryDelete');
  assert.equal(h.undo.length, 3);
  assert.equal(M.historyUndo(h).before, d2);
  assert.equal(M.historyUndo(h).before, d1);
  assert.equal(M.historyRedo(h).after, d2);
  assert.equal(d2.sanctuaries.entries.find(e => e.anchorId === 'mk-001').name, 'Rerolled');
});

/* ---------------- the book's tables match the stored numbers ---------------- */

test('the stored dice match journey.json: every table the entries index into has exactly that many rows', () => {
  const table = key => journey.sanctuary.find(tb => tb.key === key);
  for (const [key, die] of Object.entries(M.SANCTUARY_DICE)) {
    assert.equal(table(key).die, die, key);
    assert.equal(table(key).rows.length, die, key + ' rows');
  }
  assert.equal(table('politics').die, 8);
  assert.equal(table('politics').rows.filter(r => r.text).length, 7);
});

/* ---------------- players never see it ---------------- */

test('projection: sanctuaries never reach the player projection (GM-only, PD-023)', () => {
  let doc = M.emptyDocument(ctx, AT);
  doc = must(M.apply(doc, { type: 'setSanctuaries', entries: M.planSanctuaries(ctx, counterRoll(['Secretburg', 'Hiddenford'])), at: AT }, ctx));
  const proj = P.buildPlayerProjection(doc, ctx);
  const text = JSON.stringify(proj).toLowerCase();
  assert.ok(!text.includes('secretburg') && !text.includes('hiddenford') && !text.includes('mk-'), 'leaked into the projection');
  assert.deepEqual(proj.sanctuaryLabels, [], 'a generated but unrevealed sanctuary emits nothing (PD-027)');
  assert.deepEqual(Object.keys(proj).sort(), ['overlays', 'perimeter', 'revealedCells', 'sanctuaryLabels', 'version']);
  assert.ok(!/\b(trade|quirk|crisis|drive|politics|population)\b/.test(read('js/journey2-projection.js').replace(/\/\*[\s\S]*?\*\//g, '')), 'the projection code never reads any sanctuary characteristic');
});

/* ---------------- view source guards ---------------- */

const fn = (from, to) => view.slice(view.indexOf('function ' + from), view.indexOf('function ' + to, view.indexOf('function ' + from) + 1));

test('view: the dot layer sits above the fog, below selection, never takes pointer events, and the overlay is not part of the SVG', () => {
  const svg = view.slice(view.indexOf('<defs data-j2-defs>'), view.indexOf('</svg>', view.indexOf('<defs data-j2-defs>')));
  const at = k => svg.indexOf('data-j2-g="' + k + '"');
  assert.ok(at('fogstroke') < at('sanct') && at('sanct') < at('select') && at('select') < at('preview'));
  assert.match(svg, /data-j2-g="sanct" pointer-events="none"/);
});

test('view: Player Preview empties the ring layer (data, not CSS), closes the overlay and hides the toolbar group', () => {
  assert.match(fn('renderSanctuaryRings', 'updateSanctuaryUi'), /if \(previewMode\) \{ ui\.g\.sanct\.innerHTML = ''/);
  assert.doesNotMatch(fn('renderSanctuaryRings', 'updateSanctuaryUi'), /Projection|playerProjection/, 'never fed from the projection');
  assert.match(fn('renderSanctuaryPanel', 'sanctuaryAnchorPx'), /previewMode \? null/);
  assert.match(fn('applyPreviewChrome', 'enterPreview'), /ui\.sancGroup\.hidden = on/);
  assert.match(fn('enterPreview', 'leavePreview'), /closeSanctuary\(\{ quiet: true \}\)/);
  assert.match(fn('openSanctuary', 'closeSanctuary'), /previewMode/);
  assert.match(fn('sanctuaryAtScreen', 'openSanctuary'), /previewMode/, 'no clicking a sanctuary in the preview');
});

test('view: generating is one planned command (entries rolled before dispatch); replacing asks first with Cancel focused', () => {
  const gen = fn('generateSanctuaries', 'rerollSanctuary');
  assert.match(gen, /Model\.planSanctuaries\(data\.ctx/);
  assert.match(gen, /type: 'setSanctuaries', entries: entries/);
  assert.match(gen, /openDialog/);
  assert.match(gen, /autofocus: true/);
  assert.match(gen, /btn-danger/);
});

test('view: reroll is one setSanctuary command with the entry already rolled; delete asks first and is one deleteSanctuary command', () => {
  assert.match(fn('rerollSanctuary', 'confirmDeleteSanctuary'), /type: 'setSanctuary', entry: next/);
  const del = fn('confirmDeleteSanctuary', 'renderSelection');
  assert.match(del, /openDialog/);
  assert.match(del, /autofocus: true/);
  assert.match(del, /type: 'deleteSanctuary', anchorId/);
});

test('view: the overlay has the three actions (close, delete, reroll), wired in one place, and Escape closes it', () => {
  for (const a of ['data-j2-sanc-close', 'data-j2-sanc-delete', 'data-j2-sanc-reroll', 'data-j2-sanc-generate']) assert.ok(view.includes(a), a);
  const root = fn('onRootClick', 'toggleMenu');
  for (const f of ['generateSanctuaries', 'closeSanctuary', 'rerollSanctuary', 'confirmDeleteSanctuary']) assert.match(root, new RegExp(f));
  assert.match(fn('onDocumentKey', 'fogSpaceTarget'), /if \(sanctuaryOpen\) \{ closeSanctuary\(\{ focus: true \}\)/);
});

test('view: a generated sanctuary outranks the hex under it, for both the click and the drag start', () => {
  assert.match(fn('handleMapClick', 'selectTile'), /sanctuaryAtScreen\(sx, sy\)/);
  assert.match(fn('onViewportDown', 'onViewportMove'), /!sanctuaryAtScreen\(x, y\)/);
});

/* ---------------- localization ---------------- */

test('i18n: every sanctuary string exists in en and ru with identical placeholders, and the view uses only defined keys', () => {
  const i18n = JSON.parse(read('data/i18n.json'));
  const keys = Object.keys(i18n.en).filter(k => /^journey2_(sanc_|live_sanc_)/.test(k));
  assert.ok(keys.length >= 20);
  for (const k of keys) {
    assert.ok(i18n.ru[k] && i18n.ru[k].length, 'ru missing ' + k);
    const ph = s => (s.match(/\{[a-z]+\}/g) || []).sort().join();
    assert.equal(ph(i18n.ru[k]), ph(i18n.en[k]), 'placeholders ' + k);
  }
  for (const k of view.match(/journey2_(sanc_|live_sanc_)[a-z_]+/g) || []) assert.ok(i18n.en[k], 'view uses an undefined key ' + k);
  for (const k of ['journey_k_trade', 'journey_k_quirk', 'journey_k_crisis', 'journey_k_drive', 'journey_k_politics', 'journey_k_settlement_size', 'journey_k_population']) {
    assert.ok(i18n.en[k] && i18n.ru[k], k);
  }
  assert.equal(i18n.ru.journey_k_drive, 'Движущая сила', 'official daggerheart.ru wording');
});

test('documentation records the decision (PD-023) and the player-view exclusion', () => {
  assert.match(read('docs/product-decisions.md'), /PD-023/);
  assert.match(read('docs/architecture.md'), /Sanctuaries \(PD-023\)/);
});
