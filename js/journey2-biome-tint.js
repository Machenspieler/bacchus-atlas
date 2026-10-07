/* ============================================================
   Bacchus's Atlas — journey2-biome-tint.js
   The ONE place the Journey 2 Biome Tint palette lives (PD-026). A pure, DOM-free table that maps a placed generated tile's Habitat to a
   faint, watercolour-like wash painted inside its hexagon. The tint is DERIVED presentation: it is read from the region's Habitat every
   render, never stored in the document, the backup, history or geometry, and it never depends on the Environment assigned to a hex, its
   Tier, Encounter, Rumor, Soul Echoes, sanctuaries or Terrain.

   Rules the rest of the code relies on
     - Shadowblight never replaces the Habitat colour: a blighted Wetland is the Wetland tint (the blight X mark says "corrupt").
     - Only a FULLY overtaken region (no base Habitat left) uses the dedicated neutral violet-grey fallback.
     - Opacities are deliberately low (about 0.06–0.10) and tuned per hue, because the same alpha does not read equally strong in every colour.
     - Black-and-white print never receives tint at all (not grayscale, not a hatch) — see journey2-projection.js `buildPrintProjection`.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Journey2BiomeTint = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const OVERTAKEN_KEY = 'overtaken';

  /** key -> { color, opacity }. Keys are the eleven Habitat ids plus OVERTAKEN_KEY. */
  const PALETTE = Object.freeze({
    underground: Object.freeze({ color: '#5d4a82', opacity: 0.09 }),   // muted violet / charcoal-purple
    aquatic:     Object.freeze({ color: '#2c6db5', opacity: 0.08 }),   // cool blue
    wetland:     Object.freeze({ color: '#2a8a7c', opacity: 0.09 }),   // muted teal / marsh green
    grassland:   Object.freeze({ color: '#a2b82a', opacity: 0.09 }),   // soft yellow-green
    tropical:    Object.freeze({ color: '#12a46c', opacity: 0.08 }),   // subdued emerald
    forest:      Object.freeze({ color: '#23703c', opacity: 0.09 }),   // natural deep green
    drylands:    Object.freeze({ color: '#c9a050', opacity: 0.10 }),   // sand / muted terracotta
    rolling:     Object.freeze({ color: '#7f8734', opacity: 0.08 }),   // soft olive
    mountain:    Object.freeze({ color: '#5f7596', opacity: 0.09 }),   // cool slate-blue / stone
    frozen:      Object.freeze({ color: '#62c6e2', opacity: 0.09 }),   // pale cyan / ice blue
    badlands:    Object.freeze({ color: '#b2552a', opacity: 0.08 }),   // muted rust / burnt sienna
    overtaken:   Object.freeze({ color: '#6f6679', opacity: 0.08 }),   // fully overtaken: neutral violet-grey
  });

  /** The tint key of a region's habitat: its base biome (blighted or not), or the fallback when fully overtaken. */
  function tintKeyOf(habitat) {
    if (!habitat) return null;
    if (habitat.overtaken) return OVERTAKEN_KEY;
    return Object.prototype.hasOwnProperty.call(PALETTE, habitat.biome) && habitat.biome !== OVERTAKEN_KEY ? habitat.biome : null;
  }

  /** { color, opacity } for a tint key, or null for an unknown key. */
  function definitionOf(key) { return typeof key === 'string' && Object.prototype.hasOwnProperty.call(PALETTE, key) ? PALETTE[key] : null; }

  /**
   * The GM-view tint of every placed tile, derived from the document each render: Map cellId -> tint key. Empty when `enabled` is false
   * (the "Biome colors" display preference), which therefore hides the tint and nothing else.
   */
  function gmTintByCell(doc, enabled) {
    const out = new Map();
    if (!enabled || !doc) return out;
    const byBatch = new Map(doc.batches.map(b => [b.id, b]));
    for (const tile of doc.tiles) {
      const b = byBatch.get(tile.batchId), key = b ? tintKeyOf(b.habitat) : null;
      if (key) out.set(tile.cell, key);
    }
    return out;
  }

  return { gmTintByCell: gmTintByCell, PALETTE: PALETTE, OVERTAKEN_KEY: OVERTAKEN_KEY, tintKeyOf: tintKeyOf, definitionOf: definitionOf };
});
