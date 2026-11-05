/* ============================================================
   Bacchus's Atlas — tests/catalog-art.test.js
   The Catalog's context-adaptive strip (js/catalog-art.js, PD-089): which picture a card
   wears, that every cut exists and is a sharp 1:3 strip, and that nothing outside the
   Catalog moved. Run with:  node --test tests/catalog-art.test.js
   ============================================================ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Catalog = require('../js/catalog-art.js');
const Art = require('../js/list-cover-art.js');
const CoverUtils = require('../js/list-cover-utils.js');
const { isExcluded } = require('../scripts/build.js');
const Gen = require('../scripts/generate-catalog-art.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const APP_JS = read('js/app.js');
const ENVS = JSON.parse(read('data/environments.json')).environments;
const resolve = id => Catalog.resolveCatalogArt({ id });
const withPictures = (patch, fn) => {
  const saved = {};
  for (const k of Object.keys(patch)) { saved[k] = Catalog.PICTURES[k]; if (patch[k] === undefined) delete Catalog.PICTURES[k]; else Catalog.PICTURES[k] = patch[k]; }
  try { return fn(); } finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete Catalog.PICTURES[k]; else Catalog.PICTURES[k] = saved[k]; } }
};
const functionText = (src, name) => { const s = src.indexOf('function ' + name + '('); return src.slice(s, src.indexOf('\n}\n', s) + 2); };

test('1. unique paintings keep priority over every other source', () => {
  for (const id of Art.UNIQUE_ENV_IDS) {
    const r = resolve(id);
    assert.equal(r.kind, 'unique'); assert.equal(r.imageId, 'env:' + id);
  }
});

test('2. explicit overrides keep priority over a fit and the biome (the harbour strip)', () => {
  for (const [id, img] of Object.entries(Art.ENV_IMAGE_OVERRIDES)) {
    const r = resolve(id);
    assert.equal(r.kind, 'override'); assert.equal(r.imageId, img);
  }
});

test('3. a thematic picture is chosen only for an environment mapped to it in ARCHETYPE_FIT', () => {
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
  // an environment with only a taxonomy archetype and no fit keeps its biome
  assert.deepEqual(resolve('harsh-desert'), { kind: 'biome', imageId: null, reason: 'no-fit' });
});

test('4. context suitability is enforced: "strong" pictures need a strong fit, "none" pictures are never drawn', () => {
  for (const e of ENVS) {
    const fit = Art.ARCHETYPE_FIT[e.id]; if (!fit) continue;
    if (Art.SEMANTIC_OVERRIDES[e.id]) continue; // PD-090: covered by tests/semantic-overrides.test.js
    const r = resolve(e.id); const pic = Catalog.PICTURES[Art.ARCHETYPES[fit[0]].variants[fit[2] || 0]];
    if (!pic || pic.use === 'none') assert.equal(r.kind, 'biome', `${e.id}: a picture that fails the strip is never drawn`);
    else if (pic.use === 'strong') assert.equal(r.kind === 'thematic', fit[1] === 'strong', `${e.id}: strong-only picture`);
    else assert.equal(r.kind, 'thematic', `${e.id}: approved picture`);
  }
});

test('5. ambiguous cases keep the baseline biome: Time Loop, Dragon\'s Lair, acceptable fits of weak pictures', () => {
  for (const id of ['time-loop', 'time-loop-atlas']) assert.equal(resolve(id).reason, 'picture-fails-strip');
  assert.equal(resolve('dragons-lair').kind, 'biome');
  assert.equal(resolve('haunted-city').reason, 'weak-picture-needs-strong-fit');
  assert.equal(resolve('cursed-graveyard').kind, 'thematic'); // the strong fit of the same dark picture is used
});

test('6. a rejected or unreviewed picture cannot be selected, whatever the fit says', () => {
  withPictures({ 'archetype:crypts-and-tombs': { ...Catalog.PICTURES['archetype:crypts-and-tombs'], use: 'none' } }, () => {
    assert.equal(resolve('heros-tomb').reason, 'picture-fails-strip');
  });
  withPictures({ 'archetype:crypts-and-tombs': undefined }, () => {
    assert.equal(resolve('heros-tomb').reason, 'picture-not-reviewed');
  });
  withPictures({ 'env:field-of-dreams': undefined }, () => {
    assert.equal(resolve('field-of-dreams').kind, 'biome');
  });
});

test('7. the biome strip stays available: every non-thematic result tells the app to draw it', () => {
  for (const e of ENVS) {
    const r = resolve(e.id);
    assert.ok(['unique', 'override', 'crop', 'thematic', 'biome'].includes(r.kind));
    if (r.kind === 'biome') assert.equal(r.imageId, null);
    else assert.ok(r.imageId);
  }
  assert.match(functionText(APP_JS, 'catalogArtHtml'), /art\.kind === 'biome'\) return biomeArtHtml\(env\)/);
});

test('8. a picture the registry does not know falls back safely, an empty argument too', () => {
  const art = { ...Art, ARCHETYPES: { ...Art.ARCHETYPES, 'crypts-and-tombs': { variants: ['archetype:nope'] } } };
  assert.equal(Catalog.resolveCatalogArt({ id: 'heros-tomb' }, art).reason, 'no-picture');
  assert.equal(Catalog.resolveCatalogArt(null).kind, 'biome');
  assert.equal(Catalog.resolveCatalogArt({}).kind, 'biome');
});

test('9. every approved picture is a registry picture, has a master, cut paths and a note; nothing is cut that cannot be drawn', () => {
  const reachable = new Set(ENVS.map(e => resolve(e.id).imageId).filter(Boolean));
  for (const [id, pic] of Object.entries(Catalog.PICTURES)) {
    if (id.startsWith('crop:')) continue; // semantic crops: tests/semantic-overrides.test.js
    assert.ok(Art.IMAGES[id], `${id} is a js/list-cover-art.js picture`);
    assert.ok(['all', 'strong', 'none'].includes(pic.use), id);
    assert.ok(pic.note && pic.note.length > 8, `${id} records why`);
    assert.ok(Number.isInteger(pic.x) && pic.x >= 0 && pic.x <= 100, `${id} x`);
    assert.equal(pic.stem, id.startsWith('env:') ? 'env-' + id.slice(4) : 'archetype-' + id.slice(10));
    if (pic.use === 'none') { assert.equal(reachable.has(id), false); continue; }
    assert.ok(reachable.has(id), `${id} is used by at least one environment (no dead assets)`);
    assert.ok(fs.existsSync(path.join(ROOT, Gen.masterOf(id))), `${id} master`);
    assert.ok(isExcluded(Gen.masterOf(id)) || id.startsWith('env:'), `${id} master must stay out of dist/ (paintings are the existing backdrop files)`);
    const f = Catalog.files(pic.stem);
    for (const p of [...f.avif.map(a => a.path), f.fallback]) {
      assert.ok(fs.existsSync(path.join(ROOT, p)), p); assert.equal(isExcluded(p), false, p);
    }
  }
  // no stray files: the folder holds exactly the cuts of pictures in use
  const wanted = new Set();
  for (const pic of Object.values(Catalog.PICTURES)) if (pic.use !== 'none') { const f = Catalog.files(pic.stem, pic.widths); f.avif.forEach(a => wanted.add(path.basename(a.path))); wanted.add(path.basename(f.fallback)); }
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'img/catalog-art')).sort(), [...wanted].sort());
});

test('10-11. every cut is a 1:3 strip at its declared width, never upscaled from the 1:3 window of the master', async () => {
  const sharp = require('sharp');
  for (const [id, pic] of Object.entries(Catalog.PICTURES)) {
    if (pic.use === 'none' || id.startsWith('crop:')) continue;
    const m = await sharp(path.join(ROOT, Gen.masterOf(id))).metadata();
    const win = Gen.windowFor(m.width, m.height, pic.x);
    for (const w of Catalog.WIDTHS) {
      const meta = await sharp(path.join(ROOT, `img/catalog-art/${pic.stem}-${w}.avif`)).metadata();
      assert.equal(meta.width, w, `${pic.stem} ${w}`);
      assert.ok(Math.abs(meta.height / meta.width - 3) < 0.05, `${pic.stem}-${w} is 1:3 (${meta.width}x${meta.height})`);
      assert.ok(w <= win.width, `${pic.stem}-${w} needs no upscaling (window ${win.width}px)`);
    }
    // 95 css px at 3x = 285 px; the largest cut covers it
    assert.ok(Math.max(...Catalog.WIDTHS) >= 285);
    const fb = await sharp(path.join(ROOT, `img/catalog-art/${pic.stem}-200.webp`)).metadata();
    assert.equal(fb.width, 200);
  }
});

test('12. crop windows are deterministic, inside the master, and 1:3', () => {
  const a = Gen.windowFor(1672, 941, 37), b = Gen.windowFor(1672, 941, 37);
  assert.deepEqual(a, b);
  assert.equal(a.width, 314); assert.equal(a.height, 941); assert.equal(a.top, 0);
  assert.equal(Gen.windowFor(1672, 941, 0).left, 0);
  assert.equal(Gen.windowFor(1672, 941, 100).left + 314, 1672);
});

test('13. My Lists resolution is byte-for-byte what it was: registry untouched, resolver independent of the Catalog', () => {
  assert.equal(Object.keys(Art.ARCHETYPE_FIT).length, 117);
  assert.equal(Object.keys(Art.IMAGES).length, 31 + 12 + 4); // + the four My Lists semantic crops (PD-090)
  assert.doesNotMatch(read('js/list-cover-art.js') + read('js/list-cover-utils.js'), /CatalogArt|catalog-art/);
  const counts = {};
  for (const e of ENVS) { const r = CoverUtils.resolveEnvironmentArt({ id: e.id, artBiome: e.biomes[0] }); const k = r ? r.kind : 'none'; counts[k] = (counts[k] || 0) + 1; }
  assert.equal(counts.unique, 3); assert.equal(counts.archetype, 115); assert.equal(counts.crop, 5); // 117 before PD-090: two moved to a crop, three gained one
});

test('14-15. Session Prep, the central column and Journey draw what they drew: no Catalog code reaches them', () => {
  for (const fn of ['prepEnvThumbHtml', 'biomeThumbAttrs', 'centralThumbHtml']) assert.doesNotMatch(functionText(APP_JS, fn), /CatalogArt|catalogArtHtml/, fn);
  for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(n => /^(journey2|prep)/.test(n))) assert.doesNotMatch(read('js/' + f), /CatalogArt|catalog-art/, f);
  assert.doesNotMatch(read('css/journey2.css'), /catalog-art/);
});

test('16. card geometry is untouched: the strip is the same .card-art > picture > img, cardHtml only swaps its source', () => {
  const css = read('css/styles.css');
  assert.match(css, /\.card-art \{\s*flex: none; width: 95px;/);
  assert.match(functionText(APP_JS, 'cardHtml'), /\$\{catalogArtHtml\(env\)\}\n\s+<div class="card-body">/);
  const strip = functionText(APP_JS, 'stripHtml');
  assert.match(strip, /<div class="card-art">/); assert.match(strip, /sizes="\$\{ART_SIZES\}"/); assert.match(strip, /loading="lazy" decoding="async"/);
  assert.equal((APP_JS.match(/catalogArtHtml\(/g) || []).length, 3); // its definition, the one call in cardHtml, and the crop fallback's redraw
});

test('17. biomeArtHtml is unchanged and the language does not influence the choice', () => {
  assert.match(functionText(APP_JS, 'biomeArtHtml'), /const base = 'img\/biomes\/' \+ biome;/);
  assert.doesNotMatch(read('js/catalog-art.js'), /state\.lang|\.name\b|localStorage/);
  // the resolver reads only the environment id: the same card in RU and EN
  assert.deepEqual(Catalog.resolveCatalogArt({ id: 'heros-tomb', name: { en: 'x' } }), Catalog.resolveCatalogArt({ id: 'heros-tomb', name: { ru: 'y' } }));
});

test('18-19. dist/ ships the cuts but not a master; index.html loads the module before app.js', () => {
  assert.equal(isExcluded('img/catalog-art/archetype-crypts-and-tombs-200.avif'), false);
  assert.equal(isExcluded('img/cover-archetypes-source/crypts-and-tombs.png'), true);
  const html = read('index.html');
  assert.ok(html.indexOf('js/list-cover-art.js') < html.indexOf('js/catalog-art.js') && html.indexOf('js/catalog-art.js') < html.indexOf('<script src="js/app.js'));
});

test('20. the cuts are reproducible: the same master and x encode to the same bytes', async () => {
  const sharp = require('sharp');
  const id = 'archetype:seafaring', pic = Catalog.PICTURES[id];
  const m = await sharp(path.join(ROOT, Gen.masterOf(id))).metadata();
  const win = Gen.windowFor(m.width, m.height, pic.x);
  const enc = () => sharp(path.join(ROOT, Gen.masterOf(id))).extract(win).resize({ width: 200, kernel: 'lanczos3' }).avif({ quality: 55, effort: 6 }).toBuffer();
  const [a, b] = [await enc(), await enc()];
  assert.ok(a.equals(b));
  assert.ok(a.equals(fs.readFileSync(path.join(ROOT, `img/catalog-art/${pic.stem}-200.avif`))), 'the shipped file is what the script produces');
});

test('coverage on the real catalogue (PD-089 report)', () => {
  const by = {};
  for (const e of ENVS) { const r = resolve(e.id); by[r.kind] = (by[r.kind] || 0) + 1; }
  assert.equal(ENVS.length, 373);
  assert.deepEqual(by, { biome: by.biome, unique: 3, override: 2, crop: 5, thematic: by.thematic });
  assert.equal(by.thematic, 90); // 92 before PD-090: bustling-marketplace and resting-dagger-inn now wear a crop
  assert.equal(by.biome, 373 - 90 - 5 - 5);
});
