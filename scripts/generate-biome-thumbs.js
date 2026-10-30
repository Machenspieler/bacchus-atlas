#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — generate-biome-thumbs.js
   DEV-ONLY, offline. Builds the square Session Prep thumbnails of the biome art:
   img/biomes/<biome>-thumb-{48,96,144}.webp, one file per device-pixel ratio (1x / 2x / 3x) of the
   48px .prep-thumb (the 40-44px central-column tile reads the same files). Needs `sharp`
   (devDependency); nothing here runs in the browser or in CI.

   Why a dedicated file: the Catalog strips (-100/-200/-250/-300.avif, 1:3) are rendered by the browser
   at their own pixel density and are faithful to the master (docs/research/biome-artwork-quality-audit.md).
   The Prep thumbnail used to be the 200x600 WebP strip squeezed into a 48px square, a ~4:1 browser
   downscale of an already-sharpened 40 KB file, which shows as speckle instead of detail. Here the
   master is resampled ONCE, with Lanczos, straight to the pixel size that is drawn.

   Framing is exactly what `object-fit: cover` showed before: the middle third of the strip, i.e. the
   512 x 512 square at x 256..768, y 512..1024 of the 1024 x 1536 master. No other crop, no AI
   upscaling, no new detail: the only processing is Lanczos downsampling, one mild unsharp mask to
   offset the resampling softness at 48px, and WebP encoding. Masters are never modified.
   Run: node scripts/generate-biome-thumbs.js
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'img/biomes src');
const OUT = path.join(ROOT, 'img/biomes');

const BIOMES = ['aquatic', 'badlands', 'drylands', 'forest', 'frozen', 'grassland', 'mountain', 'rolling', 'settlement', 'tropical', 'underground', 'universal', 'wetland'];
const SIZES = [48, 96, 144];
const CROP = { left: 256, top: 512, width: 512, height: 512 };
const UNSHARP = { sigma: 0.6, m1: 0.6, m2: 0.8 };   // chosen against 0 / 0.6 / 0.8 in the lab: no halo, no speckle at 5x
const WEBP = { quality: 90, effort: 6, smartSubsample: false };

async function main() {
  let total = 0;
  for (const biome of BIOMES) {
    const master = await sharp(path.join(SRC, biome + '.png')).extract(CROP).toBuffer();
    for (const size of SIZES) {
      const file = path.join(OUT, `${biome}-thumb-${size}.webp`);
      await sharp(master).resize(size, size, { kernel: 'lanczos3' }).sharpen(UNSHARP).webp(WEBP).toFile(file);
      total += fs.statSync(file).size;
    }
  }
  console.log(`Wrote ${BIOMES.length * SIZES.length} thumbnails to img/biomes/ (${(total / 1024).toFixed(0)} KB)`);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { BIOMES, SIZES, CROP };
