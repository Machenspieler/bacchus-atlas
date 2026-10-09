'use strict';
/* Journey side drawer UX pass (TASK-03 / PD-043). Source guards only; the behaviour was verified in a real browser. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const view = read('js/journey2-view.js');
const css = read('css/journey2.css');
const i18n = JSON.parse(read('data/i18n.json'));
const dicts = [i18n.en || {}, i18n.ru || {}].filter(d => Object.keys(d).length);

test('New region is one pinned row outside the scrolling stock (D4)', () => {
  const side = view.slice(view.indexOf('<aside class="j2-side"'), view.indexOf('<div class="j2-rail"'));
  assert.ok(side.indexOf('data-j2-gen') > side.indexOf('class="j2-controls"') && side.indexOf('data-j2-gen') < side.indexOf('class="j2-side-scroll"'));
  assert.doesNotMatch(side, /data-t="journey2_gen_title"/, 'no separate heading');
  assert.match(side, /data-j2-generate data-t-title="journey2_gen_hint" aria-describedby="j2-gen-desc"/);
  assert.doesNotMatch(view, /snapSideHeader/);
  assert.match(css, /\.j2-stock > \.j2-h--row \{ position: sticky; top: 0;/);
});

test('Hex stock count is the hexes left to place, the region total is its accessible name (D1)', () => {
  assert.match(view, /journey2_stock_left/);
  assert.match(view, /journey2_stock_count_aria', \{ r: n\(list\.length\), n: n\(left\) \}/);
  assert.match(view, /journey2_rail_count_aria', \{ r: n\(list\.length\), n: n\(left\) \}/);
});

test('inspect control is a quiet icon button with a magnifier, not the info glyph', () => {
  assert.match(view, /class="icon-btn j2-inspect"[^>]*>\$\{ICON\.inspect\}/);
  assert.doesNotMatch(view, /j2-inspect[^\n]*ICON\.info/);
});

test('Remove Echoes gets the danger treatment only on hover / focus (D2)', () => {
  assert.match(css, /\[data-j2-echo-clear\]:hover:not\(:disabled\)[^{]*\{ color: var\(--fear-soft\); border-color: var\(--fear\)/);
});

test('Player Preview: brush has a visible name and On/Off state, Back to GM sits with the mode flag, brush is not auto-armed (D5)', () => {
  const prev = view.slice(view.indexOf('data-j2-preview-bar'), view.indexOf('<form class="j2-gen"'));
  assert.ok(prev.indexOf('j2-preview-flag') < prev.indexOf('data-j2-preview-back') && prev.indexOf('data-j2-preview-back') < prev.indexOf('data-j2-fog-tool="paint"'));
  assert.match(prev, /journey2_fog_brush"/);
  assert.match(css, /\.j2-paint-tool\[aria-pressed="true"\] \.j2-paint-on/);
  assert.match(view.slice(view.indexOf('function enterPreview'), view.indexOf('function exitPreview')), /setFogTool\(null/);
});

test('finished collapsed cards are compact; done line and delete share one row', () => {
  assert.match(css, /\.j2-card\.is-exhausted:not\(\.is-active\) \.j2-card-sym \{[^}]*opacity: 0\.55/);
  assert.match(view, /<div class="j2-card-end">[\s\S]*?j2-done[\s\S]*?j2-card-foot/);
});

test('every new string exists in both languages', () => {
  const keys = ['journey2_stock_left', 'journey2_stock_all_placed', 'journey2_stock_count_aria', 'journey2_terrain_tip', 'journey2_fog_brush', 'journey2_fog_brush_on', 'journey2_fog_brush_off'];
  const flat = [i18n.en, i18n.ru].every(Boolean) ? [i18n.en, i18n.ru] : null;
  if (flat) { for (const d of flat) for (const k of keys) assert.ok(d[k], k); }
  else { for (const k of keys) assert.ok(JSON.stringify(i18n).split('"' + k + '"').length === 3, k + ' in en and ru'); }
});
