# Data contract: `data/environments.json`

The environment is the core content record of the site — one Daggerheart
Environment Stat Block per entry. This document derives the contract from
the current production data, `js/app.js`'s rendering, and
`scripts/validate-data.js`'s `validateEnvironments()`; if any of the three
disagree, treat the validator and the rendering code as the actual
authority and correct this document.

## Representative example

```json
{
  "id": "defense-of-the-river-fort",
  "tier": 1,
  "type": "event",
  "difficulty": 10,
  "name": { "en": "Defense of the River-Fort", "ru": "Защита Речного Форта" },
  "lore": {
    "en": "Bandits assail the humble river-fort, hoping to use speed and numbers to overwhelm.",
    "ru": "Бандиты атакуют скромный речной форт, надеясь сокрушить его скоростью и численностью."
  },
  "impulses": {
    "en": ["Hold the line", "defend the land"],
    "ru": ["Держать линию", "защищать землю"]
  },
  "potential_adversaries": {
    "en": ["Jagged Knife Bandits (Hexer, Kneebreaker, Lackey, Lieutenant, Shadow, Sniper)"],
    "ru": ["Бандиты из «Зазубренного ножа» (Колдун, Коленолом, Шестёрка, Лейтенант, Тень, Снайпер)"]
  },
  "features": [
    {
      "type": "passive",
      "name": { "en": "Defended Crossing", "ru": "Защищённая переправа" },
      "description": { "en": "...", "ru": "..." },
      "prompt": { "en": "...", "ru": "..." }
    }
  ],
  "story_seeds": [
    { "title": { "en": "...", "ru": "..." }, "body": { "en": "...", "ru": "..." }, "prompt": { "en": "...", "ru": "..." } }
  ],
  "biomes": ["settlement", "aquatic"],
  "source": "Resting Dagger"
}
```

## Required fields

| Field | Shape | Notes |
| --- | --- | --- |
| `id` | slug string | Stable across renames — routes, Lists, and Prep selections all reference it. Never derive it from the Russian name. |
| `tier` | integer (1–4 in current data) | May be `null` for an explicitly tier-agnostic environment (rare — confirm intent before doing this). |
| `type` | one of `traversal \| social \| event \| exploration` | Enforced by the validator; translated for display via `type_*` keys in `data/i18n.json`. |
| `name` | `{ en, ru }` | Both required. Check the whole file for a duplicate normalized `ru` name before merging a new one (a silent collision has happened before — see [docs/translation-glossary.md](../translation-glossary.md)). |
| `impulses` | `{ en: string[], ru: string[] }` | Every environment has a non-empty list; when the source names none, use the literal placeholder `["None"]`/`["Нет"]` rather than an empty array or an invented impulse. |
| `potential_adversaries` | `{ en: string[], ru: string[] }` | Same non-empty/placeholder rule as `impulses`. Drives search, display, and (when a name matches a `featured_adversaries` entry) the clickable stat-block link. |
| `features` | array of feature objects | See "Feature object" below. |

## Optional fields

`lore`, `biomes`, `source`, `featured_adversaries`, `story_seeds`,
`rawText`, and an absent/empty `ru` inside any bilingual field are all
legitimately optional — the validator only checks their shape when
present, and older entries not having them is expected, not a data gap to
backfill proactively.

- **`difficulty`** — usually a number. It may also be a bilingual
  `{ en, ru }` object for a non-numeric difficulty (e.g. "same as the
  opposing duelist's") — both `hasDifficulty()`/`envDifficulty()` in
  `js/app.js` render this form on the card. When writing one, phrase it so
  it doesn't repeat the word "Difficulty"/"Сложность" (the label is
  prepended automatically) — see the translation glossary's difficulty note.
- **`lore`** — a one-to-two-sentence bilingual flavor lead-in shown under
  the title, copied from the source book, not written fresh. Many older
  entries don't have it.
- **`source`** — a plain (non-bilingual) string book attribution, shown
  centered in the detail overlay footer. Never wrap it in a `{ en, ru }`
  object and never translate it.
- **`biomes`** — array of terrain tags, most to least characteristic. See
  "Biome tagging" below.
- **`featured_adversaries`** — `[{ id, display: "inline", expanded?: bool }]`,
  referencing a full stat block in `data/adversaries.json` by id. Optional;
  an unknown id is quietly skipped rather than erroring at render time
  (though the validator still flags it — cross-file references are
  validated even though rendering degrades gracefully).
- **`story_seeds`** — `[{ title: {en,ru}, body: {en,ru}, prompt: {en,ru} }]`,
  optional GM hooks excluded from search/filtering.
- **`rawText`** — bilingual fallback prose for an environment not yet
  broken into structured `features`.

## Feature object (`features[]`)

```json
{
  "type": "passive | action | reaction",
  "name": { "en": "...", "ru": "..." },
  "description": { "en": "...", "ru": "..." },
  "prompt": { "en": "...", "ru": "..." }
}
```

`prompt` is optional (a GM-facing question, rendered as a separate italic
line). `description` supports the site's rich-text conventions — bullets as
`\n- **Label:** ...` lines, dice notation (`1d4`, `2d12`, …), and
auto-detected Fear-cost/condition-name emphasis; `prompt` renders as plain
text and does not support bullets.

## Biome tagging

Eleven biomes describe real terrain and always take priority over the two
fallbacks — check them first, in this order, and tag any the card's own
text supports:

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

Only when none of the eleven fits does an environment fall back to
`settlement` (a built, inhabited place: city, town, village, market,
castle, temple, base) or `universal` ("Other" — no terrain at all: planar
realms, space, dreams, abstract scenes, events that could happen anywhere).
**Never add a new biome id** — anything that isn't one of the eleven
belongs in `settlement` or `universal`. An environment may carry more than
one biome, most to least characteristic; tag only what the text actually
supports, never guess a terrain from the name alone.

## Cross-file references

| From | To | Validated by |
| --- | --- | --- |
| `featured_adversaries[].id` | `data/adversaries.json` entry | `validateEnvironments()` (unknown id is an error; render-time it's silently skipped) |
| an environment `id` | `data/regions.json`'s `environments[]` | `validateRegions()` — unknown id, or an id in more than one region, is an error |
| a matched name in `potential_adversaries` | a `featured_adversaries` entry's `name` (case-insensitive) | not schema-validated; a render-time text match only |
| a bulleted item-name mention in `description` | `data/items.json`'s `aliases`/`items` | not schema-validated; a render-time text match only |

## Fallback behavior

An unknown `featured_adversaries` id, a missing `lore`/`source`/`biomes`, or
an empty `story_seeds` all degrade to simply not rendering that section —
never a placeholder error or a broken layout. A `potential_adversaries`
name with no matching item/adversary link stays plain text.

## Rendering consumers

`cardHtml()` (catalog card), the detail overlay (`applyDetailRoute()` /
`detailViewState()`), `sortedFilteredEnvs()`/`envMatchesFilters()` (search
and filtering, via the search index — see
[docs/architecture.md](../architecture.md)), and Prep's environment
picker (`envPickerRowHtml()`, `centralEnvCardHtml()`) all read from the same
in-memory `state.builtinEnvs` array — there is no separate transformed copy
of environment data for any of these consumers.

## Compatibility considerations

Environment content is Daggerheart-compatible material; the word
"Daggerheart" is expected in `source` attributions and rules terminology
here, per [docs/product-decisions.md](../product-decisions.md) PD-004 — this
contract does not restrict that. English text is canonical (see
[.claude/rules/data.md](../../.claude/rules/data.md)); Russian translations
follow [docs/translation-glossary.md](../translation-glossary.md).
