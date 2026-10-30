'use strict';
/* Lab-only biome cover registry (docs/research/biome-cover-registry.json): production never reads it, but the
 * research conclusions stand on it, so its paths, crops and the build rules it assumes must stay true. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { isExcluded } = require('../scripts/build.js');

const ROOT = path.join(__dirname, '..');
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/research/biome-cover-registry.json'), 'utf8'));
const CTX = ['listsHero', 'listsPanel2', 'listsPanel3'];

test('registry: all 13 catalog biomes, each with a preferred source it actually has', () => {
  assert.equal(REG.biomes.length, 13);
  for (const r of REG.biomes) {
    assert.ok(r.sources[r.preferredHeroSource], `${r.biome} hero source`);
    assert.ok(r.sources[r.preferredCollageSource], `${r.biome} collage source`);
  }
});

test('registry: every listed file exists; shipped ones are in dist, lab ones are not', () => {
  for (const r of REG.biomes) {
    for (const [kind, s] of Object.entries(r.sources)) {
      assert.ok(fs.existsSync(path.join(ROOT, s.path)), `${r.biome}/${kind}: ${s.path}`);
      if (s.shipped) assert.equal(isExcluded(s.path), false, `${s.path} must stay in dist/`);
      if (s.lab) assert.ok(s.path.startsWith('.claude/'), `${s.path} is lab-only`);
      if (s.master) {
        assert.ok(fs.existsSync(path.join(ROOT, s.master)), `${r.biome}/${kind} master: ${s.master}`);
        assert.equal(isExcluded(s.master), true, `${s.master} must stay out of dist/`);
      }
    }
  }
});

test('registry: crops cover every context for the sources a context prefers, within 0-100', () => {
  for (const r of REG.biomes) {
    for (const c of CTX) {
      const kind = c === 'listsHero' ? r.preferredHeroSource : r.preferredCollageSource;
      const crop = r.crops[c][kind];
      assert.ok(crop, `${r.biome}/${c}/${kind}`);
      for (const v of [crop.x, crop.y]) assert.ok(v >= 0 && v <= 100, `${r.biome}/${c}`);
    }
  }
});

test('registry: the only biome without a Journey header is universal', () => {
  const none = REG.biomes.filter(r => !r.sources.journey).map(r => r.biome);
  assert.deepEqual(none, ['universal']);
});
