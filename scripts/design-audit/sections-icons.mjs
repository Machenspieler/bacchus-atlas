// Icon-only button families, optical icon comparison, chips/badges (spec §24–27).
import { full, crop, go, hover, focusVisible, attempt, measureEls, settle, parkMouse, unionBox } from './harness.mjs';

/** Per-family state strip. Produces tight, equal-zoom crops so families can be compared. */
async function stateSet(s, fam, loc, { states = ['default', 'hover', 'focus-visible'], ctx, refs = ['Top Issue 1'], page = 'ui', extra = {} } = {}) {
  const r = s.rec;
  const out = {};
  const first = loc.first();
  await first.scrollIntoViewIfNeeded().catch(() => {});
  const isDisabled = await first.evaluate(el => el.disabled === true || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('is-unavailable') || el.classList.contains('is-disabled')).catch(() => false);
  const info = await first.evaluate(el => {
    const cs = getComputedStyle(el), rc = el.getBoundingClientRect();
    const svg = el.querySelector('svg');
    const sr = svg ? svg.getBoundingClientRect() : null;
    const strokes = svg ? [...new Set([...svg.querySelectorAll('[stroke-width]')].map(n => n.getAttribute('stroke-width')))] : [];
    return {
      box: `${+rc.width.toFixed(1)}x${+rc.height.toFixed(1)}`, radius: cs.borderTopLeftRadius, opacity: cs.opacity,
      border: `${cs.borderTopWidth} ${cs.borderTopStyle}`, borderColor: cs.borderTopColor, bg: cs.backgroundColor, color: cs.color,
      glyph: svg ? 'svg' : (el.textContent || '').trim().slice(0, 3) || 'none',
      svgSize: sr ? `${+sr.width.toFixed(1)}x${+sr.height.toFixed(1)}` : null,
      svgFill: svg ? (svg.getAttribute('fill') || '') : null, strokeWidths: strokes,
    };
  });
  info.disabledNaturally = isDisabled;
  r.measure(`iconFamily_${fam}`, { ...info, ...extra });
  const tight = state => ({ page, state: `icon-${fam}-${state}`, locators: [first], pad: 14, zoom: 4, components: [fam], refs });
  if (states.includes('default')) {
    await parkMouse(s);
    out.default = await crop(s, { ...tight('default'), purpose: `${fam} at rest (equal-zoom crop).`, actions: ['reach the control in its normal UI state'] });
  }
  if (states.includes('hover')) {
    await hover(s, first);
    out.hover = await crop(s, { ...tight('hover'), keepMouse: true, actions: ['hover the control'], purpose: `${fam} hover.` });
  }
  if (states.includes('focus-visible')) {
    const ok = await focusVisible(s, first);
    out.focus = await crop(s, { ...tight('focus-visible'), keepMouse: true, actions: ['Shift+Tab then .focus() so keyboard modality applies'], verified: { ':focus-visible': ok }, notes: ok ? '' : 'The control is natively disabled and cannot take focus, so this crop shows its resting disabled state, not a focus ring.', purpose: `${fam} keyboard focus ring.` });
    await first.evaluate(el => el.blur());
  }
  if (states.includes('disabled') && isDisabled) {
    out.disabled = await crop(s, { ...tight('disabled'), actions: ['natural disabled state'], purpose: `${fam} disabled.`, refs: [...refs, 'Top Issue 6', 'Needs Visual Review 12'] });
  }
  if (ctx) {
    await parkMouse(s);
    out.context = await crop(s, { page, state: `icon-${fam}-in-context`, locators: [ctx], pad: 10, zoom: 2, components: [fam, 'surrounding UI'], refs, purpose: `${fam} within its surrounding UI.`, actions: ['reach the control in its normal UI state'] });
  }
  s.famResults ??= {};
  s.famResults[fam] = { out, info };
  return out;
}

export async function iconFamilies(s) {
  const { page } = s, r = s.rec;
  const run = (label, fn) => attempt(r, `icons:${label}`, fn);

  // --- Catalog: search-clear-btn, card-add-btn, env-prep-btn ---
  await run('catalog', async () => {
    await go(s, '#/', { reload: true });
    await page.fill('.search-input-wrap input', 'forest');
    await page.waitForTimeout(300);
    await stateSet(s, 'search-clear-btn', page.locator('.search-input-wrap .search-clear-btn'), { ctx: page.locator('.search-input-wrap') });
    await page.fill('.search-input-wrap input', '');
    await page.evaluate(() => window.scrollTo(0, 0));
    const card = page.locator('.grid .card:not(.card-random)').nth(1);
    await stateSet(s, 'card-add-btn', card.locator('.card-add-btn'), { ctx: card.locator('.env-actions') });
    await stateSet(s, 'env-prep-btn', card.locator('.env-prep-btn'), { ctx: card.locator('.env-actions') });
    await hover(s, card.locator('.card-add-btn'));
  });
  // --- Modal close + countdown overlay ---
  await run('modal', async () => {
    await go(s, '#/env/harsh-desert', { reload: true });
    await page.waitForSelector('.modal .modal-close');
    await stateSet(s, 'modal-close', page.locator('.modal .modal-close'), { ctx: page.locator('.modal-header') });
    await page.locator('.modal .countdown-btn').first().click();
    await page.waitForSelector('.countdown-overlay', { state: 'visible' });
    await stateSet(s, 'countdown-overlay-btn', page.locator('.countdown-overlay-btn'), { ctx: page.locator('.countdown-overlay') });
    await stateSet(s, 'countdown-overlay-close', page.locator('.countdown-overlay-close'), { states: ['default', 'hover', 'focus-visible'] });
    await page.keyboard.press('Escape');
  });
  // --- Lists: list-card-del ---
  await run('lists', async () => {
    await go(s, '#/lists', { reload: true });
    await stateSet(s, 'list-card-del', page.locator('.list-card-del'), { ctx: page.locator('.list-card').first() });
  });
  // --- Journey: jr-icon-btn ---
  await run('journey', async () => {
    await go(s, '#/journey', { reload: true });
    const panel = page.locator('.journey-panel[data-kind="region"]');
    await panel.locator('[data-roll-new]').click();
    await panel.locator('.journey-draft [data-save]').click();
    const entry = panel.locator('.journey-entry').first();
    await stateSet(s, 'jr-icon-btn', entry.locator('.jr-icon-btn.jr-reroll').first(), { page: 'journey', ctx: entry.locator('.jr-rows .jr-row').first(), refs: ['Top Issue 1', 'Page-by-Page: Journey', 'Needs Visual Review 1'] });
    await stateSet(s, 'jr-icon-btn-name-roll', entry.locator('[data-roll-name]'), { page: 'journey', ctx: entry.locator('.jr-name-row'), refs: ['Top Issue 1', 'Page-by-Page: Journey'] });
  });
  // --- Prep: central clear, icon btn, remove, item clear, nav buttons, prep search clear ---
  await run('prep', async () => {
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector('.prep-wrap');
    await settle(page, { long: true });
    await stateSet(s, 'prep-central-clear', page.locator('.prep-central-clear').first(), { page: 'prep', ctx: page.locator('.prep-central-head').first() });
    await stateSet(s, 'prep-icon-btn', page.locator('.prep-more-btn'), { page: 'prep', ctx: page.locator('.prep-bar') });
    await stateSet(s, 'prep-sel-remove', page.locator('.prep-sel-remove').first(), { page: 'prep', ctx: page.locator('.prep-sel--card').first() });
    await page.locator('.prep-items-panel').scrollIntoViewIfNeeded();
    await stateSet(s, 'item-clear-btn', page.locator('.item-clear-btn'), { page: 'prep', states: ['default', 'hover', 'focus-visible', 'disabled'], ctx: page.locator('.item-toolbar-search') });
    const nav = page.locator('.prep-item-strip-wrap:visible .prep-item-nav-btn');
    await stateSet(s, 'prep-item-nav-btn-prev-disabled', nav.first(), { page: 'prep', states: ['default', 'disabled'], ctx: page.locator('.prep-item-strip-wrap:visible').first() });
    await stateSet(s, 'prep-item-nav-btn', nav.last(), { page: 'prep', ctx: page.locator('.prep-item-strip-wrap:visible').first() });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.fill('#prep-adv-search', 'ghoul');
    await page.waitForTimeout(300);
    await stateSet(s, 'search-clear-btn-prep', page.locator('#prep-adv-search-clear'), { page: 'prep', ctx: page.locator('.prep-adv-search') });
    await page.fill('#prep-adv-search', '');
  });
  // --- Prep: adversary art modal ---
  await run('adv-art', async () => {
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector('.prep-adv-thumb-btn');
    await page.locator('.prep-adv-thumb-btn').first().click();
    await page.waitForSelector('.adv-art-close', { state: 'visible' });
    await settle(page);
    await stateSet(s, 'adv-art-close', page.locator('.adv-art-close'), { page: 'prep', ctx: page.locator('.adv-art-modal-card') });
    await stateSet(s, 'adv-art-copy', page.locator('.adv-art-copy'), { page: 'prep', ctx: page.locator('.adv-art-modal-card') });
    await page.keyboard.press('Escape');
  });
  // --- Prep: bp-pop-close + bp-step (+ disabled) ---
  await run('bp', async () => {
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector('.bp-summary');
    await page.locator('.bp-summary').click();
    await page.waitForSelector('.bp-popover', { state: 'visible' });
    const pop = page.locator('.bp-popover:visible');
    await stateSet(s, 'bp-pop-close', pop.locator('.bp-pop-close'), { page: 'prep', ctx: pop.locator('.bp-pop-head') });
    await stateSet(s, 'bp-step', pop.locator('.bp-step').first(), { page: 'prep', ctx: pop.locator('.bp-pop-row--pc, .bp-pop-row').first() });
    // Natural disabled state: step the character count down to its minimum.
    const minus = pop.locator('.bp-step').first();
    for (let i = 0; i < 12 && !(await minus.isDisabled()); i++) await minus.click();
    if (await minus.isDisabled()) {
      await stateSet(s, 'bp-step-disabled', minus, { page: 'prep', states: ['default', 'disabled'], ctx: pop.locator('.bp-pop-row--pc, .bp-pop-row').first(), refs: ['Top Issue 6', 'Needs Visual Review 12'] });
    } else r.fail('icons:bp-step-disabled', 'minus never became disabled');
    await page.keyboard.press('Escape');
  });
  // --- Soundboard ---
  await run('soundboard', async () => {
    await go(s, '#/prep', { reload: true });
    await stateSet(s, 'sb-trigger', page.locator('.sb-trigger'), { page: 'ui', ctx: page.locator('.header-actions') });
    await page.locator('.sb-trigger').click();
    await page.waitForSelector('.sb-panel', { state: 'visible' });
    const panel = page.locator('.sb-panel:visible');
    await stateSet(s, 'sb-ctl-settings', panel.locator('.sb-ctl[data-act="settings"]'), { ctx: panel.locator('.sb-ctl').first().locator('xpath=..') });
    await stateSet(s, 'sb-ctl-stop-aria-disabled', panel.locator('.sb-ctl[data-act="stop"]'), { states: ['default', 'hover', 'focus-visible', 'disabled'] });
    await stateSet(s, 'sb-ctl-close', panel.locator('.sb-ctl[data-act="close"]'), {});
    await page.keyboard.press('Escape');
  });
  // --- Item modal: loot-name-act ---
  await run('item-modal', async () => {
    await go(s, '#/env/civic-library', { reload: true });
    await page.waitForSelector('.modal .item-btn');
    await page.locator('.modal .item-btn').first().click();
    await page.waitForSelector('.loot-name-act', { state: 'visible' });
    await settle(page);
    const act = page.locator('.loot-name-act');
    await stateSet(s, 'loot-name-act', act.first(), { page: 'detail', ctx: act.first().locator('xpath=..') });
    await page.keyboard.press('Escape');
  });
}

export async function storageNotice(s) {
  const { page } = s, r = s.rec;
  await attempt(r, 'icons:storage-notice', async () => {
    await go(s, '#/lists', { reload: true });
    await page.waitForSelector('.storage-notice');
    await full(s, { page: 'lists', state: 'storage-notice-visible', actions: ['open Lists with the notice flag unset'], components: ['storage-notice', 'storage-notice-close'], purpose: 'Storage notice banner (the only auto-width, opacity-only-hover close button).', refs: ['Top Issue 1'] });
    await stateSet(s, 'storage-notice-close', page.locator('.storage-notice-close'), { page: 'lists', ctx: page.locator('.storage-notice') });
  });
}

/** SVG stroke/size inventory + captioned sheets built from real crops. */
export async function opticalSet(s) {
  const { page } = s, r = s.rec;
  await attempt(r, 'optical:svg inventory', async () => {
    const routes = [['catalog', '#/'], ['prep', '#/prep'], ['journey', '#/journey'], ['lists', '#/lists']];
    const inv = {};
    for (const [name, hash] of routes) {
      await go(s, hash, { reload: true });
      inv[name] = await page.evaluate(() => [...document.querySelectorAll('svg')].filter(v => v.getBoundingClientRect().width > 0 && !v.closest('[hidden]')).map((v, i) => {
        const rc = v.getBoundingClientRect();
        const widths = [...new Set([...v.querySelectorAll('[stroke-width]')].map(n => n.getAttribute('stroke-width')))];
        return { i, size: `${Math.round(rc.width)}x${Math.round(rc.height)}`, fill: v.getAttribute('fill') || '', widths, host: (v.closest('button,a,[class]')?.className || '').toString().split(' ').slice(0, 2).join('.') };
      }));
    }
    r.measure(`svgInventory_${s.vp.width}`, inv);
  });
  // Stroke 1.6 vs 1.8 in real UI: Prep "+ New" (plus), BP stepper (minus/plus), title chevron, session chevron.
  await attempt(r, 'optical:stroke samples', async () => {
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector('.prep-wrap');
    await settle(page, { long: true });
    const strokes = await page.evaluate(() => ['.prep-new-btn svg', '.bp-stepper svg', '.sp-session-chevron', '.prep-title-btn svg', '.prep-central-clear svg', '.prep-more-btn svg', '.item-view-btn svg', '.header-nav svg'].map(sel => {
      const v = document.querySelector(sel); if (!v) return { sel, widths: null };
      const t = v.tagName.toLowerCase() === 'svg' ? v : v.querySelector('svg');
      return { sel, widths: t ? [...new Set([...t.querySelectorAll('[stroke-width]')].map(n => n.getAttribute('stroke-width')))] : null, size: t ? `${Math.round(t.getBoundingClientRect().width)}` : null };
    }));
    r.measure('strokeSamples_prep', strokes);
    await crop(s, { page: 'prep', state: 'stroke-sample-new-and-stepper', locators: [page.locator('.prep-new-btn'), page.locator('.prep-more-btn')], pad: 12, zoom: 4, components: ['prep-new-btn plus', 'prep-icon-btn dots'], purpose: 'Line-icon stroke weight sample (1.6 vs 1.8 per measurements.strokeSamples_prep).', refs: ['Needs Visual Review 1'] });
    await crop(s, { page: 'prep', state: 'stroke-sample-bp-stepper', locators: [page.locator('.bp-stepper:visible').first()], pad: 12, zoom: 4, components: ['bp-step minus/plus'], purpose: 'Stepper minus/plus stroke.', refs: ['Needs Visual Review 1'] });
    await crop(s, { page: 'prep', state: 'stroke-sample-session-chevron', locators: [page.locator('.sp-session-control')], pad: 12, zoom: 4, components: ['sp-session-chevron'], purpose: 'Chevron stroke sample.', refs: ['Needs Visual Review 1'] });
  });
  // Filled ITEM_* icons beside line icons — item modal.
  await attempt(r, 'optical:filled item icons', async () => {
    await go(s, '#/env/civic-library', { reload: true });
    await page.waitForSelector('.modal .item-btn');
    await page.locator('.modal .item-btn').first().click();
    await page.waitForSelector('.loot-name-act', { state: 'visible' });
    await settle(page, { long: true });
    await full(s, { page: 'detail', state: 'item-modal', route: '#/env/civic-library (item overlay)', actions: ['open Civic Library detail', 'click the first .item-btn'], components: ['item modal', 'loot-name-act', 'ITEM_* filled icons', 'modal-close'], purpose: 'Item/loot modal in context (filled ITEM_* icons beside line icons).', refs: ['Needs Visual Review 2', 'Overlays'] });
    const acts = page.locator('.loot-name-act');
    const box = await unionBox([acts.first().locator('xpath=ancestor::*[contains(@class,"loot")][1]')]).catch(() => null);
    const row = acts.first().locator('xpath=..');
    await crop(s, { page: 'detail', state: 'filled-item-icons-vs-line', locators: [row], pad: 14, zoom: 4, components: ['loot-name-act (filled Material-style ITEM_*)', 'adjacent line controls'], purpose: 'Filled ITEM_* icons in the item card title row.', refs: ['Top Issue 9', 'Needs Visual Review 2'] });
    const modalHead = page.locator('.modal:visible .modal-header').last();
    await crop(s, { page: 'detail', state: 'item-modal-header', locators: [modalHead], pad: 10, zoom: 2, components: ['modal-header', 'modal-close'], purpose: 'Item modal header (line close ×) next to filled action icons.', refs: ['Needs Visual Review 2'] }).catch(() => {});
    const extIcons = await page.evaluate(() => [...document.querySelectorAll('.modal svg[fill="currentColor"]')].map(v => ({ host: (v.closest('button,a')?.className || '').toString(), size: Math.round(v.getBoundingClientRect().width) })));
    r.measure(`filledIcons_${s.vp.width}`, extIcons);
    await page.keyboard.press('Escape');
  });
}

export async function chips(s) {
  const { page } = s, r = s.rec;
  const run = (label, fn) => attempt(r, `chips:${label}`, fn);
  const doneCrops = [];
  const c = async (state, locators, o = {}) => {
    const e = await crop(s, { page: 'chips', state, locators, pad: o.pad ?? 10, zoom: o.zoom ?? 3, components: o.components, purpose: o.purpose, refs: ['Top Issue 2', 'Needs Visual Review 4'], actions: o.actions });
    doneCrops.push(e);
    return e;
  };

  await run('catalog card chips', async () => {
    await go(s, '#/', { reload: true });
    const card = page.locator('.grid .card:not(.card-random)').nth(1);
    await c('card-environment-type-and-biome', [card.locator('.card-meta')], { components: ['environment-type-chip', 'biome-chip'], purpose: 'Info chips on a catalog card (24px, xs radius, mono 11, no caps).' });
    await c('card-tier-badge', [card.locator('.card-tier-badge')], { components: ['rank-icon-sm'], purpose: 'Hex tier badge (26px).', zoom: 5 });
    r.measure('chipMetrics_card', await measureEls(page, { type: '.card .environment-type-chip', biome: '.card .biome-chip', tier: '.card .card-tier-badge' }));
  });
  await run('region chip', async () => {
    await go(s, '#/', { reload: true });
    await page.fill('.search-input-wrap input', 'devouring');
    await page.waitForTimeout(400);
    await page.waitForSelector('.card .region-chip', { timeout: 5000 });
    const card = page.locator('.card:has(.region-chip)').first();
    await c('card-region-chip', [card.locator('.card-meta')], { components: ['region-chip', 'environment-type-chip', 'biome-chip'], purpose: 'region-chip (hope border) beside the type and biome chips.' });
    r.measure('chipMetrics_region', await measureEls(page, { region: '.card .region-chip' }));
    await page.fill('.search-input-wrap input', '');
  });
  await run('detail chips', async () => {
    await go(s, '#/env/harsh-desert', { reload: true });
    await page.waitForSelector('.modal .feature-type');
    const m = page.locator('.modal');
    await c('detail-feature-types', [m.locator('.feature-head:has(.feature-type.passive)').first()], { components: ['feature-type.passive'], purpose: 'feature-type (passive).' });
    await c('detail-feature-type-action', [m.locator('.feature-head:has(.feature-type.action)').first()], { components: ['feature-type.action (fear)'], purpose: 'feature-type.action uses fear red (non-destructive).', zoom: 4 });
    await c('detail-feature-type-reaction', [m.locator('.feature-head:has(.feature-type.reaction)').first()].filter(Boolean), { components: ['feature-type.reaction (teal)'], purpose: 'feature-type.reaction.', zoom: 4 }).catch(() => {});
    const dice = m.locator('.dice-btn').first();
    await dice.scrollIntoViewIfNeeded();
    await c('detail-dice-btn-in-text', [dice.locator('xpath=ancestor::*[self::p or self::div][1]')], { components: ['dice-btn'], purpose: 'dice-btn (interactive pill, hope outline) inside body text.', zoom: 3 });
    const cd = m.locator('.countdown-btn').first();
    await cd.scrollIntoViewIfNeeded();
    await c('detail-countdown-btn-in-text', [cd.locator('xpath=ancestor::*[self::p or self::div][1]')], { components: ['countdown-btn'], purpose: 'countdown-btn (interactive pill, teal outline) inside body text.', zoom: 3 });
    await c('detail-dice-vs-countdown-tight', [dice, cd], { components: ['dice-btn', 'countdown-btn'], purpose: 'Both inline interactive pills: dice (gold) vs countdown (teal), sizes/paddings.', zoom: 5, pad: 4 }).catch(() => {});
    r.measure('chipMetrics_inline', await measureEls(page, { dice: '.modal .dice-btn', countdown: '.modal .countdown-btn', featureType: '.modal .feature-type' }));
    // Footer biome chip in the same modal
    const foot = m.locator('.detail-footer-biomes');
    await foot.scrollIntoViewIfNeeded();
    await c('detail-footer-biome-chip', [foot], { components: ['biome-chip (detail footer)'], purpose: 'Biome chip in detail footer.', zoom: 4 });
    // Tier hexagons in the modal header
    await m.locator('.modal-header').scrollIntoViewIfNeeded();
    await c('detail-tier-hexagons', [m.locator('.detail-tier-pills')], { components: ['rank-icon-sm (26px) ×4'], purpose: 'Tier hexagons in the detail header beside the 24px close button.', zoom: 4, pad: 14 });
  });
  await run('item-btn', async () => {
    await go(s, '#/env/civic-library', { reload: true });
    await page.waitForSelector('.modal .item-btn');
    const ib = page.locator('.modal .item-btn').first();
    await ib.scrollIntoViewIfNeeded();
    await c('detail-item-btn-in-text', [ib.locator('xpath=ancestor::*[self::p or self::li or self::div][1]')], { components: ['item-btn'], purpose: 'item-btn (interactive pill, teal, body face) inside text.', zoom: 3 });
    r.measure('chipMetrics_itemBtn', await measureEls(page, { item: '.modal .item-btn' }));
  });
  await run('adversary badges', async () => {
    await go(s, '#/env/progenitor-minds-lair', { reload: true });
    await page.waitForSelector('.modal .adversary-link-btn');
    const m = page.locator('.modal');
    const alb = m.locator('.adversary-link-btn').first();
    await alb.scrollIntoViewIfNeeded();
    await c('detail-adversary-link-btn', [alb.locator('xpath=ancestor::*[self::p or self::li or self::div][1]')], { components: ['adversary-link-btn (fear outline, pill)'], purpose: 'adversary-link-btn: interactive pill using fear red.', zoom: 3 });
    // open the adversary block so range/damage badges render (details element)
    const det = m.locator('details.adversary-block').first();
    if (await det.count()) { await det.evaluate(el => { el.open = true; }); }
    const rng = m.locator('.adversary-range-badge').first();
    if (await rng.count()) {
      await rng.scrollIntoViewIfNeeded();
      await c('detail-adversary-range-and-damage-badges', [rng.locator('xpath=..')], { components: ['adversary-range-badge', 'adversary-damage-type-badge'], purpose: 'Range / damage-type badges (auto height, caps .06em).', zoom: 4 });
    }
    r.measure('chipMetrics_adversary', await measureEls(page, { link: '.modal .adversary-link-btn', range: '.modal .adversary-range-badge', damage: '.modal .adversary-damage-type-badge' }));
  });
  await run('region env tier', async () => {
    await go(s, '#/env/devouring-green', { reload: true });
    await page.waitForSelector('.modal .region-env-btn');
    const rb = page.locator('.modal .region-env-btn');
    await rb.first().scrollIntoViewIfNeeded();
    await c('detail-region-env-buttons', [rb.first().locator('xpath=..')], { components: ['region-env-btn', 'region-env-btn.active (gold .16)', 'region-env-tier'], purpose: 'Region env buttons with region-env-tier chips; active one uses gold .16.', zoom: 2 });
    r.measure('chipMetrics_regionEnv', await measureEls(page, { tier: '.modal .region-env-tier', active: '.modal .region-env-btn.active' }));
    // Re-tiered modal (distinct major overlay): click a different tier hexagon.
    const tiers = page.locator('.modal .detail-tier-pills .rank-icon');
    if (await tiers.count() > 1) {
      await tiers.nth(2).click();
      await page.waitForTimeout(300);
      await page.locator('.modal').evaluate(el => el.scrollTo(0, 0)).catch(() => {});
      await full(s, { page: 'detail', state: 'modal-retiered', route: '#/env/devouring-green', actions: ['open Devouring Green detail', 'click the tier-3 hexagon in the header'], components: ['modal.retiered (gold frame)'], purpose: 'Re-tiered environment modal (gold frame via raw rgba).', refs: ['Overlays', 'Top Issue 5'] });
    }
  });
  await run('journey chips', async () => {
    await go(s, '#/journey', { reload: true });
    const panel = page.locator('.journey-panel[data-kind="region"]');
    let kept = 0, blight = false;
    for (let i = 0; i < 60 && !(kept >= 2 && blight); i++) {
      await panel.locator('[data-roll-new]').click();
      const isBlight = (await panel.locator('.journey-draft .jr-blight').count()) > 0;
      if (kept < 2 || (isBlight && !blight)) { await panel.locator('.journey-draft [data-save]').click(); kept++; blight = blight || isBlight; }
      else await panel.locator('.journey-draft [data-discard]').click();
    }
    const jb = page.locator('.jr-blight').first();
    if (await jb.count()) {
      await jb.scrollIntoViewIfNeeded();
      await c('journey-jr-blight-and-metadata', [jb.locator('xpath=ancestor::*[contains(@class,"jr-row")][1]')], { components: ['jr-blight', 'jr-icon-btn', 'inline metadata (jr-die, jr-roll)'], purpose: 'jr-blight beside jr-icon-btn and inline row metadata.', zoom: 2, pad: 8 });
      await c('journey-jr-blight-tight', [jb], { components: ['jr-blight'], purpose: 'jr-blight chip (fear outline, caps .05em).', zoom: 5 });
    } else r.fail('chips:jr-blight', 'no Shadowblighted region produced in 60 seeded rolls');
    await c('journey-count', [page.locator('.journey-count').first().locator('xpath=..')], { components: ['journey-count'], purpose: 'journey-count (pill, 18px).', zoom: 5, pad: 6 });
    r.measure('chipMetrics_journey', await measureEls(page, { blight: '.jr-blight', count: '.journey-count', die: '.jr-die' }));
  });
  await run('prep count', async () => {
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector('.prep-central-count');
    const pc = page.locator('.prep-central-count');
    await c('prep-central-count-is-limit', [pc.first().locator('xpath=..')], { components: ['prep-central-count (is-limit gold)'], purpose: 'prep-central-count at the 3/3 limit (gold tint).', zoom: 4 });
    await c('prep-central-count-plain', [pc.nth(1).locator('xpath=..')], { components: ['prep-central-count'], purpose: 'prep-central-count normal.', zoom: 4 });
    r.measure('chipMetrics_prepCount', await measureEls(page, { count: '.prep-central-count', limit: '.prep-central-count.is-limit' }));
  });
  await run('filter-count', async () => {
    // .filter-count lives in the phone-width filter toggle; real UI, narrow viewport.
    await page.setViewportSize({ width: 600, height: 900 });
    await go(s, '#/', { reload: true });
    await page.waitForSelector('.filter-toggle');
    await page.locator('.filter-toggle').click();
    await page.waitForTimeout(200);
    await page.locator('.toolbar .rank-pills .rank-icon').nth(1).click();
    await page.waitForSelector('.filter-count', { timeout: 4000 });
    const old = s.vp;
    s.vp = { width: 600, height: 900 };
    await crop(s, { page: 'chips', state: 'filter-count-at-600px', locators: [page.locator('.filter-toggle')], pad: 10, zoom: 4, components: ['filter-count (pill, 10px bold)'], actions: ['resize to 600x900 (the only viewport where the filter toggle exists)', 'open filters', 'click tier 2'], notes: 'Captured at 600x900, outside the three primary viewports, because .filter-count is only rendered by the phone-width filter toggle.', purpose: 'filter-count pill.', refs: ['Top Issue 2', 'Needs Visual Review 4'] });
    r.measure('chipMetrics_filterCount', await measureEls(page, { count: '.filter-count' }));
    s.vp = old;
    await page.setViewportSize(old);
  });
  await run('badge pending (RU)', async () => {
    const ctxRu = await s.context.browser().newContext({ viewport: s.vp, deviceScaleFactor: 1, locale: 'ru-RU', timezoneId: 'UTC' });
    const { DETERMINISM_INIT } = await import('./lib.mjs');
    await ctxRu.addInitScript(DETERMINISM_INIT);
    await ctxRu.addInitScript(`try{ if(!sessionStorage.getItem('x')){ localStorage.setItem('dhcodex_lang','"ru"'); localStorage.setItem('dhcodex_storage_notice_dismissed','1'); sessionStorage.setItem('x','1'); } }catch(e){}`);
    const p2 = await ctxRu.newPage();
    await p2.goto(s.baseUrl + '/index.html#/');
    await p2.waitForSelector('.card');
    await p2.waitForTimeout(800);
    const n = await p2.locator('.card .badge, .modal .badge').count();
    const total = await p2.evaluate(async () => (await (await fetch('data/environments.json')).json()).environments.length);
    const untranslated = await p2.evaluate(async () => { const d = (await (await fetch('data/environments.json')).json()).environments; return d.filter(e => !e.name || !e.name.ru).length; });
    r.measure('badgePending', { visibleOnFirstRuPage: n, environmentsWithoutRuName: untranslated, total });
    if (!n) r.undone.push({ item: '.badge / .badge.pending', reason: `Only rendered for untranslated environments (isTranslated() false); ${untranslated} of ${total} environments lack a RU name in the current data, and none appeared on the first RU catalog page. Not reproducible without altering data.` });
    else {
      const b = p2.locator('.card:has(.badge) ').first();
      const old = s.page; s.page = p2;
      await crop(s, { page: 'chips', state: 'card-badge-pending-ru', locators: [b.locator('.card-meta')], pad: 10, zoom: 3, components: ['badge.pending'], actions: ['switch language to RU', 'find an untranslated card'], purpose: '.badge (dashed border, mono 10px caps).', refs: ['Top Issue 2'] });
      s.page = old;
    }
    await ctxRu.close();
  });
  s.chipCrops = doneCrops;
}
