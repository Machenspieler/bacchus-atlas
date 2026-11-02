/* Bacchus's Atlas — scripts/lib/cls.js
   Pure CLS maths for the dev-only browser checks: the Core Web Vitals session-window definition.
   Input: layout-shift entries as { startTime, value, hadRecentInput }. Shifts after recent user
   input never count; the rest group into windows that close after a >1s gap between shifts or at
   5s total span; CLS is the largest window's sum. */
'use strict';

const GAP_MS = 1000;
const SPAN_MS = 5000;

function sessionWindows(entries) {
  const windows = [];
  let cur = null;
  const sorted = (entries || []).filter(e => e && !e.hadRecentInput).slice().sort((a, b) => a.startTime - b.startTime);
  for (const e of sorted) {
    if (cur && e.startTime - cur.last <= GAP_MS && e.startTime - cur.first <= SPAN_MS) {
      cur.value += e.value; cur.last = e.startTime; cur.entries.push(e);
    } else {
      cur = { first: e.startTime, last: e.startTime, value: e.value, entries: [e] };
      windows.push(cur);
    }
  }
  return windows;
}

function cls(entries) {
  return sessionWindows(entries).reduce((m, w) => Math.max(m, w.value), 0);
}

/* what a naive sum over the whole session would report (the number the Phase 4 report quoted) */
function naiveSum(entries) {
  return (entries || []).reduce((s, e) => s + (e.value || 0), 0);
}

module.exports = { sessionWindows, cls, naiveSum, GAP_MS, SPAN_MS };
