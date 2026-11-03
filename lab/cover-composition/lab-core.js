/* ============================================================
   My Lists Cover Composition Lab V2 — lab-core.js  (DEV-ONLY; lab/ is excluded from dist/)
   The pure part of the lab: how the pictures a list ALREADY resolved to are arranged on its 90px
   cover. No window, no document, no storage — required() from tests/cover-composition-lab.test.js
   and a plain <script> in lab/cover-composition/index.html.

   Two decisions, kept apart:
     artwork selection   js/list-cover-utils.js (production, untouched): which pictures are eligible,
                         one per source family, the best three. The lab never widens it — every
                         strategy arranges (a subset of) the pictures production already chose.
     cover composition   this file: how many of them to show, how wide, framed how.

   Strategies (experiments — none is an approved production algorithm):
     A  Current Production   production's own arrangement: 1 → full width, 2 → halves, 3 → thirds
     B  Two Equal Panels     the two strongest candidates, 50:50
     C  Single Hero          the strongest candidate, full width
     D  Asymmetric           the two strongest, main on the left (60:40 | 67:33 | 75:25)
     E  Adaptive             1 / 2 / asymmetric / 3 chosen from the lab's per-picture panel review;
                             unreviewed pictures keep production's arrangement, marked provisional
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CoverCompositionCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STRATEGIES = {
    A: { id: 'A', label: 'A · Current Production' },
    B: { id: 'B', label: 'B · Two Equal Panels' },
    C: { id: 'C', label: 'C · Single Hero' },
    D: { id: 'D', label: 'D · Asymmetric' },
    E: { id: 'E', label: 'E · Adaptive' },
  };
  const STRATEGY_IDS = Object.keys(STRATEGIES);
  const RATIOS = { '60:40': 0.6, '67:33': 0.67, '75:25': 0.75 };
  const DEFAULT_RATIO = '67:33';
  /* Hard stop on lab-only zoom: past this the 640px derivative is upscaled visibly. */
  const MAX_SCALE = 1.35;

  const RANK = { excellent: 2, acceptable: 1, poor: 0 };
  const rankOf = v => (Object.prototype.hasOwnProperty.call(RANK, v) ? RANK[v] : null);
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const round2 = n => Math.round(n * 100) / 100;

  /* ---------- candidates ---------- */

  /** Analyse a list against the REAL production resolver. Pure; never mutates `art`.
   * @param {Array<{id:string, artBiome:string|null}>} envs  catalogue-ordered members
   * @param {object} art  js/list-cover-art.js
   * @param {object} Utils js/list-cover-utils.js
   * @returns {{members:number, resolutions:Array, production:{layout:number, tiles:Array}, candidates:Array, distinct:number}}
   *   candidates = production's tiles, ranked strongest first (rank 0 = strongest). */
  function analyse(envs, art, Utils) {
    const list = (envs || []).filter(e => e && e.id);
    const resolutions = list.map(e => Utils.resolveEnvironmentArt(e, art));
    const production = Utils.coverForEnvironments(list, art);
    const members = list.length || 1;
    const distinct = new Set(resolutions.filter(Boolean).map(r => r.imageId)).size;
    const candidates = production.tiles.map((t, order) => {
      const res = resolutions.find(r => r && r.imageId === t.imageId);
      const klass = t.kind === 'crop' ? 'archetype:strong'
        : t.kind === 'archetype' ? (res && res.fit === 'strong' ? 'archetype:strong' : 'archetype:acceptable') : t.kind;
      const image = art.IMAGES[t.imageId];
      return {
        imageId: t.imageId, kind: t.kind, count: t.count, order, fit: res ? res.fit : null,
        parent: image.parent || t.imageId, score: Utils.BASE_SCORE[klass] + Utils.COVERAGE_WEIGHT * (t.count / members),
      };
    });
    /* Same tie-break as production's own sort, so rank 0 is the picture production values most. */
    const ranked = [...candidates].sort((a, b) => b.score - a.score || b.count - a.count || a.order - b.order || (a.imageId < b.imageId ? -1 : 1));
    ranked.forEach((c, i) => { c.rank = i; });
    return { members: list.length, resolutions, production: { layout: production.layout, tiles: production.tiles }, candidates: ranked, distinct };
  }

  /* ---------- framing ---------- */

  /** Which production framing a panel of this width fraction borrows: hero (1), half (2) or third (3). */
  function bucketOf(fraction) { return fraction >= 0.9 ? 1 : fraction >= 0.45 ? 2 : 3; }

  /** Where to hold a picture in a panel: production's own object-position for that bucket, plus any lab
   * override for it. Never mutates the registry or the overrides.
   * @param {object} overrides  { "<imageId>@<bucket>": { x?, y?, scale? } } */
  function framing(art, imageId, fraction, overrides) {
    const bucket = bucketOf(fraction);
    const base = art.IMAGES[imageId].pos[bucket];
    const o = (overrides && overrides[imageId + '@' + bucket]) || {};
    return {
      bucket,
      x: o.x == null ? base.x : clamp(o.x, 0, 100),
      y: o.y == null ? base.y : clamp(o.y, 0, 100),
      scale: o.scale == null ? 1 : clamp(o.scale, 1, MAX_SCALE),
      overridden: o.x != null || o.y != null || o.scale != null,
    };
  }

  const panel = (art, c, fraction, overrides) => ({ imageId: c.imageId, kind: c.kind, parent: c.parent, fraction: round2(fraction), ...framing(art, c.imageId, fraction, overrides) });

  /* ---------- review model ---------- */

  /** A rating of one picture at one panel width, or null (not reviewed). */
  function rating(reviews, imageId, bucket) {
    const r = reviews && reviews[imageId];
    if (!r) return null;
    const v = bucket === 1 ? r.hero : bucket === 2 ? r.half : r.third;
    return Object.prototype.hasOwnProperty.call(RANK, v) ? v : null;
  }
  const reviewed = (reviews, id) => !!(reviews && reviews[id] && rating(reviews, id, 1) && rating(reviews, id, 2) && rating(reviews, id, 3));

  /* ---------- composition ---------- */

  function neutral(strategy, why) { return { strategy, layout: 0, panels: [], omitted: [], rule: 'no-artwork', explanation: why || 'No picture is eligible: the neutral cover.', provisional: false }; }

  function make(strategy, art, a, chosen, fractions, extra, overrides) {
    const ids = new Set(chosen.map(c => c.imageId));
    return {
      strategy, layout: chosen.length, ratio: extra && extra.ratio, panels: chosen.map((c, i) => panel(art, c, fractions[i], overrides)),
      omitted: a.candidates.filter(c => !ids.has(c.imageId)).map(c => c.imageId),
      rule: extra.rule, explanation: extra.explanation, provisional: !!extra.provisional,
    };
  }
  const catalogueOrder = list => [...list].sort((x, y) => x.order - y.order);

  function compose(strategy, a, art, opts) {
    opts = opts || {};
    const overrides = opts.overrides || {};
    const reviews = opts.reviews || {};
    const ratio = RATIOS[opts.ratio] ? opts.ratio : DEFAULT_RATIO;
    const cands = a.candidates;
    if (!cands.length) return neutral(strategy);
    const top = cands.slice(0, 2);

    if (strategy === 'A') {
      const n = a.production.tiles.length;
      const chosen = catalogueOrder(cands);
      return make('A', art, a, chosen, chosen.map(() => 1 / n), { rule: 'production', explanation: 'Production arrangement: ' + n + ' equal panel' + (n > 1 ? 's' : '') + '.' }, overrides);
    }
    if (strategy === 'B') {
      if (cands.length === 1) return make('B', art, a, cands, [1], { rule: 'single-candidate', explanation: 'Only one distinct picture: full width.' }, overrides);
      const chosen = catalogueOrder(top);
      return make('B', art, a, chosen, [0.5, 0.5], { rule: 'two-strongest', explanation: 'The two strongest distinct pictures, half each, in catalogue order.' }, overrides);
    }
    if (strategy === 'C') {
      return make('C', art, a, [cands[0]], [1], { rule: 'strongest-hero', explanation: 'The strongest candidate across the whole cover.' }, overrides);
    }
    if (strategy === 'D') {
      if (cands.length === 1) return make('D', art, a, cands, [1], { rule: 'single-candidate', explanation: 'Only one distinct picture: full width.' }, overrides);
      const f = RATIOS[ratio];
      return make('D', art, a, top, [f, 1 - f], { ratio, rule: 'main-plus-secondary', explanation: 'Strongest picture as main (' + ratio + '), second strongest beside it.' }, overrides);
    }
    return adaptive(a, art, reviews, overrides, ratio);
  }

  /* E — rules over per-picture panel reviews. Hypotheses, not an approved algorithm. */
  function adaptive(a, art, reviews, overrides, ratio) {
    const cands = a.candidates;
    const prod = () => {
      const chosen = catalogueOrder(cands), n = chosen.length;
      return make('E', art, a, chosen, chosen.map(() => 1 / n), {}, overrides);
    };
    if (cands.length === 1) {
      const known = reviewed(reviews, cands[0].imageId);
      return make('E', art, a, cands, [1], { rule: 'single-candidate', provisional: !known, explanation: 'Only one distinct picture: full width' + (known ? '.' : ' (not reviewed — provisional).') }, overrides);
    }
    if (cands.some(c => !reviewed(reviews, c.imageId))) {
      const p = prod();
      p.rule = 'unreviewed-keep-production'; p.provisional = true;
      p.explanation = 'A picture here has no panel review yet: production arrangement kept (provisional).';
      return p;
    }
    const r = (c, b) => rankOf(rating(reviews, c.imageId, b));
    const busy = c => reviews[c.imageId].complexity === 'busy';
    const f = RATIOS[ratio];

    if (cands.length === 3) {
      const thirdsOk = cands.every(c => r(c, 3) >= 1);
      const busyCount = cands.filter(busy).length;
      if (thirdsOk && busyCount <= 1) {
        const chosen = catalogueOrder(cands);
        return make('E', art, a, chosen, [1 / 3, 1 / 3, 1 / 3], { rule: 'triptych-reads', explanation: 'All three read at a third and at most one is busy: three panels.' }, overrides);
      }
    }
    /* Two or fewer candidates, or an overcrowded triptych: pick the pair that reads best narrow, then rank. */
    const pool = cands.length === 3
      ? [...cands].sort((x, y) => (r(y, 3) + r(y, 2)) - (r(x, 3) + r(x, 2)) || (busy(x) - busy(y)) || x.rank - y.rank)
      : [...cands];
    const pair = pool.slice(0, 2);
    const why = cands.length === 3 ? 'Overcrowded triptych (' + (cands.every(c => r(c, 3) >= 1) ? 'too many busy pictures' : 'a picture fails at a third') + '): ' : '';
    if (pair.every(c => r(c, 2) >= 1)) {
      return make('E', art, a, catalogueOrder(pair), [0.5, 0.5], { rule: cands.length === 3 ? 'triptych-to-two' : 'two-read-at-half', explanation: why + 'both remaining pictures read at half width: two equal panels.' }, overrides);
    }
    const mains = [...pair].sort((x, y) => r(y, 1) - r(x, 1) || x.rank - y.rank), main = mains[0], side = mains[1];
    if (r(main, 1) >= 1 && r(main, 2) >= 1 && r(side, 3) >= 1) {
      return make('E', art, a, [main, side], [f, 1 - f], { ratio, rule: 'asymmetric', explanation: why + main.imageId + ' deserves the width; the other only has to read at a third: ' + ratio + '.' }, overrides);
    }
    const hero = [...pool].sort((x, y) => r(y, 1) - r(x, 1) || x.rank - y.rank)[0];
    return make('E', art, a, [hero], [1], { rule: 'single-hero', explanation: why + 'only ' + hero.imageId + ' reads well at the sizes available: one hero.' }, overrides);
  }

  /* ---------- export ---------- */

  const PREFERENCES = ['A', 'B', 'C', 'D', 'E', 'none'];

  /** The review export: valid, structured JSON. `state` holds only lab data.
   * @param {{cases:Array, prefs:object, notes:object, crops:object, reviews:object, ratio:string}} state */
  function buildExport(state, analyses, compositions) {
    return {
      schema: 'bacchus-cover-composition-review/1',
      generated: state.generated || null,
      note: 'Lab review only; nothing here is read by production. Ratings are provisional until the user confirms them.',
      ratio: state.ratio,
      cropSettings: state.crops || {},
      pictureReviews: state.reviews || {},
      cases: state.cases.map(c => {
        const a = analyses[c.id];
        return {
          fixture: c.id, name: c.name, fixtureKind: c.kind, environmentIds: c.envIds,
          artworkCandidates: a.candidates.map(x => ({ imageId: x.imageId, parent: x.parent, kind: x.kind, rank: x.rank, count: x.count })),
          parentArtworkIds: [...new Set(a.candidates.map(x => x.parent))],
          preference: (state.prefs && state.prefs[c.id]) || null,
          notes: (state.notes && state.notes[c.id]) || '',
          compositions: Object.fromEntries(STRATEGY_IDS.map(s => {
            const k = compositions[c.id][s];
            return [s, { layout: k.layout, rule: k.rule, provisional: k.provisional, included: k.panels.map(p => ({ imageId: p.imageId, fraction: p.fraction, x: p.x, y: p.y, scale: p.scale })), omitted: k.omitted }];
          })),
        };
      }),
    };
  }

  return { STRATEGIES, STRATEGY_IDS, RATIOS, DEFAULT_RATIO, MAX_SCALE, PREFERENCES, analyse, compose, framing, bucketOf, rating, reviewed, buildExport };
});
