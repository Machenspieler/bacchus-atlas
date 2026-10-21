/* ============================================================
   Bacchus's Atlas — journey2-ruin-fx.js
   Destroyed-sanctuary VFX on the screen map (PD-070): a procedurally rendered smoke plume and fire on two small Canvas 2D textures laid over the
   unchanged map, on every destroyed sanctuary the viewer may see (the print keeps its own still black-and-white drawing). V1 stacked animated SVG
   blobs, which can only ever read as separate translucent shapes; this renders a DENSITY FIELD per pixel instead — domain-warped fractal noise,
   advected upward and sideways with time, shaped by a widening, drifting plume envelope — so the structure continuously merges, tears and curls
   and there is no particle boundary to see. The fire is a few large flame clusters drawn for the map at 100 %, with a level of detail by on-screen size.

   Pure core (no DOM): `bakeNoise`, `renderSmoke`, `renderFire` fill an RGBA buffer for a given time. `attach` is the only DOM part: one shared
   throttled rAF loop for every instance, culled off-screen, stopped when no canvas is left, a single still frame under reduced motion.
   Coordinates are icon-centred map units (the same as the view's `ruinMarkup`), y grows downward, the castle sits around (0,0).
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Journey2RuinFx = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const G = typeof globalThis !== 'undefined' ? globalThis : {};

  /** Texture regions in icon units: the plume rises up and to the right (wind); the fire wraps the castle. `ppu` = canvas pixels per unit (the fire's is only the
   *  initial size: `attach` re-sizes its canvas to the device pixels it actually covers, see `firePpu`). */
  const SMOKE = Object.freeze({ x0: -38, y0: -86, w: 100, h: 112, ppu: 2 });
  const FIRE = Object.freeze({ x0: -30, y0: -28, w: 60, h: 56, ppu: 3 });
  const SRC_Y = 0;            // the line where smoke leaves the roofs
  const PLUME_H = 66;          // height over which the plume thins out completely
  const DRIFT = 24;            // wind: how far right the plume centre has moved at the top
  const RISE = 6.5;            // units per second the density pattern climbs
  const WIND = 1.6;            // units per second the pattern slides right

  /** Smoke sources [x, width, strength]; they start apart (separate chimneys of the ruin) and the widening envelope merges them. */
  const SOURCES = [[-10, 6, 0.9], [3, 7, 1], [12, 5.5, 0.9]];
  /**
   * Flames, sized for the map at 100 % (1 unit = 1.2 CSS px), never for a zoomed-in close-up. One tall blaze by the central tower; lower, uneven pockets to its left and
   * right with dark gaps of the castle between them — a fire spreading unevenly, never a continuous wall. The castle in the raster: the left domed hall spans x -17..-1
   * (dome y -5..3, legs to 15), the low wall between the buildings x -1..4 (top y 6), the right tower x 3.5..15.5 (top -12, a window at x 9.5 y -4..1, an arch x 7..11 under it).
   * [x, base y, height, half-width, lean (x per unit of height, the wind), phase, rank, tongues, bed, breathe]; a tongue is [x offset (of half-width), height fraction,
   * width fraction]; bed = [height fraction, width fraction] of the low body the tongues rise from; breathe = how far the pocket now and then dies down
   * (0 = never, the blaze; 0.8 = to a small ember for a few seconds, then it flares up again — every pocket on its own slow clock).
   * rank 0 = the silhouette, drawn at every size; rank 1 = detail, faded in only once the icon is large enough on screen (see `lodOf`).
   */
  const FLAMES = [
    [1.4, 13, 27, 3.9, 0.15, 0.3, 0, [[0.05, 1, 1], [-0.62, 0.68, 0.62], [0.68, 0.78, 0.58]], [0.34, 1.05], 0],   // the blaze, rising out of the gap between the buildings above both roofs
    [-11, 15, 13, 3.9, 0.16, 1.7, 0, [[-0.3, 1, 0.6], [0.55, 0.6, 0.45]], [0.24, 0.8], 0.75],                   // inside the domed hall, between its legs
    [17.8, 15, 15, 2.8, 0.08, 3.1, 0, [[0, 1, 1], [-0.6, 0.55, 0.55]], [0.26, 0.8], 0.7],                       // up the right side of the tower
    [-19, 15, 9, 2.3, 0.22, 4.6, 0, [[0, 1, 1]], [0.3, 0.9], 0.8],                                               // at the left wall of the hall, leaning into it with the wind
    [10.3, 15, 10, 2, 0.06, 2.2, 0, [[0, 1, 1]], [0.3, 0.9], 0.7],                                            // in the arch under the tower
    [-8.4, -2.6, 8.5, 2.3, 0.12, 5.4, 1, [[0, 1, 1], [0.7, 0.62, 0.55]], [0.3, 0.9], 0.6],                       // breaking through the dome
    [13.6, -8.5, 6, 1.5, 0.1, 0.9, 1, [[0, 1, 1]], [0.3, 0.9], 0.6]                                              // a lick off the tower's roof
  ];
  /** Fire seen through openings of the dark structure [x, y, rx, ry, rank]: a small very hot patch on black ink reads at any size. */
  const HOT = [[9.6, -1.6, 0.95, 2.1, 0], [-12.2, 9, 0.9, 2, 1], [-5.6, 9.5, 0.9, 1.8, 1], [5.4, 9, 0.8, 1.5, 1]];
  const EMBERS = [[-9, 2, 36, 9, 6.8, 0.1], [6, -4, 44, 16, 9.1, 0.55], [13, 5, 32, 6, 7.7, 0.3], [-3, 6, 40, -6, 11.3, 0.8], [1, -2, 38, 12, 8.3, 0.0]];

  /**
   * One fire layout per printed sanctuary glyph class (map-anchors.json `glyphClass`), all in icon-centred units like G1's above: the flames, the hot windows, the smoke
   * sources, the line where the smoke leaves the roofs (`srcY`), the centre of the fire's underlight on the smoke (`glow`) and the embers. G1 is the original, hand-tuned one
   * (the constants above); the others are drawn the same way for their own silhouettes (measured on the raster: ink box, roofs, openings), so a ruin burns from ITS roofs
   * and windows whichever icon the draw landed on. An unknown class falls back to G1. `still` is the print's static drawing for the class (G1's lives in the view).
   */
  const shiftEmbers = (dx, dy) => EMBERS.map(e => [e[0] + dx, e[1] + dy, e[2], e[3], e[4], e[5]]);
  const BLAZE_T = [[0.05, 1, 1], [-0.62, 0.68, 0.62], [0.68, 0.78, 0.58]];
  const POCKET_T = [[-0.3, 1, 0.6], [0.55, 0.6, 0.45]];
  const SIDE_T = [[0, 1, 1], [-0.6, 0.55, 0.55]];
  const LAYOUTS = {
    G1: { flames: FLAMES, hot: HOT, embers: EMBERS, sources: SOURCES, srcY: SRC_Y, glow: [1, 8] },
    // two crenellated towers, the left one tall (top y -18, x -10..1), the right one low (top -8, x 1..10), low wings either side
    G2: {
      flames: [
        [-4.5, 15, 34, 3.9, 0.12, 0.3, 0, BLAZE_T, [0.34, 1.05], 0],
        [8, 16, 25, 3.2, 0.08, 1.9, 0, [[0, 1, 1], [-0.5, 0.55, 0.5]], [0.28, 0.85], 0.7],
        [-12.5, 16, 16, 2.4, 0.2, 3.4, 0, [[0, 1, 1]], [0.3, 0.9], 0.75],
        [13, 16, 15, 2.2, 0.1, 4.8, 0, [[0, 1, 1]], [0.3, 0.9], 0.8],
        [-8.5, -12, 7, 2, 0.12, 5.4, 1, [[0, 1, 1], [0.7, 0.62, 0.55]], [0.3, 0.9], 0.6],
        [8, -6, 6, 1.5, 0.1, 0.9, 1, [[0, 1, 1]], [0.3, 0.9], 0.6]
      ],
      hot: [[-4.8, -6, 0.9, 2, 0], [-3, 8, 0.9, 1.8, 1], [7, 8, 0.8, 1.5, 1]],
      embers: shiftEmbers(-4, -4), sources: [[-6, 6, 0.9], [3, 7, 1], [11, 5.5, 0.85]], srcY: -8, glow: [-3, 4]
    },
    // a small ruined group: a thin tall tower between a low building (left) and a big block (right); ink box x -12..13, y -13..12
    G3: {
      flames: [
        [1, 10, 25, 3.5, 0.15, 0.3, 0, BLAZE_T, [0.34, 1.05], 0],
        [-8, 12, 15, 2.8, 0.16, 1.7, 0, POCKET_T, [0.24, 0.8], 0.75],
        [9, 10, 16, 2.9, 0.1, 3.1, 0, SIDE_T, [0.26, 0.8], 0.7],
        [-2.2, -11, 6, 1.4, 0.1, 5.4, 1, [[0, 1, 1]], [0.3, 0.9], 0.6],
        [11, -4, 6, 1.6, 0.1, 0.9, 1, [[0, 1, 1]], [0.3, 0.9], 0.6]
      ],
      hot: [[7, 7, 1, 1.8, 0], [-8, 6, 0.8, 1.6, 1]],
      embers: shiftEmbers(1, -4), sources: [[-6, 5, 0.8], [0, 6, 1], [8, 6, 0.9]], srcY: -3, glow: [3, 5]
    },
    // a tall thin spire (top y -22) over a body that widens into low buildings (left top +6, right top +11), feet at +22
    G4: {
      flames: [
        [0.5, 18, 36, 3.6, 0.12, 0.3, 0, BLAZE_T, [0.34, 1.05], 0],
        [-7, 21, 17, 3.6, 0.2, 1.7, 0, POCKET_T, [0.24, 0.8], 0.75],
        [9.5, 21, 13, 3, 0.1, 3.1, 0, SIDE_T, [0.26, 0.8], 0.7],
        [-12, 21, 9, 2.3, 0.22, 4.6, 0, [[0, 1, 1]], [0.3, 0.9], 0.8],
        [3, 14, 10, 2, 0.06, 2.2, 0, [[0, 1, 1]], [0.3, 0.9], 0.7],
        [0.8, -19, 6, 1.3, 0.1, 0.9, 1, [[0, 1, 1]], [0.3, 0.9], 0.6],
        [-3, -6, 8, 2, 0.12, 5.4, 1, [[0, 1, 1], [0.7, 0.62, 0.55]], [0.3, 0.9], 0.6]
      ],
      hot: [[1.5, 2, 0.9, 2, 0], [-8, 14, 0.9, 1.8, 1], [9, 16, 0.8, 1.5, 1]],
      embers: shiftEmbers(0, 2), sources: [[-6, 5.5, 0.85], [1, 6, 1], [9, 5.5, 0.85]], srcY: -6, glow: [1, 10]
    },
    // like G4 but slimmer: spire top y -24, lower buildings top +4 (left) and +5 (right), feet at +19
    G6: {
      flames: [
        [1, 16, 35, 3.5, 0.12, 0.3, 0, BLAZE_T, [0.34, 1.05], 0],
        [-7, 18, 16, 3.5, 0.2, 1.7, 0, POCKET_T, [0.24, 0.8], 0.75],
        [10, 18, 14, 2.8, 0.1, 3.1, 0, SIDE_T, [0.26, 0.8], 0.7],
        [-12, 18, 9, 2.3, 0.22, 4.6, 0, [[0, 1, 1]], [0.3, 0.9], 0.8],
        [3.5, 12, 10, 2, 0.06, 2.2, 0, [[0, 1, 1]], [0.3, 0.9], 0.7],
        [1.6, -21, 6, 1.3, 0.1, 0.9, 1, [[0, 1, 1]], [0.3, 0.9], 0.6],
        [-3, -6, 8, 2, 0.12, 5.4, 1, [[0, 1, 1], [0.7, 0.62, 0.55]], [0.3, 0.9], 0.6]
      ],
      hot: [[1, 0, 0.9, 2, 0], [-7, 12, 0.9, 1.8, 1], [10, 13, 0.8, 1.5, 1]],
      embers: shiftEmbers(1, 0), sources: [[-6, 5.5, 0.85], [1.5, 6, 1], [9, 5.5, 0.85]], srcY: -6, glow: [1, 9]
    },
    // two crenellated towers: left tall and slim (x -14..-2, top y -20), right low (x 1..14, top -9), a gap between; feet at +17
    G7: {
      flames: [
        [-8, 15, 36, 3.8, 0.12, 0.3, 0, BLAZE_T, [0.34, 1.05], 0],
        [8, 17, 25, 3.6, 0.08, 1.9, 0, [[0, 1, 1], [-0.5, 0.55, 0.5]], [0.28, 0.85], 0.7],
        [-0.5, 17, 11, 1.9, 0.06, 3.4, 0, [[0, 1, 1]], [0.3, 0.9], 0.8],
        [-14.5, 17, 11, 2.2, 0.22, 4.6, 0, [[0, 1, 1]], [0.3, 0.9], 0.8],
        [15, 17, 10, 2, 0.08, 2.6, 0, [[0, 1, 1]], [0.3, 0.9], 0.8],
        [-10, -18, 7, 1.8, 0.12, 5.4, 1, [[0, 1, 1], [0.7, 0.62, 0.55]], [0.3, 0.9], 0.6],
        [8, -8, 6, 1.5, 0.1, 0.9, 1, [[0, 1, 1]], [0.3, 0.9], 0.6]
      ],
      hot: [[-8, -8, 0.9, 2, 0], [8, 0, 0.9, 1.8, 1], [-8, 8, 0.8, 1.6, 1]],
      embers: shiftEmbers(-4, -4), sources: [[-9, 6, 0.9], [-0.5, 5, 0.8], [8, 6, 0.9]], srcY: -10, glow: [-3, 6]
    }
  };
  const layoutOf = (cls) => (typeof cls === 'object' && cls) ? cls : (LAYOUTS[cls] || LAYOUTS.G1);

  /** The print's static fire for a class other than G1, drawn from its layout: one tongue per rank-0 flame (back to front, the blaze last and tallest), a core inside the
   *  blaze, a bed under it, the smoke strands starting at the line where the smoke leaves the roofs. null for G1 (its hand-drawn drawing lives in the view). */
  function stillOf(cls) {
    const key = LAYOUTS[cls] ? cls : 'G1';
    if (key === 'G1') return null;
    const L = LAYOUTS[key], r1 = v => Math.round(v * 10) / 10, P = (x, y) => r1(x) + ' ' + r1(y);
    const fl = L.flames.filter(f => f[6] === 0).sort((a, b) => a[2] - b[2]);
    const tongue = (f, k) => {
      const x = f[0], y = f[1], h = f[2] * k, hw = f[3] * 1.15, tx = x + f[4] * h * 0.9, ty = y - h;
      return 'M' + P(x - hw, y) + 'C' + P(x - hw * 1.15, y - h * 0.4) + ' ' + P(tx - hw * 0.45, ty + h * 0.35) + ' ' + P(tx, ty) +
        'C' + P(tx + hw * 0.5, ty + h * 0.4) + ' ' + P(x + hw * 1.15, y - h * 0.35) + ' ' + P(x + hw, y) + 'Z';
    };
    const blaze = fl[fl.length - 1];
    const core = (() => { const x = blaze[0], y = blaze[1], h = blaze[2] * 0.36, w = blaze[3] * 0.55; return 'M' + P(x - w, y) + 'C' + P(x - w * 1.3, y - h * 0.6) + ' ' + P(x - w * 0.3, y - h * 0.8) + ' ' + P(x, y - h) + 'C' + P(x + w * 0.4, y - h * 0.7) + ' ' + P(x + w * 1.3, y - h * 0.5) + ' ' + P(x + w, y) + 'Z'; })();
    const dy = L.srcY - SRC_Y;
    return { tongues: fl.map(f => tongue(f, 0.8)), core: core, bedY: blaze[1] + 1, bedRx: 17, dy: dy, glowX: blaze[0] };
  }

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
  function renderSmoke(img, time, seed, cls) {
    const Ly = layoutOf(cls), SRC = Ly.sources, SY = Ly.srcY, GL = Ly.glow;
    const S = sampler(noise()), W = img.width, H = img.height, d = img.data, ppu = W / SMOKE.w;
    const so = (seed || 0) * 37.7;
    const level = fireLevel(time, seed || 0);
    d.fill(0);
    const sway1 = 0.42 * time + so * 0.01, sway2 = 0.27 * time + so * 0.02;
    for (let py = 0; py < H; py++) {
      const y = SMOKE.y0 + (py + 0.5) / ppu, t = (SY - y) / PLUME_H;
      if (t < -0.28 || t > 1.08) continue;
      const below = t < 0 ? smooth(-0.28, 0, t) * 0.7 : 0.7 + 0.3 * smooth(0, 0.12, t);   // continuous at the roof line (a step there showed as a hard edge above low roofs)
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
          const s = SRC[i], q = (xl - s[0]) / (s[1] + grow);
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
        const lx = x - GL[0], ly = y - GL[1], glow = Math.exp(-(lx * lx + ly * ly * 1.3) / 520) * level * (0.5 + 0.5 * (1 - a));
        if (glow > 0.01) { r += 150 * glow; g += 52 * glow; b += 10 * glow; }
        const k = (py * W + px) * 4;
        d[k] = r > 255 ? 255 : r; d[k + 1] = g > 255 ? 255 : g; d[k + 2] = b > 255 ? 255 : b;
        d[k + 3] = a * 255;
      }
    }
  }

  // colour by temperature: a dark saturated red rim -> red-orange -> orange -> amber -> a hot yellow core. The rim is darker than the parchment, so the silhouette
  // separates from the paper; the core is lighter than anything around it, so the fire reads as light rather than as a stain.
  const RAMP = [[0, 120, 18, 6], [0.25, 184, 36, 8], [0.5, 228, 80, 14], [0.7, 246, 132, 26], [0.86, 254, 182, 58], [1, 255, 226, 134]];
  function heatColor(h, out) {
    h = clamp01(h);
    let i = 1;
    while (i < RAMP.length - 1 && h > RAMP[i][0]) i++;
    const a = RAMP[i - 1], b = RAMP[i], f = (h - a[0]) / (b[0] - a[0]);
    out[0] = a[1] + (b[1] - a[1]) * f; out[1] = a[2] + (b[2] - a[2]) * f; out[2] = a[3] + (b[3] - a[3]) * f;
  }
  const GLOW = 0.2;            // peak opacity of the warm light the flames cast on the paper right around them

  /** Visual level of detail from the on-screen size, `scale` = CSS px per icon unit (1.2 at 100 % zoom): 0 up to about 110 %, 1 from about 225 %. */
  function lodOf(scale) { return smooth(1.35, 2.7, scale > 0 ? scale : 1.2); }

  /** Fire canvas pixels per unit for an on-screen scale and device pixel ratio: the device pixels it really covers, rounded UP to a step of 0.5 (never an upscaled
   *  blur, no 3x downsampling that aliases into shimmer), between 0.5 (a zoomed-out map) and 6 (above that the cost grows with the square and the flames are large enough for a soft edge). */
  function firePpu(scale, dpr) {
    const p = Math.ceil((scale > 0 ? scale : 1.2) * (dpr > 0 ? dpr : 1) * 2 - 1e-6) / 2;
    return p < 0.5 ? 0.5 : p > 6 ? 6 : p;
  }

  /** Smoke canvas pixels per unit: its designed 2 wherever the plume covers 1 device px per unit or more (from about 85 % on any screen — the look is exactly the
   *  approved one), 1 or 0.5 only on a zoomed-out map where 2 would be thrown away by a 2-4x downsample (five ruins at once stay cheap). */
  function smokePpu(scale, dpr) {
    const p = (scale > 0 ? scale : 1.2) * (dpr > 0 ? dpr : 1);
    return p >= 1 ? 2 : p >= 0.5 ? 1 : 0.5;
  }

  /**
   * Fills `img` (the FIRE region at any pixels-per-unit: `img.width / FIRE.w`) with the fire at `time`, drawn for an on-screen `scale` (CSS px per unit, default 1.2 = 100 %).
   * Each flame is a cluster of tongues; a tongue has a broad foot (neighbours merge there) and narrows to a sharp tip, its axis bent by noise rising with the gas, its contour pushed in and out by
   * noise whose features are never smaller than about two screen pixels, and its upper part eroded so licks tear off. The tongues are UNITED (1 - Π(1 - a)) so a
   * cluster reads as one connected mass, never as dots. Shape (opacity) and temperature (colour) are separate: hottest on the axis low in the body, cooling to a
   * dark red at the rim and the tips. Level of detail: at small sizes the tongues are wider and barely eroded (a bold silhouette), the detail flames are absent;
   * zoomed in, the contours get finer, the tips tear and the detail flames fade in. Every term is clamped to 0..1 before it is multiplied (an unbounded product once drew thin lines).
   */
  function renderFire(img, time, seed, scale, cls) {
    const Ly = layoutOf(cls), FLAMES = Ly.flames, HOT = Ly.hot;
    const S = sampler(noise()), W = img.width, H = img.height, d = img.data, ppu = W / FIRE.w;
    const sc = scale > 0 ? scale : 1.2, D = lodOf(sc), minU = 2.2 / sc;
    const so = (seed || 0) * 29.3;
    const level = fireLevel(time, seed || 0);
    const col = [0, 0, 0];
    d.fill(0);
    // this frame's tongues with their bounds; heights flicker per flame (slow) and per tongue (faster), never in step
    const T = [];
    for (let i = 0; i < FLAMES.length; i++) {
      const f = FLAMES[i], vis = f[6] === 0 ? 1 : D;
      if (vis <= 0.02) continue;
      const fl = 0.86 + 0.28 * smooth(0.15, 0.85, S(time * 0.8 + f[5] * 40 + so, i * 53 + 11));
      // a pocket's own slow clock: now and then it dies down to an ember (lower and narrower, same heat) and flares up again
      const br = f[9] > 0 ? 1 - f[9] * smooth(0.56, 0.64, S(time * 1.3 + f[5] * 31 + so, i * 41 + 31)) : 1;
      const bh = 0.15 + 0.85 * br, bw = 0.6 + 0.4 * br;
      // j = -1 is the cluster's burning bed: a low, wide body under all its tongues, so they rise out of one connected mass
      for (let j = -1; j < f[7].length; j++) {
        const tg = j < 0 ? [0, f[8][0], f[8][1]] : f[7][j], ph = f[5] * 7 + j * 3.7;
        const h = f[2] * tg[1] * fl * bh * (0.86 + 0.28 * S(time * 1.9 + ph * 19 + so, j * 37 + i * 13 + 40)) * (1 + 0.04 * Math.sin(time * 9.3 + ph));
        const w0 = f[3] * tg[2] * bw * (1 + 0.22 * (1 - D)), lean = f[4] * h, bx = f[0] + tg[0] * f[3], reach = w0 * 3.4;
        T.push({
          bx, base: f[1], h, w0, lean, ph, vis, rise: 1.3 * h, bed: j < 0,
          kB: 64 / h, kE: 16 / Math.max(minU, f[3] * (0.8 - 0.4 * D)), kR: 16 / Math.max(minU, f[3] * (0.6 - 0.3 * D)), kT: 16 / Math.max(minU, f[3] * 0.7),
          x0: bx - reach + Math.min(0, lean), x1: bx + reach + Math.max(0, lean), y0: f[1] - h * 1.02 - 1.2, y1: f[1] + 3.4
        });
      }
    }
    const hot = HOT.map((p, i) => (p[4] === 0 ? 1 : D) * (0.78 + 0.32 * S(time * 1.3 + i * 31 + so, i * 17 + 5)) * (0.93 + 0.07 * Math.sin(time * 8 + i * 2)));
    for (let py = 0; py < H; py++) {
      const y = FIRE.y0 + (py + 0.5) / ppu;
      for (let px = 0; px < W; px++) {
        const x = FIRE.x0 + (px + 0.5) / ppu;
        let A = 0, shMax = 0, temp = 0, halo = 0;
        for (let i = 0; i < T.length; i++) {
          const t = T[i];
          if (x < t.x0 || x > t.x1 || y < t.y0 || y > t.y1) continue;
          const bl = t.base + (S(x * 1.4 + t.ph * 9 + so, time * 1.6 + t.ph * 21) - 0.5) * 2.4;   // a ragged, slowly shifting foot line, never a ruler-straight cut
          const v = (bl - y) / t.h, vv = v < 0 ? 0 : v > 1 ? 1 : v;
          if (v >= 1) continue;
          const ry = y + time * t.rise;                                  // the pattern climbs with the gas
          // the axis snakes: a wave a little shorter than half the tongue, rising with the gas, swinging wider toward the tip, plus the wind's lean
          const bend = (S(t.ph * 23 + so + time * 0.7, ry * t.kB + t.ph * 11) - 0.5) * 2 * t.w0 * 1.5 * Math.pow(vv, 1.1);
          // a broad foot (neighbours overlap there and merge), a body that narrows faster than a cone, a sharp tip — never a candle's rounded drop
          const prof = (1 + 0.35 * (1 - smooth(0, 0.45, vv))) * Math.pow(1 - vv, 0.95);
          const dx = (x - t.bx - t.lean * vv - bend) / (t.w0 * prof + 0.02);
          const e = (S(x * t.kE + t.ph * 31 + so, ry * t.kE + t.ph * 7) - 0.5) * (0.4 + 0.2 * D) * (0.45 + vv);
          const u = y > bl ? (y - bl) / 1.4 : 0;
          const dd = (dx < 0 ? -dx : dx) + e + u * u;
          if (t.vis === 1) { const g = clamp01(1 - dd / 1.9); if (g > halo) halo = g; }
          let sh = clamp01(1 - dd);
          if (sh <= 0) continue;
          // the upper part tears: licks pinch off and re-form (a little even at small sizes, freely when zoomed in)
          const er = clamp01((S(x * t.kR + t.ph * 17, ry * 1.15 * t.kR + t.ph * 3) - (0.7 - 0.36 * vv)) * 2.6) * vv * (0.55 + 0.75 * D);
          sh = clamp01(sh - er) * t.vis;
          if (sh <= 0) continue;
          A = 1 - (1 - A) * (1 - sh);
          if (sh > shMax) shMax = sh;
          // temperature: hottest on the axis in the lower half, cooling fast toward the rim and the tip, with a turbulent streakiness of its own
          const tn = (S(x * t.kT + t.ph * 5, ry * 0.7 * t.kT + t.ph * 13) - 0.5) * 0.5;
          const tp = clamp01(1 - dx * dx * 1.25 + tn) * (t.bed ? 0.92 : 1 - 0.72 * Math.pow(vv, 1.1)) * clamp01(sh * 2.5);
          if (tp > temp) temp = tp;
        }
        for (let i = 0; i < HOT.length; i++) {
          const p = HOT[i], qx = (x - p[0]) / p[2], qy = (y - p[1]) / p[3], q = qx * qx + qy * qy;
          if (q >= 2 || hot[i] <= 0.02) continue;
          const sh = clamp01(1.3 - q) * clamp01(hot[i]);
          A = 1 - (1 - A) * (1 - sh);
          const tp = clamp01(0.3 + 0.75 * Math.exp(-q * 1.3) * hot[i]);
          if (tp > temp) temp = tp;
        }
        temp = clamp01(clamp01(temp + 0.2 * (A - shMax)) * (0.84 + 0.16 * level) + 0.06 * (1 - D));
        const fa = smooth(0.02, 0.26, A) * 0.97;
        const ga = halo * halo * GLOW * (0.85 + 0.15 * level);
        if (fa <= 0.002 && ga <= 0.004) continue;
        heatColor(temp, col);
        const oa = fa + ga * (1 - fa), k = (py * W + px) * 4;
        d[k] = (col[0] * fa + 238 * ga * (1 - fa)) / oa; d[k + 1] = (col[1] * fa + 112 * ga * (1 - fa)) / oa; d[k + 2] = (col[2] * fa + 26 * ga * (1 - fa)) / oa;
        d[k + 3] = oa * 255;
      }
    }
  }

  /** Embers: a few sparks that occasionally lift off, drawn straight onto the smoke canvas (analytic paths, no state). */
  function drawEmbers(ctx, time, seed, ppu, cls) {
    const EMB = layoutOf(cls).embers;
    for (let i = 0; i < EMB.length; i++) {
      const e = EMB[i], cyc = time / e[4] + e[5] + (seed || 0) * 0.13, n = Math.floor(cyc), p = cyc - n;
      if (mulberry32(n * 131 + i * 7 + ((seed || 0) | 0))() > 0.55) continue;     // most cycles carry no ember at all
      const x = e[0] + e[3] * p + 2.2 * Math.sin(p * 9 + i * 2), y = e[1] - e[2] * p;
      const a = Math.sin(Math.PI * Math.min(1, p * 1.25)) * (0.55 + 0.45 * Math.sin(time * 14 + i * 3)) * (1 - p * 0.6);
      if (a <= 0.02) continue;
      ctx.fillStyle = 'rgba(255,' + Math.round(150 + 60 * (1 - p)) + ',60,' + a.toFixed(2) + ')';
      ctx.fillRect((x - SMOKE.x0) * ppu - 0.3 * ppu, (y - SMOKE.y0) * ppu - 0.3 * ppu, 0.7 * ppu, 0.7 * ppu);
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

  function drawInstance(inst, time, fire) {
    renderSmoke(inst.smoke.img, time, inst.seed, inst.glyph);
    inst.smoke.ctx.putImageData(inst.smoke.img, 0, 0);
    drawEmbers(inst.smoke.ctx, time, inst.seed, inst.smoke.cv.width / SMOKE.w, inst.glyph);
    if (fire === false) return;
    renderFire(inst.fire.img, time, inst.seed, inst.scale, inst.glyph);
    inst.fire.ctx.putImageData(inst.fire.img, 0, 0);
  }

  /**
   * Reads where the instance is: on screen at all (the smoke's box), and the fire's on-screen scale (CSS px per unit — the camera zoom times the ruin's own scale).
   * Both come from the ruin group's `getScreenCTM()`: `getBoundingClientRect()` of an element inside the camera-scaled map SVG (and of HTML inside its
   * foreignObject) ignores the camera's CSS scale in Chromium, which once culled a ruin that was on screen and froze it.
   * Re-sizes both canvases to the device pixels they cover (`firePpu`, `smokePpu`). Returns true when the look changed (a new resolution or level of detail).
   */
  function measure(inst) {
    const m = inst.el.getScreenCTM ? inst.el.getScreenCTM() : null, vw = G.innerWidth || 1e5, vh = G.innerHeight || 1e5;
    const scale = m ? Math.hypot(m.a, m.b) : 0;
    inst.visible = scale > 0 && m.e + scale * (SMOKE.x0 + SMOKE.w) > 0 && m.f + scale * (SMOKE.y0 + SMOKE.h) > 0 && m.e + scale * SMOKE.x0 < vw && m.f + scale * SMOKE.y0 < vh;
    if (!(scale > 0)) return false;
    const dpr = G.devicePixelRatio || 1;
    let changed = Math.abs(scale - inst.scale) > 0.03 * inst.scale;
    inst.scale = scale;
    for (const [layer, R, ppu] of [[inst.fire, FIRE, firePpu(scale, dpr)], [inst.smoke, SMOKE, smokePpu(scale, dpr)]]) {
      if (layer.cv.width === R.w * ppu) continue;
      layer.cv.width = R.w * ppu; layer.cv.height = R.h * ppu;
      layer.img = layer.ctx.createImageData(layer.cv.width, layer.cv.height);
      changed = true;
    }
    return changed;
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
      const changed = frame % 8 === 1 && measure(inst);
      if (inst.still) { if (changed) drawInstance(inst, inst.still); }   // reduced motion: the one still frame, redrawn only when a zoom changes its detail
      else if (inst.visible !== false) drawInstance(inst, time, inst.fire.cv.width <= FIRE.w * 4 || frame % 2 === 0);   // a large (zoomed-in) fire at 15 fps
    }
  }

  /** Whether new instances start as one still frame: the host's "Static effects" choice (PD-076) when it has set one, else the system's reduced-motion setting. */
  let stillMode = null;
  function stillWanted() { return stillMode !== null ? stillMode : !!(G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches); }

  /** Switches every live instance, and every later one, between the still frame (true) and the animation (false); the host's setting overrides the system's. */
  function setStill(flag) {
    stillMode = !!flag;
    for (const inst of instances) {
      inst.still = stillMode ? 23 + inst.seed : 0;
      drawInstance(inst, stillMode ? inst.still : G.performance.now() / 1000);
    }
    if (!stillMode && instances.size && !rafId) rafId = G.requestAnimationFrame(tick);
  }

  /** Starts (or restarts) the effect on every `.j2-ruin2` element under `scope`: each holds a `canvas[data-fx="smoke"]` and a `canvas[data-fx="fire"]`. Returns the number started. */
  function attach(scope) {
    if (!scope || !scope.querySelectorAll) return 0;
    const reduce = stillWanted();
    let n = 0;
    scope.querySelectorAll('.j2-ruin2').forEach(el => {
      const sc = el.querySelector('canvas[data-fx="smoke"]'), fc = el.querySelector('canvas[data-fx="fire"]');
      if (!sc || !fc) return;
      const smoke = makeLayer(sc), fire = makeLayer(fc);
      if (!smoke || !fire) return;
      const seed = seedOf(el.getAttribute('data-ruin'));
      const inst = { el, smoke, fire, seed, glyph: el.getAttribute('data-glyph') || 'G1', visible: true, scale: 1.2, still: reduce ? 23 + seed : 0 };
      n++;
      measure(inst);
      drawInstance(inst, reduce ? inst.still : G.performance.now() / 1000);
      instances.add(inst);
    });
    if (instances.size && !rafId) rafId = G.requestAnimationFrame(tick);
    return n;
  }

  /**
   * The print's ruin (PD-077): the very still frame the "Static effects" switch draws on screen (same time, seed, glyph and level of detail), rendered once to two
   * canvases and handed over as grayscale PNG data URIs (alpha kept) — the one piece of colour in the effect is the fire, and paper has none (its pale yellow tips would vanish on white, so its grey is darkened by a gamma). `null` where there is no canvas.
   * `{ smoke, fire }`, each `{ href, x, y, w, h }` in icon-centred units; the print scales the group like the screen one. Cached per (id, glyph).
   */
  const stillCache = new Map();
  function stillImages(id, cls) {
    const key = String(id) + '|' + (cls || 'G1');
    if (stillCache.has(key)) return stillCache.get(key);
    let out = null;
    const doc = G.document;
    if (doc && doc.createElement) {
      const seed = seedOf(id), time = 23 + seed, SPPU = 3, FPPU = 4;
      const mk = (R, ppu) => { const cv = doc.createElement('canvas'); cv.width = R.w * ppu; cv.height = R.h * ppu; const ctx = cv.getContext && cv.getContext('2d'); return ctx ? { cv, ctx, img: ctx.createImageData(cv.width, cv.height) } : null; };
      const sm = mk(SMOKE, SPPU), fi = mk(FIRE, FPPU);
      if (sm && fi) {
        renderSmoke(sm.img, time, seed, cls);
        sm.ctx.putImageData(sm.img, 0, 0);
        drawEmbers(sm.ctx, time, seed, SPPU, cls);
        renderFire(fi.img, time, seed, 1.2, cls);
        fi.ctx.putImageData(fi.img, 0, 0);
        const gray = (l, g) => {
          const im = l.ctx.getImageData(0, 0, l.cv.width, l.cv.height), d = im.data;
          for (let k = 0; k < d.length; k += 4) { const y = 255 * Math.pow((0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]) / 255, g); d[k] = d[k + 1] = d[k + 2] = y; }
          l.ctx.putImageData(im, 0, 0);
          return l.cv.toDataURL('image/png');
        };
        out = { smoke: { href: gray(sm, 1), x: SMOKE.x0, y: SMOKE.y0, w: SMOKE.w, h: SMOKE.h }, fire: { href: gray(fi, 1.7), x: FIRE.x0, y: FIRE.y0, w: FIRE.w, h: FIRE.h } };
      }
    }
    stillCache.set(key, out);
    return out;
  }

  function markup(id) {
    const px = (r) => ' width="' + r.w * r.ppu + '" height="' + r.h * r.ppu + '"';
    const fo = (r, fx) => '<foreignObject x="' + r.x0 + '" y="' + r.y0 + '" width="' + r.w + '" height="' + r.h + '" class="j2-r2-fo"><canvas xmlns="http://www.w3.org/1999/xhtml" data-fx="' + fx + '"' + px(r) + ' class="j2-r2-cv"></canvas></foreignObject>';
    return fo(SMOKE, 'smoke') + fo(FIRE, 'fire');           // the flames burn in front of their own smoke: its dark base is what makes them glow
  }

  return Object.freeze({ SMOKE, FIRE, FLAMES, LAYOUTS, layoutOf, stillOf, bakeNoise, renderSmoke, renderFire, fireLevel, lodOf, firePpu, smokePpu, attach, setStill, markup, stillImages, seedOf });
});
