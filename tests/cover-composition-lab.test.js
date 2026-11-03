/* ============================================================
   Bacchus's Atlas — tests/cover-composition-lab.test.js
   My Lists Cover Composition Lab V2 (lab/cover-composition/, dev-only; docs/research/my-lists-cover-composition-lab-v2.md):
   the baseline equals production, composition is kept apart from artwork eligibility, source families and
   unique paintings are respected, no cover repeats a picture, crop experiments never mutate the registry,
   the export is valid JSON, and nothing in production learns the lab exists.
   Run with:  node --test tests/cover-composition-lab.test.js
   ============================================================ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Art = require('../js/list-cover-art.js');
const Utils = require('../js/list-cover-utils.js');
const Core = require('../lab/cover-composition/lab-core.js');
const Fx = require('../lab/cover-composition/fixtures.js');
const { REVIEWS } = require('../lab/cover-composition/reviews.js');
const Bridge = require('../lab/cover-composition/prod-bridge.js');
const { isExcluded } = require('../scripts/build.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ENVS = JSON.parse(read('data/environments.json')).environments;
const I18N = JSON.parse(read('data/i18n.json'));
const APP = read('js/app.js');
const BIOMES = ['underground', 'aquatic', 'wetland', 'grassland', 'tropical', 'forest', 'drylands', 'rolling', 'mountain', 'frozen', 'badlands', 'settlement', 'universal'];
const artBiome = e => { let pool = (e.biomes || []).filter(b => BIOMES.includes(b)); for (const g of ['universal', 'settlement']) { if (pool.length < 2) break; pool = pool.filter(b => b !== g); } return pool[0] || null; };
const rec = id => ({ id, artBiome: artBiome(ENVS.find(e => e.id === id)) });
/* The lab studies the arrangement production wore BEFORE Adaptive 3-or-2 (PD-092), so its candidates come from the
 * registry without panel reviews; production itself now thins a crowded triptych (tests/adaptive-cover-composition.test.js). */
const LabArt = { ...Art, PANEL_REVIEWS: {} };
const analyse = ids => Core.analyse(ids.map(rec), LabArt, Utils);
const envLists = {};
Fx.ALL.forEach(c => c.envIds.forEach(id => { (envLists[id] = envLists[id] || []).push(c.id); }));
const api = Bridge.load(APP, { ListCoverUtils: Utils, ListCoverArt: Art }, { i18n: I18N, envs: ENVS, lists: Fx.ALL.map(c => ({ id: c.id, name: c.name })), envLists });
const opts = { reviews: REVIEWS };
const ALL_IDS = ENVS.map(e => e.id);
/* A deterministic pseudo-random list, so "large lists" are a fixed test, never a flaky one. */
function lcg(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
const sample = (seed, n) => { const r = lcg(seed); const pool = [...ALL_IDS]; const out = []; while (out.length < n) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]); return out; };
const deepFreeze = o => { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };

test('fixtures: real environment ids, no repeats inside a list, unique case ids', () => {
  const ids = new Set(ALL_IDS);
  assert.equal(new Set(Fx.ALL.map(c => c.id)).size, Fx.ALL.length);
  Fx.ALL.forEach(c => {
    assert.equal(new Set(c.envIds).size, c.envIds.length, c.id + ' repeats an environment');
    c.envIds.forEach(id => assert.ok(ids.has(id), c.id + ': ' + id));
  });
  ['baldur-test', 'campaign-test', 'darkheart', 'baldur-upper'].forEach(id => assert.match(Fx.ALL.find(c => c.id === id).kind, /stand-in/));
});

test('the problem list reproduces the report: marsh, warm interior, ship', () => {
  const a = analyse(Fx.ALL.find(c => c.id === 'baldur-test').envIds);
  assert.deepEqual(a.production.tiles.map(t => t.imageId).sort(), ['archetype:blighted-mires', 'archetype:seafaring', 'archetype:taverns-and-inns']);
  assert.equal(Fx.ALL.find(c => c.id === 'baldur-test').envIds.length, 6);
});

test('1: Strategy A is production — byte-identical cover markup for every fixture', () => {
  Fx.ALL.forEach(c => {
    const a = Core.analyse(api.envsInList(c.id).map(e => ({ id: e.id, artBiome: api.artBiome(e) })), Art, Utils); /* catalogue order, as the app reads a list */
    const prod = api.prodListCoverHtml({ id: c.id });
    const lab = Bridge.coverHtml(Core.compose('A', a, Art), api, Art) || prod;
    assert.equal(lab, prod, c.id);
    assert.equal(Core.compose('A', a, Art).panels.length, a.production.tiles.length);
  });
});

test('2: composition only rearranges pictures production already chose', () => {
  Fx.ALL.concat([{ id: 'r1', envIds: sample(1, 14) }, { id: 'r2', envIds: sample(2, 30) }]).forEach(c => {
    const a = analyse(c.envIds);
    const allowed = new Set(a.production.tiles.map(t => t.imageId));
    Core.STRATEGY_IDS.forEach(s => Core.compose(s, a, Art, opts).panels.forEach(p => assert.ok(allowed.has(p.imageId), `${c.id} ${s} ${p.imageId}`)));
    assert.deepEqual(a.candidates.map(x => x.imageId).sort(), [...allowed].sort());
  });
});

test('3/13: one family per cover — never two cuts of one parent; parent ids intact', () => {
  const a = analyse(['bustling-marketplace', 'resting-dagger-inn', 'outpost-town', 'ancient-tomb']);
  const parents = a.candidates.map(c => c.parent);
  assert.equal(new Set(parents).size, parents.length);
  assert.ok(a.distinct > a.candidates.length, 'several pictures collapsed into one family');
  assert.equal(a.candidates.find(c => c.imageId === 'crop:market-stalls').parent, 'archetype:streets-and-towns');
  for (let i = 0; i < 40; i++) {
    const b = analyse(sample(100 + i, 3 + (i % 12)));
    const ps = Core.STRATEGY_IDS.flatMap(s => { const k = Core.compose(s, b, Art, opts); const p = k.panels.map(x => x.parent); assert.equal(new Set(p).size, p.length); return p; });
    assert.ok(ps.every(Boolean));
  }
});

test('4: a unique painting is the strongest candidate and a hero/main panel wins it', () => {
  const a = analyse(['cauldera-valley', 'ancient-tomb', 'ocean-voyage']);
  assert.equal(a.candidates[0].imageId, 'env:cauldera-valley');
  assert.equal(Core.compose('C', a, Art).panels[0].imageId, 'env:cauldera-valley');
  assert.equal(Core.compose('D', a, Art).panels[0].imageId, 'env:cauldera-valley');
});

test('5/6/7/8/9: no repeated picture; zero, one, two and three-image covers all compose', () => {
  const sizes = new Set();
  Fx.ALL.concat([{ id: 'r', envIds: sample(7, 20) }]).forEach(c => {
    const a = analyse(c.envIds);
    Core.STRATEGY_IDS.forEach(s => {
      const k = Core.compose(s, a, Art, opts);
      const ids = k.panels.map(p => p.imageId);
      assert.equal(new Set(ids).size, ids.length, `${c.id} ${s}`);
      assert.equal(k.layout, k.panels.length);
      if (k.panels.length) assert.ok(Math.abs(k.panels.reduce((n, p) => n + p.fraction, 0) - 1) < 0.02, `${c.id} ${s} widths`);
      assert.equal(new Set([...k.panels.map(p => p.imageId), ...k.omitted]).size, a.candidates.length, 'included + omitted = candidates');
      sizes.add(s + k.layout);
    });
  });
  ['A0', 'A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'D1', 'D2', 'E0', 'E1', 'E2', 'E3'].forEach(k => assert.ok(sizes.has(k), 'never produced ' + k));
  const empty = Core.compose('E', analyse([]), Art, opts);
  assert.equal(empty.layout, 0);
  assert.equal(Bridge.coverHtml(empty, api, Art), null);
  assert.match(api.prodListCoverHtml({ id: 's-empty' }), /is-neutral is-empty/);
});

test('10/11: large lists are deterministic and the order is stable', () => {
  const ids = sample(42, 60);
  const a1 = JSON.stringify(Core.STRATEGY_IDS.map(s => Core.compose(s, analyse(ids), Art, opts)));
  const a2 = JSON.stringify(Core.STRATEGY_IDS.map(s => Core.compose(s, analyse(ids), Art, opts)));
  assert.equal(a1, a2);
  const c = analyse(ids).candidates;
  assert.deepEqual(c.map(x => x.rank), c.map((_, i) => i));
  const b = Core.compose('B', analyse(ids), Art), order = analyse(ids).candidates.filter(x => b.panels.some(p => p.imageId === x.imageId)).sort((x, y) => x.order - y.order).map(x => x.imageId);
  assert.deepEqual(b.panels.map(p => p.imageId), order, 'B shows its two in catalogue order');
});

test('12: lab crop adjustments never mutate the production registry; zoom is capped', () => {
  const before = JSON.stringify(Art);
  const frozen = deepFreeze(JSON.parse(before));
  const f = Core.framing(frozen, 'archetype:taverns-and-inns', 1 / 3, { 'archetype:taverns-and-inns@3': { x: 88, y: 45, scale: 9 } });
  assert.deepEqual([f.x, f.y, f.scale, f.overridden], [88, 45, Core.MAX_SCALE, true]);
  assert.equal(Core.framing(frozen, 'archetype:taverns-and-inns', 1 / 3, {}).x, 30);
  assert.equal(Core.framing(frozen, 'archetype:taverns-and-inns', 1 / 3, { 'archetype:taverns-and-inns@3': { x: -50 } }).x, 0);
  Core.compose('D', analyse(Fx.ALL[0].envIds), frozen, { overrides: { 'archetype:seafaring@2': { x: 10 } } });
  assert.equal(JSON.stringify(Art), before);
  assert.deepEqual([Core.bucketOf(1), Core.bucketOf(0.67), Core.bucketOf(0.5), Core.bucketOf(0.33)], [1, 2, 2, 3]);
});

test('D keeps its ratio; unequal panels add only a grid template, no new image markup', () => {
  const a = analyse(Fx.ALL[0].envIds);
  Object.entries(Core.RATIOS).forEach(([name, f]) => {
    const k = Core.compose('D', a, Art, { ratio: name });
    assert.deepEqual(k.panels.map(p => p.fraction), [f, Math.round((1 - f) * 100) / 100]);
    assert.match(Bridge.coverHtml(k, api, Art), /grid-template-columns:/);
  });
  assert.doesNotMatch(Bridge.coverHtml(Core.compose('B', a, Art), api, Art), /grid-template-columns/);
});

test('review model: every picture a cover can wear has a context-dependent rating', () => {
  Object.keys(Art.IMAGES).forEach(id => {
    const r = REVIEWS[id];
    assert.ok(r, 'unreviewed ' + id);
    ['hero', 'half', 'third'].forEach(k => assert.ok(['excellent', 'acceptable', 'poor'].includes(r[k]), id + ' ' + k));
    assert.ok(['calm', 'moderate', 'busy'].includes(r.complexity));
    assert.equal(r.reviewer, 'claude-provisional');
  });
  assert.ok(Object.keys(REVIEWS).every(id => Art.IMAGES[id]), 'a review names a picture that does not exist');
  assert.ok(Object.values(REVIEWS).some(r => r.hero === 'excellent' && r.third === 'poor'), 'a picture can be excellent as a hero and poor as a third');
});

test('E: reviewed adaptive rules — keeps the good triptychs, thins the busy ones, marks the unreviewed', () => {
  const E = id => Core.compose('E', analyse(Fx.ALL.find(c => c.id === id).envIds), Art, opts);
  assert.equal(E('darkheart').layout, 3, 'a calm triptych is preserved');
  assert.equal(E('s-calm3').layout, 3);
  const bad = E('baldur-test');
  assert.equal(bad.layout, 2);
  assert.ok(bad.omitted.includes('archetype:taverns-and-inns'));
  assert.equal(E('baldur-upper').layout, 1);
  assert.equal(E('s-empty').layout, 0);
  /* no reviews at all: production's arrangement, provisional */
  const none = Core.compose('E', analyse(Fx.ALL[0].envIds), Art, { reviews: {} });
  assert.equal(none.layout, 3);
  assert.equal(none.provisional, true);
  assert.equal(none.rule, 'unreviewed-keep-production');
  assert.ok(Core.STRATEGY_IDS.every(s => Core.compose(s, analyse(Fx.ALL[0].envIds), Art, opts).explanation.length > 10), 'every choice is explained');
  /* the rules never need a per-combination table: they read only per-picture ratings */
  assert.doesNotMatch(read('lab/cover-composition/lab-core.js'), /baldur|darkheart|campaign/i);
});

test('14: the review export is valid structured JSON with the required fields', () => {
  const analyses = {}, comps = {};
  Fx.ALL.forEach(c => { analyses[c.id] = analyse(c.envIds); comps[c.id] = {}; Core.STRATEGY_IDS.forEach(s => { comps[c.id][s] = Core.compose(s, analyses[c.id], Art, opts); }); });
  const exp = Core.buildExport({ cases: Fx.ALL, prefs: { 'baldur-test': 'B' }, notes: { 'baldur-test': 'calmer' }, crops: { 'archetype:taverns-and-inns@3': { x: 88 } }, reviews: REVIEWS, ratio: '67:33', generated: '2026-11-03' }, analyses, comps);
  const round = JSON.parse(JSON.stringify(exp));
  assert.deepEqual(round, exp);
  assert.equal(round.cases.length, Fx.ALL.length);
  const c = round.cases.find(x => x.fixture === 'baldur-test');
  assert.equal(c.preference, 'B');
  assert.equal(c.notes, 'calmer');
  assert.ok(c.environmentIds.length && c.artworkCandidates.length && c.parentArtworkIds.length);
  assert.deepEqual(Object.keys(c.compositions), Core.STRATEGY_IDS);
  assert.ok(c.compositions.B.included.length && Array.isArray(c.compositions.B.omitted));
  assert.ok(round.cropSettings['archetype:taverns-and-inns@3']);
  assert.ok(round.pictureReviews['archetype:seafaring']);
});

test('15/16/17: production storage, card geometry and other surfaces are untouched by the lab', () => {
  const labFiles = fs.readdirSync(path.join(ROOT, 'lab/cover-composition')).map(f => read('lab/cover-composition/' + f));
  labFiles.forEach(src => assert.doesNotMatch(src, /dhcodex_/, 'the lab touches a production key'));
  const ui = read('lab/cover-composition/lab-ui.js');
  assert.doesNotMatch(ui, /dhcodex/);
  assert.match(ui, /labcc2:state/);
  const css = read('css/styles.css');
  assert.match(css, /\.list-card-cover \{[^}]*height: 90px;/);
  assert.doesNotMatch(read('lab/cover-composition/lab.css'), /list-card-cover\s*\{[^}]*height/);
  ['js/app.js', 'index.html', 'js/list-cover-art.js', 'js/list-cover-utils.js', 'js/catalog-art.js', 'js/prep-art.js', 'css/styles.css'].forEach(f => assert.doesNotMatch(read(f), /lab\/cover-composition|CoverComposition/, f));
  fs.readdirSync(path.join(ROOT, 'js')).filter(f => /journey/.test(f)).forEach(f => assert.doesNotMatch(read('js/' + f), /cover-composition/));
  assert.equal(Utils.COVER_MAX, 3);
});

test('18: the lab and its evidence never ship', () => {
  assert.ok(isExcluded('lab/cover-composition/lab-core.js'));
  assert.ok(isExcluded('docs/research/my-lists-cover-composition-lab-v2/screens/page-A-1440.png'));
  assert.ok(isExcluded('lab/cover-composition/page-hook.js'));
});
