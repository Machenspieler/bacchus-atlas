/* ============================================================
   Bacchus's Atlas — tests/data-validation.test.js
   Regression tests for scripts/validate-data.js. Run with:

     node --test tests/data-validation.test.js

   Each test builds a small fixture repository under a temp directory (real
   production data is never touched) and calls the exported
   validateRepositoryData() directly — no shelling out, no duplicated
   validation logic.
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  validateRepositoryData,
  normalizeItemKey,
  scanLiteralI18nKeys,
  EXTRA_REQUIRED_I18N_KEYS,
} = require('../scripts/validate-data.js');

/* ---------------- fixture builders ---------------- */

const TERRAIN_BIOMES = ['underground', 'aquatic', 'wetland', 'grassland', 'tropical', 'forest', 'drylands', 'rolling', 'mountain', 'frozen', 'badlands'];

function bi(en, ru) { return { en, ru }; }

function defaultEnvironment(overrides = {}) {
  const base = {
    id: 'test-env',
    tier: 1,
    type: 'traversal',
    name: bi('Test Env', 'Тест'),
    impulses: { en: ['Do a thing'], ru: ['Сделать что-то'] },
    potential_adversaries: { en: ['Sellsword'], ru: ['Наёмник'] },
    features: [],
  };
  return Object.assign(base, overrides);
}

/** Fully covering Journey tables, generated rather than hand-written so the
 * fixture stays valid even though the real tables run to 100 rows. */
function defaultJourney() {
  const habitat = [{ min: 1, max: 1, shadowblight: true }];
  for (let roll = 2, i = 0; roll <= 20; roll++, i++) {
    habitat.push({ min: roll, max: roll, biome: TERRAIN_BIOMES[i % TERRAIN_BIOMES.length], examples: bi('Examples', 'Примеры') });
  }
  const encounter = [];
  for (let r = 2; r <= 14; r++) {
    encounter.push(r === 2 ? { roll: r, combine: true } : { roll: r, text: bi(`Encounter ${r}`, `Встреча ${r}`) });
  }
  const terrain = [];
  for (let r = 1; r <= 4; r++) terrain.push({ roll: r, days: r, name: bi(`Terrain ${r}`, `Местность ${r}`), text: bi(`Text ${r}`, `Текст ${r}`) });
  const rumors = [];
  for (let r = 1; r <= 100; r++) rumors.push({ roll: r, text: bi(`Rumor ${r}`, `Слух ${r}`) });
  const sanctuaryDefs = [['trade', 20], ['quirk', 12], ['crisis', 10], ['drive', 10], ['politics', 8], ['size', 6], ['population', 4]];
  const sanctuary = sanctuaryDefs.map(([key, die]) => ({
    key,
    die,
    rows: Array.from({ length: die }, (_, i) => {
      const roll = i + 1;
      if (key === 'politics' && roll === die) return { roll, combine: true };
      return { roll, text: bi(`${key} ${roll}`, `${key} ${roll}`) };
    }),
  }));
  const nameElements = Array.from({ length: 100 }, (_, i) => ({ roll: i + 1, parts: ['Ash', 'Thorn'] }));
  return { source: 'Test Source', habitat, encounter, terrain, rumors, sanctuary, nameElements };
}

/** Every i18n key required unconditionally regardless of what data the
 * fixture uses (see EXTRA_REQUIRED_I18N_KEYS), plus the enum keys the
 * default fixture's own data needs (type_traversal). Individual tests add
 * more keys — or delete one — through the `i18n` override. */
function defaultI18nKeys() {
  // The default Journey fixture's habitat table cycles through all eleven
  // terrain biomes (see defaultJourney), so every fixture needs their
  // biome_<id> keys regardless of what the test itself is exercising.
  const keys = new Set([...EXTRA_REQUIRED_I18N_KEYS, 'type_traversal', ...TERRAIN_BIOMES.map(b => `biome_${b}`)]);
  const en = {}, ru = {};
  keys.forEach(k => { en[k] = `EN ${k}`; ru[k] = `RU ${k}`; });
  return { en, ru };
}

function writeJSON(dir, rel, value) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(value, null, 2));
}

/** Builds a minimal, fully valid fixture repository and returns its root
 * path. `overrides.<file>` may be a full replacement value, or a function
 * that mutates the default value in place before it's written. */
function buildFixture(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-validate-'));

  const defaults = {
    environments: { environments: [defaultEnvironment()] },
    regions: { regions: [] },
    adversaries: { adversaries: [] },
    items: { item_url: 'https://example.test/i/{id}.html', image_url: 'https://example.test/img/{img}', aliases: {}, items: {} },
    sessionPrep: { item_page_url: 'https://example.test/i/{id}.html', item_image_url: 'https://example.test/img/{image}', adversaries: [], items: [] },
    journey: defaultJourney(),
    i18n: defaultI18nKeys(),
  };

  for (const [key, rel] of Object.entries({
    environments: 'data/environments.json',
    regions: 'data/regions.json',
    adversaries: 'data/adversaries.json',
    items: 'data/items.json',
    sessionPrep: 'data/session-prep.json',
    journey: 'data/journey.json',
    i18n: 'data/i18n.json',
  })) {
    let value = defaults[key];
    const override = overrides[key];
    if (typeof override === 'function') override(value);
    else if (override !== undefined) value = override;
    writeJSON(dir, rel, value);
  }

  return dir;
}

function errorsOf(result) { return result.diagnostics.filter(d => d.severity === 'error'); }
function warningsOf(result) { return result.diagnostics.filter(d => d.severity === 'warning'); }
function messages(diags) { return diags.map(d => d.message).join('\n'); }

/* ---------------- 1: minimal valid fixture passes ---------------- */

test('a minimal valid repository fixture passes with zero errors', () => {
  const dir = buildFixture();
  const result = validateRepositoryData(dir);
  assert.equal(errorsOf(result).length, 0, messages(errorsOf(result)));
});

/* ---------------- 2: missing required data file ---------------- */

test('a missing required data file fails', () => {
  const dir = buildFixture();
  fs.rmSync(path.join(dir, 'data/environments.json'));
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => d.file === 'data/environments.json' && /could not read/i.test(d.message)));
});

/* ---------------- 3: malformed JSON ---------------- */

test('malformed JSON fails with a useful diagnostic', () => {
  const dir = buildFixture();
  fs.writeFileSync(path.join(dir, 'data/environments.json'), '{ "environments": [ ');
  const result = validateRepositoryData(dir);
  const diag = errorsOf(result).find(d => d.file === 'data/environments.json');
  assert.ok(diag, 'expected a diagnostic for the broken file');
  assert.match(diag.message, /invalid json/i);
});

/* ---------------- 4: wrong top-level shape ---------------- */

test('wrong top-level shape fails', () => {
  const dir = buildFixture({ environments: { environments: 'not-an-array' } });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => d.path === '$.environments'));
});

/* ---------------- 5: duplicate environment id ---------------- */

test('duplicate environment id fails', () => {
  const dir = buildFixture({
    environments: v => v.environments.push(defaultEnvironment({ id: 'test-env' })),
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /Duplicate environment id/.test(d.message)));
});

/* ---------------- 6: invalid environment tier ---------------- */

test('invalid environment tier fails', () => {
  const dir = buildFixture({ environments: v => { v.environments[0].tier = 5; } });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => d.path === '$.environments[0].tier'));
});

/* ---------------- 7: invalid environment type ---------------- */

test('invalid environment type fails', () => {
  const dir = buildFixture({ environments: v => { v.environments[0].type = 'travel'; } });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => d.path === '$.environments[0].type' && /unsupported type/.test(d.message)));
});

/* ---------------- 8: invalid feature type ---------------- */

test('invalid feature type fails', () => {
  const dir = buildFixture({
    environments: v => { v.environments[0].features = [{ type: 'trigger', name: bi('N', 'Н'), description: bi('D', 'Д') }]; },
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => d.path === '$.environments[0].features[0].type'));
});

/* ---------------- 9: unknown biome ---------------- */

test('unknown biome fails', () => {
  const dir = buildFixture({ environments: v => { v.environments[0].biomes = ['space-station']; } });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /unknown biome/.test(d.message)));
});

/* ---------------- 10: duplicate biome in one environment ---------------- */

test('duplicate biome in one environment fails', () => {
  const dir = buildFixture({ environments: v => { v.environments[0].biomes = ['drylands', 'drylands']; } });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /more than once/.test(d.message) && d.path.includes('biomes')));
});

/* ---------------- 11: potential-adversary length mismatch ---------------- */

test('a non-empty RU/EN potential-adversary length mismatch fails', () => {
  const dir = buildFixture({
    environments: v => { v.environments[0].potential_adversaries = { en: ['A', 'B'], ru: ['А'] }; },
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => d.path === '$.environments[0].potential_adversaries'));
});

/* ---------------- 12: unknown featured adversary reference ---------------- */

test('unknown featured adversary reference fails', () => {
  const dir = buildFixture({
    environments: v => { v.environments[0].featured_adversaries = [{ id: 'nobody', display: 'inline' }]; },
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /unknown featured adversary/.test(d.message)));
});

/* ---------------- 13: duplicate region id ---------------- */

test('duplicate region id fails', () => {
  const dir = buildFixture({
    environments: v => v.environments.push(defaultEnvironment({ id: 'env-2' })),
    regions: {
      regions: [
        { id: 'r1', name: bi('R1', 'Р1'), environments: ['test-env', 'env-2'] },
        { id: 'r1', name: bi('R1b', 'Р1б'), environments: ['test-env', 'env-2'] },
      ],
    },
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /Duplicate region id/.test(d.message)));
});

/* ---------------- 14: unknown environment in a region ---------------- */

test('unknown environment in a region fails', () => {
  const dir = buildFixture({
    environments: v => v.environments.push(defaultEnvironment({ id: 'env-2' })),
    regions: { regions: [{ id: 'r1', name: bi('R1', 'Р1'), environments: ['test-env', 'ghost-env'] }] },
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /references unknown environment/.test(d.message)));
});

/* ---------------- 15: same environment in two regions ---------------- */

test('the same environment in two regions fails', () => {
  const dir = buildFixture({
    environments: v => v.environments.push(...['env-2', 'env-3'].map(id => defaultEnvironment({ id }))),
    regions: {
      regions: [
        { id: 'r1', name: bi('R1', 'Р1'), environments: ['test-env', 'env-2'] },
        { id: 'r2', name: bi('R2', 'Р2'), environments: ['test-env', 'env-3'] },
      ],
    },
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /belongs to more than one region/.test(d.message)));
});

/* ---------------- 16: duplicate adversary id ---------------- */

function defaultAdversary(overrides = {}) {
  return Object.assign({
    id: 'test-adv',
    name: bi('Test Adversary', 'Тестовый противник'),
    tier: 1,
    role: 'standard',
    difficulty: 11,
    hp: 5,
    stress: 3,
    attack_modifier: 1,
  }, overrides);
}

test('duplicate adversary id fails', () => {
  const dir = buildFixture({
    adversaries: { adversaries: [defaultAdversary(), defaultAdversary()] },
    i18n: v => { v.en.role_standard = 'Standard'; v.ru.role_standard = 'Стандарт'; },
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /Duplicate adversary id/.test(d.message)));
});

/* ---------------- 17: invalid adversary role ---------------- */

test('invalid adversary role fails', () => {
  const dir = buildFixture({ adversaries: { adversaries: [defaultAdversary({ role: 'boss' })] } });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /unsupported role/.test(d.message)));
});

/* ---------------- 18: invalid attack range ---------------- */

test('invalid attack range fails', () => {
  const dir = buildFixture({
    adversaries: {
      adversaries: [defaultAdversary({
        attacks: [{ name: bi('Hit', 'Удар'), range: 'medium', damage: '1d6', damage_type: 'physical' }],
      })],
    },
    i18n: v => {
      v.en.role_standard = 'Standard'; v.ru.role_standard = 'Стандарт';
      v.en.damage_physical = 'Physical'; v.ru.damage_physical = 'Физический';
    },
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /Unsupported range/.test(d.message)));
});

/* ---------------- 19: threshold major > severe ---------------- */

test('threshold major greater than severe fails', () => {
  const dir = buildFixture({
    adversaries: { adversaries: [defaultAdversary({ thresholds: { major: 20, severe: 10 } })] },
    i18n: v => { v.en.role_standard = 'Standard'; v.ru.role_standard = 'Стандарт'; },
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /must not be greater than severe/.test(d.message)));
});

/* ---------------- 20: item alias pointing to a missing item ---------------- */

function itemsFixtureBase() {
  return {
    item_url: 'https://example.test/i/{id}.html',
    image_url: 'https://example.test/img/{img}',
    aliases: {},
    items: {
      w1: { kind: 'item', src: 'core', roll: 1, img: 'w1.webp', en: { name: 'Widget', description: 'A widget.' } },
    },
  };
}

test('item alias pointing to a missing item fails', () => {
  const items = itemsFixtureBase();
  items.aliases.Ghost = 'no-such-item';
  const dir = buildFixture({
    items,
    i18n: v => { v.en.item_kind_item = 'Item'; v.ru.item_kind_item = 'Предмет'; v.en.item_src_core = 'Core'; v.ru.item_src_core = 'Базовая'; },
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /points to missing item/.test(d.message)));
});

/* ---------------- 21: item craft reference pointing to a missing item ---------------- */

test('item craft reference pointing to a missing item fails', () => {
  const items = itemsFixtureBase();
  items.items.w1.craft = 'no-such-item';
  const dir = buildFixture({
    items,
    i18n: v => { v.en.item_kind_item = 'Item'; v.ru.item_kind_item = 'Предмет'; v.en.item_src_core = 'Core'; v.ru.item_src_core = 'Базовая'; },
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /crafts into missing item/.test(d.message)));
});

/* ---------------- 22: item crafting self-reference ---------------- */

test('item crafting self-reference fails', () => {
  const items = itemsFixtureBase();
  items.items.w1.craft = 'w1';
  const dir = buildFixture({
    items,
    i18n: v => { v.en.item_kind_item = 'Item'; v.ru.item_kind_item = 'Предмет'; v.en.item_src_core = 'Core'; v.ru.item_src_core = 'Базовая'; },
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /cannot craft into itself/.test(d.message)));
});

/* ---------------- 23: multi-item crafting cycle ---------------- */

test('a multi-item crafting cycle fails', () => {
  const items = itemsFixtureBase();
  items.items.w2 = { kind: 'item', src: 'core', roll: 2, img: 'w2.webp', en: { name: 'Gadget', description: 'A gadget.' } };
  items.items.w3 = { kind: 'item', src: 'core', roll: 3, img: 'w3.webp', en: { name: 'Gizmo', description: 'A gizmo.' } };
  items.items.w1.craft = 'w2';
  items.items.w2.craft = 'w3';
  items.items.w3.craft = 'w1';
  const dir = buildFixture({
    items,
    i18n: v => { v.en.item_kind_item = 'Item'; v.ru.item_kind_item = 'Предмет'; v.en.item_src_core = 'Core'; v.ru.item_src_core = 'Базовая'; },
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /crafting cycle detected/.test(d.message)));
});

/* ---------------- 24: normalized item lookup collision ---------------- */

test('a normalized item lookup collision between different ids fails', () => {
  const items = itemsFixtureBase();
  items.items.w2 = { kind: 'item', src: 'core', roll: 2, img: 'w2.webp', en: { name: 'Widget!', description: 'Also a widget.' } };
  const dir = buildFixture({
    items,
    i18n: v => { v.en.item_kind_item = 'Item'; v.ru.item_kind_item = 'Предмет'; v.en.item_src_core = 'Core'; v.ru.item_src_core = 'Базовая'; },
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /resolves to more than one item/.test(d.message)));
});

/* ---------------- 24b: data/session-prep.json ---------------- */

function sessionPrepFixtureBase() {
  return {
    item_page_url: 'https://example.test/i/{id}.html',
    item_image_url: 'https://example.test/img/{image}',
    adversaries: [
      { id: 'test-adversary', name: bi('Test Adversary', 'Тестовый противник') },
    ],
    items: [
      { id: 'ci1', roll: 1, kind: 'item', source: 'core', name: bi('Bedroll', 'Спальный мешок'), image: 'ci1.webp' },
    ],
  };
}

function sessionPrepI18n(v) {
  v.en.item_kind_item = 'Item'; v.ru.item_kind_item = 'Предмет';
  v.en.item_src_core = 'Core'; v.ru.item_src_core = 'Базовая';
}

test('a valid session-prep fixture passes with zero errors', () => {
  const dir = buildFixture({ sessionPrep: sessionPrepFixtureBase(), i18n: sessionPrepI18n });
  const result = validateRepositoryData(dir);
  assert.equal(errorsOf(result).length, 0, messages(errorsOf(result)));
});

test('duplicate session-prep adversary id fails', () => {
  const sp = sessionPrepFixtureBase();
  sp.adversaries.push({ id: 'test-adversary', name: bi('Again', 'Опять') });
  const dir = buildFixture({ sessionPrep: sp, i18n: sessionPrepI18n });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => d.file === 'data/session-prep.json' && /Duplicate adversary id/.test(d.message)));
});

test('duplicate session-prep item id fails', () => {
  const sp = sessionPrepFixtureBase();
  sp.items.push({ id: 'ci1', roll: 2, kind: 'item', source: 'core', name: bi('Bedroll 2', 'Спальный мешок 2'), image: 'ci1-alt.webp' });
  const dir = buildFixture({ sessionPrep: sp, i18n: sessionPrepI18n });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => d.file === 'data/session-prep.json' && /Duplicate item id/.test(d.message)));
});

test('a malformed session-prep bilingual name fails', () => {
  const sp = sessionPrepFixtureBase();
  sp.adversaries[0].name = 'Not bilingual';
  const dir = buildFixture({ sessionPrep: sp, i18n: sessionPrepI18n });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => d.path === '$.adversaries[0].name'));
});

test('an invalid session-prep item roll fails', () => {
  const sp = sessionPrepFixtureBase();
  sp.items[0].roll = 0;
  const dir = buildFixture({ sessionPrep: sp, i18n: sessionPrepI18n });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /invalid roll/.test(d.message)));
});

test('a missing session-prep item kind fails', () => {
  const sp = sessionPrepFixtureBase();
  delete sp.items[0].kind;
  const dir = buildFixture({ sessionPrep: sp, i18n: sessionPrepI18n });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => d.path === '$.items[0].kind'));
});

test('a missing session-prep item source fails', () => {
  const sp = sessionPrepFixtureBase();
  delete sp.items[0].source;
  const dir = buildFixture({ sessionPrep: sp, i18n: sessionPrepI18n });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => d.path === '$.items[0].source'));
});

test('a session-prep item image filename that disagrees with its id fails', () => {
  const sp = sessionPrepFixtureBase();
  sp.items[0].image = 'not-the-id.webp';
  const dir = buildFixture({ sessionPrep: sp, i18n: sessionPrepI18n });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /must start with its own id/.test(d.message)));
});

test('a missing referenced local session-prep adversary image fails', () => {
  const sp = sessionPrepFixtureBase();
  sp.adversaries[0].image = 'img/adversaries/art/session-prep/does-not-exist.png';
  const dir = buildFixture({ sessionPrep: sp, i18n: sessionPrepI18n });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => d.path === '$.adversaries[0].image' && /does not point to an existing file/.test(d.message)));
});

test('an existing local session-prep adversary image passes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-validate-'));
  fs.mkdirSync(path.join(dir, 'img/adversaries/art/session-prep'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'img/adversaries/art/session-prep/test.png'), 'fake-png-bytes');
  const sp = sessionPrepFixtureBase();
  sp.adversaries[0].image = 'img/adversaries/art/session-prep/test.png';
  const defaults = {
    environments: { environments: [defaultEnvironment()] },
    regions: { regions: [] },
    adversaries: { adversaries: [] },
    items: { item_url: 'https://example.test/i/{id}.html', image_url: 'https://example.test/img/{img}', aliases: {}, items: {} },
    sessionPrep: sp,
    journey: defaultJourney(),
    i18n: (() => { const v = defaultI18nKeys(); sessionPrepI18n(v); return v; })(),
  };
  for (const [key, rel] of Object.entries({
    environments: 'data/environments.json',
    regions: 'data/regions.json',
    adversaries: 'data/adversaries.json',
    items: 'data/items.json',
    sessionPrep: 'data/session-prep.json',
    journey: 'data/journey.json',
    i18n: 'data/i18n.json',
  })) {
    writeJSON(dir, rel, defaults[key]);
  }
  const result = validateRepositoryData(dir);
  assert.equal(errorsOf(result).length, 0, messages(errorsOf(result)));
});

test('a duplicate normalized session-prep adversary name is a warning, not an error', () => {
  const sp = sessionPrepFixtureBase();
  sp.adversaries.push({ id: 'test-adversary-2', name: bi('Test  Adversary', 'Другое') });
  const dir = buildFixture({ sessionPrep: sp, i18n: sessionPrepI18n });
  const result = validateRepositoryData(dir);
  assert.equal(errorsOf(result).length, 0, messages(errorsOf(result)));
  assert.ok(warningsOf(result).some(d => d.file === 'data/session-prep.json' && /also used by adversary/.test(d.message)));
});

/* ---------------- 25: Journey habitat overlap ---------------- */

test('a Journey habitat overlap fails', () => {
  const dir = buildFixture({
    journey: v => { v.habitat[1].max = v.habitat[2].min; }, // rows 2 and 3 now both claim one roll
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /overlaps roll/.test(d.message)));
});

/* ---------------- 26: Journey habitat gap ---------------- */

test('a Journey habitat gap fails', () => {
  const dir = buildFixture({
    journey: v => { v.habitat.splice(5, 1); },
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /missing coverage/.test(d.message)));
});

/* ---------------- 27: duplicate Journey encounter roll ---------------- */

test('a duplicate Journey encounter roll fails', () => {
  const dir = buildFixture({
    journey: v => { v.encounter[2].roll = v.encounter[1].roll; },
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /duplicate roll/.test(d.message)));
});

/* ---------------- 28: missing Journey rumor roll ---------------- */

test('a missing Journey rumor roll fails', () => {
  const dir = buildFixture({
    journey: v => { v.rumors = v.rumors.filter(r => r.roll !== 50); },
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /rumors table is missing roll 50/.test(d.message)));
});

/* ---------------- 29: sanctuary table missing one die result ---------------- */

test('a sanctuary table missing one die result fails', () => {
  const dir = buildFixture({
    journey: v => { const trade = v.sanctuary.find(s => s.key === 'trade'); trade.rows = trade.rows.filter(r => r.roll !== 5); },
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /is missing roll 5/.test(d.message)));
});

/* ---------------- 30: duplicate name-element roll ---------------- */

test('a duplicate name-element roll fails', () => {
  const dir = buildFixture({
    journey: v => { v.nameElements[1].roll = v.nameElements[0].roll; },
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => d.path.startsWith('$.nameElements') && /duplicate roll/.test(d.message)));
});

/* ---------------- 31: missing i18n key in one language ---------------- */

test('a missing i18n key in one language fails', () => {
  const dir = buildFixture({ i18n: v => { delete v.ru.type_traversal; } });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => d.file === 'data/i18n.json' && d.path === '$.ru.type_traversal'));
});

/* ---------------- 32: placeholder mismatch ---------------- */

test('a placeholder mismatch fails', () => {
  const dir = buildFixture({
    i18n: v => { v.en.count_showing = 'Showing {n} of {total}'; v.ru.count_showing = 'Показано {n}'; },
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => /Placeholders differ/.test(d.message) && d.path === '$.ru.count_showing'));
});

/* ---------------- 33: missing dynamic enum translation key ---------------- */

test('a missing dynamic enum translation key fails', () => {
  const dir = buildFixture({
    environments: v => { v.environments[0].biomes = ['drylands']; },
    // The default fixture's i18n already carries every biome_<id> key (its
    // Journey habitat table uses all eleven) — delete this one so the
    // environment's own use of "drylands" is what's actually under test.
    i18n: v => { delete v.en.biome_drylands; delete v.ru.biome_drylands; },
  });
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => d.path === '$.en.biome_drylands' || d.path === '$.ru.biome_drylands'));
});

/* ---------------- 34: missing required biome asset ---------------- */

test('a missing required biome asset fails', () => {
  const dir = buildFixture({
    environments: v => { v.environments[0].biomes = ['drylands']; },
    i18n: v => { v.en.biome_drylands = 'Drylands'; v.ru.biome_drylands = 'Пустоши'; },
  });
  // No img/biomes directory exists in this fixture at all.
  const result = validateRepositoryData(dir);
  assert.ok(errorsOf(result).some(d => d.file.startsWith('img/biomes/drylands-') && /Missing biome art/.test(d.message)));
});

/* ---------------- 35: optional fields may be absent ---------------- */

test('optional fields may be absent without error', () => {
  const dir = buildFixture(); // lore, biomes, source, featured_adversaries, story_seeds, rawText all omitted
  const result = validateRepositoryData(dir);
  assert.equal(errorsOf(result).length, 0, messages(errorsOf(result)));
});

/* ---------------- 36: unknown additional fields are accepted ---------------- */

test('unknown additional fields on known objects are accepted', () => {
  const dir = buildFixture({
    environments: v => {
      v.environments[0].future_field = { anything: 'goes' };
      v.environments[0]._note = 'internal note';
    },
  });
  const result = validateRepositoryData(dir);
  assert.equal(errorsOf(result).length, 0, messages(errorsOf(result)));
});

/* ---------------- 37: multiline Markdown-style descriptions remain valid ---------------- */

test('multiline Markdown-style descriptions remain valid', () => {
  const markdown = 'Intro line.\n- **Critical Success:** Tick down 3\n- **Success with Hope:** Tick down 2\n\nA second paragraph with *emphasis* and a 1d4 roll.';
  const dir = buildFixture({
    environments: v => {
      v.environments[0].features = [{
        type: 'passive',
        name: bi('Countdown', 'Отсчёт'),
        description: bi(markdown, markdown),
      }];
    },
    i18n: v => { v.en.feature_passive = 'Passive'; v.ru.feature_passive = 'Пассивное'; },
  });
  const result = validateRepositoryData(dir);
  assert.equal(errorsOf(result).length, 0, messages(errorsOf(result)));
});

/* ---------------- 38: current production repository data passes ---------------- */

test('the current production repository data passes with zero errors', () => {
  const rootPath = path.join(__dirname, '..');
  const result = validateRepositoryData(rootPath);
  assert.equal(result.errorCount, 0, formatForFailure(result));
});

function formatForFailure(result) {
  return errorsOf(result).map(d => `${d.file} ${d.path}: ${d.message}`).join('\n');
}

/* ---------------- additional coverage: warnings don't block ---------------- */

test('a duplicate normalized environment display name is a warning, not an error', () => {
  const dir = buildFixture({
    environments: v => {
      v.environments.push(defaultEnvironment({ id: 'test-env-2', name: bi('Test Env', 'Тест 2') }));
    },
  });
  const result = validateRepositoryData(dir);
  assert.equal(errorsOf(result).length, 0, messages(errorsOf(result)));
  assert.ok(warningsOf(result).some(d => /also used by environment/.test(d.message)));
});

test('diagnostics are sorted deterministically by file, path, then message', () => {
  const dir = buildFixture({
    environments: v => {
      v.environments[0].tier = 9;
      v.environments[0].type = 'nope';
    },
  });
  const a = validateRepositoryData(dir).diagnostics;
  const b = validateRepositoryData(dir).diagnostics;
  assert.deepEqual(a, b);
  for (let i = 1; i < a.length; i++) {
    const prevKey = `${a[i - 1].file}\u0000${a[i - 1].path}\u0000${a[i - 1].message}`;
    const key = `${a[i].file}\u0000${a[i].path}\u0000${a[i].message}`;
    assert.ok(prevKey <= key, 'diagnostics must be sorted by file, path, message');
  }
});

/* ---------------- normalizeItemKey parity with js/app.js ---------------- */

/** Pulls the live `normalizeItemKey` function body out of js/app.js by name
 * (balanced-brace scan) rather than requiring the whole file — app.js is a
 * browser script with top-level DOM calls that would throw under Node. This
 * is the "parity test" called for in CLAUDE.md: if the two implementations
 * drift, this test — not just code review — catches it. */
function extractFunctionSource(filePath, functionName) {
  const src = fs.readFileSync(filePath, 'utf8');
  const marker = `function ${functionName}(`;
  const start = src.indexOf(marker);
  assert.ok(start !== -1, `could not find function ${functionName} in ${filePath}`);
  const bodyStart = src.indexOf('{', start);
  let depth = 1, i = bodyStart + 1;
  while (depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  return src.slice(start, i);
}

test('normalizeItemKey matches the live implementation in js/app.js', () => {
  const appJsPath = path.join(__dirname, '..', 'js', 'app.js');
  const source = extractFunctionSource(appJsPath, 'normalizeItemKey');
  const liveNormalizeItemKey = new Function(`'use strict'; ${source}; return normalizeItemKey;`)();

  const samples = [
    'Nursewood', 'Nursewood Sap', "Liar's Bane", 'Ё-mail', 'Ёлка', 'ёлка',
    '  Spaced  Out  ', 'Punctuation!!! Here?', 'Дефис-слово', '', 'w62', 'МИКС-123',
  ];
  for (const s of samples) {
    assert.equal(normalizeItemKey(s), liveNormalizeItemKey(s), `mismatch for ${JSON.stringify(s)}`);
  }
});

/* ---------------- literal i18n key scan sanity ---------------- */

test('literal i18n key scan ignores dynamic prefix concatenation', () => {
  const keys = scanLiteralI18nKeys("t('type_' + env.type); t('plain_key'); t(cond ? 'branch_a' : 'branch_b'); t(kind === 'region' ? 'x' : 'y');");
  assert.ok(keys.includes('plain_key'));
  assert.ok(keys.includes('branch_a') && keys.includes('branch_b'));
  assert.ok(keys.includes('x') && keys.includes('y'));
  assert.ok(!keys.includes('type_'));
  assert.ok(!keys.includes('region'));
});
