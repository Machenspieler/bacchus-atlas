/* ============================================================
   Bacchus's Atlas — journey2-shadow-marks.js
   Pure, DOM-free planner of the Shadowblight X's that "Locate Soul Echoes" sets in motion (PD-041): the GM picks the party's hex, and each "+" moves
   the nearest block of X's one hex closer to it. The planner never touches a document: it reads one (through the model's derived shadow-mark helpers)
   and returns the frames of a whole session, each frame being the canonical { added, suppressed } list pair that the `setShadowMarks` command stores.

     - hexDistance      axial hex distance
     - createSeekerPlan { doc, ctx, origin, maxSteps } -> null | { origin, maxStep, frames: [{ added, suppressed }], movers }
                        frames[0] is the starting state, frames[k] the state after k "+" presses; `maxStep` is the last step that still changes something
                        (so "+" is unavailable once everything has settled), never above `maxSteps` (20). `settled` says why "+" ended:
                        'arrived' (an X stands next to / on the origin), 'blocked' (none can get closer) or 'limit' (the 20-step cap).

   Rules (all deterministic — no RNG, so "-" is the exact inverse of "+" and a redo can never differ):
     - a BLOCK is an edge-connected group of X cells, or an edge-connected group of fully overtaken ("skull") cells that still hold their one X; the
       two kinds never merge; the block(s) at the minimum hex distance from the origin move, ALL blocks tied at that distance, the others stand still;
     - every X steps onto a free neighbouring hex that is strictly closer to the origin by path (a breadth-first field from the origin over the hexes an
       X may enter: valid, not decorative, not a printed sanctuary / Marrogate / Horizon hex, not a skull tile; water is NOT an obstacle yet); with no
       such hex it first waits for the others, then slides to a free hex at the SAME distance when that hex has a free way closer (never straight back to
   where it came from); otherwise it stays; a hex never holds two X's; nearer X's move first, ties by cell id;
     - a skull releases its X exactly once (the skull stays; the cell is then `suppressed`), the released X walks like any other.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./journey2-geometry.js'), require('./journey2-model.js'));
  else root.Journey2ShadowMarks = factory(root.Journey2Geometry, root.Journey2Model);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Geo, Model) {
  'use strict';

  const MAX_STEPS = 20;
  const D = Geo.NEIGHBOR_DELTAS;

  /** Axial hex distance between two { q, r }. */
  function hexDistance(a, b) {
    const dq = a.q - b.q, dr = a.r - b.r;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
  }

  const neighborCells = c => D.map(d => ({ q: c.q + d.dq, r: c.r + d.dr, id: Geo.cellId(c.q + d.dq, c.r + d.dr) }));

  /** Edge-connected groups of a cell-id set, each as an array of ids. */
  function componentsOf(set) {
    const seen = new Set(), out = [];
    for (const start of Array.from(set).sort(Model.compareCellKeys)) {
      if (seen.has(start)) continue;
      const comp = [], stack = [start];
      seen.add(start);
      while (stack.length) {
        const id = stack.pop(), c = Geo.parseCellId(id);
        comp.push(id);
        for (const nb of neighborCells(c)) if (set.has(nb.id) && !seen.has(nb.id)) { seen.add(nb.id); stack.push(nb.id); }
      }
      out.push(comp);
    }
    return out;
  }

  /**
   * Plans one Locate session. `origin` is the party's cell id. Returns null when the map holds no X and no unreleased skull at all (then nothing is
   * offered); otherwise the frames described above (maxStep may be 0: the nearest block cannot get any closer).
   */
  function createSeekerPlan(o) {
    const doc = o && o.doc, ctx = o && o.ctx, originId = o && o.origin, maxSteps = o && Number.isInteger(o.maxSteps) ? o.maxSteps : MAX_STEPS;
    const origin = Geo.parseCellId(originId);
    if (!doc || !ctx || !origin) return null;
    const base = Model.shadowBase(doc), xs = Model.getShadowXSet(doc), pending = Model.getPendingSkullSet(doc);
    if (!xs.size && !pending.size) return null;

    const passable = id => {
      if (base.skull.has(id) || ctx.sanctuaryCells.has(id)) return false;
      const c = Geo.parseCellId(id);
      return !!c && ctx.policy(c.q, c.r).ok;
    };

    // path distance from the origin over the hexes an X may enter; the origin itself seeds the field even when it is not enterable
    const field = new Map([[originId, 0]]);
    for (let queue = [originId], i = 0; i < queue.length; i++) {
      const id = queue[i], d = field.get(id);
      for (const nb of neighborCells(Geo.parseCellId(id))) if (!field.has(nb.id) && passable(nb.id)) { field.set(nb.id, d + 1); queue.push(nb.id); }
    }
    const ownDist = id => {
      if (field.has(id)) return field.get(id);
      let best = Infinity;
      for (const nb of neighborCells(Geo.parseCellId(id))) if (field.has(nb.id)) best = Math.min(best, field.get(nb.id) + 1);
      return best;                                                  // a mark standing on a hex it could not enter (legacy data) still has a way out
    };

    // blocks, nearest first: the minimum hex distance wins, every block tied at it moves
    const blocks = componentsOf(xs).map(cells => ({ kind: 'x', cells: cells })).concat(componentsOf(pending).map(cells => ({ kind: 'skull', cells: cells })));
    for (const b of blocks) b.distance = Math.min.apply(null, b.cells.map(id => hexDistance(Geo.parseCellId(id), origin)));
    const nearest = Math.min.apply(null, blocks.map(b => b.distance));
    const moving = blocks.filter(b => b.distance === nearest);
    const movers = [];
    for (const b of moving) for (const id of b.cells) movers.push({ pos: id, virtual: b.kind === 'skull' });
    const movingCells = new Set(movers.filter(m => !m.virtual).map(m => m.pos));
    const stillX = Array.from(xs).filter(id => !movingCells.has(id));
    const stillSkulls = Array.from(pending).filter(id => !movers.some(m => m.virtual && m.pos === id));

    const frameOf = state => {
      const finalX = new Set(stillX.concat(state.filter(m => !m.virtual).map(m => m.pos)));
      const keptSkulls = new Set(stillSkulls.concat(state.filter(m => m.virtual).map(m => m.pos)));
      const added = Array.from(finalX).filter(id => !base.x.has(id));
      const suppressed = Array.from(base.x).filter(id => !finalX.has(id)).concat(Array.from(base.skull).filter(id => !keptSkulls.has(id)));
      return Model.normalizeShadowMarks(doc, added, suppressed);
    };

    // a free hex an X standing at path distance `d` could step closer onto (nearest field value first, ties by cell id), or null
    const closerFree = (pos, d, occupied) => {
      let pick = null;
      for (const nb of neighborCells(Geo.parseCellId(pos))) {
        if (!passable(nb.id) || occupied.has(nb.id) || !field.has(nb.id) || field.get(nb.id) >= d) continue;
        if (!pick || field.get(nb.id) < field.get(pick) || (field.get(nb.id) === field.get(pick) && Model.compareCellKeys(nb.id, pick) < 0)) pick = nb.id;
      }
      return pick;
    };

    let state = movers.map(m => ({ pos: m.pos, virtual: m.virtual, last: null }));
    const frames = [frameOf(state)];
    let maxStep = 0;
    for (let step = 1; step <= maxSteps; step++) {
      const occupied = new Set(stillX.concat(state.filter(m => !m.virtual).map(m => m.pos)));
      const order = state.map((m, i) => ({ m: m, i: i, d: ownDist(m.pos) })).sort((a, b) => a.d - b.d || Model.compareCellKeys(a.m.pos, b.m.pos));
      const next = state.map(m => ({ pos: m.pos, virtual: m.virtual, last: m.last }));
      const go = (cur, to) => { if (!cur.virtual) occupied.delete(cur.pos); occupied.add(to); cur.last = cur.pos; cur.pos = to; cur.virtual = false; };
      const stuck = [];
      let moved = false;
      for (const e of order) {                                      // first pass: every X that can steps strictly closer
        const cur = next[e.i];
        if (!isFinite(e.d) || e.d === 0) continue;
        const pick = closerFree(cur.pos, e.d, occupied);
        if (pick) { go(cur, pick); moved = true; } else stuck.push(e);
      }
      for (const e of stuck) {                                      // second pass: a blocked X slides to a free hex at the same distance, but only when that opens a way closer
        const cur = next[e.i];
        let side = null;
        for (const nb of neighborCells(Geo.parseCellId(cur.pos))) {
          if (nb.id === cur.last || !passable(nb.id) || occupied.has(nb.id) || field.get(nb.id) !== e.d || !closerFree(nb.id, e.d, occupied)) continue;
          if (!side || Model.compareCellKeys(nb.id, side) < 0) side = nb.id;
        }
        if (side) { go(cur, side); moved = true; }
      }
      if (!moved) break;
      state = next;
      frames.push(frameOf(state));
      maxStep = step;
    }
    // why "+" ended: the Shadowblight is next to (or on) the party's hex, or its way is shut, or the 20-step cap was hit
    const arrived = state.some(m => ownDist(m.pos) <= 1);
    const settled = arrived ? 'arrived' : maxStep >= maxSteps ? 'limit' : 'blocked';
    return { origin: originId, maxStep: maxStep, frames: frames, movers: movers.length, nearestDistance: nearest, settled: settled };
  }

  return { MAX_STEPS: MAX_STEPS, hexDistance: hexDistance, componentsOf: componentsOf, createSeekerPlan: createSeekerPlan };
});
