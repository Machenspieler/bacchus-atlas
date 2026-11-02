/* ============================================================
   Bacchus's Atlas — tests/list-cover-utils.test.js
   The My Lists cover rules (js/list-cover-utils.js) against the real catalogue and
   the real registry: how one environment resolves, how a list's three pictures are
   chosen. Run with:  node --test tests/list-cover-utils.test.js
   ============================================================ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Art = require('../js/list-cover-art.js');
const U = require('../js/list-cover-utils.js');

const ROOT = path.join(__dirname, '..');
const ENVS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/environments.json'), 'utf8')).environments;
const BY_ID = Object.fromEntries(ENVS.map(e => [e.id, e]));

/* The same rule as artBiome() in js/app.js: the first biome that survives dropping the
 * generic ones in turn, while more than one is left. */
const GENERIC = ['universal', 'settlement'];
function artBiome(env) {
  let pool = [...(env.biomes || [])];
  for (const g of GENERIC) { if (pool.length < 2) break; pool = pool.filter(b => b !== g); }
  return pool[0] || null;
}
const rec = id => ({ id, artBiome: artBiome(BY_ID[id]) });
const cover = (...ids) => U.coverForEnvironments(ids.map(rec));
const imageIds = c => c.tiles.map(t => t.imageId);
const idsWhere = pred => ENVS.filter(pred).map(e => e.id);

test('app.js keeps the artBiome rule this file mirrors', () => {
  const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  assert.match(app, /const GENERIC_BIOMES = \['universal', 'settlement'\];/);
});

/* ---- one environment ---- */

test('a unique painting beats every other source', () => {
  for (const id of Art.UNIQUE_ENV_IDS) {
    assert.deepEqual(U.resolveEnvironmentArt(rec(id)), { imageId: 'env:' + id, kind: 'unique', fit: null });
  }
  /* even for an environment that is also in ARCHETYPE_FIT */
  const art = { ...Art, UNIQUE_ENV_IDS: ['cursed-graveyard'], IMAGES: { ...Art.IMAGES, 'env:cursed-graveyard': { ...Art.IMAGES['env:cauldera-valley'], id: 'env:cursed-graveyard' } } };
  assert.equal(U.resolveEnvironmentArt(rec('cursed-graveyard'), art).kind, 'unique');
});

test('a strong archetype match uses the archetype picture, graded strong', () => {
  assert.deepEqual(U.resolveEnvironmentArt(rec('cursed-graveyard')), { imageId: 'archetype:haunted-and-deathly', kind: 'archetype', fit: 'strong' });
  assert.equal(U.resolveEnvironmentArt(rec('archmages-tower')).fit, 'strong');
});

test('an acceptable archetype match is used and graded acceptable', () => {
  assert.deepEqual(U.resolveEnvironmentArt(rec('vampires-castle')), { imageId: 'archetype:haunted-and-deathly', kind: 'archetype', fit: 'acceptable' });
});

test('a misleading archetype match falls back to the biome picture', () => {
  assert.deepEqual(U.resolveEnvironmentArt(rec('deserted-moor')), { imageId: 'biome:rolling', kind: 'biome', fit: null });
  assert.equal(U.resolveEnvironmentArt(rec('wispy-wasteland')).imageId, 'biome:rolling');
  /* misleading for the haunted / ruins pictures, but a fit for a later one (phase 4) */
  assert.equal(U.resolveEnvironmentArt(rec('haunted-mountain-pass')).imageId, 'archetype:perilous-passages');
  assert.equal(U.resolveEnvironmentArt(rec('swamp-ruins')).imageId, 'archetype:blighted-mires');
});

test('an environment with no archetype entry uses its biome', () => {
  assert.equal(U.resolveEnvironmentArt(rec('harsh-desert')).imageId, 'biome:drylands');
});

test('a missing archetype or biome asset falls through, down to nothing', () => {
  const without = prefix => ({ ...Art, IMAGES: Object.fromEntries(Object.entries(Art.IMAGES).filter(([k]) => !k.startsWith(prefix))) });
  /* no archetype pictures: a Gothic castle on a mountain pass is just a mountain */
  assert.equal(U.resolveEnvironmentArt(rec('vampires-castle'), without('archetype:')).imageId, 'biome:mountain');
  /* no biome pictures either: nothing, so the list gets the neutral cover rather than a broken image */
  assert.equal(U.resolveEnvironmentArt(rec('harsh-desert'), without('biome:')), null);
  assert.equal(U.resolveEnvironmentArt(rec('cursed-graveyard'), { ...Art, IMAGES: {} }), null);
  /* a registered archetype whose variant index points nowhere also falls through */
  const badVariant = { ...Art, ARCHETYPE_FIT: { 'vampires-castle': ['haunted-and-deathly', 'strong', 5] } };
  assert.equal(U.resolveEnvironmentArt(rec('vampires-castle'), badVariant).imageId, 'biome:mountain');
});

test('universal and settlement environments get no picture, so none is invented', () => {
  /* Phase 2: a universal event the audit judged to fit a picture (a tornado) is explicit, like a harbour. */
  const universal = idsWhere(e => artBiome(e) === 'universal' && !Art.ARCHETYPE_FIT[e.id]);
  assert.ok(universal.length >= 30);
  for (const id of universal) assert.equal(U.resolveEnvironmentArt(rec(id)), null, id);
  const settlementOnly = idsWhere(e => artBiome(e) === 'settlement' && !Art.ARCHETYPE_FIT[e.id] && !Art.ENV_IMAGE_OVERRIDES[e.id]);
  assert.ok(settlementOnly.length >= 50);
  for (const id of settlementOnly) assert.equal(U.resolveEnvironmentArt(rec(id)), null, id);
});

test('the harbour illustration is used only where the environment is a harbour', () => {
  const harbour = ENVS.filter(e => { const r = U.resolveEnvironmentArt(rec(e.id)); return r && r.imageId === 'biome:settlement'; }).map(e => e.id);
  assert.deepEqual(harbour.sort(), Object.keys(Art.ENV_IMAGE_OVERRIDES).sort());
});

test('unknown and malformed environments resolve to nothing', () => {
  assert.equal(U.resolveEnvironmentArt(null), null);
  assert.equal(U.resolveEnvironmentArt({}), null);
  assert.equal(U.resolveEnvironmentArt({ id: 'no-such-environment', artBiome: 'no-such-biome' }), null);
  assert.equal(U.resolveEnvironmentArt({ id: 'no-such-environment', artBiome: 'forest' }).imageId, 'biome:forest');
});

test('every catalogue environment resolves without throwing, to a registered picture or nothing', () => {
  for (const e of ENVS) {
    const r = U.resolveEnvironmentArt(rec(e.id));
    if (r) assert.ok(Art.IMAGES[r.imageId], e.id);
  }
});

test('how many environments each source serves (documented in the implementation report)', () => {
  const tally = { unique: 0, 'archetype:strong': 0, 'archetype:acceptable': 0, biome: 0, none: 0 };
  for (const e of ENVS) {
    const r = U.resolveEnvironmentArt(rec(e.id));
    tally[!r ? 'none' : r.kind === 'archetype' ? 'archetype:' + r.fit : r.kind] += 1;
  }
  assert.equal(tally.unique, 3);
  assert.equal(tally['archetype:strong'] + tally['archetype:acceptable'], Object.keys(Art.ARCHETYPE_FIT).length);
  assert.equal(Object.values(tally).reduce((a, b) => a + b, 0), ENVS.length);
});

/* ---- a list ---- */

test('empty list and a list of nothing drawable: layout 0, the neutral cover', () => {
  assert.deepEqual(U.coverForEnvironments([]), { layout: 0, tiles: [] });
  assert.equal(U.coverForEnvironments(undefined).layout, 0);
  assert.equal(cover('surrounded', 'mounted-escape').layout, 0);
});

test('one environment: one tile, for each kind of source', () => {
  assert.deepEqual(imageIds(cover('cauldera-valley')), ['env:cauldera-valley']);
  assert.deepEqual(imageIds(cover('cursed-graveyard')), ['archetype:haunted-and-deathly']);
  assert.deepEqual(imageIds(cover('harsh-desert')), ['biome:drylands']);
  assert.equal(cover('cauldera-valley').layout, 1);
});

test('two distinct pictures: two tiles; three: three; never more', () => {
  assert.equal(cover('cursed-graveyard', 'harsh-desert').layout, 2);
  assert.equal(cover('cauldera-valley', 'field-of-dreams', 'ouroborean-pass').layout, 3);
  const many = idsWhere(e => U.resolveEnvironmentArt(rec(e.id)));
  assert.ok(many.length > 100);
  assert.equal(cover(...many).layout, 3);
  assert.equal(cover(...many).tiles.length, 3);
});

test('three unique paintings keep the old triptych: all three, in catalogue order', () => {
  const inCatalogue = ENVS.map(e => e.id).filter(id => Art.UNIQUE_ENV_IDS.includes(id));
  assert.deepEqual(imageIds(cover(...inCatalogue)), inCatalogue.map(id => 'env:' + id));
});

test('an image shared by several environments is one candidate, never repeated', () => {
  const forests = idsWhere(e => artBiome(e) === 'forest' && !Art.ARCHETYPE_FIT[e.id]).slice(0, 5);
  assert.equal(forests.length, 5);
  const c = cover(...forests);
  assert.deepEqual(imageIds(c), ['biome:forest']);
  assert.equal(c.tiles[0].count, 5);
  assert.equal(c.layout, 1);
});

test('ten environments of one archetype: the archetype picture once, plus the distinct pictures its misfits resolve to', () => {
  const haunted = Object.keys(Art.ARCHETYPE_FIT).filter(id => Art.ARCHETYPE_FIT[id][0] === 'haunted-and-deathly');
  assert.equal(haunted.length, 10);
  const c = cover(...haunted);
  assert.deepEqual(imageIds(c), ['archetype:haunted-and-deathly']);
  assert.equal(new Set(imageIds(c)).size, c.tiles.length);
});

test('a list of ten across biomes shows three representative, different pictures, not the first three members', () => {
  const pick = (b, n) => idsWhere(e => artBiome(e) === b && !Art.ARCHETYPE_FIT[e.id] && !Art.UNIQUE_ENV_IDS.includes(e.id)).slice(0, n);
  const ids = [...pick('forest', 5), ...pick('drylands', 3), ...pick('underground', 2)];
  const c = cover(...ids);
  assert.deepEqual(imageIds(c), ['biome:forest', 'biome:drylands', 'biome:underground']);
  assert.deepEqual(c.tiles.map(t => t.count), [5, 3, 2]);
  /* the first three members are all forests; a first-three rule would show one picture */
  assert.equal(new Set(ids.slice(0, 3).map(id => artBiome(BY_ID[id]))).size, 1);
});

test('priority when more than three candidates compete: painting, strong, then coverage-boosted biome over a lone acceptable one', () => {
  const forests = idsWhere(e => artBiome(e) === 'forest' && !Art.ARCHETYPE_FIT[e.id]).slice(0, 6);
  const deserts = idsWhere(e => artBiome(e) === 'drylands').slice(0, 1);
  const ids = ['cauldera-valley', 'cursed-graveyard', 'vampires-castle', ...deserts, ...forests];
  /* candidates: painting 100, haunted (strong + acceptable share one image, count 2) 60+, desert 40+, forest 40+ larger share */
  const c = cover(...ids);
  assert.equal(c.layout, 3);
  assert.ok(imageIds(c).includes('env:cauldera-valley'));
  assert.ok(imageIds(c).includes('archetype:haunted-and-deathly'));
  assert.ok(imageIds(c).includes('biome:forest'), 'the dominant biome outranks a one-environment biome');
  assert.ok(!imageIds(c).includes('biome:drylands'));
});

test('a painting keeps its place even when it stands for one environment among many', () => {
  const forests = idsWhere(e => artBiome(e) === 'forest' && !Art.ARCHETYPE_FIT[e.id]).slice(0, 8);
  const mountains = idsWhere(e => artBiome(e) === 'mountain' && !Art.ARCHETYPE_FIT[e.id]).slice(0, 4);
  const c = cover(...forests, ...mountains, 'ouroborean-pass');
  assert.ok(imageIds(c).includes('env:ouroborean-pass'));
});

test('mixed priorities show unique, archetype and biome tiles together', () => {
  const c = cover('field-of-dreams', 'archmages-tower', 'harsh-desert');
  assert.deepEqual(c.tiles.map(t => t.kind).sort(), ['archetype', 'biome', 'unique']);
});

test('environments with no honest picture add nothing and are never padded with an unrelated one', () => {
  const c = cover('surrounded', 'cursed-graveyard', 'mounted-escape', 'lost-village');
  assert.deepEqual(imageIds(c), ['archetype:haunted-and-deathly']);
  assert.equal(c.layout, 1);
});

test('deterministic: the same list gives the same cover however often and whatever the cache', () => {
  const ids = idsWhere(e => U.resolveEnvironmentArt(rec(e.id))).slice(0, 40);
  const first = JSON.stringify(cover(...ids).tiles.map(t => [t.imageId, t.count]));
  const cache = new Map();
  for (let i = 0; i < 5; i++) {
    assert.equal(JSON.stringify(U.coverForEnvironments(ids.map(rec), Art, cache).tiles.map(t => [t.imageId, t.count])), first);
  }
  assert.equal(cache.size, ids.length);
});

test('ties resolve by share, then first member, then image id — never by chance', () => {
  const r = (imageId) => ({ imageId, kind: 'biome', fit: null });
  /* four biome candidates of one environment each: the earliest three win, shown in that order */
  const four = U.selectCoverImages([r('biome:d'), r('biome:c'), r('biome:b'), r('biome:a')]);
  assert.deepEqual(four.tiles.map(t => t.imageId), ['biome:d', 'biome:c', 'biome:b']);
  /* a larger share beats an earlier member: the second 'd' pushes it past 'c' and 'b' */
  const share = U.selectCoverImages([r('biome:a'), r('biome:b'), r('biome:c'), r('biome:d'), r('biome:d')]);
  assert.deepEqual(share.tiles.map(t => t.imageId), ['biome:a', 'biome:b', 'biome:d']);
  /* the id is the last resort when share and first member are equal (a hand-built input with a repeated index) */
  assert.deepEqual(U.selectCoverImages([]).tiles, []);
});

test('catalogue order of the display follows each picture\'s first member, not its score', () => {
  const c = cover('harsh-desert', 'cauldera-valley');
  assert.deepEqual(imageIds(c), ['biome:drylands', 'env:cauldera-valley']);
});

test('changing a list changes its cover: adding, removing, and removing everything', () => {
  assert.deepEqual(imageIds(cover('harsh-desert')), ['biome:drylands']);
  assert.deepEqual(imageIds(cover('harsh-desert', 'cursed-graveyard')), ['biome:drylands', 'archetype:haunted-and-deathly']);
  assert.deepEqual(imageIds(cover('cursed-graveyard')), ['archetype:haunted-and-deathly']);
  assert.equal(cover().layout, 0);
});

test('missing environment references (null, no id, unknown id) never break a cover', () => {
  const c = U.coverForEnvironments([null, undefined, {}, { id: '' }, rec('harsh-desert'), { id: 'ghost' }]);
  assert.deepEqual(imageIds(c), ['biome:drylands']);
  assert.equal(U.coverForEnvironments([null, { id: 'ghost' }]).layout, 0);
});

test('a duplicated member counts once in the picture, twice in the share, and never repeats a tile', () => {
  const c = U.coverForEnvironments([rec('harsh-desert'), rec('harsh-desert')]);
  assert.equal(c.layout, 1);
  assert.equal(c.tiles[0].count, 2);
});

test('every tile carries its registry image, so rendering needs no lookup', () => {
  const c = cover('cauldera-valley', 'cursed-graveyard', 'harsh-desert');
  for (const t of c.tiles) assert.equal(t.image, Art.IMAGES[t.imageId]);
});

/* ---- Phase 2: seven more archetype pictures, conservatively mapped ---- */

const PHASE2 = {
  'storms-and-calamity': { strong: ['tornado', 'megastorm'], acceptable: ['thunderstorm', 'magical-storm', 'unbound-arcanostorm', 'green-doom-skies'] },
  'infernal-and-profane': { strong: ['circles-below-dis', 'fallen-citadel', 'prison-city-pyrrhexis'], acceptable: ['infernal-railyard', 'the-metal-throne-of-sin'] },
  'drowned-depths': { strong: ['sunken-citadel', 'deep-one-city'], acceptable: ['drowned-sanctum'] },
  'strongholds-and-sieges': { strong: ['castle-siege'], acceptable: ['defense-of-the-river-fort'] },
  'monster-lairs': { strong: [], acceptable: ['dragons-lair'] },
  'cursed-and-blighted-lands': { strong: ['rewritten-grove'], acceptable: ['cursed-valley'] },
  'fey-and-enchanted': { strong: ['court-of-cats'], acceptable: ['fey-lands'] },
};
/* Same archetype in the taxonomy, wrong picture: each falls to its biome picture or nothing. */
const REJECTED = {
  'storms-and-calamity': ['volcanic-eruption', 'forest-wildfire', 'snow-squall', 'raging-fire', 'rain-ritual', 'stampede', 'flickerstorm', 'cloudy-sky', 'the-proving-pyre'],
  'infernal-and-profane': ['cult-ritual', 'darkened-temple', 'unhallowed-ground', 'moonlight-temple', 'divine-usurpation', 'demonic-abyss', 'the-profane-ascendancy'],
  'drowned-depths': ['shipwreck', 'realm-of-the-dead', 'undersea-trench', 'umbral-basin', 'fathomless-baths-deeps', 'fathomless-baths-surface'],
  'strongholds-and-sieges': ['fortress', 'bandit-hideout', 'bandit-attack', 'capital-ship-assault', 'occupied-town', 'pitched-battle', 'hold-the-line', 'sovereignty-outpost'],
  'monster-lairs': ['acid-burrows', 'astral-mound', 'webbed-terrain', 'thrumming-hives', 'rats-nest-tavern', 'escape-the-swarm', 'scorching-dungeon', 'progenitor-minds-lair'],
  'cursed-and-blighted-lands': ['devouring-green', 'heart-of-the-mire', 'green-doom-tangle', 'obsidian-forest', 'rimefouled-wastes', 'valley-of-ruination', 'burning-heart-of-the-woods'],
  'fey-and-enchanted': ['court-of-hounds', 'faestone-wode', 'dark-forest-revel', 'witchs-hut', 'hags-hut', 'gloaming-forest', 'wishmaker-glade'],
};

test('phase 2: seven new archetype pictures are registered with files, one variant each', () => {
  for (const arch of Object.keys(PHASE2)) {
    assert.deepEqual(Art.ARCHETYPES[arch].variants, ['archetype:' + arch], arch);
    assert.equal(Art.IMAGES['archetype:' + arch].kind, 'archetype');
  }
});

test('phase 2: the audited environments resolve to their picture with the audited grade', () => {
  for (const [arch, grades] of Object.entries(PHASE2)) {
    for (const [fit, ids] of Object.entries(grades)) {
      for (const id of ids) {
        assert.deepEqual(U.resolveEnvironmentArt(rec(id)), { imageId: 'archetype:' + arch, kind: 'archetype', fit }, id);
      }
    }
  }
  const mapped = Object.keys(Art.ARCHETYPE_FIT).filter(id => Object.values(PHASE2).some(g => [...g.strong, ...g.acceptable].includes(id)));
  assert.equal(mapped.length, 21);
});

test('phase 2: rejected environments never get the new picture and still fall back honestly', () => {
  const newIds = new Set(Object.keys(PHASE2).map(a => 'archetype:' + a));
  for (const ids of Object.values(REJECTED)) {
    for (const id of ids) {
      assert.ok(BY_ID[id], id);
      const later = Art.ARCHETYPE_FIT[id] && PHASE4[Art.ARCHETYPE_FIT[id][0]];
      assert.ok(!Art.ARCHETYPE_FIT[id] || later, id);
      const r = U.resolveEnvironmentArt(rec(id));
      assert.ok(!r || !newIds.has(r.imageId), id);
      /* the fallback is the biome picture, or nothing for universal / settlement — unless a phase 4 picture fits */
      if (r && !later) assert.equal(r.kind, 'biome', id);
    }
  }
  assert.equal(U.resolveEnvironmentArt(rec('forest-wildfire')).imageId, 'biome:forest');
  assert.equal(U.resolveEnvironmentArt(rec('volcanic-eruption')).imageId, 'biome:badlands');
  assert.equal(U.resolveEnvironmentArt(rec('snow-squall')).imageId, 'biome:frozen');
  assert.equal(U.resolveEnvironmentArt(rec('raging-fire')), null);
  assert.equal(U.resolveEnvironmentArt(rec('acid-burrows')).imageId, 'biome:underground');
});

test('phase 2: a unique painting still outranks the fey picture, and the original four are unchanged', () => {
  for (const id of ['cauldera-valley', 'field-of-dreams', 'ouroborean-pass']) assert.equal(U.resolveEnvironmentArt(rec(id)).kind, 'unique', id);
  assert.equal(Art.ARCHETYPE_FIT['cauldera-valley'], undefined);
  assert.equal(Art.ARCHETYPE_FIT['field-of-dreams'], undefined);
  assert.equal(U.resolveEnvironmentArt(rec('cursed-graveyard')).imageId, 'archetype:haunted-and-deathly');
  assert.equal(U.resolveEnvironmentArt(rec('ruined-castle')).imageId, 'archetype:forgotten-ruins');
  assert.equal(U.resolveEnvironmentArt(rec('archmages-tower')).imageId, 'archetype:arcane-sanctums');
  assert.equal(U.resolveEnvironmentArt(rec('grand-feast')).imageId, 'archetype:feasts-and-revelry');
});

/* Phase 4 — the last fourteen pictures; defined here because the older audits above must not mistake a later fit for a mismatch. */
const PHASE4 = {
  'crypts-and-tombs': { strong: ['heros-tomb', 'hallow-rest'], acceptable: ['necromancers-ossuary', 'ancient-tomb', 'endless-catacombs', 'catacomb-tunnels'] },
  'taverns-and-inns': { strong: ['teal-heart-inn', 'local-tavern'], acceptable: ['the-wandering-tavern', 'the-squealing-boar-tavern-brawl'] },
  'blighted-mires': { strong: ['shadowfen', 'corrupted-swamp', 'wretched-mire', 'dread-mire'], acceptable: ['buzzing-swamp', 'blood-marsh', 'heart-of-the-mire', 'swamp-ruins', 'beelzebufo-bog'] },
  'archives-and-libraries': { strong: ['library-of-the-dusk-tree'], acceptable: ['civic-library', 'neverhome-library'] },
  'planar-rifts': { strong: ['stop-the-collapse-of-reality', 'extraplanar-breach'], acceptable: ['portal-beyond', 'planar-incursion-invasion', 'planar-incursion-arcane-vortex', 'shattered-lands'] },
  'arenas-and-duels': { strong: ['fighting-arena'], acceptable: ['the-proving-pyre'] },
  'chase-and-ambush': { strong: [], acceptable: ['ambushed', 'ambushers', 'road-blockade'] },
  'intrigue-and-underworld': { strong: [], acceptable: ['gang-hideout', 'thieves-guild'] },
  'time-and-dream': { strong: [], acceptable: ['time-loop', 'time-loop-atlas'] },
  'dungeon-delves': { strong: ['deadly-dungeon', 'dangerous-dungeon'], acceptable: [] },
  'perilous-passages': { strong: ['mountain-pass'], acceptable: ['cliffside-ascent', 'perilous-cliff', 'haunted-mountain-pass'] },
  seafaring: { strong: ['ocean-voyage'], acceptable: ['terror-of-the-deep'] },
  'sinister-woods': { strong: ['unsettling-forest', 'spooky-forest', 'gnarled-glen'], acceptable: ['gloaming-forest', 'devouring-green'] },
  'sky-realms': { strong: ['floating-mountains'], acceptable: ['stones-adrift', 'cloudy-sky'] },
};

/* Phase 3 — the V2 pictures, mapped one environment at a time (docs/research/adaptive-list-covers-phase3.md). */
const PHASE3 = {
  starfaring: { strong: [], acceptable: ['planetary-blockade'] },
  'sacred-sanctuaries': { strong: ['hallowed-temple'], acceptable: ['hallowed-cathedral'] },
  'streets-and-towns': { strong: ['bustling-marketplace', 'resting-dagger-inn'], acceptable: ['emberwood-village', 'outpost-town', 'street-chase'] },
};
/* in the taxonomy (or plausible by name), judged poor against the actual picture */
const PHASE3_REJECTED = [
  'sovereignty-outpost', 'operations-center', 'sovereignty-base', 'conclave-hall', 'capital-ship-assault', 'capital-ship-high-alert', 'capital-ship-infiltration',
  'asteroid-chase', 'stream-fold', 'canyon-dogfight', 'lunar-surface', 'cosmic-crash', 'planetary-invasion', 'archons-throne-room', 'trading-post',
  'moonlight-temple', 'darkened-temple', 'mystic-ring', 'throne-of-three', 'blade-root-sanctum', 'hallow-rest', 'martyrs-rest', 'humble-altar',
  'chapel-of-st-brenna', 'garden-of-the-tranquil-order', 'divine-audience', 'divine-usurpation', 'the-profane-ascendancy', 'sanctuary-of-the-story-tree', 'moonlight-bastion',
  'chaotic-marketplace', 'city-streets', 'city-festival', 'town-festival', 'rooftop-chase', 'bankburgh-chase', 'lizardfolk-village', 'jungle-river-village',
  'the-village-of-hush', 'drakkenheim-outer-city', 'lost-village', 'occupied-town', 'bastion', 'the-undermarket', 'gang-hideout', 'den-of-vice-and-violence',
  'haunted-city', 'ancient-city', 'civic-library', 'arcane-magic-shop', 'upscale-casino', 'the-garden', 'city-travel',
];

test('phase 3: registration, exact grade per approved environment, and the V2 picture it resolves to', () => {
  for (const [arch, grades] of Object.entries(PHASE3)) {
    assert.ok(Art.ARCHETYPES[arch]);
    for (const fit of ['strong', 'acceptable']) {
      for (const id of grades[fit]) {
        assert.deepEqual(Art.ARCHETYPE_FIT[id], [arch, fit], id);
        const r = U.resolveEnvironmentArt(rec(id));
        assert.deepEqual(r, { imageId: 'archetype:' + arch, kind: 'archetype', fit }, id);
      }
    }
  }
  const mapped = Object.values(PHASE3).flatMap(g => [...g.strong, ...g.acceptable]);
  const inFit = Object.entries(Art.ARCHETYPE_FIT).filter(([, f]) => PHASE3[f[0]]).map(([id]) => id);
  assert.deepEqual(inFit.sort(), mapped.sort(), 'nothing is mapped to a Phase 3 picture without being reviewed here');
});

test('phase 3: poor matches stay out of ARCHETYPE_FIT and fall back to their biome picture or none', () => {
  for (const id of PHASE3_REJECTED) {
    assert.ok(BY_ID[id], id);
    const f = Art.ARCHETYPE_FIT[id];
    assert.ok(!f || !PHASE3[f[0]], `${id} must not get a Phase 3 picture`);
    const r = U.resolveEnvironmentArt(rec(id));
    assert.ok(!r || !/starfaring|sacred-sanctuaries|streets-and-towns/.test(r.imageId), id);
  }
  /* sharing a taxonomy archetype is never enough */
  assert.equal(U.resolveEnvironmentArt(rec('capital-ship-assault')), null);
  assert.equal(U.resolveEnvironmentArt(rec('stream-fold')), null);
  assert.equal(U.resolveEnvironmentArt(rec('canyon-dogfight')).imageId, 'biome:drylands');
  assert.equal(U.resolveEnvironmentArt(rec('moonlight-temple')).imageId, 'biome:drylands');
  assert.equal(U.resolveEnvironmentArt(rec('mystic-ring')).imageId, 'biome:rolling');
  assert.equal(U.resolveEnvironmentArt(rec('throne-of-three')).imageId, 'biome:forest');
  assert.equal(U.resolveEnvironmentArt(rec('city-streets')), null);
  assert.equal(U.resolveEnvironmentArt(rec('lizardfolk-village')).imageId, 'biome:wetland');
});

test('phase 3: existing mappings, overrides and paintings are untouched', () => {
  assert.equal(U.resolveEnvironmentArt(rec('korathi-temple')).imageId, 'archetype:forgotten-ruins');
  assert.equal(U.resolveEnvironmentArt(rec('magic-city')) && U.resolveEnvironmentArt(rec('magic-city')).imageId, 'archetype:arcane-sanctums');
  assert.equal(U.resolveEnvironmentArt(rec('circles-below-dis')).imageId, 'archetype:infernal-and-profane');
  assert.equal(U.resolveEnvironmentArt(rec('drowned-sanctum')).imageId, 'archetype:drowned-depths');
  assert.equal(U.resolveEnvironmentArt(rec('defense-of-the-river-fort')).imageId, 'archetype:strongholds-and-sieges');
  assert.equal(U.resolveEnvironmentArt(rec('port-city')).imageId, 'biome:settlement');
  for (const id of ['cauldera-valley', 'field-of-dreams', 'ouroborean-pass']) assert.equal(U.resolveEnvironmentArt(rec(id)).kind, 'unique', id);
});

test('phase 3: collages with the new pictures are distinct, at most three, deterministic and ranked by fit', () => {
  const c = cover('bustling-marketplace', 'hallowed-temple', 'planetary-blockade', 'cursed-graveyard');
  assert.equal(c.layout, 3);
  assert.equal(new Set(imageIds(c)).size, 3);
  /* a strong thematic picture beats an acceptable one; the acceptable starfaring picture still beats a biome */
  assert.deepEqual(imageIds(cover('planetary-blockade', 'harsh-desert')), ['archetype:starfaring', 'biome:drylands']);
  /* same picture for several members is one tile */
  const same = cover('bustling-marketplace', 'resting-dagger-inn', 'emberwood-village', 'outpost-town');
  assert.deepEqual(imageIds(same), ['archetype:streets-and-towns']);
  assert.equal(same.tiles[0].count, 4);
  /* a painting always wins its place; the new pictures never push it out */
  const withPainting = cover('field-of-dreams', 'hallowed-temple', 'bustling-marketplace', 'planetary-blockade', 'tornado');
  assert.ok(imageIds(withPainting).includes('env:field-of-dreams'));
  assert.equal(withPainting.layout, 3);
  assert.deepEqual(imageIds(cover('bustling-marketplace', 'hallowed-temple', 'planetary-blockade', 'cursed-graveyard')), imageIds(c));
  /* a rejected urban or sacred member adds no new-picture tile */
  assert.equal(cover('city-streets', 'capital-ship-assault', 'darkened-temple').layout, 0);
});

test('phase 3: a missing picture falls through to the next source instead of a broken image', () => {
  const partial = { ...Art, IMAGES: Object.fromEntries(Object.entries(Art.IMAGES).filter(([id]) => id !== 'archetype:streets-and-towns')) };
  assert.equal(U.resolveEnvironmentArt(rec('bustling-marketplace'), partial), null);
  assert.equal(U.resolveEnvironmentArt(rec('emberwood-village'), partial), null);
  assert.equal(U.resolveEnvironmentArt(rec('hallowed-temple'), partial).imageId, 'archetype:sacred-sanctuaries');
});

test('phase 2: a same-archetype list does not paint every member with the tornado', () => {
  const c = cover('tornado', 'forest-wildfire', 'volcanic-eruption');
  assert.deepEqual(imageIds(c), ['archetype:storms-and-calamity', 'biome:forest', 'biome:badlands']);
  const two = cover('thunderstorm', 'tornado', 'megastorm');
  assert.deepEqual(imageIds(two), ['archetype:storms-and-calamity']);
  assert.equal(two.tiles[0].count, 3);
});

test('phase 2: mixed lists keep up to three distinct pictures, deterministic, painting first', () => {
  const ids = ['cauldera-valley', 'tornado', 'castle-siege', 'sunken-citadel', 'rewritten-grove', 'cursed-graveyard', 'dragons-lair', 'circles-below-dis'];
  const a = cover(...ids), b = cover(...ids.slice().reverse().reverse());
  assert.deepEqual(imageIds(a), imageIds(b));
  assert.equal(a.layout, 3);
  assert.equal(new Set(imageIds(a)).size, 3);
  assert.ok(imageIds(a).includes('env:cauldera-valley'));
  assert.deepEqual(imageIds(cover(...ids.slice(1))).length, 3);
});

test('phase 2: a ten-member list of one new archetype plus others never repeats a tile', () => {
  const c = cover('tornado', 'megastorm', 'thunderstorm', 'magical-storm', 'unbound-arcanostorm', 'green-doom-skies', 'circles-below-dis', 'fallen-citadel', 'sunken-citadel', 'deep-one-city');
  assert.equal(new Set(imageIds(c)).size, imageIds(c).length);
  assert.ok(c.layout <= 3);
  assert.ok(imageIds(c).includes('archetype:storms-and-calamity'));
});

/* ---- Phase 4: the complete library, mapped one environment at a time (docs/research/adaptive-list-covers-complete-library.md) ---- */

/* in the taxonomy (primary or secondary), or plausible by name/lore, judged Poor against the actual picture */
const PHASE4_REJECTED = {
  'crypts-and-tombs': ['cursed-graveyard', 'desecrated-graveyard', 'martyrs-rest', 'titan-boneyard', 'chapel-of-st-brenna', 'para-lichs-archive'],
  'taverns-and-inns': ['jazz-speakeasy', 'rats-nest-tavern', 'the-dungeoneer', 'den-of-vice-and-violence', 'trading-post'],
  'blighted-mires': ['sentient-ink-marsh', 'chronon-pools', 'lizardfolk-village', 'wispy-wasteland'],
  'archives-and-libraries': ['the-waking-archives', 'para-lichs-archive', 'forum-between-worlds', 'museum-of-lost-realities', 'haunted-oratorium'],
  'planar-rifts': ['chaos-realm', 'shadow-well', 'interdimensional-building', 'astral-realm', 'convergence-city-of-portals', 'the-shifting-city', 'shard-field', 'body'],
  'arenas-and-duels': ['fighting-pit', 'duel', 'epic-duel', 'quickdraw', 'high-noon', 'racetrack', 'obstacle-course', 'deathrace', 'frozen-chalice'],
  'chase-and-ambush': ['rooftop-chase', 'bankburgh-chase', 'pursued', 'pursuers', 'mounted-escape', 'mounted-pursuit', 'stagecoach-ambush', 'rifle-canyon-run', 'mounted-train-chase', 'asteroid-chase', 'canyon-dogfight', 'hakturi-ambush'],
  'intrigue-and-underworld': ['the-undermarket', 'den-of-vice-and-violence', 'imperial-court', 'corrupt-court', 'heist', 'bank-heist', 'murder-mystery', 'jazz-speakeasy', 'conclave-hall'],
  'time-and-dream': ['dreamlands', 'prophetic-nightmare', 'city-out-of-time', 'time-court', 'chronon-pools', 'flickerstorm', 'astral-realm'],
  'dungeon-delves': ['scorching-dungeon', 'chthon-verlies', 'underroot-tunnels', 'abandoned-mine', 'haunted-gold-mine', 'collapsing-floor', 'corridor-of-flammable-air', 'the-endless-song', 'the-dungeoneer'],
  'perilous-passages': ['raging-river', 'frozen-lake', 'orphanmaker-river', 'lion-ascendant', 'empty-cliffside-village', 'yifangs-blackened-sands'],
  seafaring: ['the-skyship-windfall', 'horizon-lake', 'shipwreck', 'beach-day', 'castle-of-wails', 'umbral-basin', 'sand-sea'],
  'sinister-woods': ['witchs-hut', 'hags-hut', 'death-butterfly-grove', 'underroot-tunnels', 'court-of-hounds', 'burning-heart-of-the-woods', 'blade-root-sanctum', 'the-village-of-hush', 'bandit-hideout', 'endless-forest', 'green-doom-tangle', 'dark-forest-faerie-portal'],
  'sky-realms': ['lion-ascendant', 'the-garden', 'the-skyship-windfall', 'countess-rookery'],
};

test('phase 4: fourteen new archetype pictures are registered, one variant each', () => {
  assert.deepEqual(Object.keys(PHASE4).sort(), Object.keys(PHASE4_REJECTED).sort());
  for (const arch of Object.keys(PHASE4)) {
    assert.deepEqual(Art.ARCHETYPES[arch].variants, ['archetype:' + arch], arch);
    assert.equal(Art.IMAGES['archetype:' + arch].kind, 'archetype');
  }
});

test('phase 4: registration, exact grade per approved environment, and the picture it resolves to', () => {
  for (const [arch, grades] of Object.entries(PHASE4)) {
    for (const fit of ['strong', 'acceptable']) {
      for (const id of grades[fit]) {
        assert.ok(BY_ID[id], id);
        assert.deepEqual(Art.ARCHETYPE_FIT[id], [arch, fit], id);
        assert.deepEqual(U.resolveEnvironmentArt(rec(id)), { imageId: 'archetype:' + arch, kind: 'archetype', fit }, id);
      }
    }
  }
  const mapped = Object.values(PHASE4).flatMap(g => [...g.strong, ...g.acceptable]);
  const inFit = Object.entries(Art.ARCHETYPE_FIT).filter(([, f]) => PHASE4[f[0]]).map(([id]) => id);
  assert.deepEqual(inFit.sort(), mapped.sort(), 'nothing is mapped to a Phase 4 picture without being reviewed here');
  assert.equal(new Set(mapped).size, mapped.length, 'an environment has one picture');
  assert.equal(Object.keys(Art.ARCHETYPE_FIT).length, 66 - 2 + mapped.length, 'two moved (local-tavern, gnarled-glen), the rest are new');
});

test('phase 4: poor matches never get the picture they were judged against and fall back to biome art or none', () => {
  for (const [arch, ids] of Object.entries(PHASE4_REJECTED)) {
    for (const id of ids) {
      assert.ok(BY_ID[id], id);
      const f = Art.ARCHETYPE_FIT[id];
      assert.ok(!f || f[0] !== arch, `${id} must not get the ${arch} picture`);
      const r = U.resolveEnvironmentArt(rec(id));
      assert.ok(!r || r.imageId !== 'archetype:' + arch, id);
    }
  }
  /* the audit's own examples */
  assert.equal(U.resolveEnvironmentArt(rec('rooftop-chase')), null);                                  /* urban chase vs forest ambush */
  assert.equal(U.resolveEnvironmentArt(rec('duel')), null);                                           /* private duel vs arena */
  assert.equal(U.resolveEnvironmentArt(rec('lunar-surface')), null);                                  /* empty space vs spaceport */
  assert.equal(U.resolveEnvironmentArt(rec('humble-altar')), null);                            /* nature shrine vs Gothic statue */
  assert.notEqual((U.resolveEnvironmentArt(rec('the-garden')) || {}).imageId, 'archetype:sky-realms');        /* sky city vs floating islands */
  assert.notEqual((U.resolveEnvironmentArt(rec('lion-ascendant')) || {}).imageId, 'archetype:sky-realms');
  assert.notEqual((U.resolveEnvironmentArt(rec('cursed-valley')) || {}).imageId, 'archetype:planar-rifts');   /* cursed terrain vs rupture */
  assert.equal(U.resolveEnvironmentArt(rec('shipwreck')).imageId, 'biome:aquatic');                   /* wreck vs sailing ship */
  assert.equal(U.resolveEnvironmentArt(rec('raging-river')).imageId, 'biome:aquatic');
});

test('phase 4: the two moves are explicit, every earlier mapping is otherwise untouched', () => {
  assert.deepEqual(Art.ARCHETYPE_FIT['local-tavern'], ['taverns-and-inns', 'strong']);
  assert.deepEqual(Art.ARCHETYPE_FIT['gnarled-glen'], ['sinister-woods', 'strong']);
  assert.deepEqual(Art.ARCHETYPE_FIT['resting-dagger-inn'], ['streets-and-towns', 'strong']);
  assert.deepEqual(Art.ARCHETYPE_FIT['street-chase'], ['streets-and-towns', 'acceptable']);
  assert.equal(U.resolveEnvironmentArt(rec('rewritten-grove')).imageId, 'archetype:cursed-and-blighted-lands');
  assert.equal(U.resolveEnvironmentArt(rec('cursed-valley')).imageId, 'archetype:cursed-and-blighted-lands');
  assert.equal(U.resolveEnvironmentArt(rec('port-city')).imageId, 'biome:settlement');
  assert.equal(U.resolveEnvironmentArt(rec('cursed-graveyard')).imageId, 'archetype:haunted-and-deathly');
  assert.equal(U.resolveEnvironmentArt(rec('stones-adrift')).imageId, 'archetype:sky-realms');
  for (const id of ['cauldera-valley', 'field-of-dreams', 'ouroborean-pass']) {
    assert.equal(U.resolveEnvironmentArt(rec(id)).kind, 'unique', id);
    assert.equal(Art.ARCHETYPE_FIT[id], undefined, id);
  }
});

test('phase 4: collages stay distinct, at most three, deterministic, painting first', () => {
  const c = cover('teal-heart-inn', 'mountain-pass', 'ocean-voyage', 'deadly-dungeon', 'floating-mountains');
  assert.equal(c.layout, 3);
  assert.equal(new Set(imageIds(c)).size, 3);
  assert.deepEqual(imageIds(cover('teal-heart-inn', 'mountain-pass', 'ocean-voyage', 'deadly-dungeon', 'floating-mountains')), imageIds(c));
  /* the same picture for several members is one tile */
  const crypt = cover('heros-tomb', 'hallow-rest', 'ancient-tomb', 'endless-catacombs');
  assert.deepEqual(imageIds(crypt), ['archetype:crypts-and-tombs']);
  assert.equal(crypt.tiles[0].count, 4);
  /* a strong thematic picture beats an acceptable one, an acceptable one still beats a lone biome */
  assert.deepEqual(imageIds(cover('time-loop', 'harsh-desert')), ['archetype:time-and-dream', 'biome:drylands']);
  /* a painting is never pushed out by the new pictures */
  const withPainting = cover('field-of-dreams', 'shadowfen', 'fighting-arena', 'ocean-voyage', 'stop-the-collapse-of-reality', 'unsettling-forest');
  assert.ok(imageIds(withPainting).includes('env:field-of-dreams'));
  assert.equal(withPainting.layout, 3);
  /* every new picture in one list of fourteen: still three tiles, none repeated */
  const all = Object.values(PHASE4).map(g => (g.strong[0] || g.acceptable[0]));
  const big = cover(...all);
  assert.equal(big.layout, 3);
  assert.equal(new Set(imageIds(big)).size, 3);
  /* rejected members add no tile of the new picture */
  assert.equal(cover('duel', 'quickdraw', 'pursued').layout, 0);
});

test('phase 4: a missing picture falls through to the next source instead of a broken image', () => {
  const without = id => ({ ...Art, IMAGES: Object.fromEntries(Object.entries(Art.IMAGES).filter(([k]) => k !== id)) });
  assert.equal(U.resolveEnvironmentArt(rec('shadowfen'), without('archetype:blighted-mires')).imageId, 'biome:wetland');
  assert.equal(U.resolveEnvironmentArt(rec('mountain-pass'), without('archetype:perilous-passages')).imageId, 'biome:mountain');
  assert.equal(U.resolveEnvironmentArt(rec('stop-the-collapse-of-reality'), without('archetype:planar-rifts')), null);
});
