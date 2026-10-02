/* ============================================================
   Bacchus's Atlas — tests/soundboard.test.js
   Dependency-free tests for the global soundboard: the manifest, the stored
   preferences, and the audio engine driven by a fake Web Audio context —
   including the races that only show up with rapid clicks and an
   AudioContext that is still resuming. Run with:

     node --test tests/soundboard.test.js
   ============================================================ */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Manifest = require('../js/soundboard-manifest.js');
const Icons = require('../js/soundboard-icons.js');
const Engine = require('../js/soundboard-engine.js');
const SafeStorage = require('../js/safe-storage.js');

const ROOT = path.join(__dirname, '..');
const EXPECTED_ORDER = [
  'big-fire-burning',
  'distant-thunder-explosion',
  'epic-impact-afar-explosion',
  'explosion-with-rocks-debris',
  'footsteps-in-a-tunnel-loop',
  'hawk-call-squawk',
  'knocking-on-a-thick-wooden-door',
  'rock-golem-walking',
];

/* ---------------- manifest ---------------- */

test('manifest lists the eight sounds in the specified order', () => {
  assert.deepEqual(Manifest.SOUNDS.map(s => s.id), EXPECTED_ORDER);
});

test('every manifest asset exists, is path-relative, and has a distinct icon', () => {
  const icons = new Set();
  Manifest.SOUNDS.forEach(s => {
    assert.ok(fs.existsSync(path.join(ROOT, s.src)), `${s.src} is missing`);
    assert.ok(path.basename(s.src).startsWith(s.id), `${s.src} should start with its id`);
    // Resolved against the document, so it works under a project base path.
    assert.ok(!/^([a-z]:|\/|\\|[a-z]+:\/\/)/i.test(s.src) && !s.src.includes('\\'), `${s.src} must be relative`);
    assert.ok(Icons.ICONS[s.icon], `no icon ${s.icon}`);
    assert.ok(!icons.has(s.icon), `icon ${s.icon} reused`);
    icons.add(s.icon);
    assert.equal(s.defaultVolume, 1);
    assert.equal(s.loop, undefined, 'every sound is a one-shot');
  });
});

test('every sound name and every panel string exists in both languages', () => {
  const i18n = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'i18n.json'), 'utf8'));
  const keys = Manifest.SOUNDS.map(s => s.nameKey).concat([
    'sb_open', 'sb_panel_label', 'sb_master_volume', 'sb_settings', 'sb_settings_done', 'sb_stop_all',
    'sb_close', 'sb_volume_for', 'sb_state_loading', 'sb_state_unavailable', 'sb_load_failed',
    'sb_playback_failed', 'sb_unsupported',
  ]);
  ['en', 'ru'].forEach(lang => keys.forEach(k => {
    assert.ok(typeof i18n[lang][k] === 'string' && i18n[lang][k].length, `${lang}.${k} missing`);
  }));
});

test('the sound buttons carry no visible text: icons only', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'js', 'soundboard-ui.js'), 'utf8');
  const start = ui.indexOf('<button type="button" class="sb-sound"');
  const block = ui.slice(start, ui.indexOf('</button>', start));
  assert.ok(start > 0 && block.length > 0, 'sound button template not found');
  assert.ok(!/\$\{\s*(t|soundName)\(/.test(block), 'sound button markup must not render a name');
  const text = block.replace(/<[^>]*>/g, '').replace(/\$\{[^}]*\}/g, '').trim();
  assert.equal(text, '', 'no text nodes in a sound button');
});

test('defaults: master 35%, every sound 100%', () => {
  const d = Manifest.defaultPrefs();
  assert.equal(d.master, 0.35);
  assert.deepEqual(Object.keys(d.sounds), EXPECTED_ORDER);
  Object.values(d.sounds).forEach(v => assert.equal(v, 1));
});

test('normalizePrefs survives malformed and out-of-range data', () => {
  const d = Manifest.defaultPrefs();
  [null, undefined, 5, 'x', [], [1, 2], { sounds: 7 }, { master: 'loud', sounds: [] }].forEach(bad => {
    assert.deepEqual(Manifest.normalizePrefs(bad), d, JSON.stringify(bad));
  });
  const p = Manifest.normalizePrefs({
    master: 4, sounds: { 'hawk-call-squawk': -2, 'big-fire-burning': 0.5, 'door-removed': 0.2, 'rock-golem-walking': NaN },
  });
  assert.equal(p.master, 1, 'never amplified above unity');
  assert.equal(p.sounds['hawk-call-squawk'], 0);
  assert.equal(p.sounds['big-fire-burning'], 0.5);
  assert.equal(p.sounds['rock-golem-walking'], 1);
  assert.ok(!('door-removed' in p.sounds));
  assert.equal(Manifest.normalizePrefs(JSON.parse('{"__proto__":{"x":1},"sounds":{"__proto__":{"y":1}}}')).sounds.y, undefined);
});

test('SafeStorage.validators.soundboard accepts, sanitizes and rejects', () => {
  const v = SafeStorage.validators.soundboard;
  assert.deepEqual(v([]), { ok: false });
  assert.deepEqual(v('x'), { ok: false });
  const clean = v({ schemaVersion: 1, master: 0.5, sounds: { a: 0.2 } });
  assert.equal(clean.ok, true);
  assert.equal(clean.changed, false);
  const dirty = v({ master: 9, sounds: { a: 'loud', b: -1, c: 0.4 } });
  assert.equal(dirty.ok, true);
  assert.equal(dirty.changed, true);
  assert.equal(dirty.value.master, 1);
  assert.deepEqual(dirty.value.sounds, { b: 0, c: 0.4 });
});

test('soundboard preferences are global: stored under their own key, not in Prep', () => {
  const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  assert.match(app, /soundboard: 'dhcodex_soundboard'/);
  assert.ok(!/localStorage/.test(fs.readFileSync(path.join(ROOT, 'js', 'soundboard-ui.js'), 'utf8')));
});

/* ---------------- engine, against a fake Web Audio ---------------- */

function param(initial) {
  return {
    value: initial || 0,
    targets: [],
    cancelScheduledValues() {},
    setTargetAtTime(v) { this.targets.push(v); this.value = v; },
  };
}

function node() {
  return { connect() {}, disconnect() {} };
}

class FakeSource {
  constructor(ctx) {
    this.ctx = ctx;
    this.loop = false;
    this.buffer = null;
    this.started = false;
    this.stopped = false;
    this.listeners = [];
  }
  connect() {}
  disconnect() {}
  addEventListener(type, fn) { if (type === 'ended') this.listeners.push(fn); }
  start() { this.started = true; }
  stop() { this.stopped = true; }
  /** Natural end or a stop() landing. */
  end() { this.listeners.forEach(fn => fn()); }
}

class FakeContext {
  constructor(initialState) {
    this.state = initialState;
    this.currentTime = 0;
    this.destination = node();
    this.sources = [];
    this.gains = [];
    this.resumes = [];
  }
  createGain() { const g = Object.assign(node(), { gain: param(1) }); this.gains.push(g); return g; }
  createDynamicsCompressor() {
    return Object.assign(node(), { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() });
  }
  createBufferSource() { const s = new FakeSource(this); this.sources.push(s); return s; }
  decodeAudioData(buf, ok) { ok({ decoded: buf }); }
  resume() {
    return new Promise((resolve, reject) => {
      this.resumes.push({
        resolve: () => { this.state = 'running'; resolve(); },
        reject,
      });
    });
  }
}

function makeEngine(overrides) {
  const o = overrides || {};
  const created = [];
  const events = { changes: 0, errors: [], fetched: [] };
  const failing = new Set(o.failing || []);
  const engine = Engine.create({
    sounds: Manifest.SOUNDS,
    createContext: () => { const c = new FakeContext(o.state || 'suspended'); created.push(c); return c; },
    fetchFn: url => {
      events.fetched.push(url);
      if (failing.has(url)) return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
      return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(url) });
    },
    resolveUrl: src => `https://example.test/atlas/${src}`,
    master: o.master,
    volumes: o.volumes,
    onChange: () => { events.changes++; },
    onError: e => events.errors.push(e),
    log: { warn() {} },
  });
  return { engine, created, events, failing };
}

const tick = () => new Promise(resolve => setImmediate(resolve));
const FIRE = 'big-fire-burning';
const THUNDER = 'distant-thunder-explosion';

test('nothing touches audio until a user gesture asks for it', () => {
  const { engine, created, events } = makeEngine();
  engine.getState();
  engine.setMasterVolume(0.8);
  engine.setSoundVolume(FIRE, 0.5);
  assert.equal(created.length, 0, 'no AudioContext on startup or volume change');
  assert.equal(events.fetched.length, 0, 'no fetch on startup');
  assert.equal(engine.getState().master, 0.8);
});

test('load fetches every sound once; a retry refetches only the failures', async () => {
  const bad = 'https://example.test/atlas/sound/hawk-call-squawk.wav';
  const { engine, events, failing } = makeEngine({ failing: [bad] });
  await engine.load();
  let s = engine.getState().sounds;
  assert.equal(events.fetched.length, 8);
  assert.equal(s['hawk-call-squawk'].status, 'failed');
  assert.equal(Object.values(s).filter(x => x.status === 'ready').length, 7, 'one failure does not block the rest');
  failing.delete(bad);
  await engine.load();
  s = engine.getState().sounds;
  assert.equal(events.fetched.length, 9, 'only the failed file is requested again');
  assert.equal(s['hawk-call-squawk'].status, 'ready');
});

test('a sound that is not ready is refused, never queued', async () => {
  const { engine, created } = makeEngine({ state: 'running' });
  engine.ensureContext();
  const loading = engine.load();
  assert.equal(engine.play(FIRE), 'unavailable');
  await loading;
  await tick();
  assert.equal(created[0].sources.length, 0, 'nothing fires after loading completes');
  assert.equal(engine.getState().anyActive, false);
});

test('a ready sound plays once from the start; every sound is a one-shot', async () => {
  const { engine, created } = makeEngine({ state: 'running' });
  await engine.load();
  assert.equal(engine.play('footsteps-in-a-tunnel-loop'), 'started');
  const [src] = created[0].sources;
  assert.equal(src.started, true);
  assert.equal(src.loop, false);
  assert.equal(created.length, 1, 'one shared context');
  src.end();
  assert.equal(engine.getState().sounds['footsteps-in-a-tunnel-loop'].playing, false);
});

test('different sounds play together', async () => {
  const { engine, created } = makeEngine({ state: 'running' });
  await engine.load();
  engine.play(FIRE);
  engine.play(THUNDER);
  const st = engine.getState().sounds;
  assert.equal(st[FIRE].playing && st[THUNDER].playing, true);
  assert.equal(created[0].sources.filter(s => !s.stopped).length, 2);
});

test('rapid repeated clicks on a running context leave one live instance', async () => {
  const { engine, created } = makeEngine({ state: 'running' });
  await engine.load();
  for (let i = 0; i < 25; i++) engine.play(FIRE);
  const sources = created[0].sources;
  assert.equal(sources.length, 25);
  assert.equal(sources.filter(s => s.started && !s.stopped).length, 1, 'only the newest is still sounding');
  assert.equal(engine.getState().sounds[FIRE].playing, true);
  // An old instance finishing late must not clear the newest one.
  sources[0].end();
  sources[10].end();
  assert.equal(engine.getState().sounds[FIRE].playing, true, 'stale ended callback ignored');
  sources[24].end();
  assert.equal(engine.getState().sounds[FIRE].playing, false);
});

test('rapid clicks while the context is still resuming start exactly one instance', async () => {
  const { engine, created } = makeEngine({ state: 'suspended' });
  await engine.load();
  for (let i = 0; i < 10; i++) assert.equal(engine.play(FIRE), 'pending');
  assert.equal(engine.getState().sounds[FIRE].pending, true);
  assert.equal(engine.getState().anyActive, true, 'a pending start counts as active');
  assert.equal(created[0].sources.length, 0);
  created[0].resumes.forEach(r => r.resolve());
  await tick();
  assert.equal(created[0].sources.filter(s => s.started).length, 1);
  assert.equal(engine.getState().sounds[FIRE].pending, false);
  assert.equal(engine.getState().sounds[FIRE].playing, true);
});

test('Stop All during an async resume cancels the pending start', async () => {
  const { engine, created } = makeEngine({ state: 'suspended' });
  await engine.load();
  engine.play(FIRE);
  engine.play(THUNDER);
  engine.stopAll();
  assert.equal(engine.getState().anyActive, false, 'pending starts are invalidated at once');
  created[0].resumes.forEach(r => r.resolve());
  await tick();
  assert.equal(created[0].sources.length, 0, 'nothing starts after the late resume');
  assert.equal(engine.getState().anyActive, false);
  // And the soundboard still works afterwards.
  assert.equal(engine.play(FIRE), 'started');
  assert.equal(engine.getState().sounds[FIRE].playing, true);
});

test('Stop All stops active sources promptly and leaves later playback working', async () => {
  const { engine, created } = makeEngine({ state: 'running' });
  await engine.load();
  engine.play(FIRE);
  engine.play(THUNDER);
  engine.stopAll();
  assert.equal(engine.getState().anyActive, false);
  assert.ok(created[0].sources.every(s => s.stopped), 'every source was told to stop');
  // The faded-out node's late `ended` must not disturb a newer playback.
  engine.play(FIRE);
  created[0].sources[0].end();
  assert.equal(engine.getState().sounds[FIRE].playing, true);
});

test('a click that lands before an older resume settles wins over it', async () => {
  const { engine, created } = makeEngine({ state: 'suspended' });
  await engine.load();
  engine.play(FIRE);
  engine.stopAll();
  engine.play(FIRE);
  created[0].resumes[0].resolve();
  created[0].resumes[1].resolve();
  await tick();
  assert.equal(created[0].sources.filter(s => s.started).length, 1);
  assert.equal(engine.getState().sounds[FIRE].playing, true);
});

test('a resume that fails reports an error and leaves nothing pending', async () => {
  const { engine, created, events } = makeEngine({ state: 'suspended' });
  await engine.load();
  engine.play(FIRE);
  created[0].resumes[0].reject(new Error('blocked'));
  await tick();
  assert.equal(events.errors.length, 1);
  assert.equal(events.errors[0].reason, 'resume-failed');
  assert.equal(engine.getState().anyActive, false);
});

test('master and per-sound levels reach current and future playback, capped at unity', async () => {
  const { engine, created } = makeEngine({ state: 'running', master: 0.35, volumes: { [FIRE]: 0.6 } });
  await engine.load();
  const ctx = created[0];
  // Gains are created in a fixed order: master, then one per sound.
  const master = ctx.gains[0];
  const fire = ctx.gains[1];
  assert.equal(master.gain.value, 0.35);
  assert.equal(fire.gain.value, 0.6);
  engine.play(FIRE);
  engine.setMasterVolume(0.7);
  engine.setSoundVolume(FIRE, 0.2);
  assert.equal(master.gain.value, 0.7, 'applies to what is already playing');
  assert.equal(fire.gain.value, 0.2);
  engine.setMasterVolume(5);
  engine.setSoundVolume(FIRE, 5);
  assert.equal(master.gain.value, 1);
  assert.equal(fire.gain.value, 1);
  engine.setMasterVolume(-1);
  assert.equal(master.gain.value, 0);
  assert.equal(engine.getState().sounds[FIRE].playing, true, 'changing a level never stops or restarts a sound');
  assert.equal(ctx.sources.length, 1);
});

test('a start that throws surfaces as an error and does not wedge the sound', async () => {
  const { engine, created, events } = makeEngine({ state: 'running' });
  await engine.load();
  created[0].createBufferSource = () => { throw new Error('boom'); };
  engine.play(FIRE);
  assert.equal(events.errors[0].reason, 'start-failed');
  assert.equal(engine.getState().sounds[FIRE].playing, false);
});

test('without Web Audio every sound reports unavailable and nothing throws', async () => {
  const engine = Engine.create({
    sounds: Manifest.SOUNDS,
    createContext: () => { throw new Error('no audio'); },
    fetchFn: () => Promise.reject(new Error('unused')),
    log: { warn() {} },
  });
  await engine.load();
  assert.ok(Object.values(engine.getState().sounds).every(s => s.status === 'failed'));
  assert.equal(engine.play(FIRE), 'unavailable');
  engine.stopAll();
});
