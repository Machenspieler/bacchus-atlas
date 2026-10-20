'use strict';
/* Audit 07 release fixes. F-01: a revealed sanctuary name stays fully inside its print page — the clamp uses real glyph metrics plus the halo, not the flat
   0.6 em estimate. O-01: native browser printing of the ordinary Journey page prints one instruction line, never the GM editor; the official Player Print and every
   other route are untouched. O-04: the browser print verification picks its print control by state, not by DOM order. Pure / source-level — no browser. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const G = require('../js/journey2-geometry.js');
const M = require('../js/journey2-model.js');
const PR = require('../js/journey2-print.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
const template = JSON.parse(read('data/journey2/map-template.json'));
const anchorsDoc = JSON.parse(read('data/journey2/map-anchors.json'));
const ctx = M.createContext(template, anchorsDoc);
const PAGES = PR.pagesFromTemplate(template);
const SEAM = template.composition.seam.worldX;
const STROKE = 3;                                      // the print label halo (css `.j2-pp-svg .j2-sanc-label`)

/* Chrome's measured advances (em, "Architects Daughter", uppercase) — an independent copy of what the renderer will actually draw */
const REAL_EM = { W: 0.9404, A: 0.6406, T: 0.6230, E: 0.5918, R: 0.7129, S: 0.6426, H: 0.6055, P: 0.6377, I: 0.1514, K: 0.6055, B: 0.7109, U: 0.5615, N: 0.6270 };
const realInkWidth = name => [...name.toUpperCase()].reduce((a, ch) => a + REAL_EM[ch] * 17 + 0.02 * 17, 0) + STROKE;

const anchor = (id, x, y) => ({ id, rect: [x - 12, y - 12, 24, 24] });
const place = (name, x, bounds, opts) => {
  const a = anchor('a', x, 1500);
  const l = G.layoutSanctuaryLabels([{ anchorId: 'a', name }], [a], Object.assign({ icons: [a], bounds }, opts || { ink: { strokePx: STROKE } }))[0];
  return { l, left: l.cx - l.w / 2, right: l.cx + l.w / 2 };
};
// the label bounds of the north row's sheets either side of the central seam (columns 2 and 3), and of the two outer sheets: the tile itself (PD-073)
const WEST = PAGES[1].labelBounds, EAST = PAGES[2].labelBounds, OUTER_WEST = PAGES[0].labelBounds, OUTER_EAST = PAGES[3].labelBounds;
const boundsOf = b => b;
const MARGIN = 0;                                       // butt-joined tiles: a label may reach the seam, but its ink stays inside its own tile

test('F-01: the old flat estimate really was too narrow for Watershaw (the audited defect)', () => {
  const old = place('Watershaw', SEAM + 21, boundsOf(EAST), { });          // no `ink` option = the previous estimate
  assert.ok(old.right - old.left < realInkWidth('Watershaw') - 15, 'flat estimate ' + (old.right - old.left) + ' vs real ' + realInkWidth('Watershaw'));
});

test('F-01: label near the central seam keeps its whole first letter on the east sheet and its last on the west one', () => {
  const e = place('Watershaw', SEAM + 21, boundsOf(EAST));
  assert.ok(e.left >= SEAM + MARGIN + 4 - 1e-9, 'left ink edge ' + (e.left - SEAM) + ' px inside the east page');
  assert.ok(e.right - e.left >= realInkWidth('Watershaw'), 'box covers the real rendered ink');
  const w = place('Watershaw', SEAM - 21, boundsOf(WEST));
  assert.ok(w.right <= SEAM - MARGIN - 4 + 1e-9, 'right ink edge ' + (SEAM - w.right) + ' px inside the west page');
});

test('F-01: western and eastern outer edges are respected too', () => {
  const west = place('Watershaw', 6, boundsOf(OUTER_WEST));
  assert.ok(west.left >= 4 - 1e-9);
  const east = place('Watershaw', template.worldSizePx[0] - 6, boundsOf(OUTER_EAST));
  assert.ok(east.right <= template.worldSizePx[0] - 4 + 1e-9);
});

test('F-01: wide characters (a name of capital Ws) and the halo are inside the clamp', () => {
  const w = place('WWWWWWWWW', SEAM + 10, boundsOf(EAST));
  assert.ok(w.left >= SEAM + MARGIN + 4 - 1e-9);
  assert.ok(w.right - w.left >= 9 * 0.9404 * 17 + STROKE, 'at least the glyphs plus the halo');
  const withStroke = place('Watershaw', 2000, boundsOf(WEST)), noStroke = place('Watershaw', 2000, boundsOf(WEST), { ink: { strokePx: 0 } });
  assert.ok(Math.abs((withStroke.right - withStroke.left) - (noStroke.right - noStroke.left) - STROKE) < 1e-9, 'the stroke adds its full width');
  assert.ok(G.inkLineWidth('Watershaw', 17, STROKE) >= realInkWidth('Watershaw'));
});

test('F-01: every real sanctuary icon, with the widest plausible name, keeps its label inside its own page; typical names stay centred under the icon', () => {
  for (const s of ctx.sanctuaries) {
    const page = PR.pageOfPoint([s.x, s.y], PAGES), b = boundsOf(page.labelBounds);
    for (const name of ['Watershaw', 'Wiwiwiwiw']) {
      const l = G.layoutSanctuaryLabels([{ anchorId: s.id, name }], [{ id: s.id, rect: s.rect }], { icons: ctx.iconRects, ink: { strokePx: STROKE }, bounds: b })[0];
      assert.ok(l.cx - l.w / 2 >= b[0] + 4 - 1e-9 && l.cx + l.w / 2 <= b[2] - 4 + 1e-9, s.id + ' ' + name);
    }
  }
  const mid = place('Pikebun', 2200, boundsOf(WEST));
  assert.equal(mid.l.cx, 2200, 'unclamped label stays centred on its icon');
  assert.equal(mid.l.placement, 'below');
});

test('F-01: layout without `ink` is byte-for-byte the screen layout (Player Preview unchanged), and the print model passes the halo', () => {
  const a = anchor('a', 900, 900);
  const screen = G.layoutSanctuaryLabels([{ anchorId: 'a', name: 'Watershaw' }], [a], { icons: [a], world: ctx.worldSize })[0];
  assert.equal(screen.w, 'Watershaw'.length * G.LABEL_FONT_PX * 0.6);
  assert.match(read('js/journey2-print.js'), /ink:\s*\{\s*strokePx:\s*LABEL_STROKE_PX\s*\}/);
  assert.match(read('js/journey2-print.js'), /LABEL_STROKE_PX = 3;/);
  assert.match(strip(read('css/journey2.css')), /\.j2-pp-svg \.j2-sanc-label \{[^}]*stroke-width:\s*3px/, 'the constant mirrors the print halo');
  assert.ok(!/ink:/.test(read('js/journey2-view.js').slice(read('js/journey2-view.js').indexOf('layoutSanctuaryLabels({'))), 'screen layout call has no ink option');
});

/* ---------------- O-01 ---------------- */

const css = strip(read('css/journey2.css'));
const safetyBlock = css.slice(css.indexOf('.j2-print-safety { display: none; }'), css.indexOf('.j2-insp-scroll[hidden]'));

test('O-01: native print of the ordinary Journey page hides every body child except the one instruction line', () => {
  assert.match(css, /\.j2-print-safety \{ display: none; \}/, 'invisible on screen');
  assert.match(safetyBlock, /@media print \{[\s\S]*body\[data-j2\]:not\(\.j2-printpreview-mode\):not\(\.j2-print-mode\) > \*:not\(\.j2-print-safety\) \{ display: none !important; \}/);
  assert.match(safetyBlock, /body\[data-j2\]:not\(\.j2-printpreview-mode\):not\(\.j2-print-mode\) > \.j2-print-safety \{ display: block;/);
});

test('O-01: the official Player Print and the legacy proof are excluded from the fallback, and keep their own rules', () => {
  const sel = safetyBlock.match(/body\[data-j2\][^{]*\{/g);
  assert.ok(sel.length >= 3);
  for (const s of sel) assert.ok(s.includes(':not(.j2-printpreview-mode)') && s.includes(':not(.j2-print-mode)'), s);
  assert.match(css, /body\.j2-printpreview-mode > \*:not\(\.j2-printpreview\)\s*\{[^}]*display:\s*none !important/);
  assert.ok(!/j2-print-safety/.test(css.slice(css.indexOf('@page j2player'), css.indexOf('.j2-print-safety { display: none; }'))), 'official print rules never mention the safety line');
});

test('O-01: scope is the Journey page only — no global print rule, no other route can match', () => {
  const view = read('js/journey2-view.js'), app = read('js/app.js');
  assert.match(view, /document\.body\.dataset\.j2 = 'on'/);
  assert.match(view, /delete document\.body\.dataset\.j2/);
  assert.ok(!/dataset\.j2|data-j2\b/.test(app), 'only the Journey view ever sets the scope attribute');
  for (const f of ['css/styles.css', 'css/prep.css'].filter(f => fs.existsSync(path.join(ROOT, f)))) assert.ok(!/j2-print-safety|body\[data-j2\]/.test(read(f)), f);
  const safetyRules = safetyBlock.split('\n').filter(l => /display: none !important/.test(l));
  for (const l of safetyRules) assert.ok(/^\s*body\[data-j2\]/.test(l), 'every hiding rule is scoped by body[data-j2]: ' + l);
});

test('O-01: the instruction is localized, names the real buttons, is mounted/removed with the view and follows a language switch', () => {
  const i18n = JSON.parse(read('data/i18n.json'));
  const en = i18n.en.journey2_pp_native_safe, ru = i18n.ru.journey2_pp_native_safe;
  assert.ok(en.includes(i18n.en.journey2_preview) && en.includes(i18n.en.journey2_pp_open));
  assert.ok(ru.includes(i18n.ru.journey2_preview) && ru.includes(i18n.ru.journey2_pp_open));
  const view = read('js/journey2-view.js');
  assert.match(view, /function mountPrintSafety\(\)/);
  assert.match(view, /if \(printSafety\) \{ printSafety\.remove\(\); printSafety = null; \}/);
  assert.match(view, /if \(printSafety\) printSafety\.textContent = t\('journey2_pp_native_safe'\);/);
  assert.ok(view.indexOf('let printSafety = null') < view.indexOf('mountPrintSafety();'), 'declared before first use');
  assert.ok(!/<p class="j2-print-safety"|innerHTML[^;]*print-safety/.test(view), 'plain text, no markup');
});

/* ---------------- O-04 ---------------- */

test('O-04: the browser print verification selects duplicated controls by structure and panel state, never by bare selector or DOM order', () => {
  const src = read('scripts/journey2/lib/print-checks.js');
  assert.ok(!/page\.(click|locator)\('\[data-j2-print-open\]'\)\.(click|innerText|isVisible)/.test(src), 'no bare [data-j2-print-open] interaction');
  assert.match(src, /'\[data-j2-rail\] \[data-j2-print-open\]' : '#j2-side \[data-j2-print-open\]'/);
  assert.match(src, /:visible:not\(\[disabled\]\)/);
  assert.match(src, /expected exactly one displayed, enabled/);
  assert.match(src, /const sideCtl = async sel =>/);
  assert.match(src, /print\.02b\.rail-print-control-opens-the-same-official-print/);
  assert.ok(!/page\.click\('\[data-j2-(fit|side-toggle|preview-back)\]'\)/.test(src), 'duplicated controls are never clicked bare');
});
