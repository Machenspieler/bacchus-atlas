/* ============================================================
   Bacchus's Atlas — tests/potential-adversary-utils.test.js
   Dependency-free tests for the shared Potential Adversaries parser
   (js/potential-adversary-utils.js): ordinary and grouped entries, tier
   entries, aliases, adversary families, the explicit Bandits → Jagged Knife
   rule, and the conservative catalogue matching. Run with:

     node --test tests/potential-adversary-utils.test.js
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const PAU = require('../js/potential-adversary-utils.js');

const JAGGED_KNIFE = [
  'Jagged Knife Bandit', 'Jagged Knife Hexer', 'Jagged Knife Kneebreaker', 'Jagged Knife Lackey',
  'Jagged Knife Lieutenant', 'Jagged Knife Shadow', 'Jagged Knife Sniper',
];

/** Names an environment with exactly these English entries resolves to. */
function names(...entries) {
  return PAU.envAdversaryNames({ potential_adversaries: { en: entries } });
}

/* ---------------- parser ---------------- */

test('an ordinary single adversary resolves to itself', () => {
  assert.deepEqual(names('Sellsword'), ['Sellsword']);
});

test('an ordinary group lists its members as written', () => {
  assert.deepEqual(names('Beasts (Bear, Dire Wolf, Glass Snake)'), ['Bear', 'Dire Wolf', 'Glass Snake']);
});

test('a "Tier N: Name, Name" entry resolves its names', () => {
  assert.deepEqual(names('Tier 1: Human Student, Jagged Knife Lieutenant'), ['Human Student', 'Jagged Knife Lieutenant']);
});

test('a parenthetical tier/role annotation is metadata, not a member', () => {
  assert.deepEqual(PAU.parsePotentialAdversaryEntry('Barbara Yaga (Tier 4 Solo)'),
    { label: 'Barbara Yaga', members: ['Barbara Yaga'], isGroup: false, annotation: 'Tier 4 Solo' });
  assert.deepEqual(names('Barbara Yaga (Tier 4 Solo)'), ['Barbara Yaga']);
});

test('"or"-separated members share the trailing noun', () => {
  assert.deepEqual(PAU.splitAdversaryMembers('Green or Red Ooze'), ['Green Ooze', 'Red Ooze']);
  assert.deepEqual(PAU.splitAdversaryMembers('Gobstalker, Green Ooze'), ['Gobstalker', 'Green Ooze']);
});

test('group member aliases such as Guards resolve to the bestiary names', () => {
  assert.deepEqual(names('Guards (Head, Archer, Bladed)'), ['Head Guard', 'Archer Guard', 'Bladed Guard']);
  assert.deepEqual(names('Guard (Captain)'), ['Head Guard']);
  assert.deepEqual(names('Assassins (Apprentice, Master, Poisoner)'),
    ['Apprentice Assassin', 'Master Assassin', 'Assassin Poisoner']);
});

test('group prefixes are added once, never doubled', () => {
  assert.deepEqual(names('Cultists (Adept, Cult Fang)'), ['Cult Adept', 'Cult Fang']);
  assert.deepEqual(names('Minor Elementals (Fire, Chaos)'), ['Minor Fire Elemental', 'Minor Chaos Elemental']);
});

test('existing special aliases keep their exact behaviour', () => {
  assert.deepEqual(names('Fallen (Shock Troop, Sorcerer, Warlord)'),
    ['Fallen Shock Troop', 'Fallen Sorcerer', 'Fallen Warlord: Realm-Breaker']);
  assert.deepEqual(names("Sundry Ne'er-Do-Wells (Jagged Knife Bandit, Lackey)"),
    ['Jagged Knife Bandit', 'Jagged Knife Lackey']);
  assert.deepEqual(names('Vampires (all, including Lamia)'), ['Lamia']);
  assert.deepEqual(names('Vault Guardian Turret'), ['Vault Guardian Turret']);
  assert.deepEqual(names('any Cult member'), ['Cult Adept', 'Cult Fang', 'Cult Initiate']);
});

/* ---------------- families ---------------- */

test('bare Pirates is the whole Pirate family', () => {
  assert.deepEqual(names('Pirates'), ['Pirate Captain', 'Pirate Raiders', 'Pirate Tough']);
});

test('grouped Pirates take the group prefix', () => {
  assert.deepEqual(names('Pirates (Captain, Raiders, Tough)'), ['Pirate Captain', 'Pirate Raiders', 'Pirate Tough']);
});

test('the complete Jagged Knife group resolves to the full roster', () => {
  assert.deepEqual(
    names('Jagged Knife Bandits (Bandit, Hexer, Kneebreaker, Lackey, Lieutenant, Shadow, Sniper)'),
    JAGGED_KNIFE);
});

for (const form of [
  'Bandit', 'Bandits', 'Bandits (tier 2)', 'any Bandit', 'any Bandits',
  'Jagged Knife Bandits', 'Jagged Knives', 'any Jagged Knives', 'any Jagged Knife', 'any Jagged Knife Bandit',
]) {
  test(`generic Bandits reference "${form}" resolves to the complete Jagged Knife roster`, () => {
    assert.deepEqual(names(form), JAGGED_KNIFE);
  });
}

test('plural Bandits inside another group means the family; a singular member stays specific', () => {
  assert.deepEqual(names('Outlaws (Bandits, Pirates, Skeletons)'),
    [...JAGGED_KNIFE, 'Pirates', 'Skeletons']);
  assert.deepEqual(names('Desert Raiders (Jagged Knife Bandits)'), JAGGED_KNIFE);
  assert.deepEqual(names('Outlaws (Jagged Knives)'), JAGGED_KNIFE);
  // "Bandit" in a Jagged Knife group is the one Jagged Knife Bandit, not the family.
  assert.deepEqual(names('Jagged Knife Bandits (Bandit, Shadow)'), ['Jagged Knife Bandit', 'Jagged Knife Shadow']);
});

test('a full Jagged Knife name stays a single adversary', () => {
  assert.deepEqual(names('Jagged Knife Sniper'), ['Jagged Knife Sniper']);
  assert.deepEqual(names('Criminals (any Jagged Knife)'), JAGGED_KNIFE);
});

/* ---------------- entries that name nothing ---------------- */

test('"Any" and "All" resolve to no adversaries', () => {
  assert.deepEqual(names('Any'), []);
  assert.deepEqual(names('All'), []);
  assert.equal(PAU.looksLikeAdversaryName('Any'), false);
});

test('feature citations using see "…" resolve to no adversaries', () => {
  assert.deepEqual(names('ghostly versions of other adversaries (see "Ghostly Form")'), []);
  assert.deepEqual(names('Undead (see “Restless Dead”)'), []);
});

test('missing, empty or malformed potential_adversaries is safe', () => {
  assert.deepEqual(PAU.envAdversaryNames({}), []);
  assert.deepEqual(PAU.envAdversaryNames(null), []);
  assert.deepEqual(PAU.envAdversaryNames({ potential_adversaries: {} }), []);
  assert.deepEqual(PAU.envAdversaryNames({ potential_adversaries: { en: [] } }), []);
  assert.deepEqual(names('', '   '), []);
});

test('repeated mentions are deduplicated, keeping first-seen order', () => {
  assert.deepEqual(names('Bear, Dire Wolf', 'Bear', 'Beasts (Dire Wolf, Bear, Glass Snake)'),
    ['Bear, Dire Wolf', 'Bear', 'Dire Wolf', 'Glass Snake']);
});

/* ---------------- catalogue matching ---------------- */

const CATALOGUE = [
  { id: 'dire-wolf', name: { en: 'Dire Wolf', ru: 'Лютый волк' }, tier: 1 },
  { id: 'archer-guard', name: { en: 'Archer Guard', ru: 'Стражник-лучник' }, tier: 1 },
  { id: 'fallen-warlord-realm-breaker', name: { en: 'Fallen Warlord: Realm-Breaker' }, tier: 4 },
  { id: 'fallen-warlord', name: { en: 'Fallen Warlord' }, tier: 4 },
  { id: 'neer-do-well', name: { en: 'Ne’er-Do-Well' }, tier: 1 },
];
const INDEX = PAU.buildCatalogueNameIndex(CATALOGUE);

test('supported canonical names resolve to Prep ids', () => {
  assert.deepEqual(PAU.matchCatalogueIds(['Dire Wolf', 'Archer Guard'], INDEX).ids, ['dire-wolf', 'archer-guard']);
});

test('matching is case-insensitive, whitespace-tolerant and Unicode-normalized', () => {
  assert.deepEqual(PAU.matchCatalogueIds(['  dire   WOLF ', 'ＤＩＲＥ Ｗolf'], INDEX).ids, ['dire-wolf']);
  assert.equal(PAU.normalizeAdversaryName('Ne’er‐Do–Well'), "ne'er-do-well");
  assert.deepEqual(PAU.matchCatalogueIds(["Ne'er-Do-Well"], INDEX).ids, ['neer-do-well']);
  assert.deepEqual(PAU.matchCatalogueIds(['Fallen Warlord: Realm–Breaker'], INDEX).ids, ['fallen-warlord-realm-breaker']);
});

test('names with meaningful punctuation or subtitles stay distinguishable', () => {
  assert.deepEqual(PAU.matchCatalogueIds(['Fallen Warlord'], INDEX).ids, ['fallen-warlord']);
  assert.deepEqual(PAU.matchCatalogueIds(['Fallen Warlord: Realm-Breaker'], INDEX).ids, ['fallen-warlord-realm-breaker']);
  assert.deepEqual(PAU.matchCatalogueIds(['Fallen Warlord Realm Breaker'], INDEX).ids, []);
});

test('unsupported and custom names are ignored — reported as unmatched, never as ids', () => {
  const { ids, unmatched } = PAU.matchCatalogueIds(['Dire Wolf', 'Homebrew Horror'], INDEX);
  assert.deepEqual(ids, ['dire-wolf']);
  assert.deepEqual(unmatched, ['Homebrew Horror']);
});

test('no fuzzy matching: near misses, plurals, substrings and Russian names do not match', () => {
  assert.deepEqual(PAU.matchCatalogueIds(['Dire Wolves', 'Dire', 'Wolf', 'Dire Wolff', 'Лютый волк'], INDEX).ids, []);
});

test('the index is built from name.en only', () => {
  assert.equal(INDEX.has(PAU.normalizeAdversaryName('Лютый волк')), false);
});

test('a group of supported and unsupported names yields only the supported ids', () => {
  const env = { potential_adversaries: { en: ['Beasts (Dire Wolf, Homebrew Horror)', 'Guards (Archer, Head)'] } };
  assert.deepEqual(PAU.environmentSupportedAdversaryIds(env, INDEX), ['dire-wolf', 'archer-guard']);
});

test('an empty or missing catalogue matches nothing and never throws', () => {
  assert.deepEqual(PAU.matchCatalogueIds(['Dire Wolf'], PAU.buildCatalogueNameIndex([])).ids, []);
  assert.deepEqual(PAU.matchCatalogueIds(['Dire Wolf'], undefined).ids, []);
  assert.equal(PAU.buildCatalogueNameIndex(undefined).size, 0);
});

/* ---------------- against the real data ---------------- */

test('every real environment parses against the real Prep catalogue without throwing', () => {
  const environments = require('../data/environments.json').environments;
  const prep = require('../data/prep.json');
  const index = PAU.buildCatalogueNameIndex(prep.adversaries);
  const recommendations = PAU.buildEnvironmentRecommendationIndex(environments, index);
  assert.ok(recommendations.size > 0);
  const known = new Set(prep.adversaries.map(a => a.id));
  for (const ids of recommendations.values()) {
    assert.ok(ids.length > 0);
    assert.equal(new Set(ids).size, ids.length, 'ids are unique per environment');
    ids.forEach(id => assert.ok(known.has(id), `${id} is a Prep catalogue id`));
  }
});

test('real data: generic Bandits environments recommend the full Jagged Knife roster', () => {
  const environments = require('../data/environments.json').environments;
  const prep = require('../data/prep.json');
  const index = PAU.buildCatalogueNameIndex(prep.adversaries);
  const roster = JAGGED_KNIFE.map(n => index.get(PAU.normalizeAdversaryName(n)));
  assert.ok(roster.every(Boolean), 'the catalogue holds the whole Jagged Knife roster');
  const recommendations = PAU.buildEnvironmentRecommendationIndex(environments, index);
  // Bare "Bandits" / "Bandits (tier 2)" sit beside other adversaries in these
  // environments, so the whole roster must be among their recommendations.
  for (const id of ['ruined-castle', 'magic-city']) {
    assert.ok(environments.some(e => e.id === id), `${id} exists`);
    roster.forEach(advId => assert.ok(recommendations.get(id).includes(advId), `${id} recommends ${advId}`));
  }
  // Bare "Jagged Knife Bandits" (underroot-tunnels) used to resolve to nothing.
  roster.forEach(advId => assert.ok(recommendations.get('underroot-tunnels').includes(advId), advId));
  // "Jagged Knives" (hold-the-line) is the whole roster too.
  roster.forEach(advId => assert.ok(recommendations.get('hold-the-line').includes(advId), advId));
});
