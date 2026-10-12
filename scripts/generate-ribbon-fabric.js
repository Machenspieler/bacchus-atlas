#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — generate-ribbon-fabric.js
   DEV-ONLY, offline. Builds the two texture layers of the experimental fabric
   ribbon skin (?ribbonSkin=fabric, css/styles.css "Fabric ribbon skin") from the
   photographic gold bookmark in img/ribbon-fabric-source/gold-banner.png.
   Needs `sharp` (devDependency); nothing here runs in the browser or in CI.

     body  ONE continuous fabric surface, anchored to the ribbon's top edge, taller than the
           longest ribbon. Real pixels from the top down to the sewn seam, then the artwork's own
           folds carried further down (see below). Side stitching runs the full length.
     hem   only the sewn swallow-tail band (the stitch line and everything below it), with a
           feathered top edge, anchored to the ribbon's bottom edge. It is not a second fabric
           texture: above the stitch the body shows through, whatever the ribbon's height.

   Why this shape. The artwork is only ~51 CSS px tall at ribbon width but the ribbon grows to
   ~87 px, so ~35 px of extra cloth must come from somewhere. Earlier versions invented it
   (a constant per-column fold profile + a tiled weave) and the folds flattened into regular
   waves. Here the folds are the artwork's OWN, lengthened the way a longer hanging ribbon would
   lengthen them: below the seam the fold layer (the picture minus thread-scale grain) is
   resampled along a smooth monotone vertical warp whose stretch eases in from 1:1 at the seam,
   so nothing jumps and no fold is repeated or mirrored. The thread-scale weave is a loop-closed
   stretch of the real grain, unwarped, so the thread size is constant at every height. The two
   side-stitch strips are never warped: a loop-closed stretch of the real strip is repeated, so
   stitches keep their size. At the shortest ribbon the body is (almost) the untouched photo.

   Output is 2x the 104px ribbon width. The hem is squashed vertically once, here, so the
   artwork's tail depth matches the CSS ribbon's 11px notch (--rb-notch); no layer is ever
   scaled vertically at runtime. Run: node scripts/generate-ribbon-fabric.js
   ============================================================ */
'use strict';
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'img/ribbon-fabric-source/gold-banner.png');
const OUT = path.join(ROOT, 'img/ui/ribbon-fabric');

const OUT_W = 208;                       // 2 x --rb-w (104px)
const BODY_H = 200;                      // 2 x 100px: > the tallest ribbon (87px) plus spring overshoot
const BOX = { left: 258, top: 148, width: 1203, height: 663 }; // opaque bounds of the artwork
const NOTCH_SRC = 172, NOTCH_OUT = 22;   // artwork tail depth -> 2 x 11px CSS notch
const HEM_SRC = 55;                      // source px between the silhouette edge and the hem's inner stitch line
const HEM_TOP_SRC = 410;                 // source row where the hem layer's pixels start (above the V's stitch apex)
const HEM_RAMP = 4;                      // output rows over which the hem's top edge fades into the body
const Y0 = 22;                           // output row below which the fold layer starts to lengthen (past the seam)
const BODY_END = 72;                     // last output row of pure body at every column (above the V's stitch apex)
const WARP_RAMP = 40;                    // output rows over which the stretch eases in from 1:1
const GRAIN_SIGMA = 1.7;                 // output px: below this is thread-scale grain, above it is cloth (folds, crinkles)
const STRIP_SRC = 66;                    // source px: width of the side stitching strip
const STRIP_BLEND = 4;                   // output px: horizontal ease between strip and cloth
const LOOP_WIN = 6;                      // rows compared at the loop's wrap point
const LOOP_FADE = 5;                     // rows of wrap cross-fade
const WARP_TARGET = 170;                 // output row (85px): the lowest body row visible at the tallest ribbon, at the corners
const WEBP = { lossless: true, effort: 6 };
const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

// Alpha-weighted separable gaussian over an RGBA raw buffer -> Float32 RGB (transparent pixels never leak in).
function blurRgb(raw, w, h, sigma) {
  const r = Math.ceil(sigma * 3), k = [];
  let ks = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); ks += v; }
  const n = w * h;
  let cur = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const a = raw[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) cur[i * 4 + c] = raw[i * 4 + c] * a;
    cur[i * 4 + 3] = a;
  }
  for (const horizontal of [true, false]) {
    const nxt = new Float32Array(n * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const acc = [0, 0, 0, 0];
      for (let i = -r; i <= r; i++) {
        const xx = horizontal ? Math.min(w - 1, Math.max(0, x + i)) : x;
        const yy = horizontal ? y : Math.min(h - 1, Math.max(0, y + i));
        const o = (yy * w + xx) * 4, kv = k[i + r] / ks;
        for (let c = 0; c < 4; c++) acc[c] += cur[o + c] * kv;
      }
      for (let c = 0; c < 4; c++) nxt[(y * w + x) * 4 + c] = acc[c];
    }
    cur = nxt;
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = cur[i * 4 + 3] || 1e-6;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = cur[i * 4 + c] / a;
  }
  return out;
}

async function rawOf(sharpImg) {
  const { data } = await sharpImg.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data;
}
const save = (raw, w, h, file) => sharp(raw, { raw: { width: w, height: h, channels: 4 } }).webp(WEBP).toFile(path.join(OUT, file));

// Vertical warp: output row y -> source row. 1:1 down to Y0, then the stretch eases in to a constant 1/c; c is
// solved so that WARP_TARGET (the lowest row the tallest ribbon can show at a side) lands on the last row of pure body.
function buildWarp(bodyEnd) {
  const make = (c) => {
    const s = new Float32Array(BODY_H);
    let acc = Y0;
    for (let y = 0; y < BODY_H; y++) {
      if (y <= Y0) { s[y] = y; continue; }
      acc += 1 - (1 - c) * smooth((y - Y0) / WARP_RAMP);
      s[y] = acc;
    }
    return s;
  };
  let lo = 0.05, hi = 1;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; (make(mid)[WARP_TARGET] > bodyEnd ? hi = mid : lo = mid); }
  return { s: make((lo + hi) / 2), c: (lo + hi) / 2 };
}

// Loop period P (rows) such that tile(y) = img[y0 + (y-y0) mod P] wraps seamlessly: the rows before the wrap
// (y0+P-k) must look like the rows before the start (y0-k). Returns the cheapest P within [pMin, pMax].
function searchLoop(get, cols, y0, pMin, pMax) {
  let best = { cost: Infinity, P: pMin };
  for (let P = pMin; P <= pMax; P++) {
    let c = 0, n = 0;
    for (let k = 1; k <= LOOP_WIN; k++) for (const x of cols) { c += Math.abs(get(y0 + P - k, x) - get(y0 - k, x)); n++; }
    c = (c / n) * (1 - 0.15 * (P - pMin) / Math.max(1, pMax - pMin)); // mild preference for a longer, less repetitive loop
    if (c < best.cost) best = { cost: c, P };
  }
  return best;
}

(async () => {
  const base = sharp(await sharp(SRC).extract(BOX).png().toBuffer());
  const S = OUT_W / BOX.width;
  const fullH = Math.round(BOX.height * S);

  // The artwork at output size, isotropic: real pixels, folds + grain together.
  const F = await rawOf(base.clone().resize(OUT_W, fullH, { fit: 'fill', kernel: 'lanczos3' }));
  const rgbAt = (y, x, c) => F[(y * OUT_W + x) * 4 + c];
  const L = blurRgb(F, OUT_W, fullH, GRAIN_SIGMA);          // cloth: folds and crinkles
  // Semi-transparent edge pixels of the cut-out carry the matte's colour, not the cloth's: take the cloth's instead.
  for (let i = 0; i < OUT_W * fullH; i++) {
    const w = smooth((F[i * 4 + 3] - 140) / 100);            // 0 = pure matte colour, 1 = cloth
    if (w < 1) for (let c = 0; c < 3; c++) F[i * 4 + c] = F[i * 4 + c] * w + L[i * 3 + c] * (1 - w);
  }
  const Lat = (y, x, c) => L[(y * OUT_W + x) * 3 + c];
  const Gat = (y, x, c) => rgbAt(y, x, c) - Lat(y, x, c);   // thread-scale grain, signed

  const warp = buildWarp(BODY_END);
  const xs = Math.round(STRIP_SRC * S);
  const inStrip = (x) => x < xs || x >= OUT_W - xs;

  // Thread grain: a loop-closed stretch of the real grain between the seam and the end of the body (cloth columns only).
  const cloth = []; for (let x = xs; x < OUT_W - xs; x += 1) cloth.push(x);
  const gSum = (y, x) => Gat(y, x, 0) * 0.299 + Gat(y, x, 1) * 0.587 + Gat(y, x, 2) * 0.114;
  const gLoop = searchLoop(gSum, cloth, Y0, 18, BODY_END - Y0);
  // Side strips: the real stitched strip, repeated; each side picks its own loop so its stitch phase wraps cleanly.
  const stripLoop = (cols) => searchLoop((y, x) => rgbAt(y, x, 0) * 0.299 + rgbAt(y, x, 1) * 0.587 + rgbAt(y, x, 2) * 0.114,
    cols, Y0, 14, BODY_END - Y0);
  const leftCols = []; for (let x = 0; x < xs; x++) leftCols.push(x);
  const rightCols = []; for (let x = OUT_W - xs; x < OUT_W; x++) rightCols.push(x);
  const lLoop = stripLoop(leftCols), rLoop = stripLoop(rightCols);

  // Loop sample with the wrap cross-fade: the last LOOP_FADE rows of a period ease to the rows before the start.
  const loopY = (y, P) => {
    const t = (y - Y0) % P;
    return { t, y: Y0 + t, fadeTo: t >= P - LOOP_FADE ? Y0 - LOOP_FADE + (t - (P - LOOP_FADE)) : -1, f: t >= P - LOOP_FADE ? smooth((t - (P - LOOP_FADE) + 1) / (LOOP_FADE + 1)) : 0 };
  };
  const loopVal = (get, y, x, c, P) => {
    const l = loopY(y, P); let v = get(l.y, x, c);
    if (l.fadeTo >= 0) v = v * (1 - l.f) + get(l.fadeTo, x, c) * l.f;
    return v;
  };

  const body = Buffer.alloc(OUT_W * BODY_H * 4, 255);
  for (let y = 0; y < BODY_H; y++) for (let x = 0; x < OUT_W; x++) {
    const o = (y * OUT_W + x) * 4;
    if (y <= Y0) { for (let c = 0; c < 3; c++) body[o + c] = F[(y * OUT_W + x) * 4 + c]; body[o + 3] = F[(y * OUT_W + x) * 4 + 3]; continue; }
    const sy = Math.min(BODY_END, warp.s[y]), y0 = Math.floor(sy), f = sy - y0, y1 = Math.min(fullH - 1, y0 + 1);
    for (let c = 0; c < 3; c++) {
      const clothV = Lat(y0, x, c) * (1 - f) + Lat(y1, x, c) * f + loopVal(Gat, y, x, c, gLoop.P);
      let v = clothV;
      if (inStrip(x) || x < xs + STRIP_BLEND || x >= OUT_W - xs - STRIP_BLEND) {
        const left = x < OUT_W / 2, P = left ? lLoop.P : rLoop.P;
        const stripV = loopVal(rgbAt, y, x, c, P);
        const d = left ? x - xs : OUT_W - xs - 1 - x;      // <0 inside the strip
        const wStrip = 1 - smooth((d + 1) / (STRIP_BLEND + 1));
        v = stripV * wStrip + clothV * (1 - wStrip);
      }
      body[o + c] = clamp8(v);
    }
  }
  await save(body, OUT_W, BODY_H, 'catalog-body.webp');

  // hem: the swallow-tail band only. Real pixels, vertically squashed so the V's depth equals the CSS notch.
  const k = NOTCH_OUT / (NOTCH_SRC * S);
  const hemSrcH = BOX.height - HEM_TOP_SRC;
  const hemH = Math.round(hemSrcH * S * k);
  const hem = await rawOf(base.clone().extract({ left: 0, top: HEM_TOP_SRC, width: BOX.width, height: hemSrcH })
    .resize(OUT_W, hemH, { fit: 'fill', kernel: 'lanczos3' }));
  const hemRows = HEM_SRC * S * k;                          // silhouette edge -> stitch line, output rows
  for (let x = 0; x < OUT_W; x++) {
    let edge = hemH;                                        // first opaque row from the bottom = silhouette edge
    while (edge > 0 && hem[((edge - 1) * OUT_W + x) * 4 + 3] < 128) edge--;
    const stitch = edge - hemRows;
    for (let y = 0; y < hemH; y++) {
      const m = smooth((y - (stitch - HEM_RAMP)) / HEM_RAMP);
      const o = (y * OUT_W + x) * 4 + 3;
      hem[o] = Math.round(hem[o] * m);
    }
  }
  await save(hem, OUT_W, hemH, 'catalog-hem.webp');

  console.log({ bodyRows: BODY_H, hemRows: hemH, stretchAtBottom: +(1 / warp.c).toFixed(2), grainLoop: gLoop, leftStripLoop: lLoop, rightStripLoop: rLoop });
})();
