#!/usr/bin/env node
/* ============================================================
   Daggerheart Atlas — build.js
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

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDE_DIRS.has(entry.name)) continue;
    if (!entry.isDirectory() && EXCLUDE_FILES.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyTree(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
copyTree(ROOT, OUT);

console.log('Built dist/ (copy-only, no prerendering)');
