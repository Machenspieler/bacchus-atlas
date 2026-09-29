#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — generate-adversary-art.js
   Dev-only, offline image derivative generator for Session Prep's
   adversary artwork. Reads every unique original file directly under
   img/adversaries/session-prep/ (never the generated/ subdir itself) and
   writes two deterministically-named WebP derivatives per source:

     img/adversaries/session-prep/generated/thumbs/<source-stem>.webp
       — max 128x128 bounding box, for the ~48-64px picker thumbnail.
     img/adversaries/session-prep/generated/full/<source-stem>.webp
       — max 1536px long edge, for the large art overlay.

   Both preserve aspect ratio and transparency, never crop, never upscale
   (`fit: "inside"`, `withoutEnlargement: true`). Filenames are the source
   file's own stem, not a content hash — deterministic and stable run to
   run, and img/ is outside this project's asset-versioning scheme (only
   css/js/data are content-hashed; see scripts/lib/asset-versioning.js),
   so a stem-based name is consistent with how every other image in this
   project already ships (unversioned, cached by path). Several adversary
   ids intentionally share one group art file (see IMAGE_MAPPING in
   scripts/import-session-prep-adversaries.js) — since the mapping always
   points every one of them at the same source filename, they naturally
   resolve to the same generated derivative with no extra bookkeeping here.

   This script is dev-only tooling: it requires the `sharp` devDependency
   (see package.json — the only dependency this otherwise dependency-free
   static site has ever added, and only for local/offline image
   processing; nothing under dist/ or the runtime `js/`/`css/` references
   it). Never touches the network. Never resizes in the browser.

   Usage:
     node scripts/generate-adversary-art.js            # (re)generate all derivatives
     node scripts/generate-adversary-art.js --verify    # check existing derivatives only, writes nothing
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'img', 'adversaries', 'session-prep');
const OUT_DIR = path.join(SRC_DIR, 'generated');
const THUMBS_DIR = path.join(OUT_DIR, 'thumbs');
const FULL_DIR = path.join(OUT_DIR, 'full');

const SOURCE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const THUMB_BOX = 128;
const FULL_LONG_EDGE = 1536;

function listSourceFiles() {
  if (!fs.existsSync(SRC_DIR)) return [];
  return fs.readdirSync(SRC_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map(entry => entry.name)
    .sort();
}

function stemOf(filename) {
  return filename.slice(0, -path.extname(filename).length);
}

async function generate() {
  const sharp = require('sharp');
  fs.mkdirSync(THUMBS_DIR, { recursive: true });
  fs.mkdirSync(FULL_DIR, { recursive: true });

  const sources = listSourceFiles();
  let thumbsWritten = 0;
  let fullWritten = 0;

  for (const filename of sources) {
    const srcPath = path.join(SRC_DIR, filename);
    const stem = stemOf(filename);

    await sharp(srcPath)
      .resize({ width: THUMB_BOX, height: THUMB_BOX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(path.join(THUMBS_DIR, `${stem}.webp`));
    thumbsWritten++;

    await sharp(srcPath)
      .resize({ width: FULL_LONG_EDGE, height: FULL_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 92 })
      .toFile(path.join(FULL_DIR, `${stem}.webp`));
    fullWritten++;
  }

  console.log(`Processed ${sources.length} unique source image(s).`);
  console.log(`Wrote ${thumbsWritten} thumbnail(s) to ${path.relative(ROOT, THUMBS_DIR)}/`);
  console.log(`Wrote ${fullWritten} full-size derivative(s) to ${path.relative(ROOT, FULL_DIR)}/`);
}

/** Read-only check: every source has both derivatives on disk, and neither
 * derivative exceeds its target bounding box (a real resize bug, not a
 * missing-file bug). Exits non-zero on any problem; writes nothing. */
async function verify() {
  const sharp = require('sharp');
  const sources = listSourceFiles();
  const problems = [];

  for (const filename of sources) {
    const stem = stemOf(filename);
    const thumbPath = path.join(THUMBS_DIR, `${stem}.webp`);
    const fullPath = path.join(FULL_DIR, `${stem}.webp`);

    if (!fs.existsSync(thumbPath)) { problems.push(`Missing thumbnail for ${filename}`); continue; }
    if (!fs.existsSync(fullPath)) { problems.push(`Missing full image for ${filename}`); continue; }

    const thumbMeta = await sharp(thumbPath).metadata();
    if (thumbMeta.width > THUMB_BOX || thumbMeta.height > THUMB_BOX) {
      problems.push(`Thumbnail for ${filename} is ${thumbMeta.width}x${thumbMeta.height}, exceeds ${THUMB_BOX}x${THUMB_BOX}.`);
    }
    const fullMeta = await sharp(fullPath).metadata();
    if (Math.max(fullMeta.width, fullMeta.height) > FULL_LONG_EDGE) {
      problems.push(`Full image for ${filename} is ${fullMeta.width}x${fullMeta.height}, exceeds ${FULL_LONG_EDGE}px on the long edge.`);
    }
  }

  console.log(`Verified derivatives for ${sources.length} source image(s).`);
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):`);
    problems.forEach(p => console.error(`  - ${p}`));
    process.exitCode = 1;
    return;
  }
  console.log('All thumbnail/full derivatives present and within bounds.');
}

async function main() {
  const verifyOnly = process.argv.includes('--verify');
  try {
    if (verifyOnly) await verify();
    else await generate();
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { listSourceFiles, stemOf, SRC_DIR, OUT_DIR, THUMBS_DIR, FULL_DIR, THUMB_BOX, FULL_LONG_EDGE };
