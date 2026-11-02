#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — artwork-lab-v3-stats.js
   DEV-ONLY. Recomputes the Artwork Lab V3 numbers from the repo's real data and files and writes
   docs/research/artwork-lab-v3/stats.json (read back by the lab's Summary tab): coverage per
   strategy and context, repetition in the real list orders, file existence, and the bytes each
   strategy would deliver at DPR 1 and 2. Run: node scripts/artwork-lab-v3-stats.js
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const Bridge = require('../lab/artwork-v3/prod-bridge.js');
const Core = require('../lab/artwork-v3/lab-core.js');
const Art = require('../js/list-cover-art.js');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

function loadLab() {
  const envs = read('data/environments.json').environments;
  const prod = Bridge.load(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'), {
    EnvTierUtils: require('../js/env-tier-utils.js'), PrepUtils: require('../js/prep-utils.js'), RouteUtils: require('../js/route-utils.js'),
  }, { i18n: read('data/i18n.json'), regions: read('data/regions.json').regions, lang: 'en' });
  const core = Core.create({
    envs, art: Art, coverUtils: require('../js/list-cover-utils.js'), artBiome: prod.artBiome,
    review: require('../lab/artwork-v3/context-review.js'), classification: read('docs/research/lists-cover-classification.json'),
  });
  return { core, prod, envs };
}

function allFiles(dir, base, out) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) allFiles(`${dir}/${e.name}`, rel, out); else out.add(`${dir}/${e.name}`);
  }
  return out;
}

function run() {
  const { core, envs } = loadLab();
  const files = new Set();
  ['img/biomes', 'img/list-covers', 'img/env/thumb'].forEach(d => allFiles(d, '', files));
  const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
  const order = envs.slice().sort((a, b) => a.tier - b.tier || collator.compare(a.name.en, b.name.en));
  const out = { generated: new Date().toISOString().slice(0, 10), environments: envs.length, coverage: {}, repetition: {}, delivery: {}, deliveryDpr: {}, missingFiles: 0 };
  for (const ctx of ['catalog', 'prep']) {
    out.coverage[ctx] = core.coverage(ctx, files);
    out.repetition[ctx] = {};
    out.delivery[ctx] = {}; out.deliveryDpr[ctx] = { 1: {}, 2: {}, 3: {} };
    for (const s of ['A', 'B', 'C']) {
      out.repetition[ctx][s] = { full: core.repetition(order, s, ctx), firstPage18: core.repetition(order.slice(0, 18), s, ctx) };
      for (const dpr of [1, 2, 3]) {
        const planned = core.plannedFiles(envs, s, ctx, dpr, null);
        const bytes = planned.reduce((n, f) => n + (files.has(f.path) ? fs.statSync(path.join(ROOT, f.path)).size : 0), 0);
        out.deliveryDpr[ctx][dpr][s] = { requests: planned.length, bytes, upscaled: planned.filter(f => f.upscaled).length, missing: planned.filter(f => !files.has(f.path)).length };
        if (dpr === 2) out.delivery[ctx][s] = out.deliveryDpr[ctx][dpr][s];
        out.missingFiles += out.deliveryDpr[ctx][dpr][s].missing;
      }
    }
  }
  return out;
}

if (require.main === module) {
  const out = run();
  fs.writeFileSync(path.join(ROOT, 'docs/research/artwork-lab-v3/stats.json'), JSON.stringify(out, null, 1) + '\n');
  for (const ctx of ['catalog', 'prep']) {
    console.log(`\n== ${ctx} (${out.environments} environments)`);
    for (const s of ['A', 'B', 'C']) {
      const c = out.coverage[ctx][s];
      console.log(s, JSON.stringify(c.counts), 'thematic', c.thematic, 'biome', c.biomeRetained, c.downgradedToBiome != null ? 'C-downgraded ' + c.downgradedToBiome + ' ' + JSON.stringify(c.downgradeReviewStatus) : '');
    }
    console.log('eligible', JSON.stringify(out.coverage[ctx].eligible));
    for (const s of ['A', 'B', 'C']) {
      const r = out.repetition[ctx][s];
      console.log(s, 'rep full', r.full.adjacentSame, r.full.maxRun, r.full.distinct, '| page18', r.firstPage18.adjacentSame, r.firstPage18.maxRun, r.firstPage18.distinct);
    }
    for (const d of [1, 2, 3]) console.log('delivery dpr', d, ['A', 'B', 'C'].map(s => `${s}:${out.deliveryDpr[ctx][d][s].requests}f/${Math.round(out.deliveryDpr[ctx][d][s].bytes / 1024)}KB/up${out.deliveryDpr[ctx][d][s].upscaled}`).join(' '));
  }
  console.log('\nmissing files:', out.missingFiles);
}
module.exports = { run, loadLab };
