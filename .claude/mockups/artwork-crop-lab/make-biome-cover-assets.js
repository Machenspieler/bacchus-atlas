#!/usr/bin/env node
/* Lab-only. Builds the evidence images and measurements of the "Biome cover sources" section (K).
 * Reads the PNG masters in img/biomes src/ (read-only) and the shipped Journey headers; writes only under
 * assets/biome-cover/ and biome-cover-metrics.json. Nothing here is served by the site. Needs `sharp`.
 *   b16-<b>-640.webp   a 16:9 window of the portrait master's FULL width (1024 px), centred on the subject
 *                      (focus row per biome below), resized to 640x360: the best landscape a 2:3 master can give
 *   biome-cover-metrics.json   file sizes of every candidate and of the dedicated derivatives we could cut
 *                      from the Journey headers (640x360 / 320x180, WebP and AVIF), for the performance section */
'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require(path.join(__dirname, '../../../node_modules/sharp'));
const ROOT = path.join(__dirname, '../../..');
const OUT = path.join(__dirname, 'assets/biome-cover');
/* centre of the 16:9 window as a fraction of the master's height (read from the full masters) */
const FOCUS = { aquatic: .40, badlands: .45, drylands: .38, forest: .40, frozen: .42, grassland: .38, mountain: .40, rolling: .35, settlement: .40, tropical: .40, underground: .45, universal: .30, wetland: .50 };
const kb = f => Math.round(fs.statSync(f).size / 102.4) / 10;
(async () => {
  const metrics = [];
  for (const b of Object.keys(FOCUS)) {
    const master = path.join(ROOT, 'img/biomes src', b + '.png');
    const top = Math.max(0, Math.min(1536 - 576, Math.round(FOCUS[b] * 1536 - 288)));
    const b16 = path.join(OUT, `b16-${b}-640.webp`);
    await sharp(master).extract({ left: 0, top, width: 1024, height: 576 }).resize(640, 360, { kernel: 'lanczos3' }).webp({ quality: 90 }).toFile(b16);
    const row = { biome: b, b16Top: top, b16KB: kb(b16), stripKB: { avif200: kb(path.join(ROOT, `img/biomes/${b}-200.avif`)), webp200: kb(path.join(ROOT, `img/biomes/${b}-200.webp`)), avif300: kb(path.join(ROOT, `img/biomes/${b}-300.avif`)) } };
    const jh = path.join(ROOT, 'img/journey2/headers', b + '.webp');
    if (fs.existsSync(jh)) {
      row.journeyKB = kb(jh);
      for (const w of [640, 320]) {
        const h = w * 9 / 16;
        const buf = sharp(jh).resize(w, h, { kernel: 'lanczos3' });
        row['dedicatedWebp' + w + 'KB'] = Math.round((await buf.clone().webp({ quality: 82 }).toBuffer()).length / 102.4) / 10;
        row['dedicatedAvif' + w + 'KB'] = Math.round((await buf.clone().avif({ quality: 52, effort: 4 }).toBuffer()).length / 102.4) / 10;
      }
    }
    metrics.push(row);
  }
  fs.writeFileSync(path.join(__dirname, 'biome-cover-metrics.json'), JSON.stringify(metrics, null, 1) + '\n');
  console.log(JSON.stringify(metrics.map(r => [r.biome, r.b16KB, r.journeyKB, r.dedicatedWebp640KB, r.dedicatedAvif640KB, r.dedicatedWebp320KB, r.dedicatedAvif320KB])));
})();
