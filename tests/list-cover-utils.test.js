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
  assert.equal(U.resolveEnvironmentArt(rec('haunted-mountain-pass')).imageId, 'biome:mountain');
  assert.equal(U.resolveEnvironmentArt(rec('wispy-wasteland')).imageId, 'biome:rolling');
  assert.equal(U.resolveEnvironmentArt(rec('swamp-ruins')).imageId, 'biome:wetland');
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
  const universal = idsWhere(e => artBiome(e) === 'universal');
  assert.ok(universal.length >= 40);
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
  const ids = [...pick('forest', 5), ...pick('mountain', 3), ...pick('underground', 2)];
  const c = cover(...ids);
  assert.deepEqual(imageIds(c), ['biome:forest', 'biome:mountain', 'biome:underground']);
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
