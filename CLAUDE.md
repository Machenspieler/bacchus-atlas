# Bacchus's Atlas

Static site — plain HTML/CSS/JS, no build step. `index.html` loads `css/styles.css`
and `js/app.js` directly; content lives in `data/environments.json` and `data/i18n.json`.

## Branding

The project name is "Bacchus's Atlas" in English and "Атлас Бахуса" in Russian —
both stored in `data/i18n.json` as `app_title`/`app_subtitle` and rendered via
`renderHeader()` in `js/app.js`. The header itself shows a shorter compact
subtitle (`app_subtitle_compact`) inline with the compatibility statement; the
longer `app_subtitle` is for other long-form contexts (metadata, README, About
content). "Daggerheart™ Compatible" (`compatibility_label` in `data/i18n.json`)
is a separate compatibility statement, not part of the project name: it is
never translated, never placed inside the `<h1>` or the logo's accessible name,
and always stays visually secondary to the title (see `.compat-label` in
`css/styles.css` — plain secondary text, not a badge).

Do not use "Daggerheart" as part of the project title, logo, or main brand name.
Do not imitate the official Daggerheart logo or artwork.

This does not mean stripping "Daggerheart" from the project generally — it
remains correct and expected in: the compatibility label itself, source/book
attributions (`source` fields, `footer_note` in `data/i18n.json`), rules
terminology, data imported from Daggerheart-compatible material, and any
documentation describing system compatibility. Don't do a blind find-and-replace
across the repo for a future branding tweak — check each occurrence against
this list first.

## Identity

This project is published under one identity only:

    Machenspieler <machenspieler@gmail.com>

Never write the following anywhere in this project — not in code, comments, commit
messages, commit author/committer fields, documentation, or generated output:

- the name `obfuscated`
- `obfuscated`
- `obfuscated`

This includes any real-name or work-address form of them. The repo-local git config
already sets the correct `user.name` and `user.email`; do not override it, and do not
fall back to a globally configured or auto-detected identity.

## Biome tagging

Every environment in `data/environments.json` carries a `biomes` array. Eleven biomes
describe real terrain and always take priority — check these first, in this order, and
tag any that the card's own text supports:

| id | covers |
| --- | --- |
| `underground` | caves, mines, fungal forests |
| `aquatic` | lake, sea, reef, delta |
| `wetland` | swamp, marsh, bog, fen |
| `grassland` | plains, veldt, savannah |
| `tropical` | jungle, rainforest, mangrove |
| `forest` | deciduous, evergreen, coniferous |
| `drylands` | desert, canyon, prairie, salt flat |
| `rolling` | hills, chaparral, moor, heath |
| `mountain` | plateau, montane, alpine |
| `frozen` | tundra, taiga, glacier |
| `badlands` | volcano, crystalline, barren |

Only when none of the eleven fits does an environment fall back to `settlement` (a
built, inhabited place: city, town, village, market, castle, temple, base) or
`universal`, shown as "Other" (no terrain at all: planar realms, space, dreams,
abstract scenes, and events that could happen anywhere).

Do not add new biome ids. Anything that isn't one of the eleven belongs in
`settlement` or `universal`.

An environment may carry more than one biome. List them most to least characteristic —
the first is the primary, the rest are secondary, tertiary, quaternary. Tag only what
the card's text actually supports; don't guess a terrain from the name alone.

## Automatic asset versioning

Cache-busting is generated at build time from file contents — nobody edits a version
number by hand. Do not add a manually maintained `?v=` query parameter or a
`DATA_VERSION`-style constant anywhere in this project; if a future change needs a new
cache-busted asset, extend the automatic scheme below instead.

There are two independent content hashes, each the first 16 lowercase hex characters
of a SHA-256 over every matching file's normalized relative path and exact bytes
(`scripts/lib/asset-versioning.js`, `calculateContentHash`):

- **UI version** — from every file under `css/**/*.css` and `js/**/*.js`.
- **Data version** — from every file under `data/**/*.json`. Adding a new production
  JSON file under `data/` automatically changes it; nothing else needs updating.

Source `index.html` stays version-free: local CSS/JS elements that need a cache-busted
URL carry `data-cache-version="ui"` instead of a `?v=` query string, and
`<meta name="atlas-ui-version" content="">` / `<meta name="atlas-data-version"
content="">` ship empty. That's what lets `index.html` be opened straight from source —
empty meta values and unversioned local URLs are the expected, safe local-development
state, not an error.

The production pipeline runs, in order:

```bash
node scripts/build.js               # copy-only, as before
node scripts/version-assets.js      # fills in dist/index.html only
node scripts/check-asset-versioning.js
```

`scripts/version-assets.js` computes both hashes from `dist/`, appends `v=<hash>` to
every `data-cache-version="ui"` element's `href`/`src` (replacing any existing `v=`,
never touching an external URL), and writes the two hashes into the version meta tags —
all inside `dist/`, never in the source tree. It is idempotent: running it twice against
the same `dist/` produces the same output. `scripts/check-asset-versioning.js` then
re-derives both hashes independently and fails the build (non-zero exit) if anything
doesn't match — a stale version, a resurrected manual `?v=`/`DATA_VERSION`, a marked
asset that didn't get versioned, or a JSON manifest embedded in `index.html`.

Adding a new local CSS or JavaScript file that the browser must load requires adding it
to `index.html` with the `data-cache-version="ui"` marker — nothing else. It is then
automatically included in the UI hash and gets a `v=` parameter on every build.

Every local JSON request in `js/app.js` goes through `versionedDataUrl()`
(`js/data-version.js`), the one boundary that appends the generated data version — see
`getDataVersion()` there for how it reads `atlas-data-version` and falls back to an
unversioned path when the value is empty or malformed (source `index.html`, or any
build that hasn't run `version-assets.js` yet). Do not concatenate a version onto a
`fetch()` call anywhere else.

## Unlisted deployment — do not undo

The site is deployed public-but-unlisted on purpose (see the "Unlisted public
deployment" section in README.md): `index.html` carries a static `noindex` tag, the
environment catalog is not present in the initial HTML, and `scripts/build.js` only
copies files — it does not prerender anything. `scripts/check-unlisted-build.js` runs
in CI to catch regressions.

Do not add SEO catalog output, crawler-discovery files, JSON-LD environment lists,
`llms.txt`, `sitemap.xml`, or server-side environment prerendering unless the
repository owner explicitly requests that the website become publicly discoverable
again.

## Initial loading shell

`index.html` ships a generic, static loading shell inside `#toolbar` and
`#grid-wrap` (a `.skeleton-toolbar` and six `.sk-card` placeholders, marked
`data-initial-loading="toolbar"`/`"grid"`), present before any JavaScript
runs. It contains no environment data — no names, lore, IDs, or links — so it
stays compatible with the public-but-unlisted deployment above. A bilingual
`<span class="sr-only">` inside `#result-count` and a `<noscript>` fallback
(which hides the shell via an inline `<style>` and shows a compact bilingual
notice) cover screen readers and JavaScript-disabled visitors respectively.

`js/app.js` must not recreate this markup. `init()` starts the i18n and
application-data requests together (no i18n-first waterfall), then:

- `beginInitialLoading()` marks `#main`/`#toolbar`/`#grid-wrap` `aria-busy`;
- `localizeInitialLoading()`, once i18n resolves, only updates the
  `#result-count` status text — it never touches `#toolbar` or `#grid-wrap`;
- `finishInitialLoading()` (success) and `failInitialLoading()` (data-load or
  fatal i18n failure) clear `aria-busy` and the `is-loading` class.

The skeleton markup itself disappears as a side effect of the normal
render/error paths (`renderToolbar()`/`renderGrid()`/`renderLoadError()`/
`renderFatalError()` already replace `#toolbar` and `#grid-wrap`'s contents
unconditionally) — nothing re-injects an identical skeleton after the first
network request. Do not leave `#toolbar` and `#grid-wrap` empty in source
HTML and then inject the same initial skeleton in JS after i18n loads; keep
the generic loading shell static and free of catalog data.

## Production data validation

`scripts/validate-data.js` is a dependency-free, read-only semantic validator
for everything under `data/` (`environments.json`, `regions.json`,
`adversaries.json`, `items.json`, `journey.json`, `i18n.json`). It runs before
the copy-only build (see `.github/workflows/deploy.yml`) and blocks
deployment when it finds an error:

```bash
node scripts/validate-data.js
```

Every production data change must pass this before it ships. Its logic is
covered by `tests/data-validation.test.js` (`node --test tests/*.test.js`),
which imports the validator directly rather than duplicating its rules.

- **Errors vs. warnings**: an error is a broken reference, an unsupported enum
  value, an incomplete Journey roll table, a bilingual EN/RU length mismatch,
  or an i18n key that would resolve to its own raw name — anything that
  crashes rendering, produces a wrong value, or hides content silently.
  Errors block deployment (`process.exitCode = 1`). A warning (e.g. two
  environments sharing a normalized display name under different ids) is
  reported but never blocks deployment.
- **Read-only**: the validator only reads files and reports diagnostics. It
  never rewrites a data file, reorders an array, "fixes" a broken reference,
  or writes a baseline/cache of its own. If it finds a real error in checked-in
  data, fix the data by hand and document the correction — don't weaken the
  rule that caught it.
- **Optional stays optional**: `lore`, `biomes`, `source`,
  `featured_adversaries`, `story_seeds`, `rawText`, and an empty/absent
  Russian translation are all still optional — the validator only checks
  their shape when they're present.
- **Unknown fields are allowed**: the validator never rejects a field it
  doesn't yet know about; the schema is additive, not closed.
- **Cross-file references block deployment**: an unknown environment id in a
  region, an environment in more than one region, an unknown featured
  adversary id, a broken item alias/craft target, or an item crafting cycle
  are all errors.
- **Journey roll tables must have complete coverage**: `habitat` (1–20 via
  ranges), `encounter` (2–14), `terrain` (1–4), `rumors` (1–100), every
  `sanctuary` table (1–its own die), and `nameElements` (1–100) must each
  cover their full range exactly once — no gaps, no duplicates, no
  out-of-range rolls.
- **i18n placeholders must match**: `{n}`-style placeholders must appear the
  same number of times, with the same names, in the English and Russian value
  for a given key.
- **Rich text formatting is never normalized**: Markdown-style bullets,
  numbered lists, line breaks, bold/italic, and dice notation inside bilingual
  text fields are preserved and never rewritten or rejected by the validator.
- **Do not add** a new machine-readable enum, cross-file ID reference, or
  production data file without updating `scripts/validate-data.js` and its
  tests to cover it.

## Safe browser storage

All persisted browser state (`LS_KEYS` in `js/app.js`) must be loaded through the
centralized safe-storage reader in `js/safe-storage.js` (`SafeStorage.loadStoredJson` /
`SafeStorage.readRawFlag`), loaded via its own `<script>` tag before `js/app.js` in
`index.html`. New localStorage keys require an explicit fallback factory and, for
JSON values with real internal structure, a structural validator in
`SafeStorage.validators`. Do not add a direct
`JSON.parse(localStorage.getItem(...))` expression during application startup —
`tests/storage.test.js` asserts that pattern is absent from `js/app.js`.

- **Recovery backup key convention**: before a corrupted or wrong-shaped value under
  key `dhcodex_x` is replaced, its raw string is best-effort backed up under
  `dhcodex_corrupt_backup_x` (see `SafeStorage.backupKeyFor`). At most one backup key
  exists per source key — a later recovery overwrites it rather than adding another.
- One key failing (bad JSON, wrong top-level type, or invalid nested entries) never
  resets another key. Lists, environment-to-list membership, and the two Journey
  tables are each read and sanitized independently.
- Four statuses matter internally: `missing` (no warning, normal default), `valid`
  (used as-is, nothing rewritten), `sanitized` (top-level usable, some invalid nested
  entries dropped — the rest of the value is kept), and `invalid-json`/`invalid-shape`/
  `unavailable` (fallback used). Only `sanitized`/`invalid-*`/`unavailable` show the
  one post-init recovery toast (`reportStorageRecovery()` in `js/app.js`), driven by
  `SafeStorage.getRecoverySummary()`/`recoveryMessageKeys()` — never per-key.
- Writes go through the same module. `js/app.js` never calls `localStorage.setItem`,
  `removeItem`, or `clear()` directly — `tests/storage.test.js` asserts that too. A
  JSON value is written with `SafeStorage.writeJson`; the one raw flag
  (`dhcodex_storage_notice_dismissed`) with `SafeStorage.writeRaw`; an action that
  changes more than one key (deleting a list, creating a list from the "Add to list"
  popup) writes them together with `SafeStorage.writeJsonBatch`, so a failure partway
  through restores the keys that batch already wrote rather than leaving storage
  half-updated. All three return a structured `{ ok, reason }` result and never throw
  — a full storage or serialization failure comes back as data, not an exception, so
  it can never propagate into a UI event handler. `js/app.js`'s own `persist()` /
  `persistRaw()` / `persistBatch()` wrap these, report a failure once through
  `reportStorageWriteFailure()` (which also dedupes: only one write-failure toast is
  ever visible at a time), and hand the result back to the caller.
- A failed write keeps the user's change in memory for the current tab — it is never
  auto-reverted — and skips the corresponding success toast (`list_created`,
  `added_to_list`/`removed_from_list`, `journey_region_saved`/`journey_sanctuary_saved`,
  etc.) in favor of the localized `storage_write_failed_warning` toast, so the UI never
  claims a change is saved when it isn't. This is a distinct situation from the
  startup-recovery warning above: recovery is about data that was already broken
  before this page load, this is about an action just now failing to persist.
- `SafeStorage.getStorage()` only guards obtaining `window.localStorage` itself — it
  does not probe with a test write, so storage that can be read but not written to
  (quota exceeded, a write-blocking privacy mode) still lets existing Lists/Journey
  data load. Read functions catch their own `getItem()` failures; write functions
  catch `setItem()`/`removeItem()` failures independently.
- None of this logs or transmits stored values — only a key name and a failure
  reason ever reach `console.warn` or the recovery log.

## Hash routing

All untrusted hash-route segments must be decoded through the centralized safe
route decoder. The route parser must never call `decodeURIComponent` directly on
an untrusted segment without handling `URIError`. Malformed route components must
fall back independently and must not stop startup or `hashchange` navigation.

`js/route-utils.js` (global `RouteUtils`, loaded before `js/app.js` in
`index.html`) is the one place `location.hash` is decoded:

- `RouteUtils.safeDecodeRouteSegment(rawSegment)` wraps a single
  `decodeURIComponent()` call in a narrow try/catch, returning
  `{ ok: true, value }` or `{ ok: false, value: null }` for malformed percent
  encoding — never partially decoding, never retrying, never falling back to
  the raw undecoded text as an ID. A non-`URIError` exception is rethrown, not
  swallowed.
- `RouteUtils.parseRouteHash(hash)` is the pure route parser: given a
  `location.hash`-shaped string, it returns `{ route, malformed,
  canonicalHash }` and never throws. It has no DOM, application-state, or
  browser-global dependency, which is what makes it directly unit-testable
  (`tests/routing.test.js`) and safe to run before i18n, JSON data, or the
  catalog have loaded.
- `RouteUtils.baseHash(route)` / `RouteUtils.envHash(envId, route)` /
  `RouteUtils.routeToHash(route)` are the pure route-to-hash builders — the
  single boundary where a route becomes a URL, with every dynamic segment run
  through `encodeURIComponent()` exactly once. `js/app.js`'s `baseHash()` /
  `envHash()` are thin wrappers that default their `route` argument to
  `state.route`.

The environment overlay suffix and the base route beneath it (catalog, Lists
overview, an individual list, Journey) are decoded independently: a malformed
`/env/<id>` suffix is dropped without discarding a valid base route, and a
malformed list ID falls back to the Lists overview without discarding a valid
environment overlay on top of it.

`js/app.js` reads the current route only through `readCurrentRoute()`, which
calls `RouteUtils.parseRouteHash(location.hash)` and, when the result is
malformed, repairs the address via `repairHash()` before returning the safe
fallback route. `repairHash()` uses `history.replaceState()` — never
`location.hash = …`, `history.pushState()`, or a reload — so a malformed
address is corrected in place, without adding a history entry or triggering a
second `hashchange`. Every call site that used to call the old unsafe
`parseRoute()` (initial state construction, the `hashchange` listener,
`navigate()`, `dismissDetail()`, `replaceEnv()`, and the "environment not in
the catalog" fallback in `applyDetailRoute()`) now goes through
`readCurrentRoute()` instead.

An unknown-but-validly-decoded environment or list ID is a separate concern
from decoding safety and is handled where it always was — `applyDetailRoute()`
drops an environment ID that isn't in `allEnvs()`, and `render()` falls back to
the Lists overview for a list ID not in `state.lists` — neither of those paths
touches `RouteUtils`.

`js/app.js` also calls `decodeURIComponent()` on `data-adv-rich`, `data-adv-dice`,
and `data-rich-block` attributes when rendering rich text. Those are not route
input: the same function always writes them first with a paired
`encodeURIComponent()` call from internal content (environment/adversary text),
so they stay outside this decoder and are unchanged by this section.
