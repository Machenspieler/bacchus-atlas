/* ============================================================
   Bacchus's Atlas — tests/list-rename.test.js
   Dependency-free regression tests for list-name validation (see the
   "Lists validation" section in CLAUDE.md). Run with:

     node --test tests/list-rename.test.js

   ListUtils is pure (no DOM, no application state, no i18n, no
   persistence), so it's exercised directly here with plain strings — no
   jsdom or other browser-emulation dependency needed. A second block
   inspects js/app.js and index.html as plain text (the same static-source
   style as tests/loading-state.test.js) to guard the markup and the
   removal of the old silent rename pattern, since app.js isn't itself a
   requirable module.
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ListUtils = require('../js/list-utils.js');
const { normalizeName, resolveListRename } = ListUtils;

const ROOT = path.join(__dirname, '..');
const APP_JS = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const I18N = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'i18n.json'), 'utf8'));

/* ---------------- resolveListRename: invalid ---------------- */

test('empty string is invalid', () => {
  const r = resolveListRename('My List', '');
  assert.equal(r.status, 'invalid');
  assert.equal(r.value, 'My List');
});

test('spaces-only string is invalid', () => {
  const r = resolveListRename('My List', '     ');
  assert.equal(r.status, 'invalid');
  assert.equal(r.value, 'My List');
});

test('tabs/newlines-only string is invalid', () => {
  const r = resolveListRename('My List', '\t\n  \n');
  assert.equal(r.status, 'invalid');
  assert.equal(r.value, 'My List');
});

test('an invalid rename returns the current committed name, not the raw value', () => {
  const r = resolveListRename('Old Name', '   ');
  assert.equal(r.value, 'Old Name');
  assert.notEqual(r.value, '   ');
});

/* ---------------- resolveListRename: changed ---------------- */

test('a valid new name is trimmed', () => {
  const r = resolveListRename('My List', '  New Name  ');
  assert.equal(r.value, 'New Name');
});

test('a valid new name returns "changed" status', () => {
  const r = resolveListRename('My List', 'New Name');
  assert.equal(r.status, 'changed');
});

/* ---------------- resolveListRename: unchanged ---------------- */

test('the current name with surrounding whitespace returns "unchanged"', () => {
  const r = resolveListRename('My List', '  My List  ');
  assert.equal(r.status, 'unchanged');
  assert.equal(r.value, 'My List');
});

test('the exact current name returns "unchanged"', () => {
  const r = resolveListRename('My List', 'My List');
  assert.equal(r.status, 'unchanged');
});

/* ---------------- content preservation ---------------- */

test('Unicode names are preserved', () => {
  const r = resolveListRename('My List', '  Мой список 🗺️  ');
  assert.equal(r.status, 'changed');
  assert.equal(r.value, 'Мой список 🗺️');
});

test('punctuation is preserved', () => {
  const r = resolveListRename('My List', "  Bob's \"Favorites\" — pt. 2!  ");
  assert.equal(r.status, 'changed');
  assert.equal(r.value, "Bob's \"Favorites\" — pt. 2!");
});

test('duplicate names are not rejected — resolveListRename has no notion of other lists', () => {
  const r = resolveListRename('My List', 'Some Other Existing List Name');
  assert.equal(r.status, 'changed');
  assert.equal(r.value, 'Some Other Existing List Name');
});

test('no maximum length is imposed', () => {
  const long = 'x'.repeat(5000);
  const r = resolveListRename('My List', long);
  assert.equal(r.status, 'changed');
  assert.equal(r.value, long);
});

/* ---------------- purity ---------------- */

test('resolveListRename does not mutate its string inputs', () => {
  const currentName = 'My List';
  const rawValue = '  My List  ';
  resolveListRename(currentName, rawValue);
  assert.equal(currentName, 'My List');
  assert.equal(rawValue, '  My List  ');
});

test('resolveListRename does not access browser globals', () => {
  assert.equal(/\bwindow\b|\bdocument\b|\blocalStorage\b/.test(ListUtils.resolveListRename.toString()), false);
});

test('resolveListRename does not call any persistence function', () => {
  assert.equal(/persist/i.test(ListUtils.resolveListRename.toString()), false);
});

test('resolveListRename does not use i18n (no translation lookups)', () => {
  assert.equal(/\bt\(|i18n/.test(ListUtils.resolveListRename.toString()), false);
});

/* ---------------- normalizeName ---------------- */

test('normalizeName trims like resolveListRename', () => {
  assert.equal(normalizeName('  Trip Log  '), 'Trip Log');
});

test('normalizeName treats null/undefined as empty', () => {
  assert.equal(normalizeName(null), '');
  assert.equal(normalizeName(undefined), '');
});

/* ---------------- static source: the old silent pattern is gone ---------------- */

test('the old silent "if (list && input.value.trim())" rename pattern is absent from app.js', () => {
  assert.equal(/if\s*\(\s*list\s*&&\s*input\.value\.trim\(\)\s*\)/.test(APP_JS), false);
});

test('app.js routes list renaming through ListUtils.resolveListRename', () => {
  assert.match(APP_JS, /ListUtils\.resolveListRename\(/);
});

test('app.js reuses the shared normalizer for list creation and Add to List', () => {
  assert.match(APP_JS, /ListUtils\.normalizeName\(newListInput\.value\)/);
  assert.match(APP_JS, /ListUtils\.normalizeName\(newInput\.value\)/);
});

/* ---------------- static source: per-card rename markup ---------------- */

const listCardHtmlStart = APP_JS.indexOf('function listCardHtml(list)');
assert.ok(listCardHtmlStart !== -1, 'fixture assumption: js/app.js defines listCardHtml(list)');
const listCardHtmlEnd = APP_JS.indexOf('\n}', listCardHtmlStart);
const LIST_CARD_HTML_SRC = APP_JS.slice(listCardHtmlStart, listCardHtmlEnd);

test('each list card renders its own hidden rename-error element', () => {
  assert.match(LIST_CARD_HTML_SRC, /class="field-error list-rename-error"/);
  assert.match(LIST_CARD_HTML_SRC, /\bhidden\b/);
  assert.match(LIST_CARD_HTML_SRC, /role="alert"/);
});

test('the rename error id is derived from the list id, not the list name', () => {
  assert.match(LIST_CARD_HTML_SRC, /list-rename-error-['"`]\s*\+\s*list\.id/);
  assert.doesNotMatch(LIST_CARD_HTML_SRC, /list-rename-error-['"`]\s*\+\s*list\.name/);
});

test('the rename input is associated with its own error via aria-describedby', () => {
  assert.match(LIST_CARD_HTML_SRC, /class="list-rename"[^>]*aria-describedby="\$\{errorId\}"/);
});

test('the rename input uses a dedicated rename label, not "New list name"', () => {
  assert.match(LIST_CARD_HTML_SRC, /class="list-rename"[^>]*aria-label="\$\{t\('rename_list_label'\)\}"/);
  assert.doesNotMatch(LIST_CARD_HTML_SRC, /class="list-rename"[^>]*aria-label="\$\{t\('new_list_name'\)\}"/);
});

test('the rename error text uses the new list_rename_required key', () => {
  assert.match(LIST_CARD_HTML_SRC, /t\('list_rename_required'\)/);
});

/* ---------------- static source: rename lifecycle helpers ---------------- */

test('app.js defines the rename error lifecycle helpers', () => {
  assert.match(APP_JS, /function showRenameError\(/);
  assert.match(APP_JS, /function clearRenameError\(/);
  assert.match(APP_JS, /function restoreCommittedName\(/);
  assert.match(APP_JS, /function bindListRename\(/);
});

test('Escape handling in bindListRename restores the committed name and does not persist', () => {
  const bindStart = APP_JS.indexOf('function bindListRename(');
  const bindEnd = APP_JS.indexOf('\n}', bindStart);
  const src = APP_JS.slice(bindStart, bindEnd);
  const escapeBranch = src.slice(src.indexOf("'Escape'"));
  assert.match(escapeBranch, /restoreCommittedName\(/);
  assert.doesNotMatch(escapeBranch, /persist\(/);
});

/* ---------------- i18n: new keys ---------------- */

test('list_rename_required exists in both en and ru with the expected meaning', () => {
  assert.ok(I18N.en.list_rename_required);
  assert.ok(I18N.ru.list_rename_required);
  assert.match(I18N.en.list_rename_required, /empty/i);
  assert.match(I18N.en.list_rename_required, /restored|previous/i);
});

test('rename_list_label exists in both en and ru and is not "New list name"', () => {
  assert.ok(I18N.en.rename_list_label);
  assert.ok(I18N.ru.rename_list_label);
  assert.notEqual(I18N.en.rename_list_label, I18N.en.new_list_name);
});

test('the new i18n keys have no placeholders (parity is trivially satisfied)', () => {
  assert.equal(/\{[a-zA-Z]+\}/.test(I18N.en.list_rename_required), false);
  assert.equal(/\{[a-zA-Z]+\}/.test(I18N.en.rename_list_label), false);
});

/* ---------------- index.html: new browser utility file wiring ---------------- */

test('index.html loads js/list-utils.js before js/app.js with the cache-version marker', () => {
  const listUtilsIdx = INDEX_HTML.indexOf('src="js/list-utils.js"');
  const appJsIdx = INDEX_HTML.indexOf('src="js/app.js"');
  assert.ok(listUtilsIdx !== -1, 'js/list-utils.js is not referenced in index.html');
  assert.ok(appJsIdx !== -1);
  assert.ok(listUtilsIdx < appJsIdx, 'js/list-utils.js must load before js/app.js');
  const tagStart = INDEX_HTML.lastIndexOf('<script', listUtilsIdx);
  const tagEnd = INDEX_HTML.indexOf('</script>', listUtilsIdx);
  assert.match(INDEX_HTML.slice(tagStart, tagEnd), /data-cache-version="ui"/);
});
