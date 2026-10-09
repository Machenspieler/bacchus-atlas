/* ============================================================
   Bacchus's Atlas — journey2-print.js
   The PLAYER MAP PRINT model (PD-028): a pure, DOM-free function from the one GM document to the content of exactly TWO A4 portrait
   pages — the west and the east half of the original Old Valloren map. It is the only thing the Print Preview and the physical print
   draw from; it knows no camera, zoom, pan, sidebar, viewport, selection, language or UI preference.

   Fog of War is a DATA FILTER here, not a drawing: the print has no fog layer, hatch, wash or grey at all. Generated New Valloren
   content exists in the model only for cells in `playerVisibility.revealedCells` (via `Journey2Projection.buildPrintProjection`); an
   unrevealed cell is simply absent, so it prints as the untouched Old Valloren map. The model also has no biome tint (omitted, not
   greyed), no Environment, no Soul Echo, no sanctuary data beyond a revealed { anchorId, name }, and no region/tile/batch id. The one exception to "revealed cells only"
   is the party marker (PD-045): while it is shown its seven cells are present like revealed ones (the projection merges them) and the marker itself is drawn, as a black star.

   Pages. `pagesFromTemplate` reads the two panels the world raster was assembled from (`template.composition.panels`; the seam is where
   they meet). A page is a 1:1 crop of that raster: `rect` in world px, the SVG `viewBox` of the page ([0, 0, w, h]) and the `translate`
   that maps a world point into page-local space (`worldToPage`). Content crossing the seam is assigned to both pages and clipped by each
   page's own viewport — nothing is shifted or stretched; a sanctuary label is never split: it is laid out on the page that holds its
   icon, clamped inside that page.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./journey2-geometry.js'), require('./journey2-projection.js'));
  else root.Journey2Print = factory(root.Journey2Geometry, root.Journey2Projection);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Geo, Projection) {
  'use strict';

  const A4_MM = { widthMm: 210, heightMm: 297, marginMm: 10 };
  const PAGE_IDS = ['v1', 'v2'];

  /**
   * The two printed pages of a map template, west first. Validates the geometry and THROWS on anything unexpected (no silent fallback to
   * a stretched full map): exactly two panels, side by side, covering the world raster exactly. Each is scaled uniformly to fit the printable A4 area (never cropped or stretched).
   */
  function pagesFromTemplate(template) {
    const comp = template && template.composition, panels = comp && comp.panels, asset = template && template.assembledAsset, size = template && template.worldSizePx;
    if (!Array.isArray(panels) || panels.length !== 2) throw new Error('Journey2Print: the template must define exactly two map panels.');
    if (!asset || typeof asset.path !== 'string' || !Array.isArray(size) || size.length !== 2) throw new Error('Journey2Print: the template has no assembled map asset.');
    const sorted = panels.slice().sort((a, b) => a.worldRectPx[0] - b.worldRectPx[0]);
    const printable = [A4_MM.widthMm - 2 * A4_MM.marginMm, A4_MM.heightMm - 2 * A4_MM.marginMm];
    let edge = 0;
    const pages = sorted.map((p, i) => {
      const r = p.worldRectPx;
      if (!Array.isArray(r) || r.length !== 4 || !r.every(Number.isFinite) || r[2] <= 0 || r[3] <= 0) throw new Error('Journey2Print: invalid page rectangle for panel ' + p.id + '.');
      if (r[0] !== edge || r[1] !== 0 || r[3] !== size[1]) throw new Error('Journey2Print: panel ' + p.id + ' does not continue the previous one / span the map height.');
      edge = r[0] + r[2];
      const src = ((comp.sources || []).find(s => s.id === p.id)) || null;
      return {
        id: PAGE_IDS[i], panelId: p.id, index: i,
        rect: r.slice(),
        viewBox: [0, 0, r[2], r[3]],
        translate: [-r[0], -r[1]],
        scaleMmPerPx: Math.min(printable[0] / r[2], printable[1] / r[3]),
        source: { path: asset.path, worldSizePx: size.slice(), nativeSource: src ? { path: src.sourcePath, sha256: src.sha256 } : null },
      };
    });
    if (edge !== size[0]) throw new Error('Journey2Print: the two panels do not cover the whole map width.');
    return pages;
  }

  /** World point -> page-local point (pure translation: the page is a 1:1 crop). */
  function worldToPage(pt, page) { return [pt[0] + page.translate[0], pt[1] + page.translate[1]]; }
  function pageToWorld(pt, page) { return [pt[0] - page.translate[0], pt[1] - page.translate[1]]; }

  /** Which page holds a world point: half-open on the right (the seam belongs to the east page), the map's last column to the east page. */
  function pageOfPoint(pt, pages) {
    for (const p of pages) { const r = p.rect; if (pt[0] >= r[0] && pt[0] < r[0] + r[2] && pt[1] >= r[1] && pt[1] < r[1] + r[3]) return p; }
    const last = pages[pages.length - 1], r = last.rect;
    return pt[0] === r[0] + r[2] && pt[1] >= r[1] && pt[1] <= r[1] + r[3] ? last : null;
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
      id: p.id, panelId: p.panelId, rect: p.rect.slice(), viewBox: p.viewBox.slice(), translate: p.translate.slice(), scaleMmPerPx: p.scaleMmPerPx,
      source: { path: p.source.path, worldSizePx: p.source.worldSizePx.slice(), nativeSource: p.source.nativeSource ? { path: p.source.nativeSource.path, sha256: p.source.nativeSource.sha256 } : null },
      overlays: [], marks: [], segments: [], labels: [], party: null,
    }));
    const SLACK = 4;                                              // a hex or edge just touching a page can still put ink (stroke, glyph) on it
    const fat = r => [r[0] - SLACK, r[1] - SLACK, r[2] + 2 * SLACK, r[3] + 2 * SLACK];
    for (const o of proj.overlays) {
      const bb = fat(bboxOf(grid.cellCorners(o.q, o.r)));
      const entry = { q: o.q, r: o.r, symbolId: o.symbolId, dots: o.dots, blightMark: o.blightMark };
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
    // a name belongs to the page holding its icon; it is laid out inside that page only, so it is never split across the seam
    const bySanctuary = new Map(ctx.sanctuaries.map(s => [s.id, s]));
    pages.forEach((p, i) => {
      const mine = proj.sanctuaryLabels.filter(l => { const s = bySanctuary.get(l.anchorId); const pg = s ? pageOfPoint([s.rect[0] + s.rect[2] / 2, s.rect[1] + s.rect[3] / 2], pages) : null; return pg && pg.id === p.id; });
      out[i].labels = Geo.layoutSanctuaryLabels(mine, ctx.sanctuaries.map(s => ({ id: s.id, rect: s.rect })), { icons: ctx.iconRects, bounds: [p.rect[0], p.rect[1], p.rect[0] + p.rect[2], p.rect[1] + p.rect[3]] });
    });
    return {
      version: 1, printMode: 'bw', pages: out,
      summary: { wildernessHexes: proj.overlays.length, sanctuaryNames: proj.sanctuaryLabels.length, party: !!proj.party },
    };
  }

  return { A4_MM: A4_MM, PAGE_IDS: PAGE_IDS, pagesFromTemplate: pagesFromTemplate, worldToPage: worldToPage, pageToWorld: pageToWorld, pageOfPoint: pageOfPoint, clipRect: clipRect, clipSegment: clipSegment, buildPrintModel: buildPrintModel };
});
