/* ============================================================
   Bacchus's Atlas — journey2-geometry.js
   Pure, dependency-free geometry for the Journey 2 world map: the one
   continuous flat-top hex lattice printed on the assembled Valloren raster,
   plus the camera (world <-> screen) math. No window/document/state, so it
   loads as a plain <script> in the browser and is required() as-is from a
   Node test (tests/journey2-geometry.test.js) and from the dev-only build
   scripts under scripts/journey2/ — one implementation of the geometry for
   the overlay, hit testing, the print proof and the tests.

   Coordinates:
   - world px: the assembled raster's pixels, origin top-left, x right, y
     down, independent of screen size and camera zoom.
   - cells: integer axial (q, r). The cell id string is "q,r" (e.g. "17,-3").
     centre(q, r) = origin + q * basisQ + r * basisR, all from the template's
     measured grid section (data/journey2/map-template.json).
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Journey2Geometry = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CELL_ID_PATTERN = /^(0|-?[1-9][0-9]*),(0|-?[1-9][0-9]*)$/;
  const TIE_EPSILON = 1e-9;

  /** Neighbour order (axial deltas) and compass names for a flat-top grid
   * with y pointing down. Corner k sits between neighbour k and k+1. */
  const NEIGHBOR_DELTAS = Object.freeze([
    Object.freeze({ dq: 1, dr: 0, name: 'se' }),
    Object.freeze({ dq: 1, dr: -1, name: 'ne' }),
    Object.freeze({ dq: 0, dr: -1, name: 'n' }),
    Object.freeze({ dq: -1, dr: 0, name: 'nw' }),
    Object.freeze({ dq: -1, dr: 1, name: 'sw' }),
    Object.freeze({ dq: 0, dr: 1, name: 's' }),
  ]);

  /* ---------------- cell ids ---------------- */

  function cellId(q, r) { return q + ',' + r; }

  /** Strict inverse of cellId(): returns { q, r } or null for anything that is
   * not exactly "<int>,<int>" (no spaces, no "+", no leading zeros, no "-0"). */
  function parseCellId(id) {
    if (typeof id !== 'string') return null;
    const m = CELL_ID_PATTERN.exec(id);
    return m ? { q: Number(m[1]), r: Number(m[2]) } : null;
  }

  /* ---------------- grid ---------------- */

  /**
   * Builds a grid from the template's `grid` section:
   *   { originPx:[x,y], basisQPx:[x,y], basisRPx:[x,y],
   *     hexCornersRelativePx?:[[x,y] x6], validCells?:{ columns:{ "<q>":[rMin,rMax] } } }
   * Missing corner offsets are derived from the basis (corner k = (n_k +
   * n_{k+1}) / 3), which is exact for the printed grid because every printed
   * edge is the perpendicular bisector of two neighbouring centres.
   */
  function createGrid(spec) {
    if (!spec || !isPair(spec.originPx) || !isPair(spec.basisQPx) || !isPair(spec.basisRPx)) {
      throw new Error('Journey2Geometry.createGrid: originPx, basisQPx and basisRPx are required (grid is not calibrated).');
    }
    const ox = spec.originPx[0], oy = spec.originPx[1];
    const bq = spec.basisQPx, br = spec.basisRPx;
    const det = bq[0] * br[1] - bq[1] * br[0];
    if (!(Math.abs(det) > 1e-6)) throw new Error('Journey2Geometry.createGrid: degenerate basis.');
    const corners = Array.isArray(spec.hexCornersRelativePx) && spec.hexCornersRelativePx.length === 6
      ? spec.hexCornersRelativePx.map(p => [p[0], p[1]])
      : deriveCornerOffsets(bq, br);
    const columns = spec.validCells && spec.validCells.columns ? spec.validCells.columns : null;

    function cellCenter(q, r) { return [ox + q * bq[0] + r * br[0], oy + q * bq[1] + r * br[1]]; }

    function cellCorners(q, r) {
      const c = cellCenter(q, r);
      return corners.map(o => [c[0] + o[0], c[1] + o[1]]);
    }

    /** Fractional axial coordinates of a world point (continuous, unrounded). */
    function worldToFractional(x, y) {
      const dx = x - ox, dy = y - oy;
      return { q: (dx * br[1] - dy * br[0]) / det, r: (bq[0] * dy - bq[1] * dx) / det };
    }

    /**
     * The cell containing a world point: the nearest cell centre. Candidates are
     * the rounded cell and its six neighbours; exact distance ties (a point on
     * a shared edge or corner) go to the lexicographically smaller (q, r), so
     * the answer for an edge point never depends on floating-point noise or
     * evaluation order.
     */
    function worldToCell(x, y) {
      const f = worldToFractional(x, y);
      const q0 = Math.round(f.q), r0 = Math.round(f.r);
      let best = null, bestD = Infinity;
      for (let i = -1; i < 6; i++) {
        const q = i < 0 ? q0 : q0 + NEIGHBOR_DELTAS[i].dq;
        const r = i < 0 ? r0 : r0 + NEIGHBOR_DELTAS[i].dr;
        const c = cellCenter(q, r);
        const d = Math.hypot(x - c[0], y - c[1]);
        if (d < bestD - TIE_EPSILON || (Math.abs(d - bestD) <= TIE_EPSILON && (q < best.q || (q === best.q && r < best.r)))) {
          best = { q: q + 0, r: r + 0 }; bestD = d;   // "+ 0" turns -0 into 0
        }
      }
      return best;
    }

    /** The six neighbours (valid or not) in NEIGHBOR_DELTAS order, with their ids and validity. */
    function neighbors(q, r) {
      return NEIGHBOR_DELTAS.map(d => {
        const nq = q + d.dq, nr = r + d.dr;
        return { q: nq, r: nr, id: cellId(nq, nr), name: d.name, valid: isValid(nq, nr) };
      });
    }

    function isValid(q, r) {
      if (!columns || !Number.isInteger(q) || !Number.isInteger(r)) return false;
      const range = columns[String(q)];
      return Array.isArray(range) && r >= range[0] && r <= range[1];
    }

    function validNeighbors(q, r) { return neighbors(q, r).filter(n => n.valid); }

    /** Every valid cell, column by column, rows ascending. */
    function forEachValidCell(fn) {
      if (!columns) return;
      const qs = Object.keys(columns).map(Number).sort((a, b) => a - b);
      for (const q of qs) for (let r = columns[String(q)][0]; r <= columns[String(q)][1]; r++) fn(q, r);
    }

    function validCellCount() {
      if (!columns) return 0;
      let n = 0;
      for (const k of Object.keys(columns)) n += columns[k][1] - columns[k][0] + 1;
      return n;
    }

    /** SVG path data for a cell's outline. */
    function cellPath(q, r) {
      const pts = cellCorners(q, r);
      return 'M' + pts.map(p => round(p[0], 3) + ' ' + round(p[1], 3)).join('L') + 'Z';
    }

    /** Every cell (valid or not) whose centre lies in a world rectangle, expanded by `pad`. */
    function cellsInRect(x0, y0, x1, y1, pad) {
      const p = pad || 0;
      const out = [];
      const corners4 = [[x0 - p, y0 - p], [x1 + p, y0 - p], [x0 - p, y1 + p], [x1 + p, y1 + p]].map(c => worldToFractional(c[0], c[1]));
      let qmin = Infinity, qmax = -Infinity, rmin = Infinity, rmax = -Infinity;
      for (const c of corners4) { qmin = Math.min(qmin, c.q); qmax = Math.max(qmax, c.q); rmin = Math.min(rmin, c.r); rmax = Math.max(rmax, c.r); }
      for (let q = Math.floor(qmin) - 1; q <= Math.ceil(qmax) + 1; q++) {
        for (let r = Math.floor(rmin) - 1; r <= Math.ceil(rmax) + 1; r++) {
          const c = cellCenter(q, r);
          if (c[0] >= x0 - p && c[0] <= x1 + p && c[1] >= y0 - p && c[1] <= y1 + p) out.push({ q: q, r: r });
        }
      }
      return out;
    }

    return {
      cellCenter: cellCenter, cellCorners: cellCorners, worldToFractional: worldToFractional, worldToCell: worldToCell,
      neighbors: neighbors, validNeighbors: validNeighbors, isValid: isValid, forEachValidCell: forEachValidCell,
      validCellCount: validCellCount, cellPath: cellPath, cellsInRect: cellsInRect,
      cornerOffsets: corners.map(p => [p[0], p[1]]),
      originPx: [ox, oy], basisQPx: [bq[0], bq[1]], basisRPx: [br[0], br[1]],
      shortDimensionPx: Math.hypot(br[0], br[1]),
    };
  }

  function deriveCornerOffsets(bq, br) {
    const n = [
      [bq[0], bq[1]], [bq[0] - br[0], bq[1] - br[1]], [-br[0], -br[1]],
      [-bq[0], -bq[1]], [-bq[0] + br[0], -bq[1] + br[1]], [br[0], br[1]],
    ];
    const out = [];
    for (let k = 0; k < 6; k++) out.push([(n[k][0] + n[(k + 1) % 6][0]) / 3, (n[k][1] + n[(k + 1) % 6][1]) / 3]);
    return out;
  }

  function isPair(v) { return Array.isArray(v) && v.length === 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]); }
  function round(v, digits) { const f = Math.pow(10, digits); return Math.round(v * f) / f; }

  /* ---------------- template / anchors gate ---------------- */

  /**
   * Decides whether a (template, anchors) pair may be used for real placement.
   * A draft, a pending calibration, an incomplete or unverified marker survey,
   * or any non-passing verification slot makes the answer "no", with the exact
   * reasons — the diagnostic view shows these instead of guessing geometry.
   */
  function assessPlacementReadiness(template, anchors) {
    const reasons = [];
    if (!template || typeof template !== 'object') return { ready: false, reasons: ['template missing'] };
    if (template.readyForInteractivePlacement !== true) reasons.push('template.readyForInteractivePlacement is not true');
    if (/draft|pending/.test(String(template.status || ''))) reasons.push('template.status is "' + template.status + '"');
    const grid = template.grid || {};
    if (grid.calibrationStatus !== 'measured-verified') reasons.push('grid.calibrationStatus is "' + grid.calibrationStatus + '"');
    if (!isPair(grid.originPx) || !isPair(grid.basisQPx) || !isPair(grid.basisRPx)) reasons.push('grid origin/basis missing');
    if (!grid.validCells || !grid.validCells.columns) reasons.push('grid.validCells missing');
    if (!template.worldSizePx || !template.assembledAsset) reasons.push('assembled world asset/size missing');
    const verification = template.verification || {};
    for (const slot of ['preparedAssets', 'geometry', 'browserBehavior', 'printProof']) {
      const v = verification[slot];
      if (!v || v.status !== 'pass') reasons.push('verification.' + slot + ' is "' + (v ? v.status : 'missing') + '"');
    }
    if (!anchors || anchors.complete !== true) reasons.push('anchor survey is not complete');
    else {
      const unverified = (anchors.anchors || []).filter(a => a.verificationStatus !== 'visually-verified');
      if (unverified.length) reasons.push(unverified.length + ' anchor(s) not visually verified');
      if (!(anchors.anchors || []).length) reasons.push('anchor list is empty');
    }
    return { ready: reasons.length === 0, reasons: reasons };
  }

  /** Structural checks that must hold for any template this module will draw. */
  function validateTemplate(template, anchorsDoc) {
    const errors = [];
    const t = template || {};
    if (t.schemaVersion !== 1) errors.push('schemaVersion must be 1');
    if (!isPair(t.worldSizePx)) errors.push('worldSizePx missing');
    if (!t.assembledAsset || typeof t.assembledAsset.path !== 'string') errors.push('assembledAsset.path missing');
    if (t.assembledAsset && /^([a-z]:[\\/]|\/|[a-z][a-z0-9+.-]*:)/i.test(t.assembledAsset.path || '')) errors.push('assembledAsset.path must be relative');
    let grid = null;
    try { grid = createGrid(t.grid); } catch (e) { errors.push(e.message); }
    if (grid && anchorsDoc && Array.isArray(anchorsDoc.anchors)) {
      const seen = new Set();
      for (const a of anchorsDoc.anchors) {
        if (seen.has(a.stableId)) errors.push('duplicate anchor id ' + a.stableId);
        seen.add(a.stableId);
        for (const f of ['stableId', 'kind', 'sourcePanel', 'sourcePixelAnchor', 'worldPixelAnchor', 'cellId', 'hitArea', 'iconProtectionArea', 'labelAnchor', 'builtInLabel', 'verificationStatus']) {
          if (!(f in a)) errors.push('anchor ' + a.stableId + ' missing ' + f);
        }
        const c = parseCellId(a.cellId);
        if (!c) errors.push('anchor ' + a.stableId + ' has a malformed cellId');
        else if (!grid.isValid(c.q, c.r)) errors.push('anchor ' + a.stableId + ' sits in an invalid cell ' + a.cellId);
      }
    }
    return { ok: errors.length === 0, errors: errors };
  }

  /* ---------------- overlay protection (markers, labels, decoration) ---------------- */

  function rectsIntersect(a, b) {
    return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
  }

  /** Separating-axis test between an axis-aligned rect [x, y, w, h] and a convex polygon. */
  function rectIntersectsPolygon(rect, poly) {
    const rc = [[rect[0], rect[1]], [rect[0] + rect[2], rect[1]], [rect[0], rect[1] + rect[3]], [rect[0] + rect[2], rect[1] + rect[3]]];
    const axes = [[1, 0], [0, 1]];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      axes.push([-(b[1] - a[1]), b[0] - a[0]]);
    }
    for (const ax of axes) {
      const pr = rc.map(p => p[0] * ax[0] + p[1] * ax[1]);
      const pp = poly.map(p => p[0] * ax[0] + p[1] * ax[1]);
      if (Math.max.apply(null, pr) < Math.min.apply(null, pp) - 1e-9 || Math.max.apply(null, pp) < Math.min.apply(null, pr) - 1e-9) return false;
    }
    return true;
  }

  function pointInConvexPolygon(p, poly) {
    let sign = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      if (Math.abs(cross) < 1e-9) continue;
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s; else if (s !== sign) return false;
    }
    return true;
  }

  /** Every area new overlays must keep clear of: marker icon protection, built-in label boxes, decorative lettering. */
  function protectionRects(template, anchorsDoc) {
    const out = [];
    for (const a of (anchorsDoc && anchorsDoc.anchors) || []) {
      out.push({ kind: 'marker', id: a.stableId, rectPx: a.iconProtectionArea.rectPx });
      if (a.builtInLabel) out.push({ kind: 'built-in-label', id: a.stableId, rectPx: a.builtInLabel.protectionRectPx });
    }
    for (const d of (template && template.decorativeAreas) || []) out.push({ kind: 'decorative', id: d.id, rectPx: d.rectPx });
    return out;
  }

  /** Candidate offsets (world px from the cell centre), tried in this fixed order. */
  const PROOF_OFFSETS = Object.freeze([[0, 0], [0, -12], [0, 12], [-14, 0], [14, 0], [-14, -12], [14, -12], [-14, 12], [14, 12], [0, -20], [0, 20], [-20, 0], [20, 0]]);

  /**
   * Places one test glyph (habitat symbol + 1-4 terrain dots) in a cell without
   * ever covering protected artwork. The glyph box (symbol plus dots, padded) must
   * lie inside the hexagon and clear every protection rect; the first candidate
   * offset that satisfies both wins, otherwise the glyph is withheld
   * ({ hidden: true }) rather than drawn over an original marker.
   * glyph = { w, h, dots } in world px (dots = 0..4).
   */
  function layoutProofGlyph(grid, q, r, glyph, protections, pad) {
    const p = pad == null ? 2 : pad;
    const dotsH = glyph.dots > 0 ? 8 : 0;
    const boxW = glyph.w + 2 * p, boxH = glyph.h + dotsH + 2 * p;
    const c = grid.cellCenter(q, r);
    const poly = grid.cellCorners(q, r);
    for (let i = 0; i < PROOF_OFFSETS.length; i++) {
      const o = PROOF_OFFSETS[i];
      const box = [c[0] + o[0] - boxW / 2, c[1] + o[1] - boxH / 2, boxW, boxH];
      const corners = [[box[0], box[1]], [box[0] + box[2], box[1]], [box[0], box[1] + box[3]], [box[0] + box[2], box[1] + box[3]]];
      if (!corners.every(pt => pointInConvexPolygon(pt, poly))) continue;
      if ((protections || []).some(pr => rectsIntersect(box, pr.rectPx))) continue;
      const gx = box[0] + p, gy = box[1] + p;
      const dots = [];
      for (let d = 0; d < glyph.dots; d++) dots.push([gx + glyph.w / 2 + (d - (glyph.dots - 1) / 2) * 6, gy + glyph.h + 5]);
      return { hidden: false, shifted: i > 0, offsetPx: o, glyphRectPx: [gx, gy, glyph.w, glyph.h], dotsPx: dots, boxPx: box };
    }
    return { hidden: true, shifted: false, offsetPx: null, glyphRectPx: null, dotsPx: [], boxPx: null, reason: 'no clear space in the cell' };
  }

  /* ---------------- camera (world <-> screen) ---------------- */

  /** A camera is { scale, tx, ty }: screen = world * scale + (tx, ty). */
  function worldToScreen(cam, x, y) { return [x * cam.scale + cam.tx, y * cam.scale + cam.ty]; }
  function screenToWorld(cam, sx, sy) { return [(sx - cam.tx) / cam.scale, (sy - cam.ty) / cam.scale]; }

  /** Whole-map camera for a viewport, centred, with `pad` screen px of margin. */
  function fitCamera(viewW, viewH, worldW, worldH, pad) {
    const p = pad || 0;
    const scale = Math.min(Math.max(1, viewW - 2 * p) / worldW, Math.max(1, viewH - 2 * p) / worldH);
    return { scale: scale, tx: (viewW - worldW * scale) / 2, ty: (viewH - worldH * scale) / 2 };
  }

  /** Zooms by `factor` keeping the world point under screen (sx, sy) fixed. Scale is clamped. */
  function zoomAt(cam, sx, sy, factor, minScale, maxScale) {
    const next = Math.min(maxScale, Math.max(minScale, cam.scale * factor));
    const k = next / cam.scale;
    return { scale: next, tx: sx - (sx - cam.tx) * k, ty: sy - (sy - cam.ty) * k };
  }

  /** Standard zoom stops for the +/- controls; 1 is exactly 100%. Fit and the wheel may land between them. */
  const ZOOM_STEPS = Object.freeze([0.5, 0.67, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 2.0]);
  const ZOOM_EPSILON = 1e-4;

  /**
   * The next standard stop in `dir` (> 0 larger, < 0 smaller) strictly beyond `scale` (a scale already on a stop,
   * within ZOOM_EPSILON, moves to the neighbouring stop). Past either end it returns `scale` unchanged.
   */
  function stepZoom(scale, dir) {
    if (dir > 0) { for (const s of ZOOM_STEPS) if (s > scale + ZOOM_EPSILON) return s; return scale; }
    for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) if (ZOOM_STEPS[i] < scale - ZOOM_EPSILON) return ZOOM_STEPS[i];
    return scale;
  }

  /** Keeps at least `keep` screen px of the world visible on every side while panning. */
  function clampCamera(cam, viewW, viewH, worldW, worldH, keep) {
    const k = keep == null ? 80 : keep;
    const w = worldW * cam.scale, h = worldH * cam.scale;
    return {
      scale: cam.scale,
      tx: Math.min(viewW - k, Math.max(k - w, cam.tx)),
      ty: Math.min(viewH - k, Math.max(k - h, cam.ty)),
    };
  }

  /**
   * Screen-space placement of the Region Inspector inside the map area (all values px, origin = the map area's top-left).
   *   view     { w, h }              the visible map area
   *   size     { w, h }              the inspector's own measured size
   *   anchor   { x, y, r } | null    the clicked hex (centre + half width); null when opened from a card or when the hex is off screen
   *   blocked  [{ x, y, w, h, soft? }] rectangles the inspector must not cover (sidebar or rail, diagnostics drawer); a `soft` one (the
   *                                 selected-tile bar) is avoided only while a clean spot beside the hex exists
   *   margin, gap, narrow            edge margin (default 12), gap to the hex (default 14), phone/narrow layout flag
   * Returns { x, y, side, caret } — `side` is where the panel sits relative to the hex ('right' | 'left' | 'above' | 'below'),
   * or 'corner' (stable top-right, no hex) / 'clamped' / 'narrow'; `caret` is { edge, offset } pointing at the hex, or null.
   */
  function placeInspector(o) {
    const margin = o.margin == null ? 12 : o.margin, gap = o.gap == null ? 14 : o.gap;
    const view = o.view, w = Math.min(o.size.w, Math.max(0, view.w - 2 * margin)), h = Math.min(o.size.h, Math.max(0, view.h - 2 * margin));
    const all = o.blocked || [];
    const maxX = Math.max(margin, view.w - margin - w), maxY = Math.max(margin, view.h - margin - h);
    const clampX = x => Math.min(maxX, Math.max(margin, x)), clampY = y => Math.min(maxY, Math.max(margin, y));
    const hits = (x, y, blocked) => blocked.some(b => x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y);
    const overlap = (x, y, blocked) => blocked.reduce((s, b) => s + Math.max(0, Math.min(x + w, b.x + b.w) - Math.max(x, b.x)) * Math.max(0, Math.min(y + h, b.y + b.h) - Math.max(y, b.y)), 0);
    if (o.narrow) return { x: clampX((view.w - w) / 2), y: maxY, side: 'narrow', caret: null };
    const a = o.anchor;
    const out = (x, y, side, caret) => ({ x: Math.round(x), y: Math.round(y), side: side, caret: caret });
    if (!a) {
      // stable top-right; slide left of whatever covers that corner (e.g. a drawer) before giving up
      const tries = [clampX(view.w - margin - w)];
      for (const b of all) if (b.x + b.w > view.w / 2) tries.push(clampX(b.x - margin - w));
      for (const x of tries) if (!hits(x, margin, all)) return out(x, margin, 'corner', null);
      return out(tries[0], margin, 'corner', null);
    }
    const cands = [
      { side: 'right', x: a.x + a.r + gap, y: clampY(a.y - h / 2), fits: a.x + a.r + gap + w <= view.w - margin },
      { side: 'left', x: a.x - a.r - gap - w, y: clampY(a.y - h / 2), fits: a.x - a.r - gap - w >= margin },
      { side: 'below', x: clampX(a.x - w / 2), y: a.y + a.r + gap, fits: a.y + a.r + gap + h <= view.h - margin },
      { side: 'above', x: clampX(a.x - w / 2), y: a.y - a.r - gap - h, fits: a.y - a.r - gap - h >= margin },
    ];
    const caretFor = (side, x, y) => {
      const horiz = side === 'right' || side === 'left';
      const off = horiz ? a.y - y : a.x - x, len = horiz ? h : w;
      return { edge: side === 'right' ? 'left' : side === 'left' ? 'right' : side === 'below' ? 'top' : 'bottom', offset: Math.round(Math.min(len - 18, Math.max(18, off))) };
    };
    const hard = all.filter(b => !b.soft);
    for (const list of [all, hard]) for (const c of cands) if (c.fits && !hits(c.x, c.y, list)) return out(c.x, c.y, c.side, caretFor(c.side, c.x, c.y));
    // nothing sits cleanly beside the hex: clamp inside the map and take the spot that is least covered
    const fall = cands.map(c => ({ side: 'clamped', x: clampX(c.x), y: clampY(c.y) })).concat([{ side: 'clamped', x: clampX(view.w - margin - w), y: margin }]);
    for (const b of all) { for (const x of [b.x - margin - w, b.x + b.w + margin]) fall.push({ side: 'clamped', x: clampX(x), y: clampY(a.y - h / 2) }); }
    let best = fall[0], bestO = overlap(best.x, best.y, all);
    for (const c of fall) { const ov = overlap(c.x, c.y, all); if (ov < bestO) { best = c; bestO = ov; } }
    return out(best.x, best.y, best.side, null);
  }

  return {
    placeInspector: placeInspector,
    NEIGHBOR_DELTAS: NEIGHBOR_DELTAS,
    cellId: cellId,
    parseCellId: parseCellId,
    createGrid: createGrid,
    deriveCornerOffsets: deriveCornerOffsets,
    assessPlacementReadiness: assessPlacementReadiness,
    validateTemplate: validateTemplate,
    rectsIntersect: rectsIntersect,
    rectIntersectsPolygon: rectIntersectsPolygon,
    pointInConvexPolygon: pointInConvexPolygon,
    protectionRects: protectionRects,
    layoutProofGlyph: layoutProofGlyph,
    PROOF_OFFSETS: PROOF_OFFSETS,
    worldToScreen: worldToScreen,
    screenToWorld: screenToWorld,
    fitCamera: fitCamera,
    zoomAt: zoomAt,
    ZOOM_STEPS: ZOOM_STEPS,
    stepZoom: stepZoom,
    clampCamera: clampCamera,
  };
});
