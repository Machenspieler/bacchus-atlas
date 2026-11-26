/* Bacchus's Atlas — tests/darkheart-art.test.js
   Darkheart artwork (js/darkheart-art.js): the exact key -> picture mapping, graceful misses, that every promised file
   exists at its promised size, and that the view only reads the table. Run with:  node --test tests/darkheart-art.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Art = require('../js/darkheart-art.js');
const X = require('../js/darkheart-expedition.js');
const Npc = require('../js/darkheart-npc.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('every one of the twelve outcomes has its own banner, keyed by a real outcome, with a focal point', () => {
  assert.deepEqual(Object.keys(Art.OUTCOMES).sort(), X.OUTCOME_KEYS.slice().sort());
  for (const k of X.OUTCOME_KEYS) {
    const a = Art.outcomeArt(k);
    assert.match(a.src, new RegExp(`outcome-${k}-1024\\.webp$`), k);
    assert.match(a.position, /^\d{1,3}% \d{1,3}%$/, k);
  }
  assert.equal(new Set(Object.values(Art.OUTCOMES).map(o => o.master)).size, 12, 'no master serves two outcomes');
  for (const junk of [undefined, null, '', 'creature', 'Creature-Fail-Fear', '__proto__', 'toString']) assert.equal(Art.outcomeArt(junk), null, String(junk));
});

test('portraits: exactly the eighteen painted ancestries; no other (nor Mixed Ancestry, names or junk) gets one', () => {
  assert.deepEqual(Object.keys(Art.ANCESTRIES).sort(), ['aetheris', 'dwarf', 'earthkin', 'elf', 'emberkin', 'faerie', 'faun', 'firbolg', 'fungril', 'galapa', 'gnome', 'goblin', 'halfling', 'human', 'katari', 'orc', 'skykin', 'tidekin']);
  assert.equal(new Set(Object.values(Art.ANCESTRIES).map(a => a.master)).size, 18, 'no master serves two ancestries');
  assert.match(Art.portraitArt('firbolg').src, /ancestry-firbolg-64\.webp$/);
  assert.match(Art.portraitArt('aetheris').src, /ancestry-aetheris-64\.webp$/);
  for (const a of Npc.ANCESTRIES) if (!(a.id in Art.ANCESTRIES)) assert.equal(Art.portraitArt(a.id), null, a.id);
  for (const k of ['mixed-ancestry', 'Firbolg', 'toString', '__proto__', 'constructor', '', null, undefined, 7, {}]) {
    assert.equal(Art.portraitArt(k), null, String(k));
    assert.equal(Art.outcomeArt(k), null, String(k));
  }
});

test('every promised file exists, banners at the promised widths, portraits square at 64/128/192', async () => {
  for (const f of Art.files()) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  for (const w of Art.OUTCOME_WIDTHS) assert.equal((await sharp(path.join(ROOT, `${Art.DIR}outcome-hazard-fail-fear-${w}.avif`)).metadata()).width, Math.min(w, Art.OUTCOMES['hazard-fail-fear'].width), 'never upscaled');
  for (const s of Art.PORTRAIT_SIZES) {
    const m = await sharp(path.join(ROOT, `${Art.DIR}ancestry-firbolg-${s}.webp`)).metadata();
    assert.deepEqual([m.width, m.height], [s, s]);
  }
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'img/darkheart-art')).sort(), Art.files().map(f => path.basename(f)).sort(), 'no stray derivatives');
});

test('the view reads the table only, keeps alt empty, reserves dimensions and never hard-codes image paths', () => {
  const view = read('js/darkheart-view.js');
  assert.match(view, /DarkheartArt\.outcomeArt\(outcome( \|\| idleArtId)?\)/);
  assert.match(view, /DarkheartArt\.portraitArt\(npc\.ancestry && npc\.ancestry\.id\)/);
  assert.doesNotMatch(view, /img\/darkheart-art/);
  assert.match(view, /alt="" width="\$\{art\.width\}" height="\$\{art\.height\}"/);
  assert.ok(read('index.html').indexOf('js/darkheart-art.js') > read('index.html').indexOf('js/darkheart-npc.js'));
  assert.ok(read('index.html').indexOf('js/darkheart-art.js') < read('index.html').indexOf('js/darkheart-view.js'), 'table loads before the view');
  assert.match(read('scripts/build.js'), /darkheart-art-source/);
});

test('every portrait ancestry is a real NPC ancestries, and generation can deal each', () => {
  const ids = Npc.ANCESTRIES.map(a => a.id);
  for (const k of Object.keys(Art.ANCESTRIES)) assert.ok(ids.includes(k), k);
  const seen = new Set();
  for (let seed = 0; seed < 1500; seed++) seen.add(Npc.generateNpc({ outcome: 'creature-success-hope', sceneId: 's', seed }).ancestry.id);
  for (const k of Object.keys(Art.ANCESTRIES)) assert.ok(seen.has(k), k);
  const a = Npc.ANCESTRIES.find(x => x.id === 'aetheris');
  assert.deepEqual([a.name.en, a.name.ru], ['Aetheris', 'Аэтерис']);
});
