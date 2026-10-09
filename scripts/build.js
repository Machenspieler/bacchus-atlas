#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — build.js
   Runs in CI (see .github/workflows/deploy.yml). Produces dist/ as a
   plain copy of the runtime files — index.html, css/, js/, data/, img/,
   favicons, .nojekyll. It does not read data/environments.json, does not
   generate HTML, and does not touch index.html in any way.

   The site is deployed public-but-unlisted (see the "Unlisted public
   deployment" section in README.md): index.html ships a static noindex
   tag and the catalog renders entirely client-side, so there is nothing
   left for a build step to bake in. scripts/check-unlisted-build.js
   verifies dist/ actually holds to that.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');

/* Directories excluded entirely: dev tooling, CI/editor config, and the
 * crawler-discovery files removed from production (see README.md). */
const EXCLUDE_DIRS = new Set(['.git', '.github', '.claude', 'scripts', 'dist', 'node_modules']);
const EXCLUDE_FILES = new Set(['llms.txt', 'sitemap.xml', 'robots.txt']);

/* Development-only Journey 2 material (source/reference PDFs, the handoff ZIP, mockups, review and
 * implementation evidence packages). It lives under docs/ and at the repo root while the feature is
 * built, and none of it belongs in the published site. Matched on the path relative to the repo root,
 * with forward slashes. Runtime resources (img/journey2/, data/journey2/, js/, css/) never match. */
const EXCLUDE_PATHS = [
  /^docs\/journey2-[^/]*(\/|$)/,   // docs/journey2-handoff/, -implementation/, -review-*/, journey2-handoff*.zip, ...
  /^journey2-[^/]*(\/|$)/,         // repo-root staging folders/files for a Journey 2 package (never img/journey2 or data/journey2)
  /(^|\/)journey2[^/]*\.zip$/i,    // a stray Journey 2 package ZIP anywhere (e.g. journey2-stage0-followup.zip at the root)
  /(^|\/)stage-\d+[a-z]?\.zip$/i,  // review packages named by stage (stage-0.zip, stage-0a.zip, stage-1.zip, ...)
  /^img\/biome-artwork-source(\/|$)/, // 1672x941 PNG masters of the Journey header artwork (~33 MB); the site serves only img/journey2/headers/*.webp
];
/* Host-independent: both separator conventions are folded to '/' before matching, so a Windows-style
 * path gives the same answer on Linux (where path.sep is '/' and a backslash is an ordinary character). */
function normalizeRelPath(relPath) {
  return String(relPath).replace(/\\/g, '/');
}
function isExcluded(relPath) {
  const p = normalizeRelPath(relPath);
  return EXCLUDE_PATHS.some(re => re.test(p));
}

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDE_DIRS.has(entry.name)) continue;
    if (!entry.isDirectory() && EXCLUDE_FILES.has(entry.name)) continue;
    if (isExcluded(path.relative(ROOT, path.join(src, entry.name)))) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyTree(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

if (require.main === module) {
  fs.rmSync(OUT, { recursive: true, force: true });
  copyTree(ROOT, OUT);
  console.log('Built dist/ (copy-only, no prerendering)');
}

module.exports = { isExcluded, normalizeRelPath, EXCLUDE_PATHS };
