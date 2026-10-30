#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — generate-list-covers.js
   DEV-ONLY, offline. Cuts the My Lists cover derivatives into img/list-covers/:
   one picture per biome (from the 1672x941 Journey masters in img/biome-artwork-source/)
   and one per thematic archetype (from the masters in img/cover-archetypes-source/).
   Needs `sharp` (devDependency); nothing here runs in the browser or in CI.

   Each picture is resampled ONCE from its master, whole frame, no crop — framing is the
   job of object-position at display time (js/list-cover-art.js). Widths 320 / 640 / 960 are
   the cover tile at 1x / 2x / 3x (a single tile is 318 CSS px; a third of the card is 105);
   AVIF carries the detail, one 640 WebP is the fallback for a browser that cannot decode it.
   Masters are never modified and never shipped (scripts/build.js excludes both folders).
   Run: node scripts/generate-list-covers.js [stem ...]   (no stems = every picture; stems = only those)
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'img/list-covers');

const WIDTHS = [320, 640, 960];
const AVIF = { quality: 52, effort: 6 };
const WEBP = { quality: 82, effort: 6 };

/* file name stem -> master, relative to the repo root. Keep in step with js/list-cover-art.js. */
const SOURCES = {
  'biome-aquatic': 'img/biome-artwork-source/Aquatic-h.png',
  'biome-badlands': 'img/biome-artwork-source/Badlands-h.png',
  'biome-drylands': 'img/biome-artwork-source/Drylands-h.png',
  'biome-forest': 'img/biome-artwork-source/forest_h.png',
  'biome-frozen': 'img/biome-artwork-source/frozen-h.png',
  'biome-grassland': 'img/biome-artwork-source/Grassland-h.png',
  'biome-mountain': 'img/biome-artwork-source/Mountain-h.png',
  'biome-rolling': 'img/biome-artwork-source/Rolling-h.png',
  'biome-settlement': 'img/biome-artwork-source/settlement-h.png',
  'biome-tropical': 'img/biome-artwork-source/Tropical-h.png',
  'biome-underground': 'img/biome-artwork-source/Underground-h.png',
  'biome-wetland': 'img/biome-artwork-source/Wetland-h.png',
  'archetype-haunted-and-deathly': 'img/cover-archetypes-source/haunted-and-deathly-landscape.png',
  'archetype-forgotten-ruins': 'img/cover-archetypes-source/forgotten-ruins-landscape.png',
  'archetype-arcane-sanctums': 'img/cover-archetypes-source/arcane-sanctums-landscape.png',
  'archetype-feasts-and-revelry': 'img/cover-archetypes-source/feasts-and-revelry-landscape.png',
  'archetype-storms-and-calamity': 'img/cover-archetypes-source/storms-and-calamity.png',
  'archetype-infernal-and-profane': 'img/cover-archetypes-source/infernal-and-profane.png',
  'archetype-drowned-depths': 'img/cover-archetypes-source/drowned-depths.png',
  'archetype-strongholds-and-sieges': 'img/cover-archetypes-source/strongholds-and-sieges.png',
  'archetype-monster-lairs': 'img/cover-archetypes-source/monster-lairs.png',
  'archetype-cursed-and-blighted-lands': 'img/cover-archetypes-source/cursed-and-blighted-lands.png',
  'archetype-fey-and-enchanted': 'img/cover-archetypes-source/fey-and-enchanted.png',
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let total = 0;
  let files = 0;
  const only = process.argv.slice(2);
  for (const [stem, master] of Object.entries(SOURCES)) {
    if (only.length && !only.includes(stem)) continue;
    const src = path.join(ROOT, master);
    if (!fs.existsSync(src)) { console.error('missing master: ' + master); process.exitCode = 1; continue; }
    for (const w of WIDTHS) {
      const base = sharp(src).resize({ width: w, kernel: 'lanczos3' });
      const avif = path.join(OUT, `${stem}-${w}.avif`);
      await base.clone().avif(AVIF).toFile(avif);
      total += fs.statSync(avif).size; files++;
      if (w === 640) {
        const webp = path.join(OUT, `${stem}-${w}.webp`);
        await base.clone().webp(WEBP).toFile(webp);
        total += fs.statSync(webp).size; files++;
      }
    }
  }
  console.log(`Wrote ${files} files to img/list-covers/ (${(total / 1024).toFixed(0)} KB)`);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { SOURCES, WIDTHS };
