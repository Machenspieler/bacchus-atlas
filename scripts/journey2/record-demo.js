#!/usr/bin/env node
/* Dev-only. Records a short real-pointer demonstration of the Journey 2 editor (generate 20 forest -> drag one
   hex twice -> drag All 18 with its preview -> move a tile -> Undo twice) as a WebM with a visible cursor dot,
   in a fresh isolated Playwright context. Usage: node scripts/journey2/record-demo.js [--out <dir>] */
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const Geo = require('../../js/journey2-geometry.js');
const Model = require('../../js/journey2-model.js');
const { serve } = require('./lib/static-server.js');

const ROOT = path.join(__dirname, '..', '..');
const oi = process.argv.indexOf('--out');
const OUT = oi > -1 ? path.resolve(process.argv[oi + 1]) : path.join(ROOT, 'docs', 'journey2-implementation', 'stage-1', 'media');
fs.mkdirSync(OUT, { recursive: true });
const template = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'map-template.json'), 'utf8'));
const anchors = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'map-anchors.json'), 'utf8'));
const ctx0 = Model.createContext(template, anchors), grid = ctx0.grid;
const cell = (x, y) => { const c = grid.worldToCell(x, y); return Geo.cellId(c.q, c.r); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const s = await serve(ROOT, {});
  const browser = await chromium.launch();
  const tmp = fs.mkdtempSync(path.join(OUT, 'rec-'));
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'en-US', recordVideo: { dir: tmp, size: { width: 1366, height: 768 } } });
  await context.addInitScript(() => {
    try { if (!sessionStorage.getItem('i')) { sessionStorage.setItem('i', '1'); localStorage.setItem('dhcodex_lang', '"en"'); } } catch (e) { /* ignore */ }
    window.addEventListener('DOMContentLoaded', () => {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;z-index:99999;width:16px;height:16px;border-radius:50%;background:rgba(217,164,65,.55);border:2px solid #fff;pointer-events:none;left:-40px;top:-40px;transform:translate(-50%,-50%)';
      document.body.appendChild(d);
      window.addEventListener('pointermove', e => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; }, true);
    });
  });
  const page = await context.newPage();
  await page.goto(s.base + '#/journey2');
  await page.waitForSelector('.j2-viewport'); await page.waitForFunction(() => Journey2View.debugState() && Journey2View.debugState().anchors > 0);
  await sleep(500);
  const seam = template.composition.seam.worldX;
  await page.evaluate(([x, y]) => { const r = document.querySelector('.j2-viewport').getBoundingClientRect(); Journey2View.debugApi().setCamera({ scale: 0.41, tx: r.width / 2 - x * 0.41, ty: r.height / 2 - y * 0.41 }); }, [seam, 800]);
  await page.selectOption('[data-j2-habitat]', 'forest'); await page.click('[data-j2-terrain-btn="2"]'); await page.fill('[data-j2-qty]', '20'); await page.waitForTimeout(500);
  await page.click('[data-j2-generate]'); await page.waitForSelector('.j2-card'); await sleep(600);
  const bid = (await page.evaluate(() => Journey2View.debugState().batches[0].id));
  const handle = async m => { const b = await page.locator(`.j2-card[data-batch="${bid}"] [data-j2-handle="${m}"]`).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const at = c => page.evaluate(id => Journey2View.debugApi().cellToClient(id), c);
  async function drag(mode, target, hold) {
    const h = await handle(mode), t = await at(target);
    await page.mouse.move(h.x, h.y, { steps: 6 }); await sleep(250); await page.mouse.down(); await page.mouse.move(t.x, t.y, { steps: 40 }); await sleep(hold || 700); await page.mouse.up(); await sleep(500);
  }
  await drag('one', cell(seam - 700, 600)); await drag('one', cell(seam + 600, 1000));
  await drag('all', cell(seam + 120, 1000), 1600);
  // move one tile, then undo twice
  const tiles = await page.evaluate(() => Journey2View.debugState().tiles);
  const from = tiles[tiles.length - 3].cell; const a = await at(from), b = await at(cell(seam + 900, 450));
  await page.mouse.move(a.x, a.y, { steps: 8 }); await sleep(250); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 30 }); await sleep(500); await page.mouse.up(); await sleep(800);
  await page.click('[data-j2-undo]'); await sleep(700); await page.click('[data-j2-undo]'); await sleep(1200);
  const final = await page.evaluate(() => Journey2View.debugState().batches[0]);
  await context.close(); await browser.close(); await s.close();
  const vid = fs.readdirSync(tmp).find(f => f.endsWith('.webm'));
  fs.renameSync(path.join(tmp, vid), path.join(OUT, 'drag-demo.webm')); fs.rmSync(tmp, { recursive: true, force: true });
  console.log('recorded drag-demo.webm', fs.statSync(path.join(OUT, 'drag-demo.webm')).size, 'bytes; final state', JSON.stringify({ placed: final.placed, remaining: final.remaining }));
})().catch(e => { console.error(e); process.exit(1); });
