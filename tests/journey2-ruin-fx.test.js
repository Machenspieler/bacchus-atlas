'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Fx = require('../js/journey2-ruin-fx.js');

function buf(r) {
  const width = r.w * r.ppu, height = r.h * r.ppu;
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}
const sum = (b, f) => { let s = 0; for (let i = 0; i < b.data.length; i += 4) s += f(b.data, i); return s; };
// mean alpha and mean brightness of the pixels whose row lies in [y0, y1) map units
function band(b, r, y0, y1) {
  let a = 0, lum = 0, n = 0;
  for (let py = 0; py < b.height; py++) {
    const y = r.y0 + (py + 0.5) / r.ppu;
    if (y < y0 || y >= y1) continue;
    for (let px = 0; px < b.width; px++) {
      const k = (py * b.width + px) * 4;
      a += b.data[k + 3]; n++;
      if (b.data[k + 3] > 20) lum += (b.data[k] + b.data[k + 1] + b.data[k + 2]) / 3 * b.data[k + 3];
    }
  }
  return { alpha: a / n, lum };
}

test('noise texture is deterministic, bounded and varied', () => {
  const a = Fx.bakeNoise(7), b = Fx.bakeNoise(7), c = Fx.bakeNoise(8);
  assert.deepStrictEqual(Array.from(a.slice(0, 64)), Array.from(b.slice(0, 64)));
  assert.notDeepStrictEqual(Array.from(a.slice(0, 64)), Array.from(c.slice(0, 64)));
  let lo = 1, hi = 0;
  for (const v of a) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  assert.ok(lo >= 0 && hi <= 1 && hi - lo > 0.4);
});

test('smoke: same time gives the same frame, later time a different one, never uniform', () => {
  const x = buf(Fx.SMOKE), y = buf(Fx.SMOKE), z = buf(Fx.SMOKE);
  Fx.renderSmoke(x, 3.2, 5); Fx.renderSmoke(y, 3.2, 5); Fx.renderSmoke(z, 9.7, 5);
  assert.deepStrictEqual(Buffer.from(x.data), Buffer.from(y.data));
  assert.notDeepStrictEqual(Buffer.from(x.data), Buffer.from(z.data));
  const alphas = new Set();
  for (let i = 3; i < x.data.length; i += 4) alphas.add(x.data[i] >> 4);
  assert.ok(alphas.size >= 8, 'density varies across many levels, not one grey wash');
});

test('smoke: starts at the roofs, is denser and darker at the base than aloft, transparent far away', () => {
  const t = Fx.SMOKE;
  for (const time of [2, 11, 25]) {
    const b = buf(t);
    Fx.renderSmoke(b, time, 3);
    const base = band(b, t, -14, 0), high = band(b, t, -62, -42);
    assert.ok(base.alpha > high.alpha, 'density falls with height');
    // average colour of the opaque base pixels is darker than the aloft ones
    const avg = (y0, y1) => { let c = 0, w = 0; for (let py = 0; py < b.height; py++) { const y = t.y0 + (py + 0.5) / t.ppu; if (y < y0 || y >= y1) continue; for (let px = 0; px < b.width; px++) { const k = (py * b.width + px) * 4, a = b.data[k + 3]; if (a > 20) { c += (b.data[k] + b.data[k + 1] + b.data[k + 2]) / 3 * a; w += a; } } } return c / Math.max(1, w); };
    assert.ok(avg(-14, 0) < avg(-62, -42), 'the base is darker than the top (frame at t=' + time + ')');
    // nothing far below the castle or above the plume
    assert.strictEqual(band(b, t, 19, 30).alpha, 0);
    assert.strictEqual(band(b, t, -90, -78).alpha, 0);
  }
});

test('smoke: two ruins (seeds) never show the same plume', () => {
  const a = buf(Fx.SMOKE), b = buf(Fx.SMOKE);
  Fx.renderSmoke(a, 5, 1); Fx.renderSmoke(b, 5, 2);
  assert.notDeepStrictEqual(Buffer.from(a.data), Buffer.from(b.data));
});

// the FIRE region rendered for an on-screen scale (CSS px per unit; 1.2 = 100 % zoom) at the resolution attach() would give it on a DPR-2 screen
function fireAt(time, scale, seed) {
  const ppu = Fx.firePpu(scale, 2), r = Fx.FIRE, b = { width: r.w * ppu, height: r.h * ppu, ppu };
  b.data = new Uint8ClampedArray(b.width * b.height * 4);
  Fx.renderFire(b, time, seed === undefined ? 4 : seed, scale);
  return b;
}
const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lumOf = (d, k) => 0.2126 * lin(d[k]) + 0.7152 * lin(d[k + 1]) + 0.0722 * lin(d[k + 2]);

test('fire: stays inside its region, deforms over time and has warm colours only', () => {
  const t = Fx.FIRE, a = fireAt(1, 1.2), b = fireAt(1.4, 1.2);
  assert.notDeepStrictEqual(Buffer.from(a.data), Buffer.from(b.data));
  for (let py = 0; py < a.height; py++) for (let px = 0; px < a.width; px++) {
    const k = (py * a.width + px) * 4, x = t.x0 + (px + 0.5) / a.ppu, y = t.y0 + (py + 0.5) / a.ppu;
    if (a.data[k + 3] === 0) continue;
    assert.ok(x >= -28 && x <= 28 && y >= -25 && y <= 19, 'pixel outside the castle surroundings');
    assert.ok(a.data[k] >= a.data[k + 1] && a.data[k + 1] >= a.data[k + 2], 'red >= green >= blue: fire colours only');
  }
});

test('fire at 100 %: large connected masses, not dots — and flames rise above the roofs', () => {
  for (const time of [2, 9.5, 17]) {
    const b = fireAt(time, 1.2), W = b.width, H = b.height, ppu = b.ppu, on = new Uint8Array(W * H);
    let n = 0, above = 0, top = 99;
    for (let i = 0; i < W * H; i++) if (b.data[i * 4 + 3] >= 128) { on[i] = 1; n++; const y = Fx.FIRE.y0 + (Math.floor(i / W) + 0.5) / ppu; if (y < -4) above++; if (y < top) top = y; }
    const cssArea = n / (ppu * ppu) * 1.44;
    assert.ok(cssArea > 300, 'at least ~300 CSS px² of solid flame at 100 % (V3 had ~55), got ' + cssArea.toFixed(0));
    assert.ok(above / (ppu * ppu) * 1.44 > 12, 'flames rise above the hall dome (top y -5), not only along the bottom of the icon');
    assert.ok(top < -10, 'the blaze between the buildings climbs most of the way up the tower (top y -12), reached ' + top.toFixed(1));
    // connected components (4-neighbour): the few largest hold nearly all of the flame
    const seen = new Uint8Array(W * H), sizes = [];
    for (let i = 0; i < W * H; i++) {
      if (!on[i] || seen[i]) continue;
      let c = 0; const st = [i]; seen[i] = 1;
      while (st.length) {
        const j = st.pop(); c++;
        const x = j % W, y = (j - x) / W;
        for (const k of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < H - 1 ? j + W : -1]) if (k >= 0 && on[k] && !seen[k]) { seen[k] = 1; st.push(k); }
      }
      sizes.push(c);
    }
    sizes.sort((p, q) => q - p);
    const big5 = sizes.slice(0, 5).reduce((p, q) => p + q, 0);
    assert.ok(big5 / n > 0.85, "five masses hold most of the fire (t=" + time + "): " + (big5 / n).toFixed(2));
  }
});

test('fire at 100 %: a hot light core and a dark rim (luminance contrast against the parchment, L ≈ 0.8)', () => {
  let core = 0, rim = 0, n = 0;
  for (const time of [3, 8, 13]) {
    const b = fireAt(time, 1.2);
    for (let k = 0; k < b.data.length; k += 4) {
      if (b.data[k + 3] < 128) continue;
      n++;
      const L = lumOf(b.data, k);
      if (L > 0.5) core++;
      if (L < 0.2) rim++;
    }
  }
  assert.ok(core / n > 0.2, 'a visible hot amber/yellow core: ' + (core / n).toFixed(2));
  assert.ok(rim / n > 0.05, 'a darker orange-red body and rim that separates the silhouette from the paper: ' + (rim / n).toFixed(2));
  assert.ok(core / n < 0.6, 'not a yellow blob: most of the flame stays orange-red');
});

test('fire level of detail: bold silhouette at small sizes, detail flames only when zoomed in; canvas follows the device pixels', () => {
  assert.strictEqual(Fx.lodOf(1.08), 0); assert.strictEqual(Fx.lodOf(1.2), 0); assert.strictEqual(Fx.lodOf(4), 1);
  assert.ok(Fx.lodOf(1.8) > 0 && Fx.lodOf(1.8) < 1);
  for (let s = 0.5; s < 6; s += 0.1) assert.ok(Fx.lodOf(s + 0.1) >= Fx.lodOf(s));
  assert.strictEqual(Fx.firePpu(1.2, 2), 2.5); assert.strictEqual(Fx.firePpu(1.2, 1), 1.5); assert.strictEqual(Fx.firePpu(4.8, 2), 6); assert.strictEqual(Fx.firePpu(1.8, 2), 4);
  assert.strictEqual(Fx.firePpu(0.2, 1), 0.5, 'a zoomed-out map gets a small, cheap canvas');
  for (let s = 0.1; s < 6; s += 0.07) for (const dpr of [1, 2, 3]) assert.ok(Fx.firePpu(s, dpr) >= Math.min(6, s * dpr - 1e-9), 'never fewer canvas pixels than device pixels (no upscaled blur) below the cap');
  // the smoke keeps its designed 2 px/unit at 100 % on every screen; only a zoomed-out map lowers it
  assert.strictEqual(Fx.smokePpu(1.2, 1), 2); assert.strictEqual(Fx.smokePpu(1.2, 2), 2); assert.strictEqual(Fx.smokePpu(1.08, 2), 2);
  assert.strictEqual(Fx.smokePpu(0.6, 1), 1); assert.strictEqual(Fx.smokePpu(0.6, 2), 2); assert.strictEqual(Fx.smokePpu(0.3, 1), 0.5); assert.strictEqual(Fx.smokePpu(0.3, 2), 1);
  // the dome flame (rank 1, around x -8, y -6..-12) is absent at 100 % and present at 300 %
  const domeAlpha = (scale) => { const b = fireAt(6, scale); let a = 0; for (let py = 0; py < b.height; py++) { const y = Fx.FIRE.y0 + (py + 0.5) / b.ppu; if (y < -12 || y > -6) continue; for (let px = 0; px < b.width; px++) { const x = Fx.FIRE.x0 + (px + 0.5) / b.ppu; if (x > -11 && x < -5) a += b.data[(py * b.width + px) * 4 + 3]; } } return a / (b.ppu * b.ppu); };
  assert.strictEqual(domeAlpha(1.2), 0);
  assert.ok(domeAlpha(3.6) > 0);
  // the same render at a different resolution keeps the same picture (the canvas size is resolution, not look)
  const lo = fireAt(5, 1.2), hi = (() => { const r = Fx.FIRE, b = { width: r.w * 5, height: r.h * 5, ppu: 5 }; b.data = new Uint8ClampedArray(b.width * b.height * 4); Fx.renderFire(b, 5, 4, 1.2); return b; })();
  const cover = b => { let c = 0; for (let k = 3; k < b.data.length; k += 4) if (b.data[k] >= 128) c++; return c / (b.ppu * b.ppu); };
  assert.ok(Math.abs(cover(lo) - cover(hi)) / cover(hi) < 0.08, 'coverage is resolution-independent');
});

test('fire level stays in a restrained band', () => {
  for (let t = 0; t < 120; t += 0.37) { const v = Fx.fireLevel(t, 3); assert.ok(v > 0.5 && v < 1.35); }
});

test('markup is two non-interactive canvases and the view wires it for every screen ruin', () => {
  const m = Fx.markup('x');
  assert.match(m, /data-fx="fire"/); assert.match(m, /data-fx="smoke"/);
  assert.ok(m.indexOf('data-fx="smoke"') < m.indexOf('data-fx="fire"'), 'the flames burn in front of their smoke');
  const view = fs.readFileSync(path.join(__dirname, '..', 'js', 'journey2-view.js'), 'utf8');
  assert.doesNotMatch(view, /RUIN_V2_COUNT/);
  assert.match(view, /Journey2RuinFx\.attach\(ui\.g\.ruins\)/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'journey2.css'), 'utf8');
  assert.match(css, /\.j2-r2-fo \{[^}]*pointer-events: none/);
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.indexOf('journey2-ruin-fx.js') < html.indexOf('journey2-view.js'));
});

test('fire: no thin horizontal strokes (regression: unbounded tongue product drew one-pixel-tall lines) and no hard-edged rectangle, at every level of detail', () => {
  for (const scale of [1.08, 1.2, 1.8, 3.6]) for (const time of [0.5, 3.4, 7, 12.2, 19.9, 31]) {
    const b = fireAt(time, scale);
    const A = (px, py) => (px < 0 || py < 0 || px >= b.width || py >= b.height ? 0 : b.data[(py * b.width + px) * 4 + 3]);
    for (let py = 0; py < b.height; py++) {
      let lone = 0;
      for (let px = 0; px < b.width; px++) if (A(px, py) > 60 && A(px, py - 1) < 15 && A(px, py + 1) < 15) lone++;
      assert.ok(lone <= 2, 'row ' + py + ' at t=' + time + ' scale ' + scale + ' has a horizontal stroke');
    }
    for (let px = 0; px < b.width; px++) for (const py of [0, b.height - 1]) assert.ok(A(px, py) < 3, 'fire touches the canvas edge');
    for (let py = 0; py < b.height; py++) for (const px of [0, b.width - 1]) assert.ok(A(px, py) < 3, 'fire touches the canvas edge');
  }
});

test('fire distribution: one tall blaze that never dies down, secondary pockets that do, and gaps between them (never a continuous wall)', () => {
  const blaze = Fx.FLAMES[0];
  assert.strictEqual(blaze[9], 0, 'the central blaze never breathes');
  for (const f of Fx.FLAMES.slice(1)) { assert.ok(f[9] > 0, 'every secondary pocket dies down now and then'); assert.ok(f[2] < blaze[2], 'and is lower than the blaze'); }
  let area = 0, masses = 0;
  const N = 12;
  for (let k = 0; k < N; k++) {
    const b = fireAt(3 + k * 2.3, 1.2), W = b.width, on = new Uint8Array(W * b.height);
    for (let i = 0; i < on.length; i++) if (b.data[i * 4 + 3] >= 128) { on[i] = 1; area++; }
    const seen = new Uint8Array(on.length);
    for (let i = 0; i < on.length; i++) {
      if (!on[i] || seen[i]) continue;
      let c = 0; const st = [i]; seen[i] = 1;
      while (st.length) { const j = st.pop(); c++; const x = j % W; for (const q of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, j - W, j + W]) if (q >= 0 && q < on.length && on[q] && !seen[q]) { seen[q] = 1; st.push(q); } }
      if (c / (b.ppu * b.ppu) * 1.44 >= 6) masses++;
    }
  }
  const ppu = Fx.firePpu(1.2, 2), css = area / N / (ppu * ppu) * 1.44;
  assert.ok(css > 400 && css < 540, 'about 470 CSS px² of solid flame at 100 % (V4 before the correction: ~606), got ' + css.toFixed(0));
  assert.ok(masses / N >= 4, 'at least four separate masses on average: ' + (masses / N).toFixed(1));
});
