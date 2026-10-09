'use strict';
/* Journey: the toolbar lives at the top of the left side panel, the collapsed rail repeats it icon-only, and Player Preview is the same
 * screen with the same panel and camera (PD-040). Source guards only — the behaviour was verified in a real browser. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const view = read('js/journey2-view.js');
const css = read('css/journey2.css');
const html = read('index.html');
const surface = view.slice(view.indexOf('function buildSurface'), view.indexOf('<div class="j2-tip"'));
const side = surface.slice(surface.indexOf('<div class="j2-sidewrap"'), surface.indexOf('<div class="j2-rail"'));
const rail = surface.slice(surface.indexOf('<div class="j2-rail"'));

test('the toolbar strip above the map is gone; the controls are the first thing inside the side panel', () => {
  assert.doesNotMatch(surface, /class="j2-toolbar"/);
  assert.doesNotMatch(css, /\.j2-toolbar|is-wrapped|\.j2-tb-gm/);
  assert.ok(side.indexOf('class="j2-controls"') > 0 && side.indexOf('class="j2-controls"') < side.indexOf('class="j2-side-scroll"'));
  assert.ok(side.indexOf('data-j2-gen') > side.indexOf('class="j2-controls"') && side.indexOf('data-j2-stock-count') > side.indexOf('data-j2-gen'), 'toolbar, then New region, then Hex stock');
  assert.doesNotMatch(html, /sk-j2-bar/, 'the loading skeleton no longer draws a toolbar strip');
  assert.doesNotMatch(css, /sk-j2-bar/);
});

test('rows: Undo / Redo are icon-only; every other tool keeps its label', () => {
  for (const attr of ['data-j2-undo', 'data-j2-redo']) {
    const btn = side.match(new RegExp('<button[^>]*' + attr + '[^>]*>[^<]*(?:<svg|\\$\\{ICON)'));
    assert.ok(btn, attr + ' is an icon button');
    assert.doesNotMatch(btn[0], /data-t="/);
  }
  for (const key of ['journey2_fit', 'journey2_biome_label', 'journey2_preview"', 'journey2_route_plan', 'journey2_echo_locate', 'journey2_echo_place', 'journey2_echo_clear']) {
    assert.ok(side.includes('data-t="' + key.replace(/"$/, '') + '"'), key + ' keeps a visible label');
  }
  assert.match(side, /data-j2-sanc-generate-label/);
});

test('rail: one icon-only proxy per control, each with a source, the same data attribute and no visible label', () => {
  const keys = Array.from(rail.matchAll(/data-j2-rail-src="(\w+)"/g)).map(m => m[1]);
  assert.ok(keys.length >= 16);
  const table = view.slice(view.indexOf('const RAIL_SOURCES'), view.indexOf('let railProxies'));
  for (const k of keys) assert.ok(new RegExp('\\b' + k + ': \\(\\) =>').test(table), 'RAIL_SOURCES has ' + k);
  assert.doesNotMatch(rail, /data-t="journey2_(fit|biome_label|preview|route_plan|echo_locate|echo_place|echo_clear)/, 'no text in the rail');
  assert.match(view, /new MutationObserver\(syncRail\)/);
  const sync = view.slice(view.indexOf('function syncRail'), view.indexOf('function focusTool'));
  for (const part of ['el.hidden', 'el.disabled', 'aria-pressed', 'aria-disabled', "setAttribute('aria-label'", 'closest(\'[hidden]\')']) assert.ok(sync.includes(part), part);
  assert.match(view, /function focusTool\(src\)[\s\S]*sideCollapsed && railOf\.get\(src\)/, 'focus goes to the proxy while the panel is collapsed');
  assert.doesNotMatch(view, /ui\.(echoPlace|echoLocate|routePlan|sancGenerate|previewBack|previewBtn|printOpen)\.focus\(/, 'toolbar focus always goes through focusTool()');
});

test('Player Preview: the same panel, content swapped, camera shared, Fit inset unchanged', () => {
  const chrome = view.slice(view.indexOf('function applyPreviewChrome'), view.indexOf('function enterPreview'));
  assert.match(chrome, /ui\.gmControls\.hidden = on; ui\.gen\.hidden = on; ui\.sideScroll\.hidden = on; ui\.previewBar\.hidden = !on/);
  assert.doesNotMatch(chrome, /sidewrap\.(hidden|inert)/);
  assert.doesNotMatch(view, /previewReturn/);
  assert.match(view.slice(view.indexOf('function sideInset'), view.indexOf('/* ====', view.indexOf('function sideInset'))), /if \(!ui\.sidewrap\) return 0;/, 'the panel covers the same strip in both modes');
  assert.match(css, /\.j2\[data-mode="preview"\] \.j2-sidewrap \{ bottom: auto; \}/, 'in the preview the panel is only as tall as its content');
  const prev = side.slice(side.indexOf('data-j2-preview-bar'), side.indexOf('class="j2-side-scroll"'));
  for (const part of ['journey2_preview_hint', 'data-j2-fog-tool="paint"', 'data-j2-print-open', 'data-j2-preview-back']) assert.ok(prev.includes(part), part);
  assert.ok(side.indexOf('data-j2-history-group') < side.indexOf('data-j2-gm-controls') && side.indexOf('data-j2-gm-controls') < side.indexOf('data-j2-preview-bar'), 'row 1 is outside both mode blocks');
});
