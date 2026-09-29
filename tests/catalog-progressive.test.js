/* ============================================================
   Bacchus's Atlas — tests/catalog-progressive.test.js
   Dependency-free regression tests for js/catalog-progressive.js. Run with:

     node --test tests/catalog-progressive.test.js

   CatalogProgressive is pure (no DOM, no application state), so it's
   exercised directly here, the same shape as tests/search-index.test.js.
   See the "Main catalog progressive loading" section in
   docs/architecture.md for the contract this implements.
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const CatalogProgressive = require('../js/catalog-progressive.js');
const {
  INITIAL_VISIBLE_ROWS,
  ROWS_PER_LOAD,
  SHOW_ALL_THRESHOLD,
  countColumnsFromTemplate,
  calculateInitialVisibleCount,
  calculateNextVisibleCount,
  calculateResizeVisibleCount,
} = CatalogProgressive;

test('exposes the product-defined constants', () => {
  assert.equal(INITIAL_VISIBLE_ROWS, 6);
  assert.equal(ROWS_PER_LOAD, 4);
  assert.equal(SHOW_ALL_THRESHOLD, 30);
});

/* ---------------- countColumnsFromTemplate ---------------- */

test('counts tracks in a resolved grid-template-columns value', () => {
  assert.equal(countColumnsFromTemplate('340px 340px 340px'), 3);
  assert.equal(countColumnsFromTemplate('340px'), 1);
  assert.equal(countColumnsFromTemplate('340px  340px'), 2); // extra whitespace tolerated
});

test('returns 0 for an empty, missing, or non-string template', () => {
  assert.equal(countColumnsFromTemplate(''), 0);
  assert.equal(countColumnsFromTemplate('none'), 1); // not our problem to special-case; caller falls back on <= 0 only
  assert.equal(countColumnsFromTemplate(undefined), 0);
  assert.equal(countColumnsFromTemplate(null), 0);
});

/* ---------------- calculateInitialVisibleCount ---------------- */

test('shows every result when the set is at or under the show-all threshold', () => {
  assert.equal(calculateInitialVisibleCount(30, 4), 30);
  assert.equal(calculateInitialVisibleCount(1, 4), 1);
  assert.equal(calculateInitialVisibleCount(0, 4), 0);
});

test('initial count is six rows at the actual column count for larger sets', () => {
  assert.equal(calculateInitialVisibleCount(100, 3), 18);
  assert.equal(calculateInitialVisibleCount(100, 4), 24);
  assert.equal(calculateInitialVisibleCount(100, 5), 30);
});

test('initial count clamps to the total when six rows would overshoot it', () => {
  assert.equal(calculateInitialVisibleCount(31, 6), 31); // 36 would overshoot
  assert.equal(calculateInitialVisibleCount(28, 3), 28);
});

/* ---------------- calculateNextVisibleCount ---------------- */

test('next count adds four rows at the current column count', () => {
  assert.equal(calculateNextVisibleCount(18, 100, 3), 30);
  assert.equal(calculateNextVisibleCount(24, 100, 4), 40);
});

test('a final partial batch reveals exactly what remains, never more', () => {
  assert.equal(calculateNextVisibleCount(24, 28, 4), 28); // 16 more would overshoot by 12
  assert.equal(calculateNextVisibleCount(24, 31, 4), 31);
});

test('next count is the total outright when already at/under the threshold', () => {
  assert.equal(calculateNextVisibleCount(30, 30, 5), 30);
});

/* ---------------- calculateResizeVisibleCount ---------------- */

test('a result set at or under the threshold always stays fully shown after resize', () => {
  assert.equal(calculateResizeVisibleCount(30, 30, 2), 30);
  assert.equal(calculateResizeVisibleCount(12, 12, 6), 12);
});

test('growing the column count aligns the preserved count up to a full row', () => {
  // Previously 18 visible at 3 columns; grid widens to 5 columns.
  // minimumForCurrentGrid = 5*6 = 30, preserved = max(18,30) = 30, aligned = 30.
  assert.equal(calculateResizeVisibleCount(18, 100, 5), 30);
});

test('shrinking the column count never hides a card already visible', () => {
  // Previously 40 visible at 4 columns; grid narrows to 3 columns.
  // minimumForCurrentGrid = 3*6 = 18, preserved = max(40,18) = 40, aligned up to a
  // multiple of 3 = 42, clamped to the total.
  assert.equal(calculateResizeVisibleCount(40, 41, 3), 41);
  assert.equal(calculateResizeVisibleCount(40, 100, 3), 42);
});

test('resize result is clamped to the total result count', () => {
  assert.equal(calculateResizeVisibleCount(28, 31, 6), 31); // 36 aligned, clamped to 31
});

/* ---------------- defensive column-count handling ---------------- */

test('a zero or negative column count never divides by zero or crashes', () => {
  assert.doesNotThrow(() => calculateInitialVisibleCount(100, 0));
  assert.doesNotThrow(() => calculateResizeVisibleCount(10, 100, 0));
  assert.ok(Number.isFinite(calculateInitialVisibleCount(100, 0)));
  assert.ok(Number.isFinite(calculateResizeVisibleCount(10, 100, -1)));
});
