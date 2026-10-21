# Bacchus's Atlas

*Атлас Бахуса* — a Daggerheart™ Compatible field guide to environments,
journeys, and perils. It is a bilingual (English / Russian) static website:
a searchable catalogue of environments, personal Lists, a Prep workspace for
assembling a session, and Journey, a GM map editor with a shareable player map.

**Live site:** <https://machenspieler.github.io/bacchus-atlas/> (GitHub Pages).
The site is public but deliberately **unlisted**: it is `noindex` and not
advertised to crawlers, but anyone with the URL can open it (see
[Unlisted public deployment](#unlisted-public-deployment)).

Plain HTML, CSS and JavaScript — no framework, no runtime dependency, no
bundler. Content lives in `data/*.json`; the code is `index.html`,
`css/` and `js/`.

## What's in it

Four pages, reached from the ribbon tabs in the header (the language switch and
a sound-effects panel sit beside them):

- **Catalogue** (`#/`) — environments with search and filters by Tier, type,
  biome and source. The filters are part of the address
  (`#/?tier=1&biome=forest`), so a filtered view can be shared. A card opens a
  detail view with features, story seeds, region links, featured adversaries,
  item cards for loot named in feature text, and optional background art.
  A Random Environment card picks one from the current filter. Dice notation in
  text (`2d8+2`, `d20`, …) is clickable and rolls.
- **Lists** (`#/lists`) — named lists of bookmarked environments, with cover art
  made from the list's environments.
- **Prep** (`#/prep`) — a GM workspace for one or more saved *preps* (called
  "sessions" in the interface). Each holds up to three environments plus any
  adversaries and items from the Prep catalogues (264 adversaries, 240 items),
  Session Notes, a Battle Points estimate for the chosen adversaries, and
  advisory adversary recommendations drawn from the selected environments.
  Selected cards can be reordered by hand. A prep can be shared as a
  serverless snapshot link, and its adversaries can be opened in FreshCutGrass.
  Selections are binary: there is no primary environment and no item quantity
  (PD-001, PD-002).
- **Journey** (`#/journey`) — the *Journey to Horizon* GM map editor on the
  original Valloren map. The GM rolls the book's region and sanctuary tables,
  places generated regions hex by hex, inspects and edits them, and tracks
  campaign state: Fog of War, Soul Echoes and sanctuaries, the party marker,
  Shadowblight, destroyed sanctuaries. It also has a Route Planner, a "Locate
  Soul Echoes" compass, and an Encounter Roll in the Region Inspector.
  *Player Preview* shows exactly what players know; from it the GM can copy a
  **player link** or print the player map.

Journey in more detail:

- **GM editor** — desktop or laptop with a mouse or trackpad. On a touch-only
  device (coarse pointer, no hover) the page shows an explanation instead of the
  editor (PD-048). The map autosaves to the browser, with Undo/Redo. There is
  no routine Export/Import button: the full JSON backup of the map
  (`bacchus-atlas-journey-map-<date>.json`) is offered at the moments it
  matters — when a save fails or storage is unavailable, when another tab has
  changed the map, and as a "download first" step before *Clear the whole
  map* — and Import appears when the saved map cannot be read.
- **Player map** (`#/map/<link>`) — a read-only snapshot of Player Preview
  encoded in the URL fragment (no server, no account). It is designed
  phone-first with touch pan and pinch zoom, includes route planning over what
  players know, and never reads or writes the GM's saved map (PD-052, PD-067).
- **Print** — "Print player map" opens a Print Preview that is the print:
  eight A4 portrait sheets, black and white, no fog drawn (unrevealed areas
  are the untouched printed map) and no GM data (PD-028, PD-073).
- **Visual effects** — Shadowblight, Fully Shadowblighted tears, Soul Echoes
  and destroyed sanctuaries are animated on screen. A "Static effects" switch in
  the Display menu (and the system's reduced-motion setting) turns them into
  still frames (PD-072, PD-076). These effects are presentation only; they
  never change the saved map.

Everything is available in English and Russian, switched in place from the
header.

## Platforms

- **Catalogue, Lists, Prep** — responsive; usable on a phone, laid out for
  desktop first. Prep manual reordering is desktop with a fine pointer only
  (PD-012).
- **Journey GM editor** — desktop/laptop with a mouse (see above).
- **Journey player map** — phones are the primary target; it also works on
  desktop.
- No formal browser-support matrix is maintained here, and nothing in this
  repository records testing on specific devices; the site uses current web
  platform features (CSS container queries, `dvh` units, Web Audio, canvas,
  WebGL for the Shadowblight effect, with fallbacks where noted in the docs).

## Your data stays in your browser

Language, Lists, Prep, Journey maps and view preferences are saved in the
browser's `localStorage` on the current device, through one safe-storage layer
(`js/safe-storage.js`). There is no account, no server and no sync.

- Clearing site data, using private browsing, or switching browser or device
  loses it; `localStorage` is not a guaranteed permanent store, and a browser may
  refuse writes (the app reports a failed save instead of showing success).
- Nothing syncs between devices or browsers.
- What can leave the browser, by explicit action only: the Journey **JSON
  backup** (offered in the situations described above), a **player link** (the player's view
  of the map in the URL), a **Prep link** (a snapshot of one prep's title,
  notes and selections), and the Journey print. Lists and the other preferences
  have no export/import.
- Storage key names (`dhcodex_*`, including the retained `dhcodex_journey2_*`
  and `dhcodex_session_prep`) are legacy identifiers and are kept so existing
  saves keep loading — see [.claude/rules/browser-state.md](.claude/rules/browser-state.md).

## Running locally

Any static HTTP server works; opening `index.html` through `file://` does not
(the app `fetch()`es its data).

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

or

```bash
npx serve .
```

No install step is needed to run the site. `npm install` is only for the
dev-only tooling in `package.json` (`sharp` for
`scripts/generate-adversary-art.js`, `playwright` for the Journey browser
checks under `scripts/journey2/`); the runtime never loads `node_modules/`.

## Development and validation

Node 20 is what CI uses.

```bash
node --test tests/*.test.js               # unit tests for every pure module + the validator
node scripts/validate-data.js             # semantic validation of everything under data/
node scripts/build.js                     # copy runtime files into dist/
node scripts/version-assets.js            # stamp content-hash cache versions into dist/index.html
node scripts/check-asset-versioning.js    # verify those versions
node scripts/check-unlisted-build.js      # verify dist/ still holds the unlisted model
node scripts/check-journey2-build.js      # verify no Journey development material is in dist/
```

`npm test` and `npm run validate-data` run the first two. Run the tests and
the validator after any `data/`, `js/` or `css/` change, and the whole chain
after touching `index.html`, the build scripts, or the versioning wiring.
Adding or correcting an environment has its own procedure: the
`/add-environment` skill ([.claude/skills/add-environment/SKILL.md](.claude/skills/add-environment/SKILL.md))
and [docs/data-contracts/environments.md](docs/data-contracts/environments.md).

## Deployment

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) runs on every push
to `main` (and on manual dispatch): the seven commands above, in that order,
then publishes `dist/` to GitHub Pages with `actions/upload-pages-artifact` and
`actions/deploy-pages`. A failure at any step stops the deploy.

The build is copy-and-version, not a compile step: `scripts/build.js` copies
`index.html`, `css/`, `js/`, `data/`, `img/`, `sound/`, favicons and
`.nojekyll` into `dist/` as-is, and `scripts/version-assets.js` writes
deterministic content hashes (UI = `css/` + `js/`; data = `data/`) into
`dist/index.html` only. Source `index.html` stays version-free; never add a
hand-maintained `?v=`. `dist/` is generated and untracked. Details:
[.claude/rules/build-and-deploy.md](.claude/rules/build-and-deploy.md).

All runtime assets are referenced by relative path, so the site works under any
project path. The repository was renamed from `daggerheart-codex` to
`bacchus-atlas`; the site stays on the same `machenspieler.github.io` origin,
so saved browser data was unaffected by the rename.

### Unlisted public deployment

Anyone with the URL can open the site, but it is not meant to be found:

- `index.html` ships a static
  `<meta name="robots" content="noindex, nofollow, nosnippet, noimageindex">`.
- The initial HTML contains no environment catalogue; it renders client-side
  after `js/app.js` fetches `data/environments.json`.
- There is no `llms.txt`, `sitemap.xml` or project-level `robots.txt`.
  GitHub Pages only honours `robots.txt` at the origin root
  (`https://machenspieler.github.io/robots.txt`), which this repository cannot
  deploy to; [scripts/root-robots.example.txt](scripts/root-robots.example.txt)
  is a template for such a root deployment and is excluded from `dist/`.
- **This is not access control.** `noindex` and `robots.txt` are requests that
  compliant crawlers may ignore, and anyone with the URL — or the URL of a
  `data/*.json` file — can read it directly. Nothing here is encryption or
  authentication; anything that must not be public does not belong in this
  repository.

`scripts/check-unlisted-build.js` enforces the above in CI. Rationale:
[docs/product-decisions.md](docs/product-decisions.md) PD-003.

## Documentation map

| Document | What it is |
| --- | --- |
| [CLAUDE.md](CLAUDE.md) | Entry point for Claude Code sessions: critical invariants and an index into everything below |
| [docs/architecture.md](docs/architecture.md) | Where things live: script load order, state, routing, rendering, Prep, Journey, build |
| [docs/product-decisions.md](docs/product-decisions.md) | Numbered decision record (PD-001…); wins over older prose when they disagree |
| [design.md](design.md) | The visual design system: tokens, components, ribbons, breakpoints |
| [docs/data-contracts/environments.md](docs/data-contracts/environments.md) | Schema and rules for `data/environments.json`, item names, background art |
| [docs/manual-qa.md](docs/manual-qa.md) | Manual QA checklist for user-visible changes |
| [docs/translation-glossary.md](docs/translation-glossary.md) | Established EN → RU terminology |
| [.claude/rules/](.claude/rules/) | Area rules for data, browser state, UI, build and deploy |
| [planning.md](planning.md), [ui-mockups.md](ui-mockups.md) | Workflow notes for planning a change (historical process documents, not a product specification) |

## Compatibility, attribution and disclaimer

Bacchus's Atlas is an unofficial fan project and is **Daggerheart™
Compatible**. Daggerheart © Darrington Press. Built from Daggerheart and
third-party supplements — the site's own Sources list names them — with
translation drawing on daggerheart.su and the project's own editing. All rights
belong to their respective holders. The project does not use the official
Daggerheart logo or artwork, and "Daggerheart" is not part of its name (PD-004).
Item art and item pages come from the
[Daggerheart Loot Generator](https://artex-x.github.io/daggerheart-loot/) at
render time and are not copied into this repository.
