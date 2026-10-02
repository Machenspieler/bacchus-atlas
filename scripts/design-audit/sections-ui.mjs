// Prep control heights, picker special rows, empty states, and floating surfaces
// (spec §19, §22, §23, §28, §31).
import { full, crop, go, hover, focusVisible, attempt, measureEls, settle, parkMouse, unionBox } from './harness.mjs';

export async function controls(s) {
  const { page } = s, r = s.rec, w = s.vp.width;
  await go(s, '#/prep', { reload: true });
  await page.waitForSelector('.prep-wrap');
  await settle(page, { long: true });
  const envTb = page.locator('.prep-env-toolbar'), advTb = page.locator('.prep-adv-toolbar');
  const bpFirst = page.locator('.bp-stepper:visible').first(), fcg = page.locator('.prep-freshcutgrass-link');
  await attempt(r, `${w} control-heights-row`, async () => {
    await crop(s, { page: 'prep', state: 'control-heights-row', locators: [envTb, advTb, bpFirst, fcg], pad: 8, zoom: w >= 1920 ? 1 : 1, components: ['prep-search (35)', 'ms-trigger (35)', 'bp-stepper (30)', 'bp-summary (30)', 'prep-recommend-btn (30)', 'prep-freshcutgrass-link (30)'], purpose: 'Every 35px and 30px control in one wide crop, in real context (toolbars + central BP strip).', refs: ['Top Issue 3', 'Needs Visual Review 5'] });
  });
  await attempt(r, `${w} bp-strip`, async () => {
    await crop(s, { page: 'prep', state: 'bp-strip', locators: [bpFirst, fcg], pad: 10, zoom: 3, components: ['bp-stepper', 'bp-summary', 'prep-recommend-btn', 'prep-freshcutgrass-link'], purpose: 'The four adjacent 30px controls in the Adversaries header.', refs: ['Top Issue 3', 'Top Issue 16', 'Needs Visual Review 5'] });
  });
  await attempt(r, `${w} adv toolbar`, async () => {
    await crop(s, { page: 'prep', state: 'adv-toolbar', locators: [advTb], pad: 10, zoom: 2, components: ['prep-search (35)', 'rank-icon', 'ms-trigger (35)'], purpose: 'Adversary toolbar: 35px search and Type select next to the 26px hexagons.', refs: ['Top Issue 3', 'Needs Visual Review 5', 'Needs Visual Review 15'] });
    await crop(s, { page: 'prep', state: 'env-toolbar', locators: [envTb], pad: 10, zoom: 2, components: ['prep-search (35)', 'rank-icon'], purpose: 'Environment toolbar.', refs: ['Top Issue 3', 'Needs Visual Review 15'] });
  });
  await attempt(r, `${w} item toolbar`, async () => {
    const tb = page.locator('.item-toolbar');
    await tb.scrollIntoViewIfNeeded();
    await crop(s, { page: 'prep', state: 'item-toolbar', locators: [tb], pad: 10, zoom: 1, components: ['item-clear-btn (35)', 'prep-search (35)', '.btn (40)', 'dice-roll-btn', 'item-view-btn', 'prep-item-nav-btn (40, pill)'], purpose: 'Item toolbar with its 35px clear button, 40px buttons and pill nav buttons.', refs: ['Top Issue 3', 'Top Issue 1', 'Needs Visual Review 5'] });
    await crop(s, { page: 'prep', state: 'item-toolbar-clear-and-search', locators: [page.locator('.item-toolbar-search')], pad: 10, zoom: 3, components: ['prep-search (35)', 'item-clear-btn (35)'], purpose: 'Item search with its clear button close-up.', refs: ['Top Issue 3'] });
    await crop(s, { page: 'prep', state: 'item-strip-nav', locators: [page.locator('.prep-item-strip-wrap:visible').first()], pad: 6, zoom: 1, components: ['prep-item-nav-btn (disabled left / enabled right)', 'prep-item-card'], purpose: 'Item strip with nav buttons (left is naturally disabled at scroll start).', refs: ['Top Issue 1', 'Top Issue 6', 'Needs Visual Review 12'] });
  });
  await attempt(r, `${w} bar actions`, async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await crop(s, { page: 'prep', state: 'bar-actions', locators: [page.locator('.prep-new-btn'), page.locator('.prep-more-btn')], pad: 14, zoom: 4, components: ['prep New .btn-ghost', 'prep-icon-btn (32)'], purpose: 'Prep bar actions: .btn (40) beside the 32px prep-icon-btn.', refs: ['Top Issue 1', 'Top Issue 3'] });
  });
}

export async function recommended(s) {
  const { page } = s, r = s.rec, w = s.vp.width;
  await go(s, '#/prep', { reload: true });
  await page.waitForSelector('.prep-adv-row');
  await settle(page, { long: true });
  await attempt(r, `${w} recommended rows`, async () => {
    const rec = page.locator('.prep-adv-row.is-recommended');
    const checked = page.locator('.prep-adv-row.is-recommended:has(input:checked)').first();
    await crop(s, { page: 'prep', state: 'adv-row-recommended', locators: [rec.first()], pad: 8, zoom: 3, components: ['prep-adv-row.is-recommended', 'prep-select-checkbox'], purpose: 'Recommended picker row (gold-6% wash + star).', refs: ['Special States: recommended'] });
    await hover(s, rec.nth(1));
    await crop(s, { page: 'prep', state: 'adv-row-recommended-hover', locators: [rec.nth(1)], pad: 8, zoom: 3, keepMouse: true, actions: ['hover a recommended row'], components: ['prep-adv-row.is-recommended:hover'], purpose: 'Recommended row hovered.', refs: ['Special States: recommended'] });
    await crop(s, { page: 'prep', state: 'adv-row-recommended-selected', locators: [checked], pad: 8, zoom: 3, components: ['prep-adv-row (selected)', 'prep-select-checkbox (checked)'], purpose: 'Recommended row that is selected (Apprentice Assassin is in the saved Prep).', refs: ['Special States: recommended'] });
    // Non-recommended row: scroll the picker list down to the "all adversaries" part.
    const plain = page.locator('.prep-adv-row:not(.is-recommended)').first();
    await plain.scrollIntoViewIfNeeded();
    await settle(page);
    await crop(s, { page: 'prep', state: 'adv-row-normal', locators: [plain], pad: 8, zoom: 3, actions: ['scroll adversary picker past the recommended group'], components: ['prep-adv-row (normal)'], purpose: 'Normal (not recommended) picker row for comparison.', refs: ['Special States: recommended'] });
    await crop(s, { page: 'prep', state: 'adv-picker-with-normal-and-selected', locators: [page.locator('.prep-col-adv')], pad: 6, zoom: 1, actions: ['scroll adversary picker past the recommended group'], components: ['prep-col-adv'], purpose: 'Picker column after scrolling: normal rows below the recommended group.', refs: ['Special States: recommended'] });
    r.measure(`pickerRows_${w}`, await page.evaluate(() => {
      const m = el => { if (!el) return null; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return { h: +r.height.toFixed(1), bg: cs.backgroundColor, fs: cs.fontSize, pad: cs.padding }; };
      return { recommended: m(document.querySelector('.prep-adv-row.is-recommended')), normal: m(document.querySelector('.prep-adv-row:not(.is-recommended)')), env: m(document.querySelector('.prep-col-env .prep-row')) };
    }));
  });
}

export async function pickerEmpties(s) {
  const { page } = s, r = s.rec, w = s.vp.width;
  await go(s, '#/prep', { reload: true });
  await page.waitForSelector('.prep-wrap');
  await settle(page, { long: true });
  const run = async (name, input, col) => {
    await attempt(r, `${w} empty ${name}`, async () => {
      await page.locator(input).fill('zzzzzzzz');
      await page.waitForTimeout(300);
      await crop(s, { page: 'prep', state: `empty-${name}-picker-no-results`, locators: [page.locator(col)], pad: 6, zoom: 1, actions: [`type "zzzzzzzz" into ${input}`], components: ['prep-empty'], purpose: `No-results empty state of the ${name} picker.`, refs: ['Needs Visual Review 16', 'Empty States'] });
      await page.locator(input).fill('');
    });
  };
  await run('environments', '#prep-env-search', '.prep-col-env');
  await run('adversaries', '#prep-adv-search', '.prep-col-adv');
  await run('items', '.item-toolbar-search input', '.prep-items-panel');
}

export async function emptyOtherPages(s) {
  const { page } = s, r = s.rec, w = s.vp.width;
  await attempt(r, `${w} catalog no results`, async () => {
    await go(s, '#/', { reload: true });
    await page.fill('.search-input-wrap input', 'zzzzzzzzqq');
    await page.waitForTimeout(400);
    await full(s, { page: 'catalog', state: 'empty-result', actions: ['type "zzzzzzzzqq" in the catalog search'], components: ['empty-state'], purpose: 'Catalog no-results empty state.', refs: ['Needs Visual Review 16'] });
    await crop(s, { page: 'catalog', state: 'empty-state', locators: [page.locator('.empty-state')], pad: 14, zoom: 2, components: ['empty-state'], purpose: '.empty-state close-up.', refs: ['Needs Visual Review 16'] });
  });
}

export async function surfaces(s) {
  const { page } = s, r = s.rec, w = s.vp.width;
  const surfaceMeasure = {};
  // --- ms-panel: Prep adversary Type multiselect ---
  await attempt(r, `${w} ms-panel prep`, async () => {
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector('.prep-adv-toolbar .ms-trigger');
    await settle(page, { long: true });
    await page.locator('.prep-adv-toolbar .ms-trigger').first().click();
    await page.waitForSelector('.ms-panel', { state: 'visible' });
    await settle(page);
    await full(s, { page: 'prep', state: 'ms-panel-open', actions: ['click the adversary "Type" multiselect trigger'], components: ['ms-panel', 'ms-row', 'ms-checkbox'], purpose: 'ms-panel in context (same page as prep-menu).', refs: ['Top Issue 4', 'Needs Visual Review 9'] });
    const panel = page.locator('.ms-panel:visible').first();
    await crop(s, { page: 'prep', state: 'ms-panel-open', locators: [page.locator('.prep-adv-toolbar .ms-trigger').first(), panel], pad: 12, zoom: 2, components: ['ms-trigger[aria-expanded]', 'ms-panel'], purpose: 'ms-panel surface close-up (radius, border, shadow, row styling).', refs: ['Top Issue 4', 'Needs Visual Review 9'] });
    surfaceMeasure.msPanel = (await measureEls(page, { s: '.ms-panel:not([hidden])', row: '.ms-panel:not([hidden]) .ms-row' }));
    const rows = panel.locator('.ms-row');
    await hover(s, rows.nth(1));
    await crop(s, { page: 'prep', state: 'ms-row-hover', locators: [panel], pad: 10, zoom: 2, keepMouse: true, actions: ['hover 2nd ms-row'], components: ['ms-row:hover (white .06)'], purpose: 'Row hover in ms-panel (only white-alpha hover in the app).', refs: ['Top Issue 5', 'Interaction State Findings: Hover'] });
    await rows.nth(0).click();
    await page.waitForTimeout(150);
    await parkMouse(s);
    await crop(s, { page: 'prep', state: 'ms-row-checked', locators: [panel], pad: 10, zoom: 2, actions: ['tick the 1st option'], components: ['ms-row (checked, gold .16)', 'ms-checkbox (checked)'], purpose: 'Selected ms-row (gold .16) and checkbox recipe 3 of 3.', refs: ['Top Issue 5', 'Top Issue 10', 'Needs Visual Review 13'] });
    s.msChecked = true;
    await page.keyboard.press('Escape');
    await rows.nth(0).click({ trial: true }).catch(() => {});
  });
  // --- ms-panel on the Catalog, for the shared-component view ---
  await attempt(r, `${w} ms-panel catalog`, async () => {
    await go(s, '#/', { reload: true });
    await page.locator('.toolbar .ms-trigger').first().click();
    await page.waitForSelector('.ms-panel', { state: 'visible' });
    await full(s, { page: 'catalog', state: 'ms-panel-open', actions: ['click the Catalog "Type" multiselect'], components: ['ms-panel', 'ms-trigger[aria-expanded]'], purpose: 'ms-panel on the Catalog (same component, different page).', refs: ['Top Issue 4'] });
    await page.keyboard.press('Escape');
  });
  // --- bp-popover ---
  await attempt(r, `${w} bp-popover`, async () => {
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector('.bp-summary');
    await settle(page, { long: true });
    await page.locator('.bp-summary').click();
    await page.waitForSelector('.bp-popover', { state: 'visible' });
    await settle(page);
    await full(s, { page: 'prep', state: 'bp-popover-open', actions: ['click .bp-summary'], components: ['bp-popover', 'bp-step', 'bp-seg', 'bp-pop-close', 'bp-check'], purpose: 'bp-popover in context.', refs: ['Top Issue 4', 'Top Issue 1'] });
    const pop = page.locator('.bp-popover:visible');
    await crop(s, { page: 'prep', state: 'bp-popover-open', locators: [pop], pad: 12, zoom: 1, components: ['bp-popover'], purpose: 'bp-popover surface close-up.', refs: ['Top Issue 4'] });
    surfaceMeasure.bpPopover = await measureEls(page, { s: '.bp-popover:not([hidden])' });
    await crop(s, { page: 'prep', state: 'bp-popover-head-controls', locators: [page.locator('.bp-pop-head'), page.locator('.bp-pop-row--pc, .bp-pop-row').first()], pad: 10, zoom: 3, components: ['bp-pop-close (32)', 'bp-stepper / bp-step (24)'], purpose: 'Popover close (×, 32px) and stepper (24px) icon-only controls.', refs: ['Top Issue 1'] });
    await crop(s, { page: 'prep', state: 'bp-seg-checked', locators: [page.locator('.bp-segs')], pad: 10, zoom: 3, components: ['bp-seg:checked (gold .14)'], purpose: 'Segmented control with selected state (gold .14).', refs: ['Top Issue 5', 'Needs Visual Review 13'] });
    await page.keyboard.press('Escape');
  });
  // --- soundboard panel ---
  await attempt(r, `${w} sb-panel`, async () => {
    await go(s, '#/prep', { reload: true });
    await page.locator('.sb-trigger').click();
    await page.waitForSelector('.sb-panel', { state: 'visible' });
    await settle(page);
    await full(s, { page: 'prep', state: 'soundboard-panel-open', actions: ['click .sb-trigger'], components: ['sb-panel', 'sb-ctl', 'sb-trigger[aria-expanded]', 'sb-sound'], purpose: 'Soundboard panel in context.', refs: ['Top Issue 4', 'Top Issue 1'] });
    await crop(s, { page: 'prep', state: 'soundboard-panel-open', locators: [page.locator('.sb-panel:visible')], pad: 12, zoom: 2, components: ['sb-panel'], purpose: 'Soundboard panel surface close-up.', refs: ['Top Issue 4'] });
    surfaceMeasure.sbPanel = await measureEls(page, { s: '.sb-panel:not([hidden])' });
    await page.keyboard.press('Escape');
  });
  // --- countdown overlay ---
  await attempt(r, `${w} countdown overlay`, async () => {
    await go(s, '#/env/harsh-desert', { reload: true });
    await page.waitForSelector('.modal .countdown-btn');
    await page.locator('.modal .countdown-btn').first().click();
    await page.waitForSelector('.countdown-overlay', { state: 'visible' });
    await settle(page);
    await full(s, { page: 'detail', state: 'countdown-overlay-open', route: '#/env/harsh-desert', actions: ['open environment detail Harsh Desert', 'click the first .countdown-btn'], components: ['countdown-overlay', 'countdown-overlay-btn', 'countdown-overlay-close'], purpose: 'Countdown overlay in context.', refs: ['Top Issue 4'] });
    const ov = page.locator('.countdown-overlay:visible');
    await crop(s, { page: 'detail', state: 'countdown-overlay-open', locators: [ov], pad: 12, zoom: 2, components: ['countdown-overlay (teal border)'], purpose: 'Countdown overlay close-up.', refs: ['Top Issue 4'] });
    surfaceMeasure.countdownOverlay = await measureEls(page, { s: '.countdown-overlay', btn: '.countdown-overlay-btn', close: '.countdown-overlay-close' });
    const btns = ov.locator('.countdown-overlay-btn');
    await hover(s, btns.first());
    await crop(s, { page: 'detail', state: 'countdown-overlay-btn-hover', locators: [ov], pad: 12, zoom: 2, keepMouse: true, actions: ['hover .countdown-overlay-btn'], components: ['countdown-overlay-btn:hover (gold .16)'], purpose: 'Gold .16 hover tint.', refs: ['Top Issue 5', 'Needs Visual Review 13'] });
    await page.keyboard.press('Escape');
  });
  // --- tooltip ---
  await attempt(r, `${w} tooltip`, async () => {
    await go(s, '#/', { reload: true });
    const btn = page.locator('.grid .card:not(.card-random) .card-add-btn').nth(1);
    await hover(s, btn);
    await page.waitForSelector('.tooltip', { state: 'visible', timeout: 4000 });
    await crop(s, { page: 'catalog', state: 'tooltip-over-card-action', locators: [btn, page.locator('.tooltip')], pad: 16, zoom: 3, keepMouse: true, actions: ['hover a card .card-add-btn until the tooltip appears'], components: ['tooltip (r-sm, e-3)'], purpose: 'Tooltip surface and position.', refs: ['Top Issue 4'] });
    surfaceMeasure.tooltip = await measureEls(page, { s: '.tooltip' });
  });
  r.measure(`surfaces_${w}`, surfaceMeasure);
}
