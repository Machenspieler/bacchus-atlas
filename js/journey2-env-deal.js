/* ============================================================
   Bacchus's Atlas — journey2-env-deal.js
   Pure, DOM-free dealer of catalog Environments to freshly placed hexes (PD-033). One rule: "least used first, random among equals".

     - dealEnvironments({ pool, used, count, random })
         pool    ids of the Environments the region's habitat offers (the existing biome adapter's list; order is irrelevant)
         used    { id: n } how many hexes of THIS region already carry each id (manual changes included)
         count   how many hexes are being placed now
         random  injected RNG () -> [0, 1) (defaults to Math.random)
       returns an array of `count` ids, one per new hex in the order asked for, or [] when the pool is empty.

   Every pick takes an Environment with the lowest running count and draws among the tied ones, then counts it. So the result is as even
   as possible: fewer hexes than Environments never repeats one; equal numbers use each exactly once; more hexes than Environments uses
   every Environment floor(N/K) or ceil(N/K) times. Counting what already stands makes one-by-one placement behave like a batch.
   Ids outside the pool (an unavailable or manually kept id) are ignored — they are not candidates and do not shift the others.
   Nothing here is stored: the dealt ids travel in the `place` command and live on the tiles.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Journey2EnvDeal = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function dealEnvironments(opts) {
    const o = opts || {};
    const pool = Array.from(new Set(Array.isArray(o.pool) ? o.pool.filter(id => typeof id === 'string' && id) : []));
    const count = Number.isInteger(o.count) && o.count > 0 ? o.count : 0;
    if (!pool.length || !count) return [];
    const random = typeof o.random === 'function' ? o.random : Math.random;
    const used = o.used || {};
    const running = new Map(pool.map(id => [id, Number.isInteger(used[id]) && used[id] > 0 ? used[id] : 0]));
    const out = [];
    for (let i = 0; i < count; i++) {
      let low = Infinity;
      for (const n of running.values()) if (n < low) low = n;
      const tied = pool.filter(id => running.get(id) === low);
      const r = random();
      const pick = tied[Math.min(tied.length - 1, Math.max(0, Math.floor((Number.isFinite(r) ? r : 0) * tied.length)))];
      running.set(pick, low + 1);
      out.push(pick);
    }
    return out;
  }

  return { dealEnvironments: dealEnvironments };
});
