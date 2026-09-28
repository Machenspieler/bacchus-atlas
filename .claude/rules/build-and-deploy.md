---
paths:
  - "index.html"
  - "scripts/build.js"
  - "scripts/version-assets.js"
  - "scripts/check-asset-versioning.js"
  - "scripts/check-unlisted-build.js"
  - "scripts/lib/**"
  - ".github/workflows/*.yml"
---

# Build, versioning, and deployment conventions

- **Never hand-maintain a cache-busting version.** Don't add a `?v=`
  query parameter or a `DATA_VERSION`-style constant anywhere — versions
  are generated at build time from file contents by
  `scripts/lib/asset-versioning.js`/`scripts/version-assets.js`. If a new
  kind of asset needs cache-busting, extend that scheme instead of
  hand-rolling one.
- **Source `index.html` stays version-free.** A local `css`/`js` element
  that needs a cache-busted URL carries `data-cache-version="ui"` instead
  of a literal `?v=`; the two `<meta name="atlas-*-version">` tags ship
  empty in source. Both are filled in only inside `dist/index.html`, by
  `scripts/version-assets.js` — never in the source tree.
- **A new local CSS/JS file the browser must load** needs exactly one
  change: add it to `index.html` with `data-cache-version="ui"`. It's then
  automatically included in the UI content hash and versioned on every
  build — nothing else to wire up.
- **Every local JSON fetch in `js/app.js` goes through
  `versionedDataUrl()`** (`js/data-version.js`) — never concatenate a
  version onto a `fetch()` call anywhere else.
- **`scripts/build.js` is copy-only.** It must never grow into a
  prerenderer or start reading `environments.json` to bake HTML — that
  would break the public-but-unlisted deployment model (see
  [docs/product-decisions.md](../../docs/product-decisions.md) PD-003).
- **Don't add SEO/discovery output** — `llms.txt`, `sitemap.xml`, a
  project-level `robots.txt`, JSON-LD catalog listings, or server-side
  environment prerendering — without an explicit product decision
  recorded in `docs/product-decisions.md` first.
- **Run the full verification chain after a relevant change**, in order:
  ```bash
  node --test tests/*.test.js
  node scripts/validate-data.js
  node scripts/build.js
  node scripts/version-assets.js
  node scripts/check-asset-versioning.js
  node scripts/check-unlisted-build.js
  ```
  This is the same sequence `.github/workflows/deploy.yml` runs before
  every deploy — a change that doesn't pass it locally won't deploy either.
- **`dist/` is generated, not tracked.** It's rebuilt fresh by CI on every
  deploy (see `.gitignore`) — don't commit it, and don't hand-edit it as a
  substitute for fixing the source.
