#!/usr/bin/env node
// Stage 4 task 06 — breakpoint boundary sweep. Measures (no screenshots) the
// layout state N-1 / N / N+1 around every width/height breakpoint the stylesheet owns.
//   node scripts/design-audit/stage4-breakpoints.mjs --label=before|after [--out=<dir>]
import fs from 'node:fs';
import path from 'node:path';
import { startServer, ROOT } from './lib.mjs';
import { Recorder, launch, openSession, go, settle } from './harness.mjs';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const label = arg('label') || 'after';
const OUT = path.resolve(ROOT, arg('out') || 'docs/design-audit/stage-4/task-06-breakpoints');
fs.mkdirSync(OUT, { recursive: true });

const triple = n => [n - 1, n, n + 1];
const WIDTHS = [400, 480, 640, 760, 900, 1091, 1199, 1439, 1479, 1535, 1799, 1835, 2191, 2547].flatMap(triple)
  .concat([1280, 1366, 1440, 1600, 1920, 2560]).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
// 641 is the legacy off-by-one; sweep it explicitly (640/641/642 already covered by 640 +- 1).
const HEIGHTS_AT_WIDE = [[1800, 899], [1800, 900], [1799, 900], [1920, 800], [1920, 899], [1920, 900], [1920, 1080]];

const rec = new Recorder(OUT);
const { server, url } = await startServer();
const browser = await launch();
const s = await openSession(browser, url, { width: 1366, height: 900 }, 'full', rec);
const { page } = s;
const out = { catalog: {}, prep: {}, density: {} };

const catalogProbe = () => {
  const q = sel => document.querySelector(sel);
  const cs = (sel, pseudo) => { const e = q(sel); return e ? getComputedStyle(e, pseudo) : null; };
  const w = sel => { const e = q(sel); return e ? +e.getBoundingClientRect().width.toFixed(1) : null; };
  const grid = cs('.grid');
  return {
    viewport: innerWidth,
    shell: w('.shell'), header: w('.header-inner'), headerH: w('header') && +q('header').getBoundingClientRect().height.toFixed(1),
    gridCols: grid ? grid.gridTemplateColumns.split(' ').length : null, gridW: w('.grid'),
    gridMax: grid && grid.maxWidth,
    artOpacity: cs('body', '::before').opacity, artSize: cs('body', '::before').backgroundSize,
    subtitle: cs('.brand-subtitle') && cs('.brand-subtitle').display,
    brandTitle: cs('.brand-title-text') && cs('.brand-title-text').display,
    filterToggle: cs('.filter-toggle') && cs('.filter-toggle').display,
    filtersInline: cs('.toolbar-filters') && cs('.toolbar-filters').display,
    barCols: cs('.catalog-bar') && cs('.catalog-bar').gridTemplateColumns.split(' ').length,
    toolbarWrap: cs('.toolbar') && cs('.toolbar').flexWrap,
    cardTitleSize: cs('.card-title') && cs('.card-title').fontSize,
    envArtRoom: matchMedia('(min-width: 641px)').matches, envArtRoom640: matchMedia('(min-width: 640px)').matches,
    docOverflow: document.documentElement.scrollWidth - innerWidth,
  };
};
const prepProbe = () => {
  const q = sel => document.querySelector(sel);
  const cs = (sel, pseudo) => { const e = q(sel); return e ? getComputedStyle(e, pseudo) : null; };
  const w = sel => { const e = q(sel); return e ? +e.getBoundingClientRect().width.toFixed(1) : null; };
  const main = cs('.prep-main');
  const over = [...document.querySelectorAll('.prep-env-toolbar, .prep-adv-toolbar, .item-toolbar, .prep-central-head')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.className.split(' ')[0]);
  const rows = sel => { const e = q(sel); return e ? Math.round(e.getBoundingClientRect().height) : null; };
  return {
    viewport: innerWidth, vh: innerHeight,
    shell: w('.shell'), shellMax: cs('.shell').maxWidth, header: w('.header-inner'),
    cols: main.gridTemplateColumns.split(' ').length, colW: main.gridTemplateColumns,
    left: w('.prep-col-env'), center: w('.prep-central'), right: w('.prep-col-adv'),
    bodyOverflow: cs('body').overflow + '/' + cs('body').height,
    envCounter: cs('.prep-env-toolbar .prep-count') && cs('.prep-env-toolbar .prep-count').display,
    advPanel: cs('.prep-adv-toolbar .ms-panel') && (cs('.prep-adv-toolbar .ms-panel').left + '|' + cs('.prep-adv-toolbar .ms-panel').right),
    advToolbarH: rows('.prep-adv-toolbar'), envToolbarH: rows('.prep-env-toolbar'), itemToolbarH: rows('.item-toolbar'),
    pcHeadH: cs('.prep-central').getPropertyValue('--pc-head-h').trim(), pcPadY: cs('.prep-central').getPropertyValue('--pc-pad-y').trim(),
    barDisplay: cs('.prep-bar').display, barH: rows('.prep-bar'),
    notesDisplay: cs('.prep-notes') && cs('.prep-notes').display,
    toolbarOverflow: over.join(',') || '-', docOverflow: document.documentElement.scrollWidth - innerWidth,
  };
};

await go(s, '#/catalog', { reload: true });
for (const width of WIDTHS) {
  await page.setViewportSize({ width, height: 900 });
  await settle(page);
  out.catalog[width] = await page.evaluate(catalogProbe);
}
await go(s, '#/prep', { reload: true });
await page.waitForSelector('.prep-wrap');
for (const width of WIDTHS) {
  await page.setViewportSize({ width, height: 900 });
  await settle(page);
  out.prep[width] = await page.evaluate(prepProbe);
}
for (const [width, height] of HEIGHTS_AT_WIDE) {
  await page.setViewportSize({ width, height });
  await settle(page);
  out.density[`${width}x${height}`] = await page.evaluate(prepProbe);
}
await s.context.close(); await browser.close(); server.close();
fs.writeFileSync(path.join(OUT, `boundaries__${label}.json`), JSON.stringify(out, null, 2));
const pick = (o, ks) => ks.map(k => o[k]).join('  ');
console.log('CATALOG vw | shell gridCols gridMax artOp subtitle filterToggle barCols headerH');
for (const [k, v] of Object.entries(out.catalog)) console.log(k.padStart(5), pick(v, ['shell', 'gridCols', 'gridMax', 'artOpacity', 'subtitle', 'filterToggle', 'barCols', 'headerH', 'envArtRoom']));
console.log('PREP vw | shell cols L/C/R envCounter advPanel pcHeadH bar toolbarOverflow');
for (const [k, v] of Object.entries(out.prep)) console.log(k.padStart(5), v.shell, v.cols, `${v.left}/${v.center}/${v.right}`, v.envCounter, v.advPanel, v.pcHeadH, v.barH, v.toolbarOverflow, v.docOverflow);
console.log('DENSITY');
for (const [k, v] of Object.entries(out.density)) console.log(k, v.pcHeadH, v.pcPadY, v.center);
