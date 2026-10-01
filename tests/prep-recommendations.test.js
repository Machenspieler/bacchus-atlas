/* ============================================================
   Bacchus's Atlas — tests/prep-recommendations.test.js
   Dependency-free tests for Environment → Recommended Adversaries: the
   per-environment index, the provenance aggregation
   (PotentialAdversaryUtils) and the pure Prep helpers that order the
   recommended group and perform the explicit bulk add (PrepUtils). Run with:

     node --test tests/prep-recommendations.test.js

   Recommendations are advisory, derived state — nothing here (or in the
   modules under test) persists them or touches the Prep storage schema.
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const PAU = require('../js/potential-adversary-utils.js');
const SPU = require('../js/prep-utils.js');

const CATALOGUE = [
  { id: 'archer-guard', name: { en: 'Archer Guard' }, tier: 1 },
  { id: 'head-guard', name: { en: 'Head Guard' }, tier: 1 },
  { id: 'dire-wolf', name: { en: 'Dire Wolf' }, tier: 1 },
  { id: 'bear', name: { en: 'Bear' }, tier: 1 },
  { id: 'giant-scorpion', name: { en: 'Giant Scorpion' }, tier: 2 },
  { id: 'dragon', name: { en: 'Dragon' }, tier: 4 },
];
const NAME_INDEX = PAU.buildCatalogueNameIndex(CATALOGUE);

function env(id, ...entries) {
  return { id, potential_adversaries: { en: entries } };
}
const ENVIRONMENTS = [
  env('bastion', 'Guards (Archer, Head)', 'Dire Wolf', 'Homebrew Horror'),
  env('faestone-wode', 'Beasts (Dire Wolf, Bear, Giant Scorpion)'),
  env('custom-only', 'Homebrew Horror', 'Third Party Thing'),
  env('anything', 'Any'),
  { id: 'no-adversaries' },
  env('repeats', 'Dragon', 'Dragon', 'Beasts (Dragon, Dragon)'),
];
const INDEX = PAU.buildEnvironmentRecommendationIndex(ENVIRONMENTS, NAME_INDEX);

function prepWith(overrides = {}) {
  return Object.assign(SPU.createDefaultPrep('default', '2024-01-01T00:00:00.000Z'), overrides);
}

/* ---------------- per-environment index ---------------- */

test('one environment recommends several supported adversaries', () => {
  assert.deepEqual(INDEX.get('bastion'), ['archer-guard', 'head-guard', 'dire-wolf']);
  assert.deepEqual(INDEX.get('faestone-wode'), ['dire-wolf', 'bear', 'giant-scorpion']);
});

test('duplicate mentions inside one environment are deduplicated', () => {
  assert.deepEqual(INDEX.get('repeats'), ['dragon']);
});

test('environments with nothing supported are simply absent from the index', () => {
  assert.equal(INDEX.has('custom-only'), false);
  assert.equal(INDEX.has('anything'), false);
  assert.equal(INDEX.has('no-adversaries'), false);
});

test('the index is plain derived data — building it never mutates its inputs', () => {
  const before = JSON.stringify(ENVIRONMENTS);
  PAU.buildEnvironmentRecommendationIndex(ENVIRONMENTS, NAME_INDEX);
  assert.equal(JSON.stringify(ENVIRONMENTS), before);
  assert.deepEqual(PAU.buildEnvironmentRecommendationIndex(undefined, NAME_INDEX).size, 0);
});

/* ---------------- aggregation with provenance ---------------- */

test('selecting no environments produces an empty recommendation map', () => {
  assert.equal(PAU.aggregateRecommendations([], INDEX).size, 0);
  assert.equal(PAU.aggregateRecommendations(undefined, INDEX).size, 0);
});

test('a single environment records itself as the only source', () => {
  const map = PAU.aggregateRecommendations(['bastion'], INDEX);
  assert.deepEqual([...map.keys()], ['archer-guard', 'head-guard', 'dire-wolf']);
  assert.deepEqual(map.get('archer-guard'), { environmentIds: ['bastion'], sourceCount: 1 });
});

test('the same adversary from two selected environments records both sources', () => {
  const map = PAU.aggregateRecommendations(['bastion', 'faestone-wode'], INDEX);
  assert.deepEqual(map.get('dire-wolf'), { environmentIds: ['bastion', 'faestone-wode'], sourceCount: 2 });
  assert.deepEqual(map.get('bear'), { environmentIds: ['faestone-wode'], sourceCount: 1 });
  assert.equal(map.size, 5);
});

test('provenance follows selection order', () => {
  const map = PAU.aggregateRecommendations(['faestone-wode', 'bastion'], INDEX);
  assert.deepEqual(map.get('dire-wolf').environmentIds, ['faestone-wode', 'bastion']);
});

test('the same environment never counts twice, whether repeated in the selection or in its own text', () => {
  const map = PAU.aggregateRecommendations(['repeats', 'repeats', 'bastion', 'bastion'], INDEX);
  assert.deepEqual(map.get('dragon'), { environmentIds: ['repeats'], sourceCount: 1 });
  assert.deepEqual(map.get('dire-wolf'), { environmentIds: ['bastion'], sourceCount: 1 });
});

test('unknown environment ids and environments with no supported matches are ignored', () => {
  const map = PAU.aggregateRecommendations(['ghost', 'custom-only', 'no-adversaries', 'bastion'], INDEX);
  assert.deepEqual(map.get('dire-wolf'), { environmentIds: ['bastion'], sourceCount: 1 });
  assert.equal(map.size, 3);
});

test('removing an environment removes its provenance immediately (it is re-derived, not stored)', () => {
  const both = PAU.aggregateRecommendations(['bastion', 'faestone-wode'], INDEX);
  const afterRemoval = PAU.aggregateRecommendations(['faestone-wode'], INDEX);
  assert.equal(both.get('dire-wolf').sourceCount, 2);
  assert.deepEqual(afterRemoval.get('dire-wolf'), { environmentIds: ['faestone-wode'], sourceCount: 1 });
  assert.equal(afterRemoval.has('archer-guard'), false);
});

test('aggregation does not mutate the index it reads', () => {
  const before = JSON.stringify([...INDEX]);
  PAU.aggregateRecommendations(['bastion', 'faestone-wode'], INDEX).get('dire-wolf').environmentIds.push('x');
  assert.equal(JSON.stringify([...INDEX]), before);
});

/* ---------------- ordering of the recommended group ---------------- */

const byName = (a, b) => a.name.en.localeCompare(b.name.en);
const tierOf = adv => adv.tier;

test('recommended rows sort by source count, then Tier, then name; the rest by Tier then name', () => {
  const recommendations = PAU.aggregateRecommendations(['bastion', 'faestone-wode'], INDEX);
  const { recommended, rest } = SPU.partitionRecommendedAdversaries(CATALOGUE, recommendations, tierOf, byName);
  assert.deepEqual(recommended.map(a => a.id),
    ['dire-wolf', 'archer-guard', 'bear', 'head-guard', 'giant-scorpion']);
  assert.deepEqual(rest.map(a => a.id), ['dragon']);
});

test('no recommendations: everything stays in the plain Tier-then-name order', () => {
  const { recommended, rest } = SPU.partitionRecommendedAdversaries(CATALOGUE, new Map(), tierOf, byName);
  assert.deepEqual(recommended, []);
  assert.deepEqual(rest.map(a => a.id), ['archer-guard', 'bear', 'dire-wolf', 'head-guard', 'giant-scorpion', 'dragon']);
});

test('a recommendation the filters removed is not force-shown, and nothing is duplicated', () => {
  const recommendations = PAU.aggregateRecommendations(['bastion'], INDEX);
  const filtered = CATALOGUE.filter(a => a.tier === 4 || a.id === 'bear');
  const { recommended, rest } = SPU.partitionRecommendedAdversaries(filtered, recommendations, tierOf, byName);
  assert.deepEqual(recommended, []);
  assert.deepEqual(rest.map(a => a.id), ['bear', 'dragon']);
  const all = SPU.partitionRecommendedAdversaries(CATALOGUE, recommendations, tierOf, byName);
  assert.equal(all.recommended.length + all.rest.length, CATALOGUE.length);
});

test('partitioning does not mutate its input', () => {
  const input = CATALOGUE.slice();
  SPU.partitionRecommendedAdversaries(input, PAU.aggregateRecommendations(['bastion'], INDEX), tierOf, byName);
  assert.deepEqual(input, CATALOGUE);
});

/* ---------------- bulk addition ---------------- */

test('only missing recommendation ids are appended, after the existing selection', () => {
  const prep = prepWith({ adversaryIds: ['dragon', 'dire-wolf'] });
  const outcome = SPU.addRecommendedAdversaries(prep, ['archer-guard', 'dire-wolf', 'head-guard']);
  assert.equal(outcome.changed, true);
  assert.deepEqual(outcome.addedIds, ['archer-guard', 'head-guard']);
  assert.deepEqual(outcome.prep.adversaryIds, ['dragon', 'dire-wolf', 'archer-guard', 'head-guard']);
});

test('existing adversary selections are preserved, including ones nothing recommends', () => {
  const prep = prepWith({ adversaryIds: ['custom-or-unrecommended'] });
  const outcome = SPU.addRecommendedAdversaries(prep, ['bear']);
  assert.deepEqual(outcome.prep.adversaryIds, ['custom-or-unrecommended', 'bear']);
});

test('duplicate ids are never produced, even from duplicate input', () => {
  const outcome = SPU.addRecommendedAdversaries(prepWith(), ['bear', 'bear', 'dragon', 'bear']);
  assert.deepEqual(outcome.prep.adversaryIds, ['bear', 'dragon']);
  assert.equal(new Set(outcome.prep.adversaryIds).size, outcome.prep.adversaryIds.length);
});

test('inputs are not mutated', () => {
  const prep = prepWith({ adversaryIds: ['bear'] });
  const recommended = ['bear', 'dragon'];
  const outcome = SPU.addRecommendedAdversaries(prep, recommended);
  assert.deepEqual(prep.adversaryIds, ['bear']);
  assert.deepEqual(recommended, ['bear', 'dragon']);
  assert.notEqual(outcome.prep, prep);
  assert.notEqual(outcome.prep.adversaryIds, prep.adversaryIds);
});

test('an empty recommendation set is a no-op', () => {
  const prep = prepWith({ adversaryIds: ['bear'] });
  for (const empty of [[], undefined, null]) {
    const outcome = SPU.addRecommendedAdversaries(prep, empty);
    assert.equal(outcome.changed, false);
    assert.deepEqual(outcome.addedIds, []);
    assert.equal(outcome.prep, prep);
  }
});

test('when every recommendation is already selected there is nothing missing', () => {
  const prep = prepWith({ adversaryIds: ['dire-wolf', 'bear', 'giant-scorpion', 'extra'] });
  assert.deepEqual(SPU.missingRecommendedIds(prep.adversaryIds, ['dire-wolf', 'bear', 'giant-scorpion']), []);
  assert.equal(SPU.addRecommendedAdversaries(prep, ['dire-wolf', 'bear']).changed, false);
});

test('missing ids come from the selected environments alone, not from any picker filter', () => {
  const recommendations = PAU.aggregateRecommendations(['bastion', 'faestone-wode'], INDEX);
  assert.deepEqual(
    SPU.missingRecommendedIds(['bear'], [...recommendations.keys()]),
    ['archer-guard', 'head-guard', 'dire-wolf', 'giant-scorpion']);
});

test('selecting an environment never selects adversaries; removing one never removes them', () => {
  let prep = prepWith({ adversaryIds: ['dragon'] });
  prep = SPU.toggleEnvironment(prep, 'bastion').prep;
  assert.deepEqual(prep.adversaryIds, ['dragon']);
  prep = SPU.addRecommendedAdversaries(prep, [...PAU.aggregateRecommendations(prep.environmentIds, INDEX).keys()]).prep;
  const selected = prep.adversaryIds.slice();
  prep = SPU.removeEnvironment(prep, 'bastion').prep;
  assert.deepEqual(prep.adversaryIds, selected);
  assert.equal(PAU.aggregateRecommendations(prep.environmentIds, INDEX).size, 0);
});

test('the persisted Prep shape carries no recommendation field', () => {
  const prep = prepWith();
  const outcome = SPU.addRecommendedAdversaries(prep, ['bear']);
  assert.deepEqual(Object.keys(outcome.prep).sort(), Object.keys(prep).sort());
});
