'use strict';
/* Artwork Lab V3 (lab/artwork-v3/, dev-only): the strategies, the production bridge, crop isolation,
 * the export, lab storage hygiene and dist exclusion. docs/research/catalog-prep-artwork-lab-v3.md */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const Bridge = require('../lab/artwork-v3/prod-bridge.js');
const Core = require('../lab/artwork-v3/lab-core.js');
const Review = require('../lab/artwork-v3/context-review.js');
const Art = require('../js/list-cover-art.js');
const CoverUtils = require('../js/list-cover-utils.js');
const { isExcluded, copyTree } = require('../scripts/build.js');

const envs = JSON.parse(read('data/environments.json')).environments;
const classification = JSON.parse(read('docs/research/lists-cover-classification.json'));
const prod = Bridge.load(read('js/app.js'), {
  EnvTierUtils: require('../js/env-tier-utils.js'), PrepUtils: require('../js/prep-utils.js'), RouteUtils: require('../js/route-utils.js'),
}, { i18n: JSON.parse(read('data/i18n.json')), regions: JSON.parse(read('data/regions.json')).regions, lang: 'en' });
const make = (extra) => Core.create(Object.assign({ envs, art: Art, coverUtils: CoverUtils, artBiome: prod.artBiome, review: Review, classification }, extra));
const core = make();
const exists = p => fs.existsSync(path.join(ROOT, p));

test('1. Strategy A is the production resolver: same biome, same files, for every environment', () => {
  for (const env of envs) {
    const a = core.resolveA(env, 'catalog'); const ap = core.resolveA(env, 'prep');
    assert.equal(a.biome, prod.artBiome(env), env.id);
    const strip = prod.prodBiomeArtHtml(env);
    assert.ok(strip.includes(`src="${a.image.fallback}"`), env.id);
    a.image.sources.forEach(s => assert.ok(strip.includes(`${s.path} ${s.w}w`), env.id + ' ' + s.path));
    const thumb = prod.prodPrepEnvThumbHtml(env);
    assert.ok(thumb.includes(`src="${ap.image.fallback}"`), env.id);
    assert.ok(thumb.includes(ap.image.sources[1].path) && thumb.includes(ap.image.sources[2].path), env.id);
  }
});

test('2. Strategy B picks only what ARCHETYPE_FIT / unique / override authorise', () => {
  for (const env of envs) {
    if (Art.SEMANTIC_OVERRIDES[env.id]) continue; // PD-090 crops postdate this lab; Session Prep production is asserted unchanged elsewhere
    const b = core.resolveB(env, 'catalog');
    const allowed = Art.UNIQUE_ENV_IDS.includes(env.id) || Art.ENV_IMAGE_OVERRIDES[env.id] || Art.ARCHETYPE_FIT[env.id];
    if (!allowed) { assert.equal(b.source, 'biome', env.id); assert.equal(b.identity, core.resolveA(env, 'catalog').identity); continue; }
    const ref = CoverUtils.resolveEnvironmentArt({ id: env.id, artBiome: null }, Art);
    assert.equal(b.image.id, ref.imageId, env.id);
  }
  const taxonomyOnly = envs.filter(e => core.taxonomyHint(e).status === 'taxonomy-only-not-authorised');
  assert.ok(taxonomyOnly.length > 100);
  taxonomyOnly.filter(e => !Art.ENV_IMAGE_OVERRIDES[e.id] && !Art.SEMANTIC_OVERRIDES[e.id] && !Art.UNIQUE_ENV_IDS.includes(e.id)).forEach(e => assert.equal(core.resolveB(e, 'prep').source, 'biome', e.id));
});

test('3. Strategy C never selects an unauthorised or review-rejected picture', () => {
  for (const ctx of ['catalog', 'prep']) {
    for (const env of envs) {
      const b = core.resolveB(env, ctx); const c = core.resolveC(env, ctx);
      if (c.source === 'biome' || c.source === 'none') { assert.equal(c.identity, core.resolveA(env, ctx).identity, env.id); continue; }
      assert.equal(c.image.id, b.image.id, env.id);
      const rv = core.reviewFor(c.image.id, ctx);
      assert.ok(rv && rv.rating !== 'poor', `${env.id} ${ctx}`);
      if (rv.rating === 'marginal' && c.source === 'archetype') assert.equal(c.fit, 'strong', `${env.id} ${ctx}`);
    }
  }
  const poor = Object.entries(Review.images).filter(([, v]) => v.catalog.rating === 'poor').map(([id]) => id);
  assert.ok(poor.length >= 1);
  const timeLoop = envs.find(e => e.id === 'time-loop');
  assert.equal(core.resolveC(timeLoop, 'catalog').source, 'biome');
  assert.equal(core.resolveC(timeLoop, 'catalog').reviewStatus, 'reviewed');
});

test('3b. An unreviewed picture falls back to biome and is flagged, never silently used', () => {
  const bare = make({ review: { images: {} } });
  const env = envs.find(e => e.id === 'fighting-arena');
  const c = bare.resolveC(env, 'catalog');
  assert.equal(c.source, 'biome'); assert.equal(c.reviewStatus, 'unreviewed'); assert.equal(c.rejectedImageId, 'archetype:arenas-and-duels');
});

test('4. Unique paintings keep priority in B and C', () => {
  for (const id of Art.UNIQUE_ENV_IDS) {
    const env = envs.find(e => e.id === id);
    for (const ctx of ['catalog', 'prep']) {
      assert.equal(core.resolveB(env, ctx).source, 'unique'); assert.equal(core.resolveC(env, ctx).source, 'unique');
      assert.equal(core.resolveA(env, ctx).source, 'biome');
    }
  }
});

test('5. A missing archetype picture falls back to the production biome', () => {
  const art = Object.assign({}, Art, { IMAGES: Object.assign({}, Art.IMAGES) });
  delete art.IMAGES['archetype:arenas-and-duels'];
  const lab = make({ art });
  const env = envs.find(e => e.id === 'fighting-arena');
  assert.equal(lab.resolveB(env, 'catalog').source, 'biome');
  assert.equal(lab.resolveC(env, 'prep').source, 'biome');
});

test('6. Multi-biome environments use the production artBiome convention (generic biomes dropped)', () => {
  const multi = envs.filter(e => (e.biomes || []).length > 1);
  assert.ok(multi.length > 20);
  for (const env of multi) {
    const biome = core.resolveA(env, 'catalog').biome;
    assert.equal(biome, prod.artBiome(env));
    const specific = (env.biomes || []).filter(b => !['universal', 'settlement'].includes(b));
    if (specific.length) assert.ok(specific.includes(biome), env.id);
  }
});

test('7. The same environment renders identically across strategies except for the picture', () => {
  const strip = html => html.replace(/<div class="card-art"[\s\S]*?<\/div>/, '').replace(/\s+/g, ' ');
  for (const id of ['floating-mountains', 'harsh-desert', 'cauldera-valley', 'time-loop']) {
    const env = envs.find(e => e.id === id);
    const cards = ['A', 'B', 'C'].map(s => {
      prod.hooks.catalogArt = e => `<div class="card-art">${s}</div>`; prod.hooks.prepThumb = () => `<i>${s}</i>`;
      return strip(prod.cardHtml(env));
    });
    assert.equal(cards[0], cards[1]); assert.equal(cards[1], cards[2]);
    const rows = ['A', 'B', 'C'].map(s => { prod.hooks.prepThumb = () => '<i></i>'; return prod.envPickerRowHtml(env, { environmentIds: [id] }); });
    assert.equal(rows[0], rows[1]);
  }
  prod.hooks.catalogArt = null; prod.hooks.prepThumb = null;
  assert.deepEqual(core.resolveC(envs[5], 'prep'), core.resolveC(envs[5], 'prep'));
});

test('8/9. Catalog and Prep crops are independent and never touch the production registry', () => {
  const before = JSON.stringify(Art);
  const image = Core.registryImage(Art, 'archetype:sky-realms');
  const overrides = { catalog: { [image.id]: { x: 10, y: 20, zoom: 2 } }, prep: {} };
  assert.deepEqual(core.effectiveCrop('B', image, 'catalog', overrides), { x: 10, y: 20, zoom: 2 });
  assert.notDeepEqual(core.effectiveCrop('B', image, 'prep', overrides), { x: 10, y: 20, zoom: 2 });
  assert.deepEqual(core.effectiveCrop('B', image, 'prep', overrides), core.startCrop('B', image, 'prep'));
  assert.equal(JSON.stringify(Art), before);
  assert.deepEqual(Core.normalizeCrop({ x: 500, y: -4, zoom: 9 }), { x: 100, y: 0, zoom: 3 });
  /* A production biome keeps its baked crop whatever the override says. */
  const biome = core.resolveA(envs[0], 'catalog').image;
  assert.equal(core.effectiveCrop('A', biome, 'catalog', { catalog: { [biome.id]: { x: 1, y: 1, zoom: 2 } } }).baked, true);
});

test('9b. Crop CSS and visible window maths', () => {
  assert.match(Core.cropCss({ x: 30, y: 40, zoom: 1.5 }), /object-position: 30% 40%[\s\S]*scale\(1.5\)/);
  const w = Core.cropWindow({ w: 95, h: 249 }, 16 / 9, { x: 0, y: 50, zoom: 1 });
  assert.ok(Math.abs(w.vw - (95 / 249) / (16 / 9)) < 1e-9); assert.equal(w.left, 0); assert.equal(w.vh, 1);
  const sq = Core.cropWindow({ w: 48, h: 48 }, 16 / 9, { x: 100, y: 50, zoom: 1 });
  assert.ok(Math.abs(sq.left + sq.vw - 1) < 1e-9);
});

test('10. The export carries stable ids and never guesses', () => {
  const out = core.buildExport({
    reviews: { 'floating-mountains|catalog': { envId: 'floating-mountains', ctx: 'catalog', judgement: 'prefer-archetype', preferred: 'archetype', notes: 'x', crop: { x: 56, y: 50, zoom: 1 }, at: '2026-11-02' } },
    crops: { catalog: { 'archetype:sky-realms': { x: 56, y: 50, zoom: 1 } }, prep: {} }, lang: 'en', generatedAt: '2026-11-02T00:00:00Z',
  });
  const r = out.records[0];
  assert.equal(r.envId, 'floating-mountains'); assert.equal(r.context, 'catalog'); assert.equal(r.preferredStrategy, 'B');
  assert.equal(r.preferredSource.imageId, 'archetype:sky-realms'); assert.equal(r.strategies.A.identity, 'biome-production:mountain');
  assert.equal(r.manualEvaluationStatus, 'recorded-by-human'); assert.deepEqual(out.cropConfiguration.catalog['archetype:sky-realms'], { x: 56, y: 50, zoom: 1 });
  assert.equal(JSON.parse(JSON.stringify(out)).kind, 'bacchus-atlas-artwork-lab-v3-review');
});

test('11. The lab stores only under labv3:* and never touches production storage or lists', () => {
  const files = fs.readdirSync(path.join(ROOT, 'lab/artwork-v3')).filter(f => /\.(js|html)$/.test(f));
  for (const f of files) {
    const src = read('lab/artwork-v3/' + f);
    assert.ok(!/dhcodex_/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), f + ' references a production key');
    assert.ok(!/SafeStorage/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), f);
  }
  const ui = read('lab/artwork-v3/lab-ui.js');
  for (const m of ui.matchAll(/['"](labv3:[a-z]+)['"]/g)) assert.ok(m[1].startsWith('labv3:'));
  assert.ok(!/localStorage\.(setItem|getItem|removeItem)\(\s*['"](?!labv3)/.test(ui));
  assert.equal((ui.match(/window\.localStorage/g) || []).length, 2, 'only lsGet/lsSet touch storage');
});

test('12. lab/ is excluded from the production bundle', () => {
  ['lab/artwork-v3/index.html', 'lab/artwork-v3/lab-ui.js', 'lab\\artwork-v3\\index.html'].forEach(p => assert.equal(isExcluded(p), true, p));
  ['js/app.js', 'index.html', 'css/styles.css', 'data/environments.json', 'laboratory/x.js'].forEach(p => assert.equal(isExcluded(p), false, p));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-dist-'));
  copyTree(ROOT, tmp);
  assert.ok(!fs.existsSync(path.join(tmp, 'lab')));
  assert.ok(fs.existsSync(path.join(tmp, 'js/app.js')));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('13. Every file any strategy can display exists (no broken or invalid references)', () => {
  for (const ctx of ['catalog', 'prep']) for (const s of ['A', 'B', 'C']) {
    for (const env of envs) {
      const r = core.resolve(s, env, ctx);
      if (!r.image) continue;
      [r.image.fallback].concat(r.image.sources.map(x => x.path)).forEach(p => assert.ok(exists(p), `${env.id} ${s} ${ctx} ${p}`));
    }
  }
  const cov = core.coverage('catalog', new Set(['img/never.avif']));
  assert.ok(cov.A.missing > 0, 'a missing file is detected');
});

test('14. The library is the 28 registered archetypes, each with a review for both frames', () => {
  const ids = Object.keys(Art.ARCHETYPES);
  assert.equal(ids.length, 28);
  for (const a of ids) {
    const im = Core.registryImage(Art, 'archetype:' + a);
    assert.ok(im, a);
    for (const ctx of ['catalog', 'prep']) { const rv = core.reviewFor(im.id, ctx); assert.ok(rv && ['good', 'marginal', 'poor'].includes(rv.rating), a + ctx); assert.ok(rv.note); }
  }
  Object.keys(Review.images).forEach(id => assert.ok(Art.IMAGES[id], 'review of unregistered image ' + id));
  assert.equal(classification.taxonomy.length, 28);
});

test('15. Production code does not know the lab exists', () => {
  for (const f of ['js/app.js', 'js/list-cover-art.js', 'js/list-cover-utils.js', 'css/styles.css', 'index.html']) {
    assert.ok(!/artwork-v3|ArtworkLab/.test(read(f)), f);
  }
  const nav = read('js/app.js');
  assert.ok(!/lab\/artwork/.test(nav));
});

test('16. Coverage numbers: every environment resolves, eligible set matches the registry', () => {
  for (const ctx of ['catalog', 'prep']) {
    const c = core.coverage(ctx);
    assert.equal(c.total, envs.length);
    for (const s of ['A', 'B', 'C']) assert.equal(Object.values(c[s].counts).reduce((a, b) => a + b, 0), envs.length);
    assert.equal(c.A.thematic, 0);
    assert.equal(c.eligible.authorised, c.B.thematic);
    assert.ok(c.C.thematic <= c.B.thematic);
    assert.equal(c.C.downgradedToBiome, c.B.thematic - c.C.thematic);
  }
});

test('17. Derivative choice never upscales within the available cuts and flags it when it must', () => {
  const sky = Core.registryImage(Art, 'archetype:sky-realms');
  assert.equal(Core.pickDerivative(sky, 'catalog', 1, 1).source.w, 640);
  assert.equal(Core.pickDerivative(sky, 'catalog', 2, 1).source.w, 960);
  assert.equal(Core.pickDerivative(sky, 'catalog', 3, 1).upscaled, true);
  assert.equal(Core.pickDerivative(sky, 'prep', 2, 1).source.w, 320);
  assert.equal(Core.pickDerivative(sky, 'prep', 2, 1).upscaled, false);
});

test('18. Declared aspect ratios match the real files', t => {
  let sharp; try { sharp = require('sharp'); } catch (e) { t.skip('sharp not installed'); return; }
  const check = async (p, aspect) => { const m = await sharp(path.join(ROOT, p)).metadata(); assert.ok(Math.abs(m.width / m.height - aspect) < 0.02, `${p} ${m.width}x${m.height}`); };
  return Promise.all([
    check('img/list-covers/archetype-sky-realms-640.webp', Core.ASPECT.archetype), check('img/env/thumb/cauldera-valley-400.webp', Core.ASPECT.unique),
    check('img/biomes/forest-200.webp', Core.ASPECT['biome-strip']), check('img/biomes/forest-thumb-48.webp', Core.ASPECT['biome-thumb']),
    check('img/list-covers/biome-settlement-640.webp', Core.ASPECT.biome),
  ]);
});

test('19. The production bridge extracted every function it needs from app.js', () => {
  assert.equal(typeof prod.cardHtml, 'function'); assert.equal(typeof prod.envPickerRowHtml, 'function');
  const html = prod.cardHtml(envs[0]);
  assert.ok(html.includes('class="card"') && html.includes('card-art') && html.includes('card-tier-badge'));
  assert.ok(prod.envPickerRowHtml(envs[0], { environmentIds: [] }).includes('prep-env-row'));
  assert.throws(() => Bridge.extractFunction('function a() {}\n', 'nope'), /not found/);
});
