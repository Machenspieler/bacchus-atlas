/* ============================================================
   Bacchus's Atlas — journey2-projection.js
   The PLAYER PROJECTION of a Journey 2 map document: a pure, DOM-free function that decides, from the one GM
   document, which generated New Valloren overlays a player may see. It is the single place that filtering
   happens; Player Preview renders its output, and the player map print (js/journey2-print.js, two A4 map halves, PD-028) calls
   `buildPrintProjection` and draws the result — it must never filter the GM render with CSS, clone the interactive DOM or
   depend on the viewport, scroll position or sidebar state.

   What a projection contains
     - the PARTY (PD-045): while the party marker is shown, its hex and the six neighbours count as revealed — the projection merges that derived light into
       `revealedCells` (hand-revealed ∪ the party's light, Model.getVisibleCellSet), so overlays, perimeter and X's of those cells reach players like any revealed cell;
       `party: { q, r } | null` is the marker itself. A hidden or unplaced marker contributes nothing.
     - `overlays`: one entry per generated tile that sits in a REVEALED cell, reduced to what is drawn
       ({ q, r, symbolId, dots, blightMark, region, tint }); `region` is an anonymous number (first appearance in cell order) so a renderer can draw one icon per region (PD-062); `blightMark` is the Shadowblight X on that cell (PD-041: it may have moved there, or left). `tint` is the Biome Tint key (js/journey2-biome-tint.js) of the tile's Habitat; it exists only on
       overlays of revealed cells, so hidden cells leak no colour, and `buildPrintProjection` omits it for black-and-white print. A region spanning revealed and hidden cells contributes only its
       revealed tiles; revealing one cell never reveals its region.
     - `shadowMarks`: [{ q, r }] — an X on a REVEALED hex that has no tile (a moved X on open ground); an X on a tile rides on its overlay's `blightMark`.
     - `revealedCells`: the revealed cell ids (sorted), from which a renderer derives the hidden area (every
       placeable cell not listed). Fog is drawn from this set, never from region data.
     - `perimeter`: the thick region outline as deduplicated hex edges [{ cell, dir, kind: 'outer'|'divider' }] — generated New
       Valloren content, so an edge exists only where the tile's cell AND the cell on the other side are both revealed (a neighbour the
       fog never covers — off-map or title/compass furniture — needs only the tile). No line ends falsely at the edge of the revealed
       area and the shape of a hidden region is never leaked. Cells only: no region ids.
     - `sanctuaryLabels`: [{ anchorId, name }] sorted by anchor id — ONLY the names the GM revealed by hand (PD-027), independent of fog. Nothing else
       about a sanctuary (tables, rolls, Soul Echo, notes) is ever emitted, and an unrevealed sanctuary is absent altogether. `Geo.layoutSanctuaryLabels` places them.
     - `collectedEchoes`: sorted sanctuary ids of Soul Echoes the GM marked Collected whose sanctuary hex is REVEALED (PD-052; fog wins). Nothing else about Echoes is ever emitted; the print draws it as the static spent marker (PD-077).
     - `destroyedSanctuaries`: sorted sanctuary ids the GM marked destroyed (PD-070) whose sanctuary hex is REVEALED (fog wins, the party's light counts). Nothing else — never how many exist. The print KEEPS it.
   What it never contains (GM-only): batch/tile/region ids, Encounter, Rumor, notes, the suggested-environment
   list, placement state, selection, warnings, diagnostics, history, an Available Echo.

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
   * Player knowledge of sanctuary names (PD-027): only an explicitly revealed name of an existing generated entry, reduced to { anchorId, name },
   * sorted by anchor id — never the rest of the entry. The GM map draws the same labels, so both views read this one function.
   */
  function sanctuaryLabelsOf(doc) {
    const named = new Map(((doc.sanctuaries && doc.sanctuaries.entries) || []).map(e => [e.anchorId, e.name]));
    const labels = [];
    for (const id of Array.from(Model.getRevealedSanctuaryNameSet(doc)).sort()) {
      const name = named.get(id);
      if (typeof name === 'string' && name.trim() !== '') labels.push({ anchorId: id, name: name });
    }
    return labels;
  }

  /**
   * Soul Echoes players know about (PD-052): ONLY an Echo the GM marked Collected, and only while its sanctuary's own hex is revealed — Fog of War beats it.
   * An Available Echo is never emitted (the secret stays GM-only) and neither is how many exist. Sorted sanctuary ids; without a context nothing counts as revealed. The print carries it too, as the same static spent marker in black and white (PD-077).
   */
  function collectedEchoesOf(doc, ctx, revealed) {
    if (!ctx) return [];
    const got = Model.getCollectedEchoSet(doc), out = [];
    for (const s of ctx.sanctuaries) if (got.has(s.id) && s.cellId && revealed.has(s.cellId)) out.push(s.id);
    return out.sort();
  }

  /**
   * Destroyed sanctuaries players know about (PD-070): a sanctuary the GM's Campaign menu marked destroyed, and only while its own hex is revealed — Fog of War
   * beats it, the party's light counts, and how many exist is never emitted. Sorted sanctuary ids. Unlike an Echo this one also reaches the print.
   */
  function destroyedSanctuariesOf(doc, ctx, revealed) {
    if (!ctx) return [];
    const ruined = Model.getDestroyedSanctuarySet(doc), out = [];
    for (const s of ctx.sanctuaries) if (ruined.has(s.id) && s.cellId && revealed.has(s.cellId)) out.push(s.id);
    return out.sort();
  }

  /**
   * Builds the player-facing projection of `doc`. Pure; the result is a plain JSON-safe object that shares nothing
   * mutable with the document.
   */
  function buildPlayerProjection(doc, ctx, opts) {
    const withTint = !(opts && opts.biomeTint === false);
    const revealed = ctx ? Model.getVisibleCellSet(doc, ctx) : Model.getRevealedCellSet(doc);   // hand-revealed cells plus the party's light (PD-045)
    const byBatch = new Map(doc.batches.map(b => [b.id, b]));
    const overlays = [], onTile = new Set(), marks = Model.getShadowXSet(doc), regionNo = new Map();
    // overlays are numbered in cell order by first appearance — the same anonymous region number the share link carries (PD-052), never an id
    const ordered = doc.tiles.filter(tile => revealed.has(tile.cell)).sort((a, b) => Model.compareCellKeys(a.cell, b.cell));
    for (const tile of ordered) if (!regionNo.has(tile.batchId)) regionNo.set(tile.batchId, regionNo.size);
    for (const tile of doc.tiles) {
      if (!revealed.has(tile.cell)) continue;                    // hidden cell: the overlay is not produced at all
      const b = byBatch.get(tile.batchId);
      const c = Geo.parseCellId(tile.cell);
      if (!b || !c) continue;
      onTile.add(tile.cell);
      const o = { q: c.q, r: c.r, symbolId: Model.symbolIdOf(b), dots: b.habitat.overtaken ? 0 : b.terrain.value, blightMark: marks.has(tile.cell), region: regionNo.get(tile.batchId) };
      if (withTint) { const key = Tint.tintKeyOf(b.habitat); if (key) o.tint = key; }
      overlays.push(o);
    }
    // an X that stands on a revealed hex with no tile of its own (PD-041) has no overlay to ride on: it is listed on its own, as a bare cell
    const shadowMarks = [];
    for (const id of Array.from(marks).sort(Model.compareCellKeys)) {
      if (!revealed.has(id) || onTile.has(id)) continue;
      const c = Geo.parseCellId(id);
      if (c) shadowMarks.push({ q: c.q, r: c.r });
    }
    const sanctuaryLabels = sanctuaryLabelsOf(doc);
    const collectedEchoes = collectedEchoesOf(doc, ctx, revealed);
    const destroyedSanctuaries = destroyedSanctuariesOf(doc, ctx, revealed);
    const partyCell = Model.getPartyCell(doc), partyAt = partyCell ? Geo.parseCellId(partyCell) : null;
    // without a context nothing counts as "never fogged", which is the strictest (never leaking) reading
    const foggable = ctx ? (key => Model.isFoggableCell(ctx, key)) : null;
    return {
      version: 4,
      revealedCells: Array.from(revealed).sort(Model.compareCellKeys),
      overlays: overlays,
      shadowMarks: shadowMarks,
      sanctuaryLabels: sanctuaryLabels,
      collectedEchoes: collectedEchoes,
      destroyedSanctuaries: destroyedSanctuaries,
      party: partyAt ? { q: partyAt.q, r: partyAt.r } : null,
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
    // the Shadowblight X's print (PD-072, reversing the 2026-10-16 amendment): on paper they are the only mark of the corruption — the screen's living
    // shadow never prints — so a revealed X prints where it is now, on a tile (`blightMark`) or on open ground (`shadowMarks`), fog-filtered like the rest
    // the print keeps what players know: a Collected Echo and a destroyed sanctuary, both only on revealed hexes (PD-077; an Available Echo is never emitted)
    return p;
  }

  return { buildPlayerProjection: buildPlayerProjection, buildPrintProjection: buildPrintProjection, isCellVisibleToPlayers: isCellVisibleToPlayers, sanctuaryLabelsOf: sanctuaryLabelsOf };
});
