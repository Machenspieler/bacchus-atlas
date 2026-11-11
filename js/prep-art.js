/* ============================================================
   Bacchus's Atlas — prep-art.js
   Which picture an environment wears in Session Prep's 48px square thumbnail (the picker row,
   and the 40-44px tile of the selected-environments column): its own painting, an approved
   thematic archetype picture where that picture is both a fair portrait of the place
   (js/list-cover-art.js ARCHETYPE_FIT) AND reads at 48x48, otherwise nothing — the caller keeps
   the biome thumbnail it always drew. Pure data and one function; no window, no document, no
   randomness, so a thumbnail is a function of its environment and this file. Loaded as a plain
   <script> and required() from tests/prep-art.test.js, the same shape as the Catalog's resolver.

   Two independent gates, both explicit (docs/research/session-prep-context-adaptive-artwork-integration.md):
     1. semantic  — the environment is mapped to the picture in ARCHETYPE_FIT (never loosened here);
     2. contextual — the picture was reviewed at the real 48px / 96px size (PICTURES[id].use):
          'all'      reads clearly: any mapped fit, strong or acceptable, may wear it
          'strong'   reads, but weakly (dark, generic, small subject): only a 'strong' fit
          'rejected' fails the tile: the biome keeps the row
          'deferred' ambiguous evidence: the biome keeps the row until someone decides
        plus ENV_KEEP_BIOME, single environments where the biome is the closer picture.
   An unreviewed picture (no entry) is never used. Nothing here reads the harbour override table or
   the semantic-crop table of js/list-cover-art.js: those were approved for the Catalog and My Lists,
   not for Prep (PD-091).

   Framing: each picture's square is cut ONCE from the master by scripts/generate-prep-art.js — a
   window `zoom` x the master's height wide (1 = the full height), left edge at x (0-100, the
   travel across the master's width, as CSS object-position) and top edge at y (0-100, vertical
   travel, only meaningful when zoom < 1) — into img/prep-art/<stem>-thumb-{48,96,144}.webp. The
   thumbnail draws it exactly as it draws a biome thumbnail, so no CSS and no per-row position is
   involved. Independent of the My Lists covers and of the Catalog strips.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./list-cover-art.js'));
  else root.PrepArt = factory(root.ListCoverArt);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DefaultArt) {
  'use strict';

  /* The same ladder as img/biomes/<biome>-thumb-*.webp: 48 = 1x, 96 = 2x, 144 = 3x of the 48px tile. */
  const SIZES = [48, 96, 144];
  const DIR = 'img/prep-art/';

  /* picture id (a js/list-cover-art.js IMAGES id) -> { stem, x, y?, zoom?, use, note } */
  const PICTURES = {
    'archetype:arcane-sanctums': { stem: 'archetype-arcane-sanctums', x: 62, use: 'all', note: 'Spire and glowing ring.' },
    'archetype:archives-and-libraries': { stem: 'archetype-archives-and-libraries', x: 25, use: 'all', note: 'Shelves, ladder and desk.' },
    'archetype:arenas-and-duels': { stem: 'archetype-arenas-and-duels', x: 50, use: 'all', note: 'Tiers of arches over sand.' },
    'archetype:blighted-mires': { stem: 'archetype-blighted-mires', x: 80, use: 'strong', note: 'Ruined arch on still water; generic swamp, strong fits only.' },
    'archetype:chase-and-ambush': { stem: 'archetype-chase-and-ambush', x: 48, use: 'rejected', note: 'Muddy forest track: no subject at 48px.' },
    'archetype:crypts-and-tombs': { stem: 'archetype-crypts-and-tombs', x: 15, use: 'all', note: 'The sarcophagus and candles.' },
    'archetype:cursed-and-blighted-lands': { stem: 'archetype-cursed-and-blighted-lands', x: 50, use: 'rejected', note: 'Uniform dark texture at 48px.' },
    'archetype:drowned-depths': { stem: 'archetype-drowned-depths', x: 30, use: 'all', note: 'Light shafts over sunken arches.' },
    'archetype:dungeon-delves': { stem: 'archetype-dungeon-delves', x: 15, use: 'strong', note: 'Barred gate and lantern; dark, strong fits only.' },
    'archetype:feasts-and-revelry': { stem: 'archetype-feasts-and-revelry', x: 15, use: 'strong', note: 'Candles on a laden table; busy, strong fits only.' },
    'archetype:fey-and-enchanted': { stem: 'archetype-fey-and-enchanted', x: 80, use: 'all', note: 'Waterfall, bridge and blossom.' },
    'archetype:forgotten-ruins': { stem: 'archetype-forgotten-ruins', x: 70, use: 'all', note: 'Overgrown arch.' },
    'archetype:haunted-and-deathly': { stem: 'archetype-haunted-and-deathly', x: 62, y: 20, zoom: 0.75, use: 'strong', note: 'Gothic manor over graves; dark, strong fits only.' },
    'archetype:infernal-and-profane': { stem: 'archetype-infernal-and-profane', x: 62, use: 'all', note: 'Red citadel over lava.' },
    'archetype:intrigue-and-underworld': { stem: 'archetype-intrigue-and-underworld', x: 60, use: 'rejected', note: 'Dark street, tiny figure: no subject at 48px.' },
    'archetype:monster-lairs': { stem: 'archetype-monster-lairs', x: 26, use: 'rejected', note: 'Generic cave.' },
    'archetype:perilous-passages': { stem: 'archetype-perilous-passages', x: 20, use: 'all', note: 'Cliff path with a chain rail.' },
    'archetype:planar-rifts': { stem: 'archetype-planar-rifts', x: 65, use: 'all', note: 'Purple tear in the sky, floating ruins.' },
    'archetype:sacred-sanctuaries': { stem: 'archetype-sacred-sanctuaries', x: 15, use: 'all', note: 'Haloed statue and candles.' },
    'archetype:seafaring': { stem: 'archetype-seafaring', x: 25, use: 'all', note: 'Sails, rail and sea: a ship.' },
    'archetype:sinister-woods': { stem: 'archetype-sinister-woods', x: 20, use: 'all', note: 'Twisted trunks and mist.' },
    'archetype:sky-realms': { stem: 'archetype-sky-realms', x: 60, use: 'all', note: 'Floating island over cloud.' },
    'archetype:starfaring': { stem: 'archetype-starfaring', x: 80, use: 'all', note: 'Spaceport, ships and a planet.' },
    'archetype:storms-and-calamity': { stem: 'archetype-storms-and-calamity', x: 70, use: 'all', note: 'Tornado and lightning.' },
    'archetype:storm-downpour': { stem: 'archetype-storm-downpour', x: 32, use: 'strong', note: 'Murky teal rain at 48px, shrine barely visible: strong fits only.' },
    'archetype:storm-lightning': { stem: 'archetype-storm-lightning', x: 77, use: 'all', note: 'Bolt on indigo.' },
    'archetype:storm-hail': { stem: 'archetype-storm-hail', x: 50, use: 'strong', note: 'White lumps on a dark roof; ambiguous at 48px: strong fit only.' },
    'archetype:storm-blizzard': { stem: 'archetype-storm-blizzard', x: 61, use: 'all', note: 'Pale crag.' },
    'archetype:storm-miasma': { stem: 'archetype-storm-miasma', x: 39, use: 'all', note: 'Green fog.' },
    'archetype:storm-lifedrain': { stem: 'archetype-storm-lifedrain', x: 50, use: 'all', note: 'White tree on black.' },
    'archetype:storm-radiance': { stem: 'archetype-storm-radiance', x: 50, use: 'all', note: 'Light burst and stone.' },
    'archetype:storm-arcane': { stem: 'archetype-storm-arcane', x: 77, use: 'all', note: 'Magenta spiral.' },
    'archetype:streets-and-towns': { stem: 'archetype-streets-and-towns', x: 62, use: 'all', note: 'Clock tower and market street.' },
    'archetype:strongholds-and-sieges': { stem: 'archetype-strongholds-and-sieges', x: 62, use: 'strong', note: 'Castle under assault; strong fit only.' },
    'archetype:taverns-and-inns': { stem: 'archetype-taverns-and-inns', x: 25, use: 'all', note: 'Barrels, shelves and a laid table.' },
    'archetype:time-and-dream': { stem: 'archetype-time-and-dream', x: 45, use: 'deferred', note: 'A square holds one season and a hint of the next: premise unclear. Deferred.' },
    'env:cauldera-valley': { stem: 'env-cauldera-valley', x: 50, use: 'all', note: 'Own painting.' },
    'env:field-of-dreams': { stem: 'env-field-of-dreams', x: 50, use: 'all', note: 'Own painting.' },
    'env:ouroborean-pass': { stem: 'env-ouroborean-pass', x: 50, use: 'all', note: 'Own painting.' },
  };

  /* environment id -> why the biome thumbnail stays although its picture is approved for Prep. */
  const ENV_KEEP_BIOME = {
  };

  const inUse = pic => !!pic && (pic.use === 'all' || pic.use === 'strong');

  /** The file paths of one picture's thumbnail ladder. */
  function files(stem) {
    const f = size => `${DIR}${stem}-thumb-${size}.webp`;
    return { src: f(SIZES[0]), srcset: `${f(SIZES[1])} 2x, ${f(SIZES[2])} 3x`, paths: SIZES.map(f) };
  }

  /** What a Prep thumbnail draws for one environment.
   * @param {{id: string}} env
   * @returns {{kind: 'unique'|'thematic'|'biome', imageId: string|null, reason: string}}
   *   'biome' means the caller's own biome thumbnail (or its icon when the environment has no terrain biome). */
  function resolvePrepArt(env, art) {
    art = art || DefaultArt;
    const biome = reason => ({ kind: 'biome', imageId: null, reason });
    if (!env || !env.id) return biome('no-environment');
    const images = art.IMAGES;
    const has = id => !!id && Object.prototype.hasOwnProperty.call(images, id);
    const listed = id => Object.prototype.hasOwnProperty.call(PICTURES, id);

    const own = 'env:' + env.id;
    if (art.UNIQUE_ENV_IDS.includes(env.id) && has(own)) {
      return listed(own) && inUse(PICTURES[own]) ? { kind: 'unique', imageId: own, reason: 'own-painting' } : biome('painting-not-reviewed');
    }

    const fit = art.ARCHETYPE_FIT[env.id];
    if (!fit) return biome('no-fit');
    const group = art.ARCHETYPES[fit[0]];
    const id = group && group.variants[fit[2] || 0];
    if (!has(id)) return biome('no-picture');
    if (!listed(id)) return biome('picture-not-reviewed');
    if (Object.prototype.hasOwnProperty.call(ENV_KEEP_BIOME, env.id)) return biome('environment-keeps-biome');
    const use = PICTURES[id].use;
    if (use === 'rejected') return biome('picture-fails-tile');
    if (use === 'deferred') return biome('picture-deferred');
    if (use === 'strong' && fit[1] !== 'strong') return biome('weak-picture-needs-strong-fit');
    return { kind: 'thematic', imageId: id, reason: 'fit-' + fit[1] + '-picture-' + use };
  }

  return { SIZES, DIR, PICTURES, ENV_KEEP_BIOME, inUse, files, resolvePrepArt };
});
