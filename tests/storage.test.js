/* ============================================================
   Bacchus's Atlas — tests/storage.test.js
   Dependency-free regression tests for js/safe-storage.js. Run with:

     node --test tests/storage.test.js

   These exercise the safe-storage module directly (no browser, no
   app.js) with a fake Storage that can be told to throw from
   getItem/setItem/removeItem, so the recovery paths that only ever
   fire in a broken browser can still be tested here.
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SafeStorage = require('../js/safe-storage.js');

class FakeStorage {
  constructor(initial) {
    this.data = new Map(Object.entries(initial || {}));
    this.throwing = new Set();
  }
  throwFrom(...methods) { methods.forEach(m => this.throwing.add(m)); return this; }
  getItem(key) {
    if (this.throwing.has('getItem')) throw new Error('getItem boom');
    return this.data.has(key) ? this.data.get(key) : null;
  }
  setItem(key, value) {
    if (this.throwing.has('setItem')) throw new Error('setItem boom');
    this.data.set(key, String(value));
  }
  removeItem(key) {
    if (this.throwing.has('removeItem')) throw new Error('removeItem boom');
    this.data.delete(key);
  }
}

test.beforeEach(() => { SafeStorage.resetRecoverySummary(); });

/* ---------------- 1: missing keys ---------------- */

test('missing key returns a fresh fallback value', () => {
  const storage = new FakeStorage();
  const a = SafeStorage.loadStoredJson(storage, 'dhcodex_lists', { fallback: () => [], validate: SafeStorage.validators.lists });
  const b = SafeStorage.loadStoredJson(storage, 'dhcodex_lists', { fallback: () => [], validate: SafeStorage.validators.lists });
  assert.deepEqual(a, []);
  assert.notEqual(a, b, 'each call must get its own fresh array, not a shared one');
  assert.equal(SafeStorage.getRecoverySummary().hasIssues, false);
});

/* ---------------- 2/3/4: language ---------------- */

function loadLang(storage) {
  return SafeStorage.loadStoredJson(storage, 'dhcodex_lang', {
    fallback: () => 'ru',
    parse: raw => {
      try { return JSON.parse(raw) === 'en' ? 'en' : 'ru'; }
      catch { return raw === 'en' ? 'en' : 'ru'; }
    },
  });
}

test('valid language JSON loads', () => {
  const storage = new FakeStorage({ dhcodex_lang: '"en"' });
  assert.equal(loadLang(storage), 'en');
});

test('legacy bare language value loads', () => {
  const storage = new FakeStorage({ dhcodex_lang: 'en' });
  assert.equal(loadLang(storage), 'en');
});

test('malformed language data falls back to the default language', () => {
  const storage = new FakeStorage({ dhcodex_lang: '{' });
  assert.equal(loadLang(storage), 'ru');
});

/* ---------------- 5/6/7/8: lists ---------------- */

test('valid lists load unchanged', () => {
  const lists = [{ id: 'list-1', name: 'Coast' }, { id: 'list-2', name: 'Peaks' }];
  const storage = new FakeStorage({ dhcodex_lists: JSON.stringify(lists) });
  const loaded = SafeStorage.loadStoredJson(storage, 'dhcodex_lists', { fallback: () => [], validate: SafeStorage.validators.lists });
  assert.deepEqual(loaded, lists);
  assert.equal(SafeStorage.getRecoverySummary().hasIssues, false);
  assert.equal(storage.data.has(SafeStorage.backupKeyFor('dhcodex_lists')), false);
});

test('malformed lists JSON returns an empty array', () => {
  const storage = new FakeStorage({ dhcodex_lists: '{' });
  const loaded = SafeStorage.loadStoredJson(storage, 'dhcodex_lists', { fallback: () => [], validate: SafeStorage.validators.lists });
  assert.deepEqual(loaded, []);
  assert.equal(SafeStorage.getRecoverySummary().hasIssues, true);
});

test('a lists object instead of an array returns an empty array', () => {
  const storage = new FakeStorage({ dhcodex_lists: JSON.stringify({ bad: true }) });
  const loaded = SafeStorage.loadStoredJson(storage, 'dhcodex_lists', { fallback: () => [], validate: SafeStorage.validators.lists });
  assert.deepEqual(loaded, []);
});

test('an array of valid and invalid list entries preserves the valid ones', () => {
  const raw = [
    { id: 'list-valid', name: 'Valid List' },
    null,
    { id: 123, name: 'Invalid ID' },
    { id: 'missing-name' },
  ];
  const storage = new FakeStorage({ dhcodex_lists: JSON.stringify(raw) });
  const loaded = SafeStorage.loadStoredJson(storage, 'dhcodex_lists', { fallback: () => [], validate: SafeStorage.validators.lists });
  assert.deepEqual(loaded, [{ id: 'list-valid', name: 'Valid List' }]);
  const summary = SafeStorage.getRecoverySummary();
  assert.equal(summary.hasIssues, true);
  assert.equal(summary.backedUp, true);
  assert.equal(JSON.parse(storage.data.get(SafeStorage.backupKeyFor('dhcodex_lists'))).raw, JSON.stringify(raw));
});

/* ---------------- 9/10/11: envLists ---------------- */

function loadEnvLists(storage) {
  return SafeStorage.loadStoredJson(storage, 'dhcodex_env_lists', { fallback: () => ({}), validate: SafeStorage.validators.envLists });
}

test('valid envLists loads', () => {
  const envLists = { 'env-a': ['list-1'], 'env-b': ['list-1', 'list-2'] };
  const storage = new FakeStorage({ dhcodex_env_lists: JSON.stringify(envLists) });
  assert.deepEqual(loadEnvLists(storage), envLists);
  assert.equal(SafeStorage.getRecoverySummary().hasIssues, false);
});

test('envLists with an invalid top-level type returns an empty object', () => {
  const storage = new FakeStorage({ dhcodex_env_lists: '[' });
  assert.deepEqual(loadEnvLists(storage), {});
});

test('envLists with mixed valid and invalid membership values preserves valid memberships', () => {
  const raw = {
    'env-a': ['list-1', 'list-1', 42, null],
    'env-b': 'not-an-array',
    'env-c': [],
    __proto__: ['list-1'],
  };
  const storage = new FakeStorage({ dhcodex_env_lists: JSON.stringify(raw) });
  const loaded = loadEnvLists(storage);
  assert.deepEqual(loaded, { 'env-a': ['list-1'] });
  assert.equal(Object.getPrototypeOf(loaded), Object.prototype, 'must not have been prototype-polluted');
});

/* ---------------- 12/13: journey regions ---------------- */

function loadRegions(storage) {
  return SafeStorage.loadStoredJson(storage, 'dhcodex_journey_regions', { fallback: () => [], validate: SafeStorage.validators.journeyRegions });
}

const VALID_REGION = {
  id: 'reg-1', name: '', habitat: { rolls: [5] }, size: 7,
  encounter: { entries: [[3, 2]], combines: 0 }, terrain: 2, rumor: 40,
};

test('malformed journey regions JSON returns an empty array', () => {
  const storage = new FakeStorage({ dhcodex_journey_regions: 'not-json' });
  assert.deepEqual(loadRegions(storage), []);
});

test('invalid journey region entries are dropped individually', () => {
  const raw = [
    VALID_REGION,
    { id: 'reg-2', name: '', size: 4, terrain: 1, rumor: 1, encounter: { entries: [[1, 1]], combines: 0 } }, // no habitat
    { ...VALID_REGION, id: 'reg-3', encounter: { entries: null, combines: 0 } },
    'not-an-object',
  ];
  const storage = new FakeStorage({ dhcodex_journey_regions: JSON.stringify(raw) });
  const loaded = loadRegions(storage);
  assert.deepEqual(loaded, [VALID_REGION]);
  assert.equal(SafeStorage.getRecoverySummary().hasIssues, true);
});

/* ---------------- 14/15: journey sanctuaries ---------------- */

function loadSanctuaries(storage) {
  return SafeStorage.loadStoredJson(storage, 'dhcodex_journey_sanctuaries', { fallback: () => [], validate: SafeStorage.validators.journeySanctuaries });
}

const VALID_SANCTUARY = {
  id: 'san-1', name: 'Axedale', trade: 10, quirk: 4, crisis: 3, drive: 7,
  politics: { rolls: [2] }, size: 3, population: 2,
};

test('malformed journey sanctuaries JSON returns an empty array', () => {
  const storage = new FakeStorage({ dhcodex_journey_sanctuaries: '{"bad":true}' });
  assert.deepEqual(loadSanctuaries(storage), []);
});

test('invalid journey sanctuary entries are dropped individually', () => {
  const raw = [
    VALID_SANCTUARY,
    { ...VALID_SANCTUARY, id: 'san-2', politics: null },
    { ...VALID_SANCTUARY, id: 'san-3', politics: { rolls: 'nope' } },
    42,
  ];
  const storage = new FakeStorage({ dhcodex_journey_sanctuaries: JSON.stringify(raw) });
  const loaded = loadSanctuaries(storage);
  assert.deepEqual(loaded, [VALID_SANCTUARY]);
});

/* ---------------- 16/17/18: storage exceptions ---------------- */

test('a getItem() exception returns defaults rather than throwing', () => {
  const storage = new FakeStorage({ dhcodex_lists: '[]' }).throwFrom('getItem');
  assert.doesNotThrow(() => {
    const loaded = SafeStorage.loadStoredJson(storage, 'dhcodex_lists', { fallback: () => [], validate: SafeStorage.validators.lists });
    assert.deepEqual(loaded, []);
  });
  assert.equal(SafeStorage.getRecoverySummary().unavailable, true);
});

test('a backup write exception does not throw and still returns the safe value', () => {
  const storage = new FakeStorage({ dhcodex_lists: '{' }).throwFrom('setItem');
  assert.doesNotThrow(() => {
    const loaded = SafeStorage.loadStoredJson(storage, 'dhcodex_lists', { fallback: () => [], validate: SafeStorage.validators.lists });
    assert.deepEqual(loaded, []);
  });
  const summary = SafeStorage.getRecoverySummary();
  assert.equal(summary.items[0].backedUp, false);
  assert.equal(summary.items[0].repaired, false);
});

test('a repair write exception does not throw', () => {
  // setItem succeeds once (the backup) then throws — simulate by throwing on
  // every setItem after the first.
  const storage = new FakeStorage({ dhcodex_lists: '{' });
  let calls = 0;
  const realSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => { calls++; if (calls > 1) throw new Error('quota'); return realSetItem(key, value); };
  assert.doesNotThrow(() => {
    const loaded = SafeStorage.loadStoredJson(storage, 'dhcodex_lists', { fallback: () => [], validate: SafeStorage.validators.lists });
    assert.deepEqual(loaded, []);
  });
  const summary = SafeStorage.getRecoverySummary();
  assert.equal(summary.items[0].backedUp, true);
  assert.equal(summary.items[0].repaired, false);
});

/* ---------------- 19: independent keys ---------------- */

test('one corrupted key does not affect another valid key', () => {
  const storage = new FakeStorage({
    dhcodex_lists: '{',
    dhcodex_journey_sanctuaries: JSON.stringify([VALID_SANCTUARY]),
  });
  const lists = SafeStorage.loadStoredJson(storage, 'dhcodex_lists', { fallback: () => [], validate: SafeStorage.validators.lists });
  const sanctuaries = loadSanctuaries(storage);
  assert.deepEqual(lists, []);
  assert.deepEqual(sanctuaries, [VALID_SANCTUARY]);
});

/* ---------------- 20: no recovery records for valid data ---------------- */

test('valid values do not generate recovery records', () => {
  const storage = new FakeStorage({
    dhcodex_lists: JSON.stringify([{ id: 'list-1', name: 'Fine' }]),
    dhcodex_env_lists: JSON.stringify({ 'env-a': ['list-1'] }),
    dhcodex_journey_regions: JSON.stringify([VALID_REGION]),
    dhcodex_journey_sanctuaries: JSON.stringify([VALID_SANCTUARY]),
  });
  SafeStorage.loadStoredJson(storage, 'dhcodex_lists', { fallback: () => [], validate: SafeStorage.validators.lists });
  loadEnvLists(storage);
  loadRegions(storage);
  loadSanctuaries(storage);
  assert.equal(SafeStorage.getRecoverySummary().hasIssues, false);
});

/* ---------------- 21: at most one backup key per source key ---------------- */

test('recovery creates no more than one backup key per source key', () => {
  const storage = new FakeStorage({ dhcodex_lists: '{' });
  SafeStorage.loadStoredJson(storage, 'dhcodex_lists', { fallback: () => [], validate: SafeStorage.validators.lists });
  SafeStorage.resetRecoverySummary();
  // Corruption persists (repair only happens after a successful backup, and
  // here it did succeed, so simulate a second broken reload against a fresh
  // corrupt value under the same key).
  storage.data.set('dhcodex_lists', '[');
  SafeStorage.loadStoredJson(storage, 'dhcodex_lists', { fallback: () => [], validate: SafeStorage.validators.lists });
  const backupKeys = [...storage.data.keys()].filter(k => k.startsWith(SafeStorage.BACKUP_PREFIX));
  assert.deepEqual(backupKeys, [SafeStorage.backupKeyFor('dhcodex_lists')]);
});

/* ---------------- 22: localStorage.clear() is never called ---------------- */

test('no source file calls localStorage.clear()', () => {
  for (const rel of ['../js/app.js', '../js/safe-storage.js']) {
    const src = fs.readFileSync(path.join(__dirname, rel), 'utf8');
    assert.doesNotMatch(src, /localStorage\s*\.\s*clear\s*\(/, `${rel} must never call localStorage.clear()`);
  }
});

/* ---------------- static check: no raw JSON.parse(localStorage.getItem(...)) ---------------- */

test('js/app.js contains no direct JSON.parse(localStorage.getItem(...)) startup pattern', () => {
  const src = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  assert.doesNotMatch(
    src,
    /JSON\s*\.\s*parse\s*\(\s*localStorage\s*\.\s*getItem/,
    'startup state must be read through SafeStorage.loadStoredJson(), not a bare JSON.parse(localStorage.getItem(...))',
  );
});
