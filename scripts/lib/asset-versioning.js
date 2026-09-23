#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — lib/asset-versioning.js
   Shared, dependency-free implementation of the deterministic
   content-hash cache-busting scheme. Consumed by:

   - scripts/version-assets.js       (writes versions into dist/index.html)
   - scripts/check-asset-versioning.js (re-derives them to verify dist/)
   - tests/asset-versioning.test.js  (exercises the pure functions directly)

   Nothing here reads or writes files outside the `dist/` root it is given —
   see the "Automatic asset versioning" section in CLAUDE.md for the full
   contract this implements.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HASH_LENGTH = 16; // first 16 hex chars of SHA-256 — 64 bits, plenty to
                         // avoid accidental collisions for a cache key that
                         // isn't a security token, short enough to read.
const VERSION_PATTERN = new RegExp(`^[a-f0-9]{${HASH_LENGTH}}$`);

class AssetVersioningError extends Error {}

/* ---------------- file collection ---------------- */

/* Recursively collects files under `root/subdir` whose extension (lowercased,
   including the dot) is in `extensions`. Returned relPath is relative to
   `root` (not `subdir`) with path separators normalized to '/', so the
   directory context ("css/…" vs "js/…") participates in the hash. Silently
   returns [] if `subdir` doesn't exist — callers decide whether that's an
   error. */
function collectFiles(root, subdir, extensions) {
  const searchRoot = path.join(root, subdir);
  const results = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!extensions.includes(path.extname(entry.name).toLowerCase())) continue;
      const relPath = path.relative(root, abs).split(path.sep).join('/');
      results.push({ relPath, absPath: abs });
    }
  }

  walk(searchRoot);
  return results;
}

/* ---------------- content hashing ---------------- */

/* Deterministic across traversal order, OS path separators, and file
   layout: paths are sorted lexicographically first, and each entry is fed
   into the hash as an explicit-length path followed by an explicit-length
   body, so there is no ambiguous byte boundary between "path" and
   "contents" (a length-prefixed path can't be confused with file bytes that
   merely start with the same characters as the next path). */
function calculateContentHash(files) {
  const sorted = [...files].sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
  const hash = crypto.createHash('sha256');
  for (const file of sorted) {
    const pathBuffer = Buffer.from(file.relPath, 'utf8');
    const contents = fs.readFileSync(file.absPath);
    const pathLength = Buffer.alloc(4);
    pathLength.writeUInt32BE(pathBuffer.length, 0);
    const contentLength = Buffer.alloc(4);
    contentLength.writeUInt32BE(contents.length, 0);
    hash.update(pathLength);
    hash.update(pathBuffer);
    hash.update(contentLength);
    hash.update(contents);
  }
  return hash.digest('hex').slice(0, HASH_LENGTH);
}

function calculateUiVersion(distRoot) {
  const files = [
    ...collectFiles(distRoot, 'css', ['.css']),
    ...collectFiles(distRoot, 'js', ['.js']),
  ];
  if (files.length === 0) {
    throw new AssetVersioningError(
      'Cannot calculate UI version because no CSS or JavaScript files were found in dist/.'
    );
  }
  return calculateContentHash(files);
}

function calculateDataVersion(distRoot) {
  const files = collectFiles(distRoot, 'data', ['.json']);
  if (files.length === 0) {
    throw new AssetVersioningError(
      'Cannot calculate data version because no JSON files were found in dist/data.'
    );
  }
  return calculateContentHash(files);
}

/* ---------------- URL versioning ---------------- */

function isExternalUrl(value) {
  return /^([a-z][a-z0-9+.-]*:)?\/\//i.test(value) || value.startsWith('data:');
}

/* Pure: appends or replaces a `v` query parameter, preserving any other
   query parameters and a URL fragment. Idempotent — calling it twice with
   the same version reproduces the same string, since a stale `v` param is
   filtered out before the new one is appended. */
function withVersionParam(rawValue, version) {
  const hashIndex = rawValue.indexOf('#');
  const fragment = hashIndex === -1 ? '' : rawValue.slice(hashIndex);
  const withoutFragment = hashIndex === -1 ? rawValue : rawValue.slice(0, hashIndex);
  const [pathPart, queryPart = ''] = withoutFragment.split('?');
  const params = queryPart.length ? queryPart.split('&').filter(Boolean) : [];
  const filtered = params.filter(p => !p.startsWith('v='));
  filtered.push(`v=${version}`);
  return `${pathPart}?${filtered.join('&')}${fragment}`;
}

/* ---------------- HTML rewriting ---------------- */

function replaceMetaContent(html, name, value) {
  const tagPattern = new RegExp(`<meta\\s+name="${name}"[^>]*>`, 'gi');
  const matches = html.match(tagPattern) || [];
  if (matches.length !== 1) {
    throw new AssetVersioningError(
      `Expected exactly one <meta name="${name}"> tag, found ${matches.length}.`
    );
  }
  const tag = matches[0];
  if (!/content="[^"]*"/.test(tag)) {
    throw new AssetVersioningError(`<meta name="${name}"> is missing a content attribute.`);
  }
  const newTag = tag.replace(/content="[^"]*"/, `content="${value}"`);
  return html.replace(tag, newTag);
}

function rewriteMarkedTag(tag, version, distRoot) {
  const attrMatch = tag.match(/\s(href|src)="([^"]*)"/);
  if (!attrMatch) {
    throw new AssetVersioningError(`Element marked data-cache-version="ui" has no href/src: ${tag}`);
  }
  const [, attrName, rawValue] = attrMatch;
  if (isExternalUrl(rawValue)) return tag; // never version an external URL

  const filePath = rawValue.split(/[?#]/)[0];
  const absPath = path.resolve(distRoot, filePath);
  const distRootResolved = path.resolve(distRoot);
  if (absPath !== distRootResolved && !absPath.startsWith(distRootResolved + path.sep)) {
    throw new AssetVersioningError(`Marked asset path escapes dist/: ${rawValue}`);
  }
  if (!fs.existsSync(absPath)) {
    throw new AssetVersioningError(`Marked local asset does not exist: ${rawValue}`);
  }

  const newValue = withVersionParam(rawValue, version);
  return tag.replace(`${attrName}="${rawValue}"`, `${attrName}="${newValue}"`);
}

/* Rewrites dist/index.html in memory: fills the two version meta tags and
   appends `v=<uiVersion>` to every local <link>/<script> marked
   data-cache-version="ui". Never touches an unmarked or external element. */
function versionHtml(html, { uiVersion, dataVersion, distRoot }) {
  let result = replaceMetaContent(html, 'atlas-ui-version', uiVersion);
  result = replaceMetaContent(result, 'atlas-data-version', dataVersion);
  result = result.replace(/<(?:link|script)\b[^>]*>/gi, tag => {
    if (!/data-cache-version="ui"/.test(tag)) return tag;
    return rewriteMarkedTag(tag, uiVersion, distRoot);
  });
  return result;
}

/* Orchestrates the whole post-build step against a dist/ directory:
   compute both hashes, rewrite dist/index.html, write it back. */
function versionProductionArtifact(distRoot) {
  if (!fs.existsSync(distRoot)) {
    throw new AssetVersioningError(`dist/ does not exist at ${distRoot} — run scripts/build.js first.`);
  }
  const indexPath = path.join(distRoot, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new AssetVersioningError(`${indexPath} does not exist.`);
  }

  const uiVersion = calculateUiVersion(distRoot);
  const dataVersion = calculateDataVersion(distRoot);
  const html = fs.readFileSync(indexPath, 'utf8');
  const versioned = versionHtml(html, { uiVersion, dataVersion, distRoot });
  fs.writeFileSync(indexPath, versioned, 'utf8');

  return { uiVersion, dataVersion };
}

module.exports = {
  HASH_LENGTH,
  VERSION_PATTERN,
  AssetVersioningError,
  collectFiles,
  calculateContentHash,
  calculateUiVersion,
  calculateDataVersion,
  isExternalUrl,
  withVersionParam,
  replaceMetaContent,
  versionHtml,
  versionProductionArtifact,
};
