// Per-viewport matrices for Catalog, Lists and Journey (spec §12–14, §36).
import { full, crop, go, hover, focusVisible, attempt, measureEls, settle, parkMouse } from './harness.mjs';

const CARD = '.grid .card:not(.card-random) >> nth=1';

export async function catalog(s) {
  const { page } = s, r = s.rec;
  await go(s, '#/', { reload: true });
  await attempt(r, `${s.vp.width} catalog default`, async () => {
    await full(s, { page: 'catalog', state: 'default', components: ['header', 'toolbar', 'environment cards', 'rank-icon'], purpose: 'Baseline Catalog density and header/shell width.', refs: ['Responsive Findings', 'Needs Visual Review 15'] });
  });

  await attempt(r, `${s.vp.width} catalog search`, async () => {
    await page.fill('.search-input-wrap input', 'forest');
    await page.waitForTimeout(300);
    await full(s, { page: 'catalog', state: 'search-populated', actions: ['type "forest" into the catalog search field'], components: ['search field', 'search-clear-btn'], purpose: 'Search populated; clear (×) button visible.', refs: ['Top Issue 1'] });
    await crop(s, { page: 'catalog', state: 'search-field-with-clear', locators: [page.locator('.search-input-wrap')], pad: 12, actions: ['type "forest"'], components: ['search-clear-btn', 'search field'], purpose: 'Catalog search (40px) with its 24px round clear button.', refs: ['Top Issue 1', 'Top Issue 3'] });
  });

  await attempt(r, `${s.vp.width} catalog filters`, async () => {
    await page.fill('.search-input-wrap input', '');
    await page.locator('.toolbar .rank-pills .rank-icon').nth(1).click();
    await page.locator('.toolbar .ms-trigger').first().click();
    await page.waitForTimeout(150);
    await page.locator('.ms-panel .ms-row').nth(1).click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await full(s, { page: 'catalog', state: 'filters-active', actions: ['search emptied', 'click tier-2 hexagon filter', 'open Type multiselect and tick its 2nd option', 'Escape'], components: ['rank-icon filter (active)', 'ms-trigger', 'filtered card grid'], purpose: 'Active filters state of the Catalog toolbar.', refs: ['Needs Visual Review 15'] });
    await crop(s, { page: 'catalog', state: 'toolbar-filters-active', locators: [page.locator('.toolbar')], pad: 8, actions: ['(same as filters-active)'], components: ['rank-icon', 'ms-trigger'], purpose: 'Hex tier filter buttons (26px) beside 40px selects.', refs: ['Needs Visual Review 15'] });
    // reset
    await page.locator('.toolbar .rank-pills .rank-icon').nth(1).click();
    await page.locator('.toolbar .ms-trigger').first().click();
    await page.locator('.ms-panel .ms-row').nth(1).click();
    await page.keyboard.press('Escape');
  });

  await attempt(r, `${s.vp.width} catalog cards`, async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    const card = page.locator(CARD);
    await crop(s, { page: 'catalog', state: 'environment-card-rest', locators: [card], pad: 14, components: ['card', 'card-add-btn', 'env-prep-btn', 'rank-icon-sm', 'environment-type-chip', 'biome-chip'], purpose: 'Catalog card at rest with normal actions.', refs: ['Top Issue 1', 'Needs Visual Review 17'] });
    await hover(s, card);
    await crop(s, { page: 'catalog', state: 'environment-card-hover', locators: [card], pad: 14, keepMouse: true, actions: ['hover the card body'], components: ['card'], purpose: 'Card hover (translateY(-2px) + e-2).', refs: ['Needs Visual Review 17'] });
    const add = card.locator('.card-add-btn');
    await hover(s, add);
    await crop(s, { page: 'catalog', state: 'environment-card-action-hover', locators: [card.locator('.env-actions')], pad: 16, keepMouse: true, actions: ['hover .card-add-btn'], components: ['card-add-btn (hover, gold .10)', 'env-prep-btn'], purpose: 'Card action hover recipe (border + gold .10).', refs: ['Top Issue 1', 'Top Issue 5', 'Needs Visual Review 13'] });
    await hover(s, card.locator('.env-prep-btn'));
    await crop(s, { page: 'catalog', state: 'env-prep-btn-hover', locators: [card.locator('.env-actions')], pad: 16, keepMouse: true, actions: ['hover .env-prep-btn'], components: ['env-prep-btn', 'card-add-btn'], purpose: 'Second action button of the 28px ghost family.', refs: ['Top Issue 1'] });
    // card with action hover captured in context too
    await hover(s, add);
    await full(s, { page: 'catalog', state: 'card-action-hover-context', keepMouse: true, actions: ['hover .card-add-btn'], components: ['card hover + tooltip'], purpose: 'Action hover in full context incl. tooltip (data-tip).', refs: ['Needs Visual Review 17'] });
    // Random card (second recipe)
    await crop(s, { page: 'catalog', state: 'random-card', locators: [page.locator('.card-random')], pad: 14, components: ['card-random'], purpose: 'Random-environment card (own border tint + 2.75rem mark).', refs: ['Page-by-Page: Catalog'] });
  });
}

export async function lists(s) {
  const { page } = s, r = s.rec;
  await go(s, '#/lists');
  await attempt(r, `${s.vp.width} lists default`, async () => {
    await full(s, { page: 'lists', state: 'default-populated', components: ['page-title', 'new-list-row', 'list-card', 'list-card-del'], purpose: 'Lists overview with three populated list cards.', refs: ['Page-by-Page: Lists'] });
  });
  const lc = page.locator('.list-card').first();
  await attempt(r, `${s.vp.width} lists cards`, async () => {
    await crop(s, { page: 'lists', state: 'list-card-rest', locators: [lc], pad: 14, components: ['list-card', 'list-card-del', 'list-card-open'], purpose: 'List card at rest (compare .card).', refs: ['Needs Visual Review 17'] });
    await hover(s, lc);
    await crop(s, { page: 'lists', state: 'list-card-hover', locators: [lc], pad: 14, keepMouse: true, actions: ['hover list card'], components: ['list-card (hover)'], purpose: 'List card hover — no translateY, compare to Catalog card.', refs: ['Needs Visual Review 17'] });
    await hover(s, lc.locator('.list-card-del'));
    await crop(s, { page: 'lists', state: 'list-card-delete-hover', locators: [lc], pad: 14, keepMouse: true, actions: ['hover .list-card-del'], components: ['list-card-del (hover, fear tint)'], purpose: 'Delete action hover on a list card.', refs: ['Top Issue 1'] });
  });
  await attempt(r, `${s.vp.width} lists focus`, async () => {
    const ok = await focusVisible(s, lc.locator('.list-card-open'));
    await crop(s, { page: 'lists', state: 'list-card-open-focus-visible', locators: [lc], pad: 14, keepMouse: true, actions: ['Shift+Tab then focus .list-card-open via keyboard modality'], verified: { ':focus-visible': ok }, components: ['list-card-open (focus-visible)', 'list-card border swap'], purpose: 'Verify list-card focus shows a ring, not only a border swap.', refs: ['Top Issue 7', 'Needs Visual Review 10'] });
    if (s.vp.width === 1440) {
      r.measure('listCardOpenFocus', await measureEls(page, { listCardOpen: '.list-card .list-card-open', listCard: '.list-card' }));
    }
  });
  await attempt(r, `${s.vp.width} lists atl overlay`, async () => {
    // "Add to list" overlay lives on Catalog; opened from a card action.
    await go(s, '#/');
    await page.locator('.grid .card:not(.card-random) .card-add-btn').nth(1).click();
    await page.waitForSelector('.atl-row');
    await full(s, { page: 'lists', state: 'add-to-list-overlay', route: '#/ (overlay)', actions: ['open Catalog', 'click .card-add-btn on the 2nd card'], components: ['modal-sm', 'atl-row', 'atl-row checkbox', 'modal-close', 'new-list-row'], purpose: 'Add-to-list overlay with unchecked list rows.', refs: ['Top Issue 10', 'Top Issue 20'] });
    const rows = page.locator('.atl-row');
    await crop(s, { page: 'lists', state: 'atl-rows-normal', locators: [rows.first(), rows.last()], pad: 12, components: ['atl-row'], purpose: 'Normal list rows in overlay.', refs: ['Top Issue 10'] });
    await hover(s, rows.nth(1));
    await crop(s, { page: 'lists', state: 'atl-row-hover', locators: [rows.first(), rows.last()], pad: 12, keepMouse: true, actions: ['hover 2nd .atl-row'], components: ['atl-row (hover)'], purpose: 'Hovered row (gold text).', refs: ['Top Issue 10'] });
    await page.keyboard.press('Escape');
  });
  const openExpanded = async envId => {
    await go(s, '#/env/' + envId);
    await page.waitForSelector('#detail-add-to-list-bottom');
    await page.locator('#detail-add-to-list-bottom').click();
    await page.waitForSelector('.atl-row');
    await page.waitForTimeout(200);
  };
  await attempt(r, `${s.vp.width} lists atl expanded checked`, async () => {
    await openExpanded('harsh-desert');
    const rows = page.locator('.atl-row');
    await full(s, { page: 'lists', state: 'add-to-list-overlay-checked', route: '#/env/harsh-desert (overlay on overlay)', actions: ['open environment detail Harsh Desert', 'click the detail footer "Add to…" button (#detail-add-to-list-bottom)'], components: ['atl-row (checked ×2, unchecked ×1)', 'Prep row (checked)', 'atl-row checkbox'], purpose: 'Add-to-list with ticked rows plus the Prep row.', refs: ['Top Issue 10', 'Top Issue 20'] });
    await crop(s, { page: 'lists', state: 'atl-rows-checked-and-unchecked', locators: [rows.first(), rows.last()], pad: 14, components: ['atl-row checkbox checked/unchecked'], purpose: 'Checked vs unchecked list checkboxes (recipe 1 of 3).', refs: ['Top Issue 10', 'Top Issue 20'] });
    const cb = rows.first().locator('input');
    const ok = await focusVisible(s, cb);
    await crop(s, { page: 'lists', state: 'atl-checkbox-focus-visible', locators: [rows.first(), rows.last()], pad: 14, keepMouse: true, verified: { ':focus-visible': ok }, actions: ['Shift+Tab, then focus first list checkbox'], components: ['atl-row checkbox (focus-visible)'], purpose: 'Focus ring on the list checkbox.', refs: ['Top Issue 7', 'Top Issue 10'] });
    s.atlChecked = true;
    await page.keyboard.press('Escape');
  });
  await attempt(r, `${s.vp.width} lists atl unavailable`, async () => {
    await openExpanded('abandoned-grove');
    const prepRow = page.locator('#atl-prep-row');
    await full(s, { page: 'lists', state: 'add-to-list-overlay-prep-unavailable', route: '#/env/abandoned-grove (overlay on overlay)', actions: ['open environment detail Abandoned Grove (Prep already holds 3/3 environments)', 'click #detail-add-to-list-bottom'], components: ['atl-row.is-unavailable', 'disabled checkbox', 'atl-prep-hint'], purpose: 'Unavailable (disabled) overlay row at its natural opacity.', refs: ['Top Issue 6', 'Needs Visual Review 12'] });
    await crop(s, { page: 'lists', state: 'atl-row-unavailable', locators: [prepRow, page.locator('#atl-prep-hint')], pad: 14, components: ['atl-row.is-unavailable (opacity .5 on checkbox)'], purpose: 'Disabled checkbox row (.5) vs normal rows above.', refs: ['Top Issue 6', 'Top Issue 20', 'Needs Visual Review 12'] });
    r.measure('atlUnavailable', await measureEls(page, { checkboxDisabled: '#atl-prep-row input', row: '#atl-prep-row' }));
    await page.keyboard.press('Escape');
  });
}

export async function journey(s) {
  const { page } = s, r = s.rec;
  await go(s, '#/journey');
  await attempt(r, `${s.vp.width} journey empty`, async () => {
    await full(s, { page: 'journey', state: 'empty', components: ['journey-intro', 'journey-roll', 'journey-empty', 'journey-count'], purpose: 'Journey empty state (both panels).', refs: ['Needs Visual Review 16'] });
  });
  await attempt(r, `${s.vp.width} journey populate`, async () => {
    // Roll + keep via the real UI. The seeded PRNG makes the outcome stable;
    // regions are kept until two exist and one is Shadowblighted (.jr-blight).
    const regionPanel = page.locator('.journey-panel[data-kind="region"]');
    const sanctPanel = page.locator('.journey-panel[data-kind="sanctuary"]');
    let kept = 0, blight = false;
    for (let i = 0; i < 60 && !(kept >= 2 && blight); i++) {
      await regionPanel.locator('[data-roll-new]').click();
      const isBlight = (await regionPanel.locator('.journey-draft .jr-blight').count()) > 0;
      if (kept < 2 || (isBlight && !blight)) {
        await regionPanel.locator('.journey-draft [data-save]').click(); kept++; blight = blight || isBlight;
      } else await regionPanel.locator('.journey-draft [data-discard]').click();
    }
    for (let i = 0; i < 2; i++) {
      await sanctPanel.locator('[data-roll-new]').click();
      await sanctPanel.locator('.journey-draft [data-save]').click();
    }
    r.measure('journeySeed', { regionsKept: kept, blightPresent: blight });
    await page.evaluate(() => window.scrollTo(0, 0));
    await full(s, { page: 'journey', state: 'populated', actions: ['roll region ×N (seeded PRNG) and keep each', 'roll sanctuary ×2 and keep'], components: ['journey-entry', 'jr-row', 'jr-icon-btn', 'jr-blight', 'journey-count'], purpose: 'Populated Journey.', refs: ['Page-by-Page: Journey'] });
  });
}

/** Journey entry rest/hover, row crops and jr-icon-btn states (spec §14, §36). Runs after journey(). */
export async function journeyDetails(s) {
  const { page } = s, r = s.rec;
  await go(s, '#/journey', { reload: true });
  // Re-create the same saved entries (fresh context, same seeded PRNG).
  const regionPanel = page.locator('.journey-panel[data-kind="region"]');
  const sanctPanel = page.locator('.journey-panel[data-kind="sanctuary"]');
  let kept = 0, blight = false;
  for (let i = 0; i < 60 && !(kept >= 2 && blight); i++) {
    await regionPanel.locator('[data-roll-new]').click();
    const isBlight = (await regionPanel.locator('.journey-draft .jr-blight').count()) > 0;
    if (kept < 2 || (isBlight && !blight)) { await regionPanel.locator('.journey-draft [data-save]').click(); kept++; blight = blight || isBlight; }
    else await regionPanel.locator('.journey-draft [data-discard]').click();
  }
  await sanctPanel.locator('[data-roll-new]').click();
  await sanctPanel.locator('.journey-draft [data-save]').click();
  const entry = regionPanel.locator('.journey-entry.is-saved').first();
  await attempt(r, `${s.vp.width} journey entry`, async () => {
    await entry.scrollIntoViewIfNeeded();
    await crop(s, { page: 'journey', state: 'entry-rest', locators: [entry], pad: 12, components: ['journey-entry', 'jr-row', 'jr-icon-btn', 'jr-name'], purpose: 'Journey entry at rest (same recipe as .card / .list-card).', refs: ['Needs Visual Review 17'] });
    await hover(s, entry);
    await crop(s, { page: 'journey', state: 'entry-hover', locators: [entry], pad: 12, keepMouse: true, actions: ['hover the journey entry'], components: ['journey-entry (hover)'], purpose: 'Journey entry hover (no translateY).', refs: ['Needs Visual Review 17'] });
  });
  await attempt(r, `${s.vp.width} journey rows`, async () => {
    const row = page.locator('.journey-entry.is-saved .jr-row:has(.jr-blight)').first();
    const target = (await row.count()) ? row : entry.locator('.jr-row').first();
    await target.scrollIntoViewIfNeeded();
    await crop(s, { page: 'journey', state: 'representative-row-jr-icon-btn-blight-metadata', locators: [target], pad: 10, components: ['jr-icon-btn', 'jr-blight (if rolled)', 'jr-k / jr-die / jr-roll inline metadata'], purpose: 'Row close-up: jr-icon-btn, jr-blight and inline metadata together.', refs: ['Top Issue 1', 'Top Issue 2', 'Needs Visual Review 1'], notes: (await row.count()) ? '' : 'No Shadowblighted region was produced; first row shown instead.' });
    await crop(s, { page: 'journey', state: 'rows-habitat-size-encounter', locators: [entry.locator('.jr-row').nth(0), entry.locator('.jr-row').nth(2)], pad: 10, components: ['jr-row ×3'], purpose: 'Three representative rows.', refs: ['Table / List Density'] });
    await crop(s, { page: 'journey', state: 'journey-count-header', locators: [page.locator('.journey-saved-title').first()], pad: 10, zoom: 3, components: ['journey-count', 'journey-saved-title'], purpose: 'journey-count pill beside the caps section label.', refs: ['Top Issue 2'] });
  });
  await attempt(r, `${s.vp.width} jr-icon-btn states`, async () => {
    const btn = entry.locator('.jr-icon-btn.jr-reroll').first();
    await btn.scrollIntoViewIfNeeded();
    const tight = st => ({ page: 'journey', state: `jr-icon-btn-${st}`, locators: [btn], pad: 14, zoom: 4, components: ['jr-icon-btn'], refs: ['Top Issue 1', 'Needs Visual Review 1'] });
    await crop(s, { ...tight('default'), purpose: 'jr-icon-btn at rest (visible --line border, 28px).' });
    await hover(s, btn);
    await crop(s, { ...tight('hover'), keepMouse: true, actions: ['hover'], purpose: 'jr-icon-btn hover (hope border + gold .10).' });
    const ok = await focusVisible(s, btn);
    await crop(s, { ...tight('focus-visible'), keepMouse: true, actions: ['Shift+Tab then focus()'], verified: { ':focus-visible': ok }, purpose: 'jr-icon-btn focus-visible.' });
    await btn.evaluate(el => el.blur());
    if (s.vp.width === 1440) r.measure('jrIconBtn', await measureEls(page, { jr: '.jr-icon-btn', cardAdd: '.card-add-btn' }));
  });
  await attempt(r, `${s.vp.width} sanctuary entry`, async () => {
    const sanct = sanctPanel.locator('.journey-entry.is-saved').first();
    await sanct.scrollIntoViewIfNeeded();
    await crop(s, { page: 'journey', state: 'sanctuary-entry-rest', locators: [sanct], pad: 12, components: ['journey-entry (sanctuary)'], purpose: 'Sanctuary entry.', refs: ['Page-by-Page: Journey'] });
  });
}
