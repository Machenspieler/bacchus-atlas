/* Adaptive 3-or-2 My Lists cover composition (PD-092): the pure composeCover step, the PANEL_REVIEWS registry it reads,
 * and what it does to real lists. Candidate selection (eligibility, ranking, family dedup) is covered by
 * tests/list-cover-utils.test.js and is unchanged. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const Art = require('../js/list-cover-art.js');
const U = require('../js/list-cover-utils.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ENVS = JSON.parse(read('data/environments.json')).environments;
const BY_ID = Object.fromEntries(ENVS.map(e => [e.id, e]));
const GENERIC = ['universal', 'settlement'];
function artBiome(env) {
  let pool = [...(env.biomes || [])];
  for (const g of GENERIC) { if (pool.length < 2) break; pool = pool.filter(b => b !== g); }
  return pool[0] || null;
}
const cover = (...ids) => U.coverForEnvironments(ids.map(id => ({ id, artBiome: artBiome(BY_ID[id]) })));
const ids = c => c.tiles.map(t => t.imageId);
const cand = imageId => ({ imageId });

const CALM = ['archetype:sky-realms', 'archetype:blighted-mires', 'archetype:sinister-woods'];
const BUSY_READS = ['archetype:strongholds-and-sieges', 'archetype:starfaring']; /* busy, but readable at a third */
const FAILS_THIRD = ['archetype:taverns-and-inns', 'archetype:archives-and-libraries'];

test('every IMAGES id has an intentional panel review, and nothing else is reviewed', () => {
  assert.deepEqual(Object.keys(Art.PANEL_REVIEWS).sort(), Object.keys(Art.IMAGES).sort());
  Object.values(Art.PANEL_REVIEWS).forEach(r => {
    assert.deepEqual(Object.keys(r).sort(), ['busy', 'readsAtThird']);
    assert.equal(typeof r.readsAtThird, 'boolean');
    assert.equal(typeof r.busy, 'boolean');
  });
});

test('the reviewed set is the lab verdict: nine fail at a third, ten are busy, crops have their own record', () => {
  const R = Art.PANEL_REVIEWS;
  assert.deepEqual(Object.keys(R).filter(k => !R[k].readsAtThird).sort(), [
    'archetype:archives-and-libraries', 'archetype:cursed-and-blighted-lands', 'archetype:dungeon-delves',
    'archetype:feasts-and-revelry', 'archetype:fey-and-enchanted', 'archetype:intrigue-and-underworld',
    'archetype:monster-lairs', 'archetype:streets-and-towns', 'archetype:taverns-and-inns']);
  assert.equal(Object.values(R).filter(r => r.busy).length, 11); // + storm-hail (the storm pictures, docs/research/storm-art-review)
  /* a calm crop of a busy parent is judged on its own picture */
  assert.equal(R['archetype:streets-and-towns'].busy, true);
  assert.equal(R['crop:market-stalls'].busy, false);
  assert.equal(R['crop:market-stalls'].readsAtThird, true);
});

test('composeCover: one or two candidates are returned untouched, reviewed or not', () => {
  assert.deepEqual(U.composeCover([], Art.PANEL_REVIEWS), []);
  const one = [cand(FAILS_THIRD[0])], two = [cand(FAILS_THIRD[0]), cand(FAILS_THIRD[1])];
  assert.equal(U.composeCover(one, Art.PANEL_REVIEWS), one);
  assert.equal(U.composeCover(two, Art.PANEL_REVIEWS), two);
});

test('composeCover: three readable pictures with zero or one busy stay a triptych', () => {
  const calm = CALM.map(cand);
  assert.equal(U.composeCover(calm, Art.PANEL_REVIEWS), calm);
  const oneBusy = [cand(CALM[0]), cand(BUSY_READS[0]), cand(CALM[1])];
  assert.equal(U.composeCover(oneBusy, Art.PANEL_REVIEWS), oneBusy);
});

test('composeCover: two busy pictures reduce to two, dropping a busy one (lowest rank first)', () => {
  const r = U.composeCover([cand(CALM[0]), cand(BUSY_READS[0]), cand(BUSY_READS[1])], Art.PANEL_REVIEWS);
  assert.deepEqual(r.map(c => c.imageId), [CALM[0], BUSY_READS[0]]);
});

test('composeCover: a picture that fails at a third is the one dropped, wherever it ranks', () => {
  const top = U.composeCover([cand(FAILS_THIRD[0]), cand(CALM[0]), cand(CALM[1])], Art.PANEL_REVIEWS);
  assert.deepEqual(top.map(c => c.imageId), [CALM[0], CALM[1]]);
  const last = U.composeCover([cand(CALM[0]), cand(CALM[1]), cand(FAILS_THIRD[0])], Art.PANEL_REVIEWS);
  assert.deepEqual(last.map(c => c.imageId), [CALM[0], CALM[1]]);
  /* tavern + market + library: both interiors fail, the lower-ranked goes and rank order survives */
  const tml = U.composeCover([cand('crop:market-stalls'), cand(FAILS_THIRD[0]), cand(FAILS_THIRD[1])], Art.PANEL_REVIEWS);
  assert.deepEqual(tml.map(c => c.imageId), ['crop:market-stalls', FAILS_THIRD[0]]);
});

test('composeCover: a missing review keeps the triptych — no silent default', () => {
  const mixed = [cand(FAILS_THIRD[0]), cand('archetype:not-reviewed-yet'), cand(FAILS_THIRD[1])];
  assert.equal(U.composeCover(mixed, Art.PANEL_REVIEWS), mixed);
  assert.equal(U.composeCover(mixed, undefined), mixed);
  assert.equal(U.composeCover(mixed, {}), mixed);
});

test('composeCover is pure and deterministic', () => {
  const input = [cand(CALM[0]), cand(FAILS_THIRD[0]), cand(CALM[1])];
  const snapshot = JSON.stringify(input);
  const a = U.composeCover(input, Art.PANEL_REVIEWS), b = U.composeCover(input, Art.PANEL_REVIEWS);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(input), snapshot);
});

test('the problem list: marsh, tavern, ship becomes marsh + ship, two equal panels', () => {
  const c = cover('shadowfen', 'teal-heart-inn', 'port-city', 'ocean-voyage', 'outpost-town', 'dread-mire');
  assert.equal(c.layout, 2);
  assert.deepEqual(ids(c), ['archetype:blighted-mires', 'archetype:seafaring']);
});

test('Darkheart-style calm triptychs are preserved', () => {
  const dark = cover('gloaming-forest', 'witchs-hut', 'abandoned-grove', 'spooky-forest');
  assert.equal(dark.layout, 3);
  assert.deepEqual(ids(dark), ['archetype:sinister-woods', 'biome:forest', 'archetype:forgotten-ruins']);
  assert.equal(cover('cloudy-sky', 'arctic', 'great-plains').layout, 3);
  assert.equal(cover('cauldera-valley', 'ancient-tomb', 'ocean-voyage').layout, 3); /* a painting + thematic pictures */
  assert.equal(cover('bustling-marketplace', 'resting-dagger-inn', 'harsh-desert', 'arctic').layout, 3); /* a calm crop + two biomes */
});

test('crowded sets: three interiors, a dense street with landscapes, a campaign mix', () => {
  const interiors = cover('bustling-marketplace', 'civic-library', 'local-tavern');
  assert.equal(interiors.layout, 2);
  const street = cover('outpost-town', 'arctic', 'harsh-desert'); /* streets-and-towns fails at a third */
  assert.ok(ids(street).length === 3 || !ids(street).includes('archetype:streets-and-towns'));
  const campaign = cover('harsh-desert', 'arctic', 'ancient-tomb', 'castle-siege', 'fighting-arena', 'library-of-the-dusk-tree', 'jungle', 'haunted-city', 'thunderstorm', 'deadly-dungeon', 'thieves-guild', 'magic-city');
  assert.equal(campaign.layout, 2);
});

test('survivors are distinct, drawn from the unchanged selector, shown in catalogue order', () => {
  const lists = [
    ['shadowfen', 'teal-heart-inn', 'port-city', 'ocean-voyage'],
    ['bustling-marketplace', 'civic-library', 'local-tavern'],
    ['gloaming-forest', 'witchs-hut', 'abandoned-grove', 'spooky-forest'],
  ];
  lists.forEach(l => {
    const recs = l.map(id => ({ id, artBiome: artBiome(BY_ID[id]) }));
    const c = U.coverForEnvironments(recs, Art);
    const resolved = recs.map(r => U.resolveEnvironmentArt(r, Art)).filter(Boolean).map(r => r.imageId);
    assert.equal(new Set(ids(c)).size, ids(c).length, 'no image twice');
    ids(c).forEach(id => assert.ok(resolved.includes(id), id + ' was never resolved for the list'));
    const first = ids(c).map(id => resolved.indexOf(id));
    assert.deepEqual(first, [...first].sort((a, b) => a - b), 'catalogue order of first member');
    assert.deepEqual(ids(U.coverForEnvironments(recs, Art)), ids(c), 'deterministic');
  });
});

test('parent-family dedup still precedes the decision: two crops of one painting are one candidate', () => {
  const c = cover('bustling-marketplace', 'resting-dagger-inn', 'outpost-town', 'ancient-tomb');
  assert.equal(c.layout, 2);
  assert.equal(ids(c).filter(id => /streets-and-towns|market-stalls|tavern-terrace/.test(id)).length, 1);
});

test('0, 1 and 2 pictures keep the layouts they had; the environment count is not the picture count', () => {
  assert.equal(cover().layout, 0);
  assert.equal(cover('dragons-lair').layout, 1);
  assert.equal(cover('ancient-tomb', 'ocean-voyage').layout, 2);
  assert.equal(cover('ruined-castle', 'forgotten-temple-of-the-serpent', 'moon-kingdom', 'ruined-mage-tower', 'mistfield-of-possibility', 'abandoned-grove', 'ancient-city', 'ancient-power-conduit', 'korathi-temple').layout, 1);
  /* two interiors only: untouched even though both fail at a third (there is no triptych to thin) */
  assert.equal(cover('civic-library', 'local-tavern').layout, 2);
});

test('image and tile data are the existing ones: same derivative records, no new layout or field', () => {
  const c = cover('shadowfen', 'teal-heart-inn', 'ocean-voyage');
  c.tiles.forEach(t => {
    assert.deepEqual(Object.keys(t).sort(), ['count', 'image', 'imageId', 'kind']);
    assert.equal(t.image, Art.IMAGES[t.imageId]);
  });
  assert.equal(U.COVER_MAX, 3);
});

test('integration stays inside My Lists: no other surface and no storage reads the panel reviews', () => {
  ['js/catalog-art.js', 'js/prep-art.js', 'js/safe-storage.js', 'js/list-utils.js', 'js/list-cover-art.js']
    .forEach(f => { if (f !== 'js/list-cover-art.js') assert.doesNotMatch(read(f), /PANEL_REVIEWS|composeCover/, f); });
  fs.readdirSync(path.join(ROOT, 'js')).filter(f => /journey/.test(f)).forEach(f => assert.doesNotMatch(read('js/' + f), /PANEL_REVIEWS|composeCover/, f));
  assert.doesNotMatch(read('js/app.js'), /PANEL_REVIEWS/);
  assert.doesNotMatch(read('js/list-cover-utils.js'), /Math\.random|localStorage|document\.|window\./);
  /* production never loads the lab */
  ['js/app.js', 'js/list-cover-utils.js', 'js/list-cover-art.js', 'index.html'].forEach(f => assert.doesNotMatch(read(f), /lab\/cover-composition/, f));
  assert.match(read('css/styles.css'), /\.list-card-cover \{[^}]*height: 90px;/);
});
