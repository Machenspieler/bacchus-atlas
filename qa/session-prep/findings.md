# Session Prep — Raw Findings

Target: `https://machenspieler.github.io/bacchus-atlas/#/session-prep`
Tooling: built-in Claude Code browser pane (Chromium-based). Playwright was
not available in this session, so no `.zip` traces exist; "Evidence" below
points to console/network/DOM dumps captured inline and to the two items in
`evidence/screenshots/`.

Everything here is a raw observation. Only items also listed in `bugs.md`
have been promoted to confirmed-bug status.

---

## FINDING-SP-001
Area: Session
Environment: Bacchus's Atlas, deployed GitHub Pages build
Browser: Claude Code built-in browser pane (Chromium)
Viewport: 1024×768 (default pane size) and 1440×900
Steps:
1. Open `#/session-prep`, set a title, select 3 environments, 1 adversary, 1 item.
2. Navigate to `#/lists` via the "Списки" nav button.
3. Observe the top of the Lists page.

Observed: The Session Prep title bar ("Ночь в Каньоне", the
"Сохранено на этом устройстве · HH:MM" status, and the collapse chevron)
remains visible above the Lists page's own "Мои списки" heading. Confirmed
the same leftover bar also appears on `#/journey` and on the main catalog
route `#/`, including after a **hard** page reload performed while sitting on
one of those other routes (as long as `#/session-prep` had been visited at
least once earlier in the tab's lifetime).
Expected assumption: Leaving the Session Prep route should tear down the
Session Prep chrome entirely; other routes should render only their own
header/content.
Reproducibility: Always (100% across ~6 repeated attempts, via nav-button
clicks, browser back, and browser forward).
Evidence: Viewed inline during the session (this browser tool has no
save-to-disk primitive for screenshots — see `README.md`, no file exists
under `evidence/screenshots/` for this finding). DOM check showed
`#session-prep-chrome-extra` still populated with the old
`sessionHeaderHtml()` markup while `location.hash` correctly read `#/lists`
and `document.title` correctly read "Мои списки — Атлас Бахуса".
Technical notes: See `js/app.js` — `destroySessionPrepChrome()` (~line 3963)
tears down event listeners/timers/the toggle button but never clears
`#session-prep-chrome-extra`'s `innerHTML`. Only `renderSessionPrepPage()`
(lines ~4000 and ~4014) ever write to that element, and it's only called
when `state.route.name === 'session-prep'` (see `render()`, ~line 1363).
Confidence: High.
**Promoted to BUG-SP-001.**

---

## FINDING-SP-002
Area: Session / Environments
Environment: same as above
Browser: same
Viewport: 1024×768
Steps:
1. On a fresh session, select 3 environments one at a time (fills the 3/3 cap).
2. Inspect the three cards in "Выбранные окружения" for any indication of
   which one is primary, and look for a "Make primary" action.
3. Inspect `localStorage.dhcodex_session_prep` for the session object.
Observed: `primaryEnvironmentId` is set correctly in storage (to whichever
environment was selected first), but no card in the UI shows a "primary"
label/badge, and no control anywhere lets the GM reassign primary status to
a different one of the three selected environments. `primaryEnvironmentId`
is not read anywhere else in `js/app.js` (grep found zero usages outside
`js/session-prep-utils.js`/`js/safe-storage.js`), so the field is inert data.
Expected assumption: Per CLAUDE.md's own "Session Prep" section: "up to
three selections, the first becomes primary and can be reassigned via 'Make
primary'" — a UI affordance for this is expected to exist.
Reproducibility: Always.
Evidence: DOM dump of `.prep-central-env-grid` cards (no primary badge/
button in any of the three); `js/session-prep-utils.js` lines 90-134
(`toggleEnvironment`/`removeEnvironment`/`setPrimaryEnvironment`, the last of
which is unit-tested in `tests/session-prep-utils.test.js` but never called
from `js/app.js`).
Technical notes: `setPrimaryEnvironment()` exists, is pure, and is tested,
but has zero call sites outside its own test file. The central-card renderer
(around `js/app.js`'s environment-card template) never branches on
`session.primaryEnvironmentId` at all.
Confidence: High.
**Promoted to BUG-SP-002.**

---

## FINDING-SP-003
Area: Accessibility / Keyboard
Environment: same as above
Browser: same
Viewport: 1024×768 and 1440×900
Steps:
1. Load `#/session-prep` with the environment search box empty (full 269-item
   catalogue showing).
2. Click into the page body, then press Tab repeatedly (tested 20 presses,
   and independently confirmed via `document.querySelectorAll('#prep-env-list
   input, button, a, [tabindex]').length`).
Observed: The environment picker list alone contains 538 focusable elements
(269 environments × a checkbox + an "open detail" button each). All of them
sit in natural DOM/tab order *before* the Adversaries search box and picker,
and before the Items strip. A keyboard-only user (no screen-reader landmark
navigation) has no on-page mechanism to skip from the top of the environment
list to the Adversaries or Items columns except tabbing through all 538
stops, or shift-tabbing backward from the end of the document. Typing a
search query first does shrink the list (confirmed), which is the only
practical workaround, but nothing in the UI surfaces this as the intended
path for a keyboard user.
Expected assumption: A keyboard user should be able to reach each of the
three pickers (Environments/Adversaries/Items) in a reasonable number of key
presses, or via a skip link, without relying on typing a search query first.
Reproducibility: Always.
Evidence: `document.getElementById('prep-env-list').querySelectorAll('input,
button, a, [tabindex]').length === 538` (measured live).
Technical notes: The existing site-wide "Перейти к каталогу" skip link
targets `#grid-wrap` generally and does not help move *between* the three
Session Prep columns once inside it. No per-column skip link or
`tabindex="-1"` heading landmark exists for the Adversaries/Items columns.
Confidence: High.
**Promoted to BUG-SP-003.**

---

## FINDING-SP-004
Area: Accessibility / Adversaries / Items
Environment: same as above
Browser: Claude Code built-in browser pane's accessibility-tree tooling
(`read_page`/`find`)
Viewport: 1024×768
Steps:
1. Open the Adversaries picker list (`#prep-adv-list`) and the Items strip.
2. Use the browser pane's accessibility-tree reader against an adversary
   checkbox (e.g. "Багбор", "Защитник Корней").
Observed: The accessibility tool reports these checkboxes' accessible name
as `"on"` (the checkbox's `value` attribute) instead of the adjacent label
text ("Багбор"/"Защитник Корней"). However, `input.labels` (the native DOM
Label API) correctly resolves to the expected text in every case checked,
and the markup is a standard `<label>...<input type="checkbox">...<span
class="prep-row-name">Name</span></label>` wrapper with no `display:none`/
`visibility:hidden` on the name span. Environment-list checkboxes, by
contrast, carry an explicit `aria-label="<name>"` attribute and were *not*
affected — their accessible name always matched the intended name.
Expected assumption: A native, standards-compliant `<label>`-wrapped
checkbox should compute its accessible name from the label's text content in
any modern browser/screen reader; the environment list's explicit
`aria-label` pattern is a more robust alternative used inconsistently only
for that one list.
Reproducibility: Consistent within this tool, across ~10 different
adversaries (both those with a real thumbnail image and those using the
fallback SVG icon).
Evidence: `label.querySelector('input').labels` returned the correct name
string every time; `find`/`read_page` never matched a checkbox by the
adversary's name, only by "on".
Technical notes: This may be an artifact of this session's specific
accessibility-tree tool rather than a genuine screen-reader-facing defect —
real Chromium's accessibility tree is normally standards-compliant for this
exact markup pattern. **Recommend re-verifying with an actual screen reader
(VoiceOver/NVDA) or Chrome DevTools' own Accessibility panel before treating
this as an actionable defect.** Flagged here rather than silently dropped
because the inconsistency between the environment list's explicit
`aria-label` and the adversary/item lists' implicit-label pattern is real and
worth a second opinion regardless of the tool question.
Confidence: Low (tooling-dependent; not promoted to bugs.md).

---

## FINDING-SP-005
Area: Adversaries
Environment: same as above
Browser: same
Viewport: 1024×768
Steps:
1. Select an adversary (Багбор), then click its central "+" quantity button
   with a script that re-queries the button element on every iteration
   (120 rapid presses).
2. Observe the stored quantity and the button's appearance at the cap.
Observed: Quantity correctly clamps at 99 (matches `MAX_QUANTITY` in
`session-prep-utils.js`), and clicking "+" once more at 99 is a silent no-op
(no crash, no toast, count stays 99). However, the "+" button itself is not
visually disabled or otherwise marked as inactive once the cap is reached —
it looks identical to when it can still increment. The environment picker,
by contrast, shows an explicit localized toast ("Можно выбрать не более 3
окружений.") when its cap is hit.
Expected assumption: Some visual affordance (disabled state, or the same
kind of toast environments get) that the quantity is already at its maximum.
Reproducibility: Always.
Evidence: Screenshot taken at qty=99 showing an enabled-looking "+" button.
Technical notes: `adjustAdversaryQty()` in `js/app.js` (~line 3621) just
calls `SessionPrepUtils.incrementEntry`/`decrementEntry`, which clamp
silently; no `limitReached`-style signal is threaded back to the UI the way
`toggleEnvironment()`'s `limitReached: true` is.
Confidence: Medium. Cosmetic/UX only — no functional defect, no data
corruption. Not promoted to bugs.md (severity would be Trivial at most).

---

## FINDING-SP-006
Area: Items
Environment: same as above
Browser: same
Viewport: 1024×768
Steps:
1. Select an item from the Items strip.
2. Check the central "Выбранные предметы" card for any way to change its
   quantity beyond 1.
3. Check `SessionPrepUtils`/state for whether items support quantities > 1.
Observed: Items are stored as `{ id, quantity: 1 }` (same shape as
adversaries) and `SessionPrepUtils.incrementEntry`/`decrementEntry` are
generic over both lists, but `js/app.js` never wires an increment/decrement
control for items — only `centralItemCardHtml()` renders a plain
name/meta/remove card. This looked at first like a missing feature
(mirroring FINDING-SP-002's shape), **but a comment directly above
`centralItemCardHtml()` in `js/app.js` (~line 3489) states this is
deliberate**: "Unlike adversaries, items carry no visible quantity control
here — see 'Session Prep' in CLAUDE.md; a selected item is always added at
quantity 1 and can only be removed, not incremented, from this card."
Expected assumption: N/A — documented, intentional behavior.
Reproducibility: Always.
Evidence: `js/app.js` source comment at `centralItemCardHtml()`.
Technical notes: None needed; this is by design.
Confidence: High that this is **not** a bug. Logged only so the triage pass
doesn't have to re-derive the same "why doesn't this have a stepper"
question from scratch. **Not promoted to bugs.md.**

---

## FINDING-SP-007
Area: Layout / Responsive
Environment: same as above
Browser: same
Viewport: 390×844 (mobile emulation)
Steps:
1. Emulate a 390×844 viewport (`resize_window`) and load `#/session-prep`
   fresh (hard reload).
2. Visually inspect (screenshot) the environment list, then measure
   `document.documentElement.scrollWidth`, `window.innerWidth`,
   `.prep-main`'s computed `width`/`grid-template-columns`, and
   `window.visualViewport.width`.
Observed: The screenshot shows a clean, correctly single-column, readable
mobile layout with no visible horizontal scrollbar. However,
`window.visualViewport.width` correctly reports 390, while
`window.innerWidth` reports 1560 (exactly 4×390) and `.prep-main` computes
an explicit `width`/`grid-template-columns` of `1591px` — i.e. sized to a
desktop-width layout — which is inconsistent with what is visually rendered.
Expected assumption: Unclear whether this indicates a real desktop-width
layout being scaled/transformed to fit (which would risk real horizontal
scroll/zoomed-out text on an actual phone), or is purely an artifact of this
browser pane's mobile-viewport emulation (CDP device-metrics override)
feeding a stale/incorrect `window.innerWidth` to the page's own layout code.
Reproducibility: Always within this tool, at this viewport.
Evidence: `{"scrollWidth":1607,"clientWidth":390,"innerWidth":1560}` and
`{"gridTemplateColumns":"1591px","visualViewportWidth":390}` (raw JS dumps).
Technical notes: 1591 ≈ 1560 (`window.innerWidth`) + horizontal padding,
suggesting some layout code (possibly the item-strip's `ResizeObserver`/
auto-pan sizing logic, which is the one place in Session Prep that reads
element widths at runtime) is keying off `window.innerWidth` rather than the
container's own `clientWidth`/percentage sizing — but this needs
confirmation on a real phone or a different emulation tool before treating
it as a genuine site bug, since the rendered screenshot directly contradicts
a true 1591px-wide layout.
Confidence: Low (conflicting evidence; likely a tool artifact). **Not
promoted to bugs.md** — recommend a real-device or alternate-tool retest at
this and other viewports (1280×720, 768×1024, and 125%/150% browser zoom
were not independently retested after this discrepancy was noticed).

---

## FINDING-SP-008
Area: Adversaries
Environment: same as above
Browser: same
Viewport: 1024×768
Steps:
1. Select the adversary "Багбор" (checkbox at the top of a freshly-loaded,
   unfiltered Adversaries list).
2. Immediately attempt a second click intended for a different adversary
   ("Защитник Корней"), using screen coordinates from *before* the first
   selection caused the central panel to grow and push the list down.
3. Take a screenshot (showed Багбор selected, qty 1, as expected).
4. Run two more (non-mutating) tool calls: an accessibility-tree `find` query
   and a read-only `localStorage` dump.
5. Take another screenshot / re-read `localStorage`.
Observed: Between steps 3 and 5, with no intentional mutating action in
between, the stored session's `adversaries` array reverted from
`[{"id":"bugboar","quantity":1}]` to `[]`, and the central "Выбранные
противники" panel showed 0 selected again.
Expected assumption: A selection should not spontaneously revert without a
user (or scripted) action that removes it.
Reproducibility: Once. Immediately retried the same selection sequence
(select Багбор → wait 3s → re-check storage) twice afterward and it stayed
selected both times; could not reproduce a third occurrence deliberately.
Most likely explanation: my own second click (step 2) landed back on
Багбор's own checkbox after the list reflowed from the first selection,
toggling it back off — and the screenshot in step 3 simply raced ahead of
that second click's render. Logged rather than discarded because the
timeline as directly observed doesn't fully rule out a real
race condition in `refreshCentralAdversaries()`/`syncPickerCheckbox()`.
Evidence: Sequential `localStorage.getItem('dhcodex_session_prep')` dumps
captured inline (not saved as files).
Technical notes: None identified; needs a scripted, precisely-timed repro
(e.g. two `click()` calls a fixed number of milliseconds apart, requerying
the checkbox each time) to confirm or rule out before further action.
Confidence: Low. **Not promoted to bugs.md** — reproducibility is "Once"
and the likely explanation is tester error, not a product defect.

---

## Areas covered with no defect found (for the triage pass's context)

- **Session title**: typing, blur-commit, persistence across hard reload,
  emoji/unicode + 300-character input (truncates safely to 120 chars without
  corrupting a surrogate pair), whitespace-only handling.
- **Environment cap**: exactly 3 enforced; a 4th attempt is rejected with a
  correct, localized toast and the checkbox visually reverts; rapid
  toggle-on/toggle-off (11 rapid clicks) on the same environment leaves DOM
  and storage consistent with each other.
- **Adversary quantity**: increments/decrements correctly across re-renders
  (verified with a script that re-queries the button on every iteration,
  since the DOM node is replaced on each state change); clamps at 1 (won't
  go to 0/auto-remove) and at 99; removing an adversary correctly
  un-checks its source-list checkbox (`syncPickerCheckbox()` behavior as
  documented).
- **Item picker**: hover reveals the tooltip (name · kind · source · roll)
  and the selection drawer/checkbox as documented; selecting/deselecting
  correctly syncs to the central "Выбранные предметы" panel and back.
- **Search (environments)**: case-insensitive, matches partial terms,
  matches by biome label (tested "болот" → 13 wetland-tagged results, all
  correctly tagged), whitespace-only query correctly falls back to showing
  everything (269/269), a genuinely-unmatched query shows the correct
  localized "no results" message with no crash.
- **Session state across navigation**: nav-button away-and-back and browser
  back/forward both preserve environment/adversary/item selections and the
  session title correctly (aside from the stale-chrome visual issue in
  BUG-SP-001, the underlying *data* was never lost or duplicated in any of
  these tests).
- **Collapsible top chrome** (≥1200px breakpoint only): auto-collapses ~10s
  after the first workspace interaction; the chevron toggle reliably
  expands/collapses, including under 20 rapid repeated clicks (ends in the
  mathematically-correct state every time); collapsing hides the shared site
  header (logo, Lists/Session Prep/Journeys nav, RU/EN switch) along with the
  session title row as one unit — this is a deliberate design per the
  extensive comment block in `js/app.js` around `initSessionPrepChrome()`,
  not treated as a defect, though it is an aggressive UX choice worth a
  second look by whoever triages this list (hiding primary site navigation
  behind a single small chevron).
- **Console/network**: no console errors or warnings were observed at any
  point across this entire pass; no failed image requests were observed for
  the adversaries/environments interacted with.

## Areas not covered in this pass

- A real screen reader (VoiceOver/NVDA) was not used — see FINDING-SP-004.
- Viewports 1280×720 and 768×1024 were not explicitly tested (1440×900,
  1024×768, and 390×844 were); browser zoom at 80%/125%/150% was not tested.
- Duplicate-item edge cases, very long item names, and a genuinely broken
  (404) image URL were not exercised for the Items picker specifically
  (only the existing catalogue's real images/thumbnails were checked).
- "FreshCutGrass encounter generation" — investigated in source
  (`js/app.js` ~line 328 onward) and confirmed this belongs to the main
  environment detail card's "Potential Adversaries" section, not to Session
  Prep's own (metadata-only) adversary picker. Nothing to test here under
  Session Prep itself; not a gap in coverage, just a charter item that
  doesn't apply to this feature's actual architecture.
- Local repository note (out of scope for this deployed-page pass): the
  working tree at the start of this session had two files deleted locally
  under `img/adversaries/art/session-prep/` (`063_bugboar.png`,
  `063_ahuizotl.png`) that the *deployed* site still serves successfully
  (200 OK, confirmed via network log). This is a local, uncommitted, and
  presumably in-progress change unrelated to anything exercised in this QA
  pass — flagged only because it touches the same asset folder as
  FINDING-SP-004/adversary images, not as a finding against the deployed
  page itself.
