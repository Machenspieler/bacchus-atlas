'use strict';
/* Audit 05 (L5-xx): Journey localization fixes. Pure data checks run the real `fillN` source from the view against data/i18n.json;
 * the DOM-timing fixes (relocalize, aria) are source guards — behaviour was verified in a real browser
 * (artifacts/journey-audit-05-localization-fixes). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const view = read('js/journey2-view.js');
const i18n = JSON.parse(read('data/i18n.json'));
const COUNTS = [0, 1, 2, 5, 11, 21];

/** The view's own `fill` + `fillN`, run against one language's dictionary. */
function helpers(lang) {
  const src = view.slice(view.indexOf('    function fill(key, vars) {'), view.indexOf('    /* ---- lifecycle ---- */'));
  const t = key => i18n[lang][key] || key;
  return new Function('t', src + '; return { fill, fillN };')(t);
}

const ONE_COUNT = {
  journey2_days_per_hex: n => ({ n }), journey2_terrain_tip: n => ({ n, d: n }), journey2_all_placed: n => ({ n }), journey2_live_separate_started: n => ({ n }),
  journey2_live_placed: n => ({ n }), journey2_live_created: n => ({ name: 'X', n }), journey2_handle_all_aria: n => ({ name: 'X', n }),
  journey2_live_echoes_placed: n => ({ n }), journey2_route_known_days: n => ({ n }), journey2_route_live_result: n => ({ strategy: 'S', hexes: n }),
  journey2_route_bub_unknown: n => ({ hexes: n, dist: 'D' }), journey2_sanc_generate: n => ({ n }), journey2_sanc_replace_msg: n => ({ n }),
  journey2_live_sanc_generated: n => ({ n }), journey2_sanc_replace_visible_msg: n => ({ n }),
};
const TWO_COUNT = {
  journey2_rail_count_aria: (a, b) => ({ r: a, n: b }), journey2_stock_count_aria: (a, b) => ({ r: a, n: b }),
  journey2_route_compare_line: (a, b) => ({ label: 'L', hexes: a, days: b }), journey2_route_bub_stats: (a, b) => ({ hexes: a, dist: 'D', days: b }),
};

test('L5-01 / L5-02: English singular agreement for every count-taking Journey string (0, 1, 2, 5, 11, 21)', () => {
  const { fillN } = helpers('en');
  const table = [];
  for (const [key, vars] of Object.entries(ONE_COUNT)) {
    for (const c of COUNTS) {
      const s = fillN(key, vars(c), [c]);
      table.push([key, c, s]);
      if (c === 1) assert.doesNotMatch(s, /\b1 (hexes|days|regions|sanctuaries|sanctuary names|Soul Echoes)\b/, key + ': ' + s);
      else assert.doesNotMatch(s, /\b\d+ (hex|day|region|Soul Echo|sanctuary name|sanctuary(?! names))(?![a-z])/, key + ': ' + s);
    }
  }
  for (const [key, vars] of Object.entries(TWO_COUNT)) {
    for (const a of COUNTS) for (const b of COUNTS) {
      const s = fillN(key, vars(a, b), [a, b]);
      table.push([key, a + '/' + b, s]);
      assert.equal(/\b1 (hexes|days|regions)\b/.test(s), false, key + ': ' + s);
      if (a !== 1 && b !== 1) assert.equal(s, helpers('en').fill(key, vars(a, b)), 'plural text is the base string');
    }
  }
  const get = (k, c) => table.find(r => r[0] === k && r[1] === c)[2];
  assert.equal(get('journey2_days_per_hex', 1), '1 day per hex');
  assert.equal(get('journey2_days_per_hex', 2), '2 days per hex');
  assert.equal(get('journey2_days_per_hex', 5), '5 days per hex');
  assert.equal(get('journey2_terrain_tip', 1), 'Terrain 1 - 1 day per hex');
  assert.equal(get('journey2_all_placed', 1), 'All 1 hex placed');
  assert.equal(get('journey2_live_placed', 1), 'Placed 1 hex');
  assert.equal(get('journey2_live_placed', 21), 'Placed 21 hexes');
  assert.equal(get('journey2_route_live_result', 1), 'Route S: 1 hex.');
  assert.equal(get('journey2_sanc_replace_visible_msg', 1).slice(0, 52), '1 sanctuary name is currently visible to players. Ge');
  assert.equal(helpers('en').fillN('journey2_route_bub_stats', { hexes: 1, dist: 'D', days: 1 }, [1, 1]), '1 hex (D) · 1 day');
  assert.equal(helpers('en').fillN('journey2_route_bub_stats', { hexes: 1, dist: 'D', days: 5 }, [1, 5]), '1 hex (D) · 5 days');
  assert.equal(helpers('en').fillN('journey2_rail_count_aria', { r: 1, n: 2 }, [1, 2]), '1 region generated, 2 hexes left to place');
});

test('L5-02: every singular variant keeps the same placeholders as its base string, in both languages', () => {
  const ph = s => (s.match(/\{[a-z]+\}/g) || []).sort().join();
  for (const lang of ['en', 'ru']) {
    for (const key of Object.keys(i18n[lang]).filter(k => /_one(1|2|12)?$/.test(k) && k.startsWith('journey2_'))) {
      const base = key.replace(/_one(1|2|12)?$/, '');
      if (!(base in i18n[lang]) && !(base + '_n' in i18n[lang])) continue;
      assert.equal(ph(i18n[lang][key]), ph(i18n[lang][i18n[lang][base] ? base : base + '_n']), lang + ' ' + key);
    }
  }
  for (const key of Object.keys(i18n.en)) assert.ok(key in i18n.ru && ph(i18n.ru[key]) === ph(i18n.en[key]), 'ru ' + key);
  // Russian never declines the noun, so counts read identically for every n.
  const ru = helpers('ru');
  for (const c of COUNTS) assert.equal(ru.fillN('journey2_live_placed', { n: c }, [c]), 'Поставлено гексов: ' + c);
});

test('L5-06: Russian Soul Echo plural is «Эхо Душ»; singular contexts keep «Эхо Души» / «Эха Души»', () => {
  const ru = i18n.ru;
  assert.equal(ru.journey2_echo_locate_all, 'Все Эхо Душ собраны.');
  assert.equal(ru.journey2_echo_clear_title_dlg, 'Убрать все Эхо Душ?');
  assert.equal(ru.journey2_loc_none_remain, 'Несобранных Эхо Душ не осталось.');
  for (const k of ['journey2_echo_group', 'journey2_echo_place', 'journey2_echo_place_title', 'journey2_echo_replace_title', 'journey2_echo_replace_msg', 'journey2_live_echoes_placed',
    'journey2_live_echoes_cleared', 'journey2_echo_locate', 'journey2_echo_locate_none', 'journey2_loc_none_distributed', 'journey2_loc_stale', 'journey2_echo_failed']) {
    assert.match(ru[k], /Эхо Душ(?![а-я])/, k + ': ' + ru[k]);
    assert.doesNotMatch(ru[k], /Эхо Души/, k + ': ' + ru[k]);
  }
  assert.equal(ru.journey2_loc_title, 'Поиск Эха Души');
  assert.equal(ru.journey2_live_echo_collected, 'Эхо Души отмечено как собранное');
  assert.equal(ru.journey2_live_echo_restored, 'Эхо Души возвращено');
  assert.equal(ru.journey2_loc_here, 'Ближайшее Эхо Души находится здесь.');
  assert.match(read('docs/translation-glossary.md'), /plural «Эхо Душ»/);
});

test('L5-04 / L5-05 / L5-07 / L5-08 / L5-17: Russian terminology, hint, compass names and compact stock text', () => {
  const ru = i18n.ru;
  const gmKeys = Object.keys(ru).filter(k => k.startsWith('journey2_'));
  for (const k of gmKeys) assert.doesNotMatch(ru[k], /мастер|(?<![А-Яа-я])ГМ(?![А-Яа-я])|\bGM\b/, k + ': ' + ru[k]);
  assert.equal(ru.journey2_preview_back, 'К виду ведущего');
  assert.equal(ru.journey2_loc_reminder_label, 'Напоминание ведущему:');
  assert.equal(ru.journey2_loc_select_hint, 'Укажите гекс, в котором сейчас находится отряд.');
  assert.equal(ru.journey2_loc_hover, 'Местоположение отряда');
  assert.equal(ru.journey2_gen_hint, 'Случайные параметры: среда обитания, размер, местность, встреча и слух.');
  assert.equal(i18n.en.journey2_gen_hint, 'Random habitat, size, terrain, encounter, and rumor');
  assert.deepEqual(['wsw', 'wnw', 'ene', 'ese'].map(d => ru['journey2_loc_dir_' + d]), ['Запад-юго-запад', 'Запад-северо-запад', 'Восток-северо-восток', 'Восток-юго-восток']);
  assert.equal(ru.journey2_status_placed.replace('{placed}', 0).replace('{total}', 3) + ' · ' + ru.journey2_status_left.replace('{n}', 3), 'Размещено 0/3 · осталось 3');
  assert.match(ru.journey2_loc_reminder, /Искатели‑в‑Тени/);
  assert.equal(i18n.en.journey2_loc_reminder_label, 'GM reminder:');
  assert.match(read('docs/translation-glossary.md'), /ведущий/);
});

test('L5-22: relocalize re-renders the Shadowblight bubble (count labels, settled "+" explanation) without touching its plan', () => {
  const reloc = view.slice(view.indexOf('function relocalize(o)'), view.indexOf('function applyStrings'));
  assert.match(reloc, /renderSeekers\(\)/);
  assert.doesNotMatch(reloc, /seekers\s*=/, 'the plan is never recreated or reset');
  const rs = view.slice(view.indexOf('function renderSeekers()'), view.indexOf('function positionSeekers'));
  assert.match(rs, /setAttribute\('title', fill\('journey2_seek_count'/);
  assert.match(rs, /setAttribute\('aria-label', fill\('journey2_seek_count'/);
  assert.match(rs, /journey2_seek_settled.*journey2_seek_more/s);
  assert.doesNotMatch(rs, /seekers\s*=|s\.step\s*=|history|commit/, 'rendering is read-only');
  for (const lang of ['en', 'ru']) {
    const d = i18n[lang];
    assert.notEqual(d.journey2_seek_settled, d.journey2_seek_more);
    const h = helpers(lang);
    for (const [step, max] of [[0, 16], [8, 16], [16, 16]]) assert.match(h.fill('journey2_seek_count', { n: step, max }), new RegExp(String(step) + '.*' + max));
  }
  assert.equal(helpers('en').fill('journey2_seek_count', { n: 1, max: 16 }), 'Step 1 of 16');
  assert.equal(helpers('ru').fill('journey2_seek_count', { n: 1, max: 16 }), 'Шаг 1 из 16');
});

test('L5-03: a language change clears the obsolete live announcement and announces nothing', () => {
  const reloc = view.slice(view.indexOf('function relocalize(o)'), view.indexOf('function applyStrings'));
  assert.match(reloc, /langChanged && ui\.live\) \{ clearTimeout\(liveTimer\); ui\.live\.textContent = ''; \}/);
  assert.match(reloc, /langChanged = true/);
  assert.doesNotMatch(reloc, /announce\(|hint\(/);
});

test('L5-15: the Biome colors toggle has one state-independent accessible name; aria-pressed carries the state', () => {
  assert.match(view, /data-j2-biome-colors aria-pressed="true" data-t-aria="journey2_biome_label"/);
  const fog = view.slice(view.indexOf('function updateFogUi()'), view.indexOf('ui.fogTool.setAttribute'));
  assert.match(fog, /ui\.biomeColors\.setAttribute\('aria-pressed', String\(showBiome\)\)/);
  assert.doesNotMatch(fog, /biomeColors\.setAttribute\('aria-label'/);
  assert.match(fog, /ui\.biomeColors\.title = showBiome \? t\('journey2_biome_hide'\) : t\('journey2_biome_show'\)/);
  assert.equal(i18n.en.journey2_biome_label, 'Biome colors');
  assert.equal(i18n.ru.journey2_biome_label, 'Цвета биомов');
});

test('L5-18 / L5-19: a load failure shows a localized line (raw message goes to the console); a saved-map banner never says "file"', () => {
  const err = view.slice(view.indexOf('function renderError()'), view.indexOf('function load()'));
  assert.match(err, /data-t="journey2_load_error_detail"/);
  assert.doesNotMatch(err, /textContent = detail|err\.message/);
  assert.match(view, /console\.error\('Journey: map data failed to load', err\)/);
  assert.match(view, /data-j2-retry/);
  assert.ok(i18n.en.journey2_load_error_detail && i18n.ru.journey2_load_error_detail);
  assert.doesNotMatch(i18n.en.journey2_load_error_detail + i18n.ru.journey2_load_error_detail, /Failed to fetch/);
  assert.equal(i18n.en.journey2_saved_code_invalid_json, 'The data is not valid JSON.');
  assert.equal(i18n.ru.journey2_saved_code_invalid_json, 'Данные не являются корректным JSON.');
  assert.equal(i18n.en.journey2_import_code_invalid_json, 'The file is not valid JSON.', 'the real-import message is unchanged');
  assert.equal(i18n.ru.journey2_import_code_invalid_json, 'Файл не является корректным JSON.');
  assert.match(view, /reason: savedCodeText\(code\)/);
  assert.match(view, /t\('journey2_import_code_' \+ String\(r\.code\)/, 'the import dialog still uses the file wording');
});
