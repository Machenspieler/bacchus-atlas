/* ============================================================
   Bacchus's Atlas — journey2-print.js
   The PLAYER MAP PRINT model (PD-028, PD-073): a pure, DOM-free function from the one GM document to the content of exactly FOUR A4
   landscape sheets — the original Old Valloren map cut into a 2 x 2 grid, each sheet overlapping its neighbours by about one hex so the
   sheets can be trimmed and taped together. It is the only thing the Print Preview and the physical print
   draw from; it knows no camera, zoom, pan, sidebar, viewport, selection, language or UI preference.

   Fog of War is a DATA FILTER here, not a drawing: the print has no fog layer, hatch, wash or grey at all. Generated New Valloren
   content exists in the model only for cells in `playerVisibility.revealedCells` (via `Journey2Projection.buildPrintProjection`); an
   unrevealed cell is simply absent, so it prints as the untouched Old Valloren map. The model also has no biome tint (omitted, not
   greyed), no Environment, no Soul Echo, no sanctuary data beyond a revealed { anchorId, name } and the revealed destroyed sanctuaries (PD-070: a static flame and smoke), and no region/tile/batch id. The one exception to "revealed cells only"
   is the party marker (PD-045): while it is shown its seven cells are present like revealed ones (the projection merges them) and the marker itself is drawn, as a black star.

   Pages. `pagesFromTemplate` reads the two panels the world raster was assembled from (`template.composition.panels`; the vertical seam
   is where they meet) and halves the map's height: four `core` rectangles that partition the map (row-major: NW, NE, SW, SE). A page is a
   1:1 crop of that raster: its `rect` is its core grown by OVERLAP_HALF_PX towards each internal neighbour, so two neighbours share a
   strip OVERLAP_PX wide; plus the SVG `viewBox` of the page ([0, 0, w, h]) and the `translate` that maps a world point into page-local
   space (`worldToPage`). One uniform scale for all four. Content in an overlap strip is assigned to both pages and clipped by each page's
   own viewport — nothing is shifted or stretched. A sanctuary label is never split: it belongs to the page whose CORE holds its icon and
   is clamped inside that core minus the overlap strips, so it is visible whichever sheet ends up on top. `trim` says which edges of a
   sheet are cut off along the printed marks (the right edge of the left column, the bottom edge of the top row): sheets 1-3 are laid over
   their neighbours.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./journey2-geometry.js'), require('./journey2-projection.js'));
  else root.Journey2Print = factory(root.Journey2Geometry, root.Journey2Projection);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Geo, Projection) {
  'use strict';

  // A4 landscape. The map is drawn inside the margins; the bottom margin also carries the sheet label (printed, PD-073).
  const A4_MM = { widthMm: 297, heightMm: 210, marginXMm: 6, marginTopMm: 5, marginBottomMm: 16 };
  const PAGE_IDS = ['v1', 'v2', 'v3', 'v4'];
  const OVERLAP_PX = 104;                                       // about one hex (the lattice period is 104.86 world px): the strip two neighbouring sheets share
  const OVERLAP_HALF_PX = OVERLAP_PX / 2;
  const RUIN_BOX = [45, 160, 240, 200];                          // the destroyed-sanctuary glyph's world box relative to the icon centre: [left, up, width, height] — keep in step with ruinMarkup in journey2-view.js
  const LABEL_STROKE_PX = 3;                                    // the halo of `.j2-pp-svg .j2-sanc-label` in journey2.css — keep in step

  /**
   * The four printed pages of a map template, row-major (NW, NE, SW, SE). Validates the geometry and THROWS on anything unexpected (no silent
   * fallback to a stretched full map): exactly two panels, side by side, covering the world raster exactly; the map's height is halved. All four
   * share one uniform scale that fits the largest into the printable A4 landscape area (never cropped or stretched).
   */
  function pagesFromTemplate(template) {
    const comp = template && template.composition, panels = comp && comp.panels, asset = template && template.assembledAsset, size = template && template.worldSizePx;
    if (!Array.isArray(panels) || panels.length !== 2) throw new Error('Journey2Print: the template must define exactly two map panels.');
    if (!asset || typeof asset.path !== 'string' || !Array.isArray(size) || size.length !== 2) throw new Error('Journey2Print: the template has no assembled map asset.');
    const sorted = panels.slice().sort((a, b) => a.worldRectPx[0] - b.worldRectPx[0]);
    const printable = [A4_MM.widthMm - 2 * A4_MM.marginXMm, A4_MM.heightMm - A4_MM.marginTopMm - A4_MM.marginBottomMm];
    let edge = 0;
    sorted.forEach(p => {
      const r = p.worldRectPx;
      if (!Array.isArray(r) || r.length !== 4 || !r.every(Number.isFinite) || r[2] <= 0 || r[3] <= 0) throw new Error('Journey2Print: invalid page rectangle for panel ' + p.id + '.');
      if (r[0] !== edge || r[1] !== 0 || r[3] !== size[1]) throw new Error('Journey2Print: panel ' + p.id + ' does not continue the previous one / span the map height.');
      edge = r[0] + r[2];
    });
    if (edge !== size[0]) throw new Error('Journey2Print: the two panels do not cover the whole map width.');
    const cut = Math.floor(size[1] / 2), rows = [[0, cut], [cut, size[1] - cut]];
    const pages = [];
    rows.forEach((row, ri) => sorted.forEach((p, ci) => {
      const c = p.worldRectPx, core = [c[0], row[0], c[2], row[1]];
      const x0 = core[0] - (ci > 0 ? OVERLAP_HALF_PX : 0), x1 = core[0] + core[2] + (ci < 1 ? OVERLAP_HALF_PX : 0);
      const y0 = core[1] - (ri > 0 ? OVERLAP_HALF_PX : 0), y1 = core[1] + core[3] + (ri < 1 ? OVERLAP_HALF_PX : 0);
      const r = [x0, y0, x1 - x0, y1 - y0];
      const src = ((comp.sources || []).find(s => s.id === p.id)) || null;
      pages.push({
        id: PAGE_IDS[pages.length], panelId: p.id, index: pages.length, col: ci, row: ri,
        core: core,
        rect: r,
        // where labels may stand: the core minus the overlap strips, so a label is readable whichever sheet is laid on top
        labelBounds: [core[0] + (ci > 0 ? OVERLAP_HALF_PX : 0), core[1] + (ri > 0 ? OVERLAP_HALF_PX : 0), core[0] + core[2] - (ci < 1 ? OVERLAP_HALF_PX : 0), core[1] + core[3] - (ri < 1 ? OVERLAP_HALF_PX : 0)],
        viewBox: [0, 0, r[2], r[3]],
        translate: [-r[0], -r[1]],
        trim: { right: ci < 1, bottom: ri < 1 },
        source: { path: asset.path, worldSizePx: size.slice(), nativeSource: src ? { path: src.sourcePath, sha256: src.sha256 } : null },
      });
    }));
    // one uniform scale for the four sheets, so a hex is the same size on every one and the overlap strips match
    const scale = Math.min(printable[0] / Math.max.apply(null, pages.map(p => p.rect[2])), printable[1] / Math.max.apply(null, pages.map(p => p.rect[3])));
    pages.forEach(p => {
      const w = p.rect[2] * scale, h = p.rect[3] * scale;
      p.scaleMmPerPx = scale;
      p.placeMm = [(A4_MM.widthMm - w) / 2, A4_MM.marginTopMm, w, h];         // the map's box on the sheet: [x, y, w, h] in mm
    });
    return pages;
  }

  /** World point -> page-local point (pure translation: the page is a 1:1 crop). */
  function worldToPage(pt, page) { return [pt[0] + page.translate[0], pt[1] + page.translate[1]]; }
  function pageToWorld(pt, page) { return [pt[0] - page.translate[0], pt[1] - page.translate[1]]; }

  /** Which page OWNS a world point: the cores partition the map, half-open on the right and at the bottom (a seam belongs to the east / south page); the map's last column and row belong to the last page there. */
  function pageOfPoint(pt, pages) {
    const mapW = Math.max.apply(null, pages.map(p => p.core[0] + p.core[2])), mapH = Math.max.apply(null, pages.map(p => p.core[1] + p.core[3]));
    if (!(pt[0] >= 0 && pt[0] <= mapW && pt[1] >= 0 && pt[1] <= mapH)) return null;
    const x = pt[0] === mapW ? mapW - 1e-9 : pt[0], y = pt[1] === mapH ? mapH - 1e-9 : pt[1];
    for (const p of pages) { const r = p.core; if (x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3]) return p; }
    return null;
  }

  /** Axis-aligned world rect [x, y, w, h] clipped to a page; null when they do not overlap by area. */
  function clipRect(rect, page) {
    const r = page.rect;
    const x0 = Math.max(rect[0], r[0]), y0 = Math.max(rect[1], r[1]), x1 = Math.min(rect[0] + rect[2], r[0] + r[2]), y1 = Math.min(rect[1] + rect[3], r[1] + r[3]);
    return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null;
  }

  /** Liang–Barsky: the part of world segment a→b inside a page (closed rectangle), or null. */
  function clipSegment(a, b, page) {
    const r = page.rect, dx = b[0] - a[0], dy = b[1] - a[1];
    let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx, a[0] - r[0]], [dx, r[0] + r[2] - a[0]], [-dy, a[1] - r[1]], [dy, r[1] + r[3] - a[1]]]) {
      if (p === 0) { if (q < 0) return null; continue; }
      const t = q / p;
      if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
    return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
  }

  function bboxOf(points) {
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
    return [x0, y0, Math.max.apply(null, xs) - x0, Math.max.apply(null, ys) - y0];
  }
  function rectsOverlap(a, b) { return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]; }

  /**
   * The print model of `doc`: { version, printMode: 'bw', pages: [{ id, panelId, rect, viewBox, translate, scaleMmPerPx, source,
   * overlays[{ q, r, symbolId, dots, blightMark }], marks[{ q, r }] (an X on open ground, PD-041), segments[{ cell, dir, kind }], labels[placed label] }], summary }.
   * Pure and deterministic; JSON-safe; shares nothing mutable with the document. `ctx` is the Journey 2 map context (grid, sanctuaries, icons).
   */
  function buildPrintModel(doc, ctx, template) {
    const pages = pagesFromTemplate(template);
    const proj = Projection.buildPrintProjection(doc, ctx);
    const grid = ctx.grid;
    const out = pages.map(p => ({
      id: p.id, panelId: p.panelId, col: p.col, row: p.row, core: p.core.slice(), rect: p.rect.slice(), viewBox: p.viewBox.slice(), translate: p.translate.slice(), scaleMmPerPx: p.scaleMmPerPx,
      placeMm: p.placeMm.slice(), trim: { right: p.trim.right, bottom: p.trim.bottom },
      source: { path: p.source.path, worldSizePx: p.source.worldSizePx.slice(), nativeSource: p.source.nativeSource ? { path: p.source.nativeSource.path, sha256: p.source.nativeSource.sha256 } : null },
      overlays: [], marks: [], segments: [], labels: [], ruins: [], party: null,
    }));
    const SLACK = 4;                                              // a hex or edge just touching a page can still put ink (stroke, glyph) on it
    const fat = r => [r[0] - SLACK, r[1] - SLACK, r[2] + 2 * SLACK, r[3] + 2 * SLACK];
    for (const o of proj.overlays) {
      const bb = fat(bboxOf(grid.cellCorners(o.q, o.r)));
      const entry = { q: o.q, r: o.r, symbolId: o.symbolId, dots: o.dots, blightMark: o.blightMark, region: o.region };
      pages.forEach((p, i) => { if (rectsOverlap(bb, p.rect)) out[i].overlays.push(Object.assign({}, entry)); });
    }
    for (const m of proj.shadowMarks) {
      const bb = fat(bboxOf(grid.cellCorners(m.q, m.r)));
      pages.forEach((p, i) => { if (rectsOverlap(bb, p.rect)) out[i].marks.push({ q: m.q, r: m.r }); });
    }
    if (proj.party) {
      const bb = fat(bboxOf(grid.cellCorners(proj.party.q, proj.party.r)));
      pages.forEach((p, i) => { if (rectsOverlap(bb, p.rect)) out[i].party = { q: proj.party.q, r: proj.party.r }; });
    }
    for (const sg of proj.perimeter) {
      const c = Geo.parseCellId(sg.cell);
      if (!c) continue;
      const e = grid.cellEdge(c.q, c.r, sg.dir);
      pages.forEach((p, i) => { if (clipSegment(e[0], e[1], { rect: fat(p.rect) })) out[i].segments.push({ cell: sg.cell, dir: sg.dir, kind: sg.kind }); });
    }
    // a destroyed sanctuary (PD-070, revealed ones only — the projection already filtered): the flame stands on the icon, the smoke drifts up and to the right,
    // so a ruin is on every page its glyph box touches (a page clips it); the entry is the icon's centre and nothing else
    const ruined = new Map(ctx.sanctuaries.map(s => [s.id, s]));
    for (const id of proj.destroyedSanctuaries) {
      const s = ruined.get(id);
      if (!s) continue;
      const box = [s.x - RUIN_BOX[0], s.y - RUIN_BOX[1], RUIN_BOX[2], RUIN_BOX[3]];
      pages.forEach((p, i) => { if (rectsOverlap(box, p.rect)) out[i].ruins.push({ id: s.id, x: s.x, y: s.y, glyph: s.glyph || null }); });
    }
    // a name belongs to the page whose core holds its icon; it is laid out inside that core minus the overlap strips, so it is never split or hidden by a neighbouring sheet
    const bySanctuary = new Map(ctx.sanctuaries.map(s => [s.id, s]));
    pages.forEach((p, i) => {
      const mine = proj.sanctuaryLabels.filter(l => { const s = bySanctuary.get(l.anchorId); const pg = s ? pageOfPoint([s.rect[0] + s.rect[2] / 2, s.rect[1] + s.rect[3] / 2], pages) : null; return pg && pg.id === p.id; });
      out[i].labels = Geo.layoutSanctuaryLabels(mine, ctx.sanctuaries.map(s => ({ id: s.id, rect: s.rect })), { icons: ctx.iconRects, ink: { strokePx: LABEL_STROKE_PX }, bounds: p.labelBounds.slice() });
    });
    return {
      version: 2, printMode: 'bw', pages: out,
      summary: { wildernessHexes: proj.overlays.length, sanctuaryNames: proj.sanctuaryLabels.length, destroyedSanctuaries: proj.destroyedSanctuaries.length, party: !!proj.party },
    };
  }

  return { A4_MM: A4_MM, PAGE_IDS: PAGE_IDS, OVERLAP_PX: OVERLAP_PX, pagesFromTemplate: pagesFromTemplate, worldToPage: worldToPage, pageToWorld: pageToWorld, pageOfPoint: pageOfPoint, clipRect: clipRect, clipSegment: clipSegment, buildPrintModel: buildPrintModel };
});
