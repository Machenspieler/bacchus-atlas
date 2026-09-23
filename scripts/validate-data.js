#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — validate-data.js
   Dependency-free semantic validator for everything under data/. Runs in CI
   before scripts/build.js (see .github/workflows/deploy.yml) and blocks
   deployment when it finds a broken reference, an unsupported enum value, an
   incomplete Journey roll table, or an i18n key the UI would show raw.

   Read-only: this module only reads files and returns diagnostics. It never
   rewrites a data file, reorders anything, or "repairs" a reference.

   Usable two ways:
     node scripts/validate-data.js         — CLI, exits 1 on any error
     require('./validate-data.js')         — importable by tests; requiring
                                              this file runs nothing by itself
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

/* ---------------- generic helpers ---------------- */

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}
function isFiniteInteger(v) {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v);
}
function describeType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'an array';
  return typeof v;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function isSlug(v) { return typeof v === 'string' && SLUG_RE.test(v); }

/* Same normalization the item lookup in js/app.js uses (setItemCatalog /
 * normalizeItemKey), duplicated here rather than imported — app.js is a
 * browser script with top-level DOM calls, not a requireable CommonJS
 * module. tests/data-validation.test.js pulls the live function out of
 * js/app.js as a parity check, so the two can't silently drift. */
function normalizeItemKey(str) {
  return String(str ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function normalizeDisplayName(name) {
  return String(name).trim().toLowerCase().replace(/\s+/g, ' ');
}

function createReporter(file, diagnostics) {
  return {
    error(jsonPath, message, id) {
      diagnostics.push({ severity: 'error', file, path: jsonPath, message, id: id == null ? null : String(id) });
    },
    warning(jsonPath, message, id) {
      diagnostics.push({ severity: 'warning', file, path: jsonPath, message, id: id == null ? null : String(id) });
    },
  };
}

function checkDangerousKeys(obj, jsonPath, reporter) {
  if (!isPlainObject(obj)) return;
  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(key)) {
      reporter.error(`${jsonPath}.${key}`, `Object key "${key}" is not allowed here.`);
    }
  }
}

/* ---------------- JSON file loading ---------------- */

function extractJsonErrorPosition(message, text) {
  const m = message.match(/position (\d+)/);
  if (!m) return null;
  const pos = Number(m[1]);
  let line = 1, column = 1;
  for (let i = 0; i < pos && i < text.length; i++) {
    if (text[i] === '\n') { line++; column = 1; } else { column++; }
  }
  return { line, column };
}

/** Reads and parses one production JSON file. Returns the parsed value, or
 * null (with a diagnostic already recorded) if the file is missing, unreadable,
 * or not valid JSON. */
function readJsonFile(absPath, relPath, diagnostics) {
  const reporter = createReporter(relPath, diagnostics);
  let text;
  try {
    text = fs.readFileSync(absPath, 'utf8');
  } catch (err) {
    reporter.error('$', `Could not read file: ${err.message}`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    const pos = extractJsonErrorPosition(err.message, text);
    const where = pos ? ` (line ${pos.line}, column ${pos.column})` : '';
    reporter.error('$', `Invalid JSON${where}: ${err.message}`);
    return null;
  }
}

/* ---------------- shared value validators ---------------- */

/** Bilingual `{ en, ru }` text field. `en` is required non-empty text unless
 * requireEn is false; `ru` may be absent or empty (English-fallback UI). */
function validateBilingualString(value, jsonPath, reporter, { requireEn = true } = {}) {
  if (!isPlainObject(value)) {
    reporter.error(jsonPath, `Expected a bilingual object ({ en, ru }) but got ${describeType(value)}.`);
    return;
  }
  checkDangerousKeys(value, jsonPath, reporter);
  if (requireEn) {
    if (!isNonEmptyString(value.en)) {
      reporter.error(`${jsonPath}.en`, 'English text is required and must be a non-empty string.');
    }
  } else if (value.en !== undefined && typeof value.en !== 'string') {
    reporter.error(`${jsonPath}.en`, 'English text must be a string when present.');
  }
  if (value.ru !== undefined && typeof value.ru !== 'string') {
    reporter.error(`${jsonPath}.ru`, 'Russian text must be a string when present.');
  }
}

function validateStringArrayField(value, jsonPath, reporter, required) {
  if (value === undefined) return !required;
  if (!Array.isArray(value)) {
    reporter.error(jsonPath, `Expected an array but got ${describeType(value)}.`);
    return false;
  }
  let ok = true;
  value.forEach((item, i) => {
    if (!isNonEmptyString(item)) {
      reporter.error(`${jsonPath}[${i}]`, 'Every entry must be a non-empty string.');
      ok = false;
    }
  });
  return ok;
}

/** Bilingual `{ en: [...], ru: [...] }` list field. When both lists are
 * present and Russian is non-empty, the app reads them by matching index, so
 * their lengths must agree. */
function validateBilingualStringArray(value, jsonPath, reporter, { requireEn = true } = {}) {
  if (!isPlainObject(value)) {
    reporter.error(jsonPath, `Expected a bilingual list object ({ en: [...], ru: [...] }) but got ${describeType(value)}.`);
    return;
  }
  checkDangerousKeys(value, jsonPath, reporter);
  if (value.en === undefined) {
    if (requireEn) reporter.error(`${jsonPath}.en`, 'This list is required.');
  } else {
    validateStringArrayField(value.en, `${jsonPath}.en`, reporter, requireEn);
  }
  if (value.ru !== undefined) validateStringArrayField(value.ru, `${jsonPath}.ru`, reporter, false);
  if (Array.isArray(value.en) && Array.isArray(value.ru) && value.ru.length > 0 && value.ru.length !== value.en.length) {
    reporter.error(jsonPath, `English and Russian lists must have the same length when Russian is present (en: ${value.en.length}, ru: ${value.ru.length}).`);
  }
}

/* ---------------- enum constants ---------------- */

const TERRAIN_BIOMES = ['underground', 'aquatic', 'wetland', 'grassland', 'tropical', 'forest', 'drylands', 'rolling', 'mountain', 'frozen', 'badlands'];
const ALL_BIOMES = [...TERRAIN_BIOMES, 'settlement', 'universal'];
const ENV_TYPES = ['traversal', 'social', 'event', 'exploration'];
const FEATURE_TYPES = ['passive', 'action', 'reaction'];
const ADVERSARY_ROLES = ['bruiser', 'horde', 'leader', 'minion', 'ranged', 'skulk', 'social', 'solo', 'standard', 'support'];
const ATTACK_RANGES = ['melee', 'very_close', 'close', 'far', 'very_far'];
const DAMAGE_TYPES = ['physical', 'magic'];
const FEATURED_ADVERSARY_DISPLAYS = ['inline'];
const SANCTUARY_KEYS = ['trade', 'quirk', 'crisis', 'drive', 'politics', 'size', 'population'];

const TIER_MIN = 1, TIER_MAX = 4;

/* js/app.js's own TIER_TABLE covers difficulty ~11-20 (DIFFICULTY_FLOOR=10,
 * DIFFICULTY_CEIL=20), but that pair only clamps a *cross-tier* read — same
 * as damage, a stat block's own native-tier number is allowed to sit outside
 * the printed band (data/environments.json: "planetary-invasion", tier 4,
 * difficulty 21). The floor matches DIFFICULTY_FLOOR; the ceiling leaves
 * headroom above the observed max instead of hard-coding today's data. */
const DIFFICULTY_MIN = 10, DIFFICULTY_MAX = 25;

const DAMAGE_NOTATION_RE = /^\d{0,2}d(?:2|3|4|6|8|10|12|20|100)(?:\s*[+-]\s*\d+)?$/;
function isValidDamageNotation(v) { return typeof v === 'string' && DAMAGE_NOTATION_RE.test(v.trim()); }

/* ---------------- data/environments.json ---------------- */

function validateEnvDifficulty(value, jsonPath, reporter, idLabel) {
  if (typeof value === 'number') {
    if (!isFiniteInteger(value) || value < DIFFICULTY_MIN || value > DIFFICULTY_MAX) {
      reporter.error(jsonPath, `Environment "${idLabel}" has numeric difficulty ${value}; expected an integer between ${DIFFICULTY_MIN} and ${DIFFICULTY_MAX}.`, idLabel);
    }
    return;
  }
  if (isPlainObject(value)) {
    validateBilingualString(value, jsonPath, reporter, { requireEn: true });
    return;
  }
  reporter.error(jsonPath, `Environment "${idLabel}" has an invalid difficulty (${describeType(value)}); expected a number or a bilingual { en, ru } object.`, idLabel);
}

function validateEnvFeature(f, jsonPath, reporter, idLabel, facts) {
  if (!isPlainObject(f)) { reporter.error(jsonPath, `Feature entry must be an object, got ${describeType(f)}.`, idLabel); return; }
  checkDangerousKeys(f, jsonPath, reporter);
  if (!FEATURE_TYPES.includes(f.type)) {
    reporter.error(`${jsonPath}.type`, `Environment "${idLabel}" feature uses unsupported type ${JSON.stringify(f.type)}.`, idLabel);
  } else {
    facts.usedFeatureTypes.add(f.type);
  }
  if (f.name === undefined) reporter.error(`${jsonPath}.name`, 'Feature is missing a name.', idLabel);
  else validateBilingualString(f.name, `${jsonPath}.name`, reporter, { requireEn: true });
  if (f.description === undefined) reporter.error(`${jsonPath}.description`, 'Feature is missing a description.', idLabel);
  else validateBilingualString(f.description, `${jsonPath}.description`, reporter, { requireEn: true });
  if (f.prompt !== undefined) validateBilingualString(f.prompt, `${jsonPath}.prompt`, reporter, { requireEn: false });
}

function validateFeaturedAdversaryEntry(fa, jsonPath, reporter, idLabel, facts) {
  if (!isPlainObject(fa)) { reporter.error(jsonPath, `Entry must be an object, got ${describeType(fa)}.`, idLabel); return; }
  checkDangerousKeys(fa, jsonPath, reporter);
  if (!isNonEmptyString(fa.id)) {
    reporter.error(`${jsonPath}.id`, 'featured_adversaries entry is missing a valid id.', idLabel);
  } else {
    facts.featuredAdversaryRefs.push({ envId: idLabel, advId: fa.id, jsonPath: `${jsonPath}.id` });
  }
  if (fa.display !== undefined && !FEATURED_ADVERSARY_DISPLAYS.includes(fa.display)) {
    reporter.error(`${jsonPath}.display`, `Unsupported display value ${JSON.stringify(fa.display)}.`, idLabel);
  }
  if (fa.expanded !== undefined && typeof fa.expanded !== 'boolean') {
    reporter.error(`${jsonPath}.expanded`, 'expanded must be a boolean when present.', idLabel);
  }
}

function validateStorySeed(seed, jsonPath, reporter, idLabel) {
  if (!isPlainObject(seed)) { reporter.error(jsonPath, `Entry must be an object, got ${describeType(seed)}.`, idLabel); return; }
  checkDangerousKeys(seed, jsonPath, reporter);
  if (seed.title === undefined) reporter.error(`${jsonPath}.title`, 'Story seed is missing a title.', idLabel);
  else validateBilingualString(seed.title, `${jsonPath}.title`, reporter, { requireEn: true });
  if (seed.body === undefined) reporter.error(`${jsonPath}.body`, 'Story seed is missing a body.', idLabel);
  else validateBilingualString(seed.body, `${jsonPath}.body`, reporter, { requireEn: true });
  if (seed.prompt !== undefined) validateBilingualString(seed.prompt, `${jsonPath}.prompt`, reporter, { requireEn: false });
}

function validateEnvironments(data, file, diagnostics) {
  const reporter = createReporter(file, diagnostics);
  const facts = {
    ids: new Set(),
    usedTypes: new Set(),
    usedBiomes: new Set(),
    usedFeatureTypes: new Set(),
    featuredAdversaryRefs: [],
  };
  if (!isPlainObject(data)) { reporter.error('$', `Top-level value must be an object, got ${describeType(data)}.`); return facts; }
  checkDangerousKeys(data, '$', reporter);

  const list = data.environments;
  if (!Array.isArray(list) || list.length === 0) {
    reporter.error('$.environments', 'Must be a non-empty array.');
    return facts;
  }

  const nameOccurrences = new Map(); // normalized name -> [{ id, index, original }]

  list.forEach((env, i) => {
    const p = `$.environments[${i}]`;
    if (!isPlainObject(env)) { reporter.error(p, `Environment entry must be an object, got ${describeType(env)}.`); return; }
    checkDangerousKeys(env, p, reporter);

    const id = env.id;
    let idLabel = `#${i}`;
    if (!isNonEmptyString(id)) {
      reporter.error(`${p}.id`, 'Environment id is required and must be a non-empty string.');
    } else if (!isSlug(id)) {
      reporter.error(`${p}.id`, `Environment id "${id}" must be a lowercase slug (letters, digits, single hyphens).`, id);
      idLabel = id;
    } else if (facts.ids.has(id)) {
      reporter.error(`${p}.id`, `Duplicate environment id "${id}".`, id);
      idLabel = id;
    } else {
      facts.ids.add(id);
      idLabel = id;
    }

    if (!isFiniteInteger(env.tier) || env.tier < TIER_MIN || env.tier > TIER_MAX) {
      reporter.error(`${p}.tier`, `Environment "${idLabel}" has invalid tier ${JSON.stringify(env.tier)}; must be an integer from ${TIER_MIN} to ${TIER_MAX}.`, idLabel);
    }

    if (!ENV_TYPES.includes(env.type)) {
      reporter.error(`${p}.type`, `Environment "${idLabel}" uses unsupported type ${JSON.stringify(env.type)}.`, idLabel);
    } else {
      facts.usedTypes.add(env.type);
    }

    if (env.difficulty !== undefined && env.difficulty !== null) {
      validateEnvDifficulty(env.difficulty, `${p}.difficulty`, reporter, idLabel);
    }

    if (env.name === undefined) {
      reporter.error(`${p}.name`, `Environment "${idLabel}" is missing a name.`, idLabel);
    } else {
      validateBilingualString(env.name, `${p}.name`, reporter, { requireEn: true });
      if (isPlainObject(env.name) && isNonEmptyString(env.name.en)) {
        const norm = normalizeDisplayName(env.name.en);
        if (!nameOccurrences.has(norm)) nameOccurrences.set(norm, []);
        nameOccurrences.get(norm).push({ id: idLabel, index: i, original: env.name.en });
      }
    }

    if (env.impulses === undefined) {
      reporter.error(`${p}.impulses`, `Environment "${idLabel}" is missing impulses.`, idLabel);
    } else {
      validateBilingualStringArray(env.impulses, `${p}.impulses`, reporter, { requireEn: true });
    }

    if (env.potential_adversaries === undefined) {
      reporter.error(`${p}.potential_adversaries`, `Environment "${idLabel}" is missing potential_adversaries.`, idLabel);
    } else {
      validateBilingualStringArray(env.potential_adversaries, `${p}.potential_adversaries`, reporter, { requireEn: true });
    }

    if (env.features === undefined) {
      reporter.error(`${p}.features`, `Environment "${idLabel}" is missing features.`, idLabel);
    } else if (!Array.isArray(env.features)) {
      reporter.error(`${p}.features`, 'features must be an array.', idLabel);
    } else {
      env.features.forEach((f, fi) => validateEnvFeature(f, `${p}.features[${fi}]`, reporter, idLabel, facts));
    }

    if (env.rawText !== undefined) validateBilingualString(env.rawText, `${p}.rawText`, reporter, { requireEn: false });
    if (env.lore !== undefined) validateBilingualString(env.lore, `${p}.lore`, reporter, { requireEn: false });

    if (env.source !== undefined && !isNonEmptyString(env.source)) {
      reporter.error(`${p}.source`, 'source must be a non-empty string when present.', idLabel);
    }

    if (env.biomes !== undefined) {
      if (!Array.isArray(env.biomes)) {
        reporter.error(`${p}.biomes`, 'biomes must be an array.', idLabel);
      } else {
        const seen = new Set();
        env.biomes.forEach((b, bi) => {
          const bp = `${p}.biomes[${bi}]`;
          if (typeof b !== 'string') { reporter.error(bp, `Biome entry must be a string, got ${describeType(b)}.`, idLabel); return; }
          if (!ALL_BIOMES.includes(b)) { reporter.error(bp, `Environment "${idLabel}" uses unknown biome "${b}".`, idLabel); return; }
          if (seen.has(b)) { reporter.error(bp, `Environment "${idLabel}" lists biome "${b}" more than once.`, idLabel); return; }
          seen.add(b);
          facts.usedBiomes.add(b);
        });
      }
    }

    if (env.featured_adversaries !== undefined) {
      if (!Array.isArray(env.featured_adversaries)) {
        reporter.error(`${p}.featured_adversaries`, 'featured_adversaries must be an array.', idLabel);
      } else {
        const seenAdv = new Set();
        env.featured_adversaries.forEach((fa, fai) => {
          const fp = `${p}.featured_adversaries[${fai}]`;
          const before = facts.featuredAdversaryRefs.length;
          validateFeaturedAdversaryEntry(fa, fp, reporter, idLabel, facts);
          if (facts.featuredAdversaryRefs.length > before) {
            const ref = facts.featuredAdversaryRefs[facts.featuredAdversaryRefs.length - 1];
            if (seenAdv.has(ref.advId)) {
              reporter.error(ref.jsonPath, `Duplicate featured adversary id "${ref.advId}" in environment "${idLabel}".`, idLabel);
            }
            seenAdv.add(ref.advId);
          }
        });
      }
    }

    if (env.story_seeds !== undefined) {
      if (!Array.isArray(env.story_seeds)) {
        reporter.error(`${p}.story_seeds`, 'story_seeds must be an array.', idLabel);
      } else {
        env.story_seeds.forEach((seed, si) => validateStorySeed(seed, `${p}.story_seeds[${si}]`, reporter, idLabel));
      }
    }
  });

  for (const occurrences of nameOccurrences.values()) {
    if (occurrences.length < 2) continue;
    const [first, ...rest] = occurrences;
    rest.forEach(occ => {
      diagnostics.push({
        severity: 'warning',
        file,
        path: `$.environments[${occ.index}].name.en`,
        message: `Normalized name "${occ.original}" is also used by environment "${first.id}".`,
        id: occ.id,
      });
    });
  }

  return facts;
}

/* ---------------- data/regions.json ---------------- */

function validateRegions(data, file, diagnostics, envIds) {
  const reporter = createReporter(file, diagnostics);
  const facts = { ids: new Set() };
  if (!isPlainObject(data)) { reporter.error('$', `Top-level value must be an object, got ${describeType(data)}.`); return facts; }
  checkDangerousKeys(data, '$', reporter);

  const list = data.regions;
  if (!Array.isArray(list)) { reporter.error('$.regions', 'Must be an array.'); return facts; }

  const envToRegion = new Map();

  list.forEach((region, i) => {
    const p = `$.regions[${i}]`;
    if (!isPlainObject(region)) { reporter.error(p, `Region entry must be an object, got ${describeType(region)}.`); return; }
    checkDangerousKeys(region, p, reporter);

    const id = region.id;
    let idLabel = `#${i}`;
    if (!isNonEmptyString(id) || !isSlug(id)) {
      reporter.error(`${p}.id`, `Region id must be a non-empty lowercase slug (got ${JSON.stringify(id)}).`);
    } else if (facts.ids.has(id)) {
      reporter.error(`${p}.id`, `Duplicate region id "${id}".`, id);
      idLabel = id;
    } else {
      facts.ids.add(id);
      idLabel = id;
    }

    if (region.name === undefined) reporter.error(`${p}.name`, `Region "${idLabel}" is missing a name.`, idLabel);
    else validateBilingualString(region.name, `${p}.name`, reporter, { requireEn: true });

    if (!Array.isArray(region.environments)) {
      reporter.error(`${p}.environments`, `Region "${idLabel}" must have an environments array.`, idLabel);
      return;
    }
    if (region.environments.length < 2) {
      reporter.error(`${p}.environments`, `Region "${idLabel}" must reference at least two environments (has ${region.environments.length}).`, idLabel);
    }
    const seenInRegion = new Set();
    region.environments.forEach((envId, ei) => {
      const ep = `${p}.environments[${ei}]`;
      if (!isNonEmptyString(envId)) { reporter.error(ep, 'Environment id must be a non-empty string.', idLabel); return; }
      if (seenInRegion.has(envId)) { reporter.error(ep, `Region "${idLabel}" lists environment "${envId}" more than once.`, idLabel); return; }
      seenInRegion.add(envId);
      if (!envIds.has(envId)) {
        reporter.error(ep, `Region "${idLabel}" references unknown environment "${envId}".`, idLabel);
        return;
      }
      if (envToRegion.has(envId)) {
        reporter.error(ep, `Environment "${envId}" belongs to more than one region ("${envToRegion.get(envId)}" and "${idLabel}").`, envId);
      } else {
        envToRegion.set(envId, idLabel);
      }
    });
  });

  return facts;
}

/* ---------------- data/adversaries.json ---------------- */

function validateAdversaryFeature(f, jsonPath, reporter, idLabel, facts) {
  if (!isPlainObject(f)) { reporter.error(jsonPath, `Feature entry must be an object, got ${describeType(f)}.`, idLabel); return; }
  checkDangerousKeys(f, jsonPath, reporter);
  if (!FEATURE_TYPES.includes(f.type)) reporter.error(`${jsonPath}.type`, `Unsupported feature type ${JSON.stringify(f.type)}.`, idLabel);
  else facts.usedFeatureTypes.add(f.type);
  if (f.name === undefined) reporter.error(`${jsonPath}.name`, 'Feature is missing a name.', idLabel);
  else validateBilingualString(f.name, `${jsonPath}.name`, reporter, { requireEn: true });
  if (f.description === undefined) reporter.error(`${jsonPath}.description`, 'Feature is missing a description.', idLabel);
  else validateBilingualString(f.description, `${jsonPath}.description`, reporter, { requireEn: true });
}

function validateAdversaries(data, file, diagnostics) {
  const reporter = createReporter(file, diagnostics);
  const facts = { ids: new Set(), usedRoles: new Set(), usedRanges: new Set(), usedDamageTypes: new Set(), usedFeatureTypes: new Set() };
  if (!isPlainObject(data)) { reporter.error('$', `Top-level value must be an object, got ${describeType(data)}.`); return facts; }
  checkDangerousKeys(data, '$', reporter);

  const list = data.adversaries;
  if (!Array.isArray(list)) { reporter.error('$.adversaries', 'Must be an array.'); return facts; }

  list.forEach((adv, i) => {
    const p = `$.adversaries[${i}]`;
    if (!isPlainObject(adv)) { reporter.error(p, `Adversary entry must be an object, got ${describeType(adv)}.`); return; }
    checkDangerousKeys(adv, p, reporter);

    const id = adv.id;
    let idLabel = `#${i}`;
    if (!isNonEmptyString(id) || !isSlug(id)) {
      reporter.error(`${p}.id`, `Adversary id must be a non-empty lowercase slug (got ${JSON.stringify(id)}).`);
    } else if (facts.ids.has(id)) {
      reporter.error(`${p}.id`, `Duplicate adversary id "${id}".`, id);
      idLabel = id;
    } else {
      facts.ids.add(id);
      idLabel = id;
    }

    if (adv.name === undefined) reporter.error(`${p}.name`, `Adversary "${idLabel}" is missing a name.`, idLabel);
    else validateBilingualString(adv.name, `${p}.name`, reporter, { requireEn: true });

    if (!isFiniteInteger(adv.tier) || adv.tier < TIER_MIN || adv.tier > TIER_MAX) {
      reporter.error(`${p}.tier`, `Adversary "${idLabel}" has invalid tier ${JSON.stringify(adv.tier)}; must be an integer from ${TIER_MIN} to ${TIER_MAX}.`, idLabel);
    }

    if (!isNonEmptyString(adv.role)) {
      reporter.error(`${p}.role`, `Adversary "${idLabel}" is missing a role.`, idLabel);
    } else if (!ADVERSARY_ROLES.includes(adv.role)) {
      reporter.error(`${p}.role`, `Adversary "${idLabel}" uses unsupported role "${adv.role}".`, idLabel);
    } else {
      facts.usedRoles.add(adv.role);
    }

    if (!isFiniteInteger(adv.difficulty)) {
      reporter.error(`${p}.difficulty`, `Adversary "${idLabel}" has invalid difficulty ${JSON.stringify(adv.difficulty)}; must be a finite integer.`, idLabel);
    }
    if (!isFiniteInteger(adv.hp) || adv.hp < 0) {
      reporter.error(`${p}.hp`, `Adversary "${idLabel}" has invalid hp ${JSON.stringify(adv.hp)}; must be a non-negative integer.`, idLabel);
    }
    if (!isFiniteInteger(adv.stress) || adv.stress < 0) {
      reporter.error(`${p}.stress`, `Adversary "${idLabel}" has invalid stress ${JSON.stringify(adv.stress)}; must be a non-negative integer.`, idLabel);
    }
    if (!isFiniteInteger(adv.attack_modifier)) {
      reporter.error(`${p}.attack_modifier`, `Adversary "${idLabel}" has invalid attack_modifier ${JSON.stringify(adv.attack_modifier)}; must be an integer.`, idLabel);
    }

    if (adv.thresholds !== undefined) {
      const tp = `${p}.thresholds`;
      if (!isPlainObject(adv.thresholds)) {
        reporter.error(tp, 'thresholds must be an object.', idLabel);
      } else {
        checkDangerousKeys(adv.thresholds, tp, reporter);
        const { major, severe } = adv.thresholds;
        const majorOk = isFiniteInteger(major) && major >= 0;
        const severeOk = isFiniteInteger(severe) && severe >= 0;
        if (!majorOk) reporter.error(`${tp}.major`, 'major must be a non-negative integer.', idLabel);
        if (!severeOk) reporter.error(`${tp}.severe`, 'severe must be a non-negative integer.', idLabel);
        if (majorOk && severeOk && major > severe) {
          reporter.error(tp, `major threshold (${major}) must not be greater than severe (${severe}).`, idLabel);
        }
      }
    }

    if (adv.attacks !== undefined) {
      if (!Array.isArray(adv.attacks)) {
        reporter.error(`${p}.attacks`, 'attacks must be an array.', idLabel);
      } else {
        adv.attacks.forEach((atk, ai) => {
          const ap = `${p}.attacks[${ai}]`;
          if (!isPlainObject(atk)) { reporter.error(ap, `Attack entry must be an object, got ${describeType(atk)}.`, idLabel); return; }
          checkDangerousKeys(atk, ap, reporter);
          if (atk.name === undefined) reporter.error(`${ap}.name`, 'Attack is missing a name.', idLabel);
          else validateBilingualString(atk.name, `${ap}.name`, reporter, { requireEn: true });
          if (!ATTACK_RANGES.includes(atk.range)) reporter.error(`${ap}.range`, `Unsupported range ${JSON.stringify(atk.range)}.`, idLabel);
          else facts.usedRanges.add(atk.range);
          if (!isNonEmptyString(atk.damage)) reporter.error(`${ap}.damage`, 'damage must be a non-empty string.', idLabel);
          else if (!isValidDamageNotation(atk.damage)) reporter.error(`${ap}.damage`, `damage ${JSON.stringify(atk.damage)} is not valid dice notation.`, idLabel);
          if (!DAMAGE_TYPES.includes(atk.damage_type)) reporter.error(`${ap}.damage_type`, `Unsupported damage type ${JSON.stringify(atk.damage_type)}.`, idLabel);
          else facts.usedDamageTypes.add(atk.damage_type);
        });
      }
    }

    if (adv.experiences !== undefined) {
      if (!Array.isArray(adv.experiences)) {
        reporter.error(`${p}.experiences`, 'experiences must be an array.', idLabel);
      } else {
        adv.experiences.forEach((exp, ei) => {
          const ep = `${p}.experiences[${ei}]`;
          if (!isPlainObject(exp)) { reporter.error(ep, `Experience entry must be an object, got ${describeType(exp)}.`, idLabel); return; }
          checkDangerousKeys(exp, ep, reporter);
          if (exp.name === undefined) reporter.error(`${ep}.name`, 'Experience is missing a name.', idLabel);
          else validateBilingualString(exp.name, `${ep}.name`, reporter, { requireEn: true });
          if (!isFiniteInteger(exp.modifier)) reporter.error(`${ep}.modifier`, 'modifier must be an integer.', idLabel);
        });
      }
    }

    if (adv.features !== undefined) {
      if (!Array.isArray(adv.features)) reporter.error(`${p}.features`, 'features must be an array.', idLabel);
      else adv.features.forEach((f, fi) => validateAdversaryFeature(f, `${p}.features[${fi}]`, reporter, idLabel, facts));
    }
  });

  return facts;
}

/* ---------------- data/items.json ---------------- */

function detectCraftCycles(craftEdges, itemIds, file, diagnostics) {
  const status = new Map(); // id -> 'done' once fully resolved (cyclic or not)
  for (const start of itemIds) {
    if (status.get(start) === 'done') continue;
    const path = [];
    let node = start;
    for (;;) {
      const st = status.get(node);
      if (st === 'done') { path.forEach(n => status.set(n, 'done')); break; }
      if (st === 'visiting') {
        const idx = path.indexOf(node);
        const cycle = path.slice(idx).concat(node);
        diagnostics.push({
          severity: 'error',
          file,
          path: `$.items.${cycle[0]}.craft`,
          message: `Item crafting cycle detected: ${cycle.join(' -> ')}.`,
          id: cycle[0],
        });
        path.forEach(n => status.set(n, 'done'));
        status.set(node, 'done');
        break;
      }
      status.set(node, 'visiting');
      path.push(node);
      const next = craftEdges.get(node);
      if (next === undefined || !itemIds.has(next)) { path.forEach(n => status.set(n, 'done')); break; }
      node = next;
    }
  }
}

function detectAliasCollisions(data, file, diagnostics) {
  const items = data.items || {};
  const sources = [];
  Object.entries(data.aliases || {}).forEach(([alias, id]) => {
    if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(items, id)) {
      sources.push({ text: alias, id, origin: `alias "${alias}"` });
    }
  });
  Object.entries(items).forEach(([id, item]) => {
    if (!isPlainObject(item)) return;
    ['en', 'ru'].forEach(lang => {
      const name = item[lang] && item[lang].name;
      if (isNonEmptyString(name)) sources.push({ text: name, id, origin: `${lang} name of item "${id}"` });
    });
  });
  const byKey = new Map();
  sources.forEach(s => {
    const key = normalizeItemKey(s.text);
    if (!key) return;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(s);
  });
  for (const entries of byKey.values()) {
    const distinctIds = new Set(entries.map(e => e.id));
    if (distinctIds.size > 1) {
      diagnostics.push({
        severity: 'error',
        file,
        path: '$.aliases',
        message: `Normalized lookup key resolves to more than one item: ${entries.map(e => `${e.id} (${e.origin})`).join(', ')}.`,
        id: [...distinctIds].join(','),
      });
    }
  }
}

function validateItems(data, file, diagnostics) {
  const reporter = createReporter(file, diagnostics);
  const facts = { itemIds: new Set(), usedKinds: new Set(), usedSrcs: new Set() };
  if (!isPlainObject(data)) { reporter.error('$', `Top-level value must be an object, got ${describeType(data)}.`); return facts; }
  checkDangerousKeys(data, '$', reporter);

  if (!isNonEmptyString(data.item_url) || !data.item_url.includes('{id}')) {
    reporter.error('$.item_url', 'item_url must be a non-empty string containing "{id}".');
  }
  if (!isNonEmptyString(data.image_url) || !data.image_url.includes('{img}')) {
    reporter.error('$.image_url', 'image_url must be a non-empty string containing "{img}".');
  }

  if (!isPlainObject(data.items)) {
    reporter.error('$.items', 'items must be an object.');
    return facts;
  }
  checkDangerousKeys(data.items, '$.items', reporter);

  const craftEdges = new Map();

  Object.entries(data.items).forEach(([id, item]) => {
    const p = `$.items.${id}`;
    // Item ids use their own compact form (e.g. "w62", "cc7"), not
    // environment-style hyphenated slugs — just lowercase alphanumerics.
    if (!/^[a-z0-9]+$/.test(id)) {
      reporter.error(p, `Item id "${id}" must be a non-empty lowercase alphanumeric key.`, id);
    }
    facts.itemIds.add(id);
    if (!isPlainObject(item)) { reporter.error(p, `Item "${id}" must be an object, got ${describeType(item)}.`, id); return; }
    checkDangerousKeys(item, p, reporter);

    if (!isNonEmptyString(item.kind)) reporter.error(`${p}.kind`, `Item "${id}" is missing a kind.`, id);
    else facts.usedKinds.add(item.kind);

    if (!isNonEmptyString(item.src)) reporter.error(`${p}.src`, `Item "${id}" is missing a src.`, id);
    else facts.usedSrcs.add(item.src);

    if (!isFiniteInteger(item.roll) || item.roll < 1) {
      reporter.error(`${p}.roll`, `Item "${id}" has invalid roll ${JSON.stringify(item.roll)}; must be a positive integer.`, id);
    }

    if (!isNonEmptyString(item.img)) {
      reporter.error(`${p}.img`, `Item "${id}" is missing an image filename.`, id);
    } else if (item.img.includes('..') || item.img.includes('/') || item.img.includes('\\')) {
      reporter.error(`${p}.img`, `Item "${id}" image filename "${item.img}" must not contain path separators or "..".`, id);
    }

    if (item.en === undefined) {
      reporter.error(`${p}.en`, `Item "${id}" is missing English content.`, id);
    } else if (!isPlainObject(item.en)) {
      reporter.error(`${p}.en`, `Item "${id}" English content must be an object.`, id);
    } else {
      checkDangerousKeys(item.en, `${p}.en`, reporter);
      if (!isNonEmptyString(item.en.name)) reporter.error(`${p}.en.name`, `Item "${id}" is missing an English name.`, id);
      if (!isNonEmptyString(item.en.description)) reporter.error(`${p}.en.description`, `Item "${id}" is missing an English description.`, id);
    }
    if (item.ru !== undefined) {
      if (!isPlainObject(item.ru)) {
        reporter.error(`${p}.ru`, `Item "${id}" Russian content must be an object.`, id);
      } else {
        checkDangerousKeys(item.ru, `${p}.ru`, reporter);
        if (item.ru.name !== undefined && typeof item.ru.name !== 'string') reporter.error(`${p}.ru.name`, 'name must be a string.', id);
        if (item.ru.description !== undefined && typeof item.ru.description !== 'string') reporter.error(`${p}.ru.description`, 'description must be a string.', id);
      }
    }

    if (item.craft !== undefined) {
      if (!isNonEmptyString(item.craft)) {
        reporter.error(`${p}.craft`, `Item "${id}" craft reference must be a non-empty string.`, id);
      } else if (item.craft === id) {
        reporter.error(`${p}.craft`, `Item "${id}" cannot craft into itself.`, id);
      } else {
        craftEdges.set(id, item.craft);
      }
    }
  });

  for (const [from, to] of craftEdges) {
    if (!facts.itemIds.has(to)) {
      diagnostics.push({ severity: 'error', file, path: `$.items.${from}.craft`, message: `Item "${from}" crafts into missing item "${to}".`, id: from });
    }
  }
  detectCraftCycles(craftEdges, facts.itemIds, file, diagnostics);

  if (!isPlainObject(data.aliases)) {
    reporter.error('$.aliases', 'aliases must be an object.');
  } else {
    checkDangerousKeys(data.aliases, '$.aliases', reporter);
    Object.entries(data.aliases).forEach(([alias, targetId]) => {
      const p = `$.aliases["${alias}"]`;
      if (!isNonEmptyString(alias)) reporter.error(p, 'Alias text must be non-empty.');
      if (typeof targetId !== 'string') {
        reporter.error(p, `Alias "${alias}" target must be a string.`);
      } else if (!Object.prototype.hasOwnProperty.call(data.items, targetId)) {
        reporter.error(p, `Alias "${alias}" points to missing item "${targetId}".`, targetId);
      }
    });
    detectAliasCollisions(data, file, diagnostics);
  }

  return facts;
}

/* ---------------- data/journey.json ---------------- */

function validateExactRollCoverage(rows, lo, hi, reporter, basePath, label) {
  const seenAt = new Map();
  rows.forEach((row, i) => {
    if (!isPlainObject(row)) return; // already reported by the row validator
    const p = `${basePath}[${i}].roll`;
    const roll = row.roll;
    if (!isFiniteInteger(roll)) { reporter.error(p, `${label} row ${i} has a non-integer roll ${JSON.stringify(roll)}.`); return; }
    if (roll < lo || roll > hi) { reporter.error(p, `${label} roll ${roll} is outside the valid range ${lo}-${hi}.`); return; }
    if (seenAt.has(roll)) { reporter.error(p, `${label} has a duplicate roll ${roll} (also at index ${seenAt.get(roll)}).`); return; }
    seenAt.set(roll, i);
  });
  for (let v = lo; v <= hi; v++) {
    if (!seenAt.has(v)) reporter.error(basePath, `${label} is missing roll ${v}.`);
  }
}

function validateRangeCoverage(rows, lo, hi, reporter, basePath, label) {
  const covered = new Array(hi - lo + 1).fill(null);
  rows.forEach((row, i) => {
    if (!isPlainObject(row)) return;
    const p = `${basePath}[${i}]`;
    const mn = row.min, mx = row.max;
    if (!isFiniteInteger(mn) || !isFiniteInteger(mx)) { reporter.error(p, `${label} row ${i} has non-integer min/max.`); return; }
    if (mn > mx) { reporter.error(p, `${label} row ${i} has min (${mn}) greater than max (${mx}).`); return; }
    if (mn < lo || mx > hi) reporter.error(p, `${label} row ${i} range ${mn}-${mx} is outside ${lo}-${hi}.`);
    for (let v = Math.max(mn, lo); v <= Math.min(mx, hi); v++) {
      if (covered[v - lo] !== null) reporter.error(p, `${label} row ${i} overlaps roll ${v} with row ${covered[v - lo]}.`);
      else covered[v - lo] = i;
    }
  });
  covered.forEach((owner, idx) => { if (owner === null) reporter.error(basePath, `${label} is missing coverage for roll ${idx + lo}.`); });
}

function validateHabitatRow(row, jsonPath, reporter, facts) {
  if (!isPlainObject(row)) { reporter.error(jsonPath, `Row must be an object, got ${describeType(row)}.`); return; }
  checkDangerousKeys(row, jsonPath, reporter);
  if (row.shadowblight === true) return;
  if (!TERRAIN_BIOMES.includes(row.biome)) {
    reporter.error(`${jsonPath}.biome`, `Unsupported or missing terrain biome ${JSON.stringify(row.biome)}.`);
  } else {
    facts.usedBiomes.add(row.biome);
  }
  if (row.examples === undefined) reporter.error(`${jsonPath}.examples`, 'Row is missing examples.');
  else validateBilingualString(row.examples, `${jsonPath}.examples`, reporter, { requireEn: true });
}

function validateEncounterRow(row, jsonPath, reporter) {
  if (!isPlainObject(row)) { reporter.error(jsonPath, `Row must be an object, got ${describeType(row)}.`); return; }
  checkDangerousKeys(row, jsonPath, reporter);
  const hasText = row.text !== undefined;
  const hasCombine = row.combine !== undefined;
  if (hasText && hasCombine) { reporter.error(jsonPath, 'Row must not have both text and combine.'); return; }
  if (!hasText && !hasCombine) { reporter.error(jsonPath, 'Row must have either text or combine.'); return; }
  if (hasCombine && row.combine !== true) reporter.error(`${jsonPath}.combine`, 'combine must be exactly true.');
  if (hasText) validateBilingualString(row.text, `${jsonPath}.text`, reporter, { requireEn: true });
}

function validateTerrainRow(row, jsonPath, reporter) {
  if (!isPlainObject(row)) { reporter.error(jsonPath, `Row must be an object, got ${describeType(row)}.`); return; }
  checkDangerousKeys(row, jsonPath, reporter);
  if (!isFiniteInteger(row.roll)) reporter.error(`${jsonPath}.roll`, 'roll must be an integer.');
  if (!isFiniteInteger(row.days) || row.days <= 0) reporter.error(`${jsonPath}.days`, 'days must be a positive integer.');
  if (row.name === undefined) reporter.error(`${jsonPath}.name`, 'name is required.');
  else validateBilingualString(row.name, `${jsonPath}.name`, reporter, { requireEn: true });
  if (row.text === undefined) reporter.error(`${jsonPath}.text`, 'text is required.');
  else validateBilingualString(row.text, `${jsonPath}.text`, reporter, { requireEn: true });
}

function validateRumorRow(row, jsonPath, reporter) {
  if (!isPlainObject(row)) { reporter.error(jsonPath, `Row must be an object, got ${describeType(row)}.`); return; }
  checkDangerousKeys(row, jsonPath, reporter);
  if (!isFiniteInteger(row.roll)) reporter.error(`${jsonPath}.roll`, 'roll must be an integer.');
  if (row.text === undefined) reporter.error(`${jsonPath}.text`, 'text is required.');
  else validateBilingualString(row.text, `${jsonPath}.text`, reporter, { requireEn: true });
}

function validateSanctuaryRow(row, jsonPath, reporter, tableKey) {
  if (!isPlainObject(row)) { reporter.error(jsonPath, `Row must be an object, got ${describeType(row)}.`); return; }
  checkDangerousKeys(row, jsonPath, reporter);
  const hasText = row.text !== undefined;
  const hasCombine = row.combine !== undefined;
  if (hasCombine && tableKey !== 'politics') {
    reporter.error(`${jsonPath}.combine`, `"combine" is only supported on the "politics" table, not "${tableKey}".`);
    return;
  }
  if (hasText && hasCombine) { reporter.error(jsonPath, 'Row must not have both text and combine.'); return; }
  if (!hasText && !hasCombine) { reporter.error(jsonPath, 'Row must have either text or combine.'); return; }
  if (hasCombine && row.combine !== true) reporter.error(`${jsonPath}.combine`, 'combine must be exactly true.');
  if (hasText) validateBilingualString(row.text, `${jsonPath}.text`, reporter, { requireEn: true });
}

function validateSanctuary(list, reporter) {
  if (!Array.isArray(list)) { reporter.error('$.sanctuary', 'sanctuary must be an array.'); return; }
  const seenKeys = new Map();
  list.forEach((tbl, i) => {
    const p = `$.sanctuary[${i}]`;
    if (!isPlainObject(tbl)) { reporter.error(p, `Table entry must be an object, got ${describeType(tbl)}.`); return; }
    checkDangerousKeys(tbl, p, reporter);
    if (!isNonEmptyString(tbl.key) || !SANCTUARY_KEYS.includes(tbl.key)) {
      reporter.error(`${p}.key`, `Unsupported or missing sanctuary table key ${JSON.stringify(tbl.key)}.`);
    } else if (seenKeys.has(tbl.key)) {
      reporter.error(`${p}.key`, `Duplicate sanctuary table key "${tbl.key}" (also at index ${seenKeys.get(tbl.key)}).`);
    } else {
      seenKeys.set(tbl.key, i);
    }
    if (!isFiniteInteger(tbl.die) || tbl.die < 1) { reporter.error(`${p}.die`, 'die must be a positive integer.'); return; }
    if (!Array.isArray(tbl.rows)) { reporter.error(`${p}.rows`, 'rows must be an array.'); return; }
    tbl.rows.forEach((row, ri) => validateSanctuaryRow(row, `${p}.rows[${ri}]`, reporter, tbl.key));
    validateExactRollCoverage(tbl.rows, 1, tbl.die, reporter, `${p}.rows`, `Sanctuary table "${tbl.key}"`);
  });
  SANCTUARY_KEYS.forEach(k => { if (!seenKeys.has(k)) reporter.error('$.sanctuary', `Missing required sanctuary table "${k}".`); });
}

function validateNameElements(list, reporter) {
  if (!Array.isArray(list)) { reporter.error('$.nameElements', 'nameElements must be an array.'); return; }
  list.forEach((row, i) => {
    const p = `$.nameElements[${i}]`;
    if (!isPlainObject(row)) { reporter.error(p, `Row must be an object, got ${describeType(row)}.`); return; }
    checkDangerousKeys(row, p, reporter);
    if (!isFiniteInteger(row.roll)) reporter.error(`${p}.roll`, 'roll must be an integer.');
    if (!Array.isArray(row.parts) || row.parts.length === 0) {
      reporter.error(`${p}.parts`, 'parts must be a non-empty array.');
    } else {
      row.parts.forEach((part, pi) => { if (!isNonEmptyString(part)) reporter.error(`${p}.parts[${pi}]`, 'Every part must be a non-empty string.'); });
    }
  });
  validateExactRollCoverage(list, 1, 100, reporter, '$.nameElements', 'nameElements');
}

function validateJourney(data, file, diagnostics) {
  const reporter = createReporter(file, diagnostics);
  const facts = { usedBiomes: new Set() };
  if (!isPlainObject(data)) { reporter.error('$', `Top-level value must be an object, got ${describeType(data)}.`); return facts; }
  checkDangerousKeys(data, '$', reporter);

  if (!isNonEmptyString(data.source)) reporter.error('$.source', 'source must be a non-empty string.');

  if (!Array.isArray(data.habitat)) {
    reporter.error('$.habitat', 'habitat must be an array.');
  } else {
    data.habitat.forEach((row, i) => validateHabitatRow(row, `$.habitat[${i}]`, reporter, facts));
    validateRangeCoverage(data.habitat, 1, 20, reporter, '$.habitat', 'habitat table');
  }

  if (!Array.isArray(data.encounter)) {
    reporter.error('$.encounter', 'encounter must be an array.');
  } else {
    data.encounter.forEach((row, i) => validateEncounterRow(row, `$.encounter[${i}]`, reporter));
    validateExactRollCoverage(data.encounter, 2, 14, reporter, '$.encounter', 'encounter table');
  }

  if (!Array.isArray(data.terrain)) {
    reporter.error('$.terrain', 'terrain must be an array.');
  } else {
    data.terrain.forEach((row, i) => validateTerrainRow(row, `$.terrain[${i}]`, reporter));
    validateExactRollCoverage(data.terrain, 1, 4, reporter, '$.terrain', 'terrain table');
  }

  if (!Array.isArray(data.rumors)) {
    reporter.error('$.rumors', 'rumors must be an array.');
  } else {
    data.rumors.forEach((row, i) => validateRumorRow(row, `$.rumors[${i}]`, reporter));
    validateExactRollCoverage(data.rumors, 1, 100, reporter, '$.rumors', 'rumors table');
  }

  validateSanctuary(data.sanctuary, reporter);

  if (!Array.isArray(data.nameElements)) reporter.error('$.nameElements', 'nameElements must be an array.');
  else validateNameElements(data.nameElements, reporter);

  return facts;
}

/* ---------------- data/i18n.json ---------------- */

function extractPlaceholders(str) {
  return (String(str).match(/\{[A-Za-z0-9_]+\}/g) || []).sort();
}
function arraysEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function validateI18n(data, file, diagnostics) {
  const reporter = createReporter(file, diagnostics);
  const facts = { en: null, ru: null };
  if (!isPlainObject(data)) { reporter.error('$', `Top-level value must be an object, got ${describeType(data)}.`); return facts; }
  checkDangerousKeys(data, '$', reporter);

  const enOk = isPlainObject(data.en);
  const ruOk = isPlainObject(data.ru);
  if (!enOk) reporter.error('$.en', 'en must be an object.');
  if (!ruOk) reporter.error('$.ru', 'ru must be an object.');
  if (!enOk || !ruOk) return facts;

  checkDangerousKeys(data.en, '$.en', reporter);
  checkDangerousKeys(data.ru, '$.ru', reporter);

  Object.entries(data.en).forEach(([k, v]) => { if (typeof v !== 'string') reporter.error(`$.en.${k}`, `Value for "${k}" must be a string.`); });
  Object.entries(data.ru).forEach(([k, v]) => { if (typeof v !== 'string') reporter.error(`$.ru.${k}`, `Value for "${k}" must be a string.`); });

  const enKeys = new Set(Object.keys(data.en));
  const ruKeys = new Set(Object.keys(data.ru));
  for (const k of enKeys) if (!ruKeys.has(k)) reporter.error(`$.ru.${k}`, `Key "${k}" exists in English but not Russian.`, k);
  for (const k of ruKeys) if (!enKeys.has(k)) reporter.error(`$.en.${k}`, `Key "${k}" exists in Russian but not English.`, k);

  for (const k of enKeys) {
    if (!ruKeys.has(k) || typeof data.en[k] !== 'string' || typeof data.ru[k] !== 'string') continue;
    const pe = extractPlaceholders(data.en[k]);
    const pr = extractPlaceholders(data.ru[k]);
    if (!arraysEqual(pe, pr)) {
      reporter.error(`$.ru.${k}`, `Placeholders differ between English (${JSON.stringify(pe)}) and Russian (${JSON.stringify(pr)}) for key "${k}".`, k);
    }
  }

  if (isNonEmptyString(data.en.compatibility_label) && isNonEmptyString(data.ru.compatibility_label)
    && data.en.compatibility_label !== data.ru.compatibility_label) {
    reporter.error('$.ru.compatibility_label', 'compatibility_label must be identical in English and Russian.', 'compatibility_label');
  }

  facts.en = data.en;
  facts.ru = data.ru;
  return facts;
}

function checkRequiredI18nKey(key, i18n, diagnostics, usageDescription) {
  const enOk = isNonEmptyString(i18n.en[key]);
  const ruOk = isNonEmptyString(i18n.ru[key]);
  const suffix = usageDescription ? ` (${usageDescription})` : '';
  if (!enOk) diagnostics.push({ severity: 'error', file: 'data/i18n.json', path: `$.en.${key}`, message: `Missing i18n key "${key}"${suffix}.`, id: key });
  if (!ruOk) diagnostics.push({ severity: 'error', file: 'data/i18n.json', path: `$.ru.${key}`, message: `Missing i18n key "${key}"${suffix}.`, id: key });
}

function requireI18nKeysForUsedValues(usedValues, prefix, i18n, diagnostics, describeUsage) {
  for (const val of usedValues) {
    checkRequiredI18nKey(`${prefix}_${val}`, i18n, diagnostics, describeUsage(val));
  }
}

/* ---------------- literal i18n key scan of js/app.js ---------------- */

/** Only two shapes count as "the complete argument is a string literal": a
 * bare literal, or `<condition> ? 'a' : 'b'` where both branches are
 * literals — the condition itself may contain unrelated string literals
 * (`kind === 'region'`) that must not be mistaken for a translation key.
 * Anything else (a bare variable, string concatenation like `'type_' + x`)
 * is a dynamic lookup and is deliberately left alone — see section 12.3. */
function extractCompleteLiterals(arg) {
  const trimmed = arg.trim();
  let m = trimmed.match(/^(['"])([A-Za-z][A-Za-z0-9_]*)\1$/);
  if (m) return [m[2]];
  m = trimmed.match(/^.*?\?\s*(['"])([A-Za-z][A-Za-z0-9_]*)\1\s*:\s*(['"])([A-Za-z][A-Za-z0-9_]*)\3\s*$/);
  if (m) return [m[2], m[4]];
  return [];
}

function scanLiteralI18nKeys(source) {
  const keys = new Set();
  for (let i = 0; i < source.length; i++) {
    if (source[i] === 't' && source[i + 1] === '(' && !/[A-Za-z0-9_$]/.test(source[i - 1] || '')) {
      let depth = 1, j = i + 2;
      while (j < source.length && depth > 0) {
        if (source[j] === '(') depth++;
        else if (source[j] === ')') depth--;
        j++;
      }
      extractCompleteLiterals(source.slice(i + 2, j - 1)).forEach(k => keys.add(k));
    }
  }
  return [...keys];
}

function scanDataI18nAttributes(html) {
  const keys = new Set();
  const re = /data-i18n(?:-[a-z]+)?="([A-Za-z0-9_]+)"/g;
  let m;
  while ((m = re.exec(html))) keys.add(m[1]);
  return [...keys];
}

/* Keys reached only through indirection the static scan above can't resolve:
 * SANCTUARY_ROWS in js/app.js pairs each Journey row key with an i18n key
 * name, then looks it up as t(labelKey) — a variable, not a literal; and
 * recoveryMessageKeys() in js/safe-storage.js returns one of these key names
 * dynamically for reportStorageRecovery() to t(). Both sets are otherwise
 * ordinary required UI strings, so they're listed here by hand instead. */
const EXTRA_REQUIRED_I18N_KEYS = [
  'journey_k_trade', 'journey_k_quirk', 'journey_k_crisis', 'journey_k_drive',
  'journey_k_politics', 'journey_k_settlement_size', 'journey_k_population',
  'journey_k_habitat', 'journey_k_size', 'journey_k_encounter', 'journey_k_terrain', 'journey_k_rumor',
  'storage_unavailable_warning', 'storage_recovery_warning', 'storage_recovery_backup_note',
];

/* ---------------- local biome asset check ---------------- */

const BIOME_ART_WIDTHS = [100, 200, 250, 300];

function validateBiomeAssets(rootPath, usedBiomes, diagnostics) {
  for (const biome of usedBiomes) {
    for (const w of BIOME_ART_WIDTHS) {
      const rel = `img/biomes/${biome}-${w}.avif`;
      if (!fs.existsSync(path.join(rootPath, rel))) {
        diagnostics.push({ severity: 'error', file: rel, path: '$', message: `Missing biome art asset required by biome "${biome}" (see biomeArtHtml() in js/app.js).`, id: biome });
      }
    }
    const relWebp = `img/biomes/${biome}-200.webp`;
    if (!fs.existsSync(path.join(rootPath, relWebp))) {
      diagnostics.push({ severity: 'error', file: relWebp, path: '$', message: `Missing biome art fallback asset required by biome "${biome}" (see biomeArtHtml() in js/app.js).`, id: biome });
    }
  }
}

/* ---------------- orchestration ---------------- */

function sortDiagnostics(diagnostics) {
  diagnostics.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    if (a.message !== b.message) return a.message < b.message ? -1 : 1;
    return 0;
  });
}

const FILES = {
  environments: 'data/environments.json',
  regions: 'data/regions.json',
  adversaries: 'data/adversaries.json',
  items: 'data/items.json',
  journey: 'data/journey.json',
  i18n: 'data/i18n.json',
};

function validateRepositoryData(rootPath) {
  const diagnostics = [];

  const loaded = {};
  for (const [key, rel] of Object.entries(FILES)) {
    loaded[key] = readJsonFile(path.join(rootPath, rel), rel, diagnostics);
  }

  const i18nFacts = loaded.i18n !== null ? validateI18n(loaded.i18n, FILES.i18n, diagnostics) : { en: null, ru: null };
  const envFacts = loaded.environments !== null
    ? validateEnvironments(loaded.environments, FILES.environments, diagnostics)
    : { ids: new Set(), usedTypes: new Set(), usedBiomes: new Set(), usedFeatureTypes: new Set(), featuredAdversaryRefs: [] };
  if (loaded.regions !== null) validateRegions(loaded.regions, FILES.regions, diagnostics, envFacts.ids);
  const advFacts = loaded.adversaries !== null
    ? validateAdversaries(loaded.adversaries, FILES.adversaries, diagnostics)
    : { ids: new Set(), usedRoles: new Set(), usedRanges: new Set(), usedDamageTypes: new Set(), usedFeatureTypes: new Set() };
  const itemFacts = loaded.items !== null
    ? validateItems(loaded.items, FILES.items, diagnostics)
    : { itemIds: new Set(), usedKinds: new Set(), usedSrcs: new Set() };
  const journeyFacts = loaded.journey !== null
    ? validateJourney(loaded.journey, FILES.journey, diagnostics)
    : { usedBiomes: new Set() };

  // cross-file: featured adversary references
  envFacts.featuredAdversaryRefs.forEach(ref => {
    if (!advFacts.ids.has(ref.advId)) {
      diagnostics.push({ severity: 'error', file: FILES.environments, path: ref.jsonPath, message: `Environment "${ref.envId}" references unknown featured adversary "${ref.advId}".`, id: ref.advId });
    }
  });

  // cross-file: i18n key requirements (literal app usage + data-driven enums)
  if (i18nFacts.en && i18nFacts.ru) {
    let appJsSource = '';
    let indexHtmlSource = '';
    try { appJsSource = fs.readFileSync(path.join(rootPath, 'js', 'app.js'), 'utf8'); } catch { /* optional for fixtures */ }
    try { indexHtmlSource = fs.readFileSync(path.join(rootPath, 'index.html'), 'utf8'); } catch { /* optional for fixtures */ }

    const literalKeys = new Set([
      ...scanLiteralI18nKeys(appJsSource),
      ...scanDataI18nAttributes(indexHtmlSource),
      ...EXTRA_REQUIRED_I18N_KEYS,
    ]);
    literalKeys.forEach(key => checkRequiredI18nKey(key, i18nFacts, diagnostics, 'referenced by js/app.js'));

    requireI18nKeysForUsedValues(envFacts.usedTypes, 'type', i18nFacts, diagnostics, v => `used as environment type "${v}"`);
    const usedBiomes = new Set([...envFacts.usedBiomes, ...journeyFacts.usedBiomes]);
    requireI18nKeysForUsedValues(usedBiomes, 'biome', i18nFacts, diagnostics, v => `used as biome "${v}"`);
    const usedFeatureTypes = new Set([...envFacts.usedFeatureTypes, ...advFacts.usedFeatureTypes]);
    requireI18nKeysForUsedValues(usedFeatureTypes, 'feature', i18nFacts, diagnostics, v => `used as feature type "${v}"`);
    requireI18nKeysForUsedValues(advFacts.usedRoles, 'role', i18nFacts, diagnostics, v => `used as adversary role "${v}"`);
    requireI18nKeysForUsedValues(advFacts.usedRanges, 'range', i18nFacts, diagnostics, v => `used as attack range "${v}"`);
    requireI18nKeysForUsedValues(advFacts.usedDamageTypes, 'damage', i18nFacts, diagnostics, v => `used as damage type "${v}"`);
    requireI18nKeysForUsedValues(itemFacts.usedKinds, 'item_kind', i18nFacts, diagnostics, v => `used as item kind "${v}"`);
    requireI18nKeysForUsedValues(itemFacts.usedSrcs, 'item_src', i18nFacts, diagnostics, v => `used as item src "${v}"`);
  }

  validateBiomeAssets(rootPath, envFacts.usedBiomes, diagnostics);

  sortDiagnostics(diagnostics);
  const errorCount = diagnostics.filter(d => d.severity === 'error').length;
  const warningCount = diagnostics.filter(d => d.severity === 'warning').length;
  return { diagnostics, errorCount, warningCount };
}

/* ---------------- CLI ---------------- */

function formatDiagnostics(diagnostics) {
  return diagnostics.map(d => `${d.severity.toUpperCase()} ${d.file} ${d.path}\n  ${d.message}`).join('\n');
}

function main() {
  const rootPath = path.join(__dirname, '..');
  const result = validateRepositoryData(rootPath);
  if (result.diagnostics.length) {
    console.log(formatDiagnostics(result.diagnostics));
    console.log('');
  }
  console.log(`Data validation complete: ${result.errorCount} errors, ${result.warningCount} warnings.`);
  process.exitCode = result.errorCount > 0 ? 1 : 0;
}

if (require.main === module) main();

module.exports = {
  validateRepositoryData,
  validateEnvironments,
  validateRegions,
  validateAdversaries,
  validateItems,
  validateJourney,
  validateI18n,
  readJsonFile,
  normalizeItemKey,
  normalizeDisplayName,
  isSlug,
  isPlainObject,
  isNonEmptyString,
  isFiniteInteger,
  scanLiteralI18nKeys,
  scanDataI18nAttributes,
  EXTRA_REQUIRED_I18N_KEYS,
};
