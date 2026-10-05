/* ============================================================
   Bacchus's Atlas — tests/prep-notes.test.js
   Structural regression tests for the Prep "Session Notes" field. Run with:

     node --test tests/prep-notes.test.js

   The behaviour of the notes *data* (default, hydration, independence,
   persistence) is covered in tests/prep-utils.test.js and
   tests/storage.test.js. What lives here is the wiring that needs a DOM to
   observe directly — and this repo has none — so, like
   tests/loading-state.test.js, these read js/app.js, css/styles.css and
   data/i18n.json as plain text and assert the structure that makes the
   behaviour true (expanded-only rendering, localized strings, a flush before
   every lifecycle change, no keyboard handlers).
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const APP_JS = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const BP_JS = fs.readFileSync(path.join(ROOT, 'js', 'battle-points-ui.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
const I18N = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'i18n.json'), 'utf8'));

/** The source of one top-level `function name(` declaration, up to the next
 * top-level declaration or block comment. */
function fnSource(name) {
  const start = APP_JS.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `function ${name}() exists`);
  const rest = APP_JS.slice(start + 1);
  const next = rest.search(/\r?\n(?:function |const |let |\/\*)/);
  return APP_JS.slice(start, next === -1 ? undefined : start + 1 + next);
}

/* ---------------- expanded / collapsed ---------------- */

test('Session Notes render inside the Prep Bar, between the identity and the actions', () => {
  const bar = fnSource('prepBarHtml');
  const identity = bar.indexOf('class="prep-identity"');
  const notes = bar.indexOf('class="prep-notes"');
  const actions = bar.indexOf('class="prep-actions"');
  assert.ok(identity !== -1 && notes !== -1 && actions !== -1);
  assert.ok(identity < notes && notes < actions, 'DOM order is identity, notes, actions');
});

test('the textarea is labelled by a connected, visually hidden <label>, is two rows, and never autofocuses', () => {
  const bar = fnSource('prepBarHtml');
  assert.match(bar, /<label class="prep-notes-label sr-only" for="prep-notes-input">/);
  assert.match(bar, /<textarea class="prep-notes-input" id="prep-notes-input" rows="2"/);
  assert.doesNotMatch(bar, /autofocus/);
  assert.equal(fnSource('bindPrepBar').includes('notesInput.focus'), false);
});

test('collapsing hides the whole Prep Bar, which is the only place notes are rendered', () => {
  assert.match(
    CSS,
    /body\[data-route="prep"\]\[data-sp-header-mode="compact"\] \.prep-bar \{\s*display: none;\s*\}/,
  );
  // No other renderer — not the global header, not the collapse toggle that
  // stands in for the hidden bar — references notes.
  for (const fn of ['renderHeader', 'applyPrepChromeDom', 'initPrepChrome']) {
    assert.doesNotMatch(fnSource(fn), /notes/i, `${fn}() must not reference notes`);
  }
  const outsideBar = APP_JS.replace(fnSource('prepBarHtml'), '').replace(fnSource('bindPrepBar'), '');
  assert.doesNotMatch(outsideBar, /prep-notes/);
});

test('the notes field is plain text: fixed height, no manual resize, internal scroll', () => {
  const rule = CSS.match(/\.prep-notes-input \{[^}]*\}/)[0];
  assert.match(rule, /resize: none/);
  assert.match(rule, /overflow-y: auto/);
  assert.match(rule, /min-width: 0/);
});

test('the notes column flexes (minmax(0, 1fr)) between the identity and the actions', () => {
  const bar = CSS.match(/\n\.prep-bar \{[^}]*\}/)[0];
  assert.match(bar, /grid-template-columns: minmax\(300px, 340px\) minmax\(0, 1fr\) max-content/);
});

/* ---------------- value handling ---------------- */

test('the stored text is assigned via .value (markup would drop a leading newline)', () => {
  assert.match(fnSource('bindPrepBar'), /notesInput\.value = /);
  assert.match(fnSource('prepBarHtml'), /<\/textarea>/);
  assert.doesNotMatch(fnSource('prepBarHtml'), /<textarea[^>]*>[^<]+<\/textarea>/);
});

test('the field reads the active prep, and edits go through the pure id-targeted helper', () => {
  const bind = fnSource('bindPrepBar');
  assert.match(bind, /activePrep\(\)/);
  assert.match(bind, /\.notes \|\| ''/);
  assert.match(fnSource('setPrepNotes'), /PrepUtils\.setPrepNotes\(state\.prep, prep\.id, value\)/);
});

/* ---------------- autosave: nothing pending is ever lost ---------------- */

test('every prep lifecycle change drains a pending notes write first', () => {
  for (const fn of ['createPrep', 'switchPrep', 'duplicatePrep', 'deletePrep']) {
    const body = fnSource(fn);
    const flush = body.indexOf('flushPrepNotesSave()');
    assert.notEqual(flush, -1, `${fn}() flushes pending notes`);
    assert.ok(flush < body.indexOf('persist('), `${fn}() flushes before its own write`);
  }
});

test('collapsing, leaving the route and re-rendering the page also flush', () => {
  assert.match(fnSource('prepChromeSetMode'), /flushPrepNotesSave\(\)/);
  assert.match(fnSource('destroyPrepChrome'), /flushPrepNotesSave\(\)/);
  assert.match(fnSource('renderPrepPage'), /flushPrepNotesSave\(\)/);
});

test('blur, pagehide, beforeunload and a hidden tab all flush', () => {
  assert.match(fnSource('bindPrepBar'), /notesInput\.addEventListener\('blur', flushPrepNotesSave\)/);
  assert.match(APP_JS, /window\.addEventListener\('pagehide', flushPrepNotesSave\)/);
  assert.match(APP_JS, /window\.addEventListener\('beforeunload', flushPrepNotesSave\)/);
  assert.match(APP_JS, /visibilitychange[\s\S]{0,120}flushPrepNotesSave\(\)/);
});

test('notes reuse the one save-status line and persist through the Prep store key', () => {
  assert.match(
    fnSource('flushPrepNotesSave'),
    /updateSaveStatusDisplay\(persist\(LS_KEYS\.prep, state\.prep\)\)/,
  );
  assert.equal((APP_JS.match(/id="prep-save-status"/g) || []).length, 1);
});

test('duplicatePrep copies the source prep and does not overwrite notes', () => {
  const dup = fnSource('duplicatePrep');
  assert.match(dup, /Object\.assign\(\{\}, source, \{/);
  assert.doesNotMatch(dup, /notes:/);
});

/* ---------------- keyboard safety ---------------- */

test('the textarea binds only input and blur — no keydown/keyup/keypress handlers', () => {
  const bind = fnSource('bindPrepBar');
  const listeners = [...bind.matchAll(/notesInput\.addEventListener\('(\w+)'/g)].map(m => m[1]);
  assert.deepEqual(listeners.sort(), ['blur', 'input']);
});

test('no document-level shortcut acts on plain typing; Escape never touches notes', () => {
  assert.doesNotMatch(fnSource('setPrepNotes'), /Escape/);
  assert.doesNotMatch(fnSource('flushPrepNotesSave'), /Escape/);
  // The Battle Points handler only acts on Escape (popover open) or Enter in its own field.
  assert.match(BP_JS, /e\.key === 'Escape' && popover && !popover\.hidden/);
  assert.match(BP_JS, /e\.key === 'Enter' && e\.target\.matches && e\.target\.matches\('\[data-bp-pcs\]'\)/);
});

/* ---------------- localisation ---------------- */

test('Session Notes strings exist in both languages with the agreed wording', () => {
  assert.equal(I18N.en.prep_notes_label, 'Session Notes');
  assert.equal(I18N.en.prep_notes_placeholder, 'Session notes — reminders, triggers, key scenes…');
  assert.equal(I18N.ru.prep_notes_label, 'Заметки к сессии');
  assert.equal(I18N.ru.prep_notes_placeholder, 'Заметки к сессии — напоминания, триггеры, ключевые сцены…');
});

test('the label and placeholder are localized through t(), never hardcoded', () => {
  const bar = fnSource('prepBarHtml');
  assert.match(bar, /t\('prep_notes_label'\)/);
  assert.match(bar, /t\('prep_notes_placeholder'\)/);
  assert.doesNotMatch(bar, /Session Notes/);
});
