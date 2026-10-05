#!/usr/bin/env node
// Stage 4 task 04 — compose the contact sheet and the before/after pairs from the crops that
// stage4-focus-states.mjs wrote. Run that first.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT } from './lib.mjs';

const OUT = path.resolve(ROOT, 'docs/design-audit/stage-4/task-04-focus-states');
const S2 = path.resolve(ROOT, 'docs/design-audit/stage-2/crops');
const crops = n => path.join(OUT, 'crops', `1440x900__focus__${n}__crop.png`);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const text = (w, h, t, size = 14, fill = '#d8cdb0') => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="2" y="${h - 6}" font-family="Arial, sans-serif" font-size="${size}" fill="${fill}">${esc(t)}</text></svg>`);

async function contactSheet() {
  const items = [
    ['standard-button', 'standard button — external'], ['icon-utility-button', 'icon utility — tight'], ['text-input', 'text input — editable'],
    ['prep-title-input', 'Prep title input — editable, tight'], ['list-card', 'list card — container'], ['catalog-card', 'catalog card — container'],
    ['ms-trigger', 'multiselect trigger — external'], ['ms-row', 'multiselect row — inset (row)'], ['lang-switch-selected', 'language switch (selected) — inset'],
    ['session-control', 'session control — external'], ['link-btn', 'link — external'], ['checkbox', 'checkbox — external'],
  ];
  const cols = 4, cell = { w: 440, h: 190 }, pad = 10, cap = 24, head = 40;
  const rows = Math.ceil(items.length / cols);
  const W = cols * (cell.w + pad) + pad, H = head + rows * (cell.h + cap + pad) + pad;
  const comps = [{ input: text(W, head, 'Focus states — 1440×900, keyboard-generated :focus-visible (crops from the real UI)', 16), left: 8, top: 4 }];
  for (let i = 0; i < items.length; i++) {
    const [n, label] = items[i];
    const x = pad + (i % cols) * (cell.w + pad), y = head + pad + Math.floor(i / cols) * (cell.h + cap + pad);
    const buf = await sharp(crops(n)).resize(cell.w, cell.h, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    const m = await sharp(buf).metadata();
    comps.push({ input: buf, left: x + Math.floor((cell.w - m.width) / 2), top: y + cap + Math.floor((cell.h - m.height) / 2) });
    comps.push({ input: text(cell.w, cap, label), left: x, top: y });
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: '#0b0908' } }).composite(comps).png().toFile(path.join(OUT, 'contact-sheet__focus-states__1440x900.png'));
}

async function beforeAfter(name, beforeFile, afterFile, title) {
  const h = 200;
  const [b, a] = await Promise.all([beforeFile, afterFile].map(f => sharp(f).resize({ height: h, fit: 'inside' }).png().toBuffer()));
  const [mb, ma] = await Promise.all([b, a].map(x => sharp(x).metadata()));
  const W = mb.width + ma.width + 30, H = h + 60;
  await sharp({ create: { width: W, height: H, channels: 4, background: '#0b0908' } }).composite([
    { input: text(W, 24, title, 15), left: 8, top: 2 },
    { input: text(mb.width, 24, 'BEFORE (Stage 2)'), left: 10, top: 28 }, { input: b, left: 10, top: 54 },
    { input: text(ma.width, 24, 'AFTER'), left: mb.width + 20, top: 28 }, { input: a, left: mb.width + 20, top: 54 },
  ]).png().toFile(path.join(OUT, `before-after__${name}.png`));
}

await contactSheet();
await beforeAfter('prep-title-input', path.join(S2, '1440x900__focus__prep-title-input-focus-caret-moved__crop.png'), crops('prep-title-input'), 'prep-title-input — keyboard focus (border-only → ring)');
await beforeAfter('list-card-open', path.join(S2, '1440x900__focus__list-card-open-focus-visible__crop.png'), crops('list-card'), 'list card — keyboard focus (button ring + border swap → card ring)');
console.log('composed');
