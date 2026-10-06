#!/usr/bin/env node
/* Dev-only. Assembles the review-only parts of docs/journey2-implementation/stage-0a/ (Task 01A):
   review-snapshots/ (copies of the runtime template/anchors and the changed validation/build modules,
   with source paths and SHA-256 in SNAPSHOTS.json), working-tree.patch and provenance.json.
   The snapshots are evidence only - the files in the repository stay the single runtime source of truth.
   Does not zip; run `Compress-Archive` (or any zip tool) on the folder afterwards.
   Usage: node scripts/journey2/package-stage-0a.js */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'journey2-implementation', 'stage-0a');
const SNAP = path.join(OUT, 'review-snapshots');
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const git = (...a) => { try { return cp.execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }); } catch (e) { return e.stdout || ''; } };

/* Files changed or added by Task 01A, plus the runtime data they verify. */
const SNAPSHOT_FILES = [
  ['data/journey2/map-template.json', 'runtime map template (regenerated: only the verification slots differ from the pre-correction file)'],
  ['data/journey2/map-anchors.json', 'runtime marker catalogue (byte-identical to the pre-correction file)'],
  ['css/journey2.css', 'print block carries the color-scheme fix (see the @media print section)'],
  ['scripts/build.js', 'deploy copy with the Journey 2 development-material exclusion'],
  ['scripts/check-journey2-build.js', 'build-output regression check (new)'],
  ['scripts/journey2/lib/csv.js', 'RFC 4180 serializer/parser (new)'],
  ['scripts/journey2/lib/validate-holdout-csv.js', 'hold-out CSV validator (new)'],
  ['scripts/journey2/lib/pdf-checks.js', 'PDF placement/margin/paint analysis (new)'],
  ['scripts/journey2/verify-template.js', 'uses the CSV serializer; --out; CSV validation inside the geometry slot'],
  ['scripts/journey2/verify-print.js', 'rewritten print verification'],
  ['scripts/journey2/inspect-pdf.js', 'rewritten: correct top-left placement'],
  ['scripts/journey2/print-proof.js', 'exports the proof PDF with background printing on and off (new)'],
  ['scripts/journey2/browser-verify.js', '--out; print-media paint/restoration assertions; late-load flake fix'],
  ['scripts/journey2/build-template.js', '--verification <stage dir>'],
  ['tests/journey2-stage0a.test.js', 'regression tests (new)'],
  ['.github/workflows/deploy.yml', 'adds the build-output check to the CI chain'],
];

fs.rmSync(SNAP, { recursive: true, force: true });
const manifest = [];
for (const [src, note] of SNAPSHOT_FILES) {
  const from = path.join(ROOT, src), to = path.join(SNAP, src);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  manifest.push({ sourcePath: src, snapshotPath: 'review-snapshots/' + src, sha256: sha(from), bytes: fs.statSync(from).size, note });
}
fs.writeFileSync(path.join(SNAP, 'SNAPSHOTS.json'), JSON.stringify({ label: 'REVIEW-ONLY EVIDENCE COPIES. The repository files named in sourcePath are the runtime/source of truth; do not load these.', files: manifest }, null, 1) + '\n');

/* Patch: tracked files via git diff; new/untracked files as additions; css/journey2.css as the one-hunk change. */
const tracked = ['scripts/build.js', '.github/workflows/deploy.yml'];
let patch = '# Task 01A working-tree patch\n# (1) tracked files\n' + git('diff', '--', ...tracked);
const untracked = ['scripts/check-journey2-build.js', 'scripts/journey2/lib/csv.js', 'scripts/journey2/lib/validate-holdout-csv.js', 'scripts/journey2/lib/pdf-checks.js', 'scripts/journey2/print-proof.js', 'tests/journey2-stage0a.test.js'];
patch += '\n# (2) new files\n' + untracked.map(f => git('diff', '--no-index', '--', process.platform === 'win32' ? 'NUL' : '/dev/null', f)).join('');
const cssNow = fs.readFileSync(path.join(ROOT, 'css', 'journey2.css'), 'utf8');
const cssBefore = cssNow.replace(/  \/\* The theme is `color-scheme: dark`[\s\S]*?\*\/\n  :root:has\(body\.j2-print-mode\) \{ color-scheme: light; background: #fff !important; \}/, '  :root:has(body.j2-print-mode) { background: #fff !important; }');
const tmp = path.join(require('os').tmpdir(), 'j2-css-before.css'); fs.writeFileSync(tmp, cssBefore);
patch += '\n# (3) css/journey2.css (untracked file; diff against the pre-correction print block)\n' + git('diff', '--no-index', '--', tmp, path.join(ROOT, 'css', 'journey2.css')).replace(/a\/.*j2-css-before\.css/g, 'a/css/journey2.css').replace(/b\/.*css\/journey2\.css/g, 'b/css/journey2.css');
patch += '\n# NOTE: scripts/journey2/{verify-template,browser-verify,build-template,verify-print,inspect-pdf}.js are untracked in this working tree and were modified in place;\n# their pre-correction text is not in git, so their full current text is in review-snapshots/ instead of a diff.\n';
fs.writeFileSync(path.join(OUT, 'working-tree.patch'), patch);

/* Provenance. */
const hashes = {};
for (const f of ['docs/journey2-implementation/stage-0/print/journey2-print-proof.pdf', 'docs/journey2-implementation/stage-0/data/hold-out-verification.csv', 'docs/journey2-implementation/stage-0/data/geometry-verification.json', 'docs/journey2-implementation/stage-0/data/control-points.json', 'docs/journey2-implementation/stage-0/print/print-proof-pdf-analysis.json', 'img/journey2/valloren-world.webp',
  'docs/journey2-implementation/stage-0a/print/journey2-print-proof.pdf', 'docs/journey2-implementation/stage-0a/print/journey2-print-proof-nobg.pdf', 'docs/journey2-implementation/stage-0a/data/hold-out-verification.csv', 'docs/journey2-implementation/stage-0a/data/geometry-verification.json']) hashes[f] = fs.existsSync(path.join(ROOT, f)) ? sha(path.join(ROOT, f)) : null;
const status = git('status', '--short').split('\n').filter(Boolean).filter(l => !l.includes('journey2-implementation/stage-0a'));
fs.writeFileSync(path.join(OUT, 'provenance.json'), JSON.stringify({
  generatedBy: 'scripts/journey2/package-stage-0a.js',
  generatedAt: new Date().toISOString(),
  baseRevision: git('rev-parse', 'HEAD').trim(), baseSubject: git('log', '-1', '--format=%s').trim(), branch: git('rev-parse', '--abbrev-ref', 'HEAD').trim(),
  note: 'Task 01A work is uncommitted on top of baseRevision (not pushed, not deployed). Journey 2 Stage 0 itself is also uncommitted; sha256 values below tie the evidence to files in that working tree.',
  workingTreeStatusExcludingThisFolder: status,
  sha256: hashes,
  tools: { node: process.version, playwright: require('playwright/package.json').version, chromium: '141.0.7390.37 (Playwright bundled)', pdfjsDist: '3.11.174 (installed outside the project)', napiRsCanvas: 'installed outside the project' },
}, null, 1) + '\n');
console.log('snapshots:', manifest.length, '| patch bytes:', patch.length);
