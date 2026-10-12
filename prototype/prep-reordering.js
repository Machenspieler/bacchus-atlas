/* Mocked prototype of manual reordering inside Session Prep's selected-content
 * panel. Hardcoded data, in-memory state only: no SafeStorage, no localStorage,
 * no production module is loaded. Delete the whole prototype/ folder to remove. */
(() => {
  'use strict';

  const BIOME_IMG = '../img/biomes/forest-200.webp';
  const ITEM_IMG = 'https://artex-x.github.io/daggerheart-loot/img/{img}';
  const ADV_THUMB = '../img/adversaries/prep/generated/thumbs/';
  const FALLBACK_ADV = '<img src="../img/adv_fallback.png" alt="" draggable="false">';
  const FALLBACK_ITEM = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 10.5h15v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-8z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M4 8a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2.5H4V8z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 10.5v9" stroke="currentColor" stroke-width="1.4"/></svg>';
  const ICON_ENV = '<svg class="prep-central-icon prep-central-icon--env" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2.6 20.1 7v10L12 21.4 3.9 17V7L12 2.6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const GRIP = '<svg viewBox="0 0 12 16" fill="currentColor" aria-hidden="true"><circle cx="3.5" cy="3" r="1.3"/><circle cx="8.5" cy="3" r="1.3"/><circle cx="3.5" cy="8" r="1.3"/><circle cx="8.5" cy="8" r="1.3"/><circle cx="3.5" cy="13" r="1.3"/><circle cx="8.5" cy="13" r="1.3"/></svg>';

  const D = window.PROTO_DATA;
  const KIND_LABEL = { item: 'Item', consumable: 'Consumable' };
  const SRC_LABEL = { core: 'Core', hnf: 'Hope & Fear' };
  const MAX_ENV = 3;

  // Catalog record -> central-panel record
  const toCentral = {
    environments: e => ({ id: e.id, name: e.name, meta: `Tier ${e.tier}` }),
    adversaries: a => ({ id: a.id, name: a.name, meta: `Tier ${a.tier} · ${a.type}`, thumb: a.thumb }),
    items: i => ({ id: i.id, name: i.name, meta: `${SRC_LABEL[i.src]} · ${KIND_LABEL[i.kind]} · #${i.roll}`, img: i.img }),
  };
  const catalogOf = sec => D[sec];
  const MOCK = Object.fromEntries(Object.keys(D.selected).map(sec =>
    [sec, D.selected[sec].map(id => toCentral[sec](catalogOf(sec).find(r => r.id === id)))]));

  const SECTIONS = {
    environments: { title: 'Environments', icon: ICON_ENV, grid: 'env', layout: 'card', kind: 'env' },
    adversaries: { title: 'Adversaries', icon: '<img class="prep-central-icon" src="../img/ui/section-adversaries.png" alt="" aria-hidden="true" draggable="false">', grid: 'adv', layout: 'row', kind: 'adv' },
    items: { title: 'Items', icon: '<img class="prep-central-icon" src="../img/ui/section-items.png" alt="" aria-hidden="true" draggable="false">', grid: 'item', layout: 'card', kind: 'item' },
  };

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const canReorder = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

  let state;
  let mode = 'handle'; // 'handle' | 'card'
  let drag = null; // { kind: 'reorder'|'add', section, id, from } — only set between dragstart and dragend
  let itemView = 'gallery';
  const root = document.getElementById('proto-app');   // whole mock page: catalogs + central panel
  const central = document.getElementById('proto-central');

  const reset = () => { state = JSON.parse(JSON.stringify(MOCK)); };

  /* ---------------- rendering (mirrors selectedEntityHtml() in js/app.js) ---------------- */
  function thumbHtml(sec, rec) {
    const k = SECTIONS[sec].kind;
    if (k === 'env') return `<span class="prep-sel-thumb" data-kind="env" aria-hidden="true"><img src="${BIOME_IMG}" alt="" draggable="false"></span>`;
    if (k === 'adv') {
      if (!rec.thumb) return `<span class="prep-sel-thumb is-fallback" data-kind="adv" aria-hidden="true">${FALLBACK_ADV}</span>`;
      return `<span class="prep-sel-thumb" data-kind="adv" aria-hidden="true"><img src="${ADV_THUMB}${rec.thumb}" alt="" draggable="false" data-thumb-img="adv"></span>`;
    }
    return `<span class="prep-sel-thumb" data-kind="item" aria-hidden="true"><img src="${ITEM_IMG.replace('{img}', rec.img)}" alt="" draggable="false" data-thumb-img="item"></span>`;
  }

  function recordHtml(sec, rec) {
    const { layout } = SECTIONS[sec];
    const text = `
        <span class="prep-sel-body">
          <span class="prep-sel-title">
            <span class="prep-sel-name">${esc(rec.name)}</span>${sec === 'adversaries' ? '<span class="prep-sel-ext" aria-hidden="true">↗</span>' : ''}
          </span>
          <span class="prep-sel-meta">${esc(rec.meta)}</span>
        </span>`;
    const main = sec === 'adversaries'
      ? `${thumbHtml(sec, rec)}<a class="prep-sel-main prep-sel-link" href="#" draggable="false" data-mock-link aria-label="${esc(rec.name)} (FreshCutGrass)">${text}</a>`
      : `<button type="button" class="prep-sel-main" data-mock-open aria-label="${esc(rec.name)}">${thumbHtml(sec, rec)}${text}</button>`;
    return `
    <li class="prep-sel prep-sel--${layout}" data-id="${esc(rec.id)}"${mode === 'card' && canReorder() ? ' draggable="true"' : ''}>
      <button type="button" class="prep-sel-handle" data-handle aria-label="Reorder ${esc(rec.name)}. Alt plus arrow up or down moves it.">${GRIP}</button>
      ${main}
      <button type="button" class="prep-sel-remove" data-remove aria-label="Remove ${esc(rec.name)}"><span aria-hidden="true">×</span></button>
    </li>`;
  }

  function listHtml(sec) {
    const recs = state[sec];
    if (!recs.length) return '<p class="proto-empty">Nothing selected (mock).</p>';
    return `<ul class="prep-sel-list prep-sel-grid prep-sel-grid--${SECTIONS[sec].grid} proto-list" data-section="${sec}">${recs.map(r => recordHtml(sec, r)).join('')}<li class="proto-insert" aria-hidden="true"></li></ul>`;
  }

  function sectionHtml(sec) {
    const s = SECTIONS[sec];
    return `
      <section class="prep-central-section" data-sp-section="${sec}" aria-labelledby="t-${sec}">
        <div class="prep-central-head">
          <div class="prep-central-lead">
            <h3 class="prep-central-title" id="t-${sec}" tabindex="-1">${s.icon}<span>${s.title}</span></h3>
            <span class="prep-central-dot" aria-hidden="true">·</span>
            <span class="prep-central-count" data-count="${sec}">${state[sec].length}</span>
          </div>
        </div>
        <div class="prep-central-body" data-body="${sec}">${listHtml(sec)}</div>
      </section>`;
  }

  /* ---------------- catalog panels (mirror prepEnvThumbHtml / advPickerRowHtml / itemCardHtml / compactItemRowHtml) ---------------- */
  const isSelected = (sec, id) => state[sec].some(r => r.id === id);
  const checkboxHtml = (sec, id, name, disabled) => `<label class="prep-checkbox-hit"><input type="checkbox" class="prep-select-checkbox" data-toggle="${sec}" data-id="${esc(id)}" ${isSelected(sec, id) ? 'checked' : ''} ${disabled ? 'disabled' : ''} aria-label="${isSelected(sec, id) ? 'Remove' : 'Add'} ${esc(name)}"></label>`;
  const itemThumb = it => `<span class="prep-item-thumb"><img src="${ITEM_IMG.replace('{img}', it.img)}" alt="" draggable="false" data-thumb-img="item"></span>`;
  const dragAttr = () => (canReorder() ? ' draggable="true"' : '');

  function envRowHtml(e) {
    const sel = isSelected('environments', e.id);
    const thumb = e.biome ? `<img class="prep-thumb" src="../img/biomes/${e.biome}-200.webp" alt="" draggable="false">` : `<span class="prep-thumb prep-thumb-fallback" aria-hidden="true">${ICON_ENV.replace(' class="prep-central-icon prep-central-icon--env"', '')}</span>`;
    return `<div class="prep-row prep-env-row" data-cat="environments" data-id="${e.id}" role="listitem"${dragAttr()}>
      ${checkboxHtml('environments', e.id, e.name, !sel && state.environments.length >= MAX_ENV)}
      <button type="button" class="prep-row-open" data-mock-open>${thumb}<span class="prep-row-text"><span class="prep-row-name">${esc(e.name)}</span><span class="prep-row-meta">Tier ${e.tier} · ${e.type}</span></span></button>
    </div>`;
  }
  function advRowHtml(a) {
    const thumb = a.thumb
      ? `<button type="button" class="prep-adv-thumb prep-adv-thumb-btn" data-mock-open aria-label="Open image"><img src="${ADV_THUMB}${a.thumb}" alt="" draggable="false"></button>`
      : `<span class="prep-adv-thumb prep-thumb-fallback" aria-hidden="true">${FALLBACK_ADV}</span>`;
    return `<div class="prep-row prep-adv-row" data-cat="adversaries" data-id="${a.id}" role="listitem"${dragAttr()}>
      ${checkboxHtml('adversaries', a.id, a.name)}
      ${thumb}
      <a class="prep-row-text prep-adv-link" href="#" draggable="false" data-mock-link><span class="prep-adv-title"><span class="prep-row-name">${esc(a.name)}</span><span class="prep-sel-ext" aria-hidden="true">↗</span></span><span class="prep-row-meta">Tier ${a.tier} · ${a.type}</span></a>
    </div>`;
  }
  function itemCardHtml(it) {
    return `<div class="prep-item-card${isSelected('items', it.id) ? ' is-selected' : ''}" data-cat="items" data-id="${it.id}"${dragAttr()}>
      <button type="button" class="prep-item-icon-btn" data-mock-open data-tip="${KIND_LABEL[it.kind]} · ${SRC_LABEL[it.src]} · #${it.roll}" aria-label="${esc(it.name)}">${itemThumb(it)}<span class="prep-item-name-overlay">${esc(it.name)}</span></button>
      ${checkboxHtml('items', it.id, it.name)}
    </div>`;
  }
  function itemCompactHtml(it) {
    return `<div class="prep-row prep-item-compact-row" data-cat="items" data-id="${it.id}"${dragAttr()}>
      ${checkboxHtml('items', it.id, it.name)}
      <button type="button" class="prep-row-open" data-mock-open>${itemThumb(it)}<span class="prep-row-text"><span class="prep-row-name">${esc(it.name)}</span><span class="prep-row-meta">#${it.roll} · ${KIND_LABEL[it.kind]} · ${SRC_LABEL[it.src]}</span></span></button>
    </div>`;
  }

  function renderCatalogs() {
    document.getElementById('prep-env-list').innerHTML = D.environments.map(envRowHtml).join('');
    document.getElementById('prep-adv-list').innerHTML = D.adversaries.map(advRowHtml).join('');
    document.getElementById('proto-item-gallery').hidden = itemView !== 'gallery';
    document.getElementById('proto-item-compact').hidden = itemView !== 'compact';
    document.getElementById('prep-item-grid').innerHTML = D.items.map(itemCardHtml).join('');
    document.getElementById('prep-item-compact-grid').innerHTML = D.items.map(itemCompactHtml).join('');
  }

  function renderSection(sec) {
    central.querySelector(`[data-body="${sec}"]`).innerHTML = listHtml(sec);
    central.querySelector(`[data-count="${sec}"]`).textContent = state[sec].length;
    renderCatalogs();
    renderDebug();
  }

  function renderAll() {
    central.innerHTML = '<span class="proto-sr-live" id="proto-live" role="status" aria-live="polite"></span>' + Object.keys(SECTIONS).map(sectionHtml).join('');
    renderCatalogs();
    renderDebug();
  }

  function renderDebug() {
    document.getElementById('proto-debug').textContent = Object.keys(SECTIONS)
      .map(sec => `${sec}:\n${JSON.stringify(state[sec].map(r => r.id))}`).join('\n\n');
  }

  const say = msg => { const el = document.getElementById('proto-live'); if (el) el.textContent = msg; };

  /* ---------------- reorder / add model ---------------- */
  function move(sec, from, to) {
    const arr = state[sec];
    const [rec] = arr.splice(from, 1);
    arr.splice(to, 0, rec);
    return rec;
  }
  function addAt(sec, id, index) {
    const rec = toCentral[sec](catalogOf(sec).find(r => r.id === id));
    state[sec].splice(index, 0, rec);
    return rec;
  }
  const canAdd = (sec, id) => !isSelected(sec, id) && !(sec === 'environments' && state.environments.length >= MAX_ENV);

  /* ---------------- insertion position ----------------
   * Nearest card to the pointer (distance to its rect, so the gaps between
   * cards also resolve), then before/after from the pointer's side of that
   * card's midpoint: x when the list has several columns, y when it has one.
   * Returns the index the record would end up at. For a reorder, dropping
   * where it already is is a no-op; an add (from === -1) is never one. */
  function locate(list, x, y) {
    const cards = list ? [...list.querySelectorAll(':scope > .prep-sel')] : [];
    if (!cards.length) return { target: 0, noop: false, empty: true };
    let best = null;
    for (const el of cards) {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
      if (!best || d < best.d) best = { el, r, d };
    }
    const multiCol = new Set(cards.map(c => Math.round(c.getBoundingClientRect().left))).size > 1;
    const after = multiCol ? x > best.r.left + best.r.width / 2 : y > best.r.top + best.r.height / 2;
    const idx = cards.indexOf(best.el) + (after ? 1 : 0);
    const reorder = drag.kind === 'reorder';
    const finalIdx = reorder && idx > drag.from ? idx - 1 : idx;
    return { multiCol, after, rect: best.r, target: finalIdx, noop: reorder && finalIdx === drag.from };
  }

  function showIndicator(list, loc) {
    if (!list) return;
    const ind = list.querySelector('.proto-insert');
    if (!loc || loc.noop) { ind.classList.remove('is-visible'); return; }
    const lr = list.getBoundingClientRect();
    const cs = getComputedStyle(list);
    const T = 3;
    const r = loc.rect;
    if (loc.multiCol) {
      const gap = parseFloat(cs.columnGap) || 8;
      const x = (loc.after ? r.right + gap / 2 : r.left - gap / 2) - lr.left - T / 2;
      Object.assign(ind.style, { left: x + 'px', top: r.top - lr.top + 'px', width: T + 'px', height: r.height + 'px' });
    } else {
      const gap = parseFloat(cs.rowGap) || 8;
      const y = (loc.after ? r.bottom + gap / 2 : r.top - gap / 2) - lr.top - T / 2;
      Object.assign(ind.style, { left: r.left - lr.left + 'px', top: y + 'px', width: r.width + 'px', height: T + 'px' });
    }
    ind.classList.add('is-visible');
  }

  const clearIndicators = () => {
    root.querySelectorAll('.proto-insert.is-visible').forEach(i => i.classList.remove('is-visible'));
    root.querySelectorAll('.is-drop-section').forEach(el => el.classList.remove('is-drop-section'));
    root.querySelectorAll('.proto-slot.is-over').forEach(el => el.classList.remove('is-over'));
  };

  /* ---------------- drag and drop (native HTML5) ----------------
   * Sources: a central card (via its handle, or the whole card in "Whole card"
   * mode) = reorder; any catalog card/row = add. Both may only land in the
   * central section of the same kind. */
  const sectionOf = e => {
    const s = e.target.closest && e.target.closest('.prep-central-section');
    return s ? { sec: s.dataset.spSection, body: s.querySelector('[data-body]') } : null;
  };

  root.addEventListener('dragstart', e => {
    if (!canReorder()) { e.preventDefault(); return; }
    const cat = e.target.closest && e.target.closest('[data-cat]');
    const src = e.target.closest && (mode === 'card' ? e.target.closest('.prep-sel') : e.target.closest('[data-handle]'));
    let li;
    if (cat) {
      drag = { kind: 'add', section: cat.dataset.cat, id: cat.dataset.id, from: -1 };
      li = cat;
    } else if (src) {
      li = src.closest('.prep-sel');
      const sec = li.closest('.proto-list').dataset.section;
      drag = { kind: 'reorder', section: sec, id: li.dataset.id, from: state[sec].findIndex(r => r.id === li.dataset.id) };
    } else { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/plain', drag.id);
    const r = li.getBoundingClientRect();
    e.dataTransfer.setDragImage(li, e.clientX - r.left, e.clientY - r.top);
    requestAnimationFrame(() => {
      if (!drag) return;
      li.classList.add('is-dragging'); document.body.classList.add('is-reordering');
      if (drag.kind === 'add' && canAdd(drag.section, drag.id)) showSlot(drag.section);
    });
  });

  /* The "+" slot: while a catalog card is dragged, an empty dashed cell appears
   * after the last card of the section it may land in — the visible hint that
   * (and where) it can be dropped. Dropping on it appends. Removed on dragend. */
  const PLUS = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  function showSlot(sec) {
    const body = central.querySelector(`[data-body="${sec}"]`);
    let list = body.querySelector('.proto-list');
    if (!list) {
      body.innerHTML = `<ul class="prep-sel-list prep-sel-grid prep-sel-grid--${SECTIONS[sec].grid} proto-list" data-section="${sec}"><li class="proto-insert" aria-hidden="true"></li></ul>`;
      list = body.querySelector('.proto-list');
    }
    list.insertAdjacentHTML('beforeend', `<li class="proto-slot proto-slot--${SECTIONS[sec].layout}" aria-hidden="true">${PLUS}</li>`);
  }

  const droppable = target => target && drag && target.sec === drag.section &&
    (drag.kind === 'reorder' || canAdd(drag.section, drag.id));

  root.addEventListener('dragover', e => {
    if (!drag) return;
    const target = sectionOf(e);
    if (!droppable(target)) return; // wrong section / duplicate / environment cap: no preventDefault → not droppable
    e.preventDefault();
    e.dataTransfer.dropEffect = drag.kind === 'add' ? 'copy' : 'move';
    clearIndicators();
    const list = target.body.querySelector('.proto-list');
    if (drag.kind === 'add') target.body.classList.add('is-drop-section');
    const slot = e.target.closest('.proto-slot');
    if (slot) { slot.classList.add('is-over'); return; }
    showIndicator(list, locate(list, e.clientX, e.clientY));
  });

  root.addEventListener('dragleave', e => {
    if (!e.relatedTarget || !central.contains(e.relatedTarget)) clearIndicators();
  });

  root.addEventListener('drop', e => {
    const target = sectionOf(e);
    if (!droppable(target)) return;
    e.preventDefault();
    const onSlot = !!e.target.closest('.proto-slot');
    const loc = onSlot ? { target: state[drag.section].length, noop: false }
      : locate(target.body.querySelector('.proto-list'), e.clientX, e.clientY);
    const { section, from, id, kind } = drag;
    if (kind === 'add') {
      const rec = addAt(section, id, loc.target);
      renderSection(section);
      say(`${rec.name} added at position ${loc.target + 1} of ${state[section].length}`);
    } else if (!loc.noop) {
      const rec = move(section, from, loc.target);
      renderSection(section);
      say(`${rec.name} moved to position ${loc.target + 1} of ${state[section].length}`);
    }
  });

  // Fires after drop and after a cancelled drag (Esc / dropped outside): never persists anything.
  root.addEventListener('dragend', () => {
    const hadSlot = !!root.querySelector('.proto-slot');
    const sec = drag && drag.section;
    drag = null;
    clearIndicators();
    document.body.classList.remove('is-reordering');
    root.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
    if (hadSlot && sec) renderSection(sec); // drops the "+" slot (and restores the empty-state text)
  });

  // In "Handle only" mode only the grip is draggable; it is flagged here so the rest of the card never starts a drag.
  root.addEventListener('pointerover', e => {
    const h = e.target.closest && e.target.closest('[data-handle]');
    if (h && !h.draggable && canReorder()) h.draggable = true;
  });
  root.addEventListener('focusin', e => {
    const h = e.target.closest && e.target.closest('[data-handle]');
    if (h && canReorder()) h.draggable = true;
  });

  /* ---------------- keyboard: Alt+↑/↓/Home/End on the focused handle (or card) ---------------- */
  root.addEventListener('keydown', e => {
    const focusEl = e.target.closest && (mode === 'card' ? e.target.closest('.prep-sel-main') : e.target.closest('[data-handle]'));
    if (!focusEl || !e.altKey || !canReorder()) return;
    const li = focusEl.closest('.prep-sel');
    const sec = li.closest('.proto-list').dataset.section;
    const from = state[sec].findIndex(r => r.id === li.dataset.id);
    const last = state[sec].length - 1;
    const to = { ArrowUp: from - 1, ArrowDown: from + 1, Home: 0, End: last }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    if (to < 0 || to > last || to === from) return;
    const rec = move(sec, from, to);
    renderSection(sec);
    central.querySelector(`[data-section="${sec}"] [data-id="${rec.id}"] ${mode === 'card' ? '.prep-sel-main' : '[data-handle]'}`).focus();
    say(`${rec.name} moved to position ${to + 1} of ${last + 1}`);
  });

  /* ---------------- mock remove / catalog checkboxes / inert links / image fallbacks ---------------- */
  root.addEventListener('click', e => {
    const rm = e.target.closest && e.target.closest('[data-remove]');
    if (rm) {
      const li = rm.closest('.prep-sel');
      const sec = li.closest('.proto-list').dataset.section;
      state[sec] = state[sec].filter(r => r.id !== li.dataset.id);
      renderSection(sec);
      document.getElementById('t-' + sec).focus({ preventScroll: true });
      return;
    }
    if (e.target.closest && e.target.closest('[data-mock-link]')) e.preventDefault();
  });

  // Checkbox in a catalog: the pre-existing add (append) / remove path, kept so both ways of adding can be compared.
  root.addEventListener('change', e => {
    const cb = e.target.closest && e.target.closest('[data-toggle]');
    if (!cb) return;
    const sec = cb.dataset.toggle, id = cb.dataset.id;
    if (cb.checked && canAdd(sec, id)) addAt(sec, id, state[sec].length);
    else state[sec] = state[sec].filter(r => r.id !== id);
    renderSection(sec);
  });

  root.addEventListener('error', e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.thumbImg) return;
    const wrap = img.closest('.prep-sel-thumb, .prep-item-thumb');
    wrap.classList.add('is-fallback', 'prep-thumb-fallback');
    wrap.innerHTML = FALLBACK_ITEM;
  }, true);

  /* ---------------- dev controls ---------------- */
  document.getElementById('proto-restore').addEventListener('click', () => { reset(); renderAll(); });
  const widthSel = document.getElementById('proto-width');
  const applyWidth = () => document.documentElement.style.setProperty('--proto-w', widthSel.value + 'px');
  widthSel.addEventListener('change', applyWidth);

  const modeSel = document.getElementById('proto-mode');
  modeSel.addEventListener('change', () => {
    mode = modeSel.value;
    document.body.classList.toggle('mode-card', mode === 'card');
    renderAll();
  });
  const viewSel = document.getElementById('proto-items-view');
  viewSel.addEventListener('change', () => { itemView = viewSel.value; renderCatalogs(); });

  reset();
  applyWidth();
  renderAll();
})();
