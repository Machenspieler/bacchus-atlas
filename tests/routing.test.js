/* ============================================================
   Bacchus's Atlas — tests/routing.test.js
   Dependency-free regression tests for js/route-utils.js. Run with:

     node --test tests/routing.test.js

   RouteUtils is pure (no DOM, no application state, no browser globals),
   so it's exercised directly here with plain hash strings — no jsdom or
   other browser-emulation dependency needed. See the "Hash routing"
   section in CLAUDE.md for the contract this implements.
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RouteUtils = require('../js/route-utils.js');
const { parseRouteHash, routeToHash, baseHash, envHash, safeDecodeRouteSegment } = RouteUtils;

/* ---------------- 1-13: valid routes ---------------- */

test('empty hash resolves to the catalog', () => {
  const r = parseRouteHash('');
  assert.deepEqual(r.route, { name: 'catalog', env: null });
  assert.equal(r.malformed, false);
  assert.equal(r.canonicalHash, null);
});

test('"#" resolves to the catalog', () => {
  const r = parseRouteHash('#');
  assert.deepEqual(r.route, { name: 'catalog', env: null });
  assert.equal(r.malformed, false);
});

test('"#/lists" resolves to Lists overview', () => {
  const r = parseRouteHash('#/lists');
  assert.deepEqual(r.route, { name: 'lists', env: null });
  assert.equal(r.malformed, false);
});

test('"#/journey" resolves to Journey', () => {
  const r = parseRouteHash('#/journey');
  assert.deepEqual(r.route, { name: 'journey', env: null });
  assert.equal(r.malformed, false);
});

test('"#/session-prep" resolves to Session Prep', () => {
  const r = parseRouteHash('#/session-prep');
  assert.deepEqual(r.route, { name: 'session-prep', env: null });
  assert.equal(r.malformed, false);
});

test('a valid list ID resolves to an individual list', () => {
  const r = parseRouteHash('#/lists/list-abc');
  assert.deepEqual(r.route, { name: 'list', id: 'list-abc', env: null });
  assert.equal(r.malformed, false);
});

test('a valid catalog environment suffix resolves to an overlay', () => {
  const r = parseRouteHash('#/env/ancient-grove');
  assert.deepEqual(r.route, { name: 'catalog', env: 'ancient-grove' });
  assert.equal(r.malformed, false);
});

test('a valid list environment suffix preserves both IDs', () => {
  const r = parseRouteHash('#/lists/list-abc/env/ancient-grove');
  assert.deepEqual(r.route, { name: 'list', id: 'list-abc', env: 'ancient-grove' });
  assert.equal(r.malformed, false);
});

test('a valid Journey environment suffix preserves the Journey route', () => {
  const r = parseRouteHash('#/journey/env/ancient-grove');
  assert.deepEqual(r.route, { name: 'journey', env: 'ancient-grove' });
  assert.equal(r.malformed, false);
});

test('a valid Session Prep environment suffix preserves the Session Prep route', () => {
  const r = parseRouteHash('#/session-prep/env/ancient-grove');
  assert.deepEqual(r.route, { name: 'session-prep', env: 'ancient-grove' });
  assert.equal(r.malformed, false);
});

test('valid percent-encoded Cyrillic decodes correctly', () => {
  const r = parseRouteHash('#/env/' + encodeURIComponent('Тест'));
  assert.deepEqual(r.route, { name: 'catalog', env: 'Тест' });
  assert.equal(r.malformed, false);
});

test('valid percent-encoded emoji decodes correctly', () => {
  const r = parseRouteHash('#/env/' + encodeURIComponent('📚'));
  assert.deepEqual(r.route, { name: 'catalog', env: '📚' });
  assert.equal(r.malformed, false);
});

test('%25 decodes to a literal percent character', () => {
  const r = parseRouteHash('#/lists/100%25');
  assert.deepEqual(r.route, { name: 'list', id: '100%', env: null });
  assert.equal(r.malformed, false);
});

test('%2F preserves the current decoded-slash behavior', () => {
  const r = parseRouteHash('#/lists/a%2Fb');
  assert.deepEqual(r.route, { name: 'list', id: 'a/b', env: null });
  assert.equal(r.malformed, false);
});

test('unknown but safely encoded routes preserve the existing catalog fallback', () => {
  const r = parseRouteHash('#/something-unknown');
  assert.deepEqual(r.route, { name: 'catalog', env: null });
  assert.equal(r.malformed, false);
});

/* ---------------- 14-21: malformed encoding never throws ---------------- */

const MALFORMED_SEGMENTS = ['%', '%2', '%GG', '%E0%A4%A', '%C0%AF', '%ED%A0%80', '%F0%28%8C%28', '%A0%A1'];

for (const seg of MALFORMED_SEGMENTS) {
  test(`safeDecodeRouteSegment does not throw for malformed segment ${JSON.stringify(seg)}`, () => {
    let result;
    assert.doesNotThrow(() => { result = safeDecodeRouteSegment(seg); });
    assert.equal(result.ok, false);
    assert.equal(result.value, null);
  });

  test(`parseRouteHash does not throw for malformed catalog env ${JSON.stringify(seg)}`, () => {
    assert.doesNotThrow(() => parseRouteHash('#/env/' + seg));
  });

  test(`parseRouteHash does not throw for malformed list id ${JSON.stringify(seg)}`, () => {
    assert.doesNotThrow(() => parseRouteHash('#/lists/' + seg));
  });
}

/* ---------------- 22-30: fallback behavior ---------------- */

test('malformed catalog environment falls back to catalog', () => {
  const r = parseRouteHash('#/env/%');
  assert.deepEqual(r.route, { name: 'catalog', env: null });
  assert.equal(r.malformed, true);
  assert.equal(r.canonicalHash, '');
});

test('malformed Lists environment preserves Lists overview', () => {
  const r = parseRouteHash('#/lists/env/%');
  assert.deepEqual(r.route, { name: 'lists', env: null });
  assert.equal(r.malformed, true);
  assert.equal(r.canonicalHash, '#/lists');
});

test('malformed list environment preserves the valid list', () => {
  const r = parseRouteHash('#/lists/list-abc/env/%');
  assert.deepEqual(r.route, { name: 'list', id: 'list-abc', env: null });
  assert.equal(r.malformed, true);
  assert.equal(r.canonicalHash, '#/lists/list-abc');
});

test('malformed Journey environment preserves Journey', () => {
  const r = parseRouteHash('#/journey/env/%');
  assert.deepEqual(r.route, { name: 'journey', env: null });
  assert.equal(r.malformed, true);
  assert.equal(r.canonicalHash, '#/journey');
});

test('malformed Session Prep environment preserves Session Prep', () => {
  const r = parseRouteHash('#/session-prep/env/%');
  assert.deepEqual(r.route, { name: 'session-prep', env: null });
  assert.equal(r.malformed, true);
  assert.equal(r.canonicalHash, '#/session-prep');
});

test('malformed list ID falls back to Lists overview', () => {
  const r = parseRouteHash('#/lists/%');
  assert.deepEqual(r.route, { name: 'lists', env: null });
  assert.equal(r.malformed, true);
  assert.equal(r.canonicalHash, '#/lists');
});

test('malformed list ID preserves a valid environment overlay', () => {
  const r = parseRouteHash('#/lists/%/env/ancient-grove');
  assert.deepEqual(r.route, { name: 'lists', env: 'ancient-grove' });
  assert.equal(r.malformed, true);
  assert.equal(r.canonicalHash, '#/lists/env/ancient-grove');
});

test('malformed list ID and environment fall back to Lists overview', () => {
  const r = parseRouteHash('#/lists/%/env/%');
  assert.deepEqual(r.route, { name: 'lists', env: null });
  assert.equal(r.malformed, true);
  assert.equal(r.canonicalHash, '#/lists');
});

test('no malformed raw value appears in the returned route', () => {
  for (const seg of MALFORMED_SEGMENTS) {
    for (const hash of [`#/env/${seg}`, `#/lists/${seg}`, `#/lists/${seg}/env/ancient-grove`, `#/lists/list-abc/env/${seg}`]) {
      const r = parseRouteHash(hash);
      const serialized = JSON.stringify(r.route);
      assert.ok(!serialized.includes(seg), `route for ${JSON.stringify(hash)} must not carry the raw malformed segment: ${serialized}`);
    }
  }
});

test('a malformed result contains the expected canonical hash', () => {
  const r = parseRouteHash('#/lists/list-abc/env/%GG');
  assert.equal(r.malformed, true);
  assert.equal(r.canonicalHash, '#/lists/list-abc');
  assert.equal(routeToHash(r.route), r.canonicalHash);
});

/* ---------------- 31-39: canonical route generation ---------------- */

test('every supported base route generates the expected hash', () => {
  assert.equal(baseHash({ name: 'catalog', env: null }), '');
  assert.equal(baseHash({ name: 'lists', env: null }), '#/lists');
  assert.equal(baseHash({ name: 'list', id: 'list-abc', env: null }), '#/lists/list-abc');
  assert.equal(baseHash({ name: 'journey', env: null }), '#/journey');
  assert.equal(baseHash({ name: 'session-prep', env: null }), '#/session-prep');
});

test('environment suffixes are encoded exactly once', () => {
  const hash = envHash('Тест грот', { name: 'catalog', env: null });
  assert.equal(hash, '#/env/' + encodeURIComponent('Тест грот'));
  assert.equal((hash.match(/%25/g) || []).length, 0);
});

test('list IDs are encoded exactly once', () => {
  const hash = baseHash({ name: 'list', id: 'a b/c', env: null });
  assert.equal(hash, '#/lists/' + encodeURIComponent('a b/c'));
});

test('generated routes round-trip through the parser', () => {
  const routes = [
    { name: 'catalog', env: null },
    { name: 'lists', env: null },
    { name: 'journey', env: null },
    { name: 'session-prep', env: null },
    { name: 'list', id: 'list-abc', env: null },
    { name: 'catalog', env: 'ancient-grove' },
    { name: 'lists', env: 'ancient-grove' },
    { name: 'journey', env: 'ancient-grove' },
    { name: 'session-prep', env: 'ancient-grove' },
    { name: 'list', id: 'list-abc', env: 'ancient-grove' },
  ];
  for (const route of routes) {
    const hash = routeToHash(route);
    const parsed = parseRouteHash(hash);
    assert.deepEqual(parsed.route, route, `round-trip failed for ${JSON.stringify(route)} -> ${hash}`);
    assert.equal(parsed.malformed, false);
  }
});

test('Unicode IDs round-trip through encode and decode', () => {
  const route = { name: 'list', id: 'Тест 📚', env: '👍 грот' };
  const parsed = parseRouteHash(routeToHash(route));
  assert.deepEqual(parsed.route, route);
});

test('IDs containing a literal percent character round-trip', () => {
  const route = { name: 'list', id: '100% done', env: null };
  const parsed = parseRouteHash(routeToHash(route));
  assert.deepEqual(parsed.route, route);
});

test('IDs containing spaces round-trip', () => {
  const route = { name: 'catalog', env: 'ancient grove' };
  const parsed = parseRouteHash(routeToHash(route));
  assert.deepEqual(parsed.route, route);
});

test('IDs containing a slash round-trip according to current behavior', () => {
  const route = { name: 'list', id: 'a/b', env: null };
  const parsed = parseRouteHash(routeToHash(route));
  assert.deepEqual(parsed.route, route);
});

test('canonicalization does not produce duplicate /env/ segments', () => {
  const route = { name: 'list', id: 'list-abc', env: 'ancient-grove' };
  const hash = routeToHash(route);
  assert.equal((hash.match(/\/env\//g) || []).length, 1);
});

/* ---------------- 40-45: general robustness ---------------- */

const ARBITRARY_HASH_CORPUS = [
  '', '#', '#/', '#//', '#/env', '#/env/', '#/lists/', '#/lists//env/x',
  '#/lists/%/%', '#///', '#/journey/env/', '#/env/%%%', '#/lists/%C0',
  '#/session-prep', '#/session-prep/env/', '#/session-prep/env/%',
  '#random', '#/lists/list-abc/env/list-abc/env/x', '#/env/' + '%'.repeat(50),
  '#/lists/' + 'a'.repeat(500), '#/lists/list abc/env/an chor',
  ...MALFORMED_SEGMENTS.map(s => `#/env/${s}`),
  ...MALFORMED_SEGMENTS.map(s => `#/lists/${s}`),
  ...MALFORMED_SEGMENTS.map(s => `#/lists/${s}/env/${s}`),
];

test('the parser never throws for a deterministic corpus of arbitrary hash strings', () => {
  for (const hash of ARBITRARY_HASH_CORPUS) {
    assert.doesNotThrow(() => parseRouteHash(hash), `threw for ${JSON.stringify(hash)}`);
  }
});

test('repeated parsing of the same hash produces the same result', () => {
  for (const hash of ARBITRARY_HASH_CORPUS) {
    const first = parseRouteHash(hash);
    const second = parseRouteHash(hash);
    assert.deepEqual(first, second, `parsing ${JSON.stringify(hash)} twice diverged`);
  }
});

test('the parser does not read or mutate browser globals', () => {
  assert.equal(typeof window, 'undefined');
  assert.equal(typeof document, 'undefined');
  assert.equal(typeof location, 'undefined');
  const r = parseRouteHash('#/lists/list-abc/env/ancient-grove');
  assert.deepEqual(r.route, { name: 'list', id: 'list-abc', env: 'ancient-grove' });
});

test('valid route results do not request canonical repair', () => {
  const r = parseRouteHash('#/lists/list-abc/env/ancient-grove');
  assert.equal(r.malformed, false);
  assert.equal(r.canonicalHash, null);
});

test('malformed route results do request canonical repair', () => {
  const r = parseRouteHash('#/lists/%');
  assert.equal(r.malformed, true);
  assert.equal(typeof r.canonicalHash, 'string');
});

test('unknown valid routes are not incorrectly classified as encoding failures', () => {
  const r = parseRouteHash('#/env/' + encodeURIComponent('völlig-normal_id.42'));
  assert.equal(r.malformed, false);
  assert.deepEqual(r.route, { name: 'catalog', env: 'völlig-normal_id.42' });
});

/* ---------------- optional: browser-integration layer with simple fakes ---------------- */

/** Minimal stand-in for the browser layer's readCurrentRoute()/repairHash()
 * in js/app.js, built only from RouteUtils and fake location/history — no
 * jsdom. Mirrors the real implementation closely enough to prove the
 * contract (one replaceState on malformed input, none on valid input,
 * origin/pathname/query preserved, no exception propagates). */
function makeFakeBrowser(initialHref) {
  const state = { href: initialHref, historyState: { some: 'state' }, replaceCalls: [] };
  const location = {
    get hash() {
      const i = state.href.indexOf('#');
      return i === -1 ? '' : state.href.slice(i);
    },
  };
  const history = {
    get state() { return state.historyState; },
    replaceState(newState, title, url) {
      state.replaceCalls.push({ newState, title, url });
      state.historyState = newState;
      state.href = url;
    },
  };
  function readCurrentRoute() {
    const parsed = parseRouteHash(location.hash);
    if (parsed.malformed) repairHash(parsed.canonicalHash);
    return parsed.route;
  }
  function repairHash(canonicalHash) {
    try {
      const url = new URL(state.href);
      url.hash = canonicalHash;
      history.replaceState(history.state, '', url.href);
    } catch (err) {
      // best-effort, matches js/app.js's repairHash()
    }
  }
  return { state, location, history, readCurrentRoute };
}

test('browser integration: malformed input results in exactly one replaceState call', () => {
  const browser = makeFakeBrowser('https://example.com/atlas/?x=1#/lists/%');
  const route = browser.readCurrentRoute();
  assert.deepEqual(route, { name: 'lists', env: null });
  assert.equal(browser.state.replaceCalls.length, 1);
});

test('browser integration: valid input results in no replaceState call', () => {
  const browser = makeFakeBrowser('https://example.com/atlas/?x=1#/lists/list-abc');
  const route = browser.readCurrentRoute();
  assert.deepEqual(route, { name: 'list', id: 'list-abc', env: null });
  assert.equal(browser.state.replaceCalls.length, 0);
});

test('browser integration: the current path and query string are preserved', () => {
  const browser = makeFakeBrowser('https://example.com/atlas/?x=1#/lists/%');
  browser.readCurrentRoute();
  const finalUrl = new URL(browser.state.href);
  assert.equal(finalUrl.origin, 'https://example.com');
  assert.equal(finalUrl.pathname, '/atlas/');
  assert.equal(finalUrl.search, '?x=1');
  assert.equal(finalUrl.hash, '#/lists');
});

test('browser integration: history state is preserved across repair', () => {
  const browser = makeFakeBrowser('https://example.com/atlas/#/lists/%');
  browser.readCurrentRoute();
  assert.deepEqual(browser.state.replaceCalls[0].newState, { some: 'state' });
});

test('browser integration: replaceState failure does not stop route parsing', () => {
  const browser = makeFakeBrowser('https://example.com/atlas/#/lists/%');
  browser.history.replaceState = () => { throw new Error('replaceState boom'); };
  let route;
  assert.doesNotThrow(() => { route = browser.readCurrentRoute(); });
  assert.deepEqual(route, { name: 'lists', env: null });
});

/* ---------------- static regression check ---------------- */

test('js/app.js never decodes a regex-captured hash segment directly', () => {
  const src = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  assert.doesNotMatch(
    src,
    /decodeURIComponent\s*\(\s*(?:em|m)\s*\[\s*1\s*\]\s*\)/,
    'untrusted hash segments must be decoded through RouteUtils.safeDecodeRouteSegment(), not a direct decodeURIComponent(em[1])/decodeURIComponent(m[1])',
  );
  assert.doesNotMatch(
    src,
    /function\s+parseRoute\s*\(/,
    'the old unsafe parseRoute() must be gone from js/app.js — routing goes through RouteUtils.parseRouteHash() via readCurrentRoute()',
  );
});
