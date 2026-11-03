/* ============================================================
   My Lists Cover Composition Lab V2 — fixtures.js  (DEV-ONLY)
   The user's saved lists live in their own browser's localStorage, which a lab never reads. Every case
   below is therefore a FIXTURE: real environment ids, chosen to reproduce what the user described, with
   the original name where it stands in for a real list. A fixture is not the user's exact list contents.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CoverCompositionFixtures = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const F = (id, name, kind, note, envIds) => ({ id, name, kind, note, envIds });
  const CASES = [
    F('baldur-test', 'Врата Балдура – test', 'stand-in for a real list (contents invented)', 'The negative example: six environments, three busy pictures — misty marsh, warm interior, ship.',
      ['shadowfen', 'teal-heart-inn', 'port-city', 'ocean-voyage', 'outpost-town', 'dread-mire']),
    F('campaign-test', 'Campaign Test', 'stand-in for a real list (contents invented)', 'A larger, diverse list.',
      ['harsh-desert', 'arctic', 'ancient-tomb', 'castle-siege', 'fighting-arena', 'library-of-the-dusk-tree', 'jungle', 'haunted-city', 'thunderstorm', 'deadly-dungeon', 'thieves-guild', 'magic-city']),
    F('darkheart', 'Darkheart of the forest', 'stand-in for a real list (contents invented)', 'The positive baseline: a triptych that already works.',
      ['gloaming-forest', 'witchs-hut', 'abandoned-grove', 'spooky-forest']),
    F('baldur-upper', 'Врата Балдура – Верхний город', 'stand-in for a real list (contents invented)', 'Single-image regression.',
      ['outpost-town', 'emberwood-village', 'street-chase']),
  ];
  const SYNTHETIC = [
    F('s-empty', 'Empty list', 'synthetic', '0 environments → neutral cover.', []),
    F('s-one', 'One environment', 'synthetic', '1 environment.', ['dragons-lair']),
    F('s-two', 'Two environments', 'synthetic', '2 environments, two pictures.', ['ancient-tomb', 'ocean-voyage']),
    F('s-ten-one', 'Ten sharing one picture', 'synthetic', '10 environments → one picture.', ['ruined-castle', 'forgotten-temple-of-the-serpent', 'moon-kingdom', 'ruined-mage-tower', 'mistfield-of-possibility', 'abandoned-grove', 'ancient-city', 'ancient-power-conduit', 'korathi-temple']),
    F('s-calm3', 'Three calm pictures', 'synthetic', 'Sky, ice, plains.', ['cloudy-sky', 'arctic', 'great-plains']),
    F('s-busy3', 'Three busy pictures', 'synthetic', 'Market, library, tavern.', ['bustling-marketplace', 'civic-library', 'local-tavern']),
    F('s-paint-mix', 'Painting + archetypes', 'synthetic', 'Unique painting beside archetypes.', ['cauldera-valley', 'ancient-tomb', 'ocean-voyage']),
    F('s-crop-mix', 'Crops + biome fallbacks', 'synthetic', 'Semantic crops beside biome fallbacks.', ['bustling-marketplace', 'resting-dagger-inn', 'harsh-desert', 'arctic']),
    F('s-crop-family', 'Crops sharing a parent', 'synthetic', 'Two crops of streets-and-towns + the whole picture: one family.', ['bustling-marketplace', 'resting-dagger-inn', 'outpost-town', 'ancient-tomb']),
    F('s-big', 'Fourteen environments', 'synthetic', '14 environments, many pictures.', ['harsh-desert', 'arctic', 'ancient-tomb', 'castle-siege', 'fighting-arena', 'jungle', 'haunted-city', 'thunderstorm', 'deadly-dungeon', 'thieves-guild', 'magic-city', 'ocean-voyage', 'shadowfen', 'dragons-lair']),
  ];
  return { CASES, SYNTHETIC, ALL: CASES.concat(SYNTHETIC) };
});
