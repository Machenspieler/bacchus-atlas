# Session Prep — Confirmed Bugs

Promoted from `findings.md` after reliable reproduction and/or strong source
confirmation. Severity is a suggestion only; final triage happens separately.

---

## BUG-SP-001
Status: CONFIRMED
Severity suggestion: Major
Area: Session / Navigation (site-wide)

### Preconditions
- Any Session Prep session state (even the default empty one) — reproduces
  with or without saved environments/adversaries/items.
- The current browser tab has visited `#/session-prep` at least once since
  the page's JS last did a full (re)load.

### Steps
1. Load `https://machenspieler.github.io/bacchus-atlas/#/session-prep`.
2. Optionally interact with it (set a title, pick environments/adversaries/
   items) — not required to reproduce.
3. Navigate to any other route: click "Списки", "Путешествия", or the site
   logo/home link — or use the browser's Back/Forward buttons.

### Actual Result
The Session Prep title/save-status bar (session name field, "Сохранено на
этом устройстве · HH:MM" text, and the collapse chevron) remains visible,
pinned above the new route's own page heading, on every other route: Lists
(`#/lists`), Journeys (`#/journey`), and the main environment catalog
(`#/`). It also survives a **hard** page reload performed while already on
one of those other routes. The only way observed to clear it is to never
visit `#/session-prep` in that tab at all (confirmed via a fresh page load
with Session Prep data in `localStorage` but no visit to the route in that
tab's lifetime — the bar does not appear in that case).

### Expected Result
Leaving the `session-prep` route should remove/clear the Session Prep chrome
entirely, the same way its own code comments describe: "#session-prep-chrome
... wraps the shared site header and, **only on this route**, the session
title/save-status row."

### Reproducibility
Always (100%). Reproduced via: nav-button click (Списки, Путешествия),
browser Back, browser Forward, and a hard reload while on a non-session-prep
route with the chrome already created in that tab.

### Environment
Deployed build at `https://machenspieler.github.io/bacchus-atlas/`, Claude
Code built-in browser pane (Chromium-based), default pane viewport
(~1024×768) and 1440×900; not viewport-dependent.

### Evidence
Screenshots were viewed inline during this session (no file-save primitive
was available in this browser tool, so no `.png` could be written to
`evidence/screenshots/` — see `README.md`/`exploratory-charter.md` for this
limitation). DOM/console evidence captured instead:
```
// After clicking "Списки" from Session Prep:
location.hash            -> "#/lists"
document.title           -> "Мои списки — Атлас Бахуса"
#toolbar.outerHTML        -> "<div id=\"toolbar\"></div>"   // empty, as expected for Lists
#session-prep-chrome-extra still contains the old session title/save-status markup
document.querySelectorAll('#session-prep-chrome').length -> 1  // not duplicated, just never cleared
```
Reproduced identically on `#/journey` and on `#/` (main catalog), including
after `location.reload()`.

### Technical Notes
`js/app.js`, `render()` (~line 1343): when leaving the session-prep route it
calls `destroySessionPrepItemStrip()` and `destroySessionPrepChrome()`
(~line 1355-1358). `destroySessionPrepChrome()` (~line 3963-3978) clears
timers, removes the chrome's event listeners, deletes `chromeEl.dataset.
collapsed`, and removes the toggle button — but it never clears
`document.getElementById('session-prep-chrome-extra').innerHTML`. That
element's content is only ever written by `renderSessionPrepPage()`
(~lines 4000 and 4014), which is only invoked when
`state.route.name === 'session-prep'`. Net effect: the *behavioral*
controller (timers, collapse state, listeners) is torn down correctly, but
the *visible markup* it was controlling is orphaned in the DOM.

### Source Suspicion
`js/app.js` → `destroySessionPrepChrome()` (~line 3963) is missing a line
along the lines of clearing `#session-prep-chrome-extra`'s `innerHTML` (or
`render()` itself should clear it directly next to where it calls
`destroySessionPrepChrome()`, ~line 1355-1358). Do not fix yet — flagged for
the fix pass.

---

## BUG-SP-002
Status: CONFIRMED
Severity suggestion: Major
Area: Environments

### Preconditions
- On `#/session-prep`, select any 2 or 3 environments (the "primary" concept
  only matters once at least 2 are selected).

### Steps
1. Select environment A first, then environment B (and optionally C).
2. Look at the "Выбранные окружения" cards for any indicator of which one is
   "primary".
3. Look for any control (button, menu, long-press, etc.) to change which
   selected environment is primary.
4. Inspect `localStorage.dhcodex_session_prep` → the active session's
   `primaryEnvironmentId` field.

### Actual Result
`primaryEnvironmentId` **is** tracked correctly in storage (it's set to
whichever environment was selected first, and — per source — would be
re-pointed to the next remaining one if the primary were removed). But:
- No card in "Выбранные окружения" shows any primary/non-primary distinction
  — all three render with an identical template.
- There is no "Make primary" button, menu, or any other affordance anywhere
  in the rendered page to reassign which environment is primary.
- `primaryEnvironmentId` has zero read sites in `js/app.js` outside the
  pure-logic/storage-sanitization layer — nothing in the actual page
  (ordering, styling, generated content) ever varies based on it.

A GM therefore has no way to see or change which of up to three selected
environments the app considers "primary", making the field's existence
entirely invisible and non-actionable from the UI.

### Expected Result
Per CLAUDE.md's own "Session Prep" section: "The environment picker reads
the existing `allEnvs()` catalog (up to three selections, **the first
becomes primary and can be reassigned via 'Make primary'**)." A visible
primary indicator and a working reassignment control are expected.

### Reproducibility
Always (100%).

### Environment
Deployed build, same as BUG-SP-001. Not viewport-dependent.

### Evidence
```
// After selecting 3 environments:
JSON.parse(localStorage.getItem('dhcodex_session_prep')).sessions[0].primaryEnvironmentId
// -> "infernal-railyard"  (correctly the first one picked)

document.querySelectorAll('.prep-central-env-card')  // all 3 cards
// -> identical template: remove button, thumbnail, name, meta — no primary marker, no "Make primary" button in any of them
```

### Technical Notes
`js/session-prep-utils.js` fully implements the primary-environment state
machine:
- `toggleEnvironment()` (~line 97): sets `primaryEnvironmentId` to the
  newly-added environment only if none was set yet.
- `removeEnvironment()` (~line 117): promotes the next remaining environment
  to primary if the removed one held that role.
- `setPrimaryEnvironment(session, envId)` (~line 130): explicit reassignment,
  no-op if `envId` isn't currently selected. Its own doc comment reads:
  *""Make primary" only ever appears on a selected entry, but a stale click
  after a race should still be inert rather than corrupt."* — i.e. the
  author clearly intended a "Make primary" UI control to exist.
- `tests/session-prep-utils.test.js` (~lines 100-110) unit-tests
  `setPrimaryEnvironment` directly.

`grep -n "setPrimaryEnvironment" js/app.js` returns **zero** matches — the
function is never imported/called from the DOM layer. The central
environment-card template and the "3 / 3" header in `js/app.js` never
reference `primaryEnvironmentId` either.

### Source Suspicion
The primary-environment feature is fully built and tested at the
`js/session-prep-utils.js` layer but was never wired into `js/app.js`'s
rendering (no primary badge in the card template) or event delegation (no
`data-sp-make-primary`-style attribute/handler, unlike the parallel
`data-sp-remove-env` pattern that *is* wired up). Looks like a dropped/never
-finished feature rather than a regression — there is no code to have
regressed from.

---

## BUG-SP-003
Status: CONFIRMED
Severity suggestion: Major
Area: Accessibility / Keyboard / Layout

### Preconditions
- `#/session-prep` loaded with the environment search box empty (showing the
  full, unfiltered 269-environment catalogue) — the common/default state for
  a first-time visit.

### Steps
1. Focus anywhere near the top of the page.
2. Attempt to reach the Adversaries search box, the Adversaries list, or the
   Items strip using only the Tab key (no mouse, no typing a search query
   first).

### Actual Result
The environment picker list (`#prep-env-list`) alone contains **538**
focusable elements (269 environments × a selection checkbox + an "open
detail" button each), all of which sit earlier in tab order than the
Adversaries search box, the Adversaries picker, and the Items strip. A
keyboard-only user must tab through all 538 of them (or learn to
Shift+Tab backward from the very end of the document, which nothing in the
UI suggests) to move from Environments to Adversaries/Items. There is no
skip link, heading-based jump target, or `tabindex` shortcut scoped to the
three Session Prep columns specifically (the existing global "Перейти к
каталогу" skip link only skips the shared site header, not between the
three picker columns).

### Expected Result
A keyboard-only user should be able to reach each of the three pickers in a
reasonable number of key presses without being required to first type a
search query to shrink an unrelated list.

### Reproducibility
Always (100%) — this is a structural/DOM-order property, not
timing-dependent.

### Environment
Deployed build, same as above. Reproduces at both 1024×768 and 1440×900
(the column layout is 3-wide at ≥1200px and stacked at narrower widths, but
the DOM/tab order is unaffected either way since it's controlled by markup
order, not CSS `order`/`grid-template-areas`).

### Evidence
```
document.getElementById('prep-env-list')
  .querySelectorAll('input, button, a, [tabindex]').length
// -> 538
```
Manual Tab-key trace (20 presses from the top of the page) landed on an
environment-row checkbox roughly a third of the way down the still-unfiltered
list, confirming the practical scale of the problem (hundreds more presses
needed to clear the column entirely).

### Technical Notes
Narrowing the environment search first does shrink the tab-stop count
proportionally (confirmed: a query narrowing the list to 13 results reduces
it to 26 stops) — this is the only practical keyboard workaround today, and
it isn't discoverable without already knowing the list is the obstacle.

### Source Suspicion
This isn't a broken feature so much as a missing one: no per-column skip
link (e.g. "Skip to Adversaries" / "Skip to Items") or landmark-scoped
`tabindex="-1"` heading exists in `renderSessionPrepPage()`'s markup
(`js/app.js`, the environment/adversary/item column templates). A fix would
likely add one or two visually-hidden-until-focused skip links at the top of
`.prep-col-env`, similar in spirit to the existing site-wide
"Перейти к каталогу" link in `index.html`.
