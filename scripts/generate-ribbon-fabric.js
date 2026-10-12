#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — generate-ribbon-fabric.js
   DEV-ONLY, offline. Builds the two texture layers of the experimental fabric
   ribbon skin (?ribbonSkin=fabric, css/styles.css "Fabric ribbon skin") from the
   full-length photographic bookmark masters in img/ribbon-fabric-source/ (see FABRICS below).
   Needs `sharp` (devDependency); nothing here runs in the browser or in CI.

     body  ONE continuous fabric surface: the top of the master, from the sewn upper hem straight down,
           cropped (never warped, mirrored, tiled or synthesised) and anchored to the ribbon's top edge.
           It is taller than the longest ribbon, so a taller ribbon simply reveals more of the same cloth.
           Real folds, real weave, real side stitching, one constant scale.
     hem   only the sewn swallow-tail band (the stitch line and everything below it), cut from the bottom
           of the master, with a feathered top edge, anchored to the ribbon's bottom edge. It carries no
           fabric of its own above the stitch: there the body shows through, whatever the ribbon's height.

   The master is ~3x longer than the ribbon needs (at ribbon width the 100px body takes ~590 of its ~1700
   rows), so no cloth has to be invented. The only processing is: defringe the cut-out's coloured halo,
   crop, resample isotropically to 2x the 104px ribbon width, and squash the hem once, here, so the V's
   depth equals the CSS ribbon's 11px notch (--rb-notch, the clip-path in css/styles.css). No layer is ever
   scaled vertically at runtime. Run: node scripts/generate-ribbon-fabric.js
   ============================================================ */
'use strict';
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'img/ui/ribbon-fabric');

const OUT_W = 208;                       // 2 x --rb-w (104px)
const BODY_H = 200;                      // 2 x 100px: > the tallest ribbon (87px) plus spring overshoot
const NOTCH_OUT = 22;                     // 2 x the 11px CSS notch
const HEM_RAMP = 5;                      // output rows over which the hem's top edge fades into the body
const EDGE_SOLID = 235;                  // alpha at/above which a pixel is trusted cloth; below it the cut-out's matte colour is replaced
const EDGE_SIGMA = 5;                    // source px: radius of the cloth colour that replaces the matte

// One entry per fabric = one master + the measurements taken on it (alpha > 128). Output: <id>-body.webp, <id>-hem.webp.
// The masters are NOT interchangeable and nothing is shared between them: each keeps its own folds, weave and stitch.
//   BOX          opaque bounds of the cloth (silhouette edge + ~2-3px margin)
//   NOTCH_SRC    artwork tail depth (hem corner row - V apex row) -> squashed to 2 x the 11px CSS notch (--rb-notch)
//   HEM_SRC      source px between the silhouette edge and the hem's stitch line (vertical)
//   HEM_TOP_SRC  BOX-relative source row where the hem layer's pixels start (above the V's stitch apex)
//   purgeRadius  optional: faint (non-trusted) pixels with no trusted cloth within this many source px are stray
//                specks of the cut-out's background and are made fully transparent (the gold master has none worth it)
const FABRICS = {
  // Gold master: silhouette x 112..724 at mid-height, flares ~5px at the bottom corners; rows 90 (top hem edge) .. 1786.
  catalog: {
    src: 'G-Banner-long.png',
    BOX: { left: 109, top: 90, width: 618, height: 1697 },
    NOTCH_SRC: 127, HEM_SRC: 36, HEM_TOP_SRC: 1500,
  },
  // Purple master (p-Banner.png, 838x1877): silhouette x 113..730 at mid-height, rows 80 (top hem edge) .. 1811;
  // V apex row 1679 vs hem corners ~1807 (depth 128); stitch line ~34px above the silhouette edge (apex stitch ~row 1646).
  lists: {
    src: 'p-Banner.png',
    BOX: { left: 110, top: 80, width: 623, height: 1732 },
    NOTCH_SRC: 128, HEM_SRC: 34, HEM_TOP_SRC: 1534,
    purgeRadius: 6,
  },
  // Emerald master (E-Banner.png, 838x1877): silhouette x 110..727 at mid-height (729 at the bottom flare), rows 71 (top hem
  // edge) .. 1822; V apex row 1691 vs hem corners ~1821 (depth 130); stitch line ~34px above the silhouette edge. Like the
  // purple cut-out it has a faint alpha haze around the silhouette, hence purgeRadius.
  prep: {
    src: 'E-Banner.png',
    BOX: { left: 107, top: 71, width: 624, height: 1753 },
    NOTCH_SRC: 130, HEM_SRC: 34, HEM_TOP_SRC: 1555,
    purgeRadius: 6,
  },
};
const WEBP = { lossless: true, effort: 6 };
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

// Square dilation of the trusted-cloth mask (alpha 255 in `raw`) -> Uint8Array(1 where trusted cloth lies within r px).
function dilate(raw, w, h, r) {
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    for (let i = Math.max(0, x - r); i <= Math.min(w - 1, x + r); i++) if (raw[(y * w + i) * 4 + 3]) { tmp[y * w + x] = 1; break; }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    for (let j = Math.max(0, y - r); j <= Math.min(h - 1, y + r); j++) if (tmp[j * w + x]) { out[y * w + x] = 1; break; }
  }
  return out;
}

const save = (raw, w, h, file) => sharp(raw, { raw: { width: w, height: h, channels: 4 } }).webp(WEBP).toFile(path.join(OUT, file));

async function build(id, cfg) {
  const { BOX, NOTCH_SRC, HEM_SRC, HEM_TOP_SRC } = cfg;
  const SRC = path.join(ROOT, 'img/ribbon-fabric-source', cfg.src);
  const { data: crop } = await sharp(SRC).extract(BOX).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = BOX;

  // Defringe. The cut-out's soft edge (and a faint halo outside it) carries red/yellow/green matte colour, not the
  // cloth's. Colour every pixel below EDGE_SOLID with the surrounding trusted cloth, keeping its alpha, so the real
  // stitching and the silhouette's natural irregularity stay and only the stray colour goes.
  const trusted = Buffer.from(crop);
  for (let i = 0; i < W * H; i++) trusted[i * 4 + 3] = crop[i * 4 + 3] >= EDGE_SOLID ? 255 : 0;
  const cloth = blurRgb(trusted, W, H, EDGE_SIGMA);
  let recoloured = 0, purged = 0;
  const trustedNear = cfg.purgeRadius ? dilate(trusted, W, H, cfg.purgeRadius) : null;
  for (let i = 0; i < W * H; i++) {
    const a = crop[i * 4 + 3];
    if (a >= EDGE_SOLID) continue;
    if (cfg.purgeRadius && !trustedNear[i]) { crop[i * 4 + 3] = 0; purged++; continue; }
    recoloured++;
    for (let c = 0; c < 3; c++) crop[i * 4 + c] = Math.round(cloth[i * 3 + c]);
  }

  const S = OUT_W / W;
  const master = () => sharp(crop, { raw: { width: W, height: H, channels: 4 } });

  // body: the top of the master, 1:1 crop, resampled isotropically. Tall enough for the longest ribbon.
  const bodySrcH = Math.round(BODY_H / S);
  const body = await master().extract({ left: 0, top: 0, width: W, height: bodySrcH })
    .resize(OUT_W, BODY_H, { fit: 'fill', kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer();
  await save(body, OUT_W, BODY_H, `${id}-body.webp`);

  // hem: the swallow-tail band only. Real pixels, vertically squashed so the V's depth equals the CSS notch.
  const k = NOTCH_OUT / (NOTCH_SRC * S);
  const hemSrcH = H - HEM_TOP_SRC;
  const hemH = Math.round(hemSrcH * S * k);
  const hem = await master().extract({ left: 0, top: HEM_TOP_SRC, width: W, height: hemSrcH })
    .resize(OUT_W, hemH, { fit: 'fill', kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer();
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
  await save(hem, OUT_W, hemH, `${id}-hem.webp`);

  console.log(id, { srcScale: +S.toFixed(4), srcPxPerCssPx: +(2 / S).toFixed(2), bodyRows: BODY_H, bodySrcRows: bodySrcH, hemRows: hemH, hemSquash: +k.toFixed(3), recoloured, purged });
}

(async () => {
  const only = process.argv.slice(2);
  for (const id of Object.keys(FABRICS)) if (!only.length || only.includes(id)) await build(id, FABRICS[id]);
})();
