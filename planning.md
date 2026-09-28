# Planning new work

A right-sized planning workflow for Bacchus's Atlas. This project has no issue
tracker, no orchestrator, and no multi-agent handoff protocol — it's a static
site maintained through direct commits, usually one focused chat session per
change. This document exists so a change that touches more than a line or two
gets thought through *before* editing, and so a fresh chat picking up
mid-feature has something concrete to read instead of re-deriving context from
scratch.

## When to write a plan

Write one before implementing when the change:

- touches more than one or two files, or crosses `js/`, `css/`, and `data/`
  at once
- adds or changes a data schema field, a cross-file ID reference, or anything
  `scripts/validate-data.js` needs to learn about
- changes a persisted `localStorage` shape (needs a `SafeStorage` validator —
  see "Safe browser storage" in [CLAUDE.md](CLAUDE.md))
- adds a route, a new top-level page, or changes hash-routing behavior
- adds a new local CSS/JS file (needs the `data-cache-version="ui"` wiring —
  see "Automatic asset versioning" in [CLAUDE.md](CLAUDE.md))
- is otherwise easy to get wrong quietly (translation/biome-tagging rules,
  the unlisted-deployment constraints, anything CLAUDE.md calls out as
  "do not undo")

Skip it for a typo fix, a single data-entry addition/translation, a one-line
copy change, or anything else where the diff *is* the plan.

## Where a plan lives

`.claude/plans/<slug>.md` — one file per feature, plain Markdown, no fixed
template beyond the shape below. `.claude/` is gitignored in this repo (see
the comment in `.gitignore`): a plan is a scratch working document for the
current change, not project documentation. Delete it once the change is
implemented and committed. If a plan produced a durable rule or convention
worth keeping, that belongs in [CLAUDE.md](CLAUDE.md) itself, written there
directly — not left behind in a plan file nobody will read again.

## Steps

1. **Read [CLAUDE.md](CLAUDE.md) in full.** Every section applies; skim-reading
   it is how the branding, storage, routing, and versioning rules get
   accidentally violated. Read [README.md](README.md) and, for anything
   UI-facing, [design.md](design.md) too.
2. **Investigate before deciding.** Read the actual `js/` modules and
   `data/*.json` files the change touches, and check `tests/*.test.js` for
   existing coverage — a test file is often the clearest spec of a module's
   contract (see `tests/README`-equivalent context inside each test file's
   header comment). If the change touches validated data, read the relevant
   part of `scripts/validate-data.js` so the plan accounts for it instead of
   discovering it at CI time.
3. **If the change is UI-facing**, follow [ui-mockups.md](ui-mockups.md)
   before finalizing layout/interaction details. Fold the approved result
   into the plan as constraints, not as a "see mockup" pointer.
4. **Decide scope explicitly** — in scope / out of scope — before writing
   steps. Scope creep on a static site with no code review pipeline is easy
   to miss.
5. **Write the plan** using the shape below.

## Plan shape

- **Objective** — one or two sentences.
- **In scope / out of scope.**
- **Files to touch** — named, not vague ("the app.js file" isn't enough;
  name the function(s)).
- **Data or schema changes**, including which part of
  `scripts/validate-data.js` needs updating and whether
  `tests/data-validation.test.js` needs a new case.
- **Storage/routing changes**, including the `SafeStorage` validator or
  `RouteUtils` change needed, if any.
- **UI mockup reference**, if [ui-mockups.md](ui-mockups.md) produced one —
  inline the approved constraints, don't just link out.
- **Ordered steps** — concrete enough that picking this up in a new chat
  doesn't require re-reading every file from step 2 again.
- **Acceptance criteria** — observable/testable.
- **Verification commands** — see the gate list below.
- **Risks / open questions / settled decisions not to reopen.**
- **Needs confirmation: yes/no** — see below.

## Batching

Default to **one batch** — one coherent commit. This is a small codebase;
most features are reviewable as a single diff. Split into more than one batch
only when there's a genuine checkpoint (e.g., a storage migration landing
before the UI that depends on it) or the combined diff would be too large to
verify confidently in one pass. Don't add batching ceremony beyond that.

## Verification gates

Pick whichever apply; most changes need only the first two.

- `node --test tests/*.test.js` — always.
- `node scripts/validate-data.js` — whenever anything under `data/` changes.
- `node scripts/build.js && node scripts/version-assets.js && node
  scripts/check-asset-versioning.js` — whenever a new `css/`/`js/`/`data`
  file is added, or the versioning wiring itself changes.
- `node scripts/check-unlisted-build.js` — whenever `index.html` structure or
  the build pipeline changes, to guard the noindex/unlisted-deployment
  properties.
- Manual check with the browser preview tools for anything UI-facing: golden
  path, relevant edge cases, and dark/light if the change touches theming
  (see [design.md](design.md)).

## Deciding vs. asking

Decide silently from CLAUDE.md, README.md, design.md, and existing patterns
for routine choices — which biome tag applies, i18n key naming, where a new
helper belongs. Ask the user only when:

- there are multiple materially different, defensible approaches and nothing
  in the repo picks a winner, or
- the change would otherwise conflict with a standing "do not undo" rule in
  CLAUDE.md (unlisted deployment, the branding rules, the cache-busting
  scheme, etc.) and the plan can't tell whether that's intentional.

When asking, give 2-3 options, brief tradeoffs, and one clear recommendation.
Don't ask about naming or structure the user would reasonably not care about.
