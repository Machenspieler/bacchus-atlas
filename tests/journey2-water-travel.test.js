'use strict';
/* Route Planner: the informational "Traveling over Water" popover (PD-079). Source guards only — behaviour was verified in a real browser. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const view = read('js/journey2-view.js');
const i18n = JSON.parse(read('data/i18n.json'));

test('every journey2_water_* string used by the template exists in both languages', () => {
  const keys = new Set([...view.matchAll(/data-t(?:-aria|-title)?="(journey2_water_[a-z0-9_]+)"/g)].map(m => m[1]));
  assert.ok(keys.size >= 25);
  for (const lang of ['en', 'ru']) for (const k of keys) assert.ok(i18n[lang][k], lang + ' ' + k);
  assert.match(i18n.ru.journey2_water_note, /Планировщик маршрута не учитывает течение рек и погоду на море/);
  assert.match(i18n.en.journey2_water_note, /Route Planner does not account for river currents or ocean weather/);
});

test('the water popover is shown only while the planner is active and never touches route, camera or document state', () => {
  assert.match(view, /ui\.water\.hidden = !active; if \(!active\) closeWater\(\);/);
  const fn = view.slice(view.indexOf('function closeWater'), view.indexOf('/** Escape: open details close first;'));
  assert.doesNotMatch(fn, /routePlanner|setCamera|dispatch\(|renderRoute|fitToView|Storage/);
});
