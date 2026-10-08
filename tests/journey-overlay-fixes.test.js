'use strict';
/* Audit 04 (Z-01 / Z-02 / Z-03): Journey overlay fixes. Source guards only — behaviour was verified in a real browser
 * (artifacts/journey-audit-04-overlays-zindex-fixes). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const view = read('js/journey2-view.js');
const css = read('css/styles.css');
const app = read('js/app.js');
const sb = read('js/soundboard-ui.js');

test('Z-01: Undo/Redo shortcuts are ignored while a modal overlay or confirm dialog is open', () => {
  const key = view.slice(view.indexOf('function onDocumentKey'), view.indexOf('function fogSpaceTarget'));
  const guard = key.indexOf("document.querySelector('dialog[open]') || document.querySelector('.modal-overlay')", key.indexOf("const k = e.key.toLowerCase()") - 400);
  assert.ok(guard > 0, 'a modal guard exists in the history-shortcut section');
  assert.ok(guard < key.indexOf('undo();'), 'the guard comes before undo()');
  assert.ok(guard < key.indexOf('redo();'), 'the guard comes before redo()');
});

test('Z-02: the docked × reserves a right-hand gutter in the body as well as the header', () => {
  assert.match(css, /\.modal--close-dock \.modal-body \{ padding-inline-end: calc\(var\(--s-6\) \+ var\(--s-4\) \+ 44px\); \}/);
  assert.match(css, /\.modal--close-dock \.modal-header \{ padding-inline-end: calc\(var\(--s-6\) \+ var\(--s-4\) \+ 44px\); \}/);
});

test('Z-03: opening a Journey environment card dismisses only the soundboard popover', () => {
  const reg = app.slice(app.indexOf('function registerOverlay'), app.indexOf('function onKeyDown', app.indexOf('function registerOverlay')));
  assert.match(reg, /overlayKind === 'detail' && state\.route\.name === 'journey'\) SoundboardUI\.dismissPanel\(\)/);
  assert.match(sb, /function dismissPanel\(\) \{ closePanel\(false\); \}/);
  assert.match(sb, /return \{ init, sync, syncFloat, triggerHtml, openPanelElement, dismissPanel \}/);
  const dismiss = sb.slice(sb.indexOf('function dismissPanel'), sb.indexOf('function firstSoundButton'));
  assert.doesNotMatch(dismiss, /engine\.|stop|savePrefs/, 'playback, volume and prefs are untouched');
});

test('Z-03: a reopened soundboard panel keeps clear of the docked ×', () => {
  assert.match(sb, /\.modal--close-dock \.modal-close/);
  assert.match(sb, /let left = /);
});
