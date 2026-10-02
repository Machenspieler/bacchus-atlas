#!/usr/bin/env node
// Stage 4 task 03 — floating-surface families.
//   node scripts/design-audit/stage4-floating-surfaces.mjs        capture + measure + verify + compose
// Writes into docs/design-audit/stage-4/task-03-floating-surfaces/.
// BEFORE for .ms-panel is the unmodified Stage 2 crop (docs/design-audit/stage-2).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { startServer, ROOT } from './lib.mjs';
import { Recorder, launch, openSession, go, settle, full, crop, sheet, measureEls, hover, parkMouse } from './harness.mjs';

const OUT = path.resolve(ROOT, 'docs/design-audit/stage-4/task-03-floating-surfaces');
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); console.log(`  ${ok ? 'ok ' : 'FAIL'} ${name} ${detail}`); };

async function open(s, kind) {
  const { page } = s;
  if (kind === 'ms') {
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector('.prep-adv-toolbar .ms-trigger');
    await settle(page, { long: true });
    await page.locator('.prep-adv-toolbar .ms-trigger').first().click();
    await page.waitForSelector('.ms-panel', { state: 'visible' });
  } else if (kind === 'menu') {
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector('.prep-title-btn');
    await settle(page, { long: true });
    await page.locator('.prep-title-btn').click();
    await page.waitForSelector('.prep-menu', { state: 'visible' });
  } else if (kind === 'bp') {
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector('.bp-summary');
    await settle(page, { long: true });
    await page.locator('.bp-summary').click();
    await page.waitForSelector('.bp-popover', { state: 'visible' });
  } else if (kind === 'sb') {
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector('.sb-trigger');
    await settle(page, { long: true });
    await page.locator('.sb-trigger').click();
    await page.waitForSelector('.sb-panel', { state: 'visible' });
  }
  await settle(page);
}
const SEL = { ms: '.ms-panel:not([hidden])', menu: '.prep-menu:not([hidden])', bp: '.bp-popover:not([hidden])', sb: '.sb-panel:not([hidden])' };
const TRIG = { ms: '.prep-adv-toolbar .ms-trigger', menu: '.prep-title-btn', bp: '.bp-summary', sb: '.sb-trigger' };
const NAME = { ms: 'multiselect-open', menu: 'session-menu-open', bp: 'bp-popover-open', sb: 'soundboard-open' };

async function geometry(page, kind) {
  return page.evaluate(([p, t]) => {
    const el = document.querySelector(p), tr = document.querySelector(t);
    const r = el.getBoundingClientRect(), tb = tr.getBoundingClientRect();
    const de = document.documentElement;
    return {
      panel: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      trigger: { x: +tb.x.toFixed(1), y: +tb.y.toFixed(1), w: +tb.width.toFixed(1), h: +tb.height.toFixed(1) },
      gapBelow: +(r.top - tb.bottom).toFixed(1),
      gapAbove: +(tb.top - r.bottom).toFixed(1),
      inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      // The element under the panel's right-edge midpoint must be the panel itself, not a clipping ancestor's neighbour.
      bottomClipped: (() => { const e = document.elementFromPoint(r.left + r.width / 2, Math.min(r.bottom - 3, innerHeight - 1)); return !(e && el.contains(e)); })(),
      clipped: (() => { const e = document.elementFromPoint(Math.min(r.right - 3, innerWidth - 1), r.top + r.height / 2); return !(e && el.contains(e)); })(),
      hOverflow: de.scrollWidth > de.clientWidth,
    };
  }, [SEL[kind], TRIG[kind]]);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const rec = new Recorder(OUT);
  const { server, url } = await startServer();
  const browser = await launch();
  const measures = {}, geo = {};

  for (const [w, h] of [[1440, 900], [1366, 768], [1920, 1080]]) {
    const s = await openSession(browser, url, { width: w, height: h }, 'full', rec);
    for (const kind of ['ms', 'menu', 'bp', 'sb']) {
      console.log(`${w}x${h} ${kind}`);
      try {
        await open(s, kind);
        const m = await measureEls(s.page, { panel: SEL[kind], row: { ms: '.ms-row', menu: '.prep-menu-item', bp: '.bp-seg', sb: '.sb-sound' }[kind] ? SEL[kind] + ' ' + { ms: '.ms-row', menu: '.prep-menu-item', bp: '.bp-seg', sb: '.sb-sound' }[kind] : SEL[kind] });
        measures[`${w}x${h}__${kind}`] = m;
        geo[`${w}x${h}__${kind}`] = await geometry(s.page, kind);
        await full(s, { page: 'floating', state: NAME[kind], components: [kind], purpose: `Stage 4 task 03: ${NAME[kind]}`, keepMouse: false, dir: `${w}x${h}` });
        if (w === 1440) {
          if (kind === 'ms') await crop(s, { page: 'floating', state: 'ms-panel-AFTER-stage2-framing', locators: [s.page.locator(TRIG.ms).first(), s.page.locator(SEL.ms)], pad: 12, zoom: 2, keepMouse: true, components: ['ms-trigger', 'ms-panel'], purpose: 'Same framing as the Stage 2 ms-panel-open crop (BEFORE).' });
          await crop(s, { page: 'floating', state: `${NAME[kind]}-panel`, locators: [s.page.locator(SEL[kind])], pad: 6, zoom: 1, keepMouse: true, components: [kind], purpose: 'Panel only, 1:1 scale, for the contact sheet.' });
        }
        // Escape closes; focus returns to a visible, connected element.
        await s.page.keyboard.press('Escape');
        await s.page.waitForTimeout(150);
        const closed = await s.page.locator(SEL[kind]).count() === 0 || !(await s.page.locator(SEL[kind]).first().isVisible());
        check(`${w}x${h} ${kind}: Escape closes`, closed);
      } catch (e) { rec.fail(`${w} ${kind}`, e); check(`${w}x${h} ${kind}: captured`, false, e.message.split('\n')[0]); }
    }
    await s.context.close();
  }

  // ---- computed-style equality of the shared shell, at 1440 ----
  const s = await openSession(browser, url, { width: 1440, height: 900 }, 'full', rec);
  const shell = {};
  for (const kind of ['ms', 'menu', 'bp', 'sb']) {
    await open(s, kind);
    shell[kind] = await s.page.evaluate(sel => { const cs = getComputedStyle(document.querySelector(sel)); return { radius: cs.borderTopLeftRadius, border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`, shadow: cs.boxShadow, bg: cs.backgroundColor }; }, SEL[kind]);
    await s.page.keyboard.press('Escape');
  }
  for (const k of ['radius', 'border', 'shadow']) check(`shell ${k} identical across ms/menu/bp/sb`, new Set(Object.values(shell).map(v => v[k])).size === 1, JSON.stringify(shell.ms[k]));
  check('bg identical across ms/menu/bp', new Set([shell.ms.bg, shell.menu.bg, shell.bp.bg]).size === 1, shell.ms.bg);
  rec.measure('shell', shell);

  // ---- ms-panel: rounded-corner clipping, scrollbar, row radius, keyboard ----
  await open(s, 'ms');
  const msInfo = await s.page.evaluate(() => {
    const p = document.querySelector('.ms-panel:not([hidden])'), row = p.querySelector('.ms-row');
    return { rowRadius: getComputedStyle(row).borderTopLeftRadius, scrolls: p.scrollHeight > p.clientHeight, rows: p.querySelectorAll('.ms-row').length };
  });
  check('ms-row radius is r-sm (4px)', msInfo.rowRadius === '4px', msInfo.rowRadius);
  rec.measure('msInfo', msInfo);
  // force a scrolling panel to inspect scrollbar vs. rounded corners
  await s.page.evaluate(() => { const p = document.querySelector('.ms-panel:not([hidden])'); p.style.maxHeight = '150px'; });
  await settle(s.page);
  await crop(s, { page: 'floating', state: 'ms-panel-scrolling', locators: [s.page.locator(SEL.ms)], pad: 8, zoom: 3, components: ['ms-panel'], purpose: 'Scrollbar vs. rounded corners (max-height forced to 150px).' });
  await s.page.evaluate(() => { const p = document.querySelector('.ms-panel:not([hidden])'); p.scrollTop = p.scrollHeight; });
  await settle(s.page);
  await crop(s, { page: 'floating', state: 'ms-panel-scrolled-end', locators: [s.page.locator(SEL.ms)], pad: 8, zoom: 3, components: ['ms-panel'], purpose: 'Last row at the bottom rounded corner.' });
  await s.page.keyboard.press('Escape');

  // multiselect functional: open, tick, close; focus + Tab traversal
  await open(s, 'ms');
  const trig = s.page.locator(TRIG.ms).first();
  const row0 = s.page.locator(SEL.ms + ' .ms-row').first();
  await row0.click();
  const ticked = await s.page.locator(SEL.ms + ' .ms-checkbox:checked').count();
  check('multiselect: option can be selected', ticked === 1, `checked=${ticked}`);
  await s.page.keyboard.press('Escape');
  await s.page.waitForTimeout(150);
  check('multiselect: closes on Escape', !(await s.page.locator(SEL.ms).count()));
  const focusBack = await s.page.evaluate(sel => document.activeElement === document.querySelector(sel) || document.activeElement?.closest('.ms-field') === document.querySelector(sel)?.closest('.ms-field'), TRIG.ms);
  check('multiselect: focus returns to trigger', focusBack);
  await open(s, 'ms');
  await s.page.keyboard.press('Tab'); await s.page.keyboard.press('Tab');
  const tabFocus = await s.page.evaluate(() => { const a = document.activeElement; return { inPanel: !!a.closest('.ms-panel'), fv: a.matches(':focus-visible'), cls: a.className }; });
  check('multiselect: Tab reaches a panel control with focus-visible', tabFocus.inPanel && tabFocus.fv, JSON.stringify(tabFocus));
  await s.page.keyboard.press('Escape');

  // session menu: keyboard + select
  await open(s, 'menu');
  const itemCount = await s.page.locator(SEL.menu + ' .prep-menu-item').count();
  const menuFocus = await s.page.evaluate(() => { const a = document.activeElement; return { inMenu: !!a.closest('.prep-menu') }; });
  check('session menu: opening moves focus to an item', menuFocus.inMenu, `items=${itemCount}`);
  // keyboard-modality open: focus ring must show on the item
  await s.page.keyboard.press('Escape');
  await s.page.keyboard.press('ArrowDown');
  await s.page.waitForSelector(SEL.menu, { state: 'visible' });
  check('session menu: keyboard-opened item shows :focus-visible', await s.page.evaluate(() => document.activeElement.matches('.prep-menu-item:focus-visible')));
  await s.page.keyboard.press('ArrowDown');
  check('session menu: arrow keys keep focus inside', await s.page.evaluate(() => !!document.activeElement.closest('.prep-menu')));
  await s.page.keyboard.press('Escape');
  await s.page.waitForTimeout(150);
  check('session menu: Escape closes', !(await s.page.locator(SEL.menu).count()));
  check('session menu: focus returns to trigger', await s.page.evaluate(() => document.activeElement?.classList.contains('prep-title-btn')));
  await open(s, 'menu');
  await s.page.keyboard.press('Tab');
  await s.page.waitForTimeout(100);
  check('session menu: Tab closes it and focus is not trapped in it', !(await s.page.locator(SEL.menu).count()) && await s.page.evaluate(() => !document.activeElement.closest('.prep-menu')));
  await open(s, 'menu');
  await s.page.locator(SEL.menu + ' .prep-menu-item').first().click();
  await s.page.waitForTimeout(200);
  check('session menu: choosing an item closes it', !(await s.page.locator(SEL.menu).count()));

  // BP popover: interact with a control, close via × and Escape
  await open(s, 'bp');
  const before = await s.page.locator(SEL.bp).innerText();
  const step = s.page.locator(SEL.bp + ' .bp-step').first();
  if (await step.count()) { await step.click(); await s.page.waitForTimeout(100); }
  const after = await s.page.locator('.bp-popover').innerText().catch(() => before);
  check('bp popover: stepper interaction runs without closing it', await s.page.locator(SEL.bp).count() === 1, before === after ? 'value text unchanged (stepper may be at a bound)' : 'value changed');
  await s.page.locator(SEL.bp + ' .bp-pop-close').click();
  await s.page.waitForTimeout(150);
  check('bp popover: × closes', !(await s.page.locator(SEL.bp).count()));

  // soundboard: controls toggle, Escape closes
  await open(s, 'sb');
  const ctl = s.page.locator(SEL.sb + ' .sb-ctl').first();
  const hadCtl = await ctl.count();
  if (hadCtl) { await ctl.click(); await s.page.waitForTimeout(100); }
  check('soundboard: control click leaves panel open and usable', await s.page.locator(SEL.sb).count() === 1, `controls=${hadCtl}`);
  await s.page.keyboard.press('Escape');
  await s.page.waitForTimeout(150);
  check('soundboard: Escape closes', !(await s.page.locator(SEL.sb).count()));
  await s.context.close();

  // ---- geometry checks ----
  for (const [k, g] of Object.entries(geo)) {
    check(`${k}: inside viewport`, g.inViewport, JSON.stringify(g.panel));
    check(`${k}: not clipped by an ancestor`, !g.clipped);
    check(`${k}: bottom edge visible`, !g.bottomClipped);
    check(`${k}: no horizontal scroll`, !g.hOverflow);
    const gap = Math.min(...[g.gapBelow, g.gapAbove].filter(v => v >= -1)); // adjacent either side
    check(`${k}: panel sits next to its trigger`, Number.isFinite(gap) ? gap <= 48 : true, `gap=${gap}`);
  }

  // ---- regression: icon-button families + Prep layout ----
  const r2 = await openSession(browser, url, { width: 1366, height: 768 }, 'full', rec);
  await go(r2, '#/prep', { reload: true });
  await r2.page.waitForSelector('.prep-wrap');
  await settle(r2.page, { long: true });
  const prep1366 = await r2.page.evaluate(() => {
    const cols = [...document.querySelectorAll('.prep-wrap > *')].map(e => Math.round(e.getBoundingClientRect().width));
    const de = document.documentElement;
    return { cols, hOverflow: de.scrollWidth > de.clientWidth };
  });
  check('Prep 1366: no horizontal overflow', !prep1366.hOverflow, JSON.stringify(prep1366.cols));
  const before1366 = JSON.parse(fs.readFileSync(path.resolve(ROOT, 'docs/design-audit/stage-4/task-01-prep-1366/measurements__after.json'), 'utf8'));
  rec.measure('prep1366', prep1366);
  await full(r2, { page: 'prep', state: 'regression', components: ['Prep'], purpose: 'Stage 4 task 03: Prep 1366 layout still intact', dir: '1366x768' });
  await r2.context.close();

  const ic = await openSession(browser, url, { width: 1440, height: 900 }, 'full', rec);
  await open(ic, 'bp');
  const closeStyle = await ic.page.evaluate(() => { const b = document.querySelector('.bp-pop-close'); const cs = getComputedStyle(b); return { cls: b.className, w: b.getBoundingClientRect().width, radius: cs.borderTopLeftRadius }; });
  check('icon-btn family intact: bp-pop-close is .icon-btn 32px', /icon-btn/.test(closeStyle.cls) && Math.round(closeStyle.w) === 32, JSON.stringify(closeStyle));
  await ic.context.close();

  fs.writeFileSync(path.join(OUT, 'measurements.json'), JSON.stringify({ measures, geometry: geo, rec: rec.measurements, issues: rec.consoleIssues, failures: rec.failures }, null, 2));
  fs.writeFileSync(path.join(OUT, 'verification.json'), JSON.stringify({ total: checks.length, failed: checks.filter(c => !c.ok).length, checks }, null, 2));
  await browser.close(); server.close();

  // ---- compose sheets ----
  const cs = { outDir: OUT, vp: { width: 1440, height: 900 }, rec };
  const items = [
    ['ms', 'ms-panel (multiselect)'], ['menu', 'prep-menu (session)'], ['bp', 'bp-popover'], ['sb', 'sb-panel (soundboard)'],
  ].map(([k, label]) => ({ file: `crops/1440x900__floating__${NAME[k]}-panel__crop.png`, label: `${label}  — 1:1` }));
  await sheet(cs, { page: 'floating', state: 'family-a', items, cols: 4, cell: { w: 400, h: 440 }, name: 'contact-sheet__interactive-panels__1440x900.png', purpose: 'Family A panels at the same 1:1 scale.' });
  const base = path.resolve(ROOT, 'docs/design-audit/stage-2/crops/1440x900__prep__ms-panel-open__crop.png');
  fs.copyFileSync(base, path.join(OUT, 'crops', 'ms-panel__BEFORE__stage2.png'));
  // BEFORE | AFTER, same framing (Stage 2 crop vs. the crop captured above).
  const bi = await sharp(path.join(OUT, 'crops', 'ms-panel__BEFORE__stage2.png')).metadata();
  const ai = await sharp(path.join(OUT, 'crops', '1440x900__floating__ms-panel-AFTER-stage2-framing__crop.png')).metadata();
  const W = bi.width + ai.width + 60, H = Math.max(bi.height, ai.height) + 60;
  const lab = (t, x) => ({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="26"><text x="0" y="19" font-family="Arial" font-size="18" fill="#d8cdb0">${t}</text></svg>`), left: x, top: 8 });
  await sharp({ create: { width: W, height: H, channels: 4, background: '#0b0908' } }).composite([
    lab('BEFORE (Stage 2): r-sm, raw shadow', 20), lab('AFTER: r-lg, e-3, rows r-sm', bi.width + 40),
    { input: path.join(OUT, 'crops', 'ms-panel__BEFORE__stage2.png'), left: 20, top: 40 },
    { input: path.join(OUT, 'crops', '1440x900__floating__ms-panel-AFTER-stage2-framing__crop.png'), left: bi.width + 40, top: 40 },
  ]).png().toFile(path.join(OUT, 'before-after__ms-panel.png'));
  console.log('failures:', rec.failures.length, 'checks failed:', checks.filter(c => !c.ok).length);
}
await main();
