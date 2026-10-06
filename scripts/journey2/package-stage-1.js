#!/usr/bin/env node
/* Dev-only. Assembles the machine-written parts of the Stage 1 review package under
   docs/journey2-implementation/stage-1/: provenance.json (base revision, working-tree status, sha256), the
   working-tree patches, and REVIEW-ONLY snapshots of the new/changed Journey editor sources (never imported
   by the runtime). The hand-written README.md / IMPLEMENTATION_REPORT.md are not touched. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'journey2-implementation', 'stage-1');
const SNAP = path.join(OUT, 'review-snapshots');
const git = args => cp.spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');

/* New or changed by Task 02 (and the Gate 0 corrections). */
const SNAPSHOT_FILES = [
  ['js/journey2-model.js', 'new: document, placement policy, commands, history, footprint, validation (pure)'],
  ['js/journey2-store.js', 'new: local persistence over safe-storage (storage injected)'],
  ['js/journey2-view.js', 'rewritten: editor view; Phase 0 diagnostics moved behind More > Diagnostics'],
  ['css/journey2.css', 'rewritten screen styles; the @media print block (color-scheme fix) is unchanged'],
  ['scripts/build.js', 'Gate 0: host-independent normalizeRelPath(); stage-<n>[a].zip exclusion'],
  ['scripts/check-journey2-build.js', 'Gate 0: guard scoped to Journey development inputs; run() + findForbiddenJourneyFiles() testable'],
  ['tests/journey2-model.test.js', 'new: model / policy / commands / history / validation / glyph-protection property tests'],
  ['tests/journey2-store.test.js', 'new: persistence contract with a fake failing Storage'],
  ['tests/journey2-build-guard.test.js', 'new: Gate 0 separator + scoped-guard fixtures'],
  ['tests/journey2-stage0a.test.js', 'unchanged by Task 02 (kept: still asserts the Windows-separator exclusion)'],
  ['scripts/journey2/stage1-verify.js', 'new: Stage 1 browser verification (real pointer input)'],
  ['scripts/journey2/browser-verify.js', 'adapted: Phase 0 behaviours reached through the Diagnostics drawer; storage assertion updated'],
  ['scripts/journey2/record-demo.js', 'new: drag demonstration recorder'],
  ['scripts/journey2/package-stage-1.js', 'new: this packager'],
  ['scripts/journey2/lib/static-server.js', 'new: throw-away static server for the verification scripts'],
  ['index.html', 'two new <script> tags (model, store)'],
  ['.claude/rules/build-and-deploy.md', 'rule text updated (host-independent matching, scoped guard)'],
  ['.claude/rules/browser-state.md', 'new "Journey 2 map storage" rules'],
  ['CLAUDE.md', 'new "Journey 2 map editor" index entry'],
];
const NEW_FILE_PATCH = ['js/journey2-model.js', 'js/journey2-store.js', 'js/journey2-view.js', 'css/journey2.css', 'scripts/check-journey2-build.js',
  'scripts/journey2/stage1-verify.js', 'scripts/journey2/record-demo.js', 'scripts/journey2/package-stage-1.js', 'scripts/journey2/lib/static-server.js',
  'tests/journey2-model.test.js', 'tests/journey2-store.test.js', 'tests/journey2-build-guard.test.js'];

fs.rmSync(SNAP, { recursive: true, force: true });
const files = [];
for (const [f, note] of SNAPSHOT_FILES) {
  const src = path.join(ROOT, f), dest = path.join(SNAP, f);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  files.push({ sourcePath: f, snapshotPath: 'review-snapshots/' + f, sha256: sha(src), bytes: fs.statSync(src).size, note });
}
/* excerpts of the large shared files (the full diff is in working-tree.patch) */
{
  const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
  const a = app.indexOf('/** #/journey2 — the Journey 2 map editor'), b = app.indexOf('function journeyPanelHtml(kind)');
  const d = path.join(SNAP, 'js'); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'app.journey2-excerpt.js'), '/* REVIEW-ONLY EXCERPT of js/app.js (renderJourney2Page + the journey2Generator adapter). Not a module. */\n' + app.slice(a, b));
  files.push({ sourcePath: 'js/app.js', snapshotPath: 'review-snapshots/js/app.journey2-excerpt.js', sha256: sha(path.join(ROOT, 'js', 'app.js')), bytes: fs.statSync(path.join(ROOT, 'js', 'app.js')).size, note: 'EXCERPT only (sha256/bytes are of the full js/app.js): renderJourney2Page + journey2Generator adapter over the existing rolls' });
  const i18n = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'i18n.json'), 'utf8'));
  const ex = {}; for (const lang of ['en', 'ru']) { ex[lang] = {}; for (const k of Object.keys(i18n[lang])) if (k.startsWith('journey2_')) ex[lang][k] = i18n[lang][k]; }
  fs.mkdirSync(path.join(SNAP, 'data'), { recursive: true });
  fs.writeFileSync(path.join(SNAP, 'data', 'i18n.journey2-keys.json'), JSON.stringify(ex, null, 1) + '\n');
  files.push({ sourcePath: 'data/i18n.json', snapshotPath: 'review-snapshots/data/i18n.journey2-keys.json', sha256: sha(path.join(ROOT, 'data', 'i18n.json')), bytes: fs.statSync(path.join(ROOT, 'data', 'i18n.json')).size, note: 'EXCERPT only: every journey2_* key in both languages' });
}
fs.writeFileSync(path.join(SNAP, 'SNAPSHOTS.json'), JSON.stringify({
  label: 'REVIEW-ONLY EVIDENCE COPIES. The repository files named in sourcePath are the runtime/source of truth; never import or load these.',
  files,
}, null, 1) + '\n');

/* patches */
const tracked = git(['diff', 'HEAD', '--no-color', '--', '.claude', '.github', 'CLAUDE.md', 'data/i18n.json', 'docs/architecture.md', 'docs/manual-qa.md', 'docs/product-decisions.md', 'index.html', 'js/app.js', 'js/route-utils.js', 'scripts/build.js', 'tests/routing.test.js']).stdout;
let created = '';
for (const f of NEW_FILE_PATCH) created += git(['diff', '--no-index', '--no-color', '--', '/dev/null', f]).stdout;
fs.writeFileSync(path.join(OUT, 'working-tree.patch'), '# Diff against base revision (HEAD) of the working tree: modified tracked files first, then new Journey editor files.\n# NOTE: the base working tree already carried uncommitted Stage 0/0a work (see provenance.json); those hunks appear here too.\n# Not included: data/journey2/*, img/journey2/*, docs/journey2-* evidence, handoff assets (unchanged or not source).\n' + tracked + created);

/* provenance */
const status = git(['status', '--short']).stdout.split('\n').filter(l => l && !/docs\/journey2-implementation\/stage-1/.test(l) && !/stage-1\.zip/.test(l));
let chromiumVersion = null;
try { const { chromium } = require('playwright'); const br = require('child_process').spawnSync(process.execPath, ['-e', "require('playwright').chromium.launch().then(b=>{console.log(b.version());return b.close()})"], { cwd: ROOT, encoding: 'utf8' }); chromiumVersion = (br.stdout || '').trim() || null; void chromium; } catch (e) { /* optional */ }
const keyHashes = {};
for (const f of ['data/journey2/map-template.json', 'data/journey2/map-anchors.json', 'data/journey2/symbols.json', 'js/journey2-geometry.js', 'img/journey2/valloren-world.webp']) keyHashes[f] = sha(path.join(ROOT, f));
const stage0a = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'journey2-implementation', 'stage-0a', 'review-snapshots', 'SNAPSHOTS.json'), 'utf8'));
const s0aHash = f => (stage0a.files.find(x => x.sourcePath === f) || {}).sha256 || null;
const hashFiles = {};
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (!/provenance\.json$/.test(p)) hashFiles[rel(p)] = sha(p); } };
walk(OUT);
fs.writeFileSync(path.join(OUT, 'provenance.json'), JSON.stringify({
  generatedBy: 'scripts/journey2/package-stage-1.js', generatedAt: new Date().toISOString(),
  baseRevision: git(['rev-parse', 'HEAD']).stdout.trim(), baseSubject: git(['log', '-1', '--format=%s']).stdout.trim(), branch: git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim(),
  note: 'Stage 1 work is uncommitted on top of baseRevision (not pushed, not deployed). Journey 2 Stage 0/0a is also uncommitted; sha256 values tie the evidence to files in this working tree.',
  tooling: { node: process.version, playwright: require('playwright/package.json').version, chromium: chromiumVersion, os: process.platform, pdfTooling: 'pdfjs-dist@3.11.174 + @napi-rs/canvas installed outside the repository (scratch) and supplied through NODE_PATH' },
  workingTreeStatusExcludingThisPackage: status,
  preservedFoundation: {
    runtimeSha256: keyHashes,
    stage0aSnapshotSha256: { 'data/journey2/map-template.json': s0aHash('data/journey2/map-template.json'), 'data/journey2/map-anchors.json': s0aHash('data/journey2/map-anchors.json') },
    templateIdenticalToStage0a: keyHashes['data/journey2/map-template.json'] === s0aHash('data/journey2/map-template.json'),
    anchorsIdenticalToStage0a: keyHashes['data/journey2/map-anchors.json'] === s0aHash('data/journey2/map-anchors.json'),
    note: 'The raster, symbols, geometry module, measured template (incl. its verification slots) and anchor catalogue were NOT modified by Task 02.',
  },
  sha256: hashFiles,
}, null, 1) + '\n');
console.log('package parts written:', files.length, 'snapshots;', Object.keys(hashFiles).length, 'hashed files');
