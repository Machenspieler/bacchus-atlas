'use strict';
/* Journey: the read-only player page (#/map/<link>, PD-052) — routing, wiring and isolation guards. Pure source / data checks; the pointer, touch and layout
   behaviour is verified in a real browser (docs/manual-qa.md "Shareable player link"). The codec itself is in tests/journey2-share.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const RouteUtils = require('../js/route-utils.js');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const view = read('js/journey2-view.js');
const app = read('js/app.js');
const i18n = JSON.parse(read('data/i18n.json'));
const fn = (from, to) => view.slice(view.indexOf('function ' + from), view.indexOf('function ' + to, view.indexOf('function ' + from) + 1));

/* ---------------- routing ---------------- */

test('routing: #/map/<link> is its own route; the payload survives untouched and never carries an environment overlay', () => {
  const link = '1.Y52s1i_IgAMo4JLAC1jI0jXQwAFC8YDJA4xgSgIixjRgjho-4A87i6CqBTcDExMTEysTKxsDozi7U2lRuq6hGaM2AA';
  const p = RouteUtils.parseRouteHash('#/map/' + link);
  assert.deepEqual(p.route, { name: 'playermap', id: link, env: null });
  assert.equal(p.malformed, false); assert.equal(p.canonicalHash, null);
  assert.equal(RouteUtils.routeToHash(p.route), '#/map/' + link, 'round-trips');
  assert.equal(RouteUtils.baseHash({ name: 'playermap', id: link }), '#/map/' + link);
  assert.deepEqual(RouteUtils.parseRouteHash('#/map/1.x/env/foo').route, { name: 'playermap', id: '1.x', env: null }, 'a card suffix is dropped, never applied');
  assert.deepEqual(RouteUtils.parseRouteHash('#/map/').route, { name: 'playermap', id: '', env: null }, 'a missing link is the page\'s own error, not the catalogue');
});

test('routing: a malformed percent-escape falls back to an empty link and repairs the address, never throwing', () => {
  const p = RouteUtils.parseRouteHash('#/map/%E0%A4%A');
  assert.deepEqual(p.route, { name: 'playermap', id: '', env: null });
  assert.equal(p.malformed, true); assert.equal(p.canonicalHash, '#/map/');
  for (const other of ['#/journey', '#/lists', '#/prep', '', '#/mapx']) assert.notEqual(RouteUtils.parseRouteHash(other).route.name, 'playermap', other);
});

/* ---------------- isolation and read-only ---------------- */

test('isolation: the player page is mounted with NO storage and NO generator, and the view builds its store without one', () => {
  const page = app.slice(app.indexOf('function renderPlayerMapPage()'), app.indexOf('/** The environments a Journey 2 region card lists'));
  assert.match(page, /storage: null/);
  assert.match(page, /generator: null/);
  assert.match(page, /player: \{\s*link: state\.route\.id \|\| ''/);
  assert.match(page, /onOpened: snap => \{\s*if \(linkLangOffered \|\| langWasStored/, 'the language in a link is only a default for a reader who never chose one');
  assert.doesNotMatch(strip(page), /persist\(LS_KEYS\.lang/, 'and it is never saved on behalf of the reader');
  assert.doesNotMatch(strip(page), /lsStorage|localStorage|persist\(|SafeStorage/);
  assert.match(fn('initDocument', 'persist'), /if \(playerMode\) \{[\s\S]{0,400}Store\.createStore\(null, data\.ctx\)[\s\S]{0,300}editLocked = true/);
  assert.match(view, /function saveUiPrefs\(\) \{ if \(store && !playerMode\)/, 'no view preference is ever written from the player page');
  assert.match(view, /function leavePreview\(o\) \{\s*if \(!previewMode \|\| playerMode\) return;/, 'there is no GM view to go back to');
  assert.match(view, /resumePreview = !!prefs\.playerPreview \|\| playerMode;/, 'the page opens straight into the preview');
});

test('the player page hides every GM control and shows no way into the editor', () => {
  const chrome = fn('applyPreviewChrome', 'enterPreview');
  assert.match(chrome, /ui\.previewBar\.hidden = !on \|\| playerMode/, 'no fog brush, outline, print or "back" on the player page');
  assert.match(chrome, /if \(playerMode\) \{[\s\S]{0,500}ui\.partyBtn\.hidden = true[\s\S]{0,300}data-j2-history-group\]/, 'no history and no party toggle');
  assert.match(chrome, /ui\.fogTool\.hidden = !on \|\| playerMode/, 'no fog brush');
  assert.match(chrome, /ui\.railPv\.hidden = !on \|\| playerMode/, 'no outline, print or link');
  assert.match(chrome, /ui\.sideToggle\.hidden = true/, 'no panel to fold');
  assert.match(chrome, /data-j2-gm-row\]'\)\) row\.hidden = on/);
  assert.match(chrome, /ui\.echoLocate\.hidden = on/);
  assert.match(view, /function routeLocked\(\) \{ return editLocked && !playerMode; \}/, 'the planner works on the read-only page');
  const css = read('css/journey2.css');
  assert.match(css, /\.j2-ctl-preview\[hidden\], \.j2-side-scroll\[hidden\], \.j2-rail-grp\[hidden\], \.j2-rb\[hidden\] \{ display: none; \}/, 'hidden tools really hide');
  assert.match(css, /\.j2\[data-player\] \.j2-side > :not\(\.j2-about\):not\(\.j2-legend\) \{ display: none; \}/, 'the player page panel is the title and the legend only');
  assert.match(view, /ui\.legendBtn\.hidden = false/, 'the Legend tool exists on the player page only');
  assert.match(view, /sideCollapsed = playerMode \? isPhoneWidth\(\)/, 'the legend is open on a desktop and folded on a phone');
  for (const k of ['journey2_rail_legend', 'journey2_legend_title', 'journey2_legend_party', 'journey2_legend_sanctuary', 'journey2_legend_shadow', 'journey2_legend_echo', 'journey2_legend_unknown', 'journey2_legend_controls_touch']) assert.ok(i18n.en[k] && i18n.ru[k], k);
  assert.match(css, /\.j2\[data-player\] \.j2-mapbar \{ left: var\(--j2-side-gap\); width: var\(--j2-rail-w\)/, 'zoom is a column aligned with the rail');
  assert.match(css, /body\[data-route="playermap"\] \.shell/);
});

test('the header on the player page keeps the brand and the language switch only', () => {
  const head = app.slice(app.indexOf('function renderHeader()'), app.indexOf('const SEARCH_DEBOUNCE_MS'));
  assert.match(head, /const playerPage = state\.route\.name === 'playermap';/);
  assert.match(head, /\$\{playerPage \? '' : `<nav class="header-nav"/);
  assert.match(head, /\$\{playerPage \? '' : SoundboardUI\.triggerHtml\(\)\}/);
  assert.match(head, /\(playerPage \? \[\] : RIBBONS\)\.forEach/, 'no ribbon is wired when there is none');
  assert.match(app, /if \(state\.route\.name !== 'journey' && state\.route\.name !== 'playermap'\) Journey2View\.unmount\(\);/);
  assert.match(app, /else if \(state\.route\.name === 'playermap'\) \{\s*renderPlayerMapPage\(\);/);
});

test('the editor and a player link are different instances; a language switch only re-localizes the same one', () => {
  assert.match(view, /current\.playerLink === link\) \{ current\.relocalize\(opts\); return current; \}/);
  assert.match(view, /playerLink: opts && opts\.player \? String\(opts\.player\.link\) : null/);
});

/* ---------------- what players know ---------------- */

test('the planner in Player Preview / on the player page reads only the projection (revealed tiles), and hides the encounter estimate', () => {
  const idx = fn('routeIndex', 'planRoutesFor');
  assert.match(idx, /previewMode && playerProjection \? playerProjection : doc/);
  assert.match(idx, /for \(const o of key\.overlays\)/);
  assert.match(idx, /Model\.OVERTAKEN_SYMBOL/);
  const stats = fn('routeStatsHtml', 'routeDetailsHtml') || fn('routeStatsHtml', 'dotsHtml');
  assert.match(view, /\(previewMode \? '' : '<div><dt>' \+ esc\(t\('journey2_route_expected'\)\)/, 'no expected-encounter row for players');
  assert.match(view, /\(previewMode \? '' : esc\(t\('journey2_route_enc_unknown'\)\) \+ '\. '\)/);
  assert.ok(stats.length > 0);
});

test('an open route follows what players now know, and Escape closes it before the preview', () => {
  assert.match(view, /syncRoute\(\);\s*\/\/ an open route follows what the players now know/);
  assert.match(view, /if \(previewMode && routePlanner\.isActive\(\)\) \{ routeEscape\(\);/);
  assert.match(fn('leavePreview', 'printPageMarkup'), /exitRoute\(\{ quiet: true \}\)/);
});

test('a Collected Echo is drawn from the projection only, as the dim flat crystal', () => {
  const body = fn('renderEchoes', 'updateEchoUi');
  assert.match(body, /playerProjection\.collectedEchoes/);
  assert.match(body, /j2-echo is-collected/);
});

/* ---------------- touch ---------------- */

test('touch: two fingers pinch-zoom, a fingertip gets a larger tap slop and pin grab area, the lost-capture event never ends a finger', () => {
  assert.match(view, /const touches = new Map\(\)/);
  assert.match(view, /e\.type === 'lostpointercapture'/);
  assert.match(view, /const TOUCH_SLOP_PX = 10;/);
  assert.match(view, /const ROUTE_PIN_HIT_TOUCH_PX = 28;/);
  assert.match(view, /function onViewportDown\(e\) \{\s*if \(touchDown\(e\)\) return;/);
  assert.match(read('css/journey2.css'), /touch-action: none/);
});

/* ---------------- strings ---------------- */

test('every player-page string exists in both languages with matching placeholders', () => {
  const keys = Object.keys(i18n.en).filter(k => /^journey2_pl_|^journey_player_|^journey2_route_live_pin_moved$/.test(k));
  assert.ok(keys.length >= 7, 'found ' + keys.length);
  const ph = s => (s.match(/\{[a-z]+\}/g) || []).sort().join(',');
  for (const k of keys) { assert.ok(typeof i18n.ru[k] === 'string' && i18n.ru[k].length, 'missing RU ' + k); assert.equal(ph(i18n.ru[k]), ph(i18n.en[k]), k); }
  for (const code of ['invalid', 'empty', 'unsupported_version', 'template_mismatch']) assert.ok(i18n.en['journey2_pl_error_' + code], code);
  assert.match(view, /journey2_pl_error_' \+ String\(code \|\| 'invalid'\)\.replace\(\/-\/g, '_'\)/, 'every codec error code maps to a key (or the generic one)');
});
/* ---------------- the GM's "Player link" button ---------------- */

test('Copy player link: lives in the rail while Player Preview is on, is built from the projection document, and reports success only after a real copy', () => {
  const body = fn('copyPlayerLink', 'maybeResumePreview');
  assert.match(view, /railBtn\('data-j2-share-link data-t-title="journey2_share_title"'/);
  assert.match(view, /else if \(b\.hasAttribute\('data-j2-share-link'\)\) copyPlayerLink\(\);/);
  assert.match(body, /if \(inst\.disposed \|\| !previewMode \|\| playerMode/, 'only from the GM\'s Player Preview');
  assert.match(body, /Share\.createLinkText\(projectionDoc\(\), data\.ctx, \{ lang: lang, view: view, regionIcons: showRegions \}\)/, 'the same document Player Preview draws, party light included');
  assert.match(body, /location\.href\.split\('#'\)\[0\] \+ '#\/map\/' \+ text/);
  assert.match(body, /navigator\.clipboard\.writeText\(url\); copied = true;/);
  assert.match(body, /if \(copied\) \{ toast\(t\('journey2_share_toast'\)\)/, 'no success toast without a copy');
  assert.match(body, /ui\.shareUrl\.hidden = copied && !long/, 'when the clipboard is unavailable the link is shown to copy by hand');
  assert.match(view, /const SHARE_WARN_CHARS = 2000;/);
  assert.doesNotMatch(strip(body), /localStorage|persist\(|dispatch\(/, 'a link is a read, never a document write');
  for (const k of ['journey2_share', 'journey2_share_title', 'journey2_share_copied', 'journey2_share_manual', 'journey2_share_long', 'journey2_share_failed', 'journey2_share_toast', 'journey2_share_url_label']) assert.ok(i18n.en[k] && i18n.ru[k], k);
  assert.match(i18n.en.journey2_share_long, /\{n\}/); assert.match(i18n.ru.journey2_share_long, /\{n\}/);
});
/* ---------------- player copy ---------------- */

test('player copy: every <key>_pl variant has a base key, both languages and the same placeholders; the view prefers it only for players', () => {
  const ph = s => (s.match(/\{[a-z]+\}/g) || []).sort().join(',');
  const variants = Object.keys(i18n.en).filter(k => k.endsWith('_pl'));
  assert.ok(variants.length >= 15, 'found ' + variants.length);
  for (const k of variants) {
    const base = k.slice(0, -3);
    assert.ok(i18n.en[base] && i18n.ru[base], 'base key of ' + k);
    assert.ok(i18n.ru[k] && i18n.ru[k].length, 'missing RU ' + k);
    assert.equal(ph(i18n.en[k]), ph(i18n.en[base]), 'EN placeholders of ' + k);
    assert.equal(ph(i18n.ru[k]), ph(i18n.ru[base]), 'RU placeholders of ' + k);
  }
  assert.match(view, /if \(playerMode \|\| \(previewMode && key\.startsWith\('journey2_route_'\)\)\) \{ const v = baseT\(key \+ '_pl'\);/);
  assert.match(view, /if \(o && o\.t\) baseT = o\.t;/, 'a language switch replaces the base lookup, not the wrapper');
});

test('player copy: no GM vocabulary reaches a player through the route and load strings', () => {
  for (const lang of ['en', 'ru']) {
    for (const k of Object.keys(i18n[lang]).filter(k => k.endsWith('_pl'))) {
      assert.doesNotMatch(i18n[lang][k], /generated|GM only|nothing is saved|geometry|console|сгенерирован|только для ведущего|консол/i, lang + ' ' + k);
    }
  }
});
/* ---------------- first paint and camera ---------------- */

test('boot: #/map/ boots on the map skeleton, never the catalogue cards', () => {
  const html = read('index.html');
  const m = html.match(/<script>if\((\/\^#\\\/map\\\/\/)\.test\(location\.hash\)\)document\.documentElement\.dataset\.bootRoute='journey2';<\/script>/);
  assert.ok(m, 'boot script for the player map present');
  const re = eval(m[1]); // eslint-disable-line no-eval -- the literal is this repo's own index.html
  assert.ok(re.test('#/map/2.abc') && !re.test('#/journey') && !re.test('') && !re.test('#/mapx'));
});

test('camera: the GM link carries the camera and the player page opens on it at the same world width', () => {
  const copy = fn('copyPlayerLink', 'maybeResumePreview');
  assert.match(copy, /const view = cv && !cv\.fit && vw && cv\.scale > 0 \? \{ cx: cv\.cx, cy: cv\.cy, width: vw \/ cv\.scale \} : null;/);
  const restore = fn('restoreCamera', 'setCamera');
  assert.match(restore, /pv = playerMode && playerLoad && playerLoad\.snap && playerLoad\.snap\.view/);
  assert.match(restore, /vw \/ pv\.width/, 'the scale follows THIS screen width, so a tablet shows the same width of world');
});
