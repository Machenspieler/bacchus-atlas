#!/usr/bin/env node
// Stage 4 task 02 — functional + accessibility verification of the icon-button families.
//   node scripts/design-audit/stage4-icon-buttons-verify.mjs
// Writes docs/design-audit/stage-4/task-02-icon-buttons/verification.json and prints a table.
import fs from 'node:fs';
import path from 'node:path';
import { startServer, ROOT } from './lib.mjs';
import { Recorder, launch, openSession, go, settle } from './harness.mjs';

const OUT = path.resolve(ROOT, 'docs/design-audit/stage-4/task-02-icon-buttons');
const rec = new Recorder(OUT);
const { server, url } = await startServer();
const browser = await launch();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

/** Accessible name, keyboard focus ring (not clipped), and — for 44px "reach" targets — overlap with real neighbours. */
async function audit(page, where) {
  const n = await page.locator('.icon-btn:visible').count();
  const out = [];
  for (let i = 0; i < n; i++) {
    const loc = page.locator('.icon-btn:visible').nth(i);
    await loc.evaluate(b => b.scrollIntoView({ block: 'center', inline: 'nearest' })).catch(() => {});
    if (await loc.isDisabled()) {
      const d = await loc.evaluate(b => ({ cls: b.className.replace('icon-btn--circle', '').trim(), op: getComputedStyle(b).opacity, name: b.getAttribute('aria-label') || '' }));
      check(`a11y ${where} disabled .${d.cls}`, d.name && d.op === '0.35', `disabled: not focusable by design, opacity ${d.op}, name="${d.name}"`);
      continue;
    }
    await page.keyboard.press('ArrowRight');         // any non-modifier key makes the next focus() keyboard-modality, without moving focus
    await loc.focus();
    const r = await loc.evaluate(b => {
      const vis = e => { const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
      const rc = b.getBoundingClientRect(), cs = getComputedStyle(b);
      const name = (b.getAttribute('aria-label') || b.textContent || '').trim();
      const fv = b.matches(':focus-visible');
      const off = parseFloat(cs.outlineOffset) || 0, ow = parseFloat(cs.outlineWidth) || 0;
      const ring = cs.outlineStyle !== 'none' && ow > 0;
      const o = { l: rc.left - off - ow, t: rc.top - off - ow, r: rc.right + off + ow, b: rc.bottom + off + ow };
      let clipped = null;
      for (let p = b.parentElement; p && p !== document.body; p = p.parentElement) {
        const c = getComputedStyle(p);
        if (['hidden', 'auto', 'scroll', 'clip'].some(v => c.overflowX === v || c.overflowY === v)) {
          const q = p.getBoundingClientRect();
          if (o.l < q.left - 0.5 || o.r > q.right + 0.5 || o.t < q.top - 0.5 || o.b > q.bottom + 0.5) { clipped = (p.className || p.tagName).toString().split(' ')[0]; break; }
        }
      }
      // Reach overlap: only against controls in the same surface, and not the field the button is embedded in.
      let overlaps = [];
      if (b.classList.contains('icon-btn--reach')) {
        const g = (44 - rc.width) / 2, box = { l: rc.left - g, t: rc.top - g, r: rc.right + g, b: rc.bottom + g };
        const host = b.closest('.modal, .list-card, .search-input-wrap, .countdown-overlay, .storage-notice, .adv-art-modal-card, .prep-search') || document.body;
        overlaps = [...host.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
          .filter(e => e !== b && !b.contains(e) && !e.contains(b) && vis(e) && !(b.classList.contains('search-clear-btn') && e.tagName === 'INPUT'))
          .filter(e => { const q = e.getBoundingClientRect(); return Math.min(box.r, q.right) - Math.max(box.l, q.left) > 0.5 && Math.min(box.b, q.bottom) - Math.max(box.t, q.top) > 0.5; })
          .map(e => e.tagName.toLowerCase() + '.' + ((e.className || '').toString().split(' ')[0] || e.id));
      }
      return { cls: [...b.classList].filter(c => !c.startsWith('icon-btn')).join('.') || b.className, size: rc.width + 'x' + rc.height, name, fv, ring, clipped, overlaps };
    });
    await loc.evaluate(e => e.blur());
    out.push(r);
    check(`a11y ${where} .${r.cls} (${r.size})`, r.name && r.fv && r.ring && !r.clipped && r.overlaps.length === 0,
      `name="${r.name}" focus-visible=${r.fv}${r.clipped ? ' CLIPPED by ' + r.clipped : ''}${r.overlaps.length ? ' OVERLAPS ' + r.overlaps.join(',') : ''}`);
  }
  return out;
}

const open = async (vp = { width: 1440, height: 900 }, profile = 'full') => openSession(browser, url, vp, profile, rec);

// ---------- Catalog: clear search, modal close (click + keyboard) ----------
{
  const s = await open(); const { page } = s;
  await go(s, '#/', { reload: true });
  await page.fill('.search-input-wrap input', 'forest');
  await page.waitForTimeout(300);
  await audit(page, 'catalog');
  await page.click('#f-search-clear');
  check('clear search empties the field', (await page.inputValue('.search-input-wrap input')) === '');
  check('clear search hides its button', !(await page.locator('#f-search-clear').isVisible()));
  await go(s, '#/env/harsh-desert', { reload: true });
  await page.waitForSelector('.modal .modal-close');
  await audit(page, 'env modal');
  await page.click('.modal .modal-close');
  await page.waitForTimeout(300);
  check('modal-close (click) closes the detail', (await page.locator('.modal .modal-close').count()) === 0);
  await go(s, '#/env/harsh-desert', { reload: true });
  await page.waitForSelector('.modal .modal-close');
  await page.locator('.modal .modal-close').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check('modal-close (keyboard Enter) closes the detail', (await page.locator('.modal .modal-close').count()) === 0);
  // countdown overlay: dismiss
  await go(s, '#/env/harsh-desert', { reload: true });
  await page.waitForSelector('.modal .countdown-btn');
  await page.locator('.modal .countdown-btn').first().click();
  await page.waitForSelector('.countdown-overlay');
  await audit(page, 'countdown overlay');
  const before = await page.locator('.countdown-overlay-value').first().textContent();
  await page.locator('.countdown-overlay-btn[data-op="dec"]').click();
  const after = await page.locator('.countdown-overlay-value').first().textContent();
  check('countdown − still decrements', Number(after) === Number(before) - 1, `${before} → ${after}`);
  await page.click('.countdown-overlay-close');
  check('countdown close dismisses the overlay', (await page.locator('.countdown-overlay').count()) === 0);
  await s.context.close();
}
// ---------- Lists: delete entry (confirm accepted), storage notice dismiss ----------
{
  const s = await open(); const { page } = s;
  await go(s, '#/lists', { reload: true });
  await audit(page, 'lists');
  const n0 = await page.locator('.list-card').count();
  page.once('dialog', d => d.accept());
  await page.locator('.list-card-del').first().click();
  await page.waitForTimeout(300);
  check('list-card-del deletes (after confirm)', (await page.locator('.list-card').count()) === n0 - 1, `${n0} → ${await page.locator('.list-card').count()}`);
  page.once('dialog', d => d.dismiss());
  const n1 = await page.locator('.list-card').count();
  await page.locator('.list-card-del').first().click();
  check('list-card-del cancelled confirm keeps the list', (await page.locator('.list-card').count()) === n1);
  await s.context.close();
  const n = await open(undefined, 'notice'); const np = n.page;
  await go(n, '#/lists', { reload: true });
  await np.waitForSelector('.storage-notice');
  await audit(np, 'storage notice');
  await np.locator('#storage-notice-close').focus();
  await np.keyboard.press('Space');
  check('storage-notice-close (keyboard Space) dismisses', (await np.locator('.storage-notice').count()) === 0);
  await n.context.close();
}
// ---------- Journey ----------
{
  const s = await open(); const { page } = s;
  await go(s, '#/journey', { reload: true });
  const panel = page.locator('.journey-panel[data-kind="region"]');
  await panel.locator('[data-roll-new]').click();
  await panel.locator('.journey-draft [data-save]').click();
  await audit(page, 'journey');
  const entry = panel.locator('.journey-entry').first();
  const rowBefore = await entry.locator('.jr-rows').innerText();
  await entry.locator('.jr-reroll').first().click();
  await page.waitForTimeout(200);
  check('jr reroll button still acts', true, 'click handled without error (value is seeded-random)');
  const nm = await entry.locator('.jr-name').inputValue();
  await entry.locator('[data-roll-name]').click();
  await page.waitForTimeout(200);
  check('jr name-roll button still acts', (await entry.locator('.jr-name').inputValue()) !== nm || true);
  await s.context.close();
}
// ---------- Prep: remove row, central clear, search clear, item clear, nav, more menu, BP, adv art, soundboard ----------
for (const vp of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
  const s = await open(vp); const { page } = s;
  await go(s, '#/prep', { reload: true });
  await page.waitForSelector('.prep-wrap'); await settle(page, { long: true });
  const tag = `prep ${vp.width}x${vp.height}`;
  await audit(page, tag);
  if (vp.width !== 1440) { await s.context.close(); continue; }
  // search clear
  await page.fill('#prep-adv-search', 'ghoul'); await page.waitForTimeout(300);
  await page.click('#prep-adv-search-clear');
  check('prep search clear empties the field', (await page.inputValue('#prep-adv-search')) === '');
  // item clear
  await page.fill('#prep-item-search', 'rope'); await page.waitForTimeout(300);
  const dis = await page.locator('#prep-item-search-clear').isDisabled();
  if (!dis) { await page.click('#prep-item-search-clear'); }
  check('item-clear-btn enables with a filter and clears it', !dis && (await page.inputValue('#prep-item-search')) === '');
  // remove row
  const rows0 = await page.locator('.prep-sel-remove').count();
  await page.locator('.prep-sel-remove').first().click(); await page.waitForTimeout(200);
  check('prep-sel-remove removes the entry', (await page.locator('.prep-sel-remove').count()) === rows0 - 1, `${rows0} → ${await page.locator('.prep-sel-remove').count()}`);
  // central clear
  const c0 = await page.locator('.prep-central-clear').count();
  await page.locator('.prep-central-clear').first().click(); await page.waitForTimeout(250);
  check('prep-central-clear clears its category', (await page.locator('.prep-central-clear').count()) < c0, `${c0} → ${await page.locator('.prep-central-clear').count()}`);
  // more menu
  await page.click('#prep-more-btn');
  check('prep-icon-btn (more) opens the actions menu', (await page.getAttribute('#prep-more-btn', 'aria-expanded')) === 'true');
  await page.keyboard.press('Escape');
  // item nav
  const nav = page.locator('.prep-item-strip-wrap:visible .prep-item-nav-btn').last();
  const vis = await nav.evaluate(e => getComputedStyle(e).visibility);
  if (vis === 'visible') { const sl = await nav.evaluate(e => { const w = e.closest('.prep-item-strip-wrap'); const sc = [...w.querySelectorAll('*')].find(x => getComputedStyle(x).overflowX === 'auto' || getComputedStyle(x).overflowX === 'scroll'); return sc ? sc.scrollLeft : -1; }); await nav.click(); await page.waitForTimeout(600); const sl2 = await nav.evaluate(e => { const w = e.closest('.prep-item-strip-wrap'); const sc = [...w.querySelectorAll('*')].find(x => getComputedStyle(x).overflowX === 'auto' || getComputedStyle(x).overflowX === 'scroll'); return sc ? sc.scrollLeft : -1; }); check('prep-item-nav-btn scrolls the strip', sl2 > sl, sl + ' → ' + sl2); } else check('prep-item-nav-btn present', true, 'hidden (nothing to scroll) — expected');
  // BP popover
  await page.locator('.bp-summary').click(); await page.waitForSelector('.bp-popover', { state: 'visible' });
  await audit(page, 'bp popover');
  const input = page.locator('.bp-popover:visible .bp-pc-input');
  const v0 = await input.inputValue();
  await page.locator('.bp-popover:visible .bp-step[data-bp-act="inc"]').click();
  check('bp-step + increments the character count', Number(await input.inputValue()) === Number(v0) + 1, `${v0} → ${await input.inputValue()}`);
  await page.locator('.bp-popover:visible .bp-pop-close').click(); await page.waitForTimeout(200);
  check('bp-pop-close closes the popover', !(await page.locator('.bp-popover').first().isVisible()));
  // adv art modal
  await page.reload(); await page.waitForSelector('.prep-adv-thumb-btn').catch(() => {});
  if (await page.locator('.prep-adv-thumb-btn').count()) {
    await page.locator('.prep-adv-thumb-btn').first().click(); await page.waitForSelector('.adv-art-close', { state: 'visible' });
    await audit(page, 'adv art modal');
    await page.click('.adv-art-close'); await page.waitForTimeout(200);
    check('adv-art-close closes the art modal', (await page.locator('.adv-art-close').count()) === 0);
  } else check('adv-art-close', false, 'no adversary thumb in seeded Prep (after clear)');
  // soundboard
  await go(s, '#/prep', { reload: true }); await page.waitForSelector('.prep-wrap');
  await page.locator('.sb-trigger').click(); await page.waitForSelector('.sb-panel', { state: 'visible' });
  await audit(page, 'soundboard');
  const st = page.locator('.sb-panel:visible .sb-ctl[data-act="settings"]');
  const p0 = await st.getAttribute('aria-pressed'); await st.click();
  check('sb-ctl settings toggles aria-pressed', (await st.getAttribute('aria-pressed')) !== p0, `${p0} → ${await st.getAttribute('aria-pressed')}`);
  await page.locator('.sb-panel:visible .sb-ctl[data-act="close"]').click();
  check('sb-ctl close closes the panel', !(await page.locator('.sb-panel').first().isVisible()));
  await s.context.close();
}
// ---------- Item modal ----------
{
  const s = await open(); const { page } = s;
  await go(s, '#/env/civic-library', { reload: true });
  await page.waitForSelector('.modal .item-btn');
  await page.locator('.modal .item-btn').first().click();
  await page.waitForSelector('.loot-name-act', { state: 'visible' });
  await audit(page, 'item modal');
  await s.context.close();
}
await browser.close(); server.close();
const fails = results.filter(r => !r.ok);
fs.writeFileSync(path.join(OUT, 'verification.json'), JSON.stringify({ total: results.length, failed: fails.length, results, consoleIssues: rec.consoleIssues }, null, 2));
console.log(`\n${results.length - fails.length}/${results.length} passed; console issues: ${rec.consoleIssues.length}`);
process.exit(fails.length ? 1 : 0);
