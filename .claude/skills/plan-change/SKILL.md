---
name: plan-change
description: Investigate the repository and produce an implementation-ready plan for a multi-file, architectural, persistence, schema, build, or substantial UI change.
disable-model-invocation: true
argument-hint: "[change request]"
---

Produce an implementation-ready plan for the change described in
`$ARGUMENTS`, without editing any production file. This skill is for a
change that touches more than a file or two, changes a data schema, a
persisted storage shape, or routing — see CLAUDE.md's "Documentation
routing" for when a change is small enough to skip planning entirely.

## Workflow

1. **Read `$ARGUMENTS`** — the change request.
2. **Read the canonical documents relevant to the change**, not
   everything: always CLAUDE.md; then whichever of
   [docs/product-decisions.md](../../../docs/product-decisions.md),
   [docs/architecture.md](../../../docs/architecture.md),
   [docs/data-contracts/environments.md](../../../docs/data-contracts/environments.md),
   [design.md](../../../design.md), and the relevant `.claude/rules/*.md`
   file(s) actually bear on this change.
3. **Investigate current behavior from code and tests**, not from memory
   or from what a doc claims — read the actual `js/` modules and
   `data/*.json` files the change touches, and check `tests/*.test.js` for
   existing coverage (a test file is often the clearest spec of a module's
   contract). If the change touches validated data, read the relevant part
   of `scripts/validate-data.js`.
4. **If the change is UI-facing**, follow
   [ui-mockups.md](../../../ui-mockups.md) before finalizing layout/
   interaction details, and fold the approved result into the plan as
   concrete constraints — not as a "see mockup" pointer.
5. **Identify target behavior**, the ownership boundaries it touches
   (which module owns state, rendering, persistence, validation for this
   change), and the concrete implications: migration/backward-compatibility
   for a storage-shape change, validator/test updates for a schema change,
   accessibility/responsive/localization checks for a UI change.
6. **Decide scope explicitly** — in scope / out of scope — before writing
   steps. Scope creep on a static site with no code-review pipeline is easy
   to miss.
7. **Do not edit production files.** This skill only produces a plan.

## Plan shape

Write the plan to `.claude/plans/<slug>.md` (gitignored — a scratch working
document for this change, discarded once it ships) with:

- **Objective** — one or two sentences.
- **Current behavior** — grounded in the code you actually read, with file
  and function names.
- **Target behavior.**
- **In scope / out of scope.**
- **Files and functions to inspect or modify** — named, not vague ("the
  app.js file" isn't enough; name the function(s)).
- **Ordered implementation steps** — concrete enough that picking this up
  in a new chat doesn't require re-reading everything from step 3 again.
- **Acceptance criteria** — observable/testable.
- **Automated verification** — which of `node --test tests/*.test.js`,
  `node scripts/validate-data.js`, the build/version/check-asset-versioning/
  check-unlisted-build chain, and `git diff --check` apply.
- **Manual verification** — which rows of
  [docs/manual-qa.md](../../../docs/manual-qa.md) apply, if UI-facing.
- **Migration or backward-compatibility concerns**, if a persisted shape or
  a data schema changes.
- **Risks / open questions / settled decisions not to reopen.**
- **Needs confirmation: yes/no** — ask the user only when there are
  multiple materially different, defensible approaches and nothing in the
  repo picks a winner, or the change would conflict with a standing "do not
  undo" rule and the plan can't tell whether that's intentional. Otherwise
  decide silently from CLAUDE.md, the rules, and existing patterns.

Default to one batch (one coherent commit); split into more than one only
when there's a genuine checkpoint (e.g. a storage migration landing before
the UI that depends on it).

Every step must name a concrete file/function. Do not produce a vague
checklist like "update the UI and add tests."
