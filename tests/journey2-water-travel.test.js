'use strict';
/* PD-079: the Route Planner overlay carries the water-travel disclaimer in both languages. Source guard only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the route overlay shows the water-travel disclaimer, translated', () => {
  const view = read('js/journey2-view.js'), i18n = JSON.parse(read('data/i18n.json'));
  const aside = view.slice(view.indexOf('data-j2-route hidden>'), view.indexOf('</aside>', view.indexOf('data-j2-route hidden>')));
  assert.match(aside, /data-t="journey2_route_water_note"/);
  assert.match(i18n.en.journey2_route_water_note, /does not account for river currents or ocean weather/);
  assert.match(i18n.ru.journey2_route_water_note, /не учитывает течение рек и погоду на море/);
});
