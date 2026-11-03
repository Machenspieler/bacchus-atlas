/* ============================================================
   Bacchus's Atlas — tests/semantic-overrides.test.js
   The curated semantic artwork overrides (PD-090, docs/research/curated-semantic-artwork-overrides.md):
   six hand-approved environments wear a crop of an archetype master in the Catalog and / or My Lists.
   Pins the approved table, that rejected and deferred candidates stay untouched, per-context
   eligibility, priority, fallback, parent-image deduplication, the derivatives on disk, and that
   Session Prep and Journey never learn the crops exist.
   Run with:  node --test tests/semantic-overrides.test.js
   ============================================================ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Catalog = require('../js/catalog-art.js');
const Art = require('../js/list-cover-art.js');
const Utils = require('../js/list-cover-utils.js');
const { isExcluded } = require('../scripts/build.js');
const Gen = require('../scripts/generate-semantic-crops.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ENVS = JSON.parse(read('data/environments.json')).environments;
const artBiome = e => (e.biomes || []).find(b => b !== 'universal') || null;
const rec = id => ({ id, artBiome: artBiome(ENVS.find(e => e.id === id) || {}) });
const NO_CROPS = { ...Art, SEMANTIC_OVERRIDES: {} };
const cat = (id, art) => Catalog.resolveCatalogArt({ id }, art);
const lists = (id, art) => Utils.resolveEnvironmentArt(rec(id), art);
const cover = (...ids) => Utils.coverForEnvironments(ids.map(rec), Art);
const tiles = (...ids) => cover(...ids).tiles.map(t => t.imageId);

const APPROVED = {
  'bustling-marketplace': ['market-stalls', ['catalog', 'lists']],
  'city-festival': ['market-stalls', ['catalog', 'lists']],
  'resting-dagger-inn': ['tavern-terrace', ['catalog', 'lists']],
  'the-dungeoneer': ['bar-counter', ['catalog', 'lists']],
  'chapel-of-st-brenna': ['statue-altar', ['catalog']],
  'garden-of-the-tranquil-order': ['lotus-pool', ['lists']],
};
/* Final review verdicts that are NOT overrides: every one keeps exactly the artwork it had. */
const REJECTED = ['chthon-verlies', 'gang-hideout', 'pitched-battle'];
const DEFERRED = ['heist', 'murder-mystery'];

test('1. the approved table is exactly the six reviewed environments, each with an explicit crop and contexts', () => {
  assert.deepEqual(Object.keys(Art.SEMANTIC_OVERRIDES).sort(), Object.keys(APPROVED).sort());
  for (const [id, [crop, contexts]] of Object.entries(APPROVED)) {
    assert.deepEqual(Art.SEMANTIC_OVERRIDES[id], { crop, contexts }, id);
    assert.ok(ENVS.some(e => e.id === id), id + ' is a real environment');
  }
});

test('2. an approved environment resolves to its crop in each authorised context, deterministically', () => {
  for (const [id, [crop, contexts]] of Object.entries(APPROVED)) {
    if (contexts.includes('catalog')) assert.deepEqual(cat(id), { kind: 'crop', imageId: 'crop:' + crop, reason: 'semantic-override' }, id);
    if (contexts.includes('lists')) assert.equal(lists(id).imageId, 'crop:' + crop, id);
    assert.deepEqual(cat(id), cat(id));
    assert.deepEqual(lists(id), lists(id));
  }
});

test('3. rejected and deferred candidates keep exactly their previous artwork', () => {
  for (const id of [...REJECTED, ...DEFERRED]) {
    assert.ok(ENVS.some(e => e.id === id), id);
    assert.equal(Art.SEMANTIC_OVERRIDES[id], undefined, id);
    assert.deepEqual(cat(id), cat(id, NO_CROPS), id);
    assert.deepEqual(lists(id), lists(id, NO_CROPS), id);
    assert.notEqual(cat(id).kind, 'crop');
  }
  assert.equal(cat('chthon-verlies').kind, 'biome', 'the crystal strip stays');
});

test('4. context eligibility: Catalog-only and My Lists-only crops stay in their context', () => {
  assert.equal(cat('chapel-of-st-brenna').kind, 'crop');
  assert.equal(lists('chapel-of-st-brenna'), null, 'a tall statue fails the 3.5:1 band: no My Lists picture');
  assert.equal(cat('garden-of-the-tranquil-order').kind, 'biome', 'a 3.5:1 pool fails the 1:3 strip');
  assert.equal(lists('garden-of-the-tranquil-order').imageId, 'crop:lotus-pool');
  assert.ok(!Art.IMAGES['crop:statue-altar'], 'no My Lists picture exists for a Catalog-only crop');
  assert.ok(!Catalog.PICTURES['crop:lotus-pool'], 'no Catalog strip exists for a My Lists-only crop');
});

test('5. a missing derivative falls back to what the environment wore before, never to a broken image', () => {
  const withoutPicture = id => ({ ...Art, IMAGES: Object.fromEntries(Object.entries(Art.IMAGES).filter(([k]) => k !== id)) });
  assert.equal(lists('bustling-marketplace', withoutPicture('crop:market-stalls')).imageId, 'archetype:streets-and-towns');
  assert.equal(lists('the-dungeoneer', withoutPicture('crop:bar-counter')).imageId, 'biome:underground');
  assert.equal(lists('garden-of-the-tranquil-order', withoutPicture('crop:lotus-pool')), null);
  const saved = Catalog.PICTURES['crop:market-stalls'];
  delete Catalog.PICTURES['crop:market-stalls'];
  try {
    assert.equal(cat('bustling-marketplace').imageId, 'archetype:streets-and-towns');
    assert.equal(cat('city-festival').kind, 'biome');
  } finally { Catalog.PICTURES['crop:market-stalls'] = saved; }
  const none = { ...Art, SEMANTIC_OVERRIDES: { 'bustling-marketplace': { crop: 'no-such-crop', contexts: ['catalog', 'lists'] } } };
  assert.equal(cat('bustling-marketplace', none).imageId, 'archetype:streets-and-towns');
  assert.equal(lists('bustling-marketplace', none).imageId, 'archetype:streets-and-towns');
});

test('6. priority: a unique painting and an explicit override always beat a crop', () => {
  const greedy = { ...Art, SEMANTIC_OVERRIDES: {
    'cauldera-valley': { crop: 'market-stalls', contexts: ['catalog', 'lists'] },
    'port-city': { crop: 'market-stalls', contexts: ['catalog', 'lists'] },
    'raiding-party': { crop: 'market-stalls', contexts: ['catalog', 'lists'] } } };
  for (const id of Art.UNIQUE_ENV_IDS) {
    const g = { ...Art, SEMANTIC_OVERRIDES: { [id]: { crop: 'market-stalls', contexts: ['catalog', 'lists'] } } };
    assert.equal(cat(id, g).kind, 'unique', id); assert.equal(lists(id, g).imageId, 'env:' + id, id);
  }
  assert.equal(cat('port-city', greedy).kind, 'override'); assert.equal(lists('port-city', greedy).imageId, 'biome:settlement');
  assert.equal(cat('raiding-party', greedy).kind, 'override');
  /* and a crop beats the archetype fit it was reviewed against, which stays untouched */
  assert.deepEqual(Art.ARCHETYPE_FIT['bustling-marketplace'], ['streets-and-towns', 'strong']);
  assert.deepEqual(Art.ARCHETYPE_FIT['resting-dagger-inn'], ['streets-and-towns', 'strong']);
  assert.equal(Object.keys(Art.ARCHETYPE_FIT).length, 117);
  assert.deepEqual(Art.ENV_IMAGE_OVERRIDES, { 'port-city': 'biome:settlement', 'raiding-party': 'biome:settlement' });
  assert.deepEqual(Art.UNIQUE_ENV_IDS, ['cauldera-valley', 'field-of-dreams', 'ouroborean-pass']);
});

test('7. no environment without an override changes, in either context', () => {
  for (const e of ENVS) {
    if (Art.SEMANTIC_OVERRIDES[e.id]) continue;
    assert.deepEqual(cat(e.id), cat(e.id, NO_CROPS), e.id);
    assert.deepEqual(lists(e.id), lists(e.id, NO_CROPS), e.id);
  }
});

test('8. every crop has a stable parent artwork identity that is a registered archetype picture', () => {
  const crops = Object.values(Art.IMAGES).filter(i => i.kind === 'crop');
  assert.equal(crops.length, 4);
  for (const c of crops) {
    assert.ok(c.id.startsWith('crop:'), c.id);
    assert.ok(Art.IMAGES[c.parent] && Art.IMAGES[c.parent].kind === 'archetype', `${c.id} parent ${c.parent}`);
  }
  assert.deepEqual(crops.map(c => [c.id, c.parent]).sort(), [
    ['crop:bar-counter', 'archetype:taverns-and-inns'], ['crop:lotus-pool', 'archetype:sacred-sanctuaries'],
    ['crop:market-stalls', 'archetype:streets-and-towns'], ['crop:tavern-terrace', 'archetype:streets-and-towns'],
  ]);
  for (const [name, w] of Object.entries(Art.CROP_CATALOG_WINDOWS)) assert.ok(Art.ARCHETYPES[w.master], `${name} master is an archetype`);
});

test('9. My Lists deduplicates by parent artwork: a cover never shows two cuts of one illustration', () => {
  /* two different crops of Streets & Towns -> one tile */
  assert.equal(Art.IMAGES['crop:market-stalls'].parent, Art.IMAGES['crop:tavern-terrace'].parent);
  assert.equal(cover('bustling-marketplace', 'resting-dagger-inn').layout, 1);
  assert.equal(cover('bustling-marketplace', 'resting-dagger-inn').tiles[0].count, 2);
  /* two environments, one crop -> one tile */
  assert.deepEqual(tiles('bustling-marketplace', 'city-festival'), ['crop:market-stalls']);
  /* a crop and the whole parent picture -> one tile, the picture most members resolved to */
  assert.deepEqual(tiles('bustling-marketplace', 'emberwood-village', 'outpost-town'), ['archetype:streets-and-towns']);
  assert.deepEqual(tiles('bustling-marketplace', 'emberwood-village'), ['crop:market-stalls'], 'a tie goes to the more specific crop');
  assert.equal(cover('bustling-marketplace', 'emberwood-village', 'outpost-town').tiles[0].count, 3);
  /* a unique painting plus a crop: both, painting first by catalogue order of its first member */
  assert.deepEqual(new Set(tiles('field-of-dreams', 'the-dungeoneer')), new Set(['env:field-of-dreams', 'crop:bar-counter']));
  /* two unrelated parents: both */
  assert.deepEqual(new Set(tiles('bustling-marketplace', 'the-dungeoneer', 'garden-of-the-tranquil-order')),
    new Set(['crop:market-stalls', 'crop:bar-counter', 'crop:lotus-pool']));
  /* a crop that exists only for the Catalog adds no tile */
  assert.equal(cover('chapel-of-st-brenna').layout, 0);
  /* no cover ever holds two pictures of one parent */
  const ids = Object.keys(Art.SEMANTIC_OVERRIDES).concat(['emberwood-village', 'outpost-town', 'local-tavern', 'hallowed-temple', 'teal-heart-inn']);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) for (let k = j + 1; k < ids.length; k++) {
    const t = cover(ids[i], ids[j], ids[k]).tiles.map(x => Art.IMAGES[x.imageId]);
    const parents = t.map(x => x.parent || x.id);
    assert.equal(new Set(parents).size, parents.length, [ids[i], ids[j], ids[k]].join());
  }
});

test('10. the cover is otherwise unchanged: at most three tiles, deterministic, same order whatever the member order', () => {
  assert.equal(Utils.COVER_MAX, 3);
  const all = ['bustling-marketplace', 'the-dungeoneer', 'garden-of-the-tranquil-order', 'hallowed-temple', 'planetary-blockade', 'local-tavern'];
  assert.equal(cover(...all).layout, 3);
  assert.deepEqual(cover(...all), cover(...all));
  /* a list with no crop environment is byte-identical to the pre-PD-090 cover */
  const plain = ['hallowed-temple', 'planetary-blockade', 'local-tavern', 'ocean-voyage'];
  assert.deepEqual(Utils.coverForEnvironments(plain.map(rec), Art), Utils.coverForEnvironments(plain.map(rec), NO_CROPS));
  assert.deepEqual(Utils.BASE_SCORE, { unique: 100, 'archetype:strong': 60, 'archetype:acceptable': 50, biome: 40 });
});

test('11. the derivatives exist where the registry says, at the declared widths, never upscaled', async () => {
  const sharp = require('sharp');
  for (const j of Gen.jobs()) {
    const meta = await sharp(j.master).metadata();
    assert.ok(j.rect.left + j.rect.width <= meta.width && j.rect.top + j.rect.height <= meta.height, j.stem + ' window inside the master');
    for (const w of j.widths) {
      const f = path.join(ROOT, j.dir, `${j.stem}-${w}.avif`);
      const m = await sharp(f).metadata();
      assert.equal(m.width, w, f);
      assert.ok(w <= j.rect.width, `${f} is not upscaled from its ${j.rect.width}px window`);
      assert.ok(Math.abs(m.height / m.width - j.rect.height / j.rect.width) < 0.01, `${f} keeps the window's aspect`);
    }
    assert.ok(fs.existsSync(path.join(ROOT, j.dir, `${j.stem}-${j.fallbackWidth}.webp`)), j.stem + ' fallback');
  }
});

test('12. Catalog strips are 1:3 windows and cover DPR 2 (190 px) wherever the window holds it', () => {
  for (const [name, w] of Object.entries(Art.CROP_CATALOG_WINDOWS)) {
    assert.ok(Math.abs(w.height / w.width - 3) < 0.15, `${name} is 1:3 (${w.width}x${w.height})`);
    assert.deepEqual(w.widths, [100, 200, 250].filter(x => x <= w.width), `${name} ladder stops at the window`);
    assert.ok(w.widths.includes(200), `${name} has a 200 px cut for DPR 2 (190 px)`);
    const pic = Catalog.PICTURES['crop:' + name];
    assert.deepEqual(pic.widths, w.widths); assert.equal(pic.stem, 'crop-' + name); assert.equal(pic.use, 'all');
    const f = Catalog.files(pic.stem, pic.widths);
    assert.equal(f.fallback, `img/catalog-art/crop-${name}-200.webp`);
    for (const p of [...f.avif.map(a => a.path), f.fallback]) assert.ok(fs.existsSync(path.join(ROOT, p)), p);
  }
});

test('13. My Lists derivatives: 640 px (DPR 2 of the 318 px band) where the window holds it, the whole window otherwise', () => {
  for (const c of Object.values(Art.IMAGES).filter(i => i.kind === 'crop')) {
    const top = c.avif[c.avif.length - 1].w;
    assert.equal(top, Math.min(640, c.rect.width), c.id);
    assert.equal(c.avif[0].w, 320);
    assert.ok(c.fallback.endsWith(`-${top}.webp`));
    for (const n of [1, 2, 3]) { const p = c.pos[n]; assert.ok(p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100, c.id); }
    for (const a of c.avif) assert.ok(fs.statSync(path.join(ROOT, a.path)).size < 120 * 1024, a.path + ' stays light');
  }
});

test('14. the build ships the derivatives and never a master', () => {
  for (const j of Gen.jobs()) {
    assert.equal(isExcluded(path.relative(ROOT, j.master)), true, j.master);
    for (const w of j.widths) assert.equal(isExcluded(`${j.dir}/${j.stem}-${w}.avif`), false);
  }
  assert.ok(Gen.jobs().length === 4 + 4);
});

test('15. language never influences the choice', () => {
  assert.deepEqual(Catalog.resolveCatalogArt({ id: 'city-festival', name: { en: 'x' } }), Catalog.resolveCatalogArt({ id: 'city-festival', name: { ru: 'y' } }));
  assert.doesNotMatch(read('js/catalog-art.js') + read('js/list-cover-art.js') + read('js/list-cover-utils.js'), /state\.lang|localStorage/);
});

test('16. Session Prep and Journey never learn the crops exist, and the app wires the fallback', () => {
  const app = read('js/app.js');
  const fn = (name, end) => app.slice(app.indexOf('function ' + name + '('), app.indexOf('function ' + end + '('));
  const prep = fn('prepEnvThumbHtml', 'envPickerRowHtml');
  assert.ok(!/crop|SEMANTIC|CatalogArt|ListCoverArt|archetype/i.test(prep), 'Prep still draws only the biome thumbnail');
  for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(n => /^(journey2|prep)/.test(n))) assert.doesNotMatch(read('js/' + f), /SEMANTIC_OVERRIDES|crop:/, f);
  assert.doesNotMatch(read('css/journey2.css'), /crop-/);
  assert.match(app, /bindCropFallback\(document\);\nbindCoverFallback\(document\);/, 'the crop fallback runs before the tile-removing one');
  assert.match(app, /Catalog.resolveCatalogArt\(env, ART_RUNTIME\)|CatalogArt\.resolveCatalogArt\(env, ART_RUNTIME\)/);
  assert.match(app, /coverForEnvironments\(\s*members\.map[^)]*\)[^;]*ART_RUNTIME/s);
});
