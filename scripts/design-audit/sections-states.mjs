// Focus, disabled, links, checkboxes, modals, active chrome, 640/641/642 diagnostic
// (spec §29–30, §32–35, §4).
import { full, crop, go, hover, focusVisible, attempt, measureEls, settle, parkMouse, unionBox } from './harness.mjs';

const OUTLINE = el => {
  const cs = getComputedStyle(el);
  return {
    outline: cs.outlineStyle === 'none' ? 'none' : `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`,
    outlineOffset: cs.outlineOffset, borderColor: cs.borderTopColor, borderBottomColor: cs.borderBottomColor,
    boxShadow: cs.boxShadow === 'none' ? 'none' : cs.boxShadow.slice(0, 140), opacity: cs.opacity,
    focusVisible: el.matches(':focus-visible'),
  };
};

/** Records the computed focus treatment (not just the screenshot). */
async function focusProbe(loc, restProbe) {
  const rest = await loc.evaluate(OUTLINE);
  return { rest, ...(restProbe || {}) };
}

export async function focusStates(s) {
  const { page } = s, r = s.rec;
  const F = {};
  const run = (label, fn) => attempt(r, `focus:${label}`, fn);
  const take = async (key, loc, ctx, { how, refs = ['Top Issue 7', 'Needs Visual Review 10'], purpose, components, pad = 14, zoom = 3, viaKeyboard = true } = {}) => {
    const before = await loc.first().evaluate(OUTLINE);
    let ok;
    if (viaKeyboard) ok = await focusVisible(s, loc.first());
    else { await loc.first().focus(); ok = await loc.first().evaluate(el => el.matches(':focus-visible')); }
    const after = await loc.first().evaluate(OUTLINE);
    F[key] = { before, after, how };
    await crop(s, { page: 'focus', state: key, locators: [ctx || loc.first()], pad, zoom, keepMouse: true, actions: [how], verified: { ':focus-visible': ok }, components: components || [key], purpose, refs });
    await loc.first().evaluate(el => el.blur());
  };

  await run('lists + btn + field', async () => {
    await go(s, '#/lists', { reload: true });
    await take('btn-primary-focus-visible', page.locator('#new-list-btn'), page.locator('.new-list-row'), { how: 'Shift+Tab then focus() on #new-list-btn', purpose: 'Standard .btn (primary) :focus-visible ring.', refs: ['Interaction State Findings: Focus'], components: ['.btn.btn-primary'] });
    await take('field-input-focus-visible', page.locator('#new-list-input'), page.locator('.new-list-row'), { how: 'Shift+Tab then focus() on #new-list-input', purpose: '.field input focus: gold border + global outline.', refs: ['Interaction State Findings: Focus'], components: ['.field input'] });
    await take('list-card-open-focus-visible', page.locator('.list-card-open').first(), page.locator('.list-card').first(), { how: 'Shift+Tab then focus() on .list-card-open', purpose: 'list-card focus: ring vs border-colour swap.', components: ['list-card-open'] });
  });
  await run('catalog', async () => {
    await go(s, '#/', { reload: true });
    await take('card-open-focus-visible', page.locator('.grid .card:not(.card-random) .card-open').nth(1), page.locator('.grid .card:not(.card-random)').nth(1), { how: 'Shift+Tab then focus() on a .card-open', purpose: 'Catalog card focus (card:has(.card-open:focus-visible)).', refs: ['Top Issue 7'], components: ['.card-open'] });
    await take('catalog-search-focus', page.locator('.search-input-wrap input'), page.locator('.search-input-wrap'), { how: 'focus search input', purpose: 'Catalog search field focus.', refs: ['Interaction State Findings: Focus'], components: ['.search-input-wrap input'], viaKeyboard: false });
    await take('ms-trigger-focus-visible', page.locator('.toolbar .ms-trigger').first(), null, { how: 'Shift+Tab then focus() on the Type multiselect', purpose: 'ms-trigger focus ring.', refs: ['Interaction State Findings: Focus'], components: ['.ms-trigger'] });
    await take('lang-switch-focus-visible', page.locator('.lang-switch button:not(.active)').first(), page.locator('.lang-switch'), { how: 'Shift+Tab then focus() on the inactive RU button', purpose: 'Language switch focus (inset, radius 0).', refs: ['Interaction State Findings: Focus', 'Top Issue 7'], components: ['.lang-switch button'] });
    r.measure('focusLangSwitch', await measureEls(page, { btn: '.lang-switch button' }));
  });
  await run('prep', async () => {
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector('.prep-wrap');
    await settle(page, { long: true });
    await take('prep-notes-input-focus', page.locator('.prep-notes-input'), page.locator('.prep-notes'), { how: 'focus the Session Notes textarea', purpose: 'Prep notes input focus (inset -2px outline).', refs: ['Interaction State Findings: Focus', 'Top Issue 7'], components: ['.prep-notes-input'], viaKeyboard: false });
    await take('prep-inset-focus-sel-main', page.locator('.prep-sel-main').first(), page.locator('.prep-sel--card').first(), { how: 'Shift+Tab then focus() on a central row main button', purpose: 'Inset Prep focus state (outline-offset -2px).', refs: ['Interaction State Findings: Focus'], components: ['.prep-sel-main'] });
    await take('prep-inset-focus-bp-summary', page.locator('.bp-summary'), page.locator('.bp-summary').first(), { how: 'Shift+Tab then focus() on .bp-summary', purpose: 'Another Prep inset focus ring.', refs: ['Interaction State Findings: Focus'], components: ['.bp-summary'] });
    await take('prep-search-focus', page.locator('#prep-env-search'), page.locator('.prep-env-toolbar'), { how: 'focus #prep-env-search', purpose: 'Prep search (35px) focus.', refs: ['Interaction State Findings: Focus', 'Top Issue 3'], components: ['.prep-search input'], viaKeyboard: false });
    // prep-title-input: reach through the real Rename action.
    await page.locator('.prep-more-btn').click();
    await page.waitForSelector('.prep-menu:visible');
    await page.locator('.prep-menu:visible .prep-menu-item', { hasText: 'Rename' }).click();
    await page.waitForSelector('.prep-title-input');
    await page.waitForTimeout(150);
    const inp = page.locator('.prep-title-input');
    F['prep-title-input-focus'] = { after: await inp.evaluate(OUTLINE), how: 'open ⋯ menu → Rename (inline input is auto-focused)' };
    await parkMouse(s);
    await crop(s, { page: 'focus', state: 'prep-title-input-focus', locators: [page.locator('.prep-titlerow')], pad: 14, zoom: 3, keepMouse: true, actions: ['click ⋯ (prep-more-btn)', 'click Rename; input is focused automatically'], verified: { ':focus-visible': F['prep-title-input-focus'].after.focusVisible }, components: ['.prep-title-input (outline:none, gold border-bottom only)'], purpose: 'Border-only focus candidate.', refs: ['Top Issue 7', 'Needs Visual Review 10'] });
    await page.keyboard.press('End');
    await crop(s, { page: 'focus', state: 'prep-title-input-focus-caret-moved', locators: [page.locator('.prep-titlerow')], pad: 14, zoom: 3, keepMouse: true, actions: ['same as above', 'press End to drop the auto-selection'], components: ['.prep-title-input'], notes: 'The app auto-selects the title on Rename; End removes the selection highlight so the focus treatment itself is visible (caret hidden by test CSS).', purpose: 'Border-only focus candidate without selection highlight.', refs: ['Top Issue 7', 'Needs Visual Review 10'] });
    await full(s, { page: 'focus', state: 'prep-title-input-focus-context', keepMouse: true, actions: ['same as above'], components: ['.prep-title-input'], purpose: 'Rename input focus in full context.', refs: ['Top Issue 7', 'Needs Visual Review 10'] });
    await page.keyboard.press('Escape');
  });
  r.measure('focusStates', F);
}

export async function linkStates(s) {
  const { page } = s, r = s.rec;
  const L = {};
  const trio = async (key, loc, ctx, { refs = ['Top Issue 17'], purpose, components, zoom = 4 } = {}) => {
    await loc.first().scrollIntoViewIfNeeded();
    await parkMouse(s);
    const rest = await loc.first().evaluate(el => { const cs = getComputedStyle(el); return { color: cs.color, textDecoration: cs.textDecorationLine, underlineOffset: cs.textUnderlineOffset, borderBottom: cs.borderBottomWidth }; });
    await crop(s, { page: 'links', state: `${key}-default`, locators: [ctx || loc.first()], pad: 10, zoom, components, purpose, refs });
    await hover(s, loc.first());
    const hov = await loc.first().evaluate(el => { const cs = getComputedStyle(el); return { color: cs.color, textDecoration: cs.textDecorationLine, underlineOffset: cs.textUnderlineOffset }; });
    await crop(s, { page: 'links', state: `${key}-hover`, locators: [ctx || loc.first()], pad: 10, zoom, keepMouse: true, actions: ['hover'], components, purpose, refs });
    const ok = await focusVisible(s, loc.first());
    await crop(s, { page: 'links', state: `${key}-focus-visible`, locators: [ctx || loc.first()], pad: 10, zoom, keepMouse: true, actions: ['Shift+Tab then focus()'], verified: { ':focus-visible': ok }, components, purpose, refs });
    await loc.first().evaluate(el => el.blur());
    L[key] = { rest, hover: hov };
  };
  await attempt(r, 'links:catalog', async () => {
    await go(s, '#/', { reload: true });
    await trio('base-a-card-open', page.locator('.grid .card:not(.card-random) .card-open').nth(1), null, { components: ['a (.card-open; inherits global a rule)'], purpose: 'Global `a` rule: no underline at rest, underline on hover.' });
    await page.locator('.site-footer').scrollIntoViewIfNeeded();
    await trio('link-btn-sources', page.locator('.site-footer .link-btn'), null, { components: ['.link-btn'], purpose: '.link-btn: underline at rest, colour change on hover.' });
  });
  await attempt(r, 'links:detail', async () => {
    await go(s, '#/env/harsh-desert', { reload: true });
    await page.waitForSelector('.modal .adversary-encounter-link');
    await trio('adversary-encounter-link', page.locator('.modal .adversary-encounter-link'), page.locator('.modal .adversary-list').first(), { components: ['.adversary-encounter-link'], purpose: 'Adversary link: tinted underline at rest, offset 3px.', zoom: 3 });
    await trio('encounter-builder-link', page.locator('.modal .encounter-builder-link'), null, { components: ['.encounter-builder-link'], purpose: 'Encounter-builder link: muted mono caps, no underline.' });
  });
  await attempt(r, 'links:prep', async () => {
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector('.prep-freshcutgrass-link');
    await trio('prep-freshcutgrass-link', page.locator('.prep-freshcutgrass-link'), page.locator('.bp-stepper:visible').first().locator('xpath=ancestor::*[contains(@class,"prep-central-head")][1]'), { components: ['.prep-freshcutgrass-link (.btn-ghost link)'], purpose: 'Button-styled link in the Adversaries header.', zoom: 3 });
    await trio('prep-adv-link-in-picker', page.locator('.prep-adv-link').first(), page.locator('.prep-adv-row').first(), { components: ['.prep-adv-link'], purpose: 'Picker row link (global a rule inside Prep).', zoom: 3 });
  });
  r.measure('linkTreatments', L);
}

export async function disabledStates(s) {
  const { page } = s, r = s.rec;
  const D = {};
  const rec = async (key, loc, extra) => {
    D[key] = { ...(await loc.first().evaluate(el => ({ opacity: getComputedStyle(el).opacity, tag: el.tagName, cls: String(el.className).slice(0, 60), disabledAttr: el.disabled === true, ariaDisabled: el.getAttribute('aria-disabled') }))), ...extra };
  };
  await attempt(r, 'disabled:prep checkbox + menu', async () => {
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector('.prep-wrap');
    await settle(page, { long: true });
    const cb = page.locator('.prep-col-env .prep-select-checkbox:disabled').first();
    const row = page.locator('.prep-col-env .prep-row:has(.prep-select-checkbox:disabled)').first();
    await rec('prep-select-checkbox:disabled', cb, { expected: '.4' });
    const rows = page.locator('.prep-col-env .prep-row');
    await crop(s, { page: 'disabled', state: 'prep-select-checkbox-disabled-env-picker', locators: [rows.nth(0), rows.nth(2)], pad: 8, zoom: 3, actions: ['Prep already holds 3/3 environments, so unselected environment checkboxes are disabled'], components: ['prep-select-checkbox:disabled (.4)'], purpose: 'Disabled picker checkbox at the environment cap.', refs: ['Top Issue 6', 'Needs Visual Review 12'] });
    await crop(s, { page: 'disabled', state: 'prep-select-checkbox-disabled-vs-checked', locators: [page.locator('.prep-col-adv .prep-adv-row').first(), page.locator('.prep-col-adv .prep-adv-row').nth(3)], pad: 8, zoom: 3, actions: ['adversary picker (enabled) beside the disabled env picker'], components: ['prep-select-checkbox enabled'], purpose: 'Enabled checkboxes in the adversary picker for contrast.', refs: ['Top Issue 6'] });
    await page.locator('.prep-more-btn').click();
    await page.waitForSelector('.prep-menu:visible');
    const del = page.locator('.prep-menu:visible .prep-menu-item.is-disabled');
    await rec('prep-menu-item.is-disabled', del, { expected: '.7' });
    await crop(s, { page: 'disabled', state: 'prep-menu-item-disabled', locators: [page.locator('.prep-menu:visible')], pad: 10, zoom: 2, actions: ['open ⋯ actions menu (only one prep exists, so Delete is disabled)'], components: ['prep-menu-item.is-disabled (.7)'], purpose: 'Disabled menu item.', refs: ['Top Issue 6', 'Needs Visual Review 12'] });
    await page.keyboard.press('Escape');
  });
  await attempt(r, 'disabled:catalog env-prep-btn', async () => {
    await go(s, '#/', { reload: true });
    const btn = page.locator('.grid .card:not(.card-random) .env-prep-btn.is-unavailable').first();
    await rec('env-prep-btn.is-unavailable', btn, { expected: '.45' });
    const card = page.locator('.grid .card:not(.card-random)').nth(1);
    await crop(s, { page: 'disabled', state: 'env-prep-btn-unavailable', locators: [card.locator('.env-actions')], pad: 16, zoom: 5, actions: ['Prep is full (3/3), so Add-to-Prep is unavailable on non-selected cards'], components: ['env-prep-btn.is-unavailable (.45)', 'card-add-btn (enabled)'], purpose: 'Unavailable env action beside its enabled sibling.', refs: ['Top Issue 6', 'Needs Visual Review 12'] });
  });
  await attempt(r, 'disabled:btn:disabled search', async () => {
    // Any real .btn:disabled in the reachable UI?
    const found = {};
    for (const hash of ['#/', '#/lists', '#/journey', '#/prep']) {
      await go(s, hash, { reload: true });
      found[hash] = await page.evaluate(() => [...document.querySelectorAll('.btn:disabled, button.btn[aria-disabled="true"]')].map(e => `${e.className}|${getComputedStyle(e).opacity}`));
    }
    D['btn:disabled search'] = found;
    if (!Object.values(found).some(a => a.length)) r.undone.push({ item: '`.btn:disabled` (opacity .45)', reason: 'No .btn is ever left disabled in the default reachable UI state (new-list Create, Prep New, etc. are always enabled; item-clear-btn only disables with an empty search and is captured as item-clear-btn-disabled if so). Reaching it would need data/code changes.' });
  });
  r.measure('disabledStates', D);
}

export async function modals(s) {
  const { page } = s, r = s.rec, w = s.vp.width;
  await attempt(r, `${w} env modal`, async () => {
    await go(s, '#/env/harsh-desert', { reload: true });
    await page.waitForSelector('.modal .modal-header');
    await settle(page, { long: true });
    await full(s, { page: 'detail', state: 'environment-modal', route: '#/env/harsh-desert', actions: ['open the Harsh Desert detail overlay'], components: ['modal', 'modal-header', 'modal-close', 'rank-icon-sm ×4', 'feature-type', 'dice-btn', 'countdown-btn'], purpose: 'Environment detail modal (border --line, r-lg, e-4).', refs: ['Overlays', 'Top Issue 4'] });
    await crop(s, { page: 'detail', state: 'environment-modal-header', locators: [page.locator('.modal-header')], pad: 8, zoom: w >= 1920 ? 1 : 2, components: ['modal-header', 'card-add-btn', 'env-prep-btn', 'detail-tier-pills', 'modal-close'], purpose: 'Modal header: action buttons (28px), hexagons (26px), close (24px).', refs: ['Top Issue 1', 'Needs Visual Review 1'] });
    r.measure(`modalSurface_${w}`, await measureEls(page, { modal: '.modal', header: '.modal-header', close: '.modal-close', body: '.modal-body' }));
  });
  await attempt(r, `${w} adv-art modal`, async () => {
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector('.prep-adv-thumb-btn');
    await page.locator('.prep-adv-thumb-btn').first().click();
    await page.waitForSelector('.adv-art-modal-card', { state: 'visible' });
    await settle(page, { long: true });
    await full(s, { page: 'detail', state: 'adversary-art-modal', route: '#/prep (art overlay)', actions: ['open Prep', 'click the first adversary thumbnail'], components: ['adv-art-modal-card', 'adv-art-close', 'adv-art-copy'], purpose: 'Adversary art modal (own close recipe: 24px round, ink@.72).', refs: ['Overlays', 'Top Issue 1'] });
    r.measure(`advArtModal_${w}`, await measureEls(page, { card: '.adv-art-modal-card', close: '.adv-art-close', copy: '.adv-art-copy' }));
    await page.keyboard.press('Escape');
  });
}

/** 640 / 641 / 642 diagnostic. Only rules that key off 641 are exercised. */
export async function breakpoint(browser, baseUrl, rec, outDir, { openSession: open, go: goto, full: fullShot }) {
  const widths = [640, 641, 642];
  const geom = {};
  for (const w of widths) {
    const vp = { width: w, height: 900 };
    const s = await open(browser, baseUrl, vp, 'full', rec);
    const { page } = s;
    geom[w] = {};
    for (const [name, hash] of [['catalog', '#/'], ['lists', '#/lists'], ['journey', '#/journey'], ['prep', '#/prep']]) {
      await attempt(rec, `bp ${w} ${name}`, async () => {
        await goto(s, hash, { reload: true });
        await page.waitForSelector('.shell');
        await settle(page, { long: true });
        const m = await page.evaluate(() => {
          const bx = sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
          const before = getComputedStyle(document.body, '::before');
          return {
            scrollWidth: document.documentElement.scrollWidth,
            shell: bx('.shell'), grid: bx('.grid'), firstCard: bx('.card'), headerInner: bx('.header-inner'), siteHeader: bx('.site-header'),
            prepWrap: bx('.prep-wrap'), prepMain: bx('.prep-main'), journeyCols: bx('.journey-cols'),
            artOpacity: before.opacity, artSize: before.backgroundSize, artFilter: before.filter,
            cols: document.querySelector('.grid') ? getComputedStyle(document.querySelector('.grid')).gridTemplateColumns : null,
            mqMax640: matchMedia('(max-width: 640px)').matches, mqMax641: matchMedia('(max-width: 641px)').matches, mqMin641: matchMedia('(min-width: 641px)').matches,
          };
        });
        geom[w][name] = m;
        await fullShot(s, { page: name, state: 'default', dir: 'breakpoint-640-642', actions: [`set viewport ${w}x900`, `open ${hash}`], components: ['whole page'], purpose: `Diagnostic at ${w}px for the 640/641 near-duplicate breakpoints.`, refs: ['Responsive Findings', 'Top Issue 8', 'Needs Visual Review 14'], keepMouse: false });
      });
    }
    // Toast stack: only .toast-stack bottom offset differs by (min-width:641) when body.has-to-top.
    await attempt(rec, `bp ${w} toast`, async () => {
      await goto(s, '#/lists', { reload: true });
      await page.fill('#new-list-input', 'Diagnostic list');
      await page.click('#new-list-btn');
      await page.waitForSelector('.toast', { timeout: 4000 });
      geom[w].toast = await page.evaluate(() => { const st = document.querySelector('.toast-stack'); if (!st) return null; const r = st.getBoundingClientRect(), cs = getComputedStyle(st); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), bottom: cs.bottom, top: cs.top }; });
      await fullShot(s, { page: 'lists', state: 'toast-visible', dir: 'breakpoint-640-642', allowToast: true, actions: [`viewport ${w}x900`, 'create a list so a toast appears'], components: ['toast-stack'], purpose: 'Toast stack placement (min-width: 641px rule).', refs: ['Responsive Findings', 'Top Issue 8'] });
    });
    await s.context.close();
  }
  rec.measure('breakpoint640to642', geom);
  // Objective diff between adjacent widths.
  const diffs = [];
  for (const pageName of ['catalog', 'lists', 'journey', 'prep', 'toast']) {
    for (const [a, b] of [[640, 641], [641, 642]]) {
      const ga = geom[a]?.[pageName], gb = geom[b]?.[pageName];
      if (!ga || !gb) continue;
      const keys = new Set([...Object.keys(ga), ...Object.keys(gb)]);
      for (const k of keys) {
        if (k === 'scrollWidth' || k === 'mqMax640' || k === 'mqMax641' || k === 'mqMin641') continue;
        const va = JSON.stringify(ga[k]), vb = JSON.stringify(gb[k]);
        // Ignore pure 1px width jitter that simply follows the 1px viewport step.
        const near = (x, y) => x && y && typeof x === 'object' && typeof y === 'object' && Object.keys(x).every(p => typeof x[p] === 'number' && Math.abs(x[p] - y[p]) <= (p === 'w' ? 1 : 0));
        if (va !== vb && !near(ga[k], gb[k]) && !(k === 'cols' && Math.abs(parseFloat(ga[k]) - parseFloat(gb[k])) <= 1)) diffs.push({ page: pageName, from: a, to: b, prop: k, a: ga[k], b: gb[k] });
      }
    }
  }
  rec.measure('breakpoint640to642_diffs', diffs);
}

/** The three checkbox recipes at identical zoom (spec §34). */
export async function checkboxes(s) {
  const { page } = s, r = s.rec;
  const CB = {};
  const tight = async (recipe, state, loc, o = {}) => {
    const tgt = o.crop ? o.crop : loc.first();
    return crop(s, { page: 'checkbox', state: `${recipe}-${state}`, locators: [tgt], pad: o.pad ?? 12, zoom: o.crop ? 4 : 6, keepMouse: !!o.keep, actions: o.actions, verified: o.verified, components: [recipe], refs: ['Top Issue 10', 'Top Issue 20'], purpose: `${recipe} checkbox, ${state}.`, notes: o.notes });
  };
  const m = async (recipe, loc) => { CB[recipe] = await loc.first().evaluate(el => { const cs = getComputedStyle(el), r = el.getBoundingClientRect(), bf = getComputedStyle(el, '::after'); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), radius: cs.borderTopLeftRadius, border: `${cs.borderTopWidth} ${cs.borderTopColor}`, bg: cs.backgroundColor, opacity: cs.opacity, check: { w: bf.width, h: bf.height } }; }); };

  await attempt(r, 'checkbox:atl-row', async () => {
    await go(s, '#/env/harsh-desert', { reload: true });
    await page.waitForSelector('#detail-add-to-list-bottom');
    await page.locator('#detail-add-to-list-bottom').click();
    await page.waitForSelector('.atl-row');
    await page.waitForTimeout(200);
    const rows = page.locator('.atl-row input[type="checkbox"]');
    // list-a & list-c are checked for Harsh Desert, list-b unchecked
    await tight('atl-row', 'checked', rows.nth(0), { actions: ['open Harsh Desert → Add to… overlay'] });
    await tight('atl-row', 'unchecked', rows.nth(1));
    await m('atl-row', rows.nth(0));
    const ok = await focusVisible(s, rows.nth(1));
    await tight('atl-row', 'focus-visible', rows.nth(1), { keep: true, verified: { ':focus-visible': ok }, actions: ['Shift+Tab then focus()'] });
    await page.keyboard.press('Escape');
    await go(s, '#/env/abandoned-grove', { reload: true });
    await page.waitForSelector('#detail-add-to-list-bottom');
    await page.locator('#detail-add-to-list-bottom').click();
    await page.waitForSelector('#atl-prep-row');
    await tight('atl-row', 'disabled', page.locator('#atl-prep-row input'), { actions: ['open Abandoned Grove → Add to… (Prep is 3/3, so the Prep row is disabled)'] });
    await page.keyboard.press('Escape');
  });
  await attempt(r, 'checkbox:prep-select', async () => {
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector('.prep-wrap');
    await settle(page, { long: true });
    const adv = page.locator('.prep-col-adv .prep-select-checkbox');
    const checked = page.locator('.prep-col-adv .prep-select-checkbox:checked').first();
    const unchecked = page.locator('.prep-col-adv .prep-select-checkbox:not(:checked)').first();
    await tight('prep-select-checkbox', 'checked', checked);
    await tight('prep-select-checkbox', 'unchecked', unchecked);
    await m('prep-select-checkbox', checked);
    const ok = await focusVisible(s, unchecked);
    await tight('prep-select-checkbox', 'focus-visible', unchecked, { keep: true, verified: { ':focus-visible': ok }, actions: ['Shift+Tab then focus()'] });
    await unchecked.evaluate(el => el.blur());
    await tight('prep-select-checkbox', 'disabled', page.locator('.prep-col-env .prep-select-checkbox:disabled'), { actions: ['3/3 environments selected, so the unselected environment checkboxes are disabled'] });
  });
  await attempt(r, 'checkbox:ms', async () => {
    // .ms-checkbox is an sr-only input: the visible "checkbox" of this recipe is the whole .ms-row
    // (gold tint when checked, outline when focused), so the row is what gets cropped.
    // Open by keyboard so the later focus() keeps keyboard modality (Shift+Tab inside the panel would close it).
    await focusVisible(s, page.locator('.prep-adv-toolbar .ms-trigger').first());
    await page.keyboard.press('Enter');
    await page.waitForSelector('.ms-panel', { state: 'visible' });
    const row = () => page.locator('.ms-panel:visible .ms-row').nth(0);
    await m('ms-checkbox', row().locator('.ms-checkbox'));
    const note = 'The input is visually hidden (sr-only); the row is the visible control.';
    await tight('ms-checkbox', 'unchecked', row(), { crop: row(), pad: 10, actions: ['open adversary Type multiselect'], notes: note });
    await row().locator('input').focus();
    const ok = await row().locator('input').evaluate(el => el.matches(':focus-visible'));
    await tight('ms-checkbox', 'focus-visible', row(), { crop: row(), keep: true, pad: 10, verified: { ':focus-visible': ok }, actions: ['focus the Type trigger by keyboard, press Enter to open, then focus() the first row input'], notes: note });
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    await parkMouse(s);
    await tight('ms-checkbox', 'checked', row(), { crop: row(), pad: 10, actions: ['press Space on the focused row to tick it'], notes: note + ' Focus ring remains on the row after the keyboard toggle.' });
    r.undone.push({ item: 'ms-checkbox disabled', reason: 'ms-rows are never disabled in the shipped UI; the state does not exist to capture.' });
    await page.keyboard.press('Escape');
  });
  r.measure('checkboxRecipes', CB);
}
