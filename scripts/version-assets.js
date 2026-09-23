#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — version-assets.js
   Runs in CI (see .github/workflows/deploy.yml) after scripts/build.js.
   Computes deterministic content hashes for the copied dist/ artifact and
   writes them into dist/index.html — it never touches source files.

   See the "Automatic asset versioning" section in CLAUDE.md for the full
   contract. scripts/check-asset-versioning.js verifies the result.
   ============================================================ */
'use strict';

const path = require('path');
const { versionProductionArtifact, AssetVersioningError } = require('./lib/asset-versioning');

function main() {
  const distRoot = path.join(__dirname, '..', 'dist');
  try {
    const { uiVersion, dataVersion } = versionProductionArtifact(distRoot);
    console.log(`UI version:   ${uiVersion}`);
    console.log(`Data version: ${dataVersion}`);
    console.log('Applied cache versions to dist/index.html');
  } catch (err) {
    const message = err instanceof AssetVersioningError ? err.message : `Unexpected failure: ${err.message}`;
    console.error(`ERROR: ${message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
