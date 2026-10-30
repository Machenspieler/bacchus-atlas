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

  const IMAGES = {};
  [
    unique('cauldera-valley', 50),
    unique('field-of-dreams', 58),
    unique('ouroborean-pass', 42),

    archetype('haunted-and-deathly', [50, 34], [50, 40], [88, 40]),
    archetype('forgotten-ruins', [50, 38], [50, 25], [90, 30]),
    archetype('arcane-sanctums', [50, 8], [60, 30], [85, 30]),
    archetype('feasts-and-revelry', [50, 40], [50, 50], [45, 40]),

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

  return {
    IMAGES, UNIQUE_ENV_IDS, ARCHETYPES, ARCHETYPE_FIT, BIOME_IMAGES, EXPLICIT_ONLY_BIOMES, ENV_IMAGE_OVERRIDES,
  };
});
