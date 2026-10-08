'use strict';
// Route Planner (PD-031): pure A* engine, cost functions, statistics, determinism, planner state machine.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../js/journey2-route.js');
const Geo = require('../js/journey2-geometry.js');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const DELTAS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

/** A hexagonal test grid of the given radius around 0,0; `blocked` ids are not routeable; `terrain` maps id -> rating. */
function grid(radius, terrain, blocked) {
  const inside = id => { const c = Geo.parseCellId(id); return !!c && Math.abs(c.q) <= radius && Math.abs(c.r) <= radius && Math.abs(c.q + c.r) <= radius; };
  const block = new Set(blocked || []);
  const isRouteableCell = id => inside(id) && !block.has(id);
  const getNeighbors = id => { const c = Geo.parseCellId(id); return DELTAS.map(d => Geo.cellId(c.q + d[0], c.r + d[1])).filter(isRouteableCell); };
  const getTerrainRating = id => (terrain && terrain[id]) || null;
  return { isRouteableCell, getNeighbors, getTerrainRating };
}
const route = (g, a, b, strategy) => R.findHexRoute(Object.assign({ startCell: a, goalCell: b, strategy }, g));
const fill = (ids, v) => Object.fromEntries(ids.map(i => [i, v]));

test('encounter cost: 1 - (5/6)^rating for Terrain 1-4, centralized', () => {
  const want = { 1: 1 / 6, 2: 11 / 36, 3: 91 / 216, 4: 671 / 1296 };
  for (const r of [1, 2, 3, 4]) { assert.ok(Math.abs(R.encounterExpectation(r) - want[r]) < 1e-12); assert.equal(R.encounterExpectation(r), R.encounterProbability(r)); }
  assert.ok(Math.abs(R.MIN_ENCOUNTER_COST - R.encounterExpectation(1)) < 1e-12);
  assert.equal(R.terrainTravelCost(3), 3);
  assert.match(strip(read('js/journey2-route.js')).replace(/function encounterProbability[^\n]*/, ''), /^(?![\s\S]*Math\.pow\(5 \/ 6)/, 'the formula lives in one function');
});

test('hexDistance is the axial distance', () => {
  assert.equal(R.hexDistance('0,0', '0,0'), 0);
  assert.equal(R.hexDistance('0,0', '1,0'), 1);
  assert.equal(R.hexDistance('0,0', '1,1'), 2);   // (1,1) is two edge steps away, not one
  assert.equal(R.hexDistance({ q: -2, r: 3 }, { q: 3, r: -1 }), 5);
});

test('basic paths: adjacent, straight line, same cell, disconnected, invalid endpoint', () => {
  const g = grid(4, fill(['0,0', '1,0', '2,0', '3,0'], 1));
  const adj = route(g, '0,0', '1,0', 'shortest');
  assert.deepEqual(adj.cells, ['0,0', '1,0']); assert.equal(adj.stats.hexes, 1);
  assert.deepEqual(route(g, '0,0', '3,0', 'fastest').cells, ['0,0', '1,0', '2,0', '3,0']);
  const same = route(g, '2,0', '2,0', 'fastest');
  assert.equal(same.status, 'ok'); assert.deepEqual(same.cells, ['2,0']);
  assert.deepEqual([same.stats.hexes, same.stats.travelDays, same.stats.expectedEncounters], [0, 0, 0]);
  // a wall of blocked cells splits the grid
  const wall = []; for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) if (Math.abs(q + r) <= 4 && r === 0) wall.push(Geo.cellId(q, r));
  const split = grid(4, null, wall);
  assert.deepEqual(route(split, '0,-2', '0,2', 'shortest'), { status: 'no-route', strategy: 'shortest', reason: 'disconnected' });
  assert.equal(route(grid(2), '0,0', '9,9', 'shortest').reason, 'invalid-endpoint');
  assert.equal(route(grid(2, null, ['1,0']), '1,0', '0,0', 'shortest').reason, 'invalid-endpoint');
});

test('only the six edge neighbours are moves (corner contact is not adjacency)', () => {
  const g = grid(3);
  const n = g.getNeighbors('0,0');
  assert.equal(n.length, 6);
  for (const id of n) assert.equal(R.hexDistance('0,0', id), 1);
  assert.ok(!n.includes('1,1') && !n.includes('-1,-1'), 'the corner-like cells are two steps away');
  assert.equal(g.getNeighbors('3,0').length, 3, 'the grid boundary is respected');
  assert.equal(route(g, '0,0', '1,1', 'shortest').stats.hexes, 2);
});

/** Reference: relaxation until nothing improves (no priority queue, no heuristic) -> minimum cost per cell from `from` under `cost(rating)`. */
function reference(g, from, cost) {
  const dist = new Map([[from, 0]]);
  for (let changed = true; changed;) {
    changed = false;
    for (const [id, d] of [...dist]) for (const n of g.getNeighbors(id)) {
      const r = g.getTerrainRating(n); if (!r) continue;
      const c = d + cost(r); if (!dist.has(n) || c < dist.get(n) - 1e-12) { dist.set(n, c); changed = true; }
    }
  }
  return dist;
}
function randomGrid(radius, seed) {
  let x = seed; const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const t = {};
  for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) if (Math.abs(q + r) <= radius) t[Geo.cellId(q, r)] = 1 + Math.floor(rnd() * 4);
  return { g: grid(radius, t), t };
}

test('Fastest takes a longer, lighter route; Shortest takes the heavy direct one', () => {
  // direct row 1,0..3,0 is Terrain 4; the detour along r = -1 is Terrain 1; 4,0 (the goal) is Terrain 1
  const t = Object.assign(fill(['1,0', '2,0', '3,0'], 4), fill(['4,0', '1,-1', '2,-1', '3,-1', '4,-1'], 1));
  const g = grid(6, t);
  const fast = route(g, '0,0', '4,0', 'fastest'), short = route(g, '0,0', '4,0', 'shortest');
  assert.deepEqual(fast.cells, ['0,0', '1,-1', '2,-1', '3,-1', '4,-1', '4,0']);
  assert.deepEqual([fast.stats.hexes, fast.stats.travelDays], [5, 5]);
  assert.equal(fast.totalCost, 5);
  assert.deepEqual(short.cells, ['0,0', '1,0', '2,0', '3,0', '4,0']);
  assert.deepEqual([short.stats.hexes, short.stats.travelDays], [4, 13]);
});

test('Fastest is optimal on random mixed-terrain grids (checked against a reference)', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const { g } = randomGrid(3, seed);
    const dist = reference(g, '-3,0', R.terrainTravelCost);
    for (const goal of ['3,0', '0,3', '0,-3', '2,1', '-1,-1']) assert.equal(route(g, '-3,0', goal, 'fastest').totalCost, dist.get(goal), 'seed ' + seed + ' -> ' + goal);
  }
});

test('Fewer encounters is optimal for expected triggers on random grids (checked against a reference)', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const { g } = randomGrid(3, seed);
    const dist = reference(g, '-3,0', R.encounterExpectation);
    for (const goal of ['3,0', '0,3', '0,-3', '2,1', '-1,-1']) {
      const r = route(g, '-3,0', goal, 'encounters');
      assert.ok(Math.abs(r.totalCost - dist.get(goal)) < 1e-9, 'seed ' + seed + ' -> ' + goal);
      assert.ok(Math.abs(r.stats.expectedEncounters - r.totalCost) < 1e-9, 'the stats agree with the optimized cost');
    }
  }
});

test('Fastest and Fewer encounters are different optimizations: a map exists where each wins its own metric', () => {
  assert.ok(R.encounterExpectation(4) < 4 * R.encounterExpectation(1), 'one Terrain 4 hex triggers fewer encounters than four Terrain 1 hexes (same 4 days)');
  let found = null;
  for (let seed = 1; seed <= 300 && !found; seed++) {
    const { g } = randomGrid(4, seed);
    const f = route(g, '-4,0', '4,0', 'fastest'), n = route(g, '-4,0', '4,0', 'encounters');
    if (f.stats.travelDays < n.stats.travelDays && n.stats.expectedEncounters < f.stats.expectedEncounters - 1e-9) found = { f, n };
  }
  assert.ok(found, 'the two objectives disagree on some map');
  assert.notDeepEqual(found.f.cells, found.n.cells);
});

test('Shortest ignores terrain entirely', () => {
  const g = grid(4, fill(['1,0', '2,0', '3,0', '4,0'], 4));
  const s = route(g, '0,0', '4,0', 'shortest');
  assert.deepEqual([s.stats.hexes, s.stats.travelDays], [4, 16]);
  assert.equal(s.totalCost, 4);
});

test('unknown terrain: Fastest / Fewer encounters never enter it, Shortest may', () => {
  const t = fill(['0,0', '1,0', '3,0'], 1);                       // 2,0 has no generated terrain; the wall of unknowns blocks the corridor
  const blocked = []; for (const id of ['0,-1', '1,-1', '2,-1', '-1,1', '0,1', '1,1', '2,1', '3,-1', '3,1', '2,-2', '1,-2', '1,2', '0,2', '-1,2']) blocked.push(id);
  const g = grid(3, t, blocked);
  const s = route(g, '0,0', '3,0', 'shortest');
  assert.equal(s.status, 'ok'); assert.deepEqual(s.cells, ['0,0', '1,0', '2,0', '3,0']);
  assert.equal(s.stats.complete, false); assert.equal(s.stats.unknownHexes, 1); assert.equal(s.stats.travelDays, null); assert.equal(s.stats.expectedEncounters, null);
  assert.deepEqual(s.segmentKnown, [true, false, true]);
  for (const k of ['fastest', 'encounters']) assert.deepEqual(route(g, '0,0', '3,0', k), { status: 'no-route', strategy: k, reason: 'unknown-terrain' });
});

test('settlement hexes (rating 0: sanctuaries, Marrogate, Horizon) are known, free, and do not block terrain-aware routes', () => {
  const g = grid(3, fill(['1,0', '2,0'], 3));
  const withSettle = Object.assign({}, g, { getTerrainRating: id => (id === '0,0' || id === '3,0' ? 0 : g.getTerrainRating(id)), hasZeroCostCells: true });
  for (const k of ['fastest', 'encounters']) {
    const r = route(withSettle, '0,0', '3,0', k);
    assert.equal(r.status, 'ok', k); assert.equal(r.stats.complete, true);
    assert.equal(r.stats.terrainCounts[0], 1, 'the settlement destination is counted, not charged');
  }
  const f = route(withSettle, '0,0', '3,0', 'fastest');
  assert.equal(f.stats.travelDays, 6); assert.ok(Math.abs(f.stats.expectedEncounters - 2 * R.encounterExpectation(3)) < 1e-12);
  // a zero-cost hex can make a longer route cheaper: the heuristic must stay admissible (checked against the reference)
  const t = Object.assign(fill(['1,0', '2,0'], 4), { '1,-1': 0, '2,-1': 0, '3,-1': 0, '3,0': 1 });
  const h = Object.assign({}, grid(3, t), { getTerrainRating: id => (t[id] === undefined ? null : t[id]), hasZeroCostCells: true });
  assert.equal(route(h, '0,0', '3,0', 'fastest').totalCost, 1);
});

test('an unknown destination is unavailable for terrain-aware strategies but the start may lack terrain', () => {
  const g = grid(3, fill(['1,0', '2,0'], 2));                      // start 0,0 unknown: fine (entering costs nothing); destination 3,0 unknown: not allowed
  assert.equal(route(g, '0,0', '2,0', 'fastest').status, 'ok');
  assert.equal(route(g, '0,0', '3,0', 'fastest').reason, 'unknown-terrain');
  assert.equal(route(g, '0,0', '3,0', 'shortest').status, 'ok');
});

test('no route exists at all -> disconnected, even for terrain-aware strategies', () => {
  const ring = ['1,0', '1,-1', '0,-1', '-1,0', '-1,1', '0,1'];
  const g = grid(3, fill(['0,0', '2,0'], 1), ring);
  assert.equal(route(g, '0,0', '3,0', 'fastest').status, 'no-route');
  assert.equal(route(g, '0,0', '3,0', 'fastest').reason, 'disconnected');
});

test('heuristics never overestimate (admissible)', () => {
  const t = {}; let seed = 3; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) if (Math.abs(q + r) <= 4) t[Geo.cellId(q, r)] = 1 + Math.floor(rnd() * 4);
  const g = grid(4, t);
  for (const [a, b] of [['-4,0', '4,-4'], ['0,0', '3,1'], ['-3,3', '2,-1'], ['0,-4', '0,4']]) {
    const d = R.hexDistance(a, b);
    assert.ok(d * 1 <= route(g, a, b, 'fastest').totalCost + 1e-9);
    assert.equal(route(g, a, b, 'shortest').stats.hexes >= d, true);
    assert.equal(route(g, a, b, 'shortest').totalCost, route(g, a, b, 'shortest').stats.hexes);
    assert.ok(d * R.MIN_ENCOUNTER_COST <= route(g, a, b, 'encounters').totalCost + 1e-9);
  }
});

test('direction matters: the cost belongs to the hex entered', () => {
  const g = grid(2, { '0,0': 1, '1,0': 4 });
  const ab = route(g, '0,0', '1,0', 'fastest'), ba = route(g, '1,0', '0,0', 'fastest');
  assert.equal(ab.stats.travelDays, 4); assert.equal(ba.stats.travelDays, 1);
  assert.notEqual(ab.stats.expectedEncounters, ba.stats.expectedEncounters);
});

test('deterministic: same input, same path; equal-cost alternatives break ties canonically', () => {
  const g = grid(3, fill(Object.keys(Object.fromEntries([...Array(7)].flatMap((_, i) => [...Array(7)].map((__, j) => [Geo.cellId(i - 3, j - 3), 1])))), 1));
  const first = route(g, '-3,0', '3,0', 'fastest').cells;
  for (let i = 0; i < 5; i++) assert.deepEqual(route(g, '-3,0', '3,0', 'fastest').cells, first);
  // neighbour enumeration order must not matter
  const rev = Object.assign({}, g, { getNeighbors: id => g.getNeighbors(id).slice().reverse() });
  assert.deepEqual(route(rev, '-3,0', '3,0', 'fastest').cells, first);
  for (const k of ['shortest', 'encounters']) assert.deepEqual(route(rev, '-3,0', '3,0', k).cells, route(g, '-3,0', '3,0', k).cells);
});

test('statistics: start excluded, destination included, terrain breakdown, zero-step', () => {
  const st = R.calculateRouteStats(['0,0', '1,0', '2,0', '3,0'], id => ({ '0,0': 4, '1,0': 1, '2,0': 1, '3,0': 3 })[id]);
  assert.equal(st.hexes, 3); assert.equal(st.travelDays, 5); assert.deepEqual(st.terrainCounts, { 0: 0, 1: 2, 2: 0, 3: 1, 4: 0 });
  assert.ok(Math.abs(st.expectedEncounters - (2 * (1 / 6) + 91 / 216)) < 1e-12);
  const part = R.calculateRouteStats(['0,0', '1,0', '2,0'], id => ({ '1,0': 2 })[id]);
  assert.equal(part.complete, false); assert.equal(part.travelDays, null); assert.equal(part.expectedEncounters, null); assert.equal(part.knownDays, 2);
  assert.equal(part.knownHexes, 1); assert.equal(part.unknownHexes, 1);
  const zero = R.calculateRouteStats(['5,5'], () => null);
  assert.deepEqual([zero.hexes, zero.travelDays, zero.expectedEncounters], [0, 0, 0]);
});

test('buildTerrainIndex reads the region terrain of each placed tile only', () => {
  const doc = { batches: [{ id: 'a', terrain: { value: 3 } }, { id: 'b', terrain: { value: 1 } }], tiles: [{ id: 't1', batchId: 'a', cell: '0,0' }, { id: 't2', batchId: 'b', cell: '1,0' }, { id: 't3', batchId: 'zzz', cell: '2,0' }] };
  const idx = R.buildTerrainIndex(doc);
  assert.equal(idx.get('0,0'), 3); assert.equal(idx.get('1,0'), 1); assert.equal(idx.has('2,0'), false);
  assert.equal(R.buildTerrainIndex(null).size, 0);
});

test('planRoutes + effectiveStrategy: Fastest by default, Shortest when a terrain strategy is unavailable', () => {
  const g = grid(2, null);
  const routes = R.planRoutes(Object.assign({ startCell: '0,0', goalCell: '2,0' }, g));
  assert.equal(routes.fastest.status, 'no-route'); assert.equal(routes.shortest.status, 'ok');
  assert.equal(R.effectiveStrategy(routes, 'fastest'), 'shortest');
  assert.equal(R.effectiveStrategy(routes, 'encounters'), 'shortest');
  const known = R.planRoutes(Object.assign({ startCell: '0,0', goalCell: '2,0' }, grid(2, fill(['1,0', '2,0'], 1))));
  assert.equal(R.effectiveStrategy(known, undefined), 'fastest');
  assert.equal(R.effectiveStrategy(known, 'encounters'), 'encounters');
  assert.equal(R.sameRoute(known.fastest, known.shortest), true);
});

test('planner state machine: select A, select B, switch strategy, swap, new destination, close — all transient', () => {
  const log = []; let plans = 0;
  const g = grid(3, fill(['1,0', '2,0', '0,0'], 1));
  const p = R.createRoutePlanner({ plan: (a, b) => { plans++; return R.planRoutes(Object.assign({ startCell: a, goalCell: b }, g)); }, onChange: (s, ev) => log.push(ev) });
  assert.equal(p.isActive(), false);
  p.start(); assert.equal(p.state.status, 'select-start'); assert.equal(p.state.strategy, 'fastest');
  assert.equal(p.pick('nope'), null);
  p.pick('0,0'); assert.equal(p.state.status, 'select-end'); assert.equal(p.state.startCell, '0,0');
  p.pick('2,0'); assert.equal(p.state.status, 'result'); assert.equal(p.state.routes.fastest.stats.travelDays, 2);
  assert.equal(p.pick('1,0'), null, 'a result ignores further picks');
  const before = plans;
  p.setStrategy('shortest'); assert.equal(p.state.strategy, 'shortest'); assert.equal(plans, before, 'switching a strategy recomputes nothing');
  assert.deepEqual([p.state.startCell, p.state.endCell], ['0,0', '2,0']);
  p.swap(); assert.deepEqual([p.state.startCell, p.state.endCell], ['2,0', '0,0']); assert.equal(p.state.strategy, 'shortest'); assert.equal(plans, before + 1);
  p.chooseNewDestination(); assert.equal(p.state.status, 'select-end'); assert.equal(p.state.startCell, '2,0'); assert.equal(p.state.endCell, null); assert.equal(p.state.routes, null);
  p.pick('1,0'); assert.equal(p.state.status, 'result'); assert.equal(p.state.endCell, '1,0');
  p.chooseNewStart(); assert.equal(p.state.status, 'select-start'); assert.equal(p.state.startCell, null);
  p.close(); assert.equal(p.isActive(), false); assert.equal(p.state, null);
  assert.equal(p.recompute(), null);
  p.start(); assert.equal(p.state.strategy, 'fastest', 'a new session starts on Fastest');
  assert.ok(log.includes('closed') && log.includes('swap') && log.includes('strategy'));
  assert.ok(Object.isFrozen(p.state));
});

test('the route engine is pure: no DOM, storage, strings or player data', () => {
  const src = strip(read('js/journey2-route.js'));
  assert.doesNotMatch(src, /localStorage|sessionStorage|SafeStorage|document\.|window\.|innerHTML|revealedCells|playerVisibility|soulEchoes|environmentId|blighted|overtaken/);
  assert.doesNotMatch(src, /\b(Safest|safest|Least dangerous|Low-risk)\b/);
});

/* ---------------- wiring, localization and player-data isolation ---------------- */

const i18n = JSON.parse(read('data/i18n.json'));
const view = read('js/journey2-view.js').replace(/\r\n/g, '\n');
const routeStart = view.indexOf('Route Planner (PD-031): GM-only.');
const routeSection = view.slice(routeStart, view.indexOf('Sanctuaries (PD-023)', routeStart));

test('script wiring: the route module loads after geometry and before the view, and ships in the build list', () => {
  const html = read('index.html');
  assert.match(html, /<script src="js\/journey2-route\.js" data-cache-version="ui"><\/script>/);
  assert.ok(html.indexOf('journey2-route.js') > html.indexOf('journey2-geometry.js') && html.indexOf('journey2-route.js') < html.indexOf('journey2-view.js'));
  assert.match(read('scripts/check-journey2-build.js'), /'js\/journey2-route\.js'/);
});

test('every route string exists in English and Russian with matching placeholders and plural pairs', () => {
  const en = i18n.en, ru = i18n.ru;
  const keys = Object.keys(en).filter(k => k.startsWith('journey2_route_'));
  assert.ok(keys.length >= 40, 'found ' + keys.length);
  const ph = s => (s.match(/\{[a-z]+\}/g) || []).sort().join(',');
  for (const k of keys) {
    assert.ok(typeof ru[k] === 'string' && ru[k].length, 'missing RU ' + k);
    assert.equal(ph(ru[k]), ph(en[k]), 'placeholders of ' + k);
  }
  for (const k of Object.keys(ru).filter(k => k.startsWith('journey2_route_'))) assert.ok(en[k], 'RU-only key ' + k);
  for (const base of ['journey2_route_terrain_row', 'journey2_route_unknown']) assert.ok(en[base + '_n'] && en[base + '_one'] && ru[base + '_n'] && ru[base + '_one']);
});

test('encounter wording: never "safest" / "least dangerous", and the help says encounters are not necessarily dangerous', () => {
  for (const lang of ['en', 'ru']) {
    const all = Object.keys(i18n[lang]).filter(k => k.startsWith('journey2_route_')).map(k => i18n[lang][k]).join('\n');
    assert.doesNotMatch(all, /safest|least dangerous|low-risk|safe route|безопасн/i);
  }
  assert.match(i18n.en.journey2_route_encounters_help, /not necessarily dangerous/);
  assert.match(i18n.en.journey2_route_encounters_help, /expected encounter triggers/);
  assert.match(i18n.en.journey2_route_encounters, /^Fewer encounters$/);
  assert.equal(i18n.en.journey2_route_fastest, 'Fastest'); assert.equal(i18n.en.journey2_route_shortest, 'Shortest');
});

test('the planner is GM-only and transient: no document write, history, storage, fog or Echo access in its view code', () => {
  assert.ok(routeSection.length > 2000, 'found the route section');
  assert.doesNotMatch(routeSection, /\bdispatch\(|historyCommit|Model\.apply|SafeStorage|localStorage|persist\(|setCellsRevealed|revealedCells|revealedSanctuaryNameAnchorIds|soulEchoes|setSoulEcho|environmentId|setTileEnvironment/);
  for (const f of ['js/journey2-projection.js', 'js/journey2-print.js', 'js/journey2-store.js', 'js/journey2-model.js']) assert.doesNotMatch(strip(read(f)), /Journey2Route|journey2-route|routePlanner/, f + ' never learns about routes');
});

test('map layers are pointer-transparent, hidden in Player Preview and the print is not touched', () => {
  assert.match(view, /<g data-j2-g="routeline" pointer-events="none" aria-hidden="true"><\/g>/);
  assert.match(view, /<g data-j2-g="routemark" pointer-events="none" aria-hidden="true"><\/g>/);
  assert.match(view, /if \(!st \|\| previewMode \|\| !data\) \{ if \(routeDrawn\.line\)/, 'the layers are emptied in Player Preview');
  assert.match(view, /function routeView\(\) \{[\s\S]{0,200}previewMode/, 'no panel in Player Preview');
  const css = read('css/journey2.css');
  assert.match(css, /@media print \{ \.j2-route, \.j2-route-chip \{ display: none !important; \} \}/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.j2-overlay \.j2-route-line \{ animation: none; \}/);
});

test('tool exclusivity and selection priority are wired', () => {
  assert.match(view, /function startLocate\(\) \{[\s\S]{0,400}exitRoute\(\{ quiet: true \}\)/, 'Locate closes the planner');
  assert.match(view, /function startRoute\(\) \{[\s\S]{0,600}setFogTool\(null[\s\S]{0,120}exitLocate\(\{ quiet: true \}\)/, 'the planner cancels Locate and the fog tools');
  assert.match(view, /exitLocate\(\{ quiet: true \}\); exitRoute\(\{ quiet: true \}\);\s+\/\/ the map tools are mutually exclusive/, 'a fog tool closes the planner');
  assert.match(view, /function enterPreview\(\) \{[\s\S]{0,300}exitRoute\(\{ quiet: true \}\)/, 'Player Preview closes the planner');
  assert.match(view, /!locateSession\.isActive\(\) && !routeSelecting\(\) && !sanctuaryAtScreen/, 'no tile drag while choosing A or B');
  assert.match(view, /if \(routeSelecting\(\)\) \{ routeEscape\(\);/, 'Escape while choosing');
  assert.match(view, /function handleMapClick\(sx, sy\) \{[\s\S]{0,200}if \(routeSelecting\(\)\) \{[\s\S]{0,400}routeCellAt\(sx, sy\)/, 'a click selects the underlying hex before any overlay opens');
  assert.match(view, /syncLocate\(\);\n      syncRoute\(\);/, 'an open result is recomputed after Undo / Redo / edits and never reopened');
});

test('documentation: PD-031 and the architecture section exist', () => {
  const pd = read('docs/product-decisions.md'), arch = read('docs/architecture.md');
  assert.match(pd, /PD-031/); assert.match(pd, /Route Planner/); assert.match(pd, /Fewer encounters/);
  assert.match(arch, /Route Planner/); assert.match(arch, /journey2-route\.js/); assert.match(arch, /admissible/);
});


test('the Fewer encounters tab is hidden when it is exactly the Fastest route', () => {
  assert.ok(view.includes("function routeEncountersRedundant(routes) { return Route.sameRoute(routes.fastest, routes.encounters); }"));
  assert.ok(view.includes("b.hidden = s === 'encounters' && routeEncountersRedundant(routes);"));
  assert.ok(view.includes("if (eff === 'encounters' && routeEncountersRedundant(st.routes)) eff = 'fastest';"));
  assert.match(read('css/journey2.css'), /\.j2-route-tab\[hidden\] \{ display: none; \}/);
});
