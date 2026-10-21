'use strict';
/* PD-076: the device-wide "Static effects" preference (js/motion-pref.js, key dhcodex_motion) and its wiring into the Journey view.
   The still frames themselves, the toggle and the player page are verified in a real browser (docs/manual-qa.md "Static effects"). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SafeStorage = require('../js/safe-storage.js');
const MotionPref = require('../js/motion-pref.js');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

class FakeStorage {
  constructor(initial) { this.data = new Map(Object.entries(initial || {})); this.failWrites = false; }
  getItem(k) { return this.data.has(k) ? this.data.get(k) : null; }
  setItem(k, v) { if (this.failWrites) throw new Error('quota'); this.data.set(k, String(v)); }
  removeItem(k) { this.data.delete(k); }
}

test.beforeEach(() => { SafeStorage.resetRecoverySummary(); });

test('the key is dhcodex_motion and is not a journey2 key', () => {
  assert.equal(MotionPref.KEY, 'dhcodex_motion');
  assert.ok(!MotionPref.KEY.startsWith('dhcodex_journey2_'), 'the player page never touches a dhcodex_journey2_* key, so this one lives outside them');
});

test('isStatic: an explicit choice wins over the system setting, no choice follows it', () => {
  assert.equal(MotionPref.isStatic(null, false), false);
  assert.equal(MotionPref.isStatic(null, true), true, 'no stored choice follows the system');
  assert.equal(MotionPref.isStatic('static', false), true);
  assert.equal(MotionPref.isStatic('animated', true), false, 'the user can re-enable animation against the system setting');
  assert.equal(MotionPref.isStatic('static', true), true);
  assert.equal(MotionPref.isStatic(undefined, undefined), false);
});

test('load/save round trip; nothing stored reads as null', () => {
  const s = new FakeStorage();
  assert.equal(MotionPref.load(s), null);
  assert.deepEqual(MotionPref.save(s, 'static'), { ok: true });
  assert.equal(s.getItem('dhcodex_motion'), '"static"');
  assert.equal(MotionPref.load(s), 'static');
  assert.deepEqual(MotionPref.save(s, 'animated'), { ok: true });
  assert.equal(MotionPref.load(s), 'animated');
});

test('an unusable stored value falls back to "follow the system" and is never rewritten as a choice', () => {
  for (const raw of ['"fast"', '1', 'true', '{"a":1}', 'not json']) {
    SafeStorage.resetRecoverySummary();
    const s = new FakeStorage({ dhcodex_motion: raw });
    assert.equal(MotionPref.load(s), null, raw);
    assert.equal(SafeStorage.getRecoverySummary().hasIssues, true, raw + ' is reported as recovered storage');
  }
});

test('save refuses anything but the two choices, and a blocked write is a result, not a throw', () => {
  const s = new FakeStorage();
  assert.equal(MotionPref.save(s, null).ok, false);
  assert.equal(MotionPref.save(s, 'maybe').ok, false);
  assert.equal(s.data.size, 0);
  s.failWrites = true;
  assert.deepEqual(MotionPref.save(s, 'static'), { ok: false, reason: 'write-failed' });
  assert.deepEqual(MotionPref.save(null, 'static'), { ok: false, reason: 'unavailable' });
  assert.equal(MotionPref.load(null), null, 'no storage at all: follow the system');
});

test('the validator accepts exactly the two choices', () => {
  const v = SafeStorage.validators.motionPref;
  assert.equal(v('static').ok, true);
  assert.equal(v('animated').ok, true);
  assert.equal(v('static').changed, false);
  for (const bad of ['', 'Static', null, 0, true, [], {}]) assert.equal(v(bad).ok, false, JSON.stringify(bad));
});

/* ---------------- wiring ---------------- */

test('index.html loads motion-pref.js after safe-storage.js and before the Journey view', () => {
  const html = read('index.html');
  const at = f => html.indexOf('js/' + f);
  assert.ok(at('safe-storage.js') > -1 && at('safe-storage.js') < at('motion-pref.js'));
  assert.ok(at('motion-pref.js') < at('journey2-view.js'));
  assert.match(html, /<script src="js\/motion-pref\.js" data-cache-version="ui"><\/script>/, 'versioned like every other script, never by hand');
});

test('both Journey mounts hand the view the device storage as motionStorage; the player page keeps its own storage null', () => {
  const app = read('js/app.js');
  assert.match(app, /generator: journey2Generator, toast: showToast, storage: lsStorage, motionStorage: lsStorage,/);
  assert.match(app, /generator: null, toast: showToast, storage: null, motionStorage: lsStorage,/);
});

test('the view resolves the preference once and pushes it to all three effects', () => {
  const view = read('js/journey2-view.js');
  const apply = view.slice(view.indexOf('function applyMotion()'), view.indexOf('/** "Regions"'));
  assert.match(apply, /MP\.isStatic\(motionPref, prefersReducedMotion\(\)\)/);
  assert.match(apply, /setAttribute\('data-motion', staticFx \? 'static' : 'animated'\)/, 'the Echo CSS');
  assert.match(apply, /Journey2RuinFx\.setStill\(staticFx\)/, 'the ruin canvases');
  assert.match(apply, /sbfx\.setReducedMotion\(staticFx\)/, 'the living shadow');
  const toggle = view.slice(view.indexOf('function toggleStaticFx()'), view.indexOf('function applyMotion()'));
  assert.match(toggle, /motionPref = staticFx \? 'animated' : 'static'/, 'a click always stores an explicit choice');
  assert.match(toggle, /MP\.save\(motionStorage, motionPref\)/);
  assert.doesNotMatch(toggle, /saveUiPrefs|store\.|pushHistory|runCommand/, 'a device preference: no map write, no history');
  assert.match(view, /listen\(reduce, 'change', \(\) => \{ if \(motionPref === null\) applyMotion\(\); \}\)/, 'a system change only matters while the user has made no choice');
  assert.match(view, /else if \(b\.hasAttribute\('data-j2-static-fx'\)\) toggleStaticFx\(\);/);
});

test('the Display menu carries the switch in every view, not as a GM-only item', () => {
  const view = read('js/journey2-view.js');
  const menu = view.slice(view.indexOf('data-j2-menu="display"'), view.indexOf('data-j2-menu="campaign"'));
  const item = menu.match(/<button[^>]*data-j2-static-fx[^>]*>/);
  assert.ok(item, 'the item exists in the Display menu');
  assert.doesNotMatch(item[0], /hidden/, 'visible from the first paint, GM view, Player Preview and the player page alike');
});

test('the ruin FX honours the host choice over the system setting', () => {
  const src = read('js/journey2-ruin-fx.js');
  assert.match(src, /function stillWanted\(\) \{ return stillMode !== null \? stillMode : /);
  assert.match(src, /function setStill\(flag\)/);
  assert.match(src, /attach, setStill, markup/);
  const Fx = require('../js/journey2-ruin-fx.js');
  assert.equal(typeof Fx.setStill, 'function');
  assert.doesNotThrow(() => Fx.setStill(true), 'no live instance: nothing to redraw');
  assert.doesNotThrow(() => Fx.setStill(false));
});

test('the label and both titles exist in English and Russian', () => {
  const i18n = JSON.parse(read('data/i18n.json'));
  for (const lang of ['en', 'ru']) {
    for (const key of ['journey2_static_label', 'journey2_static_show', 'journey2_static_hide']) {
      assert.ok(typeof i18n[lang][key] === 'string' && i18n[lang][key].length > 0, lang + ' ' + key);
    }
  }
  assert.equal(i18n.en.journey2_static_label, 'Static effects');
  assert.equal(i18n.ru.journey2_static_label, 'Статичные эффекты');
});

test('the Echo CSS stops its animation under data-motion="static" and has no separate reduced-motion rule', () => {
  const css = read('css/journey2.css');
  assert.match(css, /\.j2\[data-motion="static"\] \.j2-overlay \.j2-echo-halo/);
  assert.match(css, /\.j2\[data-motion="static"\] \.j2-overlay \.j2-echo-orb \{ animation: none; \}/);
});
