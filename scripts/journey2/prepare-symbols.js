#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — scripts/journey2/prepare-symbols.js
   Dev-only. Copies the 12 native habitat symbols from the (immutable)
   handoff package into img/journey2/symbols/ after verifying each file's
   SHA-256 against the handoff's asset-manifest.json, and writes
   data/journey2/symbols.json — the runtime catalogue the temporary
   symbol-and-label proof overlay reads. Byte-for-byte copies: no resizing,
   recolouring or tracing.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const HANDOFF = path.join(ROOT, 'docs', 'journey2-handoff');
const manifest = JSON.parse(fs.readFileSync(path.join(HANDOFF, 'data', 'asset-manifest.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(HANDOFF, 'data', 'symbol-catalog.json'), 'utf8'));

const outDir = path.join(ROOT, 'img', 'journey2', 'symbols');
fs.mkdirSync(outDir, { recursive: true });
const symbols = [];
for (const entry of manifest.runtimeAssetCandidates.filter(a => a.kind === 'symbol')) {
  const src = path.join(HANDOFF, entry.path);
  const bytes = fs.readFileSync(src);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  if (sha !== entry.sha256) throw new Error('hash mismatch for ' + entry.path);
  const file = path.basename(entry.path);
  fs.writeFileSync(path.join(outDir, file), bytes);
  const cat = catalog.symbols.find(s => s.id === entry.id);
  symbols.push({
    id: entry.id,
    sourceLabel: entry.sourceLabel,
    kind: cat.kind,
    path: 'img/journey2/symbols/' + file,
    sizePx: entry.outputSizePx,
    sha256: sha,
    habitatD20Range: entry.habitatD20Range || null,
  });
}
const doc = {
  schemaVersion: 1,
  source: { handoff: 'journey2-handoff', catalog: 'data/symbol-catalog.json', note: 'Native raster artwork (not vector); aspect ratio must be preserved.' },
  symbols,
};
fs.mkdirSync(path.join(ROOT, 'data', 'journey2'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'journey2', 'symbols.json'), JSON.stringify(doc, null, 1) + '\n');
console.log('copied', symbols.length, 'symbols');
