#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — scripts/journey2/render-anchor-sheets.js
   Dev-only evidence renderer for the marker survey. Reads the promoted
   runtime documents (data/journey2/map-template.json + map-anchors.json) and
   draws, per anchor, the associated cell outline, the icon-protection area,
   the hit area, the anchor point and the label anchor on the real raster:

     images/markers-overview.png        whole map, numbered by stableId
     images/markers-contact-sheet-N.png cropped, one cell per anchor
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Geo = require('../../js/journey2-geometry.js');

const ROOT = path.join(__dirname, '..', '..');
const STAGE = path.join(ROOT, 'docs', 'journey2-implementation', 'stage-0', 'images');
const template = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'map-template.json'), 'utf8'));
const anchorsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'map-anchors.json'), 'utf8'));
const WORLD = path.join(ROOT, template.assembledAsset.path);
const grid = Geo.createGrid(template.grid);

function polyPoints(pts, ox, oy, z) { return pts.map(p => ((p[0] - ox) * z).toFixed(1) + ',' + ((p[1] - oy) * z).toFixed(1)).join(' '); }

async function main() {
  fs.mkdirSync(STAGE, { recursive: true });
  const [W, H] = template.worldSizePx;
  // overview, half size
  const SC = 0.5, OW = Math.round(W * SC), OH = Math.round(H * SC);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OW}" height="${OH}">`;
  for (const a of anchorsDoc.anchors) {
    const [x, y, w, h] = a.iconProtectionArea.rectPx.map(v => v * SC);
    const col = a.kind === 'destination' ? '#0a5fd6' : '#e0003c';
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${col}" stroke-width="1.5"/>`;
    svg += `<text x="${x + w + 3}" y="${y + 9}" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="bold" fill="${col}" stroke="#fff" stroke-width="3" paint-order="stroke">${a.stableId.slice(3)}</text>`;
  }
  svg += '</svg>';
  const base = await sharp(WORLD).removeAlpha().resize(OW, OH).png().toBuffer();
  await sharp(base).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toFile(path.join(STAGE, 'markers-overview.png'));

  const CELL = 120, Z0 = 2, COLS = 5, ROWS = 4, PAD = 8, LBL = 16;
  const per = COLS * ROWS;
  for (let s = 0; s * per < anchorsDoc.anchors.length; s++) {
    const slice = anchorsDoc.anchors.slice(s * per, (s + 1) * per);
    const cw = CELL * Z0 + PAD, sheetW = COLS * cw + PAD, sheetH = ROWS * (cw + LBL) + PAD;
    const comp = [];
    let ov = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}" height="${sheetH}">`;
    for (let i = 0; i < slice.length; i++) {
      const a = slice[i];
      const cx = a.worldPixelAnchor[0], cy = a.worldPixelAnchor[1];
      const size = Math.max(CELL, Math.ceil(Math.max(a.iconProtectionArea.rectPx[2], a.iconProtectionArea.rectPx[3]) + 70)); // large markers (Horizon) get a wider crop
      const Z = (CELL * Z0) / size;
      const left = Math.round(Math.min(Math.max(0, cx - size / 2), W - size)), top = Math.round(Math.min(Math.max(0, cy - size / 2), H - size));
      const crop = await sharp(WORLD).removeAlpha().extract({ left, top, width: size, height: size }).resize(CELL * Z0, CELL * Z0, { kernel: 'nearest' }).png().toBuffer();
      const col = i % COLS, row = Math.floor(i / COLS);
      const x = PAD + col * cw, y = PAD + row * (cw + LBL) + LBL;
      comp.push({ input: crop, left: x, top: y });
      const c = Geo.parseCellId(a.cellId);
      ov += `<g transform="translate(${x},${y})">`;
      ov += `<polygon points="${polyPoints(grid.cellCorners(c.q, c.r), left, top, Z)}" fill="none" stroke="#d9a441" stroke-width="2"/>`;
      const hr = a.hitArea.rectPx, pr = a.iconProtectionArea.rectPx;
      ov += `<rect x="${(hr[0] - left) * Z}" y="${(hr[1] - top) * Z}" width="${hr[2] * Z}" height="${hr[3] * Z}" fill="none" stroke="#0a5fd6" stroke-width="1" stroke-dasharray="4 3"/>`;
      ov += `<rect x="${(pr[0] - left) * Z}" y="${(pr[1] - top) * Z}" width="${pr[2] * Z}" height="${pr[3] * Z}" fill="none" stroke="#e0003c" stroke-width="1.5"/>`;
      ov += `<path d="M${(cx - left) * Z - 5} ${(cy - top) * Z}h10M${(cx - left) * Z} ${(cy - top) * Z - 5}v10" stroke="#e0003c" stroke-width="1.5"/>`;
      if (a.labelAnchor) ov += `<circle cx="${(a.labelAnchor.pointPx[0] - left) * Z}" cy="${(a.labelAnchor.pointPx[1] - top) * Z}" r="3" fill="#0a8f3c"/>`;
      if (a.builtInLabel) { const b = a.builtInLabel.protectionRectPx; ov += `<rect x="${(b[0] - left) * Z}" y="${(b[1] - top) * Z}" width="${b[2] * Z}" height="${b[3] * Z}" fill="none" stroke="#0a8f3c" stroke-width="1.5"/>`; }
      ov += '</g>';
      ov += `<text x="${x}" y="${y - 4}" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="bold">${a.stableId}  ${a.kind}${a.glyphClass ? ' ' + a.glyphClass : ''}  cell ${a.cellId}  ${a.sourcePanel}</text>`;
    }
    ov += '</svg>';
    await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#ffffff' } })
      .composite([...comp, { input: Buffer.from(ov), left: 0, top: 0 }]).png().toFile(path.join(STAGE, `markers-contact-sheet-${s + 1}.png`));
  }
  console.log('rendered', anchorsDoc.anchors.length, 'anchors');
}

main().catch(e => { console.error(e); process.exit(1); });
