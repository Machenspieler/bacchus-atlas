'use strict';
/* Player page on a phone (PD-083): one family of bottom sheets (legend, Display, route details), the route summary docked above the bar, a compact
 * route-planning chip and Fit at the top. Source guards only — the layout was verified in a real browser; the camera is never touched by any of it. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const view = read('js/journey2-view.js');
const css = read('css/journey2.css');
const i18n = JSON.parse(read('data/i18n.json'));
const phone = css.slice(css.indexOf('/* a touch phone on the player page'), css.indexOf('/* narrower than that the free column'));
/** The declarations of one selector's rule inside the phone block (the first rule that starts with it). */
const rule = sel => { const at = phone.indexOf(sel + ' {'); assert.ok(at >= 0, 'rule ' + sel); return phone.slice(at, phone.indexOf('}', at)); };

test('the sheets share one anchor above the bar (and the docked summary) and one height cap that never reaches Fit', () => {
  assert.match(phone, /--j2-sheet-bottom: calc\(var\(--j2-bar-h\) \+ var\(--j2-side-gap\) \+ var\(--j2-dock-space\)\)/);
  assert.match(phone, /\.j2-stage:has\(\.j2-route-bub\) \{ --j2-dock-space/);
  for (const sel of ['.j2[data-player] .j2-side', '.j2[data-player] .j2-route', '.j2[data-player] .j2-camp .j2-menu']) assert.ok(rule(sel).includes('bottom: var(--j2-sheet-bottom)'), sel);
  assert.doesNotMatch(phone, /--j2-sheet-max:[^;]*calc\(100% /, 'a % would resolve against the rail, not the stage');
});

test('Fit sits at the top right, the route bubbles dock as a row, and nothing moves the camera', () => {
  assert.match(phone, /\.j2-mapbar \{[^}]*top: var\(--j2-side-gap\); bottom: auto/);
  assert.match(phone, /\.j2-route-bubbles \{[^}]*display: flex/);
  assert.match(phone, /\.j2-route-bub \{[^}]*transform: none !important/);
});

test('the planning chip is one row with a step badge and an icon-only cancel that keeps its accessible name', () => {
  assert.match(view, /data-j2-route-chip-step/);
  assert.match(view, /class="j2-route-cancel-txt" data-t="journey2_route_cancel"/);
  assert.match(phone, /\.j2-route-cancel-txt \{ position: absolute; width: 1px/);
  assert.match(view, /ui\.routeChipStep\.textContent = st\.status === 'select-start' \? 'A' : 'B'/);
});

test('the legend has a 44px close wired to the same fold, and the Display sheet a heading', () => {
  assert.match(view, /data-j2-legend-close data-t-aria="journey2_legend_close"/);
  assert.match(view, /b\.hasAttribute\('data-j2-legend-close'\)\) \{ if \(!sideCollapsed\) toggleSide\(\); \}/);
  assert.match(view, /j2-menu-h--sheet" role="presentation"><span data-t="journey2_rail_display"><\/span><button[^>]*data-j2-menu-close/);
  assert.ok(view.includes("b.hasAttribute('data-j2-menu-close')"));
  assert.ok(i18n.en.journey2_display_close && i18n.ru.journey2_display_close);
  assert.match(css, /\.j2-menu-h--sheet \{ display: none; \}/, 'hidden outside the phone sheet');
});

test('the terrain rows name the terrain, its days per hex and the hex count; every new key exists in EN and RU with the same placeholders', () => {
  for (const key of ['journey2_route_terrain_name', 'journey2_route_perhex', 'journey2_route_perhex_one', 'journey2_route_hexcount', 'journey2_route_hexcount_one', 'journey2_route_title_pl', 'journey2_legend_close']) {
    assert.ok(i18n.en[key] && i18n.ru[key], key);
    assert.deepEqual((i18n.en[key].match(/\{\w+\}/g) || []).sort(), (i18n.ru[key].match(/\{\w+\}/g) || []).sort(), key + ' placeholders');
  }
  assert.match(view, /fillN\('journey2_route_perhex', \{ n: n\(r\) \}, \[r\]\)/);
});

test('a short phone window (landscape) gets a slimmer bar and summary and sheets that leave the Fit column free', () => {
  const at = css.indexOf('@media (max-width: 640px) and (max-height: 480px)');
  assert.ok(at > 0);
  const block = css.slice(at, css.indexOf('\n}\n', at));
  assert.match(block, /--j2-bar-h: calc\(56px/);
  assert.match(block, /--j2-dock-h: 48px/);
  assert.match(block, /right: calc\(2 \* var\(--j2-side-gap\) \+ var\(--j2-fit-size\)\)/);
});

test('the docked route summary and the details sheet are one surface in two states (PD-083)', () => {
  assert.ok(view.includes("ui.root.setAttribute('data-route-panel', ui.route.hidden ? '' : 'open')"));
  assert.ok(phone.includes('[data-route-panel="open"] .j2-route-bubbles { display: none; }'));
  assert.ok(phone.includes('[data-route-panel="open"] .j2-stage:has(.j2-route-bub) { --j2-dock-space: 0px; }'));
  assert.ok(view.includes('if (!sideCollapsed && playerMode) closeMenus();'), 'the legend and a rail menu never stack');
});

test('the summary has no foreign full blue frame: the route colour is a left key and a finger tap leaves no ring', () => {
  assert.ok(phone.includes('.j2-route-bub:not(.is-selected) { border: 1px solid var(--line-strong); border-left: 4px solid var(--rc)'));
  assert.ok(phone.includes('.j2-route-bub:focus:not(:focus-visible) { outline: 0; }'));
});
