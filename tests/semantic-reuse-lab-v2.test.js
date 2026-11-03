'use strict';
/* Semantic Artwork Reuse Lab, V2 pilot (lab/semantic-reuse/data-v2.js): the three added sources, their regions and mappings,
 * the gain categories kept apart, V1 + V2 combined without double counting, and that production did not move.
 * docs/research/semantic-artwork-reuse-lab-v2.md */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const readJson = p => JSON.parse(read(p));
const Core = require('../lab/semantic-reuse/lab-core.js');
const V1 = require('../lab/semantic-reuse/data.js');
const V2 = require('../lab/semantic-reuse/data-v2.js');
const Art = require('../js/list-cover-art.js');
const Catalog = require('../js/catalog-art.js');
const Lists = require('../js/list-cover-utils.js');
const Lab = require('../scripts/semantic-reuse-lab.js');
const { isExcluded } = require('../scripts/build.js');

const envs = readJson('data/environments.json').environments;
const envIds = envs.map(e => e.id);
const classification = readJson('docs/research/lists-cover-classification.json');
const primary = {}; classification.environments.forEach(c => { primary[c.id] = c.primary_archetype || null; });
const baseline = Lab.productionBaseline(envs, Lab.loadContext().artBiome);
const inv = readJson('docs/research/semantic-artwork-reuse-lab-v2/inventory.json');
const sources = {}; Object.keys(inv).forEach(k => { if (inv[k].available) sources[k] = inv[k]; });
const stats = readJson('docs/research/semantic-artwork-reuse-lab-v2/stats.json');
const input = (regions, mappings) => ({ regions, mappings, sources, envIds, baseline, primaryArchetype: primary });
const g2 = Core.gains(input(V2.REGIONS, V2.MAPPINGS));
const gAll = Core.gains(input(V1.REGIONS.concat(V2.REGIONS), V1.MAPPINGS.concat(V2.MAPPINGS)));
const gV1 = Core.gains(input(V1.REGIONS, V1.MAPPINGS));
const CTX = ['catalog', 'prep', 'prepFuture', 'lists'];

test('V2-1. New regions have stable, unique ids, real masters and valid bounds', () => {
  assert.deepEqual(V2.PILOT_SOURCES, ['intrigue-and-underworld', 'sacred-sanctuaries', 'dungeon-delves']);
  const ids = V1.REGIONS.concat(V2.REGIONS).map(r => r.id);
  assert.equal(new Set(ids).size, ids.length, 'no collision with V1');
  for (const r of V2.REGIONS) {
    assert.deepEqual(Core.validateRegion(r, sources), [], r.id);
    assert.ok(r.id.startsWith(r.sourceId + '-'), r.id);
    assert.ok(V2.PILOT_SOURCES.includes(r.sourceId));
    const p = Core.boundsToPixels(r.bounds, sources[r.sourceId]);
    assert.ok(p.x + p.w <= sources[r.sourceId].width && p.y + p.h <= sources[r.sourceId].height, r.id);
    assert.ok(fs.existsSync(path.join(ROOT, sources[r.sourceId].path)), 'master exists: ' + r.sourceId);
  }
  assert.equal(V2.REGIONS.length, 14);
});

test('V2-2. Normalised <-> pixel conversion is exact to a pixel for every V2 region', () => {
  for (const r of V2.REGIONS) {
    const s = sources[r.sourceId]; const p = Core.boundsToPixels(r.bounds, s);
    const back = Core.boundsToPixels(Core.pixelsToBounds(p, s), s);
    assert.ok(Math.abs(back.x - p.x) <= 1 && Math.abs(back.y - p.y) <= 1 && Math.abs(back.w - p.w) <= 1 && Math.abs(back.h - p.h) <= 1, r.id);
  }
});

test('V2-3. DPR 1 and DPR 2 requirements in stats.json equal a fresh computation', () => {
  for (const rep of stats.regionReports) {
    const r = V2.REGIONS.find(x => x.id === rep.id); const p = Core.boundsToPixels(r.bounds, sources[r.sourceId]);
    for (const ctx of Core.CONTEXT_IDS) {
      const v = Core.viability(p, ctx, Core.contextFraming(r, ctx, p), Core.subjectFor(r, ctx));
      const f = rep.frames[ctx];
      assert.equal(f.status, v.status, rep.id + ' ' + ctx);
      assert.equal(f.dpr[1].needW, Core.CONTEXTS[ctx].box.w); assert.equal(f.dpr[2].needW, Core.CONTEXTS[ctx].box.w * 2);
      assert.equal(f.dpr[2].scale, v.dpr[2].scale, rep.id + ' ' + ctx);
    }
  }
});

test('V2-4. Context crops are independent: one region can pass one frame and fail another', () => {
  const plot = V2.REGIONS.find(r => r.id === 'intrigue-and-underworld-plotters-table');
  assert.equal(plot.contexts.catalog.verdict, 'fail'); assert.equal(plot.contexts.prep.verdict, 'pass');
  const lotus = V2.REGIONS.find(r => r.id === 'sacred-sanctuaries-lotus-pool');
  assert.equal(lotus.contexts.catalog.verdict, 'fail'); assert.equal(lotus.contexts.lists1.verdict, 'pass');
  assert.ok(!g2.catalog.regionsByEnv['murder-mystery'] && g2.lists.regionsByEnv['murder-mystery'], 'plotter\'s table reaches murder-mystery in My Lists only');
  const r = JSON.parse(JSON.stringify(plot)); r.contexts.prep.framing = { x: 10, y: 10, zoom: 2 };
  assert.deepEqual(Core.contextFraming(plot, 'lists1', Core.boundsToPixels(plot.bounds, sources[plot.sourceId])), Core.contextFraming(r, 'lists1', Core.boundsToPixels(r.bounds, sources[r.sourceId])));
});

test('V2-5. A missing master is reported by the export validator, not thrown', () => {
  const exp = Core.buildExport(Object.assign(input(V2.REGIONS, V2.MAPPINGS), { generated: '2026-11-03' }));
  assert.deepEqual(Core.validateExport(exp), []);
  const broken = JSON.parse(JSON.stringify(exp)); broken.sources = broken.sources.filter(s => s.id !== 'dungeon-delves');
  const problems = Core.validateExport(broken);
  assert.ok(problems.some(p => /unknown source/.test(p)));
  assert.throws(() => Core.boundsToPixels(V2.REGIONS[0].bounds, undefined));
});

test('V2-6. Rejected and needs-review mappings never become eligible', () => {
  const eligible = new Set(Object.values(g2).flatMap(x => (x && x.newIds || []).concat(x && x.qualitativeIds || [], x && x.noGainIds || [])));
  const okEnvs = new Set(V2.MAPPINGS.filter(m => Core.COUNTS_AS_APPROVED.includes(m.review) && V2.REGIONS.find(r => r.id === m.regionId).status === 'approved').map(m => m.envId));
  V2.MAPPINGS.filter(m => ['rejected', 'needs-review'].includes(m.review)).forEach(m => { if (!okEnvs.has(m.envId)) assert.ok(!eligible.has(m.envId), m.envId + ' via ' + m.regionId); });
  for (const bad of ['the-undermarket', 'jazz-speakeasy', 'blade-root-sanctum', 'scorching-dungeon', 'blade-root-sanctum', 'darkened-temple']) assert.ok(!eligible.has(bad), bad);
});

test('V2-7. Cross-archetype reuse is reviewed, counted, and never touches the taxonomy', () => {
  const frozen = JSON.parse(JSON.stringify(primary)); Object.freeze(primary);
  const cov = Core.coverage(input(V2.REGIONS, V2.MAPPINGS));
  assert.deepEqual(cov.crossArchetype.ids, ['street-chase']);
  assert.equal(primary['street-chase'], 'chase-and-ambush');
  assert.deepEqual(JSON.parse(JSON.stringify(primary)), frozen);
  const exp = Core.buildExport(Object.assign(input(V2.REGIONS, V2.MAPPINGS), { generated: 'x' }));
  assert.equal(exp.mappings.find(m => m.envId === 'street-chase').crossArchetype, true);
  assert.equal(classification.environments.find(c => c.id === 'street-chase').primary_archetype, 'chase-and-ambush');
});

test('V2-8. Parent identity is preserved; a cover holds one region per parent illustration', () => {
  const exp = Core.buildExport(Object.assign(input(V2.REGIONS, V2.MAPPINGS), { generated: 'x' }));
  exp.regions.forEach(r => assert.equal(r.parentArtworkId, r.sourceId));
  const byId = new Map(V2.REGIONS.map(r => [r.id, r]));
  const r = Core.dedupeByParent(['intrigue-and-underworld-covert-table', 'intrigue-and-underworld-plotters-table', 'dungeon-delves-barred-gate'], byId);
  assert.deepEqual(r.kept, ['intrigue-and-underworld-covert-table', 'dungeon-delves-barred-gate']);
  assert.deepEqual(r.dropped, ['intrigue-and-underworld-plotters-table']);
});

test('V2-9. Gains count unique environment ids; the three categories are disjoint and apart', () => {
  for (const k of CTX) {
    const x = g2[k]; const all = x.newIds.concat(x.qualitativeIds, x.noGainIds);
    assert.equal(new Set(all).size, all.length, k + ': an environment sits in exactly one category');
    assert.equal(x.usableEnvironments, all.length);
    assert.equal(x.new + x.qualitative + x.noGain, x.usableEnvironments);
  }
  /* several crops reach heist / murder-mystery / street-chase / deadly-dungeon: each id once */
  assert.equal(g2.dedupe.regions, 7);
  assert.ok(g2.dedupe.mappings >= g2.dedupe.environments);
  assert.deepEqual(g2.catalog.newIds, ['chapel-of-st-brenna', 'chthon-verlies', 'gang-hideout']);
  assert.equal(g2.catalog.qualitative, 0, 'no V2 crop is a demonstrable qualitative replacement');
  assert.ok(g2.catalog.noGainIds.includes('hallowed-temple') && g2.catalog.noGainIds.includes('deadly-dungeon'), 'suitable but already themed = no gain');
});

test('V2-10. Proposed regions and mappings are distinguished from approved ones', () => {
  const kit = V2.REGIONS.find(r => r.id === 'dungeon-delves-explorers-kit'); const vista = V2.REGIONS.find(r => r.id === 'sacred-sanctuaries-arched-vista');
  assert.equal(kit.status, 'proposed'); assert.equal(vista.status, 'proposed');
  assert.ok(V2.MAPPINGS.some(m => m.regionId === kit.id && m.review === 'acceptable'), 'an acceptable mapping exists on the unapproved region');
  assert.ok(!Object.values(g2).some(x => x && x.regionsByEnv && Object.values(x.regionsByEnv).some(a => a.includes(kit.id) || a.includes(vista.id))), 'but it is not counted');
  assert.ok(g2.catalog.regionsByEnv['gang-hideout']);
  const rejected = V2.REGIONS.filter(r => !['approved', 'proposed'].includes(r.status)).map(r => r.status).sort();
  assert.deepEqual(rejected, ['insufficient-resolution', 'insufficient-resolution', 'not-independently-meaningful', 'not-independently-meaningful', 'not-independently-meaningful']);
});

test('V2-11. V1 research results remain intact and reproduce through the new gain function', () => {
  const s1 = readJson('docs/research/semantic-artwork-reuse-lab-v1/stats.json');
  assert.equal(V1.REGIONS.length, 18); assert.equal(V1.MAPPINGS.length, 79);
  assert.equal(s1.regions.approved, 13); assert.deepEqual(s1.mappings.byReview, { strong: 8, acceptable: 22, rejected: 33, 'needs-review': 16 });
  assert.deepEqual(gV1.catalog.newIds, ['city-festival', 'pitched-battle', 'the-dungeoneer']);
  assert.deepEqual(gV1.catalog.qualitativeIds, ['bustling-marketplace', 'resting-dagger-inn']);
  assert.equal(gV1.prep.new, 16); assert.equal(gV1.lists.new, 3); assert.equal(gV1.lists.qualitative, 2);
  assert.equal(gV1.catalog.new + gV1.catalog.qualitative, s1.coverage.byContext.catalog.net);
});

test('V2-12. V2 exports are valid and consistent with the curated data', () => {
  const exp = readJson('docs/research/semantic-artwork-reuse-lab-v2/review-export.json');
  assert.deepEqual(Core.validateExport(exp), []);
  assert.equal(exp.regions.length, V2.REGIONS.length); assert.equal(exp.mappings.length, V2.MAPPINGS.length);
  assert.deepEqual(exp.mappings.map(m => m.regionId + '/' + m.envId), V2.MAPPINGS.map(m => m.regionId + '/' + m.envId));
  assert.deepEqual(stats.gains.v2.catalog.newIds, g2.catalog.newIds);
  assert.deepEqual(stats.gains.combined.anyNew, gAll.anyNew);
  for (const m of V2.MAPPINGS) assert.ok(envIds.includes(m.envId), 'real environment: ' + m.envId);
  for (const m of V2.MAPPINGS) assert.deepEqual(Core.validateMapping(m, new Set(V2.REGIONS.map(r => r.id)), new Set(envIds)), [], m.regionId + '/' + m.envId);
});

test('V2-13. Combined V1 + V2 deduplicates by environment, context, parent and region', () => {
  assert.ok(V1.REGIONS.some(r => r.id === 'archives-and-libraries-scholars-desk') && gAll.lists.regionsByEnv['murder-mystery'].length === 2, 'two crops, two parents reach murder-mystery');
  assert.equal(gAll.anyNew.filter(e => e === 'murder-mystery').length, 1, 'counted once');
  assert.deepEqual(gAll.anyNew, [...new Set(gV1.anyNew.concat(g2.anyNew))].sort());
  assert.equal(gAll.dedupe.regions, gV1.dedupe.regions + g2.dedupe.regions);
  assert.ok(gAll.dedupe.environmentParentPairs <= gAll.dedupe.mappings);
  assert.deepEqual(gAll.anyQualitative, gV1.anyQualitative);
  for (const k of CTX) assert.ok(gAll[k].new <= gV1[k].new + g2[k].new, k);
});

test('V2-14. Prep beyond the whole archetype pictures counts only environments they do not reach', () => {
  for (const id of g2.prepFuture.newIds) assert.ok(!['unique', 'override', 'archetype'].includes(baseline[id].lists), id + ' has no whole picture to beat');
  for (const id of g2.prepFuture.noGainIds) assert.ok(['unique', 'override', 'archetype'].includes(baseline[id].lists), id);
  for (const id of g2.prepFuture.newIds) assert.ok(g2.prep.newIds.includes(id));
  assert.ok(g2.prepFuture.new < g2.prep.new, 'against the old biome baseline the number is inflated');
});

test('V2-15. Production artwork, registries, Catalog, Prep, My Lists and Journey are unchanged', () => {
  assert.equal(Object.keys(Art.IMAGES).filter(k => k.startsWith('archetype:')).length, 28);
  assert.equal(Object.keys(Art.ARCHETYPE_FIT).length, 117);
  const kinds = {}; envs.forEach(e => { const k = Catalog.resolveCatalogArt(e).kind; kinds[k] = (kinds[k] || 0) + 1; });
  assert.deepEqual(kinds, { biome: 229, override: 2, thematic: 90, unique: 3, crop: 5 }); // PD-090 added the curated crops
  for (const id of ['gang-hideout', 'chthon-verlies']) assert.equal(Catalog.resolveCatalogArt({ id }).kind, 'biome', id + ' (rejected in the final review) still draws its biome strip');
  assert.equal(Catalog.resolveCatalogArt({ id: 'chapel-of-st-brenna' }).imageId, 'crop:statue-altar');
  const lk = {}; envs.forEach(e => { lk[baseline[e.id].lists] = (lk[baseline[e.id].lists] || 0) + 1; });
  assert.deepEqual(lk, { biome: 118, override: 2, archetype: 117, none: 89, unique: 3 });
  Object.values(baseline).forEach(b => assert.equal(b.prep, 'biome'));
  assert.equal(Lists.COVER_MAX, 3);
  for (const f of ['js/list-cover-art.js', 'js/catalog-art.js', 'js/list-cover-utils.js', 'js/app.js', 'index.html', 'css/styles.css']) assert.ok(!/semantic-reuse|SemanticReuse/i.test(read(f)), f);
  for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(n => /journey2/.test(n))) assert.ok(!/semantic-reuse|SemanticReuse/i.test(read('js/' + f)), f);
  for (const m of V2.MAPPINGS) assert.ok(!Object.keys(Art.IMAGES).includes(m.regionId));
});

test('V2-16. The V2 dataset is pure, isolated and never published', () => {
  assert.ok(!/localStorage|\bdocument\.[a-z]|\bwindow\.[a-zA-Z]/.test(read('lab/semantic-reuse/data-v2.js')));
  const ui = read('lab/semantic-reuse/lab-ui.js');
  assert.ok(!/['"`]dhcodex_/.test(ui)); assert.ok(/labsr:v2:regions/.test(ui) && /labsr:v2:mappings/.test(ui), 'V2 edits never overwrite V1 storage');
  for (const f of ['lab/semantic-reuse/data-v2.js', 'lab/semantic-reuse/derivs-v2/x.avif', 'lab/semantic-reuse/derivs-manifest-v2.json', 'docs/research/semantic-artwork-reuse-lab-v2/stats.json', 'docs/research/semantic-artwork-reuse-lab-v2/screens/x.webp']) assert.equal(isExcluded(f), true, f);
});

test('V2-17. Derivatives exist, belong to approved regions, and are cut from a master only', () => {
  const man = readJson('lab/semantic-reuse/derivs-manifest-v2.json');
  assert.ok(man.length > 0);
  for (const f of man) {
    assert.ok(fs.existsSync(path.join(ROOT, f.path)), f.path);
    assert.ok(f.path.startsWith('lab/semantic-reuse/derivs-v2/'));
    assert.equal(path.basename(f.path), Lab.derivName(f.regionId, f.ctx, f.w, f.h, f.format));
    assert.equal(f.bytes, fs.statSync(path.join(ROOT, f.path)).size);
    assert.equal(V2.REGIONS.find(r => r.id === f.regionId).status, 'approved');
  }
  assert.equal(new Set(man.map(f => f.path)).size, man.length);
  assert.ok(man.filter(f => f.upscaled).length <= 2, 'no hidden upscaling: upscaled files are flagged and rare');
});
