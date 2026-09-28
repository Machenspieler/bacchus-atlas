# UI mockups

Guidance for the mockup step referenced from [planning.md](planning.md). Use
this when a plan introduces a new UI element, changes layout or interaction,
or leaves visual structure under-specified. The goal is a lightweight,
*grounded* mockup — not a full implementation just to see it, and not a
detached redesign.

## Ground every mockup in the current app

- Reuse existing spacing, type, color, and component patterns from
  `css/styles.css` and the tokens/patterns documented in
  [design.md](design.md). Never invent a new token or pattern for a mockup —
  if the existing system genuinely can't express the new UI, that's itself a
  finding to flag in the plan, not something to paper over with a one-off
  style.
- Show the change in the context of a real current screen, not a blank
  wireframe. Start the site with `preview_start` (there's no build step —
  `index.html` is opened/served directly per `.claude/launch.json`),
  navigate to the actual page, and take a `preview_screenshot` of the
  current state as the "before."
- Prefer annotating or composing from that current screenshot or the real
  DOM structure (`preview_snapshot`/`preview_inspect`) over inventing a new
  visual language from scratch.

## How to actually produce one here

There's no design tool or asset pipeline in this repo — mockups are built
from the site's own markup and CSS:

- **Small changes** (copy, control placement, a new small element): describe
  the "after" directly against the current screenshot, or edit a throwaway
  copy of the relevant HTML fragment (copied from `index.html`, using the
  real CSS classes from `css/styles.css`) and view it with the Artifact tool
  or `preview_*` tools. This never touches the real `css/`, `js/`, or
  `index.html` — it's scratch, kept in the scratchpad directory or under
  `.claude/plans/<slug>/mocks/` alongside the plan, until a step in the plan
  promotes it to a real change.
- **New layout or a genuinely new page section**: build it by copying the
  real surrounding markup and classes rather than starting from an empty
  template, so it inherits the site's actual visual system instead of
  approximating it.
- One recommended option, with at most one or two alternatives — only when
  the difference between them is meaningful enough to matter.
- Be explicit in the plan about what's existing structure vs. what's
  proposed.

## Respect the standing rules while mocking

These are easy to violate in a "just a mockup" mindset — don't:

- Put "Daggerheart" in a title, `<h1>`, or logo treatment, or imitate the
  official Daggerheart logo/artwork (see "Branding" in
  [CLAUDE.md](CLAUDE.md)).
- Draw a manually-versioned asset URL (`?v=...` typed by hand) or any UI that
  implies a `DATA_VERSION`-style constant — versioning is generated, never
  drawn in (see "Automatic asset versioning" in CLAUDE.md).
- Mock the initial-load state (`#toolbar`/`#grid-wrap` before data loads)
  with real environment names or data — it must stay generic/skeleton (see
  "Initial loading shell" in CLAUDE.md).
- Mock a new persisted UI control (a new list feature, a new saved
  preference) without naming the `localStorage` key it would need and noting
  that it needs a `SafeStorage` validator — sketch the storage design
  alongside the screen, not after.

## Don't

- Fully implement the feature just to screenshot it.
- Redesign unrelated chrome while mocking one control.
- Drift into a "cleaner/more modern" redesign that breaks the visual system
  documented in [design.md](design.md) — visual parity with the rest of the
  site beats novelty.

## Closing the loop

Once a mockup is approved — by the user, or self-approved for a routine,
low-ambiguity case per planning.md's "Deciding vs. asking" — record the
approved constraints directly in the plan file as concrete UI/behavior
requirements, not as a "see mockup" pointer. The mockup file itself is
scratch and can be discarded with the rest of `.claude/plans/<slug>/` once
the feature ships.
