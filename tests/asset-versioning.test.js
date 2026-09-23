/* ============================================================
   Dependency-free regression tests for the automatic asset-versioning
   pipeline: scripts/lib/asset-versioning.js, scripts/version-assets.js,
   scripts/check-asset-versioning.js, and the browser-side helper in
   js/data-version.js. Run with:

     node --test tests/*.test.js

   Every test builds its own temporary fixture tree (via fs.mkdtempSync)
   and tears it down afterward — the real repository files are never
   touched.
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  VERSION_PATTERN,
  AssetVersioningError,
  collectFiles,
  calculateContentHash,
  calculateUiVersion,
  calculateDataVersion,
  withVersionParam,
  versionHtml,
  versionProductionArtifact,
} = require('../scripts/lib/asset-versioning');

const { checkDist } = require('../scripts/check-asset-versioning');

/* ---------------- fixture helpers ---------------- */

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-asset-versioning-'));
}

function writeFiles(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

const BASE_INDEX_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="robots" content="noindex, nofollow, nosnippet, noimageindex">
<meta name="atlas-ui-version" content="">
<meta name="atlas-data-version" content="">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Test">
<link rel="stylesheet" href="css/styles.css" data-cache-version="ui">
</head>
<body>
<script src="js/safe-storage.js" data-cache-version="ui"></script>
<script src="js/app.js" data-cache-version="ui"></script>
</body>
</html>
`;

function baseFixtureFiles(overrides = {}) {
  return {
    'index.html': BASE_INDEX_HTML,
    'css/styles.css': 'body { color: red; }',
    'js/safe-storage.js': '// safe storage\n',
    'js/app.js': '// app logic, no manual version constant here\n',
    'data/environments.json': '{"environments":[]}',
    'data/i18n.json': '{"hello":{"en":"hi","ru":"привет"}}',
    ...overrides,
  };
}

/* Builds a source tree and a dist/ copy (simulating the copy-only
   scripts/build.js) under a fresh temp root. Returns { root, src, dist }. */
function makeFixture(overrides = {}) {
  const root = tmpDir();
  const src = path.join(root, 'src');
  const dist = path.join(root, 'dist');
  writeFiles(src, baseFixtureFiles(overrides));
  fs.cpSync(src, dist, { recursive: true });
  return { root, src, dist };
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

/* ================= content hashing ================= */

test('identical files produce an identical UI hash', () => {
  const { root, dist } = makeFixture();
  try {
    assert.equal(calculateUiVersion(dist), calculateUiVersion(dist));
  } finally {
    cleanup(root);
  }
});

test('identical files produce an identical data hash', () => {
  const { root, dist } = makeFixture();
  try {
    assert.equal(calculateDataVersion(dist), calculateDataVersion(dist));
  } finally {
    cleanup(root);
  }
});

test('filesystem traversal order does not affect the hash', () => {
  const files = [
    { relPath: 'css/a.css', absPath: '/dev/null' },
    { relPath: 'css/b.css', absPath: '/dev/null' },
    { relPath: 'js/c.js', absPath: '/dev/null' },
  ];
  const root = tmpDir();
  try {
    writeFiles(root, { 'css/a.css': 'a', 'css/b.css': 'b', 'js/c.js': 'c' });
    const real = files.map(f => ({ relPath: f.relPath, absPath: path.join(root, f.relPath) }));
    const forward = calculateContentHash(real);
    const shuffled = calculateContentHash([...real].reverse());
    assert.equal(forward, shuffled);
  } finally {
    cleanup(root);
  }
});

test('collected relative paths always use forward slashes, regardless of nesting', () => {
  const root = tmpDir();
  try {
    writeFiles(root, { 'css/deep/nested/foo.css': 'x' });
    const files = collectFiles(root, 'css', ['.css']);
    assert.equal(files.length, 1);
    assert.equal(files[0].relPath, 'css/deep/nested/foo.css');
    assert.ok(!files[0].relPath.includes('\\'));
  } finally {
    cleanup(root);
  }
});

test('changing CSS changes the UI hash', () => {
  const { root, dist } = makeFixture();
  try {
    const before = calculateUiVersion(dist);
    fs.writeFileSync(path.join(dist, 'css', 'styles.css'), 'body { color: blue; }');
    const after = calculateUiVersion(dist);
    assert.notEqual(before, after);
  } finally {
    cleanup(root);
  }
});

test('changing JavaScript changes the UI hash', () => {
  const { root, dist } = makeFixture();
  try {
    const before = calculateUiVersion(dist);
    fs.writeFileSync(path.join(dist, 'js', 'app.js'), '// changed\n');
    const after = calculateUiVersion(dist);
    assert.notEqual(before, after);
  } finally {
    cleanup(root);
  }
});

test('changing JSON does not change the UI hash', () => {
  const { root, dist } = makeFixture();
  try {
    const before = calculateUiVersion(dist);
    fs.writeFileSync(path.join(dist, 'data', 'environments.json'), '{"environments":[{"id":"x"}]}');
    const after = calculateUiVersion(dist);
    assert.equal(before, after);
  } finally {
    cleanup(root);
  }
});

test('changing JSON changes the data hash', () => {
  const { root, dist } = makeFixture();
  try {
    const before = calculateDataVersion(dist);
    fs.writeFileSync(path.join(dist, 'data', 'environments.json'), '{"environments":[{"id":"x"}]}');
    const after = calculateDataVersion(dist);
    assert.notEqual(before, after);
  } finally {
    cleanup(root);
  }
});

test('changing CSS does not change the data hash', () => {
  const { root, dist } = makeFixture();
  try {
    const before = calculateDataVersion(dist);
    fs.writeFileSync(path.join(dist, 'css', 'styles.css'), 'body { color: green; }');
    const after = calculateDataVersion(dist);
    assert.equal(before, after);
  } finally {
    cleanup(root);
  }
});

test('adding a new data JSON file changes the data hash', () => {
  const { root, dist } = makeFixture();
  try {
    const before = calculateDataVersion(dist);
    fs.writeFileSync(path.join(dist, 'data', 'regions.json'), '{"regions":[]}');
    const after = calculateDataVersion(dist);
    assert.notEqual(before, after);
  } finally {
    cleanup(root);
  }
});

test('file paths participate in the hash', () => {
  const root = tmpDir();
  try {
    writeFiles(root, { 'css/a.css': 'same-content' });
    const asA = calculateContentHash(collectFiles(root, 'css', ['.css']));
    fs.rmSync(path.join(root, 'css', 'a.css'));
    writeFiles(root, { 'css/b.css': 'same-content' });
    const asB = calculateContentHash(collectFiles(root, 'css', ['.css']));
    assert.notEqual(asA, asB);
  } finally {
    cleanup(root);
  }
});

test('different file layouts with the same concatenated bytes do not collide', () => {
  // Layout A: one file "ab" with content "cd" — naive concatenation "path + content"
  // would read "ab" + "cd" = "abcd".
  // Layout B: one file "a" with content "bcd" — naive concatenation would also
  // read "a" + "bcd" = "abcd". The length-prefixed encoding must keep them distinct.
  const root = tmpDir();
  try {
    const fileA = path.join(root, 'ab');
    const fileB = path.join(root, 'a');
    fs.writeFileSync(fileA, 'cd');
    fs.writeFileSync(fileB, 'bcd');
    const hashA = calculateContentHash([{ relPath: 'ab', absPath: fileA }]);
    const hashB = calculateContentHash([{ relPath: 'a', absPath: fileB }]);
    assert.notEqual(hashA, hashB);
  } finally {
    cleanup(root);
  }
});

test('hash uses the expected lowercase hexadecimal format', () => {
  const { root, dist } = makeFixture();
  try {
    const hash = calculateUiVersion(dist);
    assert.match(hash, VERSION_PATTERN);
    assert.equal(hash, hash.toLowerCase());
    assert.equal(hash.length, 16);
  } finally {
    cleanup(root);
  }
});

test('empty UI input set fails', () => {
  const root = tmpDir();
  try {
    fs.mkdirSync(path.join(root, 'data'), { recursive: true });
    fs.writeFileSync(path.join(root, 'data', 'i18n.json'), '{}');
    assert.throws(() => calculateUiVersion(root), AssetVersioningError);
  } finally {
    cleanup(root);
  }
});

test('empty data input set fails', () => {
  const root = tmpDir();
  try {
    fs.mkdirSync(path.join(root, 'css'), { recursive: true });
    fs.writeFileSync(path.join(root, 'css', 'styles.css'), 'body{}');
    assert.throws(() => calculateDataVersion(root), AssetVersioningError);
  } finally {
    cleanup(root);
  }
});

/* ================= URL / HTML rewriting ================= */

test('withVersionParam appends v= to a bare local path', () => {
  assert.equal(withVersionParam('css/styles.css', 'abc1234567890def'), 'css/styles.css?v=abc1234567890def');
});

test('withVersionParam preserves existing unrelated query parameters', () => {
  assert.equal(withVersionParam('js/app.js?mode=production', 'aaaaaaaaaaaaaaaa'), 'js/app.js?mode=production&v=aaaaaaaaaaaaaaaa');
});

test('withVersionParam replaces an existing v= parameter rather than duplicating it', () => {
  const result = withVersionParam('js/app.js?v=old', 'newversion000000');
  assert.equal((result.match(/v=/g) || []).length, 1);
  assert.equal(result, 'js/app.js?v=newversion000000');
});

test('withVersionParam preserves a URL fragment', () => {
  assert.equal(withVersionParam('css/styles.css#section', 'abc1234567890def'), 'css/styles.css?v=abc1234567890def#section');
});

test('versionHtml versions a marked local stylesheet link', () => {
  const { root, dist } = makeFixture();
  try {
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    const ui = calculateUiVersion(dist);
    const data = calculateDataVersion(dist);
    const out = versionHtml(html, { uiVersion: ui, dataVersion: data, distRoot: dist });
    assert.match(out, new RegExp(`href="css/styles\\.css\\?v=${ui}"`));
  } finally {
    cleanup(root);
  }
});

test('versionHtml versions every marked local script tag', () => {
  const { root, dist } = makeFixture();
  try {
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    const ui = calculateUiVersion(dist);
    const data = calculateDataVersion(dist);
    const out = versionHtml(html, { uiVersion: ui, dataVersion: data, distRoot: dist });
    assert.match(out, new RegExp(`src="js/safe-storage\\.js\\?v=${ui}"`));
    assert.match(out, new RegExp(`src="js/app\\.js\\?v=${ui}"`));
  } finally {
    cleanup(root);
  }
});

test('versionHtml leaves external URLs unchanged', () => {
  const { root, dist } = makeFixture();
  try {
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    const ui = calculateUiVersion(dist);
    const data = calculateDataVersion(dist);
    const out = versionHtml(html, { uiVersion: ui, dataVersion: data, distRoot: dist });
    assert.ok(out.includes('href="https://fonts.googleapis.com/css2?family=Test"'));
  } finally {
    cleanup(root);
  }
});

test('versionHtml fails when the UI meta tag is missing', () => {
  const { root, dist } = makeFixture({
    'index.html': BASE_INDEX_HTML.replace('<meta name="atlas-ui-version" content="">\n', ''),
  });
  try {
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    assert.throws(() => versionHtml(html, { uiVersion: 'a'.repeat(16), dataVersion: 'b'.repeat(16), distRoot: dist }), AssetVersioningError);
  } finally {
    cleanup(root);
  }
});

test('versionHtml fails on a duplicate UI meta tag', () => {
  const { root, dist } = makeFixture({
    'index.html': BASE_INDEX_HTML.replace(
      '<meta name="atlas-ui-version" content="">',
      '<meta name="atlas-ui-version" content=""><meta name="atlas-ui-version" content="">'
    ),
  });
  try {
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    assert.throws(() => versionHtml(html, { uiVersion: 'a'.repeat(16), dataVersion: 'b'.repeat(16), distRoot: dist }), AssetVersioningError);
  } finally {
    cleanup(root);
  }
});

test('versionHtml fails when the data meta tag is missing', () => {
  const { root, dist } = makeFixture({
    'index.html': BASE_INDEX_HTML.replace('<meta name="atlas-data-version" content="">\n', ''),
  });
  try {
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    assert.throws(() => versionHtml(html, { uiVersion: 'a'.repeat(16), dataVersion: 'b'.repeat(16), distRoot: dist }), AssetVersioningError);
  } finally {
    cleanup(root);
  }
});

test('versionHtml fails on a duplicate data meta tag', () => {
  const { root, dist } = makeFixture({
    'index.html': BASE_INDEX_HTML.replace(
      '<meta name="atlas-data-version" content="">',
      '<meta name="atlas-data-version" content=""><meta name="atlas-data-version" content="">'
    ),
  });
  try {
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    assert.throws(() => versionHtml(html, { uiVersion: 'a'.repeat(16), dataVersion: 'b'.repeat(16), distRoot: dist }), AssetVersioningError);
  } finally {
    cleanup(root);
  }
});

/* ================= end-to-end: versionProductionArtifact ================= */

test('running the versioning step twice on the same dist/ is idempotent', () => {
  const { root, src, dist } = makeFixture();
  try {
    const first = versionProductionArtifact(dist);
    const htmlAfterFirst = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    const second = versionProductionArtifact(dist);
    const htmlAfterSecond = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

    assert.deepEqual(first, second);
    assert.equal(htmlAfterFirst, htmlAfterSecond);
    // Three marked elements (css/styles.css, js/safe-storage.js, js/app.js),
    // each carrying exactly one v= parameter — no duplicates from the second run.
    assert.equal((htmlAfterSecond.match(/\?v=/g) || []).length, 3);
    assert.equal((htmlAfterSecond.match(/js\/app\.js\?v=[a-f0-9]{16}/g) || []).length, 1);

    // Source tree untouched.
    assert.equal(fs.readFileSync(path.join(src, 'index.html'), 'utf8'), BASE_INDEX_HTML);
  } finally {
    cleanup(root);
  }
});

test('two consecutive builds from identical source content produce identical versioned output', () => {
  const fixtureA = makeFixture();
  const fixtureB = makeFixture();
  try {
    const resultA = versionProductionArtifact(fixtureA.dist);
    const resultB = versionProductionArtifact(fixtureB.dist);
    assert.deepEqual(resultA, resultB);
    assert.equal(
      fs.readFileSync(path.join(fixtureA.dist, 'index.html'), 'utf8'),
      fs.readFileSync(path.join(fixtureB.dist, 'index.html'), 'utf8')
    );
  } finally {
    cleanup(fixtureA.root);
    cleanup(fixtureB.root);
  }
});

test('versionProductionArtifact fails clearly when dist/ does not exist', () => {
  const root = tmpDir();
  try {
    assert.throws(() => versionProductionArtifact(path.join(root, 'does-not-exist')), AssetVersioningError);
  } finally {
    cleanup(root);
  }
});

/* ================= check-asset-versioning ================= */

test('the final production artifact passes the versioning checker', () => {
  const { root, src, dist } = makeFixture();
  try {
    versionProductionArtifact(dist);
    const { ok, logs } = checkDist({ distRoot: dist, sourceRoot: src });
    assert.equal(ok, true, logs.filter(l => l.startsWith('FAIL')).join('\n'));
  } finally {
    cleanup(root);
  }
});

test('a stale UI query version fails the checker', () => {
  const { root, src, dist } = makeFixture();
  try {
    versionProductionArtifact(dist);
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    const tampered = html.replace(/js\/app\.js\?v=[a-f0-9]{16}/, 'js/app.js?v=0000000000000000');
    fs.writeFileSync(path.join(dist, 'index.html'), tampered);
    const { ok, logs } = checkDist({ distRoot: dist, sourceRoot: src });
    assert.equal(ok, false);
    assert.ok(logs.some(l => l.startsWith('FAIL') && l.includes('stale')));
  } finally {
    cleanup(root);
  }
});

test('a stale data meta version fails the checker', () => {
  const { root, src, dist } = makeFixture();
  try {
    versionProductionArtifact(dist);
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    const tampered = html.replace(/(atlas-data-version" content=")[a-f0-9]{16}(")/, `$1${'0'.repeat(16)}$2`);
    fs.writeFileSync(path.join(dist, 'index.html'), tampered);
    const { ok, logs } = checkDist({ distRoot: dist, sourceRoot: src });
    assert.equal(ok, false);
    assert.ok(logs.some(l => l.startsWith('FAIL') && l.toLowerCase().includes('atlas-data-version')));
  } finally {
    cleanup(root);
  }
});

test('a source manual ?v= query fails the checker', () => {
  const { root, src, dist } = makeFixture();
  try {
    versionProductionArtifact(dist);
    fs.writeFileSync(
      path.join(src, 'index.html'),
      BASE_INDEX_HTML.replace('href="css/styles.css" data-cache-version="ui"', 'href="css/styles.css?v=5" data-cache-version="ui"')
    );
    const { ok, logs } = checkDist({ distRoot: dist, sourceRoot: src });
    assert.equal(ok, false);
    assert.ok(logs.some(l => l.includes('manually maintained version query')));
  } finally {
    cleanup(root);
  }
});

test('a remaining DATA_VERSION constant fails the checker', () => {
  const { root, src, dist } = makeFixture();
  try {
    versionProductionArtifact(dist);
    fs.writeFileSync(path.join(src, 'js', 'app.js'), 'const DATA_VERSION = 42;\n');
    const { ok, logs } = checkDist({ distRoot: dist, sourceRoot: src });
    assert.equal(ok, false);
    assert.ok(logs.some(l => l.includes('DATA_VERSION remains')));
  } finally {
    cleanup(root);
  }
});

test('checkDist fails when dist/index.html does not exist', () => {
  const root = tmpDir();
  try {
    const { ok, logs } = checkDist({ distRoot: path.join(root, 'dist'), sourceRoot: root });
    assert.equal(ok, false);
    assert.ok(logs.some(l => l.startsWith('FAIL')));
  } finally {
    cleanup(root);
  }
});

/* ================= browser-side data URL helper ================= */

const { appendVersionParam, versionedDataUrl, getDataVersion, DATA_VERSION_PATTERN } = require('../js/data-version.js');

function withFakeDocument(metaContentValue, fn) {
  const previous = global.document;
  global.document = {
    querySelector(selector) {
      if (selector === 'meta[name="atlas-data-version"]' && metaContentValue !== null) {
        return { getAttribute: () => metaContentValue };
      }
      return null;
    },
  };
  try {
    return fn();
  } finally {
    if (previous === undefined) delete global.document;
    else global.document = previous;
  }
}

test('appendVersionParam returns the original path for an empty version (local dev)', () => {
  assert.equal(appendVersionParam('data/i18n.json', ''), 'data/i18n.json');
});

test('appendVersionParam appends exactly one generated v= parameter', () => {
  const result = appendVersionParam('data/environments.json', 'abcdef0123456789');
  assert.equal((result.match(/v=/g) || []).length, 1);
  assert.equal(result, 'data/environments.json?v=abcdef0123456789');
});

test('appendVersionParam replaces rather than duplicates an existing v= parameter', () => {
  const result = appendVersionParam('data/environments.json?v=old', 'abcdef0123456789');
  assert.equal((result.match(/v=/g) || []).length, 1);
  assert.equal(result, 'data/environments.json?v=abcdef0123456789');
});

test('appendVersionParam does not touch an external URL', () => {
  assert.equal(appendVersionParam('https://example.com/data.json', 'abcdef0123456789'), 'https://example.com/data.json');
  assert.equal(appendVersionParam('//example.com/data.json', 'abcdef0123456789'), '//example.com/data.json');
});

test('getDataVersion returns "" for an empty or missing meta tag, and never throws', () => {
  withFakeDocument('', () => assert.equal(getDataVersion(), ''));
  withFakeDocument(null, () => assert.equal(getDataVersion(), ''));
  withFakeDocument('not-a-hash', () => assert.equal(getDataVersion(), ''));
});

test('getDataVersion returns the value when it matches the expected hash format', () => {
  const hash = 'abcdef0123456789';
  assert.match(hash, DATA_VERSION_PATTERN);
  withFakeDocument(hash, () => assert.equal(getDataVersion(), hash));
});

test('versionedDataUrl returns the unversioned path in local development (empty meta)', () => {
  withFakeDocument('', () => {
    assert.equal(versionedDataUrl('data/i18n.json'), 'data/i18n.json');
  });
});

test('versionedDataUrl returns a versioned path once a valid data version is published', () => {
  const hash = 'abcdef0123456789';
  withFakeDocument(hash, () => {
    assert.equal(versionedDataUrl('data/i18n.json'), `data/i18n.json?v=${hash}`);
  });
});
