/* ============================================================
   Bacchus's Atlas — tests/darkheart-encounter.test.js
   The Darkheart encounter assembly engine (scripts/lib/darkheart-encounter.js, PD-098):
   Battle Points through the existing js/battle-points.js, role costs and
   Minion groups, party sizes and tiers, difficulty, locked adversaries,
   insufficient candidates, bad references, seeded reproducibility, the
   non-combat outcomes, purity (no campaign state), the "Open in Encounter
   Builder" payload, and that Prep's own arithmetic and export are unchanged.
   Run with:

     node --test tests/darkheart-encounter.test.js
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const E = require('../js/darkheart-encounter.js');
const BP = require('../js/battle-points.js');
const FCG = require('../js/freshcutgrass-utils.js');
const D = require('../js/darkheart-scenes.js');
const Composer = require('../js/darkheart-composer.js');

const ROOT = path.join(__dirname, '..');
const adversaries = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/prep.json'), 'utf8')).adversaries;
const environments = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/environments.json'), 'utf8')).environments;
const affinity = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/darkheart-affinity.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/darkheart-scenes.json'), 'utf8'));
const ctx = E.createContext(adversaries, environments, affinity);
const scenes = D.getSelectableScenes(manifest, environments);
const sceneById = id => scenes.find(x => x.id === id);
const byId = id => adversaries.find(a => a.id === id);

/* A low-level call: a whole environment shown with its list and no declared themes, as the engine treats an unscened input. */
function run(over) {
  return E.assembleEncounter(Object.assign({
    tier: 1, partySize: 4, difficulty: 'standard', outcome: 'creature-fail-fear',
    environmentId: 'hunter-or-hunted', scene: { adversaries: 'source', themes: ['wolves'] }, seed: 'test',
  }, over), ctx);
}
/** The composition boundary, on a real manifest scene. */
function forScene(sceneId, over) {
  const scene = sceneById(sceneId);
  const o = Object.assign({ tier: 1, heroes: 4, difficulty: 'standard', outcome: scene.outcomes[0].outcome, seed: 'test', ctx }, over);
  return Composer.encounterFor(Object.assign({ scene }, o));
}
/** Independent recomputation of a result's spend straight from battle-points.js. */
function recompute(result) {
  return BP.calculate({
    pcs: result.input.partySize,
    entries: result.adversaries.map(a => ({ type: a.role, quantity: a.quantity })),
    style: result.battlePoints.style,
    lowerTier: result.adversaries.some(a => a.tier < result.input.tier),
  });
}
function synthetic(list) {
  const advs = list.map(([id, tier, type, en]) => ({ id, tier, type, name: { en, ru: en } }));
  return E.createContext(advs, environments, { themes: affinity.themes, adversaries: Object.fromEntries(advs.map(a => [a.id, ['wolves']])) });
}

/* ---------------- policy ---------------- */

test('the engine knows exactly the twelve Darkheart outcomes', () => {
  assert.deepEqual([...E.OUTCOME_KEYS].sort(), [...D.OUTCOME_KEYS].sort());
});

test('invalid input is refused with a reason, not guessed', () => {
  for (const bad of [{ tier: 0 }, { tier: 5 }, { difficulty: 'brutal' }, { outcome: 'nope' }, { environmentId: 'no-such-env' }]) {
    const r = run(bad);
    assert.equal(r.status, 'invalid', JSON.stringify(bad));
    assert.ok(r.errors.length >= 1 && r.errors[0].text.en && r.errors[0].text.ru);
  }
});

/* ---------------- Battle Points ---------------- */

test('every role costs what battle-points.js says, per line and in total', () => {
  for (const role of Object.keys(BP.TYPE_COST)) {
    const adv = adversaries.find(a => a.type === role && a.tier === 1) || adversaries.find(a => a.type === role);
    const r = run({ tier: adv.tier, partySize: 4, outcome: 'creature-fail-fear', locked: [adv.id], seed: 1 });
    const line = r.adversaries.find(a => a.id === adv.id);
    assert.equal(line.unitCost, BP.TYPE_COST[role], role);
    assert.equal(line.lineCost, BP.TYPE_COST[role] * line.quantity, role);
  }
  const r = run({ seed: 7 });
  assert.equal(r.battlePoints.spent, recompute(r).spent);
  assert.equal(r.battlePoints.available, recompute(r).available);
  assert.equal(r.battlePoints.spent, r.adversaries.reduce((s, a) => s + a.lineCost, 0));
});

test('Minions are taken in full groups equal to the party size; a group costs 1', () => {
  for (const pcs of [2, 3, 4, 5, 6]) {
    const r = run({ partySize: pcs, locked: ['giant-rat'], outcome: 'creature-fail-fear', seed: 3 });
    const rat = r.adversaries.find(a => a.id === 'giant-rat');
    assert.equal(rat.role, 'minion');
    assert.equal(rat.quantity, pcs, `a locked Minion becomes one group of ${pcs}`);
    assert.equal(rat.minionGroups, 1);
    assert.equal(rat.lineCost, 1);
    assert.equal(rat.unitCost, 1 / pcs);
  }
  const free = run({ partySize: 5, environmentId: 'briar-thicket', seed: 11 });
  for (const m of free.adversaries.filter(a => a.role === 'minion')) {
    assert.equal(m.quantity % 5, 0);
    assert.ok(m.minionGroups <= 2);
  }
});

test('different tiers and party sizes: budget is 3×PCs+2, never exceeded, always from the catalogue', () => {
  for (const tier of [1, 2, 3, 4]) {
    for (const partySize of [1, 2, 3, 4, 5, 6, 8]) {
      for (const environmentId of ['hunter-or-hunted', 'gnarled-glen', 'cauldera-valley', 'briar-thicket']) {
        const r = run({ tier, partySize, environmentId, seed: `${tier}-${partySize}` });
        assert.notEqual(r.status, 'invalid');
        assert.equal(r.battlePoints.baseBudget, 3 * partySize + 2);
        assert.ok(r.battlePoints.spent <= r.battlePoints.available + 1e-9, `${tier}/${partySize}/${environmentId} over budget`);
        assert.equal(r.battlePoints.spent, recompute(r).spent);
        for (const a of r.adversaries) {
          assert.ok(byId(a.id), 'id exists in the catalogue');
          assert.ok(a.tier <= tier, 'never above the party tier');
          assert.ok(a.tier >= tier - 1, 'never more than one tier below');
          assert.equal(a.crossTier, a.tier < tier ? 'lower' : null);
        }
        assert.ok(new Set(r.adversaries.map(a => a.id)).size === r.adversaries.length, 'no duplicate lines');
      }
    }
  }
});

test('easier / standard / harder shift the budget by −1 / 0 / +2 for the same composition', () => {
  const locked = ['bear', 'dire-wolf'];
  const get = difficulty => run({ difficulty, locked, partySize: 4, seed: 'd' }).battlePoints;
  const easier = get('easier'), standard = get('standard'), harder = get('harder');
  for (const [style, r] of [['easier', easier], ['standard', standard], ['dangerous', harder]]) {
    assert.equal(r.style, style);
  }
  assert.equal(easier.modifiers.find(m => m.id === 'difficulty').value, -1);
  assert.equal(standard.modifiers.find(m => m.id === 'difficulty').applied, false);
  assert.equal(harder.modifiers.find(m => m.id === 'difficulty').value, 2);
  // the same composition (a locked Bruiser, no generation) at party 4: the budget moves by −1 / 0 / +2
  const only = d => run({ difficulty: d, locked: ['bear'], outcome: 'landmark-success-hope', partySize: 4, seed: 'x' });
  const budgets = ['easier', 'standard', 'harder'].map(d => {
    const r = only(d);
    return r.battlePoints.available - BP.calculate({ pcs: 4, entries: r.adversaries.map(a => ({ type: a.role, quantity: a.quantity })), style: 'standard', lowerTier: false }).available;
  });
  assert.deepEqual(budgets, [-1, 0, 2]);
});

test('SRD adjustments are reported: multiple solos, lower tier, no heavy type, boosted damage never', () => {
  const solos = run({ locked: ['cave-ogre', 'acid-burrower'], outcome: 'creature-fail-fear', seed: 1 }).battlePoints;
  assert.equal(solos.modifiers.find(m => m.id === 'multiple-solos').applied, true);
  const light = run({ locked: ['archer-guard'], seed: 1, outcome: 'landmark-success-hope' }).battlePoints;
  assert.equal(light.modifiers.find(m => m.id === 'no-heavy-type').applied, true);
  const lower = run({ tier: 2, locked: ['bear'], seed: 1 }).battlePoints;
  assert.equal(lower.modifiers.find(m => m.id === 'lower-tier').applied, true);
  const same = run({ tier: 1, locked: ['bear'], seed: 1 }).battlePoints;
  assert.equal(same.modifiers.find(m => m.id === 'lower-tier').applied, false);
  for (const bp of [solos, light, lower, same]) assert.equal(bp.modifiers.find(m => m.id === 'boosted-damage').applied, false);
});

/* ---------------- adversary selection ---------------- */

test('environment-listed adversaries come first and are labelled as such', () => {
  const r = run({ environmentId: 'briar-thicket', scene: { adversaries: 'source', themes: [] }, seed: 5 });
  assert.ok(r.adversaries.length > 0);
  assert.ok(r.adversaries.every(a => a.source === 'environment'), 'a whole environment shown with its list uses that list');
  for (const a of r.adversaries) assert.ok(a.reason.en && a.reason.ru);
  assert.ok(r.reasoning.some(x => x.code === 'budget'));
});

test('a cross-tier pick is only ever one tier down, flagged, and carries the lower-tier adjustment', () => {
  const r = run({ tier: 2, environmentId: 'gnarled-glen', seed: 'x' });
  const lower = r.adversaries.filter(a => a.crossTier === 'lower');
  assert.ok(lower.length > 0, 'a tier-1 environment dealt at tier 2 uses its own tier-1 list');
  assert.ok(lower.every(a => a.tier === 1));
  assert.ok(r.warnings.some(w => w.code === 'cross-tier-used'));
  assert.equal(r.battlePoints.modifiers.find(m => m.id === 'lower-tier').applied, true);
  assert.ok(r.reasoning.some(x => x.code === 'cross-tier'));
});

test('higher-tier adversaries are excluded and the exclusion is reported', () => {
  const r = run({ tier: 1, environmentId: 'briar-thicket', seed: 2 }); // lists Elephant (tier 2)
  assert.ok(!r.adversaries.some(a => a.id === 'elephant'));
  assert.ok(r.warnings.some(w => w.code === 'higher-tier-excluded' && /Elephant/.test(w.text.en)));
});

test('insufficient thematic candidates give a partial recommendation, not unrelated filler', () => {
  const small = synthetic([['dire-wolf', 1, 'skulk', 'Dire Wolf'], ['sylvan-archer', 1, 'ranged', 'Sylvan Archer']]);
  const r = E.assembleEncounter({ tier: 1, partySize: 6, difficulty: 'harder', outcome: 'creature-fail-fear', environmentId: 'hunter-or-hunted', scene: { adversaries: 'source', themes: ['wolves'] }, seed: 1 }, small);
  assert.equal(r.status, 'partial');
  assert.ok(r.warnings.some(w => w.code === 'insufficient-thematic-candidates'));
  assert.ok(r.battlePoints.remaining > 1);
  assert.ok(r.adversaries.every(a => ['dire-wolf', 'sylvan-archer'].includes(a.id)));
  const none = E.assembleEncounter({ tier: 1, partySize: 4, outcome: 'creature-fail-fear', environmentId: 'hunter-or-hunted', scene: { adversaries: 'source', themes: ['wolves'] }, seed: 1 }, synthetic([['x', 4, 'solo', 'Colossus']]));
  assert.equal(none.status, 'empty');
  assert.ok(none.warnings.some(w => w.code === 'no-candidates'));
  const tooBig = E.assembleEncounter({ tier: 1, partySize: 1, difficulty: 'easier', outcome: 'creature-fail-fear', environmentId: 'hunter-or-hunted', scene: { adversaries: 'source', themes: ['wolves'] }, seed: 1 }, synthetic([['dire-wolf', 1, 'solo', 'Dire Wolf']]));
  assert.equal(tooBig.status, 'empty');
  assert.ok(tooBig.warnings.some(w => w.code === 'nothing-fits'));
});

test('an environment with no listed adversaries is reported and still yields only fitting picks', () => {
  const r = run({ environmentId: 'root-rush-rescue', seed: 4 });
  assert.ok(r.warnings.some(w => w.code === 'no-environment-adversaries'));
  assert.ok(r.adversaries.every(a => a.source !== 'environment'));
});

/* ---------------- locks, regeneration ---------------- */

test('locked adversaries survive regeneration while the rest change with the seed', () => {
  const locked = ['dire-wolf'];
  const seen = new Set();
  for (let s = 0; s < 12; s++) {
    const r = run({ locked, seed: `s${s}`, outcome: 'creature-fail-fear', environmentId: 'briar-thicket' });
    const wolf = r.adversaries.find(a => a.id === 'dire-wolf');
    assert.ok(wolf && wolf.locked && wolf.source === 'locked');
    seen.add(r.adversaries.map(a => `${a.id}x${a.quantity}`).join(','));
  }
  assert.ok(seen.size > 1, 'different seeds explore different compositions');
});

test('a locked quantity is honoured; missing and duplicate references are reported', () => {
  const r = run({ locked: [{ id: 'dire-wolf', quantity: 3 }, 'dire-wolf', 'no-such-adversary'], seed: 1 });
  assert.equal(r.adversaries.find(a => a.id === 'dire-wolf').quantity, 3);
  assert.ok(r.warnings.some(w => w.code === 'locked-duplicate'));
  assert.ok(r.warnings.some(w => w.code === 'locked-missing' && /no-such-adversary/.test(w.text.en)));
  assert.ok(!r.adversaries.some(a => a.id === 'no-such-adversary'));
  assert.deepEqual(r.input.locked, ['dire-wolf']);
});

test('locked adversaries that already exceed the budget are kept, flagged, and nothing is added', () => {
  const r = run({ partySize: 2, difficulty: 'easier', locked: ['cave-ogre', 'mountain-troll'], seed: 1 });
  assert.equal(r.status, 'partial');
  assert.equal(r.adversaries.length, 2);
  assert.ok(r.battlePoints.overBudget);
  assert.ok(r.warnings.some(w => w.code === 'over-budget'));
});

test('a locked adversary above the party tier is kept with a warning, never silently dropped or rescaled', () => {
  const r = run({ tier: 1, locked: ['elephant'], seed: 1 });
  const e = r.adversaries.find(a => a.id === 'elephant');
  assert.ok(e && e.tier === 2 && e.crossTier === 'higher');
  assert.ok(r.warnings.some(w => w.code === 'locked-higher-tier'));
});

/* ---------------- determinism ---------------- */

test('the same seed reproduces the same encounter exactly; the seed is echoed', () => {
  for (const seed of ['alpha', 42, 'omega']) {
    const a = run({ seed }), b = run({ seed });
    assert.deepEqual(a, b);
    assert.equal(a.input.seed, seed);
  }
});

/* ---------------- outcome-specific behaviour ---------------- */

test('combat posture follows the Darkheart outcome', () => {
  const posture = o => run({ outcome: o, seed: 1 });
  assert.equal(posture('creature-fail-fear').combat, 'recommended');
  assert.ok(posture('creature-fail-fear').adversaries.length >= 1);
  const neutral = posture('creature-fail-hope');
  assert.equal(neutral.combat, 'prepared');
  assert.ok(neutral.adversaries.length >= 1 && neutral.adversaries.length <= 2, 'one or two sets of stats ready, combat not forced');
  assert.ok(neutral.reasoning.some(x => x.code === 'combat-prepared'));
  for (const o of ['creature-success-fear', 'hazard-fail-fear', 'hazard-fail-hope', 'resource-success-fear']) {
    assert.equal(posture(o).combat, 'optional', o);
  }
});

test('noncombat outcomes introduce no adversaries unless the Master locks some', () => {
  for (const o of ['creature-success-hope', 'landmark-fail-fear', 'landmark-fail-hope', 'landmark-success-fear', 'landmark-success-hope', 'resource-success-hope']) {
    const r = run({ outcome: o, seed: 1 });
    assert.equal(r.status, 'none', o);
    assert.equal(r.combat, 'none');
    assert.deepEqual(r.adversaries, []);
    assert.equal(r.battlePoints.spent, 0);
    const locked = run({ outcome: o, seed: 1, locked: ['dire-wolf'] });
    assert.deepEqual(locked.adversaries.map(a => a.id), ['dire-wolf']);
    assert.ok(locked.warnings.some(w => w.code === 'locked-no-combat'));
  }
});

test('optional outcomes never reach for role fillers', () => {
  for (const o of ['hazard-fail-hope', 'resource-success-fear', 'creature-success-fear']) {
    for (const environmentId of ['hunter-or-hunted', 'root-rush-rescue', 'cauldera-valley']) {
      const r = run({ outcome: o, environmentId, seed: 9 });
      assert.ok(r.adversaries.every(a => a.source !== 'role-filler'), `${o}/${environmentId}`);
    }
  }
});

test('a feature fragment is resolved against the environment; an unknown one is ignored with a note', () => {
  const real = environments.find(e => e.id === 'gnarled-glen').features[0].name.en;
  const r = run({ environmentId: 'gnarled-glen', featureNames: [real, 'Not A Feature'], seed: 1 });
  assert.deepEqual(r.input.featureNames, [real]);
  assert.ok(r.warnings.some(w => w.code === 'unknown-fragment-feature'));
});

/* ---------------- bilingual text ---------------- */

test('every sentence the engine returns is bilingual', () => {
  const r = run({ tier: 2, environmentId: 'gnarled-glen', locked: ['no-such'], seed: 1 });
  const texts = [...r.reasoning, ...r.warnings].map(x => x.text);
  assert.ok(texts.length > 3);
  for (const t of texts) {
    assert.ok(t.en && t.ru, JSON.stringify(t));
    assert.ok(/[Ѐ-ӿ]/.test(t.ru), `Russian text has Cyrillic: ${t.ru}`);
  }
});

/* ---------------- purity: no campaign state ---------------- */

function deepFreeze(o) { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; }

test('the engine never mutates its input or catalogues and carries no campaign state', () => {
  const input = deepFreeze({ tier: 2, partySize: 4, difficulty: 'harder', outcome: 'creature-fail-fear', environmentId: 'gnarled-glen', locked: [{ id: 'bear' }], featureNames: [], seed: 'p' });
  const frozenCtx = E.createContext(deepFreeze(JSON.parse(JSON.stringify(adversaries))), deepFreeze(JSON.parse(JSON.stringify(environments))));
  const before = JSON.stringify(input);
  const r = E.assembleEncounter(input, frozenCtx);
  assert.equal(JSON.stringify(input), before);
  assert.notEqual(r.status, 'invalid');
  const flat = JSON.stringify(r).toLowerCase();
  for (const word of ['forestdifficulty', 'forest_difficulty', 'gmfear', 'gm_fear', 'countdown', 'expedition']) {
    assert.equal(flat.includes(word), false, `result mentions ${word}`);
  }
  assert.deepEqual(Object.keys(r).sort(), ['adversaries', 'battlePoints', 'builder', 'combat', 'component', 'input', 'reasoning', 'schema', 'status', 'warnings']);
});

test('no browser state is touched', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/darkheart-encounter.js'), 'utf8');
  for (const forbidden of ['localStorage', 'sessionStorage', 'SafeStorage', 'document.', 'window.', 'fetch(', 'XMLHttpRequest']) {
    assert.equal(src.includes(forbidden), false, forbidden);
  }
});

/* ---------------- Encounter Builder payload ---------------- */

test('Open in Encounter Builder: canonical names and quantities through the single encoder', () => {
  const r = run({ locked: [{ id: 'dire-wolf', quantity: 2 }], seed: 1 });
  assert.ok(r.builder.entries.some(e => e.name === 'Dire Wolf' && e.quantity === 2));
  assert.deepEqual(r.builder.unsupported, []);
  const url = E.encounterBuilderUrl(r, 'Wolf hunt', ctx);
  const payload = JSON.parse(Buffer.from(decodeURIComponent(url.split('data=')[1]), 'base64').toString('utf8'));
  assert.equal(payload.n, 'Wolf hunt');
  assert.equal(payload.d.find(d => d.n === 'Dire Wolf').q, 2);
  assert.equal(E.encounterBuilderUrl(run({ outcome: 'landmark-success-hope' }), 'x', ctx), null);
});

/* ---------------- no regression to Prep ---------------- */

test('Prep exports are unchanged: without quantities every adversary is still q:1', () => {
  const url = FCG.buildFreshCutGrassEncounterUrl('Prep', ['Bear', 'Dire Wolf']);
  const payload = JSON.parse(Buffer.from(decodeURIComponent(url.split('data=')[1]), 'base64').toString('utf8'));
  assert.deepEqual(payload.d.map(d => d.q), [1, 1]);
  assert.deepEqual(payload, { n: 'Prep', d: [{ n: 'Bear', a: '', q: 1, u: 0, i: [{ n: null }] }, { n: 'Dire Wolf', a: '', q: 1, u: 0, i: [{ n: null }] }] });
  const junk = FCG.buildFreshCutGrassEncounterUrl('Prep', ['Bear'], [0]);
  assert.equal(JSON.parse(Buffer.from(decodeURIComponent(junk.split('data=')[1]), 'base64').toString('utf8')).d[0].q, 1);
});

test('Prep Battle Points arithmetic is untouched (known cases)', () => {
  const r = BP.calculate({ pcs: 4, entries: ['bruiser', 'standard', { type: 'minion', quantity: 4 }], style: 'dangerous' });
  assert.equal(r.available, 14 + 2);
  assert.equal(r.spent, 4 + 2 + 1);
  assert.equal(BP.TYPE_COST.solo, 5);
});

test('the engine ships as a runtime script, loaded before the composer that uses it', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const at = name => html.indexOf(`<script src="js/${name}.js"`);
  assert.ok(at('battle-points') > -1 && at('darkheart-encounter') > at('battle-points') && at('darkheart-encounter') > at('potential-adversary-utils'));
  assert.ok(at('darkheart-composer') > at('darkheart-encounter'));
  assert.ok(at('darkheart-view') > at('darkheart-composer') && at('darkheart-view') < at('app'));
});

test('the affinity layer is small, explicit, and every theme and id in it is real', () => {
  const ids = new Set(adversaries.map(a => a.id));
  for (const id of Object.keys(affinity.adversaries)) assert.ok(ids.has(id), id);
  for (const theme of Object.keys(affinity.themes)) {
    assert.ok(Object.values(affinity.adversaries).some(list => list.includes(theme)), `theme ${theme} classifies nothing`);
    for (const r of affinity.themes[theme].related) assert.ok(affinity.themes[r], `${theme} -> ${r}`);
  }
  assert.ok(Object.keys(affinity.themes).length <= 10 && Object.keys(affinity.adversaries).length <= 130, 'not a taxonomy of the bestiary');   // PD-104: 100 -> 130 for the humanoid `folk` theme (neutral meetings)
});

/* ---------------- PD-099: scene/outcome consistency at the composition boundary ---------------- */

test('a scene can only be dealt for outcomes its manifest maps; no outcome makes a fragment a hostile creature', () => {
  for (const outcome of D.OUTCOME_KEYS) {
    for (const scene of Composer.eligibleScenes(scenes, outcome)) {
      assert.ok(scene.outcomes.some(o => o.outcome === outcome), `${scene.id} dealt for ${outcome}`);
    }
  }
  const glen = Composer.eligibleScenes(scenes, 'creature-fail-fear').map(x => x.id);
  assert.ok(!glen.includes('gnarled-glen-lingering-souls'), 'the Gnarled Glen landmark/resource fragment is never a creature scene');
  assert.deepEqual(sceneById('gnarled-glen-lingering-souls').outcomes.map(o => o.outcome).sort(), ['landmark-fail-fear', 'resource-success-hope']);
});

test('the encounter is refused for an outcome the scene does not map, whatever the engine would do', () => {
  const direct = E.assembleEncounter({ tier: 1, partySize: 4, outcome: 'creature-fail-fear', environmentId: 'gnarled-glen', scene: { adversaries: 'none', themes: [] }, seed: 1 }, ctx);
  assert.ok(direct.status !== 'invalid', 'the low-level engine stays a reusable tool and accepts it');
  const blocked = forScene('gnarled-glen-lingering-souls', { outcome: 'creature-fail-fear' });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.code, 'scene-outcome-mismatch');
  assert.deepEqual(blocked.adversaries, []);
  for (const tier of [1, 2, 3, 4]) assert.notEqual(forScene('hunter-or-hunted-wolf-ground', { tier }).status, 'blocked', 'a scene is dealt at every party tier');
  for (const o of D.OUTCOME_KEYS) {
    const r = forScene('briar-thicket-tangled-way', { outcome: o });
    if (o !== 'hazard-fail-hope') assert.equal(r.status, 'blocked', o);
  }
});

test('the landmark and resource outcomes of Gnarled Glen produce no hostile encounter', () => {
  for (const outcome of ['landmark-fail-fear', 'resource-success-hope']) {
    const r = forScene('gnarled-glen-lingering-souls', { outcome });
    assert.equal(r.status, 'none');
    assert.equal(r.combat, 'none');
    assert.deepEqual(r.adversaries, []);
  }
});

/* ---------------- PD-099: narrative coherence ---------------- */

test('a wolf hunt is wolves: no bears, snakes or boars to spend the budget', () => {
  for (const heroes of [3, 4, 5, 6]) for (const seed of ['a', 'b', 'c']) {
    const r = forScene('hunter-or-hunted-wolf-ground', { heroes, seed });
    assert.ok(r.adversaries.length > 0);
    assert.ok(r.adversaries.every(a => a.id === 'dire-wolf'), `${heroes}/${seed}: ${r.adversaries.map(a => a.id)}`);
    assert.ok(r.battlePoints.spent <= r.battlePoints.available);
  }
  const big = forScene('hunter-or-hunted-wolf-ground', { heroes: 6 });
  assert.equal(big.status, 'partial', 'wolves alone cannot honestly spend a six-hero budget');
  assert.ok(big.warnings.some(w => w.code === 'insufficient-thematic-candidates'));
});

test('adversaries whose source material the fragment leaves out are not assumed to fit', () => {
  // Faestone Wode lists Swarm of Rats, but the shown fragment is about the stones and their sylvan defenders.
  const faestone = sceneById('faestone-wode-guarded-lore');
  const env = environments.find(e => e.id === 'faestone-wode');
  assert.ok(/Swarm of Rats/.test(env.potential_adversaries.en.join()));
  const r = forScene('faestone-wode-guarded-lore', { seed: 'x' });
  assert.ok(r.adversaries.length > 0);
  assert.ok(r.adversaries.every(a => (affinity.adversaries[a.id] || []).includes('sylvan')), r.adversaries.map(a => a.id).join());
  assert.ok(!r.adversaries.some(a => a.id === 'swarm-of-rats'));
  // Mother o' Gold hides its list entirely: only what its sylvan theme claims comes back.
  const gold = forScene('mother-o-gold-golden-judge', { seed: 'x' });
  assert.ok(gold.adversaries.every(a => (affinity.adversaries[a.id] || []).includes('sylvan')));
  assert.ok(faestone.excluded.length > 0);
});

test('a scene that declares no theme gets no suggested enemies, not random ones', () => {
  for (const id of ['root-rush-rescue-race', 'briar-thicket-snapping-vines', 'underroot-tunnels-root-blockage']) {
    const scene = sceneById(id);
    for (const o of scene.outcomes) {
      const r = forScene(id, { outcome: o.outcome });
      assert.deepEqual(r.adversaries, [], `${id}/${o.outcome}`);
    }
  }
  const noTheme = forScene('root-rush-rescue-race');
  assert.ok(noTheme.warnings.some(w => w.code === 'no-encounter-theme' || w.code === 'no-candidates'));
});

test('real scenes: BP, tiers and determinism still hold through the boundary', () => {
  for (const id of ['hunter-or-hunted-wolf-ground', 'faestone-wode-guarded-lore', 'mother-o-gold-golden-judge']) {
    const a = forScene(id, { seed: 'z' }), b = forScene(id, { seed: 'z' });
    assert.deepEqual(a, b);
    assert.equal(a.battlePoints.spent, recompute(a).spent);
    for (const x of a.adversaries) assert.ok(x.tier <= a.input.tier && x.tier >= a.input.tier - 1);
  }
});

test('the neutral outcome never forces a fight and the optional ones stay thematic', () => {
  assert.equal(forScene('mother-o-gold-golden-judge').combat, 'prepared');
  assert.equal(forScene('faestone-wode-guarded-lore').combat, 'optional');
  assert.ok(forScene('faestone-wode-guarded-lore').adversaries.every(a => a.source !== 'role-filler'));
});
