#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — generate-ribbon-fabric.js
   DEV-ONLY, offline. Cuts the photographic gold bookmark in
   img/ribbon-fabric-source/gold-banner.png into the three texture slices used
   by the experimental fabric ribbon skin (?ribbonSkin=fabric, css/styles.css
   "Fabric ribbon skin"). Needs `sharp` (devDependency); nothing here runs in
   the browser or in CI.

     top     sewn upper hem + seam           anchored to the ribbon's top edge
     mid     plain weave, tileable           repeat-y between the two ends
     bottom  lower hem and swallow-tail      anchored to the ribbon's bottom edge

   Continuity. The ribbon's height changes at runtime, so the weave tile meets the
   bottom hem at an arbitrary phase and, when it repeats, meets itself. Folds are
   lighting (low frequency), not grain, so the three slices share ONE fold profile:
     - profile(x) = column mean of the blurred weave: the ribbon's fold structure,
       constant down its length, so a tile or slice boundary can never cut a fold;
     - mid    = profile + the real weave grain (mirrored once: grain has no visible
                symmetry, folds - which did - are no longer in the tile);
     - top / bottom keep their real pixels (stitching, hem, grain) but their low
       frequencies are eased onto the profile where they meet the weave (bottom:
       only above the hem's inner stitch line, found from the alpha channel).
   Slices are written lossless. Output is 2x the 104px ribbon width. The bottom
   slice is squashed vertically once, here, so the artwork's tail depth matches
   the CSS ribbon's 11px notch (--rb-notch); no slice is ever stretched at
   runtime. Run: node scripts/generate-ribbon-fabric.js
   ============================================================ */
'use strict';
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'img/ribbon-fabric-source/gold-banner.png');
const OUT = path.join(ROOT, 'img/ui/ribbon-fabric');

const OUT_W = 208;                       // 2 x --rb-w (104px)
const BOX = { left: 258, top: 148, width: 1203, height: 663 }; // opaque bounds of the artwork
const TOP_H = 117, MID_H = 280;          // source rows: top slice, then the tileable middle
const NOTCH_SRC = 172, NOTCH_OUT = 22;   // artwork tail depth -> 2 x 11px CSS notch
const FEATHER = 4;                       // output px of alpha ramp where a slice meets the weave
const SIGMA = 4;                         // output px: what counts as "fold" (low) vs "grain" (detail)
const TOP_BLEND_FROM = 8;                // top slice row where easing onto the profile starts
const HEM_SRC = 55;                      // source px between the silhouette edge and the hem's inner stitch line
const BOTTOM_BLEND_MAX = 14;             // longest ease down from the bottom slice's top edge, output rows
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

// Linear row resample of a w-wide, 3-channel float image from h0 rows to h1 rows.
function resampleRows(img, w, h0, h1) {
  const out = new Float32Array(w * h1 * 3);
  for (let y = 0; y < h1; y++) {
    const p = Math.max(0, Math.min(h0 - 1, ((y + 0.5) * h0) / h1 - 0.5));
    const y0 = Math.floor(p), y1 = Math.min(h0 - 1, y0 + 1), f = p - y0;
    for (let i = 0; i < w * 3; i++) out[y * w * 3 + i] = img[y0 * w * 3 + i] * (1 - f) + img[y1 * w * 3 + i] * f;
  }
  return out;
}

async function rawOf(sharpImg) {
  const { data } = await sharpImg.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data;
}

function fadeEdge(raw, w, h, edge) {
  // Soften one horizontal edge's alpha so the slice blends into the weave beside it.
  for (let y = 0; y < h; y++) {
    const d = edge === 'bottom' ? h - 1 - y : y, f = Math.min(1, d / FEATHER);
    for (let x = 0; x < w; x++) raw[(y * w + x) * 4 + 3] = Math.round(raw[(y * w + x) * 4 + 3] * f);
  }
}

const save = (raw, w, h, file) => sharp(raw, { raw: { width: w, height: h, channels: 4 } }).webp(WEBP).toFile(path.join(OUT, file));

(async () => {
  const base = sharp(await sharp(SRC).extract(BOX).png().toBuffer());
  const scale = OUT_W / BOX.width;
  const baseH = Math.round(BOX.height * scale);
  const slice = (top, height, outH) => base.clone().extract({ left: 0, top, width: BOX.width, height })
    .resize(OUT_W, outH, { fit: 'fill', kernel: 'lanczos3' });

  const topH = Math.round(TOP_H * scale);
  const midH = Math.round(MID_H * scale);
  const botSrcH = BOX.height - TOP_H - MID_H;
  const k = NOTCH_OUT / (NOTCH_SRC * scale);
  const botH = Math.round(botSrcH * scale * k);

  // Fold (low-frequency) layer of the whole artwork at output size, and its per-column profile over the weave.
  const full = await rawOf(base.clone().resize(OUT_W, baseH, { fit: 'fill', kernel: 'lanczos3' }));
  const low = blurRgb(full, OUT_W, baseH, SIGMA);
  const profile = new Float32Array(OUT_W * 3);
  for (let x = 0; x < OUT_W; x++) for (let c = 0; c < 3; c++) {
    let s = 0;
    for (let y = topH; y < topH + midH; y++) s += low[(y * OUT_W + x) * 3 + c];
    profile[x * 3 + c] = s / midH;
  }
  const sliceLow = (y0, rows) => low.slice(y0 * OUT_W * 3, (y0 + rows) * OUT_W * 3);

  // top: real pixels, folds eased onto the profile toward the weave
  const top = await rawOf(slice(0, TOP_H, topH));
  const topLow = sliceLow(0, topH);
  for (let y = 0; y < topH; y++) {
    const wt = smooth((y - TOP_BLEND_FROM) / (topH - 1 - TOP_BLEND_FROM));
    for (let x = 0; x < OUT_W; x++) for (let c = 0; c < 3; c++) {
      const o = (y * OUT_W + x) * 4 + c;
      top[o] = clamp8(top[o] + wt * (profile[x * 3 + c] - topLow[(y * OUT_W + x) * 3 + c]));
    }
  }
  fadeEdge(top, OUT_W, topH, 'bottom');
  await save(top, OUT_W, topH, 'catalog-top.webp');

  // mid: profile + the real grain, mirrored once so the tile closes on itself
  const mid = await rawOf(slice(TOP_H, MID_H, midH).flatten({ background: '#8a5c14' }));
  const midLow = sliceLow(topH, midH);
  const tile = Buffer.alloc(OUT_W * midH * 2 * 4, 255);
  for (let y = 0; y < midH; y++) for (let x = 0; x < OUT_W; x++) for (let c = 0; c < 3; c++) {
    const v = clamp8(profile[x * 3 + c] + (mid[(y * OUT_W + x) * 4 + c] - midLow[(y * OUT_W + x) * 3 + c]));
    tile[(y * OUT_W + x) * 4 + c] = v;
    tile[((2 * midH - 1 - y) * OUT_W + x) * 4 + c] = v;
  }
  await save(tile, OUT_W, midH * 2, 'catalog-mid.webp');

  // bottom: real pixels; folds eased onto the profile only above the hem's inner stitch line
  const bot = await rawOf(slice(TOP_H + MID_H, botSrcH, botH));
  const botLowRows = baseH - topH - midH;
  const botLow = resampleRows(sliceLow(topH + midH, botLowRows), OUT_W, botLowRows, botH);
  for (let x = 0; x < OUT_W; x++) {
    let edge = botH;                                        // first opaque row from the bottom = silhouette edge
    while (edge > 0 && bot[((edge - 1) * OUT_W + x) * 4 + 3] < 128) edge--;
    const len = Math.max(2, Math.min(BOTTOM_BLEND_MAX, edge - HEM_SRC * scale * k));
    for (let y = 0; y < Math.ceil(len); y++) {
      const wb = 1 - smooth(y / len);
      for (let c = 0; c < 3; c++) {
        const o = (y * OUT_W + x) * 4 + c;
        bot[o] = clamp8(bot[o] + wb * (profile[x * 3 + c] - botLow[(y * OUT_W + x) * 3 + c]));
      }
    }
  }
  fadeEdge(bot, OUT_W, botH, 'top');
  await save(bot, OUT_W, botH, 'catalog-bottom.webp');
  console.log({ topH, midTile: midH * 2, botH, verticalSquashOfTail: +k.toFixed(3) });
})();
