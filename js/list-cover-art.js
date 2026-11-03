/* ============================================================
   Bacchus's Atlas — list-cover-art.js
   The artwork registry behind the My Lists covers: which picture exists, where its
   files are, how each layout should frame it, and which environments it may stand
   for. Plain data and two tiny builders; the rules that read it live in
   js/list-cover-utils.js. Adding artwork is an edit to this file only:

   - a new archetype picture: cut it with scripts/generate-list-covers.js, add one
     `archetype(...)` line to IMAGES, list its id under ARCHETYPES, and add the
     environments it fits to ARCHETYPE_FIT. A second picture for the same archetype
     is another IMAGES entry and another id in that archetype's `variants`.
   - a one-off environment: ENV_IMAGE_OVERRIDES.

   Taxonomy is not artwork. docs/research/lists-cover-classification.json says what
   an environment is about; ARCHETYPE_FIT says whether a picture actually shows
   it — judged against each environment's lore (docs/research/artwork-crop-lab-v2-report.md
   §8, docs/research/adaptive-list-covers-implementation.md §3). The classification
   is never read at runtime.

   Dependency-free, no window/document: loaded as a plain <script> and required()
   from tests/list-cover-art.test.js, the same shape as js/list-utils.js.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ListCoverArt = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* Framing is object-position percentages per layout, keyed by how many tiles the
   * cover has: 1 = one tile 318px wide, 2 = 158px, 3 = 105px, all 90px tall. A 16:9
   * picture fits the 2-up tile whole, so only the 1-up band (y) and the 3-up crop (x)
   * need a chosen value. Values come from the Artwork Crop Lab and the biome cover
   * comparison (docs/research/biome-cover-registry.json). */
  const pos = (hero, two, three) => ({
    1: { x: hero[0], y: hero[1] },
    2: { x: two[0], y: two[1] },
    3: { x: three[0], y: three[1] },
  });

  /* A picture cut by scripts/generate-list-covers.js: img/list-covers/<stem>-{320,640,960}.avif
   * plus a 640 WebP for a browser without AVIF. */
  function cut(id, kind, stem, framing) {
    const base = 'img/list-covers/' + stem;
    return {
      id, kind,
      avif: [320, 640, 960].map(w => ({ path: `${base}-${w}.avif`, w })),
      fallback: `${base}-640.webp`,
      pos: framing,
    };
  }
  const biome = (name, hero, three) => cut('biome:' + name, 'biome', 'biome-' + name, pos(hero, [50, 50], three));
  const archetype = (name, hero, two, three) => cut('archetype:' + name, 'archetype', 'archetype-' + name, pos(hero, two, three));

  /* A painting that belongs to one environment: the thumbnail ladder already cut for the
   * old cover (img/env/thumb/). The y figure is ENV_ART_FOCUS in js/app.js, which the
   * backdrop shares — tests/list-cover-art.test.js holds the two together. */
  function unique(envId, y) {
    const base = 'img/env/thumb/' + envId;
    return {
      id: 'env:' + envId, kind: 'unique',
      avif: [200, 400, 800].map(w => ({ path: `${base}-${w}.avif`, w })),
      fallback: `${base}-400.webp`,
      pos: pos([50, y], [50, y], [50, y]),
    };
  }

  /* A hand-approved semantic crop of an archetype master (docs/research/curated-semantic-artwork-overrides.md,
   * PD-090): `rect` is the master-pixel window the My Lists derivative is cut from, `pos` the
   * object-position per layout (from the reviewed lab frames). Cut by scripts/generate-semantic-crops.js
   * into img/list-covers/crop-<name>-<w>.avif; `widths` stop at the pixels the window really holds. */
  function crop(name, parent, rect, widths, framing) {
    const base = 'img/list-covers/crop-' + name;
    return {
      id: 'crop:' + name, kind: 'crop', parent: 'archetype:' + parent,
      avif: widths.map(w => ({ path: `${base}-${w}.avif`, w })),
      fallback: `${base}-${widths[widths.length - 1]}.webp`,
      pos: framing, rect,
    };
  }

  const IMAGES = {};
  [
    unique('cauldera-valley', 50),
    unique('field-of-dreams', 58),
    unique('ouroborean-pass', 42),

    archetype('haunted-and-deathly', [50, 34], [50, 40], [88, 40]),
    archetype('forgotten-ruins', [50, 38], [50, 25], [90, 30]),
    archetype('arcane-sanctums', [50, 8], [60, 30], [85, 30]),
    archetype('feasts-and-revelry', [50, 40], [50, 50], [45, 40]),
    archetype('storms-and-calamity', [52, 18], [55, 38], [55, 30]),
    archetype('infernal-and-profane', [58, 22], [58, 35], [60, 30]),
    archetype('drowned-depths', [50, 38], [48, 40], [50, 40]),
    archetype('strongholds-and-sieges', [60, 30], [72, 40], [80, 35]),
    archetype('monster-lairs', [50, 72], [30, 55], [22, 55]),
    archetype('cursed-and-blighted-lands', [50, 48], [40, 45], [30, 40]),
    archetype('fey-and-enchanted', [50, 35], [60, 40], [70, 35]),
    archetype('starfaring', [50, 40], [60, 40], [75, 40]),
    archetype('sacred-sanctuaries', [50, 12], [30, 30], [15, 25]),
    archetype('streets-and-towns', [50, 28], [62, 40], [80, 35]),
    archetype('crypts-and-tombs', [50, 45], [50, 50], [25, 50]),
    archetype('taverns-and-inns', [50, 45], [50, 50], [30, 50]),
    archetype('blighted-mires', [50, 40], [50, 50], [60, 45]),
    archetype('archives-and-libraries', [50, 55], [50, 50], [60, 50]),
    archetype('planar-rifts', [50, 30], [50, 50], [55, 40]),
    archetype('arenas-and-duels', [50, 35], [50, 50], [45, 40]),
    archetype('chase-and-ambush', [50, 35], [50, 50], [45, 40]),
    archetype('intrigue-and-underworld', [50, 35], [50, 50], [60, 40]),
    archetype('time-and-dream', [50, 40], [50, 50], [55, 40]),
    archetype('dungeon-delves', [50, 50], [50, 50], [40, 50]),
    archetype('perilous-passages', [50, 40], [50, 50], [70, 40]),
    archetype('seafaring', [50, 50], [50, 50], [75, 50]),
    archetype('sinister-woods', [50, 45], [50, 50], [40, 45]),
    archetype('sky-realms', [50, 35], [50, 50], [45, 40]),

    crop('market-stalls', 'streets-and-towns', { left: 0, top: 169, width: 568, height: 772 }, [320, 568],
      pos([50, 48.74], [50, 56.89], [50, 70.31])),
    crop('tavern-terrace', 'streets-and-towns', { left: 1169, top: 282, width: 501, height: 659 }, [320, 501],
      pos([50, 34.71], [50, 45.59], [50, 42.82])),
    crop('bar-counter', 'taverns-and-inns', { left: 0, top: 188, width: 702, height: 471 }, [320, 640],
      pos([50, 41.35], [50, 0], [63.81, 50])),
    crop('lotus-pool', 'sacred-sanctuaries', { left: 900, top: 719, width: 770, height: 221 }, [320, 640],
      pos([50, 0], [96.36, 50], [84.58, 50])),

    biome('aquatic', [50, 45], [85, 45]),
    biome('badlands', [50, 35], [25, 45]),
    biome('drylands', [50, 50], [55, 50]),
    biome('forest', [50, 30], [62, 50]),
    biome('frozen', [50, 35], [55, 40]),
    biome('grassland', [50, 40], [35, 50]),
    biome('mountain', [50, 55], [65, 55]),
    biome('rolling', [50, 45], [70, 45]),
    biome('settlement', [50, 50], [40, 50]),
    biome('tropical', [50, 45], [75, 45]),
    biome('underground', [50, 55], [50, 55]),
    biome('wetland', [50, 50], [50, 50]),
  ].forEach(img => { IMAGES[img.id] = img; });

  /* Environments with a painting of their own, in the order the old cover read them. */
  const UNIQUE_ENV_IDS = ['cauldera-valley', 'field-of-dreams', 'ouroborean-pass'];

  /* An archetype may have several pictures; an ARCHETYPE_FIT entry picks one by index
   * (default 0). */
  const ARCHETYPES = {
    'haunted-and-deathly': { variants: ['archetype:haunted-and-deathly'] },
    'forgotten-ruins': { variants: ['archetype:forgotten-ruins'] },
    'arcane-sanctums': { variants: ['archetype:arcane-sanctums'] },
    'feasts-and-revelry': { variants: ['archetype:feasts-and-revelry'] },
    'storms-and-calamity': { variants: ['archetype:storms-and-calamity'] },
    'infernal-and-profane': { variants: ['archetype:infernal-and-profane'] },
    'drowned-depths': { variants: ['archetype:drowned-depths'] },
    'strongholds-and-sieges': { variants: ['archetype:strongholds-and-sieges'] },
    'monster-lairs': { variants: ['archetype:monster-lairs'] },
    'cursed-and-blighted-lands': { variants: ['archetype:cursed-and-blighted-lands'] },
    'fey-and-enchanted': { variants: ['archetype:fey-and-enchanted'] },
    starfaring: { variants: ['archetype:starfaring'] },
    'sacred-sanctuaries': { variants: ['archetype:sacred-sanctuaries'] },
    'streets-and-towns': { variants: ['archetype:streets-and-towns'] },
    'crypts-and-tombs': { variants: ['archetype:crypts-and-tombs'] },
    'taverns-and-inns': { variants: ['archetype:taverns-and-inns'] },
    'blighted-mires': { variants: ['archetype:blighted-mires'] },
    'archives-and-libraries': { variants: ['archetype:archives-and-libraries'] },
    'planar-rifts': { variants: ['archetype:planar-rifts'] },
    'arenas-and-duels': { variants: ['archetype:arenas-and-duels'] },
    'chase-and-ambush': { variants: ['archetype:chase-and-ambush'] },
    'intrigue-and-underworld': { variants: ['archetype:intrigue-and-underworld'] },
    'time-and-dream': { variants: ['archetype:time-and-dream'] },
    'dungeon-delves': { variants: ['archetype:dungeon-delves'] },
    'perilous-passages': { variants: ['archetype:perilous-passages'] },
    'seafaring': { variants: ['archetype:seafaring'] },
    'sinister-woods': { variants: ['archetype:sinister-woods'] },
    'sky-realms': { variants: ['archetype:sky-realms'] },
  };

  /* environment id -> [archetype, fit, variant?]. 'strong': the picture shows this
   * place; 'acceptable': the right kind of place and mood, not the exact building. An
   * environment that is only in the taxonomy and not here gets its biome picture. The
   * environments the audit judged 'poor' (moors, passes, plazas, water, bones — geography
   * the picture does not contain) and Forced Penance (an abstract area, not a place) are
   * deliberately absent. */
  const ARCHETYPE_FIT = {
    /* haunted-and-deathly */
    'cursed-graveyard': ['haunted-and-deathly', 'strong'],
    'desecrated-graveyard': ['haunted-and-deathly', 'strong'],
    'possessed-abode': ['haunted-and-deathly', 'strong'],
    'vampires-castle': ['haunted-and-deathly', 'acceptable'],
    'castle-of-wails': ['haunted-and-deathly', 'acceptable'],
    'abandoned-building': ['haunted-and-deathly', 'acceptable'],
    'haunted-city': ['haunted-and-deathly', 'acceptable'],
    'neverhome-corridors': ['haunted-and-deathly', 'acceptable'],
    'shatter-the-heart': ['haunted-and-deathly', 'acceptable'],
    'haunted-oratorium': ['haunted-and-deathly', 'acceptable'],
    /* forgotten-ruins */
    'forgotten-temple-of-the-serpent': ['forgotten-ruins', 'strong'],
    'korathi-temple': ['forgotten-ruins', 'strong'],
    'ruined-castle': ['forgotten-ruins', 'strong'],
    'abandoned-grove': ['forgotten-ruins', 'acceptable'],
    'ancient-city': ['forgotten-ruins', 'acceptable'],
    'ancient-power-conduit': ['forgotten-ruins', 'acceptable'],
    'ruined-mage-tower': ['forgotten-ruins', 'acceptable'],
    'search-the-ruins': ['forgotten-ruins', 'acceptable'],
    'mistfield-of-possibility': ['forgotten-ruins', 'acceptable'],
    'moon-kingdom': ['forgotten-ruins', 'acceptable'],
    /* arcane-sanctums */
    'archmages-tower': ['arcane-sanctums', 'strong'],
    'eternal-observatory': ['arcane-sanctums', 'strong'],
    'tower-of-the-moon': ['arcane-sanctums', 'acceptable'],
    'cosmological-clocktower': ['arcane-sanctums', 'acceptable'],
    'magic-city': ['arcane-sanctums', 'acceptable'],
    'arcanists-laboratory': ['arcane-sanctums', 'acceptable'],
    laboratory: ['arcane-sanctums', 'acceptable'],
    /* feasts-and-revelry */
    'masquerade-ball': ['feasts-and-revelry', 'strong'],
    'masquerade-ball-atlas': ['feasts-and-revelry', 'strong'],
    'masquerade-party': ['feasts-and-revelry', 'strong'],
    'grand-feast': ['feasts-and-revelry', 'strong'],
    'divine-feast': ['feasts-and-revelry', 'acceptable'],
    'the-commanders-dinner': ['feasts-and-revelry', 'acceptable'],
    'upscale-casino': ['feasts-and-revelry', 'acceptable'],
    'fairwell-casino': ['feasts-and-revelry', 'acceptable'],
    /* Phase 2 (docs/research/adaptive-list-covers-phase2.md §5-6): judged one by one against
     * each environment's lore. The pictures are specific — a tornado over a coast, an infernal
     * fortress-city, a drowned city, a fortress under assault, a dragon's bone cavern, a dying
     * wilderness, an elven-built glade — so a shared archetype id is not enough. */
    /* storms-and-calamity: a tornado and storm front, not fire, ice or ground disasters */
    tornado: ['storms-and-calamity', 'strong'],
    megastorm: ['storms-and-calamity', 'strong'],
    thunderstorm: ['storms-and-calamity', 'acceptable'],
    'magical-storm': ['storms-and-calamity', 'acceptable'],
    'unbound-arcanostorm': ['storms-and-calamity', 'acceptable'],
    'green-doom-skies': ['storms-and-calamity', 'acceptable'],
    /* infernal-and-profane: Hell's cities and fortresses, not cults, shrines or chasms */
    'circles-below-dis': ['infernal-and-profane', 'strong'],
    'fallen-citadel': ['infernal-and-profane', 'strong'],
    'prison-city-pyrrhexis': ['infernal-and-profane', 'strong'],
    'infernal-railyard': ['infernal-and-profane', 'acceptable'],
    'the-metal-throne-of-sin': ['infernal-and-profane', 'acceptable'],
    /* drowned-depths: submerged architecture, not open water, wrecks or darkness */
    'sunken-citadel': ['drowned-depths', 'strong'],
    'deep-one-city': ['drowned-depths', 'strong'],
    'drowned-sanctum': ['drowned-depths', 'acceptable'],
    /* strongholds-and-sieges: a stronghold actually under attack */
    'castle-siege': ['strongholds-and-sieges', 'strong'],
    'defense-of-the-river-fort': ['strongholds-and-sieges', 'acceptable'],
    /* monster-lairs: the one lair of a colossal beast in a cave */
    'dragons-lair': ['monster-lairs', 'acceptable'],
    /* cursed-and-blighted-lands: dying, corrupted wilderness — not swamp, desert, lava or ice */
    'rewritten-grove': ['cursed-and-blighted-lands', 'strong'],
    'cursed-valley': ['cursed-and-blighted-lands', 'acceptable'],
    /* fey-and-enchanted: luminous, built fey places — not dark, wild or abstract ones */
    'court-of-cats': ['fey-and-enchanted', 'strong'],
    'fey-lands': ['fey-and-enchanted', 'acceptable'],
    /* Phase 3 (docs/research/adaptive-list-covers-phase3.md): the revised V2 pictures, again judged
     * one environment at a time. Each is one specific scene, so the taxonomy group is not enough. */
    /* starfaring: a busy, peaceful science-fantasy spaceport under a planet — not a derelict,
     * a warship, an empty void or a military post */
    'planetary-blockade': ['starfaring', 'acceptable'],
    /* sacred-sanctuaries: a luminous Gothic temple with a statue, candles and an offering —
     * benevolent, built, worshipful; not a ruin, a forest, a grave or a profane site */
    'hallowed-temple': ['sacred-sanctuaries', 'strong'],
    'hallowed-cathedral': ['sacred-sanctuaries', 'acceptable'],
    /* streets-and-towns: a prosperous medieval market street — not slums, chases over roofs,
     * festivals, occupation or a village in the wild */
    'bustling-marketplace': ['streets-and-towns', 'strong'],
    'resting-dagger-inn': ['streets-and-towns', 'strong'],
    'emberwood-village': ['streets-and-towns', 'acceptable'],
    'outpost-town': ['streets-and-towns', 'acceptable'],
    'street-chase': ['streets-and-towns', 'acceptable'],
    /* Phase 4 (docs/research/adaptive-list-covers-complete-library.md): the last fourteen pictures.
     * Same rule as before — one environment at a time, against its lore; a shared archetype id is
     * never enough, and a settingless ('universal') place gets a picture only where the lore itself
     * names the scene the picture shows. */
    /* crypts-and-tombs: a built, candle-lit burial chamber with a sarcophagus — not an open
     * cemetery, a burial mound, a bone-strewn canyon or a chapel above ground */
    'heros-tomb': ['crypts-and-tombs', 'strong'],
    'hallow-rest': ['crypts-and-tombs', 'strong'],
    'necromancers-ossuary': ['crypts-and-tombs', 'acceptable'],
    'ancient-tomb': ['crypts-and-tombs', 'acceptable'],
    'endless-catacombs': ['crypts-and-tombs', 'acceptable'],
    'catacomb-tunnels': ['crypts-and-tombs', 'acceptable'],
    /* taverns-and-inns: a warm, timber-framed inn with a hearth — not a criminal den, a ratling
     * warren or a cellar bar. local-tavern moves here from streets-and-towns (PD-087 stopgap). */
    'teal-heart-inn': ['taverns-and-inns', 'strong'],
    'local-tavern': ['taverns-and-inns', 'strong'],
    'the-wandering-tavern': ['taverns-and-inns', 'acceptable'],
    'the-squealing-boar-tavern-brawl': ['taverns-and-inns', 'acceptable'],
    /* blighted-mires: a stagnant, dying swamp — not ink, time pools or a lizardfolk village */
    shadowfen: ['blighted-mires', 'strong'],
    'corrupted-swamp': ['blighted-mires', 'strong'],
    'wretched-mire': ['blighted-mires', 'strong'],
    'dread-mire': ['blighted-mires', 'strong'],
    'buzzing-swamp': ['blighted-mires', 'acceptable'],
    'blood-marsh': ['blighted-mires', 'acceptable'],
    'heart-of-the-mire': ['blighted-mires', 'acceptable'],
    'swamp-ruins': ['blighted-mires', 'acceptable'],
    'beelzebufo-bog': ['blighted-mires', 'acceptable'],
    /* archives-and-libraries: a sunlit scholars' library — not a ruined, buried or hostile one */
    'library-of-the-dusk-tree': ['archives-and-libraries', 'strong'],
    'civic-library': ['archives-and-libraries', 'acceptable'],
    'neverhome-library': ['archives-and-libraries', 'acceptable'],
    /* planar-rifts: a huge rupture in our own world, with ruins and floating fragments — not a
     * realm seen from inside, an ordinary door or a storm */
    'stop-the-collapse-of-reality': ['planar-rifts', 'strong'],
    'extraplanar-breach': ['planar-rifts', 'strong'],
    'portal-beyond': ['planar-rifts', 'acceptable'],
    'planar-incursion-invasion': ['planar-rifts', 'acceptable'],
    'planar-incursion-arcane-vortex': ['planar-rifts', 'acceptable'],
    'shattered-lands': ['planar-rifts', 'acceptable'],
    /* arenas-and-duels: a vast public stone arena — not a private duel, a pit, a race or a brawl */
    'fighting-arena': ['arenas-and-duels', 'strong'],
    'the-proving-pyre': ['arenas-and-duels', 'acceptable'],
    /* chase-and-ambush: a wooded mountain track with a stone bridge and dropped gear — not
     * rooftops, streets, canyons, trains or stagecoaches */
    ambushed: ['chase-and-ambush', 'acceptable'],
    ambushers: ['chase-and-ambush', 'acceptable'],
    'road-blockade': ['chase-and-ambush', 'acceptable'],
    /* intrigue-and-underworld: a shadowed medieval back street — not a court, a sewer market or a heist */
    'gang-hideout': ['intrigue-and-underworld', 'acceptable'],
    'thieves-guild': ['intrigue-and-underworld', 'acceptable'],
    /* time-and-dream: a village square holding three seasons at once — only a place where time
     * itself misbehaves, not a dream world, a court or a storm */
    'time-loop': ['time-and-dream', 'acceptable'],
    'time-loop-atlas': ['time-and-dream', 'acceptable'],
    /* dungeon-delves: a built stone dungeon with gates and torches — not a mine, lava, crystal or a hazard */
    'deadly-dungeon': ['dungeon-delves', 'strong'],
    'dangerous-dungeon': ['dungeon-delves', 'strong'],
    /* perilous-passages: a misty mountain crossing — not a river, a frozen lake or a floating rock */
    'mountain-pass': ['perilous-passages', 'strong'],
    'cliffside-ascent': ['perilous-passages', 'acceptable'],
    'perilous-cliff': ['perilous-passages', 'acceptable'],
    'haunted-mountain-pass': ['perilous-passages', 'acceptable'],
    /* seafaring: a sailing ship under way — not a harbour, a wreck, a lake or a skyship */
    'ocean-voyage': ['seafaring', 'strong'],
    'terror-of-the-deep': ['seafaring', 'acceptable'],
    /* sinister-woods: a dark, ancient, misty forest — not a hut, a tunnel, fey revels or a burning tree.
     * gnarled-glen moves here from cursed-and-blighted-lands: "a twisted wood, dark canopies" is this picture. */
    'unsettling-forest': ['sinister-woods', 'strong'],
    'spooky-forest': ['sinister-woods', 'strong'],
    'gnarled-glen': ['sinister-woods', 'strong'],
    'gloaming-forest': ['sinister-woods', 'acceptable'],
    'devouring-green': ['sinister-woods', 'acceptable'],
    /* sky-realms: natural floating islands over a sea of cloud — not a sky city, a ship or a ruin */
    'floating-mountains': ['sky-realms', 'strong'],
    'stones-adrift': ['sky-realms', 'acceptable'],
    'cloudy-sky': ['sky-realms', 'acceptable'],
  };

  /* biome -> picture. 'universal' has none on purpose: an "Other" environment says
   * nothing about its place, and the only candidates (a portal, the Shadowblight
   * hole) would mislead — it gets the neutral cover. */
  const BIOME_IMAGES = {
    aquatic: 'biome:aquatic', badlands: 'biome:badlands', drylands: 'biome:drylands',
    forest: 'biome:forest', frozen: 'biome:frozen', grassland: 'biome:grassland',
    mountain: 'biome:mountain', rolling: 'biome:rolling', settlement: 'biome:settlement',
    tropical: 'biome:tropical', underground: 'biome:underground', wetland: 'biome:wetland',
  };

  /* Biomes whose picture is too specific to stand for every environment wearing the tag.
   * Settlement is a sunset harbour town: 98 environments are taverns, vaults, ships and
   * inland streets. It is drawn only where ENV_IMAGE_OVERRIDES says the place is a harbour. */
  const EXPLICIT_ONLY_BIOMES = ['settlement'];

  /* environment id -> picture id, beating everything but the environment's own painting. */
  const ENV_IMAGE_OVERRIDES = {
    'port-city': 'biome:settlement',
    'raiding-party': 'biome:settlement',
  };

  /* Master-pixel windows of the crops' Catalog strips (1:3, cut by scripts/generate-semantic-crops.js into
   * the Catalog strips' folder, crop-<name>-<w>.avif|webp) and the source master of each crop. Catalog-only crops
   * (statue-altar) have no My Lists picture above: tall regions fail the 3.5:1 band. */
  const CROP_CATALOG_WINDOWS = {
    'market-stalls': { master: 'streets-and-towns', left: 75, top: 169, width: 257, height: 772, widths: [100, 200, 250] },
    'tavern-terrace': { master: 'streets-and-towns', left: 1422, top: 282, width: 220, height: 659, widths: [100, 200] },
    'bar-counter': { master: 'taverns-and-inns', left: 230, top: 150, width: 200, height: 600, widths: [100, 200] },
    'statue-altar': { master: 'sacred-sanctuaries', left: 430, top: 60, width: 237, height: 710, widths: [100, 200] },
  };

  /* environment id -> the approved semantic crop it wears, and where. Explicit and per context: a crop never
   * reclassifies an environment (ARCHETYPE_FIT is untouched). It beats the archetype fit and the biome, never the
   * environment's own painting and never ENV_IMAGE_OVERRIDES. Rejected and deferred candidates are not here. */
  const SEMANTIC_OVERRIDES = {
    'bustling-marketplace': { crop: 'market-stalls', contexts: ['catalog', 'lists'] },
    'city-festival': { crop: 'market-stalls', contexts: ['catalog', 'lists'] },
    'resting-dagger-inn': { crop: 'tavern-terrace', contexts: ['catalog', 'lists'] },
    'the-dungeoneer': { crop: 'bar-counter', contexts: ['catalog', 'lists'] },
    'chapel-of-st-brenna': { crop: 'statue-altar', contexts: ['catalog'] },
    'garden-of-the-tranquil-order': { crop: 'lotus-pool', contexts: ['lists'] },
  };

  /* Panel review of every picture, read only by ListCoverUtils.composeCover (PD-092): does it still read as a
   * subject in a third-width tile (~106x90), and is it visually busy (dense fine detail, many small competing
   * features)? Judged on the real cover panels with the framing above; the review of the nine third-width
   * failures is in docs/research/my-lists-adaptive-cover-composition-v2-integration.md §5. Keyed by the same ids as IMAGES, so a
   * semantic crop has its own record (it can differ from its parent). A picture with no entry is "not reviewed":
   * the cover keeps its three panels rather than guess (tests/list-cover-art.test.js requires an entry for every
   * IMAGES id, so that fallback is only ever for a picture added without its review). */
  const PANEL_REVIEWS = {
    'archetype:haunted-and-deathly': { readsAtThird: true, busy: false },
    'archetype:forgotten-ruins': { readsAtThird: true, busy: false },
    'archetype:arcane-sanctums': { readsAtThird: true, busy: false },
    'archetype:feasts-and-revelry': { readsAtThird: false, busy: true },
    'archetype:storms-and-calamity': { readsAtThird: true, busy: false },
    'archetype:infernal-and-profane': { readsAtThird: true, busy: false },
    'archetype:drowned-depths': { readsAtThird: true, busy: false },
    'archetype:strongholds-and-sieges': { readsAtThird: true, busy: true },
    'archetype:monster-lairs': { readsAtThird: false, busy: true },
    'archetype:cursed-and-blighted-lands': { readsAtThird: false, busy: false },
    'archetype:fey-and-enchanted': { readsAtThird: false, busy: true },
    'archetype:starfaring': { readsAtThird: true, busy: true },
    'archetype:sacred-sanctuaries': { readsAtThird: true, busy: false },
    'archetype:streets-and-towns': { readsAtThird: false, busy: true },
    'archetype:crypts-and-tombs': { readsAtThird: true, busy: false },
    'archetype:taverns-and-inns': { readsAtThird: false, busy: true },
    'archetype:blighted-mires': { readsAtThird: true, busy: false },
    'archetype:archives-and-libraries': { readsAtThird: false, busy: true },
    'archetype:planar-rifts': { readsAtThird: true, busy: false },
    'archetype:arenas-and-duels': { readsAtThird: true, busy: false },
    'archetype:chase-and-ambush': { readsAtThird: true, busy: false },
    'archetype:intrigue-and-underworld': { readsAtThird: false, busy: true },
    'archetype:time-and-dream': { readsAtThird: true, busy: false },
    'archetype:dungeon-delves': { readsAtThird: false, busy: true },
    'archetype:perilous-passages': { readsAtThird: true, busy: false },
    'archetype:seafaring': { readsAtThird: true, busy: false },
    'archetype:sinister-woods': { readsAtThird: true, busy: false },
    'archetype:sky-realms': { readsAtThird: true, busy: false },
    'env:cauldera-valley': { readsAtThird: true, busy: false },
    'env:field-of-dreams': { readsAtThird: true, busy: false },
    'env:ouroborean-pass': { readsAtThird: true, busy: false },
    'crop:market-stalls': { readsAtThird: true, busy: false },
    'crop:tavern-terrace': { readsAtThird: true, busy: false },
    'crop:bar-counter': { readsAtThird: true, busy: false },
    'crop:lotus-pool': { readsAtThird: true, busy: false },
    'biome:aquatic': { readsAtThird: true, busy: false },
    'biome:badlands': { readsAtThird: true, busy: false },
    'biome:drylands': { readsAtThird: true, busy: false },
    'biome:forest': { readsAtThird: true, busy: false },
    'biome:frozen': { readsAtThird: true, busy: false },
    'biome:grassland': { readsAtThird: true, busy: false },
    'biome:mountain': { readsAtThird: true, busy: false },
    'biome:rolling': { readsAtThird: true, busy: false },
    'biome:settlement': { readsAtThird: true, busy: false },
    'biome:tropical': { readsAtThird: true, busy: false },
    'biome:underground': { readsAtThird: true, busy: false },
    'biome:wetland': { readsAtThird: true, busy: false },
  };

  return {
    IMAGES, UNIQUE_ENV_IDS, ARCHETYPES, ARCHETYPE_FIT, BIOME_IMAGES, EXPLICIT_ONLY_BIOMES, ENV_IMAGE_OVERRIDES,
    SEMANTIC_OVERRIDES, CROP_CATALOG_WINDOWS, PANEL_REVIEWS,
  };
});
