/* ============================================================
   Bacchus's Atlas — tests/prep-utils.test.js
   Dependency-free regression tests for js/prep-utils.js. Run with:

     node --test tests/prep-utils.test.js

   PrepUtils is pure (no DOM, no application state, no i18n), so it
   is exercised directly here — same shape as tests/list-rename.test.js.
   Every selection (environment/adversary/item) is binary: there is no
   primary environment and no quantity anywhere in this module.
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const SPU = require('../js/prep-utils.js');

function basePrep(overrides = {}) {
  return Object.assign(SPU.createDefaultPrep('default', '2024-01-01T00:00:00.000Z'), overrides);
}

/* ---------------- default shape ---------------- */

test('createDefaultStore has one default prep with no primary environment and no quantity objects', () => {
  const store = SPU.createDefaultStore('2024-01-01T00:00:00.000Z');
  assert.equal(store.schemaVersion, 2);
  assert.equal(store.activeSessionId, 'default');
  assert.equal(store.sessions.length, 1);
  const prep = store.sessions[0];
  assert.deepEqual(prep.environmentIds, []);
  assert.deepEqual(prep.adversaryIds, []);
  assert.deepEqual(prep.itemIds, []);
  assert.equal('primaryEnvironmentId' in prep, false);
  assert.equal('adversaries' in prep, false);
  assert.equal('items' in prep, false);
});

test('getActivePrep finds the prep matching activeSessionId', () => {
  const store = { activeSessionId: 'b', sessions: [basePrep({ id: 'a' }), basePrep({ id: 'b' })] };
  assert.equal(SPU.getActivePrep(store).id, 'b');
});

test('getActivePrep falls back to the first prep for an unknown activeSessionId', () => {
  const store = { activeSessionId: 'ghost', sessions: [basePrep({ id: 'a' })] };
  assert.equal(SPU.getActivePrep(store).id, 'a');
});

test('getActivePrep returns null for a store with no preps', () => {
  assert.equal(SPU.getActivePrep({ activeSessionId: 'default', sessions: [] }), null);
  assert.equal(SPU.getActivePrep(null), null);
});

/* ---------------- prep lifecycle (create / switch / duplicate / delete) ---------------- */

test('addPrep appends the new prep and makes it active', () => {
  const store = { schemaVersion: 2, activeSessionId: 'a', sessions: [basePrep({ id: 'a' })] };
  const next = SPU.addPrep(store, basePrep({ id: 'b' }));
  assert.equal(next.sessions.length, 2);
  assert.equal(next.activeSessionId, 'b');
  assert.equal(store.sessions.length, 1, 'original store is not mutated');
});

test('setActivePrep switches to an existing prep', () => {
  const store = { activeSessionId: 'a', sessions: [basePrep({ id: 'a' }), basePrep({ id: 'b' })] };
  const next = SPU.setActivePrep(store, 'b');
  assert.equal(next.activeSessionId, 'b');
});

test('setActivePrep is a no-op (returns the same store) for an unknown prep id', () => {
  const store = { activeSessionId: 'a', sessions: [basePrep({ id: 'a' })] };
  assert.equal(SPU.setActivePrep(store, 'ghost'), store);
});

test('setActivePrep is a no-op for the already-active prep', () => {
  const store = { activeSessionId: 'a', sessions: [basePrep({ id: 'a' })] };
  assert.equal(SPU.setActivePrep(store, 'a'), store);
});

test('removePrep drops a non-active prep without changing activeSessionId', () => {
  const store = { activeSessionId: 'a', sessions: [basePrep({ id: 'a' }), basePrep({ id: 'b' })] };
  const next = SPU.removePrep(store, 'b');
  assert.deepEqual(next.sessions.map(s => s.id), ['a']);
  assert.equal(next.activeSessionId, 'a');
});

test('removePrep activates the next prep in list order when the active prep is removed', () => {
  const store = { activeSessionId: 'b', sessions: [basePrep({ id: 'a' }), basePrep({ id: 'b' }), basePrep({ id: 'c' })] };
  const next = SPU.removePrep(store, 'b');
  assert.deepEqual(next.sessions.map(s => s.id), ['a', 'c']);
  assert.equal(next.activeSessionId, 'c');
});

test('removePrep falls back to the previous prep when the active prep is the last one', () => {
  const store = { activeSessionId: 'c', sessions: [basePrep({ id: 'a' }), basePrep({ id: 'b' }), basePrep({ id: 'c' })] };
  const next = SPU.removePrep(store, 'c');
  assert.deepEqual(next.sessions.map(s => s.id), ['a', 'b']);
  assert.equal(next.activeSessionId, 'b');
});

test('removePrep deleting the only prep leaves an empty preps array and no active prep', () => {
  const store = { activeSessionId: 'a', sessions: [basePrep({ id: 'a' })] };
  const next = SPU.removePrep(store, 'a');
  assert.deepEqual(next.sessions, []);
  assert.equal(next.activeSessionId, null);
});

test('removePrep is a no-op for an unknown prep id', () => {
  const store = { activeSessionId: 'a', sessions: [basePrep({ id: 'a' })] };
  assert.equal(SPU.removePrep(store, 'ghost'), store);
});

/* ---------------- resolvePrepTitle ---------------- */

test('resolvePrepTitle trims surrounding whitespace', () => {
  assert.equal(SPU.resolvePrepTitle('  Sunken Temple  ', 'New prep'), 'Sunken Temple');
});

test('resolvePrepTitle falls back for an empty or whitespace-only value', () => {
  assert.equal(SPU.resolvePrepTitle('', 'New prep'), 'New prep');
  assert.equal(SPU.resolvePrepTitle('   ', 'New prep'), 'New prep');
  assert.equal(SPU.resolvePrepTitle(null, 'New prep'), 'New prep');
});

/* ---------------- resolvePrepRename ---------------- */

test('resolvePrepRename rejects an empty or whitespace-only value and keeps the previous title', () => {
  assert.deepEqual(SPU.resolvePrepRename('Cursed Temple', ''), { status: 'invalid', value: 'Cursed Temple' });
  assert.deepEqual(SPU.resolvePrepRename('Cursed Temple', '   '), { status: 'invalid', value: 'Cursed Temple' });
  assert.deepEqual(SPU.resolvePrepRename('Cursed Temple', null), { status: 'invalid', value: 'Cursed Temple' });
});

test('resolvePrepRename reports an unchanged title (after trimming) as unchanged', () => {
  assert.deepEqual(SPU.resolvePrepRename('Cursed Temple', '  Cursed Temple '), { status: 'unchanged', value: 'Cursed Temple' });
});

test('resolvePrepRename returns the trimmed new title as changed', () => {
  assert.deepEqual(SPU.resolvePrepRename('Cursed Temple', '  Sunken Vault '), { status: 'changed', value: 'Sunken Vault' });
});

test('resolvePrepRename clamps to maxLength', () => {
  const result = SPU.resolvePrepRename('a', 'b'.repeat(200), 120);
  assert.equal(result.status, 'changed');
  assert.equal(result.value.length, 120);
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
  const result = SPU.toggleEnvironment(basePrep(), 'env-a');
  assert.equal(result.changed, true);
  assert.deepEqual(result.prep.environmentIds, ['env-a']);
  assert.equal('primaryEnvironmentId' in result.prep, false);
});

test('a second and third selected environment are both added in order', () => {
  let prep = basePrep({ environmentIds: ['env-a'] });
  const second = SPU.toggleEnvironment(prep, 'env-b');
  assert.deepEqual(second.prep.environmentIds, ['env-a', 'env-b']);
  const third = SPU.toggleEnvironment(second.prep, 'env-c');
  assert.deepEqual(third.prep.environmentIds, ['env-a', 'env-b', 'env-c']);
});

test('a fourth environment selection is rejected and leaves the prep unchanged', () => {
  const prep = basePrep({ environmentIds: ['a', 'b', 'c'] });
  const result = SPU.toggleEnvironment(prep, 'd');
  assert.equal(result.changed, false);
  assert.equal(result.limitReached, true);
  assert.equal(result.prep, prep, 'the prep reference must be unchanged, not a mutated copy');
  assert.deepEqual(result.prep.environmentIds, ['a', 'b', 'c']);
});

test('toggling an already-selected environment removes it', () => {
  const prep = basePrep({ environmentIds: ['a', 'b'] });
  const result = SPU.toggleEnvironment(prep, 'b');
  assert.deepEqual(result.prep.environmentIds, ['a']);
});

test('removeEnvironment removes only the named environment', () => {
  const prep = basePrep({ environmentIds: ['a', 'b', 'c'] });
  const result = SPU.removeEnvironment(prep, 'b');
  assert.deepEqual(result.prep.environmentIds, ['a', 'c']);
  assert.equal(result.changed, true);
  assert.equal(result.limitReached, false);
});

test('removing the last environment leaves an empty selection', () => {
  const prep = basePrep({ environmentIds: ['a'] });
  const result = SPU.removeEnvironment(prep, 'a');
  assert.deepEqual(result.prep.environmentIds, []);
});

test('toggleEnvironment/removeEnvironment do not mutate the input prep', () => {
  const prep = basePrep({ environmentIds: ['a'] });
  const snapshot = JSON.stringify(prep);
  SPU.toggleEnvironment(prep, 'b');
  SPU.removeEnvironment(prep, 'a');
  assert.equal(JSON.stringify(prep), snapshot);
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

/* ---------------- adversary search + Tier/Type filters (compact "All Adversaries" toolbar) ---------------- */

const ADV_I18N_EN = {
  adversary_type_solo: 'Solo', adversary_type_bruiser: 'Bruiser', adversary_type_social: 'Social',
  adversary_type_skulk: 'Skulk',
};
const ADV_I18N_RU = {
  adversary_type_solo: 'Одиночка', adversary_type_bruiser: 'Громила', adversary_type_social: 'Социальный',
  adversary_type_skulk: 'Скрытный',
};

const TOOLBAR_ADVS = [
  { id: 'acid-burrower', name: { en: 'Acid Burrower', ru: 'Кислотный Землекоп' }, tier: 1, type: 'solo' },
  { id: 'bugboar', name: { en: 'Bugboar', ru: 'Багбор' }, tier: 1, type: 'bruiser' },
  { id: 'dire-wolf', name: { en: 'Dire Wolf', ru: 'Лютоволк' }, tier: 1, type: 'skulk' },
  { id: 'courtier', name: { en: 'Courtier', ru: 'Придворный' }, tier: 2, type: 'social' },
  { id: 'sea-hex', name: { en: 'Sea Hex', ru: 'Морская Ведьма' }, tier: 2, type: 'solo' },
];

function advIndex(advs = TOOLBAR_ADVS) {
  return SPU.buildAdversarySearchIndex(advs, ADV_I18N_EN, ADV_I18N_RU);
}

function advToolbarFilter(options, advs = TOOLBAR_ADVS) {
  return SPU.filterAdversariesByToolbar(advs, advIndex(advs), options);
}

test('partial English adversary name match', () => {
  assert.deepEqual(advToolbarFilter({ search: 'acid' }).map(a => a.id), ['acid-burrower']);
});

test('complete English adversary name match', () => {
  assert.deepEqual(advToolbarFilter({ search: 'Acid Burrower' }).map(a => a.id), ['acid-burrower']);
});

test('a fragment inside the name (not just a prefix) still matches', () => {
  assert.deepEqual(advToolbarFilter({ search: 'burrow' }).map(a => a.id), ['acid-burrower']);
});

test('partial Russian adversary name match', () => {
  assert.deepEqual(advToolbarFilter({ search: 'землек' }).map(a => a.id), ['acid-burrower']);
});

test('complete Russian adversary name match', () => {
  assert.deepEqual(advToolbarFilter({ search: 'Кислотный Землекоп' }).map(a => a.id), ['acid-burrower']);
});

test('adversary search is case-insensitive', () => {
  assert.deepEqual(advToolbarFilter({ search: 'ACID' }).map(a => a.id), advToolbarFilter({ search: 'acid' }).map(a => a.id));
});

test('punctuation and repeated whitespace are normalized away', () => {
  assert.deepEqual(advToolbarFilter({ search: 'acid,,,   burrower!!' }).map(a => a.id), ['acid-burrower']);
});

test('ё and е are treated as equivalent in adversary search', () => {
  const yoAdv = [{ id: 'restless-spirit', name: { en: 'Restless Spirit', ru: 'Мёртвый Дух' }, tier: 1, type: 'skulk' }];
  const result = SPU.filterAdversariesByToolbar(yoAdv, SPU.buildAdversarySearchIndex(yoAdv, ADV_I18N_EN, ADV_I18N_RU), { search: 'мертвый' });
  assert.deepEqual(result.map(a => a.id), ['restless-spirit']);
});

test('English Tier alias "tier N"', () => {
  assert.deepEqual(advToolbarFilter({ search: 'tier 1' }).map(a => a.id).sort(), ['acid-burrower', 'bugboar', 'dire-wolf']);
});

test('English Tier alias "tierN" (no space)', () => {
  assert.deepEqual(advToolbarFilter({ search: 'tier1' }).map(a => a.id).sort(), ['acid-burrower', 'bugboar', 'dire-wolf']);
});

test('English Tier alias "tN"', () => {
  assert.deepEqual(advToolbarFilter({ search: 't1' }).map(a => a.id).sort(), ['acid-burrower', 'bugboar', 'dire-wolf']);
});

test('Russian Tier alias "тир N"', () => {
  assert.deepEqual(advToolbarFilter({ search: 'тир 1' }).map(a => a.id).sort(), ['acid-burrower', 'bugboar', 'dire-wolf']);
});

test('Russian Tier alias "тирN" (no space)', () => {
  assert.deepEqual(advToolbarFilter({ search: 'тир1' }).map(a => a.id).sort(), ['acid-burrower', 'bugboar', 'dire-wolf']);
});

test('Russian Tier alias "ранг N" (the RU UI\'s own Tier label)', () => {
  assert.deepEqual(advToolbarFilter({ search: 'ранг 2' }).map(a => a.id).sort(), ['courtier', 'sea-hex']);
});

test('an exact bare Tier query (1-4) matches every adversary at that Tier', () => {
  assert.deepEqual(advToolbarFilter({ search: '2' }).map(a => a.id).sort(), ['courtier', 'sea-hex']);
});

test('English Type label search', () => {
  assert.deepEqual(advToolbarFilter({ search: 'solo' }).map(a => a.id).sort(), ['acid-burrower', 'sea-hex']);
});

test('Russian Type label search', () => {
  assert.deepEqual(advToolbarFilter({ search: 'одиночка' }).map(a => a.id).sort(), ['acid-burrower', 'sea-hex']);
});

test('raw Type key search', () => {
  assert.deepEqual(advToolbarFilter({ search: 'skulk' }).map(a => a.id), ['dire-wolf']);
});

test('multi-token AND: "tier 2 solo" matches only the Tier-2 Solo adversary', () => {
  assert.deepEqual(advToolbarFilter({ search: 'tier 2 solo' }).map(a => a.id), ['sea-hex']);
});

test('multi-token AND via Russian aliases: "тир 2 одиночка"', () => {
  assert.deepEqual(advToolbarFilter({ search: 'тир 2 одиночка' }).map(a => a.id), ['sea-hex']);
});

test('a multi-token query with no common match returns nothing', () => {
  assert.deepEqual(advToolbarFilter({ search: 'bugboar solo' }), []);
});

test('an empty query returns the full adversary catalogue', () => {
  assert.deepEqual(advToolbarFilter({ search: '' }).map(a => a.id), TOOLBAR_ADVS.map(a => a.id));
});

test('adversary search index is reused across repeated filter calls rather than rebuilt from the live record', () => {
  const advs = [{ id: 'acid-burrower', name: { en: 'Acid Burrower', ru: 'Кислотный Землекоп' }, tier: 1, type: 'solo' }];
  const index = SPU.buildAdversarySearchIndex(advs, ADV_I18N_EN, ADV_I18N_RU);
  // Mutating the record after the index is built must not affect a search
  // against the (unchanged) precomputed index — proof the index is a
  // once-built snapshot, never recomputed inside filterAdversariesByToolbar().
  advs[0].name.en = 'Totally Renamed Creature';
  const result = SPU.filterAdversariesByToolbar(advs, index, { search: 'acid' });
  assert.deepEqual(result.map(a => a.id), ['acid-burrower']);
});

test('filterAdversariesByToolbar never mutates the input array', () => {
  const before = TOOLBAR_ADVS.map(a => a.id);
  advToolbarFilter({ search: 'acid', tiers: new Set([1]) });
  assert.deepEqual(TOOLBAR_ADVS.map(a => a.id), before);
});

test('no selected Tier or Type means every adversary is allowed', () => {
  assert.deepEqual(advToolbarFilter({}).map(a => a.id), TOOLBAR_ADVS.map(a => a.id));
});

test('selecting one Tier filters to that Tier only', () => {
  assert.deepEqual(advToolbarFilter({ tiers: new Set([2]) }).map(a => a.id).sort(), ['courtier', 'sea-hex']);
});

test('selecting multiple Tiers ORs them together', () => {
  const result = advToolbarFilter({ tiers: new Set([1, 2]) });
  assert.deepEqual(result.map(a => a.id).sort(), TOOLBAR_ADVS.map(a => a.id).sort());
});

test('selecting one Type filters to that Type only', () => {
  assert.deepEqual(advToolbarFilter({ types: new Set(['bruiser']) }).map(a => a.id), ['bugboar']);
});

test('selecting multiple Types ORs them together', () => {
  const result = advToolbarFilter({ types: new Set(['bruiser', 'social']) });
  assert.deepEqual(result.map(a => a.id).sort(), ['bugboar', 'courtier']);
});

test('Tier and Type selections AND together', () => {
  assert.deepEqual(advToolbarFilter({ tiers: new Set([1]), types: new Set(['solo']) }).map(a => a.id), ['acid-burrower']);
});

test('Search, Tier, and Type all AND together', () => {
  const result = advToolbarFilter({ search: 'sea', tiers: new Set([2]), types: new Set(['solo']) });
  assert.deepEqual(result.map(a => a.id), ['sea-hex']);
  const noMatch = advToolbarFilter({ search: 'sea', tiers: new Set([1]) });
  assert.deepEqual(noMatch, []);
});

test('an empty Tier/Type group imposes no restriction on its own', () => {
  assert.deepEqual(advToolbarFilter({ tiers: new Set(), types: new Set() }).map(a => a.id), TOOLBAR_ADVS.map(a => a.id));
});

test('filterAdversariesByToolbar never mutates the Tier/Type filter Sets it is given', () => {
  const tiers = new Set([1]);
  const types = new Set(['solo']);
  advToolbarFilter({ tiers, types });
  assert.deepEqual([...tiers], [1]);
  assert.deepEqual([...types], ['solo']);
});

test('ADVERSARY_TIERS and ADVERSARY_TYPES expose the fixed enums', () => {
  assert.deepEqual(SPU.ADVERSARY_TIERS, [1, 2, 3, 4]);
  assert.equal(SPU.ADVERSARY_TYPES.length, 10);
  assert.ok(SPU.ADVERSARY_TYPES.includes('bruiser'));
  assert.ok(SPU.ADVERSARY_TYPES.includes('support'));
});

/* ---------------- item search + filters (compact "All Items" toolbar) ---------------- */

const PREP_LOOT_ITEMS = [
  { id: 'ci1', kind: 'item', src: 'core', roll: 1, en: { name: 'Premium Bedroll' }, ru: { name: 'Спальный Мешок' } },
  { id: 'cc1', kind: 'consumable', src: 'core', roll: 1, en: { name: 'Minor Health Potion' }, ru: { name: 'Зелье Лечения' } },
  { id: 'hi1', kind: 'item', src: 'hnf', roll: 1, en: { name: 'Wondrous Compass' }, ru: { name: 'Чудесный Компас' } },
  { id: 'hc1', kind: 'consumable', src: 'hnf', roll: 1, en: { name: 'Vial of Starlight' }, ru: { name: 'Флакон Звёздного Света' } },
  { id: 'ci30', kind: 'item', src: 'core', roll: 30, en: { name: 'Torch' }, ru: { name: 'Факел' } },
  { id: 'cc30', kind: 'consumable', src: 'core', roll: 30, en: { name: 'Minor Poison' }, ru: { name: 'Малый Яд' } },
  { id: 'hi30', kind: 'item', src: 'hnf', roll: 30, en: { name: 'Wondrous Lantern' }, ru: { name: 'Чудесный Фонарь' } },
  { id: 'hc30', kind: 'consumable', src: 'hnf', roll: 30, en: { name: 'Venom Vial' }, ru: { name: 'Флакон Яда' } },
];

function itemIndex(items = PREP_LOOT_ITEMS) {
  return SPU.buildItemSearchIndex(items);
}

function itemToolbarFilter(options, items = PREP_LOOT_ITEMS) {
  return SPU.filterItemsByToolbar(items, itemIndex(items), options);
}

test('no selected Kind means both Items and Consumables show', () => {
  assert.deepEqual(itemToolbarFilter({}).map(i => i.id), PREP_LOOT_ITEMS.map(i => i.id));
});

test('selecting only "item" restricts to items', () => {
  const result = itemToolbarFilter({ types: new Set(['item']) });
  assert.deepEqual(result.map(i => i.id).sort(), ['ci1', 'ci30', 'hi1', 'hi30']);
});

test('selecting only "consumable" restricts to consumables', () => {
  const result = itemToolbarFilter({ types: new Set(['consumable']) });
  assert.deepEqual(result.map(i => i.id).sort(), ['cc1', 'cc30', 'hc1', 'hc30']);
});

test('selecting both Kinds shows both, same as neither selected', () => {
  const both = itemToolbarFilter({ types: new Set(['item', 'consumable']) });
  const neither = itemToolbarFilter({});
  assert.deepEqual(both.map(i => i.id).sort(), neither.map(i => i.id).sort());
});

test('no selected Source means both Core and Hope & Fear show', () => {
  assert.deepEqual(itemToolbarFilter({ sources: new Set() }).map(i => i.id), PREP_LOOT_ITEMS.map(i => i.id));
});

test('selecting only "core" restricts to Core records', () => {
  const result = itemToolbarFilter({ sources: new Set(['core']) });
  assert.deepEqual(result.map(i => i.id).sort(), ['cc1', 'cc30', 'ci1', 'ci30']);
});

test('selecting only "hnf" restricts to Hope & Fear records', () => {
  const result = itemToolbarFilter({ sources: new Set(['hnf']) });
  assert.deepEqual(result.map(i => i.id).sort(), ['hc1', 'hc30', 'hi1', 'hi30']);
});

test('selecting both Sources shows both, same as neither selected', () => {
  const both = itemToolbarFilter({ sources: new Set(['core', 'hnf']) });
  const neither = itemToolbarFilter({});
  assert.deepEqual(both.map(i => i.id).sort(), neither.map(i => i.id).sort());
});

test('Kind and Source selections AND together', () => {
  const result = itemToolbarFilter({ types: new Set(['consumable']), sources: new Set(['hnf']) });
  assert.deepEqual(result.map(i => i.id).sort(), ['hc1', 'hc30']);
});

test('partial English name match', () => {
  assert.deepEqual(itemToolbarFilter({ search: 'venom' }).map(i => i.id), ['hc30']);
});

test('partial Russian name match', () => {
  assert.deepEqual(itemToolbarFilter({ search: 'факел' }).map(i => i.id), ['ci30']);
});

test('English Kind alias ("item"/"items")', () => {
  const singular = itemToolbarFilter({ search: 'item' }).map(i => i.id).sort();
  const plural = itemToolbarFilter({ search: 'items' }).map(i => i.id).sort();
  const expected = ['ci1', 'ci30', 'hi1', 'hi30'];
  assert.deepEqual(singular, expected);
  assert.deepEqual(plural, expected);
});

test('Russian Kind alias ("расходник"/"расходники")', () => {
  const singular = itemToolbarFilter({ search: 'расходник' }).map(i => i.id).sort();
  const plural = itemToolbarFilter({ search: 'расходники' }).map(i => i.id).sort();
  const expected = ['cc1', 'cc30', 'hc1', 'hc30'];
  assert.deepEqual(singular, expected);
  assert.deepEqual(plural, expected);
});

test('Source search ("core", "hope and fear", "hope & fear")', () => {
  assert.deepEqual(itemToolbarFilter({ search: 'core' }).map(i => i.id).sort(), ['cc1', 'cc30', 'ci1', 'ci30']);
  const expectedHnf = ['hc1', 'hc30', 'hi1', 'hi30'];
  assert.deepEqual(itemToolbarFilter({ search: 'hope and fear' }).map(i => i.id).sort(), expectedHnf);
  assert.deepEqual(itemToolbarFilter({ search: 'hope & fear' }).map(i => i.id).sort(), expectedHnf);
});

test('a bare word that is a substring of a multi-word alias still matches ("hope")', () => {
  assert.deepEqual(itemToolbarFilter({ search: 'hope' }).map(i => i.id).sort(), ['hc1', 'hc30', 'hi1', 'hi30']);
});

test('exact roll-number search ("30")', () => {
  assert.deepEqual(itemToolbarFilter({ search: '30' }).map(i => i.id).sort(), ['cc30', 'ci30', 'hc30', 'hi30']);
});

test('exact roll-number search does not substring-match a different number', () => {
  // "1" must not also pull in a roll of 30 or vice versa.
  assert.deepEqual(itemToolbarFilter({ search: '1' }).map(i => i.id).sort(), ['cc1', 'ci1', 'hc1', 'hi1']);
});

test('"#"-prefixed exact roll-number search ("#30")', () => {
  assert.deepEqual(itemToolbarFilter({ search: '#30' }).map(i => i.id).sort(), ['cc30', 'ci30', 'hc30', 'hi30']);
});

test('inclusive range search ("1-10")', () => {
  const result = itemToolbarFilter({ search: '1-10' });
  assert.deepEqual(result.map(i => i.id).sort(), ['cc1', 'ci1', 'hc1', 'hi1']);
});

test('a reversed range is normalized back to ascending ("10-1")', () => {
  const forward = itemToolbarFilter({ search: '1-10' }).map(i => i.id).sort();
  const reversed = itemToolbarFilter({ search: '10-1' }).map(i => i.id).sort();
  assert.deepEqual(reversed, forward);
});

test('Unicode dash variants in a range are all treated the same ("1–10", "1—10", "1 - 10", "#1-10")', () => {
  const expected = itemToolbarFilter({ search: '1-10' }).map(i => i.id).sort();
  assert.deepEqual(itemToolbarFilter({ search: '1–10' }).map(i => i.id).sort(), expected);
  assert.deepEqual(itemToolbarFilter({ search: '1—10' }).map(i => i.id).sort(), expected);
  assert.deepEqual(itemToolbarFilter({ search: '1 - 10' }).map(i => i.id).sort(), expected);
  assert.deepEqual(itemToolbarFilter({ search: '#1-10' }).map(i => i.id).sort(), expected);
});

test('combined query: "core consumable 1-10"', () => {
  assert.deepEqual(itemToolbarFilter({ search: 'core consumable 1-10' }).map(i => i.id), ['cc1']);
});

test('combined query: "hope item #30"', () => {
  assert.deepEqual(itemToolbarFilter({ search: 'hope item #30' }).map(i => i.id), ['hi30']);
});

test('combined query: "расходник 20-30"', () => {
  assert.deepEqual(itemToolbarFilter({ search: 'расходник 20-30' }).map(i => i.id).sort(), ['cc30', 'hc30']);
});

test('an active dice-roll filter ANDs with type/source/search', () => {
  const result = itemToolbarFilter({ types: new Set(['consumable']), sources: new Set(['core']), search: 'poison', rollTotal: 30 });
  assert.deepEqual(result.map(i => i.id), ['cc30']);
  const noMatch = itemToolbarFilter({ rollTotal: 1, search: '30' });
  assert.deepEqual(noMatch, []);
});

test('invalid numeric syntax does not throw and returns a sane result', () => {
  assert.doesNotThrow(() => itemToolbarFilter({ search: '1-' }));
  assert.doesNotThrow(() => itemToolbarFilter({ search: 'abc-def' }));
  assert.deepEqual(itemToolbarFilter({ search: 'abc-def' }), []);
});

test('filterItemsByToolbar never mutates the input array or the filter Sets', () => {
  const before = PREP_LOOT_ITEMS.map(i => i.id);
  const types = new Set(['item']);
  const sources = new Set(['core']);
  itemToolbarFilter({ types, sources, search: 'torch' });
  assert.deepEqual(PREP_LOOT_ITEMS.map(i => i.id), before);
  assert.deepEqual([...types], ['item']);
  assert.deepEqual([...sources], ['core']);
});

test('buildItemSearchIndex builds one Map entry per item', () => {
  const index = SPU.buildItemSearchIndex(PREP_LOOT_ITEMS);
  assert.ok(index instanceof Map);
  assert.equal(index.size, PREP_LOOT_ITEMS.length);
});

test('the item search index is reused rather than rebuilt from the live record', () => {
  const items = [{ id: 'ci1', kind: 'item', src: 'core', roll: 1, en: { name: 'Premium Bedroll' }, ru: { name: '' } }];
  const index = SPU.buildItemSearchIndex(items);
  items[0].en.name = 'Totally Renamed Item';
  const result = SPU.filterItemsByToolbar(items, index, { search: 'bedroll' });
  assert.deepEqual(result.map(i => i.id), ['ci1']);
});

/* ---------------- extractItemNumberCriteria ---------------- */

test('extractItemNumberCriteria parses a bare exact number', () => {
  assert.deepEqual(SPU.extractItemNumberCriteria('30'), { exacts: [30], ranges: [], rest: ' ' });
});

test('extractItemNumberCriteria parses a "#"-prefixed exact number', () => {
  assert.deepEqual(SPU.extractItemNumberCriteria('#30').exacts, [30]);
});

test('extractItemNumberCriteria parses an inclusive range and normalizes a reversed one', () => {
  assert.deepEqual(SPU.extractItemNumberCriteria('1-10').ranges, [[1, 10]]);
  assert.deepEqual(SPU.extractItemNumberCriteria('10-1').ranges, [[1, 10]]);
});

test('extractItemNumberCriteria never throws on malformed input', () => {
  assert.doesNotThrow(() => SPU.extractItemNumberCriteria('1-'));
  assert.doesNotThrow(() => SPU.extractItemNumberCriteria('abc-def'));
  assert.doesNotThrow(() => SPU.extractItemNumberCriteria(''));
  assert.doesNotThrow(() => SPU.extractItemNumberCriteria(null));
});

/* ---------------- rollNd12 ---------------- */

test('rollNd12 sums diceCount independent 1-12 draws', () => {
  assert.equal(SPU.rollNd12(3, () => 0.8), 30);
  assert.equal(SPU.rollNd12(1, () => 0), 1);
  assert.equal(SPU.rollNd12(1, () => 0.999999), 12);
});

test('rollNd12 defaults to Math.random and stays within the valid range', () => {
  for (let i = 0; i < 20; i++) {
    const total = SPU.rollNd12(5);
    assert.ok(total >= 5 && total <= 60, `${total} out of range`);
  }
});
