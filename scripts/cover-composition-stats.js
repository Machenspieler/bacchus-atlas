#!/usr/bin/env node
/* Dev-only: how often each strategy would change a cover, over the fixtures and over 2,000 deterministic
 * pseudo-random lists (3-12 environments) from the real catalogue. Writes
 * docs/research/my-lists-cover-composition-lab-v2/stats.json. Run: node scripts/cover-composition-stats.js */
'use strict';
const fs = require('fs'), path = require('path');
const Art = require('../js/list-cover-art.js'), Utils = require('../js/list-cover-utils.js');
const Core = require('../lab/cover-composition/lab-core.js'), Fx = require('../lab/cover-composition/fixtures.js');
const { REVIEWS } = require('../lab/cover-composition/reviews.js');
const ENVS = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/environments.json'), 'utf8')).environments;
const BIOMES = ['underground', 'aquatic', 'wetland', 'grassland', 'tropical', 'forest', 'drylands', 'rolling', 'mountain', 'frozen', 'badlands', 'settlement', 'universal'];
const artBiome = e => { let pool = (e.biomes || []).filter(b => BIOMES.includes(b)); for (const g of ['universal', 'settlement']) { if (pool.length < 2) break; pool = pool.filter(b => b !== g); } return pool[0] || null; };
const lcg = seed => { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; };
const analyse = ids => Core.analyse(ENVS.filter(e => ids.includes(e.id)).map(e => ({ id: e.id, artBiome: artBiome(e) })), Art, Utils);
const shape = k => k.panels.map(p => p.imageId).join('|') + '@' + k.panels.map(p => p.fraction).join(',');
const out = { fixtures: {}, random: {}, library: {} };
Fx.ALL.forEach(c => {
  const a = analyse(c.envIds), base = shape(Core.compose('A', a, Art));
  out.fixtures[c.id] = Object.fromEntries(Core.STRATEGY_IDS.map(s => { const k = Core.compose(s, a, Art, { reviews: REVIEWS }); return [s, { layout: k.layout, changed: shape(k) !== base, rule: k.rule }]; }));
});
const r = lcg(2026), N = 2000, tally = { three: 0, twoA: 0, oneA: 0, E: { keep3: 0, to2: 0, asym: 0, hero: 0, unchangedAny: 0 }, B: { changed: 0 }, C: { changed: 0 }, D: { changed: 0 } };
for (let i = 0; i < N; i++) {
  const n = 3 + Math.floor(r() * 10), pool = ENVS.map(e => e.id), ids = [];
  while (ids.length < n) ids.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  const a = analyse(ids), base = shape(Core.compose('A', a, Art));
  const L = a.production.tiles.length; if (L === 3) tally.three++; else if (L === 2) tally.twoA++; else if (L === 1) tally.oneA++;
  ['B', 'C', 'D'].forEach(s => { if (shape(Core.compose(s, a, Art, { reviews: REVIEWS })) !== base) tally[s].changed++; });
  const e = Core.compose('E', a, Art, { reviews: REVIEWS });
  if (shape(e) === base) tally.E.unchangedAny++;
  if (L === 3) { if (e.layout === 3) tally.E.keep3++; else if (e.rule === 'triptych-to-two') tally.E.to2++; else if (e.rule === 'asymmetric') tally.E.asym++; else tally.E.hero++; }
}
out.random = { lists: N, ...tally };
const ids = Object.keys(Art.IMAGES), cnt = (k, v) => ids.filter(i => REVIEWS[i][k] === v).length;
out.library = { pictures: ids.length, thirdPoor: cnt('third', 'poor'), thirdAcceptable: cnt('third', 'acceptable'), thirdExcellent: cnt('third', 'excellent'), halfPoor: cnt('half', 'poor'), heroPoor: cnt('hero', 'poor'), busy: ids.filter(i => REVIEWS[i].complexity === 'busy').length, archetypeThirdPoor: ids.filter(i => i.startsWith('archetype:') && REVIEWS[i].third === 'poor').length, archetypes: ids.filter(i => i.startsWith('archetype:')).length };
fs.writeFileSync(path.join(__dirname, '../docs/research/my-lists-cover-composition-lab-v2/stats.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out, null, 1));
