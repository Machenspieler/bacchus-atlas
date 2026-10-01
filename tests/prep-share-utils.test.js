/* ============================================================
   Bacchus's Atlas — tests/prep-share-utils.test.js
   Shareable Prep links: the pure codec (js/prep-share-utils.js) and the
   structural wiring in js/app.js, index.html and data/i18n.json. Run with:

     node --test tests/prep-share-utils.test.js
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PrepShareUtils = require('../js/prep-share-utils.js');

const ROOT = path.join(__dirname, '..');
const APP_JS = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const I18N = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'i18n.json'), 'utf8'));

function fnSource(name) {
  const start = APP_JS.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `function ${name}() exists`);
  const rest = APP_JS.slice(start + 1);
  const next = rest.search(/\r?\n(?:function |const |let |\/\*)/);
  return APP_JS.slice(start, next === -1 ? undefined : start + 1 + next);
}

const b64 = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value), 'utf8').toString('base64url');
const prepOf = over => Object.assign({
  id: 'local-id', title: '', notes: '', createdAt: 'x', updatedAt: 'y',
  environmentIds: [], adversaryIds: [], itemIds: [],
}, over);

/* ---------------- round-trips ---------------- */

test('an empty prep round-trips', () => {
  const r = PrepShareUtils.decodePrep(PrepShareUtils.encodePrep(prepOf()));
  assert.deepEqual(r, { ok: true, value: {
    version: 1, title: '', notes: '', environmentIds: [], adversaryIds: [], itemIds: [] } });
});

test('a full prep round-trips in stable order', () => {
  const prep = prepOf({ title: 'Heist', notes: 'a', environmentIds: ['e2', 'e1'], adversaryIds: ['z', 'a', 'm'], itemIds: ['i3', 'i1'] });
  const r = PrepShareUtils.decodePrep(PrepShareUtils.encodePrep(prep));
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.environmentIds, ['e2', 'e1']);
  assert.deepEqual(r.value.adversaryIds, ['z', 'a', 'm']);
  assert.deepEqual(r.value.itemIds, ['i3', 'i1']);
});

test('Russian, emoji, typographic punctuation and multiline notes survive', () => {
  const title = 'Тёмный лес «Атлас» 🐉';
  const notes = '  Заметки — “важно” …\n\n\tВторая строка 🎲\r\nтретья  \n';
  const r = PrepShareUtils.decodePrep(PrepShareUtils.encodePrep(prepOf({ title, notes })));
  assert.equal(r.value.title, title);
  assert.equal(r.value.notes, notes);
});

test('the encoded form is unpadded URL-safe Base64', () => {
  for (let n = 0; n < 12; n++) {
    const enc = PrepShareUtils.encodePrep(prepOf({ title: 'x'.repeat(n), notes: '??>>~~' }));
    assert.match(enc, /^[A-Za-z0-9_-]+$/);
  }
});

test('the payload carries only the shareable fields', () => {
  const enc = PrepShareUtils.encodePrep(prepOf({ id: 'secret-id', activeSessionId: 'a', title: 'T' }));
  const json = JSON.parse(Buffer.from(enc, 'base64url').toString('utf8'));
  assert.deepEqual(Object.keys(json).sort(), ['a', 'e', 'i', 'n', 't', 'v']);
});

test('long titles and notes are never silently truncated', () => {
  const title = 'T'.repeat(500);
  const notes = 'N'.repeat(5000);
  const r = PrepShareUtils.decodePrep(PrepShareUtils.encodePrep(prepOf({ title, notes })));
  assert.equal(r.value.title.length, 500);
  assert.equal(r.value.notes.length, 5000);
});

test('duplicate ids are normalized, keeping the first occurrence', () => {
  const r = PrepShareUtils.decodePrep(b64({ v: 1, t: '', n: '', e: ['a', 'b', 'a'], a: ['x', 'x'], i: ['q', 'r', 'q', 'r'] }));
  assert.deepEqual(r.value.environmentIds, ['a', 'b']);
  assert.deepEqual(r.value.adversaryIds, ['x']);
  assert.deepEqual(r.value.itemIds, ['q', 'r']);
});

/* ---------------- invalid input never throws ---------------- */

test('malformed Base64 is rejected', () => {
  for (const bad of ['', '!!!', 'abc$', 'a', 'abcde', 'ab==', null, undefined, 42, {}]) {
    assert.deepEqual(PrepShareUtils.decodePrep(bad), { ok: false, reason: 'invalid-base64' }, String(bad));
  }
});

test('invalid UTF-8 is rejected', () => {
  const enc = Buffer.from([0xff, 0xfe, 0xfd, 0x80]).toString('base64url');
  assert.deepEqual(PrepShareUtils.decodePrep(enc), { ok: false, reason: 'invalid-utf8' });
});

test('malformed JSON is rejected', () => {
  assert.deepEqual(PrepShareUtils.decodePrep(b64('{"v":1,')), { ok: false, reason: 'invalid-json' });
  assert.deepEqual(PrepShareUtils.decodePrep(b64('not json')), { ok: false, reason: 'invalid-json' });
});

test('non-object payloads are rejected', () => {
  for (const v of ['null', '[]', '5', '"str"']) {
    assert.equal(PrepShareUtils.decodePrep(b64(v)).ok, false, v);
  }
});

test('an unsupported or missing version is rejected', () => {
  const base = { t: '', n: '', e: [], a: [], i: [] };
  assert.equal(PrepShareUtils.decodePrep(b64({ ...base, v: 2 })).reason, 'unsupported-version');
  assert.equal(PrepShareUtils.decodePrep(b64({ ...base, v: '1' })).reason, 'unsupported-version');
  assert.equal(PrepShareUtils.decodePrep(b64(base)).reason, 'missing-field');
});

test('missing fields are rejected', () => {
  const full = { v: 1, t: '', n: '', e: [], a: [], i: [] };
  for (const key of ['t', 'n', 'e', 'a', 'i']) {
    const copy = { ...full };
    delete copy[key];
    assert.equal(PrepShareUtils.decodePrep(b64(copy)).reason, 'missing-field', key);
  }
});

test('incorrect value types are rejected', () => {
  const full = { v: 1, t: '', n: '', e: [], a: [], i: [] };
  const cases = [{ t: 5 }, { n: null }, { e: 'a' }, { a: {} }, { i: 3 },
    { e: ['ok', 7] }, { a: [null] }, { i: [['nested']] }, { e: [{}] }];
  for (const over of cases) {
    assert.equal(PrepShareUtils.decodePrep(b64({ ...full, ...over })).reason, 'invalid-type', JSON.stringify(over));
  }
});

test('oversized input is rejected before decoding', () => {
  const huge = 'A'.repeat(PrepShareUtils.MAX_ENCODED_LENGTH + 1);
  assert.deepEqual(PrepShareUtils.decodePrep(huge), { ok: false, reason: 'too-large' });
  const many = Array.from({ length: PrepShareUtils.MAX_IDS_PER_LIST + 1 }, (_, i) => 'i' + i);
  assert.equal(PrepShareUtils.decodePrep(b64({ v: 1, t: '', n: '', e: [], a: many, i: [] })).reason, 'too-large');
});

test('a __proto__ key in the payload is inert', () => {
  const r = PrepShareUtils.decodePrep(b64('{"v":1,"t":"","n":"","e":[],"a":[],"i":[],"__proto__":{"x":1}}'));
  assert.equal(r.ok, true);
  assert.equal(({}).x, undefined);
});

test('every link the app is allowed to build is within the decode limit', () => {
  assert.ok(PrepShareUtils.MAX_URL_LENGTH < PrepShareUtils.MAX_ENCODED_LENGTH);
});

/* ---------------- structural wiring ---------------- */

test('the Copy session link menu item sits between Copy summary and the separator', () => {
  const summary = APP_JS.indexOf('data-sp-menu-copy-summary>');
  const link = APP_JS.indexOf('data-sp-menu-copy-link>');
  const sep = APP_JS.indexOf('class="prep-menu-sep"', summary);
  assert.ok(summary !== -1 && link > summary && link < sep);
  assert.match(APP_JS.slice(link - 120, link + 160), /class="prep-menu-item" role="menuitem" tabindex="-1"[\s\S]*prep-menu-label[\s\S]*prep_copy_link/);
});

test('the actions menu click handler is bound to copyPrepShareLink()', () => {
  assert.match(APP_JS, /hasAttribute\('data-sp-menu-copy-link'\)\) copyPrepShareLink\(\)/);
});

test('copyPrepShareLink() flushes notes first, never touches the address, and reuses the clipboard strategy', () => {
  const src = fnSource('copyPrepShareLink');
  assert.ok(src.indexOf('flushPrepNotesSave()') < src.indexOf('activePrep()'));
  assert.match(src, /new URL\(location\.origin \+ location\.pathname\)/);
  assert.match(src, /searchParams\.set\('prep'/);
  assert.match(src, /url\.hash = '#\/prep'/);
  assert.doesNotMatch(src, /replaceState|location\.(href|hash)\s*=/);
  assert.match(src, /navigator\.clipboard\.writeText\(link\)[\s\S]*legacyCopy\(link, done, failed\)/);
  assert.match(src, /MAX_URL_LENGTH[\s\S]*prep_link_too_large/);
  assert.match(src, /prep_link_copied_with_notes/);
});

test('the share parameter is read only after the catalogues load, and again on catalogue retry', () => {
  const init = fnSource('init');
  assert.ok(init.indexOf('setPrepCatalog(prepData)') < init.indexOf('handleSharedPrepLink()'));
  assert.ok(init.indexOf('render();') < init.indexOf('handleSharedPrepLink()'));
  assert.match(fnSource('retryPrepCatalog'), /handleSharedPrepLink\(\)/);
});

test('the import dialog uses the overlay infrastructure and focuses Cancel', () => {
  const src = fnSource('openSharedPrepDialog');
  assert.match(src, /registerOverlay\(overlay, close\)/);
  assert.match(src, /data-sp-share-cancel\]'\)\.focus\(\)/);
  assert.match(src, /e\.target === overlay\) close\(\)/);
  assert.match(src, /pluralForm/);
});

test('every dialog outcome strips the prep parameter without a new history entry', () => {
  assert.match(fnSource('clearSharedPrepParam'), /searchParams\.delete\('prep'\)[\s\S]*history\.replaceState/);
  assert.doesNotMatch(fnSource('clearSharedPrepParam'), /pushState/);
  // close() is shared by Cancel, Escape, backdrop and confirm.
  assert.match(fnSource('openSharedPrepDialog'), /function close\(\) \{[\s\S]*clearSharedPrepParam\(\)/);
  assert.match(fnSource('handleSharedPrepLink'), /!decoded\.ok\) \{\s*clearSharedPrepParam\(\);[\s\S]*prep_share_invalid/);
});

test('an invalid link leaves state.prep untouched', () => {
  const src = fnSource('handleSharedPrepLink');
  const invalidBranch = src.slice(src.indexOf('!decoded.ok'), src.indexOf('openSharedPrepDialog('));
  assert.doesNotMatch(invalidBranch, /state\.prep\s*=|importSharedPrep|addPrep/);
});

test('import creates a fresh independent prep and persists once', () => {
  const src = fnSource('importSharedPrep');
  assert.match(src, /generatePrepId\(\)/);
  assert.match(src, /createDefaultPrep\(generatePrepId\(\), now\)/);
  assert.match(src, /PrepUtils\.addPrep\(state\.prep, prep\)/);
  assert.equal((src.match(/persist\(/g) || []).length, 1);
  assert.doesNotMatch(src, /\.trim\(\)/);
});

test('catalogue validation drops unknown ids and enforces the environment cap', () => {
  const src = fnSource('resolveSharedPrep');
  assert.match(src, /allEnvs\(\)/);
  assert.match(src, /prepCatalog\.adversaryById\.has/);
  assert.match(src, /prepCatalog\.itemIds/);
  assert.match(src, /MAX_ENVIRONMENTS/);
  assert.match(src, /PREP_TITLE_MAX/);
  assert.match(fnSource('openSharedPrepDialog'), /showToast\(t\('prep_share_imported'\)\)/);
  assert.match(APP_JS, /resolved\.omitted > 0\) showToast\(t\('prep_share_partial_import'\)/);
});

test('prep-share-utils.js loads before app.js with the UI cache marker', () => {
  const tag = '<script src="js/prep-share-utils.js" data-cache-version="ui"></script>';
  assert.ok(INDEX_HTML.includes(tag));
  assert.ok(INDEX_HTML.indexOf(tag) < INDEX_HTML.indexOf('<script src="js/app.js"'));
});

test('EN and RU dictionaries carry every share key', () => {
  const keys = ['prep_copy_link', 'prep_link_copied', 'prep_link_copied_with_notes', 'prep_link_copy_failed',
    'prep_link_too_large', 'prep_share_import_title', 'prep_share_import_body', 'prep_share_import_notes_included',
    'prep_share_import_explain', 'prep_share_import_confirm', 'prep_share_imported', 'prep_share_partial_import',
    'prep_share_invalid'];
  for (const k of keys) {
    assert.ok(I18N.en[k], `en.${k}`);
    assert.ok(I18N.ru[k], `ru.${k}`);
  }
  assert.deepEqual(Object.keys(I18N.en).sort(), Object.keys(I18N.ru).sort());
});
