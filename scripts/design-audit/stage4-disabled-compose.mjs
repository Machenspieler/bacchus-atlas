#!/usr/bin/env node
// Stage 4 task 05 — contact sheet + before/after ladder from the crops stage4-disabled-states.mjs wrote.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT } from './lib.mjs';

const OUT = path.resolve(ROOT, 'docs/design-audit/stage-4/task-05-disabled-states');
const S2 = path.resolve(ROOT, 'docs/design-audit/stage-2/crops');
const after = n => path.join(OUT, 'crops', `1440x900__ds__${n}__crop.png`);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const text = (w, h, t, size = 14, fill = '#d8cdb0') => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="2" y="${h - 6}" font-family="Arial, sans-serif" font-size="${size}" fill="${fill}">${esc(t)}</text></svg>`);

async function grid(file, title, items, cols, cell) {
  const pad = 10, cap = 24, head = 40, rows = Math.ceil(items.length / cols);
  const W = cols * (cell.w + pad) + pad, H = head + rows * (cell.h + cap + pad) + pad;
  const comps = [{ input: text(W, head, title, 16), left: 8, top: 4 }];
  for (let i = 0; i < items.length; i++) {
    const [src, label] = items[i];
    const x = pad + (i % cols) * (cell.w + pad), y = head + pad + Math.floor(i / cols) * (cell.h + cap + pad);
    const buf = await sharp(src).resize(cell.w, cell.h, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    const m = await sharp(buf).metadata();
    comps.push({ input: buf, left: x + Math.floor((cell.w - m.width) / 2), top: y + cap + Math.floor((cell.h - m.height) / 2) });
    comps.push({ input: text(cell.w, cap, label), left: x, top: y });
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: '#0b0908' } }).composite(comps).png().toFile(path.join(OUT, file));
}

await grid('contact-sheet__non-active-states__1440x900.png', 'Non-active states — 1440×900 (crops from the real UI; icon-btn is forced disabled, sound tiles are real loading/failed)', [
  [after('btn-enabled'), '1 · normal enabled control'],
  [after('btn-disabled'), '2 · disabled button (.btn:disabled)'],
  [after('icon-btn-disabled'), '3 · disabled icon button (forced)'],
  [after('stepper-disabled'), '4 · disabled stepper segment'],
  [after('nav-disabled'), '5 · disabled nav (prev) + enabled (next)'],
  [after('checkbox-disabled'), '6 · disabled checkbox (Prep at 3/3)'],
  [after('atl-row-unavailable'), '7 · unavailable row (muted label, .5 box)'],
  [after('menu-item-disabled'), '8 · disabled menu item (Delete)'],
  [after('sb-ctl-stop-disabled'), '9 · aria-disabled sb-ctl (Stop all)'],
  [after('sb-ctl-inactive'), '10 · inactive but interactive (Settings)'],
  [after('sound-loading'), '11 · loading sound tile'],
  [after('sound-failed'), '12 · failed sound tile'],
], 4, { w: 430, h: 200 });

const bf = (b, a) => [path.join(S2, b), after(a)];
const ladder = [
  ['bp-step', '.35 → .5', '1440x900__prep__icon-bp-step-disabled-disabled__crop.png', 'stepper-disabled'],
  ['prep-item-nav-btn', '.35 → .5', '1440x900__prep__icon-prep-item-nav-btn-prev-disabled-disabled__crop.png', 'nav-disabled'],
  ['.btn:disabled (item clear)', '.45 → .5', '1440x900__prep__icon-item-clear-btn-disabled__crop.png', 'btn-disabled'],
  ['prep-select-checkbox', '.4 → .5', '1440x900__checkbox__prep-select-checkbox-disabled__crop.png', 'checkbox-disabled'],
  ['env-prep-btn.is-unavailable', '.45 → .5', '1440x900__disabled__env-prep-btn-unavailable__crop.png', 'env-prep-btn-unavailable'],
  ['sb-ctl[aria-disabled]', '.45 → .5', '1440x900__ui__icon-sb-ctl-stop-aria-disabled-disabled__crop.png', 'sb-ctl-stop-disabled'],
  ['atl-row.is-unavailable', 'box .5 → .5, label muted (unchanged)', '1440x900__lists__atl-row-unavailable__crop.png', 'atl-row-unavailable'],
  ['prep-menu-item.is-disabled', '.7 on muted → muted only', '1440x900__disabled__prep-menu-item-disabled__crop.png', 'menu-item-disabled'],
];
const h = 150, pad = 12, cap = 22;
const comps = []; let y = 44, W = 0;
const rowsData = [];
for (const [name, change, b, a] of ladder) {
  const [bb, ab] = await Promise.all([path.join(S2, b), after(a)].map(f => sharp(f).resize({ height: h, width: 520, fit: 'inside' }).png().toBuffer()));
  const [mb, ma] = await Promise.all([bb, ab].map(x => sharp(x).metadata()));
  rowsData.push({ name, change, bb, ab, mb, ma });
}
const colW = 540;
W = 200 + colW * 2 + 40;
for (const r of rowsData) {
  comps.push({ input: text(200, 24, r.name, 13), left: 8, top: y + 22 });
  comps.push({ input: text(200, 24, r.change, 12, '#9a8f7d'), left: 8, top: y + 60 });
  comps.push({ input: r.bb, left: 200, top: y + cap });
  comps.push({ input: r.ab, left: 200 + colW + 10, top: y + cap });
  y += h + cap + pad;
}
comps.push({ input: text(W, 40, 'Disabled-opacity ladder — Stage 2 (left, .35/.4/.45/.5/.7) → Task 05 (right, one token + muted-label rows)', 16), left: 8, top: 4 });
comps.push({ input: text(colW, 22, 'BEFORE (Stage 2)'), left: 200, top: 36 });
comps.push({ input: text(colW, 22, 'AFTER'), left: 200 + colW + 10, top: 36 });
await sharp({ create: { width: W, height: y + 10, channels: 4, background: '#0b0908' } }).composite(comps).png().toFile(path.join(OUT, 'before-after__opacity-ladder.png'));
console.log('composed');
