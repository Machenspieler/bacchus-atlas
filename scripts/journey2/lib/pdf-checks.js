/* Dev-only PDF proof analysis shared by inspect-pdf.js and verify-print.js.
   Needs `pdfjs-dist` (3.x legacy build) and `@napi-rs/canvas`, installed outside the project
   (resolve with NODE_PATH); neither is a project dependency.

   Three independent kinds of evidence, reported separately:
     1. placement   - images' size/position taken from the PDF's own transform matrix,
                      converted to a top-left origin inside the page (PDF y grows upward);
     2. margins     - the page rasterised onto an explicit white canvas, then blank-margin
                      patches (all four corners + mid-edges) sampled per pixel;
     3. paint ops   - the first full-page fill found in the decompressed content stream
                      (corroboration that does not depend on the rasteriser).
   Only one renderer (pdf.js) is available here; the content-stream scan is the second opinion. */
'use strict';
const fs = require('fs');
const zlib = require('zlib');

const PT_TO_MM = 25.4 / 72;
const MARGIN_PATCH = { insetMm: 1.5, sizeMm: 4 };   // patch spans 1.5-5.5 mm from the paper edges; page margin is 10 mm
const WHITE_MIN_CHANNEL = 250;                      // every sampled pixel, every channel, must be >= this

function loadDeps() {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  const { createCanvas } = require('@napi-rs/canvas');
  class Factory { create(w, h) { const c = createCanvas(w, h); return { canvas: c, context: c.getContext('2d') }; } reset(o, w, h) { o.canvas.width = w; o.canvas.height = h; } destroy(o) { o.canvas.width = 0; o.canvas.height = 0; } }
  return { pdfjs, createCanvas, Factory };
}

const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];

/** Patches (mm, top-left origin) that must be blank paper: 4 corners + 4 mid-edges. */
function marginPatches(wMm, hMm) {
  const { insetMm: i, sizeMm: s } = MARGIN_PATCH;
  const xs = { l: i, c: wMm / 2 - s / 2, r: wMm - i - s }, ys = { t: i, m: hMm / 2 - s / 2, b: hMm - i - s };
  return [['tl', 'l', 't'], ['tc', 'c', 't'], ['tr', 'r', 't'], ['ml', 'l', 'm'], ['mr', 'r', 'm'], ['bl', 'l', 'b'], ['bc', 'c', 'b'], ['br', 'r', 'b']]
    .map(([name, kx, ky]) => ({ name, xMm: xs[kx], yMm: ys[ky], wMm: s, hMm: s }));
}

/** Min channel value over a patch of an RGBA image. */
function patchMin(data, imgW, patch, pxPerMm) {
  const x0 = Math.round(patch.xMm * pxPerMm), y0 = Math.round(patch.yMm * pxPerMm), x1 = Math.round((patch.xMm + patch.wMm) * pxPerMm), y1 = Math.round((patch.yMm + patch.hMm) * pxPerMm);
  let min = 255, sum = [0, 0, 0], n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * imgW + x) * 4;
    for (let c = 0; c < 3; c++) { if (data[o + c] < min) min = data[o + c]; sum[c] += data[o + c]; }
    n++;
  }
  return { min, mean: sum.map(v => Math.round(v / n)) };
}

/** Walk every Flate content stream; return the first `re ... f` full-page-ish fill and the colour in force. */
function scanFirstFill(pdfBuf) {
  const latin = pdfBuf.toString('latin1');
  const out = [];
  const re = /stream\r?\n/g; let m;
  while ((m = re.exec(latin))) {
    const start = m.index + m[0].length, end = latin.indexOf('endstream', start);
    if (end < 0) break;
    let txt = null;
    try { txt = zlib.inflateSync(pdfBuf.subarray(start, end)).toString('latin1'); } catch (e) { continue; }
    if (!/\bre\b/.test(txt) || !/\bf\*?\b/.test(txt) || /\/Subtype|\/Length/.test(txt.slice(0, 40))) continue;
    if (txt.length > 4e6) continue;
    const ops = txt.split(/\r?\n/);
    let fill = null;
    for (let i = 0; i < Math.min(ops.length, 400); i++) {
      const rg = ops[i].match(/^\s*(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) rg\b/) || ops[i].match(/(?:^|\s)(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) rg\s*$/);
      if (rg) fill = [Number(rg[1]), Number(rg[2]), Number(rg[3])];
      const rect = ops[i].match(/^\s*(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re\s*$/);
      if (rect && /^\s*f\*?\s*$/.test(ops[i + 1] || '')) { out.push({ fillRgb: fill, rect: rect.slice(1, 5).map(Number) }); break; }
    }
    if (out.length) break;
  }
  return out[0] || null;
}

async function analyzePdf(pdfPath, opts = {}) {
  const scale = opts.scale || 2;
  const { pdfjs, createCanvas, Factory } = loadDeps();
  const buf = fs.readFileSync(pdfPath);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), canvasFactory: new Factory(), useSystemFonts: true }).promise;
  const report = { pdfjsVersion: pdfjs.version, renderer: 'pdf.js ' + pdfjs.version + ' + @napi-rs/canvas (Skia), explicit #fff canvas, scale ' + scale, whiteThresholdMinChannel: WHITE_MIN_CHANNEL, pages: doc.numPages, firstFill: scanFirstFill(buf), pageInfo: [], pngs: [] };
  const { OPS } = pdfjs;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const wMm = vp.width * PT_TO_MM, hMm = vp.height * PT_TO_MM;
    const ops = await page.getOperatorList();
    const stack = []; let m = [1, 0, 0, 1, 0, 0]; const imgs = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const f = ops.fnArray[i], a = ops.argsArray[i];
      if (f === OPS.save) stack.push(m.slice()); else if (f === OPS.restore) m = stack.pop() || m; else if (f === OPS.transform) m = mul(m, a);
      else if (f === OPS.paintImageXObject || f === OPS.paintInlineImageXObject || f === OPS.paintImageXObjectRepeat) {
        // image space is the unit square; the CTM maps it to page space with a bottom-left origin (PDF user space)
        const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]]);
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), yBottom = Math.min(...ys), yTop = Math.max(...ys);
        imgs.push({ widthMm: +((x1 - x0) * PT_TO_MM).toFixed(2), heightMm: +((yTop - yBottom) * PT_TO_MM).toFixed(2), xMm: +(x0 * PT_TO_MM).toFixed(2), yFromTopMm: +((vp.height - yTop) * PT_TO_MM).toFixed(2), yFromBottomMm: +(yBottom * PT_TO_MM).toFixed(2) });
      }
    }
    const tc = await page.getTextContent();
    const texts = tc.items.filter(t => t.str.trim());
    const sizes = [...new Set(texts.map(t => Math.round(Math.hypot(t.transform[2], t.transform[3]) * 10) / 10))].sort((a, b) => a - b);
    const v2 = page.getViewport({ scale }); const cv = createCanvas(Math.ceil(v2.width), Math.ceil(v2.height)); const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: v2, canvasFactory: new Factory() }).promise;
    const png = cv.toBuffer('image/png'); report.pngs.push(png);
    const img = ctx.getImageData(0, 0, cv.width, cv.height);
    const pxPerMm = cv.width / wMm;
    const patches = marginPatches(wMm, hMm).map(p => Object.assign(p, patchMin(img.data, cv.width, p, pxPerMm), {}));
    for (const p of patches) p.ok = p.min >= WHITE_MIN_CHANNEL;
    // artwork survival: share of near-black pixels (map linework, markers, annotations) inside the main raster's rectangle
    const big = imgs.find(i => i.widthMm > 100);
    let artwork = null;
    if (big) {
      const x0 = Math.round(big.xMm * pxPerMm), y0 = Math.round(big.yFromTopMm * pxPerMm), x1 = Math.round((big.xMm + big.widthMm) * pxPerMm), y1 = Math.round((big.yFromTopMm + big.heightMm) * pxPerMm);
      let dark = 0, total = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * cv.width + x) * 4; if ((img.data[o] + img.data[o + 1] + img.data[o + 2]) / 3 < 100) dark++; total++; }
      artwork = { darkPixelFraction: +(dark / total).toFixed(4), pixels: total };
    }
    report.pageInfo.push({ page: n, artwork, widthPt: vp.width, heightPt: vp.height, widthMm: +wMm.toFixed(3), heightMm: +hMm.toFixed(3), images: imgs, textItems: texts.length, textHeightsPt: sizes, marginPatches: patches });
  }
  return report;
}

module.exports = { analyzePdf, scanFirstFill, marginPatches, WHITE_MIN_CHANNEL, MARGIN_PATCH };
