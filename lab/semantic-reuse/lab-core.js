/* ============================================================
   Semantic Artwork Reuse Lab — lab-core.js  (DEV-ONLY; lab/ is excluded from dist/)
   The pure part of the lab: region geometry, context framing, resolution viability,
   review rules, coverage without double counting, and the review export. No window,
   no document, no storage — required() from tests/semantic-reuse-lab.test.js and
   scripts/semantic-reuse-lab.js, and a plain <script> in lab/semantic-reuse/index.html.

   Two independent concepts (docs/research/semantic-artwork-reuse-lab-v1.md §3):
     semantic region  what part of an existing master depicts a subject (normalised bounds)
     context crop     how that region is framed in one frame (focal x / y and zoom)
   An environment's canonical archetype is never read for a decision here and never written.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SemanticReuseCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA = 'bacchus-atlas/semantic-artwork-reuse-lab';
  const SCHEMA_VERSION = 1;

  /* Frames, verified against css/styles.css and js/list-cover-art.js (2026-11-02). */
  const CONTEXTS = {
    catalog: { id: 'catalog', label: 'Catalog', box: { w: 95, h: 249 }, note: '.card-art: 95px wide, stretches to the card (≈249px on desktop; 88px wide on phones)' },
    prep: { id: 'prep', label: 'Session Prep', box: { w: 48, h: 48 }, note: '.prep-thumb: 48×48, object-fit cover' },
    lists1: { id: 'lists1', label: 'My Lists · 1 tile', box: { w: 318, h: 90 }, note: '.list-card-cover, one picture the card wide' },
    lists2: { id: 'lists2', label: 'My Lists · 2 tiles', box: { w: 158, h: 90 }, note: 'two halves' },
    lists3: { id: 'lists3', label: 'My Lists · 3 tiles', box: { w: 105, h: 90 }, note: 'three thirds' },
  };
  const CONTEXT_IDS = Object.keys(CONTEXTS);
  /* Coverage is reported per production context; the three My Lists layouts are one context. */
  const COVERAGE_CONTEXTS = ['catalog', 'prep', 'lists'];
  const LISTS_LAYOUTS = ['lists1', 'lists2', 'lists3'];
  const DPRS = [1, 2];

  const REGION_STATUSES = ['proposed', 'approved', 'rejected', 'needs-better-crop', 'insufficient-resolution', 'too-complex', 'not-independently-meaningful'];
  const MAPPING_REVIEWS = ['strong', 'acceptable', 'rejected', 'needs-review'];
  const COUNTS_AS_APPROVED = ['strong', 'acceptable'];
  const VERDICTS = ['pass', 'fail', 'unreviewed'];
  const MIN_REGION = 0.02;
  const EPS = 1e-9;

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const round = (n, d) => { const k = Math.pow(10, d == null ? 2 : d); return Math.round(n * k) / k; };

  /* ---------- region bounds ---------- */

  /** @returns {{ok: boolean, errors: string[]}} */
  function validateBounds(b) {
    const errors = [];
    if (!b || typeof b !== 'object') return { ok: false, errors: ['bounds missing'] };
    ['x', 'y', 'width', 'height'].forEach(k => { if (typeof b[k] !== 'number' || !Number.isFinite(b[k])) errors.push(k + ' is not a finite number'); });
    if (errors.length) return { ok: false, errors };
    if (b.x < 0 || b.y < 0) errors.push('x / y must be >= 0');
    if (b.width < MIN_REGION || b.height < MIN_REGION) errors.push('width / height must be >= ' + MIN_REGION);
    if (b.x + b.width > 1 + EPS) errors.push('x + width exceeds the source');
    if (b.y + b.height > 1 + EPS) errors.push('y + height exceeds the source');
    return { ok: !errors.length, errors };
  }

  /** Normalised bounds -> whole source pixels, always inside the image. */
  function boundsToPixels(b, src) {
    const v = validateBounds(b);
    if (!v.ok) throw new RangeError('invalid bounds: ' + v.errors.join('; '));
    const W = src.width; const H = src.height;
    const x = clamp(Math.floor(b.x * W + EPS), 0, W - 1);
    const y = clamp(Math.floor(b.y * H + EPS), 0, H - 1);
    return { x, y, w: Math.max(1, Math.min(Math.round(b.width * W), W - x)), h: Math.max(1, Math.min(Math.round(b.height * H), H - y)) };
  }
  function pixelsToBounds(px, src) {
    return { x: round(px.x / src.width, 4), y: round(px.y / src.height, 4), width: round(px.w / src.width, 4), height: round(px.h / src.height, 4) };
  }
  /** Keep a region inside the source and above the minimum size (editor drags, keyboard nudges). */
  function clampBounds(b) {
    const width = clamp(b.width, MIN_REGION, 1); const height = clamp(b.height, MIN_REGION, 1);
    return { x: round(clamp(b.x, 0, 1 - width), 4), y: round(clamp(b.y, 0, 1 - height), 4), width: round(width, 4), height: round(height, 4) };
  }

  /* ---------- editor viewport: zoom and pan never touch a region ---------- */

  /** @param {{w:number,h:number}} fit  the source drawn at zoom 1 (CSS px)
   * @param {{scale:number,panX:number,panY:number}} view */
  function sourceToView(n, fit, view) { return { x: n.x * fit.w * view.scale + view.panX, y: n.y * fit.h * view.scale + view.panY }; }
  function viewToSource(p, fit, view) { return { x: (p.x - view.panX) / (fit.w * view.scale), y: (p.y - view.panY) / (fit.h * view.scale) }; }
  function zoomAt(view, point, factor, min, max) {
    const scale = clamp(view.scale * factor, min || 1, max || 8);
    const k = scale / view.scale;
    return { scale, panX: point.x - (point.x - view.panX) * k, panY: point.y - (point.y - view.panY) * k };
  }

  /* ---------- context framing ---------- */

  function normalizeFraming(f) {
    const num = (v, d) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? d : Number(v));
    return { x: clamp(round(num(f && f.x, 50), 2), 0, 100), y: clamp(round(num(f && f.y, 50), 2), 0, 100), zoom: clamp(round(num(f && f.zoom, 1), 2), 1, 3) };
  }

  /** The part of a region that survives `object-fit: cover` in a box, at a framing — in region pixels. */
  function frameWindow(regionPx, box, framing) {
    const f = normalizeFraming(framing);
    const ra = regionPx.w / regionPx.h; const ba = box.w / box.h;
    let w; let h;
    if (ra > ba) { h = regionPx.h / f.zoom; w = h * ba; } else { w = regionPx.w / f.zoom; h = w / ba; }
    return { x: (regionPx.w - w) * f.x / 100, y: (regionPx.h - h) * f.y / 100, w, h };
  }
  /** Framing that centres a subject rectangle (region-normalised) in the window, as far as the window allows. */
  function framingFor(regionPx, box, subject, zoom) {
    const z = zoom || 1; const win = frameWindow(regionPx, box, { x: 50, y: 50, zoom: z });
    const cx = (subject.x + subject.width / 2) * regionPx.w; const cy = (subject.y + subject.height / 2) * regionPx.h;
    const fx = regionPx.w - win.w < 1 ? 50 : clamp((cx - win.w / 2) / (regionPx.w - win.w) * 100, 0, 100);
    const fy = regionPx.h - win.h < 1 ? 50 : clamp((cy - win.h / 2) / (regionPx.h - win.h) * 100, 0, 100);
    return normalizeFraming({ x: fx, y: fy, zoom: z });
  }
  /** Share of the subject's area that is still visible (subject region-normalised; null = the whole region matters). */
  function subjectSurvival(regionPx, win, subject) {
    if (!subject) return 1; /* no focal subject declared: survival is not assessed */
    const s = subject;
    const sx0 = s.x * regionPx.w; const sy0 = s.y * regionPx.h; const sx1 = sx0 + s.width * regionPx.w; const sy1 = sy0 + s.height * regionPx.h;
    const ix = Math.max(0, Math.min(sx1, win.x + win.w) - Math.max(sx0, win.x));
    const iy = Math.max(0, Math.min(sy1, win.y + win.h) - Math.max(sy0, win.y));
    return round((ix * iy) / Math.max(1e-9, (sx1 - sx0) * (sy1 - sy0)), 3);
  }

  /** The focal subject that must survive in one frame: a per-frame one where a slice of the region is the evidence
   * (a wide My Lists band over a tall region), else the region's own. */
  function subjectFor(region, ctxId) { return (region.subjects && region.subjects[ctxId]) || region.subject || null; }

  /** The framing a region uses in one frame: an explicit one, else centred on its focal subject, else centred. */
  function contextFraming(region, ctxId, regionPx) {
    const entry = (region.contexts || {})[ctxId];
    if (entry && entry.framing) return normalizeFraming(entry.framing);
    const subject = subjectFor(region, ctxId);
    if (subject) return framingFor(regionPx, CONTEXTS[ctxId].box, subject, 1);
    return normalizeFraming(null);
  }

  const VIABILITY = {
    'suitable-dpr1-dpr2': 'Suitable at DPR 1 and 2',
    'suitable-dpr1-limited-dpr2': 'Suitable at DPR 1, limited at DPR 2',
    'insufficient-resolution': 'Insufficient native resolution',
    'requires-different-framing': 'Requires different framing',
    'visually-unsuitable': 'Visually unsuitable despite adequate resolution',
  };
  const SURVIVAL_MIN = 0.85;
  /* A focal subject smaller than this in the master cannot be made legible by any frame (the lighthouse case). */
  const SUBJECT_MIN_PX = 120;

  /**
   * Resolution viability of one region in one frame. Pixels are *source* pixels that survive the cover crop,
   * so the focal subject cut away shows up as survival < 1, not as a hidden loss.
   * @param {{w:number,h:number}} regionPx
   * @param {string} ctxId
   * @param {object} framing
   * @param {object|null} subject  region-normalised rectangle of the focal subject
   */
  function viability(regionPx, ctxId, framing, subject) {
    const box = CONTEXTS[ctxId].box;
    const f = normalizeFraming(framing);
    const win = frameWindow(regionPx, box, f);
    const survival = subjectSurvival(regionPx, win, subject);
    const per = {};
    DPRS.forEach(dpr => {
      const needW = Math.ceil(box.w * dpr); const needH = Math.ceil(box.h * dpr);
      const scale = round(needW / win.w, 3);
      per[dpr] = { needW, needH, scale, upscaled: scale > 1 + 1e-6 };
    });
    const subjectPx = subject ? { w: Math.round(subject.width * regionPx.w), h: Math.round(subject.height * regionPx.h) } : null;
    const subjectTooSmall = !!subjectPx && Math.max(subjectPx.w, subjectPx.h) < SUBJECT_MIN_PX;
    let status;
    if (subjectTooSmall) status = 'insufficient-resolution';
    else if (survival < SURVIVAL_MIN) status = 'requires-different-framing';
    else if (per[1].upscaled) status = 'insufficient-resolution';
    else if (per[2].upscaled) status = 'suitable-dpr1-limited-dpr2';
    else status = 'suitable-dpr1-dpr2';
    return {
      context: ctxId, box, framing: f,
      region: { w: regionPx.w, h: regionPx.h },
      effective: { w: round(win.w, 1), h: round(win.h, 1), share: round((win.w * win.h) / (regionPx.w * regionPx.h), 3) },
      survival, subjectPx, subjectTooSmall, dpr: per, status, label: VIABILITY[status],
    };
  }

  /** The lab never lets a human verdict upgrade a failing computation; it can only downgrade a passing one. */
  function effectiveStatus(viab, verdict) {
    if (viab.status !== 'suitable-dpr1-dpr2' && viab.status !== 'suitable-dpr1-limited-dpr2') return viab.status;
    return verdict === 'fail' ? 'visually-unsuitable' : viab.status;
  }

  /* ---------- records ---------- */

  function validateRegion(r, sources) {
    const errors = [];
    if (!r || typeof r !== 'object') return ['region is not an object'];
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.id || '')) errors.push('id must be a stable kebab-case slug');
    if (!r.sourceId) errors.push('sourceId missing');
    const src = sources && sources[r.sourceId];
    if (sources && !src) errors.push('unknown source ' + r.sourceId);
    if (!r.label) errors.push('label missing');
    if (!r.description) errors.push('description missing');
    if (!REGION_STATUSES.includes(r.status)) errors.push('status must be one of ' + REGION_STATUSES.join(', '));
    const b = validateBounds(r.bounds); if (!b.ok) b.errors.forEach(e => errors.push('bounds: ' + e));
    [r.subject].concat(Object.values(r.subjects || {})).filter(Boolean).forEach(sj => { const s = validateBounds(sj); if (!s.ok) s.errors.forEach(e => errors.push('subject: ' + e)); });
    Object.keys(r.contexts || {}).forEach(c => { if (!CONTEXTS[c]) errors.push('unknown context ' + c); else if (!VERDICTS.includes(r.contexts[c].verdict)) errors.push('verdict ' + c); });
    return errors;
  }
  function validateMapping(m, regionIds, envIds) {
    const errors = [];
    if (!regionIds.has(m.regionId)) errors.push('unknown region ' + m.regionId);
    if (!envIds.has(m.envId)) errors.push('unknown environment ' + m.envId);
    if (!MAPPING_REVIEWS.includes(m.review)) errors.push('review must be one of ' + MAPPING_REVIEWS.join(', '));
    if (!m.reason) errors.push('a reason is required');
    return errors;
  }

  /* ---------- families (My Lists) ---------- */

  /** A cover may hold at most one region from the same parent illustration (conservative lab rule). */
  function dedupeByParent(regionIds, regionById) {
    const seen = new Set(); const kept = []; const dropped = [];
    for (const id of regionIds) {
      const r = regionById.get ? regionById.get(id) : regionById[id];
      const parent = r ? r.sourceId : id;
      if (seen.has(parent)) dropped.push(id); else { seen.add(parent); kept.push(id); }
    }
    return { kept, dropped };
  }

  /* ---------- coverage ---------- */

  const THEMED = ['unique', 'override', 'thematic', 'archetype'];

  /**
   * Coverage without double counting. Pure: every input is passed in.
   * @param {object} p
   * @param {Array} p.regions  [{id, sourceId, status, contexts:{ctx:{verdict}}}]
   * @param {Array} p.mappings [{regionId, envId, review, improves?}]
   * @param {Object<string,{width:number,height:number}>} p.sources
   * @param {Array} p.envIds    every environment id
   * @param {Object<string,{catalog:string,prep:string,lists:string}>} p.baseline  what production draws now
   * @param {Object<string,string|null>} p.primaryArchetype  env id -> classification primary_archetype
   */
  function coverage(p) {
    const regionById = new Map(p.regions.map(r => [r.id, r]));
    const regionPx = r => boundsToPixels(r.bounds, p.sources[r.sourceId]);
    const passes = (r, ctx) => {
      if (!r || r.status !== 'approved') return false;
      const layouts = ctx === 'lists' ? LISTS_LAYOUTS : [ctx];
      /* A My Lists region must hold in every layout it may be dealt into. */
      return layouts.every(l => {
        const c = r.contexts && r.contexts[l];
        if (!c || c.verdict !== 'pass') return false;
        const px = regionPx(r); const v = viability(px, l, contextFraming(r, l, px), subjectFor(r, l));
        return v.status === 'suitable-dpr1-dpr2' || v.status === 'suitable-dpr1-limited-dpr2';
      });
    };
    const themed = (env, ctx) => THEMED.includes(((p.baseline[env] || {})[ctx]) || 'biome');
    const uniq = a => [...new Set(a)].sort();

    const proposed = p.mappings.filter(m => m.review !== 'rejected');
    const approvedMaps = p.mappings.filter(m => COUNTS_AS_APPROVED.includes(m.review) && (regionById.get(m.regionId) || {}).status === 'approved');
    const out = {
      environments: p.envIds.length,
      baseline: {},
      candidate: { environments: uniq(proposed.map(m => m.envId)).length, mappings: proposed.length },
      approved: { environments: uniq(approvedMaps.map(m => m.envId)).length, mappings: approvedMaps.length, ids: uniq(approvedMaps.map(m => m.envId)) },
      rejected: p.mappings.filter(m => m.review === 'rejected').length,
      needsReview: p.mappings.filter(m => m.review === 'needs-review').length,
      unreviewedCounted: 0,
      byContext: {},
    };
    COVERAGE_CONTEXTS.forEach(ctx => {
      const themedNow = p.envIds.filter(e => themed(e, ctx));
      out.baseline[ctx] = { themed: themedNow.length, notThemed: p.envIds.length - themedNow.length };
      const usable = approvedMaps.filter(m => passes(regionById.get(m.regionId), ctx));
      const ids = uniq(usable.map(m => m.envId));
      const newlyCovered = uniq(usable.filter(m => !themed(m.envId, ctx)).map(m => m.envId));
      const improved = uniq(usable.filter(m => themed(m.envId, ctx) && m.improves).map(m => m.envId));
      const net = uniq(newlyCovered.concat(improved));
      out.byContext[ctx] = {
        usableEnvironments: ids.length, newlyCovered: newlyCovered.length, improved: improved.length, net: net.length,
        ids, newlyCoveredIds: newlyCovered, improvedIds: improved, netIds: net,
        regions: uniq(usable.map(m => m.regionId)).length,
      };
    });
    const cross = approvedMaps.filter(m => p.primaryArchetype[m.envId] && p.primaryArchetype[m.envId] !== regionById.get(m.regionId).sourceId);
    out.crossArchetype = { mappings: cross.length, strong: cross.filter(m => m.review === 'strong').length, environments: uniq(cross.map(m => m.envId)).length, ids: uniq(cross.map(m => m.envId)) };
    out.netAnyContext = uniq(COVERAGE_CONTEXTS.flatMap(c => out.byContext[c].netIds)).length;
    return out;
  }

  /* ---------- gains: V2's three separate categories ---------- */

  /**
   * Counts three different things apart (never one inflated statistic), per production context:
   *   new          the environment wears no themed picture in that context today (production baseline)
   *   qualitative  it already wears one, and the mapping says the crop is demonstrably better (`improves`)
   *   none         suitable, but no material gain
   * An environment is counted once per context, at its best category (new > qualitative > none), however many
   * crops or parents reach it. Session Prep also gets the future-strategy reading: `prepFuture` treats every
   * environment the existing archetype pictures already reach (My Lists' baseline) as themed, so only gains
   * BEYOND integrating the 28 whole illustrations remain.
   * A mapping counts only when it is strong/acceptable on an `approved` region that passes the frame(s).
   * @param {object} p  same input as coverage()
   */
  function gains(p) {
    const regionById = new Map(p.regions.map(r => [r.id, r]));
    const passes = (r, ctx) => {
      if (!r || r.status !== 'approved') return false;
      const layouts = ctx === 'lists' ? LISTS_LAYOUTS : [ctx];
      return layouts.every(l => {
        const c = r.contexts && r.contexts[l];
        if (!c || c.verdict !== 'pass') return false;
        const px = boundsToPixels(r.bounds, p.sources[r.sourceId]); const v = viability(px, l, contextFraming(r, l, px), subjectFor(r, l));
        return v.status === 'suitable-dpr1-dpr2' || v.status === 'suitable-dpr1-limited-dpr2';
      });
    };
    const themedAt = (env, key) => THEMED.includes(((p.baseline[env] || {})[key]) || 'biome');
    const approvedMaps = p.mappings.filter(m => COUNTS_AS_APPROVED.includes(m.review) && (regionById.get(m.regionId) || {}).status === 'approved');
    const improvesIn = (m, ctx) => !!m.improves && (!m.improvesContexts || m.improvesContexts.includes(ctx));
    const RANK = { new: 2, qualitative: 1, none: 0 };
    const out = {};
    const ctxs = [['catalog', 'catalog', 'catalog'], ['prep', 'prep', 'prep'], ['lists', 'lists', 'lists'], ['prepFuture', 'prep', 'lists']];
    ctxs.forEach(([key, ctx, baseKey]) => {
      const best = {}; const regionsByEnv = {};
      approvedMaps.filter(m => passes(regionById.get(m.regionId), ctx)).forEach(m => {
        const cat = !themedAt(m.envId, baseKey) ? 'new' : (improvesIn(m, ctx) ? 'qualitative' : 'none');
        if (best[m.envId] === undefined || RANK[cat] > RANK[best[m.envId]]) best[m.envId] = cat;
        (regionsByEnv[m.envId] = regionsByEnv[m.envId] || []).push(m.regionId);
      });
      const ids = c => Object.keys(best).filter(e => best[e] === c).sort();
      out[key] = {
        usableEnvironments: Object.keys(best).length,
        newIds: ids('new'), qualitativeIds: ids('qualitative'), noGainIds: ids('none'),
        new: ids('new').length, qualitative: ids('qualitative').length, noGain: ids('none').length,
        regionsByEnv,
      };
    });
    const parentPairs = new Set(approvedMaps.map(m => m.envId + '|' + regionById.get(m.regionId).sourceId));
    out.dedupe = { mappings: approvedMaps.length, environments: new Set(approvedMaps.map(m => m.envId)).size, environmentParentPairs: parentPairs.size, regions: new Set(approvedMaps.map(m => m.regionId)).size };
    out.anyNew = [...new Set(['catalog', 'lists'].flatMap(k => out[k].newIds))].sort();
    out.anyQualitative = [...new Set(['catalog', 'lists'].flatMap(k => out[k].qualitativeIds))].filter(e => !out.anyNew.includes(e)).sort();
    return out;
  }

  /* ---------- export ---------- */

  function buildExport(p) {
    const envIds = new Set(p.envIds);
    const regions = p.regions.map(r => {
      const src = p.sources[r.sourceId];
      const px = boundsToPixels(r.bounds, src);
      const contexts = {};
      CONTEXT_IDS.forEach(c => {
        const entry = (r.contexts || {})[c] || { verdict: 'unreviewed' };
        const v = viability(px, c, contextFraming(r, c, px), subjectFor(r, c));
        contexts[c] = {
          framing: v.framing, verdict: entry.verdict, note: entry.note || '',
          viability: { status: effectiveStatus(v, entry.verdict), computed: v.status, survival: v.survival, effective: v.effective, dpr1: v.dpr[1], dpr2: v.dpr[2] },
        };
      });
      return {
        id: r.id, sourceId: r.sourceId, parentArtworkId: r.sourceId, label: r.label, description: r.description,
        bounds: r.bounds, pixels: px, subject: r.subject || null, subjects: r.subjects || {}, status: r.status, visualQa: r.visualQa || {}, notes: r.notes || '', contexts,
      };
    });
    const mappings = p.mappings.map(m => Object.assign({
      regionId: m.regionId, envId: m.envId, review: m.review, reason: m.reason,
      crossArchetype: !!(p.primaryArchetype[m.envId] && p.primaryArchetype[m.envId] !== (p.regions.find(r => r.id === m.regionId) || {}).sourceId),
      improvesExisting: !!m.improves, notes: m.notes || '',
    }, m.improvesContexts ? { improvesContexts: m.improvesContexts } : {}));
    return {
      schema: SCHEMA, version: SCHEMA_VERSION, generated: p.generated || null,
      sources: Object.keys(p.sources).sort().map(id => Object.assign({ id }, p.sources[id])),
      regions, mappings, coverage: coverage(p),
      note: 'Experimental, unapproved for production. Mapping reviews are one reviewer\'s judgement; nothing here changes the archetype taxonomy or the artwork registry.',
      _envCount: envIds.size,
    };
  }

  /** @returns {string[]} problems; empty = valid */
  function validateExport(x) {
    const errors = [];
    if (!x || x.schema !== SCHEMA) errors.push('wrong schema');
    if (!x || x.version !== SCHEMA_VERSION) errors.push('unsupported version');
    if (errors.length) return errors;
    const sources = {}; (x.sources || []).forEach(s => { sources[s.id] = s; });
    const ids = new Set();
    (x.regions || []).forEach(r => {
      if (ids.has(r.id)) errors.push('duplicate region ' + r.id); ids.add(r.id);
      if (r.parentArtworkId !== r.sourceId) errors.push(r.id + ': parent identity differs from source');
      const s = sources[r.sourceId]; if (!s) { errors.push(r.id + ': unknown source'); return; }
      const b = validateBounds(r.bounds); if (!b.ok) errors.push(r.id + ': ' + b.errors.join('; '));
      if (b.ok) { const px = boundsToPixels(r.bounds, s); if (px.w !== r.pixels.w || px.h !== r.pixels.h || px.x !== r.pixels.x || px.y !== r.pixels.y) errors.push(r.id + ': pixels disagree with bounds'); }
      if (!REGION_STATUSES.includes(r.status)) errors.push(r.id + ': bad status');
    });
    (x.mappings || []).forEach(m => {
      if (!ids.has(m.regionId)) errors.push('mapping to unknown region ' + m.regionId);
      if (!MAPPING_REVIEWS.includes(m.review)) errors.push(m.envId + ': bad review');
      if (!m.reason) errors.push(m.regionId + '/' + m.envId + ': reason missing');
    });
    return errors;
  }

  return {
    SCHEMA, SCHEMA_VERSION, CONTEXTS, CONTEXT_IDS, COVERAGE_CONTEXTS, LISTS_LAYOUTS, DPRS, REGION_STATUSES, MAPPING_REVIEWS, COUNTS_AS_APPROVED, VERDICTS, VIABILITY, MIN_REGION, SURVIVAL_MIN, SUBJECT_MIN_PX,
    clamp, round, validateBounds, boundsToPixels, pixelsToBounds, clampBounds, sourceToView, viewToSource, zoomAt,
    normalizeFraming, frameWindow, framingFor, contextFraming, subjectFor, subjectSurvival, viability, effectiveStatus,
    validateRegion, validateMapping, dedupeByParent, coverage, gains, buildExport, validateExport,
  };
});
