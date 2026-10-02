/* ============================================================
   Bacchus's Atlas — prep-reorder-ui.js
   The DOM half of Prep's manual ordering: pointer-driven drag-and-drop of
   whole cards, the insertion line, section highlight, autoscroll of the
   central panel, and Alt+Arrow keyboard reordering. All geometry decisions
   are in the pure js/prep-reorder-utils.js; this file only reads rects,
   draws temporary UI, and — on a successful drop — hands the new id array
   to `hooks.commit()`. It owns no Prep state and never writes storage.

   Why pointer events instead of native HTML5 drag-and-drop: a drag only
   starts after the pointer has moved DRAG_THRESHOLD px (so a slightly
   wobbly trackpad click stays a click), nested links/images never start
   their own native drag, autoscroll of the central panel can run while the
   pointer is still, Esc cancels deterministically, and touch never gets a
   long-press drag — only a fine pointer (mouse / pen) ever starts one.

   Two kinds of drag:
     'reorder' — a selected card inside .prep-central, same section only.
     'add'     — an unselected catalog row/card (All Environments, All
                 Adversaries, the Items strip) into the matching section,
                 inserted at the slot under the pointer.

   Loaded before js/app.js; app.js calls PrepReorderUI.init({...}) once.
   See "Manual ordering" in docs/architecture.md.
   ============================================================ */
(function (root) {
  'use strict';

  var U = root.PrepReorderUtils;
  var DRAG_THRESHOLD = 6;          // px of pointer travel before a press becomes a drag
  var EDGE_ZONE = 56;              // px from the central panel's top/bottom that autoscroll
  var MIN_SCROLL = 100;            // px per second at the inner edge of the zone
  var MAX_SCROLL = 700;            // px per second at the panel's edge
  var LINE_THICKNESS = 3;
  var CAPABLE = '(any-hover: hover) and (any-pointer: fine)';

  var hooks = null;
  var press = null;     // pointer is down on a draggable source, threshold not reached yet
  var drag = null;      // an active drag
  var suppressClick = false;
  var swallowAfterCancel = false;   // a drag cancelled with Esc: its eventual release must not click

  /* ---------------- source / target lookup ---------------- */

  var SECTION_FIELD = { environments: 1, adversaries: 1, items: 1 };

  /** Resolves what a pointerdown landed on into a draggable source, or null.
   * Controls that have their own meaning on press (remove ×, selection
   * checkbox) never start a drag. */
  function resolveSource(target) {
    if (!target || !target.closest) return null;
    if (target.closest('.prep-sel-remove, .prep-checkbox-hit, input, select, textarea')) return null;

    var card = target.closest('.prep-central .prep-sel');
    if (card) {
      var section = card.closest('.prep-central-section');
      var kind = section && section.dataset.spSection;
      var id = card.dataset.selId;
      if (!SECTION_FIELD[kind] || !id) return null;
      return { el: card, kind: kind, id: id, mode: 'reorder' };
    }

    var row = target.closest('.prep-env-row, .prep-adv-row, .prep-item-card, .prep-item-compact-row');
    if (!row) return null;
    var found = row.dataset.envId ? ['environments', row.dataset.envId]
      : row.dataset.advId ? ['adversaries', row.dataset.advId]
      : row.dataset.itemId ? ['items', row.dataset.itemId] : null;
    if (!found || !hooks.canAdd(found[0], found[1])) return null;
    return { el: row, kind: found[0], id: found[1], mode: 'add' };
  }

  function sectionEl(kind) {
    return document.querySelector('.prep-central-section[data-sp-section="' + kind + '"]');
  }

  function centralEl() {
    return document.querySelector('.prep-central');
  }

  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }

  function inside(r, x, y) {
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /* ---------------- drag lifecycle ---------------- */

  function capable() {
    return !!(root.matchMedia && root.matchMedia(CAPABLE).matches);
  }

  function onPointerDown(e) {
    swallowAfterCancel = false;
    if (!hooks) return;
    // A press/drag still open when a new press starts means its pointerup was lost
    // (released outside the window, say): drop it rather than lock reordering.
    press = null;
    if (drag) finish();
    if (e.button !== 0 || e.isPrimary === false) return;
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    if (!capable() || !hooks.isActive()) return;
    var source = resolveSource(e.target);
    if (!source) return;
    // Links and images are natively draggable: left alone, the browser would
    // start its own drag (and cancel our pointer stream) once the pointer
    // moves. Opting them out here, before any movement, is what lets a card's
    // own link/thumbnail be grabbed like the rest of the card.
    source.el.querySelectorAll('a, img').forEach(function (n) { n.draggable = false; });
    press = { source: source, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId };
  }

  function onPointerMove(e) {
    if (press && e.pointerId === press.pointerId) {
      var dx = e.clientX - press.startX;
      var dy = e.clientY - press.startY;
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
      beginDrag(press.source, e.clientX, e.clientY);
      press = null;
    }
    if (!drag) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    moveGhost();
    update();
  }

  function onPointerUp(e) {
    if (press) { press = null; return; }
    if (swallowAfterCancel) {
      swallowAfterCancel = false;
      suppressClick = true;
      setTimeout(function () { suppressClick = false; }, 0);
      return;
    }
    if (!drag) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    update();
    var outcome = drag;
    finish();
    // The click that follows a drag's pointerup must not activate whatever
    // card control the pointer was released over (or pressed on).
    suppressClick = true;
    setTimeout(function () { suppressClick = false; }, 0);
    drop(outcome);
  }

  function beginDrag(source, x, y) {
    drag = {
      el: source.el, kind: source.kind, id: source.id, mode: source.mode,
      from: source.mode === 'reorder' ? hooks.getIds(source.kind).indexOf(source.id) : -1,
      x: x, y: y, slot: null, valid: false, noop: false,
      ghost: null, line: null, list: null, emptyEl: null, emptyText: '',
      raf: 0, carry: 0, lastTick: 0,
    };
    drag.el.classList.add('is-drag-source');
    document.body.classList.add('is-prep-dragging');
    if (root.getSelection) { var sel = root.getSelection(); if (sel && sel.removeAllRanges) sel.removeAllRanges(); }
    makeGhost();
    if (drag.mode === 'add') {
      var section = sectionEl(drag.kind);
      if (section) section.classList.add('is-drop-target');
      showEmptyDropState(section);
    }
    drag.raf = root.requestAnimationFrame(tick);
    update();
  }

  function makeGhost() {
    var g = document.createElement('div');
    g.className = 'prep-drag-ghost';
    g.setAttribute('aria-hidden', 'true');
    g.textContent = hooks.nameOf(drag.kind, drag.id);
    document.body.appendChild(g);
    drag.ghost = g;
    moveGhost();
  }

  function moveGhost() {
    if (!drag || !drag.ghost) return;
    drag.ghost.style.transform = 'translate(' + Math.round(drag.x + 14) + 'px,' + Math.round(drag.y + 14) + 'px)';
  }

  /** An empty section has no grid to draw a line in: its "nothing selected"
   * paragraph becomes the drop target for the duration of the drag. Same
   * box, so the section keeps its height. */
  function showEmptyDropState(section) {
    var p = section && section.querySelector('.prep-central-body > .prep-empty');
    if (!p) return;
    drag.emptyEl = p;
    drag.emptyText = p.textContent;
    p.classList.add('is-drop-empty');
    p.textContent = hooks.text('prep_drop_here');
  }

  function clearIndicators() {
    var line = document.querySelector('.prep-drop-line');
    if (line) line.remove();
  }

  function finish() {
    var d = drag;
    drag = null;
    if (!d) return;
    if (d.raf) root.cancelAnimationFrame(d.raf);
    d.el.classList.remove('is-drag-source');
    document.body.classList.remove('is-prep-dragging');
    if (d.ghost) d.ghost.remove();
    clearIndicators();
    document.querySelectorAll('.prep-central-section.is-drop-target').forEach(function (s) { s.classList.remove('is-drop-target'); });
    if (d.emptyEl && d.emptyEl.isConnected) {
      d.emptyEl.classList.remove('is-drop-empty');
      d.emptyEl.textContent = d.emptyText;
    }
  }

  function cancel() {
    press = null;
    if (drag) { finish(); swallowAfterCancel = true; }
  }

  /* ---------------- target resolution + insertion line ---------------- */

  /** Recomputes everything derived from the pointer position: whether it is
   * over this drag's section, which slot, and the line. Temporary UI only —
   * nothing about Prep changes before drop(). */
  function update() {
    if (!drag) return;
    drag.valid = false;
    drag.slot = null;
    drag.noop = false;

    var section = sectionEl(drag.kind);
    var central = centralEl();
    if (!section || !central) { clearIndicators(); return; }
    var panel = rectOf(central);
    var overSection = inside(panel, drag.x, drag.y) && inside(rectOf(section), drag.x, drag.y);
    if (!overSection) { clearIndicators(); return; }

    var list = section.querySelector('.prep-central-body > .prep-sel-grid');
    if (!list) {
      // Empty section: the whole body is the target; the item lands first.
      drag.valid = drag.mode === 'add';
      drag.slot = 0;
      clearIndicators();
      return;
    }

    var cards = Array.prototype.slice.call(list.children).filter(function (c) { return c.classList.contains('prep-sel'); });
    var rects = cards.map(rectOf);
    var style = root.getComputedStyle(list);
    var columns = style.gridTemplateColumns.split(' ').filter(Boolean).length || 1;
    var slot = U.resolveSlot(rects, { x: drag.x, y: drag.y }, columns);
    drag.valid = true;
    drag.slot = slot;
    drag.noop = drag.mode === 'reorder' && U.isNoopSlot(drag.from, slot);
    if (drag.noop) { clearIndicators(); return; }
    drawLine(list, U.slotGeometry(rects, slot, {
      x: parseFloat(style.columnGap) || 8,
      y: parseFloat(style.rowGap) || 8,
    }, columns));
  }

  function drawLine(list, g) {
    if (!g) { clearIndicators(); return; }
    var line = list.querySelector(':scope > .prep-drop-line');
    if (!line) {
      clearIndicators();
      line = document.createElement('li');
      line.className = 'prep-drop-line';
      line.setAttribute('aria-hidden', 'true');
      list.appendChild(line);
    }
    var lr = list.getBoundingClientRect();
    var t = LINE_THICKNESS;
    if (g.orientation === 'v') {
      line.style.cssText = 'left:' + (g.x - lr.left - t / 2) + 'px;top:' + (g.top - lr.top) + 'px;width:' + t + 'px;height:' + (g.bottom - g.top) + 'px';
    } else {
      line.style.cssText = 'left:' + (g.left - lr.left) + 'px;top:' + (g.y - lr.top - t / 2) + 'px;width:' + (g.right - g.left) + 'px;height:' + t + 'px';
    }
  }

  /* ---------------- drop ---------------- */

  function drop(d) {
    if (!d.valid || d.slot == null || d.noop) return;
    var ids = hooks.getIds(d.kind);
    var next;
    if (d.mode === 'reorder') {
      var to = U.finalIndexForSlot(d.from, d.slot);
      next = U.moveId(ids, d.from, to);
      if (next === ids) return;
      commit(d.kind, next, d.id, 'reorder', next.indexOf(d.id), false);
    } else {
      // Re-checked at drop time: the cap or a duplicate may have appeared mid-drag.
      if (!hooks.canAdd(d.kind, d.id)) return;
      next = U.insertId(ids, d.id, d.slot);
      if (next === ids) return;
      commit(d.kind, next, d.id, 'add', next.indexOf(d.id), false);
    }
  }

  function commit(kind, ids, id, mode, index, keyboard) {
    hooks.commit({ kind: kind, ids: ids, id: id, mode: mode, index: index, keyboard: keyboard });
    var total = ids.length;
    var name = hooks.nameOf(kind, id);
    var key;
    if (mode === 'add') key = 'prep_reorder_added';
    else {
      var where = U.describePosition(index, total);
      key = where === 'start' ? 'prep_reorder_moved_start' : where === 'end' ? 'prep_reorder_moved_end' : 'prep_reorder_moved';
    }
    hooks.announce(hooks.text(key, { name: name, n: index + 1, total: total }));
  }

  /* ---------------- autoscroll of the central panel ---------------- */

  /** The one vertical scroller for this drag: the central panel when it is
   * the page's scroll container (≥1200px layouts), otherwise the document
   * (narrower layouts keep normal page scroll). */
  function scrollTarget() {
    var central = centralEl();
    if (central) {
      var oy = root.getComputedStyle(central).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && central.scrollHeight > central.clientHeight + 1) return { el: central, central: true };
    }
    return { el: document.scrollingElement || document.documentElement, central: false };
  }

  function tick(now) {
    if (!drag) return;
    drag.raf = root.requestAnimationFrame(tick);
    // Time-based, not per-frame: the speed is the same on a 60 Hz and a
    // throttled display. A long gap (background tab) is clamped, not replayed.
    var dt = drag.lastTick ? Math.min(now - drag.lastTick, 64) / 1000 : 0;
    drag.lastTick = now;
    var target = scrollTarget();
    var el = target.el;
    var top, bottom, within;
    if (target.central) {
      var r = el.getBoundingClientRect();
      top = r.top; bottom = r.bottom;
      within = drag.x >= r.left && drag.x <= r.right && drag.y >= top && drag.y <= bottom;
    } else {
      top = 0; bottom = root.innerHeight;
      within = drag.y >= top && drag.y <= bottom;
    }
    if (!within) { drag.carry = 0; return; }
    var speed = U.autoscrollDelta(drag.y, top, bottom, EDGE_ZONE, MIN_SCROLL, MAX_SCROLL);
    if (!speed) { drag.carry = 0; return; }
    var delta = speed * dt;
    var max = el.scrollHeight - el.clientHeight;
    var before = el.scrollTop;
    if ((delta < 0 && before <= 0) || (delta > 0 && before >= max - 1)) { drag.carry = 0; return; }
    // scrollTop is rounded by some browsers; carry the fraction so slow speeds still move.
    if (!delta) return;
    drag.carry += delta;
    var step = drag.carry < 0 ? Math.ceil(drag.carry) : Math.floor(drag.carry);
    if (!step) return;
    drag.carry -= step;
    el.scrollTop = Math.max(0, Math.min(max, before + step));
    if (el.scrollTop !== before) update();   // the cards moved under a still pointer
  }

  /* ---------------- keyboard ---------------- */

  function onKeyDown(e) {
    if (drag || press) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
      return;
    }
    if (!hooks || !e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    var main = e.target && e.target.closest && e.target.closest('.prep-central .prep-sel-main');
    if (!main || !hooks.isActive()) return;
    var card = main.closest('.prep-sel');
    var section = card && card.closest('.prep-central-section');
    var kind = section && section.dataset.spSection;
    var id = card && card.dataset.selId;
    if (!SECTION_FIELD[kind] || !id) return;

    e.preventDefault();
    var ids = hooks.getIds(kind);
    var index = ids.indexOf(id);
    var to = index === -1 ? null : U.keyboardTarget(index, ids.length, e.key, e.shiftKey);
    if (to === null) return;
    commit(kind, U.moveId(ids, index, to), id, 'reorder', to, true);
    // The list was re-rendered: put focus back on the same card's main control.
    var again = sectionEl(kind);
    var cards = again ? again.querySelectorAll('.prep-sel') : [];
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].dataset.selId === id) {
        var ctl = cards[i].querySelector('.prep-sel-main');
        if (ctl) ctl.focus();
        break;
      }
    }
  }

  /* ---------------- wiring ---------------- */

  function init(h) {
    if (hooks) return;
    hooks = h;
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('keydown', onKeyDown, true);
    root.addEventListener('blur', cancel);
    document.addEventListener('contextmenu', function () { if (drag) cancel(); });
    // Nested links/images must never start their own native drag from a card.
    document.addEventListener('dragstart', function (e) {
      if (press || drag || (e.target && e.target.closest && e.target.closest('.prep-central .prep-sel, .prep-env-row, .prep-adv-row, .prep-item-card, .prep-item-compact-row'))) e.preventDefault();
    }, true);
    document.addEventListener('selectstart', function (e) { if (drag) e.preventDefault(); });
    // Swallow the click a finished drag would otherwise produce.
    document.addEventListener('click', function (e) {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  root.PrepReorderUI = { init: init };
})(typeof globalThis !== 'undefined' ? globalThis : window);
