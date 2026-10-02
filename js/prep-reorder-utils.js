/* ============================================================
   Bacchus's Atlas — prep-reorder-utils.js
   Pure helpers behind drag-and-drop / keyboard reordering of the selected
   Prep cards: id-array moves and inserts, the "virtual insertion slot"
   geometry (which of the N+1 slots a pointer is nearest to, and where the
   insertion line for that slot is drawn), keyboard targets, and the
   autoscroll speed curve.

   The data model is one linear array per section (prep.environmentIds /
   adversaryIds / itemIds); a CSS grid fills it left → right, top → bottom.
   Nothing here knows about columns as data: rows are derived from the
   *rendered* rects every time, so the same code works for 3, 2 and 1 column
   layouts and for a partially filled last row.

   No DOM, no state, no persistence — same shape as js/prep-utils.js, loaded
   as a plain <script> before js/prep-reorder-ui.js and required() as-is from
   a Node test (tests/prep-reorder-utils.test.js). Rects are plain
   { left, top, right, bottom } objects in viewport coordinates.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.PrepReorderUtils = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------------- id arrays ---------------- */

  /** Moves the id at `from` so it ends up at index `to` of the result.
   * Returns `ids` itself (not a copy) when nothing would change, so a caller
   * can skip a write by identity. Never mutates `ids`. */
  function moveId(ids, from, to) {
    if (!Array.isArray(ids)) return ids;
    var last = ids.length - 1;
    if (from < 0 || from > last || to < 0 || to > last || from === to) return ids;
    var next = ids.slice();
    var moved = next.splice(from, 1)[0];
    next.splice(to, 0, moved);
    return next;
  }

  /** Inserts `id` before the element currently at `index` (`index ===
   * ids.length` appends). Returns `ids` itself when `id` is already present
   * — a selection never holds duplicates. Out-of-range indexes clamp. */
  function insertId(ids, id, index) {
    if (!Array.isArray(ids) || ids.indexOf(id) !== -1) return ids;
    var at = Math.max(0, Math.min(ids.length, index));
    var next = ids.slice();
    next.splice(at, 0, id);
    return next;
  }

  /** A slot is the gap *before* card `slot` (0..N, N = after the last card).
   * Final index of a card that is moved from `from` into `slot`: removing it
   * first shifts every later slot down by one. */
  function finalIndexForSlot(from, slot) {
    return slot > from ? slot - 1 : slot;
  }

  /** Dropping a card into the slot directly before or after itself changes
   * nothing — the insertion line is never shown for these. */
  function isNoopSlot(from, slot) {
    return slot === from || slot === from + 1;
  }

  /** Where Alt+↑/↓ (and Alt+Shift+↑/↓ for the ends) send the card at
   * `index`, in the *linear* order. null when that would not move it. */
  function keyboardTarget(index, length, key, toEnd) {
    var to;
    if (key === 'ArrowUp') to = toEnd ? 0 : index - 1;
    else if (key === 'ArrowDown') to = toEnd ? length - 1 : index + 1;
    else return null;
    if (to < 0 || to > length - 1 || to === index) return null;
    return to;
  }

  /** 'start' | 'end' | 'middle' — which announcement a landing index gets. */
  function describePosition(index, length) {
    if (length > 1 && index === 0) return 'start';
    if (length > 1 && index === length - 1) return 'end';
    return 'middle';
  }

  /* ---------------- grid geometry ---------------- */

  /** Groups card rects (in DOM / linear order) into visual rows. A card starts
   * a new row when it sits lower than the previous card by more than half a
   * card height — robust to sub-pixel differences and to any column count.
   * Returns arrays of card indexes: [[0,1,2],[3,4,5],[6,7]]. */
  function groupRows(rects) {
    var rows = [];
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      var cur = rows.length ? rows[rows.length - 1] : null;
      if (cur) {
        var first = rects[cur[0]];
        if (r.top - first.top <= (first.bottom - first.top) / 2) { cur.push(i); continue; }
      }
      rows.push([i]);
    }
    return rows;
  }

  function maxRowLength(rows) {
    return rows.reduce(function (m, row) { return Math.max(m, row.length); }, 0);
  }

  /** Which of the N+1 insertion slots the pointer is nearest to.
   *
   * 1. Pick the *row* by vertical distance to the pointer (inside a row = 0;
   *    in the gap between rows, the nearer row wins).
   * 2. Inside that row pick the slot by horizontal distance to the row's slot
   *    anchors: the left edge of its first card, the middle of each gap
   *    between cards, the right edge of its last card. A single-column layout
   *    has one card per row, so there it is the vertical half of the card
   *    that decides (above its middle = before, below = after).
   *
   * The slot "after the last card of row r" and the slot "before the first
   * card of row r+1" are the same logical slot (same index), so crossing a
   * row boundary — C → D in A B C / D E F — never makes the result jump
   * between two different answers. `columns` is the grid's real column count
   * (from its computed style); without it the widest rendered row is used,
   * which misreads a section holding fewer cards than columns. */
  function resolveSlot(rects, point, columns) {
    if (!rects.length) return 0;
    var rows = groupRows(rects);
    var cols = columns || maxRowLength(rows);

    var best = rows[0];
    var bestDy = Infinity;
    rows.forEach(function (row) {
      var top = rects[row[0]].top;
      var bottom = top;
      row.forEach(function (i) { bottom = Math.max(bottom, rects[i].bottom); });
      var dy = point.y < top ? top - point.y : point.y > bottom ? point.y - bottom : 0;
      if (dy < bestDy) { bestDy = dy; best = row; }
    });

    var first = best[0];
    var last = best[best.length - 1];
    if (cols === 1) {
      var card = rects[first];
      return point.y < (card.top + card.bottom) / 2 ? first : first + 1;
    }

    var slot = first;
    var bestDx = Infinity;
    for (var k = first; k <= last + 1; k++) {
      var ax;
      if (k === first) ax = rects[first].left;
      else if (k === last + 1) ax = rects[last].right;
      else ax = (rects[k - 1].right + rects[k].left) / 2;
      var dx = Math.abs(point.x - ax);
      if (dx < bestDx) { bestDx = dx; slot = k; }
    }
    return slot;
  }

  /** Where the insertion line for `slot` is drawn, as a centre line:
   *   { orientation: 'v', x, top, bottom }   — between two cards of one row,
   *       before the first card, or after the last card of a partial last row
   *   { orientation: 'h', y, left, right }   — a row boundary (the slot that
   *       starts a new row), below a full last row, and every slot of a
   *       single-column layout; it spans the card that would start that row.
   * `gap` = { x, y } is the grid's column / row gap, used to centre the line
   * in the gutter rather than on a card edge. `columns`: as for resolveSlot(). */
  function slotGeometry(rects, slot, gap, columns) {
    var n = rects.length;
    if (!n) return null;
    var gx = gap && gap.x != null ? gap.x : 8;
    var gy = gap && gap.y != null ? gap.y : 8;
    var rows = groupRows(rects);
    var cols = columns || maxRowLength(rows);
    var s = Math.max(0, Math.min(n, slot));

    function rowOf(i) {
      for (var r = 0; r < rows.length; r++) if (rows[r].indexOf(i) !== -1) return rows[r];
      return rows[rows.length - 1];
    }
    function rowBounds(row) {
      var top = rects[row[0]].top, bottom = top;
      row.forEach(function (i) { top = Math.min(top, rects[i].top); bottom = Math.max(bottom, rects[i].bottom); });
      return { top: top, bottom: bottom };
    }
    function horizontalAbove(i) {
      return { orientation: 'h', y: rects[i].top - gy / 2, left: rects[i].left, right: rects[i].right };
    }

    if (cols === 1) {
      if (s < n) return horizontalAbove(s);
      return { orientation: 'h', y: rects[n - 1].bottom + gy / 2, left: rects[n - 1].left, right: rects[n - 1].right };
    }

    if (s === 0) {
      var b0 = rowBounds(rows[0]);
      return { orientation: 'v', x: rects[0].left - gx / 2, top: b0.top, bottom: b0.bottom };
    }
    if (s < n) {
      var row = rowOf(s);
      if (row.indexOf(s - 1) !== -1) {
        var b = rowBounds(row);
        return { orientation: 'v', x: (rects[s - 1].right + rects[s].left) / 2, top: b.top, bottom: b.bottom };
      }
      return horizontalAbove(s);
    }
    var lastRow = rows[rows.length - 1];
    if (lastRow.length < cols) {
      var bl = rowBounds(lastRow);
      return { orientation: 'v', x: rects[n - 1].right + gx / 2, top: bl.top, bottom: bl.bottom };
    }
    var startOfLast = rects[lastRow[0]];
    return { orientation: 'h', y: rowBounds(lastRow).bottom + gy / 2, left: startOfLast.left, right: startOfLast.right };
  }

  /* ---------------- autoscroll ---------------- */

  /** Signed scroll speed (in whatever unit minSpeed/maxSpeed use — the UI
   * passes px per second) for one vertical scroll container: negative =
   * scroll up, positive = down, 0 outside both edge zones. Speed ramps from
   * `minSpeed` at the inner edge of a zone to `maxSpeed` at the container's
   * own edge (and beyond it). Zones shrink on a container too short for two
   * of them plus a dead middle. */
  function autoscrollDelta(y, top, bottom, zone, minSpeed, maxSpeed) {
    var height = bottom - top;
    if (height <= 0) return 0;
    var z = Math.min(zone, height / 3);
    if (z <= 0) return 0;
    function speed(depth) {
      var ratio = Math.max(0, Math.min(1, depth / z));
      return minSpeed + (maxSpeed - minSpeed) * ratio;
    }
    if (y < top + z) return -speed(top + z - y);
    if (y > bottom - z) return speed(y - (bottom - z));
    return 0;
  }

  return {
    moveId: moveId,
    insertId: insertId,
    finalIndexForSlot: finalIndexForSlot,
    isNoopSlot: isNoopSlot,
    keyboardTarget: keyboardTarget,
    describePosition: describePosition,
    groupRows: groupRows,
    resolveSlot: resolveSlot,
    slotGeometry: slotGeometry,
    autoscrollDelta: autoscrollDelta,
  };
});
