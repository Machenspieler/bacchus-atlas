/* ============================================================
   Semantic Artwork Reuse Lab — data.js  (DEV-ONLY; lab/ is excluded from dist/)
   The lab's curated research data: sources, semantic regions, environment mappings and the
   preliminary 28-source opportunity scan. One reviewer's judgement (2026-11-02), made from the real
   masters and the real environment lore — not a classifier, not read by the application, and not
   a production approval. Nothing here may be copied into js/list-cover-art.js or data/.

   Region ids are `<source id>-<slug>` and never change; bounds are normalised to the master
   (x, y, width, height in 0..1). `subject` is the focal subject, normalised to the REGION, used
   to tell whether a frame cuts it away. `contexts[frame].verdict` is the human reading of the
   crop at that frame's real size; the computed resolution result is separate (lab-core.js).
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SemanticReuseData = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MASTER_DIR = 'img/cover-archetypes-source/';
  /* archetype id -> master file (js/list-cover-art.js ids; masters verified by scripts/semantic-reuse-lab.js). */
  const MASTER_FILES = {
    'arcane-sanctums': 'arcane-sanctums-landscape.png', 'archives-and-libraries': 'archives-and-libraries.png', 'arenas-and-duels': 'arenas-and-duels.png',
    'blighted-mires': 'blighted-mires.png', 'chase-and-ambush': 'chase-and-ambush.png', 'crypts-and-tombs': 'crypts-and-tombs.png',
    'cursed-and-blighted-lands': 'cursed-and-blighted-lands.png', 'drowned-depths': 'drowned-depths.png', 'dungeon-delves': 'dungeon-delves.png',
    'feasts-and-revelry': 'feasts-and-revelry-landscape.png', 'fey-and-enchanted': 'fey-and-enchanted.png', 'forgotten-ruins': 'forgotten-ruins-landscape.png',
    'haunted-and-deathly': 'haunted-and-deathly-landscape.png', 'infernal-and-profane': 'infernal-and-profane.png', 'intrigue-and-underworld': 'intrigue-and-underworld.png',
    'monster-lairs': 'monster-lairs.png', 'perilous-passages': 'perilous-passages.png', 'planar-rifts': 'planar-rifts.png', 'sacred-sanctuaries': 'sacred-sanctuaries.png',
    seafaring: 'seafaring.png', 'sinister-woods': 'sinister-woods.png', 'sky-realms': 'sky-realms.png', starfaring: 'starfaring.png',
    'storms-and-calamity': 'storms-and-calamity.png', 'streets-and-towns': 'streets-and-towns.png', 'strongholds-and-sieges': 'strongholds-and-sieges.png',
    'taverns-and-inns': 'taverns-and-inns.png', 'time-and-dream': 'time-and-dream.png',
  };
  /* Present in the folder but not a production picture (the registry uses the landscape). Inventoried, never used. */
  const EXTRA_MASTERS = { 'haunted-and-deathly-portrait': 'haunted-and-deathly-portrait.png' };
  const PILOT_SOURCES = ['streets-and-towns', 'taverns-and-inns', 'archives-and-libraries', 'strongholds-and-sieges', 'starfaring', 'seafaring'];

  const b = (x, y, width, height) => ({ x, y, width, height });
  const v = (verdict, note) => ({ verdict, note });

  /* ---------- semantic regions ---------- */
  const REGIONS = [
    /* ===== streets-and-towns ===== */
    {
      id: 'streets-and-towns-market-stalls', sourceId: 'streets-and-towns', label: 'Market stall and vendor', status: 'approved',
      description: 'A vendor behind a stall of cheese, bread, apples and garlic, a customer in a cloak, awning overhead.',
      bounds: b(0.0, 0.18, 0.34, 0.82), subject: b(0.15, 0.3, 0.45, 0.55), subjects: { lists1: b(0.15, 0.4, 0.5, 0.18), lists2: b(0.15, 0.4, 0.5, 0.28) },
      visualQa: { recognizability: 'high', complexity: 'medium', contrast: 'good', lighting: 'warm lantern light', detail: 'dense but readable', distinct: 'unlike every other pilot crop' },
      contexts: {
        catalog: v('pass', 'Awning, goods and vendor read in the strip; the food is the giveaway.'),
        prep: v('pass', 'Warm awning + figure silhouette reads as a stall at 48px.'),
        lists1: v('pass', 'A wide band over the produce counter still reads as a market.'),
        lists2: v('pass', ''), lists3: v('pass', 'Third-width tile keeps the vendor.'),
      },
    },
    {
      id: 'streets-and-towns-market-street', sourceId: 'streets-and-towns', label: 'Cobbled market street', status: 'approved',
      description: 'A cobbled lane between timbered houses with walkers and a dog, an arched gate and banners ahead.',
      bounds: b(0.30, 0.25, 0.45, 0.65), subject: b(0.36, 0.1, 0.3, 0.8), subjects: { lists1: b(0.3, 0.42, 0.4, 0.18), lists2: b(0.3, 0.1, 0.4, 0.8) },
      visualQa: { recognizability: 'high', complexity: 'high', contrast: 'good', lighting: 'low sun on wet cobbles', detail: 'many small figures', distinct: 'overlaps the archetype picture the Catalog already shows' },
      contexts: {
        catalog: v('pass', 'Archway and walkers hold in the strip.'),
        prep: v('fail', 'Figures dissolve into noise at 48px; reads as a generic old town.'),
        lists1: v('pass', 'Good band: street, gate, figures.'),
        lists2: v('pass', ''), lists3: v('pass', ''),
      },
    },
    {
      id: 'streets-and-towns-tavern-terrace', sourceId: 'streets-and-towns', label: 'Inn terrace on the street', status: 'approved',
      description: 'Patrons around a table under the awning of a timbered inn with a griffin sign; a barrel and a lantern beside the door.',
      bounds: b(0.70, 0.30, 0.30, 0.70), subject: b(0.45, 0.25, 0.5, 0.45), subjects: { lists1: b(0.4, 0.3, 0.55, 0.16) },
      visualQa: { recognizability: 'high', complexity: 'medium', contrast: 'good', lighting: 'warm window glow', detail: 'faces readable at 2x', distinct: 'the only exterior inn in the library' },
      contexts: {
        catalog: v('pass', 'Sign, awning, drinkers: an inn on a street.'),
        prep: v('pass', 'Awning and glowing windows read.'),
        lists1: v('pass', ''), lists2: v('pass', ''), lists3: v('pass', ''),
      },
    },
    {
      id: 'streets-and-towns-clock-tower-gate', sourceId: 'streets-and-towns', label: 'Clock tower and gate', status: 'not-independently-meaningful',
      description: 'A conventional stone clock tower with a pointed spire above a blue-bannered archway.',
      bounds: b(0.58, 0.0, 0.22, 0.62), subject: b(0.25, 0.0, 0.5, 0.58),
      notes: 'Beautiful, and reads instantly — but no environment describes an ordinary clock tower or town gate. Its only literal matches (a frozen, 300ft arcane clocktower; a shattered haunted watchtower; a wizard\'s tower) are exactly the invented-semantics cases the brief forbids.',
      visualQa: { recognizability: 'high', complexity: 'medium', contrast: 'good', lighting: 'daylight', detail: 'adequate', distinct: 'yes' },
      contexts: { catalog: v('unreviewed', ''), prep: v('unreviewed', ''), lists1: v('unreviewed', ''), lists2: v('unreviewed', ''), lists3: v('unreviewed', '') },
    },

    /* ===== taverns-and-inns ===== */
    {
      id: 'taverns-and-inns-fireplace', sourceId: 'taverns-and-inns', label: 'Hearth and common room', status: 'approved',
      description: 'A stone fireplace with a blazing fire, a daylit window and a rug; tables and chairs in the room beyond.',
      bounds: b(0.62, 0.30, 0.38, 0.65), subject: b(0.3, 0.12, 0.32, 0.5), subjects: { lists1: b(0.3, 0.22, 0.35, 0.3) },
      visualQa: { recognizability: 'high', complexity: 'low', contrast: 'excellent', lighting: 'fire against shade', detail: 'soft', distinct: 'only hearth in the library' },
      contexts: {
        catalog: v('pass', 'The fire alone says hearth; strong focal point.'),
        prep: v('pass', 'Brightest crop of the pilot at 48px.'),
        lists1: v('pass', ''), lists2: v('pass', ''), lists3: v('pass', ''),
      },
    },
    {
      id: 'taverns-and-inns-bar-counter', sourceId: 'taverns-and-inns', label: 'Bar counter with casks', status: 'approved',
      description: 'A wooden bar with casks, bottles and tankards on shelves, candles, a stag banner overhead.',
      bounds: b(0.0, 0.20, 0.42, 0.50), subject: b(0.42, 0.12, 0.22, 0.55), subjects: { lists1: b(0.3, 0.3, 0.4, 0.3) },
      visualQa: { recognizability: 'high', complexity: 'medium', contrast: 'good', lighting: 'candles', detail: 'rich', distinct: 'bar, not a table' },
      contexts: {
        catalog: v('pass', 'Casks on shelves read as a bar.'),
        prep: v('pass', 'Barrels and candle read.'),
        lists1: v('pass', ''), lists2: v('pass', ''), lists3: v('pass', ''),
      },
    },
    {
      id: 'taverns-and-inns-dining-table', sourceId: 'taverns-and-inns', label: 'Laid table (still life)', status: 'not-independently-meaningful',
      description: 'Bread, cheese, apples, a pitcher and a candle on a table runner.',
      bounds: b(0.0, 0.62, 0.45, 0.38), subject: b(0.1, 0.1, 0.6, 0.75),
      notes: 'An isolated still life: it says "food", not "tavern" or "feast" — a generic object, the failure the brief warns about. Kept as a documented weak example.',
      visualQa: { recognizability: 'low', complexity: 'low', contrast: 'good', lighting: 'candle', detail: 'good', distinct: 'no' },
      contexts: { catalog: v('unreviewed', ''), prep: v('unreviewed', ''), lists1: v('unreviewed', ''), lists2: v('unreviewed', ''), lists3: v('unreviewed', '') },
    },

    /* ===== archives-and-libraries ===== */
    {
      id: 'archives-and-libraries-shelves-ladder', sourceId: 'archives-and-libraries', label: 'Bookshelves with banner', status: 'approved',
      description: 'Floor-to-ceiling shelves of leather books and scroll bundles, creeping ivy, a banner with an open-book emblem.',
      bounds: b(0.0, 0.0, 0.36, 0.50), subject: b(0.05, 0.1, 0.3, 0.8), subjects: { lists1: b(0.05, 0.3, 0.4, 0.18) },
      visualQa: { recognizability: 'high', complexity: 'high', contrast: 'medium', lighting: 'warm, dim', detail: 'dense', distinct: 'yes' },
      contexts: {
        catalog: v('pass', 'Books and the open-book banner: unmistakable.'),
        prep: v('pass', 'Brown spines and scroll bundles read as a library.'),
        lists1: v('pass', 'Band over the shelves works.'),
        lists2: v('pass', ''), lists3: v('pass', ''),
      },
    },
    {
      id: 'archives-and-libraries-scholars-desk', sourceId: 'archives-and-libraries', label: "Scholar's desk", status: 'approved',
      description: 'A desk with a lantern, quill, an open map, scrolls, stacked books, a magnifying glass and an armillary sphere.',
      bounds: b(0.0, 0.50, 0.62, 0.50), subject: b(0.08, 0.05, 0.3, 0.8), subjects: { lists1: b(0.08, 0.15, 0.4, 0.5) },
      visualQa: { recognizability: 'high', complexity: 'high', contrast: 'good', lighting: 'lantern', detail: 'rich', distinct: 'yes' },
      contexts: {
        catalog: v('fail', 'A 2.2:1 region in a 1:2.6 strip keeps only the lantern or only the scrolls: it stops saying "desk".'),
        prep: v('pass', 'Lantern + scrolls read at 48px.'),
        lists1: v('pass', 'Best use of this region: a wide desk band.'),
        lists2: v('pass', ''), lists3: v('pass', 'Third tile keeps the lantern and book.'),
      },
    },
    {
      id: 'archives-and-libraries-window-hall', sourceId: 'archives-and-libraries', label: 'Vaulted hall and tall window', status: 'approved',
      description: 'A pillared hall under a vault, light pouring through a tall mullioned window wrapped in ivy; a globe on the floor.',
      bounds: b(0.55, 0.0, 0.35, 0.55), subject: b(0.42, 0.05, 0.38, 0.75),
      visualQa: { recognizability: 'medium', complexity: 'medium', contrast: 'excellent', lighting: 'god-rays', detail: 'good', distinct: 'yes' },
      contexts: {
        catalog: v('pass', 'Window and rays make a strong vertical.'),
        prep: v('pass', ''), lists1: v('fail', 'Band crop slices the window into a pale stripe; reads as a church.'),
        lists2: v('pass', ''), lists3: v('pass', ''),
      },
    },

    /* ===== strongholds-and-sieges ===== */
    {
      id: 'strongholds-and-sieges-trebuchet', sourceId: 'strongholds-and-sieges', label: 'Trebuchet and crew', status: 'approved',
      description: 'A wooden trebuchet in silhouette against smoke and sun, its crew around it, a war banner beside.',
      bounds: b(0.0, 0.25, 0.25, 0.60), subject: b(0.15, 0.08, 0.5, 0.65), subjects: { lists2: b(0.15, 0.12, 0.5, 0.35) },
      visualQa: { recognizability: 'high', complexity: 'medium', contrast: 'excellent', lighting: 'backlit smoke', detail: 'silhouette', distinct: 'only siege engine in the library' },
      contexts: {
        catalog: v('pass', 'The throwing arm is the whole picture.'),
        prep: v('pass', 'Reads as siege machinery.'),
        lists1: v('fail', 'In a 3.5:1 band the region becomes a grey blur: only the top of the arm survives.'),
        lists2: v('pass', ''), lists3: v('pass', ''),
      },
    },
    {
      id: 'strongholds-and-sieges-castle-walls', sourceId: 'strongholds-and-sieges', label: 'Castle curtain wall under attack', status: 'approved',
      description: 'Crenellated curtain walls and towers of a hilltop castle, a portcullis gate, fires and smoke, arrows in flight.',
      bounds: b(0.45, 0.12, 0.55, 0.50), subject: b(0.4, 0.25, 0.18, 0.65), subjects: { lists1: b(0.3, 0.3, 0.4, 0.45) },
      visualQa: { recognizability: 'high', complexity: 'high', contrast: 'medium', lighting: 'fire glow', detail: 'dense', distinct: 'mostly the archetype picture again' },
      contexts: {
        catalog: v('pass', 'Towers and the burning wall read; the siege is evident, which is the point and the limit.'),
        prep: v('pass', ''), lists1: v('pass', ''), lists2: v('pass', ''), lists3: v('pass', ''),
      },
    },

    /* ===== starfaring ===== */
    {
      id: 'starfaring-spaceport-promenade', sourceId: 'starfaring', label: 'Spaceport promenade', status: 'needs-better-crop',
      description: 'A lamp-lit concourse with an orrery, travellers and a domed terminal behind a banner.',
      bounds: b(0.0, 0.15, 0.50, 0.85), subject: b(0.2, 0.05, 0.4, 0.7),
      notes: 'Reads as a fantasy market hall: the sci-fi evidence (ships, planet) is outside the crop. Needs a different box.',
      visualQa: { recognizability: 'medium', complexity: 'high', contrast: 'good', lighting: 'lanterns', detail: 'rich', distinct: 'no technological identity in this crop' },
      contexts: { catalog: v('unreviewed', ''), prep: v('unreviewed', ''), lists1: v('unreviewed', ''), lists2: v('unreviewed', ''), lists3: v('unreviewed', '') },
    },
    {
      id: 'starfaring-docked-ship', sourceId: 'starfaring', label: 'Docked starship at the spaceport', status: 'approved',
      description: 'A weathered starship resting on a docking platform with a planet and other ships behind it.',
      bounds: b(0.68, 0.35, 0.32, 0.40), subject: b(0.1, 0.25, 0.85, 0.5), subjects: { lists1: b(0.1, 0.3, 0.85, 0.32) },
      visualQa: { recognizability: 'high', complexity: 'medium', contrast: 'medium', lighting: 'cool daylight', detail: 'good', distinct: 'yes' },
      contexts: {
        catalog: v('fail', 'A long hull cannot live in a 1:2.6 strip: the ship is cut in half. Does not qualify.'),
        prep: v('fail', 'The hull is cropped at both ends in a square.'),
        lists1: v('pass', 'Landscape band suits the ship.'),
        lists2: v('pass', ''), lists3: v('fail', 'Third tile cuts the hull.'),
      },
    },
    {
      id: 'starfaring-orbital-arch-planet', sourceId: 'starfaring', label: 'Orbital ring and planet', status: 'approved',
      description: 'A large planet with a smaller moon, a segmented orbital ring and a floating tower-city, two ships under thrust.',
      bounds: b(0.55, 0.0, 0.45, 0.45), subject: b(0.5, 0.35, 0.2, 0.3),
      visualQa: { recognizability: 'high', complexity: 'low', contrast: 'excellent', lighting: 'starlit', detail: 'good', distinct: 'only pure space view' },
      contexts: {
        catalog: v('pass', 'Planet limb and a ship under thrust: space at a glance.'),
        prep: v('pass', 'A planet disc reads at 48px.'),
        lists1: v('pass', ''), lists2: v('pass', ''), lists3: v('pass', ''),
      },
    },

    /* ===== seafaring ===== */
    {
      id: 'seafaring-deck-rigging', sourceId: 'seafaring', label: 'Deck, mast and rigging', status: 'approved',
      description: 'The deck of a sailing ship: a lantern, casks, the mainmast with furled sail and rope rigging, the sea beyond the rail.',
      bounds: b(0.0, 0.0, 0.50, 0.80), subject: b(0.3, 0.0, 0.35, 0.85), subjects: { lists1: b(0.3, 0.1, 0.4, 0.28), lists2: b(0.3, 0.1, 0.4, 0.4) },
      visualQa: { recognizability: 'high', complexity: 'high', contrast: 'good', lighting: 'sunset', detail: 'rich', distinct: 'close cousin of the archetype crop already used (x16)' },
      contexts: {
        catalog: v('pass', 'Rigging and sail are the ship; nearly identical to the existing Seafaring strip.'),
        prep: v('pass', ''), lists1: v('pass', ''), lists2: v('pass', ''), lists3: v('pass', ''),
      },
    },
    {
      id: 'seafaring-lighthouse-coast', sourceId: 'seafaring', label: 'Distant lighthouse on the cliffs', status: 'insufficient-resolution',
      description: 'A small lighthouse on a headland above a harbour village, far across the water.',
      bounds: b(0.78, 0.12, 0.22, 0.35), subject: b(0.1, 0.4, 0.14, 0.25),
      notes: 'The lighthouse is ~50px tall in the master. Every frame would enlarge a smudge. The lab\'s resolution-insufficient example.',
      visualQa: { recognizability: 'low', complexity: 'low', contrast: 'low', lighting: 'overcast', detail: 'none at this size', distinct: 'n/a' },
      contexts: { catalog: v('unreviewed', ''), prep: v('unreviewed', ''), lists1: v('unreviewed', ''), lists2: v('unreviewed', ''), lists3: v('unreviewed', '') },
    },
    {
      id: 'seafaring-storm-waves', sourceId: 'seafaring', label: 'Heavy sea off the rail', status: 'needs-better-crop',
      description: 'Dark rolling waves with white crests seen over the ship\'s rail.',
      bounds: b(0.45, 0.50, 0.55, 0.50), subject: b(0.2, 0.3, 0.4, 0.5),
      notes: 'Generic open water with a hint of rail; it would stand for any sea. Only reads as a ship when the rail is kept in frame.',
      visualQa: { recognizability: 'medium', complexity: 'low', contrast: 'good', lighting: 'dusk', detail: 'good', distinct: 'partly' },
      contexts: { catalog: v('unreviewed', ''), prep: v('unreviewed', ''), lists1: v('unreviewed', ''), lists2: v('unreviewed', ''), lists3: v('unreviewed', '') },
    },
  ];

  /* ---------- environment mappings ---------- */
  /* [region, environment, review, reason, improves?]  `improves` = the crop is a confirmed qualitative
   * improvement on a picture the environment ALREADY wears (so it may count as net gain); omit otherwise. */
  const M = (region, env, review, reason, improves) => ({ regionId: region, envId: env, review, reason, improves: improves || '' });
  const ST = 'streets-and-towns-'; const TV = 'taverns-and-inns-'; const AR = 'archives-and-libraries-'; const SG = 'strongholds-and-sieges-'; const SF = 'starfaring-'; const SEA = 'seafaring-';
  const MAPPINGS = [
    /* market stalls */
    M(ST + 'market-stalls', 'bustling-marketplace', 'strong', 'Lore: artisans, traveling merchants, patrons across social classes — exactly a stall with vendor and customer.', 'Catalog shows a clock tower and street today; the stall is the economic heart the lore names.'),
    M(ST + 'market-stalls', 'city-festival', 'acceptable', 'Carts of baked goods, produce and meat around a plaza; the stall shows bread, cheese and fruit. No festival mood, no plaza.'),
    M(ST + 'market-stalls', 'emberwood-village', 'acceptable', 'A bustling market square of merchants; a vendor at a stall fits, though the village itself is not shown.'),
    M(ST + 'market-stalls', 'port-city', 'needs-review', 'Lore says only "trade, food, art, commerce"; nothing in the crop says harbour.'),
    M(ST + 'market-stalls', 'chaotic-marketplace', 'rejected', 'Environment is panic and flight; the crop shows a calm stall.'),
    M(ST + 'market-stalls', 'the-undermarket', 'rejected', 'A criminal market in the sewers; this is a sunlit civilian stall (market stall ≠ underworld).'),
    M(ST + 'market-stalls', 'the-garden', 'rejected', 'A floating market on wrecked airships; no sky, no sails.'),
    /* market street */
    M(ST + 'market-street', 'street-chase', 'acceptable', 'A chase through winding streets; this cobbled street with an archway is a fair stage, though it holds no chase.'),
    M(ST + 'market-street', 'outpost-town', 'acceptable', 'A town street at a frontier; plausible, nothing contradicts.'),
    M(ST + 'market-street', 'bustling-marketplace', 'acceptable', 'Stalls and crowds line the lane, but the stall crop is the closer picture.'),
    M(ST + 'market-street', 'city-streets', 'needs-review', 'Lore: traffic, toxic smog and peddlers; the crop is clean and picturesque.'),
    M(ST + 'market-street', 'the-village-of-hush', 'needs-review', 'A friendly forest village; this reads as a walled city with a castle behind.'),
    M(ST + 'market-street', 'jungle-river-village', 'rejected', 'A jungle river village; timbered northern houses contradict it.'),
    /* tavern terrace */
    M(ST + 'tavern-terrace', 'resting-dagger-inn', 'strong', 'Lore: a bustling inn along a busy street — an inn front with a griffin sign, patrons and the street beside it.', 'The Catalog currently shows the market-street picture, not an inn.'),
    M(ST + 'tavern-terrace', 'local-tavern', 'acceptable', 'The social hub of a town: drinkers at a table. It shows the terrace, not a taproom.'),
    M(ST + 'tavern-terrace', 'teal-heart-inn', 'needs-review', 'A roadside inn for sleeping and scheming; a town-street terrace is not roadside.'),
    M(ST + 'tavern-terrace', 'jazz-speakeasy', 'rejected', 'A secret, criminal club; a bright public terrace implies the opposite (bright tavern ≠ criminal den).'),
    M(ST + 'tavern-terrace', 'the-squealing-boar-tavern-brawl', 'rejected', 'A brawl in a laborers\' tavern; the crop is a calm terrace and shows no boar.'),
    /* clock tower — negatives */
    M(ST + 'clock-tower-gate', 'cosmological-clocktower', 'rejected', 'A 300ft square arcane clocktower frozen at 11:11; this is an ordinary Gothic clock tower with no magic.'),
    M(ST + 'clock-tower-gate', 'archmages-tower', 'rejected', 'An ordinary tower is not a wizard\'s tower: no arcane evidence anywhere in the crop.'),
    M(ST + 'clock-tower-gate', 'castle-of-wails', 'rejected', 'A shattered, haunted watchtower; this tower is intact and sunlit.'),
    M(ST + 'clock-tower-gate', 'sovereignty-outpost', 'rejected', 'Sci-fi guard towers; the crop is medieval.'),
    /* fireplace */
    M(TV + 'fireplace', 'local-tavern', 'acceptable', 'A hearth and tables in a lively common room; no crowd, but nothing contradicts.'),
    M(TV + 'fireplace', 'teal-heart-inn', 'acceptable', 'A warm roadside inn: a blazing hearth and daylit window are its welcome.'),
    M(TV + 'fireplace', 'the-dungeoneer', 'rejected', 'Lore specifies a low-ceilinged subterranean tavern with a stone bar; this room has a big daylight window.'),
    M(TV + 'fireplace', 'resting-dagger-inn', 'acceptable', 'A bustling inn: the common room is plausible, but its picture of record is the street front.'),
    /* bar counter */
    M(TV + 'bar-counter', 'local-tavern', 'strong', 'A bar with casks, bottles and tankards: the taproom a "lively tavern" implies.'),
    M(TV + 'bar-counter', 'the-dungeoneer', 'acceptable', 'Lore has a polished stone bar; this one is wooden and above ground, but it is unmistakably a bar.'),
    M(TV + 'bar-counter', 'the-wandering-tavern', 'acceptable', 'An inn run by a barkeep; the stag banner and casks fit. The non-Euclidean strangeness is absent.'),
    M(TV + 'bar-counter', 'the-squealing-boar-tavern-brawl', 'needs-review', 'A laborers\' tavern with a boar-head; the bar fits but there is no boar and no brawl.'),
    M(TV + 'bar-counter', 'jazz-speakeasy', 'rejected', 'A criminal speakeasy; warm bright cask-lit tavern reads as a public house.'),
    M(TV + 'bar-counter', 'den-of-vice-and-violence', 'rejected', 'A seedy den of criminals; this bar is cosy, not sinister.'),
    /* dining table */
    M(TV + 'dining-table', 'grand-feast', 'rejected', 'A single laid table is not a feast hall; scale and spectacle are missing.'),
    M(TV + 'dining-table', 'local-tavern', 'rejected', 'An isolated still life says "food", not "tavern".'),
    /* shelves */
    M(AR + 'shelves-ladder', 'library-of-the-dusk-tree', 'strong', 'An impressive library of histories: shelves of books and scrolls with a library emblem.'),
    M(AR + 'shelves-ladder', 'civic-library', 'acceptable', 'Books and shelves fit; the lore\'s brick façade, tiled floor and glass dome are not shown.'),
    M(AR + 'shelves-ladder', 'neverhome-library', 'needs-review', 'A library of dark texts; these warm leather shelves carry no menace.'),
    M(AR + 'shelves-ladder', 'forum-between-worlds', 'needs-review', 'A demiplane of scholars debating; books say "learning" but there is no forum.'),
    M(AR + 'shelves-ladder', 'the-waking-archives', 'rejected', 'Skeletal shelves of dusty books, a ruined repository; these shelves are intact, ivy-green and warm.'),
    M(AR + 'shelves-ladder', 'para-lichs-archive', 'rejected', 'Buried deep underground and sealed for centuries; the crop is a sunlit hall with a window beyond.'),
    M(AR + 'shelves-ladder', 'necromancers-ossuary', 'rejected', 'A crypt with a library; no sarcophagi, no bones.'),
    /* desk */
    M(AR + 'scholars-desk', 'murder-mystery', 'acceptable', 'Building the mystery, uncovering clues: a desk with a map, a magnifying glass, scrolls and a lantern is an investigator\'s table.'),
    M(AR + 'scholars-desk', 'library-of-the-dusk-tree', 'acceptable', 'A reading desk fits a library of histories; the shelves crop is closer.'),
    M(AR + 'scholars-desk', 'civic-library', 'acceptable', 'A reading desk in an impressive library; its architecture is not shown.'),
    M(AR + 'scholars-desk', 'arcanists-laboratory', 'rejected', 'A laboratory of twisted experiments; the desk shows study, not experiment (no apparatus beyond an armillary).'),
    M(AR + 'scholars-desk', 'ruined-mage-tower', 'rejected', 'A ruin of arcane study; this desk is intact and lit.'),
    M(AR + 'scholars-desk', 'museum-of-lost-realities', 'rejected', 'A museum of captured realities; nothing displayed.'),
    /* window hall */
    M(AR + 'window-hall', 'civic-library', 'acceptable', 'Lore: a main hall with a high ceiling and a glass dome; a vaulted hall with a great window and a globe is close.'),
    M(AR + 'window-hall', 'library-of-the-dusk-tree', 'acceptable', 'A grand reading hall; plausible.'),
    M(AR + 'window-hall', 'hallowed-cathedral', 'rejected', 'A majestic stronghold of a divine power; the window and vault look ecclesiastical but nothing here is holy (castle/church architecture ≠ sanctuary).'),
    M(AR + 'window-hall', 'forum-between-worlds', 'needs-review', 'A hall of scholars; no scholars shown.'),
    /* trebuchet */
    M(SG + 'trebuchet', 'castle-siege', 'strong', 'Lore: siege weapons in an active siege — the trebuchet and its crew are the environment-change feature.'),
    M(SG + 'trebuchet', 'pitched-battle', 'acceptable', 'A massive combat of armed groups: siege engine and soldiers fit, the second army is not shown.'),
    M(SG + 'trebuchet', 'defense-of-the-river-fort', 'needs-review', 'Lore has a ballista on a humble fort; a trebuchet is a different weapon and an attacker\'s one.'),
    M(SG + 'trebuchet', 'fallen-citadel', 'rejected', 'An infernal fortress with Worldbreaker siege weapons; this is a mundane wooden engine.'),
    M(SG + 'trebuchet', 'raiding-party', 'rejected', 'Pirates at a port; no coast, no ship.'),
    M(SG + 'trebuchet', 'bandit-attack', 'rejected', 'A raid on a settlement; a trebuchet is a castle-siege engine.'),
    /* castle walls */
    M(SG + 'castle-walls', 'castle-siege', 'strong', 'An attacking force before a fortified castle: curtain wall, towers and portcullis under fire.'),
    M(SG + 'castle-walls', 'fortress', 'needs-review', 'An imposing fortress housing an army; this one is burning and under attack.'),
    M(SG + 'castle-walls', 'hallowed-cathedral', 'rejected', 'A divine stronghold; a castle gate is not a holy sanctuary.'),
    M(SG + 'castle-walls', 'ruined-castle', 'rejected', 'A castle in disrepair covered in vines; this one is intact and besieged.'),
    /* starfaring */
    M(SF + 'spaceport-promenade', 'planetary-blockade', 'needs-review', 'A spaceport concourse is plausible, but the crop shows no ships or sky.'),
    M(SF + 'spaceport-promenade', 'city-festival', 'rejected', 'A festival plaza of stalls; the crop is sci-fi-adjacent and not festive.'),
    M(SF + 'docked-ship', 'planetary-blockade', 'acceptable', 'Hostile ships in orbit: a starship before a planet fits the setting; the blockade is not shown.'),
    M(SF + 'docked-ship', 'capital-ship-high-alert', 'needs-review', 'An exterior of a docked ship for an interior lockdown scenario; no security shown.'),
    M(SF + 'docked-ship', 'cosmic-crash', 'rejected', 'A wrecked vessel half-buried in rock; this ship is intact and docked.'),
    M(SF + 'orbital-arch-planet', 'planetary-blockade', 'strong', 'Ships swarm in orbit: a planet limb, an orbital ring and ships under thrust.'),
    M(SF + 'orbital-arch-planet', 'planetary-invasion', 'needs-review', 'Forces descend on a world; the view is orbital but peaceful.'),
    M(SF + 'orbital-arch-planet', 'sovereignty-entanglements', 'needs-review', 'Ships too many or too powerful; two ships, no hostility.'),
    M(SF + 'orbital-arch-planet', 'asteroid-chase', 'rejected', 'A pursuit through an asteroid field; none shown.'),
    /* seafaring */
    M(SEA + 'deck-rigging', 'ocean-voyage', 'strong', 'Working aboard a ship: deck, casks, rigging, open water.'),
    M(SEA + 'deck-rigging', 'terror-of-the-deep', 'acceptable', 'Sailing a dangerous sea; the monster and the storm are not shown.'),
    M(SEA + 'deck-rigging', 'the-skyship-windfall', 'needs-review', 'A royal navy freighter with three masts, but a skyship: the crop shows a sea.'),
    M(SEA + 'deck-rigging', 'undersea-trench', 'rejected', 'Beneath the waves; rigging is above them (ship rigging ≠ underwater).'),
    M(SEA + 'deck-rigging', 'deep-one-city', 'rejected', 'An undersea coral city; nothing submerged.'),
    M(SEA + 'deck-rigging', 'raiding-party', 'rejected', 'Pirates landing at a port; this is a working deck at sea.'),
    M(SEA + 'lighthouse-coast', 'port-city', 'needs-review', 'A distant headland suits a port, but the lighthouse is unreadable at any frame.'),
    M(SEA + 'storm-waves', 'terror-of-the-deep', 'acceptable', 'A rogue wave on a sea only the brave sail; generic water, but the right place.'),
    M(SEA + 'storm-waves', 'ocean-voyage', 'acceptable', 'Foul weather at sea; no ship visible beyond the rail.'),
  ];

  /* ---------- preliminary opportunity scan of all 28 masters ---------- */
  /* Made from a contact sheet of every master plus full-size looks at the pilots: a research
   * classification, not a count of approved assets. */
  const SCAN = [
    ['arcane-sanctums', 'low', 1, 'One central spire complex is the whole subject; foreground stair and waterfall bridge are scenery.', 'Whole picture is the meaning'],
    ['archives-and-libraries', 'high', 3, 'Shelves, desk, tall window hall: three independent, recognizable subjects.', 'Pilot'],
    ['arenas-and-duels', 'medium', 2, 'Helmet, shield and tabard in the foreground; gate and sand. The helmet cluster is an armoury.', 'Worth review'],
    ['blighted-mires', 'low', 0, 'One swamp; the ruined arch is small.', 'Not worth review'],
    ['chase-and-ambush', 'low', 1, 'Bow and quiver in the foreground; the arch bridge is distant.', 'Not worth review'],
    ['crypts-and-tombs', 'medium', 2, 'Sarcophagus with candles; the stair altar is far.', 'Worth review'],
    ['cursed-and-blighted-lands', 'low', 0, 'Abstract wasteland.', 'Not viable'],
    ['drowned-depths', 'medium', 2, 'Domed sunken city; ruined archway left.', 'Worth review'],
    ['dungeon-delves', 'medium', 3, 'Barred cell, lantern and map table, hanging cage, stair bridge: several, but dark.', 'Worth review'],
    ['feasts-and-revelry', 'medium', 2, 'Laid candlelit table; chandelier hall.', 'Worth review'],
    ['fey-and-enchanted', 'low', 1, 'Waterfall bridge is the subject.', 'Not worth review'],
    ['forgotten-ruins', 'medium', 2, 'Great doorway; statue and stairs. 1536×1024 master (3:2).', 'Worth review'],
    ['haunted-and-deathly', 'medium', 2, 'Foreground graves; manor. Graveyard already a strong fit for the whole picture.', 'Low yield'],
    ['infernal-and-profane', 'low', 1, 'Citadel and lava falls are one subject.', 'Not worth review'],
    ['intrigue-and-underworld', 'high', 3, 'Market lane with a hooded figure, stall and desk with dagger and map, arched alley — and the existing Catalog picture is not cut (marginal).', 'Worth review: strongest unpiloted source'],
    ['monster-lairs', 'medium', 2, 'Dragon-rib arches; waterfall cavern.', 'Worth review'],
    ['perilous-passages', 'medium', 2, 'Chain-railed stair; distant ruined bridge.', 'Worth review'],
    ['planar-rifts', 'low', 1, 'The rift is the subject.', 'Not worth review'],
    ['sacred-sanctuaries', 'high', 3, 'Statue of a saint with candles; altar steps with lilies; window with waterfall.', 'Worth review'],
    ['seafaring', 'high', 3, 'Pilot: deck and rigging pass; the lighthouse fails resolution; sea is generic.', 'Pilot'],
    ['sinister-woods', 'low', 0, 'One forest.', 'Not viable'],
    ['sky-realms', 'low', 1, 'Floating islands are one subject.', 'Not worth review'],
    ['starfaring', 'high', 3, 'Pilot: orbit and docked ship; promenade needs a different crop.', 'Pilot'],
    ['storms-and-calamity', 'low', 0, 'The tornado is the meaning; the waterfall coast loses the premise.', 'Not viable'],
    ['streets-and-towns', 'high', 4, 'Pilot: stalls, street, inn terrace, clock tower (no environment uses it).', 'Pilot'],
    ['strongholds-and-sieges', 'medium', 2, 'Pilot: trebuchet, curtain wall.', 'Pilot'],
    ['taverns-and-inns', 'high', 3, 'Pilot: hearth, bar; the still life fails.', 'Pilot'],
    ['time-and-dream', 'medium', 2, 'Three seasons in one village; each season is a region but the premise needs all three.', 'Worth review with care'],
  ].map(([id, opportunity, regions, why, next]) => ({ sourceId: id, opportunity, estimatedRegions: regions, why, next }));

  return { MASTER_DIR, MASTER_FILES, EXTRA_MASTERS, PILOT_SOURCES, REGIONS, MAPPINGS, SCAN };
});
