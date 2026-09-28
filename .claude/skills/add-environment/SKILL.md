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
   rewrite, embellish, or silently correct it. Preserve headings, bullets,
   numbered lists, line breaks, prompts, emphasis, and mechanical notation
   where the current format supports them (see the data contract's
   "Feature object" section for what's supported).
5. **Create or verify a stable `id`.** Check for a normalized-name
   collision (a new Russian name matching an existing entry's name under a
   different id — this has happened silently before) and an id collision,
   by searching the whole of `data/environments.json`, not just the
   obvious candidate.
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
9. **Tag biomes** per the data contract's biome table — the eleven terrain
   biomes take priority in order, `settlement`/`universal` are fallbacks
   only; never invent a new biome id.
10. **Don't reorder unrelated environment records** in the JSON file.
11. **Run** `node scripts/validate-data.js` and `node --test tests/*.test.js`.
12. **Report**: files changed; the environment `id`; validation results;
    which optional fields are intentionally absent and why; any source
    ambiguity left unresolved (an odd phrasing, an uncertain translation
    choice) rather than silently picked.
