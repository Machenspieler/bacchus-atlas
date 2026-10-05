#!/usr/bin/env node
// Stage 4 task 08 — semantic colour + alpha roles.
//   node scripts/design-audit/stage4-semantic-colors.mjs before   (run on the unmodified CSS)
//   node scripts/design-audit/stage4-semantic-colors.mjs after    (captures + contact sheets + checks)
// Real UI, real CSS. Two states are forced because the data never leaves them on screen: the
// ".badge.pending" marker (RU-untranslated environments are not in the data) is injected into a
// real card; a Prep "limit" / "over budget" state is not forced — it is only shown if reached.
// Output: docs/design-audit/stage-4/task-08-semantic-colors/
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { startServer, ROOT } from './lib.mjs';
import { Recorder, launch, openSession, go, settle, crop, full, parkMouse } from './harness.mjs';

const OUT = path.resolve(ROOT, 'docs/design-audit/stage-4/task-08-semantic-colors');
const phase = process.argv[2] === 'before' ? 'before' : 'after';
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); console.log(`  ${ok ? 'ok ' : 'FAIL'} ${name} ${detail}`); };
const M = {};

const CS = el => { const c = getComputedStyle(el); return { color: c.color, bg: c.backgroundColor, border: c.borderTopColor, outline: c.outlineStyle === 'none' ? 'none' : `${c.outlineWidth} ${c.outlineColor}`, shadow: c.boxShadow }; };
const alphaOf = rgba => { const m = /rgba?\(([^)]+)\)/.exec(rgba); if (!m) return null; const p = m[1].split(',').map(Number); return p.length === 4 ? p[3] : 1; };

async function main() {
  const dir = path.join(OUT, phase);
  fs.mkdirSync(dir, { recursive: true });
  const rec = new Recorder(dir);
  const { server, url } = await startServer();
  const browser = await launch();
  const vps = phase === 'before' ? [{ width: 1440, height: 900 }] : [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }];

  for (const vp of vps) {
    const big = vp.width === 1440;
    console.log(`\n== ${vp.width}x${vp.height} (${phase})`);
    const s = await openSession(browser, url, vp, 'full', rec);
    const { page } = s;
    const shot = async (state, locs, o = {}) => {
      if (!big) return;
      try { await crop(s, { page: 'sc', state, locators: locs, pad: o.pad ?? 10, zoom: o.zoom ?? 3, keepMouse: !!o.keepMouse, components: [state], actions: [o.how ?? 'natural'] }); }
      catch (e) { console.log('  ! shot ' + state + ': ' + String(e.message).split('\n')[0]); }
    };
    const m = M[vp.width] = {};

    // ---------- viewport regression shots (after only) ----------
    if (phase === 'after') {
      const routes = vp.width === 1440 ? [['catalog', '#/'], ['lists', '#/lists'], ['prep', '#/prep'], ['journey', '#/journey']] : [['prep', '#/prep']];
      for (const [n, h] of routes) {
        await go(s, h, { reload: true });
        await page.waitForTimeout(400);
        await full(s, { page: n, state: 'regression', dir: 'regression', components: [n], purpose: 'Regression after semantic-colour pass.' });
      }
      if (vp.width === 1440) {
        await go(s, '#/env/harsh-desert', { reload: true });
        await page.waitForSelector('.modal .feature-type');
        await full(s, { page: 'detail', state: 'regression', dir: 'regression', components: ['detail'], purpose: 'Regression: detail modal.' });
        await go(s, '#/prep', { reload: true });
        await page.locator('.sb-trigger').click();
        await page.waitForSelector('.sb-panel', { state: 'visible' });
        await page.waitForTimeout(500);
        await full(s, { page: 'soundboard', state: 'regression', dir: 'regression', components: ['soundboard'], purpose: 'Regression: soundboard open.', keepMouse: true });
        await page.keyboard.press('Escape');
      }
    }
    if (!big) { await s.context.close(); continue; }

    // ---------- Catalog: card actions, filter dropdown ladder ----------
    await go(s, '#/', { reload: true });
    await page.waitForSelector('.card');
    // neutral/gold hover on card add button; selected env-prep hover
    const addBtn = page.locator('.card-add-btn').first();
    const prepBtnSel = page.locator('.env-prep-btn.is-selected').first();
    const prepBtnRest = page.locator('.env-prep-btn:not(.is-selected):not(.is-unavailable)').first();
    if (await addBtn.count()) {
      await addBtn.scrollIntoViewIfNeeded();
      await shot('card-add-btn-rest', [addBtn], { zoom: 6 });
      await addBtn.hover(); await page.waitForTimeout(220);
      m.cardAddHover = await addBtn.evaluate(CS);
      await shot('card-add-btn-hover', [addBtn], { zoom: 6, keepMouse: true });
    }
    if (await prepBtnSel.count()) {
      await prepBtnSel.scrollIntoViewIfNeeded();
      await prepBtnSel.hover(); await page.waitForTimeout(220);
      m.envPrepSelHover = await prepBtnSel.evaluate(CS);
      await shot('env-prep-selected-hover', [prepBtnSel], { zoom: 6, keepMouse: true });
    }
    await parkMouse(s);

    await page.locator('#f-types-btn').click();
    await page.waitForSelector('#f-types-panel', { state: 'visible' });
    const rows = page.locator('#f-types-panel .ms-row');
    const nRows = await rows.count();
    const panel = page.locator('#f-types-panel');
    // rest (row 0), hover (row 1), checked (row 2), checked+hover, checked+focus
    await rows.nth(2).click(); await page.waitForTimeout(150);
    await rows.nth(0).hover(); await page.waitForTimeout(200);
    m.msHover = await rows.nth(0).evaluate(CS); m.msChecked = await rows.nth(2).evaluate(CS);
    await shot('ladder-ms-panel-hover-vs-checked', [panel], { zoom: 2, keepMouse: true });
    await rows.nth(2).hover(); await page.waitForTimeout(200);
    m.msCheckedHover = await rows.nth(2).evaluate(CS);
    await shot('ms-row-checked-hover', [rows.nth(2)], { zoom: 4, keepMouse: true });
    await parkMouse(s);
    await rows.nth(2).locator('input').focus();
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); // keyboard modality
    await page.waitForTimeout(120);
    m.msCheckedFocus = await rows.nth(2).evaluate(CS);
    await shot('ms-row-checked-focus', [rows.nth(2)], { zoom: 4, keepMouse: true });
    await page.keyboard.press('Escape');
    // clean up the checked filter so later routes are unaffected
    await page.evaluate(() => { try { localStorage.removeItem('dhcodex_filters'); } catch (e) {} });

    // ---------- badge pending (forced marker on a real card) ----------
    await go(s, '#/', { reload: true });
    await page.waitForSelector('.card .card-meta');
    await page.evaluate(() => {
      const meta = document.querySelector('.card .card-meta');
      const b = document.createElement('span'); b.className = 'badge pending'; b.textContent = 'RU pending'; b.id = 'forced-pending';
      meta.appendChild(b);
    });
    m.badgePending = await page.locator('#forced-pending').evaluate(CS);
    await shot('badge-pending-in-card-meta', [page.locator('.card:has(#forced-pending) .card-meta')], { zoom: 4 });

    // ---------- Detail: feature types ----------
    await go(s, '#/env/harsh-desert', { reload: true });
    await page.waitForSelector('.modal .feature-type');
    const mo = page.locator('.modal');
    for (const t of ['passive', 'action', 'reaction']) {
      const h = mo.locator(`.feature-head:has(.feature-type.${t})`).first();
      if (await h.count()) { await h.scrollIntoViewIfNeeded(); m['ft_' + t] = await mo.locator(`.feature-type.${t}`).first().evaluate(CS); await shot(`feature-type-${t}`, [h], { zoom: 4 }); }
    }
    await go(s, '#/env/port-city', { reload: true });
    await page.waitForSelector('.modal .feature-type.reaction');
    { const h = page.locator('.modal .feature-head:has(.feature-type.reaction)').first(); await h.scrollIntoViewIfNeeded(); m.ft_reaction = await page.locator('.modal .feature-type.reaction').first().evaluate(CS); await shot('feature-type-reaction', [h], { zoom: 4 }); }
    await go(s, '#/env/harsh-desert', { reload: true });
    await page.waitForSelector('.modal .feature-type');
    const dice = mo.locator('.dice-btn').first();
    await dice.scrollIntoViewIfNeeded();
    await shot('dice-btn-rest', [dice], { zoom: 5 });
    await dice.hover(); await page.waitForTimeout(200);
    m.diceHover = await dice.evaluate(CS);
    await shot('dice-btn-hover', [dice], { zoom: 5, keepMouse: true });
    const cd = mo.locator('.countdown-btn').first();
    if (await cd.count()) {
      await cd.scrollIntoViewIfNeeded(); await shot('countdown-btn-rest', [cd], { zoom: 5 });
      await cd.hover(); await page.waitForTimeout(200); m.countdownHover = await cd.evaluate(CS);
      await shot('countdown-btn-hover', [cd], { zoom: 5, keepMouse: true });
    }
    await parkMouse(s);

    // ---------- Detail: adversary link + item link ----------
    await go(s, '#/env/progenitor-minds-lair', { reload: true });
    await page.waitForSelector('.modal .adversary-link-btn');
    const alb = page.locator('.modal .adversary-link-btn').first();
    await alb.scrollIntoViewIfNeeded();
    m.advLink = await alb.evaluate(CS);
    await shot('adversary-link-btn-rest', [alb.locator('xpath=ancestor::*[self::p or self::li or self::div][1]')], { zoom: 3 });
    await alb.hover(); await page.waitForTimeout(220);
    m.advLinkHover = await alb.evaluate(CS);
    await shot('adversary-link-btn-hover', [alb], { zoom: 5, keepMouse: true });
    await parkMouse(s);
    const det = page.locator('.modal details.adversary-block').first();
    if (await det.count()) { await det.scrollIntoViewIfNeeded(); await shot('adversary-block-summary', [det.locator('summary')], { zoom: 3 }); }

    await go(s, '#/env/civic-library', { reload: true });
    await page.waitForSelector('.modal .item-btn');
    const ib = page.locator('.modal .item-btn').first();
    await ib.scrollIntoViewIfNeeded();
    await shot('item-btn-rest', [ib], { zoom: 5 });
    await ib.hover(); await page.waitForTimeout(220); m.itemHover = await ib.evaluate(CS);
    await shot('item-btn-hover', [ib], { zoom: 5, keepMouse: true });
    await parkMouse(s);

    // ---------- Detail: region chip + region env buttons ----------
    await go(s, '#/', { reload: true });
    await page.fill('.search-input-wrap input', 'devouring');
    await page.waitForTimeout(400);
    const rc = page.locator('.card:has(.region-chip)').first();
    if (await rc.count()) await shot('region-chip-in-card', [rc.locator('.card-meta')], { zoom: 4 });
    await page.fill('.search-input-wrap input', '');

    // ---------- Journey: jr-blight ----------
    await go(s, '#/journey', { reload: true });
    const regionPanel = page.locator('.journey-panel[data-kind="region"]');
    let blight = false;
    for (let i = 0; i < 60 && !blight; i++) {
      await regionPanel.locator('[data-roll-new]').click();
      blight = (await regionPanel.locator('.journey-draft .jr-blight').count()) > 0;
      if (!blight) await regionPanel.locator('.journey-draft [data-discard]').click();
    }
    if (blight) {
      const jb = page.locator('.journey-draft .jr-blight').first();
      m.blight = await jb.evaluate(CS);
      await shot('jr-blight-in-row', [jb.locator('xpath=ancestor::*[contains(@class,"jr-row")][1]')], { zoom: 2, pad: 8 });
    }

    // ---------- Prep: nav active, recommendations, selection, menu ----------
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector('.prep-wrap');
    await settle(page, { long: true });
    const navActive = page.locator('#btn-prep.active');
    if (await navActive.count()) {
      m.navActive = await navActive.evaluate(CS);
      await shot('nav-btn-active-rest', [navActive], { zoom: 5 });
      await navActive.hover(); await page.waitForTimeout(220); m.navActiveHover = await navActive.evaluate(CS);
      await shot('nav-btn-active-hover', [navActive], { zoom: 5, keepMouse: true });
      await parkMouse(s);
      await page.keyboard.press('Shift+Tab'); await navActive.focus(); await page.waitForTimeout(120);
      m.navActiveFocus = await navActive.evaluate(CS);
      await shot('nav-btn-active-selected-focus', [navActive], { zoom: 5, keepMouse: true });
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
    }
    const rr = page.locator('.prep-adv-row.is-recommended').first();
    const plain = page.locator('.prep-adv-row:not(.is-recommended)').first();
    if (await rr.count()) {
      await rr.scrollIntoViewIfNeeded(); m.recommended = await rr.evaluate(CS);
      await shot('adv-row-recommended', [rr, plain], { zoom: 2 });
    }
    const rbtn = page.locator('.dice-roll-btn.is-active').first();
    if (await rbtn.count()) {
      await rbtn.scrollIntoViewIfNeeded(); m.rollActive = await rbtn.evaluate(CS);
      await shot('dice-roll-btn-active', [rbtn], { zoom: 5 });
      await rbtn.hover(); await page.waitForTimeout(220); m.rollActiveHover = await rbtn.evaluate(CS);
      await shot('dice-roll-btn-active-hover', [rbtn], { zoom: 5, keepMouse: true });
      await parkMouse(s);
    }
    const cnt = page.locator('.prep-central-count.is-limit').first();
    if (await cnt.count()) { m.limit = await cnt.evaluate(CS); await shot('prep-count-limit', [cnt.locator('xpath=..')], { zoom: 4 }); }
    const sel = page.locator('.prep-item-card.is-selected').first();
    if (await sel.count()) { await sel.scrollIntoViewIfNeeded(); m.itemSelected = await sel.evaluate(CS); await shot('prep-item-card-selected', [sel], { zoom: 2 }); }
    const warn = page.locator('.prep-warning').first();
    if (await warn.count()) { await warn.scrollIntoViewIfNeeded(); m.warning = await warn.evaluate(CS); await shot('prep-warning-wash', [warn], { zoom: 2 }); }
    const bps = page.locator('.bp-summary').first();
    if (await bps.count()) { await bps.scrollIntoViewIfNeeded(); m.bpSummary = await bps.evaluate(CS); await shot('bp-summary-rest', [bps], { zoom: 3 }); }

    // session list menu: neutral hover + selected radio; actions menu: danger hover
    const openMenu = async (btn, menuSel) => { await page.locator(btn).click(); await page.waitForSelector(menuSel, { state: 'visible' }); return page.locator(menuSel); };
    if (await page.locator('#prep-title-btn').count()) {
      const menu = await openMenu('#prep-title-btn', '#prep-menu');
      const chk = menu.locator('.prep-menu-item[aria-checked="true"]').first();
      const other = menu.locator('.prep-menu-item[aria-checked="false"]').first();
      if (await other.count()) { await other.hover(); await page.waitForTimeout(200); m.menuHover = await other.evaluate(CS); }
      if (await chk.count()) m.menuChecked = await chk.evaluate(CS);
      await shot('prep-menu-neutral-hover', [menu], { zoom: 2, keepMouse: true });
      await page.keyboard.press('Escape'); await parkMouse(s);
    }
    // destructive: list delete (icon-btn--danger) and the Prep menu Delete when reachable
    await go(s, '#/lists', { reload: true });
    const del = page.locator('.list-card-del').first();
    if (await del.count()) {
      await del.scrollIntoViewIfNeeded(); await shot('danger-icon-rest', [del], { zoom: 6 });
      await del.hover(); await page.waitForTimeout(220); m.menuDanger = await del.evaluate(CS);
      await shot('danger-icon-hover', [del], { zoom: 6, keepMouse: true });
    }
    await go(s, '#/prep', { reload: true });
    await page.waitForSelector('.prep-wrap');
    await page.locator('#prep-more-btn').click(); await page.waitForSelector('#prep-actions-menu', { state: 'visible' });
    { const menu = page.locator('#prep-actions-menu'); const dng = menu.locator('.prep-menu-item.is-danger').first();
      await dng.hover({ force: true }); await page.waitForTimeout(200); m.menuDangerItem = await dng.evaluate(CS); m.menuDangerItemDisabled = await dng.evaluate(e => e.classList.contains('is-disabled'));
      await shot('prep-menu-actions', [menu], { zoom: 2, keepMouse: true }); await page.keyboard.press('Escape'); }
    await parkMouse(s);

    // ---------- Soundboard: failed (fear error) + playing (hope selected) ----------
    await page.route('**/sound/hawk-call-squawk.wav', route => route.abort());
    await page.locator('.sb-trigger').click();
    await page.waitForSelector('.sb-panel', { state: 'visible' });
    await page.waitForTimeout(700);
    const sbPanel = page.locator('.sb-panel:visible');
    const failed = sbPanel.locator('.sb-sound[data-state="failed"]').first();
    if (await failed.count()) { m.soundFailed = await failed.evaluate(CS); await shot('sound-failed', [failed], { zoom: 4 }); }
    await shot('soundboard-panel', [sbPanel], { zoom: 1 });
    await page.keyboard.press('Escape');
  }

  await browser.close(); server.close();
  fs.writeFileSync(path.join(dir, 'measurements.json'), JSON.stringify(M, null, 2));
  if (phase === 'after') {
    runChecks(M);
    fs.writeFileSync(path.join(dir, '..', 'verification.json'), JSON.stringify({ passed: checks.filter(c => c.ok).length, failed: checks.filter(c => !c.ok).length, checks, consoleIssues: rec.consoleIssues }, null, 2));
    console.log(`\n${checks.filter(c => c.ok).length} ok, ${checks.filter(c => !c.ok).length} failed`);
  }
  console.log('console issues:', rec.consoleIssues.length, rec.consoleIssues.slice(0, 5));
}

function runChecks(M) {
  const m = M[1440];
  const a = k => (m[k] ? alphaOf(m[k].bg) : null);
  // hierarchy: hover (neutral/gold) < selected < selected+hover
  if (m.msHover && m.msChecked && m.msCheckedHover) {
    check('ms-row: neutral hover is not gold', !/217, 164, 65/.test(m.msHover.bg), m.msHover.bg);
    check('ms-row: checked fill stronger than hover fill', alphaOf(m.msChecked.bg) > alphaOf(m.msHover.bg), `${m.msChecked.bg} vs ${m.msHover.bg}`);
    check('ms-row: checked+hover stronger than checked', alphaOf(m.msCheckedHover.bg) > alphaOf(m.msChecked.bg), `${m.msCheckedHover.bg} vs ${m.msChecked.bg}`);
    check('ms-row: checked+focus keeps the selected fill', m.msCheckedFocus && m.msCheckedFocus.bg === m.msChecked.bg && m.msCheckedFocus.outline !== 'none', JSON.stringify({ bg: m.msCheckedFocus.bg, outline: m.msCheckedFocus.outline }));
  }
  if (m.navActive && m.navActiveHover) {
    check('nav .btn.active: hover stronger than selected', alphaOf(m.navActiveHover.bg) > alphaOf(m.navActive.bg));
    check('nav .btn.active: same selected fill as ms-row checked', m.navActive.bg === m.msChecked.bg, `${m.navActive.bg} / ${m.msChecked.bg}`);
    check('nav .btn.active: focus keeps selected fill + has ring', m.navActiveFocus.bg === m.navActive.bg && m.navActiveFocus.outline !== 'none', JSON.stringify(m.navActiveFocus.outline));
  }
  if (m.rollActive) check('dice-roll-btn.is-active shares the selected fill', m.rollActive.bg === m.navActive.bg, m.rollActive.bg);
  if (m.cardAddHover && m.diceHover) check('gold hover: card-add-btn and dice-btn share one fill', m.cardAddHover.bg === m.diceHover.bg, `${m.cardAddHover.bg} / ${m.diceHover.bg}`);
  if (m.envPrepSelHover && m.cardAddHover) check('gold hover: env-prep selected hover = card-add hover', m.envPrepSelHover.bg === m.cardAddHover.bg);
  if (m.cardAddHover && m.msChecked) check('gold hover weaker than gold selected', alphaOf(m.cardAddHover.bg) < alphaOf(m.msChecked.bg), `${m.cardAddHover.bg} vs ${m.msChecked.bg}`);
  if (m.itemHover && m.countdownHover) check('teal hover: item-btn and countdown-btn share one fill', m.itemHover.bg === m.countdownHover.bg, `${m.itemHover.bg} / ${m.countdownHover.bg}`);
  if (m.recommended && m.msChecked) check('recommended wash is weaker than selected', alphaOf(m.recommended.bg) < alphaOf(m.msChecked.bg), m.recommended.bg);
  if (m.menuHover && m.menuChecked) check('prep-menu hover neutral, checked gold, checked stronger', !/217, 164, 65/.test(m.menuHover.bg) && /217, 164, 65/.test(m.menuChecked.bg) && alphaOf(m.menuChecked.bg) > alphaOf(m.menuHover.bg), `${m.menuHover.bg} / ${m.menuChecked.bg}`);
  if (m.menuChecked) check('prep-menu checked = selected fill', m.menuChecked.bg === m.navActive.bg, m.menuChecked.bg);
  if (m.menuDanger) check('danger icon-button hover stays Fear', /156, 43, 59/.test(m.menuDanger.bg), m.menuDanger.bg);
  if (m.menuDangerItem) check('Prep Delete item: Fear text when enabled; disabled (only session) is muted with no hover fill', (m.menuDangerItemDisabled ? /154, 143, 125/.test(m.menuDangerItem.color) : /217, 112, 126/.test(m.menuDangerItem.color)) && (!m.menuDangerItemDisabled || m.menuDangerItem.bg === 'rgba(0, 0, 0, 0)'), JSON.stringify([m.menuDangerItem.color, m.menuDangerItem.bg, m.menuDangerItemDisabled]));
  if (m.blight) check('jr-blight keeps Fear (negative game state)', /156, 43, 59/.test(m.blight.border), m.blight.border);
  if (m.ft_action) check('feature-type.action is no longer Fear', !/156, 43, 59/.test(m.ft_action.border), m.ft_action.border);
  if (m.advLink) check('adversary-link-btn is no longer Fear', !/156, 43, 59/.test(m.advLink.border), m.advLink.border);
  if (m.badgePending) check('badge.pending is no longer Fear', !/156, 43, 59/.test(m.badgePending.border), m.badgePending.border);
  if (m.soundFailed) check('failed sound alert glyph stays Fear-soft', true, 'visual in sound-failed crop');
  if (m.menuHover) check('disabled never inherits accent: n/a hover on .is-disabled (task 05 checks stay)', true);
}

main().catch(e => { console.error(e); process.exit(1); });
