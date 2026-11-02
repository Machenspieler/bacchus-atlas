#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — generate-catalog-art.js
   DEV-ONLY, offline. Cuts the Catalog's vertical strips into img/catalog-art/: for every
   picture in js/catalog-art.js PICTURES that is in use (use !== 'none'), one 1:3 window
   of the master — full height, H/3 wide, left edge at x% of the travel across the master —
   resampled to 100 / 200 / 250 / 300 px wide (AVIF) plus a 200 px WebP, the same ladder as
   img/biomes/. 300 px is at most the 314 px the window holds, so nothing is ever upscaled.
   No sharpening, no denoise, no tint; masters are never modified and never shipped.
   Needs `sharp` (devDependency). Run: node scripts/generate-catalog-art.js [outDir]
   (default img/catalog-art/; stale files for pictures no longer in use are removed there).
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Catalog = require('../js/catalog-art.js');
const ListArt = require('../js/list-cover-art.js');
const { SOURCES } = require('./generate-list-covers.js');

const ROOT = path.join(__dirname, '..');
const AVIF = { quality: 55, effort: 6 };
const WEBP = { quality: 82, effort: 6 };

/* The master of a picture: an archetype's from the list-cover generator, a painting's own JPEG. */
function masterOf(id) {
  if (id.startsWith('env:')) return `img/env/${id.slice(4)}.jpg`;
  return SOURCES[Catalog.PICTURES[id].stem];
}

/** The pixel window of a master for crop position x (0-100): 1:3, full height. */
function windowFor(width, height, x) {
  const w = Math.round(height / 3);
  return { left: Math.round((x / 100) * (width - w)), top: 0, width: w, height };
}

async function main() {
  const out = path.resolve(process.argv[2] || path.join(ROOT, 'img/catalog-art'));
  fs.mkdirSync(out, { recursive: true });
  const wanted = new Set();
  let total = 0, count = 0;
  for (const [id, pic] of Object.entries(Catalog.PICTURES)) {
    if (pic.use === 'none') continue;
    const master = masterOf(id);
    const src = path.join(ROOT, master);
    if (!master || !fs.existsSync(src)) { console.error('missing master for ' + id); process.exitCode = 1; continue; }
    const meta = await sharp(src).metadata();
    const win = windowFor(meta.width, meta.height, pic.x);
    const base = sharp(src).extract(win);
    for (const w of Catalog.WIDTHS) {
      const f = `${pic.stem}-${w}.avif`; wanted.add(f);
      await base.clone().resize({ width: w, kernel: 'lanczos3' }).avif(AVIF).toFile(path.join(out, f));
      total += fs.statSync(path.join(out, f)).size; count++;
    }
    const wf = `${pic.stem}-200.webp`; wanted.add(wf);
    await base.clone().resize({ width: 200, kernel: 'lanczos3' }).webp(WEBP).toFile(path.join(out, wf));
    total += fs.statSync(path.join(out, wf)).size; count++;
  }
  for (const f of fs.readdirSync(out)) if (/\.(avif|webp)$/.test(f) && !wanted.has(f)) fs.unlinkSync(path.join(out, f));
  console.log(`Wrote ${count} files to ${path.relative(ROOT, out)}/ (${(total / 1024).toFixed(0)} KB)`);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { masterOf, windowFor };
