/* ============================================================
   Bacchus's Atlas — soundboard-engine.js
   The shared Web Audio engine behind the global soundboard. One instance for
   the whole page, created once at startup and never torn down with a panel or
   a route: effects keep playing while the panel is closed or the route
   changes.

   Everything environment-specific (the AudioContext constructor, fetch,
   URL resolution, the clock) is injected, so tests/soundboard.test.js drives
   it with fakes — including the Stop-All-during-resume race.

   Graph, per sound:
     AudioBufferSourceNode → instance gain (fades) → sound gain (per-sound
     level) → master gain → compressor → destination
   A fresh source node is created for every play (a source can start only
   once); the decoded AudioBuffer is what is cached.

   Rules the code below enforces:
   - At most one active instance per sound; playing it again replaces it.
   - Never queue a click: a sound that is not `ready` ignores play().
   - stopAll() bumps `epoch`, which invalidates every start still waiting on
     AudioContext.resume(); a restart bumps that sound's `seq` the same way.
   - A node's `ended` callback only clears state if its instance is still the
     sound's current one, so a replaced instance cannot clobber a newer one.
   - Every sound is a one-shot: `loop` is never set.
   No DOM, no storage: persistence lives in js/soundboard-ui.js.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SoundboardEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FADE_TC = 0.015;       // seconds — time constant of the fade-out on stop/replace
  var FADE_STOP_AFTER = 0.1; // seconds — the node is stopped once the fade has settled
  var LEVEL_TC = 0.02;       // seconds — time constant of volume changes

  function clamp01(v, fallback) {
    if (typeof v !== 'number' || !isFinite(v)) return fallback;
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  /**
   * options:
   *   sounds        [{ id, src, defaultVolume }] — the manifest
   *   createContext () => AudioContext (only ever called from a user gesture)
   *   fetchFn       (url) => Promise<Response>
   *   resolveUrl    (src) => absolute URL (base-path aware)
   *   master        initial master level 0..1
   *   volumes       { [id]: 0..1 } initial per-sound levels
   *   onChange      () => void — any state change the UI should reflect
   *   onError       ({ id, reason, error }) => void — a start that failed
   *   log           console-like { warn } (defaults to console)
   */
  function create(options) {
    var sounds = options.sounds;
    var createContext = options.createContext;
    var fetchFn = options.fetchFn;
    var resolveUrl = options.resolveUrl || function (s) { return s; };
    var onChange = options.onChange || function () {};
    var onError = options.onError || function () {};
    var log = options.log || (typeof console !== 'undefined' ? console : { warn: function () {} });

    var ctx = null;
    var masterGain = null;
    var compressor = null;
    var epoch = 0;
    var master = clamp01(options.master, 0.35);
    var entries = {};
    var order = [];

    sounds.forEach(function (s) {
      var vol = options.volumes && options.volumes[s.id];
      order.push(s.id);
      entries[s.id] = {
        sound: s,
        status: 'idle',          // idle | loading | ready | failed
        buffer: null,
        loading: null,           // in-flight load promise
        volume: clamp01(vol, clamp01(s.defaultVolume, 1)),
        gain: null,
        active: null,            // the one playing instance, or null
        pending: false,          // a start is waiting on AudioContext.resume()
        seq: 0,
      };
    });

    function notify() {
      try { onChange(); } catch (err) { log.warn('[atlas] soundboard onChange failed', err); }
    }

    function rampTo(param, value) {
      var now = ctx.currentTime;
      try {
        if (param.cancelScheduledValues) param.cancelScheduledValues(now);
        if (param.setTargetAtTime) param.setTargetAtTime(value, now, LEVEL_TC);
        else param.value = value;
      } catch (err) { param.value = value; }
    }

    /** Creates the context (once) and the fixed part of the graph. Must run
     * from a user gesture — browsers keep a context created elsewhere
     * suspended. Returns null when Web Audio is unavailable. */
    function ensureContext() {
      if (ctx) return ctx;
      try {
        ctx = createContext();
      } catch (err) {
        ctx = null;
        log.warn('[atlas] soundboard: AudioContext unavailable', err);
        return null;
      }
      if (!ctx) return null;
      masterGain = ctx.createGain();
      masterGain.gain.value = master;
      // Conservative peak control for overlapping effects — headroom, not a
      // limiter and not hearing protection.
      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      masterGain.connect(compressor);
      compressor.connect(ctx.destination);
      order.forEach(function (id) {
        var e = entries[id];
        e.gain = ctx.createGain();
        e.gain.gain.value = e.volume;
        e.gain.connect(masterGain);
      });
      return ctx;
    }

    /** Resumes a suspended context. Synchronous no-op (returns null) when it
     * is already running, so a click on a warm engine starts with no await. */
    function resumeIfNeeded() {
      if (!ctx || ctx.state === 'running') return null;
      try { return Promise.resolve(ctx.resume()); }
      catch (err) { return Promise.reject(err); }
    }

    /* ---------------- loading ---------------- */

    function decode(arrayBuffer) {
      return new Promise(function (resolve, reject) {
        try {
          // Callback form works in every browser; the promise form (which
          // some also return) is ignored on purpose.
          var maybe = ctx.decodeAudioData(arrayBuffer, resolve, reject);
          if (maybe && typeof maybe.catch === 'function') maybe.catch(reject);
        } catch (err) { reject(err); }
      });
    }

    function loadOne(e) {
      if (e.status === 'ready' || e.loading) return e.loading || Promise.resolve();
      e.status = 'loading';
      var url = resolveUrl(e.sound.src);
      e.loading = Promise.resolve()
        .then(function () { return fetchFn(url); })
        .then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + (response.statusText || ''));
          return response.arrayBuffer();
        })
        .then(decode)
        .then(function (buffer) {
          e.buffer = buffer;
          e.status = 'ready';
        })
        .catch(function (err) {
          e.status = 'failed';
          log.warn('[atlas] soundboard: could not load ' + e.sound.src, err && err.message ? err.message : err);
        })
        .then(function () {
          e.loading = null;
          notify();
        });
      return e.loading;
    }

    /** Starts fetching + decoding every sound that is not already ready or in
     * flight — so a failed one is retried on the next call, a decoded one
     * never refetched. Resolves once all have settled; never rejects. */
    function load() {
      if (!ensureContext()) {
        order.forEach(function (id) { entries[id].status = 'failed'; });
        notify();
        return Promise.resolve();
      }
      var started = order.map(function (id) { return loadOne(entries[id]); });
      notify();
      return Promise.all(started).then(function () {});
    }

    /* ---------------- playback ---------------- */

    function detach(inst, fade) {
      if (inst.detached) return;
      inst.detached = true;
      try {
        if (fade) {
          var now = ctx.currentTime;
          inst.gain.gain.cancelScheduledValues(now);
          inst.gain.gain.setTargetAtTime(0, now, FADE_TC);
          inst.source.stop(now + FADE_STOP_AFTER);
        } else {
          inst.source.stop();
        }
      } catch (err) { /* already stopped */ }
    }

    function startNow(e) {
      var inst = { source: null, gain: null, detached: false };
      if (e.active) { var old = e.active; e.active = null; detach(old, true); }
      try {
        inst.source = ctx.createBufferSource();
        inst.source.buffer = e.buffer;
        inst.source.loop = false;
        inst.gain = ctx.createGain();
        inst.gain.gain.value = 1;
        inst.source.connect(inst.gain);
        inst.gain.connect(e.gain);
        inst.source.addEventListener('ended', function () {
          try { inst.source.disconnect(); inst.gain.disconnect(); } catch (err) { /* already gone */ }
          // A replaced/stopped instance finishes later than its successor
          // started; only the current one may clear the sound's state.
          if (e.active === inst) { e.active = null; notify(); }
        });
        e.active = inst;
        inst.source.start();
      } catch (err) {
        e.active = null;
        log.warn('[atlas] soundboard: could not start ' + e.sound.src, err && err.message ? err.message : err);
        onError({ id: e.sound.id, reason: 'start-failed', error: err });
      }
    }

    /** Plays one sound from the beginning, replacing any instance of it.
     * Returns 'started' | 'pending' | 'unavailable'. Never queues: a sound
     * that is not ready is simply refused. */
    function play(id) {
      var e = entries[id];
      if (!e || e.status !== 'ready') return 'unavailable';
      if (!ensureContext()) return 'unavailable';
      var mySeq = ++e.seq;
      var myEpoch = epoch;
      var waiting = resumeIfNeeded();
      if (!waiting) {
        e.pending = false;
        startNow(e);
        notify();
        return 'started';
      }
      e.pending = true;
      notify();
      waiting.then(function () {
        // Stop All, or another click on this sound, overtook this start.
        if (epoch !== myEpoch || e.seq !== mySeq) return;
        e.pending = false;
        startNow(e);
        notify();
      }, function (err) {
        if (epoch !== myEpoch || e.seq !== mySeq) return;
        e.pending = false;
        log.warn('[atlas] soundboard: audio context could not resume', err && err.message ? err.message : err);
        onError({ id: id, reason: 'resume-failed', error: err });
        notify();
      });
      return 'pending';
    }

    /** Stops every effect and cancels every start still waiting on resume. */
    function stopAll() {
      epoch++;
      order.forEach(function (id) {
        var e = entries[id];
        e.seq++;
        e.pending = false;
        if (e.active) { var inst = e.active; e.active = null; detach(inst, true); }
      });
      notify();
    }

    /* ---------------- levels ---------------- */

    function setMasterVolume(v) {
      master = clamp01(v, master);
      if (ctx) rampTo(masterGain.gain, master);
      notify();
    }

    function setSoundVolume(id, v) {
      var e = entries[id];
      if (!e) return;
      e.volume = clamp01(v, e.volume);
      if (ctx && e.gain) rampTo(e.gain.gain, e.volume);
      notify();
    }

    /* ---------------- state ---------------- */

    /** A plain snapshot — the UI reads this, never the engine's internals. */
    function getState() {
      var out = { master: master, anyActive: false, sounds: {} };
      order.forEach(function (id) {
        var e = entries[id];
        var playing = !!e.active;
        out.sounds[id] = { status: e.status, playing: playing, pending: e.pending, volume: e.volume };
        if (playing || e.pending) out.anyActive = true;
      });
      return out;
    }

    return {
      ensureContext: ensureContext,
      load: load,
      play: play,
      stopAll: stopAll,
      setMasterVolume: setMasterVolume,
      setSoundVolume: setSoundVolume,
      getState: getState,
    };
  }

  return { create: create };
});
