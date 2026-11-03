'use strict';
/* Semantic Artwork Reuse Lab (lab/semantic-reuse/, dev-only): region geometry, framing, resolution viability,
 * review rules, coverage, export, isolation — and that production artwork behaviour did not move.
 * docs/research/semantic-artwork-reuse-lab-v1.md */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const readJson = p => JSON.parse(read(p));
const Core = require('../lab/semantic-reuse/lab-core.js');
const Data = require('../lab/semantic-reuse/data.js');
const Art = require('../js/list-cover-art.js');
const Catalog = require('../js/catalog-art.js');
const Lists = require('../js/list-cover-utils.js');
const Lab = require('../scripts/semantic-reuse-lab.js');
const { isExcluded } = require('../scripts/build.js');

const envs = readJson('data/environments.json').environments;
const envIds = envs.map(e => e.id);
const classification = readJson('docs/research/lists-cover-classification.json');
const primary = {}; classification.environments.forEach(c => { primary[c.id] = c.primary_archetype || null; });
const ctxLab = Lab.loadContext();
const baseline = Lab.productionBaseline(envs, ctxLab.artBiome);
const inv = readJson('docs/research/semantic-artwork-reuse-lab-v1/inventory.json');
const sources = {}; Object.keys(inv).forEach(k => { if (inv[k].available) sources[k] = inv[k]; });
const SRC = { width: 1672, height: 941 };
const deepFreeze = o => { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };

test('1. Every curated region lies inside its source master and validates', () => {
  for (const r of Data.REGIONS) {
    assert.deepEqual(Core.validateRegion(r, sources), [], r.id);
    const p = Core.boundsToPixels(r.bounds, sources[r.sourceId]);
    assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= sources[r.sourceId].width && p.y + p.h <= sources[r.sourceId].height, r.id);
  }
});

test('2. Normalised <-> pixel conversion is stable and exact to a pixel', () => {
  const px = { x: 209, y: 169, w: 568, h: 772 };
  const b = Core.pixelsToBounds(px, SRC);
  const back = Core.boundsToPixels(b, SRC);
  assert.ok(Math.abs(back.x - px.x) <= 1 && Math.abs(back.y - px.y) <= 1 && Math.abs(back.w - px.w) <= 1 && Math.abs(back.h - px.h) <= 1);
  assert.deepEqual(Core.boundsToPixels({ x: 0, y: 0, width: 1, height: 1 }, SRC), { x: 0, y: 0, w: 1672, h: 941 });
  /* edge rounding never escapes the image (the bug this guards: round(x+w) one pixel past the edge) */
  const edge = Core.boundsToPixels({ x: 0.7, y: 0.3, width: 0.3, height: 0.7 }, { width: 1670, height: 941 });
  assert.ok(edge.x + edge.w <= 1670 && edge.y + edge.h <= 941);
});

test('3. Editor zoom and pan are a view transform: regions never change, and the round trip is the identity', () => {
  const region = Object.freeze({ x: 0.12, y: 0.22, width: 0.38, height: 0.65 });
  const fit = { w: 900, h: 506 };
  let view = { scale: 1, panX: 0, panY: 0 };
  for (const [pt, f] of [[{ x: 300, y: 200 }, 2], [{ x: 640, y: 80 }, 1.5], [{ x: 10, y: 400 }, 0.8]]) view = Core.zoomAt(view, pt, f, 1, 8);
  const v = Core.sourceToView({ x: region.x, y: region.y }, fit, view);
  const n = Core.viewToSource(v, fit, view);
  assert.ok(Math.abs(n.x - region.x) < 1e-9 && Math.abs(n.y - region.y) < 1e-9);
  /* zoomAt keeps the point under the cursor fixed */
  const before = Core.viewToSource({ x: 300, y: 200 }, fit, { scale: 1, panX: 0, panY: 0 });
  const z = Core.zoomAt({ scale: 1, panX: 0, panY: 0 }, { x: 300, y: 200 }, 3, 1, 8);
  const after = Core.viewToSource({ x: 300, y: 200 }, fit, z);
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
  assert.equal(region.x, 0.12);
});

test('4. Pixel dimensions are computed from the original source', () => {
  const r = Data.REGIONS.find(x => x.id === 'streets-and-towns-market-stalls');
  const p = Core.boundsToPixels(r.bounds, sources['streets-and-towns']);
  assert.deepEqual([p.w, p.h], [568, 772]);
  assert.equal(sources['streets-and-towns'].width, 1670);
});

test('5. DPR requirements follow the surviving window, not the region size', () => {
  const regionPx = { w: 635, h: 612 };
  const v = Core.viability(regionPx, 'catalog', { x: 50, y: 50, zoom: 1 }, null);
  assert.deepEqual([v.dpr[1].needW, v.dpr[1].needH, v.dpr[2].needW, v.dpr[2].needH], [95, 249, 190, 498]);
  const win = Core.frameWindow(regionPx, Core.CONTEXTS.catalog.box, { x: 50, y: 50, zoom: 1 });
  assert.ok(Math.abs(win.h - 612) < 1e-9 && Math.abs(win.w - 612 * 95 / 249) < 1e-9, 'cover keeps full height, a narrow slice of width');
  assert.equal(v.dpr[2].scale, Core.round(190 / win.w, 3));
  assert.equal(v.status, 'suitable-dpr1-dpr2');
  const small = Core.viability({ w: 200, h: 200 }, 'catalog', { x: 50, y: 50, zoom: 1 }, null);
  assert.equal(small.status, 'insufficient-resolution', '200px square cannot fill 95x249 at DPR1');
  const limited = Core.viability({ w: 300, h: 300 }, 'lists3', { x: 50, y: 50, zoom: 1 }, null);
  assert.ok(['suitable-dpr1-dpr2', 'suitable-dpr1-limited-dpr2'].includes(limited.status));
  const limit2 = Core.viability({ w: 120, h: 300 }, 'catalog', { x: 50, y: 50, zoom: 1 }, null);
  assert.equal(limit2.status, 'suitable-dpr1-limited-dpr2');
  /* a subject cut away, and a subject too small to read, are not resolution passes */
  const cut = Core.viability({ w: 1036, h: 471 }, 'catalog', { x: 0, y: 50, zoom: 1 }, { x: 0.6, y: 0.1, width: 0.3, height: 0.8 });
  assert.equal(cut.status, 'requires-different-framing');
  const tiny = Core.viability({ w: 368, h: 329 }, 'prep', { x: 50, y: 50, zoom: 1 }, { x: 0.1, y: 0.4, width: 0.14, height: 0.25 });
  assert.equal(tiny.status, 'insufficient-resolution');
});

test('6. Context framings are independent; a verdict can only downgrade', () => {
  const r = Data.REGIONS.find(x => x.id === 'taverns-and-inns-fireplace');
  const p = Core.boundsToPixels(r.bounds, sources[r.sourceId]);
  const a = Core.contextFraming(r, 'prep', p);
  const edited = JSON.parse(JSON.stringify(r)); edited.contexts.catalog.framing = { x: 3, y: 90, zoom: 2 };
  assert.deepEqual(Core.contextFraming(edited, 'prep', p), a, 'editing Catalog must not move Prep');
  assert.deepEqual(Core.contextFraming(edited, 'catalog', p), { x: 3, y: 90, zoom: 2 });
  const bad = Core.viability({ w: 50, h: 50 }, 'catalog', {}, null);
  assert.equal(Core.effectiveStatus(bad, 'pass'), 'insufficient-resolution', 'a human pass never rescues failing resolution');
  const good = Core.viability({ w: 635, h: 612 }, 'catalog', {}, null);
  assert.equal(Core.effectiveStatus(good, 'fail'), 'visually-unsuitable');
});

test('7. A missing master is reported, never replaced', async () => {
  const sharp = require('sharp');
  Data.MASTER_FILES.ghost = 'does-not-exist.png';
  try {
    const out = await Lab.inventory(sharp);
    assert.equal(out.ghost.available, false);
    assert.equal(out.ghost.width, null);
    assert.ok(Object.keys(out).filter(k => k !== 'ghost').every(k => out[k].available), 'every real master is present');
  } finally { delete Data.MASTER_FILES.ghost; }
});

test('8. Invalid coordinates are rejected', () => {
  const bad = [
    { x: -0.1, y: 0, width: 0.5, height: 0.5 }, { x: 0.6, y: 0, width: 0.5, height: 0.5 }, { x: 0, y: 0.8, width: 0.5, height: 0.3 },
    { x: 0, y: 0, width: 0, height: 0.5 }, { x: 0, y: 0, width: 0.01, height: 0.5 }, { x: NaN, y: 0, width: 0.5, height: 0.5 }, { x: 0, y: 0, width: '0.5', height: 0.5 }, null,
  ];
  bad.forEach(b => { assert.equal(Core.validateBounds(b).ok, false, JSON.stringify(b)); });
  assert.throws(() => Core.boundsToPixels(bad[0], SRC), RangeError);
  const c = Core.clampBounds({ x: 0.9, y: -1, width: 0.5, height: 5 });
  assert.equal(Core.validateBounds(c).ok, true);
});

test('9. Parent artwork identity is stable and every region names a real master', () => {
  const ids = new Set();
  for (const r of Data.REGIONS) {
    assert.ok(!ids.has(r.id), 'duplicate ' + r.id); ids.add(r.id);
    assert.ok(r.id.startsWith(r.sourceId + '-'), r.id + ' must be <source>-<slug>');
    assert.ok(Data.MASTER_FILES[r.sourceId], r.sourceId);
  }
  const exp = Core.buildExport({ regions: Data.REGIONS, mappings: Data.MAPPINGS, sources, envIds, baseline, primaryArchetype: primary });
  exp.regions.forEach(r => assert.equal(r.parentArtworkId, r.sourceId));
  const { kept, dropped } = Core.dedupeByParent(['streets-and-towns-market-stalls', 'taverns-and-inns-fireplace', 'streets-and-towns-market-street'], new Map(Data.REGIONS.map(r => [r.id, r])));
  assert.deepEqual(kept, ['streets-and-towns-market-stalls', 'taverns-and-inns-fireplace']);
  assert.deepEqual(dropped, ['streets-and-towns-market-street']);
});

test('10. Cross-archetype matches are reviewed but never change the taxonomy', () => {
  const before = JSON.stringify(classification);
  const input = deepFreeze(JSON.parse(JSON.stringify({ regions: Data.REGIONS, mappings: Data.MAPPINGS, primaryArchetype: primary })));
  const cov = Core.coverage({ regions: input.regions, mappings: input.mappings, sources, envIds, baseline, primaryArchetype: input.primaryArchetype });
  assert.ok(cov.crossArchetype.environments >= 3, 'the pilot demonstrates cross-archetype reuse');
  assert.ok(cov.crossArchetype.ids.includes('murder-mystery'));
  assert.equal(JSON.stringify(classification), before);
  assert.equal(primary['murder-mystery'], 'intrigue-and-underworld', 'the environment keeps its archetype');
  assert.equal(readJson('docs/research/lists-cover-classification.json').environments.find(c => c.id === 'murder-mystery').primary_archetype, 'intrigue-and-underworld');
  assert.ok(!read('docs/research/lists-cover-classification.json').includes('streets-and-towns-market'), 'no region id leaked into the classification');
});

/* A tiny fixture: two approved regions, one proposed, to test the counting rules without the curated data. */
const FIX_SOURCES = { s: { width: 1000, height: 500 } };
const pass = { verdict: 'pass' }; const fail = { verdict: 'fail' };
const fixRegion = (id, status, ctx) => ({ id: 's-' + id, sourceId: 's', label: id, description: id, status, bounds: { x: 0, y: 0, width: 0.5, height: 0.8 }, contexts: ctx });
const allPass = { catalog: pass, prep: pass, lists1: pass, lists2: pass, lists3: pass };
const fixCov = (regions, mappings, base) => Core.coverage({ regions, mappings, sources: FIX_SOURCES, envIds: ['a', 'b', 'c', 'd'], baseline: base || { a: {}, b: {}, c: {}, d: {} }, primaryArchetype: { a: 'x', b: 'x', c: 's', d: null } });
const mk = (regionId, envId, review, improves) => ({ regionId, envId, review, reason: 'r', improves });

test('11. Rejected and needs-review mappings never become eligible', () => {
  const cov = fixCov([fixRegion('r', 'approved', allPass)], [mk('s-r', 'a', 'rejected'), mk('s-r', 'b', 'needs-review'), mk('s-r', 'c', 'strong')]);
  assert.deepEqual(cov.approved.ids, ['c']);
  assert.equal(cov.rejected, 1); assert.equal(cov.needsReview, 1);
  /* the real data: a rejected pair is never approved */
  const real = Core.coverage({ regions: Data.REGIONS, mappings: Data.MAPPINGS, sources, envIds, baseline, primaryArchetype: primary });
  for (const m of Data.MAPPINGS.filter(x => x.review === 'rejected')) {
    const sibling = Data.MAPPINGS.find(x => x.envId === m.envId && x.regionId !== m.regionId && Core.COUNTS_AS_APPROVED.includes(x.review));
    if (!sibling) assert.ok(!real.approved.ids.includes(m.envId), m.envId + ' was rejected and has no other approved match');
  }
});

test('12. Unreviewed mappings and unapproved regions are not counted as approved', () => {
  const cov = fixCov([fixRegion('ok', 'approved', allPass), fixRegion('draft', 'proposed', allPass), fixRegion('bad', 'rejected', allPass)],
    [mk('s-draft', 'a', 'strong'), mk('s-bad', 'b', 'strong'), mk('s-ok', 'c', 'needs-review')]);
  assert.equal(cov.approved.environments, 0);
  assert.equal(cov.byContext.catalog.net, 0);
  assert.equal(cov.candidate.environments, 3, 'candidates (any non-rejected mapping) are tracked separately from approved coverage');
  assert.ok(Core.VERDICTS.includes('unreviewed'));
  const unreviewedFrames = fixCov([fixRegion('u', 'approved', { catalog: { verdict: 'unreviewed' } })], [mk('s-u', 'a', 'strong')]);
  assert.equal(unreviewedFrames.byContext.catalog.net, 0, 'an unreviewed frame does not qualify');
});

test('13. Coverage counts unique environment ids once, however many crops match', () => {
  const regions = [fixRegion('r1', 'approved', allPass), fixRegion('r2', 'approved', allPass), fixRegion('r3', 'approved', allPass)];
  const cov = fixCov(regions, [mk('s-r1', 'a', 'strong'), mk('s-r2', 'a', 'acceptable'), mk('s-r3', 'a', 'strong'), mk('s-r1', 'b', 'strong')]);
  assert.equal(cov.approved.environments, 2);
  assert.equal(cov.approved.mappings, 4);
  assert.equal(cov.byContext.catalog.net, 2);
  assert.equal(cov.byContext.catalog.regions, 3);
  const themed = fixCov(regions, [mk('s-r1', 'a', 'strong'), mk('s-r2', 'a', 'strong')], { a: { catalog: 'thematic', prep: 'biome', lists: 'archetype' }, b: {}, c: {}, d: {} });
  assert.equal(themed.byContext.catalog.net, 0, 'already well served: not new');
  const improved = fixCov(regions, [mk('s-r1', 'a', 'strong', 'confirmed better'), mk('s-r2', 'a', 'strong', 'again')], { a: { catalog: 'thematic', prep: 'biome', lists: 'archetype' }, b: {}, c: {}, d: {} });
  assert.deepEqual(improved.byContext.catalog.netIds, ['a']);
  assert.equal(improved.byContext.catalog.improved, 1);
});

test('14. Coverage is calculated per context; a crop can pass one and fail another', () => {
  const r = fixRegion('r', 'approved', { catalog: pass, prep: fail, lists1: pass, lists2: pass, lists3: fail });
  const cov = fixCov([r], [mk('s-r', 'a', 'strong')]);
  assert.equal(cov.byContext.catalog.net, 1);
  assert.equal(cov.byContext.prep.net, 0);
  assert.equal(cov.byContext.lists.net, 0, 'My Lists needs every layout it may be dealt into');
  const real = Core.coverage({ regions: Data.REGIONS, mappings: Data.MAPPINGS, sources, envIds, baseline, primaryArchetype: primary });
  assert.notEqual(real.byContext.catalog.net, real.byContext.prep.net);
  assert.deepEqual(Core.COVERAGE_CONTEXTS, ['catalog', 'prep', 'lists']);
});

test('15. The export is valid, versioned, stable and rejects tampering', () => {
  const x = Core.buildExport({ regions: Data.REGIONS, mappings: Data.MAPPINGS, sources, envIds, baseline, primaryArchetype: primary, generated: '2026-11-02' });
  assert.equal(x.schema, 'bacchus-atlas/semantic-artwork-reuse-lab');
  assert.equal(x.version, 1);
  assert.deepEqual(Core.validateExport(x), []);
  assert.deepEqual(Core.validateExport(JSON.parse(JSON.stringify(x))), []);
  const r = x.regions[0];
  for (const k of ['sourceId', 'parentArtworkId', 'label', 'bounds', 'pixels', 'status', 'contexts']) assert.ok(r[k] !== undefined, k);
  for (const c of Core.CONTEXT_IDS) { assert.ok(r.contexts[c].framing && r.contexts[c].viability.dpr1 && r.contexts[c].viability.dpr2, c); }
  const m = x.mappings[0]; for (const k of ['regionId', 'envId', 'review', 'reason', 'crossArchetype']) assert.ok(m[k] !== undefined, k);
  assert.ok(x.sources.every(s => s.width && s.height));
  const bad = JSON.parse(JSON.stringify(x)); bad.version = 2; assert.ok(Core.validateExport(bad).length);
  const bad2 = JSON.parse(JSON.stringify(x)); bad2.regions[0].bounds.width = 2; assert.ok(Core.validateExport(bad2).length);
  const bad3 = JSON.parse(JSON.stringify(x)); bad3.mappings[0].regionId = 'nope'; assert.ok(Core.validateExport(bad3).length);
  const bad4 = JSON.parse(JSON.stringify(x)); bad4.mappings[0].review = 'maybe'; assert.ok(Core.validateExport(bad4).length);
  const committed = readJson('docs/research/semantic-artwork-reuse-lab-v1/review-export.json');
  assert.deepEqual(Core.validateExport(committed), []);
  assert.equal(committed.regions.length, Data.REGIONS.length, 'regenerate with node scripts/semantic-reuse-lab.js after editing data.js');
  assert.equal(committed.mappings.length, Data.MAPPINGS.length);
});

test('curated data: every mapping names a real environment, has a reason, and negatives are present', () => {
  const regionIds = new Set(Data.REGIONS.map(r => r.id)); const env = new Set(envIds); const seen = new Set();
  for (const m of Data.MAPPINGS) {
    assert.deepEqual(Core.validateMapping(m, regionIds, env), [], m.regionId + '/' + m.envId);
    const key = m.regionId + '|' + m.envId; assert.ok(!seen.has(key), 'duplicate ' + key); seen.add(key);
  }
  /* the brief's deliberately unsuitable examples are all recorded as rejected */
  const rejected = (region, e) => Data.MAPPINGS.find(m => m.regionId === region && m.envId === e && m.review === 'rejected');
  assert.ok(rejected('streets-and-towns-clock-tower-gate', 'archmages-tower'), 'ordinary tower -> magical tower');
  assert.ok(rejected('streets-and-towns-market-stalls', 'the-undermarket'), 'market stall -> underworld');
  assert.ok(rejected('seafaring-deck-rigging', 'undersea-trench'), 'ship rigging -> underwater');
  assert.ok(rejected('strongholds-and-sieges-castle-walls', 'hallowed-cathedral'), 'castle gate -> sanctuary');
  assert.ok(rejected('streets-and-towns-tavern-terrace', 'jazz-speakeasy'), 'bright tavern -> criminal den');
  for (const s of Data.SCAN) assert.ok(Data.MASTER_FILES[s.sourceId], s.sourceId);
  assert.equal(Data.SCAN.length, 28);
  assert.ok(Data.PILOT_SOURCES.length >= 5 && Data.PILOT_SOURCES.length <= 6);
});

test('derivatives: every generated file exists, is named by region and frame, and no master is touched', () => {
  const manifest = readJson('lab/semantic-reuse/derivs-manifest.json');
  assert.ok(manifest.length > 0);
  for (const f of manifest) {
    assert.ok(fs.existsSync(path.join(ROOT, f.path)), f.path);
    assert.equal(path.basename(f.path), Lab.derivName(f.regionId, f.ctx, f.w, f.h, f.format));
    assert.equal(f.bytes, fs.statSync(path.join(ROOT, f.path)).size);
    assert.equal(Data.REGIONS.find(r => r.id === f.regionId).status, 'approved', 'only approved regions get files');
  }
  assert.equal(new Set(manifest.map(f => f.path)).size, manifest.length, 'no redundant duplicates');
  for (const [id, file] of Object.entries(Data.MASTER_FILES)) assert.equal(sources[id].path, Data.MASTER_DIR + file);
});

test('16. Laboratory state is isolated from the application', () => {
  const ui = read('lab/semantic-reuse/lab-ui.js');
  assert.ok(!/['"`]dhcodex_/.test(ui), 'never a production storage key');
  const keys = [...ui.matchAll(/'(labsr:[a-z]+)'/g)].map(m => m[1]);
  assert.ok(keys.length >= 3);
  assert.ok(!/localStorage\.(set|get)Item\(\s*'(?!labsr)/.test(ui));
  for (const f of ['lab-core.js', 'data.js']) assert.ok(!/localStorage|\bdocument\.[a-z]|\bwindow\.[a-zA-Z]/.test(read('lab/semantic-reuse/' + f)), f + ' is pure');
  /* dev-only: never published, never linked */
  assert.equal(isExcluded('lab/semantic-reuse/index.html'), true);
  assert.equal(isExcluded('lab/semantic-reuse/derivs/x.avif'), true);
  assert.equal(isExcluded('docs/research/semantic-artwork-reuse-lab-v1/stats.json'), true);
  for (const f of ['index.html', 'js/app.js', 'css/styles.css']) assert.ok(!/semantic-reuse|semantic artwork/i.test(read(f)), f + ' must not reference the lab');
});

test('17. The production artwork registry is unchanged by the lab', () => {
  const snap = JSON.stringify({ i: Art.IMAGES, f: Art.ARCHETYPE_FIT, a: Art.ARCHETYPES, u: Art.UNIQUE_ENV_IDS, o: Art.ENV_IMAGE_OVERRIDES, c: Catalog.PICTURES });
  /* loading and running every lab module again must not mutate it */
  delete require.cache[require.resolve('../lab/semantic-reuse/lab-core.js')]; delete require.cache[require.resolve('../lab/semantic-reuse/data.js')];
  const C2 = require('../lab/semantic-reuse/lab-core.js'); const D2 = require('../lab/semantic-reuse/data.js');
  C2.coverage({ regions: D2.REGIONS, mappings: D2.MAPPINGS, sources, envIds, baseline, primaryArchetype: primary });
  assert.equal(JSON.stringify({ i: Art.IMAGES, f: Art.ARCHETYPE_FIT, a: Art.ARCHETYPES, u: Art.UNIQUE_ENV_IDS, o: Art.ENV_IMAGE_OVERRIDES, c: Catalog.PICTURES }), snap);
  assert.equal(Object.keys(Art.IMAGES).filter(k => k.startsWith('archetype:')).length, 28);
  assert.equal(Object.keys(Art.ARCHETYPE_FIT).length, 117);
  assert.ok(!Object.keys(Art.IMAGES).some(k => Data.REGIONS.some(r => r.id === k)), 'no region is a registry picture');
  for (const f of ['js/list-cover-art.js', 'js/catalog-art.js', 'js/list-cover-utils.js']) assert.ok(!/SemanticReuse|semantic-reuse|region.*bounds/i.test(read(f)), f);
});

test('18. Production Catalog behaviour: the lab baseline is production before PD-090; the live Catalog adds only the curated crops', () => {
  const kinds = {}; envs.forEach(e => { const k = baseline[e.id].catalog; kinds[k] = (kinds[k] || 0) + 1; });
  assert.deepEqual(kinds, { biome: 232, override: 2, thematic: 92, unique: 3 });
  const live = {}; envs.forEach(e => { const k = Catalog.resolveCatalogArt(e).kind; live[k] = (live[k] || 0) + 1; });
  assert.deepEqual(live, { biome: 229, override: 2, thematic: 90, unique: 3, crop: 5 });
  assert.equal(Catalog.resolveCatalogArt({ id: 'bustling-marketplace' }).imageId, 'crop:market-stalls');
  assert.equal(Catalog.resolveCatalogArt({ id: 'city-festival' }).imageId, 'crop:market-stalls');
  assert.equal(Catalog.resolveCatalogArt({ id: 'the-dungeoneer' }).imageId, 'crop:bar-counter');
  assert.ok(/catalogArtHtml\(env\)/.test(read('js/app.js')) && !/regions-lab|SemanticReuse/.test(read('js/app.js')));
});

test('19. Production Session Prep behaviour is unchanged', () => {
  const app = read('js/app.js');
  const fn = app.slice(app.indexOf('function prepEnvThumbHtml('), app.indexOf('function envPickerRowHtml('));
  assert.ok(fn.includes('biomeThumbAttrs(biome)') && fn.includes('class="prep-thumb"'));
  assert.ok(!/archetype|ListCoverArt|CatalogArt|semantic/i.test(fn), 'Prep still draws only the biome thumbnail');
  assert.ok(/\.prep-thumb \{ flex: none; width: 48px; height: 48px;/.test(read('css/styles.css')));
  Object.values(baseline).forEach(b => assert.equal(b.prep, 'biome'));
});

test('20. Production My Lists behaviour is unchanged', () => {
  const kinds = {}; envs.forEach(e => { const k = baseline[e.id].lists; kinds[k] = (kinds[k] || 0) + 1; });
  assert.deepEqual(kinds, { biome: 118, override: 2, archetype: 117, none: 89, unique: 3 });
  const cover = Lists.coverForEnvironments([{ id: 'bustling-marketplace', artBiome: 'settlement' }, { id: 'local-tavern', artBiome: 'settlement' }, { id: 'library-of-the-dusk-tree', artBiome: 'settlement' }, { id: 'city-festival', artBiome: 'settlement' }], Art);
  /* PD-090: the crop, once, for both of its environments; PD-092: the tavern and the library both fail at a third, so the lower-ranked one is dropped */
  assert.equal(cover.layout, 2);
  assert.deepEqual(cover.tiles.map(t => t.imageId), ['crop:market-stalls', 'archetype:taverns-and-inns']);
  assert.equal(Lists.COVER_MAX, 3);
  assert.ok(!/SemanticReuse|semantic-reuse/.test(read('js/list-cover-utils.js')));
});
