/* ============================================================
   Semantic Artwork Reuse Lab — data-v2.js  (DEV-ONLY; lab/ is excluded from dist/)
   The V2 pilot dataset: three more sources (intrigue-and-underworld, sacred-sanctuaries, dungeon-delves),
   their semantic regions and environment mappings. A separate dataset beside data.js, which keeps the V1
   results exactly as published; region ids never collide with V1's. Same record shapes, same rules
   (lab-core.js). One reviewer's judgement (2026-11-03) from the real masters and the real environment
   lore — not read by the application, not a production approval. Nothing here may be copied into
   js/list-cover-art.js, js/catalog-art.js or data/.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SemanticReuseDataV2 = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PILOT = 'v2';
  const PILOT_SOURCES = ['intrigue-and-underworld', 'sacred-sanctuaries', 'dungeon-delves'];
  const RESULTS_DIR = 'docs/research/semantic-artwork-reuse-lab-v2/';
  const DERIVS_DIR = 'lab/semantic-reuse/derivs-v2/';
  const MANIFEST = 'lab/semantic-reuse/derivs-manifest-v2.json';

  const b = (x, y, width, height) => ({ x, y, width, height });
  const v = (verdict, note) => ({ verdict, note });
  const none = () => ({ catalog: v('unreviewed', ''), prep: v('unreviewed', ''), lists1: v('unreviewed', ''), lists2: v('unreviewed', ''), lists3: v('unreviewed', '') });

  const REGIONS = [
    /* ===== intrigue-and-underworld ===== */
    {
      id: 'intrigue-and-underworld-covert-table', sourceId: 'intrigue-and-underworld', label: 'Candle-lit table under the awning', status: 'approved',
      description: 'Two cloaked patrons, one hooded, at a candle-lit table under a red awning beside barrels and crates; a hanging lantern above.',
      bounds: b(0.353, 0.202, 0.299, 0.563), subject: b(0.14, 0.42, 0.52, 0.42), subjects: { catalog: b(0.13, 0.42, 0.3, 0.42), lists1: b(0.14, 0.5, 0.52, 0.22) },
      visualQa: { recognizability: 'high', complexity: 'medium', contrast: 'good', lighting: 'candle and lantern in dark', detail: 'faces and cloaks readable at 2x', distinct: 'the only seated gathering in the source' },
      notes: 'Evidence is a hooded figure, a candle, barrels: a discreet conversation. It does not show a crime.',
      contexts: { catalog: v('pass', ''), prep: v('pass', ''), lists1: v('pass', ''), lists2: v('pass', ''), lists3: v('pass', '') },
    },
    {
      id: 'intrigue-and-underworld-arch-alley', sourceId: 'intrigue-and-underworld', label: 'Wet lane and arched passage', status: 'approved',
      description: 'A cloaked figure walks a wet cobbled lane toward a stone archway; a hanging lantern, barrels and a banner on either side.',
      bounds: b(0.604, 0.117, 0.281, 0.723), subject: b(0.3, 0.12, 0.55, 0.72),
      visualQa: { recognizability: 'high', complexity: 'medium', contrast: 'good', lighting: 'lantern glow on wet stone', detail: 'good', distinct: 'only passage-and-arch view' },
      notes: 'A dark street is not a hideout: this crop supports "street at night" and nothing criminal.',
      contexts: { catalog: v('pass', 'The cloaked figure and the arch fill the strip: night street.'), prep: v('pass', ''), lists1: v('fail', 'A 3.5:1 band over a tall region keeps a slice; the subject is cut away. The arch, which is the point, is lost.'), lists2: v('fail', 'Half-width tile keeps the lane but not the arch.'), lists3: v('fail', 'A third keeps the figure and a barrel, not the passage.') },
    },
    {
      id: 'intrigue-and-underworld-plotters-table', sourceId: 'intrigue-and-underworld', label: "Plotter's table", status: 'approved',
      description: 'A table with a parchment map under a red wax seal, a dagger, scattered coins, a silver goblet, bound books and a lit lantern.',
      bounds: b(0.0, 0.468, 0.497, 0.532), subject: b(0.1, 0.05, 0.8, 0.85), subjects: { catalog: b(0.05, 0.05, 0.2, 0.85), prep: b(0.15, 0.1, 0.55, 0.8), lists1: b(0.1, 0.25, 0.8, 0.5), lists2: b(0.1, 0.2, 0.8, 0.6) },
      visualQa: { recognizability: 'high', complexity: 'high', contrast: 'good', lighting: 'candle', detail: 'rich', distinct: 'dagger + sealed map + coins, unlike V1 desk (no magnifier or scrolls)' },
      contexts: { catalog: v('fail', 'A 1.7:1 region in a 1:2.6 strip keeps only the lantern or the goblet; the dagger and map are lost.'), prep: v('pass', ''), lists1: v('pass', ''), lists2: v('pass', ''), lists3: v('pass', '') },
    },
    {
      id: 'intrigue-and-underworld-serpent-banner', sourceId: 'intrigue-and-underworld', label: 'Dagger-and-serpent banner', status: 'not-independently-meaningful',
      description: 'A tattered maroon banner with a serpent coiled round a dagger.',
      bounds: b(0.102, 0.043, 0.12, 0.553), subject: b(0.1, 0.05, 0.8, 0.9),
      notes: 'An emblem, not a place. It says "a faction" but no environment is described by a banner, and a faction mark is not evidence of a criminal one.',
      visualQa: { recognizability: 'medium', complexity: 'low', contrast: 'medium', lighting: 'dim', detail: 'good', distinct: 'n/a' },
      contexts: none(),
    },
    {
      id: 'intrigue-and-underworld-night-skyline', sourceId: 'intrigue-and-underworld', label: 'Lit city across the bridge', status: 'insufficient-resolution',
      description: 'A domed, lamp-lit city on a hill behind a stone viaduct under a night sky.',
      bounds: b(0.61, 0.0, 0.168, 0.18), subject: b(0.05, 0.05, 0.9, 0.9),
      notes: 'About 280x170 px in the master and soft: every frame would enlarge it. The setting is pleasant but belongs to no environment here.',
      visualQa: { recognizability: 'medium', complexity: 'medium', contrast: 'good', lighting: 'night', detail: 'soft', distinct: 'n/a' },
      contexts: none(),
    },

    /* ===== sacred-sanctuaries ===== */
    {
      id: 'sacred-sanctuaries-statue-altar', sourceId: 'sacred-sanctuaries', label: 'Saint statue and candle altar', status: 'approved',
      description: 'A robed stone statue holding a bowl of flame before a golden sun-halo, white sun banners, banks of candles on stepped altars, incense smoke.',
      bounds: b(0.138, 0.064, 0.299, 0.755), subject: b(0.42, 0.0, 0.4, 0.7), subjects: { lists1: b(0.1, 0.45, 0.8, 0.35) },
      visualQa: { recognizability: 'high', complexity: 'medium', contrast: 'excellent', lighting: 'golden candle glow', detail: 'fine', distinct: 'the only figure in the source' },
      notes: 'Specific iconography (a sun-halo and a flame bowl). It belongs to a faith with a Sacred Flame or a sun, not to every holy place.',
      contexts: { catalog: v('pass', 'Statue, halo and candles read in the strip.'), prep: v('pass', ''), lists1: v('fail', 'A 3.5:1 band over a tall region keeps a slice; the subject is cut away. What survives is the rejected candle-steps crop.'), lists2: v('fail', 'Cuts the statue from the candles.'), lists3: v('pass', '') },
    },
    {
      id: 'sacred-sanctuaries-arched-vista', sourceId: 'sacred-sanctuaries', label: 'Ivy arches over a mountain waterfall', status: 'proposed',
      description: 'Tall Gothic arches and ivy-wrapped columns frame a misty valley with two waterfalls and a distant ruined archway on a crag.',
      bounds: b(0.61, 0.096, 0.305, 0.669), subject: b(0.5, 0.15, 0.4, 0.6),
      visualQa: { recognizability: 'high', complexity: 'medium', contrast: 'good', lighting: 'daylight and god-rays', detail: 'good', distinct: 'no statue, no candles: architecture and landscape only' },
      notes: 'Needs a human review. Beautiful and recognisable, but its only candidate (blade-root-sanctum) is contestable: the forest strip it would replace already shows the lore\'s deep green, and no other environment describes an open-air arcade over a valley. Not counted until a human decides.',
      contexts: { catalog: v('pass', 'Arch, ivy and waterfall in a vertical.'), prep: v('pass', ''), lists1: v('fail', 'A 3.5:1 band over a tall region keeps a slice; the subject is cut away.'), lists2: v('fail', 'Loses the tower and the arch.'), lists3: v('pass', '') },
    },
    {
      id: 'sacred-sanctuaries-lotus-pool', sourceId: 'sacred-sanctuaries', label: 'Lotus pool in the cloister court', status: 'approved',
      description: 'A stone-rimmed reflecting pool with white lotus blossoms and lily pads on a polished court, flowers at the edge.',
      bounds: b(0.539, 0.765, 0.461, 0.235), subject: b(0.62, 0.05, 0.22, 0.75),
      visualQa: { recognizability: 'medium', complexity: 'low', contrast: 'medium', lighting: 'soft reflected light', detail: 'good', distinct: 'only water garden' },
      notes: 'A 3.5:1 strip: it can only be a wide band (My Lists) or a square (Prep), never a Catalog strip.',
      contexts: { catalog: v('fail', 'A 3.5:1 region in a 1:2.6 strip keeps ~11 % of its width: a lotus fragment on water.'), prep: v('pass', ''), lists1: v('pass', ''), lists2: v('pass', ''), lists3: v('pass', '') },
    },
    {
      id: 'sacred-sanctuaries-candle-steps', sourceId: 'sacred-sanctuaries', label: 'Candle banks on the altar steps', status: 'not-independently-meaningful',
      description: 'Rows of candles on stone altar plinths above a broad staircase, the statue only just cut off at the top.',
      bounds: b(0.197, 0.51, 0.407, 0.308), subject: b(0.1, 0.1, 0.8, 0.8),
      notes: 'A near duplicate of the statue crop: the same candles, the same steps, minus the one thing that makes it a place. Rejected under the "do not multiply crops of one statue" rule.',
      visualQa: { recognizability: 'medium', complexity: 'medium', contrast: 'good', lighting: 'candle', detail: 'good', distinct: 'no: sits inside statue-altar' },
      contexts: none(),
    },

    /* ===== dungeon-delves ===== */
    {
      id: 'dungeon-delves-barred-gate', sourceId: 'dungeon-delves', label: 'Barred gate and torch-lit wall', status: 'approved',
      description: 'A heavy iron gate set in a stone arch over a dim cell with straw on the floor, hanging chains, a torch and a crossed-keys banner.',
      bounds: b(0.132, 0.021, 0.371, 0.723), subject: b(0.0, 0.05, 0.4, 0.8),
      visualQa: { recognizability: 'high', complexity: 'medium', contrast: 'good', lighting: 'torch glow', detail: 'rich', distinct: 'only gate and cell' },
      notes: 'The cell (straw behind the bars) is what makes this a prison gate rather than just an iron gate.',
      contexts: { catalog: v('pass', 'Bars, chain and torch: a barred cell.'), prep: v('pass', ''), lists1: v('fail', 'A 3.5:1 band over a tall region keeps a slice; the subject is cut away. Bars become a grille texture.'), lists2: v('fail', 'The gate is halved.'), lists3: v('pass', '') },
    },
    {
      id: 'dungeon-delves-stair-bridge', sourceId: 'dungeon-delves', label: 'Stair and arched bridge in the shafts of light', status: 'approved',
      description: 'A worn staircase climbs to a balustraded stone bridge over a vaulted arch, torches on the walls, mossy chains and light shafts from above.',
      bounds: b(0.527, 0.0, 0.419, 0.68), subject: b(0.12, 0.1, 0.34, 0.85),
      visualQa: { recognizability: 'high', complexity: 'medium', contrast: 'good', lighting: 'light shafts and torches', detail: 'good', distinct: 'only architecture-in-depth view' },
      contexts: { catalog: v('pass', 'Stairs, torch and the shaft of light.'), prep: v('pass', ''), lists1: v('fail', 'A 3.5:1 band over a tall region keeps a slice; the subject is cut away.'), lists2: v('fail', 'Bridge and stair separate.'), lists3: v('pass', '') },
    },
    {
      id: 'dungeon-delves-explorers-kit', sourceId: 'dungeon-delves', label: "Explorer's kit on a stone ledge", status: 'proposed',
      description: 'A lit lantern, an unrolled map, a compass, a pickaxe, coiled rope and a leather satchel on a ledge.',
      bounds: b(0.0, 0.553, 0.515, 0.447), subject: b(0.0, 0.05, 0.55, 0.9), subjects: { catalog: b(0.0, 0.05, 0.2, 0.9), lists1: b(0.1, 0.2, 0.8, 0.55), lists2: b(0.0, 0.1, 0.8, 0.8) },
      notes: 'Needs a human art review: a still life like V1\'s rejected dining table, but it names an activity (delving) that the archetype is about. Kept as "proposed": its mappings are not counted.',
      visualQa: { recognizability: 'high', complexity: 'medium', contrast: 'good', lighting: 'lantern', detail: 'rich', distinct: 'close cousin of the V1 scholar\'s desk' },
      contexts: { catalog: v('fail', 'A 2:1 region in a strip keeps the lantern or the compass, never the kit.'), prep: v('pass', ''), lists1: v('pass', ''), lists2: v('pass', ''), lists3: v('fail', 'A third tile keeps the lantern only.') },
    },
    {
      id: 'dungeon-delves-flooded-steps', sourceId: 'dungeon-delves', label: 'Flooded stone steps', status: 'not-independently-meaningful',
      description: 'Broad rough-cut stone steps going down into dark still water; one candle burning on a lower step.',
      bounds: b(0.509, 0.659, 0.425, 0.34), subject: b(0.2, 0.1, 0.7, 0.7),
      notes: 'Generic wet stone: with the candle it hints at someone having passed, but nothing here names a place. Pixels are fine; meaning is not.',
      visualQa: { recognizability: 'low', complexity: 'low', contrast: 'medium', lighting: 'a single candle', detail: 'soft', distinct: 'n/a' },
      contexts: none(),
    },
    {
      id: 'dungeon-delves-hanging-cage', sourceId: 'dungeon-delves', label: 'Hanging gibbet cage', status: 'insufficient-resolution',
      description: 'An iron cage on a chain beside the arch.',
      bounds: b(0.862, 0.064, 0.096, 0.34), subject: b(0.05, 0.05, 0.9, 0.9),
      notes: 'About 160x320 px: an object, not a place, and too small for any frame.',
      visualQa: { recognizability: 'medium', complexity: 'low', contrast: 'good', lighting: 'dim', detail: 'soft', distinct: 'n/a' },
      contexts: none(),
    },
  ];

  const M = (region, env, review, reason, improves, improvesContexts) => ({ regionId: region, envId: env, review, reason, improves: improves || '', improvesContexts: improvesContexts || undefined });
  const IU = 'intrigue-and-underworld-'; const SS = 'sacred-sanctuaries-'; const DD = 'dungeon-delves-';
  const MAPPINGS = [
    /* covert table */
    M(IU + 'covert-table', 'gang-hideout', 'acceptable', 'Lore: a gathering point a gang uses to shift goods, "often attached to a legitimate business". Cloaked men at a candle-lit table under a stall awning are exactly such a front; no gambling, goods or guards are shown.'),
    M(IU + 'covert-table', 'thieves-guild', 'needs-review', 'The guildhouse of a settlement\'s organised crime: a building. This is an open-air table; nothing says guild.'),
    M(IU + 'covert-table', 'den-of-vice-and-violence', 'needs-review', 'A social spot "packed with seedy characters"; two patrons are not packed and nothing is seedy beyond the dim light (lighting alone is no evidence).'),
    M(IU + 'covert-table', 'murder-mystery', 'needs-review', 'An ally was murdered; there is no body, clue or scene of a crime, only a conversation.'),
    M(IU + 'covert-table', 'the-undermarket', 'rejected', 'A secluded market in the sewers; this is an above-ground street awning. A dim stall is not an underground market.'),
    M(IU + 'covert-table', 'jazz-speakeasy', 'rejected', 'A secret music club run by criminals; no band, no club, no bar.'),
    M(IU + 'covert-table', 'trading-post', 'rejected', 'A bustling post where supplies are sold or bartered; the crop is quiet and shows no goods.'),
    M(IU + 'covert-table', 'bustling-marketplace', 'rejected', 'Lore: merchants and patrons across classes; two cloaked drinkers in the dark do not make a bustling market.'),
    /* arch alley */
    M(IU + 'arch-alley', 'street-chase', 'acceptable', 'A chase through the winding streets of a settlement: a wet lane, an archway and a hurrying cloaked figure are a fair stage; no pursuit is shown. The Catalog already shows a streets picture.'),
    M(IU + 'arch-alley', 'city-streets', 'needs-review', 'Lore: traffic, toxic smog and peddlers. The lane is quiet and clear.'),
    M(IU + 'arch-alley', 'heist', 'needs-review', 'A hidden or protected location to infiltrate; a passage at night is the road in, but no target is shown.'),
    M(IU + 'arch-alley', 'rooftop-chase', 'rejected', 'A chase along rooftops; the crop is street level.'),
    M(IU + 'arch-alley', 'occupied-town', 'rejected', 'A town under military occupation; no soldiers, no checkpoint.'),
    M(IU + 'arch-alley', 'drakkenheim-outer-city', 'rejected', 'A ramshackle slum of crumbling tenements and hovels; this is solid, lit masonry.'),
    M(IU + 'arch-alley', 'pursued', 'rejected', 'A universal scene about being chased in any terrain; nothing here is a pursuit.'),
    /* plotter's table */
    M(IU + 'plotters-table', 'murder-mystery', 'acceptable', 'Building the mystery, uncovering clues: a sealed map, a dagger, coins and a goblet are the evidence on an investigator\'s table. Reads as a plot rather than a crime scene, so Acceptable.'),
    M(IU + 'plotters-table', 'heist', 'acceptable', 'Lore feature "Prep Work": a map under a wax seal, a dagger and coins are the planning table of a job.'),
    M(IU + 'plotters-table', 'bank-heist', 'needs-review', 'Casing a secure location: the map fits, but nothing says bank or vault.'),
    M(IU + 'plotters-table', 'thieves-guild', 'needs-review', 'Coins and a dagger suit "Trawling for Work", but a guildhouse is not shown.'),
    M(IU + 'plotters-table', 'gang-hideout', 'needs-review', 'Plausible back-room business, but the covert-table crop is the closer picture.'),
    M(IU + 'plotters-table', 'imperial-court', 'rejected', 'A majestic imperial domain; a candle-lit desk is the wrong scale.'),
    M(IU + 'plotters-table', 'corrupt-court', 'rejected', 'A warded courtroom with witnesses; nothing judicial.'),
    M(IU + 'plotters-table', 'upscale-casino', 'rejected', 'Coins and a goblet are not gambling; no tables, cards or dice.'),
    /* statue altar */
    M(SS + 'statue-altar', 'hallowed-temple', 'acceptable', 'A well-kept temple of healing and services: a candle-lit altar before a saint. The Catalog already wears this archetype picture, so no gain.'),
    M(SS + 'statue-altar', 'hallowed-cathedral', 'acceptable', 'A divine power\'s stronghold propagating doctrine: statue, halo and banners fit. Already wears the archetype picture.'),
    M(SS + 'statue-altar', 'chapel-of-st-brenna', 'acceptable', 'Lore: a chapel of beloved heroes of the Sacred Flame. The statue holds a bowl of fire. The lore is "moldering" and "puzzling doors", which this clean, lit chapel does not show.'),
    M(SS + 'statue-altar', 'humble-altar', 'needs-review', 'Candles, incense and an altar fit, but the lore is an ancient Cathartoid, not a robed human statue.'),
    M(SS + 'statue-altar', 'garden-of-the-tranquil-order', 'needs-review', 'A garden shrine; the crop is an interior altar with only a little ivy.'),
    M(SS + 'statue-altar', 'blade-root-sanctum', 'rejected', 'A verdant sanctum of flora and ancient stones: a robed, sun-haloed statue is faith-specific iconography that a wild sanctum does not carry.'),
    M(SS + 'statue-altar', 'throne-of-three', 'rejected', 'A forest seat of wisdom, not a statue altar.'),
    M(SS + 'statue-altar', 'darkened-temple', 'rejected', 'A holy site corrupted by darkness and madness; this is radiant and intact.'),
    M(SS + 'statue-altar', 'moonlight-temple', 'rejected', 'A Hierophant turning citizens into Jackalweres: a profane temple.'),
    M(SS + 'statue-altar', 'divine-audience', 'rejected', 'An encounter with a divine being in a divine realm, not a physical shrine.'),
    /* arched vista */
    M(SS + 'arched-vista', 'blade-root-sanctum', 'needs-review', 'Lore: a verdant sanctum of deep green flora and ancient stones. Ivy-wrapped arches fit the stones, but the crop is a pale, misty mountain valley, and the forest strip it would replace already carries the deep green. Gain is contestable, so it is not counted.'),
    M(SS + 'arched-vista', 'hallowed-temple', 'rejected', 'A bustling temple of healing and services; the vista has no altar, clergy or congregation.'),
    M(SS + 'arched-vista', 'throne-of-three', 'needs-review', 'An ancient seat of wisdom in the forest: no seat is shown.'),
    M(SS + 'arched-vista', 'garden-of-the-tranquil-order', 'needs-review', 'A tranquil garden shrine: ivy and blossoms fit, but the lotus pool crop is the closer picture.'),
    M(SS + 'arched-vista', 'martyrs-rest', 'rejected', 'A burial mound on open grassland; this is built architecture.'),
    M(SS + 'arched-vista', 'drowned-sanctum', 'rejected', 'A shrine encased in saltwater; nothing submerged.'),
    M(SS + 'arched-vista', 'sanctuary-of-the-story-tree', 'rejected', 'A fey sanctuary around a great tree; built Gothic arches are not a tree sanctuary.'),
    /* lotus pool */
    M(SS + 'lotus-pool', 'garden-of-the-tranquil-order', 'acceptable', 'Lore: a tranquil garden shrine with a place of reflection. A lotus pool in a cloister court is that; no guardians or secrets are shown.'),
    M(SS + 'lotus-pool', 'fathomless-baths-surface', 'rejected', 'An outdoor swim at an extradimensional rift; a ceremonial pool is not a swimming place.'),
    M(SS + 'lotus-pool', 'martyrs-rest', 'rejected', 'A grassland burial mound; no mound, no grass.'),
    /* barred gate */
    M(DD + 'barred-gate', 'chthon-verlies', 'acceptable', 'Lore: an extensive underground dungeon holding political prisoners. A barred gate over a cell with straw is a prison; the magic-resistant crystals are not shown.'),
    M(DD + 'barred-gate', 'deadly-dungeon', 'acceptable', 'A dim underground maze of chambers: a gate and torches fit. Already wears the archetype picture.'),
    M(DD + 'barred-gate', 'dangerous-dungeon', 'acceptable', 'A subterranean fortress with a locked door: fits. Already wears the archetype picture.'),
    M(DD + 'barred-gate', 'scorching-dungeon', 'rejected', 'Lava, steam and furnaces; nothing hot here.'),
    M(DD + 'barred-gate', 'collapsing-floor', 'rejected', 'An unstable floor above endless air; solid stone here.'),
    M(DD + 'barred-gate', 'prison-city-pyrrhexis', 'rejected', 'A city of burning ash and iron bars in the Circles Below; a cold stone gate is not a damned city.'),
    M(DD + 'barred-gate', 'the-garage', 'rejected', 'A machine workshop with bolted cells; this is masonry.'),
    M(DD + 'barred-gate', 'the-dungeoneer', 'rejected', 'A tavern; the gate is a cell, not a bar.'),
    M(DD + 'barred-gate', 'underroot-tunnels', 'rejected', 'Well-kept fortified tunnels with toll-keepers under a forest; this gate guards a cell.'),
    /* stair and bridge */
    M(DD + 'stair-bridge', 'deadly-dungeon', 'acceptable', 'Underground tunnels and chambers; fits. Already wears the archetype picture.'),
    M(DD + 'stair-bridge', 'dangerous-dungeon', 'acceptable', 'A subterranean fortress with something at the end; fits. Already wears the archetype picture.'),
    M(DD + 'stair-bridge', 'ruined-castle', 'needs-review', 'A castle in disrepair covered in vines: the chains and moss fit, but the crop is clearly underground.'),
    M(DD + 'stair-bridge', 'city-out-of-time', 'needs-review', 'An ancient lost city underground: arches and stairs fit, but the environment is about a mind swap across ages.'),
    M(DD + 'stair-bridge', 'the-endless-song', 'needs-review', 'A subterranean complex of echoing voices: nothing in the crop speaks of sound.'),
    M(DD + 'stair-bridge', 'abandoned-mine', 'rejected', 'Tunnels carved into bedrock by miners; this is dressed masonry with a bridge.'),
    M(DD + 'stair-bridge', 'catacomb-tunnels', 'rejected', 'Musty tunnels with bone piles under a city; no tombs.'),
    M(DD + 'stair-bridge', 'para-lichs-archive', 'rejected', 'A sealed library; no shelves.'),
    /* explorer's kit (region needs review: mappings not counted) */
    M(DD + 'explorers-kit', 'abandoned-mine', 'acceptable', 'A pickaxe, lantern, rope and map are the kit of a mining expedition; the mine itself is not shown.'),
    M(DD + 'explorers-kit', 'haunted-gold-mine', 'needs-review', 'A gold mine: a pickaxe fits, nothing says gold or haunted.'),
    M(DD + 'explorers-kit', 'search-the-ruins', 'needs-review', 'A search of a cursed city; map and lantern are generic searching tools.'),
    M(DD + 'explorers-kit', 'industrial-mine', 'rejected', 'A working magical-ore site with security; a lone kit is not an industrial mine.'),
    M(DD + 'explorers-kit', 'deep-underground-cave', 'rejected', 'A damp cave; a tidy ledge of gear is not a cave.'),
  ];

  return { PILOT, PILOT_SOURCES, RESULTS_DIR, DERIVS_DIR, MANIFEST, REGIONS, MAPPINGS };
});
