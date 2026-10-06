#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — scripts/journey2/measure-grid.js
   Dev-only. Measures the one continuous flat-top hex lattice printed on the
   assembled Journey 2 world raster (img/journey2/valloren-world.webp) and
   writes the measurement record that scripts/journey2/build-template.js
   promotes into data/journey2/map-template.json.

   Method (see docs/journey2-implementation/stage-0/CALIBRATION_REPORT.md):
   1. Start from a coarse lattice (from the 30.27 px row pitch / local fits).
   2. For every candidate cell, observe where its six printed grid lines are
      (hex-observe.js: perpendicular line-profile centroids) -> observed
      centre. This uses raster pixels only.
   3. Cells are split deterministically: ~1/8 are HOLD-OUT cells that never
      influence the fit. A robust least-squares affine lattice
      (centre = O + q*Bq + r*Br) is fitted to the usable observations of the
      remaining cells; the observe/fit loop is repeated until it converges.
   4. Residuals are reported for the fit cells and, separately, for the
      hold-out cells (independent check), plus a set of named control cells
      (scripts/journey2/control-cells.js).
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { loadDarkness, observeCell, SQ3 } = require('./lib/hex-observe');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'docs', 'journey2-implementation', 'stage-0', 'data');
const composition = require('./composition.json');
const worldFile = path.join(ROOT, composition.output.path);

// Inner frame (map content) rectangle in world px, from the frame-line profile
// of the native panels (see CALIBRATION_REPORT.md "Frame lines").
const FRAME_INNER = { x0: 7, y0: 7, x1: 4841, y1: 3178 };

function hashCell(q, r) { return (Math.imul(q + 1000, 2654435761) ^ Math.imul(r + 1000, 40503)) >>> 0; }
function isHoldout(q, r) { return hashCell(q, r) % 8 === 0; }

function cellCenter(P, q, r) { return [P.ox + q * P.bqx + r * P.brx, P.oy + q * P.bqy + r * P.bry]; }

function* cellsInRect(P, rect, margin) {
  const x0 = rect.x0 - margin, x1 = rect.x1 + margin, y0 = rect.y0 - margin, y1 = rect.y1 + margin;
  for (let q = -4; q < 140; q++) {
    for (let r = -80; r < 130; r++) {
      const c = cellCenter(P, q, r);
      if (c[0] >= x0 && c[0] <= x1 && c[1] >= y0 && c[1] <= y1) yield { q, r, c };
    }
  }
}

/** Solve 3x3 weighted normal equations for [o, bq, br] given rows (q, r, v, w). */
function lsq3(rows) {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
  for (const [q, r, v, w] of rows) {
    const f = [1, q, r];
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) A[i][j] += w * f[i] * f[j]; b[i] += w * f[i] * v; }
  }
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i; for (let k = i + 1; k < 3; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;
    [M[i], M[p]] = [M[p], M[i]];
    for (let k = i + 1; k < 3; k++) { const f = M[k][i] / M[i][i]; for (let j = i; j < 4; j++) M[k][j] -= f * M[i][j]; }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) { let s = M[i][3]; for (let j = i + 1; j < 3; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
  return x;
}

function fitLattice(obs) {
  // robust: iteratively reweighted (Tukey biweight) separate regressions for x and y
  let w = obs.map(() => 1);
  let px, py;
  for (let it = 0; it < 8; it++) {
    px = lsq3(obs.map((o, i) => [o.q, o.r, o.obs[0], w[i]]));
    py = lsq3(obs.map((o, i) => [o.q, o.r, o.obs[1], w[i]]));
    const res = obs.map(o => Math.hypot(o.obs[0] - (px[0] + o.q * px[1] + o.r * px[2]), o.obs[1] - (py[0] + o.q * py[1] + o.r * py[2])));
    const sorted = [...res].sort((a, b) => a - b);
    const mad = sorted[Math.floor(sorted.length / 2)] || 0.1;
    const cut = Math.max(0.8, 4 * mad);
    w = res.map(v => (v >= cut ? 0 : (1 - (v / cut) ** 2) ** 2));
  }
  return { ox: px[0], bqx: px[1], brx: px[2], oy: py[0], bqy: py[1], bry: py[2] };
}

function stats(vals) {
  const n = vals.length;
  if (!n) return { n: 0 };
  const sorted = [...vals].sort((a, b) => a - b);
  const rms = Math.sqrt(vals.reduce((a, v) => a + v * v, 0) / n);
  const pct = p => sorted[Math.min(n - 1, Math.floor(p * n))];
  return { n, rms, mean: vals.reduce((a, v) => a + v, 0) / n, median: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: sorted[n - 1] };
}

async function main() {
  const img = await loadDarkness(worldFile);
  // Seed: the coarse lattice from the independent west-panel fit, translated to
  // world coordinates; it is accurate near the seed point (world 182,622) and is
  // grown outward ring by ring so every prediction stays within the +/-7 px
  // observation window (extrapolating far would silently lock onto art strokes).
  let P = { ox: -39.65, oy: -11.8, bqx: 52.429, bqy: 30.255, brx: 0, bry: 60.535 };
  const seed = [182, 622];
  const radii = [250, 400, 600, 900, 1300, 1800, 2400, 3200, 4000, 6000];
  const inRadius = (c, rad) => Math.hypot(c[0] - seed[0], c[1] - seed[1]) <= rad;
  for (const rad of radii) {
    for (let iter = 0; iter < 4; iter++) {
      const observations = [];
      for (const cell of cellsInRect(P, FRAME_INNER, 40)) {
        if (!inRadius(cell.c, rad)) continue;
        const o = observeCell(img, cell.c, [P.bqx, P.bqy], [P.brx, P.bry]);
        const rec = { q: cell.q, r: cell.r, usable: o.usable, hold: isHoldout(cell.q, cell.r) };
        if (o.delta) rec.obs = [cell.c[0] + o.delta[0], cell.c[1] + o.delta[1]];
        observations.push(rec);
      }
      const fitSet = observations.filter(o => o.usable && !o.hold);
      if (fitSet.length < 12) { console.error('too few usable cells at radius', rad); break; }
      const next = fitLattice(fitSet);
      const change = Math.hypot(next.ox - P.ox, next.oy - P.oy) + Math.hypot(next.bqx - P.bqx, next.bqy - P.bqy) * 40 + Math.hypot(next.brx - P.brx, next.bry - P.bry) * 40;
      console.error('radius ' + rad + ' iter ' + iter + ': cells=' + observations.length + ' usable=' + observations.filter(o => o.usable).length + ' fit=' + fitSet.length + ' change=' + change.toFixed(4));
      P = next;
      if (change < 0.002) break;
    }
  }
  // final observation pass with the converged lattice (residuals w.r.t. the *final* fit)
  const all = [];
  for (const cell of cellsInRect(P, FRAME_INNER, 40)) {
    const o = observeCell(img, cell.c, [P.bqx, P.bqy], [P.brx, P.bry]);
    all.push({ q: cell.q, r: cell.r, pred: cell.c, usable: o.usable, rms: o.rms, nEdges: o.edges.filter(e => e.m !== null).length, hold: isHoldout(cell.q, cell.r), resid: o.delta ? Math.hypot(o.delta[0], o.delta[1]) : null, delta: o.delta });
  }
  const H = Math.hypot(P.brx, P.bry);                  // flat-to-flat (short dimension)
  const fitRes = all.filter(o => o.usable && !o.hold).map(o => o.resid);
  const holdRes = all.filter(o => o.usable && o.hold).map(o => o.resid);
  const hs = stats(holdRes);
  const out = {
    schemaVersion: 1,
    generatedBy: 'scripts/journey2/measure-grid.js',
    world: composition.compositionId,
    frameInnerRectPx: FRAME_INNER,
    lattice: P,
    derived: {
      hexShortDimensionPx: H,
      hexCircumradiusPx: H / SQ3,
      columnPitchPx: P.bqx,
      basisLengthQ: Math.hypot(P.bqx, P.bqy),
      basisLengthR: Math.hypot(P.brx, P.bry),
      anisotropy: Math.hypot(P.bqx, P.bqy - P.bry / 2) / (SQ3 / 2 * H)
    },
    counts: { cells: all.length, usable: all.filter(o => o.usable).length, fit: fitRes.length, holdout: holdRes.length },
    fitResidualPx: stats(fitRes),
    holdoutResidualPx: hs,
    holdoutResidualFractionOfShortDimension: { rms: hs.rms / H, p99: hs.p99 / H, max: hs.max / H },
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'grid-fit.json'), JSON.stringify(out, null, 2) + '\n');
  const csv = ['q,r,predX,predY,usable,nEdges,rmsEdge,hold,residPx,dx,dy'];
  for (const o of all) csv.push([o.q, o.r, o.pred[0].toFixed(2), o.pred[1].toFixed(2), o.usable ? 1 : 0, o.nEdges, o.rms === null ? '' : o.rms.toFixed(2), o.hold ? 1 : 0, o.resid === null ? '' : o.resid.toFixed(2), o.delta ? o.delta[0].toFixed(2) : '', o.delta ? o.delta[1].toFixed(2) : ''].join(','));
  fs.writeFileSync(path.join(OUT_DIR, 'grid-observations.csv'), csv.join('\n') + '\n');
  console.log(JSON.stringify(out, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
