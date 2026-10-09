/* ============================================================
   Bacchus's Atlas — tests/prep-session-control.test.js
   The Prep header's session control (expand/collapse + active session +
   save status + one-time hint). Run with:

     node --test tests/prep-session-control.test.js

   The decisions (default mode, hint trigger, status kind) are pure functions
   in js/prep-utils.js and are tested directly. The wiring needs a DOM, which
   this repo doesn't have, so — like tests/prep-notes.test.js — the rest
   reads js/app.js, css/styles.css and data/i18n.json as text and asserts the
   structure that makes the behaviour true.
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PrepUtils = require('../js/prep-utils.js');

const ROOT = path.join(__dirname, '..');
const APP_JS = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
const I18N = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'i18n.json'), 'utf8'));

function fnSource(name) {
  const start = APP_JS.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `function ${name}() exists`);
  const rest = APP_JS.slice(start + 1);
  const next = rest.search(/\r?\n(?:function |const |let |\/\*)/);
  return APP_JS.slice(start, next === -1 ? undefined : start + 1 + next);
}

/* ---------------- popover state ---------------- */

test('the session popover always starts closed and its state is never persisted', () => {
  assert.match(fnSource('initPrepChrome'), /mode: 'compact'/);
  assert.doesNotMatch(APP_JS, /prepHeaderMode|dhcodex_session_prep_header_mode|storedPrepHeaderMode/);
  assert.doesNotMatch(fnSource('prepChromeSetMode'), /persistRaw/);
  assert.doesNotMatch(APP_JS, /innerWidth[^;]*(?:setMode|prepChromeSetMode)/, 'no viewport-driven mode change');
});

test('an open popover closes on Escape and on a press outside it, and when the route is left', () => {
  const set = fnSource('prepChromeSetMode');
  assert.match(set, /e\.key === 'Escape'/);
  assert.match(set, /closest\('#prep-bar, #sp-chrome-toggle'\)/);
  assert.match(set, /addEventListener\('pointerdown', c\.popOnPointer, true\)/);
  assert.match(set, /removeEventListener\('pointerdown', c\.popOnPointer, true\)/);
  assert.match(fnSource('destroyPrepChrome'), /prepChromeSetMode\('compact'\)/);
});

/* ---------------- toggle ---------------- */

test('clicking the control flips compact <-> expanded through prepChromeSetMode()', () => {
  const init = fnSource('initPrepChrome');
  assert.match(init, /addEventListener\('click'[\s\S]*prepChromeSetMode\(c\.mode === 'compact' \? 'expanded' : 'compact'\)/);
});

test('the control is one real <button> with aria-expanded / aria-controls and no nested buttons', () => {
  const init = fnSource('initPrepChrome');
  assert.match(init, /createElement\('button'\)/);
  assert.match(init, /type = 'button'/);
  const paint = fnSource('paintSessionControl');
  assert.match(paint, /setAttribute\('aria-expanded'/);
  assert.match(paint, /setAttribute\('aria-controls', 'prep-bar'\)/);
  assert.match(paint, /setAttribute\('aria-label'/);
  assert.doesNotMatch(paint, /<button/);
});

test('the standalone chevron in .header-actions is gone; the slot sits between brand and actions', () => {
  const init = fnSource('initPrepChrome');
  assert.match(init, /insertBefore\(c\.slotEl, headerActions\)/);
  assert.doesNotMatch(init, /headerActions\.appendChild/);
  assert.doesNotMatch(CSS, /\.header-actions::after/);
});

/* ---------------- active session / status ---------------- */

test('the title comes from activePrep() on every paint, never cached on the control', () => {
  const paint = fnSource('paintSessionControl');
  assert.match(paint, /prepDisplayTitle\(activePrep\(\)\)/);
  assert.doesNotMatch(APP_JS, /c\.title\b|chrome\.title\b/);
});

test('every path that changes the active prep, its name or save state repaints the control', () => {
  assert.match(fnSource('updateSaveStatusDisplay'), /paintSessionControl\(\)/);
  assert.match(fnSource('refreshPrepBarTitle'), /paintSessionControl\(\)/);
  assert.match(fnSource('setPrepNotes'), /paintSessionControl\(\)/);
  // switch / create / duplicate / delete all end in renderPrepPage(), which
  // ends in applyPrepChromeDom()
  assert.match(fnSource('applyPrepChromeDom'), /paintSessionControl\(\)/);
  assert.match(fnSource('renderPrepPage'), /applyPrepChromeDom\(\)/);
});

test('save status kinds: error > saving > ok > ready', () => {
  const at = new Date();
  assert.equal(PrepUtils.sessionSaveKind(true, true, at), 'error');
  assert.equal(PrepUtils.sessionSaveKind(false, true, at), 'saving');
  assert.equal(PrepUtils.sessionSaveKind(false, false, at), 'ok');
  assert.equal(PrepUtils.sessionSaveKind(false, false, null), 'ready');
});

test('the header reuses the existing save state instead of a second one', () => {
  const view = fnSource('sessionControlStatusView');
  assert.match(view, /state\.prepUI/);
  assert.match(view, /prepNotesDirty/);
  assert.doesNotMatch(APP_JS, /sessionSaveState|headerSaveState/);
});

/* ---------------- one-time hint ---------------- */

test('the hint is only for compact mode and only until it has been seen', () => {
  assert.equal(PrepUtils.shouldShowSessionHint('compact', false), true);
  assert.equal(PrepUtils.shouldShowSessionHint('compact', true), false);
  assert.equal(PrepUtils.shouldShowSessionHint('expanded', false), false);
});

test('the hint has its own persisted flag, dismisses on click/outside/Escape/timeout, and is out of flow', () => {
  assert.match(APP_JS, /prepSessionHintSeen: 'dhcodex_session_prep_hint_seen'/);
  assert.match(fnSource('dismissPrepSessionHint'), /persistRaw\(LS_KEYS\.prepSessionHintSeen, '1'\)/);
  const show = fnSource('showPrepSessionHint');
  assert.match(show, /addEventListener\('pointerdown'/);
  assert.match(show, /e\.key === 'Escape'/);
  assert.match(show, /setTimeout\(dismissPrepSessionHint, PREP_SESSION_HINT_MS\)/);
  assert.match(CSS, /\.sp-session-hint\s*\{[^}]*position:\s*absolute/);
  // first visit: the popover starts closed, so the hint is shown on creation
  assert.match(fnSource('initPrepChrome'), /shouldShowSessionHint\(c\.mode, storedPrepSessionHintSeen\(\)\)/);
  // opening the popover makes the hint redundant
  assert.match(fnSource('prepChromeSetMode'), /dismissPrepSessionHint\(\)/);
});

/* ---------------- responsive truncation ---------------- */

test('the control never wraps and truncates its title with an ellipsis', () => {
  assert.match(CSS, /\.sp-session-slot \{[^}]*min-width: 7\.5rem/);
  assert.match(CSS, /\.sp-session-control \{[^}]*white-space: nowrap/);
  assert.match(CSS, /\.sp-session-name \{[^}]*min-width: 0[^}]*overflow: hidden; text-overflow: ellipsis; white-space: nowrap/);
});

test('narrowing lowers the title max-width while the label stays visible', () => {
  const first = CSS.indexOf('@container sp-session (max-width: 270px)');
  const second = CSS.indexOf('@container sp-session (max-width: 190px)');
  assert.ok(first !== -1 && second > first);
  assert.doesNotMatch(CSS, /\.sp-session-label \{ display: none; \}/);
  assert.match(CSS.slice(first, second), /\.sp-session-name \{ max-width: 24ch; \}/);
  assert.match(CSS.slice(second, second + 120), /\.sp-session-name \{ max-width: 12ch; \}/);
});

/* ---------------- localization ---------------- */

const NEW_KEYS = [
  'prep_session_label', 'prep_session_expand', 'prep_session_collapse', 'prep_session_for',
  'prep_session_saved_at', 'prep_session_saving', 'prep_session_save_failed', 'prep_session_hint',
];

test('every session-control string exists in English and Russian', () => {
  const en = I18N.en || I18N.EN;
  const ru = I18N.ru || I18N.RU;
  for (const key of NEW_KEYS) {
    assert.ok(en[key], `en.${key}`);
    assert.ok(ru[key], `ru.${key}`);
  }
  assert.match(en.prep_session_saved_at, /\{time\}/);
  assert.match(ru.prep_session_saved_at, /\{time\}/);
  assert.equal(en.prep_session_hint, 'Session controls are available here.');
  assert.equal(ru.prep_session_hint, 'Управление сессией находится здесь.');
});

test('the accessible label is built from localized action + name, with the name left untranslated', () => {
  const paint = fnSource('paintSessionControl');
  assert.match(paint, /t\(compact \? 'prep_session_expand' : 'prep_session_collapse'\)/);
  assert.match(paint, /\$\{action\} \$\{t\('prep_session_for'\)\} \$\{name\}/);
});
