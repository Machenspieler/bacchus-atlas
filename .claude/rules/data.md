---
paths:
  - "data/**/*.json"
  - "scripts/validate-data.js"
  - "tests/data-validation.test.js"
---

# Production data conventions

Read [docs/data-contracts/environments.md](../../docs/data-contracts/environments.md)
for the environment schema in full before editing `data/environments.json`.

- **English source text is canonical — but obvious author errors are
  fixed.** When importing or correcting a stat block, the English text is
  what the source book says — don't paraphrase, summarize or embellish it.
  Clear author errors are corrected in the data rather than preserved
  (owner decision, 2026-10-27; Resting Dagger books in particular are full
  of them): typos and broken grammar ("does fails", "PCs connections",
  "food stuffs"), a mis-named adversary ("Mask Thief" for Masked Thief), and
  a feature name copy-pasted from another stat block that doesn't match its
  own text (Lion Ascendant's "Thick Snow" → "The Lion Favors the Bold").
  Every such fix is never silent: list each one in the report (and name a
  renamed feature in the commit message). An ambiguous phrase whose intended
  meaning you'd have to guess, or a change that would alter mechanics, is
  proposed to the owner first, not applied. Deliberate wordplay is not a
  typo — see the glossary's proper-noun note.
- **House style for environment English text** (normalize on import, in
  the same pass as the typo fixes): game terms capitalized — Stress, Hope,
  Fear, Advantage/Disadvantage, Experience, "<Trait> Roll" ("Agility Roll",
  not "Agility roll"); American spelling (armor, rumors, favor); curly
  apostrophes and quotes (’ “ ”), never straight ones; the first impulse
  starts with a capital letter, the rest lowercase (RU likewise); one
  spelling of a proper noun across an entry ("Teal-Heart" everywhere).
- **Adversaries are named by their canonical full name.** In feature text,
  an adversary is written as its standard bestiary name from the core book /
  Hope & Fear (`Fallen Warlord: Realm-Breaker`, not "a Warlord:
  Realm-Breaker"; `Head Guard`/`Archer Guard`, not "Guard Captain"/"Guard
  Archer"), and its RU form is the one in `data/prep.json` (`Полководец
  Падших: Губитель Миров`), so the reader knows exactly who it is. In
  `potential_adversaries`, keep the book's group form ("Fallen (Shock
  Troop, Warlord: Realm-Breaker)") only where
  `js/potential-adversary-utils.js` already expands it to the full names —
  check with `envAdversaryNames()` that every member resolves.
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
