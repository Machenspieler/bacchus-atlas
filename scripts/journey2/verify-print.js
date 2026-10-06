#!/usr/bin/env node
/* Dev-only. Verifies a browser print-to-PDF proof of the Journey 2 map and writes the "printProof"
   verification slot. What a PDF can prove, kept apart from screen behaviour and from physical printing:

     structure   2 pages, A4 landscape, map raster placed at 277 x 172 mm (1385 x 860 world px at
                 0.2 mm) taken from the PDF's own transform, inside the 10 mm margins on both axes,
                 smallest text >= 5.5 pt
     paper       blank-margin patches (4 corners + 4 mid-edges, every page) rendered on an explicit
                 white canvas, every pixel every channel >= 250; first full-page fill in the content
                 stream is white (corroboration independent of the rasteriser)
     artwork     map linework / annotations survive: dark-pixel share inside the raster rectangle

   It does NOT claim physical printer quality (physicalPrintTest stays "not-tested").

   Usage: node scripts/journey2/verify-print.js [--pdf <file>] [--bg-off-pdf <file>] [--info <json>]
                                                 [--out <dir>] [--no-slot]
   Defaults to the Task 01A package (docs/journey2-implementation/stage-0a/print). Writes
   <out>/print-proof-analysis.json (+ -nobg-analysis.json), unaltered page renders, and
   <data>/print-verification.json unless --no-slot. Exit code 1 when any check fails.
   Needs pdfjs-dist@3 + @napi-rs/canvas on NODE_PATH (not project dependencies). */
'use strict';
const fs = require('fs'), path = require('path');
const { analyzePdf, WHITE_MIN_CHANNEL } = require('./lib/pdf-checks');

const ROOT = path.join(__dirname, '..', '..');
const STAGE = path.join(ROOT, 'docs', 'journey2-implementation', 'stage-0a');
const opt = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? path.resolve(process.argv[i + 1]) : d; };
const OUT = opt('--out', path.join(STAGE, 'print'));
const PDF = opt('--pdf', path.join(OUT, 'journey2-print-proof.pdf'));
const PDF_NOBG = opt('--bg-off-pdf', path.join(OUT, 'journey2-print-proof-nobg.pdf'));
const INFO = opt('--info', path.join(OUT, 'print-proof-info.json'));
const WRITE_SLOT = !process.argv.includes('--no-slot');

function checksFor(label, a, expected) {
  const checks = []; const add = (check, ok, value) => checks.push({ check: `[${label}] ${check}`, ok: !!ok, value });
  add('PDF has the 2 proof pages', a.pages === 2, a.pages);
  for (const p of a.pageInfo) {
    const pg = `page ${p.page}`;
    add(`${pg} is A4 landscape (297 x 210 mm, +/-0.6)`, Math.abs(p.widthMm - 297) < 0.6 && Math.abs(p.heightMm - 210) < 0.6, [p.widthMm, p.heightMm]);
    const r = p.images.find(i => i.widthMm > 100);
    add(`${pg} map raster is placed at 1385 x 860 world px * ${expected.scaleMmPerWorldPx} mm = 277 x 172 mm (from the PDF transform, no unexpected scaling)`, !!r && Math.abs(r.widthMm - 277) < 0.1 && Math.abs(r.heightMm - 172) < 0.1, r);
    add(`${pg} raster lies inside the 10 mm margins on both axes (top-left origin, no clipping)`, !!r && r.xMm >= 9.9 && r.xMm + r.widthMm <= 287.2 && r.yFromTopMm >= 9.9 && r.yFromTopMm + r.heightMm <= 200.2, r && { x: [r.xMm, +(r.xMm + r.widthMm).toFixed(2)], y: [r.yFromTopMm, +(r.yFromTopMm + r.heightMm).toFixed(2)] });
    add(`${pg} smallest text >= 5.5 pt`, p.textHeightsPt[0] >= 5.5, p.textHeightsPt);
    const bad = p.marginPatches.filter(m => !m.ok);
    add(`${pg} outer-margin patches (4 corners + 4 mid-edges) are white: every channel >= ${WHITE_MIN_CHANNEL}`, bad.length === 0, bad.length ? bad.map(m => ({ patch: m.name, min: m.min })) : { patches: p.marginPatches.length, minChannel: Math.min(...p.marginPatches.map(m => m.min)) });
    add(`${pg} map linework and annotations survive (dark pixels inside the raster rectangle >= 0.5 %)`, p.artwork && p.artwork.darkPixelFraction >= 0.005, p.artwork);
  }
  const f = a.firstFill;
  add('first full-page fill in the content stream is absent or white (not a dark root/page fill)', !f || (f.fillRgb && f.fillRgb.every(v => v >= WHITE_MIN_CHANNEL / 255)), f);
  return checks;
}

(async () => {
  const info = fs.existsSync(INFO) ? JSON.parse(fs.readFileSync(INFO, 'utf8')) : { scaleMmPerWorldPx: 0.2, pdfPages: 2 };
  const expected = { scaleMmPerWorldPx: info.scaleMmPerWorldPx };
  const variants = [['background printing ON (canonical proof)', PDF, 'print-proof']];
  if (fs.existsSync(PDF_NOBG)) variants.push(['background printing OFF', PDF_NOBG, 'print-proof-nobg']);
  let checks = [], reports = {};
  fs.mkdirSync(OUT, { recursive: true });
  for (const [label, file, prefix] of variants) {
    const a = await analyzePdf(file);
    a.pngs.forEach((png, i) => fs.writeFileSync(path.join(OUT, `${prefix}-page${i + 1}.png`), png));
    delete a.pngs; a.file = path.basename(file);
    fs.writeFileSync(path.join(OUT, `${prefix}-analysis.json`), JSON.stringify(a, null, 1));
    reports[label] = a;
    checks = checks.concat(checksFor(label, a, expected));
  }
  const ok = checks.every(c => c.ok);
  const slot = { status: ok ? 'pass' : 'fail', checks, scope: 'browser print-to-PDF (Chromium, Playwright page.pdf, preferCSSPageSize) with background printing ON and OFF; PDF structure, white page margins and map-artwork survival checked on pdf.js renders over an explicit white canvas plus a content-stream fill scan', verifiedBy: 'scripts/journey2/inspect-pdf.js + scripts/journey2/lib/pdf-checks.js + scripts/journey2/verify-print.js', note: 'Single rasteriser (pdf.js); no MuPDF/Poppler available in this environment, so the content-stream fill scan is the second opinion. No physical printer test was performed (physicalPrintTest: not-tested).' };
  if (WRITE_SLOT) {
    const dataDir = path.join(path.dirname(OUT), 'data'); fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'print-verification.json'), JSON.stringify({ schemaVersion: 2, slot }, null, 1) + '\n');
  }
  console.log(ok ? 'print proof PASS' : 'print proof FAIL', JSON.stringify(checks.filter(c => !c.ok).map(c => c.check)));
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
