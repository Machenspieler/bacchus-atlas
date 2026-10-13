/* RibbonFlow — keeps the catalogue / list filter row clear of the current
 * page's ribbon. That ribbon hangs from the header into the first row of
 * .catalog-bar; on a narrower window it would cover a filter. Instead, any
 * item that would sit under it gets a margin-left that starts it just past the
 * ribbon, and an item that then no longer fits wraps to the next row (which the
 * ribbon doesn't reach), the others keeping their order. Layout only: nothing
 * is stored, no markup is added, and the margin is dropped again when there is
 * nothing to avoid (narrow layout, other routes, ribbon not overlapping). */
(function () {
  'use strict';

  const GAP = 16;
  let scheduled = false;
  /* A font arriving or a status text changing resizes an item without any window
   * event; margins never change an item's own size, so this can't loop. */
  const sizeWatch = typeof ResizeObserver === 'function' ? new ResizeObserver(() => schedule()) : null;

  function items(bar) {
    return Array.from(bar.querySelectorAll(
      '.search-field, .toolbar-filters > .field, .result-count'
    ));
  }

  function clear(bar) {
    items(bar).forEach(el => { el.style.marginLeft = ''; });
  }

  function apply() {
    scheduled = false;
    const bar = document.querySelector('.catalog-bar');
    if (!bar) return;
    clear(bar);
    if (sizeWatch) items(bar).forEach(el => sizeWatch.observe(el));
    const route = document.body.dataset.route;
    if ((route !== 'catalog' && route !== 'list') || window.innerWidth < 901) return;
    const ribbon = document.querySelector('.header-nav .ribbon.on');
    if (!ribbon) return;

    const r = ribbon.getBoundingClientRect();
    /* Under CSS zoom, rects are in screen px but margins in the bar's own units. */
    const zoom = parseFloat(getComputedStyle(bar).zoom) || 1;
    const header = document.querySelector('.site-header').getBoundingClientRect();
    const rest = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rb-t2')) || 28;
    const bottom = header.bottom + rest; /* the ribbon's resting length */
    const left = r.left - GAP, right = r.right + GAP;

    for (const el of items(bar)) {
      if (!el.offsetParent) continue;
      let b = el.getBoundingClientRect();
      if (b.top >= bottom || b.right <= left || b.left >= right) continue;
      el.style.marginLeft = ((right - b.left) / zoom) + 'px';
      b = el.getBoundingClientRect();
      if (b.top >= bottom) el.style.marginLeft = ''; /* wrapped below the ribbon */
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(apply, 0);
  }

  window.RibbonFlow = { update: schedule };
  window.addEventListener('resize', schedule);
  window.addEventListener('hashchange', schedule);
  window.addEventListener('load', schedule);
  /* The ribbons drop in on a route change; measure again once they have settled. */
  document.addEventListener('animationend', e => {
    if (e.target.closest && e.target.closest('.header-nav')) schedule();
  }, true);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
})();
