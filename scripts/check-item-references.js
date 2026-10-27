#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — check-item-references.js
   Read-only audit tool (never runs in CI): finds item names in an
   environment's English text and reports every one whose catalogue Russian
   name (data/items.json, names and aliases) is missing from the Russian
   text of the same field. data/items.json is the source of truth for an
   item mentioned inside an environment — names, Russian names and the
   wording of its properties — so the Russian text follows the catalogue,
   not the other way round. See .claude/rules/data.md "Items".

   Usage:  node scripts/check-item-references.js

   The Russian match is by word stems (declensions and ё/е are tolerated),
   so a report line is a prompt to look, not proof. KNOWN_NOT_THE_ITEM lists
   hits that were checked and are not the catalogue item.
   ============================================================ */
'use strict';

const path = require('path');
const items = require(path.join(__dirname, '..', 'data', 'items.json'));
const envs = require(path.join(__dirname, '..', 'data', 'environments.json')).environments;

// environment id -> English item name that is used in another sense there
const KNOWN_NOT_THE_ITEM = new Set([
  'empty-cliffside-village|Glider', // the Fractus frame's "personal gliders", not the small parachute item
]);

const norm = s => s.toLowerCase().replace(/ё/g, 'е').replace(/[’'`]/g, '’');
const stem = w => (w.length > 5 ? w.slice(0, -2) : w.length > 3 ? w.slice(0, -1) : w);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/’|'/g, "['’]");

const catalogue = new Map();
for (const [id, v] of Object.entries(items.items)) catalogue.set(id, { en: new Set([v.en.name]), ru: new Set([v.ru.name]) });
for (const [alias, id] of Object.entries(items.aliases || {})) {
  const c = catalogue.get(id);
  if (c) (/[а-яё]/i.test(alias) ? c.ru : c.en).add(alias);
}

const ruHas = (text, names) => [...names].some(n => {
  const t = norm(text);
  return norm(n).split(/[\s-]+/).filter(w => w.length > 1).every(w => t.includes(stem(w)));
});
const enHit = (text, names) => [...names].find(n => n.length > 3 &&
  new RegExp(`(^|[^A-Za-z])${esc(n)}(s|es)?($|[^A-Za-z])`, 'i').test(text));

const report = [];
function check(id, where, en, ru) {
  for (const c of catalogue.values()) {
    const hit = enHit(en, c.en);
    if (hit && !KNOWN_NOT_THE_ITEM.has(`${id}|${hit}`) && !ruHas(ru, c.ru)) {
      report.push(`${id} | ${where} | EN "${hit}" -> catalogue RU "${[...c.ru].join(' / ')}" not found in RU`);
    }
  }
}
function walk(o, id, where) {
  if (!o || typeof o !== 'object') return;
  if (typeof o.en === 'string' && typeof o.ru === 'string') check(id, where, o.en, o.ru);
  else if (Array.isArray(o.en) && Array.isArray(o.ru)) {
    o.en.forEach((s, i) => { if (typeof s === 'string' && typeof o.ru[i] === 'string') check(id, `${where}[${i}]`, s, o.ru[i]); });
  } else for (const k of Object.keys(o)) walk(o[k], id, `${where}.${k}`);
}
for (const e of envs) walk(e, e.id, '');

console.log(report.join('\n') || 'No item-name mismatches.');
process.exit(report.length ? 1 : 0);
