# Bacchus's Atlas

Static site — plain HTML/CSS/JS, no build step. `index.html` loads `css/styles.css`
and `js/app.js` directly; content lives in `data/environments.json` and `data/i18n.json`.

## Branding

The project name is "Bacchus's Atlas" in English and "Атлас Бахуса" in Russian —
both stored in `data/i18n.json` as `app_title`/`app_subtitle` and rendered via
`renderHeader()` in `js/app.js`. "Daggerheart™ Compatible" (`compatibility_label`
in `data/i18n.json`) is a separate compatibility statement, not part of the
project name: it is never translated, never placed inside the `<h1>` or the
logo's accessible name, and always stays visually secondary to the title and
subtitle (see `.compat-badge` in `css/styles.css`).

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

## Cache busting

`index.html` references the stylesheet and script with a `?v=` query string. Bump the
number whenever `css/styles.css` or `js/app.js` changes, or browsers will serve stale
copies after deploy.

The JSON under `data/` is fetched by `js/app.js`, not linked from `index.html`, so it
carries its own buster: bump `DATA_VERSION` in `js/app.js` whenever any data file
changes. That edits `js/app.js`, so bump its `?v=` in `index.html` too.

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
