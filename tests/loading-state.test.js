/* ============================================================
   Bacchus's Atlas — tests/loading-state.test.js
   Dependency-free regression tests for the static initial loading shell
   (see "Initial loading shell" in CLAUDE.md). Run with:

     node --test tests/loading-state.test.js

   These inspect source files (index.html, js/app.js) as plain text — no
   jsdom, no browser — plus the production artifact produced by the real
   scripts/build.js and scripts/check-unlisted-build.js (never
   reimplemented here). Nothing under version control is modified; dist/
   is gitignored build output and is rebuilt the same way CI rebuilds it.
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const APP_JS = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

/* The static shell region: from the toolbar container through the end of
 * <main>, i.e. toolbar skeleton + result-count status + grid skeleton. */
const mainStart = INDEX_HTML.indexOf('<div id="toolbar"');
const mainEnd = INDEX_HTML.indexOf('</main>');
assert.ok(mainStart !== -1 && mainEnd !== -1, 'fixture assumption: index.html has a #toolbar div inside <main>');
const SHELL_REGION = INDEX_HTML.slice(mainStart, mainEnd);

/* ---------------- source HTML: shell presence & shape ---------------- */

test('index.html contains exactly one initial toolbar loading shell', () => {
  assert.equal(countOccurrences(INDEX_HTML, 'data-initial-loading="toolbar"'), 1);
});

test('index.html contains exactly one initial grid loading shell', () => {
  assert.equal(countOccurrences(INDEX_HTML, 'data-initial-loading="grid"'), 1);
});

test('the initial grid shell contains exactly six generic skeleton cards', () => {
  const gridStart = INDEX_HTML.indexOf('data-initial-loading="grid"');
  const gridEnd = INDEX_HTML.indexOf('</div>', INDEX_HTML.indexOf('</div>', gridStart) + 1);
  // Walk forward to the closing tag of #grid-wrap itself: count sk-card
  // children between the grid shell's opening tag and </main>.
  const gridRegion = INDEX_HTML.slice(gridStart, mainEnd);
  assert.equal(countOccurrences(gridRegion, 'class="sk sk-card"'), 6);
});

test('the initial toolbar shell contains generic field placeholders, no real controls', () => {
  assert.equal(countOccurrences(SHELL_REGION, 'class="sk sk-field'), 4);
});

test('skeleton elements are aria-hidden', () => {
  const sample = SHELL_REGION.match(/<div class="sk sk-card"[^>]*>/)[0];
  assert.match(sample, /aria-hidden="true"/);
  const toolbarWrap = SHELL_REGION.match(/<div class="skeleton-toolbar[^>]*>/)[0];
  assert.match(toolbarWrap, /aria-hidden="true"/);
});

test('the toolbar and grid loading regions are aria-busy in source HTML', () => {
  assert.match(SHELL_REGION, /<div id="toolbar" aria-busy="true">/);
  assert.match(SHELL_REGION, /id="grid-wrap"[^>]*aria-busy="true"/);
});

test('the shell region contains no focusable controls', () => {
  assert.doesNotMatch(SHELL_REGION, /<button/);
  assert.doesNotMatch(SHELL_REGION, /<a\s/);
  assert.doesNotMatch(SHELL_REGION, /<input/);
  assert.doesNotMatch(SHELL_REGION, /tabindex/);
});

test('skeleton elements contain no environment IDs or links', () => {
  assert.doesNotMatch(SHELL_REGION, /data-id="/);
  assert.doesNotMatch(SHELL_REGION, /data-open-env/);
  assert.doesNotMatch(SHELL_REGION, /card-open/);
  assert.doesNotMatch(SHELL_REGION, /#\/env\//);
});

test('source index.html contains no prerendered environment-card markup', () => {
  assert.doesNotMatch(INDEX_HTML, /class="card"\s+data-id="/);
  assert.doesNotMatch(INDEX_HTML, /card-open/);
});

test('source index.html contains no sampled environment names or lore', () => {
  const { environments } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'environments.json'), 'utf8'));
  assert.ok(environments.length > 0);
  const sample = [environments[0], environments[Math.floor(environments.length / 2)], environments[environments.length - 1]];
  for (const env of sample) {
    for (const name of [env.name?.en, env.name?.ru].filter(Boolean)) {
      if (name.length >= 4) assert.ok(!INDEX_HTML.includes(name), `unexpected environment name "${name}" in index.html`);
    }
  }
});

test('a bilingual pre-i18n loading status exists in #result-count', () => {
  const resultCountStart = INDEX_HTML.indexOf('id="result-count"');
  const resultCountEnd = INDEX_HTML.indexOf('</div>', resultCountStart);
  const region = INDEX_HTML.slice(resultCountStart, resultCountEnd);
  assert.match(region, /sr-only/);
  assert.match(region, /Загрузка/);
  assert.match(region, /Loading/);
});

test('#result-count is a live status region', () => {
  assert.match(INDEX_HTML, /id="result-count" role="status" aria-live="polite"/);
});

test('#main is marked aria-busy in source HTML', () => {
  assert.match(INDEX_HTML, /id="main" tabindex="-1" aria-busy="true"/);
});

test('a bilingual no-script fallback exists and contains no catalog data', () => {
  const noscriptStart = INDEX_HTML.indexOf('<noscript>');
  const noscriptEnd = INDEX_HTML.indexOf('</noscript>');
  assert.ok(noscriptStart !== -1 && noscriptEnd !== -1);
  const region = INDEX_HTML.slice(noscriptStart, noscriptEnd);
  assert.match(region, /JavaScript/);
  assert.match(region, /JavaScript необходимо|включить JavaScript/);
  assert.doesNotMatch(region, /data-open-env/);
  // The fallback hides the shell rather than leaving it animating unexplained.
  assert.match(region, /display:\s*none/);
});

/* ---------------- js/app.js: no destructive re-creation ---------------- */

test('js/app.js no longer builds skeleton markup at all', () => {
  assert.doesNotMatch(APP_JS, /sk-card/);
  assert.doesNotMatch(APP_JS, /skeleton-toolbar/);
  assert.doesNotMatch(APP_JS, /sk-field/);
});

test('js/app.js does not reassign #toolbar or #grid-wrap innerHTML to skeleton markup after i18n', () => {
  assert.doesNotMatch(APP_JS, /getElementById\('toolbar'\)\.innerHTML = `\s*<div class="skeleton-toolbar/);
  assert.doesNotMatch(APP_JS, /Array\.from\(\{ length: 6 \}/);
});

test('js/app.js still localizes the loading status via t(\'loading\')', () => {
  assert.match(APP_JS, /function localizeInitialLoading\(\)\s*\{[^}]*t\('loading'\)/);
});

test('the loading lifecycle functions exist and touch aria-busy, not innerHTML, on #toolbar/#grid-wrap', () => {
  for (const name of ['beginInitialLoading', 'finishInitialLoading', 'failInitialLoading']) {
    const match = APP_JS.match(new RegExp(`function ${name}\\(\\)\\s*\\{([\\s\\S]*?)\\n\\}`));
    assert.ok(match, `expected a ${name}() function`);
    assert.match(match[1], /aria-busy/);
    assert.doesNotMatch(match[1], /\.innerHTML/);
  }
});

test('init() begins loading, then finishes it only after a successful render', () => {
  const initBody = APP_JS.match(/async function init\(\)\s*\{([\s\S]*?)\n\}/)[1];
  assert.match(initBody, /beginInitialLoading\(\)/);
  const renderIndex = initBody.indexOf('render();');
  const finishIndex = initBody.indexOf('finishInitialLoading();');
  assert.ok(renderIndex !== -1 && finishIndex !== -1 && finishIndex > renderIndex);
});

test('the normal load-error path clears the loading state', () => {
  const body = APP_JS.match(/function renderLoadError\(err\)\s*\{([\s\S]*?)\n\}/)[1];
  assert.match(body, /failInitialLoading\(\)/);
});

test('the fatal i18n-error path clears the loading state', () => {
  const body = APP_JS.match(/function renderFatalError\(err\)\s*\{([\s\S]*?)\n\}/)[1];
  assert.match(body, /failInitialLoading\(\)/);
});

test('i18n and application-data requests are started without an i18n-first waterfall', () => {
  const initBody = APP_JS.match(/async function init\(\)\s*\{([\s\S]*?)\n\}/)[1];
  const dataPromiseIndex = initBody.indexOf('Promise.all([');
  const i18nAwaitIndex = initBody.indexOf("await getJSON(versionedDataUrl('data/i18n.json'))");
  assert.ok(dataPromiseIndex !== -1 && i18nAwaitIndex !== -1);
  // The data Promise.all is constructed before init() awaits i18n, so both
  // requests are in flight together rather than i18n blocking the rest.
  assert.ok(dataPromiseIndex < i18nAwaitIndex);
});

/* ---------------- production artifact ---------------- */

test('the production build contains the same generic loading shell and passes the unlisted checks', () => {
  execFileSync('node', ['scripts/build.js'], { cwd: ROOT, stdio: 'pipe' });
  const distHtml = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
  assert.equal(countOccurrences(distHtml, 'data-initial-loading="toolbar"'), 1);
  assert.equal(countOccurrences(distHtml, 'data-initial-loading="grid"'), 1);
  assert.equal(countOccurrences(distHtml, 'class="sk sk-card"'), 6);

  // Delegates to the real checker rather than reimplementing its rules here.
  execFileSync('node', ['scripts/check-unlisted-build.js'], { cwd: ROOT, stdio: 'pipe' });
});
