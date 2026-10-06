#!/usr/bin/env node
/* Dev-only. Analyses a print-proof PDF (placement from the PDF's own transform, margin patches on an
   explicit white canvas, first full-page fill) and writes the unaltered page renders.
   Usage: node scripts/journey2/inspect-pdf.js <pdf> <outDir> [--scale 2] [--prefix print-proof]
   Writes <outDir>/<prefix>-analysis.json and <outDir>/<prefix>-page<N>.png
   Needs pdfjs-dist@3 + @napi-rs/canvas on NODE_PATH (not project dependencies). */
'use strict';
const fs = require('fs'), path = require('path');
const { analyzePdf } = require('./lib/pdf-checks');

async function main() {
  const [pdfPath, outDir] = process.argv.slice(2);
  if (!pdfPath || !outDir) { console.error('usage: inspect-pdf.js <pdf> <outDir> [--scale n] [--prefix name]'); process.exit(2); }
  const opt = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
  const prefix = opt('--prefix', 'print-proof');
  fs.mkdirSync(outDir, { recursive: true });
  const report = await analyzePdf(pdfPath, { scale: Number(opt('--scale', 2)) });
  report.pngs.forEach((png, i) => fs.writeFileSync(path.join(outDir, `${prefix}-page${i + 1}.png`), png));
  delete report.pngs;
  fs.writeFileSync(path.join(outDir, `${prefix}-analysis.json`), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ pages: report.pages, firstFill: report.firstFill, margins: report.pageInfo.map(p => p.marginPatches.map(m => m.min)) }));
}
main().catch(e => { console.error(e); process.exit(1); });
