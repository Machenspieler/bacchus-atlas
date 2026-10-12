'use strict';
/* Task 01A regression checks: the calibration CSV serializer, the deploy-exclusion rules and the print CSS. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const Csv = require('../scripts/journey2/lib/csv');
const { isExcluded } = require('../scripts/build.js');
const template = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'map-template.json'), 'utf8'));

/* ---------------- CSV serializer / parser ---------------- */

test('csv: a "q,r" cell id is quoted and round-trips, including negatives', () => {
  const rows = [['cellId', 'x'], ['1,6', 1.5], ['-3,-12', 2], ['0,0', 3]];
  const text = Csv.serialize(rows);
  assert.match(text, /^cellId,x\n"1,6",1.5\n"-3,-12",2\n"0,0",3\n$/);
  assert.deepEqual(Csv.parse(text), rows.map(r => r.map(String)));
});

test('csv: embedded quotes, commas and newlines survive a round trip', () => {
  const rows = [['a', 'b'], ['say "hi", please', 'line1\nline2'], ['', 'plain']];
  assert.deepEqual(Csv.parse(Csv.serialize(rows)), rows);
});

test('csv: parser rejects unterminated quotes and stray quotes; parseObjects rejects a field-count mismatch', () => {
  assert.throws(() => Csv.parse('a,b\n"x,1\n'), /unterminated/);
  assert.throws(() => Csv.parse('a,b\nx"y,1\n'), /quote inside unquoted/);
  assert.throws(() => Csv.parseObjects('cellId,v\n1,6,64.88\n'), /3 fields, header has 2/);
});

/* ---------------- deploy exclusion ---------------- */

test('build: development-only Journey 2 paths are excluded', () => {
  for (const p of [
    'docs/journey2-handoff/README.md', 'docs/journey2-handoff/reference/journey-rules-reference.pdf', 'docs/journey2-handoff/reference/approved-ui.html',
    'docs/journey2-handoff.zip', 'docs/journey2-handoff-v2.zip',
    'docs/journey2-review-stage-0/REVIEW.md', 'docs/journey2-review-stage-0/evidence/pdf-poppler-1.png',
    'journey2-stage0-followup.zip', 'journey2-stage0-followup/docs',
  ]) assert.equal(isExcluded(p), true, p);
  assert.equal(isExcluded('docs\\journey2-handoff\\README.md'), true, 'Windows separators');
});

test('build: runtime Journey 2 resources and unrelated public docs are kept', () => {
  for (const p of [
    'img/journey2/valloren-world.webp', 'img/journey2/symbols/aquatic.png', 'data/journey2/map-template.json', 'js/journey2-view.js', 'css/journey2.css',
    'docs/product-decisions.md', 'docs/architecture.md', 'docs/manual-qa.md', 'docs/data-contracts/environments.md', 'index.html', 'img/ui/icon.png',
  ]) assert.equal(isExcluded(p), false, p);
});

test('print CSS: the print root opts out of the dark colour scheme as well as painting the root white', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css', 'journey2.css'), 'utf8');
  const print = css.slice(css.indexOf('@media print'));
  assert.match(print, /:root:has\(body\.j2-print-mode\)\s*\{[^}]*color-scheme:\s*light/);
  assert.match(print, /:root:has\(body\.j2-print-mode\)\s*\{[^}]*background:\s*#fff/);
  // and it must stay inside @media print, so the on-screen theme is untouched
  assert.equal(css.slice(0, css.indexOf('@media print')).includes('color-scheme'), false);
});

