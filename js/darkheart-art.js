/* ============================================================
   Bacchus's Atlas — darkheart-art.js
   The one table of Darkheart Forest artwork: which picture a travel OUTCOME wears in the page's
   hero banner, and which representative portrait an NPC ANCESTRY wears beside its name. Pure data
   and two lookups; no window, no document, no randomness, so a picture is a function of its key
   and this file. Loaded as a plain <script> and required() from tests/darkheart-art.test.js.

   Artwork is presentation only: it is chosen from a key the game already decided (the staged
   outcome, the generated NPC's own ancestry id) and never feeds anything back. A key with no entry
   gets no picture and no request — the established text-only / SVG-avatar fallback stays.

   Status: all twelve outcome banners are approved (use: 'approved', each focal point checked in the
   real 180 px hero under the nav ribbons, desktop and phone). Sixteen portraits are approved (each
   crop checked in the real 64 px circle: horns, cap, ears and flame kept, faces about the same size);
   firbolg and aetheris remain pilots; any other ancestry is one more entry here, with no UI change.

   Files (cut by scripts/generate-darkheart-art.js from img/darkheart-art-source/, never served):
     img/darkheart-art/outcome-<id>-{640,1024,1672}.avif  + outcome-<id>-1024.webp  (16:9, the master's whole frame)
     img/darkheart-art/ancestry-<id>-{64,128,192}.webp                              (square face crop)
   `position` is the CSS object-position of the banner's cover crop, chosen per picture so the
   subject survives a very wide, shallow window. `crop` is the portrait's square window in master pixels.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.DarkheartArt = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DIR = 'img/darkheart-art/';
  const OUTCOME_WIDTHS = [640, 1024, 1672];
  const OUTCOME_FALLBACK_WIDTH = 1024;
  const PORTRAIT_SIZES = [64, 128, 192];   // 1x / 2x / 3x of the 64 px circle

  /* outcome id (js/darkheart-expedition.js OUTCOME_RULES) -> picture. `position`: where the cover crop sits. */
  const OUTCOMES = {
    'creature-fail-fear':    { master: 'outcome-creature-fail-fear.png',    width: 1672, height: 941, position: '50% 38%', use: 'approved' },   // the glowing eyes in the fog
    'creature-fail-hope':    { master: 'outcome-creature-fail-hope.png',    width: 1672, height: 941, position: '50% 25%', use: 'approved' },   // the great stag by the standing stone
    'creature-success-fear': { master: 'outcome-creature-success-fear.png', width: 1671, height: 941, position: '50% 40%', use: 'approved' },   // the traveller in the roots, the lantern
    'creature-success-hope': { master: 'outcome-creature-success-hope.png', width: 1672, height: 941, position: '50% 15%', use: 'approved' },   // the NPC's face and the lit window
    'landmark-fail-fear':    { master: 'outcome-landmark-fail-fear.png',    width: 1672, height: 941, position: '50% 58%', use: 'approved' },   // the dead tree's foot and the bone ring
    'landmark-fail-hope':    { master: 'outcome-landmark-fail-hope.png',    width: 1672, height: 941, position: '50% 62%', use: 'approved' },   // the wooden toy and the wreath
    'landmark-success-fear': { master: 'outcome-landmark-success-fear.png', width: 1672, height: 941, position: '50% 50%', use: 'approved' },   // the cold fire, the log, the distant smoke
    'landmark-success-hope': { master: 'outcome-landmark-success-hope.png', width: 1672, height: 941, position: '50% 58%', use: 'approved' },
    'hazard-fail-fear':      { master: 'outcome-hazard-fail-fear.png',      width: 1671, height: 941, position: '50% 62%', use: 'approved' },
    'hazard-fail-hope':      { master: 'outcome-hazard-fail-hope.png',      width: 1672, height: 941, position: '50% 50%', use: 'approved' },   // the fallen trunks across the stream
    'resource-success-fear': { master: 'outcome-resource-success-fear.png', width: 1672, height: 941, position: '50% 52%', use: 'approved' },   // the sleeping beast and the chest
    'resource-success-hope': { master: 'outcome-resource-success-hope.png', width: 1672, height: 941, position: '50% 50%', use: 'approved' },   // the pack, chest and scroll on the stump
  };

  /* ancestry id (js/darkheart-npc.js ANCESTRIES) -> portrait. `crop`: the square window of the master, in its pixels. */
  const ANCESTRIES = {
    firbolg:  { master: 'ancestry-firbolg.png',  width: 1254, height: 1254, crop: { left: 250, top: 60, size: 800 }, use: 'pilot' },
    aetheris: { master: 'ancestry-aetheris.png', width: 1254, height: 1254, crop: { left: 270, top: 40, size: 780 }, use: 'pilot' },
    earthkin:{ master: 'ancestry-earthkin.png', width: 1254, height: 1254, crop: { left: 135, top: 0, size: 900 }, use: 'approved' },
    emberkin:{ master: 'ancestry-emberkin.png', width: 1254, height: 1254, crop: { left: 270, top: 60, size: 740 }, use: 'approved' },
    gnome:   { master: 'ancestry-gnome.png', width: 1254, height: 1254, crop: { left: 190, top: 0, size: 880 }, use: 'approved' },
    skykin:  { master: 'ancestry-skykin.png', width: 1254, height: 1254, crop: { left: 270, top: 150, size: 700 }, use: 'approved' },
    tidekin: { master: 'ancestry-tidekin.png', width: 1254, height: 1254, crop: { left: 130, top: 0, size: 1000 }, use: 'approved' },
    dwarf:   { master: 'ancestry-dwarf.png', width: 1254, height: 1254, crop: { left: 30, top: 120, size: 900 }, use: 'approved' },
    elf:     { master: 'ancestry-elf.png', width: 1254, height: 1254, crop: { left: 90, top: 90, size: 960 }, use: 'approved' },
    faerie:  { master: 'ancestry-faerie.png', width: 1254, height: 1254, crop: { left: 210, top: 90, size: 960 }, use: 'approved' },
    faun:    { master: 'ancestry-faun.png', width: 1254, height: 1254, crop: { left: 25, top: 0, size: 1150 }, use: 'approved' },
    fungril: { master: 'ancestry-fungril.png', width: 1254, height: 1254, crop: { left: 10, top: 10, size: 1180 }, use: 'approved' },
    galapa:  { master: 'ancestry-galapa.png', width: 1254, height: 1254, crop: { left: 125, top: 0, size: 950 }, use: 'approved' },
    goblin:  { master: 'ancestry-goblin.png', width: 1254, height: 1254, crop: { left: 160, top: 0, size: 1050 }, use: 'approved' },
    halfling:{ master: 'ancestry-halfling.png', width: 1254, height: 1254, crop: { left: 180, top: 20, size: 860 }, use: 'approved' },
    human:   { master: 'ancestry-human.png', width: 1254, height: 1254, crop: { left: 155, top: 60, size: 860 }, use: 'approved' },
    katari:  { master: 'ancestry-katari.png', width: 1254, height: 1254, crop: { left: 100, top: 0, size: 1000 }, use: 'approved' },
    orc:     { master: 'ancestry-orc.png', width: 1254, height: 1254, crop: { left: 135, top: 70, size: 900 }, use: 'approved' },
  };

  const has = (table, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);
  const stemOf = (kind, id) => kind + '-' + id;

  /** The banner picture of an outcome, or null (no entry: nothing is shown and nothing is requested). */
  function outcomeArt(outcome) {
    if (!has(OUTCOMES, outcome)) return null;
    const o = OUTCOMES[outcome], stem = DIR + stemOf('outcome', outcome);
    return {
      id: outcome, width: o.width, height: o.height, position: o.position,
      avifSrcset: OUTCOME_WIDTHS.map(w => `${stem}-${w}.avif ${w}w`).join(', '),
      src: `${stem}-${OUTCOME_FALLBACK_WIDTH}.webp`,
    };
  }

  /** The portrait of an ancestry, or null (SVG silhouette stays). Keyed by the ancestry id alone: never a name or a description. */
  function portraitArt(ancestryId) {
    if (!has(ANCESTRIES, ancestryId)) return null;
    const stem = DIR + stemOf('ancestry', ancestryId);
    return {
      id: ancestryId, size: PORTRAIT_SIZES[0],
      src: `${stem}-${PORTRAIT_SIZES[0]}.webp`,
      srcset: `${stem}-${PORTRAIT_SIZES[1]}.webp 2x, ${stem}-${PORTRAIT_SIZES[2]}.webp 3x`,
    };
  }

  /** Every file the table promises, for the generator and the tests. */
  function files() {
    const out = [];
    for (const id of Object.keys(OUTCOMES)) {
      for (const w of OUTCOME_WIDTHS) out.push(`${DIR}${stemOf('outcome', id)}-${w}.avif`);
      out.push(`${DIR}${stemOf('outcome', id)}-${OUTCOME_FALLBACK_WIDTH}.webp`);
    }
    for (const id of Object.keys(ANCESTRIES)) for (const s of PORTRAIT_SIZES) out.push(`${DIR}${stemOf('ancestry', id)}-${s}.webp`);
    return out;
  }

  return { DIR, OUTCOME_WIDTHS, OUTCOME_FALLBACK_WIDTH, PORTRAIT_SIZES, OUTCOMES, ANCESTRIES, outcomeArt, portraitArt, files };
});
