/* ============================================================
   Bacchus's Atlas — soundboard-manifest.js
   The one explicit list of bundled sound effects. The panel, the engine and
   the persisted preferences are all driven from SOUNDS, in this order — to add
   a sound, add one entry here, one icon in js/soundboard-icons.js, and one
   `sb_sound_<id with underscores>` name in data/i18n.json (see
   docs/architecture.md "Global soundboard").

   Dependency-free and DOM-free so a Node test can require() it
   (tests/soundboard.test.js). Entries:
     id            stable identity — also the key under which a per-sound
                   volume is persisted, so never rename one
     src           path relative to index.html (never absolute: the site is
                   served from a GitHub Pages project base path)
     icon          key into SoundboardIcons
     nameKey       i18n key for the accessible name (never rendered as text)
     defaultVolume per-sound gain, 0..1
   Every sound is a one-shot, whatever its filename says.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SoundboardManifest = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SOUNDS = [
    { id: 'big-fire-burning', src: 'sound/big-fire-burning.wav', icon: 'torch', nameKey: 'sb_sound_big_fire_burning', defaultVolume: 1 },
    { id: 'distant-thunder-explosion', src: 'sound/distant-thunder-explosion.wav', icon: 'thunder', nameKey: 'sb_sound_distant_thunder_explosion', defaultVolume: 1 },
    { id: 'epic-impact-afar-explosion', src: 'sound/epic-impact-afar-explosion.wav', icon: 'explosion', nameKey: 'sb_sound_epic_impact_afar_explosion', defaultVolume: 1 },
    { id: 'explosion-with-rocks-debris', src: 'sound/explosion-with-rocks-debris.wav', icon: 'explosionDebris', nameKey: 'sb_sound_explosion_with_rocks_debris', defaultVolume: 1 },
    { id: 'footsteps-in-a-tunnel-loop', src: 'sound/footsteps-in-a-tunnel-loop.wav', icon: 'footsteps', nameKey: 'sb_sound_footsteps_in_a_tunnel_loop', defaultVolume: 1 },
    { id: 'hawk-call-squawk', src: 'sound/hawk-call-squawk.wav', icon: 'hawk', nameKey: 'sb_sound_hawk_call_squawk', defaultVolume: 1 },
    { id: 'knocking-on-a-thick-wooden-door', src: 'sound/knocking-on-a-thick-wooden-door.wav', icon: 'door', nameKey: 'sb_sound_knocking_on_a_thick_wooden_door', defaultVolume: 1 },
    { id: 'rock-golem-walking', src: 'sound/rock-golem-walking.mp3', icon: 'golem', nameKey: 'sb_sound_rock_golem_walking', defaultVolume: 1 },
  ];

  var DEFAULT_MASTER_VOLUME = 0.35;
  var SCHEMA_VERSION = 1;

  var DANGEROUS_KEYS = { '__proto__': true, prototype: true, constructor: true };

  function isFiniteNumber(v) { return typeof v === 'number' && isFinite(v); }

  /** Clamps to the 0..1 gain range; anything that is not a finite number is
   * `fallback`. There is deliberately no way to ask for gain above unity. */
  function clampVolume(v, fallback) {
    if (!isFiniteNumber(v)) return fallback;
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function defaultPrefs() {
    var sounds = {};
    SOUNDS.forEach(function (s) { sounds[s.id] = s.defaultVolume; });
    return { schemaVersion: SCHEMA_VERSION, master: DEFAULT_MASTER_VOLUME, sounds: sounds };
  }

  /** Total, never-throwing: whatever was stored, returns a complete prefs
   * object — every manifest id present, every level within 0..1. Unknown ids
   * are dropped (a sound removed from the manifest), missing ones take their
   * default (a sound added later). */
  function normalizePrefs(raw) {
    var out = defaultPrefs();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    out.master = clampVolume(raw.master, DEFAULT_MASTER_VOLUME);
    var stored = raw.sounds && typeof raw.sounds === 'object' && !Array.isArray(raw.sounds) ? raw.sounds : {};
    SOUNDS.forEach(function (s) {
      if (DANGEROUS_KEYS[s.id] || !Object.prototype.hasOwnProperty.call(stored, s.id)) return;
      out.sounds[s.id] = clampVolume(stored[s.id], s.defaultVolume);
    });
    return out;
  }

  return {
    SOUNDS: SOUNDS,
    DEFAULT_MASTER_VOLUME: DEFAULT_MASTER_VOLUME,
    SCHEMA_VERSION: SCHEMA_VERSION,
    clampVolume: clampVolume,
    defaultPrefs: defaultPrefs,
    normalizePrefs: normalizePrefs,
  };
});
