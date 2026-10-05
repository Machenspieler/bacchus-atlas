---
paths:
  - "data/**/*.json"
  - "scripts/validate-data.js"
  - "tests/data-validation.test.js"
---

# Production data conventions

Read [docs/data-contracts/environments.md](../../docs/data-contracts/environments.md)
for the environment schema in full before editing `data/environments.json`.

- **English source text is canonical.** When importing or correcting a
  stat block, the English text is what the source book says — don't
  paraphrase, summarize, embellish, or silently "fix" it. If something
  looks wrong (a possible typo, an odd phrasing), preserve it and flag it
  rather than guessing the intended text.
- **Preserve source formatting the renderer supports**: Markdown-style
  bullets (`\n- **Label:** ...`), numbered lists, line breaks, bold/italic,
  and dice notation are never normalized away — see
  `renderRichText()`/`renderBulletBody()` in `js/app.js` for what actually
  renders.
- **Stable IDs never depend on the Russian translation.** An environment's
  `id` is derived from (or matches) its English name; renaming or refining
  the `ru` field must never change `id`, since routes, lists, and Prep
  Prep selections all reference it.
- **Prep adversary `name.en` must match FreshCutGrass exactly.** The
  FreshCutGrass export/links look adversaries up by exact name
  (`freshcutgrass.app/data/adversary/adversaries.json`), including colons
  and curly apostrophes (`Fallen Warlord: Realm-Breaker`,
  `Will-O’-The-Wisps`). Never "tidy" those punctuation differences; `id`
  stays unchanged, and `adversary-translations-manual.json` keys follow
  the same spelling.
- **Don't invent a missing optional field.** `lore`, `biomes`, `source`,
  `featured_adversaries`, `story_seeds`, `rawText`, and an absent/empty `ru`
  translation are all legitimately optional — leave them out rather than
  fabricating plausible-sounding content.
- **Preserve optionality when touching the schema.** Don't make an
  optional field required, and don't add a new required field without
  updating every existing record (or making it optional too).
- **Bilingual fields stay structurally aligned.** Where a field is
  `{ en, ru }`, both languages should describe the same content at
  roughly the same granularity (same number of list items, same
  `{n}`-placeholders) even though the prose itself differs.
- **Validate enum values and cross-file references before merging** —
  `type`, `features[].type`, `role`, `range`, `damage_type`, `biomes`
  membership, a region's `environments` list, a `featured_adversaries` id,
  an item alias/craft target. `scripts/validate-data.js` catches these, but
  don't rely on CI alone — run it locally first.
- **Don't reorder unrelated production records.** A diff for one
  environment/item/adversary should touch that record, not resequence the
  array around it.
- **A schema change requires validator and test updates in the same
  change** — a new enum value, a new cross-file ID reference, or a new
  production data file all need `scripts/validate-data.js` and
  `tests/data-validation.test.js` updated, not just the data itself.
- **Validation reports, it never rewrites.** `scripts/validate-data.js` is
  read-only: it never edits a data file, reorders an array, "fixes" a
  broken reference, or writes a baseline of its own. If it catches a real
  error in checked-in data, fix the data by hand — don't weaken the check
  that caught it.
- **Run `node scripts/validate-data.js`** after any change under `data/`;
  it's the same check CI runs before every deploy.
