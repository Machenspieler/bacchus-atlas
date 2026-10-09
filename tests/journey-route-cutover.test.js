/* Phase G — #/journey is the canonical map editor, #/journey2 a legacy redirect.
   app.js is a browser script, so the wiring is pinned at the source level here;
   the DOM behaviour (mount once, Back/Forward, overlay, print) is covered by
   docs/manual-qa.md and the browser verification run. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const app = read('js/app.js');
const i18n = JSON.parse(read('data/i18n.json'));
const { parseRouteHash } = require('../js/route-utils.js');

test('the header Journey ribbon targets #/journey and only the journey route marks it current', () => {
  assert.match(app, /\{ id: 'journey', icon: \(\) => ICON_COMPASS, label: 'nav_journey', hash: '#\/journey' \}/);
  assert.match(app, /: state\.route\.name === 'journey' \? 'journey'/);
  assert.match(app, /navigate\(r\.hash\)/);
});

test('no public route, link or nav entry emits #/journey2 (only the router keeps it as a legacy alias)', () => {
  assert.doesNotMatch(app, /#\/journey2/);
  assert.doesNotMatch(app, /name: 'journey2'|name === 'journey2'/);
  assert.doesNotMatch(read('js/journey2-view.js'), /href[^\n]*#\/journey2/);
});

test('render() mounts the map editor on "journey" and releases it on every other route', () => {
  assert.match(app, /if \(state\.route\.name !== 'journey'\) Journey2View\.unmount\(\);/);
  assert.match(app, /else if \(state\.route\.name === 'journey'\) \{\s*renderJourneyPage\(\);/);
  assert.equal((app.match(/function renderJourneyPage\(/g) || []).length, 1);
  assert.match(app, /function renderJourneyPage\(\) \{[\s\S]{0,400}Journey2View\.mount\(/);
});

test('the retired standalone generator page and its V1/V2 switch are gone', () => {
  for (const gone of ['renderJourneyVersionSwitch', 'journeyPanelHtml', 'journeyEntryHtml', 'bindJourneyDelegation',
                      'saveJourneyDraft', 'deleteJourneyEntry', 'journeyDraft', 'journeyRegions', 'journeySanctuaries', 'rollRegion']) {
    assert.ok(!app.includes(gone), gone + ' should be removed');
  }
  const css = read('css/styles.css');
  for (const gone of ['.journey-wrap', '.journey-cols', '.journey-entry', '.jr-row', '.journey-version-switch']) {
    assert.ok(!css.includes(gone), gone + ' should be removed from styles.css');
  }
  // The editor must not inherit the catalog backdrop art the old page had.
  assert.doesNotMatch(css, /body\[data-route="journey"\]::before/);
  // Shared generation code the editor still needs stays.
  for (const kept of ['rollHabitat', 'rollEncounter', 'rollSanctuary', 'journey2Generator']) assert.ok(app.includes(kept), kept);
});

test('existing campaigns keep their storage: the journey2 storage keys are unchanged and no second set exists', () => {
  const store = read('js/journey2-store.js');
  assert.match(store, /dhcodex_journey2_/);
  assert.doesNotMatch(app + store + read('js/journey2-view.js'), /dhcodex_journey_(?!regions|sanctuaries)\w+/);
  assert.doesNotMatch(app, /dhcodex_journey_/);
});

test('public strings say Journey, never Journey 2', () => {
  for (const lang of ['en', 'ru']) {
    for (const [k, v] of Object.entries(i18n[lang])) {
      if (!/^(journey|nav_journey)/.test(k)) continue;
      assert.doesNotMatch(String(v), /Journey 2|Путешествие 2/, lang + '.' + k);
    }
    assert.ok(i18n[lang].journey_title && !('journey2_title' in i18n[lang]));
  }
  assert.equal(i18n.en.journey_title, 'Journey · map editor');
  assert.equal(i18n.ru.journey_title, 'Путешествие · редактор карты');
  assert.match(app, /state\.route\.name === 'journey'\) return `\$\{t\('journey_title'\)\} — \$\{t\('app_title'\)\}`/);
  assert.doesNotMatch(read('js/journey2-view.js'), /aria-label="Journey 2"/);
});

test('the legacy redirect repairs in place (replaceState) and never adds a history entry', () => {
  assert.match(app, /history\.replaceState\(history\.state, '', url\.href\)/);
  for (const [legacy, canon] of [['#/journey2', '#/journey'], ['#/journey2/env/buzzing-swamp', '#/journey/env/buzzing-swamp']]) {
    assert.equal(parseRouteHash(legacy).canonicalHash, canon);
  }
});

test('index.html boot script selects the editor skeleton for both the canonical and the legacy address', () => {
  const html = read('index.html');
  const m = html.match(/<script>if\((\/\^[^<]*?\/)\.test\(location\.hash\)\)document\.documentElement\.dataset\.bootRoute='journey2';<\/script>/);
  assert.ok(m, 'boot script present');
  const re = eval(m[1]); // eslint-disable-line no-eval -- the literal is this repo's own index.html
  for (const h of ['#/journey', '#/journey/env/x', '#/journey2', '#/journey2/env/x']) assert.ok(re.test(h), h);
  for (const h of ['#/journey22', '#/prep', '', '#/lists']) assert.ok(!re.test(h), h);
});

test('route-scoped CSS follows the canonical body[data-route="journey"], never the legacy name', () => {
  const j2css = read('css/journey2.css');
  assert.match(j2css, /body\[data-route="journey"\] \.shell/);
  assert.doesNotMatch(j2css + read('css/styles.css'), /data-route="journey2"/);
});
