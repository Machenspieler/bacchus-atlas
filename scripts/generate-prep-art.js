#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — generate-prep-art.js
   DEV-ONLY, offline. Cuts Session Prep's square thumbnails into img/prep-art/: for every picture
   in js/prep-art.js PICTURES that is in use (use 'all' or 'strong'), one square window of the
   master — `zoom` x its height on a side (default 1, the full height), left edge at x% and top
   edge at y% of the travel — resampled once to 48 / 96 / 144 px (WebP), the same ladder and format as
   img/biomes/<biome>-thumb-*.webp. 144 px is at most the window's pixels (941 px for a full-height
   archetype window, 1024 px for a painting), so nothing is ever upscaled. No sharpening, no
   denoise, no tint; masters are never modified and never shipped. Needs `sharp` (devDependency).
   Run: node scripts/generate-prep-art.js [outDir] [--all]  (default img/prep-art/; stale files are removed there).
   --all also cuts the rejected / deferred candidates (for the QA matrix; give it a docs/ folder, never img/prep-art/).
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Prep = require('../js/prep-art.js');
const { SOURCES } = require('./generate-list-covers.js');

const ROOT = path.join(__dirname, '..');
const WEBP = { quality: 86, effort: 6 };

/* The master of a picture: an archetype's from the list-cover generator, a painting's own JPEG. */
function masterOf(id) {
  if (id.startsWith('env:')) return `img/env/${id.slice(4)}.jpg`;
  return SOURCES[Prep.PICTURES[id].stem];
}

/** The pixel window of a master for one picture: a square, `zoom` x the height on a side. */
function windowFor(width, height, pic) {
  const side = Math.round(height * (pic.zoom || 1));
  return {
    left: Math.round(((pic.x == null ? 50 : pic.x) / 100) * (width - side)),
    top: Math.round(((pic.y == null ? 50 : pic.y) / 100) * (height - side)),
    width: side, height: side,
  };
}

async function main() {
  const args = process.argv.slice(2), all = args.includes('--all'), dir = args.find(a => !a.startsWith('--'));
  const out = path.resolve(dir || path.join(ROOT, 'img/prep-art'));
  fs.mkdirSync(out, { recursive: true });
  const wanted = new Set();
  let total = 0, count = 0;
  for (const [id, pic] of Object.entries(Prep.PICTURES)) {
    if (!all && !Prep.inUse(pic)) continue;
    const master = masterOf(id);
    const src = master && path.join(ROOT, master);
    if (!src || !fs.existsSync(src)) { console.error('missing master for ' + id); process.exitCode = 1; continue; }
    const meta = await sharp(src).metadata();
    const base = sharp(src).extract(windowFor(meta.width, meta.height, pic));
    for (const size of Prep.SIZES) {
      const f = `${pic.stem}-thumb-${size}.webp`; wanted.add(f);
      await base.clone().resize({ width: size, height: size, kernel: 'lanczos3' }).webp(WEBP).toFile(path.join(out, f));
      total += fs.statSync(path.join(out, f)).size; count++;
    }
  }
  for (const f of fs.readdirSync(out)) if (/\.webp$/.test(f) && !wanted.has(f)) fs.unlinkSync(path.join(out, f));
  console.log(`Wrote ${count} files to ${path.relative(ROOT, out)}/ (${(total / 1024).toFixed(0)} KB)`);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { masterOf, windowFor };
