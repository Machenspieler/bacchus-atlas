// Prep — the highest-priority page (spec §15–23).
import { full, crop, go, hover, focusVisible, attempt, measureEls, settle, parkMouse, unionBox, sheet } from './harness.mjs';

/** Selectors whose rendered size/radius/type is compared across viewports. */
const DENSITY_MAP = {
  centralPanel: '.prep-central',
  centralHeadEnv: '.prep-central-head',
  centralTitle: '.prep-central-title',
  envRow: '.prep-sel--card',
  itemRow: '.prep-sel--row',
  rowName: '.prep-sel-name',
  rowMeta: '.prep-sel-meta, .prep-sel-sub',
  rowThumb: '.prep-thumb',
  removeBtn: '.prep-sel-remove',
  centralCount: '.prep-central-count',
  pickerRowName: '.prep-picker-list .prep-row-name',
  pickerRowMeta: '.prep-picker-list .prep-row-meta',
  pickerThumb: '.prep-adv-thumb',
  toolbarSearch: '.prep-search input',
};

const HEIGHT_MAP = {
  'prep-search input (env)': '.prep-env-toolbar .prep-search input',
  'prep-search input (adv)': '.prep-adv-toolbar .prep-search input',
  'adv ms-trigger (Type)': '.prep-adv-toolbar .ms-trigger',
  'item-clear-btn': '.item-clear-btn',
  'item toolbar': '.item-toolbar',
  'bp-stepper': '.bp-stepper',
  'bp-summary': '.bp-summary',
  'prep-recommend-btn / +N control': '.prep-recommend-btn',
  'prep-freshcutgrass-link': '.prep-freshcutgrass-link',
  'prep-icon-btn (first in DOM)': '.prep-icon-btn',
  'prep-more-btn (⋯ actions)': '.prep-more-btn',
  'sp-session-control': '.sp-session-control',
  'prep New button (.btn)': '.prep-new-btn',
  'header .btn (nav)': '.header-nav .nav-btn',
  'sb-trigger': '.sb-trigger',
  'prep-item-nav-btn': '.prep-item-nav-btn',
  'prep-central-clear': '.prep-central-clear',
  'prep-sel-remove': '.prep-sel-remove',
  'lang-switch button': '.lang-switch button',
};

const LOCS = page => ({
  central: page.locator('.prep-central'),
  heads: page.locator('.prep-central-head'),
  envTb: page.locator('.prep-env-toolbar'),
  advTb: page.locator('.prep-adv-toolbar'),
  itemTb: page.locator('.item-toolbar'),
  bar: page.locator('.prep-bar'),
  colEnv: page.locator('.prep-col-env'),
  colAdv: page.locator('.prep-col-adv'),
  items: page.locator('.prep-items-panel'),
});

export async function layouts(s) {
  const { page } = s;
  const r = s.rec;
  const w = s.vp.width;
  await go(s, '#/prep', { reload: true });
  await page.waitForSelector('.prep-wrap');
  await settle(page, { long: true });
  const L = LOCS(page);
  await attempt(r, `${w} prep populated`, async () => {
    await full(s, { page: 'prep', state: 'all-sections-populated', components: ['site-header', 'prep-bar', 'prep-col-env', 'prep-central', 'prep-col-adv', 'prep-items-panel'], actions: ['load deterministic Prep: 3 environments, 4 adversaries, 4 items'], purpose: 'Identical-content Prep for the 1366/1440/1920 density comparison; also header (1180) vs content width.', refs: ['Needs Visual Review 7', 'Needs Visual Review 8', 'Layout Findings', 'Top Issue 22'] });
    await full(s, { page: 'prep', state: 'all-sections-populated-fullpage', fullPage: true, components: ['whole Prep page'], purpose: 'Whole page height at this viewport (content below the fold).', refs: ['Needs Visual Review 7'] });
    r.measure(`prepDensity_${w}`, await measureEls(page, DENSITY_MAP));
    r.measure(`prepHeights_${w}`, await measureEls(page, HEIGHT_MAP));
    r.measure(`prepWidths_${w}`, await page.evaluate(() => {
      const wd = sel => { const e = document.querySelector(sel); return e ? +e.getBoundingClientRect().width.toFixed(1) : null; };
      const x = sel => { const e = document.querySelector(sel); return e ? +e.getBoundingClientRect().x.toFixed(1) : null; };
      return { viewport: innerWidth, headerInner: wd('.header-inner'), headerInnerX: x('.header-inner'), shell: wd('.shell'), prepWrap: wd('.prep-wrap'), prepWrapX: x('.prep-wrap'), prepMain: wd('.prep-main'), bodyScrollWidth: document.documentElement.scrollWidth,
        centralDensityBigRule: matchMedia('(min-width: 1800px) and (min-height: 900px)').matches };
    }));
    r.measure(`prepOverflow_${w}`, await page.evaluate(() => {
      const rows = sel => [...document.querySelectorAll(sel)].filter(e => e.getBoundingClientRect().width > 0).map(e => { const cs = getComputedStyle(e), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3; return { text: e.textContent.trim().slice(0, 28), truncated: e.scrollWidth > e.clientWidth + 1, lines: Math.round(e.getBoundingClientRect().height / lh) }; });
      return { centralTitles: rows('.prep-central-title'), centralRowNames: rows('.prep-sel-name') };
    }));
    // Also keep the viewport-scrolled-to-items state once for the below-fold items strip.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await settle(page);
    await full(s, { page: 'prep', state: 'scrolled-to-items', components: ['prep-items-panel', 'item strip'], actions: ['scroll to page bottom'], purpose: 'Bottom of Prep (items strip) at this viewport.', refs: ['Needs Visual Review 7'] });
    await page.evaluate(() => window.scrollTo(0, 0));
  });

  await attempt(r, `${w} prep crops`, async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await crop(s, { page: 'prep', state: 'central-populated', locators: [L.central], pad: 6, components: ['prep-central', 'prep-sel--card', 'prep-sel--row', 'prep-sel-remove', 'prep-central-count'], purpose: 'Central column at this density (row heights, thumbs, gaps, remove button, header).', refs: ['Needs Visual Review 7', 'Prep density'] });
    await crop(s, { page: 'prep', state: 'picker-env', locators: [L.colEnv], pad: 6, components: ['prep-col-env', 'prep-row', 'prep-select-checkbox'], purpose: 'Environment picker density at this viewport.', refs: ['Needs Visual Review 7'] });
    await crop(s, { page: 'prep', state: 'picker-adv', locators: [L.colAdv], pad: 6, components: ['prep-col-adv', 'prep-adv-row (recommended)', 'prep-select-checkbox'], purpose: 'Adversary picker density at this viewport.', refs: ['Needs Visual Review 7', 'Needs Visual Review 5'] });
    await crop(s, { page: 'prep', state: 'toolbar-controls', locators: [L.envTb, L.advTb], pad: 8, components: ['prep-search (35px)', 'rank-icon filters', 'ms-trigger (35px)'], purpose: 'Toolbar density: environment + adversary toolbars side by side.', refs: ['Top Issue 3', 'Needs Visual Review 5'] });
    await crop(s, { page: 'prep', state: 'header-and-bar', box: await unionBox([page.locator('.site-header'), L.bar]), pad: 0, components: ['site-header', 'sp-session-control', 'prep-bar'], purpose: 'Global header (1180) and Prep bar together.', refs: ['Needs Visual Review 8', 'Needs Visual Review 6'] });
  });

  await attempt(r, `${w} prep section icons`, async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    const heads = L.heads;
    const n = await heads.count();
    const names = ['environments', 'adversaries', 'items'];
    for (let i = 0; i < Math.min(n, 3); i++) {
      const h = heads.nth(i);
      const b = await h.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: Math.min(r.width, 260), height: r.height }; });
      await crop(s, { page: 'prep', state: `section-icon-${names[i]}`, box: b, pad: 6, zoom: 4, components: ['prep-central-head', 'prep-central-icon', 'prep-central-title'], purpose: `${names[i]} section header/icon at identical clip width and zoom.`, refs: ['Top Issue 9', 'Needs Visual Review 3'] });
    }
    r.measure(`sectionIcons_${w}`, await page.evaluate(() => [...document.querySelectorAll('.prep-central-icon')].map(e => { const cs = getComputedStyle(e), r = e.getBoundingClientRect(); return { tag: e.tagName, cls: e.className.toString ? e.className.toString() : '', w: r.width, h: r.height, color: cs.color, src: e.getAttribute('src') || (e.querySelector('img')?.getAttribute('src')) || 'inline-svg', natural: e.naturalWidth ? `${e.naturalWidth}x${e.naturalHeight}` : null }; })));
  });
}

export async function emptyAndPartial(s, kind) {
  const w = s.vp.width, r = s.rec, { page } = s;
  await go(s, '#/prep', { reload: true });
  await page.waitForSelector('.prep-wrap');
  await settle(page, { long: true });
  if (kind === 'empty') {
    await attempt(r, `${w} prep empty`, async () => {
      await full(s, { page: 'prep', state: 'empty-default', components: ['prep-bar', 'prep-central empty (prep-sel-empty ×3)', 'pickers'], actions: ['clean browser state: default empty Prep'], purpose: 'Fresh Prep with every central section empty.', refs: ['Needs Visual Review 16', 'Empty States'] });
      await crop(s, { page: 'prep', state: 'central-empty', locators: [page.locator('.prep-central')], pad: 6, components: ['prep-sel-empty'], purpose: 'Empty central selection areas (environments, adversaries, items).', refs: ['Needs Visual Review 16'] });
    });
  } else {
    await attempt(r, `${w} prep partial`, async () => {
      await full(s, { page: 'prep', state: 'content-selected', components: ['1 environment', '1 adversary', 'empty items'], actions: ['load Prep with 1 environment + 1 adversary, no items'], purpose: 'Partially filled Prep.', refs: ['Prep base layout'] });
    });
  }
}

/** Session header (compact/expanded), controls, menus. 1440 & 1920 (+1366 for modes). */
export async function session(s) {
  const w = s.vp.width, r = s.rec, { page } = s;
  await go(s, '#/prep', { reload: true });
  await page.waitForSelector('.sp-session-control');
  await settle(page, { long: true });
  const ctl = page.locator('.sp-session-control');
  const hdrNav = page.locator('.header-nav');
  const cluster = async () => unionBox([page.locator('.sp-session-slot'), hdrNav, page.locator('.sb-trigger'), page.locator('.lang-switch')]);

  await attempt(r, `${w} session expanded`, async () => {
    await full(s, { page: 'prep', state: 'session-expanded', components: ['sp-session-control', 'prep-bar (expanded)'], purpose: 'Expanded session header (default mode).', refs: ['Top Issue 14', 'Needs Visual Review 6'] });
    await crop(s, { page: 'prep', state: 'session-control-default', box: await cluster(), pad: 10, zoom: 2, components: ['sp-session-control (12px radius)', 'nav .btn (4px radius)', 'sb-trigger', 'lang-switch'], purpose: 'The 12px-radius session control beside standard header buttons.', refs: ['Top Issue 14', 'Needs Visual Review 6'] });
    r.measure(`sessionControl_${w}`, await measureEls(page, { control: '.sp-session-control', navBtn: '.header-nav .nav-btn', sb: '.sb-trigger', lang: '.lang-switch button', bar: '.prep-bar' }));
  });
  await attempt(r, `${w} session hover/active`, async () => {
    await hover(s, ctl);
    await crop(s, { page: 'prep', state: 'session-control-hover', box: await cluster(), pad: 10, zoom: 2, keepMouse: true, actions: ['hover .sp-session-control'], components: ['sp-session-control (hover)'], purpose: 'Session control hover.', refs: ['Needs Visual Review 6'] });
    await ctl.hover();
    await page.mouse.down();
    await page.waitForTimeout(100);
    const pressed = await ctl.evaluate(el => el.matches(':active'));
    await crop(s, { page: 'prep', state: 'session-control-active-pressed', box: await cluster(), pad: 10, zoom: 2, keepMouse: true, actions: ['hover .sp-session-control', 'mouse down and HOLD (no release on target)'], verified: { ':active': pressed }, components: ['sp-session-control (:active)'], purpose: 'Pressed state (the one explicit :active in the app).', refs: ['Interaction State Findings: Active', 'Needs Visual Review 11'] });
    await page.mouse.move(s.vp.width - 4, s.vp.height - 4); // drag off => click is cancelled
    await page.mouse.up();
    // Same transient press on a standard .btn for comparison (nav button).
    const nav = page.locator('.header-nav .nav-btn:not(.active)').first();
    await nav.hover();
    await crop(s, { page: 'prep', state: 'standard-btn-hover', locators: [hdrNav], pad: 10, zoom: 2, keepMouse: true, actions: ['hover a non-active header .btn'], components: ['.btn hover'], purpose: 'Standard .btn hover (only visible state change).', refs: ['Needs Visual Review 11'] });
    await page.mouse.down();
    await page.waitForTimeout(100);
    const pressedBtn = await nav.evaluate(el => el.matches(':active'));
    await crop(s, { page: 'prep', state: 'standard-btn-pressed', locators: [hdrNav], pad: 10, zoom: 2, keepMouse: true, actions: ['hover a header .btn', 'mouse down and HOLD'], verified: { ':active': pressedBtn }, notes: 'Transient state; if it looks identical to hover, .btn has no :active rule (see Stage 1).', components: ['.btn :active'], purpose: 'Press feedback on a standard .btn.', refs: ['Needs Visual Review 11'] });
    await page.mouse.move(s.vp.width - 4, s.vp.height - 4);
    await page.mouse.up();
    await page.waitForTimeout(100);
  });
  await attempt(r, `${w} session compact`, async () => {
    await ctl.click();
    await page.waitForTimeout(250);
    await full(s, { page: 'prep', state: 'session-compact', actions: ['click .sp-session-control to collapse the session header'], components: ['sp-session-control (compact)', 'compact header (28px buttons)'], purpose: 'Compact session UI (28px header buttons).', refs: ['Top Issue 3', 'Interaction State Findings'] });
    await crop(s, { page: 'prep', state: 'session-control-compact', box: await unionBox([page.locator('.site-header')]), pad: 0, actions: ['collapse session header'], components: ['compact header cluster'], purpose: 'Compact header: .btn / sb-trigger at 28px and the session control.', refs: ['Needs Visual Review 6'] });
    r.measure(`sessionCompact_${w}`, await measureEls(page, { control: '.sp-session-control', navBtn: '.header-nav .nav-btn', sb: '.sb-trigger', lang: '.lang-switch button' }));
    await ctl.click();
    await page.waitForTimeout(250);
  });
  if (w !== 1366) {
    await attempt(r, `${w} session menus`, async () => {
      await page.locator('.prep-title-btn').click();
      await page.waitForSelector('.prep-menu', { state: 'visible' });
      await full(s, { page: 'prep', state: 'session-menu-open', keepMouse: false, actions: ['click the prep title button (.prep-title-btn)'], components: ['prep-menu (switcher)'], purpose: 'Prep switcher menu in context (compare with .ms-panel).', refs: ['Top Issue 4', 'Needs Visual Review 9'] });
      await crop(s, { page: 'prep', state: 'prep-menu-open', locators: [page.locator('.prep-menu:visible')], pad: 12, components: ['prep-menu'], purpose: 'prep-menu surface close-up (radius, border, shadow, rows).', refs: ['Top Issue 4', 'Needs Visual Review 9'] });
      r.measure(`prepMenuSurface_${w}`, await measureEls(page, { prepMenu: '.prep-menu:not([hidden])', item: '.prep-menu:not([hidden]) .prep-menu-item' }));
      await page.keyboard.press('Escape');
      await page.locator('.prep-more-btn').click();
      await page.waitForSelector('#prep-actions-menu, .prep-actions-menu', { state: 'visible' });
      await full(s, { page: 'prep', state: 'actions-menu-open', actions: ['click the ⋯ actions button (.prep-more-btn)'], components: ['prep-menu (actions) incl. disabled Delete'], purpose: 'Actions menu with a disabled item (opacity .7).', refs: ['Top Issue 4', 'Top Issue 6', 'Needs Visual Review 12'] });
      await crop(s, { page: 'prep', state: 'prep-actions-menu-open', locators: [page.locator('.prep-menu:visible')], pad: 12, components: ['prep-menu-item.is-disabled'], purpose: 'Actions menu close-up incl. disabled item.', refs: ['Top Issue 6', 'Needs Visual Review 12'] });
      await page.keyboard.press('Escape');
    });
  }
}

/** Natural session hint (flag unset) — separate context. */
export async function sessionHint(s) {
  const w = s.vp.width, r = s.rec, { page } = s;
  await attempt(r, `${w} session hint`, async () => {
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector('.sp-session-control');
    await page.locator('.sp-session-control').click();
    await page.waitForSelector('.sp-session-hint', { timeout: 8000 });
    await settle(page);
    await full(s, { page: 'prep', state: 'session-hint-hinted', keepMouse: false, actions: ['open Prep with the hint flag unset (first visit)', 'click .sp-session-control to go compact; the one-time hint then appears on its own'], components: ['sp-session-hint', 'sp-session-control.is-hinted (gold glow)'], purpose: 'Naturally reproduced hinted state of the session control.', refs: ['Top Issue 14', 'Needs Visual Review 6'] });
    const slot = page.locator('.sp-session-slot');
    await crop(s, { page: 'prep', state: 'session-hint-bubble', box: await unionBox([slot, page.locator('.sp-session-hint')]), pad: 10, zoom: 3, components: ['sp-session-hint', 'sp-session-control.is-hinted'], purpose: 'Hint bubble + hinted control (r-sm, hope border) close-up.', refs: ['Top Issue 4'] });
    r.measure(`sessionHint_${w}`, await measureEls(page, { hint: '.sp-session-hint', control: '.sp-session-control' }));
  });
}
