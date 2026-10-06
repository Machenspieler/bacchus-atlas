#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — scripts/journey2/survey-markers.js
   Dev-only, assisted marker survey. Finds every candidate fixed marker on the
   assembled world raster (black connected components after a small dilation),
   writes the candidate list and the review images (numbered overview,
   contact sheets). It does NOT decide what is a marker: the accepted /
   rejected decisions live in scripts/journey2/marker-review.json, made by
   eye against these sheets, and are applied by build-template.js.

   Outputs (docs/journey2-implementation/stage-0/):
     data/marker-candidates.json
     images/markers-candidates-overview.png     numbered, whole map
     images/markers-candidates-sheet-N.png      cropped contact sheets
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..', '..');
const STAGE = path.join(ROOT, 'docs', 'journey2-implementation', 'stage-0');
const WORLD = path.join(ROOT, 'img', 'journey2', 'valloren-world.webp');

const INK_THRESHOLD = 50;     // luminance below this is "black ink" (coast lines/hatching are lighter)
const DILATE = 3;             // merge the parts of one icon (tower + building)
const MIN_INK = 150;          // below this: letter fragments, specks

async function findComponents() {
  const { data: g, info } = await sharp(WORLD).removeAlpha().grayscale().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const B = new Uint8Array(W * H);
  for (let i = 0; i < B.length; i++) B[i] = g[i] < INK_THRESHOLD ? 1 : 0;
  const tmp = new Uint8Array(W * H), D = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    let run = 0;
    for (let x = 0; x < W; x++) { if (B[y * W + x]) run = DILATE + 1; tmp[y * W + x] = run > 0 ? 1 : 0; if (run > 0) run--; }
    run = 0;
    for (let x = W - 1; x >= 0; x--) { if (B[y * W + x]) run = DILATE + 1; if (run > 0) { tmp[y * W + x] = 1; run--; } }
  }
  for (let x = 0; x < W; x++) {
    let run = 0;
    for (let y = 0; y < H; y++) { if (tmp[y * W + x]) run = DILATE + 1; D[y * W + x] = run > 0 ? 1 : 0; if (run > 0) run--; }
    run = 0;
    for (let y = H - 1; y >= 0; y--) { if (tmp[y * W + x]) run = DILATE + 1; if (run > 0) { D[y * W + x] = 1; run--; } }
  }
  const lab = new Int32Array(W * H);
  const comps = [];
  const stack = [];
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    if (!D[i] || lab[i]) continue;
    n++;
    let ink = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, sx = 0, sy = 0;
    stack.push(i); lab[i] = n;
    while (stack.length) {
      const p = stack.pop();
      const x = p % W, y = (p / W) | 0;
      if (B[p]) { ink++; sx += x; sy += y; }
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const q = yy * W + xx;
        if (D[q] && !lab[q]) { lab[q] = n; stack.push(q); }
      }
    }
    if (ink >= MIN_INK) comps.push({ ink, bboxPx: [x0, y0, x1 - x0 + 1, y1 - y0 + 1], inkCentroidPx: [sx / ink, sy / ink] });
  }
  return { comps, W, H };
}

function isFrame(c, W, H) { return c.bboxPx[2] > W * 0.9 && c.bboxPx[3] > H * 0.9; }

async function main() {
  const { comps, W, H } = await findComponents();
  const cand = comps.filter(c => !isFrame(c, W, H)).sort((a, b) => a.bboxPx[1] - b.bboxPx[1] || a.bboxPx[0] - b.bboxPx[0]);
  cand.forEach((c, i) => { c.candidateId = i + 1; });
  fs.mkdirSync(path.join(STAGE, 'data'), { recursive: true });
  fs.mkdirSync(path.join(STAGE, 'images'), { recursive: true });
  fs.writeFileSync(path.join(STAGE, 'data', 'marker-candidates.json'), JSON.stringify({
    schemaVersion: 1, generatedBy: 'scripts/journey2/survey-markers.js',
    detection: { inkThresholdLuminance: INK_THRESHOLD, dilatePx: DILATE, minInkPx: MIN_INK, connectivity: 8 },
    count: cand.length, candidates: cand,
  }, null, 1) + '\n');

  // numbered overview (half size)
  const SC = 0.5;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W * SC)}" height="${Math.round(H * SC)}">`;
  for (const c of cand) {
    const [x, y, w, h] = c.bboxPx.map(v => v * SC);
    svg += `<rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" fill="none" stroke="#e0003c" stroke-width="1.5"/>`;
    svg += `<text x="${x + w + 4}" y="${y + 9}" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="bold" fill="#e0003c" stroke="#fff" stroke-width="3" paint-order="stroke">${c.candidateId}</text>`;
  }
  svg += '</svg>';
  const base = await sharp(WORLD).removeAlpha().resize(Math.round(W * SC), Math.round(H * SC)).png().toBuffer();
  await sharp(base).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toFile(path.join(STAGE, 'images', 'markers-candidates-overview.png'));

  // contact sheets: 12 per row, 96 px source crops at 2x
  const CELL = 96, ZOOM = 2, COLS = 6, ROWS = 6, PAD = 8;
  const per = COLS * ROWS;
  for (let s = 0; s * per < cand.length; s++) {
    const slice = cand.slice(s * per, (s + 1) * per);
    const cw = CELL * ZOOM + PAD, sheetW = COLS * cw + PAD, sheetH = ROWS * (cw + 14) + PAD;
    const comp = [];
    let labels = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}" height="${sheetH}">`;
    for (let i = 0; i < slice.length; i++) {
      const c = slice[i];
      const cx = Math.round(c.bboxPx[0] + c.bboxPx[2] / 2), cy = Math.round(c.bboxPx[1] + c.bboxPx[3] / 2);
      const left = Math.min(Math.max(0, cx - CELL / 2), W - CELL), top = Math.min(Math.max(0, cy - CELL / 2), H - CELL);
      const crop = await sharp(WORLD).removeAlpha().extract({ left, top, width: CELL, height: CELL }).resize(CELL * ZOOM, CELL * ZOOM, { kernel: 'nearest' }).png().toBuffer();
      const col = i % COLS, row = Math.floor(i / COLS);
      const x = PAD + col * cw, y = PAD + row * (cw + 14);
      comp.push({ input: crop, left: x, top: y + 14 });
      const bx = (c.bboxPx[0] - left) * ZOOM, by = (c.bboxPx[1] - top) * ZOOM;
      labels += `<rect x="${x + bx - 2}" y="${y + 14 + by - 2}" width="${c.bboxPx[2] * ZOOM + 4}" height="${c.bboxPx[3] * ZOOM + 4}" fill="none" stroke="#e0003c" stroke-width="1"/>`;
      labels += `<text x="${x}" y="${y + 11}" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="bold" fill="#000">#${c.candidateId}  ${c.bboxPx[2]}x${c.bboxPx[3]}  ink ${c.ink}  @${cx},${cy}</text>`;
    }
    labels += '</svg>';
    await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#ffffff' } })
      .composite([...comp, { input: Buffer.from(labels), left: 0, top: 0 }]).png().toFile(path.join(STAGE, 'images', `markers-candidates-sheet-${s + 1}.png`));
  }
  console.log(`candidates: ${cand.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
