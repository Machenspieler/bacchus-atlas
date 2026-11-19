# Data contract: `data/darkheart-scenes.json`

The Darkheart compatibility manifest: a **sidecar** over
`data/environments.json` that records which environments, or which features of
them, a Darkheart Forest traversal outcome may deal as a scene. The decision
record is [PD-097](../product-decisions.md); the code is
`js/darkheart-scenes.js` (schema constants, fingerprints, the single
analysis pass), wired into `scripts/validate-data.js`, with
`scripts/darkheart-review-report.js` as the maintenance report and
`tests/darkheart-scenes.test.js` as the regression suite. Where this document
and the validator disagree, the validator is the authority.

It is **data only**. There is no route, dashboard or scene generator yet, no
file in `js/` reads it, and `index.html` and `js/app.js` must not reference it
(a test pins that), so it adds nothing to the initial page. It ships in
`dist/data/` like every data file, fetched by nothing until the generator
exists.

## What it is, and what it never does

- It **never changes catalogue content.** Environments are referenced by their
  existing `id`; features by English name and type; nothing is copied, edited or
  generated into `environments.json`.
- It **never rewrites source rules.** A scene shows the source text untouched.
  A mechanic or presentation change exists only as an explicit, reviewed
  `adaptation` record shown beside the source, never substituted into it
  (PD-097, decision 10). The Darkheart encounter rules take precedence over a
  conflicting source mechanic (decision 9), but the conflict has to be recorded
  and reviewed; nothing is stripped or substituted automatically.
- **No runtime AI.** Every mapping, framing and adaptation is curated
  build-time data (decision 11).
- Darkheart-specific text (`framing`, `adaptation`) is kept in the manifest,
  separate from the environment, so a scene card can label it as added by this
  site.

## Compatibility is flexible, not exact (PD-098)

Darkheart is a GM **improvisation assistant**, not an exact-match simulator. A
Master is comfortable adapting terrain, location, scene scale, NPC involvement,
hostility, countdowns and difficulty: a mountain avalanche becomes a collapsing
forest ravine, a city attack an attack on a woodland hamlet, a lone danger an
NPC-in-peril once an NPC is introduced, a Countdown 8 obstacle a Countdown 3
hazard, a neutral creature a hostile one (or the reverse). So:

- **ADAPTED is a normal, first-class match kind**, not a last resort. Prefer an
  honest ADAPTED scene to leaving a good source out; but the source must still
  give the table **meaningful narrative material**. Never add a scene only to
  raise coverage.
- **Two ways to say "adjust this", both separate from the source:**
  - `guidance` (new, optional, any match kind): concise bilingual advice on what
    the Master may change at the table (see below). Nothing is recorded as
    changed; the source is shown untouched and the advice sits beside it.
  - `adaptation` (unchanged contract, ADAPTED only): an explicit, reviewed
    record of a change to specific source wording, with an exact quote. Use it
    when the scene itself, not just the table, depends on the change (a source
    result that mirrors the Darkheart roll, a terrain outside the biome tags).
- **"Deadly" and "neutral" stay undefined.** No numeric threshold is a
  prerequisite for compatibility; the Master decides, and a scene says how to
  lean (`hostility`, `difficulty` guidance). The encounter engine uses Battle
  Points as guidance only (PD-098), never as a definition of either word.
- **Nothing the validator guards is loosened.** Structure, references,
  fingerprints, stale-quote detection, terrain/tier rules, bilingual text and
  the duplicate-mapping check are exactly as before; flexibility lives in what
  is *allowed to be authored*, not in what is *checked*.

### `guidance`: concise GM adaptation advice

```json
"guidance": {
  "adjust": ["scale", "terrain"],
  "text": { "en": "Make it a clearing, not a village; the rest is the same.",
            "ru": "Пусть это будет поляна, а не деревня; остальное без изменений." }
}
```

`adjust` lists what the Master may change, each of `terrain`, `location`,
`scale`, `npc`, `hostility`, `countdown`, `difficulty` (`GUIDANCE_ADJUSTS`),
no repeats. `text` is bilingual (EN and RU both required, RU Cyrillic) and at
most 280 characters per language: advice, not a rewrite. Guidance never
changes a fingerprint, and a scene with malformed guidance is withheld like any
other invalid scene. A countdown mentioned in guidance is the Master's call; the
Darkheart rules keep authority over the outcome's own countdown.

## Environment tier and difficulty never filter a scene (PD-100)

Darkheart's difficulty is the **Forest Difficulty**, which starts at 15, rises by 1 per new hex and does not depend
on the Party Tier or on the environment's own tier or difficulty. So the manifest carries no tier restriction and
the page filters scenes by **outcome only**. At display time the page reads the environment's text at the Party
Tier (an optional GM override exists) through the card's own tier-scaling (`retierFor` / `retierDamage`, so damage
dice scale) and replaces every printed check DC with the current Forest Difficulty (`renderEnvTextForDarkheart`);
nothing is written back to the catalogue or the manifest. Adversaries and Battle Points follow the Party Tier, a
different concept from the environment's tier. The environment fingerprint still covers the environment's tier and
difficulty, so editing either re-pins the review; that is provenance, not eligibility.

## The twelve outcomes

The Hope and Fear d12 parity decides the encounter type: both odd Creature,
both even Landmark, mixed Hazard (on a failure) or Resource (on a success).
Matching dice are a critical success and count as Success with Hope while
keeping their parity. The manifest's vocabulary is the twelve cells of that
table, exactly (`OUTCOMES` in the library):

| Key | Darkheart rule |
| --- | --- |
| `creature-fail-fear` | Hostile, deadly adversary |
| `creature-fail-hope` | Neutral but formidable adversary |
| `creature-success-fear` | NPC in immediate peril |
| `creature-success-hope` | NPC with a side quest |
| `landmark-fail-fear` | Dark omen, no rest |
| `landmark-fail-hope` | Tragic landmark, no FD reduction while resting |
| `landmark-success-fear` | Foreshadowed danger, only 1 downtime move |
| `landmark-success-hope` | Traveler's magical campfire, safe rest |
| `hazard-fail-fear` | Deadly hazard, countdown 6 |
| `hazard-fail-hope` | Obstacle, countdown 3 |
| `resource-success-fear` | Guarded resource, countdown 1d6 |
| `resource-success-hope` | Useful resource, boon, or clue |

The rule text is the reviewer's checklist, not runtime text. The countdowns in
the hazard and resource rows belong to the Darkheart rules, never to the
fragment.

## File shape

```json
{
  "schema": 1,
  "fingerprintVersion": 1,
  "reviews": [ /* one entry per environment that has been looked at */ ],
  "scenes":  [ /* one entry per approved or suspended source selection */ ]
}
```

Unknown keys anywhere are errors (a typo is never silently ignored).

### `reviews[]`: the environment-level ledger

| Field | Notes |
| --- | --- |
| `envId` | An existing environment id; one entry per environment. |
| `status` | `reviewed` (has at least one scene), `reviewed-none` (explicitly looked at, no compatible outcome; needs `reason`, may carry no scenes) or `pending` (queued, no verdict, nothing else). |
| `compatibility` | `native-forest`, `naturally-compatible` or `conditionally-adaptable` (forest-first, not forest-only; PD-097 decision 1 and 2). Required for `reviewed`. Must match the catalogue: an environment tagged `forest` is `native-forest` and only those are; the other two need a `rationale`. |
| `rationale` | EN note: why a non-forest environment can host the scene (naturally-compatible), or how it can be made to (conditionally-adaptable). |
| `reason` | EN note, required for `reviewed-none`: why nothing fits. |
| `envFp`, `reviewedOn` | Fingerprint of the whole environment at review time, and the date. |
| `note` | Free EN reviewer note. This is where rejected and deferred candidates are recorded, with why. |

An environment that is in no entry is **unlisted**, which means not yet reviewed
(most of the catalogue today). It is not an error.

### `scenes[]`: one entry per source selection

| Field | Notes |
| --- | --- |
| `id` | Unique lowercase slug. |
| `envId` | Existing environment id, whose review must be `reviewed`. |
| `match` | `full`, `partial` or `adapted`; see below. |
| `status` | `approved` (selectable) or `suspended` (kept, never selectable; needs `suspendedReason`). |
| `terrain` | Where the scene may be dealt: `any` (only for naturally-compatible) or biome ids from the environment's own `biomes`. A native-forest scene must include `forest`. A biome the environment is not tagged for is allowed only for a conditionally-adaptable environment whose adaptation records a `terrain` change. |
| *(no `tiers`)* | There is deliberately no tier field (PD-100): a reviewed scene is dealt to a party of any tier, whatever tier its environment was written for. A leftover `tiers` key is an unknown-key error. |
| `features[]` | `{ name, type, fp }`: the shown features (partial, and adapted when feature-level). The key is the environment id, the English feature name and the type; `fp` is the feature's content fingerprint. |
| `excluded[]` | `{ name, type, reason }`: every other feature of the environment, with why it is left out. Together with `features` it must be exactly the environment's feature list. |
| `standaloneNote` | EN: why the shown features stay meaningful without the left-out ones. |
| `dependencyNotes[]` | `{ from, to, note }`: acknowledges a shown feature that names a left-out sibling without depending on it. |
| `envFp` | Whole-environment pin (full, or adapted without `features`). |
| `adversaries` | `source` (show the environment's `potential_adversaries`, whole-environment scenes only) or `none`. |
| `encounter` | Optional `{ themes: [...], sourceRoster?: true }` (PD-099; `sourceRoster` PD-103: the shown source feature names its own adversaries, so the page states that the dashboard's generated roster is the one to run): which adversary themes of `data/darkheart-affinity.json` belong to this selection. Without it the scene suggests no enemies (a whole environment shown with `adversaries: "source"` still offers its own list). |
| `art` | The explicit artwork decision; see below. |
| `outcomes[]` | One entry per Darkheart outcome this selection serves (framing, optional `guidance`, `adaptation` when ADAPTED); see below. |
| `note` | Free EN reviewer note. |

**Match kinds**

- **FULL**: the whole environment as printed. No `features`/`excluded`; pinned by `envFp`.
- **PARTIAL**: a proper subset of the features, listed in `features` (never all of them; that is FULL), with every other feature in `excluded`. Each shown feature is pinned by its own `fp`. A partial scene shows no environment-level adversary list.
- **ADAPTED**: a curated scene whose outcomes each carry an `adaptation`. It may be whole-environment (`envFp`) or feature-level. It is the only match kind that may change anything, and a conditionally-adaptable environment can only have adapted scenes.

### `outcomes[]`: framing, guidance and adaptation per outcome

```json
{
  "outcome": "resource-success-hope",
  "guidance": { "adjust": ["scale"], "text": { "en": "…", "ru": "…" } },
  "framing":   { "title": { "en": "…", "ru": "…" }, "summary": { "en": "…", "ru": "…" } },
  "adaptation": { "summary": { "en": "…", "ru": "…" },
                  "changes": [ { "kind": "mechanic", "target": "Valley Flora",
                                 "source": "On a success with Hope, they find all three of the below plants.",
                                 "adapted": { "en": "…", "ru": "…" },
                                 "why": "…" } ] }
}
```

- `framing` (title, summary) is required for every outcome and is **bilingual in
  both languages** (`{ en, ru }`, EN and RU both non-empty, RU containing Cyrillic). New Darkheart
  text is never English-only, unlike the catalogue's optional `ru`. Russian follows
  [the glossary](../translation-glossary.md): Мастер, Страх, Надежда, Отсчёт, Ход Отдыха.
  Dice notation stays Latin.
- `guidance` is optional on every outcome of every match kind (see "Compatibility is
  flexible" above).
- `adaptation` is required for every outcome of an `adapted` scene and forbidden
  otherwise. Each `change` names its `kind` (`mechanic`, `presentation`, `terrain`,
  `setting-reference`, and since PD-098 `location`, `scale`, `npc-involvement`,
  `hostility`, `countdown`, `difficulty`), the shown feature it `target`s, an exact `source` quote that
  must be found in that feature's English description (so a changed source also breaks
  the adaptation), the bilingual `adapted` wording, and `why` it is safe: what the
  source result still is.
- One selection can serve several outcomes, each with its own framing and its own
  adaptation (`gnarled-glen-lingering-souls` reads the same feature at its failure
  result for one outcome and at its Hope result for another). The same outcome may also
  come from different fragments of one environment; an identical
  (environment, outcome, feature set) is a duplicate mapping and an error.

### `art`: an explicit decision, never a default

`{ mode, source?, ref?, reason }`, `reason` always required.

- `original`: the environment's own painting; valid only where the catalogue resolves
  the environment to an approved unique painting. For a partial or adapted scene the
  reason must say why the painting still represents the fragment.
- `fallback` with `source: "archetype"`: `ref` must be exactly the thematic picture
  the catalogue already approves for that environment (both gates of PD-089).
- `fallback` with `source: "biome"`: `ref` is a biome id whose art exists in `img/biomes/`.
- `none`: no picture.

A fragment is never assumed to be represented by its environment's art; the reviewer
decides, and the validator checks the decision against the live art tables.

## Fingerprints and stale mappings

The feature fingerprint covers the **type, English name and English description**, with
case, spacing, quote style and punctuation flattened, so a house-style pass never
invalidates a mapping, but a changed word, number or type does. The Russian text and the
GM `prompt` are not covered. The environment fingerprint covers tiers, type, difficulty,
biomes, name, lore, impulses, potential adversaries and every feature, in order.
`fingerprintVersion` names the algorithm; a different version means no pin is trusted and
nothing is selectable until the manifest is re-pinned.

**Safe behaviour for an outdated mapping** (PD-097):

1. A scene with a missing environment, an unknown or ambiguous or renamed feature, a stale
   pin, an unclassified or vanished sibling, a stale adaptation quote, or any other
   validation error is **not selectable**. `getSelectableScenes(manifest, environments)`
   is the only sanctioned read path for the future generator and returns just the
   scenes with no error, so an outdated mapping cannot remain in play silently.
2. The same condition is an **error in `node scripts/validate-data.js`**, so the deploy
   is blocked until a person re-reads the source and either re-pins (`fp`/`envFp`) or
   sets the scene to `status: "suspended"` with a reason. A suspended scene stays out of
   play and its drift is only a warning.
3. Environment-level drift (`reviews[].envFp`) is a **warning**: re-confirm the review;
   scenes pinned to unchanged features stay valid.
4. Nothing ever re-pins or edits automatically. `node scripts/darkheart-review-report.js --pins <id>`
   prints the current fingerprints for a person to copy once they have re-read the text.

## Validation (`scripts/validate-data.js`)

Every check below is an error unless stated, all in the one analysis pass shared by the
validator, the report and `getSelectableScenes`:

- unknown environment id; unknown, ambiguous or duplicate feature reference (names are
  not unique across the catalogue, so a reference is only meaningful with its environment;
  within one environment they are unique today, and a future duplicate is reported as ambiguous);
- stale feature or environment fingerprint; untrusted `fingerprintVersion`;
- invalid outcome key, review status, scene status, match kind, compatibility class,
  terrain, art decision, adaptation kind or malformed `guidance` (unknown or
  repeated adjustment, missing RU, over 280 characters);
- duplicate scene id, duplicate review entry, duplicate (environment, outcome, selection) mapping;
- invalid FULL/PARTIAL/ADAPTED combinations (a FULL with features, a PARTIAL with none or
  with all of them, an adaptation outside an ADAPTED scene or missing from one);
- missing bilingual framing or adaptation text (EN or RU empty, or a RU that is not Cyrillic);
- unresolved sibling dependencies: a left-out feature neither shown nor excluded (including
  a feature added later), an excluded feature that no longer exists, a shown feature whose
  text names a left-out sibling without a `dependencyNotes` entry, a missing `standaloneNote`;
- a reviewed environment with no scene, or a reviewed-none / pending one that has scenes;
- a native-forest label on a non-forest environment, or any other class on a forest one.

`validate-data` also prints one coverage line (scenes selectable, outcomes covered,
environments reviewed / none / pending / not yet listed). Unlisted environments are
counted, not flagged.

## Maintenance process (including the `add-environment` workflow)

The manifest is how a changed catalogue is noticed. The **integration contract** for the
`add-environment` skill ([.claude/skills/add-environment](../../.claude/skills/add-environment/SKILL.md)),
also for `audit-environments`:

1. **A new environment is pending review.** After adding it, run
   `node scripts/darkheart-review-report.js --env <id>`; it reports `UNLISTED — pending
   review`. Nothing else is required to ship the environment: an unlisted environment
   simply carries no scenes. Optionally add `{ "envId": "<id>", "status": "pending" }`
   to `reviews` to put it in the queue explicitly.
2. **An edited environment is checked for stale mappings.** After correcting an environment
   (a typo fix, a retranslation, a rewritten feature), run the same command. A punctuation,
   quote, case or Russian-only fix reports nothing; a changed English word, number or
   feature type reports the affected scenes as stale, and `validate-data` fails until a
   person decides. A renamed, added or removed feature is reported as an unresolved
   sibling. Retranslating the Russian only never stales anything.
3. **The reviewer resolves each stale scene by hand:** re-read the changed source, then
   (a) re-pin with the values from `--pins <id>` if the scene still fits, (b) edit the
   framing/adaptation and re-pin, or (c) set `status: "suspended"` with a reason, or
   remove the scene. The environment's `reviews[].envFp` is re-pinned at the same time
   (`reviewedOn` updated).
4. **Reviewing an environment** (any time): read it in full, record the verdict in
   `reviews` (`reviewed`, with scenes, or `reviewed-none` with a reason), note the
   rejected candidates in `note`, and run `validate-data`. Prefer leaving a doubtful
   scene out: a candidate that needs an owner call goes in `note` as deferred.
5. **Never** automate the edit step, copy source text into the manifest, or add an
   AI-dependent step to the site. `--strict` (`node scripts/darkheart-review-report.js
   --strict`) exits non-zero while anything is unlisted, pending or stale; it is not in
   CI while most of the catalogue is still unreviewed.

## Review criteria used for the seed

A scene is approved only if the source text, read in full, supports the Darkheart rule as
printed:

- Every shown feature reads correctly **without** the left-out siblings.
- The environment's potential-adversary list is shown only where the creature is the
  point (`hunter-or-hunted`); a safe or non-creature scene hides it.
- A source branch that mirrors the Darkheart roll (`On a success with Hope…`) is handled by
  an explicit `mechanic` adaptation that reproduces exactly the source's own result for
  that outcome; it is never skipped by deleting the roll.
- "Deadly" and "neutral" have no measurable definition and need none (PD-098): they
  are not a prerequisite for compatibility. A candidate is judged on whether its
  source gives usable narrative material once the Master has made the adaptations
  the scene's `guidance`/`adaptation` describes, not on a numeric threshold.

## Encounters are a separate component

Which adversaries a scene brings is **not** part of this manifest. The encounter
engine (`js/darkheart-encounter.js`) assembles them independently from the same
environment and the existing adversary catalogue; see
[scene-composer.md](scene-composer.md). `scene.adversaries` here still only says
whether the environment's Potential Adversaries line is *displayed* with the scene.
