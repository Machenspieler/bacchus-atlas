#!/usr/bin/env node
/* Dev-only: bakes img/journey2/legend-shadowblight.webp — the interactive legend's "Shadowblighted" swatch (PD-072) — from the SAME renderer the map uses
   (js/journey2-shadowblight-fx.js, the approved Hybrid shader at its reduced-motion still frame) on one hex, so the legend shows the living shadow players
   see on the map, as a static image: the legend never runs a WebGL instance of its own. Needs a real browser (WebGL): Playwright, as in scripts/journey2/.
   Usage: node scripts/generate-shadowblight-legend.js   (J2_BROWSER_CHANNEL=chrome to use an installed Chrome) */
'use strict';
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'img', 'journey2', 'legend-shadowblight.webp');
const SIZE = 56;                                  // 28 css px at 2x
const CELLS = ['46,3'];                          // one open-ground hex in the middle of the map (the hex's shape, not the terrain, matters)

(async () => {
  const template = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'map-template.json'), 'utf8'));
  const browser = await chromium.launch({ channel: process.env.J2_BROWSER_CHANNEL || undefined });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  await page.setContent('<!doctype html><svg id="s" xmlns="http://www.w3.org/2000/svg"><defs id="d"></defs><g id="b"></g><g id="r"></g></svg><div id="g"></div><div id="c"></div>');
  await page.addScriptTag({ path: path.join(ROOT, 'js', 'journey2-geometry.js') });
  await page.addScriptTag({ path: path.join(ROOT, 'js', 'journey2-shadowblight-fx.js') });
  const url = await page.evaluate(async ([grid, size, cells]) => {
    const Geo = Journey2Geometry, g = Geo.createGrid(grid), $ = id => document.getElementById(id);
    const fx = Journey2ShadowblightFx.create({ grid: g, worldSize: size, shadowGroup: $('b'), rimGroup: $('r'), defs: $('d'), ground: $('g'), cosmos: $('c'), reducedMotion: true });
    const c = Geo.parseCellId(cells[0]), p = g.cellCenter(c.q, c.r), s = 3;
    fx.setCamera({ scale: s, tx: 400 - p[0] * s, ty: 300 - p[1] * s }, 800, 600);
    fx.setCells({ blighted: cells, overtaken: [] });
    await new Promise(r => setTimeout(r, 400));
    const cv = document.querySelector('#b canvas');
    return fx.stats().backend + '|' + cv.toDataURL('image/png');
  }, [template.grid, template.worldSizePx, CELLS]);
  await browser.close();
  const [backend, data] = url.split('|');
  if (!backend.startsWith('webgl')) throw new Error('needs WebGL to bake the real shader (got ' + backend + ')');
  const png = Buffer.from(data.split(',')[1], 'base64');
  await sharp(png).resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' }).webp({ quality: 92, alphaQuality: 100 }).toFile(OUT);
  console.log('wrote', path.relative(ROOT, OUT), '(' + backend + ')');
})().catch(e => { console.error(e); process.exit(1); });
