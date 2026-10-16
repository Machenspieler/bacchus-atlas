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

test('fire: stays inside the castle footprint, deforms over time and has warm colours only', () => {
  const t = Fx.FIRE, a = buf(t), b = buf(t);
  Fx.renderFire(a, 1, 4); Fx.renderFire(b, 1.4, 4);
  assert.notDeepStrictEqual(Buffer.from(a.data), Buffer.from(b.data));
  for (let py = 0; py < a.height; py++) for (let px = 0; px < a.width; px++) {
    const k = (py * a.width + px) * 4, x = t.x0 + (px + 0.5) / t.ppu, y = t.y0 + (py + 0.5) / t.ppu;
    if (a.data[k + 3] === 0) continue;
    assert.ok(x >= -29 && x <= 29 && y >= -16 && y <= 22, 'pixel outside the footprint');
    assert.ok(a.data[k] >= a.data[k + 2], 'red is never weaker than blue');
  }
  assert.ok(sum(a, (d, i) => d[i + 3] > 40 ? 1 : 0) > 50, 'something visibly burns');
});

test('fire level stays in a restrained band', () => {
  for (let t = 0; t < 120; t += 0.37) { const v = Fx.fireLevel(t, 3); assert.ok(v > 0.5 && v < 1.35); }
});

test('markup is two non-interactive canvases and the view wires it for the prototype only', () => {
  const m = Fx.markup('x');
  assert.match(m, /data-fx="fire"/); assert.match(m, /data-fx="smoke"/);
  assert.ok(m.indexOf('data-fx="fire"') < m.indexOf('data-fx="smoke"'), 'smoke is drawn over the flames');
  const view = fs.readFileSync(path.join(__dirname, '..', 'js', 'journey2-view.js'), 'utf8');
  assert.match(view, /RUIN_V2_COUNT = 1/);
  assert.match(view, /Journey2RuinFx\.attach\(ui\.g\.ruins\)/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'journey2.css'), 'utf8');
  assert.match(css, /\.j2-r2-fo \{[^}]*pointer-events: none/);
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.indexOf('journey2-ruin-fx.js') < html.indexOf('journey2-view.js'));
});

test('fire: no thin horizontal strokes (regression: unbounded tongue product drew one-pixel-tall lines) and no hard-edged rectangle', () => {
  const t = Fx.FIRE;
  for (const time of [0.5, 3.4, 7, 12.2, 19.9, 31]) {
    const b = buf(t);
    Fx.renderFire(b, time, 4);
    const A = (px, py) => (px < 0 || py < 0 || px >= b.width || py >= b.height ? 0 : b.data[(py * b.width + px) * 4 + 3]);
    for (let py = 0; py < b.height; py++) {
      let lone = 0;
      for (let px = 0; px < b.width; px++) if (A(px, py) > 60 && A(px, py - 1) < 15 && A(px, py + 1) < 15) lone++;
      assert.ok(lone <= 2, 'row ' + py + ' at t=' + time + ' has a horizontal stroke');
    }
    for (let px = 0; px < b.width; px++) for (const py of [0, b.height - 1]) assert.ok(A(px, py) < 3, 'fire touches the canvas edge');
    for (let py = 0; py < b.height; py++) for (const px of [0, b.width - 1]) assert.ok(A(px, py) < 3, 'fire touches the canvas edge');
  }
});
