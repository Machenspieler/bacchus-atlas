#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — darkheart-review-report.js
   Read-only maintenance report for data/darkheart-scenes.json. It never writes
   the manifest and never "accepts" a change — pins are updated by a person who
   has re-read the source (see docs/data-contracts/darkheart-scenes.md).

     node scripts/darkheart-review-report.js                  review queue + manifest problems
     node scripts/darkheart-review-report.js --env <id>       what the manifest says about one environment
     node scripts/darkheart-review-report.js --pins <id>      current fingerprints to copy into a review (env + every feature)
     node scripts/darkheart-review-report.js --strict         exit 1 while anything is unlisted, pending or stale

   Used by the add-environment workflow: after adding or editing an
   environment, run `--env <id>`; a new id is "unlisted" (pending review), an
   edited one shows which scenes went stale.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  analyzeManifest, reviewQueue, environmentFingerprint, featureFingerprint, flatten,
} = require('./lib/darkheart-scenes.js');

const ROOT = path.join(__dirname, '..');

function load(rel) { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }

function printPins(env) {
  console.log(`${env.id}  envFp ${environmentFingerprint(env)}`);
  for (const f of env.features) {
    console.log(`  ${f.type.padEnd(8)} fp ${featureFingerprint(f)}  ${f.name.en}`);
  }
}

function main(argv) {
  const environments = load('data/environments.json').environments;
  const manifest = load('data/darkheart-scenes.json');
  const arg = name => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; };
  const analysis = analyzeManifest(manifest, { environments });

  const pinsId = arg('--pins');
  if (pinsId) {
    const env = environments.find(e => e.id === pinsId);
    if (!env) { console.error(`Unknown environment "${pinsId}".`); return 1; }
    printPins(env);
    return 0;
  }

  const envId = arg('--env');
  if (envId) {
    const env = environments.find(e => e.id === envId);
    if (!env) { console.error(`Unknown environment "${envId}".`); return 1; }
    const queue = reviewQueue(manifest, environments);
    const state = queue.unlisted.includes(envId) ? 'UNLISTED — pending review (not in the manifest ledger yet)'
      : queue.pending.includes(envId) ? 'PENDING review'
      : queue.stale.includes(envId) ? 'STALE — the environment changed since it was reviewed'
      : 'current';
    console.log(`${envId}: ${state}`);
    const review = manifest.reviews.find(r => r.envId === envId);
    if (review) console.log(`  review: ${review.status}${review.compatibility ? `, ${review.compatibility}` : ''}`);
    for (const s of analysis.scenes.filter(x => x.envId === envId)) {
      console.log(`  scene ${s.id}: ${s.selectable ? 'selectable' : `NOT selectable (${[...new Set(s.reasons)].join(', ')})`}`);
    }
    for (const p of analysis.problems.filter(x => x.id === envId || (analysis.scenes.find(s => s.id === x.id) || {}).envId === envId)) {
      console.log(`  ${p.severity.toUpperCase()} ${p.path}: ${p.message}`);
    }
    return state.startsWith('current') ? 0 : (argv.includes('--strict') ? 1 : 0);
  }

  const queue = reviewQueue(manifest, environments);
  console.log(`Environments: ${environments.length}  current ${queue.current.length}, stale ${queue.stale.length}, pending ${queue.pending.length}, unlisted ${queue.unlisted.length}`);
  if (queue.stale.length) console.log(`Stale reviews: ${queue.stale.join(', ')}`);
  if (queue.pending.length) console.log(`Pending: ${queue.pending.join(', ')}`);
  const c = analysis.coverage;
  console.log(`Scenes: ${c.scenes} (${c.selectable} selectable) — ${Object.entries(c.byMatch).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
  console.log(`Outcomes covered: ${Object.keys(c.byOutcome).length} of 12 — ${Object.entries(c.byOutcome).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  for (const p of analysis.problems) console.log(`${p.severity.toUpperCase()} ${p.path}: ${p.message}`);
  const errors = analysis.problems.filter(p => p.severity === 'error').length;
  if (argv.includes('--strict') && (queue.unlisted.length || queue.pending.length || queue.stale.length)) return 1;
  return errors ? 1 : 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { main, flatten };
