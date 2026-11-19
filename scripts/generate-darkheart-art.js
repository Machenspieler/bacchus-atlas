#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — generate-darkheart-art.js
   DEV-ONLY, offline. Cuts every file js/darkheart-art.js promises from the masters in
   img/darkheart-art-source/ (never served; excluded from dist/ by scripts/build.js):
     outcome banners  — the master's whole 16:9 frame, AVIF at 640/1024/1672 + a 1024 WebP fallback
     ancestry portraits — the table's square `crop` window, WebP at 64/128/192 (1x/2x/3x of the 64 px circle)
   One Lanczos3 resample per file, no sharpening, no denoise, no stretch, never upscaled. Needs `sharp` (devDependency).
   Run: node scripts/generate-darkheart-art.js [outDir]   (default img/darkheart-art/)
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Art = require('../js/darkheart-art.js');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'img/darkheart-art-source');
const AVIF = { quality: 55, effort: 6 };
const WEBP_BANNER = { quality: 82, effort: 6 };
const WEBP_PORTRAIT = { quality: 88, effort: 6 };

async function main() {
  const out = path.resolve(process.argv[2] || path.join(ROOT, Art.DIR));
  fs.mkdirSync(out, { recursive: true });
  const keep = new Set();
  const write = async (name, pipeline) => { const f = path.join(out, name); await pipeline.toFile(f); keep.add(name); return fs.statSync(f).size; };
  let total = 0;
  for (const [id, o] of Object.entries(Art.OUTCOMES)) {
    const master = path.join(SRC, o.master);
    const meta = await sharp(master).metadata();
    if (meta.width !== o.width || meta.height !== o.height) throw new Error(`${o.master}: table says ${o.width}x${o.height}, file is ${meta.width}x${meta.height}`);
    for (const w of Art.OUTCOME_WIDTHS) total += await write(`outcome-${id}-${w}.avif`, sharp(master).resize({ width: w, kernel: 'lanczos3', withoutEnlargement: true }).avif(AVIF));
    total += await write(`outcome-${id}-${Art.OUTCOME_FALLBACK_WIDTH}.webp`, sharp(master).resize({ width: Art.OUTCOME_FALLBACK_WIDTH, kernel: 'lanczos3', withoutEnlargement: true }).webp(WEBP_BANNER));
  }
  for (const [id, a] of Object.entries(Art.ANCESTRIES)) {
    const master = path.join(SRC, a.master);
    const meta = await sharp(master).metadata();
    const c = a.crop;
    if (meta.width !== a.width || meta.height !== a.height) throw new Error(`${a.master}: size differs from the table`);
    if (c.left < 0 || c.top < 0 || c.left + c.size > meta.width || c.top + c.size > meta.height) throw new Error(`${a.master}: crop outside master`);
    const base = sharp(master).extract({ left: c.left, top: c.top, width: c.size, height: c.size });
    for (const s of Art.PORTRAIT_SIZES) total += await write(`ancestry-${id}-${s}.webp`, base.clone().resize({ width: s, height: s, kernel: 'lanczos3' }).webp(WEBP_PORTRAIT));
  }
  for (const f of fs.readdirSync(out)) if (!keep.has(f)) fs.unlinkSync(path.join(out, f));   // stale derivatives
  console.log(`${keep.size} files, ${(total / 1024).toFixed(0)} KiB`);
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
