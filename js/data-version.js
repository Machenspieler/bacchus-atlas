/* ============================================================
   Bacchus's Atlas — data-version.js
   Reads the automatically generated data-cache version (see
   scripts/version-assets.js) from <meta name="atlas-data-version"> and
   builds versioned URLs for local JSON requests. Loaded before js/app.js;
   marked data-cache-version="ui" itself in index.html, so it participates
   in the UI content hash like any other local script.

   Source index.html always ships an empty meta value, so local
   development (no build step run) transparently falls back to
   unversioned paths — see the "Automatic asset versioning" section in
   CLAUDE.md.
   ============================================================ */
'use strict';

const DATA_VERSION_PATTERN = /^[a-f0-9]{16}$/;

function getDataVersion() {
  const meta = document.querySelector('meta[name="atlas-data-version"]');
  const value = meta && meta.getAttribute('content') && meta.getAttribute('content').trim();
  return DATA_VERSION_PATTERN.test(value || '') ? value : '';
}

/* Pure: appends/replaces a `v` query parameter on a local path, preserving
   any other query parameters and a URL fragment. Returns `rawPath`
   unchanged for an empty version, an external URL (protocol or
   protocol-relative), or a `data:` URL. */
function appendVersionParam(rawPath, version) {
  if (!version || /^([a-z][a-z0-9+.-]*:)?\/\//i.test(rawPath) || rawPath.indexOf('data:') === 0) {
    return rawPath;
  }
  const hashIndex = rawPath.indexOf('#');
  const fragment = hashIndex === -1 ? '' : rawPath.slice(hashIndex);
  const withoutFragment = hashIndex === -1 ? rawPath : rawPath.slice(0, hashIndex);
  const parts = withoutFragment.split('?');
  const pathPart = parts[0];
  const queryPart = parts[1] || '';
  const params = queryPart.length ? queryPart.split('&').filter(Boolean) : [];
  const filtered = params.filter(p => p.slice(0, 2) !== 'v=');
  filtered.push(`v=${version}`);
  return `${pathPart}?${filtered.join('&')}${fragment}`;
}

function versionedDataUrl(path) {
  return appendVersionParam(path, getDataVersion());
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getDataVersion, appendVersionParam, versionedDataUrl, DATA_VERSION_PATTERN };
}
