# Daggerheart Atlas

A static reference site for Daggerheart Environment stat blocks: search,
filters, an RU/EN language toggle, and clickable dice right inside property
text.

The site is **build-free** — plain HTML/CSS/JS files. Open it locally or
publish it as-is on GitHub Pages.

## Project layout

```
.
├── index.html            — entry point
├── css/styles.css        — all layout and theming
├── js/app.js             — all logic (rendering, filters, dice, lists)
├── scripts/build.js      — CI-only: copies the runtime files into dist/ (see Deploy below)
├── scripts/check-unlisted-build.js — CI-only: fails the build if dist/ regresses (see Deploy below)
├── img/
│   ├── biomes/           — biome icons for catalog cards
│   └── env/              — background art shown behind environment cards
└── data/
    ├── environments.json — environments (EN/RU bilingual), the "official" data
    ├── adversaries.json  — stat blocks for "featured adversaries" embedded in an environment card
    ├── regions.json      — regions: groups of related environments
    ├── items.json        — item cards from the loot generator (bilingual)
    ├── journey.json       — Journey to Horizon generator tables (bilingual)
    └── i18n.json          — interface dictionary (EN/RU)
```

User data (lists, which environments are in them, the chosen language) lives
in the browser's `localStorage` and never touches files on disk or
`environments.json`.

## Running locally

Any static HTTP server will do (opening `index.html` directly via `file://`
won't work, because of `fetch()`).

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

or with Node:

```bash
npx serve .
```

## Deploying to GitHub Pages

Deployment is automatic: [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
runs on every push to `main`. It runs `node scripts/build.js`, which copies
the runtime files (`index.html`, `css/`, `js/`, `data/`, `img/`, favicons,
`.nojekyll`) into `dist/` as-is — it doesn't read `environments.json`,
generate HTML, or touch `index.html` in any way. `node
scripts/check-unlisted-build.js` then verifies `dist/` still holds to the
public-but-unlisted model described below (see [Unlisted public
deployment](#unlisted-public-deployment)), and fails the build if it doesn't.
`dist/` is then published to GitHub Pages via
`actions/upload-pages-artifact` + `actions/deploy-pages`.

There's nothing to trigger by hand beyond pushing to `main`. `.nojekyll` is
already in place so GitHub Pages doesn't try to run the site through Jekyll
(which would otherwise mangle paths starting with `_` — we don't have any
today, but it costs nothing to be safe).

## Unlisted public deployment

The site is deployed **public but unlisted**: anyone with the URL can open it
normally, but it isn't meant to be found by search or by AI crawlers browsing
around for content.

- `index.html` ships a static
  `<meta name="robots" content="noindex, nofollow, nosnippet, noimageindex">`
  tag, present in the source before any JavaScript runs.
- The initial HTML no longer contains the environment catalog. The catalog
  renders only after `js/app.js` fetches `data/environments.json` and builds
  it client-side — there's nothing to bake in server-side anymore
  (`scripts/build.js` is a plain copy, not a prerender step; see
  [Deploying to GitHub Pages](#deploying-to-github-pages)).
- `llms.txt`, `sitemap.xml`, and a project-level `robots.txt` are not part of
  this repo or the deployed site — they used to advertise machine-readable
  catalog data and discovery hints, which is the opposite of "unlisted".
- **This is not access control.** `noindex` and `robots.txt` are requests
  that *compliant* crawlers are free to ignore, and neither stops a human
  (or a bot) that already has the URL, or the URL to `data/*.json`, from
  reading it directly. Nothing here is encryption, authentication, or a
  secret.
- GitHub Pages only honors `robots.txt` at the origin root
  (`https://machenspieler.github.io/robots.txt`), not under this project's
  path (`https://machenspieler.github.io/daggerheart-codex/robots.txt`).
  This repo can't deploy to the origin root, so it doesn't ship a
  project-level `robots.txt` that would create a false sense of protection.
  [scripts/root-robots.example.txt](scripts/root-robots.example.txt) is a
  template for what could be deployed there (from a separate
  `machenspieler.github.io` repo, or a custom domain) — it documents this
  limitation and is deliberately excluded from `dist/`.
- The public JSON under `data/` remains reachable by anyone who knows or
  guesses its URL, same as any other static file on the site. If something
  must not be publicly distributed, it needs to be removed from this repo
  entirely or protected by real server-side authorization — `noindex` and
  `robots.txt` can't do that job.

`scripts/check-unlisted-build.js` runs in CI after every build and fails it
if `dist/index.html` ever regresses back toward baking in catalog content,
JSON-LD, or the removed crawler-discovery files.

## How new environments get added

You send me a new Environment stat block in English, in chat. I:
- translate it to Russian using daggerheart.su's terminology (Rank,
  Difficulty, Impulses, Potential Adversaries, Environment Features,
  Passive/Action/Reaction, trait rolls, etc.);
- add the finished bilingual entry to `data/environments.json`;
- hand you back the updated file (or the whole site archive).

These entries carry no "RU pending" badge — the Russian name is already
filled in, so `isTranslated()` in `js/app.js` never flags them.

## Environment data format

```json
{
  "id": "harsh-desert",
  "tier": 2,
  "type": "traversal",
  "difficulty": 14,
  "name": { "en": "Harsh Desert", "ru": "Суровая пустыня" },
  "lore": { "en": "...", "ru": "..." },
  "impulses": { "en": [...], "ru": [...] },
  "potential_adversaries": { "en": [...], "ru": [...] },
  "features": [
    {
      "type": "passive",
      "name": { "en": "...", "ru": "..." },
      "description": { "en": "...", "ru": "..." },
      "prompt": { "en": "...", "ru": "..." }
    }
  ],
  "story_seeds": [
    {
      "title": { "en": "...", "ru": "..." },
      "body": { "en": "...", "ru": "..." },
      "prompt": { "en": "...", "ru": "..." }
    }
  ],
  "biomes": ["drylands"],
  "source": "Shalassa Desert"
}
```

`type` is one of `traversal | social | event | exploration`.
`features[].type` is one of `passive | action | reaction`.
`lore` is an optional flavor lead-in from the source book (one or two
sentences shown under the environment's title on the card), not mechanics.
Many older entries don't have it — the field is optional.
`story_seeds` are optional GM hooks, see [Story seeds](#story-seeds-story_seeds)
below.
`biomes` is an array of the eleven terrain biomes (see `CLAUDE.md`), most to
least characteristic; falls back to `settlement` or `universal` when none
fit.
`source` is an optional string attributing the source book; many older
entries don't have it.

## Featured adversaries (data/adversaries.json)

Some environments can't really be run without a specific adversary — the
Progenitor Mind's Lair doesn't work without the Progenitor Mind itself: its
name, description, "Potential Adversaries", and the "Miasma of Mind" feature
all depend on it. For cases like this, the adversary's full stat block is
stored once in `data/adversaries.json`, and the environment just references
it by `id`:

```json
{
  "featured_adversaries": [
    { "id": "progenitor-mind", "display": "inline", "expanded": true }
  ]
}
```

The field is optional; environments without it are unaffected. The same file
supports more than one adversary per environment — just add a second entry to
the array. An unknown `id` (a typo, or an adversary not added yet) is quietly
skipped — the environment card renders normally, without that section.

`display` currently only supports `"inline"` (the adversary is embedded right
in the card) — the field is reserved for other display modes in the future.
`expanded: true` means the stat block is open by default (as with the
Progenitor Mind, without which the scene can't be run); without this field,
or with `false`, it's collapsed.

This is **not a replacement** for `potential_adversaries` — that field stays
as-is and still drives display, search, and filtering by a plain list of
names. `featured_adversaries` is only about the full embedded stat block. If a
name in `potential_adversaries` matches (case-insensitively) an adversary's
name from this same environment's `featured_adversaries`, it turns into a
clickable button: clicking it expands the matching stat block further down
the card and scrolls to it. Names with no match stay plain text — the site
doesn't build a general adversary catalog.

Schema of an entry in `data/adversaries.json`:

```json
{
  "id": "progenitor-mind",
  "name": { "en": "Progenitor Mind", "ru": "Разум-Прародитель" },
  "tier": 3,
  "role": "solo",
  "difficulty": 18,
  "thresholds": { "major": 18, "severe": 36 },
  "hp": 12,
  "stress": 6,
  "attack_modifier": 4,
  "attacks": [
    { "name": { "en": "...", "ru": "..." }, "range": "close", "damage": "3d10", "damage_type": "physical" }
  ],
  "experiences": [
    { "name": { "en": "...", "ru": "..." }, "modifier": 2 }
  ],
  "features": [
    { "type": "passive", "name": { "en": "...", "ru": "..." }, "description": { "en": "...", "ru": "..." } }
  ]
}
```

`role`, `range`, and `damage_type` are language-independent keys (`solo`,
`melee`/`very_close`/`close`/`far`/`very_far`, `physical`/`magic`), translated
through `i18n.json`, same as `type`/`features[].type` on environments.
`damage` is a plain dice-notation string (`"3d10"`) and goes through the same
clickable dice roll as the rest of the site's text — no separate roll type
was built for adversaries. Numbers like `attack_modifier` and an
experience's `modifier` are shown as-is (`+4`, `+2`) and never turn into dice.

On the card, the adversary renders between "Environment Features" and the
footer (source/region), under a "FEATURED ADVERSARY" heading, in its own
panel with its own border and background — so its stats and features don't
read as part of the environment's own features. Each adversary is its own
`<details>`: collapsed or expanded per `expanded`, with name, tier, and role
in the header.

## Story seeds (story_seeds)

Optional hooks for the GM — not environment mechanics and not quests, just
leads for later. Stored on the environment separate from `features`, and
excluded from the catalog, search, and filters:

```json
{
  "story_seeds": [
    {
      "title": { "en": "A Missing Memory", "ru": "Пропавшее воспоминание" },
      "body": { "en": "...", "ru": "..." },
      "prompt": { "en": "...", "ru": "..." }
    }
  ]
}
```

The field is optional. On the card they're collected into one `<details>` at
the bottom — after the environment's features and featured adversary, before
the source and region blocks — collapsed by default, with a heading like
"STORY SEEDS (2)" (the number is how many are inside). Opening it shows all
seeds at once, in array order: the title in bold, the body as a plain
paragraph, and `prompt` as a separate italic line with the same diamond
marker used for questions in environment features.

## Regions

Some environments are connected to each other and form a single region (for
example, Neverhome Manor — corridors, library, and final scene). These
relationships are described in `data/regions.json`:

```json
{
  "regions": [
    {
      "id": "neverhome-manor",
      "name": { "en": "Neverhome Manor", "ru": "Поместье Неверхоума" },
      "environments": ["neverhome-corridors", "neverhome-library", "shatter-the-heart"]
    }
  ]
}
```

At the bottom of the card of an environment that belongs to a region, a
"Region" block appears with the region's name and buttons for all its
environments. The current environment shows as an active, unclickable button;
the rest open their respective cards. Button order follows the
`environments` array's order.

An environment can belong to at most one region; unknown `id`s are ignored.
If fewer than two of a region's environments are visible, the block isn't
drawn.

## Journey to Horizon (map generators)

The "Journey" button in the header, next to "Lists", opens `#/journey` — a
page with two generators from the Journey to Horizon book:

* on the left, **"Wilderness Hexes"** — a region: habitat (d20), size in
  hexes (d12), encounter (d8+d6), terrain and travel days (d4), rumor (d100);
* on the right, **"Sanctuaries"** — trade (d20), feature (d12), crisis (d10),
  aspiration (d10), government (d8), size (d6), population (d4), and a name
  built from the element table (d100 × 2).

All the tables live in `data/journey.json`. The book's special rows are
implemented:

| row | behavior |
| --- | --- |
| habitat, 1 | "Shadow Blight": a second habitat is rolled, the one it struck. Two 1s in a row means the region is fully consumed — no habitat left unblighted |
| encounter, 2 | rolled twice on the same table, results combined (a nested 2 also expands) |
| government, 8 | two governments combined; each government in the set is always different |

The habitat table is the same eleven biomes as the catalog, so the result
carries a clickable biome chip: it opens the catalog with that biome set as
the filter.

The "↻" button to the right of a row rerolls **only** that row. The die
button by the name generates a new name. The name can also just be typed by
hand.

### How results are stored

The "Save" button puts an entry in `localStorage`
(`dhcodex_journey_regions`, `dhcodex_journey_sanctuaries`). An unsaved roll
only lives until you navigate to another page.

What's stored is **the rolled numbers, not the text**:

```json
{ "id": "reg-msx3…", "name": "Ashenmoor", "habitat": { "rolls": [1, 7] },
  "size": 11, "encounter": { "entries": [[4,3],[6,5]], "combines": 1 },
  "terrain": 2, "rumor": 15 }
```

So the same saved map reads correctly in any language, and will pick up
Russian text on its own once it exists in `journey.json` (two entries are
about ~280 bytes, so a hundred-hex map weighs nothing).

### What's still untranslated

The `ru` fields in `data/journey.json` are still empty — the page's interface
is in Russian, but the tables themselves (100 rumors, encounters, terrain,
the sanctuary's seven tables) are served in English via the `jText()`
fallback. Biome names come from `i18n.json` and are already in Russian.

The `nameElements` table does **not** need translating: it's English
morphemes for building place names (`Ash`, `Thorn(e)`, `H(e)aven`), not
prose — the same rule as for dice notation.

## Background art behind an environment card

An environment can have its own art: it expands to fill the screen behind
the open card, lightly blurred and darkened. Everything interactive stays in
front of it — the card itself, the floating language switch, the dice
popover, countdowns, toasts, the "Add to list" window.

To add art for another environment:

1. Put the original (PNG) in `img/env/src/`, re-encode it to JPEG alongside,
   in `img/env/`, and name it after the environment's `id`:
   `img/env/<id>.jpg`. Requirements for the image itself and the re-encode
   command are below.
2. Add that `id` to the `ENV_ART` set in `js/app.js`.
3. Bump `?v=` for `js/app.js` in `index.html`.

The set is listed by hand rather than probed with a request: most
environments have no art, and none of them should have to find that out via
a 404.

The image must be **landscape**, 1536 × 1024. This is the one requirement
that can't be worked around: the layer expands to fill the screen via
`object-fit: cover`, and the screen is landscape, so a portrait image would
have to stretch to width — 1024 px wide on a 1920 px screen is a 1.9×
upscale, and it would still crop off roughly 60% of the height top and
bottom, which is exactly what the image was drawn for in the first place.
Don't confuse this with biome art (`img/biomes/src/`): that's portrait,
1024 × 1536, because it gets cropped into a narrow strip on the card's
banner.

Composition is built around the card: it's 720 px wide, centered on screen,
so keep the middle of the image calm and put anything that needs to be seen
in the side thirds — that stays outside the card's edges.

File size matters — this is a full-screen image. The blur is light (2 px),
so a small image can't be stretched to cover for it — there's nothing to
hide the smear behind: keep it at the width it was drawn in, don't upscale.
JPEG at quality 88: `ouroborean-pass` comes out around 340 KB,
`cauldera-valley` and `field-of-dreams` are 387 and 415 KB (flowers all the
way to the frame edge compress worse than fog). Originals (PNG, ~3 MB each)
live in `img/env/src/` and aren't committed to git.

Neither ImageMagick nor Python is in this project, but .NET can encode JPEG,
and it ships with Windows PowerShell out of the box. No need to change the
width — the original is already at the width it's served at — so this is
just re-encoding:

```powershell
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("$PWD\img\env\src\<id>.png")
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq 'image/jpeg' }
$p = New-Object System.Drawing.Imaging.EncoderParameters 1
$p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
  [System.Drawing.Imaging.Encoder]::Quality, 88)
$img.Save("$PWD\img\env\<id>.jpg", $codec, $p)
$img.Dispose()
```

Under a 641 px screen width, the card fills the whole screen and nothing
behind it is visible anyway, so the image doesn't load at all on phones.

Two knobs live in `css/styles.css`: `--bd-blur` on `.env-backdrop` (blur
strength) and `--ink-overlay-art` on `:root` (how much the image is
darkened under the card; cards without art use their own darkening,
`--ink-overlay`, 0.80, which is what clears the catalog out from under the
card).

## Lists

The bookmark icon on a card (and inside the open card) opens a checkbox
popup letting you file that environment into one or more named lists, or
create a new one on the spot. The "Lists" button in the header opens
`#/lists`, a page of list cards — each showing a cover made from up to three
of its environments' background art, a rename field, and an open/delete
control. The bookmark fills in solid whenever the environment is in at least
one list.

Lists are pure browser state: `state.lists` (the lists themselves) and
`state.envLists` (which lists each environment id belongs to), both
persisted to `localStorage` (`dhcodex_lists`, `dhcodex_env_lists`). They
don't touch `environments.json` and don't sync anywhere — a banner on the
Lists page reminds you that clearing site data or switching browser/device
loses them.

## Items in feature lists

Some features list loot as a bulleted list — plants the party can gather. If
a list item names an item from the
[loot generator](https://artex-x.github.io/daggerheart-loot/), it turns into
a button: clicking it opens an item card over the environment card — art,
roll number, type, text (with dice buttons), and the crafting chain. An
"Open in the loot generator" button links to the item's page on the source
site.

The card can be taken along, the same four ways as on the loot generator
itself:

* the chain-link icon next to the name copies a link to the item to the
  clipboard (`…/daggerheart-loot/i/w14.html` — a static page with Open
  Graph tags, so it unfurls into art, name, and text in Telegram or Discord);
* **Share** opens the system "Share" sheet and attaches the art if the
  browser can hand over files; if there's no Share API at all, it copies the
  link instead;
* **Image** copies the art to the clipboard (WebP isn't accepted by the
  clipboard, so it goes through a canvas and comes out as PNG); where the
  clipboard won't take images, the file downloads instead;
* **Text** copies the name in bold (with a "(consumable)" note for
  consumables) and the description. Rich and plain variants are written to
  the clipboard at the same time: Word and Google Docs pick up the bold
  version, chat apps get plain text with no asterisks. Dice buttons are
  inserted as the notation they display.

The card is copied from the loot generator one-to-one. Its palette, fonts,
corner radii, and spacing are declared inside `.loot-overlay` in
`css/styles.css` and don't leak outward: the parchment theme around it stays
untouched. The seam is deliberate — everything inside the card belongs to
that other site.

The data lives in `data/items.json` and comes entirely from the loot
generator's `data.json` — both localizations included. The file has two
parts:

```json
{
  "aliases": { "Nursewood": "w62", "Древо-Нянька": "w62" },
  "items": {
    "w62": {
      "kind": "consumable", "src": "wondrous", "roll": 62, "img": "w62.webp",
      "en": { "name": "Nursewood Sap", "description": "…" },
      "ru": { "name": "Целебная Смола", "description": "…" }
    }
  }
}
```

A stat block names the plant (`Nursewood`), while the catalog holds what you
get from it (`Nursewood Sap`) — that's what `aliases` is for. Matching is
case-, punctuation-, and whitespace-insensitive, and requires the name to
take up the whole list item (or stand before a colon/dash) — a mention
inside a sentence doesn't turn into a link. Items' own catalog names work
without an alias. The optional `craft` field is the id of what the item
upgrades into; the reverse direction ("Crafted from") is derived
automatically.

A list item with no matching entry stays plain text. Art loads from the loot
generator site and simply disappears from the card if it's unavailable.

Russian plant names in stat blocks follow the loot generator's terminology:
the list item and the card it opens share one root — "Тенелилия" opens
"Лепестки Тенелилии", "Вянущий Корень" opens "Ихор Вянущего Корня", exactly
as in the original where "Umbra Lily" opens "Umbra Lily Petals". When
translating a new environment, a plant's name is taken from its item's RU
name in the generator, not translated fresh.

## Dice in text

Any occurrence of the form `1d4`, `2d12`, `3d8`, `d20`, `100`, etc. in feature
descriptions (`description`) and in raw text (`rawText`) automatically turns
into a small button. Clicking it plays a roll animation and shows the final
result (broken down by individual die, if there's more than one). Die sizes
d4, d6, d8, d10, d12, d20, d100 are recognized — enough for every standard
Daggerheart die.

## Known limitations / possible future work

- There's no JSON export/import through the UI (that's currently done
  through me, in chat) — "Export/Import" buttons could be added to move data
  between browsers.
