/* Pure-logic tests for js/freshcutgrass-utils.js (FreshCutGrassUtils) — the
 * one FreshCutGrass URL encoder shared by the environment detail page's
 * "Potential Adversaries" links and Session Prep's "Open in FreshCutGrass"
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
