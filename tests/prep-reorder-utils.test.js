/* ============================================================
   Bacchus's Atlas — tests/prep-reorder-utils.test.js
   Pure reorder helpers (js/prep-reorder-utils.js): id-array moves/inserts,
   slot resolution + insertion-line geometry across 3/2/1-column grids,
   keyboard targets, and the autoscroll curve. Also pins the script
   load order in index.html.
   Run:  node --test tests/prep-reorder-utils.test.js
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const U = require('../js/prep-reorder-utils.js');

/** Builds card rects for `n` cards in a `cols`-column grid (card 100×50, gap 10). */
function grid(n, cols, { w = 100, h = 50, gap = 10, ox = 0, oy = 0 } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const left = ox + (i % cols) * (w + gap);
    const top = oy + Math.floor(i / cols) * (h + gap);
    return { left, top, right: left + w, bottom: top + h };
  });
}

test('moveId moves, returns the same array for a no-op, never mutates', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(U.moveId(ids, 3, 1), ['a', 'd', 'b', 'c']);
  assert.deepEqual(U.moveId(ids, 0, 3), ['b', 'c', 'd', 'a']);
  assert.equal(U.moveId(ids, 2, 2), ids);
  assert.equal(U.moveId(ids, -1, 2), ids);
  assert.equal(U.moveId(ids, 1, 9), ids);
  assert.deepEqual(ids, ['a', 'b', 'c', 'd']);
});

test('insertId inserts before the index, appends at length, refuses duplicates', () => {
  const ids = ['a', 'b', 'c'];
  assert.deepEqual(U.insertId(ids, 'x', 1), ['a', 'x', 'b', 'c']);
  assert.deepEqual(U.insertId(ids, 'x', 3), ['a', 'b', 'c', 'x']);
  assert.deepEqual(U.insertId(ids, 'x', 0), ['x', 'a', 'b', 'c']);
  assert.deepEqual(U.insertId(ids, 'x', 99), ['a', 'b', 'c', 'x']);
  assert.equal(U.insertId(ids, 'b', 0), ids);
  assert.deepEqual(U.insertId([], 'x', 0), ['x']);
  assert.deepEqual(ids, ['a', 'b', 'c']);
});

test('finalIndexForSlot / isNoopSlot: the slots around the card itself change nothing', () => {
  assert.equal(U.finalIndexForSlot(2, 0), 0);
  assert.equal(U.finalIndexForSlot(2, 1), 1);
  assert.equal(U.finalIndexForSlot(2, 2), 2);
  assert.equal(U.finalIndexForSlot(2, 3), 2);
  assert.equal(U.finalIndexForSlot(2, 5), 4);
  [2, 3].forEach(slot => assert.equal(U.isNoopSlot(2, slot), true));
  [0, 1, 4, 5].forEach(slot => assert.equal(U.isNoopSlot(2, slot), false));
});

test('spec example: dragging Weaponmaster (3rd) to position 2', () => {
  const ids = ['acid-burrower', 'archer-squadron', 'weaponmaster'];
  const slot = 1;
  assert.deepEqual(U.moveId(ids, 2, U.finalIndexForSlot(2, slot)), ['acid-burrower', 'weaponmaster', 'archer-squadron']);
});

test('keyboardTarget follows the linear order; Shift goes to the ends; edges do nothing', () => {
  assert.equal(U.keyboardTarget(2, 5, 'ArrowUp', false), 1);
  assert.equal(U.keyboardTarget(2, 5, 'ArrowDown', false), 3);
  assert.equal(U.keyboardTarget(2, 5, 'ArrowUp', true), 0);
  assert.equal(U.keyboardTarget(2, 5, 'ArrowDown', true), 4);
  assert.equal(U.keyboardTarget(0, 5, 'ArrowUp', false), null);
  assert.equal(U.keyboardTarget(4, 5, 'ArrowDown', false), null);
  assert.equal(U.keyboardTarget(0, 5, 'ArrowUp', true), null);
  assert.equal(U.keyboardTarget(1, 5, 'Home', false), null);
  // A B / C D — moving C earlier is A, C, B, D regardless of the grid.
  assert.deepEqual(U.moveId(['A', 'B', 'C', 'D'], 2, U.keyboardTarget(2, 4, 'ArrowUp', false)), ['A', 'C', 'B', 'D']);
});

test('describePosition', () => {
  assert.equal(U.describePosition(0, 5), 'start');
  assert.equal(U.describePosition(4, 5), 'end');
  assert.equal(U.describePosition(2, 5), 'middle');
  assert.equal(U.describePosition(0, 1), 'middle');
});

test('groupRows follows the rendered rows for any column count', () => {
  assert.deepEqual(U.groupRows(grid(8, 3)), [[0, 1, 2], [3, 4, 5], [6, 7]]);
  assert.deepEqual(U.groupRows(grid(5, 2)), [[0, 1], [2, 3], [4]]);
  assert.deepEqual(U.groupRows(grid(3, 1)), [[0], [1], [2]]);
  assert.deepEqual(U.groupRows([]), []);
});

test('resolveSlot, 3 columns: A B C / D E F / G H', () => {
  const r = grid(8, 3);
  // Card x ranges: 0-100, 110-210, 220-320. y rows: 0-50, 60-110, 120-170.
  assert.equal(U.resolveSlot(r, { x: 5, y: 25 }), 0);       // left half of A
  assert.equal(U.resolveSlot(r, { x: 95, y: 25 }), 1);      // right half of A
  assert.equal(U.resolveSlot(r, { x: 130, y: 25 }), 1);     // left half of B
  assert.equal(U.resolveSlot(r, { x: 315, y: 25 }), 3);     // right half of C = after C
  assert.equal(U.resolveSlot(r, { x: 225, y: 85 }), 5);       // left half of F = before F
  assert.equal(U.resolveSlot(r, { x: 5, y: 85 }), 3);       // left half of D = before D
  assert.equal(U.resolveSlot(r, { x: 315, y: 85 }), 6);     // right half of F = after F
  assert.equal(U.resolveSlot(r, { x: 5, y: 145 }), 6);      // before G
  assert.equal(U.resolveSlot(r, { x: 215, y: 145 }), 8);    // after H (empty cell to its right)
  assert.equal(U.resolveSlot(r, { x: 315, y: 145 }), 8);
});

test('the row-boundary slot is one logical slot reachable from both rows (C | D, F | G)', () => {
  const r = grid(8, 3);
  const afterC = U.resolveSlot(r, { x: 318, y: 25 });   // right edge of C
  const beforeD = U.resolveSlot(r, { x: 4, y: 85 });    // left edge of D
  assert.equal(afterC, 3);
  assert.equal(beforeD, 3);
  // One slot → one line: it is drawn in the same place from either side.
  assert.deepEqual(U.slotGeometry(r, afterC, { x: 10, y: 10 }), U.slotGeometry(r, beforeD, { x: 10, y: 10 }));
  assert.equal(U.resolveSlot(r, { x: 318, y: 85 }), 6);  // right edge of F
  assert.equal(U.resolveSlot(r, { x: 4, y: 145 }), 6);   // left edge of G
  // Inside one row the answer only depends on x, so a horizontal sweep is monotone.
  const sweep = [5, 60, 105, 150, 205, 260, 318].map(x => U.resolveSlot(r, { x, y: 85 }));
  assert.deepEqual(sweep, [3, 4, 4, 4, 5, 5, 6]);
  assert.ok(sweep.every((s, i) => i === 0 || s >= sweep[i - 1]));
});

test('resolveSlot, 2 columns: A B / C D / E', () => {
  const r = grid(5, 2);
  assert.equal(U.resolveSlot(r, { x: 50, y: 25 }), 0);
  assert.equal(U.resolveSlot(r, { x: 105, y: 25 }), 1);
  assert.equal(U.resolveSlot(r, { x: 205, y: 25 }), 2);   // right of B = after B = before C
  assert.equal(U.resolveSlot(r, { x: 5, y: 85 }), 2);
  assert.equal(U.resolveSlot(r, { x: 205, y: 145 }), 5);  // right of E (empty cell)
});

test('resolveSlot, 1 column: the vertical half of a card decides', () => {
  const r = grid(3, 1);
  assert.equal(U.resolveSlot(r, { x: 50, y: 10 }), 0);
  assert.equal(U.resolveSlot(r, { x: 50, y: 40 }), 1);
  assert.equal(U.resolveSlot(r, { x: 50, y: 70 }), 1);
  assert.equal(U.resolveSlot(r, { x: 50, y: 100 }), 2);
  assert.equal(U.resolveSlot(r, { x: 50, y: 500 }), 3);   // far below → after last
  assert.equal(U.resolveSlot(r, { x: 50, y: -300 }), 0);
});

test('resolveSlot uses the real column count when fewer cards than columns exist', () => {
  const r = grid(1, 3);
  assert.equal(U.resolveSlot(r, { x: 95, y: 40 }, 3), 1);   // right half → after the lone card
  assert.equal(U.resolveSlot(r, { x: 5, y: 40 }, 3), 0);
  assert.equal(U.resolveSlot(r, { x: 5, y: 10 }, 1), 0);
  assert.equal(U.resolveSlot(r, { x: 5, y: 10 }), 0);
  assert.equal(U.resolveSlot([], { x: 5, y: 5 }), 0);
});

test('slotGeometry: vertical lines inside a row, horizontal at row boundaries', () => {
  const r = grid(8, 3);
  const gap = { x: 10, y: 10 };
  assert.deepEqual(U.slotGeometry(r, 0, gap), { orientation: 'v', x: -5, top: 0, bottom: 50 });
  assert.deepEqual(U.slotGeometry(r, 1, gap), { orientation: 'v', x: 105, top: 0, bottom: 50 });
  assert.deepEqual(U.slotGeometry(r, 2, gap), { orientation: 'v', x: 215, top: 0, bottom: 50 });
  // slot 3 = row boundary: horizontal, in the row gap above D, spanning D.
  assert.deepEqual(U.slotGeometry(r, 3, gap), { orientation: 'h', y: 55, left: 0, right: 100 });
  assert.deepEqual(U.slotGeometry(r, 6, gap), { orientation: 'h', y: 115, left: 0, right: 100 });
  assert.deepEqual(U.slotGeometry(r, 7, gap), { orientation: 'v', x: 105, top: 120, bottom: 170 });
  // after the last card of a partial last row: vertical to its right.
  assert.deepEqual(U.slotGeometry(r, 8, gap), { orientation: 'v', x: 215, top: 120, bottom: 170 });
});

test('slotGeometry: a full last row appends with a horizontal line below it', () => {
  const r = grid(6, 3);
  assert.deepEqual(U.slotGeometry(r, 6, { x: 10, y: 10 }), { orientation: 'h', y: 115, left: 0, right: 100 });
});

test('slotGeometry: single column is always horizontal', () => {
  const r = grid(3, 1);
  const gap = { x: 10, y: 10 };
  assert.deepEqual(U.slotGeometry(r, 0, gap), { orientation: 'h', y: -5, left: 0, right: 100 });
  assert.deepEqual(U.slotGeometry(r, 2, gap), { orientation: 'h', y: 115, left: 0, right: 100 });
  assert.deepEqual(U.slotGeometry(r, 3, gap), { orientation: 'h', y: 175, left: 0, right: 100 });
  assert.equal(U.slotGeometry([], 0, gap), null);
});

test('slotGeometry with an explicit column count handles a lone card in a 3-column grid', () => {
  const r = grid(1, 3);
  assert.equal(U.slotGeometry(r, 1, { x: 10, y: 10 }, 3).orientation, 'v');
  assert.equal(U.slotGeometry(r, 1, { x: 10, y: 10 }).orientation, 'h');
});

test('autoscrollDelta: zero in the middle, signed and ramping near the edges', () => {
  const top = 100, bottom = 700, zone = 56;
  assert.equal(U.autoscrollDelta(400, top, bottom, zone, 2, 18), 0);
  assert.equal(U.autoscrollDelta(top + zone, top, bottom, zone, 2, 18), 0);
  const slowUp = U.autoscrollDelta(top + 50, top, bottom, zone, 2, 18);
  const fastUp = U.autoscrollDelta(top + 2, top, bottom, zone, 2, 18);
  assert.ok(slowUp < 0 && fastUp < slowUp);
  const slowDown = U.autoscrollDelta(bottom - 50, top, bottom, zone, 2, 18);
  const fastDown = U.autoscrollDelta(bottom - 2, top, bottom, zone, 2, 18);
  assert.ok(slowDown > 0 && fastDown > slowDown);
  assert.equal(U.autoscrollDelta(top - 40, top, bottom, zone, 2, 18), -18);
  assert.equal(U.autoscrollDelta(bottom + 40, top, bottom, zone, 2, 18), 18);
  assert.equal(U.autoscrollDelta(10, 0, 0, zone, 2, 18), 0);
  // A container shorter than three zones shrinks them: its middle stays dead.
  assert.equal(U.autoscrollDelta(60, 0, 120, 56, 2, 18), 0);
});

test('prep-reorder-utils.js and prep-reorder-ui.js load before app.js with the UI cache marker', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const tag = f => `<script src="js/${f}" data-cache-version="ui"></script>`;
  const at = f => html.indexOf(tag(f));
  assert.ok(at('prep-reorder-utils.js') > -1, 'utils script tag present');
  assert.ok(at('prep-reorder-ui.js') > -1, 'ui script tag present');
  assert.ok(at('prep-reorder-utils.js') < at('prep-reorder-ui.js'));
  assert.ok(at('prep-reorder-ui.js') < at('app.js'));
});
