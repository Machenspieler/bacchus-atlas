/* ============================================================
   Bacchus's Atlas — journey2-locate.js
   Pure, DOM-free logic of the "Locate Soul Echoes" downtime move (PD-030): the GM picks the party's hex, the app finds the
   nearest UNCOLLECTED Soul Echo by straight-line map distance and answers with a direction on a sixteen-point compass —
   and nothing else (no sanctuary, name, distance, route or target hex).

     - SIXTEEN_DIRECTIONS    the one direction table (i18n keys only; no translated text lives here)
     - bearingDegrees        map-world bearing, 0 = map north, clockwise (screen Y grows downward, so dy is flipped)
     - directionForBearing   the 22.5° sector (half-sector rounding) of a bearing
     - findNearestSoulEcho   nearest candidate, equal distances (within NEAREST_TIE_EPSILON) broken by ONE injected-RNG draw
     - locateSoulEcho        document + context + origin cell -> a frozen result ({ type: 'direction' | 'here', ... })
     - animationPlan         the needle's final angle and duration (long spin, short spin for "here", reduced motion)
     - createLocateSession   the transient selecting -> animating -> result state machine with an injected scheduler
   Everything is a function of its inputs: no pan, zoom, fog, terrain, sanctuary name or generated sanctuary data is ever read, so
   none of them can change a result. Nothing here is persisted, recorded in history or part of the player projection.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./journey2-geometry.js'));
  else root.Journey2Locate = factory(root.Journey2Geometry);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Geo) {
  'use strict';

  const SECTOR_DEG = 22.5;
  /** World px. Distances closer than this count as equal. One hex is ~60 px wide, so this is far below anything a GM could see. */
  const NEAREST_TIE_EPSILON = 0.5;

  /** Index 0 = north, then clockwise every 22.5°. `abbreviation` is the English code; the localized abbreviation and name are the two keys. */
  const SIXTEEN_DIRECTIONS = Object.freeze([
    ['n', 'N'], ['nne', 'NNE'], ['ne', 'NE'], ['ene', 'ENE'], ['e', 'E'], ['ese', 'ESE'], ['se', 'SE'], ['sse', 'SSE'],
    ['s', 'S'], ['ssw', 'SSW'], ['sw', 'SW'], ['wsw', 'WSW'], ['w', 'W'], ['wnw', 'WNW'], ['nw', 'NW'], ['nnw', 'NNW'],
  ].map((d, i) => Object.freeze({ index: i, id: d[0], abbreviation: d[1], abbrKey: 'journey2_loc_dir_' + d[0] + '_abbr', labelKey: 'journey2_loc_dir_' + d[0], centerAngle: i * SECTOR_DEG })));

  const finite = v => typeof v === 'number' && Number.isFinite(v);

  /**
   * Bearing from `origin` to `target` ({ x, y } in map-world px) in degrees [0, 360): 0 = north (up the map), 90 = east, 180 = south,
   * 270 = west. World Y grows downward, so the northward component is origin.y - target.y.
   */
  function bearingDegrees(origin, target) {
    const dx = target.x - origin.x;
    const dy = origin.y - target.y;
    return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  }

  /** The compass sector of a bearing: { index, abbreviation, abbrKey, labelKey, centerAngle }. Half-sector rounding, wrapping at north. */
  function directionForBearing(bearing) {
    const b = ((bearing % 360) + 360) % 360;
    const index = Math.floor((b + SECTOR_DEG / 2) / SECTOR_DEG) % 16;
    const d = SIXTEEN_DIRECTIONS[index];
    return { index: d.index, id: d.id, abbreviation: d.abbreviation, abbrKey: d.abbrKey, labelKey: d.labelKey, centerAngle: d.centerAngle };
  }

  /**
   * Nearest candidate to `origin` ({ x, y }). `candidates` = [{ id, x, y, cellId? }]. When `originCellId` equals a candidate's mapped hex the
   * answer is 'here' (no bearing, never a random direction) — the zero-distance Echo wins over any other sanctuary. Otherwise the candidates
   * whose distance is within `epsilon` of the minimum are collected and ONE is drawn with the injected `random` (() => [0, 1)); the caller
   * freezes the result, so animation and text can never draw again. Returns null without candidates.
   * { type: 'here' | 'direction', target, distance, bearing, direction, tied }   (bearing / direction are null for 'here')
   */
  function findNearestSoulEcho(o) {
    const origin = o && o.origin, rand = o && typeof o.random === 'function' ? o.random : Math.random;
    const eps = o && finite(o.epsilon) ? o.epsilon : NEAREST_TIE_EPSILON;
    if (!origin || !finite(origin.x) || !finite(origin.y)) return null;
    const list = ((o && o.candidates) || []).filter(c => c && typeof c.id === 'string' && finite(c.x) && finite(c.y));
    if (!list.length) return null;
    const here = o.originCellId ? list.filter(c => typeof c.cellId === 'string' && c.cellId === o.originCellId) : [];
    const pool = here.length ? here : list;
    const dist = pool.map(c => ({ c: c, d: Math.hypot(c.x - origin.x, c.y - origin.y) }));
    const min = Math.min.apply(null, dist.map(x => x.d));
    const tied = dist.filter(x => Math.abs(x.d - min) <= eps).sort((a, b) => (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0));   // stable order, so one seeded draw is reproducible
    const r = rand();
    const pick = tied[Math.min(tied.length - 1, Math.max(0, Math.floor((finite(r) ? r : 0) * tied.length)))];
    if (here.length) return { type: 'here', target: pick.c, distance: pick.d, bearing: null, direction: null, tied: tied.length };
    const bearing = bearingDegrees(origin, pick.c);
    return { type: 'direction', target: pick.c, distance: pick.d, bearing: bearing, direction: directionForBearing(bearing), tied: tied.length };
  }

  /**
   * The Echoes a search may point at: distributed, not collected, on a real sanctuary with valid fixed-anchor geometry. Fog of War, the
   * revealed sanctuary names, generated sanctuary data and terrain are not inputs, so none of them can matter. Marrogate, Horizon and any
   * orphaned id are never in `ctx.sanctuaries`, so they can never appear.
   */
  function soulEchoCandidates(doc, ctx) {
    const echoes = doc && doc.soulEchoes, anchors = (echoes && echoes.anchorIds) || [], got = new Set((echoes && echoes.collectedAnchorIds) || []);
    const byId = new Map(((ctx && ctx.sanctuaries) || []).map(s => [s.id, s]));
    const out = [];
    for (const id of anchors) {
      const s = byId.get(id);
      if (s && !got.has(id) && finite(s.x) && finite(s.y)) out.push({ id: id, x: s.x, y: s.y, cellId: s.cellId || null });
    }
    return out;
  }

  /**
   * One search: the party's hex -> a frozen outcome. The origin is the world centre of that map hex (never a pointer position, so pan and zoom
   * cannot matter); the target is the fixed sanctuary anchor's canonical centre. Returns
   *   { ok: true, type: 'direction' | 'here', originCellId, targetAnchorId, bearing, direction }   — and NOTHING else (no distance, no name, no hex)
   *   { ok: false, reason: 'bad-origin' | 'no-echo' }
   */
  function locateSoulEcho(o) {
    const ctx = o && o.ctx, c = Geo.parseCellId(o && o.originCellId);
    if (!ctx || !c || !ctx.policy(c.q, c.r).ok) return { ok: false, reason: 'bad-origin' };
    const ctr = ctx.grid.cellCenter(c.q, c.r);
    const r = findNearestSoulEcho({ origin: { x: ctr[0], y: ctr[1] }, originCellId: o.originCellId, candidates: soulEchoCandidates(o.doc, ctx), random: o.random });
    if (!r) return { ok: false, reason: 'no-echo' };
    return { ok: true, type: r.type, originCellId: o.originCellId, targetAnchorId: r.target.id, bearing: r.bearing, direction: r.direction };
  }

  /**
   * The needle's animation, as data the view turns into one CSS transition: `finalAngle` is measured clockwise from north and is >= 720 + bearing
   * for a normal direction result (two full turns, then settling), 360 (one turn, back to neutral) for "here", and with reduced motion the final
   * angle is reached directly (no extra turns, ~0.2 s). The information is identical in every mode.
   */
  function animationPlan(outcome, reducedMotion) {
    const here = outcome && outcome.type === 'here';
    const bearing = here ? 0 : (outcome && finite(outcome.bearing) ? outcome.bearing : 0);
    if (reducedMotion) return { kind: here ? 'here' : 'direction', reduced: true, durationMs: 200, startAngle: 0, finalAngle: here ? 0 : bearing };
    if (here) return { kind: 'here', reduced: false, durationMs: 900, startAngle: 0, finalAngle: 360 };
    return { kind: 'direction', reduced: false, durationMs: 1500, startAngle: 0, finalAngle: 720 + bearing };
  }

  /**
   * The transient Locate state machine: null (inactive) -> 'selecting' -> 'animating' -> 'result'. It owns exactly one pending completion, guarded
   * by a token, so a completion that fires after Choose-another / Close / dispose is ignored and can never reopen a result.
   *   opts.schedule(fn, ms) -> handle   opts.cancel(handle)   opts.reducedMotion() -> boolean   opts.onChange(state, event)
   * `state` is a frozen snapshot { status, originCellId, targetAnchorId, bearing, directionIndex, resultType, plan, sig } (or null). Never persisted.
   */
  function createLocateSession(opts) {
    const o = opts || {};
    const schedule = o.schedule || ((fn, ms) => setTimeout(fn, ms)), cancel = o.cancel || (h => clearTimeout(h));
    let state = null, token = 0, handle = null, disposed = false;
    const notify = ev => { if (typeof o.onChange === 'function') o.onChange(state, ev); };
    const unschedule = () => { if (handle != null) { cancel(handle); handle = null; } token++; };
    const make = (status, extra) => Object.freeze(Object.assign({ status: status, originCellId: null, targetAnchorId: null, bearing: null, directionIndex: null, resultType: null, plan: null, sig: null }, extra || {}));

    return {
      get state() { return state; },
      isActive() { return !!state; },
      /** Enter (or re-enter) location selection. */
      start() { if (disposed) return null; unschedule(); state = make('selecting'); notify('selecting'); return state; },
      /** Freeze `outcome` (a successful locateSoulEcho result) and start the animation; `sig` identifies the Echo set it was computed from. */
      select(outcome, sig) {
        if (disposed || !state || state.status !== 'selecting' || !outcome || !outcome.ok) return null;
        unschedule();
        const plan = animationPlan(outcome, !!(o.reducedMotion && o.reducedMotion()));
        state = make('animating', { originCellId: outcome.originCellId, targetAnchorId: outcome.targetAnchorId, bearing: outcome.bearing, directionIndex: outcome.direction ? outcome.direction.index : null, resultType: outcome.type, plan: plan, sig: sig == null ? null : sig });
        const mine = token;
        notify('animating');
        handle = schedule(() => {
          handle = null;
          if (disposed || mine !== token || !state || state.status !== 'animating') return;   // stale completion: closed, restarted or replaced meanwhile
          state = make('result', { originCellId: state.originCellId, targetAnchorId: state.targetAnchorId, bearing: state.bearing, directionIndex: state.directionIndex, resultType: state.resultType, plan: state.plan, sig: state.sig });
          notify('result');
        }, plan.durationMs);
        return state;
      },
      /** Back to selection: the previous target, bearing and result are forgotten. */
      chooseAnother() { if (disposed || !state || state.status === 'selecting') return state; unschedule(); state = make('selecting'); notify('selecting'); return state; },
      /** Leave Locate entirely. */
      close() { if (!state) return; unschedule(); state = null; notify('closed'); },
      /** Teardown: cancels the pending completion without notifying (the DOM may already be gone). */
      dispose() { disposed = true; unschedule(); state = null; },
    };
  }

  return {
    SECTOR_DEG: SECTOR_DEG, NEAREST_TIE_EPSILON: NEAREST_TIE_EPSILON, SIXTEEN_DIRECTIONS: SIXTEEN_DIRECTIONS,
    bearingDegrees: bearingDegrees, directionForBearing: directionForBearing, findNearestSoulEcho: findNearestSoulEcho,
    soulEchoCandidates: soulEchoCandidates, locateSoulEcho: locateSoulEcho, animationPlan: animationPlan, createLocateSession: createLocateSession,
  };
});
