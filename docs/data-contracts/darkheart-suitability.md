# Data contract: `data/darkheart-suitability.json`

Decision record: [PD-104](../product-decisions.md). Code: `js/darkheart-suitability.js` (rules, scene synthesis,
validation), `js/darkheart-guidance.js` (GM Guidance), wired into `scripts/validate-data.js`;
`scripts/darkheart-coverage-report.js` prints the coverage tables; `tests/darkheart-suitability.test.js` is the suite.

## The model

Four separate responsibilities: **Environment** (location, atmosphere, terrain, source features), **Outcome** (the situation
and its Darkheart rule), **Participants** (a generated NPC, thematic adversaries from the existing catalogue) and **GM
Guidance** (optional suggestions tying the first three together). An environment never needs to mention a resource, enemy,
NPC, campfire or countdown to serve an outcome; what decides is the character of the place.

## File shape

```json
{ "schema": 1,
  "profiles":   { "<envId>": { "tags": ["wild","hard"], "themes": ["sylvan"] } },
  "exclusions": [ { "envId": "bastion", "category": "home-base", "reason": "…" } ],
  "overrides":  [ { "envId": "…", "outcome": "creature-fail-fear", "mode": "add|remove", "reason": "…" } ] }
```

- `tags` (2–6, most characteristic first): `wild outlaw haunted fey dark serene refuge lair ruin folk hard deadly bog water fire uncanny tragic crisis`.
  Statements about the **place**, never about a creature the source lists.
- `themes` (optional): affinity themes that replace the tag-derived adversary themes for hostile/guard outcomes.
- `exclusions`: a considered environment that cannot serve any outcome, with a category (`home-base war-scale not-a-place urban interior planar terrain`) and a reason.
  Every forest-tagged environment must be profiled or excluded (validator error otherwise). Environments in neither list were not considered (terrain: no forest, wetland, rolling or grassland biome; or a settlement/universal framework).
- `overrides`: the only exception to a rule, with a reason. An override that repeats what the rule already says is a warning.

## Outcome rules (`OUTCOME_RULES`)

A place serves an outcome if it carries **any** of `any` and **none** of `none` (a traversal-type environment also qualifies where `travel`).

| Outcome | any of | none of |
| --- | --- | --- |
| creature-fail-fear | wild outlaw haunted lair deadly | refuge serene |
| creature-fail-hope | folk fey wild outlaw refuge serene lair ruin | deadly crisis |
| creature-success-fear | wild hard deadly bog fire ruin haunted lair outlaw crisis | refuge serene |
| creature-success-hope | folk fey serene refuge wild ruin tragic | deadly crisis |
| landmark-fail-fear | dark haunted | refuge |
| landmark-fail-hope | ruin haunted tragic | crisis |
| landmark-success-fear | any profiled place | — |
| landmark-success-hope | serene refuge folk fey wild ruin bog hard uncanny | dark deadly haunted crisis lair outlaw |
| hazard-fail-fear | deadly hard bog fire water, or traversal type | refuge serene |
| hazard-fail-hope | hard bog wild fire uncanny water deadly, or traversal type | refuge serene |
| resource-success-fear | ruin lair wild fey haunted outlaw | refuge serene crisis |
| resource-success-hope | wild ruin serene fey folk bog haunted hard tragic refuge uncanny | deadly crisis |

Source countdowns, written treasure, named enemies, NPCs and campfires are never read. Tier never filters (PD-100).

## Composition

- `buildScenes()` makes one whole-environment scene per profiled environment for the outcomes the reviewed manifest scenes
  do **not** already map for it (`derived: true`, `match: "suitable"`, id `suit-<envId>`); the catalogue record is untouched and
  the manifest keeps its authored framing and `adaptation` records. Each outcome entry carries its own framing and
  `encounter: { themes, adversaries }` (`composer.encounterFor` prefers it): hostile opposition may use the environment's own
  Potential Adversaries list; everything else is chosen by themes (`themesFor`: tags → affinity themes; a neutral meeting
  prefers the humanoid `folk` theme where the place has people, never undead, vermin or demons).
- NPC: `generateNpc({ situations })` picks among the situations the place supports (`npcSituations`: a bog drowns, a ruin
  collapses, a fire burns); without `situations` an NPC is dealt exactly as before.
- Features: `featurePlan()` shows the source features as printed, except one that names catalogue adversaries other than the
  generated roster; that one is shown as an adapted line, and its original wording sits under Source and adaptation.
- GM Guidance (`guidanceFor`): 2–6 short labelled lines per outcome, picked by the place's tags and one of its own features,
  bilingual, visibly optional. Resources: a presentation (chest, pack, hollow-tree cache, buried stash…), the Master's own loot
  tables or a boon, a quest clue instead (tied to the party's current quest, which the page does not track); guarded resources
  offer creature guards **or** a hazard, one is enough. No loot is rolled, no countdown tracked.
  The two creature fails carry a `stakes` line (PD-106): the hostile, deadly adversary suggests a Progress Countdown (6)
  against a Consequence Countdown (3), the neutral one two even countdowns (6 / 6) — a suggestion, never eligibility or a rule;
  the hazards keep the book's own countdowns.

## Counting convention (coverage report)

*Eligible* = distinct environments able to serve the outcome (an environment counts once however many NPCs or rosters it can
make). *Authored* = reviewed-scene outcome entries carrying an `adaptation` plus `overrides` for that outcome.
*Fallback-only* = eligible solely through the tag rule (no reviewed scene, no override); a subset of eligible, disjoint from authored environments.
