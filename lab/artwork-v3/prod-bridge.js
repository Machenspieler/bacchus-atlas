/* ============================================================
   Artwork Lab V3 — prod-bridge.js  (DEV-ONLY; lab/ is excluded from dist/)
   Runs the REAL production card / picker-row / artBiome code. js/app.js boots the whole
   application when loaded, so the lab never loads it: it reads app.js as text, pulls out
   the handful of functions and constants it needs by name (the same extraction the tests
   use to prove Strategy A equals production), and evaluates them in a private scope whose
   state is a throwaway object. Nothing here touches localStorage or the hash.

   Only two production functions are replaced inside that scope: biomeArtHtml (the Catalog
   strip) and prepEnvThumbHtml (the Prep tile). Everything else — card, row, checkbox,
   tier badge, chips, buttons — is the unmodified production template, so "only the artwork
   differs" holds by construction. The originals stay reachable as prodBiomeArtHtml /
   prodPrepEnvThumbHtml; that is Strategy A.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ArtworkLabBridge = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FUNCTIONS = [
    'escapeHtml', 'escapeAttr', 't', 'envName', 'envField', 'isTranslated', 'bilingual', 'regionOfEnv', 'regionName',
    'artBiome', 'biomeArtHtml', 'biomeThumbAttrs', 'cardHtml', 'isEnvInAnyList', 'activePrep',
    'envPrepFullText', 'envPrepActionView', 'envPrepButtonClass', 'envPrepButtonHtml', 'prepToggleLabel',
    'prepSelectionCellHtml', 'envPickerRowHtml', 'envHash',
  ];
  const CONSTS = [
    'BIOMES', 'GENERIC_BIOMES', 'ART_SIZES', 'ART_WIDTHS', 'ICON_HEX', 'ICON_BOOKMARK', 'ENV_SYMBOL_BODY', 'ICON_ENV_ACTION',
  ];

  /** `function name(...) { ... }` up to the first closing brace in column 0. */
  function extractFunction(src, name) {
    const start = src.search(new RegExp('^function ' + name + '\\(', 'm'));
    if (start < 0) throw new Error('prod-bridge: function ' + name + ' not found in app.js');
    const lineEnd = src.indexOf('\n', start);
    if (/\}\s*$/.test(src.slice(start, lineEnd)) && src.slice(start, lineEnd).includes('{')) return src.slice(start, lineEnd);
    const end = src.indexOf('\n}\n', start);
    if (end < 0) throw new Error('prod-bridge: function ' + name + ' has no closing brace');
    return src.slice(start, end + 2);
  }
  /** `const NAME = ...;` — one or more lines, ending at the first line that ends in `;`. */
  function extractConst(src, name) {
    const start = src.search(new RegExp('^const ' + name + ' =', 'm'));
    if (start < 0) throw new Error('prod-bridge: const ' + name + ' not found in app.js');
    const lines = src.slice(start).split('\n');
    const out = [];
    for (const line of lines) { out.push(line); if (/;\s*$/.test(line)) break; }
    return out.join('\n');
  }

  /** @param {string} appSource  the text of js/app.js
   * @param {{EnvTierUtils: object, PrepUtils: object, RouteUtils: object}} modules
   * @param {{lang?: string, i18n: object, regions: Array, prepIds?: string[]}} init */
  function load(appSource, modules, init) {
    const state = {
      lang: init.lang || 'en', i18n: init.i18n, regions: init.regions || [],
      envLists: {}, route: { name: 'catalog' }, prep: { environmentIds: init.prepIds || [] },
    };
    const hooks = {
      catalogArt: null, prepThumb: null,
    };
    const parts = [];
    CONSTS.forEach(n => parts.push(extractConst(appSource, n)));
    FUNCTIONS.forEach(n => {
      let fn = extractFunction(appSource, n);
      if (n === 'biomeArtHtml') fn = fn.replace('function biomeArtHtml(', 'function prodBiomeArtHtml(');
      parts.push(fn);
    });
    /* The two replaced seams; the lab decides what they return. */
    /* Production's cardHtml now calls catalogArtHtml (PD-089: the Catalog rollout this lab informed). The lab keeps its own
     * seam under that name, with the pre-rollout biome strip as Strategy A, so the experiment's baseline stays the baseline. */
    parts.push('function catalogArtHtml(env) { return hooks.catalogArt ? hooks.catalogArt(env) : prodBiomeArtHtml(env); }');
    /* Production's prepEnvThumbHtml now resolves through PrepArt (PD-091: the Session Prep rollout this lab informed). The lab
     * freezes the pre-rollout biome-only tile as Strategy A, so the experiment's baseline stays the baseline. */
    parts.push(`function prodPrepEnvThumbHtml(env) {
      const biome = artBiome(env);
      if (!biome) return '<span class="prep-thumb prep-thumb-fallback" aria-hidden="true">' + ICON_HEX + '</span>';
      const { src, srcset } = biomeThumbAttrs(biome);
      return '<img class="prep-thumb" src="' + src + '" srcset="' + srcset + '" alt="" loading="lazy" decoding="async">';
    }`);
    parts.push('function prepEnvThumbHtml(env) { return hooks.prepThumb ? hooks.prepThumb(env) : prodPrepEnvThumbHtml(env); }');
    parts.push('return { cardHtml, envPickerRowHtml, artBiome, prodBiomeArtHtml, prodPrepEnvThumbHtml, biomeThumbAttrs, envName, t, BIOMES, GENERIC_BIOMES, ART_SIZES, ART_WIDTHS };');
    // eslint-disable-next-line no-new-func
    const api = new Function('state', 'hooks', 'EnvTierUtils', 'PrepUtils', 'RouteUtils', parts.join('\n'))(
      state, hooks, modules.EnvTierUtils, modules.PrepUtils, modules.RouteUtils);
    return Object.assign(api, { state, hooks });
  }

  return { load, extractFunction, extractConst, FUNCTIONS, CONSTS };
});
