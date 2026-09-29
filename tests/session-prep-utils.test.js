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

/* ---------------- session lifecycle (create / switch / duplicate / delete) ---------------- */

test('addSession appends the new session and makes it active', () => {
  const store = { schemaVersion: 2, activeSessionId: 'a', sessions: [baseSession({ id: 'a' })] };
  const next = SPU.addSession(store, baseSession({ id: 'b' }));
  assert.equal(next.sessions.length, 2);
  assert.equal(next.activeSessionId, 'b');
  assert.equal(store.sessions.length, 1, 'original store is not mutated');
});

test('setActiveSession switches to an existing session', () => {
  const store = { activeSessionId: 'a', sessions: [baseSession({ id: 'a' }), baseSession({ id: 'b' })] };
  const next = SPU.setActiveSession(store, 'b');
  assert.equal(next.activeSessionId, 'b');
});

test('setActiveSession is a no-op (returns the same store) for an unknown session id', () => {
  const store = { activeSessionId: 'a', sessions: [baseSession({ id: 'a' })] };
  assert.equal(SPU.setActiveSession(store, 'ghost'), store);
});

test('setActiveSession is a no-op for the already-active session', () => {
  const store = { activeSessionId: 'a', sessions: [baseSession({ id: 'a' })] };
  assert.equal(SPU.setActiveSession(store, 'a'), store);
});

test('removeSession drops a non-active session without changing activeSessionId', () => {
  const store = { activeSessionId: 'a', sessions: [baseSession({ id: 'a' }), baseSession({ id: 'b' })] };
  const next = SPU.removeSession(store, 'b');
  assert.deepEqual(next.sessions.map(s => s.id), ['a']);
  assert.equal(next.activeSessionId, 'a');
});

test('removeSession activates the next session in list order when the active session is removed', () => {
  const store = { activeSessionId: 'b', sessions: [baseSession({ id: 'a' }), baseSession({ id: 'b' }), baseSession({ id: 'c' })] };
  const next = SPU.removeSession(store, 'b');
  assert.deepEqual(next.sessions.map(s => s.id), ['a', 'c']);
  assert.equal(next.activeSessionId, 'c');
});

test('removeSession falls back to the previous session when the active session is the last one', () => {
  const store = { activeSessionId: 'c', sessions: [baseSession({ id: 'a' }), baseSession({ id: 'b' }), baseSession({ id: 'c' })] };
  const next = SPU.removeSession(store, 'c');
  assert.deepEqual(next.sessions.map(s => s.id), ['a', 'b']);
  assert.equal(next.activeSessionId, 'b');
});

test('removeSession deleting the only session leaves an empty sessions array and no active session', () => {
  const store = { activeSessionId: 'a', sessions: [baseSession({ id: 'a' })] };
  const next = SPU.removeSession(store, 'a');
  assert.deepEqual(next.sessions, []);
  assert.equal(next.activeSessionId, null);
});

test('removeSession is a no-op for an unknown session id', () => {
  const store = { activeSessionId: 'a', sessions: [baseSession({ id: 'a' })] };
  assert.equal(SPU.removeSession(store, 'ghost'), store);
});

/* ---------------- resolveSessionTitle ---------------- */

test('resolveSessionTitle trims surrounding whitespace', () => {
  assert.equal(SPU.resolveSessionTitle('  Sunken Temple  ', 'New session'), 'Sunken Temple');
});

test('resolveSessionTitle falls back for an empty or whitespace-only value', () => {
  assert.equal(SPU.resolveSessionTitle('', 'New session'), 'New session');
  assert.equal(SPU.resolveSessionTitle('   ', 'New session'), 'New session');
  assert.equal(SPU.resolveSessionTitle(null, 'New session'), 'New session');
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

/* ---------------- item search by book roll number ---------------- */

const PREP_ITEMS = [
  { id: 'ci3', roll: 3, en: { name: 'Charging Quiver' }, ru: { name: 'Заряженный Колчан' } },
  { id: 'di13', roll: 13, en: { name: 'Bag of Holding' }, ru: { name: 'Мешок Бездонный' } },
  { id: 'wc28', roll: 28, en: { name: 'Potion of Fortitude' }, ru: { name: 'Зелье Стойкости' } },
];
function prepItemFields(item) { return [item.en.name, item.ru.name]; }
function prepItemRoll(item) { return item.roll; }

test('isNumericQuery accepts only plain digit runs', () => {
  assert.equal(SPU.isNumericQuery('3'), true);
  assert.equal(SPU.isNumericQuery('28'), true);
  assert.equal(SPU.isNumericQuery('#3'), false);
  assert.equal(SPU.isNumericQuery('3 '), false);
  assert.equal(SPU.isNumericQuery(''), false);
});

test('a numeric query matches an item by its exact book roll number', () => {
  const result = SPU.filterItemEntries(PREP_ITEMS, '3', prepItemFields, prepItemRoll);
  assert.deepEqual(result.map(i => i.id), ['ci3']);
});

test('a numeric query does not substring-match a different roll number', () => {
  // "3" must not also pull in roll 13 or 28 just because they contain "3".
  const result = SPU.filterItemEntries(PREP_ITEMS, '3', prepItemFields, prepItemRoll);
  assert.deepEqual(result.map(i => i.id), ['ci3']);
});

test('a numeric query still matches a multi-digit roll number exactly', () => {
  const result = SPU.filterItemEntries(PREP_ITEMS, '28', prepItemFields, prepItemRoll);
  assert.deepEqual(result.map(i => i.id), ['wc28']);
});

test('a non-numeric query still matches item names as usual', () => {
  const byEn = SPU.filterItemEntries(PREP_ITEMS, 'quiver', prepItemFields, prepItemRoll);
  const byRu = SPU.filterItemEntries(PREP_ITEMS, 'колчан', prepItemFields, prepItemRoll);
  assert.deepEqual(byEn.map(i => i.id), ['ci3']);
  assert.deepEqual(byRu.map(i => i.id), ['ci3']);
});

test('an empty query returns every item unfiltered', () => {
  const result = SPU.filterItemEntries(PREP_ITEMS, '', prepItemFields, prepItemRoll);
  assert.deepEqual(result.map(i => i.id), PREP_ITEMS.map(i => i.id));
});

test('matchesItemSearch is false when the query matches neither name nor roll', () => {
  assert.equal(SPU.matchesItemSearch('99', prepItemFields(PREP_ITEMS[0]), PREP_ITEMS[0].roll), false);
  assert.equal(SPU.matchesItemSearch('dragon', prepItemFields(PREP_ITEMS[0]), PREP_ITEMS[0].roll), false);
});

/* ---------------- environment search (compact "All Environments" toolbar) ---------------- */

const TOOLBAR_I18N_EN = {
  type_exploration: 'Exploration', type_social: 'Social',
  biome_forest: 'Forest', biome_settlement: 'Settlement', biome_underground: 'Underground', biome_aquatic: 'Aquatic',
};
const TOOLBAR_I18N_RU = {
  type_exploration: 'Исследование', type_social: 'Социальный',
  biome_forest: 'Лесное', biome_settlement: 'Поселение', biome_underground: 'Подземелье', biome_aquatic: 'Водное',
};

const TOOLBAR_ENVS = [
  { id: 'moonlit-glade', name: { en: 'Moonlit Glade', ru: 'Лунная Поляна' }, tier: 1, type: 'exploration', biomes: ['forest'] },
  { id: 'market-square', name: { en: 'Market Square', ru: 'Рыночная Площадь' }, tier: 2, type: 'social', biomes: ['settlement'] },
  { id: 'sunken-reef', name: { en: 'Sunken Reef', ru: 'Затонувший Риф' }, tier: 3, type: 'exploration', biomes: ['aquatic', 'settlement'] },
  { id: 'forgotten-crypt', name: { en: 'Forgotten Crypt', ru: 'Забытый Склеп' }, tier: 3, type: 'exploration', biomes: ['underground'] },
  { id: 'tierless-rift', name: { en: 'Tierless Rift', ru: 'Безранговый Разлом' }, tier: null, type: 'event', biomes: [] },
];

function toolbarIndex() {
  return SPU.buildEnvironmentSearchIndex(TOOLBAR_ENVS, TOOLBAR_I18N_EN, TOOLBAR_I18N_RU);
}

function toolbarFilter(options) {
  return SPU.filterEnvironmentsByToolbar(TOOLBAR_ENVS, toolbarIndex(), options);
}

test('partial English name match', () => {
  assert.deepEqual(toolbarFilter({ search: 'moon' }).map(e => e.id), ['moonlit-glade']);
});

test('full English name match', () => {
  assert.deepEqual(toolbarFilter({ search: 'Moonlit Glade' }).map(e => e.id), ['moonlit-glade']);
});

test('partial Russian name match', () => {
  assert.deepEqual(toolbarFilter({ search: 'полян' }).map(e => e.id), ['moonlit-glade']);
});

test('full Russian name match', () => {
  assert.deepEqual(toolbarFilter({ search: 'Лунная Поляна' }).map(e => e.id), ['moonlit-glade']);
});

test('search by bare numeric tier', () => {
  assert.deepEqual(toolbarFilter({ search: '2' }).map(e => e.id), ['market-square']);
});

test('search by "tier N"', () => {
  assert.deepEqual(toolbarFilter({ search: 'tier 2' }).map(e => e.id), ['market-square']);
});

test('search by "rank N"', () => {
  assert.deepEqual(toolbarFilter({ search: 'rank 2' }).map(e => e.id), ['market-square']);
});

test('search by "ранг N"', () => {
  assert.deepEqual(toolbarFilter({ search: 'ранг 2' }).map(e => e.id), ['market-square']);
});

test('English type search', () => {
  assert.deepEqual(toolbarFilter({ search: 'social' }).map(e => e.id), ['market-square']);
});

test('Russian type search', () => {
  assert.deepEqual(toolbarFilter({ search: 'социал' }).map(e => e.id), ['market-square']);
});

test('English biome search', () => {
  assert.deepEqual(toolbarFilter({ search: 'underg' }).map(e => e.id), ['forgotten-crypt']);
});

test('Russian biome search', () => {
  assert.deepEqual(toolbarFilter({ search: 'подзем' }).map(e => e.id), ['forgotten-crypt']);
});

test('multi-token AND matching across different fields (tier + biome + type)', () => {
  // "3" -> tier, "подзем" -> biome, "исслед" -> type, all on forgotten-crypt only.
  const result = toolbarFilter({ search: '3 подзем исслед' });
  assert.deepEqual(result.map(e => e.id), ['forgotten-crypt']);
});

test('multi-token query with no common match returns nothing', () => {
  assert.deepEqual(toolbarFilter({ search: 'moonlit settlement' }), []);
});

test('case-insensitive matching', () => {
  const upper = toolbarFilter({ search: 'MOONLIT' });
  const lower = toolbarFilter({ search: 'moonlit' });
  assert.deepEqual(upper.map(e => e.id), lower.map(e => e.id));
  assert.deepEqual(upper.map(e => e.id), ['moonlit-glade']);
});

test('ё and е are treated as equivalent', () => {
  // Query typed with plain "е" must still find data spelled with "ё".
  const yoEnv = [{ id: 'dead-woods', name: { en: 'Dead Woods', ru: 'Мёртвый Лес' }, tier: 1, type: 'exploration', biomes: ['forest'] }];
  const index = SPU.buildEnvironmentSearchIndex(yoEnv, TOOLBAR_I18N_EN, TOOLBAR_I18N_RU);
  const result = SPU.filterEnvironmentsByToolbar(yoEnv, index, { search: 'мертвый' });
  assert.deepEqual(result.map(e => e.id), ['dead-woods']);
});

test('punctuation and repeated whitespace are normalized away', () => {
  const punctuated = toolbarFilter({ search: 'moonlit,   glade!!' });
  assert.deepEqual(punctuated.map(e => e.id), ['moonlit-glade']);
});

test('environments with a missing Russian name are still matched by English fields', () => {
  const noRuName = [{ id: 'en-only', name: { en: 'Silent Vale' }, tier: 1, type: 'exploration', biomes: [] }];
  const index = SPU.buildEnvironmentSearchIndex(noRuName, TOOLBAR_I18N_EN, TOOLBAR_I18N_RU);
  const result = SPU.filterEnvironmentsByToolbar(noRuName, index, { search: 'silent' });
  assert.deepEqual(result.map(e => e.id), ['en-only']);
});

test('environments with missing or empty biome data never throw and are matched by name', () => {
  const noBiomes = [{ id: 'no-biomes', name: { en: 'Blank Slate', ru: '' }, tier: null, type: null }];
  const index = SPU.buildEnvironmentSearchIndex(noBiomes, TOOLBAR_I18N_EN, TOOLBAR_I18N_RU);
  assert.doesNotThrow(() => SPU.filterEnvironmentsByToolbar(noBiomes, index, { search: 'blank' }));
  const result = SPU.filterEnvironmentsByToolbar(noBiomes, index, { search: 'blank' });
  assert.deepEqual(result.map(e => e.id), ['no-biomes']);
});

test('a query producing no matches returns an empty array', () => {
  assert.deepEqual(toolbarFilter({ search: 'nonexistentplace' }), []);
});

test('an empty query returns the full environment catalogue', () => {
  assert.deepEqual(toolbarFilter({ search: '' }).map(e => e.id), TOOLBAR_ENVS.map(e => e.id));
});

test('filterEnvironmentsByToolbar never mutates the input array', () => {
  const before = TOOLBAR_ENVS.map(e => e.id);
  toolbarFilter({ search: 'moon', tiers: new Set([1]) });
  assert.deepEqual(TOOLBAR_ENVS.map(e => e.id), before);
});

/* ---------------- environment Tier multiselect (compact toolbar) ---------------- */

test('no selected Tier means all tiers are allowed', () => {
  assert.deepEqual(toolbarFilter({}).map(e => e.id), TOOLBAR_ENVS.map(e => e.id));
});

test('selecting one Tier filters to that Tier only', () => {
  assert.deepEqual(toolbarFilter({ tiers: new Set([2]) }).map(e => e.id), ['market-square']);
});

test('selecting multiple Tiers ORs them together', () => {
  const result = toolbarFilter({ tiers: new Set([1, 2]) });
  assert.deepEqual(result.map(e => e.id).sort(), ['market-square', 'moonlit-glade']);
});

test('Tier selection ANDs with the text search', () => {
  const result = toolbarFilter({ tiers: new Set([3]), search: 'crypt' });
  assert.deepEqual(result.map(e => e.id), ['forgotten-crypt']);
  const noMatch = toolbarFilter({ tiers: new Set([1]), search: 'crypt' });
  assert.deepEqual(noMatch, []);
});

test('a tier-agnostic (null tier) environment never matches a Tier filter', () => {
  const result = toolbarFilter({ tiers: new Set([1, 2, 3, 4]) });
  assert.equal(result.some(e => e.id === 'tierless-rift'), false);
});

/* ---------------- id-list normalization ---------------- */

test('normalizeIdList drops duplicates while preserving first-seen order', () => {
  assert.deepEqual(SPU.normalizeIdList(['a', 'b', 'a', 'c', 'b']), ['a', 'b', 'c']);
});

test('normalizeIdList drops non-string and empty entries', () => {
  assert.deepEqual(SPU.normalizeIdList(['a', null, '', 42, 'b']), ['a', 'b']);
});

/* ---------------- adversary filters (Tier / Type / Selected only) ---------------- */

const PREP_ADVS = [
  { id: 'acid-burrower', name: { en: 'Acid Burrower', ru: 'Кислотный Землекоп' }, tier: 1, type: 'solo' },
  { id: 'bugboar', name: { en: 'Bugboar', ru: 'Багбор' }, tier: 1, type: 'bruiser' },
  { id: 'construct', name: { en: 'Construct', ru: 'Конструкт' }, tier: 1, type: 'solo' },
  { id: 'courtier', name: { en: 'Courtier', ru: 'Придворный' }, tier: 2, type: 'social' },
  { id: 'dire-wolf', name: { en: 'Dire Wolf', ru: 'Лютоволк' }, tier: 1, type: 'skulk' },
];

test('filterAdversaries with no filters returns the full catalogue', () => {
  const result = SPU.filterAdversaries(PREP_ADVS, {});
  assert.deepEqual(result.map(a => a.id), PREP_ADVS.map(a => a.id));
});

test('filterAdversaries matches by English name', () => {
  const result = SPU.filterAdversaries(PREP_ADVS, { search: 'bugboar' });
  assert.deepEqual(result.map(a => a.id), ['bugboar']);
});

test('filterAdversaries matches by Russian name', () => {
  const result = SPU.filterAdversaries(PREP_ADVS, { search: 'Лютоволк' });
  assert.deepEqual(result.map(a => a.id), ['dire-wolf']);
});

test('filterAdversaries search is case-insensitive', () => {
  const result = SPU.filterAdversaries(PREP_ADVS, { search: 'BUGBOAR' });
  assert.deepEqual(result.map(a => a.id), ['bugboar']);
});

test('filterAdversaries filters by a single Tier', () => {
  const result = SPU.filterAdversaries(PREP_ADVS, { tiers: [2] });
  assert.deepEqual(result.map(a => a.id), ['courtier']);
});

test('filterAdversaries ORs multiple Tier values', () => {
  const result = SPU.filterAdversaries(PREP_ADVS, { tiers: [2] }).concat(); // sanity
  const orResult = SPU.filterAdversaries(PREP_ADVS, { tiers: new Set([1, 2]) });
  assert.deepEqual(orResult.map(a => a.id), PREP_ADVS.map(a => a.id));
});

test('filterAdversaries filters by a single Type', () => {
  const result = SPU.filterAdversaries(PREP_ADVS, { types: ['bruiser'] });
  assert.deepEqual(result.map(a => a.id), ['bugboar']);
});

test('filterAdversaries ORs multiple Type values', () => {
  const result = SPU.filterAdversaries(PREP_ADVS, { types: ['bruiser', 'social'] });
  assert.deepEqual(result.map(a => a.id).sort(), ['bugboar', 'courtier']);
});

test('filterAdversaries ANDs Tier and Type', () => {
  const result = SPU.filterAdversaries(PREP_ADVS, { tiers: [1], types: ['solo'] });
  assert.deepEqual(result.map(a => a.id).sort(), ['acid-burrower', 'construct']);
});

test('filterAdversaries ANDs text search with Tier/Type filters', () => {
  const result = SPU.filterAdversaries(PREP_ADVS, { search: 'construct', tiers: [1], types: ['solo'] });
  assert.deepEqual(result.map(a => a.id), ['construct']);
  const noMatch = SPU.filterAdversaries(PREP_ADVS, { search: 'construct', tiers: [2] });
  assert.deepEqual(noMatch, []);
});

test('filterAdversaries Selected only keeps only ids in selectedIds', () => {
  const result = SPU.filterAdversaries(PREP_ADVS, { selectedOnly: true, selectedIds: ['bugboar', 'courtier'] });
  assert.deepEqual(result.map(a => a.id).sort(), ['bugboar', 'courtier']);
});

test('filterAdversaries Selected only combines with Tier and Type', () => {
  const result = SPU.filterAdversaries(PREP_ADVS, {
    selectedOnly: true, selectedIds: ['bugboar', 'courtier', 'dire-wolf'], tiers: [1],
  });
  assert.deepEqual(result.map(a => a.id).sort(), ['bugboar', 'dire-wolf']);
});

test('filterAdversaries never mutates the input array or selection', () => {
  const before = PREP_ADVS.map(a => a.id);
  SPU.filterAdversaries(PREP_ADVS, { tiers: [1], types: ['solo'], selectedOnly: true, selectedIds: ['construct'] });
  assert.deepEqual(PREP_ADVS.map(a => a.id), before);
});

test('ADVERSARY_TIERS and ADVERSARY_TYPES expose the fixed enums', () => {
  assert.deepEqual(SPU.ADVERSARY_TIERS, [1, 2, 3, 4]);
  assert.equal(SPU.ADVERSARY_TYPES.length, 10);
  assert.ok(SPU.ADVERSARY_TYPES.includes('bruiser'));
  assert.ok(SPU.ADVERSARY_TYPES.includes('support'));
});

/* ---------------- item filters (Category / Source) ---------------- */

const PREP_LOOT_ITEMS = [
  { id: 'ci1', kind: 'item', src: 'core', roll: 1, en: { name: 'Premium Bedroll' }, ru: { name: 'Спальный Мешок' } },
  { id: 'cc1', kind: 'consumable', src: 'core', roll: 1, en: { name: 'Minor Health Potion' }, ru: { name: 'Зелье Лечения' } },
  { id: 'hi1', kind: 'item', src: 'hnf', roll: 1, en: { name: 'Wondrous Compass' }, ru: { name: 'Чудесный Компас' } },
  { id: 'hc1', kind: 'consumable', src: 'hnf', roll: 1, en: { name: 'Vial of Starlight' }, ru: { name: 'Флакон Звёздного Света' } },
];
const lootItemFields = i => [i.en?.name, i.ru?.name];
const lootItemRoll = i => i.roll;

test('filterItems with no filters returns every item', () => {
  const result = SPU.filterItems(PREP_LOOT_ITEMS, {}, lootItemFields, lootItemRoll);
  assert.deepEqual(result.map(i => i.id), PREP_LOOT_ITEMS.map(i => i.id));
});

test('filterItems category "item" returns only items, not consumables', () => {
  const result = SPU.filterItems(PREP_LOOT_ITEMS, { category: 'item' }, lootItemFields, lootItemRoll);
  assert.deepEqual(result.map(i => i.id).sort(), ['ci1', 'hi1']);
});

test('filterItems category "consumable" returns only consumables', () => {
  const result = SPU.filterItems(PREP_LOOT_ITEMS, { category: 'consumable' }, lootItemFields, lootItemRoll);
  assert.deepEqual(result.map(i => i.id).sort(), ['cc1', 'hc1']);
});

test('filterItems source "core" excludes Hope & Fear items', () => {
  const result = SPU.filterItems(PREP_LOOT_ITEMS, { source: 'core' }, lootItemFields, lootItemRoll);
  assert.deepEqual(result.map(i => i.id).sort(), ['cc1', 'ci1']);
});

test('filterItems source "hnf" excludes Core items', () => {
  const result = SPU.filterItems(PREP_LOOT_ITEMS, { source: 'hnf' }, lootItemFields, lootItemRoll);
  assert.deepEqual(result.map(i => i.id).sort(), ['hc1', 'hi1']);
});

test('filterItems category and source combine with AND', () => {
  const result = SPU.filterItems(PREP_LOOT_ITEMS, { category: 'item', source: 'hnf' }, lootItemFields, lootItemRoll);
  assert.deepEqual(result.map(i => i.id), ['hi1']);
});

test('filterItems combines category/source with a name search', () => {
  const result = SPU.filterItems(PREP_LOOT_ITEMS, { category: 'item', source: 'core', search: 'bedroll' }, lootItemFields, lootItemRoll);
  assert.deepEqual(result.map(i => i.id), ['ci1']);
  const noMatch = SPU.filterItems(PREP_LOOT_ITEMS, { category: 'consumable', source: 'core', search: 'bedroll' }, lootItemFields, lootItemRoll);
  assert.deepEqual(noMatch, []);
});

test('filterItems source "all" is the same as no source filter', () => {
  const all = SPU.filterItems(PREP_LOOT_ITEMS, { source: 'all' }, lootItemFields, lootItemRoll);
  const none = SPU.filterItems(PREP_LOOT_ITEMS, {}, lootItemFields, lootItemRoll);
  assert.deepEqual(all.map(i => i.id), none.map(i => i.id));
});
