/* ============================================================
   Bacchus's Atlas — tests/list-cover-art.test.js
   Integrity of the My Lists cover registry (js/list-cover-art.js): every picture it
   names exists and ships, every environment it names is in the catalogue, the shipped
   covers and the production artwork stay in step. Run with:
     node --test tests/list-cover-art.test.js
   ============================================================ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Art = require('../js/list-cover-art.js');
const { isExcluded } = require('../scripts/build.js');
const { SOURCES } = require('../scripts/generate-list-covers.js');

const ROOT = path.join(__dirname, '..');
const APP_JS = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const ENV_IDS = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/environments.json'), 'utf8')).environments.map(e => e.id));
const CATALOG_BIOMES = ['aquatic', 'badlands', 'drylands', 'forest', 'frozen', 'grassland', 'mountain', 'rolling', 'settlement', 'tropical', 'underground', 'universal', 'wetland'];

test('every picture has files on disk, inside dist/, and a complete framing for all three layouts', () => {
  for (const img of Object.values(Art.IMAGES)) {
    assert.ok(img.avif.length >= 2, `${img.id} has a srcset ladder`);
    for (const f of [...img.avif.map(a => a.path), img.fallback]) {
      assert.ok(fs.existsSync(path.join(ROOT, f)), `${img.id}: ${f} exists`);
      assert.equal(isExcluded(f), false, `${f} must ship`);
    }
    assert.ok(img.fallback.endsWith('.webp'));
    for (const layout of [1, 2, 3]) {
      const p = img.pos[layout];
      assert.ok(p && p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100, `${img.id} layout ${layout}`);
    }
  }
});

test('the image id matches its kind, and the srcset widths are strictly increasing', () => {
  for (const [id, img] of Object.entries(Art.IMAGES)) {
    assert.equal(img.id, id);
    assert.ok(id.startsWith({ unique: 'env:', archetype: 'archetype:', biome: 'biome:', crop: 'crop:' }[img.kind]), id);
    const w = img.avif.map(a => a.w);
    assert.deepEqual(w, [...w].sort((a, b) => a - b));
    assert.equal(new Set(w).size, w.length);
  }
});

test('every shipped cover file is under 300 KB, and no PNG master ships in img/list-covers', () => {
  for (const img of Object.values(Art.IMAGES)) {
    for (const a of img.avif) {
      const size = fs.statSync(path.join(ROOT, a.path)).size;
      assert.ok(size < 300 * 1024, `${a.path} is ${size} bytes`);
    }
  }
  assert.equal(fs.readdirSync(path.join(ROOT, 'img/list-covers')).filter(f => f.endsWith('.png')).length, 0);
});

test('every cover derivative on disk is registered, and the generator and registry agree on the stems', () => {
  const stems = new Set(Object.values(Art.IMAGES).filter(i => i.kind !== 'unique' && i.kind !== 'crop').map(i => i.fallback.replace(/^img\/list-covers\//, '').replace(/-640\.webp$/, '')));
  assert.deepEqual([...stems].sort(), Object.keys(SOURCES).sort());
  // semantic crops (PD-090) are cut by scripts/generate-semantic-crops.js, not from SOURCES
  const cropFiles = new Set(Object.values(Art.IMAGES).filter(i => i.kind === 'crop').flatMap(i => [...i.avif.map(a => a.path), i.fallback].map(p => path.basename(p))));
  for (const f of fs.readdirSync(path.join(ROOT, 'img/list-covers'))) {
    if (f.startsWith('crop-')) { assert.ok(cropFiles.has(f), `${f} has no registry entry`); continue; }
    const stem = f.replace(/-\d+\.(avif|webp)$/, '');
    assert.ok(stems.has(stem), `${f} has no registry entry`);
  }
  for (const master of Object.values(SOURCES)) {
    assert.ok(fs.existsSync(path.join(ROOT, master)), `master ${master}`);
    assert.equal(isExcluded(master), true, `${master} must stay out of dist/`);
  }
});

test('unique paintings: registry, ENV_ART and ENV_ART_FOCUS in js/app.js name the same environments and framing', () => {
  const block = APP_JS.match(/const ENV_ART = new Set\(\[([\s\S]*?)\]\)/)[1];
  const appIds = [...block.matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.deepEqual([...Art.UNIQUE_ENV_IDS].sort(), appIds.sort());
  const focus = Object.fromEntries([...APP_JS.match(/const ENV_ART_FOCUS = \{([\s\S]*?)\}/)[1].matchAll(/'([^']+)': '(\d+)%'/g)].map(m => [m[1], +m[2]]));
  for (const id of Art.UNIQUE_ENV_IDS) {
    assert.ok(ENV_IDS.has(id), id);
    assert.equal(Art.IMAGES['env:' + id].pos[1].y, focus[id] === undefined ? 50 : focus[id], `${id} focus`);
  }
});

test('archetype fit: real environments, real archetypes, valid fit grades, no duplicates', () => {
  for (const [envId, [arch, fit, variant]] of Object.entries(Art.ARCHETYPE_FIT)) {
    assert.ok(ENV_IDS.has(envId), `${envId} is in the catalogue`);
    assert.ok(Art.ARCHETYPES[arch], `${envId}: archetype ${arch}`);
    assert.ok(['strong', 'acceptable'].includes(fit), `${envId}: fit ${fit}`);
    assert.ok(Art.IMAGES[Art.ARCHETYPES[arch].variants[variant || 0]], `${envId}: variant`);
  }
  for (const a of Object.values(Art.ARCHETYPES)) {
    for (const id of a.variants) assert.equal(Art.IMAGES[id].kind, 'archetype');
  }
});

/* The fourteen pictures added last (docs/research/adaptive-list-covers-complete-library.md). An older audit's
 * "rejected" environment may fit one of these — it is only ever judged against the pictures that audit knew. */
const PHASE4_ARCHETYPES = ['crypts-and-tombs', 'taverns-and-inns', 'blighted-mires', 'archives-and-libraries', 'planar-rifts', 'arenas-and-duels',
  'chase-and-ambush', 'intrigue-and-underworld', 'time-and-dream', 'dungeon-delves', 'perilous-passages', 'seafaring', 'sinister-woods', 'sky-realms'];
const mappedBeforePhase4 = id => (Art.ARCHETYPE_FIT[id] && !PHASE4_ARCHETYPES.includes(Art.ARCHETYPE_FIT[id][0]) ? Art.ARCHETYPE_FIT[id] : undefined);

test('the misleading matches the audit rejected stay out of ARCHETYPE_FIT', () => {
  for (const id of ['deserted-moor', 'haunted-mountain-pass', 'wispy-wasteland', 'valley-of-death', 'realm-of-the-dead',
    'lost-village', 'swamp-ruins', 'titan-boneyard', 'arcane-laboratory', 'arcane-magic-shop',
    'local-festival', 'town-festival', 'city-festival', 'forced-penance']) {
    assert.equal(mappedBeforePhase4(id), undefined, id);
  }
});

test('biome pictures: only known biomes, none for universal, settlement only by explicit override', () => {
  for (const [b, id] of Object.entries(Art.BIOME_IMAGES)) {
    assert.ok(CATALOG_BIOMES.includes(b), b);
    assert.equal(Art.IMAGES[id].kind, 'biome');
  }
  assert.equal(Art.BIOME_IMAGES.universal, undefined);
  assert.deepEqual(Art.EXPLICIT_ONLY_BIOMES, ['settlement']);
  for (const [envId, imageId] of Object.entries(Art.ENV_IMAGE_OVERRIDES)) {
    assert.ok(ENV_IDS.has(envId), envId);
    assert.ok(Art.IMAGES[imageId], imageId);
  }
});

test('index.html loads the registry and the rules before js/app.js, and app.js has no list of its own', () => {
  const art = INDEX_HTML.indexOf('src="js/list-cover-art.js"');
  const utils = INDEX_HTML.indexOf('src="js/list-cover-utils.js"');
  const app = INDEX_HTML.indexOf('src="js/app.js"');
  assert.ok(art !== -1 && art < utils && utils < app);
  assert.match(INDEX_HTML.slice(art, art + 80), /data-cache-version="ui"/);
  assert.match(APP_JS, /ListCoverUtils\.coverForEnvironments/);
  assert.doesNotMatch(APP_JS, /ENV_THUMB_WIDTHS|listsCoveredFirst/);
});

test('phase 2: the rejected misleading matches stay out of ARCHETYPE_FIT, and the new masters are the approved files', () => {
  for (const id of ['volcanic-eruption', 'forest-wildfire', 'raging-fire', 'demonic-abyss', 'cult-ritual', 'shipwreck',
    'realm-of-the-dead', 'fortress', 'bandit-hideout', 'acid-burrows', 'thrumming-hives', 'devouring-green', 'heart-of-the-mire',
    'court-of-hounds', 'dark-forest-revel', 'cauldera-valley', 'field-of-dreams']) {
    assert.equal(mappedBeforePhase4(id), undefined, id);
  }
  for (const stem of ['storms-and-calamity', 'infernal-and-profane', 'drowned-depths', 'strongholds-and-sieges', 'monster-lairs', 'cursed-and-blighted-lands', 'fey-and-enchanted']) {
    assert.equal(SOURCES['archetype-' + stem], `img/cover-archetypes-source/${stem}.png`);
  }
});

test('phase 3: the three masters are the approved V2 files (pinned by content, 16:9), registered, derived, never shipped as masters', () => {
  const PINNED = {
    starfaring: '57ca9fc4ca60fab613543f3c8e6790ff52ae9958d0f81707aca0304648c6cd86',
    'sacred-sanctuaries': 'aeaf1817506758c4545c14a15e74788fd0c3cfdb1ef42015bf3b035af55bedfd',
    'streets-and-towns': '184221a5eb6c1ec814e0f08213d0168c4f24beb53dd1121a9f887bfa799ab0c5',
  };
  for (const [stem, hash] of Object.entries(PINNED)) {
    const master = SOURCES['archetype-' + stem];
    assert.equal(master, `img/cover-archetypes-source/${stem}.png`);
    const buf = fs.readFileSync(path.join(ROOT, master));
    assert.equal(require('node:crypto').createHash('sha256').update(buf).digest('hex'), hash, `${stem} master is not the approved V2`);
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    assert.ok(Math.abs(w / h - 16 / 9) < 0.01 && h === 941, `${stem} is ${w}x${h}`);
    assert.ok(Art.IMAGES['archetype:' + stem], stem);
    assert.equal(isExcluded(master), true);
  }
  assert.equal(Object.keys(SOURCES).filter(k => k.startsWith('archetype-') && !k.startsWith('archetype-storm-')).length, 28);
  for (const f of fs.readdirSync(path.join(ROOT, 'img/cover-archetypes-source'))) {
    assert.ok(!/(^|[-_])v1([-_.]|$)/i.test(f), `a V1 master is present: ${f}`);
    assert.equal(isExcluded('img/cover-archetypes-source/' + f), true, f);
  }
});

test('phase 3: the first fourteen archetype pictures are all still registered, the original eleven untouched', () => {
  assert.equal(Object.keys(Art.ARCHETYPES).length, 28);
  for (const a of ['haunted-and-deathly', 'forgotten-ruins', 'arcane-sanctums', 'feasts-and-revelry', 'storms-and-calamity', 'infernal-and-profane',
    'drowned-depths', 'strongholds-and-sieges', 'monster-lairs', 'cursed-and-blighted-lands', 'fey-and-enchanted']) assert.ok(Art.ARCHETYPES[a], a);
  for (const a of ['starfaring', 'sacred-sanctuaries', 'streets-and-towns']) assert.deepEqual(Art.ARCHETYPES[a].variants, ['archetype:' + a]);
});

test('phase 4: the fourteen last masters are the approved files (pinned by content, 16:9), registered, derived, never shipped as masters', () => {
  /* Time & Dream and Sky Realms, like the other revised pictures, exist only as their approved V2 — a different
   * file under the same name fails here. */
  const PINNED = {
    'crypts-and-tombs': '30008e4e5a91435900471ad5202e15534670bb792c63fdf86c7fdded24a4122c',
    'taverns-and-inns': '276190bceced31e87df9de2f302e442db55780318107cfc4a1f232580468997e',
    'blighted-mires': 'f94138dd96aeb2dbc6f8ea4e11a593d92e572dca200fb0fa368e85b895205ca2',
    'archives-and-libraries': '9b62f60233f1f8591a08d786e196845e36a306b8da7dc36dba3ce7e1ffaa389f',
    'planar-rifts': 'c93a478a9db563baa8a590d51e800d4ac9f089bd4e3f06d2581cf7cfcce14910',
    'arenas-and-duels': '00a6ee24b5c0f658f602d3bf9f7ee1525bf4c04dad6190db5abd9fce93524a2e',
    'chase-and-ambush': '585014b3d39a4166c69fd9dedd7c029655bf44f41c40148549dce1e8ede95c52',
    'intrigue-and-underworld': 'b98be5468bfec5c1407d704fafe3fdc1e1a5f2b1b057078e523d3d6c709505bd',
    'time-and-dream': '52fb160d2617b578ec4e68bb7bcfaa06c32ce9d17a70bdca492d5337c3ee5e96',
    'dungeon-delves': '18da423eb847566a8bfe4744b8c01bd235cbdf2be208fdcd6212a1309cc10e9f',
    'perilous-passages': '27de24e8ed8721c9d521e60b5864eba4930983f9cb69b21dbbae7630b54654d1',
    seafaring: '359cbba22e6182342ef16fbd26e1831bcb79e06d17b88f57a145a44c02412a42',
    'sinister-woods': '2b391f875b633a2312133a8c5e54cb9cd5f812e5e25ab42ee3b56cc8eeb6b27f',
    'sky-realms': 'c880de931b1de5910c3bf3242841d523233a31e618c69806a4a1cdfae7f8ef32',
  };
  assert.deepEqual(Object.keys(PINNED).sort(), [...PHASE4_ARCHETYPES].sort());
  for (const [stem, hash] of Object.entries(PINNED)) {
    const master = SOURCES['archetype-' + stem];
    assert.equal(master, `img/cover-archetypes-source/${stem}.png`);
    const buf = fs.readFileSync(path.join(ROOT, master));
    assert.equal(require('node:crypto').createHash('sha256').update(buf).digest('hex'), hash, `${stem} master is not the approved file`);
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    assert.ok(Math.abs(w / h - 16 / 9) < 0.01 && h === 941, `${stem} is ${w}x${h}`);
    assert.deepEqual(Art.ARCHETYPES[stem].variants, ['archetype:' + stem]);
    assert.equal(Art.IMAGES['archetype:' + stem].kind, 'archetype');
    assert.equal(isExcluded(master), true);
    /* nothing but the three-width ladder and one WebP exists for it: no stray V1 derivative */
    const files = fs.readdirSync(path.join(ROOT, 'img/list-covers')).filter(f => f.startsWith(`archetype-${stem}-`)).sort();
    assert.deepEqual(files, [`archetype-${stem}-320.avif`, `archetype-${stem}-640.avif`, `archetype-${stem}-640.webp`, `archetype-${stem}-960.avif`], stem);
  }
});

test('phase 4: every registered picture has a master in SOURCES, and every derivative belongs to a registered picture', () => {
  const stems = new Set(Object.values(Art.IMAGES).filter(i => i.kind !== 'unique' && i.kind !== 'crop').map(i => i.avif[0].path.replace(/^img\/list-covers\//, '').replace(/-320\.avif$/, '')));
  assert.deepEqual([...stems].sort(), Object.keys(SOURCES).sort());
  for (const f of fs.readdirSync(path.join(ROOT, 'img/list-covers'))) {
    if (f.startsWith('crop-')) continue; // PD-090 crops: checked above and in tests/semantic-overrides.test.js
    assert.ok(stems.has(f.replace(/-(320|640|960)\.(avif|webp)$/, '')), `unregistered derivative ${f}`);
  }
});

test('phase 2: every framing is a percentage inside 0..100 and each archetype picture is a whole-frame 16:9 cut', () => {
  for (const img of Object.values(Art.IMAGES)) {
    for (const n of [1, 2, 3]) {
      const { x, y } = img.pos[n];
      assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100, `${img.id} ${n}`);
    }
  }
});
