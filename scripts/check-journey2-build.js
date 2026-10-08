#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — check-journey2-build.js
   Runs after scripts/build.js in CI. Fails if dist/ contains development-only
   Journey 2 material (source/reference PDFs, the handoff ZIP, mockup HTML,
   review and implementation evidence) or if a Journey 2 runtime resource is
   missing. The exclusion list is scripts/build.js's own isExcluded(); this
   check additionally verifies the output tree itself, so a second copy route
   that bypassed build.js would still be caught.

   The guard is scoped to Journey development inputs. It does NOT ban PDF/ZIP
   files as a class: an unrelated public document that the build deliberately
   keeps (e.g. docs/public-guide.pdf) is allowed.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { isExcluded, normalizeRelPath } = require('./build.js');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const RUNTIME = [
  'js/journey2-geometry.js', 'js/journey2-model.js', 'js/journey2-store.js', 'js/journey2-biome-tint.js', 'js/journey2-projection.js', 'js/journey2-print.js', 'js/journey2-locate.js', 'js/journey2-shadow-marks.js', 'js/journey2-route.js', 'js/journey2-env-deal.js', 'js/journey2-encounter-roll.js', 'js/journey2-view.js', 'css/journey2.css',
  'data/journey2/map-template.json', 'data/journey2/map-anchors.json', 'data/journey2/symbols.json',
  'img/journey2/valloren-world.webp',
];

/* Known Journey 2 source / reference / mockup files, matched by basename wherever they appear in dist/
 * (a second copy route could drop them outside docs/journey2-*). Provenance: the Task 01 handoff package. */
const KNOWN_SOURCE_BASENAMES = new Set([
  'journey-rules-reference.pdf', 'original-map-pages-07-08.pdf', 'approved-ui.html', 'approved-ui.png',
  'asset-index.html', 'asset-index.png', 'book-printed-page-170.png', 'book-region-placement-example.png',
  'book-using-hex-symbols.png', 'shadowblight-hex-example.png', 'journey2-print-proof.pdf', 'journey2-print-proof-nobg.pdf',
]);

/* Files (relative, any separator) that are Journey development material and must not be in dist/. Pure. */
function findForbiddenJourneyFiles(files) {
  const bad = [];
  for (const raw of files) {
    const f = normalizeRelPath(raw);
    const base = f.slice(f.lastIndexOf('/') + 1).toLowerCase();
    if (isExcluded(f)) bad.push({ file: f, reason: 'excluded development path' });
    else if (KNOWN_SOURCE_BASENAMES.has(base)) bad.push({ file: f, reason: 'known Journey source/reference file' });
    else if (/^docs\//.test(f) && /journey2/i.test(f) && /\.(pdf|zip|html)$/i.test(f)) bad.push({ file: f, reason: 'Journey 2 PDF/ZIP/HTML under docs/' });
  }
  return bad;
}

function listFiles(dir) {
  const all = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else all.push(normalizeRelPath(path.relative(dir, p))); } })(dir);
  return all;
}

function run(dist, argv) {
  let failed = false;
  const results = [];
  const fail = m => { console.error('FAIL: ' + m); results.push({ ok: false, msg: m }); failed = true; };
  const pass = m => { console.log('PASS: ' + m); results.push({ ok: true, msg: m }); };

  if (!fs.existsSync(dist)) { console.error('dist/ does not exist — run scripts/build.js first.'); return 1; }
  for (const f of RUNTIME) fs.existsSync(path.join(dist, f)) ? pass('dist/' + f + ' present') : fail('dist/' + f + ' is a Journey 2 runtime resource but is missing');

  const all = listFiles(dist);
  const leaked = findForbiddenJourneyFiles(all);
  leaked.length
    ? fail('Journey development material reached dist/: ' + leaked.slice(0, 10).map(l => l.file + ' (' + l.reason + ')').join(', ') + (leaked.length > 10 ? ' (+' + (leaked.length - 10) + ' more)' : ''))
    : pass('no Journey development material in dist/ (' + all.length + ' files scanned)');

  if (argv.includes('--json')) console.log(JSON.stringify({ ok: !failed, results }, null, 1));
  if (failed) { console.error('\nJourney 2 build check FAILED.'); return 1; }
  console.log('\nJourney 2 build check passed.');
  return 0;
}

if (require.main === module) process.exit(run(DIST, process.argv));

module.exports = { findForbiddenJourneyFiles, listFiles, run, RUNTIME, KNOWN_SOURCE_BASENAMES };
