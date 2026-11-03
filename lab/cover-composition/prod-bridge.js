/* ============================================================
   My Lists Cover Composition Lab V2 — prod-bridge.js  (DEV-ONLY; lab/ is excluded from dist/)
   Runs the REAL production list-card and cover markup. js/app.js boots the whole application when loaded,
   so the lab reads it as text, extracts the handful of functions and constants it needs by name and
   evaluates them in a private scope whose state is a throwaway object (same technique as
   lab/artwork-v3/prod-bridge.js). Nothing here touches localStorage or the hash.

   One seam: listCoverHtml. The extracted production function stays reachable as prodListCoverHtml
   (Strategy A's reference); `hooks.cover(list)` may replace it. Everything else — the card, the
   rename field, the delete button, the count, the Open button — is the unmodified production template.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CoverCompositionBridge = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FUNCTIONS = ['escapeHtml', 'escapeAttr', 't', 'artBiome', 'coverTileHtml', 'listCoverHtml', 'listCardHtml'];
  const CONSTS = ['BIOMES', 'GENERIC_BIOMES', 'COVER_SIZES', 'ICON_COVER_ORNAMENT', 'ICON_TRASH', 'ICON_ALERT'];

  function extractFunction(src, name) {
    const start = src.search(new RegExp('^function ' + name + '\\(', 'm'));
    if (start < 0) throw new Error('cover-composition bridge: function ' + name + ' not found in app.js');
    const lineEnd = src.indexOf('\n', start);
    if (/\}\s*$/.test(src.slice(start, lineEnd)) && src.slice(start, lineEnd).includes('{')) return src.slice(start, lineEnd);
    const end = src.indexOf('\n}\n', start);
    if (end < 0) throw new Error('cover-composition bridge: function ' + name + ' has no closing brace');
    return src.slice(start, end + 2);
  }
  function extractConst(src, name) {
    const start = src.search(new RegExp('^const ' + name + ' =', 'm'));
    if (start < 0) throw new Error('cover-composition bridge: const ' + name + ' not found in app.js');
    const out = [];
    for (const line of src.slice(start).split('\n')) { out.push(line); if (/;\s*$/.test(line)) break; }
    return out.join('\n');
  }

  /** @param {string} appSource  js/app.js text
   * @param {{ListCoverUtils:object, ListCoverArt:object}} mods
   * @param {{lang?:string, i18n:object, envs:Array, lists:Array, envLists:object}} init
   *   envs = the catalogue (data/environments.json "environments"), lists = [{id,name}], envLists = { envId: [listId] } */
  function load(appSource, mods, init) {
    const state = { lang: init.lang || 'en', i18n: init.i18n, builtinEnvs: init.envs, envLists: init.envLists || {}, lists: init.lists || [] };
    const hooks = { cover: null };
    const parts = [];
    CONSTS.forEach(n => parts.push(extractConst(appSource, n)));
    FUNCTIONS.forEach(n => {
      let fn = extractFunction(appSource, n);
      if (n === 'listCoverHtml') fn = fn.replace('function listCoverHtml(', 'function prodListCoverHtml(');
      parts.push(fn);
    });
    parts.push('function listCoverHtml(list) { return hooks.cover ? hooks.cover(list) : prodListCoverHtml(list); }');
    parts.push('const ART_RUNTIME = { ...ListCoverArt, SEMANTIC_OVERRIDES: { ...ListCoverArt.SEMANTIC_OVERRIDES } };');
    parts.push('const coverResolutionCache = new Map();');
    parts.push('function allEnvs() { return state.builtinEnvs; }');
    parts.push('function envsInList(listId) { return allEnvs().filter(e => (state.envLists[e.id] || []).includes(listId)); }');
    parts.push('function listEnvCount(listId) { return Object.values(state.envLists).filter(ids => (ids || []).includes(listId)).length; }');
    parts.push('const ListUtils = { MAX_NAME_LENGTH: 80 };');
    parts.push('return { listCardHtml, prodListCoverHtml, coverTileHtml, artBiome, envsInList, ART_RUNTIME, COVER_SIZES, ICON_COVER_ORNAMENT, state };');
    // eslint-disable-next-line no-new-func
    const api = new Function('state', 'hooks', 'ListCoverUtils', 'ListCoverArt', parts.join('\n'))(state, hooks, mods.ListCoverUtils, mods.ListCoverArt);
    return Object.assign(api, { hooks });
  }

  /** The lab's renderer for one cover: the production tile markup (same <picture>, srcset, alt, loading) for an
   * arbitrary panel width. Equal panels reproduce production byte-for-byte; unequal ones add only a grid
   * template, and a lab crop adds a transform. */
  function coverHtml(composition, api, art) {
    if (!composition.layout) return null;
    const n = composition.panels.length;
    const equal = n === 1 || composition.panels.every(p => Math.abs(p.fraction - 1 / n) < 0.011);
    const cols = equal ? '' : ` style="grid-template-columns:${composition.panels.map(p => p.fraction + 'fr').join(' ')}"`;
    const tiles = composition.panels.map(p => {
      const img = art.IMAGES[p.imageId];
      const srcset = img.avif.map(a => `${a.path} ${a.w}w`).join(', ');
      const std = [1, 0.5, 1 / 3].findIndex(f => Math.abs(p.fraction - f) < 0.011);
      const sizes = std >= 0 ? api.COVER_SIZES[std + 1] : `(max-width: 640px) ${Math.round(p.fraction * 100)}vw, ${Math.round(p.fraction * 320)}px`;
      const base = img.pos[p.bucket];
      const style = [];
      if (!(p.x === 50 && p.y === 50)) style.push(`--pos:${p.x}% ${p.y}%`);
      if (p.scale !== 1) style.push(`transform:scale(${p.scale});transform-origin:${p.x}% ${p.y}%`);
      void base;
      return `<picture>
            <source type="image/avif" sizes="${sizes}" srcset="${srcset}">
            <img src="${img.fallback}" alt="" loading="lazy" decoding="async"${style.length ? ` style="${style.join(';')}"` : ''}${p.kind === 'crop' ? ` data-crop="${p.imageId}"` : ''}>
          </picture>`;
    }).join('');
    return `
      <div class="list-card-cover" aria-hidden="true"${cols}>${tiles}</div>`;
  }

  return { load, extractFunction, extractConst, coverHtml, FUNCTIONS, CONSTS };
});
