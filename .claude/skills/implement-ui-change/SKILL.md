---
name: implement-ui-change
description: Implement a user-facing UI change in Bacchus's Atlas while preserving the design system, accessibility, responsive behavior, localization, product decisions, and existing architecture.
disable-model-invocation: true
argument-hint: "[UI change request]"
---

Implement the UI change described in `$ARGUMENTS`.

## Workflow

1. **Read `$ARGUMENTS`.**
2. **Read the canonical documents this change must respect**:
   - CLAUDE.md
   - [docs/product-decisions.md](../../../docs/product-decisions.md)
   - [design.md](../../../design.md)
   - [.claude/rules/ui.md](../../rules/ui.md)
   - [docs/manual-qa.md](../../../docs/manual-qa.md)
3. **Inspect the existing DOM, CSS, JavaScript, state, and tests before
   designing the change** — read the actual rendering function(s) in
   `js/app.js`, the relevant rules in `css/styles.css`, and any existing
   `tests/*.test.js` coverage. Don't design against an assumed structure.
4. **Identify all relevant component states** for what you're changing:
   hover, active, focus-visible, disabled, selected, error, empty, loading,
   populated, expanded/collapsed — whichever apply.
5. **Define observable acceptance criteria before editing** — what should
   be true in the running app when this is done.
6. **Reuse existing components and design tokens** (`css/styles.css`
   custom properties, existing `.btn`/`.chip`/`.card` patterns) — see
   design.md's "Anti-patterns" section for what not to reintroduce.
7. **Avoid unrelated refactoring.** Implement the smallest coherent change
   that satisfies the acceptance criteria.
8. **Implement.**
9. **Update or add automated tests** when the behavior is testable
   (pure logic in a `js/*-utils.js` module, a validator rule, a routing
   case) — not for pure visual/layout changes, which automated tests can't
   meaningfully cover.
10. **Run applicable checks**: `node --test tests/*.test.js` always; the
    data/build chain only if this change touched `data/`, `css/`, `js/`,
    or `index.html`'s structure.
11. **Verify the running interface** — start the dev server, exercise the
    golden path and the states identified in step 4. Passing unit tests is
    not evidence a visual UI change works; this step is not optional for a
    user-visible change.
12. **Check, using [docs/manual-qa.md](../../../docs/manual-qa.md) as the
    checklist**:
    - English and Russian (including a long Russian string, if relevant)
    - keyboard interaction and visible focus
    - desktop, narrow desktop, mobile
    - empty and populated states
    - loading and error states, where applicable
    - expanded and collapsed states, where applicable
13. **Report**: files changed; behavior changed; tests run and their
    result; which manual states were actually verified in the running app
    (not just claimed); anything that could not be verified and why.

Do not claim a visual check happened unless the app was actually opened and
inspected — say so explicitly if something couldn't be verified (no
preview environment, etc.) rather than reporting it as done.
