/* ============================================================
   Bacchus's Atlas — journey2-projection.js
   The PLAYER PROJECTION of a Journey 2 map document: a pure, DOM-free function that decides, from the one GM
   document, which generated New Valloren overlays a player may see. It is the single place that filtering
   happens; Player Preview renders its output, and the future print renderer (two A4 map halves) is meant to call
   exactly this and draw the result — it must never filter the GM render with CSS, clone the interactive DOM or
   depend on the viewport, scroll position or sidebar state.

   What a projection contains
     - `overlays`: one entry per generated tile that sits in a REVEALED cell, reduced to what is drawn
       ({ q, r, symbolId, dots, blightMark }). A region spanning revealed and hidden cells contributes only its
       revealed tiles; revealing one cell never reveals its region.
     - `revealedCells`: the revealed cell ids (sorted), from which a renderer derives the hidden area (every
       placeable cell not listed). Fog is drawn from this set, never from region data.
   What it never contains (GM-only): batch/tile/region ids, Encounter, Rumor, notes, the suggested-environment
   list, placement state, selection, warnings, diagnostics, history.

   Always visible regardless of the projection (it is not filtered at all): the original base-map image, the
   Old Valloren geography and hex grid printed in it, the printed MARROGATE / HORIZON labels and every sanctuary
   icon already embedded in the base image. The renderer must not cover those with the fog (see `fogMaskRects`).
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./journey2-geometry.js'), require('./journey2-model.js'));
  else root.Journey2Projection = factory(root.Journey2Geometry, root.Journey2Model);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Geo, Model) {
  'use strict';

  /** True when generated content in this cell may be shown to players. */
  function isCellVisibleToPlayers(doc, cellKey) { return Model.isCellRevealed(doc, cellKey); }

  /**
   * Builds the player-facing projection of `doc`. Pure; the result is a plain JSON-safe object that shares nothing
   * mutable with the document.
   */
  function buildPlayerProjection(doc) {
    const revealed = Model.getRevealedCellSet(doc);
    const byBatch = new Map(doc.batches.map(b => [b.id, b]));
    const overlays = [];
    for (const tile of doc.tiles) {
      if (!revealed.has(tile.cell)) continue;                    // hidden cell: the overlay is not produced at all
      const b = byBatch.get(tile.batchId);
      const c = Geo.parseCellId(tile.cell);
      if (!b || !c) continue;
      overlays.push({ q: c.q, r: c.r, symbolId: Model.symbolIdOf(b), dots: b.terrain.value, blightMark: !!(b.habitat.blighted && !b.habitat.overtaken) });
    }
    return {
      version: 1,
      revealedCells: Array.from(revealed).sort(Model.compareCellKeys),
      overlays: overlays,
    };
  }

  /**
   * Rectangles (world px) the fog must never cover: every sanctuary icon's protection area and every printed label
   * (MARROGATE, HORIZON, ...) of the base map. A renderer cuts these out of the fog (an SVG mask), so the original
   * artwork stays fully visible without being modified, masked or replaced.
   */
  function fogMaskRects(anchorsDoc) {
    const out = [];
    for (const a of (anchorsDoc && anchorsDoc.anchors) || []) {
      if (a.iconProtectionArea && a.iconProtectionArea.rectPx) out.push(a.iconProtectionArea.rectPx.slice());
      if (a.builtInLabel && a.builtInLabel.protectionRectPx) out.push(a.builtInLabel.protectionRectPx.slice());
    }
    return out;
  }

  return { buildPlayerProjection: buildPlayerProjection, isCellVisibleToPlayers: isCellVisibleToPlayers, fogMaskRects: fogMaskRects };
});
