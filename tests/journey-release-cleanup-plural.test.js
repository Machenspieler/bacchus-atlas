'use strict';
/* Release cleanup F-01 / F-02: English singular agreement in the Import-replace message (regions, placed hexes) and the Route Planner
 * comparison hint (fewer hexes, more travel days), each counter independently. Runs the view's real `fill`/`fillN` against data/i18n.json.
 * Russian never declines these nouns, so it has no variants and keeps its wording for every count. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const view = read('js/journey2-view.js');
const i18n = JSON.parse(read('data/i18n.json'));
const COUNTS = [0, 1, 2, 5];

function helpers(lang) {
  const src = view.slice(view.indexOf('    function fill(key, vars) {'), view.indexOf('    /* ---- lifecycle ---- */'));
  return new Function('t', src + '; return { fillN };')(key => i18n[lang][key] || key);
}
const importMsg = (lang, b, t) => helpers(lang).fillN('journey2_import_replace_msg', { batches: b, tiles: t }, [b, t]);
const routeHint = (lang, h, d) => helpers(lang).fillN('journey2_route_compare_hint', { h, d }, [h, d]);
const noun = (n, one, many) => n + ' ' + (n === 1 ? one : many);

test('F-01: English Import message agrees for regions and placed hexes (0, 1, 2, 5, every combination)', () => {
  for (const b of COUNTS) for (const t of COUNTS) {
    assert.equal(importMsg('en', b, t),
      `The current map (${noun(b, 'region', 'regions')}, ${noun(t, 'placed hex', 'placed hexes')}) will be replaced by the backup. Undo history is cleared.`);
  }
  assert.match(importMsg('en', 1, 1), /\(1 region, 1 placed hex\)/);
  assert.doesNotMatch(importMsg('en', 3, 1), /placed hexes/);
});

test('F-01: Russian Import message is unchanged for every count', () => {
  for (const b of COUNTS) for (const t of COUNTS) {
    assert.equal(importMsg('ru', b, t), `Текущая карта (регионов: ${b}, поставленных гексов: ${t}) будет заменена копией. История отмены будет очищена.`);
  }
});

test('F-02: English route comparison hint agrees for hexes and travel days independently', () => {
  for (const h of COUNTS) for (const d of COUNTS) {
    assert.equal(routeHint('en', h, d), `The shortest route is ${h} fewer ${h === 1 ? 'hex' : 'hexes'} but takes ${d} more travel ${d === 1 ? 'day' : 'days'}.`);
  }
  assert.equal(routeHint('en', 1, 2), 'The shortest route is 1 fewer hex but takes 2 more travel days.');
  assert.equal(routeHint('en', 2, 1), 'The shortest route is 2 fewer hexes but takes 1 more travel day.');
  assert.equal(routeHint('en', 1, 1), 'The shortest route is 1 fewer hex but takes 1 more travel day.');
  assert.equal(routeHint('en', 2, 2), 'The shortest route is 2 fewer hexes but takes 2 more travel days.');
});

test('F-02: Russian route comparison hint is unchanged for every count', () => {
  for (const h of COUNTS) for (const d of COUNTS) {
    assert.equal(routeHint('ru', h, d), `Самый короткий маршрут короче на гексов: ${h}, но занимает больше дней: ${d}.`);
  }
});

test('F-01/F-02: the view routes both strings through fillN with the raw counts (no plain fill left)', () => {
  assert.match(view, /fillN\('journey2_import_replace_msg'[^\n]*\[doc\.batches\.length, doc\.tiles\.length\]\)/);
  assert.match(view, /fillN\('journey2_route_compare_hint'[^\n]*\[dh, dd\]\)/);
  assert.doesNotMatch(view, /[^N]fill\('journey2_(import_replace_msg|route_compare_hint)'/);
});
