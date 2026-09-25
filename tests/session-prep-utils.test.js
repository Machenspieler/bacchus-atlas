/* ============================================================
   Bacchus's Atlas — tests/session-prep-utils.test.js
   Dependency-free regression tests for js/session-prep-utils.js. Run with:

     node --test tests/session-prep-utils.test.js

   SessionPrepUtils is pure (no DOM, no application state, no i18n), so it
   is exercised directly here — same shape as tests/list-rename.test.js.
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const SPU = require('../js/session-prep-utils.js');

function baseSession(overrides = {}) {
  return Object.assign(SPU.createDefaultSession('default', '2024-01-01T00:00:00.000Z'), overrides);
}

/* ---------------- default shape ---------------- */

test('createDefaultStore has one default session with an empty selection', () => {
  const store = SPU.createDefaultStore('2024-01-01T00:00:00.000Z');
  assert.equal(store.schemaVersion, 1);
  assert.equal(store.activeSessionId, 'default');
  assert.equal(store.sessions.length, 1);
  assert.deepEqual(store.sessions[0].environmentIds, []);
  assert.equal(store.sessions[0].primaryEnvironmentId, null);
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

/* ---------------- environments: selection + primary ---------------- */

test('the first selected environment becomes primary', () => {
  const result = SPU.toggleEnvironment(baseSession(), 'env-a');
  assert.equal(result.changed, true);
  assert.deepEqual(result.session.environmentIds, ['env-a']);
  assert.equal(result.session.primaryEnvironmentId, 'env-a');
});

test('a second selected environment does not change the primary', () => {
  const session = baseSession({ environmentIds: ['env-a'], primaryEnvironmentId: 'env-a' });
  const result = SPU.toggleEnvironment(session, 'env-b');
  assert.deepEqual(result.session.environmentIds, ['env-a', 'env-b']);
  assert.equal(result.session.primaryEnvironmentId, 'env-a');
});

test('a fourth environment selection is rejected and leaves the session unchanged', () => {
  const session = baseSession({ environmentIds: ['a', 'b', 'c'], primaryEnvironmentId: 'a' });
  const result = SPU.toggleEnvironment(session, 'd');
  assert.equal(result.changed, false);
  assert.equal(result.limitReached, true);
  assert.equal(result.session, session, 'the session reference must be unchanged, not a mutated copy');
  assert.deepEqual(result.session.environmentIds, ['a', 'b', 'c']);
});

test('toggling an already-selected environment removes it', () => {
  const session = baseSession({ environmentIds: ['a', 'b'], primaryEnvironmentId: 'a' });
  const result = SPU.toggleEnvironment(session, 'b');
  assert.deepEqual(result.session.environmentIds, ['a']);
  assert.equal(result.session.primaryEnvironmentId, 'a');
});

test('removing the primary environment promotes the next remaining one', () => {
  const session = baseSession({ environmentIds: ['a', 'b', 'c'], primaryEnvironmentId: 'a' });
  const result = SPU.removeEnvironment(session, 'a');
  assert.deepEqual(result.session.environmentIds, ['b', 'c']);
  assert.equal(result.session.primaryEnvironmentId, 'b');
});

test('removing the last environment leaves no primary', () => {
  const session = baseSession({ environmentIds: ['a'], primaryEnvironmentId: 'a' });
  const result = SPU.removeEnvironment(session, 'a');
  assert.deepEqual(result.session.environmentIds, []);
  assert.equal(result.session.primaryEnvironmentId, null);
});

test('removing a non-primary environment leaves the primary untouched', () => {
  const session = baseSession({ environmentIds: ['a', 'b'], primaryEnvironmentId: 'a' });
  const result = SPU.removeEnvironment(session, 'b');
  assert.deepEqual(result.session.environmentIds, ['a']);
  assert.equal(result.session.primaryEnvironmentId, 'a');
});

test('setPrimaryEnvironment promotes a selected environment', () => {
  const session = baseSession({ environmentIds: ['a', 'b'], primaryEnvironmentId: 'a' });
  const updated = SPU.setPrimaryEnvironment(session, 'b');
  assert.equal(updated.primaryEnvironmentId, 'b');
});

test('setPrimaryEnvironment is a no-op for an environment that is not selected', () => {
  const session = baseSession({ environmentIds: ['a'], primaryEnvironmentId: 'a' });
  const updated = SPU.setPrimaryEnvironment(session, 'ghost');
  assert.equal(updated, session);
});

/* ---------------- adversaries / items: toggle + quantity ---------------- */

test('selecting an adversary starts at quantity 1', () => {
  const list = SPU.toggleEntry([], 'cave-ogre');
  assert.deepEqual(list, [{ id: 'cave-ogre', quantity: 1 }]);
});

test('selecting an item starts at quantity 1', () => {
  const list = SPU.toggleEntry([], 'ci1');
  assert.deepEqual(list, [{ id: 'ci1', quantity: 1 }]);
});

test('toggling an already-selected entry removes it', () => {
  const list = SPU.toggleEntry([{ id: 'cave-ogre', quantity: 3 }], 'cave-ogre');
  assert.deepEqual(list, []);
});

test('removeEntry removes only the named entry', () => {
  const list = SPU.removeEntry([{ id: 'a', quantity: 1 }, { id: 'b', quantity: 2 }], 'a');
  assert.deepEqual(list, [{ id: 'b', quantity: 2 }]);
});

test('quantity never goes below 1', () => {
  const list = SPU.decrementEntry([{ id: 'a', quantity: 1 }], 'a');
  assert.equal(list[0].quantity, 1);
});

test('quantity never exceeds 99', () => {
  const list = SPU.incrementEntry([{ id: 'a', quantity: 99 }], 'a');
  assert.equal(list[0].quantity, 99);
});

test('increment and decrement adjust only the named entry', () => {
  const list = [{ id: 'a', quantity: 1 }, { id: 'b', quantity: 5 }];
  assert.deepEqual(SPU.incrementEntry(list, 'a'), [{ id: 'a', quantity: 2 }, { id: 'b', quantity: 5 }]);
  assert.deepEqual(SPU.decrementEntry(list, 'b'), [{ id: 'a', quantity: 1 }, { id: 'b', quantity: 4 }]);
});

test('setEntryQuantity clamps and rounds arbitrary input', () => {
  const list = [{ id: 'a', quantity: 1 }];
  assert.equal(SPU.setEntryQuantity(list, 'a', 500)[0].quantity, 99);
  assert.equal(SPU.setEntryQuantity(list, 'a', 0)[0].quantity, 1);
  assert.equal(SPU.setEntryQuantity(list, 'a', 3.6)[0].quantity, 4);
  assert.equal(SPU.setEntryQuantity(list, 'a', NaN)[0].quantity, 1);
});

/* ---------------- counts ---------------- */

test('countUnique and countTotalQuantity compute types vs. total creatures/items', () => {
  const list = [{ id: 'cave-ogre', quantity: 3 }, { id: 'dire-wolf', quantity: 1 }];
  assert.equal(SPU.countUnique(list), 2);
  assert.equal(SPU.countTotalQuantity(list), 4);
});

test('counts are zero for an empty list', () => {
  assert.equal(SPU.countUnique([]), 0);
  assert.equal(SPU.countTotalQuantity([]), 0);
});

/* ---------------- removing from a selected list updates state correctly ---------------- */

test('removing a selected adversary from the centre list updates both id presence and counts', () => {
  let list = SPU.toggleEntry([], 'cave-ogre');
  list = SPU.toggleEntry(list, 'dire-wolf');
  list = SPU.setEntryQuantity(list, 'cave-ogre', 3);
  assert.equal(SPU.countUnique(list), 2);
  assert.equal(SPU.countTotalQuantity(list), 4);
  list = SPU.removeEntry(list, 'dire-wolf');
  assert.deepEqual(list, [{ id: 'cave-ogre', quantity: 3 }]);
  assert.equal(SPU.countUnique(list), 1);
  assert.equal(SPU.countTotalQuantity(list), 3);
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

/* ---------------- purity: inputs are never mutated ---------------- */

test('toggleEnvironment does not mutate the input session', () => {
  const session = baseSession({ environmentIds: ['a'], primaryEnvironmentId: 'a' });
  const snapshot = JSON.stringify(session);
  SPU.toggleEnvironment(session, 'b');
  assert.equal(JSON.stringify(session), snapshot);
});

test('toggleEntry does not mutate the input list', () => {
  const list = [{ id: 'a', quantity: 1 }];
  const snapshot = JSON.stringify(list);
  SPU.toggleEntry(list, 'b');
  assert.equal(JSON.stringify(list), snapshot);
});
