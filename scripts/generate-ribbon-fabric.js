#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — generate-ribbon-fabric.js
   DEV-ONLY, offline. Cuts the photographic gold bookmark in
   img/ribbon-fabric-source/gold-banner.png into the three texture slices used
   by the experimental fabric ribbon skin (?ribbonSkin=fabric, css/styles.css
   "Fabric ribbon skin"). Needs `sharp` (devDependency); nothing here runs in
   the browser or in CI.

     top     sewn upper hem + seam           anchored to the ribbon's top edge
     mid     plain weave, mirrored so it     repeat-y between the two ends
             tiles vertically with no seam
     bottom  lower hem and swallow-tail      anchored to the ribbon's bottom edge

   Output is 2x the 104px ribbon width. The bottom slice is squashed vertically
   once, here, so the artwork's tail depth matches the CSS ribbon's 11px notch
   (--rb-notch); no slice is ever stretched at runtime. Run: node scripts/generate-ribbon-fabric.js
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
const FEATHER = 5;                       // output px of alpha ramp where a slice meets the weave
const WEBP = { quality: 90, alphaQuality: 100, effort: 6 };

async function fadeEdge(buf, w, h, edge) {
  // Soften one horizontal edge of an RGBA slice so it blends into the weave behind it.
  const ramp = Buffer.alloc(w * h);
  for (let y = 0; y < h; y++) {
    const d = edge === 'bottom' ? h - 1 - y : y;
    ramp.fill(Math.round(255 * Math.min(1, d / FEATHER)), y * w, (y + 1) * w);
  }
  return sharp(buf).ensureAlpha()
    .composite([{ input: ramp, raw: { width: w, height: h, channels: 1 }, blend: 'dest-in' }])
    .png().toBuffer();
}

(async () => {
  const base = sharp(await sharp(SRC).extract(BOX).png().toBuffer());
  const scale = OUT_W / BOX.width;
  const slice = (top, height, outH) => base.clone().extract({ left: 0, top, width: BOX.width, height })
    .resize(OUT_W, outH, { fit: 'fill', kernel: 'lanczos3' });

  const topH = Math.round(TOP_H * scale);
  const topBuf = await slice(0, TOP_H, topH).png().toBuffer();
  await sharp(await fadeEdge(topBuf, OUT_W, topH, 'bottom')).webp(WEBP).toFile(path.join(OUT, 'catalog-top.webp'));

  const midH = Math.round(MID_H * scale);
  const mid = await slice(TOP_H, MID_H, midH).flatten({ background: '#8a5c14' }).png().toBuffer();
  const flipped = await sharp(mid).flip().png().toBuffer();
  await sharp({ create: { width: OUT_W, height: midH * 2, channels: 3, background: '#000' } })
    .composite([{ input: mid, top: 0, left: 0 }, { input: flipped, top: midH, left: 0 }])
    .webp({ quality: 90, effort: 6 }).toFile(path.join(OUT, 'catalog-mid.webp'));

  const botSrcH = BOX.height - TOP_H - MID_H;
  const k = NOTCH_OUT / (NOTCH_SRC * scale);
  const botH = Math.round(botSrcH * scale * k);
  const botBuf = await slice(TOP_H + MID_H, botSrcH, botH).png().toBuffer();
  await sharp(await fadeEdge(botBuf, OUT_W, botH, 'top')).webp(WEBP).toFile(path.join(OUT, 'catalog-bottom.webp'));
  console.log({ topH, midTile: midH * 2, botH, verticalSquashOfTail: +k.toFixed(3) });
})();

