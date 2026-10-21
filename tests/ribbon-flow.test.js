'use strict';
/* js/ribbon-flow.js is a browser script that only measures and sets margins, so the test runs it
   in a vm against a small fake DOM: a catalogue bar, the current ribbon and a few filter items whose
   rectangles follow their own marginLeft (and wrap to the next row when they no longer fit). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '../js/ribbon-flow.js'), 'utf8');

/* The ribbon rests 28px below the header's bottom edge (45), i.e. down to y=73: row 2 starts below that. */
const ROW1 = 10, ROW2 = 80, HEIGHT = 30;

/** An item sitting at `left` on the first row; with a margin it moves right, and past `barRight` it wraps. */
function makeItem(cls, left, width, barLeft, barRight) {
  const el = {
    style: { marginLeft: '', maxWidth: '' },
    offsetParent: {},
    classList: { contains: c => c === cls },
    getBoundingClientRect() {
      const m = parseFloat(el.style.marginLeft) || 0;
      let l = left + m, top = ROW1;
      if (l + width > barRight) { l = barLeft; top = ROW2; }
      return { left: l, right: l + width, top, bottom: top + HEIGHT, width, height: HEIGHT };
    },
  };
  return el;
}

function setup({ route = 'catalog', width = 1200, ribbon = { left: 500, right: 600 }, items }) {
  const timers = [];
  const bar = { querySelectorAll: () => items };
  const document = {
    body: { dataset: { route } },
    documentElement: {},
    fonts: null,
    querySelector(sel) {
      if (sel === '.catalog-bar') return bar;
      if (sel === '.site-header') return { getBoundingClientRect: () => ({ bottom: 45 }) };
      if (sel === '.header-nav .ribbon.on') return ribbon ? { getBoundingClientRect: () => ({ left: ribbon.left, right: ribbon.right }) } : null;
      return null;
    },
    addEventListener() {},
  };
  const win = {
    innerWidth: width,
    addEventListener() {},
    document,
  };
  const ctx = {
    window: win, document, setTimeout: fn => timers.push(fn), ResizeObserver: undefined,
    getComputedStyle: () => ({ zoom: '1', columnGap: '10px', getPropertyValue: () => '28' }),
  };
  win.getComputedStyle = ctx.getComputedStyle;
  vm.runInNewContext(src, ctx);
  const flush = () => { while (timers.length) timers.shift()(); };
  return { win, flush, timers };
}

const BAR_LEFT = 0, BAR_RIGHT = 1000;

test('an item under the ribbon is pushed just past it, one column gap clear', () => {
  const item = makeItem('search-field', 520, 200, BAR_LEFT, BAR_RIGHT);
  const { win, flush } = setup({ items: [item] });
  win.RibbonFlow.update(); flush();
  // ribbon 500..600 plus a 10px gap on each side: the item must start at 610
  assert.equal(item.style.marginLeft, (610 - 520) + 'px');
  assert.equal(item.getBoundingClientRect().left, 610);
});

test('items clear of the ribbon, left or right, are left alone', () => {
  const before = makeItem('filter-toggle', 100, 150, BAR_LEFT, BAR_RIGHT);
  const after = makeItem('result-count', 700, 100, BAR_LEFT, BAR_RIGHT);
  const { win, flush } = setup({ items: [before, after] });
  win.RibbonFlow.update(); flush();
  assert.equal(before.style.marginLeft, '');
  assert.equal(after.style.marginLeft, '');
});

test('an item that no longer fits after the shift wraps to the next row and loses its margin', () => {
  const item = makeItem('filter-toggle', 520, 400, BAR_LEFT, BAR_RIGHT);
  const { win, flush } = setup({ items: [item] });
  win.RibbonFlow.update(); flush();
  // 610 + 400 > 1000: with the margin it wraps below the ribbon's resting length, where no indent is needed
  assert.equal(item.style.marginLeft, '');
});

test('an item that wraps to a row the ribbon does not reach keeps no indent even from a stale margin', () => {
  const item = makeItem('filter-toggle', 520, 400, BAR_LEFT, BAR_RIGHT);
  item.style.marginLeft = '300px';
  const { win, flush } = setup({ items: [item] });
  win.RibbonFlow.update(); flush();
  assert.equal(item.style.marginLeft, '');
});

test('nothing is touched on other routes or on a phone-width window, and stale margins are dropped', () => {
  for (const o of [{ route: 'prep' }, { route: 'journey' }, { width: 640 }]) {
    const item = makeItem('search-field', 520, 200, BAR_LEFT, BAR_RIGHT);
    item.style.marginLeft = '90px'; item.style.maxWidth = '300px';
    const { win, flush } = setup(Object.assign({ items: [item] }, o));
    win.RibbonFlow.update(); flush();
    assert.equal(item.style.marginLeft, '', JSON.stringify(o));
    assert.equal(item.style.maxWidth, '', JSON.stringify(o));
  }
});

test('the Lists route is handled like the catalogue', () => {
  const item = makeItem('search-field', 520, 200, BAR_LEFT, BAR_RIGHT);
  const { win, flush } = setup({ route: 'list', items: [item] });
  win.RibbonFlow.update(); flush();
  assert.equal(item.style.marginLeft, '90px');
});

test('on a narrow window the search field stops at the ribbon instead of being pushed past it', () => {
  const item = makeItem('search-field', 100, 700, BAR_LEFT, BAR_RIGHT);
  const { win, flush } = setup({ width: 800, items: [item] });
  win.RibbonFlow.update(); flush();
  // room before the ribbon: 490 - 100 = 390, below the 420 cap
  assert.equal(item.style.maxWidth, 'min(420px, 390px)');
  assert.equal(item.style.marginLeft, '');
});

test('an invisible item (no offsetParent) is skipped', () => {
  const item = makeItem('search-field', 520, 200, BAR_LEFT, BAR_RIGHT);
  item.offsetParent = null;
  const { win, flush } = setup({ items: [item] });
  win.RibbonFlow.update(); flush();
  assert.equal(item.style.marginLeft, '');
});

test('no current ribbon means no margins', () => {
  const item = makeItem('search-field', 520, 200, BAR_LEFT, BAR_RIGHT);
  const { win, flush } = setup({ ribbon: null, items: [item] });
  win.RibbonFlow.update(); flush();
  assert.equal(item.style.marginLeft, '');
});

test('many update() calls in a row schedule a single measurement', () => {
  const item = makeItem('search-field', 520, 200, BAR_LEFT, BAR_RIGHT);
  const { win, timers } = setup({ items: [item] });
  win.RibbonFlow.update(); win.RibbonFlow.update(); win.RibbonFlow.update();
  assert.equal(timers.length, 1);
});
