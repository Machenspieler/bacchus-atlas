/* ============================================================
   Bacchus's Atlas — tests/prep-art.test.js
   Session Prep's context-adaptive 48px thumbnail (js/prep-art.js, PD-091): which picture an
   environment wears, that every cut exists and is a sharp square, that both Prep views read one
   function, and that nothing outside Session Prep moved. Run with:  node --test tests/prep-art.test.js
   ============================================================ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Prep = require('../js/prep-art.js');
const Catalog = require('../js/catalog-art.js');
const Art = require('../js/list-cover-art.js');
const { isExcluded } = require('../scripts/build.js');
const Gen = require('../scripts/generate-prep-art.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const APP_JS = read('js/app.js');
const ENVS = JSON.parse(read('data/environments.json')).environments;
const resolve = id => Prep.resolvePrepArt({ id });
const withPictures = (patch, fn) => {
  const saved = {};
  for (const k of Object.keys(patch)) { saved[k] = Prep.PICTURES[k]; if (patch[k] === undefined) delete Prep.PICTURES[k]; else Prep.PICTURES[k] = patch[k]; }
  try { return fn(); } finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete Prep.PICTURES[k]; else Prep.PICTURES[k] = saved[k]; } }
};
const functionText = (src, name) => { const s = src.indexOf('function ' + name + '('); return src.slice(s, src.indexOf('\n}\n', s) + 2); };

test('unique paintings keep priority and are cut from the painting itself', () => {
  for (const id of Art.UNIQUE_ENV_IDS) {
    const r = resolve(id);
    assert.deepEqual(r, { kind: 'unique', imageId: 'env:' + id, reason: 'own-painting' });
    assert.equal(Gen.masterOf('env:' + id), `img/env/${id}.jpg`);
  }
});

test('catalog / My Lists overrides are not read: harbour and semantic-crop environments follow Prep rules only', () => {
  for (const id of Object.keys(Art.ENV_IMAGE_OVERRIDES)) assert.notEqual(resolve(id).reason, 'explicit-override');
  for (const id of Object.keys(Art.SEMANTIC_OVERRIDES)) {
    const r = resolve(id);
    assert.ok(['thematic', 'biome'].includes(r.kind), id);
    if (r.kind === 'thematic') assert.ok(Prep.PICTURES[r.imageId].stem.startsWith('archetype-'), id);
  }
  assert.doesNotMatch(read('js/prep-art.js').replace(/\/\*[\s\S]*?\*\//g, ''), /ENV_IMAGE_OVERRIDES|SEMANTIC_OVERRIDES/);
});

test('a thematic picture is chosen only for an environment mapped to it in ARCHETYPE_FIT', () => {
  let thematic = 0;
  for (const e of ENVS) {
    const r = resolve(e.id);
    if (r.kind !== 'thematic') continue;
    thematic++;
    const fit = Art.ARCHETYPE_FIT[e.id];
    assert.ok(fit, `${e.id} has a fit`);
    assert.equal(r.imageId, Art.ARCHETYPES[fit[0]].variants[fit[2] || 0]);
  }
  assert.ok(thematic > 0);
  assert.deepEqual(resolve('harsh-desert'), { kind: 'biome', imageId: null, reason: 'no-fit' });
});

test('Prep suitability is its own gate: strong needs a strong fit, rejected and deferred pictures never draw', () => {
  for (const e of ENVS) {
    const fit = Art.ARCHETYPE_FIT[e.id], r = resolve(e.id);
    if (!fit || r.kind === 'unique') continue;
    const pic = Prep.PICTURES[Art.ARCHETYPES[fit[0]].variants[fit[2] || 0]];
    if (pic.use === 'rejected') assert.deepEqual(r, { kind: 'biome', imageId: null, reason: 'picture-fails-tile' }, e.id);
    if (pic.use === 'deferred') assert.equal(r.reason, 'picture-deferred', e.id);
    if (pic.use === 'strong') assert.equal(r.kind === 'thematic', fit[1] === 'strong', e.id);
    if (pic.use === 'all') assert.equal(r.kind, 'thematic', e.id);
  }
  // pinned negative examples
  assert.equal(resolve('time-loop').kind, 'biome');
  assert.equal(resolve('gang-hideout').kind, 'biome');
  assert.equal(resolve('dragons-lair').kind, 'biome');
  assert.equal(resolve('vampires-castle').reason, 'weak-picture-needs-strong-fit');
  assert.equal(resolve('heros-tomb').kind, 'thematic');
  // not reviewed -> never used; ENV_KEEP_BIOME beats an approved picture
  withPictures({ 'archetype:crypts-and-tombs': undefined }, () => assert.equal(resolve('heros-tomb').reason, 'picture-not-reviewed'));
  withPictures({ 'env:field-of-dreams': undefined }, () => assert.equal(resolve('field-of-dreams').kind, 'biome'));
  Prep.ENV_KEEP_BIOME['heros-tomb'] = 'test';
  try { assert.equal(resolve('heros-tomb').reason, 'environment-keeps-biome'); } finally { delete Prep.ENV_KEEP_BIOME['heros-tomb']; }
});

test('resolution is deterministic and safe on bad input', () => {
  for (const e of ENVS) assert.deepEqual(resolve(e.id), resolve(e.id));
  assert.equal(Prep.resolvePrepArt(null).kind, 'biome');
  assert.equal(Prep.resolvePrepArt({}).kind, 'biome');
  const art = { ...Art, ARCHETYPES: { ...Art.ARCHETYPES, 'crypts-and-tombs': { variants: ['archetype:nope'] } } };
  assert.equal(Prep.resolvePrepArt({ id: 'heros-tomb' }, art).reason, 'no-picture');
  assert.doesNotMatch(read('js/prep-art.js').replace(/\/\*[\s\S]*?\*\//g, ''), /Math\.random/);
});

test('every reviewed picture is a registry picture with a master, a note and a valid frame; none is dead', () => {
  const reachable = new Set(ENVS.map(e => resolve(e.id).imageId).filter(Boolean));
  assert.equal(Object.keys(Prep.PICTURES).filter(k => k.startsWith('archetype:')).length, 28, 'all 28 archetypes are judged');
  for (const [id, pic] of Object.entries(Prep.PICTURES)) {
    assert.ok(Art.IMAGES[id], `${id} is a js/list-cover-art.js picture`);
    assert.ok(['all', 'strong', 'rejected', 'deferred'].includes(pic.use), id);
    assert.ok(pic.note && pic.note.length > 8, `${id} records why`);
    assert.ok(pic.x >= 0 && pic.x <= 100, `${id} x`);
    if (pic.zoom != null) assert.ok(pic.zoom > 0.3 && pic.zoom <= 1, `${id} zoom`);
    assert.equal(pic.stem, id.startsWith('env:') ? 'env-' + id.slice(4) : 'archetype-' + id.slice(10));
    assert.ok(fs.existsSync(path.join(ROOT, Gen.masterOf(id))), `${id} master`);
    assert.equal(Prep.inUse(pic), reachable.has(id), `${id}: in use <=> reachable (no dead assets, no unapproved draws)`);
    if (!Prep.inUse(pic)) continue;
    assert.ok(isExcluded(Gen.masterOf(id)) || id.startsWith('env:'), `${id} master stays out of dist/`);
    for (const p of Prep.files(pic.stem).paths) { assert.ok(fs.existsSync(path.join(ROOT, p)), p); assert.equal(isExcluded(p), false, p); }
  }
  const wanted = new Set();
  for (const pic of Object.values(Prep.PICTURES)) if (Prep.inUse(pic)) Prep.files(pic.stem).paths.forEach(p => wanted.add(path.basename(p)));
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'img/prep-art')).sort(), [...wanted].sort());
});

test('every cut is an exact square at 48 / 96 / 144, never upscaled from its window (DPR 1-3 on the 48px tile)', async () => {
  const sharp = require('sharp');
  assert.deepEqual(Prep.SIZES, [48, 96, 144]);
  for (const [id, pic] of Object.entries(Prep.PICTURES)) {
    if (!Prep.inUse(pic)) continue;
    const m = await sharp(path.join(ROOT, Gen.masterOf(id))).metadata();
    const win = Gen.windowFor(m.width, m.height, pic);
    assert.equal(win.width, win.height, `${id} window is square`);
    assert.ok(win.left >= 0 && win.top >= 0 && win.left + win.width <= m.width && win.top + win.height <= m.height, `${id} window inside master`);
    for (const size of Prep.SIZES) {
      const meta = await sharp(path.join(ROOT, `img/prep-art/${pic.stem}-thumb-${size}.webp`)).metadata();
      assert.equal(meta.width, size); assert.equal(meta.height, size);
      assert.ok(size <= win.width, `${id}-${size} needs no upscaling (window ${win.width}px)`);
    }
  }
});

test('both Prep views read one function; srcset is the biome ladder; no stretching CSS', () => {
  const thumb = functionText(APP_JS, 'prepEnvThumbHtml');
  assert.match(thumb, /prepEnvThumbAttrs\(env\)/);
  assert.match(functionText(APP_JS, 'centralEnvCardHtml'), /prepEnvThumbAttrs\(env\)/);
  assert.match(functionText(APP_JS, 'prepEnvThumbAttrs'), /PrepArt\.resolvePrepArt/);
  const f = Prep.files('archetype-crypts-and-tombs');
  assert.equal(f.src, 'img/prep-art/archetype-crypts-and-tombs-thumb-48.webp');
  assert.equal(f.srcset, 'img/prep-art/archetype-crypts-and-tombs-thumb-96.webp 2x, img/prep-art/archetype-crypts-and-tombs-thumb-144.webp 3x');
  const css = read('css/styles.css');
  assert.match(css, /\.prep-thumb \{[^}]*width: 48px; height: 48px;[^}]*object-fit: cover/);
  assert.match(css, /\.prep-sel-thumb\[data-kind="env"\] img \{ object-fit: cover; \}/);
});

test('a thematic thumbnail that fails to load falls back to the biome, not to a broken image', () => {
  assert.match(APP_JS, /PREP_ART_FAILED\.add\(img\.dataset\.prepArt\)/);
  assert.match(APP_JS, /prepFell/);
  assert.match(functionText(APP_JS, 'prepEnvThumbAttrs'), /PREP_ART_FAILED\.has/);
});

test('adversary and item thumbnails, and every other page, are untouched', () => {
  for (const name of ['prepAdvThumbHtml', 'catalogArtHtml', 'biomeThumbAttrs']) assert.ok(functionText(APP_JS, name).length > 40, name);
  assert.doesNotMatch(functionText(APP_JS, 'catalogArtHtml'), /PrepArt/);
  for (const f of ['js/catalog-art.js', 'js/list-cover-art.js', 'js/list-cover-utils.js']) assert.doesNotMatch(read(f), /PrepArt|prep-art/, f);
  assert.doesNotMatch(read('js/journey2-view.js'), /PrepArt|prep-art/);
  // Catalog output pinned: 304 biome, 2 harbour override, 90 thematic, 3 painting, 5 crop
  const tally = {};
  for (const e of ENVS) { const k = Catalog.resolveCatalogArt(e).kind; tally[k] = (tally[k] || 0) + 1; }
  assert.deepEqual(tally, { biome: 304, override: 2, thematic: 90, unique: 3, crop: 5 });
});

test('index.html loads prep-art.js before app.js; the generated output is reproducible', async () => {
  const html = read('index.html');
  const at = n => html.indexOf(`<script src="js/${n}.js"`);
  assert.ok(at('prep-art') > at('list-cover-art') && at('prep-art') < at('app'));
  const sharp = require('sharp');
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prep-art-'));
  const pic = Prep.PICTURES['archetype:sky-realms'];
  const m = await sharp(path.join(ROOT, Gen.masterOf('archetype:sky-realms'))).metadata();
  await sharp(path.join(ROOT, Gen.masterOf('archetype:sky-realms'))).extract(Gen.windowFor(m.width, m.height, pic)).resize({ width: 48, height: 48, kernel: 'lanczos3' }).webp({ quality: 86, effort: 6 }).toFile(path.join(tmp, 'a.webp'));
  assert.deepEqual(fs.readFileSync(path.join(tmp, 'a.webp')), fs.readFileSync(path.join(ROOT, 'img/prep-art/archetype-sky-realms-thumb-48.webp')));
});
