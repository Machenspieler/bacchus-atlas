/* Pan probe (dev-only, never deployed). Paste into the DevTools console of #/journey (or load it with fetch + eval, see README in the reply).
   It pans the REAL map the way the app does (debugApi().setCamera -> scheduleApply) for a few seconds per variant, measures every animation frame
   and the browser's long-animation-frame entries, and for each variant temporarily hides ONE part of the page so the cost of that part shows up
   as a drop in p95 / worst frame. Everything is restored at the end. Keep the tab in front and do not touch the mouse while it runs (~55 s). Undock DevTools into its own window first so the map has the full window size. */
(async function () {
  'use strict';
  const V = window.Journey2View, A = V && V.debugApi && V.debugApi();
  if (!A) { console.error('Open #/journey first (the map must be mounted).'); return; }
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const world = $('.j2-world');
  const g = n => $$('[data-j2-g="' + n + '"]');
  const styleEl = document.createElement('style'); document.head.appendChild(styleEl);
  const hide = sel => sel + ' { display: none !important; }';
  const variants = [
    ['baseline (everything on)', ''],
    ['shadow canvases hidden', hide('.j2-sbfx-fo')],
    ['tear mask off (ground unmasked)', '.j2-ground { -webkit-mask-image: none !important; mask-image: none !important; }'],
    ['cosmos (nebula) hidden', hide('.j2-cosmos')],
    ['tiles + tint + glyph layers hidden', hide('[data-j2-g="tiles"]') + hide('[data-j2-g="tint"]')],
    ['fog + perimeters hidden', hide('[data-j2-g="fog"]') + hide('[data-j2-g="perimeter"]') + hide('[data-j2-g="perimeterPlayer"]') + hide('[data-j2-g="player"]')],
    ['echoes + ruins + sanctuary layers hidden', hide('[data-j2-g="echoes"]') + hide('[data-j2-g="ruins"]') + hide('[data-j2-g="sanct"]') + hide('[data-j2-g="sanctlabels"]')],
    ['whole overlay SVG hidden', hide('.j2-overlay')],
    ['base map image hidden', hide('.j2-base')],
    ['layer promotion forced off (no will-change)', '.j2-world, .j2-world.is-cam-active { will-change: auto !important; }'],
    ['layer promotion forced on', '.j2-world, .j2-world.is-cam-active { will-change: transform !important; }'],
  ];

  const pct = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;
  const start = V.debugState().camera;
  const sc = start.scale;

  async function run(label, css, ms, mode) {
    const vp = $('.j2-viewport'), rc = vp.getBoundingClientRect(), cx = rc.left + rc.width * 0.6, cy = rc.top + rc.height * 0.5, ev = (type, x, y) => vp.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', isPrimary: true, button: type === 'pointermove' ? -1 : 1, buttons: type === 'pointerup' ? 0 : 4, clientX: x, clientY: y }));
    styleEl.textContent = css;
    A.setCamera({ scale: sc, tx: start.tx, ty: start.ty });
    await new Promise(r => setTimeout(r, 900));                       // let layers settle after the style change
    const deltas = [], loaf = [];
    let po = null;
    try { po = new PerformanceObserver(l => { for (const e of l.getEntries()) loaf.push(e); }); po.observe({ type: 'long-animation-frame', buffered: false }); } catch (e) { po = null; }
    let last = 0;
    const t0 = performance.now();
    await new Promise(done => {
      (function f(now) {
        if (last) deltas.push(now - last);
        last = now;
        const t = (now - t0) / 1000, dx = Math.sin(t * 1.6) * 380, dy = Math.cos(t * 1.1) * 160;     // a steady drag, no pointer events
        A.setCamera({ scale: sc, tx: start.tx + dx, ty: start.ty + dy });
        if (now - t0 < ms) requestAnimationFrame(f); else done();
      })(t0);
      requestAnimationFrame(function g0() {});
    });
    if (mode === 'pointer') ev('pointerup', cx, cy);
    if (po) po.disconnect();
    const s = deltas.slice(1).sort((a, b) => a - b);
    const sum = k => loaf.reduce((a, e) => a + (e[k] || 0), 0);
    return {
      variant: (mode === 'pointer' ? '[mouse events] ' : '[camera only] ') + label, frames: s.length, fps: +(1000 / (s.reduce((a, b) => a + b, 0) / (s.length || 1))).toFixed(1),
      p50: +pct(s, .5).toFixed(1), p95: +pct(s, .95).toFixed(1), worst: +(s[s.length - 1] || 0).toFixed(1), over20: s.filter(x => x > 20).length, over33: s.filter(x => x > 33).length,
      loaf: loaf.length, loafMs: +sum('duration').toFixed(0), scriptMs: +loaf.reduce((a, e) => a + (e.scripts || []).reduce((b, x) => b + x.duration, 0), 0).toFixed(0),
      renderMs: +loaf.reduce((a, e) => a + Math.max(0, (e.startTime + e.duration) - (e.renderStart || (e.startTime + e.duration))), 0).toFixed(0),
    };
  }

  const out = [];
  for (const [label, css] of variants) { out.push(await run(label, css, 3500, 'camera')); }
  for (const i of [0, 1, 6, 7]) { out.push(await run(variants[i][0], variants[i][1], 3500, 'pointer')); }
  styleEl.remove();
  A.setCamera({ scale: sc, tx: start.tx, ty: start.ty });
  const info = { zoom: Math.round(sc * 100) + '%', dpr: devicePixelRatio, viewport: innerWidth + 'x' + innerHeight, tiles: (V.debugState().tiles || []).length,
    shadowFx: (V.debugState().shadowFx || {}).quality, shadowAreas: (V.debugState().shadowFx || {}).areas };
  console.log('PAN PROBE', info); console.table(out);
  const text = JSON.stringify({ info, out });
  window.__panProbe = text; console.log(text);
  try { copy(text); console.log('Result copied to the clipboard (if it is empty, copy the JSON line above).'); } catch (e) { /* console.table above is enough */ }
  return { info, out };
})();
