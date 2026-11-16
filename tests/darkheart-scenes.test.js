/* ============================================================
   Bacchus's Atlas — tests/darkheart-scenes.test.js
   The Darkheart compatibility manifest (data/darkheart-scenes.json, PD-097):
   the schema's twelve outcomes, content fingerprints, every validation rule in
   scripts/lib/darkheart-scenes.js, the quarantine of stale mappings, the review
   queue, the validate-data wiring, and the guarantee that the data stays out of
   the initial page. Run with:

     node --test tests/darkheart-scenes.test.js

   Negative cases mutate a deep copy of the real manifest/catalogue or a tiny
   synthetic environment; the checked-in data is never written.
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const D = require('../scripts/lib/darkheart-scenes.js');
const { validateRepositoryData, validateDarkheartScenes } = require('../scripts/validate-data.js');
const ListCoverArt = require('../js/list-cover-art.js');
const CatalogArt = require('../js/catalog-art.js');

const ROOT = path.join(__dirname, '..');
const clone = x => JSON.parse(JSON.stringify(x));
const realEnvs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/environments.json'), 'utf8')).environments;
const realManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/darkheart-scenes.json'), 'utf8'));
const realCtx = {
  resolveArt: env => CatalogArt.resolveCatalogArt(env, ListCoverArt),
  biomeAssetExists: b => fs.existsSync(path.join(ROOT, 'img/biomes', `${b}-200.webp`)),
};

function analyze(manifest, environments, ctx) {
  return D.analyzeManifest(manifest, Object.assign({}, ctx, { environments }));
}
function codes(analysis, severity) {
  return analysis.problems.filter(p => !severity || p.severity === severity).map(p => p.code);
}
function sceneState(analysis, id) { return analysis.scenes.find(s => s.id === id); }

/* ---------------- synthetic fixtures ---------------- */

function feat(type, name, description, prompt) {
  return { type, name: { en: name, ru: name }, description: { en: description, ru: description }, prompt: prompt ? { en: prompt, ru: prompt } : undefined };
}
function fxEnv(overrides = {}) {
  return Object.assign({
    id: 'fx-env', tier: 1, type: 'exploration', difficulty: 11,
    name: { en: 'Fx Env', ru: 'Фикс' },
    lore: { en: 'A fixture place.', ru: 'Тестовое место.' },
    biomes: ['forest'],
    potential_adversaries: { en: ['Wolf'], ru: ['Волк'] },
    features: [
      feat('passive', 'Alpha', 'Alpha makes the way slow.'),
      feat('action', 'Beta', 'Spend a Fear to start a fight.'),
      feat('reaction', 'Gamma', 'When a PC shouts, something answers.'),
    ],
  }, overrides);
}
const bi = (en, ru) => ({ en, ru });
function fxScene(env, overrides = {}) {
  return Object.assign({
    id: 'fx-scene', envId: env.id, match: 'partial', status: 'approved',
    terrain: ['forest'],
    features: [{ name: 'Alpha', type: 'passive', fp: D.featureFingerprint(env.features[0]) }],
    excluded: [
      { name: 'Beta', type: 'action', reason: 'A fight.' },
      { name: 'Gamma', type: 'reaction', reason: 'A shout.' },
    ],
    standaloneNote: 'Alpha stands alone.',
    adversaries: 'none',
    art: { mode: 'none', reason: 'No art needed.' },
    outcomes: [{ outcome: 'hazard-fail-hope', framing: { title: bi('Slow Way', 'Медленный путь'), summary: bi('The way is slow.', 'Путь медленный.') } }],
  }, overrides);
}
function fxManifest(env, sceneOverrides, reviewOverrides) {
  return {
    schema: 1, fingerprintVersion: 1,
    reviews: [Object.assign({ envId: env.id, status: 'reviewed', compatibility: 'native-forest', envFp: D.environmentFingerprint(env), reviewedOn: '2026-11-16' }, reviewOverrides)],
    scenes: [fxScene(env, sceneOverrides)],
  };
}
function fx(sceneOverrides, reviewOverrides, envOverrides) {
  const env = fxEnv(envOverrides);
  return { env, manifest: fxManifest(env, sceneOverrides, reviewOverrides) };
}
function expectBlocked(manifest, envs, code, ctx) {
  const a = analyze(manifest, envs, ctx);
  assert.ok(codes(a, 'error').includes(code), `expected an error "${code}", got ${JSON.stringify(a.problems.map(p => `${p.severity}:${p.code}`))}`);
  assert.equal(a.scenes.filter(s => s.selectable).length, 0, 'a scene with an error must not stay selectable');
  return a;
}

/* ---------------- the twelve outcomes ---------------- */

test('the twelve Darkheart outcomes are all present and distinct', () => {
  assert.equal(D.OUTCOME_KEYS.length, 12);
  assert.equal(new Set(D.OUTCOME_KEYS).size, 12);
  const byEncounter = {};
  for (const k of D.OUTCOME_KEYS) (byEncounter[D.OUTCOMES[k].encounter] ||= []).push(D.OUTCOMES[k].result);
  assert.deepEqual(Object.keys(byEncounter).sort(), ['creature', 'hazard', 'landmark', 'resource']);
  for (const kind of ['creature', 'landmark']) {
    assert.deepEqual(byEncounter[kind].sort(), ['failure-with-fear', 'failure-with-hope', 'success-with-fear', 'success-with-hope']);
  }
  assert.deepEqual(byEncounter.hazard.sort(), ['failure-with-fear', 'failure-with-hope']);
  assert.deepEqual(byEncounter.resource.sort(), ['success-with-fear', 'success-with-hope']);
  const rules = D.OUTCOME_KEYS.map(k => D.OUTCOMES[k].rule);
  assert.equal(new Set(rules).size, 12);
});

/* ---------------- the production manifest ---------------- */

test('the checked-in manifest validates with no errors and every scene is selectable', () => {
  const a = analyze(realManifest, realEnvs, realCtx);
  assert.deepEqual(a.problems.filter(p => p.severity === 'error'), []);
  assert.equal(a.problems.filter(p => p.severity === 'warning').length, 0);
  assert.equal(a.coverage.selectable, a.coverage.scenes);
  assert.ok(a.coverage.scenes >= 1);
});

test('the seed contains validated FULL, PARTIAL and ADAPTED scenes', () => {
  const a = analyze(realManifest, realEnvs, realCtx);
  for (const m of D.SCENE_MATCHES) assert.ok(a.coverage.byMatch[m] >= 1, `no selectable ${m} scene in the seed`);
});

test('the seed records an environment reviewed with no compatible outcome', () => {
  const none = realManifest.reviews.find(r => r.status === 'reviewed-none');
  assert.ok(none, 'expected one reviewed-none environment');
  assert.ok(none.reason.length > 20);
  assert.equal(realManifest.scenes.some(s => s.envId === none.envId), false);
});

test('one scene may map several outcomes, each with its own framing and adaptation', () => {
  const multi = realManifest.scenes.find(s => s.outcomes.length > 1);
  assert.ok(multi, 'expected a multi-outcome scene in the seed');
  const titles = multi.outcomes.map(o => o.framing.title.en);
  assert.equal(new Set(titles).size, titles.length);
  const adaptations = multi.outcomes.map(o => o.adaptation.changes[0].source);
  assert.equal(new Set(adaptations).size, adaptations.length);
});

test('every seeded scene is bilingual in framing and adaptation', () => {
  for (const s of realManifest.scenes) {
    for (const o of s.outcomes) {
      for (const t of [o.framing.title, o.framing.summary]) { assert.ok(t.en && t.ru && /[Ѐ-ӿ]/.test(t.ru), s.id); }
      for (const c of (o.adaptation ? o.adaptation.changes : [])) assert.ok(c.adapted.en && /[Ѐ-ӿ]/.test(c.adapted.ru), s.id);
    }
  }
});

test('analysis never mutates the catalogue or the manifest', () => {
  const envs = clone(realEnvs); const manifest = clone(realManifest);
  const frozen = JSON.stringify([envs, manifest]);
  analyze(manifest, envs, realCtx);
  D.getSelectableScenes(manifest, envs, realCtx);
  D.reviewQueue(manifest, envs);
  assert.equal(JSON.stringify([envs, manifest]), frozen);
});

/* ---------------- fingerprints ---------------- */

test('feature fingerprints ignore punctuation, quotes, case and spacing but not words', () => {
  const f = feat('passive', 'Name', 'Spend a Fear to make the “wolves” howl.');
  const same = feat('passive', 'Name', "spend a fear to make the  'wolves' howl");
  const changed = feat('passive', 'Name', 'Spend 2 Fear to make the “wolves” howl.');
  const retyped = feat('action', 'Name', 'Spend a Fear to make the “wolves” howl.');
  assert.equal(D.featureFingerprint(f), D.featureFingerprint(same));
  assert.notEqual(D.featureFingerprint(f), D.featureFingerprint(changed));
  assert.notEqual(D.featureFingerprint(f), D.featureFingerprint(retyped));
  assert.match(D.featureFingerprint(f), /^[0-9a-f]{14}$/);
});

test('a Russian-only or prompt-only edit does not stale a pin; an English change does', () => {
  const f = feat('passive', 'Name', 'Text one.', 'A prompt?');
  const base = D.featureFingerprint(f);
  assert.equal(D.featureFingerprint(Object.assign(clone(f), { prompt: { en: 'Another?', ru: 'Другое?' } })), base);
  const ru = clone(f); ru.description.ru = 'Исправленный перевод.';
  assert.equal(D.featureFingerprint(ru), base);
  const en = clone(f); en.description.en = 'Text two.';
  assert.notEqual(D.featureFingerprint(en), base);
});

test('the environment fingerprint changes with biome, tier, lore, adversaries and features', () => {
  const e = fxEnv(); const base = D.environmentFingerprint(e);
  for (const mutate of [
    x => { x.biomes = ['aquatic']; },
    x => { x.tier = 2; },
    x => { x.lore.en = 'Different.'; },
    x => { x.potential_adversaries.en = ['Bear']; },
    x => { x.features[0].description.en = 'Alpha now does more.'; },
    x => { x.features.pop(); },
  ]) { const m = clone(e); mutate(m); assert.notEqual(D.environmentFingerprint(m), base); }
});

/* ---------------- validation rules ---------------- */

test('a clean synthetic manifest passes', () => {
  const { env, manifest } = fx();
  const a = analyze(manifest, [env]);
  assert.deepEqual(a.problems, []);
  assert.equal(sceneState(a, 'fx-scene').selectable, true);
});

test('unknown environment references are rejected', () => {
  const { env, manifest } = fx({ envId: 'nope' });
  expectBlocked(manifest, [env], 'unknown-environment');
  const r = fx(); r.manifest.reviews[0].envId = 'nope';
  assert.ok(codes(analyze(r.manifest, [r.env]), 'error').includes('unknown-environment'));
});

test('unknown feature references are rejected, by name and by type', () => {
  const a = fx(); a.manifest.scenes[0].features[0].name = 'Missing';
  expectBlocked(a.manifest, [a.env], 'unknown-feature');
  const b = fx(); b.manifest.scenes[0].features[0].type = 'action';
  expectBlocked(b.manifest, [b.env], 'unknown-feature');
});

test('ambiguous feature references are rejected', () => {
  const env = fxEnv({ features: [feat('passive', 'Alpha', 'One.'), feat('passive', 'Alpha', 'Two.'), feat('action', 'Beta', 'Three.')] });
  const manifest = fxManifest(env, {
    features: [{ name: 'Alpha', type: 'passive', fp: D.featureFingerprint(env.features[0]) }],
    excluded: [{ name: 'Beta', type: 'action', reason: 'x' }],
  });
  expectBlocked(manifest, [env], 'ambiguous-feature');
});

test('a changed source feature makes the scene stale and withholds it', () => {
  const { env, manifest } = fx();
  const changed = clone(env); changed.features[0].description.en = 'Alpha now blocks the way entirely.';
  const a = expectBlocked(manifest, [changed], 'stale-feature');
  assert.ok(a.problems.some(p => p.code === 'stale-feature' && /Re-read it/.test(p.message)));
  assert.deepEqual(D.getSelectableScenes(manifest, [changed]), []);
});

test('a house-style fix (quotes, punctuation, case) does not stale a scene', () => {
  const { env, manifest } = fx();
  const polished = clone(env); polished.features[0].description.en = 'ALPHA makes the way slow';
  const a = analyze(manifest, [polished]);
  assert.equal(codes(a, 'error').length, 0);
  assert.equal(D.getSelectableScenes(manifest, [polished]).length, 1);
});

test('an unrelated edit to the environment is a review warning, not an error', () => {
  const { env, manifest } = fx();
  const edited = clone(env); edited.lore.en = 'A rewritten lore line.';
  const a = analyze(manifest, [edited]);
  assert.equal(codes(a, 'error').length, 0);
  assert.ok(codes(a, 'warning').includes('stale-review'));
  assert.equal(D.getSelectableScenes(manifest, [edited]).length, 1);
});

test('a stale FULL scene is withheld when any part of the environment changes', () => {
  const env = fxEnv();
  const manifest = fxManifest(env, { match: 'full', features: undefined, excluded: undefined, standaloneNote: undefined, envFp: D.environmentFingerprint(env) });
  assert.equal(codes(analyze(manifest, [env]), 'error').length, 0);
  const changed = clone(env); changed.biomes = ['forest', 'mountain'];
  expectBlocked(manifest, [changed], 'stale-environment');
});

test('a suspended scene is never selectable and its drift is only a warning', () => {
  const { env, manifest } = fx({ status: 'suspended', suspendedReason: 'Waiting for the book to be re-checked.' });
  const changed = clone(env); changed.features[0].description.en = 'Totally different.';
  const a = analyze(manifest, [changed]);
  assert.equal(codes(a, 'error').length, 0);
  assert.ok(codes(a, 'warning').includes('stale-feature'));
  assert.deepEqual(D.getSelectableScenes(manifest, [changed]), []);
  assert.deepEqual(D.getSelectableScenes(manifest, [env]), []);
  const noReason = fx({ status: 'suspended' });
  expectBlocked(noReason.manifest, [noReason.env], 'invalid-scene-status');
});

test('a manifest with an unknown fingerprint version trusts no pin', () => {
  const { env, manifest } = fx(); manifest.fingerprintVersion = 2;
  const a = analyze(manifest, [env]);
  assert.ok(codes(a, 'error').includes('stale-fingerprint-version'));
  assert.deepEqual(D.getSelectableScenes(manifest, [env]), []);
});

test('invalid outcome keys, review statuses, scene statuses and matches are rejected', () => {
  const a = fx(); a.manifest.scenes[0].outcomes[0].outcome = 'creature-fail';
  expectBlocked(a.manifest, [a.env], 'invalid-outcome');
  const b = fx(); b.manifest.reviews[0].status = 'done';
  assert.ok(codes(analyze(b.manifest, [b.env]), 'error').includes('invalid-review-status'));
  assert.equal(D.getSelectableScenes(b.manifest, [b.env]).length, 0);
  const c = fx({ status: 'live' });
  expectBlocked(c.manifest, [c.env], 'invalid-scene-status');
  const d = fx({ match: 'mostly' });
  expectBlocked(d.manifest, [d.env], 'invalid-match');
});

test('duplicate mappings and duplicate ids are rejected', () => {
  const { env, manifest } = fx();
  const dup = clone(manifest.scenes[0]); dup.id = 'fx-scene-two';
  manifest.scenes.push(dup);
  const a = analyze(manifest, [env]);
  assert.ok(codes(a, 'error').includes('duplicate-mapping'));
  assert.equal(sceneState(a, 'fx-scene-two').selectable, false);
  const sameId = fx(); sameId.manifest.scenes.push(clone(sameId.manifest.scenes[0]));
  assert.ok(codes(analyze(sameId.manifest, [sameId.env]), 'error').includes('duplicate-id'));
  const twice = fx(); twice.manifest.scenes[0].outcomes.push(clone(twice.manifest.scenes[0].outcomes[0]));
  assert.ok(codes(analyze(twice.manifest, [twice.env]), 'error').includes('duplicate-mapping'));
  const dupReview = fx(); dupReview.manifest.reviews.push(clone(dupReview.manifest.reviews[0]));
  assert.ok(codes(analyze(dupReview.manifest, [dupReview.env]), 'error').includes('duplicate-review'));
});

test('the same outcome from different fragments of one environment is allowed', () => {
  const { env, manifest } = fx();
  const other = clone(manifest.scenes[0]);
  other.id = 'fx-scene-beta';
  other.features = [{ name: 'Beta', type: 'action', fp: D.featureFingerprint(env.features[1]) }];
  other.excluded = [{ name: 'Alpha', type: 'passive', reason: 'x' }, { name: 'Gamma', type: 'reaction', reason: 'y' }];
  manifest.scenes.push(other);
  assert.deepEqual(codes(analyze(manifest, [env]), 'error'), []);
});

test('FULL / PARTIAL / ADAPTED combinations are validated', () => {
  const env = fxEnv();
  const fullWithFeatures = fxManifest(env, { match: 'full', envFp: D.environmentFingerprint(env) });
  expectBlocked(fullWithFeatures, [env], 'invalid-full-partial');
  const partialAll = fxManifest(env, {
    features: env.features.map(f => ({ name: f.name.en, type: f.type, fp: D.featureFingerprint(f) })), excluded: [],
  });
  expectBlocked(partialAll, [env], 'invalid-full-partial');
  const partialNone = fxManifest(env, { features: undefined, excluded: undefined, standaloneNote: undefined });
  expectBlocked(partialNone, [env], 'invalid-full-partial');
  const partialPin = fxManifest(env, { envFp: D.environmentFingerprint(env) });
  expectBlocked(partialPin, [env], 'invalid-full-partial');
  const fullNoPin = fxManifest(env, { match: 'full', features: undefined, excluded: undefined, standaloneNote: undefined });
  expectBlocked(fullNoPin, [env], 'stale-environment');
  const fullSource = fxManifest(env, { adversaries: 'source' });
  expectBlocked(fullSource, [env], 'invalid-adversaries');
});

test('"source" adversaries need a whole-environment scene and a real adversary list', () => {
  const env = fxEnv();
  const ok = fxManifest(env, { match: 'full', features: undefined, excluded: undefined, standaloneNote: undefined, envFp: D.environmentFingerprint(env), adversaries: 'source' });
  assert.deepEqual(codes(analyze(ok, [env]), 'error'), []);
  const noAdv = fxEnv({ potential_adversaries: { en: ['None'], ru: ['Нет'] } });
  const bad = fxManifest(noAdv, { match: 'full', features: undefined, excluded: undefined, standaloneNote: undefined, envFp: D.environmentFingerprint(noAdv), adversaries: 'source' });
  expectBlocked(bad, [noAdv], 'invalid-adversaries');
});

test('missing bilingual framing is rejected', () => {
  const a = fx(); delete a.manifest.scenes[0].outcomes[0].framing.title.ru;
  expectBlocked(a.manifest, [a.env], 'missing-bilingual');
  const b = fx(); b.manifest.scenes[0].outcomes[0].framing.summary.ru = 'The way is slow.';
  expectBlocked(b.manifest, [b.env], 'missing-bilingual');
  const c = fx(); delete c.manifest.scenes[0].outcomes[0].framing;
  expectBlocked(c.manifest, [c.env], 'missing-bilingual');
  const d = fx(); d.manifest.scenes[0].outcomes[0].framing.title.en = ' ';
  expectBlocked(d.manifest, [d.env], 'missing-bilingual');
});

test('every left-out sibling must be accounted for', () => {
  const a = fx(); a.manifest.scenes[0].excluded.pop();
  expectBlocked(a.manifest, [a.env], 'unresolved-sibling');
  const b = fx(); delete b.manifest.scenes[0].excluded;
  expectBlocked(b.manifest, [b.env], 'unresolved-sibling');
  const c = fx(); delete c.manifest.scenes[0].standaloneNote;
  expectBlocked(c.manifest, [c.env], 'unresolved-sibling');
  const d = fx(); d.manifest.scenes[0].excluded[0].reason = '';
  expectBlocked(d.manifest, [d.env], 'unresolved-sibling');
});

test('a feature added to the environment after review leaves the scene unresolved', () => {
  const { env, manifest } = fx();
  const grown = clone(env); grown.features.push(feat('action', 'Delta', 'A new thing happens.'));
  expectBlocked(manifest, [grown], 'unresolved-sibling');
});

test('an excluded feature that was renamed or removed leaves the scene unresolved', () => {
  const { env, manifest } = fx();
  const renamed = clone(env); renamed.features[1].name.en = 'Beta Prime';
  const a = analyze(manifest, [renamed]);
  assert.ok(codes(a, 'error').includes('unresolved-sibling'));
  assert.equal(a.scenes[0].selectable, false);
});

test('a shown feature that leans on a left-out sibling is a source dependency', () => {
  const env = fxEnv({ features: [
    feat('passive', 'Alpha', 'The way is slow; see Gamma for what answers.'),
    feat('action', 'Beta', 'Spend a Fear to start a fight.'),
    feat('reaction', 'Gamma', 'When a PC shouts, something answers.'),
  ] });
  const manifest = fxManifest(env);
  const a = expectBlocked(manifest, [env], 'unresolved-sibling');
  assert.ok(a.problems.some(p => /refers to "Gamma"/.test(p.message)));
  manifest.scenes[0].dependencyNotes = [{ from: 'Alpha', to: 'Gamma', note: 'Only a pointer to flavour; Alpha works without it.' }];
  assert.deepEqual(codes(analyze(manifest, [env]), 'error'), []);
  manifest.scenes[0].dependencyNotes = [{ from: 'Alpha', to: 'Gamma', note: '' }];
  assert.ok(codes(analyze(manifest, [env]), 'error').includes('unresolved-sibling'));
});

test('the real seed has no hidden dependencies: showing a sibling would change nothing but the list', () => {
  const a = analyze(realManifest, realEnvs, realCtx);
  assert.equal(codes(a).filter(c => c === 'unresolved-sibling').length, 0);
  assert.ok(D.findSiblingReferences(feat('passive', 'X', 'Uses the Alpha feature.'), [feat('passive', 'Alpha', 'a')]).length === 1);
});

test('terrain references are validated against the environment and its compatibility class', () => {
  const unknown = fx({ terrain: ['woods'] });
  expectBlocked(unknown.manifest, [unknown.env], 'invalid-terrain');
  const empty = fx({ terrain: [] });
  expectBlocked(empty.manifest, [empty.env], 'invalid-terrain');
  const notForest = fx({ terrain: ['mountain'] });
  expectBlocked(notForest.manifest, [notForest.env], 'invalid-terrain');
  const nativeAny = fx({ terrain: ['any'] });
  expectBlocked(nativeAny.manifest, [nativeAny.env], 'invalid-terrain');
  const dup = fx({ terrain: ['forest', 'forest'] });
  expectBlocked(dup.manifest, [dup.env], 'invalid-terrain');
  const ok = fx({ terrain: ['forest', 'mountain'] }, undefined, { biomes: ['forest', 'mountain'] });
  assert.deepEqual(codes(analyze(ok.manifest, [ok.env]), 'error'), []);
});

test('compatibility classes follow the environment: forest-tagged is native, others are not', () => {
  const nativeNotForest = fx({ terrain: ['mountain'] }, undefined, { biomes: ['mountain'] });
  assert.ok(codes(analyze(nativeNotForest.manifest, [nativeNotForest.env]), 'error').includes('invalid-compatibility'));
  const naturalButForest = fx(undefined, { compatibility: 'naturally-compatible', rationale: 'Works anywhere.' });
  assert.ok(codes(analyze(naturalButForest.manifest, [naturalButForest.env]), 'error').includes('invalid-compatibility'));
  const naturalOk = fx({ terrain: ['any'] }, { compatibility: 'naturally-compatible', rationale: 'No terrain named.' }, { biomes: ['grassland'] });
  assert.deepEqual(codes(analyze(naturalOk.manifest, [naturalOk.env]), 'error'), []);
  const naturalNoRationale = fx({ terrain: ['any'] }, { compatibility: 'naturally-compatible' }, { biomes: ['grassland'] });
  assert.ok(codes(analyze(naturalNoRationale.manifest, [naturalNoRationale.env]), 'error').includes('invalid-review'));
  const badClass = fx(undefined, { compatibility: 'sort-of' });
  assert.ok(codes(analyze(badClass.manifest, [badClass.env]), 'error').includes('invalid-compatibility'));
});

test('a conditionally-adaptable environment only supports ADAPTED scenes, with a recorded terrain change', () => {
  const env = fxEnv({ biomes: ['drylands'] });
  const review = { compatibility: 'conditionally-adaptable', rationale: 'A dry gully can be read as a forest clearing.' };
  const partial = fxManifest(env, { terrain: ['forest'] }, review);
  assert.ok(codes(analyze(partial, [env]), 'error').includes('invalid-match'));

  const adaptedScene = {
    match: 'adapted', terrain: ['forest'],
    outcomes: [{
      outcome: 'hazard-fail-hope',
      framing: { title: bi('Dry Gully', 'Сухой овраг'), summary: bi('A gully.', 'Овраг.') },
      adaptation: {
        summary: bi('Read as a forest gully.', 'Читается как лесной овраг.'),
        changes: [{ kind: 'terrain', target: 'Alpha', source: 'Alpha makes the way slow', adapted: bi('Roots slow the way.', 'Корни замедляют путь.'), why: 'Only the ground changes; the slowing stays as printed.' }],
      },
    }],
  };
  const ok = fxManifest(env, adaptedScene, review);
  assert.deepEqual(codes(analyze(ok, [env]), 'error'), []);
  const noTerrainChange = clone(ok); noTerrainChange.scenes[0].outcomes[0].adaptation.changes[0].kind = 'presentation';
  expectBlocked(noTerrainChange, [env], 'invalid-terrain');
});

test('no tier restricts a scene: any environment tier is fine, and a leftover tiers key is an error (PD-100)', () => {
  for (const tier of [1, 2, 3, 4]) {
    const env = fxEnv({ tier });
    assert.deepEqual(codes(analyze(fxManifest(env), [env]), 'error'), [], `tier ${tier}`);
  }
  const a = fx({ tiers: [1] });
  expectBlocked(a.manifest, [a.env], 'unknown-key');
});

test('adaptations are explicit, quoted from the source, and only on ADAPTED scenes', () => {
  const { env, manifest } = fx();
  const withAdaptation = clone(manifest);
  withAdaptation.scenes[0].outcomes[0].adaptation = { summary: bi('x', 'х'), changes: [] };
  expectBlocked(withAdaptation, [env], 'invalid-adaptation');

  const adapted = fxManifest(env, { match: 'adapted' });
  expectBlocked(adapted, [env], 'invalid-adaptation');   // no adaptation record

  const good = {
    summary: bi('Reads the roll as already made.', 'Читает бросок как уже сделанный.'),
    changes: [{ kind: 'mechanic', target: 'Alpha', source: 'Alpha makes the way slow.', adapted: bi('Already slow.', 'Уже медленно.'), why: 'The result is the one the source gives.' }],
  };
  const make = mutate => {
    const m = fxManifest(env, { match: 'adapted' });
    m.scenes[0].outcomes[0].adaptation = clone(good);
    mutate(m.scenes[0].outcomes[0].adaptation);
    return m;
  };
  assert.deepEqual(codes(analyze(make(() => {}), [env]), 'error'), []);
  expectBlocked(make(a => { a.changes[0].source = 'Something the source never says.'; }), [env], 'invalid-adaptation');
  expectBlocked(make(a => { a.changes[0].target = 'Beta'; }), [env], 'invalid-adaptation');
  expectBlocked(make(a => { a.changes[0].kind = 'rewrite'; }), [env], 'invalid-adaptation');
  expectBlocked(make(a => { a.changes[0].why = ''; }), [env], 'invalid-adaptation');
  expectBlocked(make(a => { delete a.changes[0].adapted.ru; }), [env], 'missing-bilingual');
  expectBlocked(make(a => { a.summary = bi('x', 'x'); }), [env], 'missing-bilingual');
});

test('an adapted scene goes stale when the quoted source wording changes', () => {
  const env = fxEnv();
  const m = fxManifest(env, { match: 'adapted' });
  m.scenes[0].outcomes[0].adaptation = {
    summary: bi('Reads the roll as made.', 'Читает бросок как сделанный.'),
    changes: [{ kind: 'mechanic', target: 'Alpha', source: 'Alpha makes the way slow', adapted: bi('Slow.', 'Медленно.'), why: 'Same result.' }],
  };
  assert.deepEqual(codes(analyze(m, [env]), 'error'), []);
  const changed = clone(env); changed.features[0].description.en = 'Alpha now blocks the way.';
  const a = analyze(m, [changed]);
  assert.ok(codes(a, 'error').includes('invalid-adaptation'));
  assert.ok(codes(a, 'error').includes('stale-feature'));
  assert.deepEqual(D.getSelectableScenes(m, [changed]), []);
});

test('review ledger rules: reviewed-none needs a reason and no scenes; reviewed needs scenes', () => {
  const env = fxEnv();
  const none = { schema: 1, fingerprintVersion: 1, scenes: [], reviews: [{ envId: env.id, status: 'reviewed-none', envFp: D.environmentFingerprint(env), reviewedOn: '2026-11-16' }] };
  assert.ok(codes(analyze(none, [env]), 'error').includes('invalid-review'));
  none.reviews[0].reason = 'Nothing in it fits a single encounter.';
  assert.deepEqual(codes(analyze(none, [env]), 'error'), []);

  const withScene = fx(undefined, { status: 'reviewed-none', compatibility: undefined, reason: 'No.' });
  expectBlocked(withScene.manifest, [withScene.env], 'environment-not-reviewed');

  const empty = fx(); empty.manifest.scenes = [];
  assert.ok(codes(analyze(empty.manifest, [empty.env]), 'error').includes('invalid-review'));

  const pendingWithScene = fx(undefined, { status: 'pending', compatibility: undefined, envFp: undefined, reviewedOn: undefined });
  expectBlocked(pendingWithScene.manifest, [pendingWithScene.env], 'environment-not-reviewed');

  const pendingOk = { schema: 1, fingerprintVersion: 1, scenes: [], reviews: [{ envId: env.id, status: 'pending' }] };
  assert.deepEqual(codes(analyze(pendingOk, [env]), 'error'), []);
  assert.equal(analyze(pendingOk, [env]).coverage.pending, 1);
  const pendingVerdict = { schema: 1, fingerprintVersion: 1, scenes: [], reviews: [{ envId: env.id, status: 'pending', compatibility: 'native-forest' }] };
  assert.ok(codes(analyze(pendingVerdict, [env]), 'error').includes('invalid-review'));
});

test('a scene whose environment has no review entry is not selectable', () => {
  const { env, manifest } = fx(); manifest.reviews = [];
  expectBlocked(manifest, [env], 'environment-not-reviewed');
});

test('artwork decisions are explicit and checked against the catalogue art', () => {
  const noArt = fx(); delete noArt.manifest.scenes[0].art;
  expectBlocked(noArt.manifest, [noArt.env], 'invalid-art');
  const noReason = fx({ art: { mode: 'none' } });
  expectBlocked(noReason.manifest, [noReason.env], 'invalid-art');
  const badMode = fx({ art: { mode: 'best', reason: 'x' } });
  expectBlocked(badMode.manifest, [badMode.env], 'invalid-art');
  const noneWithRef = fx({ art: { mode: 'none', ref: 'forest', reason: 'x' } });
  expectBlocked(noneWithRef.manifest, [noneWithRef.env], 'invalid-art');

  const stubs = { resolveArt: () => ({ kind: 'biome', imageId: null }), biomeAssetExists: b => b === 'forest' };
  const orig = fx({ art: { mode: 'original', reason: 'Its own painting.' } });
  expectBlocked(orig.manifest, [orig.env], 'invalid-art', stubs);
  const own = { resolveArt: () => ({ kind: 'unique', imageId: 'env:fx-env' }) };
  assert.deepEqual(codes(analyze(orig.manifest, [orig.env], own), 'error'), []);

  const biomeOk = fx({ art: { mode: 'fallback', source: 'biome', ref: 'forest', reason: 'Forest strip.' } });
  assert.deepEqual(codes(analyze(biomeOk.manifest, [biomeOk.env], stubs), 'error'), []);
  const biomeBad = fx({ art: { mode: 'fallback', source: 'biome', ref: 'oceanic', reason: 'x' } });
  expectBlocked(biomeBad.manifest, [biomeBad.env], 'invalid-art', stubs);
  const biomeMissing = fx({ art: { mode: 'fallback', source: 'biome', ref: 'frozen', reason: 'x' } });
  expectBlocked(biomeMissing.manifest, [biomeMissing.env], 'invalid-art', stubs);
  const arch = fx({ art: { mode: 'fallback', source: 'archetype', ref: 'archetype:sinister-woods', reason: 'x' } });
  expectBlocked(arch.manifest, [arch.env], 'invalid-art', stubs);
  const archOk = { resolveArt: () => ({ kind: 'thematic', imageId: 'archetype:sinister-woods' }) };
  assert.deepEqual(codes(analyze(arch.manifest, [arch.env], archOk), 'error'), []);
  const archWrong = fx({ art: { mode: 'fallback', source: 'archetype', ref: 'archetype:forgotten-ruins', reason: 'x' } });
  expectBlocked(archWrong.manifest, [archWrong.env], 'invalid-art', archOk);
});

test('the real seed\'s artwork decisions hold against the live art tables', () => {
  const modes = new Set(realManifest.scenes.map(s => `${s.art.mode}${s.art.source ? ':' + s.art.source : ''}`));
  for (const m of ['original', 'fallback:biome', 'fallback:archetype']) assert.ok(modes.has(m), `seed lacks an artwork decision of kind ${m}`);
  assert.deepEqual(codes(analyze(realManifest, realEnvs, realCtx), 'error'), []);
});

test('unknown keys and a malformed document are rejected, never ignored', () => {
  const a = fx(); a.manifest.scenes[0].typo = true;
  expectBlocked(a.manifest, [a.env], 'unknown-key');
  const b = fx(); b.manifest.extra = 1;
  assert.ok(codes(analyze(b.manifest, [b.env]), 'error').includes('unknown-key'));
  assert.ok(codes(analyze(null, []), 'error').includes('shape'));
  assert.ok(codes(analyze({ schema: 1, fingerprintVersion: 1 }, []), 'error').includes('shape'));
  const c = fx(); c.manifest.schema = 2;
  assert.ok(codes(analyze(c.manifest, [c.env]), 'error').includes('schema'));
});

/* ---------------- stale mappings against the real catalogue ---------------- */

test('editing a real pinned feature withholds exactly the scenes that use it', () => {
  const envs = clone(realEnvs);
  const grove = envs.find(e => e.id === 'abandoned-grove');
  grove.features.find(f => f.name.en === 'Overgrown Battlefield').description.en += ' A fourth sign: a single boot.';
  const a = analyze(realManifest, envs, realCtx);
  assert.equal(sceneState(a, 'abandoned-grove-fallen-grove').selectable, false);
  assert.ok(codes(a, 'error').includes('stale-feature'));
  const others = a.scenes.filter(s => s.id !== 'abandoned-grove-fallen-grove');
  assert.ok(others.every(s => s.selectable), 'unrelated scenes stay selectable');
  const selectable = D.getSelectableScenes(realManifest, envs, realCtx).map(s => s.id);
  assert.ok(!selectable.includes('abandoned-grove-fallen-grove'));
});

test('editing a sibling that a PARTIAL scene leaves out does not stale it, but a new sibling needs review', () => {
  const envs = clone(realEnvs);
  const grove = envs.find(e => e.id === 'abandoned-grove');
  grove.features.find(f => f.name.en === 'Defiler').description.en += ' (extended)';
  const a = analyze(realManifest, envs, realCtx);
  assert.equal(sceneState(a, 'abandoned-grove-fallen-grove').selectable, true);
  assert.ok(codes(a, 'warning').includes('stale-review'));
  grove.features.push(feat('action', 'A New Peril', 'Something new.'));
  const b = analyze(realManifest, envs, realCtx);
  assert.equal(sceneState(b, 'abandoned-grove-fallen-grove').selectable, false);
});

test('removing a real environment withholds its scenes and reports the unknown reference', () => {
  const envs = realEnvs.filter(e => e.id !== 'friendly-campfire');
  const a = analyze(realManifest, envs, realCtx);
  assert.equal(sceneState(a, 'friendly-campfire-travelers-fire').selectable, false);
  assert.ok(codes(a, 'error').includes('unknown-environment'));
});

/* ---------------- review queue (maintenance contract) ---------------- */

test('review queue: new environments are unlisted, edited ones are stale', () => {
  const envs = clone(realEnvs);
  envs.push(fxEnv({ id: 'brand-new-environment' }));
  envs.find(e => e.id === 'hunter-or-hunted').features[0].description.en += ' Edited.';
  const q = D.reviewQueue(realManifest, envs);
  assert.ok(q.unlisted.includes('brand-new-environment'));
  assert.deepEqual(q.stale, ['hunter-or-hunted']);
  assert.ok(q.current.includes('friendly-campfire'));
  assert.equal(q.unlisted.length + q.pending.length + q.stale.length + q.current.length, envs.length);
  const explicit = clone(realManifest); explicit.reviews.push({ envId: 'brand-new-environment', status: 'pending' });
  assert.deepEqual(D.reviewQueue(explicit, envs).pending, ['brand-new-environment']);
});

/* ---------------- wiring into validate-data ---------------- */

test('validate-data reports manifest problems as diagnostics in data/darkheart-scenes.json', () => {
  const { env, manifest } = fx({ envId: 'nope' });
  const diagnostics = [];
  validateDarkheartScenes(manifest, 'data/darkheart-scenes.json', diagnostics, ROOT, [env]);
  assert.ok(diagnostics.length > 0);
  assert.ok(diagnostics.every(d => d.file === 'data/darkheart-scenes.json' && d.severity && d.path && d.message));
  assert.ok(diagnostics.some(d => d.severity === 'error' && /Unknown environment/.test(d.message)));
});

test('the repository passes validate-data with the manifest included', () => {
  const result = validateRepositoryData(ROOT);
  assert.equal(result.errorCount, 0, JSON.stringify(result.diagnostics.filter(d => d.severity === 'error'), null, 1));
  assert.ok(result.darkheartCoverage, 'the production data/darkheart-scenes.json must exist and be validated');
  assert.equal(result.darkheartCoverage.selectable, result.darkheartCoverage.scenes);
  assert.equal(result.diagnostics.filter(d => d.file === 'data/darkheart-scenes.json').length, 0);
});

/* ---------------- static architecture ---------------- */

test('the manifest is lazy: never in the initial page, fetched only by the Darkheart route', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  assert.equal(/darkheart-scenes\.json/i.test(html), false, 'index.html must not reference or inline the manifest data');
  assert.equal(/darkheart-scenes\.json/.test(app), true, 'js/app.js fetches it (darkheartData)');
  const fetchSite = app.indexOf("data/darkheart-scenes.json");
  assert.ok(app.lastIndexOf('function darkheartData()', fetchSite) !== -1 && app.lastIndexOf('function ', fetchSite) === app.lastIndexOf('function darkheartData()', fetchSite), 'the only fetch lives inside darkheartData()');
  assert.equal((app.match(/darkheart-scenes\.json/g) || []).length, 1);
  assert.equal(/function init\(\)[\s\S]*?darkheart/.test(app.slice(app.indexOf('async function init()'), app.indexOf('/* ---------------- initial loading shell lifecycle'))), false, 'startup never fetches it');
  const size = fs.statSync(path.join(ROOT, 'data/darkheart-scenes.json')).size;
  assert.ok(size < 256 * 1024, `the manifest is ${size} bytes; it should stay a small lazily-loaded sidecar`);
});

test('the build copies the manifest as ordinary data and the catalogue file is untouched by it', () => {
  const { isExcluded } = require('../scripts/build.js');
  assert.equal(isExcluded('data/darkheart-scenes.json'), false);
  assert.equal(isExcluded('data/environments.json'), false);
  const src = fs.readFileSync(path.join(ROOT, 'js/darkheart-scenes.js'), 'utf8');
  assert.equal(/writeFile|appendFile|unlink|rmSync/.test(src), false, 'the manifest library is read-only');
  assert.equal(/require\(['"]fs['"]\)/.test(src), false, 'the manifest library does no I/O; callers pass data in');
});

/* ---------------- flexible compatibility: GM guidance and adaptation kinds (PD-098) ---------------- */

function withGuidance(guidance, sceneId = 'around-the-fire-respite') {
  const m = clone(realManifest);
  m.scenes.find(s => s.id === sceneId).outcomes[0].guidance = guidance;
  return m;
}
const goodGuidance = { adjust: ['scale', 'terrain'], text: { en: 'Make it a clearing; the rest is the same.', ru: 'Пусть это будет поляна; остальное без изменений.' } };

test('guidance is optional: scenes without it validate, and the ones with it are counted', () => {
  const a = analyze(realManifest, realEnvs, realCtx);
  assert.deepEqual(codes(a, 'error'), []);
  const reviewed = realManifest.scenes.reduce((n, sc) => n + sc.outcomes.filter(o => o.guidance).length, 0);
  assert.equal(a.coverage.withGuidance, reviewed);
});

test('valid bilingual guidance is accepted on FULL, PARTIAL and ADAPTED scenes and is counted', () => {
  const base = realManifest.scenes.reduce((n, sc) => n + sc.outcomes.filter(o => o.guidance).length, 0);
  for (const id of ['around-the-fire-respite', 'friendly-campfire-travelers-fire', 'cauldera-valley-valleys-bounty']) {
    const a = analyze(withGuidance(goodGuidance, id), realEnvs, realCtx);
    assert.deepEqual(codes(a, 'error'), [], id);
    assert.equal(a.coverage.withGuidance, base + (realManifest.scenes.find(x => x.id === id).outcomes[0].guidance ? 0 : 1), id);
    assert.equal(sceneState(a, id).selectable, true);
  }
});

test('guidance never touches source pins: adding it keeps every fingerprint valid', () => {
  const a = analyze(withGuidance(goodGuidance), realEnvs, realCtx);
  assert.equal(codes(a).filter(c => /stale|pin/.test(c)).length, 0);
});

test('malformed guidance is an error', () => {
  const bad = [
    { ...goodGuidance, adjust: [] },
    { ...goodGuidance, adjust: ['teleport'] },
    { ...goodGuidance, adjust: ['scale', 'scale'] },
    { ...goodGuidance, text: { en: 'English only' } },
    { ...goodGuidance, text: { en: 'Only English here.', ru: 'Only English here.' } },
    { ...goodGuidance, text: { en: 'x'.repeat(D.GUIDANCE_MAX_CHARS + 1), ru: 'я'.repeat(20) } },
    { ...goodGuidance, extra: true },
    'just a string',
  ];
  for (const g of bad) {
    const a = analyze(withGuidance(g), realEnvs, realCtx);
    assert.ok(codes(a, 'error').length > 0, JSON.stringify(g));
    assert.equal(sceneState(a, 'around-the-fire-respite').selectable, false, 'a scene with broken guidance is withheld');
  }
});

test('the new adaptation kinds are accepted, but the source quote is still verified', () => {
  for (const kind of ['scale', 'npc-involvement', 'hostility', 'countdown', 'difficulty', 'location']) {
    const m = clone(realManifest);
    m.scenes.find(s => s.id === 'cauldera-valley-valleys-bounty').outcomes[0].adaptation.changes[0].kind = kind;
    assert.deepEqual(codes(analyze(m, realEnvs, realCtx), 'error'), [], kind);
  }
  const m = clone(realManifest);
  const change = m.scenes.find(s => s.id === 'cauldera-valley-valleys-bounty').outcomes[0].adaptation.changes[0];
  change.kind = 'scale';
  change.source = 'a sentence the source never contained';
  assert.ok(codes(analyze(m, realEnvs, realCtx), 'error').includes('invalid-adaptation'));
});

test('flexibility did not loosen the structural safeguards', () => {
  const m = clone(realManifest);
  m.scenes[0].outcomes[0].outcome = 'not-an-outcome';
  assert.ok(codes(analyze(m, realEnvs, realCtx), 'error').includes('invalid-outcome'));
  const stale = clone(realEnvs);
  stale.find(e => e.id === 'gloaming-forest').features[0].description.en += ' A new rule appears.';
  assert.ok(analyze(realManifest, stale, realCtx).scenes.some(s => !s.selectable));
});
