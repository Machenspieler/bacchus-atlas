#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — scripts/journey2/prepare-map.js
   Dev-only. Assembles the canonical Journey 2 world raster from the two
   native panels of the (immutable) handoff package, exactly as described by
   scripts/journey2/composition.json: an integer crop and an integer
   translation per panel, nothing else — no scaling, warping, fill or
   redraw. Deterministic: same inputs -> same pixels (the pixel hash below
   is what a re-run must reproduce).

   Usage:
     node scripts/journey2/prepare-map.js            # write the world raster
     node scripts/journey2/prepare-map.js --check    # verify, write nothing
     --handoff <dir>   handoff root (default docs/journey2-handoff)
   Prints a JSON summary (source hashes, output hashes) on success.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..', '..');
const composition = require('./composition.json');

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function parseArgs(argv) {
  const out = { check: false, handoff: path.join(ROOT, 'docs', 'journey2-handoff') };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--check') out.check = true;
    else if (argv[i] === '--handoff') out.handoff = path.resolve(argv[++i]);
  }
  return out;
}

async function assemble(handoffRoot) {
  const [worldW, worldH] = composition.worldSizePx;
  const raw = Buffer.alloc(worldW * worldH * 3, 255);
  const sources = [];
  for (const panel of composition.panels) {
    const file = path.join(handoffRoot, panel.sourcePath);
    const bytes = fs.readFileSync(file);
    const actual = sha256(bytes);
    if (actual !== panel.sha256) throw new Error(`Source hash mismatch for ${panel.id}: ${actual} != ${panel.sha256}`);
    const meta = await sharp(bytes).metadata();
    if (meta.width !== panel.nativeSizePx[0] || meta.height !== panel.nativeSizePx[1]) {
      throw new Error(`Source size mismatch for ${panel.id}: ${meta.width}x${meta.height}`);
    }
    const [cx, cy, cw, ch] = panel.cropRectPx;
    const [wx, wy, ww, wh] = panel.worldRectPx;
    if (cw !== ww || ch !== wh) throw new Error(`Crop/world rect size mismatch for ${panel.id}`);
    if (wx !== cx + panel.worldTranslatePx[0] || wy !== cy + panel.worldTranslatePx[1]) {
      throw new Error(`Translate does not map the crop onto its world rect for ${panel.id}`);
    }
    const rgb = await sharp(bytes).flatten({ background: '#ffffff' }).removeAlpha()
      .extract({ left: cx, top: cy, width: cw, height: ch }).raw().toBuffer();
    for (let y = 0; y < ch; y++) rgb.copy(raw, ((wy + y) * worldW + wx) * 3, y * cw * 3, (y + 1) * cw * 3);
    sources.push({ id: panel.id, sha256: actual, bytes: bytes.length, nativeSizePx: panel.nativeSizePx });
  }
  return { raw, sources };
}

async function main() {
  const args = parseArgs(process.argv);
  const [worldW, worldH] = composition.worldSizePx;
  const { raw, sources } = await assemble(args.handoff);
  const pixelSha256 = sha256(raw);
  const png = await sharp(raw, { raw: { width: worldW, height: worldH, channels: 3 } })
    .webp(composition.output.encoderOptions).toBuffer();
  const outPath = path.join(ROOT, composition.output.path);
  const summary = {
    compositionId: composition.compositionId,
    worldSizePx: composition.worldSizePx,
    sources,
    output: { path: composition.output.path, pixelSha256, fileSha256: sha256(png), bytes: png.length },
  };
  if (args.check) {
    const existing = fs.existsSync(outPath) ? await sharp(outPath).removeAlpha().raw().toBuffer() : null;
    const ok = existing && sha256(existing) === pixelSha256;
    summary.check = ok ? 'PASS: existing raster has identical pixels' : 'FAIL: existing raster differs or is missing';
    console.log(JSON.stringify(summary, null, 2));
    process.exit(ok ? 0 : 1);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, png);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
