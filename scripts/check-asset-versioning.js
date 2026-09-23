#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — check-asset-versioning.js
   Runs in CI after scripts/version-assets.js. Re-derives both content
   hashes from the final dist/ artifact and fails the build if anything
   about the cache-busting contract doesn't hold — a stale version, a
   leftover manual `?v=`, a resurrected DATA_VERSION constant, or a marked
   asset that didn't actually get versioned.

   This does not re-implement the hashing algorithm — it imports the same
   pure functions scripts/version-assets.js uses, from
   scripts/lib/asset-versioning.js, so the two can never silently drift
   apart.

   `checkDist()` is the testable core: given a dist/ root and the matching
   source root, it returns a structured { ok, logs } result instead of
   touching process.exit, so tests/asset-versioning.test.js can run it
   against temporary fixtures. The CLI entry point below is a thin wrapper
   over it, guarded by require.main so importing this file never runs it.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  VERSION_PATTERN,
  calculateUiVersion,
  calculateDataVersion,
  collectFiles,
} = require('./lib/asset-versioning');

function readFile(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function metaTags(html, name) {
  const pattern = new RegExp(`<meta\\s+name="${name}"[^>]*>`, 'gi');
  return html.match(pattern) || [];
}

function metaContent(tag) {
  const m = tag.match(/content="([^"]*)"/);
  return m ? m[1] : null;
}

function markedTags(html) {
  return (html.match(/<(?:link|script)\b[^>]*>/gi) || [])
    .filter(tag => /data-cache-version="ui"/.test(tag));
}

function localAttrValue(tag) {
  const m = tag.match(/\s(?:href|src)="([^"]*)"/);
  return m ? m[1] : null;
}

function isExternal(value) {
  return /^([a-z][a-z0-9+.-]*:)?\/\//i.test(value) || value.startsWith('data:');
}

/* Runs every check against `distRoot` (a built + versioned dist/ directory)
   and `sourceRoot` (the matching pre-build source tree). Never throws for
   an expected failure — those are collected into `logs` and reflected in
   `ok`; only a missing dist/index.html short-circuits early. */
function checkDist({ distRoot, sourceRoot }) {
  const logs = [];
  let ok = true;
  const fail = msg => { logs.push(`FAIL: ${msg}`); ok = false; };
  const pass = msg => { logs.push(`PASS: ${msg}`); };

  const distIndexPath = path.join(distRoot, 'index.html');
  if (!fs.existsSync(distIndexPath)) {
    logs.push(`FAIL: ${distIndexPath} does not exist. Run scripts/build.js and scripts/version-assets.js first.`);
    return { ok: false, logs };
  }

  const distHtml = readFile(distIndexPath);

  /* ---- exactly one of each meta tag, correct hex format ---- */

  let uiMetaValue = null;
  let dataMetaValue = null;

  const uiTags = metaTags(distHtml, 'atlas-ui-version');
  if (uiTags.length !== 1) {
    fail(`dist/index.html has ${uiTags.length} <meta name="atlas-ui-version"> tags — expected exactly 1`);
  } else {
    uiMetaValue = metaContent(uiTags[0]);
    if (uiMetaValue && VERSION_PATTERN.test(uiMetaValue)) {
      pass('dist/index.html has exactly one valid atlas-ui-version meta tag');
    } else {
      fail(`atlas-ui-version meta content "${uiMetaValue}" is not a valid ${VERSION_PATTERN.source} hash`);
    }
  }

  const dataTags = metaTags(distHtml, 'atlas-data-version');
  if (dataTags.length !== 1) {
    fail(`dist/index.html has ${dataTags.length} <meta name="atlas-data-version"> tags — expected exactly 1`);
  } else {
    dataMetaValue = metaContent(dataTags[0]);
    if (dataMetaValue && VERSION_PATTERN.test(dataMetaValue)) {
      pass('dist/index.html has exactly one valid atlas-data-version meta tag');
    } else {
      fail(`atlas-data-version meta content "${dataMetaValue}" is not a valid ${VERSION_PATTERN.source} hash`);
    }
  }

  /* ---- versions match a fresh recalculation ---- */

  let freshUiVersion = null;
  let freshDataVersion = null;
  try {
    freshUiVersion = calculateUiVersion(distRoot);
    if (uiMetaValue === freshUiVersion) {
      pass('UI version matches browser-loaded CSS and JavaScript content');
    } else {
      fail(`atlas-ui-version "${uiMetaValue}" does not match recalculated UI hash "${freshUiVersion}"`);
    }
  } catch (err) {
    fail(err.message);
  }

  try {
    freshDataVersion = calculateDataVersion(distRoot);
    if (dataMetaValue === freshDataVersion) {
      pass('Data version matches production JSON content');
    } else {
      fail(`atlas-data-version "${dataMetaValue}" does not match recalculated data hash "${freshDataVersion}"`);
    }
  } catch (err) {
    fail(err.message);
  }

  /* ---- marked local assets versioned exactly once, correctly;
     external assets left alone; nothing required is missing ---- */

  const marked = markedTags(distHtml);
  if (marked.length === 0) {
    fail('dist/index.html has no elements marked data-cache-version="ui"');
  } else {
    for (const tag of marked) {
      const value = localAttrValue(tag);
      if (!value) {
        fail(`marked element has no href/src: ${tag}`);
        continue;
      }
      if (isExternal(value)) {
        if (/[?&]v=/.test(value)) {
          fail(`marked external URL was versioned: ${value}`);
        } else {
          pass(`marked external URL left unversioned: ${value}`);
        }
        continue;
      }
      const vMatches = value.match(/[?&]v=([^&#]*)/g) || [];
      if (vMatches.length !== 1) {
        fail(`${value} should contain exactly one v= parameter, found ${vMatches.length}`);
        continue;
      }
      const vValue = value.match(/[?&]v=([^&#]*)/)[1];
      if (freshUiVersion && vValue === freshUiVersion) {
        pass(`${value} carries the current UI version`);
      } else {
        fail(`${value} carries stale/incorrect version "${vValue}" (expected "${freshUiVersion}")`);
      }
    }
  }

  try {
    const uiFiles = [...collectFiles(distRoot, 'css', ['.css']), ...collectFiles(distRoot, 'js', ['.js'])];
    let missing = false;
    for (const file of uiFiles) {
      if (!distHtml.includes(file.relPath)) {
        fail(`dist/${file.relPath} is not referenced anywhere in dist/index.html`);
        missing = true;
      }
    }
    if (!missing) pass('every dist/css and dist/js file is referenced in dist/index.html');
  } catch (err) {
    fail(err.message);
  }

  /* ---- noindex must still be present ---- */

  const noindexMatches = (distHtml.match(/<meta\s+name="robots"[^>]*>/gi) || []).filter(tag => /noindex/i.test(tag));
  if (noindexMatches.length === 1) {
    pass('dist/index.html still contains exactly one noindex directive');
  } else {
    fail(`dist/index.html has ${noindexMatches.length} noindex directives — expected exactly 1`);
  }

  /* ---- no JSON asset manifest embedded ----
     A manifest looks like {"data/environments.json": "<hash>", ...} — a
     quoted filename used as an object key. A prose comment that merely
     mentions a filename (e.g. explaining where the catalog is fetched from)
     is not a manifest and must not trip this check. */

  const manifestPattern = /"[^"<>]*\.json"\s*:/i;
  if (manifestPattern.test(distHtml)) {
    fail('dist/index.html appears to embed a JSON filename-keyed manifest object');
  } else {
    pass('dist/index.html does not embed a JSON asset manifest');
  }

  /* ---- crawler-discovery files absent ---- */

  for (const relPath of ['llms.txt', 'sitemap.xml', 'robots.txt']) {
    if (fs.existsSync(path.join(distRoot, relPath))) {
      fail(`dist/${relPath} must not be present`);
    } else {
      pass(`dist/${relPath} is absent`);
    }
  }

  /* ---- source index.html carries no manual versions or generated hashes ---- */

  const sourceHtml = readFile(path.join(sourceRoot, 'index.html'));
  if (sourceHtml === null) {
    fail('source index.html does not exist');
  } else {
    const sourceUiTag = metaTags(sourceHtml, 'atlas-ui-version')[0];
    const sourceDataTag = metaTags(sourceHtml, 'atlas-data-version')[0];
    if (!sourceUiTag || !sourceDataTag) {
      fail('source index.html is missing atlas-ui-version or atlas-data-version meta tag');
    } else if (metaContent(sourceUiTag) !== '' || metaContent(sourceDataTag) !== '') {
      fail('source index.html version meta tags must stay empty — generated hashes belong only in dist/index.html');
    } else {
      pass('source index.html version meta tags are empty');
    }

    const sourceMarked = markedTags(sourceHtml);
    const manualVersion = sourceMarked
      .map(localAttrValue)
      .filter(Boolean)
      .filter(value => !isExternal(value) && /[?&]v=/.test(value));
    if (manualVersion.length > 0) {
      fail(`source index.html contains a manually maintained version query: ${manualVersion.join(', ')}`);
    } else {
      pass('source index.html has no manual ?v= query on local assets');
    }
  }

  /* ---- js/app.js has no DATA_VERSION-style constant ---- */

  const appJs = readFile(path.join(sourceRoot, 'js', 'app.js'));
  if (appJs === null) {
    fail('js/app.js does not exist');
  } else {
    if (/\bDATA_VERSION\b/.test(appJs)) {
      fail('DATA_VERSION remains in js/app.js');
    } else {
      pass('js/app.js contains no DATA_VERSION constant');
    }
    if (/const\s+\w*VERSION\w*\s*=\s*\d+/i.test(appJs)) {
      fail('js/app.js still declares a manually maintained numeric *VERSION* constant');
    } else {
      pass('js/app.js declares no manually maintained numeric version constant');
    }
  }

  return { ok, logs };
}

function main() {
  const root = path.join(__dirname, '..');
  const { ok, logs } = checkDist({ distRoot: path.join(root, 'dist'), sourceRoot: root });
  for (const line of logs) {
    (line.startsWith('FAIL') ? console.error : console.log)(line);
  }
  if (!ok) {
    console.error('\nAsset-versioning check failed.');
    process.exitCode = 1;
    return;
  }
  console.log('\nAsset-versioning check passed.');
}

if (require.main === module) {
  main();
}

module.exports = { checkDist, main };
