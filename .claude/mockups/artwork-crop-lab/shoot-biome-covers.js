#!/usr/bin/env node
/* Lab-only. Screenshots the K section of the lab with Playwright (system Chrome) into the evidence pack.
 *   node shoot-biome-covers.js <outDir> [dpr=2] [width=1440] [only]
 * Needs the lab served from the repo root: python3 -m http.server 8107 */
'use strict';
const path = require('path');
const { chromium } = require(path.join(__dirname, '../../../node_modules/playwright'));
const [out, dprArg, wArg, only] = process.argv.slice(2);
const dpr = +(dprArg || 2), width = +(wArg || 1440);
const URL = 'http://localhost:8107/.claude/mockups/artwork-crop-lab/artwork-crop-lab.html';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: dpr });
  await page.goto(URL);
  await page.waitForFunction(() => window.__biomeCoverLab && window.__biomeCoverLab.ready);
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const c = document.getElementById('controls'); if (c) c.style.position = 'static'; });   // sticky bar would sit on top of element shots
  await page.evaluate(() => Promise.all([...document.querySelectorAll('#sec-biome-covers img')].map(i => i.decode().catch(() => {}))));
  await page.waitForTimeout(500);
  const suffix = `-w${width}-dpr${dpr}`;
  const checks = await page.evaluate(() => {
    const sec = document.getElementById('sec-biome-covers');
    const imgs = [...sec.querySelectorAll('img')];
    return {
      images: imgs.length,
      broken: imgs.filter(i => !i.naturalWidth).map(i => i.getAttribute('src')),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      holes: sec.querySelectorAll('.lab-k-hole').length,
      dpr: window.devicePixelRatio,
    };
  });
  console.log(JSON.stringify({ width, dpr, ...checks }));
  async function shot(sel, name, maxW) {
    const box = await page.locator(sel).boundingBox();
    await page.screenshot({ path: path.join(out, name + suffix + '.png'), fullPage: true, clip: { x: box.x, y: box.y + await page.evaluate(() => window.scrollY), width: Math.min(box.width, maxW), height: box.height } });
  }
  const shots = {
    '01-inventory': ['#k-inv', 1500],
    '02-single-forest': ['#k-single', 1500],
    '03-pair-forest-mountain': ['#k-pair', 1500],
    '04-trio-aquatic-frozen-badlands': ['#k-trio', 1500],
    '05-mixed-sources': ['#k-mixed', 1500],
    '07-matrix': ['#k-matrix', 1500],
    '08-mixed-collections': ['#k-lists', 760],
    '09-hybrid-all-biomes': ['#k-hybrid', 1500],
  };
  for (const [name, [sel, maxW]] of Object.entries(shots)) {
    if (only && !name.includes(only)) continue;
    await shot(sel, name, maxW);
  }
  if (!only || only.includes('gallery')) {
    const ids = await page.$$eval('#k-gallery .lab-k-biome', els => els.map(e => e.id));
    for (const id of ids) await shot('#' + id, `06-gallery-${id.replace('kg-', '')}`, 830);
  }
  await browser.close();
})();
