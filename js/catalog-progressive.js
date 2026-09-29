/* ============================================================
   Bacchus's Atlas — catalog-progressive.js
   Pure arithmetic behind the main catalog's "Show more" progressive
   loading: how many cards to show initially, how many a "Show more"
   activation reveals, and how a grid-column-count change (a browser
   resize) should adjust an already-expanded view without ever hiding a
   card the reader has already seen. No DOM, no application state — see
   js/app.js (getRenderedColumnCount, renderGrid, renderCatalogMore) for
   where the browser and state.* side of this lives.

   Dependency-free on purpose, the same shape as js/search-index.js: a
   plain <script> in the browser, require()'d as-is from a Node test (see
   tests/catalog-progressive.test.js).
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CatalogProgressive = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const INITIAL_VISIBLE_ROWS = 6;
  const ROWS_PER_LOAD = 4;
  const SHOW_ALL_THRESHOLD = 30;

  // A column count of zero would turn every formula below into a divide-by-zero
  // or a no-op multiply; a computed style the browser couldn't resolve (or a
  // grid not yet laid out) falls back to a single column rather than crashing.
  function safeColumnCount(columnCount) {
    const n = Math.floor(columnCount);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  /** The number of tracks in a resolved `grid-template-columns` computed value
   * ("340px 340px 340px" -> 3). Auto-fill/auto-fit always resolve to a plain
   * space-separated pixel list by the time getComputedStyle reads it, so no
   * CSS breakpoint table needs duplicating here — see js/app.js's
   * getRenderedColumnCount(). */
  function countColumnsFromTemplate(value) {
    if (!value || typeof value !== 'string') return 0;
    return value.trim().split(/\s+/).filter(Boolean).length;
  }

  /** How many cards the catalog shows on first render (or after a search/filter
   * change resets it). A result set of 30 or fewer is shown in full. */
  function calculateInitialVisibleCount(totalCount, columnCount) {
    if (totalCount <= SHOW_ALL_THRESHOLD) return totalCount;
    return Math.min(totalCount, safeColumnCount(columnCount) * INITIAL_VISIBLE_ROWS);
  }

  /** How many cards are visible after one "Show more" activation. */
  function calculateNextVisibleCount(visibleCount, totalCount, columnCount) {
    if (totalCount <= SHOW_ALL_THRESHOLD) return totalCount;
    return Math.min(totalCount, visibleCount + safeColumnCount(columnCount) * ROWS_PER_LOAD);
  }

  /** How many cards stay visible after the grid's column count changes (a
   * browser resize). Never hides a card already on screen: the new count is
   * at least the old one, at least a full six rows at the new column count,
   * and rounded up to a complete row where the total allows it. */
  function calculateResizeVisibleCount(previousVisibleCount, totalCount, columnCount) {
    if (totalCount <= SHOW_ALL_THRESHOLD) return totalCount;
    const cols = safeColumnCount(columnCount);
    const minimumForCurrentGrid = cols * INITIAL_VISIBLE_ROWS;
    const preservedCount = Math.max(previousVisibleCount, minimumForCurrentGrid);
    const alignedCount = Math.ceil(preservedCount / cols) * cols;
    return Math.min(totalCount, alignedCount);
  }

  return {
    INITIAL_VISIBLE_ROWS: INITIAL_VISIBLE_ROWS,
    ROWS_PER_LOAD: ROWS_PER_LOAD,
    SHOW_ALL_THRESHOLD: SHOW_ALL_THRESHOLD,
    countColumnsFromTemplate: countColumnsFromTemplate,
    calculateInitialVisibleCount: calculateInitialVisibleCount,
    calculateNextVisibleCount: calculateNextVisibleCount,
    calculateResizeVisibleCount: calculateResizeVisibleCount,
  };
});
