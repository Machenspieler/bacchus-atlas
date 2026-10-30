/* ============================================================
   Bacchus's Atlas — tests/list-cover-art.test.js
   Integrity of the My Lists cover registry (js/list-cover-art.js): every picture it
   names exists and ships, every environment it names is in the catalogue, the shipped
   covers and the production artwork stay in step. Run with:
     node --test tests/list-cover-art.test.js
   ============================================================ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Art = require('../js/list-cover-art.js');
const { isExcluded } = require('../scripts/build.js');
const { SOURCES } = require('../scripts/generate-list-covers.js');

const ROOT = path.join(__dirname, '..');
const APP_JS = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const ENV_IDS = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/environments.json'), 'utf8')).environments.map(e => e.id));
const CATALOG_BIOMES = ['aquatic', 'badlands', 'drylands', 'forest', 'frozen', 'grassland', 'mountain', 'rolling', 'settlement', 'tropical', 'underground', 'universal', 'wetland'];

test('every picture has files on disk, inside dist/, and a complete framing for all three layouts', () => {
  for (const img of Object.values(Art.IMAGES)) {
    assert.ok(img.avif.length >= 2, `${img.id} has a srcset ladder`);
    for (const f of [...img.avif.map(a => a.path), img.fallback]) {
      assert.ok(fs.existsSync(path.join(ROOT, f)), `${img.id}: ${f} exists`);
      assert.equal(isExcluded(f), false, `${f} must ship`);
    }
    assert.ok(img.fallback.endsWith('.webp'));
    for (const layout of [1, 2, 3]) {
      const p = img.pos[layout];
      assert.ok(p && p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100, `${img.id} layout ${layout}`);
    }
  }
});

test('the image id matches its kind, and the srcset widths are strictly increasing', () => {
  for (const [id, img] of Object.entries(Art.IMAGES)) {
    assert.equal(img.id, id);
    assert.ok(id.startsWith({ unique: 'env:', archetype: 'archetype:', biome: 'biome:' }[img.kind]), id);
    const w = img.avif.map(a => a.w);
    assert.deepEqual(w, [...w].sort((a, b) => a - b));
    assert.equal(new Set(w).size, w.length);
  }
});

test('every shipped cover file is under 300 KB, and no PNG master ships in img/list-covers', () => {
  for (const img of Object.values(Art.IMAGES)) {
    for (const a of img.avif) {
      const size = fs.statSync(path.join(ROOT, a.path)).size;
      assert.ok(size < 300 * 1024, `${a.path} is ${size} bytes`);
    }
  }
  assert.equal(fs.readdirSync(path.join(ROOT, 'img/list-covers')).filter(f => f.endsWith('.png')).length, 0);
});

test('every cover derivative on disk is registered, and the generator and registry agree on the stems', () => {
  const stems = new Set(Object.values(Art.IMAGES).filter(i => i.kind !== 'unique').map(i => i.fallback.replace(/^img\/list-covers\//, '').replace(/-640\.webp$/, '')));
  assert.deepEqual([...stems].sort(), Object.keys(SOURCES).sort());
  for (const f of fs.readdirSync(path.join(ROOT, 'img/list-covers'))) {
    const stem = f.replace(/-\d+\.(avif|webp)$/, '');
    assert.ok(stems.has(stem), `${f} has no registry entry`);
  }
  for (const master of Object.values(SOURCES)) {
    assert.ok(fs.existsSync(path.join(ROOT, master)), `master ${master}`);
    assert.equal(isExcluded(master), true, `${master} must stay out of dist/`);
  }
});

test('unique paintings: registry, ENV_ART and ENV_ART_FOCUS in js/app.js name the same environments and framing', () => {
  const block = APP_JS.match(/const ENV_ART = new Set\(\[([\s\S]*?)\]\)/)[1];
  const appIds = [...block.matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.deepEqual([...Art.UNIQUE_ENV_IDS].sort(), appIds.sort());
  const focus = Object.fromEntries([...APP_JS.match(/const ENV_ART_FOCUS = \{([\s\S]*?)\}/)[1].matchAll(/'([^']+)': '(\d+)%'/g)].map(m => [m[1], +m[2]]));
  for (const id of Art.UNIQUE_ENV_IDS) {
    assert.ok(ENV_IDS.has(id), id);
    assert.equal(Art.IMAGES['env:' + id].pos[1].y, focus[id] === undefined ? 50 : focus[id], `${id} focus`);
  }
});

test('archetype fit: real environments, real archetypes, valid fit grades, no duplicates', () => {
  for (const [envId, [arch, fit, variant]] of Object.entries(Art.ARCHETYPE_FIT)) {
    assert.ok(ENV_IDS.has(envId), `${envId} is in the catalogue`);
    assert.ok(Art.ARCHETYPES[arch], `${envId}: archetype ${arch}`);
    assert.ok(['strong', 'acceptable'].includes(fit), `${envId}: fit ${fit}`);
    assert.ok(Art.IMAGES[Art.ARCHETYPES[arch].variants[variant || 0]], `${envId}: variant`);
  }
  for (const a of Object.values(Art.ARCHETYPES)) {
    for (const id of a.variants) assert.equal(Art.IMAGES[id].kind, 'archetype');
  }
});

test('the misleading matches the audit rejected stay out of ARCHETYPE_FIT', () => {
  for (const id of ['deserted-moor', 'haunted-mountain-pass', 'wispy-wasteland', 'valley-of-death', 'realm-of-the-dead',
    'lost-village', 'swamp-ruins', 'titan-boneyard', 'arcane-laboratory', 'arcane-magic-shop',
    'local-festival', 'town-festival', 'city-festival', 'forced-penance']) {
    assert.equal(Art.ARCHETYPE_FIT[id], undefined, id);
  }
});

test('biome pictures: only known biomes, none for universal, settlement only by explicit override', () => {
  for (const [b, id] of Object.entries(Art.BIOME_IMAGES)) {
    assert.ok(CATALOG_BIOMES.includes(b), b);
    assert.equal(Art.IMAGES[id].kind, 'biome');
  }
  assert.equal(Art.BIOME_IMAGES.universal, undefined);
  assert.deepEqual(Art.EXPLICIT_ONLY_BIOMES, ['settlement']);
  for (const [envId, imageId] of Object.entries(Art.ENV_IMAGE_OVERRIDES)) {
    assert.ok(ENV_IDS.has(envId), envId);
    assert.ok(Art.IMAGES[imageId], imageId);
  }
});

test('index.html loads the registry and the rules before js/app.js, and app.js has no list of its own', () => {
  const art = INDEX_HTML.indexOf('src="js/list-cover-art.js"');
  const utils = INDEX_HTML.indexOf('src="js/list-cover-utils.js"');
  const app = INDEX_HTML.indexOf('src="js/app.js"');
  assert.ok(art !== -1 && art < utils && utils < app);
  assert.match(INDEX_HTML.slice(art, art + 80), /data-cache-version="ui"/);
  assert.match(APP_JS, /ListCoverUtils\.coverForEnvironments/);
  assert.doesNotMatch(APP_JS, /ENV_THUMB_WIDTHS|listsCoveredFirst/);
});
