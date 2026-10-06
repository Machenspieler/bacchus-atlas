'use strict';
/* Task 01A regression checks: the calibration CSV, the deploy-exclusion rules and the print-proof PDF
   paint. Each is written to FAIL on the originally submitted Stage 0 output and PASS on the corrected
   one. Tests that need a local evidence file or the dev-only PDF tooling skip (with a reason) when it is
   absent, so a fresh clone / CI without the review packages stays green. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const S0 = path.join(ROOT, 'docs', 'journey2-implementation', 'stage-0');
const S0A = path.join(ROOT, 'docs', 'journey2-implementation', 'stage-0a');
const Csv = require('../scripts/journey2/lib/csv');
const { validateHoldoutCsv } = require('../scripts/journey2/lib/validate-holdout-csv');
const { scanFirstFill } = require('../scripts/journey2/lib/pdf-checks');
const { isExcluded } = require('../scripts/build.js');
const template = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'map-template.json'), 'utf8'));
const exists = p => fs.existsSync(p);

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

/* ---------------- hold-out CSV: fails on the original, passes on the corrected ---------------- */

const geometryJson = () => JSON.parse(fs.readFileSync(path.join(exists(path.join(S0A, 'data', 'geometry-verification.json')) ? S0A : S0, 'data', 'geometry-verification.json'), 'utf8'));

test('hold-out CSV: the submitted Stage 0 file is rejected (9 fields under an 8-field header)', { skip: !exists(path.join(S0, 'data', 'hold-out-verification.csv')) && 'Stage 0 evidence not present' }, () => {
  const r = validateHoldoutCsv(fs.readFileSync(path.join(S0, 'data', 'hold-out-verification.csv'), 'utf8'), geometryJson(), template);
  assert.equal(r.ok, false);
  assert.match(String(r.checks[0].value), /has 9 fields, header has 8/);
});

test('hold-out CSV: the corrected file parses, keeps all 510 records and reproduces the statistics', { skip: !exists(path.join(S0A, 'data', 'hold-out-verification.csv')) && 'Stage 0a evidence not present' }, () => {
  const text = fs.readFileSync(path.join(S0A, 'data', 'hold-out-verification.csv'), 'utf8');
  const r = validateHoldoutCsv(text, geometryJson(), template);
  assert.deepEqual(r.checks.filter(c => !c.ok), []);
  assert.equal(r.stats.n, 510);
  assert.ok(text.split('\n')[1].startsWith('"'), 'cellId is quoted');
});

test('hold-out CSV: every original record survives unchanged (same fields, now correctly quoted)', { skip: !(exists(path.join(S0, 'data', 'hold-out-verification.csv')) && exists(path.join(S0A, 'data', 'hold-out-verification.csv'))) && 'evidence not present' }, () => {
  const original = fs.readFileSync(path.join(S0, 'data', 'hold-out-verification.csv'), 'utf8').trim().split('\n').slice(1);
  const fixed = Csv.parse(fs.readFileSync(path.join(S0A, 'data', 'hold-out-verification.csv'), 'utf8')).slice(1);
  assert.equal(original.length, 510);
  assert.deepEqual(fixed.map(r => r.join(',')), original);
});

/* ---------------- deploy exclusion ---------------- */

test('build: development-only Journey 2 paths are excluded', () => {
  for (const p of [
    'docs/journey2-handoff/README.md', 'docs/journey2-handoff/reference/journey-rules-reference.pdf', 'docs/journey2-handoff/reference/approved-ui.html',
    'docs/journey2-handoff.zip', 'docs/journey2-handoff-v2.zip', 'docs/journey2-implementation/stage-0/print/journey2-print-proof.pdf',
    'docs/journey2-implementation/stage-0a/CORRECTION_REPORT.md', 'docs/journey2-review-stage-0/REVIEW.md', 'docs/journey2-review-stage-0/evidence/pdf-poppler-1.png',
    'journey2-stage0-followup.zip', 'journey2-stage0-followup/docs', 'docs/journey2-implementation/stage-0a.zip', 'docs/journey2-implementation/stage-0.zip',
  ]) assert.equal(isExcluded(p), true, p);
  assert.equal(isExcluded('docs\\journey2-handoff\\README.md'), true, 'Windows separators');
});

test('build: runtime Journey 2 resources and unrelated public docs are kept', () => {
  for (const p of [
    'img/journey2/valloren-world.webp', 'img/journey2/symbols/aquatic.png', 'data/journey2/map-template.json', 'js/journey2-view.js', 'css/journey2.css',
    'docs/product-decisions.md', 'docs/architecture.md', 'docs/manual-qa.md', 'docs/data-contracts/environments.md', 'index.html', 'img/ui/icon.png',
  ]) assert.equal(isExcluded(p), false, p);
});

/* ---------------- print PDF paint (content-stream scan: no external tooling) ---------------- */

test('print PDF: the submitted Stage 0 proof starts with a dark full-page fill', { skip: !exists(path.join(S0, 'print', 'journey2-print-proof.pdf')) && 'Stage 0 evidence not present' }, () => {
  const f = scanFirstFill(fs.readFileSync(path.join(S0, 'print', 'journey2-print-proof.pdf')));
  assert.ok(f, 'a first fill is found');
  assert.ok(f.fillRgb.every(v => Math.abs(v - 0.0706) < 0.001), JSON.stringify(f));
  assert.deepEqual(f.rect.slice(0, 2), [0, 0]);
});

test('print PDF: the corrected proof (background printing on AND off) has no dark page fill', { skip: !exists(path.join(S0A, 'print', 'journey2-print-proof.pdf')) && 'Stage 0a evidence not present' }, () => {
  for (const name of ['journey2-print-proof.pdf', 'journey2-print-proof-nobg.pdf']) {
    const f = scanFirstFill(fs.readFileSync(path.join(S0A, 'print', name)));
    assert.ok(!f || f.fillRgb.every(v => v >= 250 / 255), name + ' ' + JSON.stringify(f));
  }
});

test('print CSS: the print root opts out of the dark colour scheme as well as painting the root white', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css', 'journey2.css'), 'utf8');
  const print = css.slice(css.indexOf('@media print'));
  assert.match(print, /:root:has\(body\.j2-print-mode\)\s*\{[^}]*color-scheme:\s*light/);
  assert.match(print, /:root:has\(body\.j2-print-mode\)\s*\{[^}]*background:\s*#fff/);
  // and it must stay inside @media print, so the on-screen theme is untouched
  assert.equal(css.slice(0, css.indexOf('@media print')).includes('color-scheme'), false);
});

test('print PDF: rendered margin patches are white (needs pdfjs-dist + @napi-rs/canvas on NODE_PATH)', async t => {
  let analyze;
  try { analyze = require('../scripts/journey2/lib/pdf-checks').analyzePdf; require('pdfjs-dist/legacy/build/pdf.js'); require('@napi-rs/canvas'); } catch (e) { return t.skip('PDF tooling not installed'); }
  for (const [dir, expectOk] of [[S0, false], [S0A, true]]) {
    const pdf = path.join(dir, 'print', 'journey2-print-proof.pdf');
    if (!exists(pdf)) continue;
    const r = await analyze(pdf, { scale: 1 });
    const allWhite = r.pageInfo.every(p => p.marginPatches.every(m => m.ok));
    assert.equal(allWhite, expectOk, path.basename(dir));
    // placement comes from the PDF transform: top-left origin, inside the page and the 10 mm margins
    for (const p of r.pageInfo) { const i = p.images.find(x => x.widthMm > 100); assert.ok(i.yFromTopMm > 15.5 && i.yFromTopMm < 16.8 && i.xMm > 9.9 && i.xMm + i.widthMm < 287.2, JSON.stringify(i)); }
  }
});
