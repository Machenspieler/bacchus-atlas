# Planning new work

Bacchus's Atlas has no issue tracker, no orchestrator, and no multi-agent
handoff protocol — it's a static site maintained through direct commits,
usually one focused chat session per change. The planning workflow for a
change that touches more than a line or two is implemented as a Claude Code
skill rather than written out as prose here:

**`/plan-change`** (`.claude/skills/plan-change/SKILL.md`) investigates the
repository, reads the canonical documents relevant to the change (CLAUDE.md,
[docs/product-decisions.md](docs/product-decisions.md),
[docs/architecture.md](docs/architecture.md), the relevant
`.claude/rules/*.md`), and produces an implementation-ready plan under
`.claude/plans/<slug>.md` — without editing any production file.

Run it whenever a change:

- touches more than one or two files, or crosses `js/`, `css/`, and `data/`
  at once;
- adds or changes a data schema field, a cross-file ID reference, or
  anything `scripts/validate-data.js` needs to learn about;
- changes a persisted `localStorage` shape or adds a route;
- is otherwise easy to get wrong quietly (translation/biome-tagging rules,
  the unlisted-deployment constraints, anything CLAUDE.md calls out as
  "do not undo").

Skip it for a typo fix, a single data-entry addition/translation, or a
one-line copy change — anything where the diff *is* the plan.

For a UI-facing change, the skill's mockup step defers to
[ui-mockups.md](ui-mockups.md), which explains how to produce a mockup
grounded in the site's actual markup/CSS and [design.md](design.md) rather
than a detached redesign.

A plan is a scratch working document for the current change, not project
documentation — it lives under `.claude/plans/` (gitignored) and is
discarded once the change ships. If a plan surfaces a durable rule or
convention worth keeping, that belongs in the canonical file that owns it
(CLAUDE.md, `docs/product-decisions.md`, or the relevant
`.claude/rules/*.md`), written there directly — not left behind in a plan
file nobody will read again.
