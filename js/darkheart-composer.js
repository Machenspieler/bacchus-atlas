/* ============================================================
   Bacchus's Atlas — darkheart-composer.js
   The Scene Composer's boundary logic (docs/data-contracts/scene-composer.md,
   PD-099): which scene may be dealt for a traversal outcome, which scene is
   dealt next, and the one place an encounter is requested for a scene.

   Pure and dependency-light: the selectable scenes come from
   DarkheartScenes.getSelectableScenes() (the only sanctioned read path, so a
   stale or suspended mapping never reaches here); the encounter comes from
   DarkheartEncounter. Nothing here reads or writes the campaign, the DOM or
   storage, and nothing copies or edits catalogue text — a scene is only ever
   an id, the manifest's own framing, and a reference to the environment.

   Compatibility is enforced HERE, not in the encounter engine (which stays a
   reusable low-level tool): a scene can only be dealt for an outcome its
   manifest entry maps (eligibleScenes), and an encounter is only built for the
   outcome the scene was dealt for (encounterFor). An arbitrary outcome can
   never turn a landmark fragment into a hostile-creature scene.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./darkheart-encounter.js'));
  else root.DarkheartComposer = factory(root.DarkheartEncounter);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Encounter) {
  'use strict';

  function rngFrom(seed) {
    var a = ((typeof seed === 'number' ? seed : 0) ^ 0x85EBCA6B) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** The manifest's entry for one outcome of a scene, or null. */
  function sceneEntry(scene, outcome) {
    if (!scene || !Array.isArray(scene.outcomes)) return null;
    return scene.outcomes.find(function (o) { return o.outcome === outcome; }) || null;
  }

  /** Scenes the manifest maps to this outcome, for a party of ANY tier (PD-100: neither the party's nor the
   * environment's tier filters a scene). Stable order (by id). */
  function eligibleScenes(selectable, outcome) {
    return (selectable || [])
      .filter(function (s) { return !!sceneEntry(s, outcome); })
      .sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  }

  /**
   * Deals one eligible scene, not repeating one until the pool has been spent.
   * `dealt` is the ids already dealt for this outcome (oldest first).
   * Returns { scene, dealt, cycled, poolSize }; scene is null with `noMatch: true`
   * when nothing is mapped — the caller then shows the rule and a no-match state,
   * never a substitute.
   */
  function dealScene(args) {
    var pool = eligibleScenes(args.selectable, args.outcome);
    if (!pool.length) return { scene: null, noMatch: true, dealt: args.dealt || [], cycled: false, poolSize: 0 };
    var history = (args.dealt || []).filter(function (id) { return pool.some(function (s) { return s.id === id; }); });
    var fresh = pool.filter(function (s) { return history.indexOf(s.id) === -1; });
    var cycled = false;
    if (!fresh.length) {
      // The pool is spent: start again, but never straight onto the scene just shown when there is another.
      cycled = true;
      var last = history[history.length - 1];
      fresh = pool.length > 1 ? pool.filter(function (s) { return s.id !== last; }) : pool;
      history = [];
    }
    var chosen = fresh[Math.floor(rngFrom(args.seed)() * fresh.length)];
    return { scene: chosen, noMatch: false, dealt: history.concat([chosen.id]), cycled: cycled, poolSize: pool.length };
  }

  /** Re-resolves a stored scene id against the current selectable scenes: a scene that has since gone stale or been suspended is gone. */
  function findScene(selectable, id) {
    return (selectable || []).find(function (s) { return s.id === id; }) || null;
  }

  /**
   * THE one place an encounter is requested for a scene (PD-099).
   * Refused (status 'blocked') when the scene has no reviewed mapping for the outcome; otherwise the engine runs with the scene's own
   * adversary mode and themes, so source adversaries count only where the scene shows
   * their source material.
   *   args: { scene, outcome, tier, heroes, difficulty, seed, locked, gmTheme?, ctx }
   */
  function encounterFor(args) {
    var scene = args.scene;
    var entry = sceneEntry(scene, args.outcome);
    if (!scene || !entry) {
      return { status: 'blocked', code: 'scene-outcome-mismatch', adversaries: [], warnings: [], reasoning: [] };
    }
    return Encounter.assembleEncounter({
      tier: args.tier, partySize: args.heroes, difficulty: args.difficulty, outcome: args.outcome,
      environmentId: scene.envId,
      featureNames: (scene.features || []).map(function (f) { return f.name; }),
      // A scene's own themes decide who fits. Only a scene that names none may take the Master's explicit theme (PD-101);
      // nothing is ever chosen for the Master. A suitability-derived scene (PD-104) wires each outcome on its own
      // (`entry.encounter`), because one environment can serve several outcomes with different participants.
      scene: (function () {
        var wiring = entry.encounter || { adversaries: scene.adversaries, themes: (scene.encounter && scene.encounter.themes) || [] };
        var themes = wiring.themes || [];
        var gm = !themes.length && args.gmTheme ? [args.gmTheme] : null;
        return { adversaries: wiring.adversaries || scene.adversaries, themes: gm || themes, gmTheme: !!gm };
      })(),
      locked: args.locked || [], seed: args.seed,
    }, args.ctx);
  }

  /** What the scene shows of its environment, as references — never copies. */
  function sceneParts(scene, env) {
    var shown = (scene.features || []).map(function (ref) {
      return (env.features || []).find(function (f) { return f.name && f.name.en === ref.name && f.type === ref.type; }) || null;
    }).filter(Boolean);
    return {
      whole: !(scene.features && scene.features.length),
      features: shown,
      leftOut: (scene.excluded || []).map(function (e) { return e.name; }),
    };
  }

  return { sceneEntry: sceneEntry, eligibleScenes: eligibleScenes, dealScene: dealScene, findScene: findScene, encounterFor: encounterFor, sceneParts: sceneParts };
});
