/* ============================================================
   Bacchus's Atlas — catalog-art.js
   Which picture a Catalog card wears in its 95px-wide vertical strip: a painting, an
   explicit override, a thematic archetype picture where that picture is both a fair
   portrait of the place (js/list-cover-art.js ARCHETYPE_FIT) AND reads in a narrow strip,
   otherwise nothing — the caller keeps the biome strip it always drew. Pure data and one
   function; no window, no document, no randomness, so a card is a function of its
   environment and this file. Loaded as a plain <script> and required() from
   tests/catalog-art.test.js, the same shape as js/list-cover-utils.js.

   Two independent gates, both explicit (docs/research/catalog-context-adaptive-artwork-integration.md):
     1. semantic  — the environment is mapped to the picture in ARCHETYPE_FIT (never loosened here);
     2. contextual — the picture was reviewed in the real strip (PICTURES[id].use):
          'all'    reads clearly: any mapped fit, strong or acceptable, may wear it
          'strong' reads, but weakly (dark, generic, small subject): only a 'strong' fit
          'none'   fails the strip: the biome keeps the card
        plus ENV_KEEP_BIOME, single environments where the biome is the closer picture.
   An unreviewed picture (no entry) is never used. No brightness, edge or "aesthetic" score
   decides anything.

   Framing: each picture's 1:3 strip is cut ONCE, at x (0-100, the same travel convention as
   CSS object-position, across the master's width), by scripts/generate-catalog-art.js into
   img/catalog-art/<stem>-{100,200,250,300}.avif + -200.webp. The card draws it exactly as it
   draws a biome strip, so no CSS and no per-card position is involved. Independent of the
   My Lists crops (js/list-cover-art.js) and of anything Session Prep shows.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./list-cover-art.js'));
  else root.CatalogArt = factory(root.ListCoverArt);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DefaultArt) {
  'use strict';

  /* Same ladder as the biome strips (img/biomes/): 100 = 95px at 1x, 200 = 2x, 250 = 2.5x, 300 = 3x. */
  const WIDTHS = [100, 200, 250, 300];
  const DIR = 'img/catalog-art/';

  /* picture id (a js/list-cover-art.js IMAGES id) -> { stem, x, use, note } */
  const PICTURES = {
    'archetype:arcane-sanctums': { stem: 'archetype-arcane-sanctums', x: 65, use: 'all', note: 'Spire and orbiting rings fill the strip.' },
    'archetype:archives-and-libraries': { stem: 'archetype-archives-and-libraries', x: 16, use: 'all', note: 'Shelves, ladder and scrolls at x16; the window is lost.' },
    'archetype:arenas-and-duels': { stem: 'archetype-arenas-and-duels', x: 26, use: 'all', note: 'Arches, braziers and sand: an arena at a glance.' },
    'archetype:blighted-mires': { stem: 'archetype-blighted-mires', x: 79, use: 'strong', note: 'Ruined arch on still water; generic swamp, so strong fits only.' },
    'archetype:chase-and-ambush': { stem: 'archetype-chase-and-ambush', x: 48, use: 'none', note: 'Marginal and no environment has a strong fit: not cut.' },
    'archetype:crypts-and-tombs': { stem: 'archetype-crypts-and-tombs', x: 33, use: 'all', note: 'Sarcophagus and candles in one strip.' },
    'archetype:cursed-and-blighted-lands': { stem: 'archetype-cursed-and-blighted-lands', x: 50, use: 'strong', note: 'Spiked ridges under a bruised sky; abstract, strong fit only.' },
    'archetype:drowned-depths': { stem: 'archetype-drowned-depths', x: 55, use: 'all', note: 'Light shafts and a sunken domed city.' },
    'archetype:dungeon-delves': { stem: 'archetype-dungeon-delves', x: 11, use: 'strong', note: 'Barred gate and lantern; dark, strong fits only.' },
    'archetype:feasts-and-revelry': { stem: 'archetype-feasts-and-revelry', x: 43, use: 'all', note: 'Candles, banners and a laden table.' },
    'archetype:fey-and-enchanted': { stem: 'archetype-fey-and-enchanted', x: 68, use: 'all', note: 'Waterfall, bridge and blossom.' },
    'archetype:forgotten-ruins': { stem: 'archetype-forgotten-ruins', x: 77, use: 'all', note: 'Overgrown arch and statue.' },
    'archetype:haunted-and-deathly': { stem: 'archetype-haunted-and-deathly', x: 56, use: 'strong', note: 'Gothic manor and graves; dark, strong fits only.' },
    'archetype:infernal-and-profane': { stem: 'archetype-infernal-and-profane', x: 56, use: 'all', note: 'Red citadel: instantly Hell.' },
    'archetype:intrigue-and-underworld': { stem: 'archetype-intrigue-and-underworld', x: 60, use: 'none', note: 'Marginal and no environment has a strong fit: not cut.' },
    'archetype:monster-lairs': { stem: 'archetype-monster-lairs', x: 26, use: 'none', note: 'Reads as a generic cave and no environment has a strong fit: not cut.' },
    'archetype:perilous-passages': { stem: 'archetype-perilous-passages', x: 40, use: 'strong', note: 'Cliff path with a chain rail; strong fits only.' },
    'archetype:planar-rifts': { stem: 'archetype-planar-rifts', x: 53, use: 'all', note: 'Floating fragments and a torn sky.' },
    'archetype:sacred-sanctuaries': { stem: 'archetype-sacred-sanctuaries', x: 30, use: 'all', note: 'Statue, halo and candles.' },
    'archetype:seafaring': { stem: 'archetype-seafaring', x: 16, use: 'all', note: 'Mast, sail, barrels and lantern say ship (x16, not open sea).' },
    'archetype:sinister-woods': { stem: 'archetype-sinister-woods', x: 37, use: 'all', note: 'Twisted trunks and mist.' },
    'archetype:sky-realms': { stem: 'archetype-sky-realms', x: 56, use: 'all', note: 'Floating island over a sea of cloud.' },
    'archetype:starfaring': { stem: 'archetype-starfaring', x: 84, use: 'all', note: 'Spaceport, ships and a planet.' },
    'archetype:storms-and-calamity': { stem: 'archetype-storms-and-calamity', x: 94, use: 'all', note: 'Tornado and lightning (x94; the My Lists crop shows no storm).' },
    'archetype:streets-and-towns': { stem: 'archetype-streets-and-towns', x: 65, use: 'all', note: 'Clock tower and timbered market street.' },
    'archetype:strongholds-and-sieges': { stem: 'archetype-strongholds-and-sieges', x: 70, use: 'strong', note: 'Castle under assault; the siege reads, strong fit only.' },
    'archetype:taverns-and-inns': { stem: 'archetype-taverns-and-inns', x: 52, use: 'all', note: 'Timber beams, tables and lanterns.' },
    'archetype:time-and-dream': { stem: 'archetype-time-and-dream', x: 56, use: 'none', note: 'A strip holds one of the three seasons: reads as an autumn village, premise lost. Not cut.' },
    /* Approved semantic crops (PD-090): 1:3 windows of an archetype master, cut by
     * scripts/generate-semantic-crops.js; `widths` stop at the pixels the window holds. Only reached through
     * js/list-cover-art.js SEMANTIC_OVERRIDES, never through ARCHETYPE_FIT. */
    'crop:market-stalls': { stem: 'crop-market-stalls', use: 'all', widths: [100, 200, 250], note: 'Vendor, bread, cheese and garlic under an awning.' },
    'crop:tavern-terrace': { stem: 'crop-tavern-terrace', use: 'all', widths: [100, 200], note: 'Inn terrace: awning, lanterns, drinkers.' },
    'crop:bar-counter': { stem: 'crop-bar-counter', use: 'all', widths: [100, 200], note: 'Casks, shelves and a candle on a bar.' },
    'crop:statue-altar': { stem: 'crop-statue-altar', use: 'all', widths: [100, 200], note: 'Saint statue holding a flame, halo and candles.' },
    'env:cauldera-valley': { stem: 'env-cauldera-valley', x: 50, use: 'all', note: 'Own painting.' },
    'env:field-of-dreams': { stem: 'env-field-of-dreams', x: 50, use: 'all', note: 'Own painting.' },
    'env:ouroborean-pass': { stem: 'env-ouroborean-pass', x: 50, use: 'all', note: 'Own painting.' },
  };

  /* environment id -> why the biome strip stays although its picture is approved for the strip. */
  const ENV_KEEP_BIOME = {
  };

  /** The file paths of one picture's strip (`widths` for a crop, which stops at its window's pixels). */
  function files(stem, widths) {
    return {
      avif: (widths || WIDTHS).map(w => ({ path: `${DIR}${stem}-${w}.avif`, w })),
      fallback: `${DIR}${stem}-200.webp`,
    };
  }

  /** What a Catalog card draws for one environment.
   * @param {{id: string}} env
   * @returns {{kind: 'unique'|'override'|'crop'|'thematic'|'biome', imageId: string|null, reason: string}}
   *   'biome' means the caller's own biome strip; 'override' is the harbour (the biome:settlement
   *   picture), which is the existing settlement strip, so it carries no file of its own. */
  function resolveCatalogArt(env, art) {
    art = art || DefaultArt;
    const biome = reason => ({ kind: 'biome', imageId: null, reason });
    if (!env || !env.id) return biome('no-environment');
    const images = art.IMAGES;
    const has = id => !!id && Object.prototype.hasOwnProperty.call(images, id);
    const approved = id => Object.prototype.hasOwnProperty.call(PICTURES, id) && PICTURES[id].use !== 'none';

    const own = 'env:' + env.id;
    if (art.UNIQUE_ENV_IDS.includes(env.id) && has(own)) {
      return approved(own) ? { kind: 'unique', imageId: own, reason: 'own-painting' } : biome('painting-not-reviewed');
    }

    const forced = art.ENV_IMAGE_OVERRIDES[env.id];
    if (has(forced)) return { kind: 'override', imageId: forced, reason: 'explicit-override' };

    /* An approved semantic crop for this context. A crop whose strip is missing here falls through
     * to what the card drew before. */
    const sem = art.SEMANTIC_OVERRIDES && art.SEMANTIC_OVERRIDES[env.id];
    const cropId = sem && sem.contexts.includes('catalog') ? 'crop:' + sem.crop : null;
    if (cropId && approved(cropId)) return { kind: 'crop', imageId: cropId, reason: 'semantic-override' };

    const fit = art.ARCHETYPE_FIT[env.id];
    if (!fit) return biome('no-fit');
    const group = art.ARCHETYPES[fit[0]];
    const id = group && group.variants[fit[2] || 0];
    if (!has(id)) return biome('no-picture');
    if (!Object.prototype.hasOwnProperty.call(PICTURES, id)) return biome('picture-not-reviewed');
    if (Object.prototype.hasOwnProperty.call(ENV_KEEP_BIOME, env.id)) return biome('environment-keeps-biome');
    const use = PICTURES[id].use;
    if (use === 'none') return biome('picture-fails-strip');
    if (use === 'strong' && fit[1] !== 'strong') return biome('weak-picture-needs-strong-fit');
    return { kind: 'thematic', imageId: id, reason: 'fit-' + fit[1] + '-picture-' + use };
  }

  return { WIDTHS, DIR, PICTURES, ENV_KEEP_BIOME, files, resolveCatalogArt };
});
