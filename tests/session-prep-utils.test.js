/* ============================================================
   Bacchus's Atlas — tests/session-prep-utils.test.js
   Dependency-free regression tests for js/session-prep-utils.js. Run with:

     node --test tests/session-prep-utils.test.js

   SessionPrepUtils is pure (no DOM, no application state, no i18n), so it
   is exercised directly here — same shape as tests/list-rename.test.js.
   Every selection (environment/adversary/item) is binary: there is no
   primary environment and no quantity anywhere in this module.
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const SPU = require('../js/session-prep-utils.js');

function baseSession(overrides = {}) {
  return Object.assign(SPU.createDefaultSession('default', '2024-01-01T00:00:00.000Z'), overrides);
}

/* ---------------- default shape ---------------- */

test('createDefaultStore has one default session with no primary environment and no quantity objects', () => {
  const store = SPU.createDefaultStore('2024-01-01T00:00:00.000Z');
  assert.equal(store.schemaVersion, 2);
  assert.equal(store.activeSessionId, 'default');
  assert.equal(store.sessions.length, 1);
  const session = store.sessions[0];
  assert.deepEqual(session.environmentIds, []);
  assert.deepEqual(session.adversaryIds, []);
  assert.deepEqual(session.itemIds, []);
  assert.equal('primaryEnvironmentId' in session, false);
  assert.equal('adversaries' in session, false);
  assert.equal('items' in session, false);
});

test('getActiveSession finds the session matching activeSessionId', () => {
  const store = { activeSessionId: 'b', sessions: [baseSession({ id: 'a' }), baseSession({ id: 'b' })] };
  assert.equal(SPU.getActiveSession(store).id, 'b');
});

test('getActiveSession falls back to the first session for an unknown activeSessionId', () => {
  const store = { activeSessionId: 'ghost', sessions: [baseSession({ id: 'a' })] };
  assert.equal(SPU.getActiveSession(store).id, 'a');
});

test('getActiveSession returns null for a store with no sessions', () => {
  assert.equal(SPU.getActiveSession({ activeSessionId: 'default', sessions: [] }), null);
  assert.equal(SPU.getActiveSession(null), null);
});

/* ---------------- toggleId / removeId (generic binary selection) ---------------- */

test('toggleId adds a string id that is not yet present', () => {
  assert.deepEqual(SPU.toggleId([], 'cave-ogre'), ['cave-ogre']);
  assert.deepEqual(SPU.toggleId(['a'], 'b'), ['a', 'b']);
});

test('toggleId removes a string id that is already present', () => {
  assert.deepEqual(SPU.toggleId(['a', 'b'], 'a'), ['b']);
});

test('toggleId does not mutate its input array', () => {
  const ids = ['a'];
  const snapshot = JSON.stringify(ids);
  SPU.toggleId(ids, 'b');
  SPU.toggleId(ids, 'a');
  assert.equal(JSON.stringify(ids), snapshot);
});

test('removeId removes only the named id, never mutating its input', () => {
  const ids = ['a', 'b', 'c'];
  const snapshot = JSON.stringify(ids);
  const result = SPU.removeId(ids, 'b');
  assert.deepEqual(result, ['a', 'c']);
  assert.equal(JSON.stringify(ids), snapshot);
});

test('removeId is a no-op (still returns a new array) when the id is absent', () => {
  assert.deepEqual(SPU.removeId(['a', 'b'], 'ghost'), ['a', 'b']);
});

/* ---------------- environments: selection, no primary ---------------- */

test('selecting an environment adds its id, with no primary concept', () => {
  const result = SPU.toggleEnvironment(baseSession(), 'env-a');
  assert.equal(result.changed, true);
  assert.deepEqual(result.session.environmentIds, ['env-a']);
  assert.equal('primaryEnvironmentId' in result.session, false);
});

test('a second and third selected environment are both added in order', () => {
  let session = baseSession({ environmentIds: ['env-a'] });
  const second = SPU.toggleEnvironment(session, 'env-b');
  assert.deepEqual(second.session.environmentIds, ['env-a', 'env-b']);
  const third = SPU.toggleEnvironment(second.session, 'env-c');
  assert.deepEqual(third.session.environmentIds, ['env-a', 'env-b', 'env-c']);
});

test('a fourth environment selection is rejected and leaves the session unchanged', () => {
  const session = baseSession({ environmentIds: ['a', 'b', 'c'] });
  const result = SPU.toggleEnvironment(session, 'd');
  assert.equal(result.changed, false);
  assert.equal(result.limitReached, true);
  assert.equal(result.session, session, 'the session reference must be unchanged, not a mutated copy');
  assert.deepEqual(result.session.environmentIds, ['a', 'b', 'c']);
});

test('toggling an already-selected environment removes it', () => {
  const session = baseSession({ environmentIds: ['a', 'b'] });
  const result = SPU.toggleEnvironment(session, 'b');
  assert.deepEqual(result.session.environmentIds, ['a']);
});

test('removeEnvironment removes only the named environment', () => {
  const session = baseSession({ environmentIds: ['a', 'b', 'c'] });
  const result = SPU.removeEnvironment(session, 'b');
  assert.deepEqual(result.session.environmentIds, ['a', 'c']);
  assert.equal(result.changed, true);
  assert.equal(result.limitReached, false);
});

test('removing the last environment leaves an empty selection', () => {
  const session = baseSession({ environmentIds: ['a'] });
  const result = SPU.removeEnvironment(session, 'a');
  assert.deepEqual(result.session.environmentIds, []);
});

test('toggleEnvironment/removeEnvironment do not mutate the input session', () => {
  const session = baseSession({ environmentIds: ['a'] });
  const snapshot = JSON.stringify(session);
  SPU.toggleEnvironment(session, 'b');
  SPU.removeEnvironment(session, 'a');
  assert.equal(JSON.stringify(session), snapshot);
});

/* ---------------- search ---------------- */

test('normalizeSearchText lowercases and trims', () => {
  assert.equal(SPU.normalizeSearchText('  Cave Ogre  '), 'cave ogre');
  assert.equal(SPU.normalizeSearchText(null), '');
  assert.equal(SPU.normalizeSearchText(undefined), '');
});

test('matchesSearch finds a match in either field, case-insensitively', () => {
  assert.equal(SPU.matchesSearch('ogre', ['Cave Ogre', 'Пещерный Огр']), true);
  assert.equal(SPU.matchesSearch('огр', ['Cave Ogre', 'Пещерный Огр']), true);
  assert.equal(SPU.matchesSearch('dragon', ['Cave Ogre', 'Пещерный Огр']), false);
});

test('an empty query matches everything', () => {
  assert.equal(SPU.matchesSearch('', ['anything']), true);
  assert.equal(SPU.matchesSearch('   ', ['anything']), true);
});

test('EN and RU search values both find the same catalogue entry', () => {
  const entries = [
    { id: 'cave-ogre', name: { en: 'Cave Ogre', ru: 'Пещерный Огр' } },
    { id: 'dire-wolf', name: { en: 'Dire Wolf', ru: 'Лютоволк' } },
  ];
  const getFields = e => [e.name.en, e.name.ru];
  const byEn = SPU.filterEntries(entries, 'cave', getFields);
  const byRu = SPU.filterEntries(entries, 'огр', getFields);
  assert.deepEqual(byEn.map(e => e.id), ['cave-ogre']);
  assert.deepEqual(byRu.map(e => e.id), ['cave-ogre']);
});

test('filterEntries returns every entry for an empty query', () => {
  const entries = [{ id: 'a', name: { en: 'A', ru: '' } }, { id: 'b', name: { en: 'B', ru: '' } }];
  const result = SPU.filterEntries(entries, '', e => [e.name.en, e.name.ru]);
  assert.deepEqual(result.map(e => e.id), ['a', 'b']);
});

test('normalizeSearchText collapses repeated internal whitespace', () => {
  assert.equal(SPU.normalizeSearchText('cave   ogre'), 'cave ogre');
  assert.equal(SPU.normalizeSearchText('  forest\t\tbiome  '), 'forest biome');
});

/* ---------------- environment + biome search (Session Prep) ---------------- */

const PREP_I18N_EN = {
  biome_forest: 'Forest',
  biome_settlement: 'Settlement',
  biome_aquatic: 'Aquatic',
};
const PREP_I18N_RU = {
  biome_forest: 'Лесное',
  biome_settlement: 'Поселение',
  biome_aquatic: 'Водное',
};

const PREP_ENVS = [
  { id: 'moonlit-glade', name: { en: 'Moonlit Glade', ru: 'Лунная Поляна' }, biomes: ['forest'] },
  { id: 'market-square', name: { en: 'Market Square', ru: 'Рыночная Площадь' }, biomes: ['settlement'] },
  { id: 'sunken-reef', name: { en: 'Sunken Reef', ru: 'Затонувший Риф' }, biomes: ['aquatic', 'settlement'] },
];

function prepFields(env) {
  return SPU.environmentSearchFields(env, PREP_I18N_EN, PREP_I18N_RU);
}

test('environmentSearchFields matches by English environment name', () => {
  const result = SPU.filterEntries(PREP_ENVS, 'Moonlit', prepFields);
  assert.deepEqual(result.map(e => e.id), ['moonlit-glade']);
});

test('environmentSearchFields matches by Russian environment name', () => {
  const result = SPU.filterEntries(PREP_ENVS, 'Поляна', prepFields);
  assert.deepEqual(result.map(e => e.id), ['moonlit-glade']);
});

test('environmentSearchFields matches by canonical biome key', () => {
  const result = SPU.filterEntries(PREP_ENVS, 'forest', prepFields);
  assert.deepEqual(result.map(e => e.id), ['moonlit-glade']);
});

test('environmentSearchFields matches by English biome label even when absent from the name', () => {
  const result = SPU.filterEntries(PREP_ENVS, 'Settlement', prepFields);
  assert.deepEqual(result.map(e => e.id).sort(), ['market-square', 'sunken-reef']);
});

test('environmentSearchFields matches by Russian biome label', () => {
  const result = SPU.filterEntries(PREP_ENVS, 'поселение', prepFields);
  assert.deepEqual(result.map(e => e.id).sort(), ['market-square', 'sunken-reef']);
});

test('environmentSearchFields matching is case-insensitive', () => {
  const upper = SPU.filterEntries(PREP_ENVS, 'FOREST', prepFields);
  const lower = SPU.filterEntries(PREP_ENVS, 'forest', prepFields);
  assert.deepEqual(upper.map(e => e.id), lower.map(e => e.id));
  assert.deepEqual(upper.map(e => e.id), ['moonlit-glade']);
});

test('an environment matching on more than one field is returned only once', () => {
  // "settlement" matches both the raw biome id and its EN label for the same entries.
  const result = SPU.filterEntries(PREP_ENVS, 'settlement', prepFields);
  const ids = result.map(e => e.id);
  assert.deepEqual(ids.sort(), ['market-square', 'sunken-reef']);
  assert.equal(new Set(ids).size, ids.length);
});

test('an empty biome/name query returns the full environment catalogue', () => {
  const result = SPU.filterEntries(PREP_ENVS, '', prepFields);
  assert.deepEqual(result.map(e => e.id), PREP_ENVS.map(e => e.id));
});

/* ---------------- id-list normalization ---------------- */

test('normalizeIdList drops duplicates while preserving first-seen order', () => {
  assert.deepEqual(SPU.normalizeIdList(['a', 'b', 'a', 'c', 'b']), ['a', 'b', 'c']);
});

test('normalizeIdList drops non-string and empty entries', () => {
  assert.deepEqual(SPU.normalizeIdList(['a', null, '', 42, 'b']), ['a', 'b']);
});
