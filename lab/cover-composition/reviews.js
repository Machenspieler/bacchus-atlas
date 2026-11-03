/* ============================================================
   My Lists Cover Composition Lab V2 — reviews.js  (DEV-ONLY)
   A lightweight, explicit visual review of every picture a My Lists cover can wear, judged on the real
   cover panels (docs/research/my-lists-cover-composition-lab-v2.md §5-6): how it reads as a full-width
   HERO (≈318x90), a HALF panel (≈159x90) and a THIRD panel (≈106x90), with production's own framing.
   Context-dependent, not a universal complexity score: the same picture can be excellent as a hero and
   poor as a third. Ratings: e = excellent, a = acceptable, p = poor; a picture missing here is "not reviewed".
   Reviewer: Claude, from contact sheets of the real panels — PROVISIONAL until the user confirms.
   complexity: calm | moderate | busy.   focal: an experimental object-position to try at a third (lab-only).
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CoverCompositionReviews = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const L = { e: 'excellent', a: 'acceptable', p: 'poor' };
  const C = { c: 'calm', m: 'moderate', b: 'busy' };
  const REVIEWS = {};
  function r(id, hero, half, third, cx, palette, subject, survives, note, focal) {
    REVIEWS[id] = { hero: L[hero], half: L[half], third: L[third], complexity: C[cx], palette, subject, survivesNarrow: survives, note: note || '', focal: focal || null, reviewer: 'claude-provisional' };
  }
  /* archetypes */
  r('archetype:haunted-and-deathly', 'e', 'a', 'a', 'm', 'dark', 'manor above a misty graveyard', true, 'Dark and even; the manor silhouette holds at a third.');
  r('archetype:forgotten-ruins', 'e', 'e', 'a', 'm', 'warm', 'carved archway with statues', true, 'The arch is the subject and stays centred.');
  r('archetype:arcane-sanctums', 'e', 'e', 'a', 'm', 'cool', 'glowing orb tower', true, 'The orb reads even narrow.');
  r('archetype:feasts-and-revelry', 'a', 'a', 'p', 'b', 'warm', 'candlelit banquet hall', false, 'Hundreds of small lights: texture, not a subject, at a third.', [88, 40]);
  r('archetype:storms-and-calamity', 'e', 'e', 'e', 'm', 'cool', 'tornado and lightning', true, 'One huge shape; survives every width.');
  r('archetype:infernal-and-profane', 'e', 'e', 'a', 'm', 'warm', 'burning citadel under a red sky', true, 'Colour alone says "inferno" at any width.');
  r('archetype:drowned-depths', 'a', 'a', 'a', 'm', 'cool', 'sunken arches in blue water', true, 'Reads as a blue field with some structure.');
  r('archetype:strongholds-and-sieges', 'e', 'a', 'a', 'b', 'mixed', 'besieged castle with catapult', false, 'Castle shrinks to grey texture at a third; the catapult is lost.');
  r('archetype:monster-lairs', 'a', 'a', 'p', 'b', 'dark', 'ribcage and cave bridge', false, 'Murky; no single subject at a third.');
  r('archetype:cursed-and-blighted-lands', 'a', 'a', 'p', 'm', 'dark', 'dead trees on a ruined plain', false, 'Low contrast; the focal point dissolves narrow.');
  r('archetype:fey-and-enchanted', 'e', 'a', 'p', 'b', 'bright', 'glowing fey city and waterfalls', false, 'Bright, dense foliage and falls: noisy at a third.');
  r('archetype:starfaring', 'a', 'a', 'a', 'b', 'mixed', 'starship dock under a planet', true, 'Crowds and lamps clutter; the ship and planet survive.');
  r('archetype:sacred-sanctuaries', 'e', 'e', 'e', 'm', 'warm', 'statue of a saint with halo', true, 'Strong vertical subject; works in any width.');
  r('archetype:streets-and-towns', 'a', 'a', 'p', 'b', 'mixed', 'half-timbered market street', false, 'Many small objects (people, awnings, signs): mosaic at a third.');
  r('archetype:crypts-and-tombs', 'e', 'e', 'e', 'c', 'dark', 'sarcophagus in a crypt', true, 'Calm and centred.');
  r('archetype:taverns-and-inns', 'e', 'a', 'p', 'b', 'warm', 'fireplace and bar', false, 'Warm interior, dozens of props. The fireplace is the only thing that survives a third.', [88, 45]);
  r('archetype:blighted-mires', 'e', 'e', 'e', 'c', 'dark', 'misty marsh with ruins', true, 'Fog simplifies it; the calmest dark picture.');
  r('archetype:archives-and-libraries', 'a', 'a', 'p', 'b', 'warm', 'library with ladder and globe', false, 'Shelves become noise at a third.');
  r('archetype:planar-rifts', 'e', 'e', 'e', 'm', 'cool', 'purple lightning over floating ruins', true, 'Bold colour shape.');
  r('archetype:arenas-and-duels', 'e', 'a', 'a', 'm', 'warm', 'arena wall with helm', true, 'Even, warm; fine.');
  r('archetype:chase-and-ambush', 'a', 'a', 'a', 'm', 'warm', 'forest pass under an old bridge', true, 'Mid-tone, readable but unremarkable.');
  r('archetype:intrigue-and-underworld', 'e', 'a', 'p', 'b', 'warm', 'lamplit alley with cloaked figures', false, 'Figures and lamps clutter at a third.');
  r('archetype:time-and-dream', 'e', 'e', 'a', 'c', 'mixed', 'snowy square with autumn tree', true, 'Calm; the tree carries it.');
  r('archetype:dungeon-delves', 'a', 'a', 'p', 'b', 'dark', 'cell bars and stairs', false, 'Dark clutter at a third.');
  r('archetype:perilous-passages', 'e', 'e', 'a', 'm', 'mixed', 'cliff path with chain rail', true, 'Cliff and falls hold.');
  r('archetype:seafaring', 'e', 'e', 'a', 'm', 'mixed', 'ship deck at sunset', true, 'Rigging is thin at a third but the deck and sea read.');
  r('archetype:sinister-woods', 'e', 'e', 'e', 'c', 'dark', 'gnarled trees in mist', true, 'Calm, even.');
  r('archetype:sky-realms', 'e', 'e', 'e', 'c', 'bright', 'floating island above clouds', true, 'Cleanest picture in the library.');
  /* paintings and crops */
  r('env:cauldera-valley', 'a', 'a', 'a', 'm', 'cool', 'purple valley with glowing flowers', true, 'Soft; reads as a colour.');
  r('env:field-of-dreams', 'a', 'a', 'a', 'c', 'dark', 'standing stones on a pale field', true, 'Very low contrast.');
  r('env:ouroborean-pass', 'e', 'e', 'a', 'c', 'cool', 'spiral road between stones', true, 'Spiral reads at half; a third crops it.');
  r('crop:market-stalls', 'a', 'e', 'e', 'm', 'warm', 'two traders talking', true, 'Faces give it a subject.');
  r('crop:tavern-terrace', 'a', 'a', 'a', 'm', 'warm', 'diners at a window', true, 'Fine; slightly busy.');
  r('crop:bar-counter', 'a', 'e', 'e', 'c', 'warm', 'barrels behind a bar', true, 'Calm and warm.');
  r('crop:lotus-pool', 'e', 'e', 'e', 'c', 'bright', 'lotus flowers on water', true, 'Simple, high contrast.');
  /* biome fallbacks */
  [['aquatic', 'e', 'e', 'e'], ['badlands', 'e', 'e', 'e'], ['drylands', 'e', 'e', 'e'], ['forest', 'e', 'e', 'a'], ['frozen', 'e', 'e', 'e'], ['grassland', 'e', 'e', 'e'], ['mountain', 'e', 'e', 'e'], ['rolling', 'e', 'e', 'a']]
    .forEach(b => r('biome:' + b[0], b[1], b[2], b[3], 'c', 'mixed', b[0] + ' landscape', true, 'Simple landscape: the reason biome pictures are calm.'));
  r('biome:settlement', 'e', 'a', 'a', 'm', 'warm', 'harbour town at sunset', true, 'Town lights clutter slightly at a third.');
  r('biome:tropical', 'e', 'e', 'a', 'm', 'green', 'jungle waterfall', true, '');
  r('biome:underground', 'a', 'a', 'a', 'm', 'cool', 'blue glowing cavern', true, '');
  r('biome:wetland', 'a', 'a', 'a', 'c', 'mixed', 'misty swamp', true, 'Low contrast, calm.');
  return { REVIEWS };
});
