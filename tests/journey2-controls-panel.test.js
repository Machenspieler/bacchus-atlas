'use strict';
/* Journey: the map tools live in an always-visible rail, the panel holds the title, the GM | Players segment, New region and the stock, history / zoom / Fit
 * float over the map, and the rare whole-campaign actions sit in the rail's Campaign menu (PD-057, which replaces the PD-040 toolbar). Player Preview is the same
 * screen with the same panel and camera. Source guards only — the behaviour was verified in a real browser. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const view = read('js/journey2-view.js');
const css = read('css/journey2.css');
const html = read('index.html');
const i18n = JSON.parse(read('data/i18n.json'));
const surface = view.slice(view.indexOf('function buildSurface'), view.indexOf('<div class="j2-tip"'));
const mapbar = surface.slice(surface.indexOf('<div class="j2-mapbar"'), surface.indexOf('<div class="j2-sidewrap"'));
const rail = surface.slice(surface.indexOf('<nav class="j2-rail"'), surface.indexOf('<aside class="j2-side"'));
const side = surface.slice(surface.indexOf('<aside class="j2-side"'));
const menu = rail.slice(rail.indexOf('data-j2-menu="campaign"'));
const displayMenu = rail.slice(rail.indexOf('data-j2-menu="display"'), rail.indexOf('data-j2-menu="campaign"'));
const fn = (from, to) => view.slice(view.indexOf('function ' + from), view.indexOf('function ' + to, view.indexOf('function ' + from) + 1));

test('the toolbar strip and the old row toolbar are gone; the panel is title, mode segment, preview note, New region, stock', () => {
  assert.doesNotMatch(surface, /class="j2-toolbar"|class="j2-controls"|j2-ctl-row/);
  assert.doesNotMatch(css, /\.j2-toolbar|is-wrapped|\.j2-tb-gm|\.j2-controls|\.j2-ctl-row|\.j2-ctl-gm|\.j2-ctl-party/);
  const order = ['class="j2-about"', 'class="j2-seg"', 'data-j2-preview-bar', 'data-j2-gen', 'class="j2-side-scroll"', 'data-j2-stock-count'].map(k => side.indexOf(k));
  assert.ok(order.every(i => i > 0) && order.every((x, i) => i === 0 || x > order[i - 1]), 'about, segment, preview note, New region, stock: ' + order);
  assert.doesNotMatch(html, /sk-j2-bar/, 'the loading skeleton no longer draws a toolbar strip');
  assert.doesNotMatch(css, /sk-j2-bar/);
});

test('rail: always visible, its buttons ARE the tools (no proxies), each with a one-word label and a shortcut key', () => {
  const tools = [['data-j2-party', 'journey2_party_btn', 'P'], ['data-j2-route-plan', 'journey2_rail_route', 'R'], ['data-j2-echo-locate', 'journey2_rail_locate', 'E'], ['data-j2-fog-tool="paint"', 'journey2_rail_brush', 'E']];
  for (const [attr, label, key] of tools) assert.match(rail, new RegExp("railBtn\\('" + attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "[^']*', LI\\.\\w+, '" + label + "', '" + key + "'\\)"), attr);
  for (const attr of ['data-j2-print-open', 'data-j2-share-link', 'data-j2-mode-toggle', 'data-j2-menu-btn="campaign"', 'data-j2-side-toggle']) assert.ok(rail.includes(attr), attr + ' is in the rail');
  assert.doesNotMatch(view, /data-j2-rail-src|RAIL_SOURCES|railProxies|railOf|function syncRail|new MutationObserver\(syncRail\)|ui\.rail\.inert/, 'no mirrored proxies: the state code writes to the real buttons');
  assert.doesNotMatch(css, /\.j2-rail-btn|\.j2-rail-zoom/);
  assert.match(css, /\.j2-rb-key \{ position: absolute;/, 'the shortcut is a keycap in the corner');
  assert.match(view, /aria-keyshortcuts/, 'and is exposed to assistive technology');
  assert.match(view, /function focusTool\(src\)[\s\S]*ui\.modeToggle[\s\S]*ui\.campBtn/, 'focus goes to the rail while the panel is collapsed or a menu item is gone');
  assert.doesNotMatch(view, /ui\.(echoPlace|echoLocate|routePlan|sancGenerate|previewBack|previewBtn|printOpen)\.focus\(/, 'toolbar focus always goes through focusTool()');
  assert.match(css, /\.j2-stage\[data-side="collapsed"\] \.j2-rail-stock:not\(\[hidden\]\)/, 'the stock count and the Players switch appear when the panel that shows them is collapsed');
  const sync = fn('syncSideToggle', 'ensureSideOpen');
  for (const part of ["'aria-expanded'", "'aria-label'", 'LI.panelOpen', 'LI.panelClose']) assert.ok(sync.includes(part), part);
});

test('map bar: Undo / Redo / zoom / Fit are icon-only buttons floating over the map, named by aria-label', () => {
  for (const attr of ['data-j2-undo', 'data-j2-redo', 'data-j2-zoom="out"', 'data-j2-zoom="reset"', 'data-j2-zoom="in"', 'data-j2-fit']) assert.ok(mapbar.includes(attr), attr);
  assert.doesNotMatch(mapbar, /<span data-t=/, 'no visible text labels');
  assert.match(mapbar, /data-j2-fit data-t-aria="journey2_fit"/);
  assert.match(css, /\.j2-mapbar \{\s*position: absolute;[^}]*left: var\(--j2-bar-left, var\(--j2-inset-left\)\)/, 'clear of the rail and the panel');
  assert.match(css, /\.j2-stage\[data-side="collapsed"\] \{ --j2-bar-left: var\(--j2-side-gap\); \}/, 'flush on the rail margin while the panel is folded');
});

test('Campaign menu: the rare whole-campaign actions, shared menu machinery, hidden in Player Preview', () => {
  for (const attr of ['data-j2-echo-place', 'data-j2-echo-clear', 'data-j2-sanc-generate', 'data-j2-sanc-generate-label']) assert.ok(menu.includes(attr), attr);
  assert.match(rail, /class="j2-menu-wrap j2-camp" data-j2-gm-row/);
  assert.match(fn('onRootClick', 'toggleMenu'), /data-j2-menu="campaign"[^\n]*closeMenus\(\)/, 'a Campaign action closes the menu; the Display switches live in their own menu and keep it open');
  for (const attr of ['data-j2-biome-colors', 'data-j2-sepia', 'data-j2-regions']) assert.ok(!menu.includes(attr), attr + ' is not a Campaign item any more');
});

test('Display menu (PD-066): Biome colors, Sepia map and Regions in their own rail menu, visible in the GM view, Player Preview and on the player page', () => {
  for (const attr of ['role="menuitemcheckbox" aria-checked="true" data-j2-biome-colors', 'role="menuitemcheckbox" aria-checked="true" data-j2-sepia', 'role="menuitemcheckbox" aria-checked="false" data-j2-regions']) assert.ok(displayMenu.includes(attr), attr);
  assert.match(rail, /class="j2-menu-wrap j2-camp j2-disp">\s*\$\{railBtn\('data-j2-menu-btn="display"/, 'a rail button of its own, with no GM-row marker: nothing hides it in a mode');
  assert.doesNotMatch(rail.slice(rail.indexOf('j2-disp'), rail.indexOf('data-j2-gm-row')), /data-j2-gm-row/);
  for (const key of ['journey2_rail_display', 'journey2_display_aria']) for (const lang of Object.keys(i18n)) if (i18n[lang] && i18n[lang].journey2_rail_campaign) assert.ok(i18n[lang][key], lang + ' ' + key);
  assert.match(css, /\.j2\[data-player\] \.j2-camp \.j2-menu \{[^}]*bottom: calc\(100% \+ var\(--s-2\)\)/, 'on the phone bar the menu opens upward');
});

test('Player Preview: the same panel, content swapped, camera shared, Fit inset unchanged', () => {
  const chrome = fn('applyPreviewChrome', 'enterPreview');
  assert.match(chrome, /ui\.gen\.hidden = on; ui\.sideScroll\.hidden = on; ui\.previewBar\.hidden = !on \|\| playerMode/);   // the Route Planner and the party marker stay in both modes (PD-052); the GM-only rows are hidden one by one
  assert.match(chrome, /ui\.previewBack\.setAttribute\('aria-pressed', String\(!on\)\)/);
  assert.match(chrome, /ui\.previewBtn\.setAttribute\('aria-pressed', String\(on\)\)/);
  assert.doesNotMatch(chrome, /sidewrap\.(hidden|inert)/);
  assert.doesNotMatch(view, /previewReturn/);
  assert.match(view.slice(view.indexOf('function sideInset'), view.indexOf('/* ====', view.indexOf('function sideInset'))), /if \(!ui\.sidewrap\) return 0;/, 'the panel covers the same strip in both modes');
  assert.match(css, /\.j2\[data-mode="preview"\] \.j2-side \{ align-self: flex-start; \}/, 'in the preview the panel is only as tall as its content');
  const prev = side.slice(side.indexOf('data-j2-preview-bar'), side.indexOf('<form class="j2-gen"'));
  for (const part of ['journey2_preview_hint', 'j2-mouse-pair', 'data-j2-share-out']) assert.ok(prev.includes(part), part);
  assert.doesNotMatch(prev, /data-j2-fog-tool|data-j2-print-open|data-j2-preview-back/, 'the brush, Outline / Print / Link and the way back are rail / segment controls');
  assert.ok(side.indexOf('data-j2-preview-back') < side.indexOf('data-j2-preview aria-pressed'), 'GM first, Players second');
});

test('shortcuts: by physical key (they work on a Russian layout), never Tab, and only through the rail buttons', () => {
  const hk = fn('onToolHotkey', 'fogSpaceTarget');
  for (const code of ['KeyP', 'KeyR', 'KeyE', 'KeyV', 'BracketLeft']) assert.ok(hk.includes("'" + code + "'"), code);
  assert.doesNotMatch(hk, /e\.key|Tab/);
  assert.match(hk, /b\.click\(\)/, 'one path: the same guards as a click');
  assert.match(view, /isEditableTarget\(e\.target\) \|\| e\.defaultPrevented\) return;\n\s*if \(!\(e\.ctrlKey \|\| e\.metaKey \|\| e\.altKey \|\| e\.shiftKey \|\| e\.repeat\) && onToolHotkey\(e\)\) return;/, 'not while typing, not with a modifier');
});

test('every new rail / segment / menu string exists in English and Russian', () => {
  const keys = ['journey2_mapbar_label', 'journey2_rail_tools', 'journey2_rail_share', 'journey2_rail_route', 'journey2_rail_locate', 'journey2_rail_brush', 'journey2_rail_outline', 'journey2_rail_print', 'journey2_rail_link',
    'journey2_rail_campaign', 'journey2_campaign_aria', 'journey2_rail_display', 'journey2_display_aria', 'journey2_menu_echo_place', 'journey2_mode_label', 'journey2_mode_gm', 'journey2_mode_players'];
  for (const k of keys) { assert.ok(i18n.en[k], 'en ' + k); assert.ok(i18n.ru[k], 'ru ' + k); assert.ok(view.includes("'" + k + "'") || view.includes('"' + k + '"'), 'used ' + k); }
});

test('Party marker display switch (PD-069): a Display item on the player page only; hides the drawn star, nothing else', () => {
  assert.match(displayMenu, /role="menuitemcheckbox" aria-checked="true" data-j2-party-mark hidden/, 'hidden until the player page un-hides it');
  assert.match(view, /ui\.partyMark\.hidden = !playerMode/);
  assert.match(fn('paintPartyMarker', 'renderParty'), /showPartyMark \|\| !playerMode/, 'the GM view and Player Preview always draw the star');
  assert.doesNotMatch(fn('togglePartyMark', 'toggleBiomeColors'), /saveUiPrefs|dispatch|store/, 'no storage, no command, no history');
  for (const key of ['journey2_party_mark_label', 'journey2_party_mark_show', 'journey2_party_mark_hide']) for (const lang of Object.keys(i18n)) if (i18n[lang] && i18n[lang].journey2_rail_campaign) assert.ok(i18n[lang][key], lang + ' ' + key);
});
