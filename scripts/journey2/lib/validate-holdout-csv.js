/* Dev-only. Validates hold-out-verification.csv with the standards-compliant parser in ./csv.js
   (never a comma split) against the runtime geometry and the geometry-verification JSON.
   Returns { ok, checks:[{check, ok, value}] }; a malformed file yields a single failing
   'parses' check rather than an exception. */
'use strict';
const Csv = require('./csv');
const Geo = require('../../../js/journey2-geometry.js');

const HEADER = ['cellId', 'predX', 'predY', 'obsX', 'obsY', 'residPx', 'fractionOfShortDim', 'nEdges'];
/* Documented rounding: coordinates are written to 0.01 px, residuals to 0.001 px, the fraction to 1e-4. */
const TOL = { coordPx: 0.01, residPx: 0.02, statPx: 0.001, fraction: 1e-4 };
const PARSES = "parses with a standards-compliant parser; every row has the header's field count";

function validateHoldoutCsv(text, geometryJson, template) {
  const checks = []; const add = (check, ok, value) => checks.push({ check, ok: !!ok, value });
  let rows;
  try { rows = Csv.parseObjects(text); } catch (e) { add(PARSES, false, e.message); return { ok: false, checks }; }
  const header = Csv.parse(text)[0];
  add('header is the documented 8-column schema', JSON.stringify(header) === JSON.stringify(HEADER), header);
  add(PARSES, true, rows.length + ' rows x ' + header.length + ' fields');
  add('row count equals the observed hold-out count in geometry-verification.json', rows.length === geometryJson.holdout.observed, [rows.length, geometryJson.holdout.observed]);

  const grid = Geo.createGrid(template.grid), H = grid.shortDimensionPx;
  const ids = new Set(); let badId = 0, negQ = 0, negR = 0, invalidCell = 0, nonFinite = 0, badEdges = 0, centreDiff = 0, residDiff = 0, fracDiff = 0;
  const resid = [], edges = [];
  for (const r of rows) {
    const c = Geo.parseCellId(r.cellId);
    if (!c || Geo.cellId(c.q, c.r) !== r.cellId) { badId++; continue; }
    if (c.q < 0) negQ++;
    if (c.r < 0) negR++;
    ids.add(r.cellId);
    if (!grid.isValid(c.q, c.r)) invalidCell++;
    const num = ['predX', 'predY', 'obsX', 'obsY', 'residPx', 'fractionOfShortDim'].map(k => (/^-?\d+(\.\d+)?$/.test(r[k]) ? Number(r[k]) : NaN));
    if (!num.every(Number.isFinite)) { nonFinite++; continue; }
    const [px, py, ox, oy, rp, fr] = num;
    if (!/^\d+$/.test(r.nEdges) || Number(r.nEdges) < 4 || Number(r.nEdges) > 6) badEdges++;
    edges.push(Number(r.nEdges));
    const cc = grid.cellCenter(c.q, c.r);
    centreDiff = Math.max(centreDiff, Math.hypot(cc[0] - px, cc[1] - py));
    residDiff = Math.max(residDiff, Math.abs(Math.hypot(ox - px, oy - py) - rp));
    fracDiff = Math.max(fracDiff, Math.abs(rp / H - fr));
    resid.push(rp);
  }
  add('every cellId is a canonical "q,r" id that round-trips through parseCellId/cellId', badId === 0, { malformed: badId });
  add('cell ids are unique', ids.size === rows.length, [ids.size, rows.length]);
  add('negative coordinates, where present, round-trip (informational)', true, { negativeQ: negQ, negativeR: negR });
  add('every id is a valid runtime cell', invalidCell === 0, { invalid: invalidCell });
  add('numeric columns are finite decimals', nonFinite === 0, { nonFinite });
  add('nEdges is an integer in the observed valid range 4..6', badEdges === 0 && edges.length > 0, { min: Math.min(...edges), max: Math.max(...edges), bad: badEdges });
  add('exported predicted centres equal the runtime cell centres (runtime id convention) within rounding ' + TOL.coordPx + ' px', centreDiff <= TOL.coordPx, centreDiff);
  add('residPx equals the predicted-to-observed distance within rounding ' + TOL.residPx + ' px', residDiff <= TOL.residPx, residDiff);
  add('fractionOfShortDim equals residPx / short dimension within ' + TOL.fraction, fracDiff <= TOL.fraction, fracDiff);
  const rms = Math.sqrt(resid.reduce((s, v) => s + v * v, 0) / resid.length), max = Math.max(...resid);
  const J = geometryJson.holdout.residualPx;
  add('RMS recomputed from the CSV agrees with geometry-verification.json within ' + TOL.statPx + ' px', Math.abs(rms - J.rms) <= TOL.statPx, { csv: rms, json: J.rms });
  add('max recomputed from the CSV agrees with geometry-verification.json within ' + TOL.statPx + ' px', Math.abs(max - J.max) <= TOL.statPx, { csv: max, json: J.max });
  return { ok: checks.every(c => c.ok), checks, stats: { n: resid.length, rms, max } };
}

module.exports = { validateHoldoutCsv, HEADER, TOL };
