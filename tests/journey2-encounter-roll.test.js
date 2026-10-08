'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rollEncounterDice } = require('../js/journey2-encounter-roll.js');

const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };

test('rolls exactly `count` d6 faces in 1..6', () => {
  for (let count = 1; count <= 4; count++) {
    const r = rollEncounterDice({ count });
    assert.equal(r.faces.length, count);
    assert.equal(r.sides, 6);
    for (const f of r.faces) assert.ok(Number.isInteger(f) && f >= 1 && f <= 6);
  }
});

test('maps the injected RNG onto faces (0 -> 1, just under 1 -> 6)', () => {
  const r = rollEncounterDice({ count: 4, random: seq(0, 0.17, 0.5, 0.999999) });
  assert.deepEqual(r.faces, [1, 2, 4, 6]);
});

test('any 1 triggers; a second 1 changes nothing; no 1 does not', () => {
  assert.equal(rollEncounterDice({ count: 3, random: seq(0.9, 0.0, 0.5) }).triggered, true);
  assert.equal(rollEncounterDice({ count: 3, random: seq(0.0, 0.0, 0.0) }).triggered, true);
  assert.equal(rollEncounterDice({ count: 3, random: seq(0.2, 0.5, 0.9) }).triggered, false);
});

test('the die size is a parameter (default 6, bad values fall back)', () => {
  assert.deepEqual(rollEncounterDice({ count: 2, sides: 4, random: seq(0.999999, 0.3) }).faces, [4, 2]);
  assert.equal(rollEncounterDice({ count: 1, sides: 1 }).sides, 6);
  assert.equal(rollEncounterDice({ count: 1, sides: 'x' }).sides, 6);
});

test('a bad count rolls nothing and never triggers', () => {
  for (const count of [0, -1, 1.5, NaN, null, undefined, '4']) {
    const r = rollEncounterDice({ count });
    assert.deepEqual(r.faces, []);
    assert.equal(r.triggered, false);
  }
  assert.deepEqual(rollEncounterDice().faces, []);
});

test('a broken RNG value never escapes 1..sides', () => {
  const r = rollEncounterDice({ count: 3, random: seq(NaN, -5, 7) });
  assert.deepEqual(r.faces, [1, 1, 6]);
});

/* ---- wiring / guards (PD-039) ---- */
const fs = require('node:fs');
const path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

test('script wiring: the module loads before the view and ships in the build list', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('js/journey2-encounter-roll.js') > 0 && html.indexOf('js/journey2-encounter-roll.js') < html.indexOf('js/journey2-view.js'));
  assert.match(read('scripts/check-journey2-build.js'), /js\/journey2-encounter-roll\.js/);
});

test('every Encounter Roll string exists in English and Russian', () => {
  const i18n = JSON.parse(read('data/i18n.json'));
  const keys = ['tip', 'aria', 'dice_aria', 'hit', 'miss', 'fear', 'triggered', 'live_hit', 'live_miss'].map(k => 'journey2_roll_' + k);
  for (const lang of Object.keys(i18n).filter(l => i18n[l] && typeof i18n[l] === 'object' && i18n[l].journey2_tile_cell)) {
    for (const k of keys) assert.ok(typeof i18n[lang][k] === 'string' && i18n[lang][k].length, lang + ' lacks ' + k);
  }
  assert.match(i18n.ru.journey2_roll_tip, /Страх/, 'Fear is "Страх" in the glossary');
});

test('the roll is transient GM state: never stored, never in the projection or the print, dropped with the inspector', () => {
  const view = read('js/journey2-view.js');
  assert.ok(!/store\.save[^\n]*encRoll|Store\.[a-zA-Z]+\([^\n]*encRoll/.test(view), 'encRoll never reaches the store');
  assert.match(view, /function closeInspector[\s\S]{0,400}encRoll = null/);
  assert.ok(!/encRoll|EncRoll/.test(read('js/journey2-projection.js') + read('js/journey2-print.js')));
});

test('a fully overtaken region has no roll and no Terrain / Encounter / Rumor panel', () => {
  const view = read('js/journey2-view.js');
  assert.match(view, /I\.scroll\.hidden = bare/);
  assert.match(view, /I\.roll\.hidden = bare/);
  assert.match(view, /refs\.inspect\.hidden = !!b\.habitat\.overtaken/);
  assert.match(view, /if \(!b \|\| b\.habitat\.overtaken \|\| !EncRoll\) return;/);
});

test('the frame is Fear red with a text flag, and the die animation respects reduced motion', () => {
  const css = read('css/journey2.css');
  assert.match(css, /\.j2-enc-sec\.is-triggered \{ border: 1px solid var\(--fear\)/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.j2-die \{ animation: none; \} \}/);
  assert.ok(!/is-triggered[^}]*var\(--hope/.test(css), 'gold is never used for a triggered encounter');
});
