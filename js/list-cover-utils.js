/* ============================================================
   Bacchus's Atlas — list-cover-utils.js
   The rules behind the My Lists cover: which picture stands for one environment, and
   which (at most three, never the same one twice) stand for a whole list. Pure — no
   window, no document, no storage, no randomness — so a cover is a function of the
   list's current members and the static registry in js/list-cover-art.js, and is the
   same on every reload. Loaded as a plain <script> and required() from
   tests/list-cover-utils.test.js, the same shape as js/list-utils.js.

   Resolving one environment, first match wins:
     1. its own painting                          (kind 'unique')
     2. an explicit per-environment override      (ENV_IMAGE_OVERRIDES)
     3. the archetype picture it is judged to fit (ARCHETYPE_FIT, strong or acceptable)
     4. its biome picture (never a EXPLICIT_ONLY_BIOMES one, never 'universal')
     5. nothing — it adds no tile; a list left with no tile at all gets the neutral cover.
   A step whose picture is not in the registry is skipped, so a missing asset falls
   through to the next source rather than to a broken image.

   Selecting for a list: environments are grouped by the picture they resolved to (so
   two environments that share one image are one candidate, whatever their biome or
   archetype ids), each candidate is scored, the best three are kept, and they are shown
   in catalogue order of their first member. See docs/research/adaptive-list-covers-implementation.md §5.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./list-cover-art.js'));
  else root.ListCoverUtils = factory(root.ListCoverArt);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DefaultArt) {
  'use strict';

  /* Beyond three the tiles are too narrow to be a painting rather than a stripe, and the
   * count line under the cover already says how much is in the list. */
  const COVER_MAX = 3;

  /* Where a candidate starts. A unique painting always wins its place; a thematic picture
   * beats a plain biome; within the thematic ones a strong fit beats an acceptable one. */
  const BASE_SCORE = { unique: 100, 'archetype:strong': 60, 'archetype:acceptable': 50, biome: 40 };
  /* What the share of the list a picture stands for can add on top: at most this much, so a
   * biome that is most of the list (40 + up to 20) can pass a lone acceptable thematic
   * picture (50 + a little) but never a strong one or a painting. */
  const COVERAGE_WEIGHT = 20;

  function classOf(kind, fit) {
    if (kind === 'archetype') return fit === 'strong' ? 'archetype:strong' : 'archetype:acceptable';
    return kind;
  }

  /** The picture that stands for one environment, or null.
   * @param {{id: string, artBiome?: string|null}} env  artBiome is the app's own artBiome(env)
   * @returns {{imageId: string, kind: string, fit: string|null}|null} */
  function resolveEnvironmentArt(env, art) {
    art = art || DefaultArt;
    if (!env || !env.id) return null;
    const images = art.IMAGES;
    const has = id => !!id && Object.prototype.hasOwnProperty.call(images, id);

    const own = 'env:' + env.id;
    if (art.UNIQUE_ENV_IDS.includes(env.id) && has(own)) return { imageId: own, kind: 'unique', fit: null };

    const forced = art.ENV_IMAGE_OVERRIDES[env.id];
    if (has(forced)) return { imageId: forced, kind: images[forced].kind, fit: images[forced].kind === 'archetype' ? 'strong' : null };

    const fit = art.ARCHETYPE_FIT[env.id];
    if (fit) {
      const group = art.ARCHETYPES[fit[0]];
      const id = group && group.variants[fit[2] || 0];
      if (has(id)) return { imageId: id, kind: 'archetype', fit: fit[1] };
    }

    const b = env.artBiome;
    if (b && !art.EXPLICIT_ONLY_BIOMES.includes(b)) {
      const id = art.BIOME_IMAGES[b];
      if (has(id)) return { imageId: id, kind: 'biome', fit: null };
    }
    return null;
  }

  /** Up to COVER_MAX distinct pictures for a list.
   * @param {Array<{imageId:string, kind:string, fit:string|null}|null>} resolutions  one per member, catalogue order
   * @returns {{layout: 0|1|2|3, tiles: Array<{imageId:string, kind:string, count:number}>}}
   *   layout 0 = no picture (the neutral cover). */
  function selectCoverImages(resolutions) {
    const members = (resolutions || []).length;
    const byImage = new Map();
    (resolutions || []).forEach((r, index) => {
      if (!r) return;
      const c = byImage.get(r.imageId);
      if (c) { c.count += 1; return; }
      byImage.set(r.imageId, { imageId: r.imageId, kind: r.kind, fit: r.fit, count: 1, first: index });
    });
    const scored = [...byImage.values()].map(c => ({
      ...c, score: BASE_SCORE[classOf(c.kind, c.fit)] + COVERAGE_WEIGHT * (c.count / members),
    }));
    /* Ties: the larger share, then the earlier member, then the id — all of them properties
     * of the list's content, none of them of a render, so a cover never reshuffles. */
    scored.sort((a, b) => b.score - a.score || b.count - a.count || a.first - b.first || (a.imageId < b.imageId ? -1 : 1));
    const tiles = scored.slice(0, COVER_MAX)
      .sort((a, b) => a.first - b.first)
      .map(c => ({ imageId: c.imageId, kind: c.kind, count: c.count }));
    return { layout: tiles.length, tiles };
  }

  /** A list's cover from its members. `envs` are {id, artBiome} records (entries without an
   * id are ignored); `cache`, if given, is a Map reused across lists for the per-environment step. */
  function coverForEnvironments(envs, art, cache) {
    art = art || DefaultArt;
    const resolutions = (envs || []).filter(e => e && e.id).map(e => {
      if (cache && cache.has(e.id)) return cache.get(e.id);
      const r = resolveEnvironmentArt(e, art);
      if (cache) cache.set(e.id, r);
      return r;
    });
    const cover = selectCoverImages(resolutions);
    return {
      layout: cover.layout,
      tiles: cover.tiles.map(t => ({ ...t, image: art.IMAGES[t.imageId] })),
    };
  }

  return { COVER_MAX, BASE_SCORE, COVERAGE_WEIGHT, resolveEnvironmentArt, selectCoverImages, coverForEnvironments };
});
