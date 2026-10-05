/* Pure-logic tests for js/freshcutgrass-utils.js (FreshCutGrassUtils) — the
 * one FreshCutGrass URL encoder shared by the environment detail page's
 * "Potential Adversaries" links and Prep's "Open in FreshCutGrass"
 * export. No DOM, no fetch: builds a URL, decodes its own payload back out,
 * and asserts on the decoded JSON — see the "FreshCutGrass export" section
 * of CLAUDE.md for the contract this locks in. */

const test = require('node:test');
const assert = require('node:assert/strict');

const FreshCutGrassUtils = require('../js/freshcutgrass-utils.js');

/** Inverse of buildFreshCutGrassEncounterUrl(): pulls the base64 `data`
 * query param back out of the URL and decodes it to the original payload
 * object, the same way a real FreshCutGrass page load would. */
function decodeEncounterUrl(url) {
  const encoded = new URL(url).searchParams.get('data');
  const binary = Buffer.from(decodeURIComponent(encoded), 'base64').toString('binary');
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  const json = Buffer.from(bytes).toString('utf8');
  return JSON.parse(json);
}

test('buildFreshCutGrassEncounterUrl targets the freshcutgrass.app encounter endpoint', () => {
  const url = FreshCutGrassUtils.buildFreshCutGrassEncounterUrl('Test Encounter', ['Bugboar']);
  assert.ok(url.startsWith('https://freshcutgrass.app/encounter?data='));
});

test('the decoded payload carries the encounter title', () => {
  const url = FreshCutGrassUtils.buildFreshCutGrassEncounterUrl('Night at the Canyon', ['Bugboar']);
  const payload = decodeEncounterUrl(url);
  assert.equal(payload.n, 'Night at the Canyon');
});

test('the decoded payload lists every adversary name given, in order', () => {
  const names = ['Acid Burrower', 'Bugboar', 'Dire Wolf'];
  const url = FreshCutGrassUtils.buildFreshCutGrassEncounterUrl('Encounter', names);
  const payload = decodeEncounterUrl(url);
  assert.deepEqual(payload.d.map(entry => entry.n), names);
});

test('every adversary entry is exported at quantity 1', () => {
  const url = FreshCutGrassUtils.buildFreshCutGrassEncounterUrl('Encounter', ['Bugboar', 'Bugboar', 'Dire Wolf']);
  const payload = decodeEncounterUrl(url);
  assert.ok(payload.d.every(entry => entry.q === 1));
});

test('a Cyrillic encounter title encodes and decodes without throwing', () => {
  assert.doesNotThrow(() => {
    const url = FreshCutGrassUtils.buildFreshCutGrassEncounterUrl('Ночь в Каньоне', ['Bugboar']);
    const payload = decodeEncounterUrl(url);
    assert.equal(payload.n, 'Ночь в Каньоне');
  });
});

test('an empty adversary list still produces a decodable payload with an empty roster', () => {
  const url = FreshCutGrassUtils.buildFreshCutGrassEncounterUrl('Empty Encounter', []);
  const payload = decodeEncounterUrl(url);
  assert.deepEqual(payload.d, []);
});

test('utf8ToBase64 round-trips a plain ASCII string', () => {
  const encoded = FreshCutGrassUtils.utf8ToBase64('hello');
  assert.equal(Buffer.from(encoded, 'base64').toString('utf8'), 'hello');
});

/* ---------------- supported-adversary compatibility ---------------- */

const prepCatalogue = require('../data/prep.json').adversaries;
const environments = require('../data/environments.json').environments;
const PotentialAdversaryUtils = require('../js/potential-adversary-utils.js');
const supportIndex = FreshCutGrassUtils.buildSupportedAdversaryIndex(prepCatalogue);
const supportedUrl = (name, advs) => FreshCutGrassUtils.buildSupportedEncounterUrl(name, advs, supportIndex);

test('every Prep catalogue adversary is supported, by English name or record', () => {
  prepCatalogue.forEach(adv => {
    assert.equal(FreshCutGrassUtils.isFreshCutGrassSupported(adv, supportIndex), true, adv.id);
    assert.equal(FreshCutGrassUtils.isFreshCutGrassSupported(adv.name.en, supportIndex), true, adv.id);
  });
});

test('a name outside the supported dataset is unsupported (fail closed)', () => {
  assert.equal(FreshCutGrassUtils.isFreshCutGrassSupported('Tourists', supportIndex), false);
  assert.equal(FreshCutGrassUtils.isFreshCutGrassSupported('', supportIndex), false);
  assert.equal(FreshCutGrassUtils.isFreshCutGrassSupported(null, supportIndex), false);
  // No index at all (Prep catalogue not loaded) means nothing is supported.
  assert.equal(FreshCutGrassUtils.isFreshCutGrassSupported('Bear', undefined), false);
  assert.equal(FreshCutGrassUtils.isFreshCutGrassSupported('Bear', new Map()), false);
});

test('compatibility reads the English name only — a Russian label never matches', () => {
  const bear = prepCatalogue.find(a => a.id === 'bear');
  assert.equal(FreshCutGrassUtils.isFreshCutGrassSupported(bear.name.ru, supportIndex), false);
  assert.equal(FreshCutGrassUtils.isFreshCutGrassSupported({ name: { ru: bear.name.ru } }, supportIndex), false);
  assert.equal(FreshCutGrassUtils.isFreshCutGrassSupported({ name: { en: 'Bear', ru: 'whatever' } }, supportIndex), true);
});

test('supported/unsupported helpers partition a list and keep its order', () => {
  const list = ['Bear', 'Tourists', 'Dire Wolf', 'River Spirit'];
  assert.deepEqual(FreshCutGrassUtils.getFreshCutGrassSupportedAdversaries(list, supportIndex), ['Bear', 'Dire Wolf']);
  assert.deepEqual(FreshCutGrassUtils.getFreshCutGrassUnsupportedAdversaries(list, supportIndex), ['Tourists', 'River Spirit']);
});

test('a supported-only list builds exactly the same URL as the raw encoder', () => {
  const names = ['Acid Burrower', 'Bugboar', 'Dire Wolf'];
  assert.equal(supportedUrl('Encounter', names), FreshCutGrassUtils.buildFreshCutGrassEncounterUrl('Encounter', names));
});

test('unsupported names never reach the payload', () => {
  const url = supportedUrl('Mixed', ['Bear', 'Tourists', 'Dire Wolf']);
  assert.deepEqual(decodeEncounterUrl(url).d.map(e => e.n), ['Bear', 'Dire Wolf']);
  assert.ok(!JSON.stringify(decodeEncounterUrl(url)).includes('Tourists'));
});

test('no supported adversary builds no URL at all', () => {
  assert.equal(supportedUrl('None', ['Tourists', 'Some Homebrew Adversary']), null);
  assert.equal(supportedUrl('None', []), null);
  assert.equal(FreshCutGrassUtils.buildSupportedEncounterUrl('None', ['Bear'], new Map()), null);
});

test('a supported adversary is sent under the catalogue spelling, once', () => {
  const url = supportedUrl('Case', ['dire wolf', 'Dire Wolf']);
  assert.deepEqual(decodeEncounterUrl(url).d.map(e => e.n), ['Dire Wolf']);
});

test('the Fathomless Baths surface keeps its supported names and drops Tourists', () => {
  const env = environments.find(e => e.id === 'fathomless-baths-surface');
  const names = PotentialAdversaryUtils.envAdversaryNames(env);
  assert.deepEqual(names, ['Merchant', 'Petty Noble', 'Tourists']);
  const exported = decodeEncounterUrl(supportedUrl('Baths', names)).d.map(e => e.n);
  assert.ok(!exported.includes('Tourists'));
  assert.deepEqual(exported, names.filter(n => FreshCutGrassUtils.isFreshCutGrassSupported(n, supportIndex)));
});
