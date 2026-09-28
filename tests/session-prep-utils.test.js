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
