#!/usr/bin/env node
// Stage 4 task 02 — semantic icon-button families.
//   node scripts/design-audit/stage4-icon-buttons.mjs --label=before|after   capture crops (+ regression shots on "after")
//   node scripts/design-audit/stage4-icon-buttons.mjs --compose              build the family and BEFORE/AFTER sheets
// Reuses the Stage 2 capture routines (iconFamilies / storageNotice), so BEFORE and
// AFTER are produced by the identical code path.
import fs from 'node:fs';
import path from 'node:path';
import { startServer, ROOT } from './lib.mjs';
import { Recorder, launch, openSession, go, settle, full, sheet } from './harness.mjs';
import { iconFamilies, storageNotice } from './sections-icons.mjs';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const OUT = path.resolve(ROOT, arg('out') || 'docs/design-audit/stage-4/task-02-icon-buttons');
const VP = { width: 1440, height: 900 };
const crops = (label, fam, st) => `${label}/crops/1440x900__${'PAGE'}__icon-${fam}-${st}__crop.png`;

async function capture(label) {
  const dir = path.join(OUT, label);
  fs.mkdirSync(dir, { recursive: true });
  const rec = new Recorder(dir);
  const { server, url } = await startServer();
  const browser = await launch();

  const s = await openSession(browser, url, VP, 'full', rec);
  await iconFamilies(s);
  const measures = rec.measurements;
  await s.context.close();

  const n = await openSession(browser, url, VP, 'notice', rec);
  await storageNotice(n);
  await n.context.close();

  if (label === 'after') {
    // Full-context regression shots: Catalog, Lists, Prep, Journey, modal, soundboard open.
    const r = await openSession(browser, url, VP, 'full', rec);
    const shot = async (page, state, hash, prep) => {
      await go(r, hash, { reload: true });
      if (prep) await prep(r.page);
      await full(r, { page, state, components: [state], purpose: `Stage 4 task 02 regression: ${state}`, dir: 'regression' });
    };
    await shot('catalog', 'catalog', '#/');
    await shot('lists', 'lists', '#/lists');
    await shot('prep', 'prep', '#/prep', p => p.waitForSelector('.prep-wrap'));
    await shot('journey', 'journey', '#/journey', async p => {
      const panel = p.locator('.journey-panel[data-kind="region"]');
      await panel.locator('[data-roll-new]').click();
      await panel.locator('.journey-draft [data-save]').click();
    });
    await shot('detail', 'environment-modal', '#/env/harsh-desert', p => p.waitForSelector('.modal .modal-close'));
    await shot('prep', 'soundboard-open', '#/prep', async p => { await p.waitForSelector('.prep-wrap'); await p.locator('.sb-trigger').click(); await p.waitForSelector('.sb-panel', { state: 'visible' }); });
    await r.context.close();
    for (const [w, h] of [[1366, 768], [1920, 1080]]) {
      const q = await openSession(browser, url, { width: w, height: h }, 'full', rec);
      await go(q, '#/prep', { reload: true });
      await q.page.waitForSelector('.prep-wrap');
      await settle(q.page, { long: true });
      await full(q, { page: 'prep', state: 'regression', components: ['Prep'], purpose: 'Stage 4 task 02: Prep layout still intact', dir: 'regression' });
      await q.context.close();
    }
  }
  fs.writeFileSync(path.join(dir, 'measurements.json'), JSON.stringify({ measures, issues: rec.consoleIssues, failures: rec.failures }, null, 2));
  await browser.close(); server.close();
  console.log(label, 'failures:', rec.failures.length, 'console issues:', rec.consoleIssues.length);
  rec.failures.forEach(f => console.log(' !', f.label, f.error));
}

// [family key in file names, page segment, caption, subtype]
const GROUPS = {
  dismiss: [['modal-close', 'ui', 'modal-close'], ['adv-art-close', 'prep', 'adv-art-close'], ['bp-pop-close', 'prep', 'bp-pop-close'], ['storage-notice-close', 'lists', 'storage-notice-close'], ['countdown-overlay-close', 'ui', 'countdown-overlay-close']],
  clear: [['search-clear-btn', 'ui', 'search-clear-btn  [clear]'], ['search-clear-btn-prep', 'prep', 'prep search-clear  [clear]'], ['item-clear-btn', 'prep', 'item-clear-btn  [clear]'], ['prep-sel-remove', 'prep', 'prep-sel-remove  [remove]'], ['prep-central-clear', 'prep', 'prep-central-clear  [delete, bulk]'], ['list-card-del', 'lists', 'list-card-del  [delete]']],
  utility: [['jr-icon-btn', 'journey', 'jr-icon-btn'], ['loot-name-act', 'detail', 'loot-name-act'], ['adv-art-copy', 'prep', 'adv-art-copy'], ['prep-icon-btn', 'prep', 'prep-icon-btn'], ['bp-step', 'prep', 'bp-step'], ['sb-ctl-settings', 'ui', 'sb-ctl (enclosed)']],
  circle: [['countdown-overlay-btn', 'ui', 'countdown-overlay-btn'], ['prep-item-nav-btn', 'prep', 'prep-item-nav-btn']],
};
const STATES = ['default', 'hover', 'focus-visible'];
// Some controls were captured under a different page segment than their family; resolve by scanning.
function findCrop(label, fam, st) {
  const d = path.join(OUT, label, 'crops');
  const hit = fs.readdirSync(d).find(f => f.startsWith('1440x900__') && f.endsWith(`__icon-${fam}-${st}__crop.png`));
  return hit ? `${label}/crops/${hit}` : null;
}

async function compose() {
  const rec = new Recorder(OUT);
  const s = { outDir: OUT, vp: VP, rec };
  fs.mkdirSync(path.join(OUT, 'sheets'), { recursive: true });
  const build = async (name, label, group, cols = 3) => {
    const items = [];
    for (const [fam, , cap] of group) for (const st of STATES) {
      const f = findCrop(label, fam, st);
      if (f) items.push({ file: f, label: `${cap} · ${st}` });
    }
    await sheet(s, { page: 'sheet', state: name, items, cols, cell: { w: 260, h: 150 }, name: `sheets__${label}__${name}.png` });
  };
  for (const label of ['before', 'after']) for (const g of Object.keys(GROUPS)) await build(g, label, GROUPS[g]);
  // BEFORE/AFTER side by side: one row per control — [before default, hover, focus | after default, hover, focus].
  for (const g of Object.keys(GROUPS)) {
    const items = [];
    for (const [fam, , cap] of GROUPS[g]) for (const label of ['before', 'after']) for (const st of STATES) {
      const f = findCrop(label, fam, st);
      if (f) items.push({ file: f, label: `${label.toUpperCase()} ${cap} · ${st}` });
    }
    await sheet(s, { page: 'sheet', state: `compare-${g}`, items, cols: 6, cell: { w: 190, h: 130 }, name: `sheets__before-after__${g}.png` });
  }
  // sheet() wrote into <OUT>/crops; move into sheets/.
  const cdir = path.join(OUT, 'crops');
  if (fs.existsSync(cdir)) {
    for (const f of fs.readdirSync(cdir)) fs.renameSync(path.join(cdir, f), path.join(OUT, 'sheets', f.replace(/^sheets__/, '')));
    fs.rmdirSync(cdir);
  }
}

if (process.argv.includes('--compose')) await compose();
else await capture(arg('label') || 'after');
