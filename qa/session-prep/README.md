# Session Prep QA Workspace

This directory holds exploratory-testing artifacts for the `#/session-prep`
page of Bacchus's Atlas, produced during a bug-hunting pass. It is QA
scratch/documentation only — nothing here changes production behavior.

## Contents

- `exploratory-charter.md` — scope, environment, and test approach for this session.
- `findings.md` — every raw observation, whether or not it's a confirmed bug.
- `bugs.md` — findings promoted to confirmed bugs after reliable reproduction
  or strong technical evidence, with severity suggestions.
- `evidence/screenshots/` — screenshots referenced from findings/bugs.
- `evidence/traces/` — traces or recordings referenced from findings/bugs (if any).

## Process

1. Explore the deployed page (`https://machenspieler.github.io/bacchus-atlas/#/session-prep`)
   in a real browser, covering both normal and adversarial usage.
2. Log every suspicious observation in `findings.md` immediately, using the
   `FINDING-SP-NNN` template.
3. Only promote a finding to `bugs.md` (`BUG-SP-NNN`) once it has been
   reproduced reliably (or backed by strong technical/source evidence).
4. Source code may be inspected to explain *why* something happens, but no
   fixes, refactors, or UX changes are made during this phase — that is left
   to a separate triage/fix pass.

## Status

See the summary at the end of `findings.md` / `bugs.md` for current counts and
areas covered vs. not yet covered.
