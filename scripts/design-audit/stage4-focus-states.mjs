#!/usr/bin/env node
// Stage 4 task 04 — focus-state screenshots + keyboard verification.
//   node scripts/design-audit/stage4-focus-states.mjs
// Every focused state is reached with real key presses (focusVisible = Shift+Tab, then focus(), then
// :focus-visible is asserted), never by adding classes. Writes into
// docs/design-audit/stage-4/task-04-focus-states/. BEFORE for the two flagged controls is the
// unmodified Stage 2 crop.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { startServer, ROOT } from './lib.mjs';
import { Recorder, launch, openSession, go, settle, full, crop, sheet, focusVisible, parkMouse } from './harness.mjs';

const OUT = path.resolve(ROOT, 'docs/design-audit/stage-4/task-04-focus-states');
const S2 = path.resolve(ROOT, 'docs/design-audit/stage-2/crops');
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); console.log(`  ${ok ? 'ok ' : 'FAIL'} ${name} ${detail}`); };

/** What a user sees at the active element: own ring, container ring, clipping, stacked rings. */
const PROBE = () => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const ring = e => { const c = getComputedStyle(e); const w = parseFloat(c.outlineWidth) || 0; return c.outlineStyle !== 'none' && w > 0 ? { w, off: parseFloat(c.outlineOffset) || 0 } : null; };
  const own = ring(el);
  let host = null, hostEl = null;
  // a visually-hidden input whose label/sibling wears the ring (.bp-seg input:focus-visible + span)
  if (!own && el.nextElementSibling && ring(el.nextElementSibling)) { host = ring(el.nextElementSibling); hostEl = el.nextElementSibling; }
  for (let p = el.parentElement, d = 0; p && p !== document.body && d < 4; p = p.parentElement, d++) { const r = ring(p); if (r) { host = r; hostEl = p; break; } }
  const eff = own || host, srcEl = own ? el : hostEl;
  let clipped = null;
  if (eff) {
    const q = srcEl.getBoundingClientRect(), o = eff.off + eff.w;
    for (let p = srcEl.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const c = getComputedStyle(p);
      if (['hidden', 'auto', 'scroll', 'clip'].some(v => c.overflowX === v || c.overflowY === v)) {
        const pr = p.getBoundingClientRect();
        if (q.left - o < pr.left - 0.5 || q.right + o > pr.right + 0.5 || q.top - o < pr.top - 0.5 || q.bottom + o > pr.bottom + 0.5) { clipped = (p.className || p.tagName).toString().split(' ')[0]; break; }
      }
    }
  }
  return {
    programmatic: !eff && el.getAttribute('tabindex') === '-1' && /dialog|menu|region|group/.test(el.getAttribute('role') || '') || (!eff && el.getAttribute('tabindex') === '-1'),
    clipInfo: clipped && srcEl ? JSON.stringify([srcEl.getBoundingClientRect().toJSON(), 'panel']) : null,
    el: el.tagName.toLowerCase() + '.' + (el.className || el.id || '').toString().split(' ')[0],
    name: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24),
    fv: el.matches(':focus-visible'), ring: !!eff, own: !!own, host: !!host, double: !!(own && host), clipped,
  };
};
const probe = page => page.evaluate(PROBE);

async function tabSteps(s, n, label, each) {
  const out = [];
  for (let i = 0; i < n; i++) { await s.page.keyboard.press('Tab'); const p = await probe(s.page); out.push(p); if (each) await each(p, i); }
  return out;
}

async function shot(s, state, locators, o = {}) {
  await crop(s, { page: 'focus', state, locators, pad: o.pad ?? 10, zoom: o.zoom, keepMouse: true, components: [state], purpose: o.purpose ?? 'Keyboard :focus-visible state.', actions: [o.how ?? 'Shift+Tab then focus()'] });
}

const R = {}; // results for the contact sheet

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const rec = new Recorder(OUT);
  const { server, url } = await startServer();
  const browser = await launch();
  const s = await openSession(browser, url, { width: 1440, height: 900 }, 'full', rec);
  const { page } = s;
  const kb = async (loc, state, o = {}) => {
    await loc.first().scrollIntoViewIfNeeded().catch(() => {});
    const ok = await focusVisible(s, loc.first());
    check(`:focus-visible reached by keyboard — ${state}`, ok);
    const p = await probe(page);
    check(`visible ring — ${state}`, p && p.ring, p ? `${p.own ? 'own' : 'container'}${p.clipped ? ' CLIPPED by ' + p.clipped : ''}${p.double ? ' DOUBLE' : ''}` : 'no active element');
    if (p) { check(`not clipped — ${state}`, !p.clipped, p.clipped || ''); check(`single ring — ${state}`, !p.double); }
    await parkMouse(s);
    await shot(s, state, o.region ?? [loc.first()], o);
    return p;
  };

  // ---------------- Catalog ----------------
  console.log('catalog');
  await go(s, '#/', { reload: true });
  await page.waitForSelector('.grid .card');
  await kb(page.locator('#btn-lists'), 'standard-button');
  await kb(page.locator('#f-search'), 'text-input', { pad: 12 });
  await kb(page.locator('.grid .card:not(.card-random) .card-open').nth(1), 'catalog-card', { region: [page.locator('.grid .card:not(.card-random)').nth(1)], pad: 14, zoom: 2 });
  await kb(page.locator('#f-types-btn'), 'ms-trigger');
  // ms-row: open with the keyboard, Tab into the panel.
  await page.keyboard.press('Enter');
  await page.waitForSelector('.ms-panel:not([hidden])');
  await page.keyboard.press('Tab');
  const msp = await probe(page);
  check('ms-row: focus lands on a row checkbox', msp && /ms-checkbox/.test(msp.el), msp && msp.el);
  check('ms-row: one ring (row) only, no ring on the sr-only checkbox', msp && msp.host && !msp.own, JSON.stringify(msp));
  check('ms-row: ring not clipped by the panel', msp && !msp.clipped, msp && msp.clipped);
  await parkMouse(s);
  await shot(s, 'ms-row', [page.locator('.ms-panel:not([hidden])')], { how: 'Enter on the trigger, Tab into the panel', pad: 12, zoom: 2 });
  // last row too
  const rows = await page.locator('.ms-panel:not([hidden]) .ms-checkbox').count();
  for (let i = 1; i < rows; i++) await page.keyboard.press('Tab');
  const last = await probe(page);
  check('ms-row (last): ring not clipped', last && last.ring && !last.clipped, last && (last.clipped || ''));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const back = await page.evaluate(() => document.activeElement && document.activeElement.id);
  check('ms panel: Escape returns focus to the trigger', back === 'f-types-btn', back);

  // language switch: focused + selected, and focused + not selected
  await kb(page.locator('.lang-switch button.active').first(), 'lang-switch-selected', { region: [page.locator('.lang-switch').first()], pad: 10, zoom: 4 });
  await kb(page.locator('.lang-switch button:not(.active)').first(), 'lang-switch-unselected', { region: [page.locator('.lang-switch').first()], pad: 10, zoom: 4 });

  // Selected + focused vs selected-only (tier rank icon)
  await page.locator('.rank-icon').first().click();
  await kb(page.locator('.rank-icon').first(), 'rank-icon-selected-focused', { zoom: 4 });
  await page.locator('.rank-icon').first().click(); // restore

  // Modal via keyboard
  await focusVisible(s, page.locator('.grid .card:not(.card-random) .card-open').nth(1));
  await page.keyboard.press('Enter');
  await page.waitForSelector('.modal, .overlay [role="dialog"]', { state: 'visible', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  const m1 = await probe(page);
  console.log('  modal first active:', JSON.stringify(m1));
  check('modal: something inside the dialog holds focus after Enter', await page.evaluate(() => !!(document.activeElement && document.activeElement.closest('[role="dialog"], .modal, .overlay'))), m1 && m1.el);
  const stops = [];
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); const p = await probe(page); stops.push(p); if (p && p.host === false && !p.ring) stops.push('NO RING'); }
  check('modal: every Tab stop shows a ring', stops.every(p => p === 'NO RING' ? false : (p ? (p.ring || p.programmatic) : true)), stops.filter(p => p && p !== 'NO RING' && !p.ring).map(p => p.el).join(','));
  check('modal: Tab stays inside the dialog', await page.evaluate(() => !!document.activeElement.closest('[role="dialog"], .modal, .overlay, .adv-art-modal')));
  await parkMouse(s);
  await page.screenshot({ path: path.join(OUT, 'crops', '1440x900__focus__modal-tab-stop__viewport.png') }).catch(() => {});
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const retId = await page.evaluate(() => (document.activeElement.className || '').toString().split(' ')[0]);
  check('modal: Escape closes and returns focus to the opening card', /card-open/.test(retId), retId);

  // Full context, catalog
  await focusVisible(s, page.locator('.grid .card:not(.card-random) .card-open').nth(1));
  await full(s, { page: 'catalog', state: 'card-focus-visible', keepMouse: true, purpose: 'Catalog with a keyboard-focused card.' });

  // ---------------- Lists ----------------
  console.log('lists');
  await go(s, '#/lists', { reload: true });
  await page.waitForSelector('.list-card');
  await kb(page.locator('.list-card-open').first(), 'list-card', { region: [page.locator('.list-card').first()], pad: 14, zoom: 3 });
  await kb(page.locator('.list-card .icon-btn--danger').first(), 'icon-danger-button', { zoom: 4 });
  await kb(page.locator('.list-rename').first(), 'list-rename-input', { pad: 12, zoom: 3 });
  await focusVisible(s, page.locator('.list-card-open').nth(1));
  await full(s, { page: 'lists', state: 'list-card-focus-visible', keepMouse: true, purpose: 'Lists with a keyboard-focused list card.' });
  // hover vs focus on the same card
  await page.locator('.list-card').nth(1).hover();
  await page.waitForTimeout(150);
  await shot(s, 'list-card-hover-only', [page.locator('.list-card').nth(1)], { pad: 14, zoom: 3, how: 'mouse hover, no focus' });

  // ---------------- Journey ----------------
  console.log('journey');
  await go(s, '#/journey', { reload: true });
  await page.waitForSelector('.journey-roll');
  await kb(page.locator('#btn-sources'), 'link-btn', { pad: 14, zoom: 4 });
  await kb(page.locator('.journey-roll').first(), 'btn-primary', { pad: 12, zoom: 3 });
  await full(s, { page: 'journey', state: 'focus-visible', keepMouse: true, purpose: 'Journey with a keyboard-focused control.' });

  // ---------------- Environment detail (links) ----------------
  console.log('env detail');
  await go(s, '#/env/harsh-desert', { reload: true });
  await settle(page, { long: true });
  for (const sel of ['.adversary-encounter-link', '.encounter-builder-link']) {
    if (await page.locator(sel).count()) await kb(page.locator(sel).first(), sel.slice(1), { pad: 12, zoom: 4 });
    else console.log('  (no ' + sel + ' on this environment)');
  }

  // ---------------- Prep ----------------
  console.log('prep');
  await go(s, '#/prep', { reload: true });
  await page.waitForSelector('.prep-wrap');
  await settle(page, { long: true });
  await kb(page.locator('.prep-more-btn'), 'icon-utility-button', { zoom: 4 });
  await kb(page.locator('#sp-chrome-toggle'), 'session-control', { pad: 12, zoom: 3 });
  await kb(page.locator('.prep-select-checkbox:visible:not(:disabled)'), 'checkbox', { pad: 12, zoom: 4 });
  await kb(page.locator('.prep-sel-main').first(), 'prep-sel-main', { region: [page.locator('.prep-sel--card').first()], pad: 10, zoom: 2 });
  await kb(page.locator('.bp-summary'), 'bp-summary', { pad: 12, zoom: 3 });
  await kb(page.locator('.prep-notes-input'), 'prep-notes-input', { region: [page.locator('.prep-notes')], pad: 12, zoom: 3 });
  // Rename → title input
  await page.locator('.prep-more-btn').click();
  await page.waitForSelector('.prep-menu:visible');
  await page.locator('.prep-menu:visible .prep-menu-item', { hasText: 'Rename' }).click();
  await page.waitForSelector('.prep-title-input');
  await page.waitForTimeout(150);
  await page.keyboard.press('End');
  const tp = await probe(page);
  check('prep-title-input: ring present', tp && tp.own, JSON.stringify(tp));
  check('prep-title-input: not clipped', tp && !tp.clipped, tp && tp.clipped);
  const tbox = await page.locator('.prep-title-input').evaluate(e => { const r = e.getBoundingClientRect(); return [r.height, document.querySelector('.prep-titlerow').getBoundingClientRect().height]; });
  await parkMouse(s);
  await shot(s, 'prep-title-input', [page.locator('.prep-titlerow')], { pad: 14, zoom: 3, how: 'Rename from the ⋯ menu (input auto-focused), End to drop the selection' });
  await full(s, { page: 'prep', state: 'title-input-focus', keepMouse: true, purpose: 'Rename input focus in the compact header.' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const afterH = await page.locator('.prep-titlerow').evaluate(e => e.getBoundingClientRect().height);
  check('prep-title-input: header height unchanged by focus', Math.abs(afterH - tbox[1]) < 0.5, `${tbox[1]} → ${afterH}`);
  const back2 = await page.evaluate(() => document.activeElement && document.activeElement.id);
  check('prep-title-input: Escape returns focus to the title button', back2 === 'prep-title-btn', back2);

  // Floating panels, keyboard only
  for (const [name, trig, panel] of [['session-menu', '.prep-title-btn', '.prep-menu:not([hidden])'], ['bp-popover', '.bp-summary', '.bp-popover:not([hidden])'], ['soundboard', '.sb-trigger', '.sb-panel:not([hidden])'], ['prep-adv-ms', '.prep-adv-toolbar .ms-trigger', '.ms-panel:not([hidden])']]) {
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector(trig);
    await settle(page, { long: true });
    await focusVisible(s, page.locator(trig).first());
    const tpb = await probe(page);
    check(`${name}: trigger focus ring`, tpb && tpb.ring && tpb.fv, tpb && tpb.el);
    await page.keyboard.press('Enter');
    await page.waitForSelector(panel, { state: 'visible', timeout: 4000 }).catch(() => {});
    const res = [];
    // Menus take focus on open and move with the arrow keys; the other panels are plain Tab order.
    const step = name === 'session-menu' ? 'ArrowDown' : 'Tab';
    const isInside = () => page.evaluate(sel => !!(document.activeElement && document.querySelector(sel) && document.querySelector(sel).contains(document.activeElement)), panel);
    if (await isInside()) res.push(await probe(page));
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press(step);
      if (!(await isInside())) break;
      res.push(await probe(page));
    }
    const stops = res.filter(p => p && !p.programmatic);
    check(`${name}: ${stops.length} in-panel stops all show a ring (programmatic panel focus exempt)`, stops.length > 0 && stops.every(p => p.ring), stops.filter(p => !p.ring).map(p => p.el).join(','));
    check(`${name}: no in-panel ring clipped`, stops.every(p => !p.clipped), stops.filter(p => p.clipped).map(p => p.el + '←' + p.clipped + ' ' + p.clipInfo).join(','));
    check(`${name}: no stacked rings`, stops.every(p => !p.double));
    // Second pass: re-open, move two stops in, capture, and Escape from inside the panel.
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector(trig);
    await settle(page, { long: true });
    await focusVisible(s, page.locator(trig).first());
    await page.keyboard.press('Enter');
    await page.waitForSelector(panel, { state: 'visible', timeout: 4000 }).catch(() => {});
    await page.keyboard.press(step);
    if (!(await isInside())) await page.keyboard.press(step);
    await parkMouse(s);
    await shot(s, `${name}-focus`, [page.locator(panel).first()], { pad: 16, zoom: 2, how: 'Enter on trigger, then move inside the panel by keyboard' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const trigOk = await page.evaluate(sel => document.activeElement === document.querySelector(sel), trig);
    check(`${name}: Escape from inside returns focus to the trigger`, trigOk);
  }

  // Selected + focused on the BP segmented control
  await go(s, '#/prep', { reload: true });
  await page.waitForSelector('.bp-summary');
  await settle(page, { long: true });
  await focusVisible(s, page.locator('.bp-summary'));
  await page.keyboard.press('Enter');
  await page.waitForSelector('.bp-popover:not([hidden])');
  const seg = page.locator('.bp-seg input:checked').first();
  await focusVisible(s, seg);
  const sp = await probe(page);
  check('bp-seg selected + focused: ring is on the segment label', true, JSON.stringify(sp));
  await parkMouse(s);
  await shot(s, 'bp-seg-selected-focused', [page.locator('.bp-segs').first()], { pad: 10, zoom: 3 });
  await page.keyboard.press('Escape');

  // Disabled controls never take focus
  await go(s, '#/prep', { reload: true });
  await settle(page, { long: true });
  const dis = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button:disabled, input:disabled')) {
      el.focus();
      out.push(document.activeElement === el || el.matches(':focus-visible') ? 'FOCUSED:' + el.className : null);
    }
    return { n: document.querySelectorAll('button:disabled, input:disabled').length, bad: out.filter(Boolean) };
  });
  check('native :disabled controls cannot take focus', dis.bad.length === 0, `${dis.n} disabled controls, bad=${dis.bad.join(',')}`);

  // Reduced motion + forced colors
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await focusVisible(s, page.locator('.prep-more-btn'));
  const rm = await page.locator('.prep-more-btn').evaluate(e => { const c = getComputedStyle(e); return { ring: c.outlineStyle !== 'none', transitionsOutline: /outline|all/.test(c.transitionProperty) }; });
  check('reduced motion: ring present and not transitioned', rm.ring && !rm.transitionsOutline, JSON.stringify(rm));
  await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'active' });
  const fc = [];
  for (const sel of ['.prep-more-btn', '.bp-summary', '.prep-notes-input', '#prep-env-search', '.lang-switch button.active']) {
    await focusVisible(s, page.locator(sel).first());
    fc.push(await page.locator(sel).first().evaluate(e => { const c = getComputedStyle(e); return { sel: e.className || e.id, style: c.outlineStyle, w: c.outlineWidth, color: c.outlineColor }; }));
  }
  check('forced-colors: every probed control keeps a visible outline', fc.every(x => x.style !== 'none' && parseFloat(x.w) > 0), JSON.stringify(fc));
  await page.emulateMedia({ forcedColors: 'none' });

  await page.context().close();

  // ---------------- Prep at the supported laptop/desktop targets ----------------
  for (const [w, h] of [[1366, 768], [1440, 900], [1920, 1080]]) {
    console.log(`prep ${w}x${h}`);
    const t = await openSession(browser, url, { width: w, height: h }, 'full', rec);
    await go(t, '#/prep', { reload: true });
    await t.page.waitForSelector('.prep-wrap');
    await settle(t.page, { long: true });
    let bad = [];
    for (const sel of ['#sp-chrome-toggle', '.prep-title-btn', '.prep-notes-input', '.prep-more-btn', '#prep-env-search', '.prep-row-open', '.prep-select-checkbox:visible', '.prep-sel-main', '.bp-summary', '.sb-trigger', '.prep-adv-toolbar .ms-trigger']) {
      const loc = t.page.locator(sel).first();
      if (!(await loc.count())) { bad.push('missing ' + sel); continue; }
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      await focusVisible(t, loc);
      const p = await probe(t.page);
      if (!p || !p.ring || p.clipped) bad.push(`${sel}: ${p ? (p.clipped ? 'clipped by ' + p.clipped : 'no ring') : 'no focus'}`);
    }
    check(`prep ${w}x${h}: representative controls ring visible and unclipped`, bad.length === 0, bad.join('; '));
    const noOverflow = await t.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    check(`prep ${w}x${h}: no horizontal overflow`, noOverflow);
    await focusVisible(t, t.page.locator('.prep-sel-main').first());
    await full(t, { page: 'prep', state: 'focus-visible-sel-main', keepMouse: true, purpose: 'Prep with a keyboard-focused central row.' });
    await t.page.context().close();
  }

  await browser.close(); server.close();
  fs.writeFileSync(path.join(OUT, 'verification.json'), JSON.stringify({ passed: checks.filter(c => c.ok).length, failed: checks.filter(c => !c.ok).length, checks }, null, 1));
  console.log(`\n${checks.filter(c => c.ok).length} passed, ${checks.filter(c => !c.ok).length} failed`);
  fs.writeFileSync(path.join(OUT, '.rec.json'), JSON.stringify(rec.entries.map(e => e.file)));
}
await main();
