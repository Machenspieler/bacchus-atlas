# Exploratory Charter — Session Prep

**Mission:** Explore the Session Prep page (`#/session-prep`) of Bacchus's
Atlas to discover bugs in state persistence, environment/adversary/item
selection, responsive layout, the collapsible header, keyboard access, and
accessibility — using both normal and adversarial interaction patterns.

**Target:** https://machenspieler.github.io/bacchus-atlas/#/session-prep

**Role:** QA Executor / Bug Hunter. Discovery and documentation only — no
fixes, refactors, or UX changes in this phase.

**Tooling:** Built-in Claude Code browser pane (Chromium-based), used for
navigation, DOM inspection (`read_page`), console/network capture, screenshots,
and simulated keyboard/mouse input. Playwright was not available as an
installed dependency in this repo/session, so the built-in browser tool
substitutes for it; no automated Playwright trace files were produced — any
"trace" evidence is a sequence of screenshots plus console/network dumps
instead. This tool also has no primitive to save a screenshot it takes to
disk (only to display it inline during the session), so `evidence/
screenshots/` is empty at the end of this pass — visual findings are instead
backed by inline DOM/console/localStorage dumps quoted directly in
`findings.md`/`bugs.md`. A follow-up pass with a screenshot-capable tool
(e.g. a real Playwright install) could add real image evidence without
repeating the investigation.

**Session metadata:** recorded per finding (date, viewport, browser).

## Areas in scope

1. Session state (create/name/save/refresh/reopen/nav away-back/back-forward)
2. Environments (search, select/deselect, rapid toggling, biome search)
3. Adversaries (search, select/remove, limits, images, FreshCutGrass links)
4. Items (search, icon hover/tooltip, checkbox hit area, sync with selected list)
5. Responsive layout at 1440×900, 1280×720, 1024×768, 768×1024, 390×844
6. Collapsible header/top chrome behavior
7. Keyboard-only navigation
8. Accessibility (accessible names, focus, contrast, semantics)
9. Console/network errors throughout

## Approach

- Start with a cold load (no prior localStorage) to see default/empty state.
- Walk each area's happy path first, then adversarial variants (rapid clicks,
  empty/whitespace search, refresh mid-interaction, resize mid-interaction,
  keyboard-only passes).
- Capture console/network state after each major interaction.
- Take screenshots for any visual anomaly; save under `evidence/screenshots/`.
- Log every observation to `findings.md` as it's found, not after the fact.
- Promote to `bugs.md` only what reproduces reliably or has clear source-level
  confirmation.

## Out of scope / not fixed here

No code changes. No severity triage beyond a suggestion. No regression testing
of unrelated pages (Lists, Journey, Items main page) except where Session Prep
directly depends on them (e.g. `openItemDetail()`).
