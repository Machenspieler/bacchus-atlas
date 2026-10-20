/* GPU bench harness (dev-only, never deployed: scripts/ is excluded from dist/).
   Builds a small copy of the Journey world (real map raster, real hex grid, real css/journey2.css) and lets each page switch ONE kind of animated
   element on, so Task Manager's GPU "3D" graph can be read for it alone. Open via the repo's dev server (npx serve .) at /scripts/gpu-bench/<page>.html.
   Each page also shows a HUD: rAF frames per second and the longest frame in the last second (the page's own cost, not the GPU's). */
(function () {
  'use strict';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

  const Bench = {
    world: null, ui: null, cam: { scale: 1, tx: 0, ty: 0 }, template: null, anchors: null, grid: null,

    async load() {
      const [template, anchorsDoc] = await Promise.all([
        fetch('../../data/journey2/map-template.json').then(r => r.json()),
        fetch('../../data/journey2/map-anchors.json').then(r => r.json()),
      ]);
      Bench.template = template; Bench.anchors = anchorsDoc.anchors;
      Bench.grid = window.Journey2Geometry.createGrid(template.grid);
      return Bench;
    },

    /** Viewport + camera-transformed world (ground raster, overlay SVG with the same layer groups the view uses). Returns the pieces. */
    buildWorld() {
      const W = Bench.template.worldSizePx[0], H = Bench.template.worldSizePx[1];
      const vp = document.getElementById('viewport');
      vp.innerHTML =
        '<div class="j2-cosmos" data-cosmos></div>' +
        '<div class="j2-world" id="world" style="width:' + W + 'px;height:' + H + 'px">' +
          '<div class="j2-ground" data-ground><img class="j2-base" alt="" src="../../' + Bench.template.assembledAsset.path.replace('valloren-world.webp', 'valloren-world-light.webp') + '" width="' + W + '" height="' + H + '"></div>' +
          '<svg class="j2-overlay" xmlns="' + SVG_NS + '" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' +
            '<defs data-defs></defs><defs data-sbfx-defs></defs>' +
            '<g data-g="tint"></g><g data-g="blight" pointer-events="none"></g><g data-g="tear" pointer-events="none"></g><g data-g="tiles"></g>' +
            '<g data-g="sanct"></g><g data-g="echoes"></g><g data-g="ruins"></g>' +
          '</svg>' +
          '<div data-host style="position:absolute;left:0;top:0;width:' + W + 'px;height:' + H + 'px;pointer-events:none"></div>' +
        '</div>';
      const q = s => vp.querySelector(s), g = n => vp.querySelector('[data-g="' + n + '"]');
      Bench.ui = { vp, world: q('#world'), ground: q('[data-ground]'), cosmos: q('[data-cosmos]'), defs: q('[data-sbfx-defs]'),
        host: q('[data-host]'), svg: q('.j2-overlay'), tint: g('tint'), blight: g('blight'), tear: g('tear'), tiles: g('tiles'), echoes: g('echoes'), ruins: g('ruins'), W, H };
      Bench.setCamera(Bench.cam.scale, Bench.anchors.find(a => a.stableId === 'mk-001').worldPixelAnchor);
      return Bench.ui;
    },

    /** Scale `scale`, world point `at` in the middle of the viewport. */
    setCamera(scale, at) {
      const r = Bench.ui.vp.getBoundingClientRect();
      Bench.cam = { scale, tx: r.width / 2 - at[0] * scale, ty: r.height / 2 - at[1] * scale };
      Bench.ui.world.style.transformOrigin = '0 0';
      Bench.ui.world.style.transform = 'translate(' + Bench.cam.tx + 'px,' + Bench.cam.ty + 'px) scale(' + scale + ')';
      Bench.onCamera && Bench.onCamera(Bench.cam, r.width, r.height);
    },

    sanctuaries() { return Bench.anchors.filter(a => a.kind === 'sanctuary'); },

    /** `n` edge-connected cell ids (from the grid's valid cells) around a world point. */
    cluster(at, n) {
      const g = Bench.grid, f = g.worldToCell(at[0], at[1]), start = [f.q, f.r];
      const seen = new Set([start.join(',')]), queue = [start], out = [];
      while (queue.length && out.length < n) {
        const c = queue.shift();
        if (g.isValid(c[0], c[1])) out.push(c[0] + ',' + c[1]);
        for (const d of dirs) { const nb = [c[0] + d[0], c[1] + d[1]], k = nb.join(','); if (!seen.has(k)) { seen.add(k); queue.push(nb); } }
      }
      return out;
    },

    /** Optional load that every real map has: ~all hexes drawn as filled tiles in the tiles layer, so repaints cost what they cost on a played map. */
    drawTiles(on) {
      const g = Bench.ui.tiles; g.innerHTML = '';
      if (!on) return;
      let d = '';
      Bench.grid.forEachValidCell((q, r) => { d += Bench.grid.cellPath ? Bench.grid.cellPath(q, r) : ''; });
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d); p.setAttribute('fill', '#7bb06a'); p.setAttribute('fill-opacity', '.25'); p.setAttribute('stroke', '#222'); p.setAttribute('stroke-width', '2');
      g.appendChild(p);
    },

    /** HUD: fps, longest frame, plus whatever extra lines a page sets. */
    hud(extra) {
      const el = document.getElementById('hud');
      let frames = 0, worst = 0, last = performance.now(), t0 = last;
      (function tick(now) {
        frames++; worst = Math.max(worst, now - last); last = now;
        if (now - t0 >= 1000) {
          el.firstElementChild.textContent = frames + ' fps (rAF) · worst frame ' + worst.toFixed(0) + ' ms' + (document.hidden ? ' · TAB HIDDEN' : '');
          frames = 0; worst = 0; t0 = now;
          if (extra) el.lastElementChild.textContent = extra();
        }
        requestAnimationFrame(tick);
      })(last);
    },

    /** "Own layers" experiment: moves every canvas out of its <foreignObject> (inside the map's one big SVG) into an HTML div over the world, at the same
     *  world position, with its own compositor layer (will-change). Re-run after the effect rebuilds its canvases; stale divs are dropped. */
    lift(scope) {
      const ui = Bench.ui;
      for (const d of Array.from(ui.host.querySelectorAll('[data-lift]'))) if (!d.__fo.isConnected) d.remove();
      scope.querySelectorAll('foreignObject').forEach(fo => {
        const cv = fo.querySelector('canvas');
        if (!cv || fo.__lifted) return;
        fo.__lifted = true;
        let M = new DOMMatrix();
        for (let n = fo.parentNode; n && n !== ui.svg; n = n.parentNode) {                // compose the SVG groups' own transforms, outermost first
          const l = n.transform && n.transform.baseVal && n.transform.baseVal.consolidate();
          if (l) M = new DOMMatrix([l.matrix.a, l.matrix.b, l.matrix.c, l.matrix.d, l.matrix.e, l.matrix.f]).multiply(M);
        }
        M = M.translate(+fo.getAttribute('x'), +fo.getAttribute('y'));
        const d = document.createElement('div');
        d.setAttribute('data-lift', ''); d.__fo = fo;
        d.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;pointer-events:none;width:' + fo.getAttribute('width') + 'px;height:' + fo.getAttribute('height') + 'px;transform:' + M.toString();
        d.appendChild(cv);
        fo.style.display = 'none';
        ui.host.appendChild(d);
      });
    },
    unlift() { Bench.ui.host.querySelectorAll('[data-lift]').forEach(n => n.remove()); },

    controls(html) { document.getElementById('controls').insertAdjacentHTML('beforeend', html); },
  };
  window.Bench = Bench;
})();
