#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — scripts/darkheart-coverage-report.js
   Read-only report on which environments can serve each of the twelve Darkheart
   outcomes (PD-104): before (the reviewed pilot scenes alone) and after (plus the
   suitability layer), the remaining exclusions, and composed example scenes.

     node scripts/darkheart-coverage-report.js            coverage tables
     node scripts/darkheart-coverage-report.js --scenes   plus one composed scene per outcome
     node scripts/darkheart-coverage-report.js --json     machine-readable

   Columns (never double-counted):
     eligible    — distinct environments that can serve the outcome (an environment counts once per
                   outcome however many scenes, NPCs or rosters it can produce).
     authored    — explicit per-outcome records a person wrote: reviewed-scene outcome entries that carry an
                   `adaptation`, plus suitability `overrides` (add or remove) for that outcome.
     fallback    — environments eligible ONLY through the tag rule (js/darkheart-suitability.js): no reviewed scene
                   and no override for that outcome. A subset of `eligible`, disjoint from authored environments.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const Scenes = require('./lib/darkheart-scenes.js');
const Suit = require('./lib/darkheart-suitability.js');
const Guidance = require('../js/darkheart-guidance.js');
const Npc = require('../js/darkheart-npc.js');
const Encounter = require('../js/darkheart-encounter.js');
const Composer = require('../js/darkheart-composer.js');

const ROOT = path.join(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

function load() {
  const environments = read('data/environments.json').environments;
  const manifest = read('data/darkheart-scenes.json');
  const suitability = read('data/darkheart-suitability.json');
  const affinity = read('data/darkheart-affinity.json');
  const adversaries = read('data/prep.json').adversaries;
  const affinityThemes = Object.keys(affinity.themes);
  const analysis = Scenes.analyzeManifest(manifest, { environments, affinityThemes });
  const authored = analysis.scenes.filter(x => x.selectable).map(x => x.scene);
  return { environments, manifest, suitability, affinity, adversaries, affinityThemes, authored };
}

function coverage(L) {
  const covered = new Map();
  L.authored.forEach(sc => { const set = covered.get(sc.envId) || new Set(); sc.outcomes.forEach(o => set.add(o.outcome)); covered.set(sc.envId, set); });
  const rows = [];
  const all = { before: new Set(), after: new Set() };
  for (const outcome of Suit.OUTCOME_KEYS) {
    const beforeEnvs = new Set(L.authored.filter(sc => sc.outcomes.some(o => o.outcome === outcome)).map(sc => sc.envId));
    const adaptRecords = L.authored.reduce((n, sc) => n + sc.outcomes.filter(o => o.outcome === outcome && o.adaptation).length, 0);
    const overrides = (L.suitability.overrides || []).filter(o => o.outcome === outcome);
    const overrideAdd = new Set(overrides.filter(o => o.mode === 'add').map(o => o.envId));
    const suited = new Set(L.environments.filter(e => Suit.suits(L.suitability, e, outcome).ok).map(e => e.id));
    const afterEnvs = new Set([...beforeEnvs, ...suited]);
    const fallback = [...suited].filter(id => !beforeEnvs.has(id) && !overrideAdd.has(id));
    rows.push({
      outcome,
      before: { eligible: beforeEnvs.size, authored: adaptRecords, fallback: 0 },
      after: { eligible: afterEnvs.size, authored: adaptRecords + overrides.length, fallback: fallback.length },
    });
    beforeEnvs.forEach(x => all.before.add(x));
    afterEnvs.forEach(x => all.after.add(x));
  }
  return { rows, distinct: { before: all.before.size, after: all.after.size }, covered };
}

function exclusions(L, cov) {
  const profiled = new Set(Object.keys(L.suitability.profiles));
  const excluded = new Map(L.suitability.exclusions.map(x => [x.envId, x]));
  const byCategory = {};
  excluded.forEach(x => { byCategory[x.category] = (byCategory[x.category] || 0) + 1; });
  const ADJACENT = ['forest', 'wetland', 'rolling', 'grassland'];
  const buckets = { 'not considered: terrain (no forest, wetland, rolling or grassland biome)': 0, 'not considered: settlement or universal framework (city, interior, space, planar, encounter template)': 0, 'not considered: other terrain mix not adapted': 0 };
  L.environments.forEach(e => {
    if (profiled.has(e.id) || excluded.has(e.id)) return;
    const b = e.biomes || [];
    if (b.some(x => ADJACENT.includes(x))) buckets['not considered: other terrain mix not adapted'] += 1;
    else if (b.every(x => x === 'settlement' || x === 'universal')) buckets['not considered: settlement or universal framework (city, interior, space, planar, encounter template)'] += 1;
    else buckets['not considered: terrain (no forest, wetland, rolling or grassland biome)'] += 1;
  });
  // Per-outcome: profiled environments the outcome's rule leaves out.
  const perOutcome = {};
  for (const outcome of Suit.OUTCOME_KEYS) perOutcome[outcome] = [...profiled].filter(id => !Suit.suits(L.suitability, L.environments.find(e => e.id === id), outcome).ok).length;
  return { total: L.environments.length, profiled: profiled.size, excluded: excluded.size, byCategory, buckets, perOutcome, reasons: L.suitability.exclusions };
}

const REP_ENV = {          // one representative environment per outcome for the composed examples (explicit, not random)
  'creature-fail-fear': 'unsettling-forest', 'creature-fail-hope': 'bandit-hideout', 'creature-success-fear': 'forest-basin', 'creature-success-hope': 'abandoned-grove',
  'landmark-fail-fear': 'death-butterfly-grove', 'landmark-fail-hope': 'swamp-ruins', 'landmark-success-fear': 'briar-thicket', 'landmark-success-hope': 'wishmaker-glade',
  'hazard-fail-fear': 'dread-mire', 'hazard-fail-hope': 'briar-thicket', 'resource-success-fear': 'hunter-or-hunted', 'resource-success-hope': 'mystic-ring',
};

function compose(L, outcome, opts) {
  const envId = REP_ENV[outcome];
  const env = L.environments.find(e => e.id === envId);
  const derived = Suit.buildScenes(L.suitability, { environments: [env], affinityThemes: L.affinityThemes, covered: new Map() });
  const scene = derived[0];
  const ctx = Encounter.createContext(L.adversaries, L.environments, L.affinity);
  const tier = opts.tier, heroes = opts.heroes;
  const enc = Composer.encounterFor({ scene, outcome, tier, heroes, difficulty: 'standard', seed: 3, locked: [], ctx });
  const role = Npc.roleForOutcome(outcome);
  const profile = L.suitability.profiles[envId];
  const npc = role && role !== 'neutral-creature' ? Npc.generateNpc({ outcome, seed: 5, situations: Suit.npcSituations(profile, role) }) : null;
  const plan = Suit.featurePlan(env, outcome, L.adversaries, enc.adversaries ? enc.adversaries.map(a => a.id) : []);
  const guidance = Guidance.guidanceFor({ outcome, env, profile, npc, features: plan.active.length ? plan.active : env.features });
  return { outcome, env, scene, enc, npc, plan, guidance, via: scene.outcomes.find(o => o.outcome === outcome).via };
}

function md(L) {
  const cov = coverage(L), ex = exclusions(L, cov);
  const lines = [];
  lines.push('| Outcome | Before: eligible | Before: authored | Before: fallback | After: eligible | After: authored | After: fallback-only |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  cov.rows.forEach(r => lines.push(`| ${r.outcome} | ${r.before.eligible} | ${r.before.authored} | ${r.before.fallback} | ${r.after.eligible} | ${r.after.authored} | ${r.after.fallback} |`));
  lines.push('');
  lines.push(`Distinct environments across all twelve outcomes: before ${cov.distinct.before}, after ${cov.distinct.after} (of ${ex.total}).`);
  lines.push('');
  lines.push(`Remaining exclusions: ${ex.profiled} profiled, ${ex.excluded} explicitly excluded (${Object.entries(ex.byCategory).map(([k, v]) => `${v} ${k}`).join(', ')}).`);
  Object.entries(ex.buckets).forEach(([k, v]) => lines.push(`- ${v} ${k}`));
  lines.push(`Per outcome, profiled environments its rule leaves out: ${Object.entries(ex.perOutcome).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
  return lines.join('\n');
}

function scenesMd(L) {
  const out = [];
  for (const outcome of Suit.OUTCOME_KEYS) {
    const c = compose(L, outcome, { tier: 2, heroes: 4 });
    out.push(`### ${outcome} — ${c.scene.outcomes.find(o => o.outcome === outcome).framing.title.en}`);
    out.push(`Environment \`${c.env.id}\` (tags: ${L.suitability.profiles[c.env.id].tags.join(', ')}) · eligible via ${c.via}`);
    if (c.enc && c.enc.status !== 'blocked') {
      out.push(`Encounter (${c.enc.combat}, Tier 2, 4 heroes): ${c.enc.adversaries.length ? c.enc.adversaries.map(a => `${a.quantity}× ${a.name.en}`).join(', ') + ` — ${c.enc.battlePoints.spent}/${c.enc.battlePoints.available} BP` : 'none generated'}`);
    }
    if (c.npc) out.push(`NPC: ${c.npc.name.en}, ${c.npc.ancestry.en} — need: ${c.npc.need.en} (situation: ${c.npc.situation})`);
    if (c.plan.adapted.length) out.push(`Adapted source features: ${c.plan.adapted.map(a => a.feature.name.en).join(', ')}`);
    out.push('GM Guidance:');
    c.guidance.items.forEach(i => out.push(`- **${i.label.en}.** ${i.text.en}`));
    out.push('');
  }
  return out.join('\n');
}

function main() {
  const L = load();
  if (process.argv.includes('--json')) {
    const cov = coverage(L);
    console.log(JSON.stringify({ rows: cov.rows, distinct: cov.distinct, exclusions: exclusions(L, cov) }, null, 2));
    return;
  }
  console.log(md(L));
  if (process.argv.includes('--scenes')) { console.log('\n## Composed scenes (Tier 2, 4 heroes)\n'); console.log(scenesMd(L)); }
}

if (require.main === module) main();
module.exports = { load, coverage, exclusions, compose, REP_ENV };
