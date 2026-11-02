/* ============================================================
   Artwork Lab V3 — lab-core.js  (DEV-ONLY; lab/ is excluded from dist/)
   The pure part of the lab: the three artwork strategies, crop maths, coverage / repetition /
   delivery statistics and the review export. No window, no document, no storage — required()
   from tests/artwork-lab-v3.test.js and from scripts/artwork-lab-v3-stats.js, and a plain
   <script> in lab/artwork-v3/index.html.

   Strategies (experiments, not production decisions):
     A · Current Biome     what production draws today: the biome picture, via the production artBiome().
     B · Archetype First   painting → override → ARCHETYPE_FIT picture (strong or acceptable) → A. No judgement.
     C · Context Adaptive  B's candidate, kept only where the lab's per-context visual review says the
                           picture survives that frame; otherwise A. The review is lab-only data
                           (lab/artwork-v3/context-review.js) — never written into the production registry.

   Nothing here may widen what is eligible: the only thematic pictures a strategy can pick are
   the ones js/list-cover-utils.js resolveEnvironmentArt() already authorises through ARCHETYPE_FIT.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ArtworkLabCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* The two frames, from css/styles.css: .card-art is 95px wide and stretches to the card
   * (≈249px on a desktop card with a two-line title and lore); .prep-thumb is 48×48. */
  const CONTEXTS = {
    catalog: { id: 'catalog', label: 'Catalog', box: { w: 95, h: 249 } },
    prep: { id: 'prep', label: 'Session Prep', box: { w: 48, h: 48 } },
  };
  const STRATEGIES = {
    A: { id: 'A', label: 'A · Current Biome' },
    B: { id: 'B', label: 'B · Archetype First' },
    C: { id: 'C', label: 'C · Context Adaptive' },
  };
  /* Intrinsic aspect (w/h) of each kind of file; tests/artwork-lab-v3.test.js verifies it against the files. */
  const ASPECT = { archetype: 16 / 9, unique: 3 / 2, biome: 16 / 9, 'biome-strip': 1 / 3, 'biome-thumb': 1 };
  const STRIP_WIDTHS = [100, 200, 250, 300];
  const THUMB_WIDTHS = [48, 96, 144];

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const round2 = n => Math.round(n * 100) / 100;

  /* ---------- image descriptors ---------- */

  function registryImage(art, id) {
    const im = art.IMAGES[id];
    if (!im) return null;
    return {
      id, identity: id, kind: im.kind, shape: 'landscape', aspect: ASPECT[im.kind],
      sources: im.avif.map(s => ({ path: s.path, w: s.w })), fallback: im.fallback, regPos: im.pos[3],
      crop: true,
    };
  }
  /** What production draws for a biome: the 1:3 strip in Catalog, a pre-cut square in Prep. */
  function productionBiomeImage(biome, ctx) {
    if (ctx === 'catalog') {
      return {
        id: 'prod:strip:' + biome, identity: 'biome-production:' + biome, kind: 'biome-production', shape: 'strip', aspect: ASPECT['biome-strip'],
        sources: STRIP_WIDTHS.map(w => ({ path: `img/biomes/${biome}-${w}.avif`, w })),
        fallback: `img/biomes/${biome}-200.webp`, regPos: { x: 50, y: 0 }, crop: false,
      };
    }
    return {
      id: 'prod:thumb:' + biome, identity: 'biome-production:' + biome, kind: 'biome-production', shape: 'thumb', aspect: ASPECT['biome-thumb'],
      sources: THUMB_WIDTHS.map(w => ({ path: `img/biomes/${biome}-thumb-${w}.webp`, w })),
      fallback: `img/biomes/${biome}-thumb-48.webp`, regPos: { x: 50, y: 50 }, crop: false,
    };
  }

  /* ---------- crop maths ---------- */

  /** Rendered (css) width of a cover-fitted picture in a box, before the zoom transform. */
  function coverWidth(box, aspect) { return Math.max(box.w, box.h * aspect); }

  /** The smallest cut that is at least as wide as the picture is drawn, in device pixels. */
  function pickDerivative(image, ctxId, dpr, zoom) {
    const box = CONTEXTS[ctxId].box;
    const need = coverWidth(box, image.aspect) * (zoom || 1) * (dpr || 1);
    const sorted = image.sources.slice().sort((a, b) => a.w - b.w);
    /* Strips and archetype cuts are measured by width; a thumb's `w` is its edge, equal to its width. */
    const hit = sorted.find(s => s.w >= need - 0.5) || null;
    const chosen = hit || sorted[sorted.length - 1];
    return { source: chosen, neededPx: Math.ceil(need), upscaled: !hit, upscaleFactor: hit ? 1 : round2(need / chosen.w) };
  }

  /** Part of the picture that is visible, as fractions of its width/height, and its top-left. */
  function cropWindow(box, aspect, crop) {
    const z = Math.max(1, crop.zoom || 1);
    const boxAspect = box.w / box.h;
    let vw; let vh;
    if (aspect > boxAspect) { vh = 1 / z; vw = (boxAspect / aspect) / z; } else { vw = 1 / z; vh = (aspect / boxAspect) / z; }
    return { vw, vh, left: (1 - vw) * clamp(crop.x, 0, 100) / 100, top: (1 - vh) * clamp(crop.y, 0, 100) / 100 };
  }

  function normalizeCrop(c, fallback) {
    const f = fallback || { x: 50, y: 50, zoom: 1 };
    const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null && v !== undefined ? Number(v) : d);
    return { x: clamp(round2(num(c && c.x, f.x)), 0, 100), y: clamp(round2(num(c && c.y, f.y)), 0, 100), zoom: clamp(round2(num(c && c.zoom, f.zoom || 1)), 1, 3) };
  }

  /** The CSS an experimental crop stands for — what "Copy CSS" gives and what the lab draws. */
  function cropCss(crop, selector) {
    const c = normalizeCrop(crop);
    const lines = [`object-fit: cover;`, `object-position: ${c.x}% ${c.y}%;`];
    if (c.zoom !== 1) lines.push(`transform: scale(${c.zoom});`, `transform-origin: ${c.x}% ${c.y}%;`);
    return `${selector || '.card-art img'} {\n  ${lines.join('\n  ')}\n}`;
  }
  function cropStyle(crop) {
    const c = normalizeCrop(crop);
    return `object-position:${c.x}% ${c.y}%;` + (c.zoom !== 1 ? `transform:scale(${c.zoom});transform-origin:${c.x}% ${c.y}%;` : '');
  }

  /* ---------- the lab ---------- */

  /**
   * @param {object} deps
   * @param {Array}  deps.envs            data/environments.json `environments`
   * @param {object} deps.art             js/list-cover-art.js
   * @param {object} deps.coverUtils      js/list-cover-utils.js
   * @param {function} deps.artBiome      the PRODUCTION artBiome(env), extracted from js/app.js
   * @param {object} deps.review          lab/artwork-v3/context-review.js
   * @param {object} [deps.classification] docs/research/lists-cover-classification.json
   */
  function create(deps) {
    const { envs, art, coverUtils, artBiome } = deps;
    const review = deps.review || { images: {}, questions: {} };
    const classification = deps.classification || { environments: [], taxonomy: [] };
    const byId = new Map(envs.map(e => [e.id, e]));
    const taxonomyByEnv = new Map(classification.environments.map(r => [r.id, r]));
    const taxonomyName = new Map((classification.taxonomy || []).map(t => [t.id, t.name]));

    /* ----- candidates: what is legitimately available for an environment ----- */

    /** The thematic / painting / override candidate the production registry authorises, or null. */
    function authorised(env) {
      const r = coverUtils.resolveEnvironmentArt({ id: env.id, artBiome: null }, art);
      if (!r) return null;
      const fit = art.ARCHETYPE_FIT[env.id] || null;
      const isOverride = r.kind !== 'unique' && art.ENV_IMAGE_OVERRIDES[env.id] === r.imageId;
      return {
        imageId: r.imageId,
        role: r.kind === 'unique' ? 'unique' : isOverride ? 'override' : 'archetype',
        fit: r.fit, archetype: fit ? fit[0] : null,
      };
    }

    /** What the taxonomy says versus what ARCHETYPE_FIT authorises. */
    function taxonomyHint(env) {
      const rec = taxonomyByEnv.get(env.id) || null;
      const fit = art.ARCHETYPE_FIT[env.id] || null;
      const primary = rec ? rec.primary_archetype : null;
      const secondary = rec ? rec.secondary_archetypes || [] : [];
      let status;
      if (fit) status = primary && primary !== fit[0] ? 'authorised-differs-from-primary' : 'authorised';
      else if (primary) status = 'taxonomy-only-not-authorised';
      else status = 'no-taxonomy-archetype';
      return {
        primary, secondary, authorisedArchetype: fit ? fit[0] : null, fit: fit ? fit[1] : null, status,
        primaryName: primary ? taxonomyName.get(primary) || primary : null,
        classificationStatus: rec ? rec.classification_status : null, explanation: rec ? rec.explanation : null,
      };
    }

    function candidatesFor(env, ctx) {
      const out = [];
      const biome = artBiome(env);
      if (biome) out.push({ role: 'production-biome', image: productionBiomeImage(biome, ctx), fit: null });
      const a = authorised(env);
      if (a) out.push({ role: a.role, image: registryImage(art, a.imageId), fit: a.fit, archetype: a.archetype });
      return out;
    }

    /* ----- review lookup ----- */

    function reviewFor(imageId, ctx) {
      const r = review.images && review.images[imageId];
      return r && r[ctx] ? r[ctx] : null;
    }

    /* ----- strategies ----- */

    function resolveA(env, ctx) {
      const biome = artBiome(env);
      if (!biome) return { strategy: 'A', ctx, envId: env.id, source: 'none', image: null, identity: null, fit: null, biome: null, reviewStatus: 'not-applicable', reason: ['No terrain biome: production draws no picture (Catalog has no panel; Prep shows the hex icon).'] };
      return {
        strategy: 'A', ctx, envId: env.id, source: 'biome', biome, image: productionBiomeImage(biome, ctx), identity: 'biome-production:' + biome, fit: null,
        reviewStatus: 'not-applicable',
        reason: [`Production artBiome(env) = "${biome}"; ${ctx === 'catalog' ? 'the 1:3 strip img/biomes/' + biome + '-*.avif' : 'the pre-cut square img/biomes/' + biome + '-thumb-*.webp'}.`],
      };
    }

    function resolveB(env, ctx) {
      const base = resolveA(env, ctx);
      const a = authorised(env);
      if (!a) {
        return Object.assign({}, base, { strategy: 'B', reason: ['No painting, override or ARCHETYPE_FIT entry for this environment — keeps the production biome picture.'].concat(base.reason) });
      }
      return {
        strategy: 'B', ctx, envId: env.id, source: a.role, fit: a.fit, archetype: a.archetype, imageId: a.imageId,
        image: registryImage(art, a.imageId), identity: a.imageId, biome: base.biome, reviewStatus: 'not-applicable',
        reason: [a.role === 'unique' ? 'Its own painting (UNIQUE_ENV_IDS).' : a.role === 'override' ? `Explicit ENV_IMAGE_OVERRIDES → ${a.imageId}.` : `ARCHETYPE_FIT: ${a.archetype} (${a.fit}). No visual judgement applied.`],
      };
    }

    function resolveC(env, ctx) {
      const b = resolveB(env, ctx);
      if (b.source === 'biome' || b.source === 'none') {
        return Object.assign({}, b, { strategy: 'C', reason: b.reason.slice(0, 1).map(s => s) .concat(['Nothing eligible to adapt; production biome stays.']) });
      }
      const rv = reviewFor(b.imageId, ctx);
      const base = resolveA(env, ctx);
      const keepBiome = (why, status) => Object.assign({}, base, {
        strategy: 'C', fit: b.fit, archetype: b.archetype, rejectedImageId: b.imageId, reviewStatus: status, rating: rv ? rv.rating : null,
        reason: [`Eligible picture ${b.imageId} (${b.fit || b.source}) — ${why}`, ...base.reason],
      });
      if (!rv) return keepBiome(`not yet reviewed for ${CONTEXTS[ctx].label}; falls back to the production biome and is flagged for review.`, 'unreviewed');
      if (rv.rating === 'poor') return keepBiome(`reviewed poor in ${CONTEXTS[ctx].label}: ${rv.note}`, 'reviewed');
      if (rv.rating === 'marginal' && b.source === 'archetype' && b.fit !== 'strong') return keepBiome(`reviewed marginal in ${CONTEXTS[ctx].label} and this fit is only "acceptable": ${rv.note}`, 'reviewed');
      return Object.assign({}, b, {
        strategy: 'C', reviewStatus: 'reviewed', rating: rv.rating,
        reason: [`${b.reason[0]} Reviewed ${rv.rating} in ${CONTEXTS[ctx].label}: ${rv.note}`],
      });
    }

    function resolve(strategy, env, ctx) {
      return strategy === 'A' ? resolveA(env, ctx) : strategy === 'B' ? resolveB(env, ctx) : resolveC(env, ctx);
    }

    /** The crop a strategy starts from, before any lab override. A production biome keeps its baked crop. */
    function startCrop(strategy, image, ctx) {
      if (!image) return null;
      if (!image.crop) return { x: image.regPos.x, y: image.regPos.y, zoom: 1, baked: true };
      if (strategy === 'C') {
        const rv = reviewFor(image.id, ctx);
        if (rv && rv.crop) return normalizeCrop(rv.crop, { x: image.regPos.x, y: image.regPos.y, zoom: 1 });
      }
      return normalizeCrop(image.regPos, { x: 50, y: 50, zoom: 1 });
    }
    function reviewedCrop(image, ctx) {
      const rv = image && reviewFor(image.id, ctx);
      return rv && rv.crop ? normalizeCrop(rv.crop) : null;
    }
    /** Effective crop: a lab override (keyed by context + image) beats the strategy's start. */
    function effectiveCrop(strategy, image, ctx, overrides) {
      if (!image) return null;
      const o = overrides && overrides[ctx] && overrides[ctx][image.id];
      if (o && image.crop) return normalizeCrop(o);
      return startCrop(strategy, image, ctx);
    }

    /* ----- statistics ----- */

    function emptyCounts() { return { unique: 0, override: 0, archetype: 0, biome: 0, none: 0 }; }

    function coverage(ctx, files) {
      const out = { total: envs.length };
      for (const s of ['A', 'B', 'C']) {
        const counts = emptyCounts();
        const status = { reviewed: 0, unreviewed: 0 };
        let downgraded = 0; let missing = 0;
        for (const env of envs) {
          const r = resolve(s, env, ctx);
          counts[r.source] += 1;
          if (s === 'C' && r.rejectedImageId) {
            downgraded += 1;
            status[r.reviewStatus] += 1;
          }
          if (files && r.image) {
            const ok = [r.image.fallback].concat(r.image.sources.map(x => x.path)).every(p => files.has(p));
            if (!ok) missing += 1;
          }
        }
        out[s] = { counts, thematic: counts.unique + counts.override + counts.archetype, biomeRetained: counts.biome, neutral: counts.none, missing: files ? missing : null };
        if (s === 'C') out[s].downgradedToBiome = downgraded;
        if (s === 'C') out[s].downgradeReviewStatus = status;
      }
      const eligible = envs.filter(e => authorised(e));
      out.eligible = {
        authorised: eligible.length,
        notAuthorised: envs.length - eligible.length,
        taxonomyOnlyNotAuthorised: envs.filter(e => taxonomyHint(e).status === 'taxonomy-only-not-authorised').length,
        byRole: eligible.reduce((m, e) => { const r = authorised(e).role; m[r] = (m[r] || 0) + 1; return m; }, {}),
        byFit: eligible.reduce((m, e) => { const f = authorised(e).fit || 'n/a'; m[f] = (m[f] || 0) + 1; return m; }, {}),
      };
      return out;
    }

    /** Adjacent-duplicate statistics over an ordered list of environments. */
    function repetition(ordered, strategy, ctx) {
      let adjacent = 0; let maxRun = 0; let run = 0; let prev = null;
      const counts = new Map();
      for (const env of ordered) {
        const r = resolve(strategy, env, ctx);
        const key = r.identity || '(none)';
        counts.set(key, (counts.get(key) || 0) + 1);
        if (key === prev) { adjacent += 1; run += 1; } else run = 1;
        maxRun = Math.max(maxRun, run);
        prev = key;
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5).map(([identity, n]) => ({ identity, n }));
      return { count: ordered.length, distinct: counts.size, adjacentSame: adjacent, adjacentSamePct: ordered.length > 1 ? round2(100 * adjacent / (ordered.length - 1)) : 0, maxRun, top };
    }

    /** Files the browser would fetch for these environments at a device pixel ratio. */
    function plannedFiles(list, strategy, ctx, dpr, cropOverrides) {
      const set = new Map();
      for (const env of list) {
        const r = resolve(strategy, env, ctx);
        if (!r.image) continue;
        const crop = effectiveCrop(strategy, r.image, ctx, cropOverrides);
        const pick = r.image.shape === 'thumb'
          ? { source: r.image.sources.find(s => s.w >= 48 * dpr) || r.image.sources[r.image.sources.length - 1], upscaled: false }
          : pickDerivative(r.image, ctx, dpr, crop ? crop.zoom : 1);
        set.set(pick.source.path, { path: pick.source.path, upscaled: pick.upscaled, identity: r.identity });
      }
      return [...set.values()];
    }

    /* ----- sampling for the grids ----- */

    /** Environments that exercise each case the brief lists; stable, derived from the data. */
    function sampleGroups(ctx) {
      const groups = [];
      const add = (id, label, list) => groups.push({ id, label, envIds: list.map(e => e.id) });
      const take = (arr, n) => arr.slice(0, n);
      const A = e => resolveA(e, ctx);
      const B = e => resolveB(e, ctx);
      const C = e => resolveC(e, ctx);
      add('unique', 'Unique painting', envs.filter(e => B(e).source === 'unique'));
      add('strong', 'Strong archetype match', take(envs.filter(e => B(e).source === 'archetype' && B(e).fit === 'strong'), 10));
      add('acceptable', 'Acceptable archetype match', take(envs.filter(e => B(e).source === 'archetype' && B(e).fit === 'acceptable'), 10));
      add('biome-only', 'Biome only (nothing eligible)', take(envs.filter(e => B(e).source === 'biome' && !['settlement', 'universal'].includes(A(e).biome)), 8));
      add('universal', 'Universal / neutral biome', take(envs.filter(e => B(e).source === 'biome' && A(e).biome === 'universal'), 6));
      add('settlement', 'Settlement biome', take(envs.filter(e => B(e).source === 'biome' && A(e).biome === 'settlement'), 6));
      add('multi', 'Multi-biome', take(envs.filter(e => (e.biomes || []).length > 2), 6));
      add('rejected', 'Taxonomy archetype NOT authorised', take(envs.filter(e => taxonomyHint(e).status === 'taxonomy-only-not-authorised'), 8));
      add('c-downgraded', 'C keeps biome (review says picture fails this frame)', take(envs.filter(e => C(e).rejectedImageId), 8));
      return groups;
    }

    /* ----- review export ----- */

    function buildExport({ reviews, crops, lang, generatedAt }) {
      const records = Object.values(reviews || {}).map(r => {
        const env = byId.get(r.envId);
        const per = {};
        for (const s of ['A', 'B', 'C']) {
          const res = env ? resolve(s, env, r.ctx) : null;
          per[s] = res ? { source: res.source, imageId: res.image ? res.image.id : null, identity: res.identity, archetype: res.archetype || null } : null;
        }
        const preferredSource = r.preferred === 'biome' ? per.A : r.preferred === 'archetype' ? per.B : null;
        return {
          envId: r.envId, context: r.ctx, judgement: r.judgement, notes: r.notes || '',
          preferredStrategy: r.preferred === 'biome' ? 'A' : r.preferred === 'archetype' ? 'B' : null,
          preferredSource, strategies: per,
          crop: r.crop || null, reviewReason: r.notes || r.judgement, manualEvaluationStatus: 'recorded-by-human', at: r.at || null,
        };
      }).sort((a, b) => (a.envId < b.envId ? -1 : a.envId > b.envId ? 1 : a.context < b.context ? -1 : 1));
      return {
        kind: 'bacchus-atlas-artwork-lab-v3-review', version: 1, generatedAt: generatedAt || null, lang: lang || 'en',
        note: 'Experimental judgements only. Nothing here is read by the production app.',
        cropConfiguration: { catalog: (crops && crops.catalog) || {}, prep: (crops && crops.prep) || {} },
        records,
      };
    }

    return {
      envs, byId, resolve, resolveA, resolveB, resolveC, authorised, taxonomyHint, candidatesFor, reviewFor,
      startCrop, reviewedCrop, effectiveCrop, coverage, repetition, plannedFiles, sampleGroups, buildExport, taxonomyName,
    };
  }

  const JUDGEMENTS = [
    { id: 'prefer-biome', label: 'Prefer Biome', preferred: 'biome' },
    { id: 'prefer-archetype', label: 'Prefer Archetype', preferred: 'archetype' },
    { id: 'both-acceptable', label: 'Both acceptable', preferred: null },
    { id: 'neither-acceptable', label: 'Neither acceptable', preferred: null },
    { id: 'crop-adjustment-needed', label: 'Crop adjustment needed', preferred: null },
    { id: 'needs-another-source', label: 'Needs another source illustration', preferred: null },
  ];

  return {
    CONTEXTS, STRATEGIES, ASPECT, STRIP_WIDTHS, THUMB_WIDTHS, JUDGEMENTS,
    registryImage, productionBiomeImage, coverWidth, pickDerivative, cropWindow, normalizeCrop, cropCss, cropStyle, create,
  };
});
