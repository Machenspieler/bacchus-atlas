/* ============================================================
   Bacchus's Atlas — list-utils.js
   Pure, dependency-free helpers for list-name validation: the trimmed-name
   normalizer shared by list creation (Lists page + Add to List modal) and
   the rename-resolution boundary used by list renaming. See the "Lists
   validation" section in CLAUDE.md.

   No DOM, no application state, no i18n, no persistence — same shape as
   js/route-utils.js and js/safe-storage.js, loaded as a plain <script> in
   the browser and required() as-is from a Node test (see
   tests/list-rename.test.js).
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ListUtils = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Trims a raw input value to a usable list name. Treats a missing or
   * non-string value as empty rather than throwing, so a caller never has
   * to guard the type first. */
  function normalizeName(rawValue) {
    return String(rawValue == null ? '' : rawValue).trim();
  }

  /** Resolves an attempted list rename against the list's current committed
   * name. Never mutates `currentName` or `rawValue`, never touches the DOM,
   * i18n, or persistence — the caller decides what an "invalid", "unchanged"
   * or "changed" result means for the UI and for storage.
   *
   * - "invalid": rawValue trims to nothing. `value` is `currentName`,
   *   unchanged, for the caller to restore into the input.
   * - "unchanged": rawValue trims to exactly `currentName`. `value` is
   *   `currentName` — nothing to persist, but the input may still need its
   *   whitespace normalized away.
   * - "changed": rawValue trims to a new, non-empty name. `value` is the
   *   trimmed name to commit and persist.
   */
  function resolveListRename(currentName, rawValue) {
    const trimmed = normalizeName(rawValue);
    if (!trimmed) return { status: 'invalid', value: currentName };
    if (trimmed === currentName) return { status: 'unchanged', value: currentName };
    return { status: 'changed', value: trimmed };
  }

  return {
    normalizeName: normalizeName,
    resolveListRename: resolveListRename,
  };
});
