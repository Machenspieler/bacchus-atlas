/* Prototype only: overlay prev/next arrows for the Prep Items strip.
   Arrow visibility logic mirrors refreshPrepItemNav() in js/app.js, with a mode switch so the
   proposed overlay can be compared against the current in-flow arrows and the old reserved gutters. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const wrapEl = $('p-wrap'), strip = $('p-strip-wrap'), grid = $('p-grid');
  const prev = strip.querySelector('[data-nav="prev"]'), next = strip.querySelector('[data-nav="next"]');
  const COUNTS = [240, 60, 9, 4];
  const NAMES = ['Wayfarer', 'Ember Draught', 'Silver Locket', 'Iron Key', 'Moss Charm', 'Hollow Flute', 'Cinder Pouch', 'Glass Lantern'];
  const state = { mode: 'overlay', view: 'gallery', count: 240, width: 1280, lastFirstX: null };

  /* ---------- rendering ---------- */
  function tile(i) {
    return `<div class="prep-item-card"><button type="button" class="prep-item-icon-btn" aria-label="Item ${i}">
        <span class="prep-item-thumb proto-thumb"><span class="proto-art">${i}</span></span>
        <span class="prep-item-name-overlay">${NAMES[i % NAMES.length]} ${i}</span></button>
      <label class="prep-checkbox-hit"><input type="checkbox" class="prep-select-checkbox" aria-label="Add ${i}"></label></div>`;
  }
  function row(i) {
    return `<div class="prep-row prep-item-compact-row">
      <label class="prep-checkbox-hit"><input type="checkbox" class="prep-select-checkbox" aria-label="Add ${i}"></label>
      <button type="button" class="prep-row-open"><span class="proto-art">${i}</span>
        <span class="prep-row-text"><span class="prep-row-name">${NAMES[i % NAMES.length]} ${i}</span>
        <span class="prep-row-meta">#${(i % 12) + 1} · Item · Core</span></span></button></div>`;
  }
  function render() {
    grid.className = state.view === 'gallery' ? 'prep-item-grid proto-grid' : 'prep-item-compact-grid proto-grid';
    let h = '';
    for (let i = 1; i <= state.count; i++) h += state.view === 'gallery' ? tile(i) : row(i);
    grid.innerHTML = h;
    grid.scrollLeft = 0;
    $('p-count-label').textContent = `${state.count} of 240`;
    refresh();
  }

  /* ---------- arrow visibility ---------- */
  function setArrow(btn, visible, disabled) {
    btn.classList.toggle('is-off', !visible);
    btn.disabled = !!disabled;
    btn.tabIndex = visible ? 0 : -1;
    btn.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }
  function refresh() {
    const max = Math.max(0, grid.scrollWidth - grid.clientWidth);
    const atStart = grid.scrollLeft <= 1, atEnd = grid.scrollLeft >= max - 1;
    if (state.mode === 'overlay') {
      // Overlay arrows take no width, so plain "does the strip overflow" is already stable,
      // and each arrow shows only when scrolling in ITS direction is possible.
      setArrow(prev, max > 1 && !atStart, false);
      setArrow(next, max > 1 && !atEnd, false);
    } else {
      // Production logic: judged against the wrap's full width so showing the arrows can't flip the result.
      const overflowing = max > 0 && grid.scrollWidth > strip.clientWidth;
      if (state.mode === 'inflow') {
        setArrow(prev, overflowing, atStart); setArrow(next, overflowing, atEnd);
      } else { // reserved: gutters always occupy space; arrows just fade
        setArrow(prev, overflowing, atStart); setArrow(next, overflowing, atEnd);
      }
    }
    updateLive();
  }
  function scrollBy(dir) {
    const step = Math.max(1, Math.round(grid.clientWidth * 0.8)); // same as scrollPrepItemStrip()
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    grid.scrollBy({ left: dir * step, behavior: reduce ? 'auto' : 'smooth' });
  }
  prev.addEventListener('click', () => scrollBy(-1));
  next.addEventListener('click', () => scrollBy(1));
  grid.addEventListener('scroll', refresh, { passive: true });
  new ResizeObserver(refresh).observe(grid);

  /* ---------- measurements ---------- */
  function measure() {
    const panel = wrapEl.querySelector('.prep-items-panel').getBoundingClientRect();
    const g = grid.getBoundingClientRect();
    const kids = [...grid.children];
    const first = kids[0] ? kids[0].getBoundingClientRect() : null;
    const lefts = new Set(); let full = 0;
    for (const k of kids) {
      const r = k.getBoundingClientRect();
      if (r.left < g.left - 0.5) continue;
      if (r.right > g.right + 0.5) break;
      if (state.view === 'gallery') full++; else lefts.add(Math.round(r.left));
    }
    // Column-wise: in compact view a "visible item" is a column of up to two rows.
    const cols = state.view === 'gallery' ? full : lefts.size;
    return { firstX: first ? +(first.left - panel.left).toFixed(2) : null, stripW: Math.round(g.width), cols };
  }
  function updateLive() {
    const m = measure();
    const jump = state.lastFirstX == null || m.firstX == null ? 0 : +(m.firstX - state.lastFirstX).toFixed(2);
    state.lastFirstX = m.firstX;
    $('p-live').innerHTML = [
      ['mode', state.mode], ['results', `${state.count} of 240`], ['strip width', m.stripW + ' px'],
      [state.view === 'gallery' ? 'full cards visible' : 'full columns visible', m.cols],
      ['first card X (from panel edge)', m.firstX + ' px'], ['Δ X since previous state', (jump === 0 ? '0' : jump) + ' px' + (jump ? '  ← JUMP' : '')],
      ['left arrow', prev.classList.contains('is-off') ? 'hidden' : 'visible'], ['right arrow', next.classList.contains('is-off') ? 'hidden' : 'visible'],
    ].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');
  }

  /* ---------- controls ---------- */
  function applyWidth(w) {
    state.width = w;
    wrapEl.style.setProperty('--proto-w', w + 'px');
    wrapEl.style.width = w + 'px';
    $('p-width').value = w; $('p-width-range').value = w;
  }
  function applyMode(m) {
    state.mode = m;
    wrapEl.classList.remove('proto-mode-overlay', 'proto-mode-inflow', 'proto-mode-reserved');
    wrapEl.classList.add('proto-mode-' + m);
    refresh();
  }
  const countsBox = $('p-counts');
  COUNTS.forEach(n => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = n; b.dataset.n = n;
    b.addEventListener('click', () => { state.count = n; syncCountBtns(); render(); });
    countsBox.appendChild(b);
  });
  function syncCountBtns() { [...countsBox.children].forEach(b => b.classList.toggle('btn-primary', +b.dataset.n === state.count)); }
  $('p-mode').addEventListener('change', e => applyMode(e.target.value));
  $('p-view').addEventListener('change', e => { state.view = e.target.value; render(); });
  $('p-width').addEventListener('input', e => { applyWidth(+e.target.value || 1280); refresh(); });
  $('p-width-range').addEventListener('input', e => { applyWidth(+e.target.value); refresh(); });
  $('p-zones').addEventListener('change', e => wrapEl.classList.toggle('proto-zones', e.target.checked));

  /* ---------- sweeps ---------- */
  const MODES = ['overlay', 'inflow', 'reserved'];
  $('p-sweep-counts').addEventListener('click', () => {
    const save = { mode: state.mode, count: state.count }; const lines = [];
    for (const mode of MODES) {
      applyMode(mode); const xs = [];
      for (const n of COUNTS) { state.count = n; render(); xs.push(`${n}: X=${measure().firstX}`); }
      const uniq = new Set(xs.map(s => s.split('X=')[1]));
      lines.push(`${mode.padEnd(9)} ${xs.join('   ')}   → ${uniq.size === 1 ? 'STABLE' : 'JUMPS (' + [...uniq].join(' / ') + ')'}`);
    }
    state.mode = save.mode; state.count = save.count; applyMode(save.mode); render();
    $('p-report').textContent = `First-card X by result count (${state.view}, panel ${state.width}px)\n` + lines.join('\n');
  });
  $('p-sweep-widths').addEventListener('click', () => {
    const save = { mode: state.mode, count: state.count, width: state.width };
    state.count = 240; render();
    const steps = {}; // mode -> [{w, cols}] where cols increases
    const at = {};    // mode -> w -> cols
    for (const mode of MODES) {
      applyMode(mode); steps[mode] = []; at[mode] = {}; let last = -1;
      for (let w = 700; w <= 2100; w++) {
        applyWidth(w); grid.scrollLeft = 0; refresh();
        const c = measure().cols; at[mode][w] = c;
        if (c !== last) { steps[mode].push(`${w}px→${c}`); last = c; }
      }
    }
    let gain = 0, tot = 0;
    for (let w = 700; w <= 2100; w++) { tot++; if (at.overlay[w] > at.inflow[w]) gain++; }
    let gainRes = 0; for (let w = 700; w <= 2100; w++) if (at.overlay[w] > at.reserved[w]) gainRes++;
    applyWidth(save.width); state.count = save.count; applyMode(save.mode); render();
    $('p-report').textContent = `Full ${state.view === 'gallery' ? 'cards' : 'columns'} visible, 240 results, panel width sweep\n` +
      MODES.map(m => `${m.padEnd(9)} ${steps[m].join('  ')}`).join('\n') +
      `\n\nOverlay shows MORE than in-flow at ${gain}/${tot} widths, more than reserved at ${gainRes}/${tot}.`;
  });

  applyWidth(1280); applyMode('overlay'); syncCountBtns(); render();
})();
