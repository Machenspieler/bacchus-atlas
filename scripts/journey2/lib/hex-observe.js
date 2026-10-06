/* ============================================================
   Bacchus's Atlas — scripts/journey2/lib/hex-observe.js
   Dev-only measurement helpers for the Journey 2 grid calibration. Given a
   darkness raster of the world map and a *predicted* hex cell, they measure
   where the six printed grid lines of that cell actually are (perpendicular
   line-profile centroids) and solve for the cell centre displacement. Nothing
   here reads the fitted lattice except to know where to look (+/-7 px): the
   returned observation comes from raster pixels only.
   ============================================================ */
'use strict';

const sharp = require('sharp');

const SQ3 = Math.sqrt(3);

/** Loads the world raster as a Float32 "line darkness" map (0 = paper/ocean
 * tone, 1 = black) after a light 0.5 px blur, plus the plain 8-bit luminance. */
async function loadDarkness(file) {
  const g = await sharp(file).removeAlpha().grayscale().raw().toBuffer({ resolveWithObject: true });
  const bl = await sharp(file).removeAlpha().grayscale().blur(0.5).raw().toBuffer({ resolveWithObject: true });
  if (g.info.channels !== 1 || bl.info.channels !== 1) throw new Error('expected single-channel luminance rasters');
  const { width: W, height: H } = g.info;
  const D = new Float32Array(W * H);
  for (let i = 0; i < D.length; i++) {
    const v = (238 - bl.data[i]) / 60;
    D[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return { D, gray: g.data, W, H };
}

function bilinear(D, W, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const i = y0 * W + x0;
  return (D[i] * (1 - fx) + D[i + 1] * fx) * (1 - fy) + (D[i + W] * (1 - fx) + D[i + W + 1] * fx) * fy;
}

/** Six neighbour displacement vectors, axial order (+1,0) (+1,-1) (0,-1) (-1,0) (-1,+1) (0,+1). */
function neighbourVectors(bq, br) {
  return [
    [bq[0], bq[1]],
    [bq[0] - br[0], bq[1] - br[1]],
    [-br[0], -br[1]],
    [-bq[0], -bq[1]],
    [-bq[0] + br[0], -bq[1] + br[1]],
    [br[0], br[1]],
  ];
}

/** Corner k sits between neighbour k and k+1: (n_k + n_{k+1}) / 3 from the centre. */
function cornerOffsets(bq, br) {
  const n = neighbourVectors(bq, br);
  const out = [];
  for (let k = 0; k < 6; k++) out.push([(n[k][0] + n[(k + 1) % 6][0]) / 3, (n[k][1] + n[(k + 1) % 6][1]) / 3]);
  return out;
}

/**
 * Measures one cell. `center` is the predicted centre, bq/br the lattice basis
 * (used only for the six edge midpoints/directions). Returns
 *   { delta:[dx,dy]|null, edges:[{k, m|null, peak, samples, spread}], usable, rms }
 * where m is the observed perpendicular offset of that edge's line from its
 * predicted position (positive = away from the centre).
 */
function observeCell(img, center, bq, br, opts) {
  const o = Object.assign({ halfSpan: 7, step: 0.5, tFrac: 0.32, samples: 7, minPeak: 0.25, maxSpread: 0.9 }, opts || {});
  const { D, W, H } = img;
  const n = neighbourVectors(bq, br);
  const edges = [];
  for (let k = 0; k < 6; k++) {
    const len = Math.hypot(n[k][0], n[k][1]);
    const nu = [n[k][0] / len, n[k][1] / len];      // outward unit normal
    const u = [-nu[1], nu[0]];                      // along the edge
    const mid = [center[0] + n[k][0] / 2, center[1] + n[k][1] / 2];
    const R = len / SQ3;                            // edge length
    const found = [];
    for (let s = 0; s < o.samples; s++) {
      const t = (s / (o.samples - 1) - 0.5) * 2 * o.tFrac * R;
      const px = mid[0] + u[0] * t, py = mid[1] + u[1] * t;
      if (px < 10 || py < 10 || px > W - 10 || py > H - 10) continue;
      // profile along the normal
      let best = -1, bestD = 0;
      const prof = [];
      for (let d = -o.halfSpan; d <= o.halfSpan + 1e-9; d += o.step) {
        const v = bilinear(D, W, px + nu[0] * d, py + nu[1] * d);
        prof.push([d, v]);
        if (v > best) { best = v; bestD = d; }
      }
      if (best < o.minPeak) continue;
      // centroid of the main lobe (values above half the peak, contiguous with the max)
      const idx = prof.findIndex(p => p[0] === bestD);
      let a = idx, b = idx;
      while (a > 0 && prof[a - 1][1] >= best * 0.5) a--;
      while (b < prof.length - 1 && prof[b + 1][1] >= best * 0.5) b++;
      let sw = 0, sd = 0;
      for (let i = a; i <= b; i++) { sw += prof[i][1]; sd += prof[i][1] * prof[i][0]; }
      found.push({ d: sd / sw, peak: best });
    }
    if (found.length < 4) { edges.push({ k, m: null, peak: 0, samples: found.length, spread: null, nu }); continue; }
    const ds = found.map(f => f.d).sort((x, y) => x - y);
    const med = ds[Math.floor(ds.length / 2)];
    const kept = found.filter(f => Math.abs(f.d - med) <= 1.2);
    if (kept.length < 4) { edges.push({ k, m: null, peak: 0, samples: kept.length, spread: null, nu }); continue; }
    const mean = kept.reduce((a, f) => a + f.d, 0) / kept.length;
    const spread = Math.sqrt(kept.reduce((a, f) => a + (f.d - mean) ** 2, 0) / kept.length);
    const peak = kept.reduce((a, f) => a + f.peak, 0) / kept.length;
    edges.push({ k, m: spread <= o.maxSpread ? mean : null, peak, samples: kept.length, spread, nu });
  }
  const good = edges.filter(e => e.m !== null);
  // need two non-parallel normals (k and k+3 are parallel)
  const dirs = new Set(good.map(e => e.k % 3));
  if (good.length < 4 || dirs.size < 2) return { delta: null, edges, usable: false, rms: null };
  // least squares: (sum nu nu^T) delta = sum m nu
  let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
  for (const e of good) { a11 += e.nu[0] * e.nu[0]; a12 += e.nu[0] * e.nu[1]; a22 += e.nu[1] * e.nu[1]; b1 += e.m * e.nu[0]; b2 += e.m * e.nu[1]; }
  const det = a11 * a22 - a12 * a12;
  if (Math.abs(det) < 1e-6) return { delta: null, edges, usable: false, rms: null };
  const dx = (b1 * a22 - b2 * a12) / det, dy = (a11 * b2 - a12 * b1) / det;
  let ss = 0;
  for (const e of good) { const r = e.m - (dx * e.nu[0] + dy * e.nu[1]); e.resid = r; ss += r * r; }
  const rms = Math.sqrt(ss / good.length);
  return { delta: [dx, dy], edges, usable: rms <= 0.9, rms };
}

module.exports = { loadDarkness, bilinear, neighbourVectors, cornerOffsets, observeCell, SQ3 };
