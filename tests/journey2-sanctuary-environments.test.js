'use strict';
/* Journey 2: one catalog Environment per generated sanctuary and per destination (Horizon, Marrogate) — PD-081. Pure — no browser.
   Covers the optional `environmentId` on a sanctuary entry, the optional `sanctuaries.destinations` list, the setSanctuaries /
   setSanctuary / deleteSanctuary / setDestinationEnvironment commands with Undo/Redo, the dealer rule over 58 slots, the guarantee that the
   player projection never carries any of it, localization, and source guards on the view. The click / picker / overlay behaviour is
   checked by hand (docs/manual-qa.md "Journey 2 map editor"). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../js/journey2-model.js');
const P = require('../js/journey2-projection.js');
const D = require('../js/journey2-env-deal.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const template = JSON.parse(read('data/journey2/map-template.json'));
const anchorsDoc = JSON.parse(read('data/journey2/map-anchors.json'));
const environments = JSON.parse(read('data/environments.json'));
const i18n = JSON.parse(read('data/i18n.json'));
const ctx = M.createContext(template, anchorsDoc);
const AT = '2026-10-21T10:00:00.000Z';
const must = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.doc; };
const apply = (doc, cmd) => M.apply(doc, Object.assign({ at: AT }, cmd), ctx);
const view = read('js/journey2-view.js');
const SANCT = anchorsDoc.anchors.filter(a => a.kind === 'sanctuary').map(a => a.stableId);
const DEST = anchorsDoc.anchors.filter(a => a.kind === 'destination').map(a => a.stableId);

const entry = (anchorId, over) => Object.assign({
  anchorId, name: 'Knockgate', trade: 9, quirk: 3, crisis: 9, drive: 5, politics: { rolls: [1] }, size: 4, population: 1,
}, over || {});
const dest = (anchorId, environmentId) => ({ anchorId, environmentId });
const envList = Array.isArray(environments) ? environments : environments.environments;
const SETTLEMENT = envList.filter(e => e.biomes.includes('settlement')).map(e => e.id);

/* ---------------- context ---------------- */

test('context: the two printed destinations are known, west to east, and are not sanctuaries', () => {
  assert.equal(ctx.destinations.length, 2);
  assert.deepEqual(ctx.destinations.map(d => d.id).sort(), DEST.slice().sort());
  assert.ok(ctx.destinations[0].x <= ctx.destinations[1].x);
  for (const id of DEST) assert.equal(ctx.sanctuaryIds.has(id), false);
});

/* ---------------- schema ---------------- */

test('schema: an entry without environmentId stays valid and has no key; the Environment is optional (old saves load unchanged)', () => {
  const base = M.emptyDocument(ctx, AT);
  const r = M.validateDocument(Object.assign({}, base, { sanctuaries: { entries: [entry('mk-003')] } }), ctx);
  assert.equal(r.ok, true);
  assert.equal('environmentId' in r.doc.sanctuaries.entries[0], false);
  assert.deepEqual(r.doc.sanctuaries.destinations, []);
  const old = JSON.parse(JSON.stringify(base)); delete old.sanctuaries.destinations;
  assert.equal(M.validateDocument(old, ctx).ok, true);
});

test('schema: an entry keeps a valid environmentId; a malformed one rejects the whole document', () => {
  const base = M.emptyDocument(ctx, AT);
  const ok = M.validateDocument(Object.assign({}, base, { sanctuaries: { entries: [entry('mk-003', { environmentId: 'local-tavern' })] } }), ctx);
  assert.equal(ok.ok, true);
  assert.equal(ok.doc.sanctuaries.entries[0].environmentId, 'local-tavern');
  for (const bad of ['', 'Local Tavern', null, 5, 'x'.repeat(65)]) {
    assert.equal(M.validateDocument(Object.assign({}, base, { sanctuaries: { entries: [entry('mk-003', { environmentId: bad })] } }), ctx).ok, false, JSON.stringify(bad));
  }
});

test('schema: destinations accept only the two destinations, once each, with a catalog id; stored sorted', () => {
  const base = M.emptyDocument(ctx, AT), withD = v => Object.assign({}, base, { sanctuaries: { entries: [], destinations: v } });
  const ok = M.validateDocument(withD([dest(DEST[1], 'fortress'), dest(DEST[0], 'laboratory')]), ctx);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.doc.sanctuaries.destinations.map(d => d.anchorId), DEST.slice().sort());
  for (const bad of [
    [dest('mk-003', 'fortress')],                                  // a sanctuary is not a destination
    [dest(DEST[0], 'fortress'), dest(DEST[0], 'laboratory')],      // one per destination
    [dest(DEST[0], 'Not An Id')], [dest(DEST[0], '')], [{ anchorId: DEST[0] }],
    [dest(DEST[0], 'a'), dest(DEST[1], 'b'), dest('mk-003', 'c')],
    [Object.assign(dest(DEST[0], 'fortress'), { name: 'x' })],      // unknown field
    'laboratory',
  ]) assert.equal(M.validateDocument(withD(bad), ctx).ok, false, JSON.stringify(bad));
});

test('a backup round-trips entries and destinations with their Environments; isEmptyDocument counts a destination', () => {
  let doc = M.emptyDocument(ctx, AT);
  doc = must(apply(doc, { type: 'setSanctuaries', entries: [entry('mk-003', { environmentId: 'local-tavern' })], destinations: [dest(DEST[0], 'laboratory')] }));
  const back = M.parseBackupText(M.serializeBackup(doc), ctx);
  assert.equal(back.ok, true);
  assert.equal(M.serializeBackup(back.doc), M.serializeBackup(doc));
  assert.equal(back.doc.sanctuaries.entries[0].environmentId, 'local-tavern');
  assert.deepEqual(back.doc.sanctuaries.destinations, [dest(DEST[0], 'laboratory')]);
  const onlyDest = must(apply(M.emptyDocument(ctx, AT), { type: 'setSanctuaries', entries: [], destinations: [dest(DEST[0], 'laboratory')] }));
  assert.equal(M.isEmptyDocument(onlyDest), false);
});

/* ---------------- commands ---------------- */

test('setSanctuaries: replaces entries and destinations in one command; leaving `destinations` out keeps the stored ones; refuses a bad list whole', () => {
  let doc = M.emptyDocument(ctx, AT);
  doc = must(apply(doc, { type: 'setSanctuaries', entries: [entry('mk-003', { environmentId: 'a-b' })], destinations: [dest(DEST[0], 'laboratory'), dest(DEST[1], 'fortress')] }));
  assert.equal(doc.sanctuaries.destinations.length, 2);
  const again = must(apply(doc, { type: 'setSanctuaries', entries: [entry('mk-003', { environmentId: 'c-d' })] }));
  assert.deepEqual(again.sanctuaries.destinations, doc.sanctuaries.destinations, 'destinations kept when omitted');
  assert.equal(apply(doc, { type: 'setSanctuaries', entries: [], destinations: [dest('mk-003', 'x')] }).ok, false);
  assert.equal(apply(doc, { type: 'setSanctuaries', entries: [], destinations: 'nope' }).ok, false);
  const same = apply(doc, { type: 'setSanctuaries', entries: doc.sanctuaries.entries, destinations: doc.sanctuaries.destinations });
  assert.equal(same.ok && same.noop, true, 'an equal replacement is a no-op');
});

test('setSanctuary (Reroll and Change): replaces one entry with its new Environment and keeps the destinations', () => {
  let doc = must(apply(M.emptyDocument(ctx, AT), { type: 'setSanctuaries', entries: [entry('mk-003', { environmentId: 'a-b' }), entry('mk-004', { environmentId: 'c-d' })], destinations: [dest(DEST[0], 'laboratory')] }));
  const next = must(apply(doc, { type: 'setSanctuary', entry: entry('mk-003', { environmentId: 'e-f' }) }));
  assert.equal(next.sanctuaries.entries.find(e => e.anchorId === 'mk-003').environmentId, 'e-f');
  assert.equal(next.sanctuaries.entries.find(e => e.anchorId === 'mk-004').environmentId, 'c-d');
  assert.deepEqual(next.sanctuaries.destinations, [dest(DEST[0], 'laboratory')]);
  assert.equal(apply(doc, { type: 'setSanctuary', entry: entry('mk-003', { environmentId: 'Bad Id' }) }).ok, false);
});

test('deleteSanctuary removes the entry and its Environment together and leaves the destinations alone', () => {
  const doc = must(apply(M.emptyDocument(ctx, AT), { type: 'setSanctuaries', entries: [entry('mk-003', { environmentId: 'a-b' })], destinations: [dest(DEST[1], 'fortress')] }));
  const next = must(apply(doc, { type: 'deleteSanctuary', anchorId: 'mk-003' }));
  assert.deepEqual(next.sanctuaries.entries, []);
  assert.deepEqual(next.sanctuaries.destinations, [dest(DEST[1], 'fortress')]);
});

test('setDestinationEnvironment: replaces one existing destination only; never creates one; same id is a no-op', () => {
  const doc = must(apply(M.emptyDocument(ctx, AT), { type: 'setSanctuaries', entries: [entry('mk-003')], destinations: [dest(DEST[0], 'laboratory')] }));
  const next = must(apply(doc, { type: 'setDestinationEnvironment', anchorId: DEST[0], environmentId: 'fortress' }));
  assert.deepEqual(next.sanctuaries.destinations, [dest(DEST[0], 'fortress')]);
  assert.deepEqual(next.sanctuaries.entries, doc.sanctuaries.entries, 'touches only the destination');
  const noop = apply(doc, { type: 'setDestinationEnvironment', anchorId: DEST[0], environmentId: 'laboratory' });
  assert.equal(noop.ok && noop.noop, true);
  assert.equal(apply(doc, { type: 'setDestinationEnvironment', anchorId: DEST[1], environmentId: 'fortress' }).error.code, 'no-destination');
  assert.equal(apply(doc, { type: 'setDestinationEnvironment', anchorId: 'mk-003', environmentId: 'fortress' }).error.code, 'bad-destination');
  assert.equal(apply(doc, { type: 'setDestinationEnvironment', anchorId: DEST[0], environmentId: 'Not An Id' }).error.code, 'bad-destination');
});

test('history: one generation (entries + destinations) is ONE Undo entry and Redo restores the same ids', () => {
  const h = M.createHistory();
  const doc0 = M.emptyDocument(ctx, AT);
  const doc1 = must(apply(doc0, { type: 'setSanctuaries', entries: [entry('mk-003', { environmentId: 'a-b' })], destinations: [dest(DEST[0], 'laboratory'), dest(DEST[1], 'fortress')] }));
  M.historyCommit(h, doc0, doc1, 'sanctuariesGenerate');
  assert.equal(h.undo.length, 1, 'one history entry for entries + destinations');
  const u = M.historyUndo(h);
  assert.equal(u.before, doc0);
  assert.deepEqual(u.before.sanctuaries, { entries: [], destinations: [] });
  const r = M.historyRedo(h);
  assert.equal(r.after, doc1, 'Redo restores the very same document, never re-deals');
});

/* ---------------- the deal ---------------- */

test('the catalog offers enough settlement Environments that 58 slots never repeat one', () => {
  assert.ok(SETTLEMENT.length >= 58, 'settlement Environments: ' + SETTLEMENT.length);
  const slots = SANCT.length + DEST.length;
  assert.equal(slots, 58);
  const ids = D.dealEnvironments({ pool: SETTLEMENT, used: {}, count: slots, random: Math.random });
  assert.equal(ids.length, slots);
  assert.equal(new Set(ids).size, slots, 'least-used-first never repeats while the pool is larger than the count');
  assert.ok(ids.every(id => SETTLEMENT.includes(id)));
});

test('a reroll counts the current Environment as used, so it prefers one nobody holds', () => {
  const pool = SETTLEMENT, used = {};
  for (const id of pool.slice(0, pool.length - 1)) used[id] = 1;               // every one but the last is held
  for (let i = 0; i < 20; i++) assert.deepEqual(D.dealEnvironments({ pool, used, count: 1, random: Math.random }), [pool[pool.length - 1]]);
});

/* ---------------- players ---------------- */

test('the player projection never carries a sanctuary Environment or a destination one', () => {
  const doc = must(apply(M.emptyDocument(ctx, AT), { type: 'setSanctuaries', entries: [entry('mk-003', { environmentId: 'local-tavern' })], destinations: [dest(DEST[0], 'laboratory')] }));
  const text = JSON.stringify(P.buildPlayerProjection(doc, ctx));
  assert.equal(/local-tavern|laboratory|environmentId|destinations/.test(text), false);
});

/* ---------------- localization ---------------- */

test('every new string exists in both languages with the same placeholders; the picker reuses the hex strings', () => {
  const keys = ['journey2_sancenv_title', 'journey2_sancenv_none', 'journey2_sancenv_gone', 'journey2_sancenv_assign_aria', 'journey2_sancenv_picker', 'journey2_dest_horizon', 'journey2_dest_marrogate', 'journey2_dest_reroll'];
  const langs = Object.keys(i18n).filter(k => i18n[k] && typeof i18n[k] === 'object' && i18n[k].journey2_hexenv_title);
  assert.ok(langs.length >= 2, 'both languages found');
  for (const k of keys) {
    const ph = l => (String(i18n[l][k]).match(/\{\w+\}/g) || []).sort().join();
    for (const l of langs) assert.ok(i18n[l][k] && String(i18n[l][k]).trim(), l + ' has ' + k);
    assert.equal(ph(langs[0]), ph(langs[1]), k + ' placeholders');
  }
});

/* ---------------- view source guards ---------------- */

const fn = (from, to) => view.slice(view.indexOf('function ' + from), view.indexOf('function ' + to, view.indexOf('function ' + from) + 1));

test('view: the pool is the settlement biome, one deal covers sanctuaries and destinations, in the single setSanctuaries command', () => {
  assert.match(fn('sanctuaryEnvironments', 'sanctuaryEnvironmentUse'), /environmentsFor\('settlement'\)/);
  const g = fn('generateSanctuaries', 'toggleSanctuaryName');
  assert.match(g, /dealEnvironments\([\s\S]*count: entries\.length \+ dests\.length/);
  assert.match(g, /type: 'setSanctuaries', entries: entries, destinations: destinations/);
  assert.equal((g.match(/dispatch\(/g) || []).length, 1, 'one command, one Undo entry');
});

test('view: Reroll deals a new Environment with the rest; Change reuses the hex row; Horizon / Marrogate have Reroll only', () => {
  assert.match(fn('commitReroll', 'startSanctuaryRename'), /dealSanctuaryEnvironment\(\)/);
  const e = fn('renderSanctuaryEnv', 'setSancEnvPicker');
  assert.match(e, /canChange = !!e && list\.length > 0/, 'a destination has no Change');
  assert.match(e, /envRowHtml\(x, x\.id === id, i, 'sancenv'\)/);
  assert.match(e, /is-unavailable[\s\S]*journey2_hexenv_unavailable[\s\S]*journey2_hexenv_stored_id/);
  assert.match(fn('renderSanctuaryPanel', 'sanctuaryAnchorPx'), /ui\.sancDelete\.hidden = ui\.sancReroll\.hidden = !!dest/);
  assert.doesNotMatch(fn('rerollDestination', 'sanctuaryAnchorPx'), /deleteSanctuary/);
});

test('view: the Environment overlay is GM-only — a closed panel or Player Preview keeps no Environment markup', () => {
  assert.match(fn('renderSanctuaryPanel', 'sanctuaryAnchorPx'), /previewMode \? null : sanctuaryEntry/);
  assert.match(fn('clearSanctuaryPanel', 'renderSanctuaryPanel'), /envBody\.innerHTML = ''/);
  assert.match(fn('renderSanctuaryRings', 'updateSanctuaryUi'), /previewMode\) \{ ui\.g\.sanct\.innerHTML = ''/);
});
