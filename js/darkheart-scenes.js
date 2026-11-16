/* ============================================================
   Bacchus's Atlas — scripts/lib/darkheart-scenes.js
   The Darkheart Forest compatibility manifest: schema constants, content
   fingerprints, the single analysis pass that validates data/darkheart-scenes.json
   against data/environments.json, and the one sanctioned read path for the
   future scene generator (getSelectableScenes).

   Pure and dependency-free: no fs, no crypto, no DOM. Everything that touches
   the file system or the art tables (loading the JSON, resolving artwork) is
   passed in through `ctx` by the caller (scripts/validate-data.js, the review
   report, the tests). The fingerprint hash is a small pure-JS one on purpose,
   so this same module can later be wrapped for the browser without changing a
   single pin in the manifest.

   Read-only: nothing here ever writes the manifest or the catalogue. A stale
   or invalid mapping is reported and quarantined, never "repaired".

   Contract and rationale: docs/data-contracts/darkheart-scenes.md and
   docs/product-decisions.md PD-097.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.DarkheartScenes = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';

/* ---------------- constants ---------------- */

const SCHEMA_VERSION = 1;
const FINGERPRINT_VERSION = 1;

/* The twelve distinct Darkheart traversal outcomes — the cells of the
 * parity table. Both d12 odd: Creature. Both even: Landmark. Mixed parity:
 * Hazard on a failure, Resource on a success. A matching-dice critical is a
 * Success with Hope that keeps its dice parity, so it lands in the same cells.
 * The keys are the vocabulary of the manifest; the `rule` strings are the
 * immutable Darkheart encounter rules (they take precedence over any source
 * mechanic, PD-097) and are the reviewer's checklist, not runtime text. */
const OUTCOMES = {
  'creature-fail-fear':    { encounter: 'creature', result: 'failure-with-fear', rule: 'Hostile, deadly adversary' },
  'creature-fail-hope':    { encounter: 'creature', result: 'failure-with-hope', rule: 'Neutral but formidable adversary' },
  'creature-success-fear': { encounter: 'creature', result: 'success-with-fear', rule: 'NPC in immediate peril' },
  'creature-success-hope': { encounter: 'creature', result: 'success-with-hope', rule: 'NPC with a side quest' },
  'landmark-fail-fear':    { encounter: 'landmark', result: 'failure-with-fear', rule: 'Dark omen, no rest' },
  'landmark-fail-hope':    { encounter: 'landmark', result: 'failure-with-hope', rule: 'Tragic landmark, no FD reduction while resting' },
  'landmark-success-fear': { encounter: 'landmark', result: 'success-with-fear', rule: 'Foreshadowed danger, only 1 downtime move' },
  'landmark-success-hope': { encounter: 'landmark', result: 'success-with-hope', rule: 'Traveler’s magical campfire, safe rest' },
  'hazard-fail-fear':      { encounter: 'hazard',   result: 'failure-with-fear', rule: 'Deadly hazard, countdown 6' },
  'hazard-fail-hope':      { encounter: 'hazard',   result: 'failure-with-hope', rule: 'Obstacle, countdown 3' },
  'resource-success-fear': { encounter: 'resource', result: 'success-with-fear', rule: 'Guarded resource, countdown 1d6' },
  'resource-success-hope': { encounter: 'resource', result: 'success-with-hope', rule: 'Useful resource, boon, or clue' },
};
const OUTCOME_KEYS = Object.keys(OUTCOMES);

const SCENE_MATCHES = ['full', 'partial', 'adapted'];
const SCENE_STATUSES = ['approved', 'suspended'];
const REVIEW_STATUSES = ['reviewed', 'reviewed-none', 'pending'];
/* Product decision 2: forest-first, not forest-only. */
const COMPATIBILITY_CLASSES = ['native-forest', 'naturally-compatible', 'conditionally-adaptable'];
/* The first four are the original kinds. The rest record the everyday
 * improvisation a Master is expected to do (PD-098): a change of scale, an NPC
 * brought in or taken out, a creature made hostile or neutral, a countdown
 * resized, a difficulty shifted, a place moved. Each is still an explicit,
 * reviewed record with an exact source quote beside the untouched source. */
const ADAPTATION_KINDS = ['mechanic', 'presentation', 'terrain', 'setting-reference', 'location', 'scale', 'npc-involvement', 'hostility', 'countdown', 'difficulty'];
/* What a Master may be told to adjust at the table (guidance, never a change to
 * the source). Same vocabulary as the kinds above, with `npc` for the NPC. */
const GUIDANCE_ADJUSTS = ['terrain', 'location', 'scale', 'npc', 'hostility', 'countdown', 'difficulty'];
const GUIDANCE_MAX_CHARS = 280;
const ART_MODES = ['original', 'fallback', 'none'];
const ART_FALLBACK_SOURCES = ['archetype', 'biome'];
const ADVERSARY_MODES = ['source', 'none'];

const TERRAIN_BIOMES = ['underground', 'aquatic', 'wetland', 'grassland', 'tropical', 'forest', 'drylands', 'rolling', 'mountain', 'frozen', 'badlands'];
const ALL_BIOMES = [...TERRAIN_BIOMES, 'settlement', 'universal'];
const TERRAIN_ANY = 'any';
const FEATURE_TYPES = ['passive', 'action', 'reaction'];

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FP_RE = /^[0-9a-f]{14}$/;
const CYRILLIC_RE = /[Ѐ-ӿ]/;

/* ---------------- tiny helpers ---------------- */

function isPlainObject(v) { return typeof v === 'object' && v !== null && !Array.isArray(v); }
function isNonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }
function enOf(v) { return isPlainObject(v) ? v.en : v; }

/* ---------------- fingerprints ---------------- */

/** Case, spacing, quote style and punctuation are flattened, so a house-style
 * pass (curly apostrophes, a missing final period, capitalisation, a stray
 * space) never invalidates a mapping. A changed word, number or type does. */
function flatten(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/* cyrb53 — a small, well-distributed 53-bit string hash. Change detection
 * only; collisions are irrelevant here and it is not a security boundary. */
function hash53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
function hashString(str) { return hash53(str).toString(16).padStart(14, '0'); }

/** What a feature pin covers: type, English name, English description. Not the
 * GM prompt and not the Russian text — a translation fix is not a meaning
 * change. */
function featureFingerprint(feature) {
  return hashString([
    flatten(feature && feature.type),
    flatten(enOf(feature && feature.name)),
    flatten(enOf(feature && feature.description)),
  ].join('|'));
}

function envTiers(env) {
  if (Array.isArray(env.tiers) && env.tiers.length) return env.tiers.filter(Number.isInteger);
  return Number.isInteger(env.tier) ? [env.tier] : [];
}

/** What a whole-environment pin covers: every reviewable fact the scene could
 * show or be judged on — tiers, type, difficulty, biomes, name, lore, impulses,
 * potential adversaries and every feature's type/name/description, in order. */
function environmentFingerprint(env) {
  const list = v => (isPlainObject(v) && Array.isArray(v.en) ? v.en.map(flatten) : []);
  const features = Array.isArray(env.features)
    ? env.features.map(f => [flatten(f.type), flatten(enOf(f.name)), flatten(enOf(f.description))].join('|'))
    : [];
  return hashString(JSON.stringify([
    envTiers(env),
    flatten(env.type),
    flatten(enOf(env.difficulty)),
    Array.isArray(env.biomes) ? env.biomes : [],
    flatten(enOf(env.name)),
    flatten(enOf(env.lore)),
    list(env.impulses),
    list(env.potential_adversaries),
    features,
  ]));
}

/** Source features of `env` that the English text of `feature` mentions by
 * name. Used to find dependencies on siblings a PARTIAL scene leaves out. */
function findSiblingReferences(feature, siblings) {
  const hay = ` ${flatten(`${enOf(feature.description) || ''} ${enOf(feature.prompt) || ''}`)} `;
  return siblings.filter(s => {
    const n = flatten(enOf(s.name));
    return n.length >= 4 && hay.includes(` ${n} `);
  });
}

/* ---------------- analysis ---------------- */

function checkKeys(obj, allowed, path, add) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) add('error', `${path}.${key}`, `Unknown key "${key}" (allowed: ${allowed.join(', ')}).`, 'unknown-key');
  }
}

function checkBilingual(value, path, add, label) {
  if (!isPlainObject(value)) { add('error', path, `${label} must be a bilingual object { en, ru }.`, 'missing-bilingual'); return false; }
  checkKeys(value, ['en', 'ru'], path, add);
  let ok = true;
  if (!isNonEmptyString(value.en)) { add('error', `${path}.en`, `${label}: English text is required.`, 'missing-bilingual'); ok = false; }
  if (!isNonEmptyString(value.ru)) { add('error', `${path}.ru`, `${label}: Russian text is required (new Darkheart framing is always bilingual).`, 'missing-bilingual'); ok = false; }
  else if (!CYRILLIC_RE.test(value.ru)) { add('error', `${path}.ru`, `${label}: Russian text contains no Cyrillic — it looks like an untranslated copy of the English.`, 'missing-bilingual'); ok = false; }
  return ok;
}

function sceneDuplicateKey(scene, outcome) {
  const names = Array.isArray(scene.features) ? scene.features.map(f => f && f.name).filter(Boolean).sort() : [];
  return `${scene.envId}|${outcome}|${names.length ? names.join('+') : '*'}`;
}

/**
 * One pass over the manifest. Returns:
 *   problems  — [{ severity, path, message, code, id }]
 *   scenes    — [{ id, envId, scene, selectable, reasons: [code…] }]
 *   coverage  — counts for reports
 *
 * ctx.environments (required): the catalogue array.
 * ctx.resolveArt(env) (optional): the catalogue's artwork resolver result
 *   ({ kind, imageId }) — enables the artwork-decision checks.
 * ctx.biomeAssetExists(biome) (optional): whether the biome fallback art exists.
 */
function analyzeManifest(data, ctx) {
  const problems = [];
  const add = (severity, path, message, code, id) => problems.push({ severity, path, message, code, id: id == null ? null : String(id) });
  const result = {
    problems,
    scenes: [],
    coverage: { scenes: 0, selectable: 0, withGuidance: 0, byMatch: {}, byOutcome: {}, reviewed: 0, reviewedNone: 0, pending: 0, environments: 0, unlisted: 0 },
  };
  const environments = (ctx && Array.isArray(ctx.environments)) ? ctx.environments : [];
  const envById = new Map(environments.filter(e => isPlainObject(e) && typeof e.id === 'string').map(e => [e.id, e]));
  result.coverage.environments = envById.size;

  if (!isPlainObject(data)) { add('error', '$', 'The manifest must be a JSON object.', 'shape'); return result; }
  checkKeys(data, ['_comment', 'schema', 'fingerprintVersion', 'reviews', 'scenes'], '$', add);
  if (data.schema !== SCHEMA_VERSION) add('error', '$.schema', `Unsupported schema ${JSON.stringify(data.schema)} (this validator reads ${SCHEMA_VERSION}).`, 'schema');
  /* A different fingerprint algorithm means every stored pin is meaningless:
   * nothing is selectable until the whole manifest is re-pinned. */
  const pinsTrusted = data.fingerprintVersion === FINGERPRINT_VERSION;
  if (!pinsTrusted) add('error', '$.fingerprintVersion', `fingerprintVersion must be ${FINGERPRINT_VERSION}; every pin is untrusted and no scene is selectable until the manifest is re-pinned.`, 'stale-fingerprint-version');
  if (!Array.isArray(data.reviews)) { add('error', '$.reviews', 'reviews must be an array.', 'shape'); }
  if (!Array.isArray(data.scenes)) { add('error', '$.scenes', 'scenes must be an array.', 'shape'); }
  const reviewList = Array.isArray(data.reviews) ? data.reviews : [];
  const sceneList = Array.isArray(data.scenes) ? data.scenes : [];

  /* ---- environment review ledger ---- */
  const reviews = new Map();
  reviewList.forEach((r, i) => {
    const p = `$.reviews[${i}]`;
    if (!isPlainObject(r)) { add('error', p, 'Review entry must be an object.', 'shape'); return; }
    checkKeys(r, ['envId', 'status', 'compatibility', 'rationale', 'reason', 'envFp', 'reviewedOn', 'note'], p, add);
    const env = envById.get(r.envId);
    if (!isNonEmptyString(r.envId)) { add('error', `${p}.envId`, 'envId is required.', 'unknown-environment'); return; }
    if (!env) { add('error', `${p}.envId`, `Unknown environment "${r.envId}" — it is not in data/environments.json.`, 'unknown-environment', r.envId); return; }
    if (reviews.has(r.envId)) { add('error', `${p}.envId`, `Environment "${r.envId}" has more than one review entry.`, 'duplicate-review', r.envId); return; }
    if (!REVIEW_STATUSES.includes(r.status)) { add('error', `${p}.status`, `Invalid review status ${JSON.stringify(r.status)} (allowed: ${REVIEW_STATUSES.join(', ')}).`, 'invalid-review-status', r.envId); return; }
    reviews.set(r.envId, r);

    if (r.status === 'pending') {
      for (const k of ['compatibility', 'rationale', 'reason', 'envFp', 'reviewedOn']) {
        if (r[k] !== undefined) add('error', `${p}.${k}`, `A pending review entry carries no verdict; remove "${k}".`, 'invalid-review');
      }
      return;
    }
    if (!isNonEmptyString(r.reviewedOn) || !DATE_RE.test(r.reviewedOn)) add('error', `${p}.reviewedOn`, 'reviewedOn must be a YYYY-MM-DD date.', 'invalid-review', r.envId);
    if (!isNonEmptyString(r.envFp) || !FP_RE.test(r.envFp)) add('error', `${p}.envFp`, 'envFp must be a 14-character lowercase hex fingerprint of the reviewed environment.', 'invalid-review', r.envId);
    else if (pinsTrusted && r.envFp !== environmentFingerprint(env)) {
      add('warning', `${p}.envFp`, `Environment "${r.envId}" changed since it was reviewed. Re-read it, then re-pin envFp (current ${environmentFingerprint(env)}). Scenes pinned to unchanged features stay valid.`, 'stale-review', r.envId);
    }
    if (r.status === 'reviewed-none') {
      if (!isNonEmptyString(r.reason)) add('error', `${p}.reason`, 'A "reviewed-none" environment must record why no Darkheart outcome fits (reason).', 'invalid-review', r.envId);
      if (r.compatibility !== undefined && !COMPATIBILITY_CLASSES.includes(r.compatibility)) add('error', `${p}.compatibility`, `Invalid compatibility ${JSON.stringify(r.compatibility)}.`, 'invalid-compatibility', r.envId);
    }
    if (r.status === 'reviewed') {
      if (!COMPATIBILITY_CLASSES.includes(r.compatibility)) add('error', `${p}.compatibility`, `compatibility must be one of ${COMPATIBILITY_CLASSES.join(', ')}.`, 'invalid-compatibility', r.envId);
      if (r.reason !== undefined) add('error', `${p}.reason`, '"reason" belongs to reviewed-none entries.', 'invalid-review', r.envId);
    }
    if (COMPATIBILITY_CLASSES.includes(r.compatibility)) {
      const hasForest = Array.isArray(env.biomes) && env.biomes.includes('forest');
      if (r.compatibility === 'native-forest' && !hasForest) add('error', `${p}.compatibility`, `"${r.envId}" is classed native-forest but its biomes (${(env.biomes || []).join(', ') || 'none'}) do not include forest.`, 'invalid-compatibility', r.envId);
      if (r.compatibility !== 'native-forest' && hasForest) add('error', `${p}.compatibility`, `"${r.envId}" is tagged forest, so it is native-forest, not ${r.compatibility}.`, 'invalid-compatibility', r.envId);
      if (r.compatibility !== 'native-forest' && !isNonEmptyString(r.rationale)) add('error', `${p}.rationale`, `A ${r.compatibility} environment needs a rationale (why the forest hex can host it).`, 'invalid-review', r.envId);
    }
  });

  /* ---- scenes ---- */
  const seenIds = new Set();
  const seenKeys = new Map();
  const scenesByEnv = new Map();

  sceneList.forEach((scene, i) => {
    const p = `$.scenes[${i}]`;
    const entry = { id: isPlainObject(scene) && typeof scene.id === 'string' ? scene.id : `#${i}`, envId: isPlainObject(scene) ? scene.envId : undefined, scene, selectable: false, reasons: [] };
    result.scenes.push(entry);
    if (!isPlainObject(scene)) { add('error', p, 'Scene must be an object.', 'shape'); entry.reasons.push('shape'); return; }

    let blocking = false;
    const staleCodes = new Set(['stale-feature', 'stale-environment']);
    const suspended = scene.status === 'suspended';
    const err = (path, message, code) => {
      /* A suspended scene is already quarantined: its drift is a reminder, not a blocker. */
      const severity = suspended && staleCodes.has(code) ? 'warning' : 'error';
      add(severity, path, message, code, scene.id);
      if (severity === 'error') blocking = true;
      entry.reasons.push(code);
    };

    checkKeys(scene, ['id', 'envId', 'match', 'status', 'suspendedReason', 'terrain', 'envFp', 'features', 'excluded', 'standaloneNote', 'dependencyNotes', 'adversaries', 'encounter', 'art', 'outcomes', 'note'], p, (s, pp, m, c) => err(pp, m, c));

    if (!isNonEmptyString(scene.id) || !SLUG_RE.test(scene.id)) err(`${p}.id`, 'Scene id must be a lowercase slug (letters, digits, hyphens).', 'invalid-id');
    else if (seenIds.has(scene.id)) err(`${p}.id`, `Duplicate scene id "${scene.id}".`, 'duplicate-id');
    else seenIds.add(scene.id);

    if (!SCENE_MATCHES.includes(scene.match)) err(`${p}.match`, `Invalid match ${JSON.stringify(scene.match)} (allowed: ${SCENE_MATCHES.join(', ')}).`, 'invalid-match');
    if (!SCENE_STATUSES.includes(scene.status)) err(`${p}.status`, `Invalid scene status ${JSON.stringify(scene.status)} (allowed: ${SCENE_STATUSES.join(', ')}).`, 'invalid-scene-status');
    if (suspended && !isNonEmptyString(scene.suspendedReason)) err(`${p}.suspendedReason`, 'A suspended scene must say why (suspendedReason).', 'invalid-scene-status');
    if (!suspended && scene.suspendedReason !== undefined) err(`${p}.suspendedReason`, 'suspendedReason is only for suspended scenes.', 'invalid-scene-status');
    if (!ADVERSARY_MODES.includes(scene.adversaries)) err(`${p}.adversaries`, `adversaries must be one of ${ADVERSARY_MODES.join(', ')} ("source" shows the environment's potential adversaries, "none" hides them).`, 'invalid-adversaries');

    const env = envById.get(scene.envId);
    if (!isNonEmptyString(scene.envId)) err(`${p}.envId`, 'envId is required.', 'unknown-environment');
    else if (!env) err(`${p}.envId`, `Unknown environment "${scene.envId}" — it is not in data/environments.json.`, 'unknown-environment');

    let review = null;
    if (env) {
      review = reviews.get(env.id) || null;
      if (!review) err(`${p}.envId`, `Environment "${env.id}" has no review entry; a scene needs its environment reviewed first.`, 'environment-not-reviewed');
      else if (review.status !== 'reviewed') err(`${p}.envId`, `Environment "${env.id}" is "${review.status}", so it cannot carry scenes.`, 'environment-not-reviewed');
      if (!scenesByEnv.has(env.id)) scenesByEnv.set(env.id, []);
      scenesByEnv.get(env.id).push(scene);
    }
    const compatibility = review && review.status === 'reviewed' ? review.compatibility : null;

    /* ---- FULL / PARTIAL / ADAPTED shape ---- */
    const hasFeatures = scene.features !== undefined;
    const envFeatures = env && Array.isArray(env.features) ? env.features : [];
    const selected = [];            // resolved source features this scene shows
    let featureSelectionOk = true;

    if (scene.match === 'full') {
      if (hasFeatures) err(`${p}.features`, 'A FULL scene shows the whole environment; it must not list features (use PARTIAL).', 'invalid-full-partial');
      if (scene.excluded !== undefined) err(`${p}.excluded`, 'A FULL scene has no excluded features.', 'invalid-full-partial');
    } else if (scene.match === 'partial') {
      if (!hasFeatures || !Array.isArray(scene.features) || scene.features.length === 0) err(`${p}.features`, 'A PARTIAL scene must list the features it shows.', 'invalid-full-partial');
      else if (env && scene.features.length >= envFeatures.length) err(`${p}.features`, 'A PARTIAL scene that lists every feature of the environment is a FULL scene.', 'invalid-full-partial');
    } else if (scene.match === 'adapted') {
      if (hasFeatures && (!Array.isArray(scene.features) || scene.features.length === 0)) err(`${p}.features`, 'features, when present, must be a non-empty array.', 'invalid-full-partial');
    }
    const featureLevel = scene.match === 'partial' || (scene.match === 'adapted' && hasFeatures);
    if (!featureLevel && scene.match && scene.excluded !== undefined && scene.match !== 'full') err(`${p}.excluded`, 'excluded only accompanies a feature-level scene.', 'invalid-full-partial');

    if (featureLevel && Array.isArray(scene.features) && env) {
      const used = new Set();
      scene.features.forEach((ref, j) => {
        const fp = `${p}.features[${j}]`;
        if (!isPlainObject(ref)) { err(fp, 'Feature reference must be an object { name, type, fp }.', 'shape'); featureSelectionOk = false; return; }
        checkKeys(ref, ['name', 'type', 'fp'], fp, (s, pp, m, c) => err(pp, m, c));
        if (!isNonEmptyString(ref.name)) { err(`${fp}.name`, 'Feature name (English, exactly as in the catalogue) is required.', 'unknown-feature'); featureSelectionOk = false; return; }
        if (!FEATURE_TYPES.includes(ref.type)) { err(`${fp}.type`, `Feature type must be one of ${FEATURE_TYPES.join(', ')}.`, 'unknown-feature'); featureSelectionOk = false; return; }
        const matches = envFeatures.filter(f => enOf(f.name) === ref.name);
        if (matches.length === 0) { err(`${fp}.name`, `Unknown feature "${ref.name}" in environment "${env.id}" (names match the English catalogue text exactly).`, 'unknown-feature'); featureSelectionOk = false; return; }
        if (matches.length > 1) { err(`${fp}.name`, `Ambiguous feature "${ref.name}" in environment "${env.id}" — ${matches.length} features share that name.`, 'ambiguous-feature'); featureSelectionOk = false; return; }
        const feature = matches[0];
        if (used.has(ref.name)) { err(`${fp}.name`, `Feature "${ref.name}" is listed twice in this scene.`, 'duplicate-feature'); featureSelectionOk = false; return; }
        used.add(ref.name);
        if (feature.type !== ref.type) err(`${fp}.type`, `Feature "${ref.name}" is a ${feature.type} in the catalogue, not a ${ref.type}.`, 'unknown-feature');
        if (!isNonEmptyString(ref.fp) || !FP_RE.test(ref.fp)) err(`${fp}.fp`, 'fp must be the 14-character lowercase hex content fingerprint of the feature.', 'stale-feature');
        else if (!pinsTrusted || ref.fp !== featureFingerprint(feature)) err(`${fp}.fp`, `Feature "${ref.name}" of "${env.id}" changed since this scene was reviewed (pinned ${ref.fp}, now ${featureFingerprint(feature)}). Re-read it; re-pin fp if the scene still fits, or suspend the scene.`, 'stale-feature');
        selected.push(feature);
      });

      /* Sibling bookkeeping: every other feature of the environment must be
       * accounted for, and a shown feature must not lean on one that is left out. */
      if (featureSelectionOk) {
        const selectedNames = new Set(scene.features.map(f => f.name));
        const excludedList = Array.isArray(scene.excluded) ? scene.excluded : null;
        if (!excludedList) err(`${p}.excluded`, 'A feature-level scene must list every left-out feature in "excluded" with a reason.', 'unresolved-sibling');
        else {
          const excludedNames = new Set();
          excludedList.forEach((x, j) => {
            const xp = `${p}.excluded[${j}]`;
            if (!isPlainObject(x)) { err(xp, 'Excluded entry must be an object { name, type, reason }.', 'shape'); return; }
            checkKeys(x, ['name', 'type', 'reason'], xp, (s, pp, m, c) => err(pp, m, c));
            if (selectedNames.has(x.name)) err(`${xp}.name`, `"${x.name}" is both shown and excluded.`, 'invalid-full-partial');
            const m = envFeatures.filter(f => enOf(f.name) === x.name);
            if (m.length === 0) err(`${xp}.name`, `Excluded feature "${x.name}" no longer exists in "${env.id}" — it was renamed or removed. Re-review this scene.`, 'unresolved-sibling');
            else if (m.length > 1) err(`${xp}.name`, `Excluded feature name "${x.name}" is ambiguous in "${env.id}".`, 'ambiguous-feature');
            else if (m[0].type !== x.type) err(`${xp}.type`, `Excluded feature "${x.name}" is a ${m[0].type} in the catalogue, not a ${x.type}.`, 'unresolved-sibling');
            if (!isNonEmptyString(x.reason)) err(`${xp}.reason`, 'Say why this feature is left out.', 'unresolved-sibling');
            if (excludedNames.has(x.name)) err(`${xp}.name`, `"${x.name}" is excluded twice.`, 'duplicate-feature');
            excludedNames.add(x.name);
          });
          for (const f of envFeatures) {
            const n = enOf(f.name);
            if (!selectedNames.has(n) && !excludedNames.has(n)) err(`${p}.excluded`, `Feature "${n}" of "${env.id}" is neither shown nor excluded — a feature was added or renamed since the scene was reviewed. Decide whether the scene still stands.`, 'unresolved-sibling');
          }
          const siblings = envFeatures.filter(f => !selectedNames.has(enOf(f.name)));
          const notes = Array.isArray(scene.dependencyNotes) ? scene.dependencyNotes : [];
          if (scene.dependencyNotes !== undefined && !Array.isArray(scene.dependencyNotes)) err(`${p}.dependencyNotes`, 'dependencyNotes must be an array.', 'shape');
          notes.forEach((n, j) => {
            const np = `${p}.dependencyNotes[${j}]`;
            if (!isPlainObject(n)) { err(np, 'Entry must be an object { from, to, note }.', 'shape'); return; }
            checkKeys(n, ['from', 'to', 'note'], np, (s, pp, m, c) => err(pp, m, c));
            if (!selectedNames.has(n.from) || !siblings.some(s => enOf(s.name) === n.to) || !isNonEmptyString(n.note)) err(np, 'A dependency note names a shown feature (from), an excluded feature (to) and says why the mention is harmless (note).', 'unresolved-sibling');
          });
          for (const f of selected) {
            for (const dep of findSiblingReferences(f, siblings)) {
              const ack = notes.some(n => isPlainObject(n) && n.from === enOf(f.name) && n.to === enOf(dep.name) && isNonEmptyString(n.note));
              if (!ack) err(`${p}.features`, `Shown feature "${enOf(f.name)}" refers to "${enOf(dep.name)}", which this scene leaves out. Show it too, or add a dependencyNotes entry explaining why the mention is harmless.`, 'unresolved-sibling');
            }
          }
        }
        if (!isNonEmptyString(scene.standaloneNote)) err(`${p}.standaloneNote`, 'A feature-level scene needs a standaloneNote: why the shown features stay meaningful without the left-out ones.', 'unresolved-sibling');
      }
    } else if (scene.standaloneNote !== undefined || scene.dependencyNotes !== undefined) {
      err(`${p}.standaloneNote`, 'standaloneNote and dependencyNotes only belong to feature-level scenes.', 'invalid-full-partial');
    }

    /* ---- whole-environment pin (FULL, or ADAPTED without a feature list) ---- */
    const wholeEnvironment = scene.match === 'full' || (scene.match === 'adapted' && !hasFeatures);
    if (wholeEnvironment) {
      if (!isNonEmptyString(scene.envFp) || !FP_RE.test(scene.envFp)) err(`${p}.envFp`, 'A whole-environment scene pins envFp (14-character lowercase hex).', 'stale-environment');
      else if (env && (!pinsTrusted || scene.envFp !== environmentFingerprint(env))) err(`${p}.envFp`, `Environment "${env.id}" changed since this scene was reviewed (pinned ${scene.envFp}, now ${environmentFingerprint(env)}). Re-read it; re-pin if the scene still fits, or suspend it.`, 'stale-environment');
    } else if (scene.envFp !== undefined) {
      err(`${p}.envFp`, 'envFp belongs to whole-environment scenes; a feature-level scene pins each feature.', 'invalid-full-partial');
    }
    /* A scene that shows "source" adversaries leans on the environment-level list, which a feature pin cannot protect. */
    if (scene.adversaries === 'source' && !wholeEnvironment) err(`${p}.adversaries`, 'A feature-level scene cannot show the environment\'s potential adversaries; use "none".', 'invalid-adversaries');
    if (scene.adversaries === 'source' && env && isPlainObject(env.potential_adversaries) && Array.isArray(env.potential_adversaries.en)
      && env.potential_adversaries.en.every(a => flatten(a) === 'none')) err(`${p}.adversaries`, `"${env.id}" lists no potential adversaries; use "none".`, 'invalid-adversaries');

    /* ---- encounter themes (PD-099): which adversary themes belong to this selection ---- */
    if (scene.encounter !== undefined) {
      if (!isPlainObject(scene.encounter)) err(`${p}.encounter`, 'encounter must be an object { themes }.', 'invalid-encounter');
      else {
        checkKeys(scene.encounter, ['themes'], `${p}.encounter`, (s, pp, m, c) => err(pp, m, c));
        const themes = scene.encounter.themes;
        const known = ctx && Array.isArray(ctx.affinityThemes) ? ctx.affinityThemes : null;
        if (!Array.isArray(themes) || themes.length === 0) err(`${p}.encounter.themes`, 'encounter.themes must list at least one adversary theme.', 'invalid-encounter');
        else {
          const seenTheme = new Set();
          themes.forEach((th, j) => {
            if (typeof th !== 'string' || !SLUG_RE.test(th) || (known && !known.includes(th))) err(`${p}.encounter.themes[${j}]`, `Unknown adversary theme ${JSON.stringify(th)}${known ? ` (the affinity file defines: ${known.join(', ')})` : ''}.`, 'invalid-encounter');
            else if (seenTheme.has(th)) err(`${p}.encounter.themes[${j}]`, `Theme "${th}" is listed twice.`, 'invalid-encounter');
            seenTheme.add(th);
          });
        }
      }
    }

    /* ---- terrain ---- */
    let adaptationHasTerrainChange = false;
    const outcomesList = Array.isArray(scene.outcomes) ? scene.outcomes : [];
    outcomesList.forEach(o => {
      if (isPlainObject(o) && isPlainObject(o.adaptation) && Array.isArray(o.adaptation.changes)) {
        if (o.adaptation.changes.some(c => isPlainObject(c) && c.kind === 'terrain')) adaptationHasTerrainChange = true;
      }
    });
    if (!Array.isArray(scene.terrain) || scene.terrain.length === 0) err(`${p}.terrain`, `terrain must list where the scene may be dealt (${TERRAIN_ANY} or biome ids).`, 'invalid-terrain');
    else if (env) {
      const seen = new Set();
      scene.terrain.forEach((t, j) => {
        const tp = `${p}.terrain[${j}]`;
        if (t !== TERRAIN_ANY && !TERRAIN_BIOMES.includes(t)) { err(tp, `Invalid terrain ${JSON.stringify(t)} (use ${TERRAIN_ANY} or one of: ${TERRAIN_BIOMES.join(', ')}).`, 'invalid-terrain'); return; }
        if (seen.has(t)) err(tp, `Terrain "${t}" is listed twice.`, 'invalid-terrain');
        seen.add(t);
        const envHas = Array.isArray(env.biomes) && env.biomes.includes(t);
        if (t === TERRAIN_ANY) {
          if (compatibility && compatibility !== 'naturally-compatible') err(tp, `"${TERRAIN_ANY}" is only for a naturally-compatible environment, not ${compatibility}.`, 'invalid-terrain');
        } else if (!envHas && compatibility !== 'conditionally-adaptable') {
          err(tp, `Terrain "${t}" is not one of "${env.id}"'s biomes (${(env.biomes || []).join(', ') || 'none'}); only a conditionally-adaptable environment may be dealt on terrain it is not tagged for.`, 'invalid-terrain');
        } else if (!envHas && !adaptationHasTerrainChange) {
          err(tp, `Terrain "${t}" is outside "${env.id}"'s biomes, so an outcome's adaptation must record the change (kind "terrain").`, 'invalid-terrain');
        }
      });
      if (compatibility === 'native-forest' && !seen.has('forest')) err(`${p}.terrain`, `"${env.id}" is native-forest, so its scene must be dealable in forest.`, 'invalid-terrain');
      if (compatibility === 'naturally-compatible' && !seen.has(TERRAIN_ANY) && !seen.has('forest')) err(`${p}.terrain`, `A naturally-compatible scene must list "${TERRAIN_ANY}" or "forest".`, 'invalid-terrain');
      if (compatibility === 'conditionally-adaptable' && scene.match !== 'adapted') err(`${p}.match`, 'A conditionally-adaptable environment only supports ADAPTED scenes (the adaptation is what makes it fit).', 'invalid-match');
    }
    /* No tier filter (PD-100): a scene is dealt to a party of ANY tier. The environment's own tier and difficulty
     * never restrict it; the page reads the card at the party's tier and checks against the Forest Difficulty. A
     * leftover `tiers` key is an unknown key and an error. */

    /* ---- outcomes: framing and adaptation, one entry per outcome ---- */
    if (!Array.isArray(scene.outcomes) || scene.outcomes.length === 0) err(`${p}.outcomes`, 'A scene needs at least one outcome entry.', 'invalid-outcome');
    else {
      const seenOutcomes = new Set();
      scene.outcomes.forEach((o, j) => {
        const op = `${p}.outcomes[${j}]`;
        if (!isPlainObject(o)) { err(op, 'Outcome entry must be an object { outcome, framing, adaptation? }.', 'shape'); return; }
        checkKeys(o, ['outcome', 'framing', 'adaptation', 'guidance'], op, (s, pp, m, c) => err(pp, m, c));
        if (!OUTCOME_KEYS.includes(o.outcome)) err(`${op}.outcome`, `Invalid outcome key ${JSON.stringify(o.outcome)} (the twelve keys are: ${OUTCOME_KEYS.join(', ')}).`, 'invalid-outcome');
        else {
          if (seenOutcomes.has(o.outcome)) err(`${op}.outcome`, `Outcome "${o.outcome}" appears twice in this scene.`, 'duplicate-mapping');
          seenOutcomes.add(o.outcome);
          const key = sceneDuplicateKey(scene, o.outcome);
          if (seenKeys.has(key) && seenKeys.get(key) !== scene) err(`${op}.outcome`, `Duplicate mapping: "${scene.envId}" is already mapped to "${o.outcome}" with the same selection by scene "${seenKeys.get(key).id}".`, 'duplicate-mapping');
          else seenKeys.set(key, scene);
        }
        if (!isPlainObject(o.framing)) err(`${op}.framing`, 'framing { title, summary } is required for every outcome.', 'missing-bilingual');
        else {
          checkKeys(o.framing, ['title', 'summary'], `${op}.framing`, (s, pp, m, c) => err(pp, m, c));
          if (!checkBilingual(o.framing.title, `${op}.framing.title`, (s, pp, m) => err(pp, m, 'missing-bilingual'), 'Framing title')) { /* reported */ }
          if (!checkBilingual(o.framing.summary, `${op}.framing.summary`, (s, pp, m) => err(pp, m, 'missing-bilingual'), 'Framing summary')) { /* reported */ }
        }
        if (o.guidance !== undefined) validateGuidance(o.guidance, `${op}.guidance`, (pp, m, c) => err(pp, m, c));
        if (scene.match === 'adapted') {
          if (o.adaptation === undefined) err(`${op}.adaptation`, 'Every outcome of an ADAPTED scene needs its own adaptation record.', 'invalid-adaptation');
          else validateAdaptation(o.adaptation, `${op}.adaptation`, env, selected, wholeEnvironment, (pp, m) => err(pp, m, 'invalid-adaptation'), (s, pp, m) => err(pp, m, 'missing-bilingual'));
        } else if (o.adaptation !== undefined) {
          err(`${op}.adaptation`, 'Only an ADAPTED scene may carry an adaptation. Source rules are never changed implicitly.', 'invalid-adaptation');
        }
      });
    }

    /* ---- artwork decision ---- */
    if (!isPlainObject(scene.art)) err(`${p}.art`, 'art must record an explicit artwork decision { mode, reason }.', 'invalid-art');
    else {
      checkKeys(scene.art, ['mode', 'source', 'ref', 'reason'], `${p}.art`, (s, pp, m, c) => err(pp, m, c));
      const a = scene.art;
      if (!ART_MODES.includes(a.mode)) err(`${p}.art.mode`, `art.mode must be one of ${ART_MODES.join(', ')}.`, 'invalid-art');
      if (!isNonEmptyString(a.reason)) err(`${p}.art.reason`, 'Say why this artwork decision is right for this fragment.', 'invalid-art');
      if (a.mode === 'original') {
        if (a.source !== undefined || a.ref !== undefined) err(`${p}.art`, 'An "original" artwork decision carries no source/ref.', 'invalid-art');
        if (env && ctx && typeof ctx.resolveArt === 'function') {
          const r = ctx.resolveArt(env);
          if (!r || r.kind !== 'unique') err(`${p}.art.mode`, `"${env.id}" has no approved painting of its own (the catalogue resolves it to "${r && r.kind}"); choose a fallback or "none".`, 'invalid-art');
        }
        if (scene.match !== 'full' && !isNonEmptyString(a.reason)) err(`${p}.art.reason`, 'Explain why the environment\'s own painting still represents this fragment.', 'invalid-art');
      } else if (a.mode === 'fallback') {
        if (!ART_FALLBACK_SOURCES.includes(a.source)) err(`${p}.art.source`, `A fallback needs source "archetype" or "biome".`, 'invalid-art');
        else if (!isNonEmptyString(a.ref)) err(`${p}.art.ref`, 'A fallback needs the picture or biome it uses (ref).', 'invalid-art');
        else if (a.source === 'biome') {
          if (!ALL_BIOMES.includes(a.ref)) err(`${p}.art.ref`, `Unknown biome "${a.ref}".`, 'invalid-art');
          else if (ctx && typeof ctx.biomeAssetExists === 'function' && !ctx.biomeAssetExists(a.ref)) err(`${p}.art.ref`, `Biome art for "${a.ref}" is missing from img/biomes/.`, 'invalid-art');
        } else if (a.source === 'archetype' && env && ctx && typeof ctx.resolveArt === 'function') {
          const r = ctx.resolveArt(env);
          if (!r || r.kind !== 'thematic' || r.imageId !== a.ref) err(`${p}.art.ref`, `"${a.ref}" is not the approved thematic picture for "${env.id}" (the catalogue resolves it to ${r && r.imageId ? `"${r.imageId}"` : `no thematic picture (${r && r.kind})`}).`, 'invalid-art');
        }
      } else if (a.mode === 'none') {
        if (a.source !== undefined || a.ref !== undefined) err(`${p}.art`, 'A "none" artwork decision carries no source/ref.', 'invalid-art');
      }
    }

    entry.selectable = !blocking && !suspended && pinsTrusted && review !== null && review.status === 'reviewed';
    if (suspended && !entry.reasons.includes('suspended')) entry.reasons.push('suspended');
  });

  /* ---- a reviewed environment must carry scenes; a reviewed-none one must not ---- */
  reviews.forEach((r, envId) => {
    const count = (scenesByEnv.get(envId) || []).length;
    if (r.status === 'reviewed' && count === 0) add('error', '$.reviews', `Environment "${envId}" is "reviewed" but has no scenes; if nothing fits it is "reviewed-none" with a reason.`, 'invalid-review', envId);
    if ((r.status === 'reviewed-none' || r.status === 'pending') && count > 0) add('error', '$.reviews', `Environment "${envId}" is "${r.status}" but ${count} scene(s) reference it.`, 'invalid-review', envId);
  });

  /* ---- coverage ---- */
  const cov = result.coverage;
  cov.scenes = result.scenes.length;
  for (const s of result.scenes) {
    if (!s.selectable) continue;
    cov.selectable += 1;
    cov.byMatch[s.scene.match] = (cov.byMatch[s.scene.match] || 0) + 1;
    for (const o of s.scene.outcomes) { cov.byOutcome[o.outcome] = (cov.byOutcome[o.outcome] || 0) + 1; if (o.guidance) cov.withGuidance += 1; }
  }
  reviews.forEach(r => {
    if (r.status === 'reviewed') cov.reviewed += 1;
    else if (r.status === 'reviewed-none') cov.reviewedNone += 1;
    else cov.pending += 1;
  });
  cov.unlisted = [...envById.keys()].filter(id => !reviews.has(id)).length;
  return result;
}

/* GM adaptation guidance (PD-098): short, bilingual advice on what the Master
 * may adjust to use this selection at the table. Allowed on every match kind
 * because it is advice shown beside the source, never a substitute for it;
 * a recorded change to source wording is still an `adaptation`. */
function validateGuidance(guidance, path, err) {
  if (!isPlainObject(guidance)) { err(path, 'guidance must be an object { adjust, text }.', 'invalid-guidance'); return; }
  checkKeys(guidance, ['adjust', 'text'], path, (s, pp, m) => err(pp, m, 'unknown-key'));
  if (!Array.isArray(guidance.adjust) || guidance.adjust.length === 0) err(`${path}.adjust`, `adjust must list what the Master may change (${GUIDANCE_ADJUSTS.join(', ')}).`, 'invalid-guidance');
  else {
    const seen = new Set();
    guidance.adjust.forEach((a, i) => {
      if (!GUIDANCE_ADJUSTS.includes(a)) err(`${path}.adjust[${i}]`, `Invalid adjustment ${JSON.stringify(a)} (use ${GUIDANCE_ADJUSTS.join(', ')}).`, 'invalid-guidance');
      else if (seen.has(a)) err(`${path}.adjust[${i}]`, `Adjustment "${a}" is listed twice.`, 'invalid-guidance');
      seen.add(a);
    });
  }
  checkBilingual(guidance.text, `${path}.text`, (s, pp, m) => err(pp, m, 'missing-bilingual'), 'Guidance text');
  if (isPlainObject(guidance.text)) {
    ['en', 'ru'].forEach(l => {
      if (isNonEmptyString(guidance.text[l]) && guidance.text[l].length > GUIDANCE_MAX_CHARS) err(`${path}.text.${l}`, `Guidance must stay concise (at most ${GUIDANCE_MAX_CHARS} characters, got ${guidance.text[l].length}).`, 'invalid-guidance');
    });
  }
}

function validateAdaptation(adaptation, path, env, selected, wholeEnvironment, err, errBilingual) {
  if (!isPlainObject(adaptation)) { err(path, 'adaptation must be an object { summary, changes }.'); return; }
  checkKeys(adaptation, ['summary', 'changes'], path, (s, pp, m) => err(pp, m));
  checkBilingual(adaptation.summary, `${path}.summary`, (s, pp, m) => errBilingual(s, pp, m), 'Adaptation summary');
  if (!Array.isArray(adaptation.changes) || adaptation.changes.length === 0) { err(`${path}.changes`, 'An adaptation must list at least one explicit change.'); return; }
  const shownFeatures = wholeEnvironment ? (env && Array.isArray(env.features) ? env.features : []) : selected;
  adaptation.changes.forEach((c, i) => {
    const cp = `${path}.changes[${i}]`;
    if (!isPlainObject(c)) { err(cp, 'Change must be an object { kind, target, source, adapted, why }.'); return; }
    checkKeys(c, ['kind', 'target', 'source', 'adapted', 'why'], cp, (s, pp, m) => err(pp, m));
    if (!ADAPTATION_KINDS.includes(c.kind)) err(`${cp}.kind`, `Change kind must be one of ${ADAPTATION_KINDS.join(', ')}.`);
    if (!isNonEmptyString(c.target)) err(`${cp}.target`, 'target names the shown feature the change applies to.');
    else {
      const feature = shownFeatures.find(f => enOf(f.name) === c.target);
      if (!feature) err(`${cp}.target`, `Target "${c.target}" is not a feature this scene shows.`);
      else if (!isNonEmptyString(c.source)) err(`${cp}.source`, 'source quotes the exact source wording that differs.');
      else if (!flatten(enOf(feature.description)).includes(flatten(c.source))) err(`${cp}.source`, `The quoted source text is not found in "${c.target}" of "${env.id}" — the source changed or the quote is wrong.`);
    }
    if (!isNonEmptyString(c.source)) err(`${cp}.source`, 'source quotes the exact source wording that differs.');
    checkBilingual(c.adapted, `${cp}.adapted`, (s, pp, m) => errBilingual(s, pp, m), 'Adapted wording');
    if (!isNonEmptyString(c.why)) err(`${cp}.why`, 'why must explain why this change is safe (what the source result still is).');
  });
}

/* ---------------- sanctioned read path ---------------- */

/**
 * The only way the scene generator may read the manifest: scenes that are
 * approved, whose environment review stands, and whose every pin and reference
 * still matches the catalogue. Anything else — stale, unknown, suspended,
 * malformed — is withheld, never "best effort".
 */
function getSelectableScenes(data, environments, ctx) {
  const analysis = analyzeManifest(data, Object.assign({}, ctx, { environments }));
  return analysis.scenes.filter(s => s.selectable).map(s => s.scene);
}

/**
 * Review queue: every catalogue environment, grouped by what the manifest knows.
 *   unlisted  — not in the ledger at all (new, or never looked at)
 *   pending   — explicitly queued
 *   stale     — reviewed, but the environment changed since (envFp)
 *   current   — reviewed and unchanged
 */
function reviewQueue(data, environments) {
  const ledger = new Map((isPlainObject(data) && Array.isArray(data.reviews) ? data.reviews : []).filter(isPlainObject).map(r => [r.envId, r]));
  const queue = { unlisted: [], pending: [], stale: [], current: [] };
  for (const env of environments) {
    const r = ledger.get(env.id);
    if (!r) queue.unlisted.push(env.id);
    else if (r.status === 'pending') queue.pending.push(env.id);
    else if (r.envFp !== environmentFingerprint(env)) queue.stale.push(env.id);
    else queue.current.push(env.id);
  }
  return queue;
}

return {
  SCHEMA_VERSION,
  FINGERPRINT_VERSION,
  OUTCOMES,
  OUTCOME_KEYS,
  SCENE_MATCHES,
  SCENE_STATUSES,
  REVIEW_STATUSES,
  COMPATIBILITY_CLASSES,
  ADAPTATION_KINDS,
  GUIDANCE_ADJUSTS,
  GUIDANCE_MAX_CHARS,
  ART_MODES,
  ART_FALLBACK_SOURCES,
  ADVERSARY_MODES,
  TERRAIN_ANY,
  flatten,
  hashString,
  featureFingerprint,
  environmentFingerprint,
  findSiblingReferences,
  analyzeManifest,
  getSelectableScenes,
  reviewQueue,
};
});
