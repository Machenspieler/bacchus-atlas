#!/usr/bin/env node
// Stage 4 task 05 — disabled / unavailable / inactive / loading / failed states.
//   node scripts/design-audit/stage4-disabled-states.mjs
// Real UI states wherever the profile reaches them (3/3 Prep, min battle-points count, sound
// requests held / aborted for loading / failed). The one forced state is a disabled plain
// .icon-btn (nothing in the UI leaves one disabled) — the real element, real CSS, `disabled` set.
// Writes into docs/design-audit/stage-4/task-05-disabled-states/. BEFORE crops are the
// unmodified Stage 2 crops.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { startServer, ROOT } from './lib.mjs';
import { Recorder, launch, openSession, go, settle, crop, parkMouse } from './harness.mjs';

const OUT = path.resolve(ROOT, 'docs/design-audit/stage-4/task-05-disabled-states');
const S2 = path.resolve(ROOT, 'docs/design-audit/stage-2/crops');
const VPS = [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }];
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); console.log(`  ${ok ? 'ok ' : 'FAIL'} ${name} ${detail}`); };
const M = {}; // computed measurements per viewport

const STYLE = el => { const c = getComputedStyle(el); return { opacity: c.opacity, cursor: c.cursor, color: c.color, bg: c.backgroundColor, border: c.borderTopColor, native: el.disabled === true, aria: el.getAttribute('aria-disabled') }; };
const snap = loc => loc.first().evaluate(STYLE);
const same = (a, b) => ['opacity', 'color', 'bg', 'border'].every(k => a[k] === b[k]);

/** hover must not change a non-active control's look */
async function noHoverChange(s, name, loc) {
  const before = await snap(loc);
  await parkMouse(s);
  await loc.first().hover({ force: true });
  await s.page.waitForTimeout(200);
  const after = await snap(loc);
  check(`hover leaves look unchanged — ${name}`, same(before, after), same(before, after) ? '' : JSON.stringify({ before, after }));
  await parkMouse(s);
  return before;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const rec = new Recorder(OUT);
  const { server, url } = await startServer();
  const browser = await launch();

  for (const vp of VPS) {
    const w = vp.width, big = w === 1440;
    console.log(`\n== ${w}x${vp.height}`);
    const s = await openSession(browser, url, vp, 'full', rec);
    const { page } = s;
    const m = M[w] = {};
    // Sound requests: one held forever (loading), one refused (failed).
    await page.route('**/sound/rock-golem-walking.mp3', () => { /* never answered: stays loading */ });
    await page.route('**/sound/hawk-call-squawk.wav', route => route.abort());
    const shot = async (state, locs, o = {}) => { if (big) await crop(s, { page: 'ds', state, locators: locs, pad: o.pad ?? 10, zoom: o.zoom, keepMouse: !!o.keepMouse, components: [state], purpose: o.purpose ?? state, actions: [o.how ?? 'natural state'] }); };

    // ---------- Prep: checkbox, nav, clear button, menu, stepper ----------
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector('.prep-wrap');
    await settle(page, { long: true });

    const cbOff = page.locator('.prep-col-env .prep-select-checkbox:disabled').first();
    const cbOn = page.locator('.prep-col-adv .prep-select-checkbox:not(:disabled):not(:checked)').first();
    const cbChecked = page.locator('.prep-col-env .prep-select-checkbox:checked').first();
    m.checkboxDisabled = await noHoverChange(s, 'prep-select-checkbox:disabled', cbOff);
    m.checkboxEnabled = await snap(cbOn);
    const tgtRow = page.locator('.prep-col-env .prep-row:has(.prep-select-checkbox:disabled)').first();
    const bcBefore = await cbOff.evaluate(e => getComputedStyle(e).borderTopColor);
    await tgtRow.locator('.prep-checkbox-hit').hover({ force: true });
    check('disabled checkbox: hover does not gold its border', (await cbOff.evaluate(e => getComputedStyle(e).borderTopColor)) === bcBefore);
    const idsBefore = await page.evaluate(() => document.querySelectorAll('.prep-col-env .prep-select-checkbox:checked').length);
    await cbOff.click({ force: true }).catch(() => {});
    check('disabled checkbox: click selects nothing', idsBefore === await page.evaluate(() => document.querySelectorAll('.prep-col-env .prep-select-checkbox:checked').length));
    check('disabled checkbox: not focusable', await cbOff.evaluate(e => { e.focus(); return document.activeElement !== e; }));
    check('checked+disabled stays distinguishable from unchecked+disabled', await page.evaluate(() => {
      const d = [...document.querySelectorAll('.prep-col-env .prep-select-checkbox:disabled')];
      return d.length > 0; }), 'every unselected env box is disabled at 3/3; selected ones stay enabled (so they can be removed)');
    await parkMouse(s);
    const envRows = page.locator('.prep-col-env .prep-row');
    await shot('checkbox-disabled-env-picker', [envRows.nth(0), envRows.nth(2)], { zoom: 3 });
    await shot('checkbox-disabled', [cbOff], { zoom: 6, pad: 10 });

    // item clear button (native-disabled .btn) and a plain enabled .btn
    const clearBtn = page.locator('.item-clear-btn:disabled').first();
    if (await clearBtn.count()) {
      m.btnDisabled = await noHoverChange(s, '.btn:disabled (item clear)', clearBtn);
      check('.btn:disabled uses the shared token', m.btnDisabled.opacity === '0.5', m.btnDisabled.opacity);
      check('.btn:disabled: not focusable', await clearBtn.evaluate(e => { e.focus(); return document.activeElement !== e; }));
      await shot('btn-disabled', [clearBtn], { zoom: 5, pad: 14 });
    } else check('.btn:disabled reachable', false, 'no .item-clear-btn:disabled');
    const btnOn = page.locator('.prep-new-btn').first();
    m.btnEnabled = await snap(btnOn);
    await shot('btn-enabled', [btnOn], { zoom: 3 });

    // forced disabled plain icon button (documented above)
    const more = page.locator('.prep-more-btn').first();
    const moreOn = await snap(more);
    await more.evaluate(e => { e.disabled = true; });
    m.iconBtnDisabled = await noHoverChange(s, '.icon-btn:disabled', more);
    check('.icon-btn:disabled uses the shared token', m.iconBtnDisabled.opacity === '0.5', m.iconBtnDisabled.opacity);
    check('.icon-btn:disabled is not tinted by hover (no hover bg)', m.iconBtnDisabled.bg === moreOn.bg);
    await shot('icon-btn-disabled', [more], { zoom: 5, pad: 14, how: 'forced: disabled=true on .prep-more-btn' });
    await more.evaluate(e => { e.disabled = false; });

    // item strip navigation
    const nav = page.locator('.prep-item-strip-wrap:visible .prep-item-nav-btn');
    if (await nav.count() && await nav.first().isVisible().catch(() => false)) {
      m.navDisabled = await noHoverChange(s, 'prep-item-nav-btn (disabled, prev at start)', nav.first());
      m.navEnabled = await snap(nav.last());
      check('nav disabled: opacity token', m.navDisabled.opacity === '0.5', m.navDisabled.opacity);
      check('nav disabled: not focusable', await nav.first().evaluate(e => { e.focus(); return document.activeElement !== e; }));
      await shot('nav-disabled', [nav.first()], { zoom: 5, pad: 14 });
    } else { m.navDisabled = null; console.log('  (no overflowing item strip at this viewport — nav buttons hidden by design)'); }

    // actions menu: disabled Delete
    await page.locator('.prep-more-btn').click();
    await page.waitForSelector('.prep-menu:visible');
    const del = page.locator('.prep-menu:visible .prep-menu-item.is-disabled');
    const norm = page.locator('.prep-menu:visible .prep-menu-item:not(.is-disabled):not(.is-danger)').first();
    m.menuDisabled = await noHoverChange(s, 'prep-menu-item.is-disabled', del);
    m.menuNormal = await snap(norm);
    check('menu item disabled: no opacity stacked on the muted label', m.menuDisabled.opacity === '1', m.menuDisabled.opacity);
    check('menu item disabled: label is muted, normal is parchment', m.menuDisabled.color !== m.menuNormal.color);
    check('menu item disabled: aria-disabled="true"', m.menuDisabled.aria === 'true');
    await del.click({ force: true });
    check('menu item disabled: click is swallowed (menu stays, prep not deleted)', await page.locator('.prep-menu:visible').count() === 1 && await page.locator('.prep-title-btn').count() === 1);
    check('menu item disabled: still focusable (roving menu)', await del.evaluate(e => { e.focus(); return document.activeElement === e; }));
    await shot('menu-item-disabled', [page.locator('.prep-menu:visible')], { zoom: 2, keepMouse: false });
    await page.keyboard.press('Escape');

    // battle points stepper
    await page.locator('.bp-summary').click();
    await page.waitForSelector('.bp-popover', { state: 'visible' });
    const pop = page.locator('.bp-popover:visible');
    const minus = pop.locator('.bp-step').first(), plus = pop.locator('.bp-step').last();
    for (let i = 0; i < 12 && !(await minus.isDisabled()); i++) await minus.click();
    check('bp-step reaches its minimum (disabled)', await minus.isDisabled());
    m.stepDisabled = await noHoverChange(s, 'bp-step:disabled', minus);
    m.stepEnabled = await snap(plus);
    check('bp-step disabled: opacity token', m.stepDisabled.opacity === '0.5', m.stepDisabled.opacity);
    check('bp-step enabled is untouched (opacity 1)', m.stepEnabled.opacity === '1');
    const val = await pop.locator('.bp-pc-input').first().inputValue().catch(() => null);
    await minus.click({ force: true }).catch(() => {});
    check('bp-step disabled: click does not change the count', val === await pop.locator('.bp-pc-input').first().inputValue().catch(() => null), String(val));
    check('bp-step disabled: not focusable', await minus.evaluate(e => { e.focus(); return document.activeElement !== e; }));
    await shot('stepper-disabled', [minus, plus], { zoom: 6, pad: 12 });
    await page.keyboard.press('Escape');

    // ---------- soundboard: aria-disabled, inactive, loading, failed ----------
    await page.locator('.sb-trigger').click();
    await page.waitForSelector('.sb-panel', { state: 'visible' });
    await page.waitForTimeout(1200);
    const panel = page.locator('.sb-panel:visible');
    const stop = panel.locator('.sb-ctl[data-act="stop"]'), settings = panel.locator('.sb-ctl[data-act="settings"]');
    m.sbStop = await noHoverChange(s, 'sb-ctl[aria-disabled]', stop);
    m.sbSettings = await snap(settings);
    check('sb-ctl aria-disabled: opacity token', m.sbStop.opacity === '0.5', m.sbStop.opacity);
    check('sb-ctl aria-disabled="true" exposed', m.sbStop.aria === 'true');
    check('sb-ctl aria-disabled: stays focusable by design', await stop.evaluate(e => { e.focus(); return document.activeElement === e; }));
    await stop.click({ force: true });
    check('sb-ctl aria-disabled: click is inert', (await stop.getAttribute('aria-disabled')) === 'true');
    // inactive but interactive: settings toggle, not pressed
    check('inactive control (sb-ctl settings) is not dimmed', m.sbSettings.opacity === '1' && m.sbSettings.aria === null);
    const idleHover = await (async () => { await settings.hover(); await page.waitForTimeout(200); const h = await snap(settings); await parkMouse(s); return h; })();
    check('inactive control still responds to hover', !same(m.sbSettings, idleHover));
    check('inactive control: focusable', await settings.evaluate(e => { e.focus(); return document.activeElement === e; }));
    const loadingBtn = panel.locator('.sb-sound[data-sound="rock-golem-walking"]');
    const failedBtn = panel.locator('.sb-sound[data-sound="hawk-call-squawk"]');
    const readyBtn = panel.locator('.sb-sound[data-state="ready"]').first();
    check('sound states reached: loading / failed / ready', (await loadingBtn.getAttribute('data-state')) === 'loading' && (await failedBtn.getAttribute('data-state')) === 'failed' && (await readyBtn.count()) === 1,
      [await loadingBtn.getAttribute('data-state'), await failedBtn.getAttribute('data-state')].join('/'));
    m.soundReady = await snap(readyBtn); m.soundLoading = await snap(loadingBtn); m.soundFailed = await snap(failedBtn);
    const svgOp = async l => l.locator('svg').first().evaluate(e => getComputedStyle(e).opacity);
    m.soundSvg = { ready: await svgOp(readyBtn), loading: await svgOp(loadingBtn), failed: await svgOp(failedBtn) };
    check('loading: icon at the disabled token, spinner present', m.soundSvg.loading === '0.5' && await loadingBtn.evaluate(e => getComputedStyle(e, '::after').content !== 'none'));
    check('failed: icon not additionally dimmed (muted colour + dashed edge + alert glyph)', m.soundSvg.failed === '1' && m.soundFailed.color !== m.soundReady.color);
    check('failed: alert glyph shown in fear colour', await failedBtn.locator('.sb-sound-alert').evaluate(e => getComputedStyle(e).display !== 'none'));
    for (const [n, l] of [['loading', loadingBtn], ['failed', failedBtn]]) {
      const b = await snap(l); await l.hover({ force: true }); await page.waitForTimeout(200);
      const a = await snap(l); check(`sound ${n}: hover leaves look unchanged`, same(b, a)); await parkMouse(s);
    }
    check('sound loading: aria-disabled + aria-busy, click does not start playback', (await loadingBtn.getAttribute('aria-disabled')) === 'true' && (await loadingBtn.getAttribute('aria-busy')) === 'true');
    await loadingBtn.click({ force: true }); check('sound loading: not playing after click', (await loadingBtn.getAttribute('data-playing')) === 'false');
    check('ready sound: still plays on click (interactive)', await (async () => { await readyBtn.click(); await page.waitForTimeout(250); return (await readyBtn.getAttribute('data-playing')) === 'true'; })());
    // stop-all becomes enabled while something plays
    check('stop-all enabled while a sound plays', (await stop.getAttribute('aria-disabled')) === 'false');
    await stop.click(); await page.waitForTimeout(200);
    check('stop-all disabled again after stopping', (await stop.getAttribute('aria-disabled')) === 'true');
    await parkMouse(s);
    await shot('soundboard-states', [panel.locator('.sb-grid'), panel.locator('.sb-controls')], { zoom: 2, pad: 12 });
    await shot('sb-ctl-stop-disabled', [stop], { zoom: 6, pad: 12 });
    await shot('sb-ctl-inactive', [settings], { zoom: 5, pad: 12 });
    await shot('sound-loading', [loadingBtn], { zoom: 4, pad: 10 });
    await shot('sound-failed', [failedBtn], { zoom: 4, pad: 10 });
    await page.keyboard.press('Escape');

    // ---------- Catalog: env-prep-btn unavailable ----------
    await go(s, '#/', { reload: true });
    await page.waitForSelector('.grid .card');
    const un = page.locator('.grid .card:not(.card-random) .env-prep-btn.is-unavailable').first();
    const av = page.locator('.grid .card:not(.card-random) .env-prep-btn:not(.is-unavailable):not(.is-selected)').first();
    m.envUnavailable = await noHoverChange(s, 'env-prep-btn.is-unavailable', un);
    check('env-prep-btn unavailable: opacity token + aria-disabled', m.envUnavailable.opacity === '0.5' && m.envUnavailable.aria === 'true');
    const pressed = await un.getAttribute('aria-pressed');
    await un.click({ force: true });
    check('env-prep-btn unavailable: activation blocked', (await un.getAttribute('aria-pressed')) === pressed && (await un.getAttribute('aria-disabled')) === 'true');
    check('env-prep-btn unavailable: keeps its reason tooltip', !!(await un.getAttribute('data-tip') || await un.getAttribute('title') || await un.getAttribute('aria-label')));
    check('env-prep-btn unavailable: focusable (reason reachable)', await un.evaluate(e => { e.focus(); return document.activeElement === e; }));
    await shot('env-prep-btn-unavailable', [page.locator('.grid .card:not(.card-random)').nth(1).locator('.env-actions')], { zoom: 5, pad: 16 });

    // ---------- Lists overlay: atl-row unavailable ----------
    await go(s, '#/env/abandoned-grove');
    await page.waitForSelector('#detail-add-to-list-bottom');
    await page.locator('#detail-add-to-list-bottom').click();
    await page.waitForSelector('.atl-row');
    await page.waitForTimeout(250);
    const prow = page.locator('#atl-prep-row'), ok = page.locator('.atl-row:not(.is-unavailable)').first();
    m.atlRow = await noHoverChange(s, 'atl-row.is-unavailable', prow);
    m.atlRowNormal = await snap(ok);
    m.atlBox = await snap(prow.locator('input'));
    check('atl-row unavailable: label muted, no row opacity', m.atlRow.opacity === '1' && m.atlRow.color !== m.atlRowNormal.color, `${m.atlRow.color} vs ${m.atlRowNormal.color}`);
    check('atl-row unavailable: checkbox at the disabled token', m.atlBox.opacity === '0.5' && m.atlBox.native, m.atlBox.opacity);
    const was = await prow.locator('input').isChecked();
    await prow.click({ force: true }); await page.waitForTimeout(150);
    check('atl-row unavailable: click does not toggle', was === await prow.locator('input').isChecked());
    check('atl-row unavailable: hint stays visible (reason)', await page.locator('#atl-prep-hint').isVisible());
    await shot('atl-row-unavailable', [prow, page.locator('#atl-prep-hint')], { zoom: 3, pad: 14 });
    await page.keyboard.press('Escape');

    // ---------- loading .btn keeps full-strength spinner ----------
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector('.prep-wrap');
    const lb = await page.locator('.prep-new-btn').first().evaluate(e => { e.dataset.loading = 'true'; e.disabled = true; const c = getComputedStyle(e); return { opacity: c.opacity, cursor: c.cursor, after: getComputedStyle(e, '::after').content }; });
    check('.btn loading is not dimmed like disabled', lb.opacity === '1' && lb.after !== 'none' && lb.cursor === 'progress', JSON.stringify(lb));
    await s.context.close();
  }

  fs.writeFileSync(path.join(OUT, 'measurements.json'), JSON.stringify(M, null, 2));
  fs.writeFileSync(path.join(OUT, 'verification.json'), JSON.stringify({ passed: checks.filter(c => c.ok).length, failed: checks.filter(c => !c.ok).length, checks, consoleIssues: rec.consoleIssues }, null, 2));
  await browser.close(); server.close();
  console.log(`\n${checks.filter(c => c.ok).length} ok, ${checks.filter(c => !c.ok).length} failed`);
}

await main();
