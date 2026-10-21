/* Real-drag recorder (dev-only, never deployed). Paste into the DevTools console of #/journey, then drag the map with your REAL mouse for ~12 seconds
   (left button on an empty spot, or hold the middle button). It records every animation frame, every pointermove interval and every long task, and prints
   a summary. Nothing is changed on the page. Run it at 100 %, 67 % and 150 % and compare. */
(function () {
  'use strict';
  const SECONDS = 12;
  const vp = document.querySelector('.j2-viewport');
  if (!vp) { console.error('Open #/journey first.'); return; }
  const frames = [], moves = [], tasks = [];
  let last = 0, lastMove = 0, down = false, t0 = performance.now(), stop = false;
  const onDown = () => { down = true; }, onUp = () => { down = false; };
  const onMove = e => { if (!down) return; const t = e.timeStamp; if (lastMove) moves.push(t - lastMove); lastMove = t; };
  vp.addEventListener('pointerdown', onDown, true); window.addEventListener('pointerup', onUp, true);
  vp.addEventListener('pointermove', onMove, true);
  let po = null;
  try { po = new PerformanceObserver(l => l.getEntries().forEach(e => tasks.push(e.duration))); po.observe({ type: 'longtask', buffered: false }); } catch (e) { /* unsupported */ }
  let refreshHz = 0;
  const hzFrames = []; (function hz(n) { hzFrames.push(n); if (hzFrames.length < 120) requestAnimationFrame(hz); else refreshHz = 1000 / ((hzFrames[119] - hzFrames[0]) / 119); })(performance.now());
  console.log('Recording for ' + SECONDS + ' s — drag the map now…');
  (function f(now) {
    if (down && last) frames.push(now - last);                        // only frames that happen while a button is held
    last = now;
    if (now - t0 < SECONDS * 1000) requestAnimationFrame(f); else finish();
  })(t0);
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1) : null; };
  function finish() {
    vp.removeEventListener('pointerdown', onDown, true); window.removeEventListener('pointerup', onUp, true); vp.removeEventListener('pointermove', onMove, true);
    if (po) po.disconnect();
    const r = {
      zoom: document.querySelector('.j2-zoom-readout, [data-j2-zoom]') ? document.querySelector('.j2-zoom-readout, [data-j2-zoom]').textContent : '?',
      displayRefreshHz: +refreshHz.toFixed(0), dpr: devicePixelRatio, viewport: innerWidth + 'x' + innerHeight,
      framesWhileDragging: frames.length, frameMs: { p50: q(frames, .5), p95: q(frames, .95), p99: q(frames, .99), worst: q(frames, 1) },
      over20: frames.filter(x => x > 20).length, over33: frames.filter(x => x > 33).length,
      mouseEventsWhileDragging: moves.length, mouseIntervalMs: { p50: q(moves, .5), p95: q(moves, .95), worst: q(moves, 1) },
      longTasks: tasks.length, longTaskMs: tasks.map(x => Math.round(x)).slice(0, 12),
    };
    window.__panRecord = r; console.log('PAN RECORD', JSON.stringify(r)); console.table([r.frameMs, r.mouseIntervalMs]);
  }
})();
