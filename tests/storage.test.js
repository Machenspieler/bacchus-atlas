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

/* ---------------- 15b: Session Prep ---------------- */

function loadSessionPrep(storage) {
  return SafeStorage.loadStoredJson(storage, 'dhcodex_session_prep', {
    fallback: () => ({ schemaVersion: 1, activeSessionId: 'default', sessions: [{
      id: 'default', title: '', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      primaryEnvironmentId: null, environmentIds: [], adversaries: [], items: [],
    }] }),
    validate: SafeStorage.validators.sessionPrep,
  });
}

const VALID_SESSION_PREP = {
  schemaVersion: 1,
  activeSessionId: 'default',
  sessions: [{
    id: 'default', title: 'My Prep',
    createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-02T00:00:00.000Z',
    primaryEnvironmentId: 'ancient-grove', environmentIds: ['ancient-grove', 'harsh-desert'],
    adversaries: [{ id: 'cave-ogre', quantity: 2 }], items: [{ id: 'ci1', quantity: 1 }],
  }],
};

test('missing Session Prep storage returns a valid default preparation', () => {
  const storage = new FakeStorage();
  const loaded = loadSessionPrep(storage);
  assert.equal(loaded.schemaVersion, 1);
  assert.equal(loaded.activeSessionId, 'default');
  assert.equal(loaded.sessions.length, 1);
  assert.equal(loaded.sessions[0].environmentIds.length, 0);
});

test('a valid Session Prep preparation is preserved as-is', () => {
  const storage = new FakeStorage({ dhcodex_session_prep: JSON.stringify(VALID_SESSION_PREP) });
  const loaded = loadSessionPrep(storage);
  assert.deepEqual(loaded, VALID_SESSION_PREP);
  assert.equal(SafeStorage.getRecoverySummary().hasIssues, false);
});

test('invalid Session Prep JSON recovers to a safe default', () => {
  const storage = new FakeStorage({ dhcodex_session_prep: '{not-json' });
  const loaded = loadSessionPrep(storage);
  assert.equal(loaded.sessions[0].environmentIds.length, 0);
  assert.equal(SafeStorage.getRecoverySummary().hasIssues, true);
});

test('an invalid Session Prep top-level shape recovers to a safe default', () => {
  const storage = new FakeStorage({ dhcodex_session_prep: JSON.stringify([1, 2, 3]) });
  const loaded = loadSessionPrep(storage);
  assert.equal(loaded.sessions[0].environmentIds.length, 0);
});

test('an unsupported Session Prep schemaVersion recovers to a safe default', () => {
  const storage = new FakeStorage({ dhcodex_session_prep: JSON.stringify({ ...VALID_SESSION_PREP, schemaVersion: 2 }) });
  const loaded = loadSessionPrep(storage);
  assert.equal(loaded.sessions[0].environmentIds.length, 0);
});

test('a missing Session Prep sessions array recovers to a safe default', () => {
  const storage = new FakeStorage({ dhcodex_session_prep: JSON.stringify({ schemaVersion: 1, activeSessionId: 'default' }) });
  const loaded = loadSessionPrep(storage);
  assert.equal(loaded.sessions[0].environmentIds.length, 0);
});

test('an invalid Session Prep activeSessionId is repaired to an existing session', () => {
  const raw = { ...VALID_SESSION_PREP, activeSessionId: 'no-such-session' };
  const storage = new FakeStorage({ dhcodex_session_prep: JSON.stringify(raw) });
  const loaded = loadSessionPrep(storage);
  assert.equal(loaded.activeSessionId, 'default');
  assert.equal(SafeStorage.getRecoverySummary().hasIssues, true);
});

test('Session Prep environment selection is sanitized to at most three, deduplicated', () => {
  const raw = { ...VALID_SESSION_PREP, sessions: [{
    ...VALID_SESSION_PREP.sessions[0],
    environmentIds: ['a', 'a', 'b', 'c', 'd'],
    primaryEnvironmentId: 'a',
  }] };
  const storage = new FakeStorage({ dhcodex_session_prep: JSON.stringify(raw) });
  const loaded = loadSessionPrep(storage);
  assert.deepEqual(loaded.sessions[0].environmentIds, ['a', 'b', 'c']);
});

test('a Session Prep primary environment not present in environmentIds is repaired', () => {
  const raw = { ...VALID_SESSION_PREP, sessions: [{
    ...VALID_SESSION_PREP.sessions[0],
    environmentIds: ['ancient-grove'],
    primaryEnvironmentId: 'harsh-desert',
  }] };
  const storage = new FakeStorage({ dhcodex_session_prep: JSON.stringify(raw) });
  const loaded = loadSessionPrep(storage);
  assert.equal(loaded.sessions[0].primaryEnvironmentId, 'ancient-grove');
});

test('duplicate Session Prep adversary/item ids are deduplicated, keeping the first', () => {
  const raw = { ...VALID_SESSION_PREP, sessions: [{
    ...VALID_SESSION_PREP.sessions[0],
    adversaries: [{ id: 'cave-ogre', quantity: 2 }, { id: 'cave-ogre', quantity: 9 }],
    items: [{ id: 'ci1', quantity: 1 }, { id: 'ci1', quantity: 5 }],
  }] };
  const storage = new FakeStorage({ dhcodex_session_prep: JSON.stringify(raw) });
  const loaded = loadSessionPrep(storage);
  assert.deepEqual(loaded.sessions[0].adversaries, [{ id: 'cave-ogre', quantity: 2 }]);
  assert.deepEqual(loaded.sessions[0].items, [{ id: 'ci1', quantity: 1 }]);
});

test('Session Prep quantities are sanitized to integers within 1-99', () => {
  const raw = { ...VALID_SESSION_PREP, sessions: [{
    ...VALID_SESSION_PREP.sessions[0],
    adversaries: [{ id: 'a', quantity: 0 }, { id: 'b', quantity: 500 }, { id: 'c', quantity: 3.7 }, { id: 'd', quantity: 'nope' }],
    items: [],
  }] };
  const storage = new FakeStorage({ dhcodex_session_prep: JSON.stringify(raw) });
  const loaded = loadSessionPrep(storage);
  assert.deepEqual(loaded.sessions[0].adversaries, [
    { id: 'a', quantity: 1 }, { id: 'b', quantity: 99 }, { id: 'c', quantity: 4 }, { id: 'd', quantity: 1 },
  ]);
});

test('invalid nested Session Prep rows are dropped while valid rows are preserved', () => {
  const raw = { ...VALID_SESSION_PREP, sessions: [{
    ...VALID_SESSION_PREP.sessions[0],
    adversaries: [{ id: 'cave-ogre', quantity: 2 }, { quantity: 3 }, null, { id: 42, quantity: 1 }],
  }] };
  const storage = new FakeStorage({ dhcodex_session_prep: JSON.stringify(raw) });
  const loaded = loadSessionPrep(storage);
  assert.deepEqual(loaded.sessions[0].adversaries, [{ id: 'cave-ogre', quantity: 2 }]);
});

test('an invalid Session Prep title is repaired without dropping the session', () => {
  const raw = { ...VALID_SESSION_PREP, sessions: [{ ...VALID_SESSION_PREP.sessions[0], title: 42 }] };
  const storage = new FakeStorage({ dhcodex_session_prep: JSON.stringify(raw) });
  const loaded = loadSessionPrep(storage);
  assert.equal(loaded.sessions[0].title, '');
});

test('invalid Session Prep timestamps are repaired without dropping the session', () => {
  const raw = { ...VALID_SESSION_PREP, sessions: [{ ...VALID_SESSION_PREP.sessions[0], createdAt: 'not-a-date', updatedAt: null }] };
  const storage = new FakeStorage({ dhcodex_session_prep: JSON.stringify(raw) });
  const loaded = loadSessionPrep(storage);
  assert.equal(typeof loaded.sessions[0].createdAt, 'string');
  assert.ok(!isNaN(new Date(loaded.sessions[0].createdAt).getTime()));
});

test('a Session Prep read never throws even against thoroughly hostile input', () => {
  const hostile = [null, 42, 'x', [], { schemaVersion: 1 }, { schemaVersion: 1, sessions: 'nope' }];
  hostile.forEach(value => {
    const storage = new FakeStorage({ dhcodex_session_prep: JSON.stringify(value) });
    assert.doesNotThrow(() => loadSessionPrep(storage));
  });
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

/* ============================================================
   Write functions: writeJson / writeRaw / writeJsonBatch
   ============================================================ */

/* ---------------- writeJson ---------------- */

test('writeJson stores the exact JSON.stringify(value) format', () => {
  const storage = new FakeStorage();
  const value = [{ id: 'list-1', name: 'Coast' }];
  const result = SafeStorage.writeJson(storage, 'dhcodex_lists', value);
  assert.deepEqual(result, { ok: true });
  assert.equal(storage.data.get('dhcodex_lists'), JSON.stringify(value));
});

test('writeJson against null storage returns unavailable without throwing', () => {
  assert.doesNotThrow(() => {
    const result = SafeStorage.writeJson(null, 'dhcodex_lists', []);
    assert.deepEqual(result, { ok: false, reason: 'unavailable' });
  });
});

test('writeJson returns write-failed when setItem() throws, without throwing', () => {
  const storage = new FakeStorage().throwFrom('setItem');
  assert.doesNotThrow(() => {
    const result = SafeStorage.writeJson(storage, 'dhcodex_lists', []);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'write-failed');
  });
});

test('writeJson returns serialization-failed when JSON.stringify() throws', () => {
  const storage = new FakeStorage();
  const circular = {};
  circular.self = circular;
  const result = SafeStorage.writeJson(storage, 'dhcodex_lists', circular);
  assert.deepEqual(result, { ok: false, reason: 'serialization-failed' });
  assert.equal(storage.data.has('dhcodex_lists'), false, 'a failed serialization must not write anything');
});

test('writeJson treats a JSON.stringify() of undefined as a serialization failure', () => {
  const storage = new FakeStorage();
  const result = SafeStorage.writeJson(storage, 'dhcodex_lists', undefined);
  assert.deepEqual(result, { ok: false, reason: 'serialization-failed' });
  assert.equal(storage.data.has('dhcodex_lists'), false);
});

test('a failed write result never carries the value that was being written', () => {
  const storage = new FakeStorage().throwFrom('setItem');
  const result = SafeStorage.writeJson(storage, 'dhcodex_lists', [{ id: 'list-1', name: 'Secret Name' }]);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /Secret Name/);
});

/* ---------------- writeRaw ---------------- */

test('writeRaw stores the exact raw string', () => {
  const storage = new FakeStorage();
  const result = SafeStorage.writeRaw(storage, 'dhcodex_storage_notice_dismissed', '1');
  assert.deepEqual(result, { ok: true });
  assert.equal(storage.data.get('dhcodex_storage_notice_dismissed'), '1');
});

test('writeRaw against null storage returns unavailable without throwing', () => {
  assert.doesNotThrow(() => {
    const result = SafeStorage.writeRaw(null, 'dhcodex_storage_notice_dismissed', '1');
    assert.deepEqual(result, { ok: false, reason: 'unavailable' });
  });
});

test('writeRaw returns write-failed when setItem() throws, without throwing', () => {
  const storage = new FakeStorage().throwFrom('setItem');
  assert.doesNotThrow(() => {
    const result = SafeStorage.writeRaw(storage, 'dhcodex_storage_notice_dismissed', '1');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'write-failed');
  });
});

/* ---------------- writeJsonBatch ---------------- */

const BATCH_KEYS = ['dhcodex_lists', 'dhcodex_env_lists'];

test('a successful batch writes every entry', () => {
  const storage = new FakeStorage();
  const lists = [{ id: 'list-1', name: 'Coast' }];
  const envLists = { 'env-a': ['list-1'] };
  const result = SafeStorage.writeJsonBatch(storage, [
    { key: 'dhcodex_lists', value: lists },
    { key: 'dhcodex_env_lists', value: envLists },
  ]);
  assert.deepEqual(result, { ok: true });
  assert.equal(storage.data.get('dhcodex_lists'), JSON.stringify(lists));
  assert.equal(storage.data.get('dhcodex_env_lists'), JSON.stringify(envLists));
});

test('an empty batch is rejected safely', () => {
  const storage = new FakeStorage();
  assert.doesNotThrow(() => {
    const result = SafeStorage.writeJsonBatch(storage, []);
    assert.equal(result.ok, false);
  });
});

test('a batch against null storage returns unavailable without throwing', () => {
  assert.doesNotThrow(() => {
    const result = SafeStorage.writeJsonBatch(null, [{ key: 'dhcodex_lists', value: [] }]);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unavailable');
  });
});

test('a batch serialization failure writes nothing, not even the entry before it', () => {
  const storage = new FakeStorage({ dhcodex_lists: '[]' });
  const circular = {};
  circular.self = circular;
  const result = SafeStorage.writeJsonBatch(storage, [
    { key: 'dhcodex_lists', value: [{ id: 'list-1', name: 'Coast' }] },
    { key: 'dhcodex_env_lists', value: circular },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'serialization-failed');
  assert.equal(storage.data.get('dhcodex_lists'), '[]', 'the first entry must not have been written either');
  assert.equal(storage.data.has('dhcodex_env_lists'), false);
});

test('a batch snapshot failure (getItem throws) writes nothing', () => {
  const storage = new FakeStorage({ dhcodex_lists: '[]' }).throwFrom('getItem');
  const result = SafeStorage.writeJsonBatch(storage, [
    { key: 'dhcodex_lists', value: [] },
    { key: 'dhcodex_env_lists', value: {} },
  ]);
  assert.equal(result.ok, false);
  // FakeStorage.getItem() throws before any setItem() in this batch runs.
});

test('failure on the first batch write leaves previously stored values unchanged', () => {
  const storage = new FakeStorage({ dhcodex_lists: '[]', dhcodex_env_lists: '{}' });
  storage.setItem = (key) => { throw new Error('quota on ' + key); };
  const result = SafeStorage.writeJsonBatch(storage, [
    { key: 'dhcodex_lists', value: [{ id: 'list-1', name: 'Coast' }] },
    { key: 'dhcodex_env_lists', value: { 'env-a': ['list-1'] } },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.failedKey, 'dhcodex_lists');
  assert.equal(result.rollbackAttempted, true);
  assert.equal(result.rollbackSucceeded, true);
  assert.equal(storage.data.get('dhcodex_lists'), '[]');
  assert.equal(storage.data.get('dhcodex_env_lists'), '{}');
});

test('failure on a later batch write restores the keys already written by this batch', () => {
  const storage = new FakeStorage({ dhcodex_lists: '[]', dhcodex_env_lists: '{}' });
  let calls = 0;
  const realSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    calls++;
    if (calls === 2) throw new Error('quota on ' + key);
    return realSetItem(key, value);
  };
  const result = SafeStorage.writeJsonBatch(storage, [
    { key: 'dhcodex_lists', value: [{ id: 'list-1', name: 'Coast' }] },
    { key: 'dhcodex_env_lists', value: { 'env-a': ['list-1'] } },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.failedKey, 'dhcodex_env_lists');
  assert.equal(result.rollbackAttempted, true);
  assert.equal(result.rollbackSucceeded, true);
  assert.equal(storage.data.get('dhcodex_lists'), '[]', 'the earlier key in this batch must be restored');
  assert.equal(storage.data.get('dhcodex_env_lists'), '{}');
});

test('rollback removes a key that did not exist before the batch', () => {
  const storage = new FakeStorage({ dhcodex_lists: '[]' }); // dhcodex_env_lists never written before
  let calls = 0;
  const realSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    calls++;
    if (calls === 2) throw new Error('quota on ' + key);
    return realSetItem(key, value);
  };
  const result = SafeStorage.writeJsonBatch(storage, [
    { key: 'dhcodex_lists', value: [{ id: 'list-1', name: 'Coast' }] },
    { key: 'dhcodex_env_lists', value: { 'env-a': ['list-1'] } },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.rollbackSucceeded, true);
  assert.equal(storage.data.get('dhcodex_lists'), '[]', 'the pre-existing key must be restored to its exact previous value');
  assert.equal(storage.data.has('dhcodex_env_lists'), false, 'a key with no previous value must be removed by rollback');
});

test('a rollback setItem() failure is caught and reported, not thrown', () => {
  const storage = new FakeStorage({ dhcodex_lists: '[]', dhcodex_env_lists: '{}' });
  let calls = 0;
  const realSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    calls++;
    if (calls === 2) throw new Error('quota on ' + key); // second forward write fails
    if (calls === 3) throw new Error('rollback also fails'); // rollback of the first key fails
    return realSetItem(key, value);
  };
  assert.doesNotThrow(() => {
    const result = SafeStorage.writeJsonBatch(storage, [
      { key: 'dhcodex_lists', value: [{ id: 'list-1', name: 'Coast' }] },
      { key: 'dhcodex_env_lists', value: { 'env-a': ['list-1'] } },
    ]);
    assert.equal(result.ok, false);
    assert.equal(result.rollbackAttempted, true);
    assert.equal(result.rollbackSucceeded, false);
  });
});

test('a rollback removeItem() failure is caught and reported, not thrown', () => {
  const storage = new FakeStorage(); // neither key exists before the batch
  let setCalls = 0;
  const realSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    setCalls++;
    if (setCalls === 2) throw new Error('quota on ' + key);
    return realSetItem(key, value);
  };
  storage.removeItem = () => { throw new Error('removeItem boom'); };
  assert.doesNotThrow(() => {
    const result = SafeStorage.writeJsonBatch(storage, [
      { key: 'dhcodex_lists', value: [{ id: 'list-1', name: 'Coast' }] },
      { key: 'dhcodex_env_lists', value: { 'env-a': ['list-1'] } },
    ]);
    assert.equal(result.ok, false);
    assert.equal(result.rollbackAttempted, true);
    assert.equal(result.rollbackSucceeded, false);
  });
});

test('a failed batch result never carries previous or new raw values', () => {
  const storage = new FakeStorage({ dhcodex_lists: '[]', dhcodex_env_lists: '{}' });
  let calls = 0;
  const realSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    calls++;
    if (calls === 2) throw new Error('quota on ' + key);
    return realSetItem(key, value);
  };
  const result = SafeStorage.writeJsonBatch(storage, [
    { key: 'dhcodex_lists', value: [{ id: 'list-1', name: 'Secret Coast Name' }] },
    { key: 'dhcodex_env_lists', value: { 'env-a': ['list-1'] } },
  ]);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /Secret Coast Name/);
});

/* ---------------- getStorage(): readable-but-unwritable storage ---------------- */

test('getStorage() does not require a successful write probe, and reads still work when writes would fail', () => {
  const fake = new FakeStorage({ dhcodex_lists: JSON.stringify([{ id: 'list-1', name: 'Fine' }]) }).throwFrom('setItem');
  const originalWindow = global.window;
  global.window = { localStorage: fake };
  try {
    const storage = SafeStorage.getStorage();
    assert.equal(storage, fake, 'getStorage() must return the Storage object without probing it');
    const loaded = SafeStorage.loadStoredJson(storage, 'dhcodex_lists', { fallback: () => [], validate: SafeStorage.validators.lists });
    assert.deepEqual(loaded, [{ id: 'list-1', name: 'Fine' }], 'existing data must still be readable');
    const writeResult = SafeStorage.writeJson(storage, 'dhcodex_lists', []);
    assert.equal(writeResult.ok, false, 'the storage this session actually has is still unwritable');
  } finally {
    if (originalWindow === undefined) delete global.window;
    else global.window = originalWindow;
  }
});

/* ---------------- static checks: js/app.js never writes localStorage directly ---------------- */

test('js/app.js contains no direct localStorage.setItem()/removeItem() calls', () => {
  const src = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  assert.doesNotMatch(src, /localStorage\s*\.\s*setItem\s*\(/, 'writes must go through SafeStorage.writeJson/writeRaw/writeJsonBatch');
  assert.doesNotMatch(src, /localStorage\s*\.\s*removeItem\s*\(/, 'removals must go through SafeStorage');
});

test('the old unguarded persist() implementation is absent from js/app.js', () => {
  const src = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  assert.doesNotMatch(
    src,
    /function\s+persist\s*\([^)]*\)\s*\{\s*localStorage\.setItem/,
    'persist() must go through SafeStorage.writeJson(), not call localStorage.setItem() directly',
  );
});
