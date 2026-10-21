/* ============================================================
   Bacchus's Atlas — journey2-shadowblight-fx.js
   Shadowblight on the SCREEN map (PD-072): the interactive presentation of the two Shadowblight states. Visual only — it reads cell lists the view
   already decided (GM document or player projection) and writes nothing: no document, no storage, no history. The print never uses it (it keeps
   the X and skull glyphs).

   1. Shadowblighted — living darkness (the approved "Hybrid" motion). One canvas per CONNECTED Shadowblighted area (the union of every cell the caller
      hands in, whatever region it belongs to), inside the overlay SVG through a foreignObject like the ruin FX, so it adds no compositor layer. ONE
      shared, offscreen WebGL context renders each area's field and the area's 2D canvas copies it. The field is sampled in WORLD px and every noise
      layer is transported (sampled at p - v*t), so adjacent hexes share one continuous phenomenon that travels through the area; there is no per-hex
      origin. Coverage comes from a per-area distance field (rebuilt only when the area's cells change): zero outside the area's own cells, feathered
      inward, hard-cut 2.5 px inside the edge, so nothing is ever drawn on a cell the caller did not hand in (Fog of War safety). Updates are throttled
      (30 / 20 / 10 Hz by quality), suspended while the camera moves, off-screen, in a hidden tab, while paused and under reduced motion (one still frame).

   2. Fully Shadowblighted — a tear through the parchment onto a SCREEN-LOCKED cosmos: the approved Nebula artwork laid out to cover the viewport, in an
      element behind the world and outside the camera transform, so it never moves or scales with the map and costs nothing per frame. The tears are a
      CSS mask (world px) on the ground layer only (paper + base raster), so they move and scale with the map for free; the torn rim (worn parchment
      band, tear line, contact shadow) is static SVG built from the same outline. Overtaken cells are never shadow members, so no living shadow is
      drawn in a tear. A printed icon or built-in label whose box overhangs a tear is redrawn above it from the same raster (a parchment patch), so the
      original map's icons and lettering never vanish into the void.

   Pure core (no DOM, require()-able from Node): cell sets, cell derivation (document / projection), torn outlines, distance fields, mask and rim
   markup, the quality ladder. `create()` is the only DOM part; it degrades to `available: false` (the view then keeps the glyphs) and never throws.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./journey2-geometry.js'));
  else root.Journey2ShadowblightFx = factory(root.Journey2Geometry);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Geo) {
  'use strict';
  const G = typeof globalThis !== 'undefined' ? globalThis : {};
  const D = Geo.NEIGHBOR_DELTAS;
  const SVG_NS = 'http://www.w3.org/2000/svg', XHTML_NS = 'http://www.w3.org/1999/xhtml';
  const OVERTAKEN_SYMBOL = 'fully-shadowblighted';

  /**
   * The quality ladder. hz = shadow updates per second; oct = fbm octaves of the detail noise; warp = domain-warp levels; res = canvas px per DEVICE px
   * (clamped to ppuMin..ppuMax canvas px per world px); budget = total shadow canvas px on screen (ppu scales down together to stay inside it);
   * step = torn-edge resampling in world px; rim = 'full' (two small blurs), 'soft' (one), 'flat' (no filter at all).
   */
  const QUALITY = Object.freeze({
    high:     Object.freeze({ hz: 30, oct: 5, warp: 2, res: 0.6,  ppuMin: 0.35, ppuMax: 1.0,  budget: 1.6e6,  step: 2.2, rim: 'full' }),
    balanced: Object.freeze({ hz: 20, oct: 4, warp: 2, res: 0.42, ppuMin: 0.25, ppuMax: 0.6,  budget: 0.6e6,  step: 3.2, rim: 'soft' }),
    low:      Object.freeze({ hz: 10, oct: 3, warp: 1, res: 0.3,  ppuMin: 0.18, ppuMax: 0.35, budget: 0.25e6, step: 5,   rim: 'flat' }),
  });
  const LEVELS = Object.freeze(['low', 'balanced', 'high']);

  const FIELD_TEXEL = 4;      // world px per distance-field texel (smooth; sampled bilinearly)
  const FIELD_DMAX = 64;      // world px of inward distance the field resolves (R channel = d / DMAX)
  const FEATURE = 150;        // world px per unit of the shadow noise (~2.5 hexes)
  const DEFAULTS = Object.freeze({ intensity: 0.65, opacity: 0.86, speed: 1.45 });   // the approved Hybrid look (Phase 1 lab, iteration 2)
  const STILL_TIME = 41.5;    // the reduced-motion still frame

  /* ---------------- hashing and value noise (deterministic; the torn edge and the CPU fallback) ---------------- */

  function hash2(x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  function fbm(x, y, s, oct) {
    let v = 0, a = 0.5, n = 0;
    for (let i = 0; i < oct; i++) {
      v += a * vnoise(x, y, s + i * 17); n += a;
      const nx = 1.6 * x - 1.2 * y + 3.1, ny = 1.2 * x + 1.6 * y + 1.7;
      x = nx; y = ny; a *= 0.5;
    }
    return v / n;
  }
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  /* ---------------- cell sets ---------------- */

  function compareIds(a, b) { const x = Geo.parseCellId(a), y = Geo.parseCellId(b); return (x.q - y.q) || (x.r - y.r); }
  function cellSet(ids) { const s = new Set(); for (const id of ids || []) if (Geo.parseCellId(id)) s.add(id); return s; }
  function neighborIds(id) { const c = Geo.parseCellId(id); return D.map(d => Geo.cellId(c.q + d.dq, c.r + d.dr)); }

  /** Edge-connected groups of a cell-id set (sorted ids, groups in order of their first id). */
  function componentsOf(set) {
    const seen = new Set(), out = [];
    for (const start of Array.from(set).sort(compareIds)) {
      if (seen.has(start)) continue;
      const comp = [], stack = [start];
      seen.add(start);
      while (stack.length) {
        const id = stack.pop();
        comp.push(id);
        for (const n of neighborIds(id)) if (set.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
      }
      out.push(comp.sort(compareIds));
    }
    return out;
  }

  /** The set's outer hex edges as { cell, dir } (the neighbour is not in the set): internal edges never appear. */
  function outerEdges(set) {
    const segs = [];
    for (const id of set) { const ns = neighborIds(id); for (let d = 0; d < 6; d++) if (!set.has(ns[d])) segs.push({ cell: id, dir: d }); }
    return segs;
  }
  function edgeSegments(grid, set) {
    return outerEdges(set).map(e => { const c = Geo.parseCellId(e.cell), p = grid.cellEdge(c.q, c.r, e.dir); return [p[0][0], p[0][1], p[1][0], p[1][1]]; });
  }
  function boundsOf(grid, ids, pad) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of ids) {
      const c = Geo.parseCellId(id);
      for (const p of grid.cellCorners(c.q, c.r)) { if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; }
    }
    const k = pad || 0;
    return { x0: x0 - k, y0: y0 - k, x1: x1 + k, y1: y1 + k };
  }

  /* ---------------- which cells (the caller's visibility decides; this only reads) ---------------- */

  /**
   * GM view: living shadow on every tile of a Shadowblighted (not overtaken) region AND on every hex that holds a Shadowblight X right now
   * (Model.getShadowXSet: implied minus suppressed plus added, PD-041), so a mark that walked off its region carries its shadow and leaves no trail;
   * its home tile stays dark only because its region is Shadowblighted. Tears on every tile of a fully overtaken region. Overtaken wins.
   */
  function cellsFromDocument(doc, Model) {
    const byBatch = new Map(doc.batches.map(b => [b.id, b])), blighted = new Set(), overtaken = new Set();
    for (const t of doc.tiles) {
      const b = byBatch.get(t.batchId);
      if (!b) continue;
      if (b.habitat.overtaken) overtaken.add(t.cell); else if (b.habitat.blighted) blighted.add(t.cell);
    }
    for (const id of Model.getShadowXSet(doc)) if (!overtaken.has(id)) blighted.add(id);
    return { blighted: Array.from(blighted).sort(compareIds), overtaken: Array.from(overtaken).sort(compareIds) };
  }
  /**
   * Player Preview and the player page: ONLY the projection, which already holds revealed cells alone — an X on a revealed tile (`blightMark`) or on
   * revealed open ground (`shadowMarks`), and the revealed tiles of overtaken regions. Hidden cells are simply absent, so they can shape nothing.
   */
  function cellsFromProjection(p) {
    const blighted = new Set(), overtaken = new Set();
    for (const o of p.overlays) { const id = Geo.cellId(o.q, o.r); if (o.symbolId === OVERTAKEN_SYMBOL) overtaken.add(id); else if (o.blightMark) blighted.add(id); }
    for (const m of p.shadowMarks) { const id = Geo.cellId(m.q, m.r); if (!overtaken.has(id)) blighted.add(id); }
    return { blighted: Array.from(blighted).sort(compareIds), overtaken: Array.from(overtaken).sort(compareIds) };
  }

  /* ---------------- torn outline (visual treatment only — never a gameplay shape) ---------------- */

  /**
   * How far (world px) the tear eats INTO the hole at a world point: mostly 0.4..6 px with fine fibrous jitter, now and then a deeper bite; never outward,
   * so a tear never reaches into a neighbouring cell. A function of position only: the same point tears the same way from either side and on every rebuild.
   */
  function tearDepth(x, y) {
    const s1 = vnoise(x / 34, y / 34, 11) * 2 - 1, s2 = vnoise(x / 8.5, y / 8.5, 23) * 2 - 1, s3 = vnoise(x / 21, y / 21, 37);
    const s4 = vnoise(x / 3.2, y / 3.2, 41) * 2 - 1, s5 = vnoise(x / 1.7, y / 1.7, 43) * 2 - 1, s6 = vnoise(x / 5.5, y / 5.5, 47);
    const s7 = vnoise(x / 15, y / 15, 73) * 2 - 1, rough = 0.55 + 0.9 * vnoise(x / 46, y / 46, 71);   // some stretches of the tear are rougher than others
    return Math.max(0.4, 2.1 + 2.3 * s1 + 0.9 * s7 + rough * (1.8 * s2 + 0.9 * s4 + 0.45 * s5) + (s3 > 0.72 ? (s3 - 0.72) * 30 : 0) + (s6 > 0.8 ? (s6 - 0.8) * 16 : 0));
  }
  /**
   * How far (world px) the outer edge of the worn band lies OUTSIDE the hex line: uneven (about +-20 %, a slow swell on top of the old patchy width), thin,
   * sometimes almost nothing, and with its own small contour (not just the tear's) so the band is no uniform outline of the cut. A function of position only.
   */
  function wornWidth(x, y) {
    const base = 0.5 + 2.4 * vnoise(x / 11, y / 11, 51) + 1.6 * Math.max(0, vnoise(x / 4, y / 4, 53) - 0.45);
    const rough = 0.5 + vnoise(x / 40, y / 40, 87);
    return Math.max(0.3, base * (0.8 + 0.4 * vnoise(x / 31, y / 31, 81)) + rough * (1.1 * (vnoise(x / 6.5, y / 6.5, 83) - 0.5) + 0.6 * (vnoise(x / 2.6, y / 2.6, 85) - 0.5)));
  }

  /**
   * One closed outline -> { torn, worn }: corners softened once (Chaikin), resampled every `step` px, each point pushed along the normal toward
   * `inside` by `depth` (default tearDepth) — and further, if needed, until the point is inside; `worn` is the same points pushed the other way by
   * wornWidth (the outer edge of the worn band). The inside side is voted once per loop on the ORIGINAL edges, so a softened concave corner can never flip a normal.
   */
  function tear(points, inside, step, depth) {
    const pts = points.slice();
    if (pts.length > 1 && Math.abs(pts[0][0] - pts[pts.length - 1][0]) < 1e-6 && Math.abs(pts[0][1] - pts[pts.length - 1][1]) < 1e-6) pts.pop();
    const n0 = pts.length, dep = depth || tearDepth;
    let vote = 0;
    for (let i = 0; i < n0; i++) {
      const a = pts[i], b = pts[(i + 1) % n0], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      vote += inside((a[0] + b[0]) / 2 - (b[1] - a[1]) / l * 6, (a[1] + b[1]) / 2 + (b[0] - a[0]) / l * 6) ? 1 : -1;
    }
    const sgn = vote >= 0 ? 1 : -1, ch = [], rs = [], torn = [], worn = [];
    for (let i = 0; i < n0; i++) {
      const a = pts[i], b = pts[(i + 1) % n0];
      ch.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    for (let i = 0; i < ch.length; i++) {
      const a = ch[i], b = ch[(i + 1) % ch.length], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
      for (let k = 0; k < n; k++) rs.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    for (let i = 0; i < rs.length; i++) {
      const p = rs[i], pv = rs[(i - 1 + rs.length) % rs.length], nx = rs[(i + 1) % rs.length];
      let tx = nx[0] - pv[0], ty = nx[1] - pv[1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const nX = -ty * sgn, nY = tx * sgn, w = wornWidth(p[0], p[1]);
      let d = dep(p[0], p[1]);
      // a softened CONCAVE corner bulges a few px into the neighbour: push such a point on until it is inside, so a tear never touches another cell
      for (let k = 0; k < 14 && !inside(p[0] + nX * d, p[1] + nY * d); k++) d += 1;
      torn.push([p[0] + nX * d, p[1] + nY * d]);
      worn.push([p[0] - nX * w, p[1] - nY * w]);
    }
    return { torn: torn, worn: worn };
  }

  /** Torn outlines of a cell set: one per boundary loop (outer loops and the loops round any enclosed island of untouched land). */
  function tornLoops(grid, set, step) {
    const inside = (x, y) => { const c = grid.worldToCell(x, y); return set.has(Geo.cellId(c.q, c.r)); };
    return Geo.chainEdgeSegments(grid, outerEdges(set)).map(l => tear(l.points, inside, step || 4));
  }
  const ring = l => 'M' + l.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
  function loopsPath(loops) { return loops.map(l => ring(l.torn || l)).join(''); }

  /** CSS mask-image value for the ground: opaque everywhere, transparent inside the torn holes (evenodd keeps an enclosed island opaque). */
  function holeMaskCss(W, H, holesD) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"><path fill="#000" fill-rule="evenodd" d="M0 0H' + W + 'V' + H + 'H0Z' + holesD + '"/></svg>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }

  /**
   * Tonal drift of the worn band (static, no filter, no extra pass): runs of the band, tapering to nothing at both ends along the tear line, are
   * overlaid in a slightly darker (aged) or lighter (ivory) parchment tone. `weight(x, y)` is 0..1 per point; a run is a stretch where it is above 0.
   * Returns one path `d` (many small closed runs). A loop that is nowhere zero is left out — a whole-ring tone is just the band's own colour.
   */
  function stainPath(loop, weight) {
    const n = loop.torn.length, f = new Array(n);
    let start = -1;
    for (let i = 0; i < n; i++) { f[i] = weight(loop.torn[i][0], loop.torn[i][1]); if (start < 0 && f[i] <= 0.02) start = i; }
    if (start < 0) return '';
    const pt = (p, q, k) => (p[0] + (q[0] - p[0]) * k).toFixed(1) + ' ' + (p[1] + (q[1] - p[1]) * k).toFixed(1);
    let d = '', run = [];
    const flush = () => {
      if (run.length > 2) d += 'M' + run.map(i => pt(loop.torn[i], loop.worn[i], f[i])).join('L') + 'L' + run.slice().reverse().map(i => pt(loop.torn[i], loop.torn[i], 0)).join('L') + 'Z';
      run = [];
    };
    for (let k = 0; k < n; k++) { const i = (start + k) % n; if (f[i] > 0.02) run.push(i); else flush(); }
    flush();
    return d;
  }
  const toneDark = (x, y) => Math.min(1, Math.max(0, (vnoise(x / 52, y / 52, 91) - 0.58) / 0.2));
  const toneLight = (x, y) => toneDark(x, y) > 0.02 ? 0 : Math.min(1, Math.max(0, (vnoise(x / 38, y / 38, 93) - 0.6) / 0.2));

  /**
   * The static rim of one tear (world px, SVG markup), quiet by design: an uneven band of worn, darker parchment just outside the tear (a filled ring
   * between the torn edge and the worn edge — no stroke, no light outline), the thin dark tear line, and inside a small contact shadow the paper casts
   * down-right into the void plus (High) a gentle depth falloff. Blur filters are bounded to the tear's own box (userSpaceOnUse).
   */
  function rimMarkup(loops, box, mode, uid) {
    const d = loopsPath(loops), band = loops.map(l => ring(l.worn) + ring(l.torn.slice().reverse())).join('');
    const m = 40, fx = 'x="' + (box.x0 - m).toFixed(0) + '" y="' + (box.y0 - m).toFixed(0) + '" width="' + (box.x1 - box.x0 + 2 * m).toFixed(0) + '" height="' + (box.y1 - box.y0 + 2 * m).toFixed(0) + '"';
    const id = 'j2-sbfx-' + uid;
    let defs = '<clipPath id="' + id + '-in" clipPathUnits="userSpaceOnUse"><path clip-rule="evenodd" d="' + d + '"/></clipPath>';
    const blur = (n, s) => '<filter id="' + id + '-' + n + '" filterUnits="userSpaceOnUse" ' + fx + ' color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="' + s + '"/></filter>';
    const P = attrs => '<path fill="none" stroke-linejoin="round" d="' + d + '" ' + attrs + '/>';
    const IN = x => '<g clip-path="url(#' + id + '-in)">' + x + '</g>';
    let body = '<path class="j2-sbfx-worn" fill-rule="evenodd" d="' + band + '"/>';
    const dark = loops.map(l => stainPath(l, toneDark)).join(''), light = loops.map(l => stainPath(l, toneLight)).join('');
    if (dark) body += '<path class="j2-sbfx-aged" d="' + dark + '"/>';
    if (light) body += '<path class="j2-sbfx-ivory" d="' + light + '"/>';
    if (mode === 'full') {
      defs += blur('b4', 3.2) + blur('b9', 8);
      body += IN(P('stroke="#000" stroke-opacity=".3" stroke-width="20" filter="url(#' + id + '-b9)"') + P('stroke="#000" stroke-opacity=".82" stroke-width="8" transform="translate(1.5 2.1)" filter="url(#' + id + '-b4)"'));
    } else if (mode === 'soft') {
      defs += blur('b4', 3.2);
      body += IN(P('stroke="#000" stroke-opacity=".78" stroke-width="9" transform="translate(1.5 2.1)" filter="url(#' + id + '-b4)"'));
    } else {
      body += IN(P('stroke="#000" stroke-opacity=".3" stroke-width="10"') + P('stroke="#000" stroke-opacity=".42" stroke-width="4"'));
    }
    body += P('class="j2-sbfx-line"');
    return { defs: defs, body: body };
  }

  /**
   * Printed icons / built-in labels whose box overhangs a tear (a tile is never placed on a marker's own hex, but its icon box reaches the neighbours):
   * each is redrawn ABOVE the tear from the same raster at the same place, inside a softly torn patch a little larger than its box. Over intact
   * ground the patch is pixel-identical to what lies under it; over the void it is a scrap of the original map with its own thin tear line.
   */
  function patchMarkup(holes, protections, grid, baseHref, W, H, uid, holesD) {
    const voidId = 'j2-sbfx-' + uid + '-void';
    let defs = '', body = '', n = 0;
    for (const p of protections || []) {
      const r = p.rectPx || p.rect;
      if (!r) continue;
      const hit = holes.some(h => h.ids.some(id => { const c = Geo.parseCellId(id); return Geo.rectIntersectsPolygon(r, grid.cellCorners(c.q, c.r)); }));
      if (!hit) continue;
      const k = 7, ex = [[r[0] - k, r[1] - k], [r[0] + r[2] + k, r[1] - k], [r[0] + r[2] + k, r[1] + r[3] + k], [r[0] - k, r[1] + r[3] + k]];
      const inR = (x, y) => x >= r[0] - k && x <= r[0] + r[2] + k && y >= r[1] - k && y <= r[1] + r[3] + k;
      const t = tear(ex, inR, 2.5, (x, y) => 0.5 + 2.2 * vnoise(x / 6, y / 6, 61)), pd = ring(t.torn), id = 'j2-sbfx-' + uid + '-p' + (n++);
      defs += '<clipPath id="' + id + '" clipPathUnits="userSpaceOnUse"><path d="' + pd + '"/></clipPath>';
      // the raster sits in a nested <svg> viewport the size of the patch: even if the torn clip were ever lost, nothing outside this box could be painted
      const bx = r[0] - 12, by = r[1] - 12, bw = r[2] + 24, bh = r[3] + 24;
      body += '<g class="j2-sbfx-patch" clip-path="url(#' + id + ')"><svg x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" viewBox="' + bx + ' ' + by + ' ' + bw + ' ' + bh + '" overflow="hidden">' +
        '<rect class="j2-sbfx-paper" x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '"/>' +
        '<image class="j2-sbfx-raster" href="' + String(baseHref).replace(/"/g, '&quot;') + '" x="0" y="0" width="' + W + '" height="' + H + '" preserveAspectRatio="none"/></svg></g>' +
        '<g clip-path="url(#' + voidId + ')"><path class="j2-sbfx-line" fill="none" d="' + pd + '"/></g>';   // its edge shows only where it borders the void
    }
    if (n) defs += '<clipPath id="' + voidId + '" clipPathUnits="userSpaceOnUse"><path clip-rule="evenodd" d="' + (holesD || '') + '"/></clipPath>';
    return { defs: defs, body: body };
  }

  /* ---------------- distance field (one texture per shadow area, rebuilt only when its cells change) ---------------- */

  function bucketize(segs, size) {
    const m = new Map();
    for (const s of segs) {
      const bx0 = Math.floor(Math.min(s[0], s[2]) / size), bx1 = Math.floor(Math.max(s[0], s[2]) / size);
      const by0 = Math.floor(Math.min(s[1], s[3]) / size), by1 = Math.floor(Math.max(s[1], s[3]) / size);
      for (let bx = bx0; bx <= bx1; bx++) for (let by = by0; by <= by1; by++) { const k = bx * 4096 + by; let l = m.get(k); if (!l) m.set(k, l = []); l.push(s); }
    }
    return m;
  }
  function nearest(m, size, x, y, R) {
    const bx = Math.floor(x / size), by = Math.floor(y / size), r = Math.ceil(R / size);
    let best = R * R;
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      const l = m.get((bx + dx) * 4096 + by + dy);
      if (!l) continue;
      for (const s of l) {
        const vx = s[2] - s[0], vy = s[3] - s[1], wx = x - s[0], wy = y - s[1];
        const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
        const ex = wx - vx * t, ey = wy - vy * t, d2 = ex * ex + ey * ey;
        if (d2 < best) best = d2;
      }
    }
    return Math.sqrt(best);
  }

  /**
   * RGBA8 field over the area's box: R = inward distance to the area's outer edge / DMAX, 0 outside the area's own cells. Texel centres sit at
   * box.x0 + (i + .5) * tx, exactly where the shader's uv lands. The area holds Shadowblighted cells only — a tear's cell is never a member.
   */
  function buildField(grid, members) {
    const ids = Array.from(members), box = boundsOf(grid, ids, 1);
    const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
    const w = Math.max(2, Math.ceil(bw / FIELD_TEXEL)), h = Math.max(2, Math.ceil(bh / FIELD_TEXEL)), tx = bw / w, ty = bh / h;
    const B = 64, edges = bucketize(edgeSegments(grid, members), B), data = new Uint8Array(w * h * 4);
    for (let j = 0; j < h; j++) {
      const y = box.y0 + (j + 0.5) * ty;
      for (let i = 0; i < w; i++) {
        const x = box.x0 + (i + 0.5) * tx, c = grid.worldToCell(x, y);
        if (!members.has(Geo.cellId(c.q, c.r))) continue;
        const k = (j * w + i) * 4;
        data[k] = Math.max(1, Math.round(255 * Math.min(FIELD_DMAX, nearest(edges, B, x, y, FIELD_DMAX)) / FIELD_DMAX));
        data[k + 3] = 255;
      }
    }
    return { box: box, w: w, h: h, data: data };
  }

  /* ---------------- WebGL: one shared context renders every area, then each area's 2D canvas copies its pixels ---------------- */

  const VS = 'attribute vec2 aPos;varying vec2 vUv;void main(){vUv=vec2(aPos.x*.5+.5,.5-aPos.y*.5);gl_Position=vec4(aPos,0.,1.);}';
  /**
   * The approved Hybrid motion: three noise layers TRANSPORTED at three velocities (main mass, faster tendrils, a slower dissolve field, in feature units
   * per second), so masses form where the layers agree, travel and dissolve; the layers are mildly stretched along one wind direction and bent by a
   * cross-wind warp; the domain warp rides with the main layer (curls, splits). Constants are the lab's Hybrid set (Phase 1, iteration 2), baked in.
   */
  function fragmentSource(prec, oct, warp) {
    return '#define OCT ' + oct + '\n#define WARP ' + warp + '\nprecision ' + prec + ' float;\n' + `
varying vec2 vUv;
uniform sampler2D uField;
uniform vec2 uOrigin;
uniform vec2 uSize;
uniform float uTime;
uniform float uSmall;
const float INTENSITY=${DEFAULTS.intensity.toFixed(2)};
const float OPACITY=${DEFAULTS.opacity.toFixed(2)};
const vec2 VA=vec2(.112,.036);
const vec2 VB=vec2(.160,-.010);
const vec2 VC=vec2(.040,.050);
const vec2 WIND=vec2(.95,.31);
const float ANISO=.45;
const float WARPK=.85;
const float TEND=.62;
float hash(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}
const mat2 M=mat2(1.6,1.2,-1.2,1.6);
float fbmW(vec2 p){float v=0.,a=.5;for(int i=0;i<3;i++){v+=a*noise(p);p=M*p+vec2(3.1,1.7);a*=.5;}return v/.875;}
float fbmD(vec2 p){float v=0.,a=.5,n=0.;for(int i=0;i<OCT;i++){v+=a*noise(p);n+=a;p=M*p+vec2(3.1,1.7);a*=.5;}return v/n;}
vec2 frame(vec2 x){vec2 s=vec2(dot(x,WIND),dot(x,vec2(-WIND.y,WIND.x)));return s*vec2(mix(1.,.6,ANISO),mix(1.,1.3,ANISO));}
void main(){
  vec4 F=texture2D(uField,vUv);
  if(F.r<=.002){gl_FragColor=vec4(0.);return;}
  vec2 p=(uOrigin+vUv*uSize)/${FEATURE.toFixed(1)};
  float t=uTime;
  vec2 A=frame(p-VA*t), B=frame(p-VB*t)*1.9+vec2(4.4,7.1), C=frame(p-VC*t)*1.3+vec2(2.3,6.1);
  vec2 q=vec2(fbmW(A*.8+vec2(0.,.04*t)),fbmW(A*.8+vec2(5.2,1.3)-vec2(.03*t,0.)));
#if WARP>1
  vec2 r=vec2(fbmW(A+2.4*q+vec2(1.7,9.2)+vec2(0.,.025*t)),fbmW(A+2.4*q+vec2(8.3,2.8)-vec2(.02*t,0.)));
#else
  vec2 r=q;
#endif
  float wk=WARPK*(.9+1.3*INTENSITY);
  A+=vec2(0.,(fbmW(A*vec2(.5,1.4)+vec2(7.7,.3)+vec2(0.,.05*t))-.5)*1.6*ANISO);
  float f=fbmD(A+wk*r);
  float g=fbmD(C-.6*wk*q.yx);
  float rd=1.-abs(2.*fbmD(B+(wk+.7)*.7*r)-1.);
  float tend=pow(rd,5.)*smoothstep(.32,.58,g);
  float mass=smoothstep(.42,.57,f);
  float core=smoothstep(.55,.70,.6*f+.4*g);
  float d=F.r*${FIELD_DMAX.toFixed(1)};
  float edge=smoothstep(0.,15.,d-2.+(f-.5)*26.)*smoothstep(2.5,6.5,d);
  float gap=smoothstep(.46,.30,g);
  float dens=.24+.50*mass+.32*core+TEND*tend-.22*gap;
  dens*=1.+.35*uSmall;
  dens=mix(dens,smoothstep(.12,.95,dens),.55*INTENSITY);
  float a=clamp(dens*edge,0.,1.);
  a=a*(1.-.3*a)*OPACITY;
  vec3 deep=vec3(.03,.016,.07);
  vec3 midnight=vec3(.070,.095,.330);
  vec3 indigo=vec3(.150,.105,.450);
  vec3 violet=vec3(.330,.095,.480);
  vec3 col=mix(midnight,indigo,smoothstep(.30,.70,r.y));
  col=mix(col,violet,smoothstep(.40,.66,g+.2*(q.x-.5)));
  col=mix(col,deep,clamp(core*.8,0.,1.));
  float hl=smoothstep(.9,1.,rd)*(1.-core)*(.3+.4*INTENSITY);
  col=mix(col,vec3(.50,.70,.90),hl*.85);
  a=max(a,hl*.22*edge*OPACITY);
  gl_FragColor=vec4(col*a,a);
}`;
  }

  function createGl(doc) {
    const cv = doc.createElement('canvas');
    cv.width = 256; cv.height = 256;
    const gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    if (!gl) return null;
    const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    const prec = hp && hp.precision > 0 ? 'highp' : 'mediump';
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.disable(gl.BLEND);
    const programs = {};
    function shader(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error('shadowblight-fx shader: ' + gl.getShaderInfoLog(s));
      return s;
    }
    function program(level) {
      if (programs[level]) return programs[level];
      const Q = QUALITY[level], p = gl.createProgram();
      gl.attachShader(p, shader(gl.VERTEX_SHADER, VS));
      gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fragmentSource(prec, Q.oct, Q.warp)));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('shadowblight-fx link: ' + gl.getProgramInfoLog(p));
      const u = n => gl.getUniformLocation(p, n);
      return (programs[level] = { p: p, aPos: gl.getAttribLocation(p, 'aPos'), uField: u('uField'), uOrigin: u('uOrigin'), uSize: u('uSize'), uTime: u('uTime'), uSmall: u('uSmall') });
    }
    function texture(field) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, field.w, field.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, field.data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    /** Renders one area into the bottom-left w x h of the shared drawing buffer; the caller copies it out in the same task. */
    function render(level, tex, box, w, h, time, small) {
      if (w > cv.width || h > cv.height) { cv.width = Math.max(cv.width, Math.ceil(w / 256) * 256); cv.height = Math.max(cv.height, Math.ceil(h / 256) * 256); }
      const P = program(level);
      gl.viewport(0, 0, w, h);
      gl.useProgram(P.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(P.aPos);
      gl.vertexAttribPointer(P.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(P.uField, 0);
      gl.uniform2f(P.uOrigin, box.x0, box.y0);
      gl.uniform2f(P.uSize, box.x1 - box.x0, box.y1 - box.y0);
      gl.uniform1f(P.uTime, time);
      gl.uniform1f(P.uSmall, small || 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function dispose() {
      for (const k of Object.keys(programs)) gl.deleteProgram(programs[k].p);
      gl.deleteBuffer(buf);
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();                       // frees the GPU context now instead of at garbage collection
      cv.width = cv.height = 1;
    }
    return { canvas: cv, gl: gl, precision: prec, render: render, texture: texture, program: program, drop: t => gl.deleteTexture(t), dispose: dispose };
  }

  /** No WebGL (or a lost context): one still frame on the CPU — two-octave masses, no motion. A static shadow, never a glyph. */
  function cpuStill(ctx, w, h, field, small) {
    const img = ctx.createImageData(w, h), d = img.data, box = field.box, bw = box.x1 - box.x0, bh = box.y1 - box.y0;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const fi = Math.min(field.w - 1, Math.floor((i + 0.5) / w * field.w)), fj = Math.min(field.h - 1, Math.floor((j + 0.5) / h * field.h));
      const r = field.data[(fj * field.w + fi) * 4] / 255;
      if (r <= 0.002) continue;
      const x = box.x0 + (i + 0.5) / w * bw, y = box.y0 + (j + 0.5) / h * bh, f = fbm(x / FEATURE, y / FEATURE, 5, 3);
      const edge = smooth(0, 15, r * FIELD_DMAX - 2 + (f - 0.5) * 26) * smooth(2.5, 6.5, r * FIELD_DMAX);
      let a = Math.min(1, (0.3 + 0.55 * smooth(0.4, 0.62, f)) * (1 + 0.35 * small) * edge);
      a = a * (1 - 0.3 * a) * DEFAULTS.opacity;
      const k = (j * w + i) * 4;
      d[k] = 0.11 * 255 * a; d[k + 1] = 0.09 * 255 * a; d[k + 2] = 0.36 * 255 * a; d[k + 3] = 255 * a;
    }
    ctx.globalCompositeOperation = 'copy';
    ctx.putImageData(img, 0, 0);
  }

  /* ---------------- quality: a first guess from capabilities, then a slow governor ---------------- */

  /** A starting level from what the browser reports — never the user agent: WebGL, pointer, device pixels, memory and cores. */
  function initialQuality(env) {
    if (!env.webgl) return 'low';
    let lvl = 2;
    const px = env.vw * env.vh * env.dpr * env.dpr;
    if (env.coarse) lvl = 1;
    if (px > 7e6) lvl = Math.min(lvl, 1);
    if ((env.memory && env.memory <= 4) || (env.cores && env.cores <= 4)) lvl = Math.min(lvl, 1);
    if ((env.memory && env.memory <= 2) || (env.cores && env.cores <= 2)) lvl = 0;
    return LEVELS[lvl];
  }

  /**
   * Fed every rendered frame's interval while the effect is on screen: every 90 frames it takes the 90th percentile; two slow windows in a row
   * (p90 > 28 ms) step down one level, eight fast ones (p90 < 19 ms) step up one; never twice within 8 s, never above `max`.
   */
  function createGovernor(opts) {
    let idx = LEVELS.indexOf(opts.level), bad = 0, good = 0, last = -1e9;
    const max = LEVELS.indexOf(opts.max || 'high'), buf = [];
    return {
      get level() { return LEVELS[idx]; },
      frame(dt, now) {
        buf.push(dt);
        if (buf.length < 90) return null;
        const s = buf.splice(0).sort((a, b) => a - b), p90 = s[Math.floor(s.length * 0.9)];
        if (p90 > 28) { bad++; good = 0; } else if (p90 < 19) { good++; bad = 0; } else { bad = 0; good = 0; }
        if (now - last < 8000) return null;
        let next = idx;
        if (bad >= 2 && idx > 0) next = idx - 1; else if (good >= 8 && idx < max) next = idx + 1;
        if (next === idx) return null;
        idx = next; last = now; bad = 0; good = 0;
        return LEVELS[idx];
      },
    };
  }

  /* ---------------- DOM controller ---------------- */

  let uidSeq = 0;

  /**
   * opts: { grid, worldSize:[W,H], shadowGroup, rimGroup, defs (SVG elements in the world overlay), ground (the masked element: paper + base raster), world
   * (its camera-transformed parent, made transparent while a tear exists),
   * cosmos (an element behind the world, outside the camera transform), cosmosImage { url, width, height }, protections ([{ rect:[x,y,w,h] }]: printed
   * icons, built-in labels and decorative lettering, as Geo.protectionRects / ctx.protections give them, kept above a tear), baseHref (the raster the ground shows), reducedMotion }.
   * The caller owns the camera and calls setCamera() from the same animation frame that applies the world transform; it never reads the camera back.
   */
  function create(o) {
    const doc = o.ground.ownerDocument, win = doc.defaultView || G, grid = o.grid, W = o.worldSize[0], H = o.worldSize[1], uid = ++uidSeq;
    const maskOk = !!(win.CSS && (win.CSS.supports('mask-image', 'none') || win.CSS.supports('-webkit-mask-image', 'none')));
    const canvasOk = !!(doc.createElement('canvas').getContext && doc.createElement('canvas').getContext('2d'));
    const env = { webgl: false, vw: win.innerWidth || 1024, vh: win.innerHeight || 768, dpr: win.devicePixelRatio || 1,
      coarse: !!(win.matchMedia && win.matchMedia('(pointer: coarse)').matches), memory: win.navigator && win.navigator.deviceMemory, cores: win.navigator && win.navigator.hardwareConcurrency };
    let glr = null;
    const fieldCache = new Map(), FIELD_CACHE_MAX = 48;
    try { glr = createGl(doc); } catch (e) { glr = null; }
    env.webgl = !!glr;
    const start = initialQuality(env);
    const st = {
      quality: start, pendingQuality: null, governor: createGovernor({ level: start, max: 'high' }),
      paused: false, reduce: !!o.reducedMotion, cam: { scale: 1, tx: 0, ty: 0 }, vw: 0, vh: 0, moving: false, idleT: 0, raf: 0, last: 0, lastFrame: 0,
      key: '', blighted: new Set(), overtaken: new Set(), areas: [], holes: [], holeBox: null, holesD: '', cosmosRect: '', cosmosLayout: '',
      stats: { updates: [], cost: [], lastCost: 0, visible: 0, culled: 0, pixels: 0, ppu: 0, rebuildMs: 0, holesMs: 0, cosmosScale: 0 },
    };
    const onLost = e => { e.preventDefault(); if (glr) { glr = null; for (const a of st.areas) a.tex = null; drawAll(0, true); } };
    const onRestored = () => { try { glr = createGl(doc); } catch (e) { glr = null; } if (glr) { hookGl(); for (const a of st.areas) a.tex = glr.texture(a.field); drawAll(0, true); syncLoop(); } };
    function hookGl() { if (!glr) return; glr.canvas.addEventListener('webglcontextlost', onLost); glr.canvas.addEventListener('webglcontextrestored', onRestored); }
    hookGl();
    if (o.cosmosImage) { o.cosmos.style.backgroundImage = 'url("' + o.cosmosImage.url + '")'; o.cosmos.style.backgroundRepeat = 'no-repeat'; }
    const rimDefs = doc.createElementNS(SVG_NS, 'g');
    o.defs.appendChild(rimDefs);

    /* ----- geometry: holes depend on the quality (tear step, rim mode); shadow fields only on their cells ----- */

    function rebuildHoles() {
      const t0 = win.performance.now(), Q = QUALITY[st.quality];
      st.holes = []; st.holeBox = null;
      let holesD = '', rimBody = '', defs = '', n = 0;
      for (const comp of componentsOf(st.overtaken)) {
        const set = new Set(comp), loops = tornLoops(grid, set, Q.step), box = boundsOf(grid, comp, 8);
        const rim = rimMarkup(loops, box, Q.rim, uid + '-' + (n++));
        st.holes.push({ ids: comp, box: box });
        holesD += loopsPath(loops); rimBody += rim.body; defs += rim.defs;
        st.holeBox = st.holeBox ? { x0: Math.min(st.holeBox.x0, box.x0), y0: Math.min(st.holeBox.y0, box.y0), x1: Math.max(st.holeBox.x1, box.x1), y1: Math.max(st.holeBox.y1, box.y1) } : Object.assign({}, box);
      }
      const patch = st.holes.length ? patchMarkup(st.holes, o.protections, grid, o.baseHref, W, H, uid, holesD) : { defs: '', body: '' };
      st.holesD = holesD;
      if (o.world) o.world.classList.toggle('has-tears', !!holesD);       // the void must show through the world's own paper background
      rimDefs.innerHTML = defs + patch.defs;
      o.rimGroup.innerHTML = rimBody + patch.body;
      const g = o.ground.style, mask = holesD ? holeMaskCss(W, H, holesD) : 'none';
      g.maskImage = g.webkitMaskImage = mask;
      if (holesD) {
        g.maskSize = g.webkitMaskSize = W + 'px ' + H + 'px';
        g.maskRepeat = g.webkitMaskRepeat = 'no-repeat';
        g.maskPosition = g.webkitMaskPosition = '0 0';
      }
      st.stats.holesMs = win.performance.now() - t0;
      updateCosmos(true);
    }

    /**
     * An area whose cell set is unchanged keeps its canvas, texture and animation clock (a Shadowblight "+" moves a few X's, so most areas stay as they
     * are); distance fields of recently seen cell sets are cached, so stepping back ("-") builds nothing. Returns the new areas, which the caller draws.
     */
    function rebuildAreas() {
      const keep = new Map(st.areas.map(a => [a.key, a])), fresh = [], next = [];
      const B = new Set(Array.from(st.blighted).filter(id => !st.overtaken.has(id)));
      for (const comp of componentsOf(B)) {
        const key = comp.slice().sort(compareIds).join(';'), old = keep.get(key);
        if (old) { keep.delete(key); next.push(old); continue; }
        let field = fieldCache.get(key);
        if (field) fieldCache.delete(key); else field = buildField(grid, new Set(comp));
        fieldCache.set(key, field);                                        // most recent last
        if (fieldCache.size > FIELD_CACHE_MAX) fieldCache.delete(fieldCache.keys().next().value);
        const b = field.box;
        const fo = doc.createElementNS(SVG_NS, 'foreignObject'), cv = doc.createElementNS(XHTML_NS, 'canvas');
        fo.setAttribute('x', b.x0.toFixed(2)); fo.setAttribute('y', b.y0.toFixed(2));
        fo.setAttribute('width', (b.x1 - b.x0).toFixed(2)); fo.setAttribute('height', (b.y1 - b.y0).toFixed(2));
        fo.setAttribute('class', 'j2-sbfx-fo');
        cv.setAttribute('class', 'j2-sbfx-cv');
        fo.appendChild(cv);
        o.shadowGroup.appendChild(fo);
        const area = { key: key, ids: comp, field: field, box: b, fo: fo, cv: cv, ctx: cv.getContext('2d'), tex: glr ? glr.texture(field) : null,
          small: Math.max(0, Math.min(1, (6 - comp.length) / 5)),            // 1 for a lone hex, 0 from six cells on: a small area is a little denser
          ppu: 0, t: 30 + hash2(comp.length, Geo.parseCellId(comp[0]).q, 7) * 400, visible: true };
        next.push(area); fresh.push(area);
      }
      for (const a of keep.values()) { if (a.tex && glr) glr.drop(a.tex); a.fo.remove(); }
      st.areas = next;
      return fresh;
    }

    /* ----- camera ----- */

    function screenBox(b) { const c = st.cam; return { x0: b.x0 * c.scale + c.tx, y0: b.y0 * c.scale + c.ty, x1: b.x1 * c.scale + c.tx, y1: b.y1 * c.scale + c.ty }; }
    function onScreen(b, m) { if (!b || !st.vw) return false; const s = screenBox(b); return s.x1 > -m && s.y1 > -m && s.x0 < st.vw + m && s.y0 < st.vh + m; }

    /** Canvas resolution per area: device px * res, clamped, then scaled down together so the visible areas fit the pixel budget. */
    function measure(force) {
      const Q = QUALITY[st.quality], dpr = win.devicePixelRatio || 1;
      let ppu = Math.min(Q.ppuMax, Math.max(Q.ppuMin, st.cam.scale * dpr * Q.res)), total = 0;
      for (const a of st.areas) { a.visible = onScreen(a.box, 64); if (a.visible) total += (a.box.x1 - a.box.x0) * (a.box.y1 - a.box.y0) * ppu * ppu; }
      if (total > Q.budget) ppu *= Math.sqrt(Q.budget / total);
      st.stats.ppu = ppu;
      for (const a of st.areas) {
        if (!force && a.ppu && Math.abs(a.ppu - ppu) < 0.2 * a.ppu) continue;
        a.ppu = ppu;
        const w = Math.max(2, Math.round((a.box.x1 - a.box.x0) * ppu)), h = Math.max(2, Math.round((a.box.y1 - a.box.y0) * ppu));
        if (a.cv.width !== w || a.cv.height !== h) { a.cv.width = w; a.cv.height = h; a.stale = true; }
      }
    }

    /**
     * The cosmos element is shown only where a tear can be: the tears' screen box (snapped to 256 px so a pan rarely changes it) inside the world and the
     * viewport. The artwork itself is laid out to COVER the viewport (centred, uniform scale, whole px) and the box only crops it, so wherever the box is,
     * the artwork stays fixed to the viewport. Only a viewport resize changes the layout; the camera never does.
     */
    function updateCosmos(force) {
      const el = o.cosmos;
      if (!st.holes.length || !onScreen(st.holeBox, 32)) { if (el.style.display !== 'none') el.style.display = 'none'; st.cosmosRect = ''; return; }
      const s = screenBox(st.holeBox), wr = screenBox({ x0: 0, y0: 0, x1: W, y1: H }), S = 256;
      const x0 = Math.max(0, wr.x0, Math.floor((s.x0 - 32) / S) * S), y0 = Math.max(0, wr.y0, Math.floor((s.y0 - 32) / S) * S);
      const x1 = Math.min(st.vw, wr.x1, Math.ceil((s.x1 + 32) / S) * S), y1 = Math.min(st.vh, wr.y1, Math.ceil((s.y1 + 32) / S) * S);
      const l = Math.round(x0), t = Math.round(y0), key = l + ',' + t + ',' + Math.round(x1) + ',' + Math.round(y1), layout = st.vw + 'x' + st.vh;
      if (el.style.display !== 'block') el.style.display = 'block';
      if (key === st.cosmosRect && layout === st.cosmosLayout && !force) return;
      st.cosmosRect = key; st.cosmosLayout = layout;
      el.style.left = l + 'px'; el.style.top = t + 'px'; el.style.width = Math.max(0, Math.round(x1) - l) + 'px'; el.style.height = Math.max(0, Math.round(y1) - t) + 'px';
      const img = o.cosmosImage;
      if (img) {
        const k = Math.max(st.vw / img.width, st.vh / img.height), iw = Math.ceil(img.width * k), ih = Math.ceil(img.height * k);
        el.style.backgroundSize = iw + 'px ' + ih + 'px';
        el.style.backgroundPosition = (Math.round((st.vw - iw) / 2) - l) + 'px ' + (Math.round((st.vh - ih) / 2) - t) + 'px';
        st.stats.cosmosScale = k;
      }
    }

    function setCamera(cam, vw, vh) {
      st.cam = { scale: cam.scale, tx: cam.tx, ty: cam.ty };
      const resized = vw !== st.vw || vh !== st.vh;
      st.vw = vw; st.vh = vh;
      updateCosmos(resized);
      st.moving = true;
      clearTimeout(st.idleT);
      st.idleT = win.setTimeout(onIdle, 160);
    }
    function onIdle() {
      st.moving = false;
      if (st.pendingQuality) { const q = st.pendingQuality; st.pendingQuality = null; applyQuality(q); }
      measure(false);
      for (const a of st.areas) if (a.visible && (a.stale || a.drawnAt === undefined)) drawArea(a, 0);   // culled / resized areas and the reduced-motion still frame
      syncLoop();
    }
    function applyQuality(level) { if (!QUALITY[level] || level === st.quality) return; st.quality = level; rebuildHoles(); measure(true); drawAll(0, true); }

    /* ----- drawing ----- */

    function drawArea(a, dt) {
      const w = a.cv.width, h = a.cv.height;
      if (!st.reduce) a.t += dt * DEFAULTS.speed;
      const t = st.reduce ? STILL_TIME : a.t;
      if (glr && a.tex) {
        glr.render(st.quality, a.tex, a.box, w, h, t, a.small);
        a.ctx.globalCompositeOperation = 'copy';
        a.ctx.drawImage(glr.canvas, 0, glr.canvas.height - h, w, h, 0, 0, w, h);
      } else cpuStill(a.ctx, w, h, a.field, a.small);
      a.stale = false; a.drawnAt = t;
      st.stats.pixels += w * h;
    }
    function drawAll(dt, force) {
      const t0 = win.performance.now();
      let vis = 0, cul = 0;
      st.stats.pixels = 0;
      for (const a of st.areas) {
        a.visible = onScreen(a.box, 64);
        if (a.visible || force) { drawArea(a, dt); if (a.visible) vis++; else cul++; } else cul++;
      }
      const cost = win.performance.now() - t0, now = win.performance.now();
      st.stats.visible = vis; st.stats.culled = cul; st.stats.lastCost = cost;
      st.stats.updates.push(now); st.stats.cost.push(cost);
      while (st.stats.updates.length && now - st.stats.updates[0] > 1000) { st.stats.updates.shift(); st.stats.cost.shift(); }
    }

    function animating() { return !st.paused && !st.reduce && !!glr && st.areas.length > 0; }
    function syncLoop() { if (animating() && !st.raf) { st.last = 0; st.lastFrame = 0; st.raf = win.requestAnimationFrame(tick); } }
    function tick(now) {
      st.raf = 0;
      if (!animating()) return;
      st.raf = win.requestAnimationFrame(tick);
      if (doc.hidden) { st.last = 0; st.lastFrame = 0; return; }
      const visible = st.areas.some(a => onScreen(a.box, 64));
      if (visible && st.lastFrame) { const q = st.governor.frame(now - st.lastFrame, now); if (q) { if (st.moving) st.pendingQuality = q; else applyQuality(q); } }
      st.lastFrame = now;
      if (st.moving) { st.last = 0; return; }                         // never compete with a pan / pinch
      const Q = QUALITY[st.quality];
      if (st.last && now - st.last < 1000 / Q.hz - 2) return;
      const dt = st.last ? Math.min(2 / Q.hz, (now - st.last) / 1000) : 0;
      st.last = now;
      if (!visible) { st.stats.visible = 0; st.stats.culled = st.areas.length; return; }
      drawAll(dt, false);
    }
    const onVis = () => { if (!doc.hidden) syncLoop(); };
    doc.addEventListener('visibilitychange', onVis);

    /* ----- API ----- */

    return {
      /** True when the effect can draw (2D canvas + CSS masks); otherwise the view keeps the X / skull glyphs. */
      available: maskOk && canvasOk,
      /** Replaces the cell lists; a list identical to the current one is a no-op (the fields are only rebuilt when the cells really change). */
      setCells(cells) {
        const B = cellSet(cells.blighted), O = cellSet(cells.overtaken);
        const key = Array.from(B).sort().join(';') + '|' + Array.from(O).sort().join(';');
        if (key === st.key) return false;
        const t0 = win.performance.now(), holesChanged = Array.from(O).sort().join(';') !== Array.from(st.overtaken).sort().join(';');
        st.key = key; st.blighted = B; st.overtaken = O;
        if (holesChanged) rebuildHoles();
        const fresh = rebuildAreas();
        measure(true);
        if (holesChanged || !fresh.length) drawAll(0, true); else for (const a of fresh) drawArea(a, 0);
        st.stats.rebuildMs = win.performance.now() - t0;
        syncLoop();
        return true;
      },
      setCamera: setCamera,
      /** Stops the animation (e.g. while the Print Preview covers the map); the last frame stays. */
      setPaused(p) { st.paused = !!p; syncLoop(); },
      setReducedMotion(r) { st.reduce = !!r; drawAll(0, true); syncLoop(); },
      get quality() { return st.quality; },
      stats() {
        const s = st.stats, n = s.cost.length;
        return { quality: st.quality, backend: glr ? 'webgl-' + glr.precision : 'cpu-still', updatesPerSec: s.updates.length, avgCost: n ? s.cost.reduce((x, y) => x + y, 0) / n : 0, lastCost: s.lastCost,
          visible: s.visible, culled: s.culled, areas: st.areas.length, holes: st.holes.length, pixels: s.pixels, ppu: s.ppu, rebuildMs: s.rebuildMs, holesMs: s.holesMs,
          cosmosScale: s.cosmosScale, cosmosRect: st.cosmosRect || 'hidden', moving: st.moving, reduce: st.reduce, paused: st.paused };
      },
      destroy() {
        clearTimeout(st.idleT);
        if (st.raf) win.cancelAnimationFrame(st.raf);
        st.raf = 0; st.paused = true;
        doc.removeEventListener('visibilitychange', onVis);
        for (const a of st.areas) { if (a.tex && glr) glr.drop(a.tex); a.fo.remove(); }
        st.areas = [];
        if (glr) { glr.canvas.removeEventListener('webglcontextlost', onLost); glr.canvas.removeEventListener('webglcontextrestored', onRestored); glr.dispose(); glr = null; }
        rimDefs.remove(); o.rimGroup.innerHTML = '';
        const g = o.ground.style; g.maskImage = g.webkitMaskImage = 'none';
        if (o.world) o.world.classList.remove('has-tears');
        o.cosmos.style.display = 'none';
      },
    };
  }

  return Object.freeze({
    QUALITY, LEVELS, FIELD_TEXEL, FIELD_DMAX, FEATURE, DEFAULTS, OVERTAKEN_SYMBOL,
    hash2, vnoise, fbm, componentsOf, outerEdges, boundsOf, cellsFromDocument, cellsFromProjection,
    tearDepth, wornWidth, stainPath, tear, tornLoops, loopsPath, holeMaskCss, rimMarkup, patchMarkup, buildField, fragmentSource, initialQuality, createGovernor, create,
  });
});
