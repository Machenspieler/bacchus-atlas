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
     2b. an approved semantic crop for 'lists' (SEMANTIC_OVERRIDES, PD-090)
     3. the archetype picture it is judged to fit (ARCHETYPE_FIT, strong or acceptable)
     4. its biome picture (never a EXPLICIT_ONLY_BIOMES one, never 'universal')
     5. nothing — it adds no tile; a list left with no tile at all gets the neutral cover.
   A step whose picture is not in the registry is skipped, so a missing asset falls
   through to the next source rather than to a broken image.

   Selecting for a list: environments are grouped by the picture they resolved to (so
   two environments that share one image are one candidate, whatever their biome or
   archetype ids), each candidate is scored, the best three are kept, and they are shown
   in catalogue order of their first member. See docs/research/adaptive-list-covers-implementation.md §5.
   Adaptive 3-or-2 (PD-092): when the best three would be a triptych, composeCover keeps all three only if each
   reads at a third of the width and at most one is busy (PANEL_REVIEWS); otherwise the worst-suited one is dropped (ties: lowest rank).
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
  /* kind 'crop' scores as a strong archetype picture: it is only ever dealt by an explicit override. */
  const BASE_SCORE = { unique: 100, 'archetype:strong': 60, 'archetype:acceptable': 50, biome: 40 };
  /* What the share of the list a picture stands for can add on top: at most this much, so a
   * biome that is most of the list (40 + up to 20) can pass a lone acceptable thematic
   * picture (50 + a little) but never a strong one or a painting. */
  const COVERAGE_WEIGHT = 20;

  function classOf(kind, fit) {
    if (kind === 'crop') return 'archetype:strong';
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

    const sem = art.SEMANTIC_OVERRIDES && art.SEMANTIC_OVERRIDES[env.id];
    const cropId = sem && sem.contexts.includes('lists') ? 'crop:' + sem.crop : null;
    if (has(cropId)) return { imageId: cropId, kind: 'crop', fit: 'strong', parent: images[cropId].parent };

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

  /** Adaptive 3-or-2. `ranked` is the candidate list in rank order (best first), at most COVER_MAX long. One or two
   * are returned as they are; three stay three only when every picture reads at a third and at most one is
   * busy. Otherwise one is dropped: the picture that fails at a third, else a busy one, and among equals the
   * lowest-ranked — so the existing ranking decides every tie and the survivors keep their rank order. A picture
   * with no review keeps the triptych (no guessing). Never adds a candidate or reorders by looks: the caller
   * orders what comes back. */
  function composeCover(ranked, reviews) {
    if (ranked.length < 3) return ranked;
    const rs = ranked.map(c => reviews && reviews[c.imageId]);
    if (rs.some(r => !r)) return ranked;
    const busy = rs.filter(r => r.busy).length;
    if (rs.every(r => r.readsAtThird) && busy <= 1) return ranked;
    let drop = 0, worst = -1;
    rs.forEach((r, i) => {
      const badness = (r.readsAtThird ? 0 : 2) + (r.busy ? 1 : 0);
      if (badness >= worst) { worst = badness; drop = i; }
    });
    return ranked.filter((c, i) => i !== drop);
  }

  /** Up to COVER_MAX distinct pictures for a list.
   * @param {Array<{imageId:string, kind:string, fit:string|null}|null>} resolutions  one per member, catalogue order
   * @returns {{layout: 0|1|2|3, tiles: Array<{imageId:string, kind:string, count:number}>}}
   *   layout 0 = no picture (the neutral cover). */
  function selectCoverImages(resolutions, art) {
    art = art || DefaultArt;
    const members = (resolutions || []).length;
    /* One candidate per source picture: a semantic crop and its parent's whole picture (or a second crop of
     * it) are one family, so a cover never shows two cuts of one illustration. Every other picture is its own
     * family. The family shows the member most environments resolved to (a crop on a tie: it is the more
     * specific one), then the earlier member, then the id. */
    const byImage = new Map();
    (resolutions || []).forEach((r, index) => {
      if (!r) return;
      const c = byImage.get(r.imageId);
      if (c) { c.count += 1; return; }
      byImage.set(r.imageId, { imageId: r.imageId, kind: r.kind, fit: r.fit, parent: r.parent || r.imageId, count: 1, first: index });
    });
    const families = new Map();
    [...byImage.values()].forEach(c => {
      const f = families.get(c.parent);
      if (!f) { families.set(c.parent, { ...c, count: c.count, rep: c }); return; }
      const better = c.count !== f.rep.count ? c.count > f.rep.count
        : (c.kind === 'crop') !== (f.rep.kind === 'crop') ? c.kind === 'crop'
          : c.first !== f.rep.first ? c.first < f.rep.first : c.imageId < f.rep.imageId;
      const total = f.count + c.count, first = Math.min(f.first, c.first);
      const rep = better ? c : f.rep;
      families.set(c.parent, { imageId: rep.imageId, kind: rep.kind, fit: rep.fit, parent: c.parent, count: total, first, rep });
    });
    const scored = [...families.values()].map(c => ({
      ...c, score: BASE_SCORE[classOf(c.kind, c.fit)] + COVERAGE_WEIGHT * (c.count / members),
    }));
    /* Ties: the larger share, then the earlier member, then the id — all of them properties
     * of the list's content, none of them of a render, so a cover never reshuffles. */
    scored.sort((a, b) => b.score - a.score || b.count - a.count || a.first - b.first || (a.imageId < b.imageId ? -1 : 1));
    const tiles = composeCover(scored.slice(0, COVER_MAX), art.PANEL_REVIEWS)
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
    const cover = selectCoverImages(resolutions, art);
    return {
      layout: cover.layout,
      tiles: cover.tiles.map(t => ({ ...t, image: art.IMAGES[t.imageId] })),
    };
  }

  return { COVER_MAX, BASE_SCORE, COVERAGE_WEIGHT, resolveEnvironmentArt, selectCoverImages, composeCover, coverForEnvironments };
});
