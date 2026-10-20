/* Page logic for the GPU bench pages. <body data-page="baseline|echoes|shadow|ruins|combined">. See bench.js. */
(async function () {
  'use strict';
  const page = document.body.dataset.page;
  const B = await Bench.load();
  const ui = B.buildWorld();
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const fmt = (n, d) => Number(n).toFixed(d);
  const state = { tiles: false, scale: 1 };
  let statsFn = null;

  /* ---------- shared controls ---------- */
  B.controls(
    '<label>Zoom <select id="c-zoom"><option value="0.5">50%</option><option value="1" selected>100%</option><option value="2">200%</option></select></label> ' +
    '<label><input type="checkbox" id="c-tiles"> Draw all hexes as tiles (a played map has them)</label> ');
  document.getElementById('c-zoom').onchange = e => { state.scale = +e.target.value; B.setCamera(state.scale, focus()); };
  document.getElementById('c-tiles').onchange = e => { state.tiles = e.target.checked; B.drawTiles(state.tiles); };
  let focusPoint = B.anchors.find(a => a.stableId === 'mk-001').worldPixelAnchor;
  function focus() { return focusPoint; }

  /* ---------- Soul Echoes (copy of the view's markup: the real CSS in css/journey2.css animates it) ---------- */
  function echoes() {
    const fmtn = (n, d) => Number(n).toFixed(d).replace(/\.?0+$/, '');
    const arc = (r, phi, span, w, seed) => {
      const n = 12, out = [], inn = [];
      for (let k = 0; k <= n; k++) {
        const u = k / n * 2 - 1, th = (phi + u * span) * Math.PI / 180;
        const half = w / 2 * Math.pow(Math.cos(u * Math.PI / 2), 0.85), wob = 0.2 * Math.sin(seed + u * 5.3);
        out.push([Math.cos(th) * (r + half + wob), Math.sin(th) * (r + half + wob)]);
        inn.push([Math.cos(th) * (r - half + wob), Math.sin(th) * (r - half + wob)]);
      }
      return 'M' + out.concat(inn.reverse()).map(p => fmtn(p[0], 2) + ' ' + fmtn(p[1], 2)).join(' ') + 'Z';
    };
    const ring = (r, rot, w, seed) => [0, 128, 236].map((p, k) => arc(r, rot + p, k === 1 ? 40 : 46, w, seed + k * 1.9)).join('');
    const LIVE =
      '<circle class="j2-echo-halo" r="15" fill="url(#j2-echo-halo)"/>' +
      [[6.6, -60, 1.7], [11, 5, 1.45], [15.4, -25, 1.2]].map((w, i) =>
        '<g class="j2-echo-wave j2-echo-w' + (i + 1) + '"><circle r="' + w[0] + '" fill="none"/><path d="' + ring(w[0], w[1], w[2], i * 1.7) + '"/></g>').join('') +
      '<g class="j2-echo-orb"><circle r="3.2" fill="url(#j2-echo-orb)" stroke="#123d8a" stroke-width=".75"/><circle r="1.1" fill="#fff"/></g>';
    ui.defs.innerHTML =
      '<radialGradient id="j2-echo-halo"><stop offset="0" stop-color="#7cc4f4" stop-opacity=".37"/><stop offset=".45" stop-color="#3f86de" stop-opacity=".13"/><stop offset="1" stop-color="#2a5fd6" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="j2-echo-orb"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#bfeaff"/><stop offset="1" stop-color="#2f74d0"/></radialGradient>';

    let count = 9, mode = 'css', timer = 0, own = false;
    function stop() { if (timer) { clearTimeout(timer); timer = 0; } }
    function draw() {
      stop();
      // the nine sanctuaries nearest the focus point, so they are all on screen at 100 %
      const near = B.sanctuaries().map(s => ({ s, d: Math.hypot(s.worldPixelAnchor[0] - focusPoint[0], s.worldPixelAnchor[1] - focusPoint[1]) })).sort((a, b) => a.d - b.d).slice(0, count).map(x => x.s);
      ui.host.querySelectorAll('[data-echo]').forEach(n => n.remove());
      if (own) {
        ui.echoes.innerHTML = '';
        near.forEach((s, i) => {
          const r = s.iconProtectionArea.rectPx, x = r[0] + r[2] / 2, y = r[1] - 26, d = document.createElement('div');
          d.setAttribute('data-echo', ''); d.className = 'j2-overlay';
          d.style.cssText = 'position:absolute;left:' + (x - 40) + 'px;top:' + (y - 40) + 'px;width:80px;height:80px;will-change:transform;pointer-events:none';
          d.innerHTML = '<svg xmlns="' + SVG_NS + '" width="80" height="80" viewBox="-40 -40 80 80"><g class="j2-echo" style="--j2-echo-i:' + i + '"><g transform="scale(1.3)">' + LIVE + '</g></g></svg>';
          ui.host.appendChild(d);
        });
      } else ui.echoes.innerHTML = near.map((s, i) => {
        const r = s.iconProtectionArea.rectPx, x = r[0] + r[2] / 2, y = r[1] - 26;
        return '<g class="j2-echo" style="--j2-echo-i:' + i + '"><g transform="translate(' + fmt(x, 1) + ' ' + fmt(y, 1) + ') scale(1.3)">' + LIVE + '</g></g>';
      }).join('');
      ui.echoes.style.display = ui.host.style.display = mode === 'off' ? 'none' : '';
      if (mode === 'stepped') {
        const anims = (own ? ui.host : ui.echoes).getAnimations({ subtree: true });
        for (const a of anims) a.pause();
        const t0 = performance.now();
        (function step() { timer = setTimeout(step, 125); const t = performance.now() - t0; for (const a of anims) a.currentTime = t; })();
      }
      if (mode === 'frozen') for (const a of (own ? ui.host : ui.echoes).getAnimations({ subtree: true })) a.pause();
    }
    B.controls(
      '<label>Layering <select id="c-elayer"><option value="svg">inside the map SVG (now)</option><option value="own">own layers (HTML overlay)</option></select></label> ' +
      '<label>Echoes <select id="c-ecount"><option>1</option><option>3</option><option selected>9</option></select></label> ' +
      '<label>Animation <select id="c-emode"><option value="css">CSS, every frame (the old way)</option><option value="stepped">stepped ~8 fps (current code)</option><option value="frozen">frozen (still frame)</option><option value="off">layer hidden</option></select></label> ');
    document.getElementById('c-ecount').onchange = e => { count = +e.target.value; draw(); };
    document.getElementById('c-elayer').onchange = e => { own = e.target.value === 'own'; draw(); };
    document.getElementById('c-emode').onchange = e => { mode = e.target.value; draw(); };
    draw();
    return () => 'echoes ' + count + ' · ' + mode + (own ? ' · own layers' : ' · in SVG');
  }

  /* ---------- living shadow (the real module) ---------- */
  function shadow() {
    const Fx = window.Journey2ShadowblightFx;
    const fx = Fx.create({
      grid: B.grid, worldSize: B.template.worldSizePx, shadowGroup: ui.blight, rimGroup: ui.tear, defs: ui.defs, ground: ui.ground, world: ui.world, cosmos: ui.cosmos,
      cosmosImage: { url: '../../img/journey2/void-nebula.webp', width: 1920, height: 1080 }, protections: [],
      baseHref: ui.ground.querySelector('img').src, reducedMotion: false,
    });
    B.onCamera = (cam, vw, vh) => fx.setCamera(cam, vw, vh);
    let cells = 30, tear = 0, areas = 1, own = false;
    new MutationObserver(() => { if (own) B.lift(ui.blight); }).observe(ui.blight, { childList: true });
    function apply() {
      const blighted = [], overtaken = [];
      const spots = [focusPoint, [focusPoint[0] + 700, focusPoint[1] + 120], [focusPoint[0] - 600, focusPoint[1] + 500]].slice(0, areas);
      spots.forEach(p => B.cluster(p, cells).forEach(id => blighted.push(id)));
      if (tear) B.cluster([focusPoint[0] + 250, focusPoint[1] + 500], tear).forEach(id => overtaken.push(id));
      fx.setCells({ blighted: blighted.filter(id => !overtaken.includes(id)), overtaken });
      fx.setCamera(B.cam, ui.vp.clientWidth, ui.vp.clientHeight);
      if (own) B.lift(ui.blight);
    }
    B.controls(
      '<label>Layering <select id="c-slayer"><option value="svg">canvas inside the map SVG (now)</option><option value="own">own layers (HTML overlay)</option></select></label> ' +
      '<label>Cells per area <select id="c-scells"><option>7</option><option selected>30</option><option>90</option></select></label> ' +
      '<label>Areas <select id="c-sareas"><option selected>1</option><option>2</option><option>3</option></select></label> ' +
      '<label>Torn hole (cells) <select id="c-stear"><option value="0">none</option><option value="7">7</option><option value="30">30</option></select></label> ' +
      '<label><input type="checkbox" id="c-spause"> Pause the shadow</label> ');
    document.getElementById('c-slayer').onchange = e => { if (e.target.value === 'own') { own = true; B.lift(ui.blight); } else location.reload(); };
    document.getElementById('c-scells').onchange = e => { cells = +e.target.value; apply(); };
    document.getElementById('c-sareas').onchange = e => { areas = +e.target.value; apply(); };
    document.getElementById('c-stear').onchange = e => { tear = +e.target.value; apply(); };
    document.getElementById('c-spause').onchange = e => fx.setPaused(e.target.checked);
    apply();
    return () => { const s = fx.stats(); return 'shadow ' + s.backend + ' · ' + s.quality + ' · ' + s.updatesPerSec + ' draws/s · ' + s.avgCost.toFixed(2) + ' ms · visible ' + s.visible + '/' + s.areas + ' · ' + Math.round(s.pixels / 1000) + ' kpx'; };
  }

  /* ---------- ruins: smoke + fire canvases (the real module) ---------- */
  function ruins() {
    const Fx = window.Journey2RuinFx;
    let count = 5, own = false;
    function draw() {
      B.unlift();
      const near = B.sanctuaries().map(s => ({ s, d: Math.hypot(s.worldPixelAnchor[0] - focusPoint[0], s.worldPixelAnchor[1] - focusPoint[1]) })).sort((a, b) => a.d - b.d).slice(0, count).map(x => x.s);
      ui.ruins.innerHTML = near.map(s => {
        const r = s.iconProtectionArea.rectPx;
        return '<g class="j2-ruin j2-ruin2" data-ruin="' + s.stableId + '" data-glyph="' + (s.glyphClass || 'G1') + '" transform="translate(' + fmt(r[0] + r[2] / 2, 1) + ' ' + fmt(r[1] + r[3] / 2, 1) + ') scale(1.2)">' + Fx.markup(s.stableId) + '</g>';
      }).join('');
      Fx.attach(ui.ruins);
      if (own) B.lift(ui.ruins);
    }
    B.controls('<label>Layering <select id="c-rlayer"><option value="svg">canvas inside the map SVG (now)</option><option value="own">own layers (HTML overlay)</option></select></label> <label>Ruins <select id="c-rcount"><option>1</option><option selected>5</option></select></label> ');
    document.getElementById('c-rlayer').onchange = e => { own = e.target.value === 'own'; draw(); };
    document.getElementById('c-rcount').onchange = e => { count = +e.target.value; draw(); };
    draw();
    return () => 'ruins ' + count;
  }

  const parts = [];
  if (page === 'echoes' || page === 'combined') parts.push(echoes());
  if (page === 'shadow' || page === 'combined') parts.push(shadow());
  if (page === 'ruins' || page === 'combined') parts.push(ruins());
  Bench.hud(() => parts.map(p => p()).join('  |  ') || 'static map, nothing animated');
  if (!parts.length) document.getElementById('hud').lastElementChild.textContent = 'static map, nothing animated';
})();
