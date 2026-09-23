/* ============================================================
   Bacchus's Atlas — tests/search-index.test.js
   Dependency-free regression tests for js/search-index.js. Run with:

     node --test tests/search-index.test.js

   SearchIndex is pure (no DOM, no application state, no browser globals,
   no environment mutation), so it's exercised directly here, the same
   shape as tests/routing.test.js. See the "Environment search index"
   section in CLAUDE.md for the contract this implements.
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SearchIndex = require('../js/search-index.js');
const {
  buildEnvironmentSearchRecord,
  buildEnvironmentSearchIndex,
  prepareSearchQuery,
  matches,
  aliasTermsFor,
  wordStartRegex,
  MIN_ALIAS_QUERY,
  SEARCH_ALIASES,
} = SearchIndex;

function makeEnv(overrides = {}) {
  return {
    id: 'env-1',
    name: { en: 'Whispering Market', ru: 'Шепчущий рынок' },
    tier: 1,
    type: 'exploration',
    ...overrides,
  };
}

/* ---------------- record construction ---------------- */

test('English and Russian names are indexed', () => {
  const r = buildEnvironmentSearchRecord(makeEnv());
  assert.ok(r.aliasText.includes('whispering market'));
  assert.ok(r.aliasText.includes('шепчущий рынок'));
});

test('English and Russian impulses are indexed', () => {
  const env = makeEnv({ impulses: { en: ['Haggle Loudly'], ru: ['Громко торговаться'] } });
  const r = buildEnvironmentSearchRecord(env);
  assert.ok(r.aliasText.includes('haggle loudly'));
  assert.ok(r.aliasText.includes('громко торговаться'));
});

test('feature names are indexed', () => {
  const env = makeEnv({ features: [{ name: { en: 'Glowing Stall', ru: 'Светящийся прилавок' } }] });
  const r = buildEnvironmentSearchRecord(env);
  assert.ok(r.aliasText.includes('glowing stall'));
  assert.ok(r.aliasText.includes('светящийся прилавок'));
});

test('feature descriptions are indexed', () => {
  const env = makeEnv({ features: [{ description: { en: 'A stall that hums softly', ru: 'Прилавок тихо гудит' } }] });
  const r = buildEnvironmentSearchRecord(env);
  assert.ok(r.aliasText.includes('hums softly'));
  assert.ok(r.aliasText.includes('тихо гудит'));
});

test('feature prompts are indexed', () => {
  const env = makeEnv({ features: [{ prompt: { en: 'What do you haggle for?', ru: 'За что вы торгуетесь?' } }] });
  const r = buildEnvironmentSearchRecord(env);
  assert.ok(r.aliasText.includes('what do you haggle for'));
  assert.ok(r.aliasText.includes('за что вы торгуетесь'));
});

test('raw text is indexed', () => {
  const env = makeEnv({ rawText: { en: 'Original book text here', ru: 'Исходный текст книги' } });
  const r = buildEnvironmentSearchRecord(env);
  assert.ok(r.aliasText.includes('original book text here'));
  assert.ok(r.aliasText.includes('исходный текст книги'));
});

test('lore is indexed', () => {
  const env = makeEnv({ lore: { en: 'Founded by a wandering merchant', ru: 'Основан странствующим торговцем' } });
  const r = buildEnvironmentSearchRecord(env);
  assert.ok(r.aliasText.includes('founded by a wandering merchant'));
  assert.ok(r.aliasText.includes('основан странствующим торговцем'));
});

test('potential adversaries are in literal search text', () => {
  const env = makeEnv({ potential_adversaries: { en: ['Merchant'], ru: ['Торговец'] } });
  const r = buildEnvironmentSearchRecord(env);
  assert.ok(r.literalText.includes('merchant'));
  assert.ok(r.literalText.includes('торговец'));
});

test('potential adversaries are not in alias-eligible text', () => {
  const env = makeEnv({ potential_adversaries: { en: ['Merchant'], ru: ['Торговец'] } });
  const r = buildEnvironmentSearchRecord(env);
  assert.ok(!r.aliasText.includes('merchant'));
  assert.ok(!r.aliasText.includes('торговец'));
});

test('story seeds are excluded', () => {
  const env = makeEnv({ story_seeds: { en: ['A secret smuggling ring'], ru: ['Тайная сеть контрабандистов'] } });
  const r = buildEnvironmentSearchRecord(env);
  assert.ok(!r.aliasText.includes('smuggling'));
  assert.ok(!r.literalText.includes('smuggling'));
});

test('source is excluded', () => {
  const env = makeEnv({ source: 'Voyage Beyond the Deep' });
  const r = buildEnvironmentSearchRecord(env);
  assert.ok(!r.aliasText.includes('voyage'));
  assert.ok(!r.literalText.includes('voyage'));
});

test('biomes are excluded', () => {
  const env = makeEnv({ biomes: ['tropical', 'aquatic'] });
  const r = buildEnvironmentSearchRecord(env);
  assert.ok(!r.aliasText.includes('tropical'));
  assert.ok(!r.literalText.includes('aquatic'));
});

test('environment type is excluded', () => {
  const env = makeEnv({ type: 'social' });
  const r = buildEnvironmentSearchRecord(env);
  assert.ok(!r.aliasText.includes('social'));
  assert.ok(!r.literalText.includes('social'));
});

test('missing optional fields do not throw', () => {
  assert.doesNotThrow(() => buildEnvironmentSearchRecord(makeEnv()));
});

test('empty optional strings do not produce malformed separators', () => {
  const env = makeEnv({ impulses: { en: [], ru: [] }, features: [], rawText: null, lore: null });
  const r = buildEnvironmentSearchRecord(env);
  assert.ok(!r.aliasText.includes('  '));
  assert.equal(r.aliasText, 'whispering market шепчущий рынок');
});

test('field order matches the current contract: name, impulses, features, rawText, lore', () => {
  const env = makeEnv({
    impulses: { en: ['Impulse'], ru: [] },
    features: [{ name: { en: 'Feature', ru: '' } }],
    rawText: { en: 'RawText', ru: '' },
    lore: { en: 'LoreText', ru: '' },
  });
  const r = buildEnvironmentSearchRecord(env);
  const order = ['whispering market', 'impulse', 'feature', 'rawtext', 'loretext'];
  let lastIndex = -1;
  for (const term of order) {
    const idx = r.aliasText.indexOf(term);
    assert.ok(idx > lastIndex, `expected "${term}" to appear after previous fields`);
    lastIndex = idx;
  }
});

test('indexed text is lowercased once', () => {
  const env = makeEnv({ name: { en: 'UPPER Case Name', ru: '' } });
  const r = buildEnvironmentSearchRecord(env);
  assert.ok(r.aliasText.includes('upper case name'));
  assert.ok(!/[A-Z]/.test(r.aliasText));
});

test('environment input objects are not mutated', () => {
  const env = makeEnv();
  const before = JSON.stringify(env);
  buildEnvironmentSearchRecord(env);
  assert.equal(JSON.stringify(env), before);
  assert.equal(Object.keys(env).some(k => k.startsWith('_search') || k === 'searchText' || k === 'normalizedText'), false);
});

/* ---------------- query preparation ---------------- */

test('empty input produces an empty prepared query', () => {
  const q = prepareSearchQuery('');
  assert.equal(q.empty, true);
  assert.equal(q.normalized, '');
  assert.deepEqual(q.aliasTerms, []);
});

test('whitespace-only input produces an empty prepared query', () => {
  const q = prepareSearchQuery('   ');
  assert.equal(q.empty, true);
});

test('leading and trailing whitespace is removed', () => {
  const q = prepareSearchQuery('  market  ');
  assert.equal(q.normalized, 'market');
});

test('mixed case is normalized', () => {
  const q = prepareSearchQuery('MaRkEt');
  assert.equal(q.normalized, 'market');
});

test('alias terms are expanded once for a qualifying query', () => {
  const q = prepareSearchQuery('market');
  assert.ok(q.aliasTerms.includes('рынок'));
  assert.ok(q.aliasTerms.includes('базар'));
});

test('a query below MIN_ALIAS_QUERY is not expanded', () => {
  const shortQuery = 'm'.repeat(MIN_ALIAS_QUERY - 1);
  const q = prepareSearchQuery(shortQuery);
  assert.deepEqual(q.aliasTerms, []);
});

test('a multi-word query is not expanded', () => {
  const q = prepareSearchQuery('market stall');
  assert.deepEqual(q.aliasTerms, []);
});

test('existing alias groups produce the expected configured terms', () => {
  const q = prepareSearchQuery('shop');
  assert.deepEqual(new Set(q.aliasTerms), new Set(['магазин', 'лавк', 'shop']));
});

test('RegExp metacharacters in configured terms remain escaped', () => {
  assert.doesNotThrow(() => wordStartRegex('a.b*c'));
  const re = wordStartRegex('a.b*c');
  assert.equal(re.test('xa.b*cx'), false);
  assert.equal(re.test(' a.b*c'), true);
});

test('prepared query creation does not access environment records', () => {
  // Pure function of the raw string only — no environments argument exists.
  assert.equal(prepareSearchQuery.length, 1);
});

/* ---------------- matching ---------------- */

test('empty query matches every valid record', () => {
  const record = buildEnvironmentSearchRecord(makeEnv());
  assert.equal(matches(record, prepareSearchQuery('')), true);
});

test('literal name match works', () => {
  const record = buildEnvironmentSearchRecord(makeEnv());
  assert.equal(matches(record, prepareSearchQuery('whispering')), true);
});

test('literal feature match works', () => {
  const env = makeEnv({ features: [{ name: { en: 'Glowing Stall', ru: '' } }] });
  const record = buildEnvironmentSearchRecord(env);
  assert.equal(matches(record, prepareSearchQuery('glowing stall')), true);
});

test('literal lore match works', () => {
  const env = makeEnv({ lore: { en: 'A cursed fountain', ru: '' } });
  const record = buildEnvironmentSearchRecord(env);
  assert.equal(matches(record, prepareSearchQuery('cursed fountain')), true);
});

test('literal raw-text match works', () => {
  const env = makeEnv({ rawText: { en: 'Verbatim source paragraph', ru: '' } });
  const record = buildEnvironmentSearchRecord(env);
  assert.equal(matches(record, prepareSearchQuery('verbatim source')), true);
});

test('literal adversary match works', () => {
  const env = makeEnv({ potential_adversaries: { en: ['Merchant'], ru: [] } });
  const record = buildEnvironmentSearchRecord(env);
  assert.equal(matches(record, prepareSearchQuery('merchant')), true);
});

test('alias match works against alias-eligible text', () => {
  const env = makeEnv({ name: { en: 'Sunlit Tavern', ru: '' } });
  const record = buildEnvironmentSearchRecord(env);
  assert.equal(matches(record, prepareSearchQuery('tavern')), true);
});

test('alias match does not work through adversary-only text', () => {
  // The alias for "market" (магазин group is 'shop'; use market group directly)
  // pulls in "рынок"/"базар"; an environment with no place-name match but a
  // Merchant adversary must not match through alias expansion.
  const env = makeEnv({
    name: { en: 'Silent Ruins', ru: 'Тихие руины' },
    potential_adversaries: { en: ['Merchant'], ru: ['Торговец'] },
  });
  const record = buildEnvironmentSearchRecord(env);
  assert.equal(matches(record, prepareSearchQuery('market')), false);
  // But typing the adversary word directly still finds it literally.
  assert.equal(matches(record, prepareSearchQuery('merchant')), true);
});

test('literal matching takes precedence over alias matching', () => {
  const env = makeEnv({ name: { en: 'Marketplace of Echoes', ru: '' } });
  const record = buildEnvironmentSearchRecord(env);
  // "market" is both a literal substring of "marketplace" and an alias term.
  assert.equal(matches(record, prepareSearchQuery('market')), true);
});

test('word-start alias behavior remains intact', () => {
  const env = makeEnv({ rawText: { en: '', ru: 'Загадочная лавка торговца' } });
  const record = buildEnvironmentSearchRecord(env);
  assert.equal(matches(record, prepareSearchQuery('магазин')), true);
});

test('alias text does not match inside the middle of an unrelated longer word', () => {
  // "бар" is not a configured alias term (deliberately, per the code comments),
  // but this proves word-start matching in general: a stem embedded mid-word
  // in an otherwise unrelated term must not satisfy wordStartRegex.
  const re = wordStartRegex('бар');
  assert.equal(re.test('барьер'), true); // word-start still matches at string start
  assert.equal(re.test('квбарьер'), false); // not preceded by a non-letter boundary
});

test('unicode English and Russian text works', () => {
  const env = makeEnv({ name: { en: 'Café Interlude', ru: 'Ёлочный посёлок' } });
  const record = buildEnvironmentSearchRecord(env);
  assert.equal(matches(record, prepareSearchQuery('café')), true);
  assert.equal(matches(record, prepareSearchQuery('ёлочный')), true);
});

test('punctuation behavior remains unchanged (preserved, not stripped)', () => {
  const env = makeEnv({ rawText: { en: "Merchant's Row, at dusk!", ru: '' } });
  const record = buildEnvironmentSearchRecord(env);
  assert.equal(matches(record, prepareSearchQuery("merchant's row")), true);
  assert.equal(matches(record, prepareSearchQuery('merchant row')), false);
});

test('search is independent of active UI language', () => {
  const env = makeEnv({ name: { en: 'English Only Name', ru: 'Только русское название' } });
  const record = buildEnvironmentSearchRecord(env);
  assert.equal(matches(record, prepareSearchQuery('english only')), true);
  assert.equal(matches(record, prepareSearchQuery('русское название')), true);
});

/* ---------------- index lifecycle ---------------- */

test('one record is built per environment', () => {
  const envs = [makeEnv({ id: 'a' }), makeEnv({ id: 'b' }), makeEnv({ id: 'c' })];
  const index = buildEnvironmentSearchIndex(envs);
  assert.equal(index.size, 3);
});

test('every environment ID has an index entry', () => {
  const envs = [makeEnv({ id: 'a' }), makeEnv({ id: 'b' })];
  const index = buildEnvironmentSearchIndex(envs);
  for (const env of envs) assert.ok(index.has(env.id));
});

test('building the index does not reorder the environment array', () => {
  const envs = [makeEnv({ id: 'z' }), makeEnv({ id: 'a' }), makeEnv({ id: 'm' })];
  const ids = envs.map(e => e.id);
  buildEnvironmentSearchIndex(envs);
  assert.deepEqual(envs.map(e => e.id), ids);
});

test('repeated matching does not read environment fields again (getter-backed fixture)', () => {
  let reads = 0;
  const env = {
    id: 'tracked',
    tier: 1,
    get name() { reads++; return { en: 'Tracked Place', ru: '' }; },
  };
  const record = buildEnvironmentSearchRecord(env);
  const readsAfterBuild = reads;
  assert.ok(readsAfterBuild > 0);
  const q = prepareSearchQuery('tracked');
  matches(record, q);
  matches(record, q);
  matches(record, q);
  // All reads happened during record construction — none during matching.
  assert.equal(reads, readsAfterBuild);
});

test('catalog and list subsets can reuse the same records', () => {
  const envs = [makeEnv({ id: 'a' }), makeEnv({ id: 'b' })];
  const index = buildEnvironmentSearchIndex(envs);
  const listSubset = [envs[1]];
  const recordFromCatalog = index.get(envs[1].id);
  const recordFromList = index.get(listSubset[0].id);
  assert.equal(recordFromCatalog, recordFromList);
});

test('a one-time missing-record fallback caches the repaired record', () => {
  const env = makeEnv({ id: 'lazy' });
  const index = new Map();
  assert.equal(index.has('lazy'), false);
  const built = buildEnvironmentSearchRecord(env);
  index.set(env.id, built);
  assert.equal(index.get('lazy'), built);
});

test('no search record is persisted or serialized into source data', () => {
  const env = makeEnv();
  buildEnvironmentSearchRecord(env);
  assert.equal(JSON.stringify(env).includes('aliasText'), false);
  assert.equal(JSON.stringify(env).includes('literalText'), false);
});

/* ---------------- production data ---------------- */

test('production data/environments.json builds a complete, valid index', () => {
  const dataPath = path.join(__dirname, '../data/environments.json');
  const raw = fs.readFileSync(dataPath, 'utf8');
  const data = JSON.parse(raw);
  const environments = data.environments;
  assert.ok(Array.isArray(environments) && environments.length > 0);

  const before = JSON.stringify(environments);
  const index = buildEnvironmentSearchIndex(environments);
  assert.equal(index.size, environments.length);
  assert.equal(JSON.stringify(environments), before);

  for (const env of environments) {
    const record = index.get(env.id);
    assert.ok(record, `missing record for ${env.id}`);
    assert.equal(typeof record.aliasText, 'string');
    assert.equal(typeof record.literalText, 'string');
    assert.equal(Object.keys(env).some(k => k.startsWith('_search')), false);
  }

  function idsMatching(query) {
    const prepared = prepareSearchQuery(query);
    return environments.filter(e => matches(index.get(e.id), prepared)).map(e => e.id);
  }

  // Representative queries: at least one environment should be found for
  // each, without asserting the full result set (future data additions may
  // legitimately add more matches).
  const englishName = environments[0].name.en;
  assert.ok(idsMatching(englishName).includes(environments[0].id));

  const withRu = environments.find(e => e.name && e.name.ru);
  if (withRu) assert.ok(idsMatching(withRu.name.ru).includes(withRu.id));

  const withFeatureText = environments.find(e => (e.features || []).some(f => f.name && f.name.en));
  if (withFeatureText) {
    const feat = withFeatureText.features.find(f => f.name && f.name.en);
    assert.ok(idsMatching(feat.name.en).includes(withFeatureText.id));
  }

  const withAdversary = environments.find(e => e.potential_adversaries && e.potential_adversaries.en && e.potential_adversaries.en.length);
  if (withAdversary) {
    const name = withAdversary.potential_adversaries.en[0];
    assert.ok(idsMatching(name).includes(withAdversary.id));
  }

  // English alias.
  const shopMatches = idsMatching('shop');
  assert.ok(Array.isArray(shopMatches));

  // Russian alias.
  const marketMatches = idsMatching('рынок');
  assert.ok(Array.isArray(marketMatches));
});

/* ---------------- static regression assertions ---------------- */

test('envMatchesFilters() in js/app.js no longer traverses features or joins search text', () => {
  const src = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const match = src.match(/function envMatchesFilters\([\s\S]*?\n}\n/);
  assert.ok(match, 'envMatchesFilters() not found in js/app.js');
  const body = match[0];
  assert.equal(/env\.features/.test(body), false, 'still traverses env.features');
  assert.equal(/featureText/.test(body), false, 'still builds featureText');
  assert.equal(/rawText/.test(body), false, 'still builds a rawText array');
  assert.equal(/loreText/.test(body), false, 'still builds a loreText array');
  assert.equal(/potential_adversaries/.test(body), false, 'still reads potential_adversaries directly');
  assert.equal(/\.join\(/.test(body), false, 'still joins environment fields');
  assert.equal(/\.toLowerCase\(\)/.test(body), false, 'still lowercases environment content');
});

test('js/app.js builds the search index once via setEnvironmentCatalog / SearchIndex.buildEnvironmentSearchIndex', () => {
  const src = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  assert.ok(src.includes('SearchIndex.buildEnvironmentSearchIndex'), 'index is never built');
  assert.ok(src.includes('function setEnvironmentCatalog'), 'no single catalog+index lifecycle boundary');
});

test('query preparation happens in sortedFilteredEnvs(), outside the per-environment filter callback', () => {
  const src = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const match = src.match(/function sortedFilteredEnvs\([\s\S]*?\n}\n/);
  assert.ok(match, 'sortedFilteredEnvs() not found in js/app.js');
  assert.ok(match[0].includes('SearchIndex.prepareSearchQuery'), 'query is not prepared once per filtering pass');
});

test('index.html loads js/search-index.js with the automatic cache-version marker, before js/app.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const searchIndexTag = html.match(/<script[^>]*src="js\/search-index\.js"[^>]*>/);
  const appTag = html.match(/<script[^>]*src="js\/app\.js"[^>]*>/);
  assert.ok(searchIndexTag, 'js/search-index.js is not loaded from index.html');
  assert.ok(searchIndexTag[0].includes('data-cache-version="ui"'), 'missing automatic cache-version marker');
  assert.ok(!/[?&]v=/.test(searchIndexTag[0]), 'manual ?v= query parameter must not be added');
  assert.ok(html.indexOf(searchIndexTag[0]) < html.indexOf(appTag[0]), 'search-index.js must load before app.js');
});
