'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const N = require('../js/journey2-nav.js');

const d = (legendOpen, menu, routeActive) => N.activeDestination({ legendOpen, menu, routeActive });

test('route is active only while no sheet is open', () => {
  assert.equal(d(false, null, true), 'route');
  assert.equal(d(false, null, false), null);
});
test('Legend and Display outrank a persistent route, one at a time', () => {
  assert.equal(d(true, null, true), 'legend');
  assert.equal(d(false, 'display', true), 'display');
  assert.equal(d(true, 'display', true), 'display');
});
test('closing a sheet returns to the route, or to idle once the route is cleared', () => {
  assert.equal(d(false, null, true), 'route');
  assert.equal(d(true, null, false), 'legend');
  assert.equal(d(false, null, false), null);
});
test('wiring: module is loaded before the view, and the view/CSS use it', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.indexOf('journey2-nav.js') > 0 && html.indexOf('journey2-nav.js') < html.indexOf('journey2-view.js'));
  assert.match(fs.readFileSync('js/journey2-view.js', 'utf8'), /Nav\.activeDestination/);
  assert.match(fs.readFileSync('css/journey2.css', 'utf8'), /data-nav="legend"/);
});
