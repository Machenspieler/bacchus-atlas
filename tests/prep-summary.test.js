'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PrepUtils = require('../js/prep-utils.js');

const ROOT = path.join(__dirname, '..');
const APP_JS = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const I18N = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'i18n.json'), 'utf8'));
const EN = { environments: 'Environments', adversaries: 'Adversaries', items: 'Items' };
const RU = { environments: 'Окружения', adversaries: 'Противники', items: 'Предметы' };

test('full summary', () => {
  assert.equal(PrepUtils.buildSessionSummary({
    name: 'Session Name', headings: EN,
    environments: ['Environment A'], adversaries: ['Enemy A — Tier 1 Solo'], items: ['Item A'],
  }), 'Session Name\n\nEnvironments\n• Environment A\n\nAdversaries\n• Enemy A — Tier 1 Solo\n\nItems\n• Item A');
});

test('empty sections are omitted', () => {
  const out = PrepUtils.buildSessionSummary({
    name: 'Sunken Temple', headings: EN, environments: ['Flooded Ruins'], adversaries: ['Acid Burrower — Tier 1 Solo'], items: [],
  });
  assert.ok(!out.includes('Items'));
  assert.ok(out.endsWith('Solo'));
});

test('empty prep is the name alone', () => {
  assert.equal(PrepUtils.buildSessionSummary({ name: 'Session Name', headings: EN, environments: [], adversaries: [], items: [] }), 'Session Name');
});

test('keeps given order, every entry once', () => {
  const out = PrepUtils.buildSessionSummary({ name: 'S', headings: EN, environments: [], adversaries: [], items: ['B', 'A', 'C'] });
  assert.equal(out, 'S\n\nItems\n• B\n• A\n• C');
});

test('RU headings', () => {
  const out = PrepUtils.buildSessionSummary({ name: 'S', headings: RU, environments: ['x'], adversaries: ['y'], items: ['z'] });
  assert.match(out, /Окружения\n• x\n\nПротивники\n• y\n\nПредметы\n• z/);
});

test('notes are never an input or read by the export', () => {
  const out = PrepUtils.buildSessionSummary({ name: 'S', notes: 'SECRET', headings: EN, environments: [], adversaries: [], items: [] });
  assert.ok(!out.includes('SECRET'));
  const start = APP_JS.indexOf('function prepSummaryText(');
  const body = APP_JS.slice(start, APP_JS.indexOf('function prepBarDuplicate('));
  assert.ok(!/notes/i.test(body.replace('Session Notes are never read', '')));
});

test('pluralForm', () => {
  assert.equal(PrepUtils.pluralForm(1, 'en'), 'one');
  assert.equal(PrepUtils.pluralForm(0, 'en'), 'many');
  assert.deepEqual([1, 2, 5, 11, 12, 21, 22, 25].map(n => PrepUtils.pluralForm(n, 'ru')),
    ['one', 'few', 'many', 'many', 'many', 'one', 'few', 'many']);
});

test('menu wiring and i18n keys', () => {
  assert.ok(APP_JS.includes('data-sp-menu-copy-summary'));
  assert.ok(APP_JS.indexOf('data-sp-menu-duplicate>') < APP_JS.indexOf('data-sp-menu-copy-summary>'));
  assert.ok(APP_JS.indexOf('data-sp-menu-copy-summary>') < APP_JS.indexOf('prep-menu-sep'));
  for (const lang of ['en', 'ru']) {
    const d = I18N[lang];
    for (const k of ['prep_copy_summary', 'prep_summary_copied', 'prep_summary_failed',
      'prep_summary_env_one', 'prep_summary_env_many', 'prep_summary_adv_one', 'prep_summary_adv_many',
      'prep_summary_item_one', 'prep_summary_item_many']) assert.ok(d[k], `${lang}.${k}`);
  }
  assert.ok(I18N.ru.prep_summary_env_few && I18N.ru.prep_summary_adv_few && I18N.ru.prep_summary_item_few);
});
