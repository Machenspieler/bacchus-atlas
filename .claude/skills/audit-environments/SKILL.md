---
name: audit-environments
description: Proofread environments in data/environments.json in both languages — spelling, punctuation, grammar, logic, EN/RU sync, item references — and apply the obvious fixes directly.
disable-model-invocation: true
argument-hint: "[all | environment ids | tier | source book]"
---

Audit the environments named by `$ARGUMENTS` (default: all) in
`data/environments.json`, English and Russian, and **fix what is obviously
wrong in the same pass**.

## Rules that decide how you work

Read [.claude/rules/data.md](../../rules/data.md) (especially "Audits fix;
they don't just list", "Items follow the catalogue", "Structural defects",
"A countdown's size is stated once", "(Any) placeholder") and
[docs/translation-glossary.md](../../../docs/translation-glossary.md)
before reviewing. Short version:

- Obvious defects are **fixed, then reported** — never a list awaiting
  approval. Ask only about real ambiguity (needs the book, changes
  mechanics, terminology), with a recommendation. "Decide logically" means
  decide and state the choice.
- Glossary terms, `**bold**`, `\n- ` lists, capitalised game terms and
  Latin dice notation are intentional — not defects.
- A missing `difficulty` (Epic Duel) is intentional.
- The source of truth for an item is `data/items.json`, for an adversary
  `data/prep.json` / `data/adversaries.json` — check against them, not by
  comparing EN with RU.

## Workflow

1. **Split** the environments into chunks of ~26 (drop `rawText`, `biomes`,
   `featured_adversaries` from the review copy) into the scratchpad; 309
   environments is ~1.5 MB of text, so review in parallel — one agent per
   chunk, read-only, each told to read the glossary first.
2. **Review brief** (per agent): check every environment in EN and RU for
   spelling, punctuation (EN and RU rules, « » quotes, dashes), grammar and
   agreement, logic (contradictions, wrong numbers, references to things
   that don't exist), EN/RU sync (numbers, dice, countdown sizes, a sentence
   missing or added, differing counts of impulses / adversaries / features /
   seeds), and artefacts (stray characters, double spaces, Latin letters in
   Cyrillic, untranslated words). Report one line per finding:
   `id | path | EN/RU | category | "fragment" -> "fix" | reason`, plus a
   separate "Doubtful" list.
3. **Turn findings into patch files** — ask each reviewer (they keep their
   context; resume them) for an exact-match patch array, excluding anything
   structural or ambiguous, then verify with a dry run:

   ```bash
   node scripts/apply-text-patches.js patch01.json patch02.json
   ```

   Fix every `FAIL` until it reports 0 failed, then `--write`. The format
   is documented at the top of `scripts/apply-text-patches.js`.
4. **Structural fixes by hand** (a small throwaway script that asserts each
   `from` exists): a merged feature, text in the wrong field, an empty
   prompt with its question in the description, merged impulses, a dead
   feature reference, a countdown stated twice.
5. **House-style sweep** on EN text: curly apostrophes inside words
   (`(\w)'(\w)` → `’`), American spelling (rumored, favor, multistory),
   capitalised Hope/Fear/Stress. Leave official names ("Vault Guardian
   Gaoler") alone.
6. **Item check:** `node scripts/check-item-references.js`.
7. **Verify:** `node scripts/validate-data.js` (the two "Normalized name"
   warnings are known) and `node --test tests/*.test.js`.
8. **Commit and push** per CLAUDE.md's git workflow, naming structural
   fixes in the message.
9. **Report**: counts, every structural / judgement fix with the choice
   made, and a short list of what was left (with the reason) for the owner
   or the printed book — doubtful terminology, missing adversaries in a
   list, setting-specific terms.
