/* ============================================================
   Bacchus's Atlas — journey2-encounter-roll.js
   Pure, DOM-free Encounter Roll (PD-039): "when the party enters a hex, roll a number of d6s equal to the hex's terrain rating;
   if any die shows 1, activate an encounter".

     - rollEncounterDice({ count, sides, random })
         count   how many dice (the region's Terrain Rating, 1-4); anything but a positive integer rolls nothing
         sides   die size, default 6 (the book allows d4 for dangerous / d8 for safer areas; the view only ever passes 6 for now)
         random  injected RNG () -> [0, 1) (defaults to Math.random)
       returns { sides, faces: number[], triggered: boolean } — `triggered` is "any die shows 1"; a second 1 changes nothing,
       so no count of ones is returned.

   Nothing here is stored: the result is transient view state of the Region Inspector.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Journey2EncounterRoll = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_SIDES = 6;
  const MAX_DICE = 12;

  function rollEncounterDice(opts) {
    const o = opts || {};
    const sides = Number.isInteger(o.sides) && o.sides >= 2 ? o.sides : DEFAULT_SIDES;
    const count = Number.isInteger(o.count) && o.count > 0 ? Math.min(o.count, MAX_DICE) : 0;
    const random = typeof o.random === 'function' ? o.random : Math.random;
    const faces = [];
    for (let i = 0; i < count; i++) {
      const r = random();
      faces.push(1 + Math.min(sides - 1, Math.max(0, Math.floor((Number.isFinite(r) ? r : 0) * sides))));
    }
    return { sides: sides, faces: faces, triggered: faces.indexOf(1) !== -1 };
  }

  return { rollEncounterDice: rollEncounterDice };
});
