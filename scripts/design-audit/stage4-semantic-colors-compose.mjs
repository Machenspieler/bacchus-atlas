#!/usr/bin/env node
// Stage 4 task 08 — assemble the contact sheets and before/after pairs from the real crops.
//   node scripts/design-audit/stage4-semantic-colors-compose.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT } from './lib.mjs';

const OUT = path.resolve(ROOT, 'docs/design-audit/stage-4/task-08-semantic-colors');
const crop = (phase, n) => path.join(OUT, phase, 'crops', `1440x900__sc__${n}__crop.png`);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const BG = '#0b0908';

async function grid(file, items, { cols = 3, cell = { w: 400, h: 190 }, title } = {}) {
  const pad = 10, cap = 38, top = title ? 34 : 0;
  const rows = Math.ceil(items.length / cols);
  const W = cols * (cell.w + pad) + pad, H = top + rows * (cell.h + cap + pad) + pad;
  const comps = [];
  if (title) comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${top}"><text x="${pad}" y="23" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#e9dfc7">${esc(title)}</text></svg>`), left: 0, top: 0 });
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const cx = pad + (i % cols) * (cell.w + pad), cy = top + pad + Math.floor(i / cols) * (cell.h + cap + pad);
    if (!fs.existsSync(it.src)) { console.log('missing', it.src); continue; }
    const buf = await sharp(it.src).resize(cell.w, cell.h, { fit: 'inside', withoutEnlargement: true, background: BG }).png().toBuffer();
    const m = await sharp(buf).metadata();
    comps.push({ input: buf, left: cx + Math.floor((cell.w - m.width) / 2), top: cy + cap + Math.floor((cell.h - m.height) / 2) });
    const lines = String(it.label).split('|');
    comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cell.w}" height="${cap}"><text x="2" y="15" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#e9dfc7">${esc(lines[0])}</text><text x="2" y="31" font-family="Arial, sans-serif" font-size="11" fill="#9a8f7d">${esc(lines[1] || '')}</text></svg>`), left: cx, top: cy });
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: BG } }).composite(comps).png().toFile(path.join(OUT, file));
  console.log('+', file);
}

const A = n => crop('after', n), B = n => crop('before', n);

await grid('contact-sheet__semantic-colors__1440x900.png', [
  { src: A('dice-btn-hover'), label: 'Hope · affirmative action|.dice-btn hover — hope-hover fill' },
  { src: A('nav-btn-active-rest'), label: 'Hope · selected|nav .btn.active — hope-selected fill' },
  { src: A('adv-row-recommended'), label: 'Hope · recommendation|.is-recommended — hope-wash (suggested, not selected)' },
  { src: A('nav-btn-active-selected-focus'), label: 'Hope · focus (on a selected control)|ring + selected fill, both visible' },
  { src: A('danger-icon-hover'), label: 'Fear · destructive action|icon-btn--danger hover — fear-tint' },
  { src: A('sound-failed'), label: 'Fear · error / failed|sound tile: fear alert glyph' },
  { src: A('jr-blight-in-row'), label: 'Fear · dangerous state|Shadowblighted stays Fear' },
  { src: A('item-btn-hover'), label: 'Teal · informational reference|item link hover — teal-hover' },
  { src: A('adversary-link-btn-hover'), label: 'Teal · structural / reference link|adversary link (was Fear)' },
  { src: A('prep-menu-neutral-hover'), label: 'Neutral · generic hover|menu row hover — neutral-hover, checked row gold' },
  { src: A('card-add-btn-rest'), label: 'Neutral · secondary action (rest)|card add button — muted, no accent until hover' },
  { src: A('feature-type-action'), label: 'Neutral · taxonomy label|feature-type.action (was Fear)' },
], { cols: 3, title: 'Semantic colour families — 1440×900, real components' });

await grid('gold-strength__hierarchy__1440x900.png', [
  { src: A('adv-row-recommended'), label: '1 · wash|recommended row — hope-wash' },
  { src: A('card-add-btn-hover'), label: '2 · hover|card add button — hope-hover-bg' },
  { src: A('nav-btn-active-rest'), label: '3 · selected|nav .btn.active — hope-selected-bg' },
  { src: A('ms-row-checked-hover'), label: '4 · selected + hover|ms-row checked, pointer over it' },
  { src: A('prep-count-limit'), label: '5 · border emphasis|limit pill — hope-border + hope-wash' },
  { src: A('prep-item-card-selected'), label: '6 · border + glow|selected item card — hope border + hope-glow' },
  { src: A('ms-row-checked-focus'), label: '7 · focus (separate channel)|selected row + 2px focus ring' },
  { src: A('ladder-ms-panel-hover-vs-checked'), label: 'Ladder in one panel|neutral hover row vs checked row' },
], { cols: 2, cell: { w: 560, h: 240 }, title: 'Gold strength: wash < hover < selected < selected-hover; focus is its own ring' });

const pairs = [
  ['feature-type-action', 'feature-type.action — Fear → neutral taxonomy'],
  ['adversary-link-btn-rest', 'adversary-link-btn — Fear → Teal'],
  ['adversary-link-btn-hover', 'adversary-link-btn hover — Fear tint → Teal tint'],
  ['adversary-block-summary', 'adversary-summary ▸ — Fear → Teal'],
  ['badge-pending-in-card-meta', 'badge.pending — Fear → neutral (dashed kept)'],
  ['ladder-ms-panel-hover-vs-checked', 'ms-row hover — gold text → neutral'],
  ['prep-menu-neutral-hover', 'prep-menu-item hover — gold text → neutral'],
  ['dice-btn-hover', 'dice-btn hover — .16 → hope-hover (.10)'],
  ['nav-btn-active-hover', 'nav .btn.active hover — .14/.20 → .16/.22'],
  ['countdown-btn-hover', 'countdown-btn hover — teal .18 → .16'],
];
const items = [];
for (const [n, l] of pairs) { items.push({ src: B(n), label: `BEFORE|${l}` }); items.push({ src: A(n), label: `AFTER|${l}` }); }
await grid('before-after__recoloured-components.png', items, { cols: 2, cell: { w: 520, h: 150 }, title: 'Before / after — only components whose colour changed' });

await grid('states__hover-selected-focus-disabled__1440x900.png', [
  { src: A('nav-btn-active-rest'), label: 'selected (rest)|nav .btn.active' },
  { src: A('nav-btn-active-hover'), label: 'selected + hover|stronger, still gold' },
  { src: A('nav-btn-active-selected-focus'), label: 'selected + focus|ring distinct from fill' },
  { src: A('ms-row-checked-hover'), label: 'row checked + hover|' },
  { src: A('ms-row-checked-focus'), label: 'row checked + focus|keyboard' },
  { src: A('prep-menu-actions'), label: 'disabled Delete (single session)|muted, no hover fill, no accent' },
  { src: A('card-add-btn-rest'), label: 'rest|neutral' },
  { src: A('card-add-btn-hover'), label: 'hover|gold hover weaker than selected' },
  { src: A('danger-icon-hover'), label: 'destructive hover|fear-tint' },
], { cols: 3, cell: { w: 400, h: 170 }, title: 'Rest / hover / selected / selected+focus / disabled' });
