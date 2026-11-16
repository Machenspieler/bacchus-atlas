/* ============================================================
   Bacchus's Atlas — tests/darkheart-playable.test.js
   The first playable Darkheart loop (PD-099): the twelve traversal outcomes from
   the dice, the one-time commit of an arrival, Forest Difficulty and Fear,
   undo/reset/rest, recovery of persisted state, scene dealing and its no-match
   state, the NPC generator, the route and the fifth bookmark, and the i18n of the
   page. Run with:  node --test tests/darkheart-playable.test.js
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const X = require('../js/darkheart-expedition.js');
const Composer = require('../js/darkheart-composer.js');
const Npc = require('../js/darkheart-npc.js');
const D = require('../js/darkheart-scenes.js');
const SafeStorage = require('../js/safe-storage.js');
const RouteUtils = require('../js/route-utils.js');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const environments = JSON.parse(read('data/environments.json')).environments;
const manifest = JSON.parse(read('data/darkheart-scenes.json'));
const i18n = JSON.parse(read('data/i18n.json'));
const scenes = D.getSelectableScenes(manifest, environments);

const roll = (state, hope, fear, modifier = 0) => X.setDice(state, { hope, fear, modifier }).state;
const preview = (hope, fear, modifier = 0, fd = 15) => X.previewRoll({ hope, fear, modifier }, fd);

/* ---------------- the twelve outcomes ---------------- */

const TWELVE = [
  // [hope, fear, outcome]
  [3, 7, 'creature-fail-fear'], [7, 3, 'creature-fail-hope'], [5, 11, 'creature-success-fear'], [11, 5, 'creature-success-hope'],
  [2, 8, 'landmark-fail-fear'], [8, 2, 'landmark-fail-hope'], [6, 12, 'landmark-success-fear'], [12, 6, 'landmark-success-hope'],
  [2, 7, 'hazard-fail-fear'], [7, 2, 'hazard-fail-hope'], [4, 11, 'resource-success-fear'], [11, 4, 'resource-success-hope'],
];

test('dice parity picks the category, success and Hope/Fear pick the outcome — all twelve', () => {
  assert.equal(TWELVE.length, 12);
  assert.deepEqual(TWELVE.map(r => r[2]).sort(), [...D.OUTCOME_KEYS].sort());
  assert.deepEqual([...X.OUTCOME_KEYS].sort(), [...D.OUTCOME_KEYS].sort());
  for (const [h, f, outcome] of TWELVE) {
    const p = preview(h, f);
    assert.equal(p.status, 'ok');
    assert.equal(p.outcome, outcome, `${h}/${f}`);
    assert.equal(p.category, outcome.split('-')[0]);
  }
});

test('the modifier moves the total across the Forest Difficulty; the threshold is inclusive', () => {
  assert.equal(preview(3, 7, 0).success, false);
  assert.equal(preview(3, 7, 5).success, true);       // 15 vs 15
  assert.equal(preview(3, 7, 4).success, false);      // 14
  assert.equal(preview(3, 7, 0, 10).success, true);   // a lower FD
  assert.equal(preview(3, 7, -2).total, 8);
});

test('matching dice are a critical success with Hope, even under the difficulty and with a bad modifier', () => {
  for (const d of [1, 2, 5, 6, 12]) {
    const p = preview(d, d, -20);
    assert.equal(p.critical, true);
    assert.equal(p.success, true);
    assert.equal(p.rolledWith, 'critical');
    assert.equal(p.gainsFear, false);
    assert.match(p.outcome, /-success-hope$/);
  }
  assert.equal(preview(5, 5).outcome, 'creature-success-hope');   // odd/odd keeps its parity
  assert.equal(preview(6, 6).outcome, 'landmark-success-hope');   // even/even
});

test('only a roll with Fear (not a critical) is worth a GM Fear', () => {
  assert.equal(preview(3, 7).gainsFear, true);
  assert.equal(preview(7, 3).gainsFear, false);
  assert.equal(preview(5, 5).gainsFear, false);
});

test('invalid and incomplete input is refused without guessing', () => {
  assert.equal(preview(null, null).status, 'incomplete');
  assert.equal(preview(7, null).status, 'incomplete');
  for (const bad of [[0, 5], [13, 5], [5, 0], [5, 13], [2.5, 5], [-1, 5]]) {
    const p = preview(bad[0], bad[1]);
    assert.equal(p.status, 'invalid', JSON.stringify(bad));
    assert.ok(p.errors.length);
  }
  assert.equal(preview(5, 5, 21).status, 'invalid');
  assert.equal(preview(5, 5, -21).status, 'invalid');
  assert.equal(preview(5, 5, 1.5).status, 'invalid');
  assert.deepEqual(preview(5, 7, '').errors, []);   // a blank modifier is 0
  let s = X.defaults();
  for (const bad of [[0, 5], [5, 99], [4, 9]]) {
    const res = X.confirmArrival(roll(s, ...bad));
    if (bad[0] === 4) continue;
    assert.equal(res.ok, false);
    assert.equal(res.state.hexes, 0);
  }
  assert.equal(X.confirmArrival(X.defaults()).ok, false);   // nothing typed
});

/* ---------------- the playable loop ---------------- */

test('initialize, roll, preview does not change the campaign, confirm exactly once', () => {
  let s = X.defaults();
  assert.deepEqual([s.tier, s.heroes, s.fear, s.fd, s.hexes, s.phase], [1, 4, 0, 15, 0, 'roll']);
  s = roll(s, 3, 7, 1);
  const before = JSON.stringify(s);
  for (let i = 0; i < 5; i++) { preview(3, 7, 1); X.previewRoll(s.dice, s.fd); }
  assert.equal(JSON.stringify(s), before, 'previewing is pure');
  const first = X.confirmArrival(s);
  assert.equal(first.ok, true);
  const arrived = first.state;
  assert.equal(arrived.hexes, 1);
  assert.equal(arrived.fd, 16);
  assert.equal(arrived.fear, 1, 'rolled with Fear');
  assert.equal(arrived.phase, 'arrived');
  const again = X.confirmArrival(arrived);
  assert.equal(again.ok, false, 'a second confirmation is refused');
  assert.equal(again.reason, 'already-arrived');
  assert.equal(again.state.hexes, 1);
  assert.equal(again.state.fd, 16);
  assert.equal(X.setDice(arrived, { hope: 4 }).ok, false, 'the dice are locked after arrival');
  assert.equal(arrived.dice.hope, null, 'the confirmed dice are consumed');
  assert.equal(s.fd, 15, 'confirmArrival never mutates its argument');
});

test('Forest Difficulty rises one per new hex across a sequence and never falls below 15', () => {
  let s = X.defaults();
  for (let n = 1; n <= 5; n++) {
    s = roll(s, 12, 6, 20);           // a success with Hope: no Fear, no penalty
    s = X.confirmArrival(s).state;
    assert.equal(s.fd, 15 + n);
    s = X.nextTraversal(s).state;
  }
  assert.equal(s.hexes, 5);
  assert.equal(X.adjustFd(X.defaults(), -3).ok, false, 'manual correction cannot go below 15');
  assert.equal(X.adjustFd(s, -1).state.fd, 19);
  assert.equal(s.log.length, 5);
});

test('landmarks of a failed roll cost FD or Fear — the players choose', () => {
  const dark = roll(X.defaults(), 2, 8);      // landmark-fail-fear: +2
  assert.equal(X.confirmArrival(dark, { penalty: 'fd', gainFear: false }).state.fd, 15 + 1 + 2);
  const asFear = X.confirmArrival(dark, { penalty: 'fear', gainFear: false }).state;
  assert.equal(asFear.fd, 16); assert.equal(asFear.fear, 2); assert.equal(asFear.arrival.penaltyChoice, 'fear');
  const tragic = roll(X.defaults(), 8, 2);    // landmark-fail-hope: +1
  assert.equal(X.confirmArrival(tragic, { penalty: 'fd' }).state.fd, 17);
  assert.equal(X.confirmArrival(tragic, { penalty: 'fear' }).state.fear, 1);
  const safe = roll(X.defaults(), 12, 6);
  assert.equal(X.confirmArrival(safe, { penalty: 'fear' }).state.arrival.penaltyChoice, null, 'no penalty where the book has none');
});

test('Fear from a roll with Fear is applied by default, can be declined, and is capped at 12', () => {
  const s = roll(X.defaults(), 3, 7);
  assert.equal(X.confirmArrival(s).state.fear, 1);
  assert.equal(X.confirmArrival(s, { gainFear: false }).state.fear, 0);
  let full = X.defaults(); for (let i = 0; i < 12; i++) full = X.adjustFear(full, 1).state;
  assert.equal(full.fear, 12);
  assert.equal(X.adjustFear(full, 1).ok, false);
  assert.equal(X.confirmArrival(roll(full, 3, 7)).state.fear, 12);
  assert.equal(X.adjustFear(X.defaults(), -1).ok, false, 'never below 0');
});

test('reaching Forest Difficulty 30 traps the party and refuses further travel', () => {
  let s = X.defaults();
  s = X.adjustFd(s, 14).state;                 // 29
  assert.equal(s.trapped, false);
  s = roll(s, 12, 6, 20);
  s = X.confirmArrival(s).state;               // the new hex makes 30
  assert.equal(s.fd, 30);
  assert.equal(s.trapped, true);
  s = X.nextTraversal(s).state;
  assert.equal(X.confirmArrival(roll(s, 12, 6, 20)).ok, false);
  assert.equal(X.confirmArrival(roll(s, 12, 6, 20)).reason, 'trapped');
  const out = X.adjustFd(s, -1).state;         // a correction frees the party
  assert.equal(out.trapped, false);
  assert.equal(X.adjustFd(X.defaults(), 15).state.trapped, true);
});

const arriveAt = (h, f, mod = 0, setup) => {
  let st = X.adjustFd(X.defaults(), 5).state;
  if (setup) st = setup(st);
  return X.confirmArrival(roll(st, h, f, mod), { gainFear: false, penalty: 'fear' }).state;
};

test('resting lowers FD by the book (short 1, long 1d2+1) and obeys the arrival hex', () => {
  const campfire = arriveAt(12, 6, 10);        // landmark-success-hope
  const nofear = { gainFear: false };
  assert.equal(X.rest(campfire, { kind: 'short', ...nofear }).state.fd, campfire.fd - 1);
  assert.equal(X.rest(campfire, { kind: 'long', fdRoll: 1, ...nofear }).state.fd, campfire.fd - 2);
  assert.equal(X.rest(campfire, { kind: 'long', fdRoll: 2, ...nofear }).state.fd, campfire.fd - 3);
  assert.equal(X.rest(campfire, { kind: 'sleep' }).ok, false);
  assert.equal(X.rest(campfire, { kind: 'long', fearRoll: 2 }).reason, 'need-fd-roll');
  assert.equal(X.rest(campfire, { kind: 'short' }).reason, 'need-fear-roll');
  assert.equal(X.rest(arriveAt(2, 8), { kind: 'short', fearRoll: 1 }).reason, 'no-rest-here', 'a dark omen: no rest at all');
  const tragic = X.rest(arriveAt(8, 2), { kind: 'long', fearRoll: 1, fdRoll: 2 });
  assert.equal(tragic.ok, true, 'a tragic place still allows a rest');
  assert.equal(tragic.state.fd, arriveAt(8, 2).fd, 'but FD cannot be reduced there');
  assert.equal(tragic.state.lastRest.whisper, false);
  assert.equal(X.rest(arriveAt(6, 12, 10), { kind: 'short', fearRoll: 1 }).ok, true, 'foreshadowed danger: rest allowed');
  assert.equal(X.rest(X.defaults(), { kind: 'short', fearRoll: 1 }).reason, 'not-arrived');
  let low = X.confirmArrival(roll(X.defaults(), 12, 6)).state;   // FD 16
  low = X.rest(low, { kind: 'long', fdRoll: 2, gainFear: false }).state;
  assert.equal(low.fd, 15, 'clamped at 15');
  assert.equal(low.lastRest.fdBy, 1);
});

test('Whisper in the Dark is the rest\'s additional move: under "only 1 downtime move" it is the GM\'s explicit choice', () => {
  const warned = arriveAt(6, 12, 10);          // landmark-success-fear: only 1 downtime move
  const withIt = X.rest(warned, { kind: 'short', fearRoll: 1, whisper: true }).state;
  const without = X.rest(warned, { kind: 'short', fearRoll: 1, whisper: false }).state;
  assert.equal(withIt.fd, warned.fd - 1);
  assert.equal(without.fd, warned.fd);
  assert.equal(without.lastRest.whisper, false);
  assert.equal(without.fear, warned.fear + 1, 'the rest itself still happens and still gives Fear');
  // no separate automatic reduction exists anywhere else: arriving, returning to Bastion and starting over never lower FD
  let st = arriveAt(12, 6, 10);
  const before = st.fd;
  st = X.setRetreatDanger(X.beginRetreat(st).state, false).state;
  assert.equal(X.completeRetreat(st).state.fd, before);
  assert.equal(X.startExpedition(X.completeRetreat(st).state).state.fd, 15, 'FD is 15 on entering the forest, not a Bastion discount');
});

test('standard Fear from rests: 1d4 for a short rest, 1d4 + heroes for a long one, capped at 12', () => {
  const h = arriveAt(12, 6, 10, st => X.setParty(st, { heroes: 5 }).state);
  assert.equal(h.fear, 0);
  assert.equal(X.rest(h, { kind: 'short', fearRoll: 3 }).state.fear, 3);
  assert.equal(X.rest(h, { kind: 'long', fearRoll: 3, fdRoll: 1 }).state.fear, 8);
  const rested = X.rest(h, { kind: 'long', fearRoll: 4, fdRoll: 1 }).state;
  assert.equal(rested.lastRest.fearBy, 9);
  let nearFull = h; for (let i = 0; i < 10; i++) nearFull = X.adjustFear(nearFull, 1).state;
  const capped = X.rest(nearFull, { kind: 'long', fearRoll: 4, fdRoll: 1 }).state;
  assert.equal(capped.fear, 12);
  assert.equal(capped.lastRest.fearCapped, true);
  assert.equal(X.rest(h, { kind: 'short', fearRoll: 5 }).reason, 'need-fear-roll', 'a 1d4 is 1-4');
  const off = X.setSettings(h, { fearOnRest: false }).state;
  assert.equal(X.rest(off, { kind: 'short' }).state.fear, 0, 'the house rule switches rest Fear off, no roll needed');
  assert.equal(X.rest(h, { kind: 'short', gainFear: false }).state.fear, 0, 'or a single rest can decline it');
});

test('after three Short Rests in a row the next rest must be long (a switch can lift it)', () => {
  let st = arriveAt(12, 6, 10);
  const short = x => X.rest(x, { kind: 'short', fearRoll: 1 });
  for (let i = 1; i <= 3; i++) { st = short(st).state; assert.equal(st.shortRests, i); }
  assert.equal(short(st).ok, false);
  assert.equal(short(st).reason, 'long-rest-required');
  const long = X.rest(st, { kind: 'long', fearRoll: 1, fdRoll: 1 });
  assert.equal(long.ok, true);
  assert.equal(long.state.shortRests, 0, 'a long rest resets the tally');
  assert.equal(short(long.state).ok, true);
  const lifted = X.setSettings(st, { shortRestLimit: false }).state;
  assert.equal(short(lifted).ok, true);
  assert.equal(X.rest(X.undo(long.state).state, { kind: 'short', fearRoll: 1 }).reason, 'long-rest-required', 'undo restores the tally');
});

test('undo reverses exactly the last committed action, repeatedly, and reset is undoable', () => {
  let s = X.defaults();
  const start = JSON.stringify(Object.assign({}, s, { undo: [] }));
  s = roll(s, 3, 7);
  const rolling = JSON.stringify(Object.assign({}, s, { undo: [] }));
  s = X.confirmArrival(s).state;
  s = X.adjustFear(s, 2).state;
  s = X.adjustFd(s, 3).state;
  assert.equal(s.fd, 19); assert.equal(s.fear, 3);
  s = X.undo(s).state; assert.equal(s.fd, 16);
  s = X.undo(s).state; assert.equal(s.fear, 1);
  s = X.undo(s).state;
  assert.equal(s.phase, 'roll');
  assert.equal(JSON.stringify(Object.assign({}, s, { undo: [] })), rolling, 'undoing the arrival restores the roll and its dice');
  assert.equal(s.hexes, 0);
  assert.equal(X.undo(s).ok, false);
  // a new expedition is undoable too
  let played = X.confirmArrival(roll(X.defaults(), 12, 6)).state;
  played = X.setParty(played, { tier: 3, heroes: 5 }).state;
  const fresh = X.startExpedition(played).state;
  assert.deepEqual([fresh.hexes, fresh.fd, fresh.tier, fresh.heroes], [0, 15, 3, 5], 'party settings survive');
  const back = X.undo(fresh).state;
  assert.equal(back.hexes, 1);
  assert.equal(back.fd, 16);
  assert.ok(start);
});

test('the undo stack is bounded', () => {
  let s = X.defaults();
  for (let i = 0; i < X.UNDO_LIMIT + 10; i++) s = X.adjustFear(s, i % 2 ? -1 : 1).state;
  assert.ok(s.undo.length <= X.UNDO_LIMIT);
});

test('party settings are clamped and never a committed action', () => {
  let s = X.defaults();
  assert.equal(X.setParty(s, { tier: 9 }).state.tier, 4);
  assert.equal(X.setParty(s, { tier: 0 }).state.tier, 1);
  assert.equal(X.setParty(s, { heroes: 0 }).state.heroes, 1);
  assert.equal(X.setParty(s, { heroes: 50 }).state.heroes, X.HEROES_MAX);
  assert.equal(X.setParty(s, { difficulty: 'brutal' }).state.difficulty, 'standard');
  assert.equal(X.setParty(s, { tier: 3 }).state.undo.length, 0);
});

/* ---------------- persistence ---------------- */

function fakeStorage(initial) {
  const m = new Map(Object.entries(initial || {}));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, _m: m };
}
const load = storage => SafeStorage.loadStoredJson(storage, 'dhcodex_darkheart', { fallback: () => X.defaults(), validate: SafeStorage.validators.darkheart });

test('state survives a reload through safe storage, including an arrival, locks and the undo stack', () => {
  const storage = fakeStorage();
  let s = roll(X.defaults(), 3, 7, 1);
  s = X.setScene(s, Object.assign(X.emptyScene(), { outcome: 'creature-fail-fear', sceneId: 'hunter-or-hunted-wolf-ground', seed: 2, encounter: { seed: 3, locked: [{ id: 'dire-wolf', quantity: 2 }], gmTheme: 'wolves' }, npc: { seed: 1, locked: true, value: Npc.generateNpc({ outcome: 'creature-success-fear', seed: 4 }) } })).state;
  s = X.confirmArrival(s).state;
  assert.equal(SafeStorage.writeJson(storage, 'dhcodex_darkheart', s).ok, true);
  const back = load(storage);
  assert.deepEqual(back, s);
  assert.equal(back.phase, 'arrived');
  assert.equal(X.undo(back).state.phase, 'roll');
});

test('corrupt or hostile stored state recovers without breaking startup', () => {
  assert.deepEqual(load(fakeStorage({ dhcodex_darkheart: '{ not json' })), X.defaults());
  assert.deepEqual(load(fakeStorage({ dhcodex_darkheart: '[1,2]' })), X.defaults());
  assert.deepEqual(load(fakeStorage()), X.defaults());
  assert.deepEqual(load(null), X.defaults());
  const bad = load(fakeStorage({ dhcodex_darkheart: JSON.stringify({ tier: 99, heroes: -4, fear: 400, fd: 3, hexes: 'x', phase: 'arrived', dice: { hope: 99, fear: 'z', modifier: 1000 }, scene: { outcome: 'nope', dealt: 5 }, undo: 'no', log: [1, { outcome: 'x' }] }) }));
  assert.deepEqual([bad.tier, bad.heroes, bad.fear, bad.fd, bad.hexes, bad.phase], [4, 1, 12, 15, 0, 'roll']);
  assert.deepEqual(bad.dice, { hope: null, fear: null, modifier: 20 });
  assert.equal(bad.scene.outcome, null);
  assert.deepEqual(bad.undo, []);
  assert.deepEqual(bad.log, []);
  const trapped = load(fakeStorage({ dhcodex_darkheart: JSON.stringify(Object.assign(X.defaults(), { fd: 31 })) }));
  assert.equal(trapped.trapped, true);
  assert.equal(SafeStorage.validators.darkheart(X.defaults()).changed, false);
});

/* ---------------- scenes: dealing and no-match ---------------- */

test('every outcome has at least one dealable scene at some tier — all twelve covered', () => {
  for (const outcome of D.OUTCOME_KEYS) {
    const pool = Composer.eligibleScenes(scenes, outcome);
    assert.ok(pool.length >= 1, `${outcome} has no scene`);
  }
});

test('the dealt scene is not repeated until the eligible pool is spent', () => {
  const pool = Composer.eligibleScenes(scenes, 'hazard-fail-hope');
  assert.ok(pool.length >= 3);
  let dealt = [];
  const seen = [];
  for (let i = 0; i < pool.length; i++) {
    const r = Composer.dealScene({ selectable: scenes, outcome: 'hazard-fail-hope', dealt, seed: i * 7 });
    assert.equal(r.noMatch, false);
    assert.equal(r.cycled, false);
    assert.ok(!seen.includes(r.scene.id), 'no repeat');
    seen.push(r.scene.id); dealt = r.dealt;
  }
  assert.equal(new Set(seen).size, pool.length);
  const next = Composer.dealScene({ selectable: scenes, outcome: 'hazard-fail-hope', dealt, seed: 1 });
  assert.equal(next.cycled, true);
  assert.notEqual(next.scene.id, seen[seen.length - 1], 'never straight onto the scene just shown');
  const same = Composer.dealScene({ selectable: scenes, outcome: 'hazard-fail-hope', dealt: [], seed: 5 });
  assert.equal(same.scene.id, Composer.dealScene({ selectable: scenes, outcome: 'hazard-fail-hope', dealt: [], seed: 5 }).scene.id, 'deterministic');
});

test('no compatible scene: a clear no-match, never an unrelated substitute', () => {
  const none = Composer.dealScene({ selectable: scenes.filter(s => !Composer.sceneEntry(s, 'hazard-fail-fear')), outcome: 'hazard-fail-fear', dealt: [], seed: 1 });
  assert.equal(none.noMatch, true);
  assert.equal(none.scene, null);
  assert.equal(Composer.dealScene({ selectable: [], outcome: 'creature-fail-fear', dealt: [], seed: 1 }).scene, null);
  for (const outcome of D.OUTCOME_KEYS) {
    const r = Composer.dealScene({ selectable: scenes, outcome, dealt: [], seed: 3 });
    if (r.scene) assert.ok(Composer.sceneEntry(r.scene, outcome));
  }
});

test('a stale mapping is withheld: the scene vanishes and its outcome falls back to no-match', () => {
  const stale = JSON.parse(JSON.stringify(environments));
  stale.find(e => e.id === 'hunter-or-hunted').features[0].description.en += ' A new rule appears.';
  const selectable = D.getSelectableScenes(manifest, stale);
  assert.ok(!selectable.some(s => s.id === 'hunter-or-hunted-wolf-ground'));
  const r = Composer.dealScene({ selectable: selectable.filter(s => s.envId === 'hunter-or-hunted'), outcome: 'creature-fail-fear', dealt: [], seed: 1 });
  assert.equal(r.noMatch, true);
  assert.equal(Composer.findScene(selectable, 'hunter-or-hunted-wolf-ground'), null, 'a stored id that went stale resolves to nothing');
});

test('a scene shows references to its environment, never copies', () => {
  const scene = scenes.find(s => s.id === 'briar-thicket-snapping-vines');
  const env = environments.find(e => e.id === 'briar-thicket');
  const parts = Composer.sceneParts(scene, env);
  assert.equal(parts.whole, false);
  assert.deepEqual(parts.features.map(f => f.name.en), ['Dense Undergrowth', 'Snapping Vines']);
  parts.features.forEach(f => assert.ok(env.features.includes(f), 'the very same object'));
  assert.deepEqual(parts.leftOut, ['Disorienting Canopy']);
  assert.equal(Composer.sceneParts(scenes.find(s => s.id === 'mother-o-gold-golden-judge'), environments.find(e => e.id === 'mother-o-gold')).whole, true);
});

/* ---------------- NPC ---------------- */

test('the NPC has the five required parts, in both languages, deterministically', () => {
  const a = Npc.generateNpc({ outcome: 'creature-success-fear', seed: 7 });
  assert.deepEqual(a, Npc.generateNpc({ outcome: 'creature-success-fear', seed: 7 }));
  for (const k of ['name', 'look', 'line', 'need']) { assert.ok(a[k].en && a[k].ru, k); assert.match(a[k].ru, /[Ѐ-ӿ]/); }
  assert.ok(a.ancestry.en && a.ancestry.ru && a.avatar.shape);
  assert.equal(a.adversaryId, null);
  assert.equal(a.generated, true);
  const seeds = new Set(Array.from({ length: 30 }, (_, i) => Npc.generateNpc({ outcome: 'creature-success-hope', seed: i }).name.en));
  assert.ok(seeds.size > 10, 'seeds give different people');
});

test('NPC roles follow the outcome and other outcomes have none', () => {
  assert.equal(Npc.generateNpc({ outcome: 'creature-success-fear', seed: 1 }).role, 'in-peril');
  assert.equal(Npc.generateNpc({ outcome: 'creature-success-hope', seed: 1 }).role, 'side-quest');
  assert.equal(Npc.generateNpc({ outcome: 'creature-fail-hope', seed: 1 }).role, 'neutral-creature');
  for (const o of D.OUTCOME_KEYS.filter(k => !Npc.ROLE_FOR_OUTCOME[k])) assert.equal(Npc.generateNpc({ outcome: o, seed: 1 }), null, o);
});

test('dialogue belongs to the situation: a rescue in the roots speaks of roots, a collapse of ceilings', () => {
  for (let seed = 0; seed < 12; seed++) {
    const roots = Npc.generateNpc({ outcome: 'creature-success-fear', sceneId: 'root-rush-rescue-race', seed });
    assert.equal(roots.situation, 'roots');
    assert.match(roots.line.en, /root|cut/i);
    assert.match(roots.need.en, /root/i);
    const collapse = Npc.generateNpc({ role: 'in-peril', situation: 'collapse', seed });
    assert.match(collapse.line.en, /beam|ceiling|out from under/i);
    const bog = Npc.generateNpc({ role: 'in-peril', situation: 'bog', seed });
    assert.match(bog.line.en, /sinking|deeper/i);
  }
  const wanderer = Npc.generateNpc({ outcome: 'creature-success-hope', sceneId: 'gloaming-forest-wanderer', seed: 3 });
  assert.equal(wanderer.situation, 'curse');
  const perilSituations = new Set(Array.from({ length: 40 }, (_, i) => Npc.generateNpc({ outcome: 'creature-success-fear', seed: i }).situation));
  assert.ok(perilSituations.size >= 3, 'with no hint the situation varies');
  for (const role of Object.keys(Npc.SITUATIONS)) for (const [sit, def] of Object.entries(Npc.SITUATIONS[role])) {
    assert.ok(def.lines.length >= 2 && def.need.en && def.need.ru, `${role}/${sit}`);
    def.lines.forEach(l => assert.match(l.ru, /[Ѐ-ӿ]/));
  }
});

test('a locked NPC is data the scene keeps: regenerating other parts leaves it as is', () => {
  const npc = Npc.generateNpc({ outcome: 'creature-success-fear', seed: 5 });
  let s = X.setScene(X.defaults(), Object.assign(X.emptyScene(), { outcome: 'creature-success-fear', npc: { seed: 5, locked: true, value: npc } })).state;
  s = X.setScene(s, Object.assign({}, s.scene, { seed: s.scene.seed + 1, encounter: { seed: 9, locked: [] } })).state;
  assert.equal(s.scene.npc.locked, true);
  assert.deepEqual(s.scene.npc.value, npc);
  const reloaded = SafeStorage.validators.darkheart(JSON.parse(JSON.stringify(s))).value;
  assert.deepEqual(reloaded.scene.npc.value, npc);
});

/* ---------------- route, navigation and page wiring ---------------- */

test('#/darkheart is a route of its own, with an overlay and a canonical hash', () => {
  assert.equal(RouteUtils.parseRouteHash('#/darkheart').route.name, 'darkheart');
  const withEnv = RouteUtils.parseRouteHash('#/darkheart/env/briar-thicket');
  assert.equal(withEnv.route.name, 'darkheart'); assert.equal(withEnv.route.env, 'briar-thicket');
  assert.equal(RouteUtils.baseHash({ name: 'darkheart' }), '#/darkheart');
  assert.equal(RouteUtils.envHash('x y', { name: 'darkheart' }), '#/darkheart/env/x%20y');
  assert.equal(RouteUtils.parseRouteHash('#/darkheart/env/%E0%A4%A').route.name, 'darkheart', 'a malformed overlay keeps the base route');
  for (const h of ['#/lists', '#/journey', '#/prep', '#/session-prep', '', '#/?tier=1']) assert.notEqual(RouteUtils.parseRouteHash(h).route.name, 'darkheart');
});

test('the fifth bookmark is wired like the other four', () => {
  const app = read('js/app.js'), css = read('css/styles.css');
  assert.match(app, /id: 'darkheart', icon: \(\) => ICON_FOREST, label: 'nav_darkheart', hash: '#\/darkheart'/);
  assert.match(app, /state\.route\.name === 'darkheart' \? 'darkheart'/);
  assert.match(app, /DarkheartView\.unmount\(\)/);
  assert.match(css, /\.ribbon\[data-ribbon="darkheart"\] \{ --rb: var\(--rb-darkheart\)/);
  assert.match(css, /--rb-darkheart: #/);
  assert.equal(i18n.en.nav_darkheart, 'Darkheart');
  assert.equal(i18n.en.dh_title, 'The Darkheart Forest');
  for (const f of ['darkheart-body', 'darkheart-hem']) assert.ok(fs.existsSync(path.join(ROOT, `img/ui/ribbon-fabric/${f}.webp`)));
});

test('every string the Darkheart page asks for exists in English and Russian', () => {
  const src = read('js/darkheart-view.js');
  const keys = new Set([...src.matchAll(/t\('(dh_[a-z0-9_-]+)'\)/g)].map(m => m[1]));
  // computed keys: prefix + each value the code can produce
  const dyn = {
    dh_cat_: ['creature', 'landmark', 'hazard', 'resource'],
    dh_match_: D.OUTCOME_KEYS.length ? ['full', 'partial', 'adapted'] : [],
    dh_adjust_: D.GUIDANCE_ADJUSTS || ['terrain', 'location', 'scale', 'npc', 'hostility', 'countdown', 'difficulty'],
    dh_diff_: X.DIFFICULTIES,
    dh_rest_: ['normal', 'none', 'no-fd-reduction', 'one-move', 'safe'],
    dh_enc_posture_: ['recommended', 'prepared', 'optional', 'none'],
    dh_npc_role_: ['in-peril', 'side-quest', 'neutral-creature'],
    dh_mod_: ['difficulty', 'lower_tier', 'multiple_solos', 'no_heavy_type', 'boosted_damage'],
    dh_err_: ['hope_range', 'fear_range', 'modifier_range'],
  };
  for (const [prefix, vals] of Object.entries(dyn)) vals.forEach(v => keys.add(prefix + v));
  keys.add('nav_darkheart');
  for (const k of keys) for (const lang of ['en', 'ru']) assert.ok(i18n[lang][k] && i18n[lang][k].trim(), `${lang}.${k}`);
  for (const [k, v] of Object.entries(i18n.ru)) if (k.startsWith('dh_')) assert.ok(/[Ѐ-ӿ]/.test(v) || /^[A-Za-z0-9 ]+$/.test(v), k);
  assert.deepEqual(Object.keys(i18n.en).filter(k => k.startsWith('dh_')).sort(), Object.keys(i18n.ru).filter(k => k.startsWith('dh_')).sort());
});

test('the page owns no storage call and never shows catalogue text of its own: it reads references', () => {
  const view = read('js/darkheart-view.js');
  for (const bad of ['localStorage', 'sessionStorage', 'JSON.parse', 'fetch(']) assert.equal(view.includes(bad), false, bad);
  assert.ok(read('js/app.js').includes("set: next => { state.darkheart = next; persist(LS_KEYS.darkheart, next); }"));
});

test('Darkheart rule text is complete and bilingual for all twelve outcomes', () => {
  for (const k of D.OUTCOME_KEYS) {
    const r = X.OUTCOME_RULES[k];
    assert.ok(r.title.en && r.rule.en && /[Ѐ-ӿ]/.test(r.title.ru) && /[Ѐ-ӿ]/.test(r.rule.ru), k);
  }
  assert.equal(X.OUTCOME_RULES['hazard-fail-fear'].countdown, '6');
  assert.equal(X.OUTCOME_RULES['hazard-fail-hope'].countdown, '3');
  assert.equal(X.OUTCOME_RULES['resource-success-fear'].countdown, '1d6');
  assert.equal(X.OUTCOME_RULES['landmark-fail-fear'].penalty, 2);
  assert.equal(X.OUTCOME_RULES['landmark-fail-hope'].penalty, 1);
});

/* ---------------- hardening: Fear, retreat, Bastion, expeditions, campaigns (PD-101) ---------------- */

test('the roll is compared against FD as it stands; only the arrival raises it', () => {
  let s = X.adjustFd(X.defaults(), 4).state;                  // FD 19
  s = roll(s, 6, 13 - 1, 1);                                   // 6 + 12 + 1 = 19: succeeds against 19, would fail against 20
  assert.equal(X.previewRoll(s.dice, s.fd).success, true);
  const arrived = X.confirmArrival(s).state;
  assert.equal(arrived.arrival.difficulty, 19, 'the arrival records the FD it was rolled against');
  assert.equal(arrived.fd, 20);
  assert.equal(X.previewRoll({ hope: 6, fear: 12, modifier: 1 }, arrived.fd).success, false, 'the same dice fail against the new FD');
  assert.equal(X.previewRoll({ hope: 6, fear: 12, modifier: 1 }, X.defaults().fd).success, true);
});

test('house-rule switches are explicit, default on, reversible, and never silent', () => {
  assert.deepEqual(X.defaults().settings, { fearOnRoll: true, fearOnRest: true, shortRestLimit: true });
  const off = X.setSettings(roll(X.defaults(), 3, 7), { fearOnRoll: false }).state;
  assert.equal(X.confirmArrival(off).state.fear, 0, 'no Fear from a roll with Fear when the table turns it off');
  assert.equal(X.confirmArrival(X.setSettings(off, { fearOnRoll: true }).state).state.fear, 1);
  assert.equal(X.setSettings(X.defaults(), { fearOnRoll: 'yes', nonsense: true }).state.settings.fearOnRoll, true, 'only booleans are taken');
  assert.equal(X.setSettings(X.defaults(), { shortRestLimit: false }).state.undo.length, 0);
});

test('a critical success is a Hope result: no Fear, whatever the Forest Difficulty', () => {
  const s = roll(X.adjustFd(X.defaults(), 10).state, 4, 4, -20);
  const p = X.previewRoll(s.dice, s.fd);
  assert.equal(p.success, true); assert.equal(p.rolledWith, 'critical');
  assert.equal(X.confirmArrival(s).state.fear, 0);
  assert.equal(X.confirmArrival(s).state.arrival.rolledWith, 'critical');
});

test('retreat: nothing before the first hex, never while trapped, and opening it changes no counter', () => {
  assert.equal(X.beginRetreat(X.defaults()).reason, 'no-hex-yet');
  const arrived = X.confirmArrival(roll(X.defaults(), 12, 6, 20)).state;
  const opened = X.beginRetreat(arrived);
  assert.equal(opened.ok, true);
  assert.equal(opened.state.phase, 'retreat');
  assert.deepEqual([opened.state.fd, opened.state.fear, opened.state.hexes], [arrived.fd, arrived.fear, arrived.hexes]);
  assert.equal(X.cancelRetreat(opened.state).state.phase, 'arrived');
  assert.equal(X.beginRetreat(X.nextTraversal(arrived).state).ok, true, 'also between hexes');
  const trapped = X.nextTraversal(X.confirmArrival(roll(X.adjustFd(X.defaults(), 14).state, 12, 6, 20)).state).state;
  assert.equal(trapped.trapped, true);
  assert.equal(X.beginRetreat(trapped).reason, 'trapped');
  assert.equal(X.beginRetreat(opened.state).ok, false, 'not while already retreating');
});

test('safe retreat is a declaration; a dangerous one needs a successful Group Roll', () => {
  const arrived = X.confirmArrival(roll(X.defaults(), 12, 6, 20)).state;
  let r = X.beginRetreat(arrived).state;
  assert.equal(X.completeRetreat(r).reason, 'danger-unknown', 'the Master says whether danger is present');
  const safe = X.completeRetreat(X.setRetreatDanger(r, false).state);
  assert.equal(safe.ok, true);
  assert.equal(safe.state.phase, 'bastion');
  assert.equal(safe.state.fear, arrived.fear, 'declaring costs nothing');
  assert.equal(safe.state.hexes, arrived.hexes);
  // danger present
  r = X.setRetreatDanger(r, true).state;
  assert.equal(X.completeRetreat(r).reason, 'incomplete');
  const fail = roll(r, 3, 7);                                  // 10 vs FD 16: a failure
  assert.equal(X.completeRetreat(fail).reason, 'roll-failed');
  const win = roll(r, 9, 5, 5);                                // 19 vs 16, with Hope
  const done = X.completeRetreat(win);
  assert.equal(done.ok, true); assert.equal(done.state.phase, 'bastion');
  assert.equal(done.state.fear, arrived.fear, 'a roll with Hope gives the GM nothing');
  const withFear = X.completeRetreat(roll(r, 5, 9, 5));        // 19, with Fear: an action roll, GM gains 1
  assert.equal(withFear.state.fear, arrived.fear + 1);
  assert.equal(X.completeRetreat(roll(r, 5, 9, 5), { gainFear: false }).state.fear, arrived.fear);
});

test('a failed retreat uses its roll on the traversal tables: a new adjacent hex, FD +1, no escape', () => {
  const arrived = X.confirmArrival(roll(X.defaults(), 12, 6, 20)).state;          // hex 1, FD 16
  let r = X.setRetreatDanger(X.beginRetreat(arrived).state, true).state;
  r = roll(r, 3, 7);                                                              // failure, with Fear, creature
  assert.equal(X.confirmRetreatFailure(roll(r, 9, 5, 5)).reason, 'roll-succeeded');
  const res = X.confirmRetreatFailure(r);
  assert.equal(res.ok, true);
  const s = res.state;
  assert.equal(s.phase, 'arrived');
  assert.equal(s.arrival.outcome, 'creature-fail-fear');
  assert.equal(s.arrival.viaRetreat, true);
  assert.equal(s.hexes, 2); assert.equal(s.fd, 17); assert.equal(s.fear, 1);
  assert.equal(s.retreat, null);
  assert.equal(X.confirmRetreatFailure(s).ok, false, 'applied exactly once');
  assert.equal(X.undo(s).state.phase, 'retreat', 'undo returns to the failed roll, nothing applied');
  assert.equal(X.undo(s).state.hexes, 1);
  for (const [h, f] of [[2, 8], [8, 2], [2, 7], [7, 2], [3, 7], [7, 3]]) {
    const o = X.confirmRetreatFailure(roll(X.setRetreatDanger(X.beginRetreat(arrived).state, true).state, h, f)).state.arrival.outcome;
    assert.match(o, /-fail-/, 'a failed roll only ever lands on a failure outcome');
  }
});

test('Bastion, a new expedition and a new campaign are three different resets', () => {
  let s = X.setParty(X.defaults(), { tier: 3, heroes: 5 }).state;
  s = X.setSettings(s, { shortRestLimit: false }).state;
  s = X.confirmArrival(roll(s, 3, 7)).state;                                      // hex 1, FD 16, Fear 1
  s = X.adjustFear(s, 4).state;                                                   // Fear 5
  s = X.rest(s, { kind: 'short', fearRoll: 1, whisper: true }).state;             // Fear 6, FD 15
  const atBastion = X.completeRetreat(X.setRetreatDanger(X.beginRetreat(s).state, false).state).state;
  assert.equal(atBastion.phase, 'bastion');
  assert.deepEqual([atBastion.fear, atBastion.hexes, atBastion.expedition], [6, 1, 1], 'Bastion changes nothing by itself');
  // continue vs. new expedition
  const next = X.startExpedition(atBastion).state;
  assert.deepEqual([next.phase, next.fd, next.hexes, next.expedition, next.fear], ['roll', 15, 0, 2, 6], 'GM Fear carries into the next expedition');
  assert.deepEqual([next.tier, next.heroes, next.settings.shortRestLimit], [3, 5, false]);
  assert.equal(next.arrival, null); assert.deepEqual(next.log, []);
  assert.equal(next.scene.dealt && typeof next.scene.dealt, 'object');
  // an entirely new campaign
  const camp = X.newCampaign(atBastion).state;
  assert.deepEqual([camp.fear, camp.fd, camp.hexes, camp.expedition, camp.shortRests, camp.phase], [0, 15, 0, 1, 0, 'roll']);
  assert.deepEqual([camp.tier, camp.heroes], [3, 5], 'the party is the table\'s, not the campaign\'s');
  assert.deepEqual(camp.scene.dealt, {});
  // all undoable
  assert.equal(X.undo(next).state.phase, 'bastion');
  assert.equal(X.undo(camp).state.fear, 6);
  // a mid-forest abandon keeps Fear too
  assert.equal(X.startExpedition(s).state.fear, s.fear);
  // trapped parties can start over
  const stuck = X.adjustFd(X.defaults(), 15).state;
  assert.equal(X.startExpedition(stuck).state.trapped, false);
  // Short Rest tally persists across expeditions, resets with a campaign
  const tally = X.rest(arriveAt(12, 6, 10), { kind: 'short', fearRoll: 1 }).state;
  assert.equal(X.startExpedition(tally).state.shortRests, 1);
  assert.equal(X.newCampaign(tally).state.shortRests, 0);
});

test('the new state survives reload: retreat, Bastion, rests, settings and expedition number', () => {
  const storage = fakeStorage();
  let s = X.confirmArrival(roll(X.defaults(), 12, 6, 20)).state;
  s = X.rest(s, { kind: 'short', fearRoll: 2 }).state;
  s = X.setSettings(s, { fearOnRoll: false }).state;
  for (const state of [s, X.setRetreatDanger(X.beginRetreat(s).state, true).state, X.startExpedition(X.completeRetreat(X.setRetreatDanger(X.beginRetreat(s).state, false).state).state).state, X.completeRetreat(X.setRetreatDanger(X.beginRetreat(s).state, false).state).state]) {
    assert.equal(SafeStorage.writeJson(storage, 'dhcodex_darkheart', state).ok, true);
    assert.deepEqual(load(storage), state);
  }
  const old = JSON.stringify({ tier: 2, heroes: 3, fear: 4, fd: 17, hexes: 2, phase: 'roll', dice: {}, scene: {}, log: [{ n: 1, outcome: 'creature-fail-fear', fd: 16 }] });
  const migrated = load(fakeStorage({ dhcodex_darkheart: old }));
  assert.deepEqual([migrated.expedition, migrated.shortRests, migrated.settings.fearOnRest, migrated.fear], [1, 0, true, 4], 'a state saved before PD-101 loads with the defaults');
  const bad = load(fakeStorage({ dhcodex_darkheart: JSON.stringify({ phase: 'retreat', settings: { fearOnRoll: 7 }, shortRests: -9, expedition: 0 }) }));
  assert.deepEqual([bad.phase, bad.shortRests, bad.expedition], ['roll', 0, 1], 'a retreat with no retreat data falls back to rolling');
});

/* ---------------- PD-100: no tier filters, the page reads the card at the Party Tier ---------------- */

test('every reviewed scene is available to a party of any tier, whatever tier its environment was written for', () => {
  const envTiers = new Set(scenes.map(sc => environments.find(e => e.id === sc.envId).tier));
  assert.ok(envTiers.size >= 1);
  for (const sc of manifest.scenes) assert.equal('tiers' in sc, false, `${sc.id} has no tiers key`);
  for (const outcome of D.OUTCOME_KEYS) {
    assert.ok(Composer.eligibleScenes(scenes, outcome).length >= 1, outcome);
  }
  const pilot = ['around-the-fire-respite', 'friendly-campfire-travelers-fire', 'hunter-or-hunted-wolf-ground', 'root-rush-rescue-race', 'gloaming-forest-wanderer', 'gloaming-forest-shifting-paths', 'briar-thicket-tangled-way', 'abandoned-grove-fallen-grove', 'gnarled-glen-lingering-souls', 'cauldera-valley-valleys-bounty', 'underroot-tunnels-root-blockage'];
  for (const id of pilot) assert.ok(scenes.some(sc => sc.id === id), id);
  for (const tier of [1, 2, 3, 4]) {
    const s = X.setParty(X.defaults(), { tier }).state;
    for (const id of pilot) {
      const sc = scenes.find(x => x.id === id);
      for (const o of sc.outcomes) assert.ok(Composer.eligibleScenes(scenes, o.outcome).some(x => x.id === id), `${id} for tier ${s.tier}`);
    }
  }
  assert.ok([...envTiers].some(t => t === 1) && [...envTiers].some(t => t === 2), 'the pilot mixes source tiers');
});

test('the environment is read at the Party Tier by default, with an optional GM override that is not a campaign event', () => {
  let s = X.setParty(X.defaults(), { tier: 4 }).state;
  assert.equal(X.envReadTier(s), 4);
  s = X.setEnvTier(s, 2).state;
  assert.equal(X.envReadTier(s), 2);
  assert.equal(s.undo.length, 0);
  assert.equal(X.setParty(s, { tier: 1 }).state.envTier, 2, 'changing the party leaves the override alone');
  assert.equal(X.envReadTier(X.setEnvTier(s, null).state), 4);
  assert.equal(X.setEnvTier(s, 9).state.envTier, null);
});

test('Forest Difficulty is independent of Party Tier and of the environment\'s own difficulty', () => {
  let s = X.adjustFd(X.defaults(), 3).state;
  for (const tier of [1, 2, 3, 4, 1]) assert.equal(X.setParty(s, { tier }).state.fd, 18);
  assert.equal(X.setEnvTier(s, 4).state.fd, 18);
  // a Tier IV environment (written for difficulty 20) and a Tier I one (11) are both checked against the same FD
  assert.ok(environments.some(e => e.tier === 4 && e.difficulty > 15) && environments.some(e => e.tier === 1 && e.difficulty < 15));
  assert.equal(X.previewRoll({ hope: 3, fear: 7, modifier: 5 }, s.fd).difficulty, 18);
});

test('the page renders environment text through the shared card renderer with the FD substituted for check DCs', () => {
  const app = read('js/app.js'), view = read('js/darkheart-view.js');
  assert.match(app, /function renderEnvTextForDarkheart\(container, env, raw, tier, fd\)/);
  assert.match(app, /retier && retier\.fd != null \? retier\.fd/);
  assert.match(app, /retierFor\(env, tier\)/, 'damage scaling is retierFor / retierDamage, not a second algorithm');
  assert.match(app, /EnvTierUtils\.substituteTier\(raw, tier\)/);
  assert.match(view, /deps\.renderEnvText\(node, p\.env, p\.text, tier, s\.fd\)/);
  for (const bad of ['TIER_TABLE', 'retierDamage', 'diceAvg']) assert.equal(view.includes(bad), false, `the view duplicates ${bad}`);
  assert.equal(/environments\.json/.test(view), false);
});

/* ---------------- coverage by outcome, GM theme, affinity audit (PD-100, PD-101) ---------------- */

const E = require('../js/darkheart-encounter.js');
const adversaryCatalog = JSON.parse(read('data/prep.json')).adversaries;
const affinity = JSON.parse(read('data/darkheart-affinity.json'));
const encCtx = E.createContext(adversaryCatalog, environments, affinity);

test('coverage by outcome: every outcome has at least three reviewed scenes, from many environments and source tiers', () => {
  const counts = Object.fromEntries(D.OUTCOME_KEYS.map(k => [k, Composer.eligibleScenes(scenes, k).length]));
  for (const [k, n] of Object.entries(counts)) assert.ok(n >= 3, `${k} has ${n}`);
  const envIds = new Set(scenes.map(s => s.envId));
  assert.ok(envIds.size >= 30, `${envIds.size} environments`);
  const tiers = new Set(scenes.map(s => environments.find(e => e.id === s.envId).tier));
  assert.deepEqual([...tiers].sort(), [1, 2, 3, 4], 'source tier is diversity, never a filter');
  const reviewed = new Set(manifest.reviews.filter(r => r.status === 'reviewed').map(r => r.envId));
  for (const s of scenes) assert.ok(reviewed.has(s.envId), `${s.id}: its environment has a review entry`);
});

test('provenance survives: every new scene is pinned to the catalogue and no catalogue text was copied into the manifest', () => {
  const text = JSON.stringify(manifest);
  const sample = environments.filter(e => scenes.some(s => s.envId === e.id)).flatMap(e => e.features.map(f => f.description.en.slice(0, 60)));
  for (const snippet of sample) assert.equal(text.includes(snippet), false, `copied: ${snippet}`);
  for (const s of scenes) {
    const pinned = s.match === 'full' || (s.match === 'adapted' && s.envFp) ? !!s.envFp : (s.features || []).every(f => /^[0-9a-f]{14}$/.test(f.fp));
    assert.ok(pinned, s.id);
  }
  assert.ok(scenes.filter(s => s.match === 'adapted').every(s => s.outcomes.every(o => o.adaptation && o.adaptation.changes.length)));
});

test('a scene with no theme offers the Master an explicit theme; nothing is chosen for them', () => {
  const noTheme = scenes.find(s => s.id === 'obsidian-forest-lava-burst');
  const base = { scene: noTheme, outcome: 'hazard-fail-fear', tier: 2, heroes: 4, difficulty: 'standard', seed: 'q', ctx: encCtx };
  assert.deepEqual(Composer.encounterFor(base).adversaries, [], 'no theme, no suggestions');
  const chosen = Composer.encounterFor(Object.assign({ gmTheme: 'undead' }, base));
  assert.ok(chosen.adversaries.length > 0);
  assert.ok(chosen.adversaries.every(a => (affinity.adversaries[a.id] || []).includes('undead')), 'only the chosen theme');
  assert.ok(chosen.adversaries.every(a => /chose/.test(a.reason.en)), 'the reason says the Master chose it');
  assert.equal(chosen.combat, 'optional', 'it never turns a hazard into a forced fight');
  // a scene that names a theme keeps it
  const wolves = scenes.find(s => s.id === 'hunter-or-hunted-wolf-ground');
  const r = Composer.encounterFor({ scene: wolves, outcome: 'creature-fail-fear', tier: 1, heroes: 4, difficulty: 'standard', seed: 'q', gmTheme: 'undead', ctx: encCtx });
  assert.ok(r.adversaries.every(a => a.id === 'dire-wolf'));
  // noncombat outcomes stay noncombat, theme or not
  const camp = scenes.find(s => s.id === 'fey-lands-ley-line');
  const none = Composer.encounterFor({ scene: camp, outcome: 'landmark-success-hope', tier: 3, heroes: 4, difficulty: 'standard', seed: 'q', gmTheme: 'undead', ctx: encCtx });
  assert.equal(none.status, 'none'); assert.deepEqual(none.adversaries, []);
});

test('encounters stay tied to the Party Tier whatever tier the scene\'s environment was written for', () => {
  const tier4env = scenes.find(s => s.id === 'court-of-hounds-wild-hunt');   // a Tier 3 source
  assert.equal(environments.find(e => e.id === tier4env.envId).tier, 3);
  for (const tier of [1, 2, 3, 4]) {
    const r = Composer.encounterFor({ scene: tier4env, outcome: 'creature-fail-fear', tier, heroes: 4, difficulty: 'standard', seed: 'z', ctx: encCtx });
    assert.equal(r.input.tier, tier);
    assert.equal(r.battlePoints.baseBudget, 14, 'budget from the heroes, not the environment');
    for (const a of r.adversaries) assert.ok(a.tier <= tier && a.tier >= tier - 1, `${a.id} T${a.tier} for a Tier ${tier} party`);
  }
});

test('the affinity audit: desert predators are not forest beasts, and the high-tier families exist', () => {
  const idOf = n => adversaryCatalog.find(a => a.name.en === n).id;
  assert.equal(idOf('Landshark') in affinity.adversaries, false);
  assert.deepEqual(affinity.adversaries[idOf('Giant Scorpion')], ['vermin']);
  assert.ok(affinity.adversaries[idOf('Dire Wolf')].includes('wolves') && affinity.adversaries[idOf('Dire Wolf')].includes('beasts'));
  for (const n of ['Vampire', 'Arch-Necromancer', 'Zombie Legion']) assert.ok(affinity.adversaries[idOf(n)].includes('undead'), n);
  for (const t of [1, 2, 3, 4]) assert.ok(Object.keys(affinity.adversaries).some(id => adversaryCatalog.find(a => a.id === id).tier === t), `tier ${t}`);
});

test('NPC situation hints name real scenes and real situations, and a blaze never speaks of beams', () => {
  for (const [sceneId, situation] of Object.entries(Npc.SCENE_SITUATION)) {
    assert.ok(scenes.some(s => s.id === sceneId), sceneId);
    const scene = scenes.find(s => s.id === sceneId);
    const outcome = scene.outcomes.map(o => o.outcome).find(o => Npc.ROLE_FOR_OUTCOME[o]);
    assert.ok(outcome, `${sceneId} has an NPC outcome`);
    const role = Npc.ROLE_FOR_OUTCOME[outcome];
    assert.ok(Npc.SITUATIONS[role][situation], `${sceneId}: ${situation} exists for ${role}`);
    for (let seed = 0; seed < 8; seed++) assert.equal(Npc.generateNpc({ outcome, sceneId, seed }).situation, situation);
  }
  for (let seed = 0; seed < 8; seed++) {
    const n = Npc.generateNpc({ outcome: 'creature-success-fear', sceneId: 'forest-wildfire-peril', seed });
    assert.match(n.line.en + n.need.en, /fire|flame|smoke|blaze/i);
    assert.doesNotMatch(n.line.en, /beam|ceiling|root/i);
  }
  for (const scene of scenes) for (const o of scene.outcomes) {
    if (!Npc.ROLE_FOR_OUTCOME[o.outcome]) continue;
    // every NPC scene either hints its situation or says nothing the dialogue could contradict
    assert.ok(Npc.SCENE_SITUATION[scene.id] || !/fire|blaze|loop|dream|roots/i.test(o.framing.summary.en), scene.id);
  }
});

/* ---------- premium polish pass: FD shown for a previewed hex, view keys, scene art rule ---------- */

test('the FD the previewed hex will use is the roll\'s FD + 1 (never the Landmark penalty), and equals the confirmed FD', () => {
  let s = X.defaults();
  s = X.setDice(s, { hope: 12, fear: 10, modifier: 0 }).state;
  const pending = X.confirmArrival(s, { penalty: 'fear', gainFear: false }).state.fd;       // what the view shows before confirmation
  assert.equal(pending, s.fd + 1);
  const confirmed = X.confirmArrival(s, { penalty: 'fd', gainFear: true }).state;
  assert.equal(confirmed.fd, pending);                                                       // no penalty on a Campfire: same value after arrival
  assert.equal(X.previewRoll(s.dice, s.fd).difficulty, s.fd);                                // the roll itself stays against the pre-entry FD
});

test('the polish keys exist in both languages with identical placeholders', () => {
  const i18n = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'i18n.json'), 'utf8'));
  const keys = ['dh_party_summary', 'dh_party_summary_one', 'dh_party_edit', 'dh_hexes_short', 'dh_fd_resets_note', 'dh_menu_resets', 'dh_state_preview', 'dh_state_preview_note',
    'dh_state_confirmed', 'dh_state_confirmed_note', 'dh_rest_more', 'dh_bastion_next', 'dh_bastion_kicker', 'dh_bastion_recap', 'dh_bastion_expedition', 'dh_bp_unit',
    'dh_features_label', 'dh_fd_on_arrival', 'dh_fd_checks_now', 'dh_fd_may_rise', 'dh_src_adapt', 'dh_src_from', 'dh_src_untouched'];
  const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join();
  keys.forEach(k => { assert.ok(i18n.en[k] && i18n.ru[k], k); assert.equal(ph(i18n.en[k]), ph(i18n.ru[k]), k); });
});

test('Forest Difficulty never exceeds 30: the game ends there (arrival, manual +, rest, persisted value)', () => {
  const at = fd => Object.assign(X.defaults(), { fd });
  const base = X.setDice(at(29), { hope: 3, fear: 7, modifier: 0 }).state;
  const arrived = X.confirmArrival(base, {}).state;
  assert.equal(arrived.fd, 30); assert.equal(arrived.trapped, true);
  const pen = X.setDice(at(29), { hope: 8, fear: 2, modifier: 0 }).state;           // landmark-fail-hope: +1 FD
  assert.ok(X.confirmArrival(pen, { penalty: 'fd' }).state.fd <= 30);
  const two = X.setDice(at(29), { hope: 2, fear: 8, modifier: 0 }).state;           // dark omen: +2 FD on top of +1
  assert.equal(X.confirmArrival(two, { penalty: 'fd' }).state.fd, 30);
  assert.equal(X.adjustFd(at(30), 1).ok, false);
  const forced = Object.assign(X.defaults(), { fd: 29 });
  assert.equal(X.confirmArrival(X.setDice(forced, { hope: 2, fear: 8, modifier: 0 }).state, { penalty: 'fd' }).state.fd, 30);
});
