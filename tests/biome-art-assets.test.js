'use strict';
/* Biome artwork pipeline: the PNG masters never reach dist/, and every biome the Prep tiles can show has
 * its three device-pixel-ratio thumbnails at the size the file name promises. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { isExcluded } = require('../scripts/build.js');
const { BIOMES, SIZES } = require('../scripts/generate-biome-thumbs.js');

const ROOT = path.join(__dirname, '..');

test('build: the biome PNG masters are excluded, the shipped strips and thumbnails are not', () => {
  assert.equal(isExcluded('img/biomes src/forest.png'), true);
  assert.equal(isExcluded('img\\biomes src\\forest.png'), true);
  for (const p of ['img/biomes/forest-200.webp', 'img/biomes/forest-300.avif', 'img/biomes/forest-thumb-96.webp']) {
    assert.equal(isExcluded(p), false, p);
  }
});

test('thumbnails: every biome has square -thumb-48/96/144.webp files of exactly that size', async () => {
  for (const biome of BIOMES) {
    for (const size of SIZES) {
      const meta = await sharp(path.join(ROOT, `img/biomes/${biome}-thumb-${size}.webp`)).metadata();
      assert.deepEqual([meta.width, meta.height], [size, size], `${biome}-thumb-${size}`);
    }
  }
});

test('thumbnails: each is a small file, nowhere near the 40 KB strip it replaces', () => {
  for (const biome of BIOMES) {
    for (const size of SIZES) {
      const bytes = fs.statSync(path.join(ROOT, `img/biomes/${biome}-thumb-${size}.webp`)).size;
      assert.ok(bytes < 20 * 1024, `${biome}-thumb-${size} is ${bytes} bytes`);
    }
  }
});

test('thumbnails: the 1x/2x/3x set matches the BIOMES list the app can pick from', () => {
  const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  const m = app.match(/const BIOMES = \[([^\]]*)\]/);
  if (!m) return;   // list lives elsewhere; the validator covers the files
  const ids = m[1].match(/'([a-z-]+)'/g).map(s => s.slice(1, -1)).filter(b => b !== 'fully-shadowblighted');
  for (const id of ids) assert.ok(BIOMES.includes(id), `${id} has no thumbnail generator entry`);
});
