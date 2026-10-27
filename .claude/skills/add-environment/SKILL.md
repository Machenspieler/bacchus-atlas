---
name: add-environment
description: Import, translate, validate, and add or correct a Daggerheart-compatible Environment Stat Block in the project's environment data.
disable-model-invocation: true
argument-hint: "[source file, image, PDF, text, or environment identifier]"
---

Import or correct the Environment Stat Block described by `$ARGUMENTS` in
`data/environments.json`.

## Workflow

1. **Read `$ARGUMENTS`** — the source material or the identifier of an
   existing environment to correct.
2. **Read the canonical documents**:
   - CLAUDE.md
   - [.claude/rules/data.md](../../rules/data.md)
   - [docs/data-contracts/environments.md](../../../docs/data-contracts/environments.md)
   - [docs/translation-glossary.md](../../../docs/translation-glossary.md)
3. **Locate and inspect the supplied source** (pasted text, an uploaded
   file, an image, a PDF). If an image or PDF can't be read reliably with
   the available tools, stop and report exactly what's missing rather than
   guessing or hallucinating its content.
4. **Treat the English source text as canonical** — do not summarize,
   rewrite or embellish it. Preserve headings, bullets, numbered lists,
   line breaks, prompts, emphasis, and mechanical notation where the
   current format supports them (see the data contract's "Feature object"
   section for what's supported). A line-break hyphen in the PDF
   ("Agil-ity") is not part of the word.
4a. **Fix obvious author errors and apply the house style** per
   [.claude/rules/data.md](../../rules/data.md): typos, broken grammar, a
   mis-named adversary, a feature name copy-pasted from another stat block;
   capitalized game terms, "<Trait> Roll", American spelling, curly
   apostrophes/quotes, capitalized first impulse. Write each adversary in
   feature text by its canonical full name (EN from the bestiary, RU from
   `data/prep.json`). Never silent: every fix goes in the report. Anything
   ambiguous, or that would change mechanics, is proposed first.
5. **Create or verify a stable `id`.** Check for an id collision by
   searching the whole of `data/environments.json`, not just the obvious
   candidate. A Russian (or English) name equal to another entry's is
   allowed (PD-075): keep the natural translation, don't invent a variant,
   and just mention the shared name in the report.
6. **Populate only the fields the source actually supports** — don't
   fabricate `lore`, `prompt`, `potential_adversaries`, `story_seeds`,
   `source`, `biomes`, or a translation the source doesn't provide. Missing
   optional fields are the expected, normal state.
7. **Translate the Russian fields** using
   [docs/translation-glossary.md](../../../docs/translation-glossary.md)
   terminology; for a term not yet in the glossary, translate by sense and
   flag it as unverified rather than presenting it as settled.
8. **Keep the English and Russian structures aligned** — same number of
   list items, same placeholder counts, same feature ordering.
9. **Tag biomes yourself** per the data contract's "Biome tagging" — the
   eleven terrain biomes take priority, `settlement`/`universal` are
   fallbacks only; judge where the place lies and how a party reaches it,
   not just literal terrain words; never invent a new biome id. Don't ask
   the owner — state the choice in the report.
10. **Don't add the environment to a region** (`data/regions.json`) and
    don't ask about it, unless the owner supplies the membership.
11. **Don't reorder unrelated environment records** in the JSON file.
12. **Run** `node scripts/validate-data.js` and `node --test tests/*.test.js`,
    and check `PotentialAdversaryUtils.envAdversaryNames()` resolves every
    potential adversary to a full bestiary name.
13. **Verify in the browser** with the claude-in-chrome tools: open
    `#/env/<id>`, check EN and RU, the features, expanded story seeds, the
    biome/source footer, the FreshCutGrass links and the console. If the
    `daggerheart-codex` preview server doesn't come up (its `npx serve`
    has failed to listen), serve the repo with a tiny Node static server
    on `127.0.0.1` instead, and stop it afterwards.
14. **Report**: files changed; the environment `id`; validation results;
    the chosen biome and why; every author error fixed; which optional
    fields are intentionally absent and why; any source ambiguity left
    unresolved (an odd phrasing, an uncertain translation choice) rather
    than silently picked.
