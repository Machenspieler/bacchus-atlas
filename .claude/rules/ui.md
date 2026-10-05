---
paths:
  - "index.html"
  - "css/**/*.css"
  - "js/app.js"
  - "tests/loading-state.test.js"
---

# UI conventions

Read [design.md](../../design.md) and [docs/manual-qa.md](../../docs/manual-qa.md)
before substantial UI work — this file assumes both.

- **Reuse tokens, don't invent them.** Every color, spacing value, radius,
  shadow, and font is a CSS custom property on `:root` in `css/styles.css`.
  If the existing token list genuinely can't express something new, that's a
  finding to raise, not a reason to hand-roll a hex value or a raw pixel
  measurement next to it.
- **Colors carry meaning — don't reassign it.** Gold (`--hope*`) is the only
  affirmative/selected/primary-action color in the system. Teal
  (`--teal*`) is structural/informational/reference (biome chips, item and
  adversary links, countdowns), never a second affirmative color. Fear-red is
  destructive actions, errors and dangerous states only — never a taxonomy
  label or a "pending" marker. Gold fills come from the role tokens
  (`--hope-wash/-hover-bg/-selected-bg/-selected-hover-bg/-border*/-glow`,
  see design.md "Colour roles"), never a new literal `rgba(217,164,65,…)`;
  hover is weaker than selected, and neither stands in for focus. Don't
  repurpose one for a new kind of state.
- **Cover the real state matrix**, not just the happy path: hover, active,
  focus-visible, disabled, selected, and error states, wherever a control
  can be in them. `:focus-visible` must stay visible everywhere — never
  suppressed in favor of a border-only treatment.
- **Visually equivalent controls behave consistently.** Two buttons that
  look like the same kind of control (e.g. both `.btn-ghost`) must respond
  to hover/focus/disabled the same way; don't let one silently diverge.
- **Every interactive control has an accessible name** — a real `<button>`/
  `<a>`/labeled `<input>`, never a bare `<div>` with a click handler standing
  in for one.
- **Keyboard navigation must keep working**: tab order, Enter/Space
  activation, Escape to dismiss where the pattern already uses it (overlays,
  popovers, multiselects). Don't add a mouse-only interaction.
- **Check both languages.** Russian strings run longer than their English
  counterparts — verify a long RU string doesn't clip, overflow, or force
  awkward wrapping, especially in fixed-width chips, buttons, and the
  toolbar.
- **Check the real viewport range**: desktop, narrow desktop, and mobile —
  see design.md's "Responsive breakpoints" table for the actual breakpoints
  this app uses, not a generic assumption.
- **Check the state the feature can actually be in**: empty, loading,
  populated, error, and — where the feature has them — expanded/collapsed.
  A collapsed header/section must meaningfully reduce occupied space, not
  just tweak a cosmetic detail: measure the before/after, don't eyeball it.
- **The initial loading shell is static and generic** (`#toolbar`/
  `#grid-wrap` in `index.html`, marked `data-initial-loading`). `js/app.js`
  must not recreate this markup after the fact — `beginInitialLoading()` /
  `localizeInitialLoading()` / `finishInitialLoading()` / `failInitialLoading()`
  are the only functions that touch its busy/loading state, and
  `localizeInitialLoading()` only ever updates `#result-count` text. See
  [docs/architecture.md](../../docs/architecture.md) for the full startup
  sequence.
- **Passing unit tests is not evidence a UI change works.** A user-visible
  change is only done once it's been exercised in the running app (see
  [docs/manual-qa.md](../../docs/manual-qa.md)) — tests catch logic
  regressions, not whether something looks or feels right.
