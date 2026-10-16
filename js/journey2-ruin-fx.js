/* ============================================================
   Bacchus's Atlas — journey2-ruin-fx.js
   Destroyed-sanctuary VFX, second technique (PROTOTYPE, PD-070): a procedurally rendered smoke plume and fire on two small Canvas 2D
   textures laid over the unchanged map. V1 stacked animated SVG blobs, which can only ever read as separate translucent shapes; this renders a
   DENSITY FIELD per pixel instead — domain-warped fractal noise, advected upward and sideways with time, shaped by a widening, drifting plume
   envelope — so the structure continuously merges, tears and curls and there is no particle boundary to see.

   Pure core (no DOM): `bakeNoise`, `renderSmoke`, `renderFire` fill an RGBA buffer for a given time. `attach` is the only DOM part: one shared
   throttled rAF loop for every instance, culled off-screen, stopped when no canvas is left, a single still frame under reduced motion.
   Coordinates are icon-centred map units (the same as `ruinMarkup`), y grows downward, the castle sits around (0,0).
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Journey2RuinFx = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const G = typeof globalThis !== 'undefined' ? globalThis : {};

  /** Texture regions in icon units: the plume rises up and to the right (wind); the fire is a small bed inside the castle. `ppu` = canvas pixels per unit. */
  const SMOKE = Object.freeze({ x0: -38, y0: -86, w: 100, h: 112, ppu: 2 });
  const FIRE = Object.freeze({ x0: -26, y0: -20, w: 52, h: 46, ppu: 4 });
  const SRC_Y = 0;            // the line where smoke leaves the roofs
  const PLUME_H = 66;          // height over which the plume thins out completely
  const DRIFT = 24;            // wind: how far right the plume centre has moved at the top
  const RISE = 6.5;            // units per second the density pattern climbs
  const WIND = 1.6;            // units per second the pattern slides right

  /** Smoke sources [x, width, strength]; they start apart (separate chimneys of the ruin) and the widening envelope merges them. */
  const SOURCES = [[-10, 6, 0.9], [3, 7, 1], [12, 5.5, 0.9]];
  /** Fire beds [x, base y, height, half-width, phase]; irregular heights, never a row. */
  const FIRES = [[-12.5, 11.5, 6.5, 3.6, 0.3], [3, 13.5, 8.5, 4.6, 1.7], [13, 10, 5.5, 3, 3.1], [-4, 4, 4.2, 2.6, 4.6], [8, -2, 3.6, 2.2, 2.2]];
  /** Small localized combustion points (windows) [x, y, radius]. */
  const HOT = [[-9, 1, 1.9], [0, -4, 1.6], [9, 2, 1.8], [-14, 8, 1.5], [14, 4, 1.4], [4, 9, 1.7]];
  const EMBERS = [[-9, 2, 36, 9, 6.8, 0.1], [6, -4, 44, 16, 9.1, 0.55], [13, 5, 32, 6, 7.7, 0.3], [-3, 6, 40, -6, 11.3, 0.8], [1, -2, 38, 12, 8.3, 0.0]];

  const TS = 256;
  const TMASK = TS - 1;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** A tileable fractal value-noise texture, TS x TS floats in 0..1 (lattices 8/16/32/64, halving amplitude). Deterministic per seed. */
  function bakeNoise(seed) {
    const out = new Float32Array(TS * TS), rng = mulberry32(seed | 0);
    let norm = 0;
    for (let o = 0; o < 4; o++) {
      const L = 8 << o, amp = Math.pow(0.55, o), cell = TS / L, lat = new Float32Array(L * L);
      for (let i = 0; i < lat.length; i++) lat[i] = rng();
      norm += amp;
      for (let y = 0; y < TS; y++) {
        const gy = y / cell, y0 = Math.floor(gy), fy = gy - y0, sy = fy * fy * (3 - 2 * fy), ya = (y0 % L) * L, yb = ((y0 + 1) % L) * L;
        for (let x = 0; x < TS; x++) {
          const gx = x / cell, x0 = Math.floor(gx), fx = gx - x0, sx = fx * fx * (3 - 2 * fx), xa = x0 % L, xb = (x0 + 1) % L;
          const a = lat[ya + xa], b = lat[ya + xb], c = lat[yb + xa], d = lat[yb + xb];
          out[y * TS + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
        }
      }
    }
    for (let i = 0; i < out.length; i++) out[i] /= norm;
    return out;
  }

  let sharedNoise = null;
  function noise() { return sharedNoise || (sharedNoise = bakeNoise(20261016)); }

  function sampler(T) {
    return function (u, v) {
      const x = Math.floor(u), y = Math.floor(v), fx = u - x, fy = v - y;
      const x0 = x & TMASK, x1 = (x + 1) & TMASK, y0 = (y & TMASK) * TS, y1 = ((y + 1) & TMASK) * TS;
      const a = T[y0 + x0], b = T[y0 + x1], c = T[y1 + x0], d = T[y1 + x1];
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
  }
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

  /** Slow, never-synchronised brightness of the fire at a time (a few incommensurate waves + noise); 0.55..1.25. Shared by the fire pass and the smoke's underlight. */
  function fireLevel(time, seed) {
    return 0.9 + 0.17 * Math.sin(time * 2.3 + seed) + 0.1 * Math.sin(time * 5.1 + seed * 2.1) + 0.08 * Math.sin(time * 0.7 + seed * 0.7);
  }

  /**
   * Fills `img` ({ data: Uint8ClampedArray, width, height }, RGBA, the SMOKE region) with the plume at `time` seconds. `seed` shifts the noise so two ruins never match.
   */
  function renderSmoke(img, time, seed) {
    const S = sampler(noise()), W = img.width, H = img.height, d = img.data, ppu = SMOKE.ppu;
    const so = (seed || 0) * 37.7;
    const level = fireLevel(time, seed || 0);
    d.fill(0);
    const sway1 = 0.42 * time + so * 0.01, sway2 = 0.27 * time + so * 0.02;
    for (let py = 0; py < H; py++) {
      const y = SMOKE.y0 + (py + 0.5) / ppu, t = (SRC_Y - y) / PLUME_H;
      if (t < -0.28 || t > 1.08) continue;
      const below = t < 0 ? smooth(-0.28, 0, t) * 0.7 : 1;
      const tp = t < 0 ? 0 : t;
      const cxT = DRIFT * Math.pow(tp, 1.35) + 3.2 * Math.sin(sway1 + tp * 3.3) * tp + 1.8 * Math.sin(sway2 + tp * 6.1) * tp;
      const grow = 12 * Math.pow(tp, 0.9);
      const warpA = 7 + 15 * tp;                       // turbulence strengthens as the smoke rises
      const sy = y + RISE * time + so;
      for (let px = 0; px < W; px++) {
        const x = SMOKE.x0 + (px + 0.5) / ppu;
        const sx = x - WIND * time + so * 0.6;
        // domain warp: two decorrelated low-frequency samples bend the whole field, so edges curl instead of fanning out
        const wx = (S(sx * 0.55 + 31, sy * 0.55 + 17) - 0.5) * 2 * warpA;
        const wy = (S(sx * 0.55 + 140, sy * 0.55 + 90) - 0.5) * 2 * warpA * 0.55;
        const xl = x + wx - cxT;
        let env = 0;
        for (let i = 0; i < 3; i++) {
          const s = SOURCES[i], q = (xl - s[0]) / (s[1] + grow);
          env += s[2] * Math.exp(-q * q);
        }
        if (env < 0.03) continue;
        env = env > 1.2 ? 1.2 : env;
        // density detail: broad billows + a finer wisp octave, both warped again and advected
        const bx = (sx + wx * 0.7) * 0.9, by = (sy + wy * 0.7) * 0.9;
        const big = S(bx + 7, by + 3), fine = S(bx * 2.1 + 61, by * 2.1 + 29);
        const D = 0.62 * big + 0.38 * fine;
        const Dl = 0.62 * S(bx + 7 - 2.2, by + 3 - 3.2) + 0.38 * S((bx - 2.2) * 2.1 + 61, (by - 3.2) * 2.1 + 29);   // same field a step toward the light
        const tr = tp + (D - 0.5) * 0.55;                          // the top edge is ragged, never a straight cut
        const top = tr > 0.62 ? 1 - smooth(0.62, 1.0, tr) : 1;
        if (top <= 0.01) continue;
        const c = (D - 0.5) * 3.3 + 0.52 + env * 0.55 - 0.3 - tp * 0.55;
        let a = smooth(-0.08, 0.5, c);
        if (a <= 0.004) continue;
        a *= Math.pow(env > 1 ? 1 : env, 0.8) * below * top * (1 - 0.45 * tp) * 0.92;
        // colour: charcoal base lifting to warm grey aloft; self-shadowing from the offset sample gives the billows volume
        const shade = (D - Dl) * 3.2;
        let tone = 0.085 + 0.42 * Math.pow(tp, 0.85) + 0.16 * (D - 0.4) + shade * 0.15;
        tone *= 1 - 0.35 * a * (1 - tp);
        if (tone < 0.06) tone = 0.06;
        let r = tone * 255 * 1.03, g = tone * 255 * 0.96, b = tone * 255 * 0.9;
        // underlight: the fire reddens the smoke just above it, strongest where it is thin
        const lx = x - 1, ly = y - 8, glow = Math.exp(-(lx * lx + ly * ly * 1.3) / 520) * level * (0.5 + 0.5 * (1 - a));
        if (glow > 0.01) { r += 150 * glow; g += 52 * glow; b += 10 * glow; }
        const k = (py * W + px) * 4;
        d[k] = r > 255 ? 255 : r; d[k + 1] = g > 255 ? 255 : g; d[k + 2] = b > 255 ? 255 : b;
        d[k + 3] = a * 255;
      }
    }
  }

  const RAMP = [[0, 62, 8, 4], [0.25, 120, 20, 6], [0.5, 190, 52, 12], [0.78, 230, 105, 28], [1, 255, 190, 100]];
  function heatColor(h, out) {
    h = clamp01(h);
    let i = 1;
    while (i < RAMP.length - 1 && h > RAMP[i][0]) i++;
    const a = RAMP[i - 1], b = RAMP[i], f = (h - a[0]) / (b[0] - a[0]);
    out[0] = a[1] + (b[1] - a[1]) * f; out[1] = a[2] + (b[2] - a[2]) * f; out[2] = a[3] + (b[3] - a[3]) * f;
  }

  /** Fills `img` (the FIRE region) with deforming flame tongues, a deep red glow and flickering combustion points at `time`. */
  function renderFire(img, time, seed) {
    const S = sampler(noise()), W = img.width, H = img.height, d = img.data, ppu = FIRE.ppu;
    const so = (seed || 0) * 29.3;
    const level = fireLevel(time, seed || 0);
    const col = [0, 0, 0];
    d.fill(0);
    // per-source flicker height this frame (cheap, once per frame)
    const hs = FIRES.map((f, i) => 0.78 + 0.5 * S(time * 0.9 + f[4] * 40 + so, i * 53 + 11) + 0.12 * Math.sin(time * 6.3 + f[4]));
    const hot = HOT.map((h, i) => smooth(0.42, 0.78, S(time * 0.55 + i * 31 + so, i * 17 + 5)) * (0.7 + 0.3 * Math.sin(time * 9 + i)));
    for (let py = 0; py < H; py++) {
      const y = FIRE.y0 + (py + 0.5) / ppu;
      if (y < -13 || y > 18) continue;                 // outside the castle's footprint nothing burns or glows
      for (let px = 0; px < W; px++) {
        const x = FIRE.x0 + (px + 0.5) / ppu;
        if (x < -21 || x > 21) continue;
        let heat = 0, glow = 0;
        for (let i = 0; i < FIRES.length; i++) {
          const f = FIRES[i], dx = x - f[0], dy = y - (f[1] - f[2] * 0.35);
          glow += Math.exp(-(dx * dx + dy * dy * 1.7) / (f[3] * f[3] * 7)) * hs[i];
          const h = f[2] * hs[i], v = (f[1] - y) / h;
          if (v < -0.12 || v > 1.05 || dx > f[3] * 2.6 || dx < -f[3] * 2.6) continue;
          const vv = v > 0 ? v : 0;
          const disp = ((S(x * 0.9 + f[4] * 31 + so, y * 0.9 + time * 6.5) - 0.5) * 6.5 + Math.sin(time * 3.1 + f[4] * 5 + vv * 5) * 1.1) * vv;
          const hw = f[3] * (1 - 0.7 * Math.pow(vv, 1.0)) + 0.001;
          const u = (dx + disp) / hw;
          let ht = (1 - u * u) * (1 - Math.pow(v > 0 ? v : 0, 1.35));
          ht -= (S(x * 2.8 + f[4] * 17 + so, y * 2.8 + time * 17) - 0.36) * 0.95 * (vv > 0.05 ? vv : 0.05);
          if (v < 0) ht *= 1 + v * 6;
          if (ht > heat) heat = ht;
        }
        for (let i = 0; i < HOT.length; i++) {
          const p = HOT[i], dx = x - p[0], dy = y - p[1], q = (dx * dx + dy * dy) / (p[2] * p[2]);
          if (q < 4) { const e = Math.exp(-q * 1.6) * hot[i]; if (e > heat * 0.9) heat = Math.max(heat, e * 0.95); }
        }
        heat *= level;
        const fa = smooth(0.1, 0.42, heat) * 0.82;
        const ga = clamp01(glow * 0.17 * level);
        const k = (py * W + px) * 4;
        if (fa <= 0.002 && ga <= 0.004) continue;
        heatColor(heat, col);
        const oa = fa + ga * (1 - fa);
        const gr = 176, gg = 36, gb = 8;
        d[k] = (col[0] * fa + gr * ga * (1 - fa)) / oa; d[k + 1] = (col[1] * fa + gg * ga * (1 - fa)) / oa; d[k + 2] = (col[2] * fa + gb * ga * (1 - fa)) / oa;
        d[k + 3] = oa * 255;
      }
    }
  }

  /** Embers: a few sparks that occasionally lift off, drawn straight onto the smoke canvas (analytic paths, no state). */
  function drawEmbers(ctx, time, seed) {
    const ppu = SMOKE.ppu;
    for (let i = 0; i < EMBERS.length; i++) {
      const e = EMBERS[i], cyc = time / e[4] + e[5] + (seed || 0) * 0.13, n = Math.floor(cyc), p = cyc - n;
      if (mulberry32(n * 131 + i * 7 + ((seed || 0) | 0))() > 0.55) continue;     // most cycles carry no ember at all
      const x = e[0] + e[3] * p + 2.2 * Math.sin(p * 9 + i * 2), y = e[1] - e[2] * p;
      const a = Math.sin(Math.PI * Math.min(1, p * 1.25)) * (0.55 + 0.45 * Math.sin(time * 14 + i * 3)) * (1 - p * 0.6);
      if (a <= 0.02) continue;
      ctx.fillStyle = 'rgba(255,' + Math.round(150 + 60 * (1 - p)) + ',60,' + a.toFixed(2) + ')';
      ctx.fillRect((x - SMOKE.x0) * ppu - 0.6, (y - SMOKE.y0) * ppu - 0.6, 1.4, 1.4);
    }
  }

  /* ---------- DOM: one shared, throttled loop ---------- */
  const instances = new Set();
  let rafId = 0, lastDraw = 0, frame = 0;
  const FRAME_MS = 1000 / 30;

  function seedOf(id) { let h = 7; const s = String(id || ''); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973; return h % 97; }

  function makeLayer(cv) {
    const ctx = cv.getContext && cv.getContext('2d');
    if (!ctx) return null;
    return { cv, ctx, img: ctx.createImageData(cv.width, cv.height) };
  }

  function drawInstance(inst, time) {
    renderSmoke(inst.smoke.img, time, inst.seed);
    inst.smoke.ctx.putImageData(inst.smoke.img, 0, 0);
    drawEmbers(inst.smoke.ctx, time, inst.seed);
    renderFire(inst.fire.img, time, inst.seed);
    inst.fire.ctx.putImageData(inst.fire.img, 0, 0);
  }

  function onScreen(inst) {
    const r = inst.smoke.cv.getBoundingClientRect(), vw = G.innerWidth || 1e5, vh = G.innerHeight || 1e5;
    return r.width > 0 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh;
  }

  function tick(now) {
    rafId = 0;
    for (const inst of instances) if (!inst.smoke.cv.isConnected) instances.delete(inst);
    if (!instances.size) return;
    rafId = G.requestAnimationFrame(tick);
    if (now - lastDraw < FRAME_MS - 1) return;
    lastDraw = now; frame++;
    const time = now / 1000;
    for (const inst of instances) {
      if (frame % 8 === 1) inst.visible = onScreen(inst);
      if (inst.visible !== false) drawInstance(inst, time);
    }
  }

  /** Starts (or restarts) the effect on every `.j2-ruin2` element under `scope`: each holds a `canvas[data-fx="smoke"]` and a `canvas[data-fx="fire"]`. Returns the number started. */
  function attach(scope) {
    if (!scope || !scope.querySelectorAll) return 0;
    const reduce = !!(G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let n = 0;
    scope.querySelectorAll('.j2-ruin2').forEach(el => {
      const sc = el.querySelector('canvas[data-fx="smoke"]'), fc = el.querySelector('canvas[data-fx="fire"]');
      if (!sc || !fc) return;
      const smoke = makeLayer(sc), fire = makeLayer(fc);
      if (!smoke || !fire) return;
      const inst = { smoke, fire, seed: seedOf(el.getAttribute('data-ruin')), visible: true };
      n++;
      if (reduce) { drawInstance(inst, 23 + inst.seed); return; }
      drawInstance(inst, G.performance.now() / 1000);
      instances.add(inst);
    });
    if (instances.size && !rafId) rafId = G.requestAnimationFrame(tick);
    return n;
  }

  function markup(id) {
    const px = (r) => ' width="' + r.w * r.ppu + '" height="' + r.h * r.ppu + '"';
    const fo = (r, fx) => '<foreignObject x="' + r.x0 + '" y="' + r.y0 + '" width="' + r.w + '" height="' + r.h + '" class="j2-r2-fo"><canvas xmlns="http://www.w3.org/1999/xhtml" data-fx="' + fx + '"' + px(r) + ' class="j2-r2-cv"></canvas></foreignObject>';
    return fo(FIRE, 'fire') + fo(SMOKE, 'smoke');           // the smoke passes over the flames
  }

  return Object.freeze({ SMOKE, FIRE, bakeNoise, renderSmoke, renderFire, fireLevel, attach, markup, seedOf });
});
