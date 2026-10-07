#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — scripts/journey2/build-template.js
   Dev-only. Promotes the measured/surveyed Stage 0 inputs into the two
   authoritative runtime documents:

     data/journey2/map-template.json   world, composition, grid, valid cells, frame, control points
     data/journey2/map-anchors.json    the fixed original markers (immutable template data)

   Inputs (all under scripts/journey2/ or docs/journey2-implementation/stage-0/data/):
     composition.json           crop/translate descriptor      (prepare-map.js)
     assembly-summary.json      source + output hashes         (prepare-map.js)
     grid-fit.json              measured lattice               (measure-grid.js)
     marker-candidates.json     detected components            (survey-markers.js)
     marker-review.json         the by-eye accept/reject list  (maintained by hand)
     *-verification.json        optional: geometry / browser / print evidence slots (see below)

   The geometry used here (valid cells, anchor -> cell) is js/journey2-geometry.js
   itself, so the template can never disagree with the runtime about a cell.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Geo = require('../../js/journey2-geometry.js');

const ROOT = path.join(__dirname, '..', '..');
const STAGE = path.join(ROOT, 'docs', 'journey2-implementation', 'stage-0');
const composition = require('./composition.json');
const review = require('./marker-review.json');
const fit = JSON.parse(fs.readFileSync(path.join(STAGE, 'data', 'grid-fit.json'), 'utf8'));
const candidatesDoc = JSON.parse(fs.readFileSync(path.join(STAGE, 'data', 'marker-candidates.json'), 'utf8'));
const assembly = JSON.parse(fs.readFileSync(path.join(STAGE, 'data', 'assembly-summary.json'), 'utf8'));
/* Verification evidence, one optional file per slot (each written by the step that
 * actually performed the check; a missing file means "pending", never "pass"):
 *   geometry-verification.json   scripts/journey2/verify-template.js (preparedAssets + geometry + control points)
 *   browser-verification.json    the browser run of the #/journey route (stage-0/tests)
 *   print-verification.json      the print-to-PDF proof                  (stage-0/print)  */
/* --verification <stage dir> (Task 01A): read the geometry/browser/print slots from that package's data/ instead of Stage 0's. */
const vArg = process.argv.indexOf('--verification');
const VERIFY_STAGE = vArg > -1 ? path.resolve(process.argv[vArg + 1]) : STAGE;
const readOpt = f => { const p = path.join(VERIFY_STAGE, 'data', f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
const geomV = readOpt('geometry-verification.json');
const browserV = readOpt('browser-verification.json');
const printV = readOpt('print-verification.json');
const verification = {
  gridCalibrationStatus: geomV ? geomV.gridCalibrationStatus : null,
  controlPoints: geomV ? geomV.controlPoints : [],
  slots: {
    preparedAssets: geomV && geomV.slots.preparedAssets,
    geometry: geomV && geomV.slots.geometry,
    browserBehavior: browserV && browserV.slot,
    printProof: printV && printV.slot,
  },
};

const r4 = v => Math.round(v * 1e4) / 1e4;
const FRAME = fit.frameInnerRectPx;           // inner map rectangle, world px (half-open at x1/y1)

/* ---------------- grid ---------------- */

function buildGridSpec() {
  const L = fit.lattice;
  // Cell (0,0) = measured lattice cell (1,0): the first column whose centre is inside the frame.
  const origin = [r4(L.ox + L.bqx), r4(L.oy + L.bqy)];
  const bq = [r4(L.bqx), r4(L.bqy)];
  const br = [r4(L.brx), r4(L.bry)];
  const spec = { originPx: origin, basisQPx: bq, basisRPx: br };
  spec.hexCornersRelativePx = Geo.deriveCornerOffsets(bq, br).map(p => [r4(p[0]), r4(p[1])]);
  // valid cells: centre inside the frame's inner rectangle [x0,x1) x [y0,y1)
  const g0 = Geo.createGrid(spec);
  const columns = {};
  let total = 0, full = 0;
  for (let q = 0; q < 200; q++) {
    let lo = null, hi = null;
    for (let r = -120; r < 160; r++) {
      const c = g0.cellCenter(q, r);
      if (c[0] >= FRAME.x0 && c[0] < FRAME.x1 && c[1] >= FRAME.y0 && c[1] < FRAME.y1) {
        if (lo === null) lo = r;
        if (hi !== null && r !== hi + 1) throw new Error('non-contiguous column ' + q);
        hi = r;
        total++;
        const pts = g0.cellCorners(q, r);
        if (pts.every(p => p[0] >= FRAME.x0 && p[0] <= FRAME.x1 && p[1] >= FRAME.y0 && p[1] <= FRAME.y1)) full++;
      }
    }
    if (lo !== null) columns[String(q)] = [lo, hi];
  }
  spec.validCells = {
    rule: 'centre-in-frame-interior',
    ruleDetail: 'A cell is valid iff its centre lies in the half-open frame interior [x0,x1) x [y0,y1) (grid.frameInnerRectPx). Partial edge cells whose centre is inside are valid; cells whose centre is outside the frame are not, even when a sliver of them is drawn. Water and old coastlines never invalidate a cell; title, compass and legend areas stay valid (see decorativeAreas).',
    format: 'column-ranges',
    columnRangeMeaning: 'columns[q] = [rMin, rMax], inclusive; every integer r in the range is valid',
    count: total,
    fullyInsideFrameCount: full,
    clippedByFrameCount: total - full,
    columns: columns,
  };
  return spec;
}

/* ---------------- markers ---------------- */

async function loadInkMask() {
  const { data, info } = await sharp(path.join(ROOT, composition.output.path)).removeAlpha().grayscale().raw().toBuffer({ resolveWithObject: true });
  return { gray: data, W: info.width, H: info.height };
}

function inkAt(img, x, y) { return x >= 0 && y >= 0 && x < img.W && y < img.H && img.gray[y * img.W + x] < 50 ? 1 : 0; }

/** Majority-vote ink template over the aligned bboxes of the given candidates. */
function buildTemplate(img, members) {
  const w = members[0].bboxPx[2], h = members[0].bboxPx[3];
  const acc = new Float32Array(w * h);
  for (const m of members) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) acc[y * w + x] += inkAt(img, m.bboxPx[0] + x, m.bboxPx[1] + y);
  }
  const mask = new Uint8Array(w * h);
  let n = 0;
  for (let i = 0; i < mask.length; i++) { mask[i] = acc[i] / members.length >= 0.5 ? 1 : 0; n += mask[i]; }
  return { w, h, mask, ink: n };
}

function matchTemplate(img, tpl, cx, cy, radius) {
  let best = null;
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const x0 = Math.round(cx - tpl.w / 2) + dx, y0 = Math.round(cy - tpl.h / 2) + dy;
    let hit = 0, miss = 0;
    for (let y = 0; y < tpl.h; y++) for (let x = 0; x < tpl.w; x++) {
      if (!tpl.mask[y * tpl.w + x]) continue;
      if (inkAt(img, x0 + x, y0 + y)) hit++; else miss++;
    }
    const score = (hit - 1.5 * miss) / tpl.ink;
    if (!best || score > best.score) best = { score, x0, y0, hit, miss };
  }
  return best;
}

function rectUnion(rects) {
  const x0 = Math.min(...rects.map(r => r[0])), y0 = Math.min(...rects.map(r => r[1]));
  const x1 = Math.max(...rects.map(r => r[0] + r[2])), y1 = Math.max(...rects.map(r => r[1] + r[3]));
  return [x0, y0, x1 - x0, y1 - y0];
}

function worldToNative(x, y) {
  const east = x >= composition.seam.worldX;
  const panel = composition.panels[east ? 1 : 0];
  return { panel: panel.id, px: [x - panel.worldTranslatePx[0], y - panel.worldTranslatePx[1]] };
}

async function buildAnchors(grid) {
  const img = await loadInkMask();
  const byId = new Map(candidatesDoc.candidates.map(c => [c.candidateId, c]));
  const accepted = review.decisions.filter(d => d.decision === 'accept').map(d => ({ d, c: byId.get(d.candidateId) }));
  // ink-template classes from clean, repeated (w,h,ink) exemplars
  const generic = accepted.filter(a => a.d.kind === 'sanctuary').map(a => a.c);
  const clusters = [];
  for (const c of generic) {
    const hit = clusters.find(k => Math.abs(k.w - c.bboxPx[2]) <= 1 && Math.abs(k.h - c.bboxPx[3]) <= 1 && Math.abs(k.ink - c.ink) / k.ink <= 0.06);
    if (hit) hit.members.push(c); else clusters.push({ w: c.bboxPx[2], h: c.bboxPx[3], ink: c.ink, members: [c] });
  }
  const classes = clusters.filter(k => k.members.length >= 2).sort((a, b) => b.members.length - a.members.length);
  classes.forEach((k, i) => { k.glyphClass = 'G' + (i + 1); k.template = buildTemplate(img, k.members); });
  const out = [];
  for (const { d, c } of accepted) {
    const rec = { candidate: c, decision: d, bbox: c.bboxPx.slice(), bboxSource: 'raw-component', glyphClass: null, matchScore: null };
    if (d.kind === 'sanctuary') {
      let best = null;
      for (const k of classes) {
        const m = matchTemplate(img, k.template, c.bboxPx[0] + c.bboxPx[2] / 2, c.bboxPx[1] + c.bboxPx[3] / 2, 10);
        if (!best || m.score > best.m.score) best = { k, m };
      }
      rec.glyphClass = best.k.glyphClass;
      rec.matchScore = Math.round(best.m.score * 1000) / 1000;
      const deviates = Math.abs(c.bboxPx[2] - best.k.w) > 1 || Math.abs(c.bboxPx[3] - best.k.h) > 1;
      if (deviates) {
        rec.bbox = [best.m.x0, best.m.y0, best.k.w, best.k.h];
        rec.bboxSource = 'glyph-template-match';
        rec.rawBbox = c.bboxPx.slice();
      }
    }
    out.push(rec);
  }
  // stable ids: reading order of the final anchor positions (y, then x)
  out.sort((a, b) => (a.bbox[1] + a.bbox[3] / 2) - (b.bbox[1] + b.bbox[3] / 2) || (a.bbox[0] + a.bbox[2] / 2) - (b.bbox[0] + b.bbox[2] / 2));
  const labelCands = id => review.builtInLabelCandidates[id].map(n => byId.get(n).bboxPx);
  const anchors = out.map((rec, i) => {
    const [x, y, w, h] = rec.bbox;
    const cx = x + w / 2, cy = y + h / 2;
    const destination = rec.decision.kind === 'destination';
    let protect = [x - 4, y - 4, w + 8, h + 8];
    if (rec.decision.builtInLabel === 'HORIZON') protect = [4355, 178, 125, 200];   // figure, sun rays and the hatched base (see CALIBRATION_REPORT)
    const hit = [cx - Math.max(protect[2] / 2, 22), cy - Math.max(protect[3] / 2, 22), Math.max(protect[2], 44), Math.max(protect[3], 44)];
    const cell = grid.worldToCell(cx, cy);
    const nat = worldToNative(cx, cy);
    const alt = grid.cellsInRect(protect[0], protect[1], protect[0] + protect[2], protect[1] + protect[3], 40)
      .filter(c => !(c.q === cell.q && c.r === cell.r) && grid.isValid(c.q, c.r) && Geo.rectIntersectsPolygon(protect, grid.cellCorners(c.q, c.r)))
      .map(c => Geo.cellId(c.q, c.r));
    let builtIn = null;
    if (rec.decision.builtInLabel) {
      const labelRect = rectUnion(labelCands(rec.decision.builtInLabel));
      const pad = rec.decision.builtInLabel === 'HORIZON' ? [-6, -5, 12, 10] : [-6, -5, 12, 10];
      builtIn = { text: rec.decision.builtInLabel, source: 'artwork', bboxPx: labelRect, protectionRectPx: [labelRect[0] + pad[0], labelRect[1] + pad[1], labelRect[2] + pad[2], labelRect[3] + pad[3]], suppressDuplicateText: true };
    }
    return {
      stableId: 'mk-' + String(i + 1).padStart(3, '0'),
      kind: rec.decision.kind,
      glyphClass: rec.glyphClass,
      sourcePanel: nat.panel,
      sourcePixelAnchor: [Math.round(nat.px[0] * 10) / 10, Math.round(nat.px[1] * 10) / 10],
      worldPixelAnchor: [Math.round(cx * 10) / 10, Math.round(cy * 10) / 10],
      anchorRule: "centre of the icon's tight ink bounding box (observed position; never snapped to the cell centre)",
      cellId: Geo.cellId(cell.q, cell.r),
      cellAssociation: { rule: 'cell containing the anchor point', alternateCellIds: alt },
      hitArea: { shape: 'rect', rectPx: hit.map(v => Math.round(v * 10) / 10) },
      iconProtectionArea: { shape: 'rect', rectPx: protect.map(v => Math.round(v * 10) / 10), note: 'tight ink bbox + 4 px (covers the knocked-out white halo); Horizon is surveyed by hand to include sun rays and hatched base' },
      labelAnchor: builtIn ? null : { pointPx: [Math.round(cx * 10) / 10, Math.round((protect[1] + protect[3] + 6) * 10) / 10], textAlign: 'center', verticalAlign: 'top' },
      builtInLabel: builtIn,
      verificationStatus: 'visually-verified',
      survey: { candidateId: rec.candidate.candidateId, ink: rec.candidate.ink, rawBboxPx: rec.rawBbox || rec.candidate.bboxPx, bboxSource: rec.bboxSource, glyphMatchScore: rec.matchScore },
      notes: rec.decision.notes || null,
    };
  });
  return { anchors, classes: classes.map(k => ({ glyphClass: k.glyphClass, sizePx: [k.w, k.h], inkPx: k.ink, exemplars: k.members.length })) };
}

/* ---------------- decorative areas ---------------- */

function decorativeAreas() {
  const byId = new Map(candidatesDoc.candidates.map(c => [c.candidateId, c]));
  const rect = ids => rectUnion(ids.map(i => byId.get(i).bboxPx));
  const pad = (r, p) => [r[0] - p, r[1] - p, r[2] + 2 * p, r[3] + 2 * p];
  return [
    { id: 'title', kind: 'title-lettering', rectPx: pad(rect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]), 6), placementPolicy: 'protected: overlays avoid it; cells stay valid' },
    { id: 'compass', kind: 'compass-rose', rectPx: pad(rect([71, 72, 75, 76, 78, 79, 80, 83, 84, 94]), 6), placementPolicy: 'protected: overlays avoid it; cells stay valid' },
    { id: 'scale-statement', kind: 'scale-and-credit-lettering', rectPx: pad(rect([86, 87, 88, 89, 90, 91, 92, 93, 96, 97, 98, 99, 100, 101, 102, 103, 104]), 6), placementPolicy: 'protected: overlays avoid it; cells stay valid' },
  ];
}

/* ---------------- main ---------------- */

async function main() {
  const gridSpec = buildGridSpec();
  const grid = Geo.createGrid(gridSpec);
  const { anchors, classes } = await buildAnchors(grid);
  const slot = k => (verification && verification.slots && verification.slots[k]) || { status: 'pending', note: 'not yet verified' };
  const allPass = ['preparedAssets', 'geometry', 'browserBehavior', 'printProof'].every(k => slot(k).status === 'pass');
  const H = Math.hypot(gridSpec.basisRPx[0], gridSpec.basisRPx[1]);

  const template = {
    schemaVersion: 1,
    templateId: 'journey-to-horizon-original',
    templateVersion: '1.0.0',
    status: allPass ? 'promoted-geometry-verified' : 'promoted-pending-verification',
    readyForInteractivePlacement: allPass,
    verdict: allPass ? 'geometry-ready-for-owner-review' : 'pending',
    generatedBy: 'scripts/journey2/build-template.js',
    verification: {
      preparedAssets: slot('preparedAssets'),
      geometry: slot('geometry'),
      browserBehavior: slot('browserBehavior'),
      printProof: slot('printProof'),
      physicalPrintTest: { status: 'not-tested', note: 'Browser print-to-PDF only; no physical printer test was performed.' },
    },
    coordinateConvention: {
      sourcePanels: 'native image pixels; origin top-left; x right; y down',
      world: 'assembled world raster pixels (scale 1:1 with the native panels); origin top-left of the raster; independent of screen size and camera zoom',
      cells: 'integer axial q,r; id string "q,r"; centre = origin + q*basisQ + r*basisR; independent from browser pixels and camera zoom',
    },
    worldSizePx: composition.worldSizePx,
    assembledAsset: {
      path: composition.output.path,
      format: composition.output.format,
      sizePx: composition.worldSizePx,
      bytes: assembly.output.bytes,
      fileSha256: assembly.output.fileSha256,
      pixelSha256: assembly.output.pixelSha256,
      cacheKey: assembly.output.fileSha256.slice(0, 16),
      note: 'Lossless. Cache key is the first 16 hex chars of the file SHA-256, generated by build-template.js (never hand-edited).',
    },
    composition: {
      compositionId: composition.compositionId,
      descriptor: 'scripts/journey2/composition.json',
      reproduce: 'node scripts/journey2/prepare-map.js [--check]',
      sources: composition.panels.map(p => ({ id: p.id, sourcePath: p.sourcePath, sha256: p.sha256, nativeSizePx: p.nativeSizePx })),
      panels: composition.panels.map(p => ({ id: p.id, cropRectPx: p.cropRectPx, worldTranslatePx: p.worldTranslatePx, worldRectPx: p.worldRectPx })),
      seam: composition.seam,
      derivedImageScale: 1,
    },
    mapFrame: {
      innerRectPx: [FRAME.x0, FRAME.y0, FRAME.x1 - FRAME.x0, FRAME.y1 - FRAME.y0],
      note: 'Interior of the printed outer frame (frame lines and white print margin lie outside it). Half-open: x0 <= x < x0+w.',
    },
    grid: Object.assign({
      orientation: 'flat-top',
      calibrationStatus: verification && verification.gridCalibrationStatus ? verification.gridCalibrationStatus : 'measured-pending-verification',
      cellIdFormat: '"q,r" (integers)',
      hexShortDimensionPx: r4(H),
      hexCircumradiusPx: r4(H / Math.sqrt(3)),
      measurement: {
        method: 'per-cell observation of the six printed grid lines (perpendicular line-profile centroids), robust least-squares affine lattice on the fit cells; hold-out cells never influence the fit',
        report: 'docs/journey2-implementation/stage-0/CALIBRATION_REPORT.md',
        counts: fit.counts,
        fitResidualPx: fit.fitResidualPx,
        holdoutResidualPx: fit.holdoutResidualPx,
        anisotropy: fit.derived.anisotropy,
      },
    }, gridSpec, { controlPoints: verification ? verification.controlPoints : [] }),
    decorativeAreas: decorativeAreas(),
    sanctuaryAnchorsFile: 'map-anchors.json',
  };

  const sanctuaries = anchors.filter(a => a.kind === 'sanctuary').length;
  const anchorsDoc = {
    schemaVersion: 1,
    templateId: template.templateId,
    status: 'surveyed-visually-verified',
    complete: true,
    counts: { total: anchors.length, sanctuary: sanctuaries, destination: anchors.length - sanctuaries },
    surveyMethod: 'Assisted detection (black connected components, scripts/journey2/survey-markers.js) with every accepted and rejected candidate reviewed by eye against docs/journey2-implementation/stage-0/images/markers-candidates-*.png; decisions in scripts/journey2/marker-review.json.',
    glyphClasses: classes,
    anchors: anchors,
    notes: [
      'Anchors are immutable template data, not campaign state. Do not create, delete, move, duplicate or re-icon them.',
      'IDs are sequential in reading order of the final anchor positions and never depend on editable names.',
      'Marrogate and Horizon are named destinations lettered in the artwork (builtInLabel); no duplicate text is drawn and no sanctuary mechanics are assigned to either.',
      'kind "sanctuary" = the repeated unlabeled settlement glyphs (classes G1..); the source artwork itself does not name them, see CALIBRATION_REPORT.md "Marker survey".',
    ],
  };
  const dataDir = path.join(ROOT, 'data', 'journey2');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'map-template.json'), JSON.stringify(template, null, 1) + '\n');
  fs.writeFileSync(path.join(dataDir, 'map-anchors.json'), JSON.stringify(anchorsDoc, null, 1) + '\n');
  console.log(JSON.stringify({ status: template.status, ready: template.readyForInteractivePlacement, validCells: gridSpec.validCells.count, columns: Object.keys(gridSpec.validCells.columns).length, anchors: anchors.length, classes }, null, 1));
}

main().catch(e => { console.error(e); process.exit(1); });
