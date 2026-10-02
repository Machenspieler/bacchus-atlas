// Builds the contact sheets, manifest.json, capture-report.md and README.md
// from what the capture run actually produced.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { sheet, vpName } from './harness.mjs';

const VP1440 = { width: 1440, height: 900 };

const byFile = rec => new Map(rec.entries.map(e => [path.basename(e.file), e]));
const has = (rec, re) => rec.entries.filter(e => re.test(e.file));

/* ---------------------------------------------------------------- sheets */
export async function buildSheets(rec, OUT) {
  const s = { vp: VP1440, outDir: OUT, rec };
  const m = rec.measurements;
  const file = f => rec.entries.find(e => e.file === `crops/${f}`)?.file;
  const pick = re => has(rec, re);
  const fam = m;                       // iconFamily_<name>
  const famNames = Object.keys(fam).filter(k => k.startsWith('iconFamily_')).map(k => k.slice(11));

  // Icon-button family sheets (equal-zoom tight crops).
  const famInfo = n => fam[`iconFamily_${n}`] || {};
  const familyCrop = (n, st) => rec.entries.find(e => e.file.endsWith(`__icon-${n}-${st}__crop.png`) && e.viewport.width === 1440);
  for (const st of ['default', 'hover', 'focus-visible', 'disabled']) {
    const items = famNames.map(n => ({ n, e: familyCrop(n, st) })).filter(x => x.e)
      .sort((a, b) => parseFloat(famInfo(a.n).box) - parseFloat(famInfo(b.n).box))
      .map(({ n, e }) => ({ file: e.file, label: `${n} · box ${famInfo(n).box} · r ${famInfo(n).radius} · ${famInfo(n).glyph === 'svg' ? 'svg ' + famInfo(n).svgSize : 'glyph "' + famInfo(n).glyph + '"'}` }));
    if (items.length) await sheet(s, { page: 'ui', state: `icon-button-families-${st}`, items, cols: 4, cell: { w: 340, h: 215 }, purpose: `Every icon-only button family at "${st}", equal 4x zoom, ordered by hit-box size.`, refs: ['Top Issue 1', 'Needs Visual Review 1', 'Needs Visual Review 12'] });
  }
  // Optical size: ordered by rendered svg size.
  {
    const items = famNames.map(n => ({ n, e: familyCrop(n, 'default'), i: famInfo(n) })).filter(x => x.e && x.i.svgSize)
      .sort((a, b) => parseFloat(a.i.svgSize) - parseFloat(b.i.svgSize))
      .map(({ n, e, i }) => ({ file: e.file, label: `${n} · svg ${i.svgSize} · stroke ${(i.strokeWidths || []).join('/') || '-'} · fill ${i.svgFill || 'none'}` }));
    if (items.length) await sheet(s, { page: 'ui', state: 'icon-optical-by-svg-size', items, cols: 4, cell: { w: 340, h: 215 }, purpose: 'Icons sorted by rendered SVG size (13–20px) with stroke widths, for optical-weight comparison.', refs: ['Needs Visual Review 1', 'Top Issue 9'] });
  }
  // × glyph vs svg.
  {
    const glyph = famNames.filter(n => famInfo(n).glyph && famInfo(n).glyph !== 'svg');
    const svg = famNames.filter(n => famInfo(n).glyph === 'svg' && /clear|del|remove|close|trash/.test(n));
    const items = [...glyph, ...svg].map(n => ({ n, e: familyCrop(n, 'default') })).filter(x => x.e)
      .map(({ n }) => ({ file: familyCrop(n, 'default').file, label: `${n} · ${famInfo(n).glyph === 'svg' ? 'SVG icon' : 'text glyph "' + famInfo(n).glyph + '"'}` }));
    if (items.length) await sheet(s, { page: 'ui', state: 'close-remove-glyph-vs-svg', items, cols: 4, cell: { w: 340, h: 215 }, purpose: 'Text × close/remove buttons beside SVG remove/clear icons.', refs: ['Top Issue 9', 'Needs Visual Review 1'] });
  }
  // Popover / dropdown surfaces.
  {
    const S = (m['surfaces_1440'] || {});
    const lab = (name, o) => o && o.s ? `${name} · r ${o.s.borderRadius} · ${o.s.boxShadow === 'none' ? 'no shadow' : 'shadow'} · border ${o.s.border}` : name;
    const defs = [
      ['prep__ms-panel-open', 'ms-panel', S.msPanel], ['prep__prep-menu-open', 'prep-menu', (m['prepMenuSurface_1440'] && { s: m['prepMenuSurface_1440'].prepMenu })], ['prep__bp-popover-open', 'bp-popover', S.bpPopover],
      ['prep__soundboard-panel-open', 'sb-panel', S.sbPanel], ['detail__countdown-overlay-open', 'countdown-overlay', S.countdownOverlay], ['catalog__tooltip-over-card-action', 'tooltip', S.tooltip], ['prep__session-hint-bubble', 'sp-session-hint', (m['sessionHint_1440'] && { s: m['sessionHint_1440'].hint })],
    ];
    const items = defs.map(([f, n, mm]) => ({ e: rec.entries.find(e => e.file === `crops/1440x900__${f}__crop.png`), n, mm })).filter(x => x.e)
      .map(({ e, n, mm }) => ({ file: e.file, label: lab(n, mm) }));
    if (items.length) await sheet(s, { page: 'ui', state: 'floating-surfaces', items, cols: 4, cell: { w: 340, h: 360 }, purpose: 'ms-panel beside prep-menu, bp-popover, sb-panel, countdown overlay, tooltip and session hint (crops at differing zoom; see each crop for scale).', refs: ['Top Issue 4', 'Needs Visual Review 9'], notes: 'Crops keep their individual zoom factors; compare shape, not size. Radius/shadow values are from measurements.surfaces_1440.' });
  }
  // Disabled opacity ladder.
  {
    const D = m['disabledStates'] || {};
    const op = n => (famInfo(n).opacity ?? '?');
    const defs = [
      ['prep__icon-bp-step-disabled-disabled', `bp-step:disabled · opacity ${op('bp-step-disabled')}`],
      ['prep__icon-prep-item-nav-btn-prev-disabled-disabled', `prep-item-nav-btn:disabled · opacity ${op('prep-item-nav-btn-prev-disabled')}`],
      ['disabled__prep-select-checkbox-disabled-env-picker', `prep-select-checkbox:disabled · opacity ${D['prep-select-checkbox:disabled']?.opacity ?? '?'}`],
      ['ui__icon-sb-ctl-stop-aria-disabled-disabled', `sb-ctl[aria-disabled] · opacity ${op('sb-ctl-stop-aria-disabled')}`],
      ['disabled__env-prep-btn-unavailable', `env-prep-btn.is-unavailable · opacity ${D['env-prep-btn.is-unavailable']?.opacity ?? '?'}`],
      ['lists__atl-row-unavailable', `atl-row.is-unavailable · checkbox opacity ${(m['atlUnavailable']?.checkboxDisabled?.opacity) ?? '?'}`],
      ['disabled__prep-menu-item-disabled', `prep-menu-item.is-disabled · opacity ${D['prep-menu-item.is-disabled']?.opacity ?? '?'}`],
      ['prep__icon-item-clear-btn-disabled', `item-clear-btn:disabled · opacity ${op('item-clear-btn')}`],
    ];
    const items = defs.map(([f, label]) => ({ e: rec.entries.find(e => e.file === `crops/1440x900__${f}__crop.png`), label })).filter(x => x.e).map(x => ({ file: x.e.file, label: x.label }));
    if (items.length) await sheet(s, { page: 'ui', state: 'disabled-opacity-ladder', items, cols: 4, cell: { w: 340, h: 230 }, purpose: 'Naturally reproduced disabled states (.35 → .7), each from its real UI.', refs: ['Top Issue 6', 'Needs Visual Review 12'] });
  }
  // Gold-tint hover family.
  {
    const defs = [
      ['catalog__environment-card-action-hover', 'card-add-btn:hover · gold .10'],
      ['journey__jr-icon-btn-hover', 'jr-icon-btn:hover · gold .10'],
      ['prep__session-control-default', 'nav .btn.active (Prep) · .14 per Stage 1'],
      ['prep__bp-seg-checked', 'bp-seg:checked · gold .14'],
      ['detail__countdown-overlay-btn-hover', 'countdown-overlay-btn:hover · gold .16'],
      ['chips__detail-region-env-buttons', 'region-env-btn.active · gold .16'],
      ['prep__ms-row-checked', 'ms-row:checked · gold .16'],
    ];
    const items = defs.map(([f, label]) => ({ e: rec.entries.find(e => e.file === `crops/1440x900__${f}__crop.png`), label })).filter(x => x.e).map(x => ({ file: x.e.file, label: x.label }));
    if (items.length) await sheet(s, { page: 'ui', state: 'gold-tint-hover-family', items, cols: 4, cell: { w: 340, h: 230 }, purpose: 'Real UI examples of the gold-tint fill at .10 / .14 / .16.', refs: ['Top Issue 5', 'Needs Visual Review 13'], notes: 'Crops keep individual zoom factors.' });
  }
  // Checkbox recipes.
  {
    const items = [];
    for (const rcp of ['atl-row', 'prep-select-checkbox', 'ms-checkbox']) {
      for (const st of ['unchecked', 'checked', 'focus-visible', 'disabled']) {
        const e = rec.entries.find(x => x.file === `crops/1440x900__checkbox__${rcp}-${st}__crop.png`);
        if (e) items.push({ file: e.file, label: `${rcp} · ${st}` });
      }
    }
    if (items.length) await sheet(s, { page: 'checkbox', state: 'recipes-compared', items, cols: 4, cell: { w: 250, h: 190 }, purpose: 'Three checkbox recipes, same zoom, same states (rows = recipe).', refs: ['Top Issue 10', 'Top Issue 20'] });
  }
  // Chips.
  {
    const items = has(rec, /__chips__/).filter(e => e.type === 'component-crop' && e.viewport.width === 1440).map(e => ({ file: e.file, label: path.basename(e.file).replace(/^\d+x\d+__chips__/, '').replace('__crop.png', '') }));
    if (items.length) await sheet(s, { page: 'chips', state: 'all-families', items, cols: 3, cell: { w: 460, h: 150 }, purpose: 'All chip / badge / pill families captured from the real UI.', refs: ['Top Issue 2', 'Needs Visual Review 4'] });
  }
  // Card hover comparison.
  {
    const defs = [['catalog__environment-card-rest', 'Catalog card rest'], ['catalog__environment-card-hover', 'Catalog card hover (translateY -2px)'], ['lists__list-card-rest', 'List card rest'], ['lists__list-card-hover', 'List card hover'], ['journey__entry-rest', 'Journey entry rest'], ['journey__entry-hover', 'Journey entry hover']];
    const items = defs.map(([f, label]) => ({ e: rec.entries.find(e => e.file === `crops/1440x900__${f}__crop.png`), label })).filter(x => x.e).map(x => ({ file: x.e.file, label: x.label }));
    if (items.length) await sheet(s, { page: 'ui', state: 'card-hover-comparison', items, cols: 2, cell: { w: 520, h: 300 }, purpose: 'Rest vs hover for the three card-like components.', refs: ['Needs Visual Review 17'], notes: 'Crops include 14px/12px padding; hover lift is visible as a 2px shift of the crop content only on the Catalog card.' });
  }
  // Prep density side by side.
  {
    const items = [1366, 1440, 1920].map(w => ({ e: rec.entries.find(e => e.file === `crops/${w}x${w === 1366 ? 768 : w === 1440 ? 900 : 1080}__prep__central-populated__crop.png`), w })).filter(x => x.e)
      .map(x => ({ file: x.e.file, label: `Prep central panel @ ${x.w} · identical content · 1:1 pixels` }));
    if (items.length) await sheet({ ...s, vp: { width: 'all', height: 'viewports' } }, { page: 'prep', state: 'central-density-1366-1440-1920', name: 'all-viewports__prep__central-density-1366-1440-1920__sheet.png', items, cols: 3, cell: { w: 700, h: 560 }, purpose: 'Prep central panel at the three viewports side by side (identical selection).', refs: ['Needs Visual Review 7', 'Prep density'] });
  }
}

/* -------------------------------------------------------------- checklist */
const CHECKS = [
  ['Optical icon sizing and stroke weight (14/15/16/18/20px in 24/28/32px boxes)', [/icon-button-families-default/, /icon-optical-by-svg-size/, /stroke-sample/], 'Needs Visual Review 1'],
  ['Filled ITEM_* icons beside line icons', [/filled-item-icons-vs-line/, /__detail__item-modal/], 'Needs Visual Review 2'],
  ['PNG vs inline-SVG Prep section icons', [/1366x768__prep__section-icon-adversaries/, /1440x900__prep__section-icon-environments/, /1920x1080__prep__section-icon-items/], 'Needs Visual Review 3'],
  ['Chips vs interactive pills distinguishable', [/chips__all-families/, /detail-dice-btn-in-text/, /detail-adversary-link-btn/, /card-environment-type-and-biome/], 'Needs Visual Review 4'],
  ['Prep 35 / 32 / 30px toolbar control heights', [/1440x900__prep__control-heights-row/, /1920x1080__prep__control-heights-row/, /1440x900__prep__bp-strip/, /1440x900__prep__item-toolbar/, /1440x900__prep__bar-actions/], 'Needs Visual Review 5'],
  ['sp-session-control 12px radius beside 4px header buttons', [/session-control-default/, /session-control-hover/, /session-control-active-pressed/, /session-compact/], 'Needs Visual Review 6'],
  ['Prep density at 1366 / 1440 / 1920 incl. central vs picker text and name↔remove spacing', [/1366x768__prep__all-sections-populated\.png/, /1440x900__prep__all-sections-populated\.png/, /1920x1080__prep__all-sections-populated\.png/, /central-density-1366-1440-1920/], 'Needs Visual Review 7'],
  ['Header (1180) vs full-bleed Prep content at 1440 and 1920', [/1440x900__prep__all-sections-populated\.png/, /1920x1080__prep__all-sections-populated\.png/, /1440x900__prep__header-and-bar/, /1920x1080__prep__header-and-bar/], 'Needs Visual Review 8'],
  ['ms-panel vs prep-menu on the same page', [/prep__ms-panel-open\.png/, /prep__session-menu-open\.png/, /floating-surfaces/], 'Needs Visual Review 9'],
  ['Focus visibility on prep-title-input and list-card-open', [/prep-title-input-focus/, /list-card-open-focus-visible/], 'Needs Visual Review 10'],
  ['.btn press feedback (:active absent)', [/standard-btn-hover/, /standard-btn-pressed/], 'Needs Visual Review 11'],
  ['Disabled contrast .35 vs .45 (and .4/.5/.7)', [/disabled-opacity-ladder/], 'Needs Visual Review 12'],
  ['Gold-tint hover visibility .10 / .14 / .16', [/gold-tint-hover-family/], 'Needs Visual Review 13'],
  ['641px gap between 640 and 641 breakpoints', [/640x900__catalog__default/, /641x900__catalog__default/, /642x900__catalog__default/, /641x900__prep__default/], 'Needs Visual Review 14'],
  ['Hex tier icons (26px) vs 24px chips', [/card-tier-badge/, /detail-tier-hexagons/, /toolbar-filters-active/], 'Needs Visual Review 15'],
  ['Empty states (.empty-state, .journey-empty, .prep-empty / .prep-sel-empty)', [/catalog__empty-result/, /journey__empty/, /prep__empty-default/, /empty-environments-picker-no-results/], 'Needs Visual Review 16'],
  ['translateY(-2px) hover on .card vs none on .list-card / .journey-entry', [/card-hover-comparison/], 'Needs Visual Review 17'],
];

/* ----------------------------------------------------------------- report */
const fmt = (o, keys) => keys.map(k => o?.[k] ?? '–').join(' | ');
const tbl = (head, rows) => `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map(r => `| ${r.join(' | ')} |`).join('\n')}\n`;

export function buildFindings(rec) {
  const M = rec.measurements;
  const f = [];
  for (const w of [1366, 1440, 1920]) {
    const W = M[`prepWidths_${w}`];
    if (!W) continue;
    f.push(`At ${w}px wide: \`.header-inner\` = ${W.headerInner}px (x ${W.headerInnerX}); \`.prep-wrap\` = ${W.prepWrap}px (x ${W.prepWrapX}); \`(min-width:1800px) and (min-height:900px)\` ${W.centralDensityBigRule ? 'matches' : 'does not match'}.`);
  }
  const d1366 = M.prepDensity_1366, d1920 = M.prepDensity_1920;
  if (d1366 && d1920) {
    const g = (d, k, p) => d?.[k]?.[p] ?? '–';
    f.push(`Prep central row (\`.prep-sel--card\`) is ${g(d1366, 'envRow', 'height')}px tall at 1366×768 and ${g(d1920, 'envRow', 'height')}px at 1920×1080; row name font ${g(d1366, 'rowName', 'fontSize')} → ${g(d1920, 'rowName', 'fontSize')}; remove button ${g(d1366, 'removeBtn', 'width')}×${g(d1366, 'removeBtn', 'height')} → ${g(d1920, 'removeBtn', 'width')}×${g(d1920, 'removeBtn', 'height')}; central header ${g(d1366, 'centralHeadEnv', 'height')} → ${g(d1920, 'centralHeadEnv', 'height')}px.`);
    f.push(`Picker row name font is ${g(d1366, 'pickerRowName', 'fontSize')} at 1366 and ${g(d1920, 'pickerRowName', 'fontSize')} at 1920, versus central row name ${g(d1366, 'rowName', 'fontSize')} / ${g(d1920, 'rowName', 'fontSize')}.`);
  }
  for (const w of [1366, 1440, 1920]) {
    const O = M[`prepOverflow_${w}`];
    if (!O) continue;
    const bad = [...O.centralTitles, ...O.centralRowNames].filter(x => x.truncated || x.lines > 1);
    f.push(`At ${w}px the Prep central panel has ${bad.length} text node(s) that truncate or wrap${bad.length ? ': ' + bad.map(x => `“${x.text}” (${x.truncated ? 'truncated' : x.lines + ' lines'})`).join(', ') : ''}.`);
  }
  const diffs = M.breakpoint640to642_diffs || [];
  if (M.breakpoint640to642) {
    if (!diffs.length) f.push('No measured geometry (shell, grid, first card, header, Prep layout, toast stack) or art-layer style differs between 640, 641 and 642px.');
    else {
      for (const d of diffs.slice(0, 40)) f.push(`${d.from}→${d.to}px, ${d.page}: \`${d.prop}\` ${JSON.stringify(d.a)} → ${JSON.stringify(d.b)}.`);
    }
  }
  const sess = M.sessionControl_1440;
  if (sess) f.push(`\`.sp-session-control\` radius ${sess.control?.borderRadius} (${sess.control?.width}×${sess.control?.height}); header \`.nav-btn\` radius ${sess.navBtn?.borderRadius} (${sess.navBtn?.width}×${sess.navBtn?.height}); \`.sb-trigger\` ${sess.sb?.borderRadius}.`);
  const pf = M.focusStates?.['prep-title-input-focus']?.after;
  if (pf) f.push(`\`.prep-title-input\` when focused: outline ${pf.outline}; border-bottom colour ${pf.borderBottomColor}; box-shadow ${pf.boxShadow}.`);
  const lf = M.focusStates?.['list-card-open-focus-visible'];
  if (lf) f.push(`\`.list-card-open:focus-visible\`: outline ${lf.after.outline} (offset ${lf.after.outlineOffset}); box-shadow ${lf.after.boxShadow}.`);
  const sc = M.sectionIcons_1440;
  if (sc) f.push(`Prep section icons at 1440: ${sc.map(i => `${i.tag} ${i.w}×${i.h}${i.natural ? ' (natural ' + i.natural + ')' : ' (inline SVG)'}`).join('; ')}.`);
  const sc19 = M.sectionIcons_1920;
  if (sc19) f.push(`Prep section icons at 1920: ${sc19.map(i => `${i.tag} ${i.w}×${i.h}${i.natural ? ' (natural ' + i.natural + ')' : ' (inline SVG)'}`).join('; ')}.`);
  const bp = M.badgePending;
  if (bp) f.push(`\`.badge\` availability: ${bp.visibleOnFirstRuPage} instance(s) on the first RU catalog page; ${bp.environmentsWithoutRuName}/${bp.total} environments lack a RU name.`);
  const js = M.journeySeed;
  if (js) f.push(`Journey seeded rolls: ${js.regionsKept} regions kept, Shadowblighted present: ${js.blightPresent}.`);
  return f;
}

export function buildReport(rec, info) {
  const E = rec.entries, M = rec.measurements;
  const full = E.filter(e => e.type === 'full-viewport' || e.type === 'full-page');
  const crops = E.filter(e => e.type === 'component-crop');
  const sheets = E.filter(e => e.type === 'contact-sheet');
  const vps = [...new Set(E.map(e => `${e.viewport.width}x${e.viewport.height}`))].filter(v => !/all/.test(v));
  const interactive = E.filter(e => (e.actions || []).some(a => /hover|focus|click|mouse|tick|type|open|Shift\+Tab|scroll|collapse|roll|keyboard/i.test(a)));
  const pagesCovered = [...new Set(E.map(e => e.page))].sort();

  let md = `# Stage 2 — Visual Screenshot Suite: Capture Report\n\n`;
  md += `Evidence capture for [docs/design-consistency-audit.md](../../design-consistency-audit.md). No application code, markup, CSS or tokens were modified; nothing in this report is a design judgement.\n\n`;
  md += `## Environment\n\n`;
  md += tbl(['Item', 'Value'], [
    ['Browser', `Chromium (Playwright ${info.playwright}), version ${info.browserVersion}, headless`],
    ['Device scale factor', `${info.dsf} (crops are magnified afterwards with nearest-neighbour, zoom recorded per file)`],
    ['Locale / timezone / colour scheme', 'en-US / UTC / dark'],
    ['App language', 'EN (\`dhcodex_lang\` seeded to "en"); a single RU context is used only for the \`.badge\` probe'],
    ['Browser flags', '`--font-render-hinting=none --disable-lcd-text` (greyscale AA so output does not depend on OS subpixel settings)'],
    ['Server', 'in-process static server (`scripts/design-audit/lib.mjs#startServer`) serving the repository root unmodified (source, not `dist/`) on an ephemeral 127.0.0.1 port'],
    ['Command', '`npm run design:audit:screenshots` (= `node scripts/design-audit/capture.mjs`)'],
    ['Commit', `\`${info.commit}\`${info.dirty ? ' (working tree had unrelated untracked files; app source unmodified)' : ''}`],
    ['Date', info.date],
    ['Determinism', 'Math.random replaced by a seeded xorshift and Date frozen at 2026-10-02T12:00:00Z before app boot (Journey rolls, timestamps); animations/transitions neutralised by injected test-only CSS; fonts, images and toasts awaited before every capture'],
    ['Run time', info.duration],
  ]);
  md += `\n### Audit state (deterministic, clean context per run)\n\n`;
  md += `Seeded into \`localStorage\` through the app's own keys before boot (never by editing HTML): \`dhcodex_lang="en"\`, storage notice dismissed, three lists (Frozen north / Heist night / Desert caravans) with environment memberships, and one Prep (“Audit prep”, schema v2) holding 3 environments (Harsh Desert, Port City, Ancient Tomb), 4 adversaries (Ahuizotl, Acid Burrower, Apprentice Assassin, Arch-Necromancer) and 4 items (ci1–ci4). Other profiles: \`empty\` (no data), \`partial\` (1 environment + 1 adversary), \`hint\` (Prep hint flag unset), \`notice\` (storage-notice flag unset). Journey entries are created through the real Roll/Keep buttons under the seeded PRNG.\n\n`;
  md += `## Coverage\n\n`;
  md += tbl(['Metric', 'Count'], [
    ['Full-context screenshots (viewport / full page)', full.length],
    ['Component crops', crops.length],
    ['Contact sheets (tiled real crops with captions)', sheets.length],
    ['Total image files', E.length],
    ['Viewports covered', `${vps.length} (${vps.join(', ')})`],
    ['Captures reached through an interaction (hover / focus / click / type / scroll …)', interactive.length],
    ['Distinct page/topic groups', pagesCovered.length],
    ['Capture steps that failed', rec.failures.length],
  ]);
  md += `\nPage/topic groups: ${pagesCovered.map(p => '`' + p + '`').join(', ')}.\n\n`;
  const perVp = vps.map(v => [v, E.filter(e => `${e.viewport.width}x${e.viewport.height}` === v && e.type !== 'contact-sheet').length]);
  md += tbl(['Viewport', 'Files'], perVp) + '\n';

  md += `## Stage 1 “Needs Visual Review” coverage\n\n`;
  const unmet = [];
  CHECKS.forEach(([label, pats, ref]) => {
    const missing = pats.filter(p => !E.some(e => p.test(e.file)));
    const ok = missing.length === 0;
    md += `- [${ok ? 'x' : ' '}] **${label}** _(${ref})_`;
    if (ok) md += ` — ${pats.map(p => E.find(e => p.test(e.file))?.file).filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 3).map(f => '`' + f + '`').join(', ')}`;
    else { md += `\n  - Missing: ${missing.map(p => '`' + p.source + '`').join(', ')}`; unmet.push(label); }
    md += '\n';
  });
  md += '\n';

  md += `## Items that could not be captured (or only partly)\n\n`;
  const und = [...rec.undone];
  if (!und.length) md += '_None._\n\n';
  else md += und.map(u => `- **${u.item}** — ${u.reason}`).join('\n') + '\n\n';
  if (rec.failures.length) {
    md += `### Capture steps that failed in this run\n\n` + rec.failures.map(f => `- \`${f.label}\`: ${f.error}`).join('\n') + '\n\n';
  }

  md += `## Objective browser findings\n\n_Measured or observed facts only; no judgement of appearance._\n\n`;
  md += buildFindings(rec).map(x => `- ${x}`).join('\n') + '\n\n';

  // Tables from measurements
  const H = M.prepHeights_1440, H19 = M.prepHeights_1920, H13 = M.prepHeights_1366;
  if (H) {
    md += `### Prep control boxes (rendered, CSS px)\n\n`;
    const names = Object.keys(H);
    md += tbl(['Control', '1366×768 (w×h)', '1440×900 (w×h)', '1920×1080 (w×h)', 'radius @1440'], names.map(n => {
      const g = o => (o?.[n] ? `${o[n].width}×${o[n].height}` : '–');
      return [n, g(H13), g(H), g(H19), H[n]?.borderRadius ?? '–'];
    })) + '\n';
  }
  const D = ['prepDensity_1366', 'prepDensity_1440', 'prepDensity_1920'].map(k => M[k]);
  if (D[0]) {
    md += `### Prep density (identical selection)\n\n`;
    const keys = Object.keys(D[0]);
    md += tbl(['Element', '1366×768', '1440×900', '1920×1080'], keys.map(k => [k + ' (`' + (D[0][k]?.selector || '') + '`)', ...D.map(d => d?.[k] ? `${d[k].width}×${d[k].height}, ${d[k].fontSize}` : '–')])) + '\n';
  }
  const S = M.surfaces_1440;
  if (S) {
    md += `### Floating-surface computed styles @1440×900\n\n`;
    const rows = Object.entries(S).map(([k, v]) => { const x = v.s || v; return [k, x.borderRadius ?? '–', x.border ?? '–', (x.boxShadow || '–').toString().slice(0, 70), x.background ?? '–']; });
    if (M.prepMenuSurface_1440) rows.push(['prepMenu', M.prepMenuSurface_1440.prepMenu?.borderRadius, M.prepMenuSurface_1440.prepMenu?.border, (M.prepMenuSurface_1440.prepMenu?.boxShadow || '').slice(0, 70), M.prepMenuSurface_1440.prepMenu?.background]);
    md += tbl(['Surface', 'radius', 'border', 'box-shadow', 'background'], rows) + '\n';
  }
  const dis = M.disabledStates;
  if (dis) {
    md += `### Disabled states reached naturally (computed opacity)\n\n`;
    md += tbl(['State', 'opacity'], Object.entries(dis).filter(([, v]) => v && v.opacity !== undefined).map(([k, v]) => [k, v.opacity])) + '\n';
    const fams = Object.keys(M).filter(k => k.startsWith('iconFamily_') && M[k].disabledNaturally).map(k => [k.slice(11), M[k].opacity]);
    if (fams.length) md += tbl(['Icon family reached in a disabled state', 'opacity of the resting-state control'], fams) + '\n';
  }

  md += `## Console / network issues relevant to rendering\n\n`;
  const uniq = new Map();
  rec.consoleIssues.forEach(c => { const k = `${c.type}|${c.text}`; uniq.set(k, (uniq.get(k) || 0) + 1); });
  const ab = rec.abortedRequests || 0;
  if (!uniq.size) md += `_No console errors, warnings, non-aborted failed requests or HTTP errors were recorded in any context (${ab} requests cancelled by the suite's own navigations are not counted)._\n`;
  else md += `(${ab} further requests cancelled by the suite's own page navigations are not listed.)\n\n` + [...uniq.entries()].map(([k, n]) => `- ×${n} \`${k}\``).join('\n') + '\n';
  md += `\n## Files\n\n- \`manifest.json\` — every file with route, viewport, state, interactions, related Stage 1 finding, type, notes.\n- \`measurements\` inside \`manifest.json\` — raw computed-style / box data referenced above.\n- \`README.md\` — how to re-run and how to read the folders.\n`;
  return { md, unmet };
}

export function buildReadme() {
  return `# Stage 2 — screenshot suite

Visual evidence for the Stage 1 design-consistency audit. Capture-only: no UI was changed.

## Layout

- \`1366x768/\`, \`1440x900/\`, \`1920x1080/\` — full-context viewport screenshots (\`<viewport>__<page>__<state>.png\`).
- \`crops/\` — component crops (\`__crop.png\`, magnified, zoom recorded in the manifest) and captioned contact sheets (\`__sheet.png\`) that tile real crops for side-by-side comparison.
- \`breakpoint-640-642/\` — the 640 / 641 / 642 × 900 diagnostic.
- \`manifest.json\` — index of every file + measurements. \`capture-report.md\` — environment, coverage, Stage 1 checklist, objective findings, gaps.

## Re-run

\`\`\`bash
npm install            # installs the dev-only Playwright dependency
npx playwright install chromium   # once, if the browser is not cached
npm run design:audit:screenshots
\`\`\`

Options: \`--only=core,prep,ui,icons,states,breakpoint\`, \`--vp=1440x900\`, \`--out=<dir>\`. A partial run writes \`manifest.partial.json\` instead of overwriting \`manifest.json\`.

## Reading crops

Crops are cut from a 1x render and enlarged with nearest-neighbour (no smoothing), so edge sharpness is the browser's real 1x output. The \`zoom\` field in the manifest gives the factor; \`cropRegionCssPx\` gives the source rectangle.
`;
}

export function gitInfo(root) {
  const sh = c => { try { return execSync(c, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
  return { commit: sh('git rev-parse --short HEAD'), dirty: sh('git status --porcelain').split('\n').filter(l => l && !/design-audit|package(-lock)?\.json/.test(l)).length > 0 };
}
