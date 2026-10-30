#!/usr/bin/env node
/* Lab-only. Builds the evidence images of the "Biome quality" section from the PNG masters in img/biomes src/
 * (read-only) into assets/biome-quality/. Nothing here is served by the site. Needs `sharp`.
 *   wide-<b>-640.webp        the full 1024px width of the master, 290px band at the Lists-cover focus, 640x181:
 *                            what a 318x90 cover tile at 2x would need (the 1:3 strips are only 200-300px wide)
 *   master-<b>-300.webp      Lanczos reference of the strip crop (centre 512px of the master) at 300x900, q95
 *   prepref-<b>-48.png       the 48px Prep window of the master, Lanczos only, for the magnified diagnostic
 *   (the browser-rendered "before"/"after" 48px pixels are copied in by the audit run: prep-before-d1-<b>.png ...) */
'use strict';
const path = require('path');
const sharp = require(path.join(__dirname, '../../../node_modules/sharp'));
const ROOT = path.join(__dirname, '../../..');
const OUT = path.join(__dirname, 'assets/biome-quality');
const BIOMES = ['aquatic', 'badlands', 'drylands', 'forest', 'frozen', 'grassland', 'mountain', 'rolling', 'settlement', 'tropical', 'underground', 'universal', 'wetland'];
(async () => {
  for (const b of BIOMES) {
    const m = path.join(ROOT, 'img/biomes src', b + '.png');
    await sharp(m).extract({ left: 0, top: 528, width: 1024, height: 290 }).resize(640, 181, { kernel: 'lanczos3' }).webp({ quality: 90 }).toFile(path.join(OUT, `wide-${b}-640.webp`));
    await sharp(m).extract({ left: 256, top: 0, width: 512, height: 1536 }).resize(300, 900, { kernel: 'lanczos3' }).webp({ quality: 95 }).toFile(path.join(OUT, `master-${b}-300.webp`));
    await sharp(m).extract({ left: 256, top: 512, width: 512, height: 512 }).resize(48, 48, { kernel: 'lanczos3' }).png().toFile(path.join(OUT, `prepref-${b}-48.png`));
  }
  console.log('done');
})();
