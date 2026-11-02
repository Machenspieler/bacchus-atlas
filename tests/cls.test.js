/* ============================================================
   Bacchus's Atlas — tests/cls.test.js
   scripts/lib/cls.js (Core Web Vitals session-window CLS) and the loading-shell
   footer contract that keeps a cold load from shifting
   (docs/research/my-lists-cls-investigation.md). Run: node --test tests/cls.test.js
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cls, sessionWindows, naiveSum } = require('../scripts/lib/cls');

const s = (startTime, value, hadRecentInput = false) => ({ startTime, value, hadRecentInput });

test('no shifts is a CLS of 0', () => assert.equal(cls([]), 0));

test('shifts within 1s gaps share a window and add up', () => {
  assert.ok(Math.abs(cls([s(0, 0.1), s(900, 0.1), s(1800, 0.1)]) - 0.3) < 1e-9);
});

test('a gap over one second starts a new window; CLS is the largest window, not the sum', () => {
  const e = [s(0, 0.2), s(3000, 0.1), s(3500, 0.15)];
  assert.equal(sessionWindows(e).length, 2);
  assert.ok(Math.abs(cls(e) - 0.25) < 1e-9);
  assert.ok(Math.abs(naiveSum(e) - 0.45) < 1e-9);
});

test('a window closes at five seconds even without a gap', () => {
  const e = [0, 900, 1800, 2700, 3600, 4500, 5400].map(t => s(t, 0.1));
  assert.equal(sessionWindows(e).length, 2);
  assert.ok(Math.abs(cls(e) - 0.6) < 1e-9);
});

test('shifts after recent user input never count', () => {
  assert.equal(cls([s(100, 0.5, true), s(200, 0.05)]), 0.05);
});

test('unsorted input is windowed in time order', () => {
  assert.ok(Math.abs(cls([s(900, 0.1), s(0, 0.1)]) - 0.2) < 1e-9);
});

/* The empty footer bar is 41px tall and, while the static shell is up, sits at the viewport bottom;
 * the first render pushes it out of view — the dominant cold-load shift. It stays out of flow
 * until finishInitialLoading() clears #main's aria-busy. */
test('footer stays out of flow while the loading shell is busy, and only then', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');
  assert.match(css, /#main\[aria-busy="true"\]\s*~\s*\.site-footer\s*\{\s*display:\s*none;\s*\}/);
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.indexOf('id="main"') < html.indexOf('id="footer"'), 'footer must be a later sibling of #main');
  assert.match(html, /<main class="shell" id="main"[^>]*aria-busy="true"/);
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  assert.match(app, /function finishInitialLoading\(\)\s*\{\s*document\.getElementById\('main'\)\.removeAttribute\('aria-busy'\)/);
  assert.match(app, /function failInitialLoading\(\)\s*\{\s*document\.getElementById\('main'\)\.setAttribute\('aria-busy', 'false'\)/);
});
