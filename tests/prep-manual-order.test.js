/* ============================================================
   Bacchus's Atlas — tests/prep-manual-order.test.js
   Manual ordering of the selected Prep cards: the stored prep.*Ids arrays are
   the canonical display order. Pins (a) that order surviving storage, a
   shared link and a duplicate, (b) that the central lists, the session summary
   and the FreshCutGrass export read it without re-sorting, and (c) that the
   catalog pickers keep their own sort. Source assertions on js/app.js, same
   style as tests/prep-summary.test.js.
   Run:  node --test tests/prep-manual-order.test.js
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SafeStorage = require('../js/safe-storage.js');
const PrepShareUtils = require('../js/prep-share-utils.js');
const PrepUtils = require('../js/prep-utils.js');
const PrepReorderUtils = require('../js/prep-reorder-utils.js');

const ROOT = path.join(__dirname, '..');
const APP_JS = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
const I18N = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'i18n.json'), 'utf8'));

/** The source of one top-level `function name(` up to its closing brace. */
function functionSource(name) {
  const start = APP_JS.indexOf(`function ${name}(`);
  assert.ok(start > -1, `${name}() exists`);
  const open = APP_JS.indexOf('{', APP_JS.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < APP_JS.length; i++) {
    if (APP_JS[i] === '{') depth++;
    else if (APP_JS[i] === '}' && --depth === 0) return APP_JS.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

class FakeStorage {
  constructor() { this.data = new Map(); }
  getItem(k) { return this.data.has(k) ? this.data.get(k) : null; }
  setItem(k, v) { this.data.set(k, String(v)); }
  removeItem(k) { this.data.delete(k); }
}

const ORDERED = {
  environmentIds: ['port-city', 'bastion', 'faestone-wode'],
  adversaryIds: ['weaponmaster', 'acid-burrower', 'archer-squadron', 'bear'],
  itemIds: ['hi16', 'ci2', 'cc16'],
};

function storeWith(prep) {
  return {
    schemaVersion: 2, activeSessionId: 's1',
    sessions: [Object.assign({
      id: 's1', title: '', notes: '', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
    }, prep)],
  };
}

test('a manually ordered prep keeps its exact order through storage', () => {
  const storage = new FakeStorage();
  assert.equal(SafeStorage.writeJson(storage, 'dhcodex_session_prep', storeWith(ORDERED)).ok, true);
  const loaded = SafeStorage.loadStoredJson(storage, 'dhcodex_session_prep', {
    fallback: () => storeWith({ environmentIds: [], adversaryIds: [], itemIds: [] }),
    validate: SafeStorage.validators.prep,
  });
  const prep = loaded.sessions[0];
  assert.deepEqual(prep.environmentIds, ORDERED.environmentIds);
  assert.deepEqual(prep.adversaryIds, ORDERED.adversaryIds);
  assert.deepEqual(prep.itemIds, ORDERED.itemIds);
  assert.equal(SafeStorage.getRecoverySummary().hasIssues, false);
});

test('a shared link carries the same order and adds no separate order field', () => {
  const encoded = PrepShareUtils.encodePrep(Object.assign({ title: 't', notes: '' }, ORDERED));
  const decoded = PrepShareUtils.decodePrep(encoded);
  assert.equal(decoded.ok, true);
  const prep = decoded.value;
  assert.deepEqual(prep.environmentIds, ORDERED.environmentIds);
  assert.deepEqual(prep.adversaryIds, ORDERED.adversaryIds);
  assert.deepEqual(prep.itemIds, ORDERED.itemIds);
  const json = Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  assert.ok(!/order/i.test(json), 'no parallel *Order field');
});

test('a reorder is just a new array; duplicates and no-ops never reach storage', () => {
  const ids = ORDERED.adversaryIds;
  const moved = PrepReorderUtils.moveId(ids, 3, 1);
  assert.deepEqual(moved, ['weaponmaster', 'bear', 'acid-burrower', 'archer-squadron']);
  assert.deepEqual(ids, ORDERED.adversaryIds, 'input untouched');
  assert.equal(PrepReorderUtils.insertId(ids, 'bear', 0), ids);
  assert.equal(PrepReorderUtils.moveId(ids, 2, 2), ids);
  assert.deepEqual(PrepUtils.normalizeIdList(moved), moved, 'normalizeIdList keeps first-occurrence order');
});

test('duplicating a prep copies the arrays in order', () => {
  const dup = functionSource('duplicatePrep');
  assert.match(dup, /environmentIds:\s*source\.environmentIds\.slice\(\)/);
  assert.match(dup, /adversaryIds:\s*source\.adversaryIds\.slice\(\)/);
  assert.match(dup, /itemIds:\s*source\.itemIds\.slice\(\)/);
});

test('the central Environments / Adversaries / Items lists render the stored order without sorting', () => {
  for (const fn of ['centralEnvListHtml', 'centralAdvListHtml', 'centralItemListHtml']) {
    const src = functionSource(fn);
    assert.ok(!/sort/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), `${fn} must not sort`);
  }
  assert.match(functionSource('centralEnvListHtml'), /prep\.environmentIds\.map/);
  assert.match(functionSource('centralAdvListHtml'), /prep\.adversaryIds\.map/);
  assert.match(functionSource('centralItemListHtml'), /prep\.itemIds\.map/);
});

test('Copy session summary and the FreshCutGrass export follow the stored order', () => {
  const summary = functionSource('prepSummaryText');
  assert.ok(!/sort/i.test(summary), 'prepSummaryText must not sort');
  assert.match(summary, /prep\.adversaryIds\.map/);
  const fcg = functionSource('freshCutGrassUrlForPrep');
  assert.match(fcg, /prep\.adversaryIds\s*\n?\s*\.map/);
  assert.ok(!/sort/i.test(fcg));
});

test('the source catalogs keep their own sort', () => {
  assert.match(functionSource('prepFilteredEnvs'), /sortByTierThenName/);
  assert.match(functionSource('prepFilteredAdversaries'), /sortByTierThenName/);
  assert.match(functionSource('prepFilteredItems'), /sortItemsForPrep/);
});

test('every selected card carries its id for the reorder controller', () => {
  assert.match(functionSource('selectedEntityHtml'), /data-sel-id="\$\{escapeAttr\(id\)\}"/);
});

test('reordering announcements and the drop label exist in both languages', () => {
  for (const lang of ['en', 'ru']) {
    for (const key of ['prep_drop_here', 'prep_reorder_moved', 'prep_reorder_moved_start', 'prep_reorder_moved_end', 'prep_reorder_added']) {
      assert.ok(I18N[lang][key], `${lang}.${key}`);
    }
    for (const key of ['prep_reorder_moved', 'prep_reorder_moved_start', 'prep_reorder_moved_end', 'prep_reorder_added']) {
      assert.ok(I18N[lang][key].includes('{name}') && I18N[lang][key].includes('{total}'), `${lang}.${key} placeholders`);
    }
  }
});

test('drag affordances are gated on a fine pointer and there is no reset-order or drag-to-delete UI', () => {
  assert.match(CSS, /@media \(any-hover: hover\) and \(any-pointer: fine\)\s*\{[^}]*?\.prep-sel, \.prep-sel-main--static \{ cursor: grab; \}/);
  assert.ok(!/reset[-_ ]order|restore[-_ ]default[-_ ]order/i.test(APP_JS + JSON.stringify(I18N)));
  const ui = fs.readFileSync(path.join(ROOT, 'js', 'prep-reorder-ui.js'), 'utf8');
  assert.match(ui, /pointerType !== 'mouse' && e\.pointerType !== 'pen'/);
  assert.ok(!/\.remove\(\)[\s\S]{0,40}kind/.test(ui) && !/removeId|toggleId/.test(ui), 'the controller never removes a selection');
});
