#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — scripts/journey2/verify-template.js
   Dev-only independent check of the PROMOTED runtime template
   (data/journey2/map-template.json) against the raster:

   1. Prepared assets: source panels still hash to the handoff manifest, the
      world raster reproduces from them (pixel hash), runtime symbols exist.
   2. Grid: every hold-out cell (never used by the fit) is re-observed from
      the raster and compared with the *stored, rounded* runtime geometry
      (js/journey2-geometry.js), not with the fitting internals.
   3. Control cells: >= 12 named cells spread over the west, east, outer
      areas, near Marrogate / Horizon and around the seam are re-observed
      (centres AND corners) and reported with their residuals.
   4. Seam: cells on both sides of the joint share one lattice; adjacency
      across the joint is exercised through the runtime geometry.
   5. Evidence images (control-cell sheet, zoom series, seam crops, residual
      map, corner crops).

   Writes docs/journey2-implementation/stage-0/data/geometry-verification.json
   (+ control-points.json, hold-out-verification.csv) and images/.
   The acceptance target is the project tolerance proposed in TASK-01: max
   discrepancy <= 3 % of the local hex short dimension.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const Geo = require('../../js/journey2-geometry.js');
const { loadDarkness, observeCell, neighbourVectors } = require('./lib/hex-observe');

const ROOT = path.join(__dirname, '..', '..');
const STAGE = path.join(ROOT, 'docs', 'journey2-implementation', 'stage-0');
/* Measurement inputs always come from the Stage 0 data folder. Outputs go to the same place by default;
 * --out <dir> (Task 01A) writes the regenerated verification data to <dir>/data instead, leaving the
 * submitted Stage 0 evidence untouched, and skips the (unchanged) evidence images. */
const outArg = process.argv.indexOf('--out');
const OUT_STAGE = outArg > -1 ? path.resolve(process.argv[outArg + 1]) : STAGE;
const IN_DATA = path.join(STAGE, 'data'), IMG = path.join(STAGE, 'images');
const DATA = path.join(OUT_STAGE, 'data');
fs.mkdirSync(DATA, { recursive: true });
const Csv = require('./lib/csv');
const { validateHoldoutCsv } = require('./lib/validate-holdout-csv');
const template = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'map-template.json'), 'utf8'));
const anchorsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'map-anchors.json'), 'utf8'));
const composition = require('./composition.json');
const grid = Geo.createGrid(template.grid);
const H = grid.shortDimensionPx;
const TOLERANCE_FRACTION = 0.03;
const TOLERANCE_PX = TOLERANCE_FRACTION * H;

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function stats(vals) {
  const n = vals.length;
  if (!n) return { n: 0 };
  const s = [...vals].sort((a, b) => a - b);
  const pct = p => s[Math.min(n - 1, Math.floor(p * n))];
  return { n, rms: Math.sqrt(vals.reduce((a, v) => a + v * v, 0) / n), mean: vals.reduce((a, v) => a + v, 0) / n, median: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: s[n - 1] };
}
const bq = template.grid.basisQPx, br = template.grid.basisRPx;

/** Observe a cell around the runtime-predicted centre; returns centre + corner observations. */
function observe(img, q, r) {
  const c = grid.cellCenter(q, r);
  const o = observeCell(img, c, bq, br);
  const res = { q, r, id: Geo.cellId(q, r), predicted: c, usable: o.usable, nEdges: o.edges.filter(e => e.m !== null).length, rmsEdge: o.rms, observed: null, residualPx: null, dx: null, dy: null, corners: [] };
  if (o.delta) {
    res.observed = [c[0] + o.delta[0], c[1] + o.delta[1]];
    res.dx = o.delta[0]; res.dy = o.delta[1];
    res.residualPx = Math.hypot(o.delta[0], o.delta[1]);
  }
  // observed corners: intersection of adjacent observed edge lines
  const n = neighbourVectors(bq, br);
  const pred = grid.cellCorners(q, r);
  for (let k = 0; k < 6; k++) {
    const e0 = o.edges[k], e1 = o.edges[(k + 1) % 6];
    if (e0.m === null || e1.m === null) { res.corners.push({ k, predicted: pred[k], observed: null, errorPx: null }); continue; }
    const d0 = Math.hypot(n[k][0], n[k][1]) / 2 + e0.m, d1 = Math.hypot(n[(k + 1) % 6][0], n[(k + 1) % 6][1]) / 2 + e1.m;
    const a = e0.nu, b = e1.nu;
    const det = a[0] * b[1] - a[1] * b[0];
    const x = (d0 * b[1] - d1 * a[1]) / det, y = (a[0] * d1 - b[0] * d0) / det;
    const ob = [c[0] + x, c[1] + y];
    res.corners.push({ k, predicted: pred[k], observed: ob, errorPx: Math.hypot(ob[0] - pred[k][0], ob[1] - pred[k][1]) });
  }
  return res;
}

/* Control targets: world points; the nearest hold-out cell with a usable observation is taken. */
const TARGETS = [
  { label: 'NW outer ocean', area: 'west / outer', at: [150, 420] },
  { label: 'W outer ocean, mid-height', area: 'west / outer', at: [120, 1700] },
  { label: 'SW corner ocean', area: 'west / corner', at: [70, 3140] },
  { label: 'Near Marrogate (land, east of the gate)', area: 'west / Marrogate', at: [290, 2930] },
  { label: 'West interior, north', area: 'west / interior', at: [1500, 800] },
  { label: 'West interior, centre', area: 'west / interior', at: [1300, 1650] },
  { label: 'Seam, upper', area: 'seam', at: [2424, 500] },
  { label: 'Seam, middle', area: 'seam', at: [2424, 1500] },
  { label: 'Seam, lower', area: 'seam', at: [2424, 2500] },
  { label: 'Immediately west of the seam', area: 'seam / west side', at: [2370, 1900] },
  { label: 'Immediately east of the seam', area: 'seam / east side', at: [2480, 1900] },
  { label: 'North centre ocean', area: 'outer', at: [2400, 90] },
  { label: 'East interior, centre', area: 'east / interior', at: [3500, 1500] },
  { label: 'East interior, south', area: 'east / interior', at: [3700, 2600] },
  { label: 'Near Horizon (below the figure)', area: 'east / Horizon', at: [4430, 395] },
  { label: 'NE corner ocean', area: 'east / corner', at: [4790, 45] },
  { label: 'E outer ocean, mid-height', area: 'east / outer', at: [4780, 1700] },
  { label: 'SE corner ocean', area: 'east / corner', at: [4790, 3140] },
  { label: 'South centre ocean', area: 'outer', at: [2400, 3130] },
];

async function checkAssets() {
  const checks = [];
  const handoff = path.join(ROOT, 'docs', 'journey2-handoff');
  for (const p of composition.panels) {
    const f = path.join(handoff, p.sourcePath);
    const ok = fs.existsSync(f) && sha256(fs.readFileSync(f)) === p.sha256;
    checks.push({ check: 'source panel hash ' + p.id, ok });
  }
  const worldFile = path.join(ROOT, template.assembledAsset.path);
  checks.push({ check: 'world raster exists', ok: fs.existsSync(worldFile) });
  if (fs.existsSync(worldFile)) {
    const bytes = fs.readFileSync(worldFile);
    checks.push({ check: 'world raster file hash matches template', ok: sha256(bytes) === template.assembledAsset.fileSha256 });
    const raw = await sharp(bytes).removeAlpha().raw().toBuffer();
    checks.push({ check: 'world raster pixel hash matches template', ok: sha256(raw) === template.assembledAsset.pixelSha256 });
    const meta = await sharp(bytes).metadata();
    checks.push({ check: 'world raster size matches template', ok: meta.width === template.worldSizePx[0] && meta.height === template.worldSizePx[1] });
  }
  const symbols = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'journey2', 'symbols.json'), 'utf8')).symbols;
  checks.push({ check: '12 runtime symbols present with matching hashes', ok: symbols.length === 12 && symbols.every(s => fs.existsSync(path.join(ROOT, s.path)) && sha256(fs.readFileSync(path.join(ROOT, s.path))) === s.sha256) });
  return checks;
}

async function main() {
  const img = await loadDarkness(path.join(ROOT, template.assembledAsset.path));
  const assetChecks = await checkAssets();

  // 2. hold-out cells (old measurement index q_old = q + 1)
  const csv = fs.readFileSync(path.join(IN_DATA, 'grid-observations.csv'), 'utf8').trim().split('\n').slice(1).map(l => l.split(','));
  const holdSet = csv.filter(f => f[7] === '1').map(f => ({ q: Number(f[0]) - 1, r: Number(f[1]) }));
  const holdout = [];
  for (const c of holdSet) {
    if (!grid.isValid(c.q, c.r)) continue;
    const o = observe(img, c.q, c.r);
    if (o.usable) holdout.push(o);
  }
  const holdRes = holdout.map(o => o.residualPx);
  const holdStats = stats(holdRes);
  const holdCorner = stats(holdout.flatMap(o => o.corners.filter(c => c.errorPx !== null).map(c => c.errorPx)));
  const holdSet2 = new Set(holdSet.map(c => Geo.cellId(c.q, c.r)));
  fs.writeFileSync(path.join(DATA, 'hold-out-verification.csv'), Csv.serialize([['cellId', 'predX', 'predY', 'obsX', 'obsY', 'residPx', 'fractionOfShortDim', 'nEdges']].concat(holdout.map(o => [o.id, o.predicted[0].toFixed(2), o.predicted[1].toFixed(2), o.observed[0].toFixed(2), o.observed[1].toFixed(2), o.residualPx.toFixed(3), (o.residualPx / H).toFixed(4), o.nEdges]))));

  // 3. control cells
  const controls = [];
  const used = new Set();
  for (const t of TARGETS) {
    const near = holdout.filter(o => !used.has(o.id)).sort((a, b) => Math.hypot(a.predicted[0] - t.at[0], a.predicted[1] - t.at[1]) - Math.hypot(b.predicted[0] - t.at[0], b.predicted[1] - t.at[1]));
    const o = near.find(c => c.nEdges >= 5) || near[0];
    used.add(o.id);
    const cornerErr = o.corners.filter(c => c.errorPx !== null);
    controls.push({
      id: o.id, label: t.label, area: t.area, targetWorldPx: t.at,
      distanceFromTargetPx: Math.round(Math.hypot(o.predicted[0] - t.at[0], o.predicted[1] - t.at[1])),
      predictedCenterPx: o.predicted.map(v => Math.round(v * 1000) / 1000),
      observedCenterPx: o.observed.map(v => Math.round(v * 1000) / 1000),
      residualPx: Math.round(o.residualPx * 1000) / 1000,
      residualFractionOfShortDimension: Math.round(o.residualPx / H * 10000) / 10000,
      edgesObserved: o.nEdges,
      edgesNotObserved: 6 - o.nEdges,
      cornersObserved: cornerErr.length,
      maxCornerErrorPx: cornerErr.length ? Math.round(Math.max(...cornerErr.map(c => c.errorPx)) * 1000) / 1000 : null,
      selection: 'nearest hold-out cell (never used in the fit) with >= 5 of 6 grid edges observable',
      observationBasis: 'six printed grid lines measured on the raster; no value is taken from the fitted grid',
    });
  }
  const ctlRes = controls.map(c => c.residualPx);
  const ctlStats = stats(ctlRes);
  const ctlCornerStats = stats(controls.flatMap(c => c.maxCornerErrorPx === null ? [] : [c.maxCornerErrorPx]));
  const ctlObs = controls.map(c => holdout.find(o => o.id === c.id));
  fs.writeFileSync(path.join(DATA, 'control-points.json'), JSON.stringify({
    schemaVersion: 1,
    generatedBy: 'scripts/journey2/verify-template.js',
    shortDimensionPx: H,
    tolerance: { fractionOfShortDimension: TOLERANCE_FRACTION, px: TOLERANCE_PX, note: 'Proposed project tolerance (TASK-01 section 3); not a measurement claimed by the source.' },
    stats: { residualPx: ctlStats, residualFractionOfShortDimension: { rms: ctlStats.rms / H, max: ctlStats.max / H }, maxCornerErrorPx: ctlCornerStats },
    controlPoints: controls,
  }, null, 1) + '\n');

  // 4. seam adjacency through runtime geometry
  const seamX = composition.seam.worldX;
  let seamPairs = 0, seamBroken = 0, seamOutsideMap = 0;
  grid.forEachValidCell((q, r) => {
    const c = grid.cellCenter(q, r);
    if (Math.abs(c[0] - seamX) > 40) return;
    for (const n of grid.neighbors(q, r)) {
      const nc = grid.cellCenter(n.q, n.r);
      if ((c[0] < seamX) !== (nc[0] < seamX)) {
        // reciprocal adjacency + exact one-lattice-step distance; a neighbour outside the frame is simply not a map cell
        if (!n.valid) { seamOutsideMap++; continue; }
        seamPairs++;
        const back = grid.neighbors(n.q, n.r).some(m => m.q === q && m.r === r);
        const d = Math.hypot(nc[0] - c[0], nc[1] - c[1]);
        if (!back || Math.abs(d - H) > 0.05) seamBroken++;
      }
    }
  });
  const seamCells = holdout.filter(o => Math.abs(o.predicted[0] - seamX) < 60);
  const seamStats = stats(seamCells.map(o => o.residualPx));

  // region residual breakdown (west half / east half / near seam / outer ocean ring)
  const regions = { west: [], east: [], seamBand: [] };
  for (const o of holdout) { (Math.abs(o.predicted[0] - seamX) < 120 ? regions.seamBand : o.predicted[0] < seamX ? regions.west : regions.east).push(o.residualPx); }

  // the exported hold-out CSV must parse with a real CSV parser and reproduce the statistics above (Task 01A)
  const csvResult = validateHoldoutCsv(fs.readFileSync(path.join(DATA, 'hold-out-verification.csv'), 'utf8'), { holdout: { observed: holdout.length, residualPx: holdStats } }, template);
  fs.writeFileSync(path.join(DATA, 'hold-out-csv-validation.json'), JSON.stringify(csvResult, null, 1) + '\n');
  const holdoutCsvChecks = [{ check: `hold-out-verification.csv parses and round-trips (${csvResult.checks.filter(c => c.ok).length}/${csvResult.checks.length} checks)`, ok: csvResult.ok, value: csvResult.checks.filter(c => !c.ok) }];
  const geometryChecks = [
    { check: `hold-out max residual <= ${TOLERANCE_FRACTION * 100}% of short dimension (${TOLERANCE_PX.toFixed(2)} px)`, ok: holdStats.max <= TOLERANCE_PX, value: holdStats.max },
    { check: `all ${controls.length} control cells within tolerance`, ok: ctlStats.max <= TOLERANCE_PX, value: ctlStats.max },
    { check: '>= 12 control cells', ok: controls.length >= 12, value: controls.length },
    { check: 'control cells cover west, east, seam, outer areas, Marrogate and Horizon', ok: ['west', 'east', 'seam', 'outer', 'Marrogate', 'Horizon'].every(k => controls.some(c => c.area.includes(k))), value: [...new Set(controls.map(c => c.area))] },
    { check: 'cell adjacency continues across the panel joint (reciprocal, exactly one lattice step)', ok: seamPairs > 90 && seamBroken === 0, value: { pairs: seamPairs, broken: seamBroken, outsideFrame: seamOutsideMap } },
    { check: 'grid is regular (anisotropy within 0.1 %)', ok: Math.abs(template.grid.measurement.anisotropy - 1) < 0.001, value: template.grid.measurement.anisotropy },
    { check: 'anchor survey complete and every anchor visually verified', ok: anchorsDoc.complete === true && anchorsDoc.anchors.every(a => a.verificationStatus === 'visually-verified'), value: anchorsDoc.counts },
    ...holdoutCsvChecks,
    { check: 'every anchor lies in a valid cell', ok: anchorsDoc.anchors.every(a => { const c = Geo.parseCellId(a.cellId); return c && grid.isValid(c.q, c.r); }) },
  ];
  const geometryPass = geometryChecks.every(c => c.ok);
  const assetsPass = assetChecks.every(c => c.ok);

  const out = {
    schemaVersion: 1,
    generatedBy: 'scripts/journey2/verify-template.js',
    gridCalibrationStatus: geometryPass ? 'measured-verified' : 'measured-failed-verification',
    slots: {
      preparedAssets: { status: assetsPass ? 'pass' : 'fail', checks: assetChecks, verifiedBy: 'scripts/journey2/verify-template.js' },
      geometry: { status: geometryPass ? 'pass' : 'fail', checks: geometryChecks.map(c => ({ check: c.check, ok: c.ok })), verifiedBy: 'scripts/journey2/verify-template.js' },
    },
    controlPoints: controls.map(c => ({ id: c.id, label: c.label, area: c.area, predictedCenterPx: c.predictedCenterPx, observedCenterPx: c.observedCenterPx, residualPx: c.residualPx, residualFractionOfShortDimension: c.residualFractionOfShortDimension, edgesObserved: c.edgesObserved })),
    holdout: {
      cells: holdSet2.size, observed: holdout.length,
      residualPx: holdStats, residualFractionOfShortDimension: { rms: holdStats.rms / H, p99: holdStats.p99 / H, max: holdStats.max / H },
      cornerErrorPx: holdCorner,
      byRegionPx: { west: stats(regions.west), seamBand: stats(regions.seamBand), east: stats(regions.east) },
    },
    control: { count: controls.length, residualPx: ctlStats, residualFractionOfShortDimension: { rms: ctlStats.rms / H, max: ctlStats.max / H }, cornerErrorPx: ctlCornerStats },
    seam: { pairs: seamPairs, broken: seamBroken, neighboursOutsideFrame: seamOutsideMap, cellsObservedWithin60px: seamCells.length, residualPx: seamStats },
    geometryChecks,
  };
  fs.writeFileSync(path.join(DATA, 'geometry-verification.json'), JSON.stringify(out, null, 1) + '\n');

  if (OUT_STAGE === STAGE) await renderEvidence(img, controls, ctlObs, holdout);
  console.log(JSON.stringify({ geometryPass, assetsPass, holdout: out.holdout.residualPx, control: out.control, seam: out.seam, failing: geometryChecks.filter(c => !c.ok).concat(assetChecks.filter(c => !c.ok)) }, null, 1));
}

/* ---------------- evidence images ---------------- */

function poly(pts, ox, oy, z) { return pts.map(p => ((p[0] - ox) * z).toFixed(2) + ',' + ((p[1] - oy) * z).toFixed(2)).join(' '); }

async function renderEvidence(img, controls, ctlObs, holdout) {
  const WORLD = path.join(ROOT, template.assembledAsset.path);
  const [W, Hh] = template.worldSizePx;
  const crop = async (left, top, w, h, z) => sharp(WORLD).removeAlpha().extract({ left, top, width: w, height: h }).resize(Math.round(w * z), Math.round(h * z), { kernel: 'nearest' }).png().toBuffer();
  const clampBox = (cx, cy, w, h) => [Math.round(Math.min(Math.max(0, cx - w / 2), W - w)), Math.round(Math.min(Math.max(0, cy - h / 2), Hh - h))];

  // control-cell sheet
  const S = 150, Z = 2, COLS = 5, PAD = 8, LBL = 28;
  const rows = Math.ceil(controls.length / COLS);
  const cw = S * Z + PAD, sheetW = COLS * cw + PAD, sheetH = rows * (cw + LBL) + PAD;
  const comp = [];
  let ov = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}" height="${sheetH}">`;
  for (let i = 0; i < controls.length; i++) {
    const c = controls[i], o = ctlObs[i];
    const [left, top] = clampBox(o.predicted[0], o.predicted[1], S, S);
    const x = PAD + (i % COLS) * cw, y = PAD + Math.floor(i / COLS) * (cw + LBL) + LBL;
    comp.push({ input: await crop(left, top, S, S, Z), left: x, top: y });
    ov += `<g transform="translate(${x},${y})">`;
    ov += `<polygon points="${poly(grid.cellCorners(o.q, o.r), left, top, Z)}" fill="none" stroke="#d6007a" stroke-width="1" stroke-opacity="0.85"/>`;
    const pc = [(o.predicted[0] - left) * Z, (o.predicted[1] - top) * Z], oc = [(o.observed[0] - left) * Z, (o.observed[1] - top) * Z];
    ov += `<path d="M${pc[0] - 6} ${pc[1]}h12M${pc[0]} ${pc[1] - 6}v12" stroke="#d6007a" stroke-width="1"/>`;
    ov += `<path d="M${oc[0] - 4} ${oc[1] - 4}l8 8M${oc[0] - 4} ${oc[1] + 4}l8 -8" stroke="#0a8f3c" stroke-width="1.5"/>`;
    ov += '</g>';
    ov += `<text x="${x}" y="${y - 16}" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="bold">${i + 1}. ${c.label}</text>`;
    ov += `<text x="${x}" y="${y - 4}" font-family="Arial,Helvetica,sans-serif" font-size="11">cell ${c.id}  residual ${c.residualPx.toFixed(2)} px (${(c.residualFractionOfShortDimension * 100).toFixed(2)} %)  edges ${c.edgesObserved}/6</text>`;
  }
  ov += '</svg>';
  await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#ffffff' } }).composite([...comp, { input: Buffer.from(ov), left: 0, top: 0 }]).png().toFile(path.join(IMG, 'control-cells-sheet.png'));

  // zoom series on the first seam control cell, around its east vertex
  const seamCtl = ctlObs[controls.findIndex(c => c.area === 'seam')];
  const vx = grid.cellCorners(seamCtl.q, seamCtl.r)[0];
  const panels = [];
  let zsvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${4 * 380}" height="400">`;
  for (let i = 0; i < 4; i++) {
    const size = [180, 90, 45, 22][i], z = 360 / size;
    const [left, top] = clampBox(vx[0], vx[1], size, size);
    panels.push({ input: await crop(left, top, size, size, z), left: i * 380 + 10, top: 30 });
    zsvg += `<g transform="translate(${i * 380 + 10},30)">`;
    for (const cell of grid.cellsInRect(left, top, left + size, top + size, 50)) {
      zsvg += `<polygon points="${poly(grid.cellCorners(cell.q, cell.r), left, top, z)}" fill="none" stroke="#d6007a" stroke-width="0.8" stroke-opacity="0.8"/>`;
    }
    zsvg += '</g>';
    zsvg += `<text x="${i * 380 + 10}" y="20" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="bold">${(z).toFixed(1)}x  (${size} px of world), seam control cell ${seamCtl.id} east vertex</text>`;
  }
  zsvg += '</svg>';
  await sharp({ create: { width: 4 * 380, height: 400, channels: 3, background: '#ffffff' } }).composite([...panels, { input: Buffer.from(zsvg), left: 0, top: 0 }]).png().toFile(path.join(IMG, 'control-zoom-series.png'));

  // seam crops: raw | overlay, three heights
  for (const [name, cy] of [['upper', 500], ['middle', 1500], ['lower', 2500]]) {
    const w = 300, h = 260, z = 3;
    const [left, top] = clampBox(template.composition.seam.worldX, cy, w, h);
    const raw = await crop(left, top, w, h, z);
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * z}" height="${h * z}">`;
    for (const cell of grid.cellsInRect(left, top, left + w, top + h, 50)) svg += `<polygon points="${poly(grid.cellCorners(cell.q, cell.r), left, top, z)}" fill="none" stroke="#d6007a" stroke-width="1" stroke-opacity="0.8"/>`;
    const sx = (template.composition.seam.worldX - left) * z;
    svg += `<line x1="${sx}" y1="0" x2="${sx}" y2="${h * z}" stroke="#0a5fd6" stroke-width="1" stroke-dasharray="6 4"/>`;
    svg += `<text x="${sx + 6}" y="16" font-family="Arial,Helvetica,sans-serif" font-size="13" fill="#0a5fd6" font-weight="bold">panel joint x=${template.composition.seam.worldX}</text></svg>`;
    await sharp({ create: { width: w * z * 2 + 12, height: h * z, channels: 3, background: '#ffffff' } })
      .composite([{ input: raw, left: 0, top: 0 }, { input: await sharp(raw).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer(), left: w * z + 12, top: 0 }])
      .png().toFile(path.join(IMG, `seam-${name}.png`));
  }

  // corner crops with overlay
  for (const [name, cx, cy] of [['nw', 120, 120], ['ne', 4730, 120], ['sw', 120, 3070], ['se', 4730, 3070]]) {
    const w = 240, h = 180, z = 4;
    const [left, top] = clampBox(cx, cy, w, h);
    const base = await crop(left, top, w, h, z);
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * z}" height="${h * z}">`;
    for (const cell of grid.cellsInRect(left, top, left + w, top + h, 50)) {
      svg += `<polygon points="${poly(grid.cellCorners(cell.q, cell.r), left, top, z)}" fill="none" stroke="${grid.isValid(cell.q, cell.r) ? '#d6007a' : '#999999'}" stroke-width="1" stroke-opacity="0.8"/>`;
    }
    svg += '</svg>';
    await sharp(base).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toFile(path.join(IMG, `corner-${name}.png`));
  }

  // residual map
  const SC = 0.5;
  let rsvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W * SC)}" height="${Math.round(Hh * SC)}">`;
  const csv = fs.readFileSync(path.join(DATA, 'grid-observations.csv'), 'utf8').trim().split('\n').slice(1).map(l => l.split(','));
  for (const f of csv) {
    if (f[4] !== '1' || f[8] === '') continue;
    const res = Number(f[8]), px = Number(f[2]) * SC, py = Number(f[3]) * SC;
    const col = res < 0.4 ? '#1a9850' : res < 0.9 ? '#fee08b' : res < 1.8 ? '#f46d43' : '#a50026';
    rsvg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${f[7] === '1' ? 4 : 2.5}" fill="${col}" ${f[7] === '1' ? 'stroke="#000" stroke-width="0.8"' : ''} fill-opacity="0.9"/>`;
  }
  for (const c of controls) { const o = c.predictedCenterPx; rsvg += `<circle cx="${o[0] * SC}" cy="${o[1] * SC}" r="9" fill="none" stroke="#0a5fd6" stroke-width="2"/>`; }
  rsvg += `<line x1="${template.composition.seam.worldX * SC}" y1="0" x2="${template.composition.seam.worldX * SC}" y2="${Hh * SC}" stroke="#0a5fd6" stroke-width="1" stroke-dasharray="6 4"/></svg>`;
  const rbase = await sharp(WORLD).removeAlpha().resize(Math.round(W * SC), Math.round(Hh * SC)).modulate({ brightness: 1.12 }).png().toBuffer();
  await sharp(rbase).composite([{ input: Buffer.from(rsvg), left: 0, top: 0 }]).png().toFile(path.join(IMG, 'grid-residual-map.png'));
}

main().catch(e => { console.error(e); process.exit(1); });
