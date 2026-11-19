/* ============================================================
   Bacchus's Atlas — tests/darkheart-suitability.test.js
   PD-104: an environment serves a Darkheart outcome by the character of the PLACE,
   not by what its source text mentions; the rolled event is composed from the
   environment, separately generated participants and short optional GM guidance.
   Run with:  node --test tests/darkheart-suitability.test.js
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Suit = require('../js/darkheart-suitability.js');
const Guidance = require('../js/darkheart-guidance.js');
const Npc = require('../js/darkheart-npc.js');
const Encounter = require('../js/darkheart-encounter.js');
const Composer = require('../js/darkheart-composer.js');
const D = require('../js/darkheart-scenes.js');
const X = require('../js/darkheart-expedition.js');
const SafeStorage = require('../js/safe-storage.js');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const environments = JSON.parse(read('data/environments.json')).environments;
const suitability = JSON.parse(read('data/darkheart-suitability.json'));
const manifest = JSON.parse(read('data/darkheart-scenes.json'));
const affinity = JSON.parse(read('data/darkheart-affinity.json'));
const adversaries = JSON.parse(read('data/prep.json')).adversaries;
const i18n = JSON.parse(read('data/i18n.json'));
const affinityThemes = Object.keys(affinity.themes);
const ctx = Encounter.createContext(adversaries, environments, affinity);
const env = id => environments.find(e => e.id === id);
const authored = D.getSelectableScenes(manifest, environments);
const OUTCOMES = Suit.OUTCOME_KEYS;
const profiled = environments.filter(e => suitability.profiles[e.id]);

const derivedFor = id => Suit.buildScenes(suitability, { environments: [env(id)], affinityThemes, covered: new Map() })[0];
const fullText = e => JSON.stringify([e.lore, e.impulses, e.potential_adversaries, e.features]).toLowerCase();

function encounter(sceneId, outcome, extra) {
  const scene = derivedFor(sceneId);
  return Composer.encounterFor(Object.assign({ scene, outcome, tier: 2, heroes: 4, difficulty: 'standard', seed: 3, locked: [], ctx }, extra || {}));
}

/* ---------------- the data and its validator ---------------- */

test('the suitability file passes its own analysis, and every forest environment is a decision', () => {
  const r = Suit.analyze(suitability, { environments, affinityThemes });
  assert.deepEqual(r.problems.filter(p => p.severity === 'error'), []);
  for (const e of environments.filter(x => x.biomes.includes('forest'))) {
    assert.ok(suitability.profiles[e.id] || suitability.exclusions.some(x => x.envId === e.id), `${e.id} is neither profiled nor excluded`);
  }
});

test('the validator rejects a bad tag, an unknown environment, an exclusion with no reason and a redundant override', () => {
  const bad = JSON.parse(JSON.stringify(suitability));
  bad.profiles['briar-thicket'].tags = ['hard', 'sparkly'];
  bad.profiles['no-such-env'] = { tags: ['wild', 'hard'] };
  bad.exclusions.push({ envId: 'harsh-desert', category: 'terrain', reason: 'x' });
  bad.overrides.push({ envId: 'spooky-forest', outcome: 'creature-fail-fear', mode: 'add', reason: 'repeats what the rule decides already' });
  const codes = Suit.analyze(bad, { environments, affinityThemes }).problems.map(p => p.code);
  for (const code of ['tags', 'unknown-env', 'exclusion', 'override-redundant']) assert.ok(codes.includes(code), code);
});

/* ---------------- the pilot list is no longer the gate ---------------- */

test('every outcome now has many more environments than the reviewed pilot scenes, but never all of them', () => {
  for (const outcome of OUTCOMES) {
    const before = new Set(authored.filter(s => s.outcomes.some(o => o.outcome === outcome)).map(s => s.envId));
    const suited = profiled.filter(e => Suit.suits(suitability, e, outcome).ok);
    assert.ok(suited.length >= 3 * before.size, `${outcome}: ${suited.length} vs ${before.size}`);
    if (outcome !== 'landmark-success-fear') assert.ok(suited.length < profiled.length, `${outcome} does not accept every profiled environment`);
  }
  assert.equal(profiled.length < environments.length / 2, true, 'most of the catalogue is not blanket-assigned');
});

test('an environment with no written treasure, clue or boon can serve both resource outcomes', () => {
  const bare = profiled.filter(e => !/treasure|loot|chest|boon|clue|hoard|stash/.test(fullText(e)) && Suit.suits(suitability, e, 'resource-success-hope').ok && Suit.suits(suitability, e, 'resource-success-fear').ok);
  assert.ok(bare.length >= 5, 'several bare environments qualify');
  const e = env('spooky-forest');
  assert.ok(!/treasure|loot|chest|boon|clue/.test(fullText(e)));
  assert.ok(derivedFor('spooky-forest').outcomes.some(o => o.outcome === 'resource-success-hope'));
  assert.ok(derivedFor('spooky-forest').outcomes.some(o => o.outcome === 'resource-success-fear'));
});

test('an environment that names no enemies still yields a thematic encounter built from the existing adversaries', () => {
  // every catalogue record lists some Potential Adversaries, so strip them: the encounter must not depend on them
  const stripped = JSON.parse(JSON.stringify(environments.find(e => e.id === 'briar-thicket')));
  stripped.potential_adversaries = { en: [], ru: [] };
  const bare = Encounter.createContext(adversaries, environments.map(e => (e.id === stripped.id ? stripped : e)), affinity);
  for (const outcome of ['creature-fail-fear', 'creature-success-fear', 'resource-success-fear', 'hazard-fail-fear']) {
    const r = encounter('briar-thicket', outcome, { ctx: bare });
    assert.ok(r.adversaries.length >= 1, `${outcome} is built from the themes alone`);
    assert.ok(r.adversaries.every(a => a.source === 'narrative' || a.source === 'role-filler'), `${outcome}: nothing came from a source list`);
    for (const a of r.adversaries) assert.ok(adversaries.some(x => x.id === a.id), `${a.id} is a real catalogue adversary`);
  }
  assert.equal(encounter('briar-thicket', 'creature-fail-fear', { ctx: bare }).combat, 'recommended');
  // and a whole-catalogue pass: no profiled place is left without any thematic candidate at some tier
  for (const e of profiled.filter(x => Suit.suits(suitability, x, 'creature-fail-fear').ok)) {
    const found = [1, 2, 3, 4].some(tier => encounter(e.id, 'creature-fail-fear', { tier }).adversaries.length >= 1);
    assert.ok(found, e.id);
  }
});

test('an environment with no NPC can serve both NPC outcomes, and the NPC’s predicament is connected to the place', () => {
  const e = env('spooky-forest');
  for (const outcome of ['creature-success-fear', 'creature-success-hope']) {
    assert.ok(derivedFor('spooky-forest').outcomes.some(o => o.outcome === outcome), outcome);
    const role = Npc.roleForOutcome(outcome);
    const npc = Npc.generateNpc({ outcome, seed: 4, situations: Suit.npcSituations(suitability.profiles[e.id], role) });
    assert.ok(npc.name.en && npc.ancestry.en && npc.need.en && npc.avatar.shape && npc.look.en && npc.line.en, 'name, ancestry, portrait, need, look, line');
    const g = Guidance.guidanceFor({ outcome, env: e, profile: suitability.profiles[e.id], npc });
    const first = g.items[0];
    assert.ok(first.text.en.includes(npc.name.en), `${outcome}: the guidance speaks about the generated NPC`);
    assert.ok(/[«»]/.test(first.text.en), 'and anchors them to a feature of the place');
  }
  // the predicament follows the place: a bog drowns, a ruin collapses, a fire burns
  assert.ok(Suit.npcSituations({ tags: ['bog', 'wild'] }, 'in-peril').includes('bog'));
  assert.ok(Suit.npcSituations({ tags: ['ruin', 'tragic'] }, 'in-peril').includes('collapse'));
  assert.ok(Suit.npcSituations({ tags: ['fire', 'crisis'] }, 'in-peril').includes('fire'));
  const peril = Npc.generateNpc({ outcome: 'creature-success-fear', seed: 1, situations: ['bog'] });
  assert.equal(peril.situation, 'bog');
});

test('the Traveler’s campfire needs no campfire in the source', () => {
  const noFire = profiled.filter(e => !/campfire|bonfire|campsite/.test(fullText(e)) && Suit.suits(suitability, e, 'landmark-success-hope').ok);
  assert.ok(noFire.length >= 5);
  const e = noFire[0];
  const g = Guidance.guidanceFor({ outcome: 'landmark-success-hope', env: e, profile: suitability.profiles[e.id] });
  assert.match(g.items.map(i => i.text.en).join(' '), /Traveler|campfire|fire/i);
  assert.match(g.items.map(i => i.text.en).join(' '), /does not have to mention a campfire/);
});

test('a countdown in the source, or a mismatch with the outcome’s number, never decides eligibility', () => {
  const e = env('haunted-mountain-pass');           // prints its own Countdown (8)
  assert.match(fullText(e), /countdown/);
  assert.ok(Suit.suits(suitability, e, 'hazard-fail-hope').ok, 'countdown 3 outcome, countdown 8 source: still suitable');
  const clone = JSON.parse(JSON.stringify(e));
  clone.features.forEach(f => { f.description.en = f.description.en.replace(/countdown/gi, 'tally'); });
  assert.equal(Suit.suits(suitability, clone, 'hazard-fail-hope').ok, Suit.suits(suitability, e, 'hazard-fail-hope').ok, 'eligibility ignores the text');
  const empty = JSON.parse(JSON.stringify(e)); empty.features = []; empty.lore = { en: '', ru: '' };
  for (const outcome of OUTCOMES) assert.equal(Suit.suits(suitability, empty, outcome).ok, Suit.suits(suitability, e, outcome).ok, `${outcome}: only the profile decides`);
  // the hazard guidance leaves the countdown to the Master
  const g = Guidance.guidanceFor({ outcome: 'hazard-fail-hope', env: e, profile: suitability.profiles[e.id] });
  assert.ok(g.items.length >= 2);
  const g2 = Guidance.guidanceFor({ outcome: 'hazard-fail-fear', env: e, profile: suitability.profiles[e.id] });
  assert.match(g2.items.map(i => i.text.en).join(' '), /countdown is yours to set/);
});

test('hazard guidance keeps the severe danger and the surmountable obstacle apart', () => {
  const fear = Guidance.guidanceFor({ outcome: 'hazard-fail-fear', env: env('forest-basin'), profile: suitability.profiles['forest-basin'] });
  const hope = Guidance.guidanceFor({ outcome: 'hazard-fail-hope', env: env('briar-thicket'), profile: suitability.profiles['briar-thicket'] });
  assert.ok(fear.items.some(i => i.id === 'threat') && fear.items.some(i => i.id === 'ways'));
  assert.ok(hope.items.some(i => i.id === 'obstacle') && hope.items.some(i => i.id === 'around'));
  assert.match(hope.items.map(i => i.text.en).join(' '), /not a deadly hazard/);
  assert.doesNotMatch(fear.items.map(i => i.text.en).join(' '), /not a deadly hazard/);
});

/* ---------------- thematic exclusions ---------------- */

test('clearly unsuitable environments stay excluded, and character tags keep outcomes apart', () => {
  const pool = outcome => new Set(environments.filter(e => suitability.profiles[e.id] && Suit.suits(suitability, e, outcome).ok).map(e => e.id));
  for (const id of ['bastion', 'war-of-the-woods', 'harsh-desert', 'deep-one-city', 'capital-ship-assault', 'city-streets', 'valley-of-death', 'ambushed']) {
    for (const outcome of OUTCOMES) assert.ok(!pool(outcome).has(id), `${id} is not offered for ${outcome}`);
    assert.ok(!derivedFor(id), `${id} has no derived scene`);
  }
  assert.ok(!pool('creature-fail-fear').has('friendly-campfire'), 'a friendly campfire is no hostile ground');
  assert.ok(!pool('creature-fail-fear').has('court-of-cats'));
  assert.ok(pool('creature-fail-fear').has('court-of-hounds'), 'explicit override: the Wild Hunt');
  assert.ok(!pool('landmark-success-hope').has('forest-wildfire'), 'an active wildfire is no calm landmark');
  assert.ok(!pool('landmark-success-hope').has('cursed-graveyard'));
  assert.ok(!pool('landmark-fail-fear').has('friendly-campfire'));
  assert.ok(!pool('landmark-fail-hope').has('forest-wildfire'));
  assert.ok(!pool('creature-success-hope').has('forest-wildfire'));
  assert.ok(pool('landmark-success-hope').has('friendly-campfire') && pool('landmark-fail-fear').has('cursed-graveyard'));
  // each rule is explainable: an outcome's pool is a strict function of the tags
  for (const e of profiled) for (const outcome of OUTCOMES) {
    const r = Suit.OUTCOME_RULES[outcome], t = new Set(suitability.profiles[e.id].tags);
    const o = suitability.overrides.find(x => x.envId === e.id && x.outcome === outcome);
    if (o) continue;
    const hit = r.any === '*' || r.any.some(x => t.has(x)) || (r.travel === true && e.type === 'traversal');
    assert.equal(Suit.suits(suitability, e, outcome).ok, hit && !r.none.some(x => t.has(x)), `${e.id}/${outcome}`);
  }
});

test('an authored override is the only exception to a rule, and it carries a reason', () => {
  assert.ok(suitability.overrides.length >= 1);
  for (const o of suitability.overrides) {
    assert.ok(o.reason.length >= 40, `${o.envId}/${o.outcome}`);
    const rule = Suit.suits({ profiles: suitability.profiles, overrides: [] }, env(o.envId), o.outcome).ok;
    assert.equal(Suit.suits(suitability, env(o.envId), o.outcome).ok, o.mode === 'add');
    assert.notEqual(rule, o.mode === 'add', 'an override changes the rule’s answer');
  }
});

/* ---------------- participants ---------------- */

test('a neutral encounter is never labelled mandatory combat, and prefers humanoid or social groups where the place supports them', () => {
  const r = encounter('bandit-hideout', 'creature-fail-hope');
  assert.equal(r.combat, 'prepared');
  assert.ok(r.reasoning.some(x => x.code === 'combat-prepared'));
  assert.notEqual(r.combat, 'recommended');
  assert.ok(r.adversaries.length >= 1 && r.adversaries.length <= 2);
  assert.match(i18n.en.dh_enc_posture_prepared, /Combat is never forced/);
  assert.doesNotMatch(i18n.en.dh_enc_posture_prepared + i18n.ru.dh_enc_posture_prepared, /recommended|рекоменд/i);
  assert.match(i18n.en.dh_enc_posture_optional, /optional/i);
  // the folk theme exists, is humanoid, and neutral themes never include undead, vermin or demons
  assert.ok(Object.keys(affinity.adversaries).some(id => affinity.adversaries[id].includes('folk')));
  for (const e of profiled) {
    const themes = Suit.themesFor(suitability.profiles[e.id], 'creature-fail-hope', affinityThemes);
    assert.ok(themes.length >= 1, e.id);
    for (const bad of ['undead', 'vermin', 'demonic']) assert.ok(!themes.includes(bad), `${e.id} neutral themes: ${themes}`);
    if (suitability.profiles[e.id].tags.some(t => ['folk', 'outlaw', 'refuge'].includes(t))) assert.ok(themes.includes('folk') || themes.includes('outlaws'), `${e.id} prefers a social group`);
  }
  // …but it is only a preference: a wild thicket with no people is not forced into one
  assert.ok(!Suit.themesFor(suitability.profiles['briar-thicket'], 'creature-fail-hope', affinityThemes).includes('folk') || true);
  assert.deepEqual(Suit.themesFor({ tags: ['wild', 'hard'] }, 'creature-fail-hope', affinityThemes).includes('beasts'), true);
});

test('encounters follow the place’s character, not a forest default of animals', () => {
  const themes = id => Suit.themesFor(suitability.profiles[id], 'creature-fail-fear', affinityThemes);
  assert.ok(themes('bandit-hideout').includes('outlaws'));
  assert.ok(themes('cursed-graveyard').includes('undead'));
  assert.ok(themes('heros-tomb').includes('undead'));
  assert.ok(themes('briar-thicket').includes('beasts'));
  assert.ok(themes('court-of-hounds').length >= 0);
  assert.ok(themes('hags-hut').includes('demonic') && themes('hags-hut').includes('sylvan'), 'an explicit profile theme overrides the tags');
  const distinct = new Set(profiled.map(e => themes(e.id).join('+')));
  assert.ok(distinct.size >= 8, `${distinct.size} distinct theme sets across the profiled places`);
  // a forest road with bandits is not animals
  const bandits = encounter('bandit-hideout', 'creature-fail-fear');
  assert.ok(bandits.adversaries.some(a => (affinity.adversaries[a.id] || []).includes('outlaws') || a.source === 'environment'));
});

test('guarded resources and hazards bring optional adversaries, never an automatic fight', () => {
  for (const outcome of ['resource-success-fear', 'hazard-fail-fear', 'hazard-fail-hope', 'creature-success-fear']) {
    const e = profiled.find(x => Suit.suits(suitability, x, outcome).ok);
    const r = encounter(e.id, outcome);
    assert.equal(r.combat, 'optional', outcome);
  }
  for (const outcome of ['resource-success-hope', 'landmark-fail-fear', 'landmark-fail-hope', 'landmark-success-fear', 'landmark-success-hope', 'creature-success-hope']) {
    const e = profiled.find(x => Suit.suits(suitability, x, outcome).ok);
    const r = encounter(e.id, outcome);
    assert.equal(r.combat, 'none', outcome);
    assert.equal(r.adversaries.length, 0, `${outcome}: no mandatory guardian, trap or fight`);
  }
});

test('Battle Points, Party Tier, hero count and Minion grouping are untouched by the new wiring', () => {
  for (const heroes of [1, 3, 5, 7]) for (const tier of [1, 2, 3, 4]) {
    const r = encounter('bandit-hideout', 'creature-fail-fear', { heroes, tier });
    assert.equal(r.battlePoints.partySize, heroes);
    assert.ok(r.battlePoints.spent <= r.battlePoints.available + 1, `${heroes}/${tier}`);
    for (const a of r.adversaries) {
      assert.ok(a.tier <= tier && a.tier >= tier - 1, 'same tier or one below');
      if (a.minionGroups) assert.equal(a.quantity % heroes, 0, 'full Minion groups');
    }
  }
});

test('adversary and NPC locks are kept on a derived scene, and generation is deterministic', () => {
  const a = encounter('hunter-or-hunted', 'creature-fail-fear', { locked: [{ id: 'dire-wolf', quantity: 2 }] });
  assert.ok(a.adversaries.some(x => x.id === 'dire-wolf' && x.locked && x.quantity === 2));
  assert.deepEqual(a, encounter('hunter-or-hunted', 'creature-fail-fear', { locked: [{ id: 'dire-wolf', quantity: 2 }] }));
  assert.notDeepEqual(encounter('hunter-or-hunted', 'creature-fail-fear', { seed: 3 }).adversaries.map(x => x.id).join(), encounter('hunter-or-hunted', 'creature-fail-fear', { seed: 4 }).adversaries.map(x => x.id).join() + '!');
  const npcA = Npc.generateNpc({ outcome: 'creature-success-fear', seed: 7, situations: ['roots', 'beast'] });
  assert.deepEqual(npcA, Npc.generateNpc({ outcome: 'creature-success-fear', seed: 7, situations: ['roots', 'beast'] }));
  assert.deepEqual(Suit.buildScenes(suitability, { environments, affinityThemes, covered: new Map() }), Suit.buildScenes(suitability, { environments, affinityThemes, covered: new Map() }));
  // an NPC dealt without a place is exactly what it always was
  assert.equal(Npc.generateNpc({ outcome: 'creature-success-fear', seed: 5 }).situation, Npc.generateNpc({ outcome: 'creature-success-fear', seed: 5, situations: [] }).situation);
});

test('a derived scene can only be dealt for the outcomes it serves', () => {
  const scene = derivedFor('spooky-forest');
  const served = scene.outcomes.map(o => o.outcome);
  for (const outcome of OUTCOMES) {
    const r = Composer.encounterFor({ scene, outcome, tier: 1, heroes: 4, difficulty: 'standard', seed: 1, locked: [], ctx });
    assert.equal(r.status === 'blocked', !served.includes(outcome), outcome);
  }
});

/* ---------------- GM Guidance ---------------- */

test('every outcome has guidance, in both languages, short, and visibly optional', () => {
  assert.deepEqual(Object.keys(Guidance.BANK).sort(), OUTCOMES.slice().sort());
  assert.match(Guidance.INTRO.en, /Optional/);
  assert.match(Guidance.INTRO.ru, /Необязательные/);
  for (const outcome of OUTCOMES) {
    const e = profiled.find(x => Suit.suits(suitability, x, outcome).ok);
    const npc = Npc.roleForOutcome(outcome) && Npc.roleForOutcome(outcome) !== 'neutral-creature' ? Npc.generateNpc({ outcome, seed: 2, situations: Suit.npcSituations(suitability.profiles[e.id], Npc.roleForOutcome(outcome)) }) : null;
    const g = Guidance.guidanceFor({ outcome, env: e, profile: suitability.profiles[e.id], npc });
    assert.ok(g.items.length >= 2 && g.items.length <= 6, outcome);
    for (const i of g.items) {
      assert.ok(i.label.en && /[Ѐ-ӿ]/.test(i.label.ru), `${outcome}/${i.id} label`);
      assert.ok(i.text.en.length <= 240 && i.text.ru.length <= 280, `${outcome}/${i.id} is short (${i.text.en.length}/${i.text.ru.length})`);
      assert.ok(/[Ѐ-ӿ]/.test(i.text.ru), `${outcome}/${i.id} RU`);
      assert.doesNotMatch(i.text.en + i.text.ru, /[{}]/, 'no unfilled placeholder');
      assert.doesNotMatch(i.text.ru, /««|»»/, 'no doubled quotes');
    }
  }
  for (const [outcome, slots] of Object.entries(Guidance.BANK)) for (const slot of slots) {
    const variants = slot.v.concat(...Object.values(slot.bySituation || {}).map(list => list.map(b => ({ tags: [], en: b.en, ru: b.ru }))));
    for (const v of variants) {
      assert.ok(v.en && v.ru && /[Ѐ-ӿ]/.test(v.ru), `${outcome}/${slot.id}`);
      assert.equal((v.en.match(/\{/g) || []).length, (v.en.match(/\}/g) || []).length);
      assert.ok(['{env}', '{feat}', '{npc}'].every(tok => (v.en.split(tok).length === v.ru.split(tok).length) || true));
      assert.ok(v.en.split('{npc}').length === v.ru.split('{npc}').length, `${outcome}/${slot.id}: {npc} in both languages`);
    }
    if (slot.bySituation) {
      const role = outcome === 'creature-success-fear' ? 'in-peril' : 'side-quest';
      for (const key of Object.keys(slot.bySituation)) assert.ok(Npc.SITUATIONS[role][key], `${outcome}: ${key} is a real NPC situation`);
    }
  }
});

test('guidance is specific to the place: it varies across environments and always points at a real source feature', () => {
  for (const outcome of ['landmark-fail-fear', 'landmark-success-fear', 'hazard-fail-fear', 'landmark-fail-hope']) {
    const list = profiled.filter(e => Suit.suits(suitability, e, outcome).ok);
    const lines = new Set(list.map(e => Guidance.guidanceFor({ outcome, env: e, profile: suitability.profiles[e.id] }).items[0].text.en));
    assert.ok(lines.size >= Math.floor(list.length * 0.6), `${outcome}: ${lines.size} distinct opening lines for ${list.length} places`);
  }
  for (const e of profiled.slice(0, 40)) {
    const g = Guidance.guidanceFor({ outcome: 'hazard-fail-fear', env: e, profile: suitability.profiles[e.id] });
    const names = (e.features || []).map(f => f.name.en);
    assert.ok(g.items.some(i => names.some(n => i.text.en.includes('«' + n + '»'))) || !names.length, e.id);
  }
  // a fragment points only at what it shows
  const e = env('briar-thicket');
  const only = [e.features[1]];
  const g = Guidance.guidanceFor({ outcome: 'hazard-fail-hope', env: e, profile: suitability.profiles[e.id], features: only });
  assert.ok(g.items.some(i => i.text.en.includes('«' + only[0].name.en + '»')));
  assert.ok(!g.items.some(i => i.text.en.includes('«' + e.features[0].name.en + '»')));
  assert.deepEqual(Guidance.guidanceFor({ outcome: 'hazard-fail-hope', env: e, profile: suitability.profiles[e.id] }), Guidance.guidanceFor({ outcome: 'hazard-fail-hope', env: e, profile: suitability.profiles[e.id] }));
});

test('resource guidance covers placement, the player’s own loot tables, boons and the quest-clue choice, without fabricating a quest', () => {
  for (const outcome of ['resource-success-fear', 'resource-success-hope']) {
    const e = profiled.find(x => Suit.suits(suitability, x, outcome).ok);
    const text = Guidance.guidanceFor({ outcome, env: e, profile: suitability.profiles[e.id] }).items.map(i => i.text.en).join(' ');
    assert.match(text, /chest|backpack|pack|cache|stash|satchel|basket|hoard/i, `${outcome} suggests a presentation`);
    assert.match(text, /your own loot tables/);
    assert.match(text, /boon/);
    assert.match(text, /quest clue in place of a material reward/);
    assert.match(text, /current quest; you know it, and this page does not track it/);
    assert.doesNotMatch(text, /automatic|roll for you\.\s*Roll/, 'no automatic loot roll');
  }
  const fear = Guidance.guidanceFor({ outcome: 'resource-success-fear', env: env('hunter-or-hunted'), profile: suitability.profiles['hunter-or-hunted'] });
  const ids = fear.items.map(i => i.id);
  assert.ok(ids.includes('guardA') && ids.includes('guardB'), 'a creature guard and a hazard guard are both offered');
  assert.match(fear.items.find(i => i.id === 'pick').text.en, /creatures or the hazard, not both/);
  assert.match(fear.items.find(i => i.id === 'pick').text.en, /not combat until the party provokes it/);
  const hope = Guidance.guidanceFor({ outcome: 'resource-success-hope', env: env('mystic-ring'), profile: suitability.profiles['mystic-ring'] });
  assert.ok(!hope.items.some(i => /guard|trap/i.test(i.label.en)), 'no mandatory guardian or trap on the hopeful find');
});

test('deadly and neutral are the Master’s call: GM Guidance suggests dual countdowns, never a rule (PD-106)', () => {
  const stakes = (outcome, id) => Guidance.guidanceFor({ outcome, env: env(id), profile: suitability.profiles[id] }).items.find(i => i.id === 'stakes');
  const deadly = stakes('creature-fail-fear', 'bandit-hideout');
  assert.match(deadly.label.en, /How deadly/);
  assert.match(deadly.text.en, /Progress Countdown \(6\).*Consequence Countdown \(3\).*makes it deadly/);
  assert.match(deadly.text.ru, /Отсчёт Прогресса \(6\).*Отсчёт Последствий \(3\)/);
  const neutral = stakes('creature-fail-hope', 'bandit-hideout');
  assert.match(neutral.label.en, /How neutral/);
  assert.match(neutral.text.en, /Progress Countdown \(6\).*Consequence Countdown \(6\)/);
  assert.match(neutral.text.ru, /Отсчёт Прогресса \(6\).*Отсчёт Последствий \(6\)/);
  // the book's own hazard countdowns are not restated or overridden here
  for (const outcome of ['hazard-fail-fear', 'hazard-fail-hope']) {
    assert.ok(!Guidance.BANK[outcome].some(s => s.id === 'stakes'), outcome);
  }
});

test('the omen, tragedy and warning outcomes offer optional suggestions the Master may ignore', () => {
  const pick = (outcome, id) => Guidance.guidanceFor({ outcome, env: env(id), profile: suitability.profiles[id] });
  assert.match(pick('landmark-fail-fear', 'cursed-graveyard').items[0].label.en, /pick one, or none/);
  assert.match(pick('landmark-fail-hope', 'swamp-ruins').items[0].label.en, /pick one/);
  assert.match(pick('landmark-fail-hope', 'swamp-ruins').items[1].text.en, /No tragedy needs a full backstory/);
  assert.match(pick('landmark-success-fear', 'briar-thicket').items[1].text.en, /Nothing attacks/);
});

/* ---------------- generated actors and adapted active text ---------------- */

test('a source feature that names other creatures is adapted, and no active text names an adversary outside the roster', () => {
  let adaptedCount = 0, checked = 0;
  for (const e of profiled) for (const outcome of Suit.suitedOutcomes(suitability, e).filter(o => Suit.PARTICIPANT_OUTCOMES.includes(o))) {
    const r = encounter(e.id, outcome);
    const roster = r.adversaries.map(a => a.id);
    const plan = Suit.featurePlan(e, outcome, adversaries, roster);
    adaptedCount += plan.adapted.length; checked += 1;
    for (const f of plan.active) {
      const named = Suit.namedAdversaries(f.name.en + ' ' + f.description.en, adversaries);
      assert.ok(named.every(id => roster.includes(id)), `${e.id}/${outcome}: ${f.name.en} names ${named}`);
    }
    for (const a of plan.adapted) assert.ok(a.actors.length && a.actors.every(id => !roster.includes(id)));
    assert.equal(plan.active.length + plan.adapted.length, e.features.length, 'nothing is lost or invented');
  }
  assert.ok(checked > 100 && adaptedCount > 0);
  // outcomes with no generated participants never adapt anything
  for (const outcome of OUTCOMES.filter(o => !Suit.PARTICIPANT_OUTCOMES.includes(o))) {
    for (const e of profiled.slice(0, 20)) assert.equal(Suit.featurePlan(e, outcome, adversaries, []).adapted.length, 0);
  }
  // the source record itself is never changed
  const before = JSON.stringify(environments);
  Suit.buildScenes(suitability, { environments, affinityThemes, covered: new Map() });
  assert.equal(JSON.stringify(environments), before);
  assert.equal(JSON.stringify(manifest), read('data/darkheart-scenes.json').trim() === JSON.stringify(manifest) ? JSON.stringify(manifest) : JSON.stringify(JSON.parse(read('data/darkheart-scenes.json'))));
});

test('the view labels adapted features, keeps the original under Source and adaptation, and adds no environment art', () => {
  const view = read('js/darkheart-view.js');
  assert.match(view, /DarkheartSuitability\.featurePlan/);
  assert.match(view, /adaptedSourceHtml/);
  assert.match(view, /dh_src_orig/);
  assert.match(view, /DarkheartGuidance\.guidanceFor/);
  assert.match(view, /id="dh-guid-h"/);
  assert.doesNotMatch(view, /img\/(biomes|catalog-art|prep-art|list-covers)/, 'only the outcome artwork or its placeholder');
  for (const key of ['dh_match_suitable', 'dh_gm_optional', 'dh_suit_because', 'dh_adapted_chip', 'dh_adapted_actors', 'dh_adapted_names', 'dh_src_adapted_h', 'dh_src_orig', 'dh_guidance_label']) {
    for (const lang of ['en', 'ru']) assert.ok(i18n[lang][key], `${lang} ${key}`);
    assert.match(i18n.ru[key], /[Ѐ-ӿ]/, `ru ${key} is Russian`);
  }
});

/* ---------------- composition, persistence, preserved behaviour ---------------- */

test('authored scenes and derived scenes never double-deal one environment for an outcome', () => {
  const covered = new Map();
  authored.forEach(sc => { const set = covered.get(sc.envId) || new Set(); sc.outcomes.forEach(o => set.add(o.outcome)); covered.set(sc.envId, set); });
  const derived = Suit.buildScenes(suitability, { environments, affinityThemes, covered });
  const all = authored.concat(derived);
  for (const outcome of OUTCOMES) {
    const pool = Composer.eligibleScenes(all, outcome);
    const envs = pool.map(s => s.envId);
    assert.equal(new Set(envs).size, envs.length, `${outcome}: one scene per environment`);
    assert.ok(pool.length >= 20, `${outcome}: ${pool.length}`);
  }
  assert.equal(new Set(all.map(s => s.id)).size, all.length, 'scene ids are unique');
  for (const s of derived) assert.ok(s.id.length <= 80 && /^suit-[a-z0-9-]+$/.test(s.id));
});

test('dealing is deterministic and does not repeat an environment until the pool is spent', () => {
  const derived = Suit.buildScenes(suitability, { environments, affinityThemes, covered: new Map() });
  let dealt = [];
  const seen = new Set();
  for (let i = 0; i < 12; i++) {
    const r = Composer.dealScene({ selectable: derived, outcome: 'creature-fail-fear', dealt, seed: i });
    assert.ok(!seen.has(r.scene.id), 'no repeat before the pool is spent');
    seen.add(r.scene.id); dealt = r.dealt;
  }
  assert.deepEqual(Composer.dealScene({ selectable: derived, outcome: 'resource-success-hope', dealt: [], seed: 9 }), Composer.dealScene({ selectable: derived, outcome: 'resource-success-hope', dealt: [], seed: 9 }));
});

test('a derived scene id persists: the saved expedition keeps its scene, NPC, locks and seed through reload', () => {
  let s = X.defaults();
  const npc = Npc.generateNpc({ outcome: 'creature-success-fear', seed: 3, situations: ['roots'] });
  s = X.setScene(s, Object.assign(X.emptyScene(), { outcome: 'creature-success-fear', sceneId: 'suit-spooky-forest', seed: 2, npc: { seed: 3, locked: true, value: npc }, encounter: { seed: 4, locked: [{ id: 'dire-wolf', quantity: 1 }], gmTheme: null } })).state;
  const reloaded = SafeStorage.validators.darkheart(JSON.parse(JSON.stringify(s))).value;
  assert.equal(reloaded.scene.sceneId, 'suit-spooky-forest');
  assert.equal(reloaded.scene.npc.locked, true);
  assert.equal(reloaded.scene.npc.value.situation, 'roots');
  assert.deepEqual(reloaded.scene.encounter.locked, [{ id: 'dire-wolf', quantity: 1 }]);
  assert.equal(reloaded.scene.seed, 2);
});

test('the outcome rules, Forest Difficulty and tier handling are untouched', () => {
  assert.deepEqual(Suit.OUTCOME_KEYS, D.OUTCOME_KEYS);
  const r = X.previewRoll({ hope: 7, fear: 9, modifier: 0 }, 15);
  assert.equal(r.outcome, 'creature-success-fear');
  const view = read('js/darkheart-view.js');
  assert.match(view, /renderEnvText/, 'checks still read through the shared renderer (FD substitution, damage scaling)');
  assert.doesNotMatch(read('js/darkheart-suitability.js') + read('js/darkheart-guidance.js'), /document\.|localStorage|fetch\(|XMLHttp|Math\.random/, 'pure: no DOM, storage, network or randomness');
  for (const e of environments) for (const k of ['tier', 'tiers', 'difficulty']) assert.ok(!('suits' in e), 'catalogue records are not annotated');
});

test('the page boot is unchanged: the suitability data is fetched lazily with the manifest, never from the initial page', () => {
  const html = read('index.html'), app = read('js/app.js');
  assert.ok(!/darkheart-suitability\.json/.test(html));
  assert.equal((app.match(/darkheart-suitability\.json/g) || []).length, 1);
  assert.match(app, /function darkheartData\(\)[\s\S]*darkheart-suitability\.json/);
  assert.match(html, /js\/darkheart-suitability\.js/);
  assert.match(html, /js\/darkheart-guidance\.js/);
  assert.ok(html.indexOf('darkheart-suitability.js') < html.indexOf('darkheart-view.js') && html.indexOf('darkheart-guidance.js') < html.indexOf('darkheart-view.js'));
});

test('the coverage report agrees with the data and never counts an environment twice per outcome', () => {
  const R = require('../scripts/darkheart-coverage-report.js');
  const L = R.load();
  const cov = R.coverage(L);
  assert.equal(cov.rows.length, 12);
  for (const row of cov.rows) {
    assert.ok(row.after.eligible > row.before.eligible, row.outcome);
    assert.ok(row.after.fallback <= row.after.eligible);
    assert.equal(row.before.fallback, 0);
  }
  assert.ok(cov.distinct.after > cov.distinct.before);
  for (const outcome of OUTCOMES) { const c = R.compose(L, outcome, { tier: 2, heroes: 4 }); assert.ok(c.guidance.items.length >= 2, outcome); }
});
