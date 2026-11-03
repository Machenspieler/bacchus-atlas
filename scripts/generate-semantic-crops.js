#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — generate-semantic-crops.js
   DEV-ONLY, offline. Cuts the approved semantic crops (PD-090, js/list-cover-art.js
   SEMANTIC_OVERRIDES / CROP_CATALOG_WINDOWS / the crop() pictures) straight from the archetype
   PNG masters in img/cover-archetypes-source/ — never from a derivative:
     img/catalog-art/crop-<name>-{w}.avif + crop-<name>-200.webp   the 1:3 Catalog strip
     img/list-covers/crop-<name>-{w}.avif + crop-<name>-<last>.webp   the My Lists cover picture
   One Lanczos3 resample per file, no sharpening, no denoise, no stretch; widths stop at the pixels
   the window really holds, so nothing is upscaled. Needs `sharp` (devDependency).
   Run: node scripts/generate-semantic-crops.js
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Art = require('../js/list-cover-art.js');

const ROOT = path.join(__dirname, '..');
const AVIF_CATALOG = { quality: 55, effort: 6 }; // as scripts/generate-catalog-art.js
const AVIF_LISTS = { quality: 52, effort: 6 };   // as scripts/generate-list-covers.js
const WEBP = { quality: 82, effort: 6 };

const masterOf = name => path.join(ROOT, 'img/cover-archetypes-source', name + '.png');

/** Every file this script owns: [{ out, master, rect, widths, stem }]. */
function jobs() {
  const list = [];
  for (const [name, w] of Object.entries(Art.CROP_CATALOG_WINDOWS)) {
    list.push({ dir: 'img/catalog-art', stem: 'crop-' + name, master: masterOf(w.master),
      rect: { left: w.left, top: w.top, width: w.width, height: w.height }, widths: w.widths, avif: AVIF_CATALOG, fallbackWidth: 200 });
  }
  for (const img of Object.values(Art.IMAGES)) {
    if (img.kind !== 'crop') continue;
    const name = img.id.slice(5);
    list.push({ dir: 'img/list-covers', stem: 'crop-' + name, master: masterOf(img.parent.slice('archetype:'.length)),
      rect: img.rect, widths: img.avif.map(a => a.w), avif: AVIF_LISTS, fallbackWidth: img.avif[img.avif.length - 1].w });
  }
  return list;
}

async function main() {
  let total = 0, count = 0;
  for (const j of jobs()) {
    if (!fs.existsSync(j.master)) { console.error('missing master ' + j.master); process.exitCode = 1; continue; }
    const meta = await sharp(j.master).metadata();
    const r = j.rect;
    if (r.left + r.width > meta.width || r.top + r.height > meta.height) { console.error(`window outside master: ${j.stem}`); process.exitCode = 1; continue; }
    const base = sharp(j.master).extract(r);
    const out = path.join(ROOT, j.dir);
    fs.mkdirSync(out, { recursive: true });
    for (const w of j.widths) {
      const f = path.join(out, `${j.stem}-${w}.avif`);
      await base.clone().resize({ width: w, kernel: 'lanczos3', withoutEnlargement: true }).avif(j.avif).toFile(f);
      total += fs.statSync(f).size; count++;
    }
    const last = j.fallbackWidth;
    const wf = path.join(out, `${j.stem}-${last}.webp`);
    await base.clone().resize({ width: last, kernel: 'lanczos3', withoutEnlargement: true }).webp(WEBP).toFile(wf);
    total += fs.statSync(wf).size; count++;
  }
  console.log(`Wrote ${count} files (${(total / 1024).toFixed(1)} KB)`);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { jobs };
