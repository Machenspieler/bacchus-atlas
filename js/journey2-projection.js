/* ============================================================
   Bacchus's Atlas — journey2-projection.js
   The PLAYER PROJECTION of a Journey 2 map document: a pure, DOM-free function that decides, from the one GM
   document, which generated New Valloren overlays a player may see. It is the single place that filtering
   happens; Player Preview renders its output, and the future print renderer (two A4 map halves) is meant to call
   exactly this and draw the result — it must never filter the GM render with CSS, clone the interactive DOM or
   depend on the viewport, scroll position or sidebar state.

   What a projection contains
     - `overlays`: one entry per generated tile that sits in a REVEALED cell, reduced to what is drawn
       ({ q, r, symbolId, dots, blightMark, tint }). `tint` is the Biome Tint key (js/journey2-biome-tint.js) of the tile's Habitat; it exists only on
       overlays of revealed cells, so hidden cells leak no colour, and `buildPrintProjection` omits it for black-and-white print. A region spanning revealed and hidden cells contributes only its
       revealed tiles; revealing one cell never reveals its region.
     - `revealedCells`: the revealed cell ids (sorted), from which a renderer derives the hidden area (every
       placeable cell not listed). Fog is drawn from this set, never from region data.
     - `perimeter`: the thick region outline as deduplicated hex edges [{ cell, dir, kind: 'outer'|'divider' }] — generated New
       Valloren content, so an edge exists only where the tile's cell AND the cell on the other side are both revealed (a neighbour the
       fog never covers — off-map or title/compass furniture — needs only the tile). No line ends falsely at the edge of the revealed
       area and the shape of a hidden region is never leaked. Cells only: no region ids.
     - `sanctuaryLabels`: [{ anchorId, name }] sorted by anchor id — ONLY the names the GM revealed by hand (PD-027), independent of fog. Nothing else
       about a sanctuary (tables, rolls, Soul Echo, notes) is ever emitted, and an unrevealed sanctuary is absent altogether. `Geo.layoutSanctuaryLabels` places them.
   What it never contains (GM-only): batch/tile/region ids, Encounter, Rumor, notes, the suggested-environment
   list, placement state, selection, warnings, diagnostics, history.

   Always present regardless of the projection (it is not filtered at all): the original base-map image, the
   Old Valloren geography and hex grid printed in it, the printed MARROGATE / HORIZON labels and every sanctuary
   icon already embedded in the base image. The fog is translucent and passes over all of it (PD-024): no rectangular
   cut-outs, and the base-map asset itself is never modified.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./journey2-geometry.js'), require('./journey2-model.js'), require('./journey2-biome-tint.js'));
  else root.Journey2Projection = factory(root.Journey2Geometry, root.Journey2Model, root.Journey2BiomeTint);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Geo, Model, Tint) {
  'use strict';

  /** True when generated content in this cell may be shown to players. */
  function isCellVisibleToPlayers(doc, cellKey) { return Model.isCellRevealed(doc, cellKey); }

  /**
   * Builds the player-facing projection of `doc`. Pure; the result is a plain JSON-safe object that shares nothing
   * mutable with the document.
   */
  function buildPlayerProjection(doc, ctx, opts) {
    const withTint = !(opts && opts.biomeTint === false);
    const revealed = Model.getRevealedCellSet(doc);
    const byBatch = new Map(doc.batches.map(b => [b.id, b]));
    const overlays = [];
    for (const tile of doc.tiles) {
      if (!revealed.has(tile.cell)) continue;                    // hidden cell: the overlay is not produced at all
      const b = byBatch.get(tile.batchId);
      const c = Geo.parseCellId(tile.cell);
      if (!b || !c) continue;
      const o = { q: c.q, r: c.r, symbolId: Model.symbolIdOf(b), dots: b.terrain.value, blightMark: !!(b.habitat.blighted && !b.habitat.overtaken) };
      if (withTint) { const key = Tint.tintKeyOf(b.habitat); if (key) o.tint = key; }
      overlays.push(o);
    }
    // Player knowledge of sanctuary names: only an explicitly revealed name of an existing generated entry, reduced to { anchorId, name } — never the rest of the entry
    const named = new Map(((doc.sanctuaries && doc.sanctuaries.entries) || []).map(e => [e.anchorId, e.name]));
    const sanctuaryLabels = [];
    for (const id of Array.from(Model.getRevealedSanctuaryNameSet(doc)).sort()) {
      const name = named.get(id);
      if (typeof name === 'string' && name.trim() !== '') sanctuaryLabels.push({ anchorId: id, name: name });
    }
    // without a context nothing counts as "never fogged", which is the strictest (never leaking) reading
    const foggable = ctx ? (key => Model.isFoggableCell(ctx, key)) : null;
    return {
      version: 3,
      revealedCells: Array.from(revealed).sort(Model.compareCellKeys),
      overlays: overlays,
      sanctuaryLabels: sanctuaryLabels,
      perimeter: Model.regionBoundarySegments(doc, ctx || null, key => revealed.has(key), foggable),
    };
  }

  /**
   * The projection a print renderer draws. Black-and-white (the default and the only mode implemented) contains NO biome tint at all —
   * not converted to grey, not desaturated, not a hatch — so a printed hex returns to the original monochrome map. It takes no UI state:
   * neither the GM "Biome colors" preference nor the screen Player Preview setting can change it. `{ color: true }` is reserved for a
   * future colour mode and simply keeps the tint keys the screen projection carries.
   */
  function buildPrintProjection(doc, ctx, opts) {
    const color = !!(opts && opts.color === true);
    const p = buildPlayerProjection(doc, ctx, { biomeTint: color });
    p.printMode = color ? 'color' : 'bw';
    return p;
  }

  return { buildPlayerProjection: buildPlayerProjection, buildPrintProjection: buildPrintProjection, isCellVisibleToPlayers: isCellVisibleToPlayers };
});
