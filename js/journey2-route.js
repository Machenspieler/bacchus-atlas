/* ============================================================
   Bacchus's Atlas — journey2-route.js
   Pure, DOM-free logic of the GM-only Route Planner (PD-031): A* over the Journey map's six-neighbour hex grid, three strategies, route
   statistics and the transient planner state machine. No window/document/storage and no strings: the view owns every label.

     - encounterExpectation / terrainTravelCost   the two per-hex cost functions (the cost belongs to the hex ENTERED; the start is free)
     - hexDistance                                canonical axial distance (the A* heuristic basis)
     - findHexRoute                               one strategy: { status:'ok', cells, totalCost, stats } | { status:'no-route', reason }
     - planRoutes                                 all three strategies for one A -> B
     - calculateRouteStats                        hexes, travel days, expected encounter triggers, terrain breakdown (start excluded)
     - buildTerrainIndex                          doc -> Map cellId -> Terrain Rating 1-4 (only where the GM generated terrain)
     - createRoutePlanner                         the transient select-start -> select-end -> result state machine
   Terrain Ratings are never invented: Fastest and Fewer encounters only enter cells whose rating is known; Shortest ignores terrain and its
   statistics then say "unknown" instead of guessing. Nothing here is persisted, recorded in history or part of the player projection.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./journey2-geometry.js'));
  else root.Journey2Route = factory(root.Journey2Geometry);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Geo) {
  'use strict';

  const STRATEGIES = Object.freeze(['fastest', 'shortest', 'encounters']);
  const DEFAULT_STRATEGY = 'fastest';
  /** Floating-point costs are compared with this tolerance, never with ===. */
  const ROUTE_COST_EPSILON = 1e-9;
  /** The cheapest possible expected-trigger cost of one entered hex (Terrain 1: 1 - 5/6). Keeps the encounter heuristic admissible. */
  const MIN_ENCOUNTER_COST = 1 / 6;
  const MIN_TERRAIN = 1, MAX_TERRAIN = 4;

  /** A known hex: Terrain 1-4, or 0 for a settlement hex (a sanctuary / Marrogate / Horizon icon: never generated terrain, entering it costs no days and rolls no Encounter Dice). */
  const isRating = v => Number.isInteger(v) && v >= 0 && v <= MAX_TERRAIN;

  /** Probability that `rating` d6 show at least one 1. The single home of this formula. */
  function encounterProbability(rating) { return 1 - Math.pow(5 / 6, rating); }
  /** Expected number of triggered encounters when entering one hex of this rating (a trigger is "at least one 1", so it equals the probability). */
  function encounterExpectation(rating) { return encounterProbability(rating); }
  /** Travel days to enter a hex = its Terrain Rating. */
  function terrainTravelCost(rating) { return rating; }

  /** Axial hex distance between two { q, r } (or "q,r" ids). */
  function hexDistance(a, b) {
    const p = typeof a === 'string' ? Geo.parseCellId(a) : a, s = typeof b === 'string' ? Geo.parseCellId(b) : b;
    const dq = p.q - s.q, dr = p.r - s.r;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
  }

  /** Per-strategy cost of ENTERING a hex with a known rating, and the admissible per-step lower bound the heuristic multiplies by. */
  const STRATEGY_MODEL = Object.freeze({
    fastest: Object.freeze({ terrainAware: true, minStep: 1, edgeCost: rating => terrainTravelCost(rating) }),
    shortest: Object.freeze({ terrainAware: false, minStep: 1, edgeCost: () => 1 }),
    encounters: Object.freeze({ terrainAware: true, minStep: MIN_ENCOUNTER_COST, edgeCost: rating => encounterExpectation(rating) }),
  });

  /** "q,r" ids compared numerically (q, then r): the one canonical cell order every tie is broken with. */
  function compareCellIds(a, b) {
    if (a === b) return 0;
    const p = Geo.parseCellId(a), s = Geo.parseCellId(b);
    if (p && s) return p.q - s.q || p.r - s.r;
    return a < b ? -1 : 1;
  }

  /** Binary min-heap with a caller-supplied order. */
  function createHeap(less) {
    const a = [];
    return {
      get size() { return a.length; },
      push(x) {
        a.push(x);
        let i = a.length - 1;
        while (i > 0) { const p = (i - 1) >> 1; if (!less(a[i], a[p])) break; const t = a[i]; a[i] = a[p]; a[p] = t; i = p; }
      },
      pop() {
        const top = a[0], last = a.pop();
        if (a.length) {
          a[0] = last;
          let i = 0;
          for (;;) {
            const l = i * 2 + 1, r = l + 1; let m = i;
            if (l < a.length && less(a[l], a[m])) m = l;
            if (r < a.length && less(a[r], a[m])) m = r;
            if (m === i) break;
            const t = a[i]; a[i] = a[m]; a[m] = t; i = m;
          }
        }
        return top;
      },
    };
  }

  /**
   * Statistics of a route (an array of cell ids, start first). The start is never charged: only cells[1..] count.
   * `complete` = every entered cell has a known rating; only then are travelDays / expectedEncounters numbers (otherwise null — never a partial total
   * presented as final). `knownDays` is the optional, clearly partial sum over the known cells.
   */
  function calculateRouteStats(cells, getTerrainRating) {
    const entered = (cells || []).slice(1);
    const terrainCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    let days = 0, enc = 0, known = 0, unknown = 0;
    for (const id of entered) {
      const r = getTerrainRating(id);
      if (isRating(r)) { known++; days += terrainTravelCost(r); enc += encounterExpectation(r); terrainCounts[r]++; }
      else unknown++;
    }
    const complete = unknown === 0;
    return {
      hexes: entered.length, knownHexes: known, unknownHexes: unknown, complete: complete,
      travelDays: complete ? days : null, expectedEncounters: complete ? enc : null,
      knownDays: days, terrainCounts: terrainCounts,
    };
  }

  /**
   * A* for one strategy.
   *   startCell, goalCell   "q,r" ids        strategy 'fastest' | 'shortest' | 'encounters'
   *   getNeighbors(id)      -> ids of the six edge neighbours that exist on the grid (corner contact is not adjacency)
   *   getTerrainRating(id)  -> 1-4 or null/undefined when no terrain was generated there
   *   isRouteableCell(id)   -> the canonical valid-cell test
   * Equal-cost candidates are ordered by f, then h, then canonical cell order, and neighbours are visited in canonical order, so the same input
   * always yields the same path. The result also carries `segments` (per step: the entered cell's rating is known) for the view's dashed line.
   *   { status:'ok', strategy, cells, totalCost, stats, segmentKnown }
   *   { status:'no-route', strategy, reason: 'invalid-endpoint' | 'unknown-terrain' | 'disconnected' }
   */
  function findHexRoute(o) {
    const strategy = o && STRATEGY_MODEL[o.strategy] ? o.strategy : null;
    const fail = reason => ({ status: 'no-route', strategy: strategy, reason: reason });
    if (!strategy) return fail('invalid-endpoint');
    const model = STRATEGY_MODEL[strategy];
    const start = o.startCell, goal = o.goalCell;
    const rating = o.getTerrainRating || (() => null);
    if (!Geo.parseCellId(start) || !Geo.parseCellId(goal) || !o.isRouteableCell(start) || !o.isRouteableCell(goal)) return fail('invalid-endpoint');

    const enterable = id => o.isRouteableCell(id) && (!model.terrainAware || isRating(rating(id)));
    const stepCost = id => (model.terrainAware ? model.edgeCost(rating(id)) : 1);
    // a zero-cost settlement hex makes every per-step lower bound 0 (still admissible: it degrades A* to Dijkstra)
    const minStep = o.hasZeroCostCells && model.terrainAware ? 0 : model.minStep;
    const h = id => hexDistance(id, goal) * minStep;

    if (start === goal) return finish([start], 0);

    const g = new Map([[start, 0]]), came = new Map(), closed = new Set();
    const heap = createHeap((x, y) => {
      if (Math.abs(x.f - y.f) > ROUTE_COST_EPSILON) return x.f < y.f;
      if (Math.abs(x.h - y.h) > ROUTE_COST_EPSILON) return x.h < y.h;
      return compareCellIds(x.id, y.id) < 0;
    });
    heap.push({ id: start, f: h(start), h: h(start) });
    while (heap.size) {
      const cur = heap.pop();
      if (closed.has(cur.id)) continue;
      if (cur.id === goal) {
        const cells = [goal];
        for (let c = goal; came.has(c);) { c = came.get(c); cells.push(c); }
        return finish(cells.reverse(), g.get(goal));
      }
      closed.add(cur.id);
      const base = g.get(cur.id);
      const next = (o.getNeighbors(cur.id) || []).filter(n => !closed.has(n) && enterable(n)).sort(compareCellIds);
      for (const n of next) {
        const cost = base + stepCost(n), old = g.get(n);
        if (old === undefined || cost < old - ROUTE_COST_EPSILON) {
          g.set(n, cost); came.set(n, cur.id);
          heap.push({ id: n, f: cost + h(n), h: h(n) });
        }
      }
    }
    // No path under this strategy. A terrain-aware miss with a geometric path means "terrain is the reason"; otherwise the cells are simply not connected.
    if (model.terrainAware) {
      const geo = findHexRoute({ startCell: start, goalCell: goal, strategy: 'shortest', getNeighbors: o.getNeighbors, getTerrainRating: rating, isRouteableCell: o.isRouteableCell });
      return fail(geo.status === 'ok' ? 'unknown-terrain' : 'disconnected');
    }
    return fail('disconnected');

    function finish(cells, totalCost) {
      const stats = calculateRouteStats(cells, rating);
      return { status: 'ok', strategy: strategy, cells: cells, totalCost: totalCost, stats: stats, segmentKnown: cells.slice(1).map(id => isRating(rating(id))) };
    }
  }

  /** All three strategies for one A -> B: { fastest, shortest, encounters } (each a findHexRoute result). */
  function planRoutes(o) {
    const out = {};
    for (const s of STRATEGIES) out[s] = findHexRoute(Object.assign({}, o, { strategy: s }));
    return out;
  }

  /** Whether two ok routes are the same path (used to skip a pointless comparison). */
  function sameRoute(a, b) {
    return !!a && !!b && a.status === 'ok' && b.status === 'ok' && a.cells.length === b.cells.length && a.cells.every((c, i) => c === b.cells[i]);
  }

  /**
   * The route shown for a preferred strategy: that one when it exists, else Shortest when it exists (never a guessed terrain route), else the preferred
   * strategy's own failure. Pure so the view and the tests agree.
   */
  function effectiveStrategy(routes, preferred) {
    const want = STRATEGY_MODEL[preferred] ? preferred : DEFAULT_STRATEGY;
    if (routes && routes[want] && routes[want].status === 'ok') return want;
    if (routes && routes.shortest && routes.shortest.status === 'ok') return 'shortest';
    return want;
  }

  /** doc -> Map cellId -> Terrain Rating, from each placed tile's region. Cells without a generated tile are absent (unknown, never defaulted). */
  function buildTerrainIndex(doc) {
    const byBatch = new Map(((doc && doc.batches) || []).map(b => [b.id, b.terrain && b.terrain.value]));
    const out = new Map();
    for (const t of ((doc && doc.tiles) || [])) { const v = byBatch.get(t.batchId); if (isRating(v)) out.set(t.cell, v); }
    return out;
  }

  /**
   * The transient planner: null (inactive) -> 'select-start' -> 'select-end' -> 'result'. Never persisted, never in history.
   *   opts.plan(startCell, endCell) -> routes   (called on every pick, swap and recompute)   opts.onChange(state, event)
   * `state` is a frozen snapshot { status, startCell, endCell, strategy, routes } (or null).
   */
  function createRoutePlanner(opts) {
    const o = opts || {};
    let state = null, strategy = DEFAULT_STRATEGY;
    const make = (status, extra) => Object.freeze(Object.assign({ status: status, startCell: null, endCell: null, strategy: strategy, routes: null }, extra || {}));
    const notify = ev => { if (typeof o.onChange === 'function') o.onChange(state, ev); };
    const compute = (a, b) => (typeof o.plan === 'function' ? o.plan(a, b) : null);
    return {
      get state() { return state; },
      isActive() { return !!state; },
      /** Enter (or restart) start selection. The preferred strategy resets to Fastest. */
      start() { strategy = DEFAULT_STRATEGY; state = make('select-start'); notify('select-start'); return state; },
      /** The next valid cell click: A while selecting the start, B while selecting the destination. Ignored in the result. */
      pick(cellId) {
        if (!state || !Geo.parseCellId(cellId)) return null;
        if (state.status === 'select-start') { state = make('select-end', { startCell: cellId }); notify('select-end'); return state; }
        if (state.status === 'select-end') { state = make('result', { startCell: state.startCell, endCell: cellId, routes: compute(state.startCell, cellId) }); notify('result'); return state; }
        return null;
      },
      /** Changes the displayed strategy: A, B and the camera are untouched and nothing is recomputed. */
      setStrategy(s) {
        if (!state || state.status !== 'result' || !STRATEGY_MODEL[s] || s === strategy) return state;
        strategy = s; state = make('result', { startCell: state.startCell, endCell: state.endCell, routes: state.routes }); notify('strategy'); return state;
      },
      swap() {
        if (!state || state.status !== 'result') return null;
        state = make('result', { startCell: state.endCell, endCell: state.startCell, routes: compute(state.endCell, state.startCell) }); notify('swap'); return state;
      },
      /** Keep A, forget B and the routes; the next pick is the new destination. */
      chooseNewDestination() {
        if (!state || state.status === 'select-start') return state;
        state = make('select-end', { startCell: state.startCell }); notify('select-end'); return state;
      },
      /** Back to start selection (A, B and the routes are forgotten). */
      chooseNewStart() {
        if (!state) return state;
        state = make('select-start'); notify('select-start'); return state;
      },
      /** Recomputes the routes for the same A and B (after the map data changed); a no-op outside the result. */
      recompute() {
        if (!state || state.status !== 'result') return state;
        state = make('result', { startCell: state.startCell, endCell: state.endCell, routes: compute(state.startCell, state.endCell) }); notify('recompute'); return state;
      },
      close() { if (!state) return; state = null; notify('closed'); },
      dispose() { state = null; },
    };
  }

  return {
    STRATEGIES: STRATEGIES, DEFAULT_STRATEGY: DEFAULT_STRATEGY, ROUTE_COST_EPSILON: ROUTE_COST_EPSILON, MIN_ENCOUNTER_COST: MIN_ENCOUNTER_COST,
    encounterProbability: encounterProbability, encounterExpectation: encounterExpectation, terrainTravelCost: terrainTravelCost,
    hexDistance: hexDistance, compareCellIds: compareCellIds, calculateRouteStats: calculateRouteStats,
    findHexRoute: findHexRoute, planRoutes: planRoutes, sameRoute: sameRoute, effectiveStrategy: effectiveStrategy,
    buildTerrainIndex: buildTerrainIndex, createRoutePlanner: createRoutePlanner,
  };
});
