# Contract: the Scene Composer (Darkheart)

The contract behind the Darkheart page (`#/darkheart`). Decision records:
[PD-098](../product-decisions.md) (the model) and PD-099 (the playable page); the
compatibility manifest it reads is [darkheart-scenes.md](darkheart-scenes.md) (PD-097).
All four components are implemented: Outcome (`js/darkheart-expedition.js`),
Environment Selection (`js/darkheart-composer.js`), NPC (`js/darkheart-npc.js`) and
Encounter Composition (`js/darkheart-encounter.js`); `js/darkheart-view.js` is the
DOM layer. They are loaded as ordinary runtime scripts, and the scene data is fetched
only on the first visit to the page.

## What PD-099 changed in this contract

- **The composition boundary** is `DarkheartComposer`. A scene is dealt only for an
  outcome its manifest entry maps (`eligibleScenes`; never filtered by tier, PD-100), not repeated until the
  pool is spent (`dealScene`), and an encounter is requested only through
  `encounterFor({ scene, outcome, ... })`, which returns `{ status: 'blocked', code }`
  for an outcome the scene does not map (`scene-outcome-mismatch`). `assembleEncounter` stays the reusable low-level tool
  and does not check this itself.
- **The engine reads the scene.** Its input gained `scene: { adversaries, themes }` (the
  manifest scene's `adversaries` mode and optional `encounter.themes`) and its context
  gained the affinity file: `createContext(adversaries, environments, affinity)`.
  Candidates are (1) source adversaries *relevant to what the scene shows*: a whole
  environment shown with its list keeps all of it; a hidden list or a fragment keeps only
  those the shown text names or whose themes match the scene's; (2) catalogue adversaries
  the affinity file files under the scene's themes; (3) role fillers from the themes'
  declared `related` themes, only where combat is not optional. A scene with no theme
  suggests nobody (`no-encounter-theme`). The old name-matching theme table is gone.
- **`data/darkheart-affinity.json`**: `{ themes: { id: { name{en,ru}, related[] } }, adversaries: { adversaryId: [theme] } }` (the `neutral` theme is the PD-108 top-up, at least six per tier, checked by `validate-data`),
  validated by `scripts/validate-data.js` (ids exist in `data/prep.json`, themes declared,
  `related` exists). Eight themes today: wolves, beasts, vermin, undead, sylvan, outlaws,
  demonic, underground.
- **GM theme (PD-101):** `encounterFor({ gmTheme })` is honoured only for a scene that names no theme, and its picks
  are labelled as the Master's choice; a scene's own themes always win and a noncombat outcome never gains a fight.
- **The manifest scene** may carry `encounter: { themes: [...] }` (themes must exist in
  the affinity file).
- **Persisted expedition** (`dhcodex_darkheart`): party, Fear, FD, the dice being typed,
  the phase (`roll` / `arrived`), the arrival, the scene composition (`outcome`, `sceneId`,
  `dealt`, the NPC with its lock, the encounter seed and locked `[{ id, quantity }]`), a
  40-entry log and a 20-entry undo stack. Contract in `docs/product-decisions.md` PD-099.
- **Quantities in the Encounter Builder:** FreshCutGrass ignores `q` in a shared link, so
  the page exports one entry per adversary. `builder.entries[].quantity` stays in the result.

## PD-104 addendum

Scenes may also be *derived* from the suitability layer ([darkheart-suitability.md](darkheart-suitability.md)): an outcome entry
may carry its own `encounter: { themes, adversaries }`, which `encounterFor` prefers over the scene's. `creature-fail-hope` may hold
two adversary lines and prefers the `folk` theme where the place has people. `generateNpc` accepts `situations` (what the place supports).

## Principles

- **Four components, each regenerable on its own.** Regenerating one never
  silently regenerates another. A component may be *locked* by the Master.
- **Darkheart rules stay authoritative** for the campaign-specific outcome
  (the twelve cells of the Hope/Fear parity table, including each outcome's own
  countdown). Nothing a component returns overrides them.
- **No campaign state.** No component reads or writes GM Fear, Forest
  Difficulty, quest countdowns or expedition state. Those belong to the
  dashboard and are never passed in or returned.
- **Source content is never mutated.** Environments, features and adversaries
  are referenced by id (features by English name + type) and shown untouched;
  changes are advice (`guidance`) or explicit reviewed `adaptation` records.
- **Advisory and bilingual.** Every sentence a component returns is `{ en, ru }`.
  Battle Points are guidance, not a guarantee of difficulty.
- **Pure.** A component is a function of its input and the static catalogues;
  the same input (including `seed`) gives the same output.

## The composition envelope

The dashboard holds one object per scene; components are siblings, not nested.

```json
{
  "schema": 1,
  "components": {
    "outcome":     { "locked": false, "seed": null, "value": { /* 1 */ } },
    "environment": { "locked": false, "seed": null, "value": { /* 2 */ } },
    "npc":         { "locked": false, "seed": null, "value": { /* 3 */ } },
    "encounter":   { "locked": false, "seed": null, "value": { /* 4 */ } }
  }
}
```

**Regeneration and dependency order:** outcome → environment → { npc, encounter }.
Regenerating a component leaves every other `value` as is, but marks dependants
`stale` (a UI concern, not stored data) when something they consumed changed:

| Regenerated | Consumed by | Effect |
| --- | --- | --- |
| outcome | environment (candidate scenes), npc, encounter | the others are stale, never auto-replaced |
| environment | npc, encounter | stale, never auto-replaced |
| npc | encounter (optional) | none unless the Master locks the NPC as a creature |
| encounter | nothing | none |

## 1. Darkheart Outcome

The parity roll's result. Owned by the dashboard (the Master's dice); this
component only validates and labels it.

```json
{ "outcome": "creature-fail-fear" }
```

`outcome` is one of the twelve keys (`OUTCOME_KEYS` in
`js/darkheart-scenes.js`, mirrored by `OUTCOME_POLICY` in the encounter
engine, and a test pins the two to the same set). The Darkheart rule text is the
reviewer's checklist, never copied into the value.

## 2. Environment Selection

A selectable scene from `getSelectableScenes(manifest, environments)` (the only
sanctioned read path) for the outcome, dealt for the hex's terrain and tier.

```json
{
  "sceneId": "hunter-or-hunted-wolf-ground",
  "environmentId": "hunter-or-hunted",
  "match": "full",
  "featureNames": [],
  "outcome": "creature-fail-fear",
  "framing": { "title": { "en": "…", "ru": "…" }, "summary": { "en": "…", "ru": "…" } },
  "guidance": { "adjust": ["scale"], "text": { "en": "…", "ru": "…" } },
  "adaptation": null
}
```

`featureNames` is empty for a whole-environment scene and otherwise lists the
shown fragment (English names). `framing`, `guidance` and `adaptation` are copied
from the manifest's outcome entry and shown beside, never inside, the source.

## 3. NPC (implemented in PD-099, minimal)

`DarkheartNpc.generateNpc({ outcome | role, sceneId?, situation?, seed })` returns the value
below plus `look`, `line`, `need`, `ancestry` and an `avatar` (ancestry shape + palette) —
deterministic tables, EN and RU. The shape the encounter engine and the page agree on:

Input the NPC generator will receive:

```json
{ "tier": 1, "partySize": 4, "outcome": "creature-success-fear",
  "environmentId": "root-rush-rescue", "featureNames": [], "seed": "…" }
```

Value it returns:

```json
{
  "role": "in-peril | side-quest | neutral-creature | none",
  "name": { "en": "…", "ru": "…" },
  "summary": { "en": "…", "ru": "…" },
  "adversaryId": null,
  "generated": true
}
```

Rules: `role` follows the outcome (`in-peril` for "NPC in immediate peril",
`side-quest` for "NPC with a side quest", `neutral-creature` for "Neutral but
formidable"; `none` otherwise). An NPC introduced into a scene that had none
(a dangerous place turned NPC-in-peril) is `generated: true` and is *new
narrative material*, never a stat block. `adversaryId` is set only when the NPC
**is** an existing catalogue adversary (a neutral creature, or a Master-locked
one); it then flows into the encounter as a locked adversary. The generator may
not invent stats, edit the catalogue or touch campaign state.

## 4. Encounter Composition (implemented)

`DarkheartEncounter.assembleEncounter(input, ctx)` in `js/darkheart-encounter.js`.

```js
const ctx = DarkheartEncounter.createContext(prepAdversaries, environments); // data/prep.json, data/environments.json
const result = DarkheartEncounter.assembleEncounter({
  tier: 1,                      // party tier, 1-4
  partySize: 4,                 // 1-20 (clamped; a clamp is reported)
  difficulty: 'standard',       // 'easier' | 'standard' | 'harder'
  outcome: 'creature-fail-fear',
  environmentId: 'hunter-or-hunted',   // or `environment: {…}`
  featureNames: [],             // optional fragment, English feature names
  locked: ['dire-wolf', { id: 'bear', quantity: 1 }],   // optional
  seed: 'any string or number', // optional; same seed = same result
}, ctx);
```

### Output

| Field | Meaning |
| --- | --- |
| `status` | `complete`, `partial` (budget could not be filled with fitting adversaries, or locked ones exceed it), `empty` (combat expected, nothing fits), `none` (the outcome has no combat and nothing is locked), `invalid` (bad input; see `errors`). |
| `combat` | The outcome's posture: `recommended`, `prepared`, `optional` or `none`. |
| `adversaries[]` | `{ id, name{en,ru}, tier, role, quantity, source, locked, crossTier, unitCost, lineCost, reason{en,ru} }`, plus `minionGroups`/`groupSize` for Minions. `source` is `locked`, `environment`, `narrative`, `role-filler` or `neutral` (PD-108). `crossTier` is `null` for every recommended line; `lower`/`higher` only for a locked one. |
| `battlePoints` | `{ partySize, style, baseBudget, modifiers[], available, spent, remaining, overBudget, costLines }`. `modifiers` always lists `difficulty`, `lower-tier`, `multiple-solos`, `no-heavy-type` and `boosted-damage` with `{ id, value, applied }`; `boosted-damage` is never applied (the engine never boosts damage). |
| `reasoning[]`, `warnings[]` | `{ code, text{en,ru}, severity?, id? }`. Warning codes: `no-environment-adversaries`, `higher-tier-excluded`, `too-low-tier-excluded`, `cross-tier-used`, `insufficient-thematic-candidates`, `variety-limits`, `nothing-fits`, `no-candidates`, `over-budget`, `locked-missing`, `locked-duplicate`, `locked-higher-tier`, `locked-no-combat`, `unknown-fragment-feature`, `party-size-clamped`. |
| `builder` | `{ entries: [{ id, name, quantity }], unsupported: [id] }`, the "Open in Encounter Builder" payload (below). |
| `input` | The normalized input actually used, including `seed` and the applied `locked` ids. |

The result has no field for Fear, Forest Difficulty, countdowns or expedition
state, and a test pins that.

### Battle Points

Every cost, budget and modifier comes from `BattlePoints.calculate()`
(`js/battle-points.js`, also behind Prep's header). The engine states no
number of its own: base `3 × party size + 2`; Minion group 1, Social/Support 1,
Horde/Ranged/Skulk/Standard 2, Leader 3, Bruiser 4, Solo 5; `easier` −1,
`harder` +2 (`dangerous` in battle-points.js); +1 for an adversary of a lower
tier; −2 for several Solos; +1 for no Bruiser/Horde/Leader/Solo. Because those
modifiers depend on the composition, the search re-evaluates the whole
composition with `calculate()` at every step. **Minions are taken only as full
groups equal to the party size** (one group costs 1), so the engine never relies
on a fractional Minion cost. Treat the total as guidance, not a guarantee.

### Selection priorities

1. **Environment** — the environment's Potential Adversaries that resolve to the
   catalogue, via the same parser and name matcher Prep's recommendations use
   (plus any catalogue adversary the shown fragment names). Read even when the
   scene does not *display* the list (`scene.adversaries`), because the
   encounter is its own component.
2. **Narrative** — catalogue adversaries whose English name matches a theme of
   the scene (`THEME_NAME_TERMS`: beast, vermin, undead, sylvan, elemental, ooze,
   outlaw, fiend, construct, aquatic). The scene's themes come from the
   environment's listed adversaries, or from its lore and shown features only when
   it lists none the catalogue knows. This table is the engine's one heuristic;
   adversaries carry no tags in the catalogue.
3. **Role filler** — same-tier adversaries inside the scene's themes (or, when
   the scene has none, its terrain's), used only to complement roles. Never used
   for `optional` or `prepared` outcomes, and never unrelated enemies.

4. **Neutral top-up (PD-108)** — when a scene that wants adversaries (it has a
   theme, or a source list it shows) offers fewer than **six** candidates of the
   party's tier, the pool is topped up from the affinity file's curated `neutral`
   theme of the same tier, in a seed-shuffled order, so "New encounter" has real
   alternatives. Lowest weight, `source: 'neutral'`, reason "added so you have a
   choice", and a `neutral-top-up` reasoning line. A scene that deliberately
   shows none stays empty. `neutral` is never a Master's theme.

**Tiers (PD-108):** only the party's own tier is recommended — an adversary used
outside the tier it was written for plays badly. Above or below is excluded and
reported (`higher-tier-excluded`, `too-low-tier-excluded`); a *locked* adversary
is always kept (flagged `crossTier`, with the lower-tier adjustment when below).
No stat block is ever created or rescaled.

**Shape:** at most four distinct adversaries (five for a recommended fight with
five or more characters), at most one Leader and one Solo of its own choosing,
non-Minion bodies capped at party size + 1, at most two Minion groups. Anything
left over after those limits is reported as `variety-limits`, not padded.

### Outcome behaviour

| Outcomes | `combat` | Behaviour |
| --- | --- | --- |
| `creature-fail-fear` | `recommended` | Combat composition by default. |
| `creature-fail-hope` | `prepared` | One thematic stat block on hand; combat never forced. |
| `creature-success-fear`, `hazard-fail-fear`, `hazard-fail-hope`, `resource-success-fear` | `optional` | Thematic adversaries only (priorities 1-2); the danger may be environmental or the guard optional. |
| `creature-success-hope`, `landmark-*` (all four), `resource-success-hope` | `none` | Nothing generated, so a safe landmark never gains a hostile encounter. If the Master locks adversaries they are kept, with a `locked-no-combat` note. |

### Locking, regeneration, difficulty

- **Regenerate independently of the scene:** call again with another `seed`.
- **Lock:** `locked` ids are kept as given (a missing id, a duplicate or an
  over-budget set is reported, never silently dropped or "fixed"); the rest is
  regenerated around them.
- **Difficulty:** changing it re-budgets and regenerates; locks are kept.
- **Partial:** insufficient candidates return what exists with a warning.

### Open in Encounter Builder

`DarkheartEncounter.encounterBuilderEntries(result, ctx)` returns the canonical
English names and quantities; `encounterBuilderUrl(result, name, ctx)` builds
the link through the app's single encoder,
`FreshCutGrassUtils.buildFreshCutGrassEncounterUrl(name, names, quantities)`.
The new third argument is optional: without it every adversary stays `q: 1`
exactly as Prep exports it today (tested), and nothing in Prep passes it. Names
come from the catalogue's own spelling (FreshCutGrass's), through the same
supported-name index; one the index does not hold is reported in
`builder.unsupported` and never sent. **Unverified:** whether FreshCutGrass reads
`q` for a Minion as individuals or as groups; the engine sends the individual
count (group size × groups).
