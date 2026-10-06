'use strict';
/* Gate 0 (Task 02): host-independent path normalization and the scoped Journey build guard. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isExcluded, normalizeRelPath } = require('../scripts/build.js');
const guard = require('../scripts/check-journey2-build.js');

const EXCLUDED = [
  'docs/journey2-handoff/README.md', 'docs/journey2-implementation/stage-1/IMPLEMENTATION_REPORT.md',
  'docs/journey2-implementation/stage-1.zip', 'docs/journey2-review-stage-0a/REVIEW.md', 'docs/journey2-handoff.zip',
  'journey2-stage0-followup.zip', 'stage-1.zip', 'stage-0a.zip', 'docs/stage-2.zip',
];
const KEPT = [
  'img/journey2/valloren-world.webp', 'data/journey2/map-template.json', 'js/journey2-view.js', 'css/journey2.css',
  'docs/architecture.md', 'docs/public-guide.pdf', 'index.html',
];
const both = p => [p, p.replace(/\//g, '\\')];

test('separators: forward and backslash forms agree for excluded inputs', () => {
  for (const p of EXCLUDED) for (const v of both(p)) assert.equal(isExcluded(v), true, v);
});

test('separators: forward and backslash forms agree for retained runtime/public files', () => {
  for (const p of KEPT) for (const v of both(p)) assert.equal(isExcluded(v), false, v);
});

test('separators: result does not depend on the host path.sep (simulated POSIX and Windows hosts)', () => {
  const original = path.sep;
  try {
    for (const sep of ['/', '\\']) {
      Object.defineProperty(path, 'sep', { value: sep, configurable: true });
      assert.equal(isExcluded('docs\\journey2-handoff\\README.md'), true, 'sep ' + sep);
      assert.equal(isExcluded('docs/journey2-handoff/README.md'), true, 'sep ' + sep);
      assert.equal(isExcluded('img\\journey2\\valloren-world.webp'), false, 'sep ' + sep);
    }
  } finally { Object.defineProperty(path, 'sep', { value: original, configurable: true }); }
  assert.equal(normalizeRelPath('a\\b/c'), 'a/b/c');
});

/* ---------------- scoped guard ---------------- */

test('guard: forbidden Journey reference/source files are detected', () => {
  for (const f of [
    'docs/journey2-handoff/reference/journey-rules-reference.pdf', 'docs/journey2-handoff.zip', 'reference/approved-ui.html',
    'stray/original-map-pages-07-08.pdf', 'docs/journey2-notes.pdf', 'docs\\journey2-implementation\\stage-1.zip',
    'docs/journey2-implementation/stage-1/print/journey2-print-proof.pdf',
  ]) assert.equal(guard.findForbiddenJourneyFiles([f]).length, 1, f);
});

test('guard: an unrelated retained public PDF/ZIP is NOT rejected solely for its extension', () => {
  assert.deepEqual(guard.findForbiddenJourneyFiles(['docs/public-guide.pdf', 'downloads/starter-pack.zip', 'img/journey2/valloren-world.webp', 'data/journey2/symbols.json']), []);
});

function synthDist(extra) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'j2dist-'));
  for (const f of guard.RUNTIME.concat(extra || [])) { const p = path.join(dir, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, 'x'); }
  return dir;
}
function runQuiet(dist) {
  const log = console.log, err = console.error; console.log = console.error = () => {};
  try { return guard.run(dist, []); } finally { console.log = log; console.error = err; }
}

test('guard (synthetic dist): retained unrelated public PDF passes; forbidden Journey file fails', () => {
  const ok = synthDist(['docs/public-guide.pdf']);
  const bad = synthDist(['docs/public-guide.pdf', 'docs/journey2-handoff/reference/journey-rules-reference.pdf']);
  const missing = synthDist([]); fs.rmSync(path.join(missing, 'js/journey2-view.js'));
  try {
    assert.equal(runQuiet(ok), 0);
    assert.equal(runQuiet(bad), 1);
    assert.equal(runQuiet(missing), 1, 'a missing runtime resource still fails');
  } finally { for (const d of [ok, bad, missing]) fs.rmSync(d, { recursive: true, force: true }); }
});
