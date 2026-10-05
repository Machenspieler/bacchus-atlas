/* ============================================================
   Bacchus's Atlas — freshcutgrass-utils.js
   Pure, dependency-free helper for building a FreshCutGrass
   (freshcutgrass.app) encounter URL from an encounter name and a flat list
   of English adversary names. Nothing here is specific to any one caller —
   the environment detail page's "Potential Adversaries" links and Prep
   Prep's "Open in FreshCutGrass" export both go through the same
   buildFreshCutGrassEncounterUrl(), so there is exactly one encoder for the
   whole app.

   No DOM, no application state, no i18n — same shape as
   js/prep-utils.js, loaded as a plain <script> in the browser
   (before js/app.js, data-cache-version="ui") and required() as-is from a
   Node test (see tests/freshcutgrass-utils.test.js). TextEncoder and btoa
   are both available as globals in the browser and in Node 18+, so this
   file needs no polyfill or bundler either way.

   Compatibility layer: the same module also answers the one question every
   FreshCutGrass feature has to ask first — "does FreshCutGrass actually know
   this adversary?" — via isFreshCutGrassSupported(). The answer comes from an
   explicit index built from the adversary catalogue data/prep.json (the
   official adversaries, spelled as FreshCutGrass spells them), never from an
   adversary's source, tier or homebrew status. A name missing from that index
   is unsupported (fail closed): it gets no link and never reaches a payload.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./potential-adversary-utils.js'));
  else root.FreshCutGrassUtils = factory(root.PotentialAdversaryUtils);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (PotentialAdversaryUtils) {
  'use strict';

  const { normalizeAdversaryName } = PotentialAdversaryUtils;

  /** Unicode-safe base64: btoa() alone throws on any non-Latin1 character
   * (any Cyrillic prep title, for instance), so the UTF-8 bytes are
   * encoded first and each byte is then treated as its own Latin1
   * character — the standard workaround for btoa() with non-ASCII input. */
  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  /** Builds a FreshCutGrass encounter URL at runtime from an encounter name
   * and a flat list of adversary names. Every adversary is exported at
   * quantity 1 (`q: 1`) — Prep and the environment detail page both
   * treat adversary selection as binary, never a count. */
  function buildFreshCutGrassEncounterUrl(encounterName, adversaryNames) {
    const payload = {
      n: encounterName,
      d: adversaryNames.map(name => ({
        n: name,
        a: '',
        q: 1,
        u: 0,
        i: [{ n: null }],
      })),
    };
    const base64 = utf8ToBase64(JSON.stringify(payload));
    return `https://freshcutgrass.app/encounter?data=${encodeURIComponent(base64)}`;
  }

  /* ---------------- supported-adversary compatibility ---------------- */

  /** The canonical English name of an adversary given as either a bare name
   * string or a catalogue record. Only `name.en` is ever read — a localized
   * label never takes part in the compatibility decision. */
  function canonicalNameOf(adversary) {
    if (typeof adversary === 'string') return adversary;
    return (adversary && adversary.name && adversary.name.en) || '';
  }

  /** Normalized English name -> the name exactly as FreshCutGrass spells it,
   * built from a catalogue of adversary records. This index is the whole
   * "supported" dataset: explicit and deterministic. */
  function buildSupportedAdversaryIndex(adversaries) {
    const index = new Map();
    (adversaries || []).forEach(adv => {
      const name = canonicalNameOf(adv);
      const key = normalizeAdversaryName(name);
      if (key && !index.has(key)) index.set(key, name);
    });
    return index;
  }

  /** The FreshCutGrass spelling of an adversary, or null when the index does
   * not hold it — including when there is no index at all. */
  function supportedName(adversary, index) {
    if (!index) return null;
    const key = normalizeAdversaryName(canonicalNameOf(adversary));
    return (key && index.get(key)) || null;
  }

  /** THE answer to "can this adversary be sent to FreshCutGrass?" */
  function isFreshCutGrassSupported(adversary, index) {
    return supportedName(adversary, index) !== null;
  }

  function getFreshCutGrassSupportedAdversaries(adversaries, index) {
    return (adversaries || []).filter(adv => isFreshCutGrassSupported(adv, index));
  }

  function getFreshCutGrassUnsupportedAdversaries(adversaries, index) {
    return (adversaries || []).filter(adv => !isFreshCutGrassSupported(adv, index));
  }

  /** The compatibility gate in front of buildFreshCutGrassEncounterUrl():
   * keeps only supported adversaries, sends each under FreshCutGrass's own
   * spelling (identical to the input for an exact match), and returns null
   * when nothing is left rather than an empty encounter. */
  function buildSupportedEncounterUrl(encounterName, adversaries, index) {
    const names = [];
    const seen = new Set();
    (adversaries || []).forEach(adv => {
      const name = supportedName(adv, index);
      if (name && !seen.has(name)) { seen.add(name); names.push(name); }
    });
    return names.length ? buildFreshCutGrassEncounterUrl(encounterName, names) : null;
  }

  return {
    utf8ToBase64: utf8ToBase64,
    buildFreshCutGrassEncounterUrl: buildFreshCutGrassEncounterUrl,
    buildSupportedAdversaryIndex: buildSupportedAdversaryIndex,
    isFreshCutGrassSupported: isFreshCutGrassSupported,
    getFreshCutGrassSupportedAdversaries: getFreshCutGrassSupportedAdversaries,
    getFreshCutGrassUnsupportedAdversaries: getFreshCutGrassUnsupportedAdversaries,
    buildSupportedEncounterUrl: buildSupportedEncounterUrl,
  };
});
