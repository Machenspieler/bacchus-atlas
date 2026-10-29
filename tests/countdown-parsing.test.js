'use strict';
/* findCountdownMatches() lives in js/app.js (no module export), so the test cuts the three
   countdown constants and the function out of the source and evaluates just those. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const pick = (re, what) => { const m = src.match(re); assert.ok(m, what + ' not found in js/app.js'); return m[0]; };
const findCountdownMatches = new Function([
  pick(/const COUNTDOWN_KEYWORD_RE = .*;/, 'COUNTDOWN_KEYWORD_RE'),
  pick(/const COUNTDOWN_PAREN_RE = .*;/, 'COUNTDOWN_PAREN_RE'),
  pick(/const COUNTDOWN_ROLL_WORD_RE = .*;/, 'COUNTDOWN_ROLL_WORD_RE'),
  pick(/function findCountdownMatches\(text\) \{[\s\S]*?\r?\n\}/, 'findCountdownMatches()'),
  'return findCountdownMatches;',
].join('\n'))();

const startOf = text => { const r = findCountdownMatches(text); return r.length === 1 ? r[0].value : r.map(x => x.value); };

test('a countdown written "(Loop XdY)" starts at the highest the dice can show', () => {
  assert.equal(startOf('Countdown (Loop 1d6). Patrol.'), 6);
  assert.equal(startOf('Countdown (Loop 2d6).'), 12);
  assert.equal(startOf('Countdown (Loop d20).'), 20);
  assert.equal(startOf('Отсчёт (Цикл 1d4).'), 4);
});

test('a flat bonus after the die is part of the starting value: "(Loop 1d6+1)" starts at 7', () => {
  assert.equal(startOf('Countdown (Loop 1d6+1). This dungeon is populated by roving foes.'), 7);
  assert.equal(startOf('Отсчёт (Цикл 1d6+1). Это подземелье населено патрулями.'), 7);
  assert.equal(startOf('Countdown (Loop 2d4 + 2).'), 10);
});

test('the whole "Countdown (Loop 1d6+1)" span is the button, so no dice button is left behind', () => {
  const [m] = findCountdownMatches('Countdown (Loop 1d6+1). Then more text.');
  assert.equal(m.label, 'Countdown (Loop 1d6+1)');
  assert.equal(m.end, 'Countdown (Loop 1d6+1)'.length);
});

test('plain and looped integers still read as before', () => {
  assert.equal(startOf('Countdown (6)'), 6);
  assert.equal(startOf('Countdown (Loop 4)'), 4);
  assert.equal(startOf('Отсчёт (Цикл 8)'), 8);
});

test('a bonus is only read after a die: "(4+1)" is not a countdown', () => {
  assert.deepEqual(findCountdownMatches('Countdown (4+1)'), []);
});

test('a difficulty in parentheses after a roll word is still not a countdown', () => {
  assert.deepEqual(findCountdownMatches('stop the countdown with a successful Finesse Roll (20)'), []);
});

test('every "Loop"/"Цикл" countdown in data/environments.json is read as one countdown', () => {
  const data = fs.readFileSync(path.join(__dirname, '../data/environments.json'), 'utf8');
  const re = /(?:Countdown|Отсчёт)\s*\((?:Loop|Цикл)\s[^)]*\)/g;
  const found = data.match(re) || [];
  assert.ok(found.length >= 10, 'expected the data to contain several looped countdowns');
  for (const s of found) assert.equal(findCountdownMatches(s).length, 1, s);
});

test('a trailing "– Decreasing Loop" / "– Убывающий Цикл" qualifier is part of the countdown button', () => {
  const en = 'set an Expedition Countdown (6 – Decreasing Loop) that advances each time';
  const [m] = findCountdownMatches(en);
  assert.equal(m.value, 6);
  assert.equal(m.label, 'Countdown (6 – Decreasing Loop)');
  assert.equal(startOf('установить Отсчёт Экспедиции (6 – Убывающий Цикл), который'), 6);
  assert.equal(startOf('Countdown (3 – Decreasing Loop). When it triggers'), 3);
});
