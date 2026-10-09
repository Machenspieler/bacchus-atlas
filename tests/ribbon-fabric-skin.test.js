'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const css = read('css/styles.css');
const js = read('js/app.js');

test('fabric skin is opt-in via ?ribbonSkin=fabric only', () => {
  assert.match(js, /URLSearchParams\(location\.search\)\.get\('ribbonSkin'\) === 'fabric'/);
  assert.match(js, /document\.documentElement\.dataset\.ribbonSkin = 'fabric'/);
});

test('every fabric rule is scoped to the flag and the Catalogue ribbon, and never touches motion', () => {
  const start = css.indexOf('/* ---- Fabric ribbon skin');
  const end = css.indexOf('A ribbon that has just become current drops in');
  const block = css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = block.match(/^:root[^{]+\{/gm) || [];
  assert.ok(selectors.length >= 3);
  for (const s of selectors) assert.match(s, /^:root\[data-ribbon-skin="fabric"\] \.ribbon\[data-ribbon="catalog"\]/);
  assert.doesNotMatch(block, /animation|transition|transform|height:|clip-path/);
});

test('fabric slices exist and are not referenced outside the skin block', () => {
  for (const n of ['top', 'mid', 'bottom']) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', `img/ui/ribbon-fabric/catalog-${n}.webp`)));
  }
  assert.strictEqual((css.match(/ribbon-fabric\//g) || []).length, 3);
});
