---
paths:
  - "js/safe-storage.js"
  - "js/route-utils.js"
  - "js/list-utils.js"
  - "js/prep-utils.js"
  - "js/data-version.js"
  - "js/app.js"
  - "tests/storage.test.js"
  - "tests/routing.test.js"
  - "tests/list-rename.test.js"
  - "tests/prep-utils.test.js"
---

# Browser state, storage, and routing conventions

## Storage

- **Every persisted read/write goes through `js/safe-storage.js`**
  (`SafeStorage.loadStoredJson` / `readRawFlag` / `writeJson` / `writeRaw` /
  `writeJsonBatch`). Never write a bare
  `JSON.parse(localStorage.getItem(...))` at startup, and never call
  `localStorage.setItem`/`removeItem`/`clear()` directly from `js/app.js` —
  `tests/storage.test.js` asserts both patterns are absent.
- **A new `localStorage` key needs an explicit fallback factory** and, if
  its JSON value has real internal structure (not a bare string/number), a
  structural validator added to `SafeStorage.validators`.
- **Handle storage being unavailable or write-blocked.** `getStorage()`
  only guards obtaining `localStorage` itself; a read/write can still fail
  independently (quota exceeded, a privacy-mode write block) — every read
  and write function catches its own failure and returns a structured
  result, never throwing into a UI event handler.
- **Never show success feedback after a failed write.** A failed
  `persist()`/`persistRaw()`/`persistBatch()` call keeps the user's change
  in memory for the tab but must skip the corresponding success toast in
  favor of the centralized `storage_write_failed_warning`
  (`reportStorageWriteFailure()`) — the UI must never claim something saved
  when it didn't.
- **Malformed or wrong-shaped persisted data must not break startup.** One
  key failing (bad JSON, wrong top-level type, invalid nested entries) must
  never reset or block another key — sanitize what can be salvaged and
  fall back only the part that's actually broken.
- **A persisted-shape change needs backward-compatible handling, not a
  reset.** Adding/changing a field in a stored schema requires either
  tolerating the old shape in the validator or a migration (see
  `sanitizePrep()`/`migratePrepV1ToV2()` in
  `js/safe-storage.js` for the pattern: preserve what's still valid,
  discard only what must go, never wipe the whole store to make the
  migration simpler).
- **Obsolete Prep fields (`primaryEnvironmentId`, item/adversary
  `quantity`) are migration-only.** They must never reappear as read or
  write targets outside `js/safe-storage.js`'s v1 → v2 migration path — see
  [docs/product-decisions.md](../../docs/product-decisions.md) PD-001/PD-002.
  A clean v1 → v2 migration is not itself a storage-recovery event; don't
  make it trigger the "storage recovered" toast.

## Routing

- **`location.hash` is decoded in exactly one place**: `js/route-utils.js`
  (`RouteUtils`). Never call `decodeURIComponent()` directly on an
  untrusted route segment elsewhere — wrap it through
  `RouteUtils.safeDecodeRouteSegment()`, which turns a `URIError` into
  `{ ok: false }` instead of throwing.
- **Encode/decode a dynamic route segment exactly once.** Building a hash
  goes through `RouteUtils.baseHash()`/`envHash()`/`routeToHash()`, which
  each run `encodeURIComponent()` once per dynamic segment — don't
  double-encode or hand-roll a URL elsewhere.
- **A malformed route component falls back independently.** A bad `/env/<id>`
  suffix must not discard a valid base route underneath it, and a bad list
  ID must not discard a valid environment overlay on top of it.
- **Repair a malformed address with `history.replaceState()`**, never
  `location.hash = …`, `pushState()`, or a reload — that's what keeps a
  repair from adding a history entry or firing a second `hashchange`.
- **`js/app.js` reads the current route only through `readCurrentRoute()`**
  — never a direct `RouteUtils.parseRouteHash(location.hash)` call at a new
  site; that's what keeps repair-on-malformed-input applied consistently.

## Lists persistence

- **List rename validation is centralized** in the pure
  `ListUtils.resolveListRename(currentName, rawValue)` (`js/list-utils.js`),
  used by both the `change` (blur) and Enter commit paths in `js/app.js`
  (`bindListRename()`/`commitListRename()`) — don't add a second validation
  branch for one event type.
- **An invalid or unchanged rename never persists.** Only a `'changed'`
  result from `resolveListRename()` updates `list.name` and calls
  `persist()`; an invalid rename restores the previously committed name and
  shows an inline per-card error instead.
- **List IDs and routes never change on rename** — a rename is a name-field
  update only, never a re-keying of the list.

## Journey 2 map storage

- **Journey 2 owns exactly four keys**, all `dhcodex_journey2_*`
  (`js/journey2-store.js`): `map`, `map_recovery`, `map_previous`, and `ui`
  (view preferences: `{ sideCollapsed }`, read/written only through
  `store.loadUi()/saveUi()`, malformed -> defaults, never part of the document
  or Undo history). It never
  reads, writes or clears a legacy Journey, Prep or unrelated key, and
  `tests/journey2-store.test.js` plus `scripts/journey2/stage1-verify.js` assert
  every non-Journey-2 value stays byte-identical.
- **Never autosave over an unreadable map.** A stored document that fails
  `Journey2Model.validateDocument` is reported (`status: 'corrupt'`), left
  untouched under its own key, copied to `map_recovery`, and edits are locked
  until the user imports a backup or explicitly starts an empty map. Don't use
  `SafeStorage.loadStoredJson`'s recover-and-overwrite behaviour for it.
- **The success state is the write result.** Show "Saved" only after
  `store.save()` returned `{ ok: true }`; a failure shows the banner and keeps
  the in-memory map usable and exportable.
- **A schema change needs a version bump and an explicit rejection of unknown
  versions** — import never repairs or drops fields silently.

## General

- Never clear or reset all user data merely to simplify a migration or a
  bug fix — sanitize per-entry and per-key, matching the existing
  `sanitize*Entry()` pattern in `js/safe-storage.js`.
- Use actual helper names from `js/safe-storage.js`/`js/route-utils.js`/
  `js/list-utils.js`/`js/prep-utils.js` when documenting or
  discussing this layer — don't invent an abstraction that isn't there.
